/* Work submitted per second, counted rather than timed.
   Frame timing in this environment is unreliable — vsync flags distort it and canvas raster is
   asynchronous, so a timer can charge queue back-pressure to whichever call happens to be
   holding the queue. COUNTING canvas operations has none of those failure modes: it measures
   what the page asks the compositor to do, which is what the two builds actually differ in. */
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: ['--hide-scrollbars'],
});

async function arm(label, url) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument(() => {
    const P = CanvasRenderingContext2D.prototype;
    window.__w = { fillText: 0, filteredDraw: 0, drawImage: 0, stroke: 0, fill: 0, filterPx: 0, drawPx: 0 };
    for (const name of ['fillText', 'drawImage', 'stroke', 'fill']) {
      const orig = P[name];
      P[name] = function (...a) {
        window.__w[name]++;
        if (name === 'drawImage') {
          const src = a[0];
          const sw = src.videoWidth || src.width || 0, sh = src.videoHeight || src.height || 0;
          /* Destination extent is in CURRENT USER UNITS, which differ per call site: the film
             blit runs under the dpr transform (CSS px), the glyph blit under an identity one
             (device px). Normalising by the live transform scale is the only way these totals
             are the same unit and therefore comparable at all. */
          const k = (this.getTransform ? this.getTransform().a : 1) || 1;
          const dw = (a.length >= 5 ? Math.abs(a[3]) : sw) * k;
          const dh = (a.length >= 5 ? Math.abs(a[4]) : sh) * k;
          if (this.filter && this.filter !== 'none') { window.__w.filteredDraw++; window.__w.filterPx += dw * dh; }
          window.__w.drawPx += dw * dh;
        }
        return orig.apply(this, a);
      };
    }
  });
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4200));                 /* past the loader */
  const r = await p.evaluate(async () => {
    const z = { ...window.__w };
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const s = (performance.now() - t0) / 1000;
    const d = {};
    for (const k in window.__w) d[k] = +((window.__w[k] - z[k]) / s).toFixed(0);
    return d;
  });
  await p.close();
  console.log(`\n  ${label}`);
  console.log(`    fillText / s          ${String(r.fillText).padStart(10)}   (316px wordmark glyph rasterisations)`);
  console.log(`    filtered drawImage /s ${String(r.filteredDraw).padStart(10)}`);
  console.log(`    filtered MPixels / s  ${String((r.filterPx / 1e6).toFixed(1)).padStart(10)}   <- brightness/contrast/saturate work`);
  console.log(`    drawImage / s         ${String(r.drawImage).padStart(10)}`);
  console.log(`    total drawn MPx / s   ${String((r.drawPx / 1e6).toFixed(1)).padStart(10)}`);
  console.log(`    stroke+fill / s       ${String(r.stroke + r.fill).padStart(10)}   (lattice paths dominate)`);
  return r;
}

const before = await arm('BEFORE — currently deployed', 'http://localhost:8812/');
const after = await arm('AFTER  — this change', 'http://localhost:8811/');
console.log('\n  reduction');
for (const [k, lbl] of [['fillText', 'wordmark glyph rasterisations'], ['filterPx', 'filtered pixels'], ['drawPx', 'drawn pixels'], ['stroke', 'lattice strokes']]) {
  const bv = before[k], av = after[k];
  const pct = bv ? (100 * (1 - av / bv)).toFixed(1) : '0';
  console.log(`    ${lbl.padEnd(30)} ${String(bv).padStart(12)} -> ${String(av).padStart(12)}   ${pct}% less`);
}
await b.close();
