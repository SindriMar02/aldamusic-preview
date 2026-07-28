/* Who is burning the frame during a REAL touch fling on a phone viewport.
   Usage: node qa/silkprof.mjs [vh] [cpu] */
import puppeteer from 'puppeteer-core';

const AT = +(process.argv[2] || 1.1);
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
await new Promise((r) => setTimeout(r, 4500));
await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
await new Promise((r) => setTimeout(r, 700));

await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await cdp.send('Input.synthesizeScrollGesture', {
  x: 195, y: 500, xDistance: 0, yDistance: -1500,
  speed: 1400, gestureSourceType: 'touch', repeatCount: 2, repeatDelayMs: 120,
});
await new Promise((r) => setTimeout(r, 300));
const { profile } = await cdp.send('Profiler.stop');

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
for (const s of profile.samples) {
  const n = byId.get(s); if (!n) continue;
  const f = n.callFrame;
  self.set(`${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`, (self.get(`${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`) || 0) + 1);
}
const span = (profile.endTime - profile.startTime) / 1000;
const tot = profile.samples.length || 1;
console.log(`fling at ${AT}vh · ${CPU}x CPU · ${span.toFixed(0)}ms of gesture`);
[...self.entries()].sort((a, z) => z[1] - a[1]).slice(0, 14).forEach(([k, v]) => {
  console.log(`  ${((v / tot) * 100).toFixed(1).padStart(5)}%  ${((v / tot) * span).toFixed(0).padStart(5)}ms total  ${k}`);
});
await b.close();
