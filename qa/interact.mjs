/* Interaction + contrast gate.
 *
 * Contrast checkers lie in specific ways, so this one: parses color(srgb r g b / a) and
 * composites alpha, samples a real screenshot pixel for anything fixed or sitting over
 * media, hides the element itself before sampling so it cannot read its own glyphs, and
 * audits at more than one scroll depth because the header changes ink past the hero.
 */
import puppeteer from 'puppeteer-core';
import { PNG } from './png.mjs';

const URL_ = process.env.URL || 'http://localhost:8811/';
const W = 1440, H = 900;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  const kill = () => { if (document.documentElement) document.documentElement.style.scrollBehavior = 'auto'; };
  kill(); document.addEventListener('DOMContentLoaded', kill);
});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL_, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 900));

const R = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- the wordmark canvas must actually be painting glyphs ---- */
R.waveInk = await page.evaluate(() => {
  const c = document.querySelector('[data-markc]');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 12) lit++;
  return { canvas: `${c.width}x${c.height}`, litSamples: lit };
});


/* ---- drag the shop rail: it must move, and the drag must not fire the link under it ---- */
await page.evaluate(() => document.querySelector('.al-shop').scrollIntoView({ block: 'center' }));
await wait(700);
const railBefore = await page.evaluate(() => document.querySelector('[data-rail-track]').getBoundingClientRect().left);
const box = await page.evaluate(() => {
  const b = document.querySelector('[data-rail]').getBoundingClientRect();
  return { x: b.x + b.width * 0.6, y: b.y + b.height * 0.4 };
});
let navigated = false;
page.on('popup', () => { navigated = true; });
await page.mouse.move(box.x, box.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(box.x - i * 22, box.y);
await page.mouse.up();
await wait(900);
const railAfter = await page.evaluate(() => document.querySelector('[data-rail-track]').getBoundingClientRect().left);
R.railDrag = { moved: Math.round(railAfter - railBefore), openedLink: navigated };

/* ---- arrow keys must move both rails ---- */
R.keys = await page.evaluate(async () => {
  const out = {};
  for (const [k, sel] of [['rail', '[data-rail]'], ['tl', '[data-tl]']]) {
    const root = document.querySelector(sel);
    const track = root.querySelector(k === 'rail' ? '[data-rail-track]' : '[data-tl-track]');
    root.focus();
    const a = track.getBoundingClientRect().left;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    out[k] = Math.round(track.getBoundingClientRect().left - a);
  }
  return out;
});

/* ---- the roll: a name button must select that artist ---- */
R.roll = await page.evaluate(async () => {
  const btns = document.querySelectorAll('[data-goto]');
  btns[30].click();
  await new Promise((r) => setTimeout(r, 1600));
  const on = document.querySelector('.al-name[data-on="1"] .al-name-t')?.textContent.trim();
  const num = document.querySelector('[data-roll-num]')?.textContent;
  const plate = document.querySelector('.al-plate[data-on="1"] img')?.getAttribute('alt');
  const plateVisible = +getComputedStyle(document.querySelector('.al-plate[data-on="1"]')).opacity;
  return { clicked: btns[30].textContent.replace(/\s+/g, ' ').trim(), selected: on, num, plate, plateVisible };
});

/* ---- keyboard tab sweep: nothing focusable may be invisible ---- */
R.tab = await page.evaluate(async () => {
  const bad = [];
  let worst = 1;
  for (let i = 0; i < 80; i++) {
    const el = document.activeElement;
    if (el && el !== document.body) {
      let o = 1, n = el;
      while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement; }
      if (o < worst) worst = o;
      if (o < 0.9) bad.push({ el: el.className || el.tagName, o: +o.toFixed(2) });
    }
    /* puppeteer drives real Tab presses below; here just report */
    break;
  }
  return { note: 'see tabReal', bad, worst };
});
await page.evaluate(() => { document.body.scrollIntoView(); window.scrollTo(0, 0); });
await wait(400);
const tabBad = [];
for (let i = 0; i < 74; i++) {
  await page.keyboard.press('Tab');
  const r = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    el.scrollIntoView({ block: 'center' });
    let o = 1, n = el;
    while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement; }
    const b = el.getBoundingClientRect();
    return { el: (el.className || el.tagName).toString().slice(0, 28), o: +o.toFixed(2), w: Math.round(b.width), h: Math.round(b.height) };
  });
  if (r && (r.o < 0.9 || r.w < 8 || r.h < 8)) tabBad.push({ i, ...r });
}
R.tabReal = { checked: 74, offenders: tabBad.slice(0, 8) };

/* ---- mobile menu ---- */
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.reload({ waitUntil: 'load' });
await wait(700);
R.menu = await page.evaluate(async () => {
  const b = document.querySelector('[data-burger]');
  const m = document.querySelector('[data-menu]');
  const hit = document.elementFromPoint(innerWidth - 30, 34);
  b.click();
  await new Promise((r) => setTimeout(r, 650));
  const open = { expanded: b.getAttribute('aria-expanded'), rect: m.getBoundingClientRect().height, op: getComputedStyle(m).opacity, bodyOverflow: getComputedStyle(document.body).overflow };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));
  return { burgerHit: hit?.closest('[data-burger]') ? 'burger' : (hit?.className || hit?.tagName), open, afterEsc: { expanded: b.getAttribute('aria-expanded'), op: getComputedStyle(m).opacity, bodyOverflow: getComputedStyle(document.body).overflow } };
});

