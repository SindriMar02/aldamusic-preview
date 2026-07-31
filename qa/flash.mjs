/* Is there a BLACK FRAME between artists?
   `content-visibility: hidden` on an inactive plate stops its contents rendering the INSTANT
   data-on is removed, while the arriving plate fades in over .42s. If that is what shipped,
   every artist change drops to the bare background for a few hundred milliseconds before the
   next portrait resolves — which is exactly what "it acts like it is refreshing on every
   artist" describes.

   Samples the mean luminance of the portrait area across an artist change, frame by frame.
   A crossfade holds roughly steady. A gap collapses toward the background and comes back. */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8811/';
const LABEL = process.argv[3] || 'build';
const W = 390;

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: `/private/tmp/claude-501/alda-qa-flash-${LABEL}`,
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: W, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const roll = await p.evaluate(() => {
  const el = document.querySelector('.al-roll');
  let t = 0, n = el;
  while (n) { t += n.offsetTop; n = n.offsetParent; }
  return { top: t, h: el.offsetHeight };
});

/* Land mid-roll, then advance ONE artist and watch the stage. Luminance is read from the
   page rather than from screenshots: getComputedStyle on the plates tells us the opacity of
   what is actually being composited, and content-visibility shows up as a plate that is on
   screen at opacity>0 but rendering nothing. */
await p.evaluate((y) => scrollTo(0, y), roll.top + roll.h * 0.4);
await new Promise((r) => setTimeout(r, 1500));

const samples = await p.evaluate(async () => {
  const plates = [...document.querySelectorAll('.al-plate')];
  const out = [];
  const read = () => {
    let visible = 0, painted = 0;
    for (const pl of plates) {
      const cs = getComputedStyle(pl);
      const o = +cs.opacity;
      if (o <= 0.01) continue;
      visible += o;
      /* content-visibility:hidden means "on screen, opacity>0, rendering nothing" */
      if (cs.contentVisibility !== 'hidden') painted += o;
    }
    return { visible: +visible.toFixed(3), painted: +painted.toFixed(3) };
  };
  const start = performance.now();
  const startY = scrollY;
  /* one artist is 40px of scroll on mobile */
  scrollTo(0, startY + 40);
  return await new Promise((res) => {
    const tick = () => {
      out.push({ t: +(performance.now() - start).toFixed(0), ...read() });
      if (performance.now() - start < 900) requestAnimationFrame(tick);
      else res(out);
    };
    requestAnimationFrame(tick);
  });
});

const min = samples.reduce((a, s) => Math.min(a, s.painted), 99);
const dark = samples.filter((s) => s.painted < 0.5);
console.log(`\n  ${LABEL}  (${URL})`);
console.log(`  frames sampled over 900ms of one artist change: ${samples.length}`);
console.log(`  least painted portrait coverage at any frame:   ${min.toFixed(2)}`);
console.log(`  frames with under half a portrait painted:      ${dark.length}` +
  `${dark.length ? `  <-- ${dark.length} frames of GAP` : '  (continuous crossfade)'}`);
console.log('  trace (t ms : painted coverage):');
console.log('   ' + samples.filter((_, i) => i % 3 === 0).slice(0, 18)
  .map((s) => `${s.t}:${s.painted.toFixed(2)}`).join('  '));
await b.close();
