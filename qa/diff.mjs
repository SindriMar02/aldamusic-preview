/* Pixel diff of the deployed build (8812, git HEAD) against the working tree (8811).
   Every change in this pass is meant to be invisible: the brief was to purge lag WITHOUT
   losing any qualities, so anything that moves a pixel is a bug, not a tradeoff. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const STOPS = [
  ['hero', 0],
  ['ticker', 0.9],
  ['shop', 1.9],
  ['roll-early', 2.6],
  ['roll-mid', 3.6],
  ['roll-late', 4.6],
  ['history', 6.2],
  ['parent', 7.4],
  ['cta', 8.4],
  ['footer', 9.6],
];
const W = +(process.argv[2] || 390);
/* Ports are arguments so the same harness can measure its OWN noise floor: the lattice
   conveys, the film plays and the timeline rail settles by damping, so two loads of the
   IDENTICAL build never match. Run `node qa/diff.mjs 390 8811 8811` to see what a difference
   of zero looks like, then judge the real comparison against that number and not against 0. */
const PA = +(process.argv[3] || 8812);
const PB = +(process.argv[4] || 8811);
const mob = W < 900;
const out = `qa/diff-${W}-${PA}v${PB}`;
fs.mkdirSync(out, { recursive: true });

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-diff',
  args: ['--hide-scrollbars'],
});

async function shots(port) {
  const p = await b.newPage();
  await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: 1, isMobile: mob, hasTouch: mob });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${port}/`, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));
  const got = {};
  for (const [name, vh] of STOPS) {
    await p.evaluate((v) => scrollTo(0, v * innerHeight), vh);
    /* let every damped channel and transition settle: the page is deliberately springy */
    await new Promise((r) => setTimeout(r, 2200));
    got[name] = await p.screenshot({ type: 'png' });
  }
  await p.close();
  return { got, errs };
}

const A = await shots(PA);
const B = await shots(PB);

console.log(`\n  ${W}px · ${PA} vs ${PB} · dpr1\n`);
if (A.errs.length) console.log(`  HEAD page errors: ${A.errs.join(' | ')}`);
if (B.errs.length) console.log(`  WORKING page errors: ${B.errs.join(' | ')}`);

let worst = 0;
for (const [name] of STOPS) {
  const a = PNG.sync.read(A.got[name]);
  const c = PNG.sync.read(B.got[name]);
  if (a.width !== c.width || a.height !== c.height) {
    console.log(`  ${name.padEnd(12)} SIZE MISMATCH ${a.width}x${a.height} vs ${c.width}x${c.height}`);
    continue;
  }
  let diff = 0, maxd = 0;
  const vis = new PNG({ width: a.width, height: a.height });
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - c.data[i]),
      Math.abs(a.data[i + 1] - c.data[i + 1]),
      Math.abs(a.data[i + 2] - c.data[i + 2])
    );
    if (d > maxd) maxd = d;
    /* 8/255 tolerance absorbs video frame timing and text antialiasing */
    const hit = d > 8;
    if (hit) diff++;
    vis.data[i] = hit ? 255 : a.data[i] >> 2;
    vis.data[i + 1] = hit ? 0 : a.data[i + 1] >> 2;
    vis.data[i + 2] = hit ? 0 : a.data[i + 2] >> 2;
    vis.data[i + 3] = 255;
  }
  const pct = (diff / (a.width * a.height)) * 100;
  if (pct > worst) worst = pct;
  fs.writeFileSync(`${out}/${name}-head.png`, A.got[name]);
  fs.writeFileSync(`${out}/${name}-work.png`, B.got[name]);
  if (pct > 0.5) fs.writeFileSync(`${out}/${name}-DIFF.png`, PNG.sync.write(vis));
  console.log(`  ${name.padEnd(12)} ${pct.toFixed(2).padStart(6)}% pixels differ   max channel delta ${maxd}` +
    `${pct > 0.5 ? '   <-- look at ' + name + '-DIFF.png' : ''}`);
}
console.log(`\n  worst stop: ${worst.toFixed(2)}% · shots in ${out}/`);
await b.close();
