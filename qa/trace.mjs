/* Where the frame goes, by category, during a real fling.
   Absolute milliseconds on this machine are untrustworthy (load swings by more than the
   effect being measured), but the SHARE of frame time spent in script vs style vs layout vs
   paint vs raster vs image-decode is stable, and it is what decides where to optimise. */
import puppeteer from 'puppeteer-core';

const AT = +(process.argv[2] || 2.8);
const CPU = +(process.argv[3] || 4);

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const cdp = await p.target().createCDPSession();
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4200));
await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
await new Promise((r) => setTimeout(r, 600));

const events = [];
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
await cdp.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
});
await cdp.send('Input.synthesizeScrollGesture', {
  x: 195, y: 500, xDistance: 0, yDistance: -1500, speed: 1400, gestureSourceType: 'touch', repeatCount: 2, repeatDelayMs: 120,
});
await new Promise((r) => setTimeout(r, 400));
await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

const BUCKET = {
  FunctionCall: 'script', EvaluateScript: 'script', TimerFire: 'script', EventDispatch: 'script',
  UpdateLayoutTree: 'style (recalc)', ParseAuthorStyleSheet: 'style (recalc)',
  Layout: 'layout',
  Paint: 'paint', PaintImage: 'paint',
  RasterTask: 'raster', Rasterize: 'raster',
  CompositeLayers: 'composite', 'cc::LayerTreeHostImpl': 'composite',
  DecodeImage: 'image decode', ImageDecodeTask: 'image decode', Decode: 'image decode',
  GPUTask: 'gpu',
};
const tot = new Map();
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  const k = BUCKET[e.name];
  if (!k) continue;
  tot.set(k, (tot.get(k) || 0) + e.dur / 1000);
}
const sum = [...tot.values()].reduce((a, x) => a + x, 0) || 1;
console.log(`\n  fling at ${AT}vh · ${CPU}x CPU · ${events.length} trace events`);
[...tot.entries()].sort((a, z) => z[1] - a[1]).forEach(([k, v]) => {
  const pct = (v / sum) * 100;
  console.log(`  ${pct.toFixed(1).padStart(5)}%  ${v.toFixed(0).padStart(6)}ms  ${k}  ${'█'.repeat(Math.round(pct / 2))}`);
});

/* the heaviest individual paint/raster targets */
const byLayer = new Map();
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  if (e.name !== 'Paint' && e.name !== 'PaintImage') continue;
  const d = e.args?.data || {};
  const key = d.nodeName || d.url || '(unnamed layer)';
  byLayer.set(key, (byLayer.get(key) || 0) + e.dur / 1000);
}
if (byLayer.size) {
  console.log('\n  heaviest paint targets:');
  [...byLayer.entries()].sort((a, z) => z[1] - a[1]).slice(0, 8)
    .forEach(([k, v]) => console.log(`    ${v.toFixed(0).padStart(6)}ms  ${String(k).slice(0, 70)}`));
}
await b.close();
