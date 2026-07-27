/* The honest smoothness metric: vsync ON, count frames that miss the 16.7ms deadline.
   Uncapped-fps flatters any change that lowers a redraw CADENCE, because rAF just spins
   faster in between. Dropped frames do not lie. */
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.ORIGIN || 'http://localhost:8811/';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],                 /* vsync left ON deliberately */
});

async function arm(label, cpu) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  if (cpu > 1) { const c = await p.target().createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  await p.goto(ORIGIN, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3600));

  const rows = [];
  for (const [name, vh, scroll] of [['hero idle', 0, false], ['hero scroll', 0, true], ['roll scroll', 2.6, true]]) {
    const r = await p.evaluate(async (vh, scroll) => {
      scrollTo(0, vh * innerHeight);
      await new Promise((r) => setTimeout(r, 500));
      const gaps = [];
      let last = 0, run = true;
      const tick = (t) => { if (last) gaps.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const t0 = performance.now();
      if (scroll) {
        const y0 = vh * innerHeight;
        while (performance.now() - t0 < 2600) {
          scrollTo(0, y0 + ((performance.now() - t0) / 2600) * innerHeight * 1.2);
          await new Promise((r) => requestAnimationFrame(r));
        }
      } else { await new Promise((r) => setTimeout(r, 2600)); }
      run = false;
      gaps.sort((a, z) => a - z);
      const n = gaps.length;
      return {
        fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1),
        missed: +((gaps.filter((g) => g > 20).length / n) * 100).toFixed(1),
        p95: +gaps[Math.floor(n * 0.95)].toFixed(1),
        worst: +gaps[n - 1].toFixed(1),
      };
    }, vh, scroll);
    rows.push([name, r]);
  }
  console.log(`\n  ${label}`);
  rows.forEach(([n, r]) => console.log(`    ${n.padEnd(12)} ${String(r.fps).padStart(5)} fps · ${String(r.missed).padStart(5)}% frames >20ms · p95 ${String(r.p95).padStart(6)}ms · worst ${r.worst}ms`));
  await p.close();
}

await arm(process.argv[2] || 'build', 1);
await arm(`${process.argv[2] || 'build'} — 4x CPU throttle`, 4);
await b.close();
