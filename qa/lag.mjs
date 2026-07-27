/* Lag profile. Segments the page, reports frame headroom + long tasks per segment,
   at desktop with no throttle and at phone size with 4x CPU throttling (the honest
   test — headless on this Mac is nothing like a real phone).
   Usage: node qa/lag.mjs [origin] */
import puppeteer from 'puppeteer-core';

const ORIGIN = process.argv[2] || 'http://localhost:8811/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SEGMENTS = [
  ['hero      ', 0, 0.9],
  ['roster    ', 0.9, 2.2],
  ['roll      ', 2.2, 4.0],
  ['releases  ', 4.0, 5.4],
  ['history   ', 5.4, 6.8],
  ['tail      ', 6.8, 9.0],
];

const b = await puppeteer.launch({
  executablePath: CHROME, headless: true, timeout: 60000, protocolTimeout: 120000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});

async function run(label, { width, height, cpu }) {
  const p = await b.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: 1 });
  if (cpu > 1) { const c = await p.target().createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  const t0 = Date.now();
  await p.goto(ORIGIN, { waitUntil: 'load', timeout: 60000 });
  const loadMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 3200));   /* let the loader finish */

  const rows = await p.evaluate(async (segs) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const vh = innerHeight;
    const out = [];
    for (const [name, a, z] of segs) {
      scrollTo(0, a * vh);
      await wait(420);
      let f = 0, long = 0, worst = 0, run = true;
      const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => { long++; worst = Math.max(worst, e.duration); }));
      po.observe({ entryTypes: ['longtask'] });
      const tick = () => { f++; if (run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const t0 = performance.now();
      const STEPS = 30;
      for (let i = 0; i <= STEPS; i++) { scrollTo(0, (a + (z - a) * (i / STEPS)) * vh); await wait(28); }
      run = false; po.disconnect();
      out.push({ seg: name, fps: +(f / ((performance.now() - t0) / 1000)).toFixed(1), long, worst: Math.round(worst) });
    }
    return out;
  }, SEGMENTS);

  /* static hero headroom, no scrolling at all */
  await p.evaluate(() => scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  const still = await p.evaluate(async () => {
    let f = 0, run = true;
    const tick = () => { f++; if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1600));
    run = false;
    return +(f / ((performance.now() - t0) / 1000)).toFixed(1);
  });

  console.log(`\n── ${label}  (load ${loadMs}ms, hero idle ${still} fps)`);
  rows.forEach((r) => console.log(`   ${r.seg} ${String(r.fps).padStart(6)} fps   long:${String(r.long).padStart(3)}  worst ${r.worst}ms`));
  await p.close();
  return { rows, still, loadMs };
}

const desk = await run('desktop 1440x900, no throttle', { width: 1440, height: 900, cpu: 1 });
const mob = await run('phone 390x844, 4x CPU throttle', { width: 390, height: 844, cpu: 4 });

/* network weight */
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const seen = [];
p.on('response', async (r) => {
  try { const l = +(r.headers()['content-length'] || 0); seen.push([r.url().split('/').pop().slice(0, 44), l, r.request().resourceType()]); } catch {}
});
await p.goto(ORIGIN, { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
const total = seen.reduce((s, [, l]) => s + l, 0);
console.log(`\n── weight  ${(total / 1048576).toFixed(2)} MB over ${seen.length} requests`);
seen.sort((a, c) => c[1] - a[1]).slice(0, 8).forEach(([n, l, t]) => console.log(`   ${(l / 1024).toFixed(0).padStart(6)} KB  ${t.padEnd(10)} ${n}`));
await b.close();

const min = Math.min(...desk.rows.map((r) => r.fps));
const mmin = Math.min(...mob.rows.map((r) => r.fps));
console.log(`\nworst desktop ${min} fps · worst throttled-phone ${mmin} fps`);
