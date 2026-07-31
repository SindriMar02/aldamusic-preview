/* Why does landing on each artist look like the page reloading?
   Hypothesis: the plate that becomes active does not yet have a DECODED image, because the
   read window warms it only a few artists ahead and a 1800px portrait does not decode in
   that time. If so, every artist shows an empty plate first and fills in — which reads as a
   refresh — and every one released mid-decode is wasted work that gets paid again on the way
   back, which is the thrash that kills the tab.

   Measures, over a real scroll through the roll:
     - at the instant data-on flips, is that plate's img complete with a non-zero size?
     - how many times each plate's src is set and removed (1 each = clean, more = thrash)
     - decoded image bytes the browser actually did, from the trace */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8811/';
const W = +(process.argv[3] || 390);
const SPEED = +(process.argv[4] || 900);
const mob = W < 900;

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-flash',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: mob ? 3 : 2, isMobile: mob, hasTouch: mob });

await p.evaluateOnNewDocument(() => {
  window.__act = [];      /* one entry per artist activation */
  window.__src = {};      /* per plate: {set, del} */
  const setA = Element.prototype.setAttribute;
  const remA = Element.prototype.removeAttribute;
  const idx = (el) => {
    const fig = el.closest?.('.al-plate');
    if (!fig) return null;
    return [...document.querySelectorAll('.al-plate')].indexOf(fig);
  };
  Element.prototype.setAttribute = function (k, v) {
    const r = setA.call(this, k, v);
    if (k === 'src' && this.tagName === 'IMG') {
      const i = idx(this);
      if (i != null) (window.__src[i] ||= { set: 0, del: 0 }).set++;
    }
    /* the activation itself: sample the incoming plate's image RIGHT NOW */
    if (k === 'data-on' && this.classList?.contains('al-plate')) {
      const img = this.querySelector('img');
      window.__act.push({
        i: [...document.querySelectorAll('.al-plate')].indexOf(this),
        ready: !!(img && img.complete && img.naturalWidth > 0),
        hasSrc: !!img?.getAttribute('src'),
        t: performance.now(),
      });
    }
    return r;
  };
  Element.prototype.removeAttribute = function (k) {
    if (k === 'src' && this.tagName === 'IMG') {
      const i = idx(this);
      if (i != null) (window.__src[i] ||= { set: 0, del: 0 }).del++;
    }
    return remA.call(this, k);
  };
});

/* An archive plate paints the same photo twice: the contained <img>, and the out-of-focus
   wash behind it, which is a CSS background driven by --al-bg. Those are two separate
   resources to the browser and two separate decodes, so count requests per URL. */
const reqs = new Map();
const p0 = p;
p0.on('request', (q) => {
  if (q.resourceType() !== 'image') return;
  const u = q.url().split('/').pop();
  reqs.set(u, (reqs.get(u) || 0) + 1);
});

const cdp = await p.target().createCDPSession();
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
/* optional 5th arg: CSS to inject, for isolating one contributor's decode cost */
if (process.argv[5]) await p.addStyleTag({ content: process.argv[5] });
await new Promise((r) => setTimeout(r, 4500));

const roll = await p.evaluate(() => {
  const el = document.querySelector('.al-roll');
  let t = 0, n = el;
  while (n) { t += n.offsetTop; n = n.offsetParent; }
  return { top: t, h: el.offsetHeight, plates: document.querySelectorAll('.al-plate').length,
    archive: document.querySelectorAll('.al-plate[data-archive]').length };
});
await p.evaluate((y) => scrollTo(0, y), roll.top - 100);
await new Promise((r) => setTimeout(r, 1200));
await p.evaluate(() => { window.__act = []; window.__src = {}; });

const events = [];
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
await cdp.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
});

/* read through the whole roll at a human pace */
const H = await p.evaluate(() => innerHeight);
const steps = Math.ceil(roll.h / H);
for (let i = 0; i < steps; i++) {
  await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(W / 2), y: 500, xDistance: 0, yDistance: -H, speed: SPEED,
    gestureSourceType: mob ? 'touch' : 'mouse',
  });
  await new Promise((r) => setTimeout(r, 120));
}
await new Promise((r) => setTimeout(r, 400));
await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

const r = await p.evaluate(() => ({ act: window.__act, src: window.__src }));
const decodes = events.filter((e) => /Decode/.test(e.name) && e.ph === 'X');
const decodeMs = decodes.reduce((a, e) => a + e.dur, 0) / 1000;

const notReady = r.act.filter((a) => !a.ready);
const srcVals = Object.values(r.src);
const totalSet = srcVals.reduce((a, x) => a + x.set, 0);
const totalDel = srcVals.reduce((a, x) => a + x.del, 0);
const thrashed = Object.entries(r.src).filter(([, x]) => x.set > 1);

console.log(`\n  ${URL}  ${W}px  scroll speed ${SPEED}`);
console.log(`  ${roll.plates} plates (${roll.archive} archive) · read through the whole roll\n`);
console.log(`  artist activations                 ${r.act.length}`);
console.log(`  ...landing on a NOT-YET-DECODED image  ${notReady.length}  ` +
  `(${((notReady.length / Math.max(1, r.act.length)) * 100).toFixed(0)}%)   <-- the "refresh" flash`);
console.log(`  ...landing with no src at all          ${r.act.filter((a) => !a.hasSrc).length}`);
console.log('');
console.log(`  img src assignments                ${totalSet}`);
console.log(`  img src removals                   ${totalDel}`);
console.log(`  plates loaded MORE THAN ONCE       ${thrashed.length}` +
  `${thrashed.length ? '  -> ' + thrashed.slice(0, 8).map(([k, x]) => `#${k}x${x.set}`).join(' ') : ''}`);
console.log('');
console.log(`  image decode tasks                 ${decodes.length}`);
console.log(`  time spent decoding images         ${decodeMs.toFixed(0)} ms`);

const multi = [...reqs.entries()].filter(([, v]) => v > 1).sort((a, z) => z[1] - a[1]);
const totalReq = [...reqs.values()].reduce((a, v) => a + v, 0);
console.log('');
console.log(`  image requests, all               ${totalReq} across ${reqs.size} distinct files`);
console.log(`  files requested more than once    ${multi.length}`);
multi.slice(0, 10).forEach(([u, v]) => console.log(`      ${String(v).padStart(2)}x  ${u}`));
await b.close();
