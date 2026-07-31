/* The roll holds ~53fps, the same as every other section, yet it is the one that feels
   laggy. So measure RESPONSIVENESS rather than throughput: how far behind the scroll
   position the roster actually is, and how fast artists go past.

   The list is driven by a damped channel (tau 0.13), so it deliberately trails the finger.
   On a touchscreen, content that does not track 1:1 reads as lag no matter what the frame
   rate is — that is a different complaint from jank and needs a different fix. */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8811/';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-rolllag',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
/* These profiles are reused across runs, and app.js ships unfingerprinted with a 10-minute
   max-age, so a live check will happily re-measure the PREVIOUS deploy and report no change.
   That happened. Never trust a live number from a warm cache. */
await p.setCacheEnabled(false);
const cdp = await p.target().createCDPSession();
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const geom = await p.evaluate(() => {
  const el = document.querySelector('.al-roll');
  let t = 0, n = el;
  while (n) { t += n.offsetTop; n = n.offsetParent; }
  const sp = document.querySelector('.al-roll-spacer');
  return {
    top: t,
    spacerH: sp?.offsetHeight || 0,
    vh: innerHeight,
    rows: document.querySelectorAll('.al-name').length,
    rowH: document.querySelector('.al-name')?.offsetHeight || 0,
  };
});
const travel = geom.spacerH - geom.vh;
console.log(`\n  ${URL}  390px`);
console.log(`  roster: ${geom.rows} artists over ${travel}px of scroll  =  ` +
  `${(travel / (geom.rows - 1)).toFixed(1)}px per artist  (row is ${geom.rowH}px tall on screen)`);

await p.evaluate((y) => scrollTo(0, y), geom.top + travel * 0.35);
await new Promise((r) => setTimeout(r, 1500));

/* sample scroll vs applied transform every frame through a fling */
await p.evaluate(() => {
  window.__s = [];
  const list = document.querySelector('.al-roll-list');
  const tick = () => {
    const m = new DOMMatrixReadOnly(getComputedStyle(list).transform);
    window.__s.push({ t: performance.now(), y: scrollY, ty: -m.m42 });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await cdp.send('Input.synthesizeScrollGesture', {
  x: 195, y: 500, xDistance: 0, yDistance: -900, speed: 1400, gestureSourceType: 'touch',
});
await new Promise((r) => setTimeout(r, 1400));

const s = await p.evaluate(() => window.__s);
/* the settle: after the finger stops, how long until the roster catches up and stops moving */
let lastMove = 0, scrollStop = 0;
for (let i = 1; i < s.length; i++) {
  if (Math.abs(s[i].y - s[i - 1].y) > 0.5) scrollStop = s[i].t;
  if (Math.abs(s[i].ty - s[i - 1].ty) > 0.5) lastMove = s[i].t;
}
const settle = lastMove - scrollStop;

/* cross-correlate: what delay best lines the roster up with the scroll? */
const norm = (arr) => {
  const a = arr.map((x) => x - arr[0]);
  const m = Math.max(...a.map(Math.abs)) || 1;
  return a.map((x) => x / m);
};
const ys = norm(s.map((x) => x.y));
const ts = norm(s.map((x) => x.ty));
let best = 0, bestErr = Infinity;
for (let lag = 0; lag < 40; lag++) {
  let err = 0, n = 0;
  for (let i = 0; i + lag < ys.length; i++) { err += (ys[i] - ts[i + lag]) ** 2; n++; }
  err /= Math.max(1, n);
  if (err < bestErr) { bestErr = err; best = lag; }
}
const frameMs = s.length > 1 ? (s[s.length - 1].t - s[0].t) / (s.length - 1) : 16.7;

console.log(`  roster trails the scroll by ~${best} frames  (~${(best * frameMs).toFixed(0)}ms)`);
console.log(`  after the finger stops, the roster keeps moving for ${settle.toFixed(0)}ms`);
console.log(`\n  a 900px flick moves the roster past ${(900 / (travel / (geom.rows - 1))).toFixed(0)} artists`);
await b.close();
