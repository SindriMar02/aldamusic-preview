/* CPU self-time attribution. Proportions are valid even when the machine is busy.
   Usage: node qa/prof.mjs [scrollVh] */
import puppeteer from 'puppeteer-core';

const AT = +(process.argv[2] || 0);
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 120000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3400));
if (AT) { await p.evaluate((v) => scrollTo(0, v * innerHeight), AT); await new Promise((r) => setTimeout(r, 900)); }

const c = await p.target().createCDPSession();
await c.send('Profiler.enable');
await c.send('Profiler.setSamplingInterval', { interval: 120 });
await c.send('Profiler.start');
const frames = await p.evaluate(async () => {
  let f = 0, run = true;
  const t = () => { f++; if (run) requestAnimationFrame(t); };
  requestAnimationFrame(t);
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 4000));
  run = false;
  return { f, ms: performance.now() - t0 };
});
const { profile } = await c.send('Profiler.stop');

const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const total = profile.samples.length;
for (const s of profile.samples) {
  const n = byId.get(s); if (!n) continue;
  const f = n.callFrame;
  const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + 1);
}
const span = (profile.endTime - profile.startTime) / 1000;
console.log(`scroll ${AT}vh · ${frames.f} frames in ${frames.ms.toFixed(0)}ms = ${(frames.f / (frames.ms / 1000)).toFixed(1)} fps · ${total} samples over ${span.toFixed(0)}ms`);
[...self.entries()].sort((a, z) => z[1] - a[1]).slice(0, 16).forEach(([k, v]) => {
  const ms = (v / total) * span;
  console.log(`  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${(ms / frames.f).toFixed(2).padStart(6)} ms/frame  ${k}`);
});
await b.close();
