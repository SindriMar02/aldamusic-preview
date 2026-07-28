/* Paint-cost A/B that survives a noisy machine: a FRESH page per arm, arms alternating,
   several rounds, compared by median. The sequential-arms version of this reported that
   removing layers made the page slower, which is just variance wearing a lab coat. */
import puppeteer from 'puppeteer-core';

const CPU = +(process.argv[2] || 4);
const AT = +(process.argv[3] || 2.8);
const ROUNDS = 3;

const ARMS = [
  ['baseline', ''],
  ['− archive blur(38px)', '.al-plate[data-archive]::before{filter:none!important}'],
  ['− grain overlay', '.al-grain{display:none!important}'],
  ['− roll wave canvas', '[data-wave]{display:none!important}'],
];

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});

async function once(css) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const cdp = await p.target().createCDPSession();
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (css) await p.evaluateOnNewDocument((c) => {
    addEventListener('DOMContentLoaded', () => {
      const e = document.createElement('style'); e.textContent = c; document.head.appendChild(e);
    });
  }, css);
  await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4200));
  await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
  await new Promise((r) => setTimeout(r, 600));
  await p.evaluate(() => {
    window.__g = []; window.__l = 0; window.__run = true;
    const t = (x) => { if (window.__l) window.__g.push(x - window.__l); window.__l = x; if (window.__run) requestAnimationFrame(t); };
    requestAnimationFrame(t);
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195, y: 500, xDistance: 0, yDistance: -1500, speed: 1400, gestureSourceType: 'touch', repeatCount: 2, repeatDelayMs: 120,
  });
  await new Promise((r) => setTimeout(r, 300));
  const r = await p.evaluate(() => {
    window.__run = false;
    const g = window.__g.slice().sort((a, z) => a - z);
    return g.length ? +g[Math.floor(g.length * 0.5)].toFixed(1) : null;
  });
  await p.close();
  return r;
}

const acc = ARMS.map(() => []);
for (let r = 0; r < ROUNDS; r++) {
  for (let a = 0; a < ARMS.length; a++) {
    const v = await once(ARMS[a][1]);
    acc[a].push(v);
    process.stdout.write(`  round ${r + 1}  ${ARMS[a][0].padEnd(22)} p50 ${v}ms\n`);
  }
}
const med = (x) => x.filter((v) => v != null).sort((a, z) => a - z)[Math.floor(x.length / 2)];
console.log(`\n  ${CPU}x CPU · fling at ${AT}vh · medians of ${ROUNDS}`);
const base = med(acc[0]);
ARMS.forEach(([n], i) => {
  const m = med(acc[i]);
  const d = i === 0 ? '' : `   ${m < base ? '-' : '+'}${Math.abs(m - base).toFixed(1)}ms vs baseline`;
  console.log(`    ${String(m).padStart(6)}ms  ${n}${d}`);
});
await b.close();
