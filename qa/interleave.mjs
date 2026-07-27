/* Interleaved A/B. The machine's background load drifts by more than the effect being
   measured, so the two builds are measured alternately, several rounds, and compared by
   median. Absolute numbers still move run to run; the PAIRING is what holds. */
import puppeteer from 'puppeteer-core';

const ARMS = [['before', 'http://localhost:8812/'], ['after', 'http://localhost:8811/']];
const ROUNDS = 3;
const CPU = +(process.argv[2] || 4);

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});

async function once(url) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const c = await p.target().createCDPSession();
  if (CPU > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3600));
  const out = {};
  for (const [name, vh] of [['hero', 0], ['roll', 2.6]]) {
    out[name] = await p.evaluate(async (vh) => {
      const y0 = vh * innerHeight;
      scrollTo(0, y0);
      await new Promise((r) => setTimeout(r, 400));
      const gaps = []; let last = 0, run = true;
      const tick = (t) => { if (last) gaps.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const t0 = performance.now();
      while (performance.now() - t0 < 2600) {
        scrollTo(0, y0 + ((performance.now() - t0) / 2600) * innerHeight * 1.2);
        await new Promise((r) => requestAnimationFrame(r));
      }
      run = false;
      gaps.sort((a, z) => a - z);
      return { fps: +(gaps.length / ((performance.now() - t0) / 1000)).toFixed(1), p50: +gaps[Math.floor(gaps.length * 0.5)].toFixed(1) };
    }, vh);
  }
  await p.close();
  return out;
}

const acc = { before: { hero: [], roll: [] }, after: { hero: [], roll: [] } };
for (let r = 0; r < ROUNDS; r++) {
  for (const [label, url] of ARMS) {
    const o = await once(url);
    acc[label].hero.push(o.hero); acc[label].roll.push(o.roll);
    process.stdout.write(`  round ${r + 1} ${label.padEnd(7)} hero ${String(o.hero.fps).padStart(5)}fps/p50 ${String(o.hero.p50).padStart(5)}ms   roll ${String(o.roll.fps).padStart(5)}fps/p50 ${String(o.roll.p50).padStart(5)}ms\n`);
  }
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`\n  ${CPU}x CPU · medians of ${ROUNDS} interleaved rounds`);
for (const seg of ['hero', 'roll']) {
  const bF = med(acc.before[seg].map((x) => x.fps)), aF = med(acc.after[seg].map((x) => x.fps));
  const bP = med(acc.before[seg].map((x) => x.p50)), aP = med(acc.after[seg].map((x) => x.p50));
  console.log(`    ${seg.padEnd(5)} scroll   fps ${bF} → ${aF}   ·   median frame ${bP}ms → ${aP}ms   (${((bP / aP - 1) * 100).toFixed(0)}% faster frames)`);
}
await b.close();
