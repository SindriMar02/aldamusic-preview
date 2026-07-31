/* One pre-deploy pass: read the whole page on a phone, then do it again backwards, and
   report the things that would actually hurt — script errors, decoded image memory, the
   per-frame write count, and whether anything is still animating with nobody watching. */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8811/';
const W = +(process.argv[3] || 390);
const mob = W < 900;

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-final',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: mob ? 3 : 2, isMobile: mob, hasTouch: mob });

const errs = [];
let aborted = 0;
p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
p.on('requestfailed', (r) => {
  /* An aborted portrait fetch is the memory windowing DOING ITS JOB: warm() strips `src`
     from a plate that left the read window, and the browser cancels the load that was still
     in flight. Counted, not flagged — a real failure is anything else. */
  const abortedImage = r.failure()?.errorText === 'net::ERR_ABORTED'
    && r.resourceType() === 'image';
  if (abortedImage) aborted++;
  else errs.push(`request failed (${r.failure()?.errorText}): ${r.url().slice(-60)}`);
});

await p.evaluateOnNewDocument(() => {
  window.__w = { set: 0, sel: 0 };
  const sp = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (...a) { window.__w.set++; return sp.apply(this, a); };
  const qs = Element.prototype.querySelector;
  Element.prototype.querySelector = function (...a) { window.__w.sel++; return qs.apply(this, a); };
  window.__f = 0;
  const tick = () => { window.__f++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

const cdp = await p.target().createCDPSession();
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const mem = async () => p.evaluate(() => {
  let n = 0, bytes = 0;
  for (const el of document.images) {
    if (!el.naturalWidth || !el.currentSrc) continue;
    n++; bytes += el.naturalWidth * el.naturalHeight * 4;
  }
  let canv = 0;
  for (const c of document.querySelectorAll('canvas')) canv += c.width * c.height * 4;
  return { n, mb: bytes / 1048576, canvasMb: canv / 1048576 };
});

const H = await p.evaluate(() => innerHeight);
const screens = Math.ceil(await p.evaluate(() => document.body.scrollHeight) / H);
let peak = 0;
const fling = async (dir) => {
  for (let i = 0; i < screens; i++) {
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(W / 2), y: 500, xDistance: 0, yDistance: dir * H, speed: 2400,
      gestureSourceType: mob ? 'touch' : 'mouse',
    });
    const m = await mem();
    peak = Math.max(peak, m.mb + m.canvasMb);
  }
};
await p.evaluate(() => { window.__w = { set: 0, sel: 0 }; window.__f = 0; });
await fling(-1);
await fling(1);
const w = await p.evaluate(() => ({ ...window.__w, f: window.__f }));

await p.evaluate(() => scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 1500));
const idleTop = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 2500));
const idleBottom = await p.evaluate(() => ({
  anims: document.getAnimations().filter((a) => a.playState === 'running').length,
  videoPaused: document.querySelector('.al-hero-video')?.paused,
}));

console.log(`\n  ${URL}  ${W}px${mob ? ' mobile' : ' desktop'}  ·  ${screens} screens, read down and back up\n`);
console.log(`  style writes per frame     ${(w.set / Math.max(1, w.f)).toFixed(1)}`);
console.log(`  selector calls per frame   ${(w.sel / Math.max(1, w.f)).toFixed(1)}`);
console.log(`  peak decoded image+canvas  ${peak.toFixed(0)} MB`);
console.log(`  animations running, top    ${idleTop}`);
console.log(`  animations running, bottom ${idleBottom.anims}`);
console.log(`  hero video paused at foot  ${idleBottom.videoPaused}`);
console.log(`  portrait loads cancelled   ${aborted}  (windowing releasing memory, expected)`);
console.log(`  errors                     ${errs.length ? errs.join('\n                             ') : 'none'}`);
await b.close();
