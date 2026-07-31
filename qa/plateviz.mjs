/* Dropping will-change and content-visibility from the plates must not change a pixel of
   what the roll looks like. Steps through several artists and checks the active portrait is
   actually on screen and opaque, and that no INACTIVE plate is showing. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const W = +(process.argv[2] || 390);
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-plate',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
const mob = W < 900;
await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: 2, isMobile: mob, hasTouch: mob });
p.on('pageerror', (e) => console.log('  PAGE ERROR:', e.message));
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const roll = await p.evaluate(() => {
  const el = document.querySelector('.al-roll');
  let t = 0, n = el;
  while (n) { t += n.offsetTop; n = n.offsetParent; }
  return { top: t, h: el.offsetHeight };
});

const out = `qa/plate-${W}`;
fs.mkdirSync(out, { recursive: true });
let fails = 0;
for (const frac of [0.08, 0.3, 0.55, 0.8]) {
  await p.evaluate((y) => scrollTo(0, y), roll.top + roll.h * frac);
  await new Promise((r) => setTimeout(r, 1100));
  const s = await p.evaluate(() => {
    const on = [...document.querySelectorAll('.al-plate')].filter((x) => x.getAttribute('data-on') === '1');
    const shown = [...document.querySelectorAll('.al-plate')].filter((x) => +getComputedStyle(x).opacity > 0.02);
    const img = on[0]?.querySelector('img');
    return {
      onCount: on.length,
      shownCount: shown.length,
      hasSrc: !!img?.getAttribute('src'),
      complete: !!img?.complete,
      natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : '-',
      opacity: on[0] ? getComputedStyle(on[0]).opacity : '-',
      name: document.querySelector('.al-roll-now-t')?.textContent?.trim().slice(0, 24) || '?',
      liveSrcs: [...document.querySelectorAll('.al-plate img')].filter((i) => i.getAttribute('src')).length,
    };
  });
  const bad = s.onCount !== 1 || !s.hasSrc || !s.complete || s.natural === '0x0' || +s.opacity < 0.98;
  if (bad) fails++;
  console.log(`  ${(frac * 100).toFixed(0).padStart(3)}% through the roll  ${bad ? 'FAIL' : 'ok  '}` +
    `  active=${s.onCount} visible=${s.shownCount} opacity=${s.opacity}` +
    `  portrait ${s.natural} src=${s.hasSrc} decoded=${s.complete}  held=${s.liveSrcs}  "${s.name}"`);
  await p.screenshot({ path: `${out}/roll-${(frac * 100).toFixed(0)}.png` });
}
console.log(`\n  ${fails ? `${fails} FAILED` : 'all portraits present and opaque'}  ·  shots in ${out}/`);
await b.close();
