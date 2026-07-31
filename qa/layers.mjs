/* Compositing-layer census during a full read of the page.
   Decoded image bytes were fixed and the phone still dies, so the next candidate is GPU
   backing store: every promoted layer costs w*h*4 bytes of VRAM at device scale, and iOS
   kills a tab on layer memory as readily as on bitmap memory. LayerTree gives the real
   layer list, not a guess from the CSS. */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:8811/';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-layers',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const cdp = await p.target().createCDPSession();

let latest = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) latest = e.layers; });
await cdp.send('LayerTree.enable');
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const sample = async (label) => {
  await new Promise((r) => setTimeout(r, 700));
  const layers = latest;
  let bytes = 0;
  const big = [];
  for (const l of layers) {
    const px = (l.width || 0) * (l.height || 0);
    const bb = px * 4;
    bytes += bb;
    if (bb > 2e6) big.push([bb, l.backendNodeId, l.width, l.height]);
  }
  const img = await p.evaluate(() => {
    let n = 0, bytes = 0;
    for (const el of document.images) {
      if (!el.naturalWidth || !el.currentSrc) continue;
      n++; bytes += el.naturalWidth * el.naturalHeight * 4;
    }
    let canv = 0;
    for (const c of document.querySelectorAll('canvas')) canv += c.width * c.height * 4;
    return { n, mb: bytes / 1048576, canvasMb: canv / 1048576 };
  });
  console.log(
    `  ${label.padEnd(22)} layers ${String(layers.length).padStart(4)}` +
    `  layerMem ${(bytes / 1048576).toFixed(0).padStart(5)} MB` +
    `  imgs ${String(img.n).padStart(3)} = ${img.mb.toFixed(0).padStart(4)} MB` +
    `  canvas ${img.canvasMb.toFixed(0).padStart(3)} MB` +
    `  TOTAL ${((bytes / 1048576) + img.mb + img.canvasMb).toFixed(0).padStart(5)} MB`
  );
  return { layers: layers.length, layerMb: bytes / 1048576, big };
};

console.log(`\n  ${URL}  ·  390x844 @dpr3\n`);
const marks = [];
marks.push(await sample('landing'));
const H = await p.evaluate(() => innerHeight);
const total = await p.evaluate(() => document.body.scrollHeight);
const steps = Math.ceil(total / H);
let worst = { layerMb: 0 };
for (let i = 1; i <= steps; i++) {
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195, y: 500, xDistance: 0, yDistance: -H, speed: 2600, gestureSourceType: 'touch',
  });
  const s = await sample(`after ${i}/${steps} screens`);
  if (s.layerMb > worst.layerMb) worst = s;
}

if (worst.big?.length) {
  console.log('\n  heaviest individual layers at the worst point:');
  const seen = new Set();
  for (const [bb, id, w, h] of worst.big.sort((a, z) => z[0] - a[0]).slice(0, 12)) {
    let desc = `node ${id}`;
    try {
      const { node } = await cdp.send('DOM.describeNode', { backendNodeId: id });
      const cls = (node.attributes || []).reduce((a, v, i, arr) => (arr[i] === 'class' ? arr[i + 1] : a), '');
      desc = `${node.nodeName.toLowerCase()}${cls ? '.' + cls.split(' ').join('.') : ''}`;
    } catch { /* node may be gone */ }
    const k = desc + w + h;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`    ${(bb / 1048576).toFixed(1).padStart(6)} MB  ${w}x${h}  ${desc.slice(0, 74)}`);
  }
}
await b.close();
