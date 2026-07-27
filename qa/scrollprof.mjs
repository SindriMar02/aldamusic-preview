/* Profile the condition that actually lags: scrolling under CPU pressure, vsync ON.
   No --disable-gpu-vsync: those flags serialize normally-pipelined work and made the page
   measure 5x slower than it really is. */
import puppeteer from 'puppeteer-core';

const CPU = +(process.argv[2] || 4);
const AT = +(process.argv[3] || 0);
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const cdp = await p.target().createCDPSession();
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
const frames = await p.evaluate(async (at) => {
  const y0 = at * innerHeight;
  scrollTo(0, y0);
  await new Promise((r) => setTimeout(r, 400));
  let f = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 4000) {
    scrollTo(0, y0 + ((performance.now() - t0) / 4000) * innerHeight * 1.5);
    await new Promise((r) => requestAnimationFrame(r));
    f++;
  }
  return { f, ms: performance.now() - t0 };
}, AT);
const { profile } = await cdp.send('Profiler.stop');

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
for (const s of profile.samples) {
  const n = byId.get(s); if (!n) continue;
  const f = n.callFrame;
  const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + 1);
}
const span = (profile.endTime - profile.startTime) / 1000;
const tot = profile.samples.length;
console.log(`scroll from ${AT}vh · ${CPU}x CPU · ${frames.f} frames in ${frames.ms.toFixed(0)}ms = ${(frames.f / (frames.ms / 1000)).toFixed(1)} fps`);
[...self.entries()].sort((a, z) => z[1] - a[1]).slice(0, 14).forEach(([k, v]) => {
  console.log(`  ${((v / tot) * 100).toFixed(1).padStart(5)}%  ${((v / tot) * span / frames.f).toFixed(2).padStart(6)} ms/frame  ${k}`);
});
await b.close();
