/* What is left in the hero's browser-internal time? Remove one layer at a time. */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 120000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3400));

const measure = async () => p.evaluate(async () => {
  let f = 0, run = true;
  const t = () => { f++; if (run) requestAnimationFrame(t); };
  requestAnimationFrame(t);
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 2200));
  run = false;
  return +(f / ((performance.now() - t0) / 1000)).toFixed(1);
});

const css = async (c) => p.evaluate((x) => {
  let e = document.getElementById('ab'); if (!e) { e = document.createElement('style'); e.id = 'ab'; document.head.appendChild(e); }
  e.textContent = x;
}, c);

const arms = [
  ['baseline (hero as shipped)', ''],
  ['− grain overlay', '.al-grain{display:none!important}'],
  ['− lattice canvas', '[data-lattice]{display:none!important}'],
  ['− hero video element', '.al-hero-video{display:none!important}'],
  ['− wordmark canvas', '[data-markc]{display:none!important}'],
  ['− lattice − video', '[data-lattice],.al-hero-video{display:none!important}'],
  ['− everything above', '.al-grain,[data-lattice],.al-hero-video,[data-markc]{display:none!important}'],
];
for (const [label, c] of arms) {
  await css(c);
  await new Promise((r) => setTimeout(r, 500));
  console.log(`  ${String(await measure()).padStart(6)} fps   ${label}`);
}
await b.close();
