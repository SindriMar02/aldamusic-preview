/* A/B the plate hiding mechanism.
   The invalidation trace says FIGURE.al-plate accounts for ~74% of all style invalidation
   during a fling, as "Added to layout" / "Removed from layout" pairs — the signature of
   content-visibility toggling. This measures the alternatives on the SAME page instead of
   arguing about what content-visibility ought to cost.
   Interleaved arms, because absolute timings on a loaded machine are worthless; element
   counts and invalidation counts are not. */
import puppeteer from 'puppeteer-core';

const ARMS = {
  a_current: '',
  b_none: `.al-plate:not([data-on='1']) { content-visibility: visible !important; }`,
  c_visibility: `.al-plate:not([data-on='1']) { content-visibility: visible !important; visibility: hidden; }`,
  d_no_willchange: `.al-plate { will-change: auto !important; }`,
  e_none_no_wc: `.al-plate:not([data-on='1']) { content-visibility: visible !important; }
                 .al-plate { will-change: auto !important; }`,
};
const REPS = +(process.argv[2] || 3);

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-cv',
  args: ['--hide-scrollbars'],
});

async function run(css) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const cdp = await p.target().createCDPSession();
  await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
  if (css) await p.addStyleTag({ content: css });
  await new Promise((r) => setTimeout(r, 4200));
  await p.evaluate(() => scrollTo(0, 2.8 * innerHeight));
  await new Promise((r) => setTimeout(r, 800));

  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.invalidationTracking'],
    },
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195, y: 500, xDistance: 0, yDistance: -1500, speed: 1400,
    gestureSourceType: 'touch', repeatCount: 2, repeatDelayMs: 120,
  });
  await new Promise((r) => setTimeout(r, 500));
  await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

  const trees = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  const layouts = events.filter((e) => e.name === 'Layout' && e.ph === 'X');
  const el = trees.reduce((a, e) => a + (e.args?.elementCount || 0), 0);
  const inval = events.filter((e) => /Invalidation/.test(e.name) && e.args?.data?.reason).length;
  const plate = events.filter((e) => /Invalidation/.test(e.name) &&
    /al-plate/.test(e.args?.data?.nodeName || '')).length;
  const styleMs = trees.reduce((a, e) => a + e.dur, 0) / 1000;
  const layoutMs = layouts.reduce((a, e) => a + e.dur, 0) / 1000;
  await p.close();
  return {
    passes: trees.length, el, perPass: el / Math.max(1, trees.length),
    inval, plate, styleMs, layoutMs,
  };
}

const names = Object.keys(ARMS);
const acc = Object.fromEntries(names.map((n) => [n, []]));
for (let r = 0; r < REPS; r++) {
  for (const n of names) acc[n].push(await run(ARMS[n]));
  process.stdout.write(`  rep ${r + 1}/${REPS} done\n`);
}
const med = (xs) => xs.slice().sort((a, z) => a - z)[Math.floor(xs.length / 2)];

console.log('\n  arm              recalc/pass   elements   invalidations   al-plate   style ms  layout ms');
for (const n of names) {
  const s = acc[n];
  console.log(
    `  ${n.padEnd(16)}` +
    `${med(s.map((x) => x.perPass)).toFixed(0).padStart(11)}` +
    `${med(s.map((x) => x.el)).toFixed(0).padStart(11)}` +
    `${med(s.map((x) => x.inval)).toFixed(0).padStart(16)}` +
    `${med(s.map((x) => x.plate)).toFixed(0).padStart(11)}` +
    `${med(s.map((x) => x.styleMs)).toFixed(0).padStart(11)}` +
    `${med(s.map((x) => x.layoutMs)).toFixed(0).padStart(11)}`
  );
}
await b.close();
