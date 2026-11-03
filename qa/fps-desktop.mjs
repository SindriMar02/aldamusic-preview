/* Where does the page actually drop frames, and by how much?
   Everything so far has measured WORK. This measures the thing Sindri feels: presented
   frames and the long gaps between them, section by section, so the roll can be compared
   against the rest of the same page rather than against an abstract 60.
   Frames come from the compositor (Page.screencastFrame is presentation, not rAF, so it
   cannot be fooled by a rAF loop that runs while nothing reaches the screen). */
import puppeteer from 'puppeteer-core';

const CPU = +(process.argv[2] || 4);
const REPS = +(process.argv[3] || 3);
const URL = process.argv[4] || 'http://localhost:4719/';

const SPOTS = [
  ['hero (still+pointer)', '#top'],
  ['shop rail', '#plotur'],
  ['roster', '#listafolk'],
  ['history', '#aldamot'],
];

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-fps-desktop',
  args: ['--hide-scrollbars'],
});

async function measure(at) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  if (process.env.INJECT) await p.addStyleTag({ content: process.env.INJECT });
  await new Promise((r) => setTimeout(r, 4500));
  await p.evaluate((sel) => { const e = document.querySelector(sel); scrollTo(0, sel === '#top' ? 0 : scrollY + e.getBoundingClientRect().top + 100); }, at);
  await new Promise((r) => setTimeout(r, 900));

  const stamps = [];
  cdp.on('Page.screencastFrame', async (f) => {
    stamps.push(performance.now());
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closing */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 5, everyNthFrame: 1 });
  const t0 = performance.now();
  if (at === '#top') {
    /* hero: no scroll, only the pointer sweeping across the wordmark */
    for (let i = 0; i < 60; i++) { await p.mouse.move(200 + i * 18, 300 + Math.sin(i / 5) * 120); await new Promise((r) => setTimeout(r, 25)); }
  } else {
    await cdp.send('Input.synthesizeScrollGesture', {
      x: 700, y: 500, xDistance: 0, yDistance: -1800, speed: 1600,
      gestureSourceType: 'mouse', repeatCount: 2, repeatDelayMs: 120,
    });
  }
  await new Promise((r) => setTimeout(r, 300));
  const dur = performance.now() - t0;
  await cdp.send('Page.stopScreencast');
  await p.close();

  const gaps = [];
  for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
  gaps.sort((a, z) => a - z);
  return {
    fps: (stamps.length / dur) * 1000,
    median: gaps[Math.floor(gaps.length / 2)] || 0,
    p95: gaps[Math.floor(gaps.length * 0.95)] || 0,
    worst: gaps[gaps.length - 1] || 0,
    stalls: gaps.filter((g) => g > 100).length,
  };
}

const ONLY = process.env.ONLY;
if (ONLY) SPOTS.splice(0, SPOTS.length, ...SPOTS.filter(([n]) => n.includes(ONLY)));
const acc = Object.fromEntries(SPOTS.map(([n]) => [n, []]));
for (let r = 0; r < REPS; r++) {
  for (const [n, at] of SPOTS) acc[n].push(await measure(at));
  process.stdout.write(`  rep ${r + 1}/${REPS}\n`);
}
const med = (xs) => xs.slice().sort((a, z) => a - z)[Math.floor(xs.length / 2)];

console.log(`\n  ${URL}  1440x900 @dpr2 · ${CPU}x CPU · median of ${REPS}, interleaved\n`);
console.log('  section            frames/s   median gap   p95 gap   worst gap   stalls >100ms');
for (const [n] of SPOTS) {
  const s = acc[n];
  console.log(
    `  ${n.padEnd(18)}${med(s.map((x) => x.fps)).toFixed(1).padStart(8)}` +
    `${med(s.map((x) => x.median)).toFixed(0).padStart(13)}ms` +
    `${med(s.map((x) => x.p95)).toFixed(0).padStart(9)}ms` +
    `${med(s.map((x) => x.worst)).toFixed(0).padStart(12)}ms` +
    `${med(s.map((x) => x.stalls)).toFixed(0).padStart(15)}`
  );
}
await b.close();
