/* Style-recalc scope for one build at one width, as elements examined per pass.
   Interleaved between the two URLs so a load spike hits both arms equally.
   usage: node qa/recalc.mjs 1440 8812 8811 [reps] */
import puppeteer from 'puppeteer-core';

const W = +(process.argv[2] || 1440);
const PORTS = [+(process.argv[3] || 8812), +(process.argv[4] || 8811)];
const REPS = +(process.argv[5] || 3);
const mob = W < 900;

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-recalc',
  args: ['--hide-scrollbars'],
});

async function run(port) {
  const p = await b.newPage();
  await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: mob ? 3 : 2, isMobile: mob, hasTouch: mob });
  const cdp = await p.target().createCDPSession();
  await p.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4200));
  await p.evaluate(() => scrollTo(0, 2.8 * innerHeight));
  await new Promise((r) => setTimeout(r, 800));
  const nodes = await p.evaluate(() => document.querySelectorAll('*').length);

  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(W / 2), y: 500, xDistance: 0, yDistance: -1500, speed: 1400,
    gestureSourceType: mob ? 'touch' : 'mouse', repeatCount: 2, repeatDelayMs: 120,
  });
  await new Promise((r) => setTimeout(r, 400));
  await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

  const trees = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  const el = trees.reduce((a, e) => a + (e.args?.elementCount || 0), 0);
  await p.close();
  return { nodes, el, perPass: el / Math.max(1, trees.length) };
}

const acc = Object.fromEntries(PORTS.map((x) => [x, []]));
for (let r = 0; r < REPS; r++) for (const port of PORTS) acc[port].push(await run(port));
const med = (xs) => xs.slice().sort((a, z) => a - z)[Math.floor(xs.length / 2)];

console.log(`\n  ${W}px · ${acc[PORTS[0]][0].nodes} elements on the page · median of ${REPS}\n`);
const base = med(acc[PORTS[0]].map((x) => x.perPass));
for (const port of PORTS) {
  const pp = med(acc[port].map((x) => x.perPass));
  console.log(`  :${port}   ${pp.toFixed(0).padStart(5)} elements/pass   ` +
    `${med(acc[port].map((x) => x.el)).toFixed(0).padStart(8)} total   ${(((pp - base) / base) * 100).toFixed(0).padStart(5)}%`);
}
await b.close();
