/* Scroll smoothness, measured honestly.
   Two traps this avoids, both of which I fell into earlier in this project:
     - --disable-gpu-vsync / --disable-frame-rate-limit submit work unpaced, so queue
       back-pressure gets charged to whichever call holds the queue. Left OFF here.
     - scrollTo() in a rAF loop is a synchronous relayout per frame: it measures the
       harness. This uses Input.synthesizeScrollGesture, a real compositor-driven touch
       fling, which is what a thumb actually does.
   Reports the frame-time distribution during the gesture. On a 60Hz target, anything
   over ~20ms is a visibly dropped frame.
   Usage: node qa/silk.mjs [origin] [cpuThrottle] */
import puppeteer from 'puppeteer-core';

const ORIGIN = process.argv[2] || 'http://localhost:8811/';
const CPU = +(process.argv[3] || 4);

const SECTIONS = [
  ['hero → roster', 0.0],
  ['roster list  ', 1.1],
  ['the roll     ', 2.4],
  ['deep in roll ', 3.6],
  ['releases rail', 5.2],
  ['history      ', 6.4],
  ['tail / CTA   ', 7.6],
];

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const cdp = await p.target().createCDPSession();
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.goto(ORIGIN, { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const rows = [];
for (const [name, vh] of SECTIONS) {
  await p.evaluate((v) => scrollTo(0, v * innerHeight), vh);
  await new Promise((r) => setTimeout(r, 700));

  await p.evaluate(() => {
    window.__g = []; window.__long = 0; window.__lastT = 0; window.__run = true;
    window.__po = new PerformanceObserver((l) => { window.__long += l.getEntries().length; });
    window.__po.observe({ entryTypes: ['longtask'] });
    const tick = (t) => { if (window.__lastT) window.__g.push(t - window.__lastT); window.__lastT = t; if (window.__run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  /* a real fling: touch-sourced, compositor-driven */
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195, y: 500, xDistance: 0, yDistance: -1500,
    speed: 1400, gestureSourceType: 'touch', repeatCount: 2, repeatDelayMs: 120,
  });
  await new Promise((r) => setTimeout(r, 350));

  const r = await p.evaluate(() => {
    window.__run = false; window.__po.disconnect();
    const g = window.__g.slice().sort((a, z) => a - z);
    const n = g.length;
    if (!n) return null;
    return {
      n,
      p50: +g[Math.floor(n * 0.5)].toFixed(1),
      p95: +g[Math.floor(n * 0.95)].toFixed(1),
      worst: +g[n - 1].toFixed(1),
      dropped: +((g.filter((x) => x > 20).length / n) * 100).toFixed(1),
      long: window.__long,
    };
  });
  if (r) rows.push([name, r]);
}

console.log(`\n  390x844 · ${CPU}x CPU throttle · real touch flings · ${ORIGIN}`);
console.log('  section          p50     p95   worst   frames>20ms  longtasks');
let worstDrop = 0;
for (const [n, r] of rows) {
  worstDrop = Math.max(worstDrop, r.dropped);
  console.log(`  ${n}  ${String(r.p50).padStart(5)}ms ${String(r.p95).padStart(6)}ms ${String(r.worst).padStart(6)}ms   ${String(r.dropped).padStart(6)}%   ${String(r.long).padStart(6)}`);
}
console.log(`\n  worst section drops ${worstDrop}% of frames`);
await b.close();
