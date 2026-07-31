/* "Animation" is the top StyleRecalcInvalidation reason, so count what is actually running.
   A transition or animation forces its element into every style recalc pass for its whole
   duration, so N concurrent animations is a floor on the per-pass element count. Sampled
   during a real fling, grouped by what is animating. */
import puppeteer from 'puppeteer-core';

const AT = +(process.argv[2] || 2.8);
const W = +(process.argv[3] || 390);

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-anims',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
const mob = W < 900;
await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: mob ? 3 : 2, isMobile: mob, hasTouch: mob });
const cdp = await p.target().createCDPSession();
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4200));
await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
await new Promise((r) => setTimeout(r, 800));

await p.evaluate(() => {
  window.__s = [];
  const key = (a) => {
    const t = a.effect?.target;
    if (!t) return '(no target)';
    const cls = (typeof t.className === 'string' && t.className) || t.nodeName;
    const pe = a.effect?.pseudoElement ? a.effect.pseudoElement : '';
    const what = a.animationName || a.transitionProperty || '?';
    return `${String(cls).split(' ')[0]}${pe}  ${what}`;
  };
  const tick = () => {
    const run = document.getAnimations().filter((a) => a.playState === 'running');
    const m = {};
    for (const a of run) { const k = key(a); m[k] = (m[k] || 0) + 1; }
    window.__s.push({ n: run.length, m });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await cdp.send('Input.synthesizeScrollGesture', {
  x: Math.round(W / 2), y: 500, xDistance: 0, yDistance: -1500, speed: 1400,
  gestureSourceType: mob ? 'touch' : 'mouse', repeatCount: 2, repeatDelayMs: 120,
});
await new Promise((r) => setTimeout(r, 400));

const out = await p.evaluate(() => {
  const s = window.__s;
  const ns = s.map((x) => x.n).sort((a, z) => a - z);
  const agg = {};
  for (const x of s) for (const [k, v] of Object.entries(x.m)) agg[k] = (agg[k] || 0) + v;
  return {
    frames: s.length,
    med: ns[Math.floor(ns.length / 2)] || 0,
    peak: ns[ns.length - 1] || 0,
    agg: Object.entries(agg).sort((a, z) => z[1] - a[1]).slice(0, 16),
  };
});

console.log(`\n  ${W}px · fling at ${AT}vh · ${out.frames} sampled frames`);
console.log(`  concurrently running animations: median ${out.med}, peak ${out.peak}\n`);
console.log('  element-frames of animation (sum over frames of how many were running):');
for (const [k, v] of out.agg) {
  console.log(`    ${String(v).padStart(6)}  ${(v / Math.max(1, out.frames)).toFixed(1).padStart(6)} /frame  ${k.slice(0, 70)}`);
}
await b.close();
