/* What is left costing time INSIDE the roll?
   Style recalc is down to ~122 elements a pass there, so the remaining budget is paint,
   raster and GPU. Candidates, each isolated as an arm:
     - the roster list is transformed every frame; if it is not its own compositing layer,
       all 54 rows re-raster on every frame of the scroll
     - .al-name-b transitions COLOR, on 56px display type carrying a 22px blurred
       text-shadow, so several rows repaint that shadow every frame of a .4s transition
     - the archive wash is a full-bleed filter: blur(38px)
     - the plates crossfade two full-bleed images
   Diagnostic arms deliberately break the look; the point is to size each contributor before
   choosing which are worth a real fix. Interleaved, median of REPS. */
import puppeteer from 'puppeteer-core';

const ARMS = {
  current: '',
  list_promoted: '.al-roll-list { will-change: transform; }',
  vp_contained: '.al-roll-vp { contain: paint; }',
  no_text_shadow: '.al-name-b { text-shadow: none !important; }',
  no_colour_transition: '.al-name-b, .al-name-n { transition: none !important; }',
  no_wash_blur: '.al-plate[data-archive]::before { filter: none !important; }',
  no_plate_fade: '.al-plate { transition: none !important; }',
  no_scrim: '.al-roll-scrim { display: none !important; }',
};
const REPS = +(process.argv[2] || 3);
const AT = +(process.argv[3] || 3.6);
const CPU = +(process.argv[4] || 4);

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-rollab',
  args: ['--hide-scrollbars'],
});

const BUCKET = {
  UpdateLayoutTree: 'style', Layout: 'layout',
  Paint: 'paint', PaintImage: 'paint', RasterTask: 'raster', Rasterize: 'raster',
  FunctionCall: 'script', EvaluateScript: 'script', TimerFire: 'script', EventDispatch: 'script',
  DecodeImage: 'decode', ImageDecodeTask: 'decode', Decode: 'decode', GPUTask: 'gpu',
};

async function run(css) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
  if (css) await p.addStyleTag({ content: css });
  await new Promise((r) => setTimeout(r, 4500));
  await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
  await new Promise((r) => setTimeout(r, 900));

  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195, y: 500, xDistance: 0, yDistance: -1500, speed: 1400,
    gestureSourceType: 'touch', repeatCount: 2, repeatDelayMs: 120,
  });
  await new Promise((r) => setTimeout(r, 400));
  await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

  const t = {};
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue;
    const k = BUCKET[e.name];
    if (!k) continue;
    t[k] = (t[k] || 0) + e.dur / 1000;
  }
  /* main-thread work that must finish inside a frame; gpu/raster are off it */
  const main = (t.style || 0) + (t.layout || 0) + (t.paint || 0) + (t.script || 0);
  await p.close();
  return { ...t, main };
}

const names = Object.keys(ARMS);
const acc = Object.fromEntries(names.map((n) => [n, []]));
for (let r = 0; r < REPS; r++) {
  for (const n of names) acc[n].push(await run(ARMS[n]));
  process.stdout.write(`  rep ${r + 1}/${REPS}\n`);
}
const med = (xs) => xs.slice().sort((a, z) => a - z)[Math.floor(xs.length / 2)];
const g = (n, k) => med(acc[n].map((x) => x[k] || 0));
const base = g('current', 'main');

console.log(`\n  fling at ${AT}vh · ${CPU}x CPU · median of ${REPS}, interleaved\n`);
console.log('  arm                    main-thread   style   layout    paint   script    raster   decode   vs current');
for (const n of names) {
  console.log(
    `  ${n.padEnd(22)}${g(n, 'main').toFixed(0).padStart(10)}ms` +
    `${g(n, 'style').toFixed(0).padStart(8)}${g(n, 'layout').toFixed(0).padStart(9)}` +
    `${g(n, 'paint').toFixed(0).padStart(9)}${g(n, 'script').toFixed(0).padStart(9)}` +
    `${g(n, 'raster').toFixed(0).padStart(10)}${g(n, 'decode').toFixed(0).padStart(9)}` +
    `${(((g(n, 'main') - base) / base) * 100).toFixed(0).padStart(11)}%`
  );
}
await b.close();
