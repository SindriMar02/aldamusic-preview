/* Which painted layer costs the frame on mobile. One suspect disabled at a time, same
   real touch fling each round, throttled so the difference is visible. */
import puppeteer from 'puppeteer-core';

const CPU = +(process.argv[2] || 4);
const AT = +(process.argv[3] || 1.1);

const ARMS = [
  ['baseline', ''],
  ['− grain overlay', '.al-grain{display:none!important}'],
  ['− lattice canvas', '[data-lattice]{display:none!important}'],
  ['− roll wave canvas', '[data-wave]{display:none!important}'],
  ['− archive blur(38px)', '.al-plate[data-archive]::before{filter:none!important}'],
  ['− backdrop-filter', '*{backdrop-filter:none!important}'],
  ['− stack transforms', '.al-shop,.al-hist,.al-parent,.al-cta,.al-ft{transform:none!important;opacity:1!important}'],
  ['− hero video', '.al-hero-video{display:none!important}'],
  ['− ALL of the above', `.al-grain,[data-lattice],[data-wave],.al-hero-video{display:none!important}
    .al-plate[data-archive]::before{filter:none!important} *{backdrop-filter:none!important}
    .al-shop,.al-hist,.al-parent,.al-cta,.al-ft{transform:none!important;opacity:1!important}`],
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
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

console.log(`\n  390x844 · ${CPU}x CPU · fling at ${AT}vh`);
for (const [label, css] of ARMS) {
  await p.evaluate((c) => {
    let e = document.getElementById('pab'); if (!e) { e = document.createElement('style'); e.id = 'pab'; document.head.appendChild(e); }
    e.textContent = c;
  }, css);
  await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
  await new Promise((r) => setTimeout(r, 700));
  await p.evaluate(() => {
    window.__g = []; window.__l = 0; window.__run = true;
    const tick = (t) => { if (window.__l) window.__g.push(t - window.__l); window.__l = t; if (window.__run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195, y: 500, xDistance: 0, yDistance: -1500, speed: 1400, gestureSourceType: 'touch', repeatCount: 1,
  });
  await new Promise((r) => setTimeout(r, 250));
  const r = await p.evaluate(() => {
    window.__run = false;
    const g = window.__g.slice().sort((a, z) => a - z);
    if (!g.length) return null;
    return { p50: +g[Math.floor(g.length * 0.5)].toFixed(1), p95: +g[Math.floor(g.length * 0.95)].toFixed(1) };
  });
  if (r) console.log(`  ${String(r.p50).padStart(6)}ms p50 · ${String(r.p95).padStart(6)}ms p95   ${label}`);
}
await b.close();
