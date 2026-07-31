/* How does the REFERENCE handle a long roster without it feeling heavy?
   Inspect the live DOM and the real scroll behaviour — never a prose summary of the site.
   The question that matters: when the visitor moves the page by N pixels, how many pixels
   does the roster move? 1.0 is direct manipulation. Below 1.0 the content is dragging
   behind the finger, which is what reads as lag regardless of frame rate. */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2];
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 90000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-ref',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
await p.setCacheEnabled(false);
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));

const shape = await p.evaluate(() => {
  const out = { title: document.title, h: document.body.scrollHeight, vh: innerHeight };
  /* anything pinned: sticky or fixed, which is what a scroll-driven section needs */
  const pinned = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.height < 200) continue;
    pinned.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 46),
      pos: cs.position, h: Math.round(r.height),
    });
  }
  out.pinned = pinned.slice(0, 10);
  /* any element with its own scrollport - a natively scrolling list */
  const scrollers = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 150) {
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowY)) continue;
      scrollers.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 46),
        inner: el.scrollHeight, outer: el.clientHeight });
    }
  }
  out.scrollers = scrollers.slice(0, 8);
  out.snap = [...document.querySelectorAll('body *')]
    .filter((el) => getComputedStyle(el).scrollSnapType !== 'none')
    .slice(0, 5)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 34)} :: ${getComputedStyle(el).scrollSnapType}`);
  out.lenis = !!(window.Lenis || window.lenis || document.querySelector('[class*=lenis]'));
  out.gsap = !!window.gsap;
  out.scrollTrigger = !!(window.ScrollTrigger || window.gsap?.ScrollTrigger);
  return out;
});

console.log(`\n=== ${URL}`);
console.log(`  "${shape.title}"  ·  page ${shape.h}px over a ${shape.vh}px viewport`);
console.log(`  smooth-scroll lib: lenis=${shape.lenis}  gsap=${shape.gsap}  ScrollTrigger=${shape.scrollTrigger}`);
console.log(`  pinned (sticky/fixed) blocks:`);
shape.pinned.forEach((x) => console.log(`      ${x.pos.padEnd(7)} ${x.h}px  ${x.tag}.${x.cls}`));
if (!shape.pinned.length) console.log('      none — nothing is pinned');
console.log(`  independently scrolling lists:`);
shape.scrollers.forEach((x) => console.log(`      ${x.tag}.${x.cls}  ${x.inner}px inside ${x.outer}px`));
if (!shape.scrollers.length) console.log('      none');
if (shape.snap.length) { console.log('  scroll-snap:'); shape.snap.forEach((s) => console.log(`      ${s}`)); }

/* the ratio: move the page a fixed amount and see how far the content actually travels */
const probe = await p.evaluate(async () => {
  const sample = () => [...document.querySelectorAll('body *')]
    .filter((el) => {
      const t = getComputedStyle(el).transform;
      return t && t !== 'none';
    })
    .slice(0, 400)
    .map((el) => ({ el, y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 }));

  const before = sample();
  const y0 = scrollY;
  scrollTo(0, y0 + 500);
  await new Promise((r) => setTimeout(r, 1500));
  const moved = [];
  for (const b of before) {
    const now = new DOMMatrixReadOnly(getComputedStyle(b.el).transform).m42;
    const d = now - b.y;
    if (Math.abs(d) > 4) {
      moved.push({ cls: `${b.el.tagName.toLowerCase()}.${String(b.el.className || '').slice(0, 40)}`, d: Math.round(d) });
    }
  }
  return { scrolled: scrollY - y0, moved: moved.slice(0, 10) };
});
console.log(`\n  scrolled the page ${probe.scrolled}px — transformed elements that responded:`);
probe.moved.forEach((m) => console.log(`      ${String(m.d).padStart(6)}px  (${(m.d / probe.scrolled).toFixed(2)}x)  ${m.cls}`));
if (!probe.moved.length) console.log('      none — the content just scrolls natively with the page (1.00x)');
await b.close();