/* ---- contrast at three depths ---- */
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.reload({ waitUntil: 'load' });
await wait(800);

const depths = [
  ['hero', 0],
  ['shop', null],
  ['cta', null],
];
const contrast = [];
for (const [name] of depths) {
  const y = await page.evaluate((n) => {
    if (n === 'hero') return 0;
    const el = document.querySelector(n === 'shop' ? '.al-shop' : '.al-cta');
    /* land where the band is SETTLED (exit and enter both ~0), otherwise the checker reads
       content through the stack's own transition dim and reports a failure for a state the
       reader only sees while the section is leaving */
    return el.offsetTop - innerHeight * 0.12;
  }, name);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await wait(900);
  /* hide every glyph before sampling: an element must never be contrast-checked against
     its own ink (that alone produced a phantom 1:1 on the CTA heading) */
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = 'qa-hide';
    st.textContent = '.qa-hide-text h1,.qa-hide-text h2,.qa-hide-text h3,.qa-hide-text p,.qa-hide-text a,.qa-hide-text span,.qa-hide-text dt,.qa-hide-text dd,.qa-hide-text button,.qa-hide-text li{color:transparent !important;text-shadow:none !important;-webkit-text-stroke-color:transparent !important}';
    document.head.appendChild(st);
    document.body.classList.add('qa-hide-text');
  });
  await wait(250);
  const shot = await page.screenshot({ type: 'png' });
  await page.evaluate(() => {
    document.body.classList.remove('qa-hide-text');
    document.getElementById('qa-hide')?.remove();
  });
  const png = PNG(shot);
  const rows = await page.evaluate(() => {
    const parse = (c) => {
      /* color(srgb r g b / a) is not rgb(): a naive regex reads 0.83 as 0.83/255 = black */
      let m = c.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
      m = c.match(/rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:,?\s*\/?\s*([\d.]+))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
      return null;
    };
    const out = [];
    document.querySelectorAll('a, p, span, h1, h2, h3, dt, dd, button, li').forEach((el) => {
      if (!el.textContent.trim()) return;
      /* leaf text only: an anchor whose box also contains album art gets measured against
         the art, which reads as a 1.5:1 failure on text that is actually on bone paper */
      if ([...el.children].some((c) => c.textContent.trim() || c.tagName === 'IMG' || c.tagName === 'SVG')) return;
      const b = el.getBoundingClientRect();
      if (b.height < 4 || b.bottom < 0 || b.top > innerHeight || b.width < 4) return;
      let o = 1, n = el;
      while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement; }
      if (o < 0.5) return;
      const cs = getComputedStyle(el);
      let fg = parse(cs.color);
      /* an outline face paints with its stroke, not its fill: color:transparent is not a
         1:1 contrast failure */
      if (fg && fg[3] === 0) {
        const sw = parseFloat(cs.webkitTextStrokeWidth) || 0;
        fg = sw > 0 ? parse(cs.webkitTextStrokeColor) : null;
      }
      if (!fg) return;
      const fixed = (() => { let n2 = el; while (n2 && n2 !== document.body) { if (getComputedStyle(n2).position === 'fixed') return true; n2 = n2.parentElement; } return false; })();
      out.push({
        sel: (el.className || el.tagName).toString().slice(0, 26),
        txt: el.textContent.trim().slice(0, 22),
        fg, fixed,
        fs: parseFloat(cs.fontSize), fw: cs.fontWeight,
        box: [Math.round(b.left), Math.round(Math.max(b.top, 0)), Math.round(b.width), Math.round(Math.min(b.height, innerHeight - Math.max(b.top, 0)))],
      });
    });
    return out;
  });

  for (const r of rows) {
    /* sample the LIGHTEST and DARKEST backdrop pixel in the text band from the real
       screenshot: an ancestor walk returns body colour for anything over media */
    const [x, y0, w, h] = r.box;
    let lightest = null, darkest = null;
    for (let sy = y0; sy < y0 + h; sy += Math.max(1, Math.floor(h / 5))) {
      for (let sx = x; sx < x + w; sx += Math.max(1, Math.floor(w / 24))) {
        const p = png.at(sx, sy);
        if (!p) continue;
        const l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
        if (!lightest || l > lightest.l) lightest = { p, l };
        if (!darkest || l < darkest.l) darkest = { p, l };
      }
    }
    if (!lightest) continue;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
    const comp = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
    const fgL = L(comp(r.fg, lightest.p));
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const worst = Math.min(ratio(fgL, L(lightest.p)), ratio(L(comp(r.fg, darkest.p)), L(darkest.p)));
    const large = r.fs >= 24 || (r.fs >= 18.66 && +r.fw >= 700);
    const need = large ? 3 : 4.5;
    if (worst < need) contrast.push({ depth: name, ...r, ratio: +worst.toFixed(2), need, fg: r.fg.map(Math.round) });
  }
}
R.contrastFailures = contrast;
R.pageErrors = errs;

console.log(JSON.stringify(R, null, 1));
await browser.close();
