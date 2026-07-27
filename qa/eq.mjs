/* Pixel equality of the hero wordmark before vs after the film change.
   Both arms are pinned to the SAME film frame (video paused at a fixed currentTime) and the
   same intro/scroll state, so any difference is the change and not the video advancing. */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 120000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3600));

const res = await p.evaluate(async () => {
  const v = document.querySelector('.al-hero-video');
  const c = document.querySelector('[data-markc]');
  v.pause(); v.currentTime = 2.0;
  await new Promise((r) => { const h = () => { v.removeEventListener('seeked', h); r(); }; v.addEventListener('seeked', h); });
  await new Promise((r) => setTimeout(r, 260));

  const W = c.width, H = c.height, dpr = W / c.getBoundingClientRect().width;
  const w = W / dpr, h = H / dpr;
  const GRADE = 'brightness(2.15) contrast(1.28) saturate(0)';

  /* the shipped canvas, which is now the NEW path */
  const after = c.getContext('2d').getImageData(0, 0, W, H).data;

  /* rebuild the OLD path from scratch, same geometry, same font, same frame */
  const o = document.createElement('canvas'); o.width = W; o.height = H;
  const x = o.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const LINES = ['ALDA', 'MUSIC'];
  const font = (px) => `500 ${px}px Humane, "Archivo Narrow", sans-serif`;
  const wide = w >= 1024, target = w * (wide ? 0.72 : 0.98), REF = 200;
  x.font = font(REF);
  const raw = LINES.map((l) => { const m = x.measureText(l).width; return m ? (REF * target) / m : 0; });
  const capOf = (px) => px * 0.7, leadOf = (px) => px * 0.015;
  let blockH = capOf(raw[0]) + leadOf(raw[0]) + capOf(raw[1]);
  const budget = h * (wide ? 0.62 : 0.5);
  const k = blockH > budget ? budget / blockH : 1;
  const sizes = raw.map((q) => q * k), lead = leadOf(sizes[0]);
  blockH = capOf(sizes[0]) + lead + capOf(sizes[1]);
  const top = (h - blockH) / 2 + capOf(sizes[0]);
  const y1 = top, y2 = y1 + lead + sizes[1] * 0.7;
  const glyph = (i, y, size) => { x.font = font(size); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillText(LINES[i], w / 2, y); };
  /* the opening sequence's reveal clips, still in force at intro=1 — they shave the hairline
     of glyph ink that sits above the nominal 0.7em cap line, so the arms must both have them */
  x.save(); x.beginPath(); x.rect(0, y1 - sizes[0] * 0.7, w, sizes[0] * 0.7 + 2); x.clip();
  x.fillStyle = '#fff'; glyph(0, y1, sizes[0]); x.restore();
  x.save(); x.beginPath(); x.rect(0, y2 - sizes[1] * 0.7, w, sizes[1] * 0.7 + 2); x.clip();
  x.fillStyle = '#fff'; glyph(1, y2, sizes[1]); x.restore();
  x.save(); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#F6F4F1'; x.fillRect(0, 0, w, h); x.restore();
  x.save();
  x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.9; x.filter = GRADE;
  const vw = v.videoWidth, vh = v.videoHeight;
  const s = Math.max(w / vw, h / vh) * 1.16, dw = vw * s, dh = vh * s;
  x.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
  x.filter = 'none'; x.restore();
  x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.3; x.fillStyle = '#F6F4F1'; x.fillRect(0, 0, w, h); x.restore();
  const before = x.getImageData(0, 0, W, H).data;

  let maxRGB = 0, sum = 0, n = 0, over4 = 0, alphaDiff = 0, inkPx = 0;
  let inner = 0, innerMax = 0, innerOver2 = 0;
  let lost = 0, gained = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let i = 0; i < before.length; i += 4) {
    const aA = before[i + 3], aB = after[i + 3];
    const ad = Math.abs(aA - aB);
    if (ad > 8) {
      alphaDiff = Math.max(alphaDiff, ad);
      if (aA > aB) lost++; else gained++;
      const px = (i / 4) % W, py = Math.floor((i / 4) / W);
      bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py);
    }
    if (aA > 8 || aB > 8) {
      inkPx++;
      for (let q = 0; q < 3; q++) { const d = Math.abs(before[i + q] - after[i + q]); maxRGB = Math.max(maxRGB, d); sum += d; n++; if (d > 4) over4++; }
    }
    /* interior = fully covered by type in BOTH arms, i.e. not an antialiased outline pixel */
    if (aA > 250 && aB > 250) {
      inner++;
      let d = 0; for (let q = 0; q < 3; q++) d = Math.max(d, Math.abs(before[i + q] - after[i + q]));
      innerMax = Math.max(innerMax, d); if (d > 2) innerOver2++;
    }
  }
  return {
    W, H, inkPx, inkPct: +((inkPx / (W * H)) * 100).toFixed(1), maxRGB,
    mean: +(sum / n).toFixed(3), pctOver4: +((over4 / n) * 100).toFixed(3),
    inner, innerMax, innerOver2,
    alphaDiff, lost, gained, box: bx1 < 0 ? null : [bx0, by0, bx1, by1],
    inkBox: (() => { const c2 = document.querySelector('[data-markc]'); return c2.dataset.ink || 'n/a'; })(),
  };
});

console.log(`canvas ${res.W}x${res.H} · ink covers ${res.inkPct}% of it (${res.inkPx} px)`);
console.log(`inside the ink:  max channel diff ${res.maxRGB}/255 · mean ${res.mean} · ${res.pctOver4}% of channels differ by >4`);
console.log(`glyph coverage:  max alpha diff ${res.alphaDiff} · lost ${res.lost}px, gained ${res.gained}px · disagreement bbox ${JSON.stringify(res.box)}`);
console.log(`glyph INTERIOR (${res.inner} fully-covered px): max channel diff ${res.innerMax}/255 · ${res.innerOver2} px differ by >2`);

await p.evaluate(() => { const v = document.querySelector('.al-hero-video'); v.play(); });
writeFileSync('qa/hero-after.png', await p.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } }));
await b.close();
