/* Isolate the hero's drawImage cost: filter-then-upscale vs upscale-then-filter vs neither.
   Runs on a scratch canvas in the live page so the codec path and GPU are identical. */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 120000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3200));

const out = await p.evaluate(async () => {
  const v = document.querySelector('.al-hero-video');
  const W = 2490, H = 1136;                      /* the real mark canvas backing store */
  const GRADE = 'brightness(2.15) contrast(1.28) saturate(0)';
  const scale = Math.max(W / v.videoWidth, H / v.videoHeight) * 1.16;
  const dw = v.videoWidth * scale, dh = v.videoHeight * scale;

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const off = document.createElement('canvas'); off.width = v.videoWidth; off.height = v.videoHeight;
  const ox = off.getContext('2d');

  const time = (label, fn) => {
    for (let i = 0; i < 5; i++) fn();                    /* warm */
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < 700) { fn(); n++; }
    x.getImageData(0, 0, 1, 1);                          /* force a flush */
    return { label, ms: +((performance.now() - t0) / n).toFixed(2) };
  };

  const r = [];
  r.push(time('current: upscale THEN filter', () => {
    x.clearRect(0, 0, W, H); x.filter = GRADE;
    x.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh); x.filter = 'none';
  }));
  r.push(time('proposed: filter at native, then upscale', () => {
    ox.filter = GRADE; ox.drawImage(v, 0, 0); ox.filter = 'none';
    x.clearRect(0, 0, W, H); x.drawImage(off, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }));
  r.push(time('upscale only, no filter at all', () => {
    x.clearRect(0, 0, W, H); x.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }));
  r.push(time('offscreen reuse: upscale a cached grade', () => {
    x.clearRect(0, 0, W, H); x.drawImage(off, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }));
  return { r, dw: Math.round(dw), dh: Math.round(dh), nat: [v.videoWidth, v.videoHeight] };
});

console.log(`video ${out.nat.join('x')} · drawn at ${out.dw}x${out.dh} (${(out.dw * out.dh / 1e6).toFixed(2)} MP) into 2490x1136`);
out.r.forEach((x) => console.log(`  ${String(x.ms).padStart(7)} ms  ${x.label}`));

/* pixel-equality of the two grade orders */
const diff = await p.evaluate(async () => {
  const v = document.querySelector('.al-hero-video');
  const W = 800, H = 400, GRADE = 'brightness(2.15) contrast(1.28) saturate(0)';
  const s = Math.max(W / v.videoWidth, H / v.videoHeight) * 1.16;
  const dw = v.videoWidth * s, dh = v.videoHeight * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [, a] = mk(); const [, z] = mk();
  a.filter = GRADE; a.drawImage(v, dx, dy, dw, dh); a.filter = 'none';
  const off = document.createElement('canvas'); off.width = v.videoWidth; off.height = v.videoHeight;
  const ox = off.getContext('2d'); ox.filter = GRADE; ox.drawImage(v, 0, 0);
  z.drawImage(off, dx, dy, dw, dh);
  const A = a.getImageData(0, 0, W, H).data, Z = z.getImageData(0, 0, W, H).data;
  let max = 0, sum = 0, n = 0, over2 = 0;
  for (let i = 0; i < A.length; i += 4) {
    for (let k = 0; k < 3; k++) { const d = Math.abs(A[i + k] - Z[i + k]); max = Math.max(max, d); sum += d; n++; if (d > 2) over2++; }
  }
  return { max, mean: +(sum / n).toFixed(3), pctOver2: +((over2 / n) * 100).toFixed(3) };
});
console.log(`\ngrade-order pixel diff (0-255): max ${diff.max} · mean ${diff.mean} · ${diff.pctOver2}% of channels differ by >2`);
await b.close();
