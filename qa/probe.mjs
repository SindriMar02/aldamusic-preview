/* Structural probe: geometry, overflow, clipped text, scrub reversibility, fps.
   Numbers only. Taste is judged from qa/walk.mjs frames, never from this. */
import puppeteer from 'puppeteer-core';

const URL_ = process.env.URL || 'http://localhost:8811/';
const W = Number(process.env.W) || 1440;
const H = Number(process.env.H) || 900;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  const kill = () => { if (document.documentElement) document.documentElement.style.scrollBehavior = 'auto'; };
  kill();
  document.addEventListener('DOMContentLoaded', kill);
});

const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message} :: ${(e.stack||'').split('\n').slice(0,4).join(' | ')}`));

await page.goto(URL_, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 800));

const out = await page.evaluate(() => {
  const R = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
  const res = {};

  res.doc = { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth };
  res.hOverflow = document.documentElement.scrollWidth - innerWidth;

  /* text that is wider than the box that clips it */
  res.clipped = [];
  document.querySelectorAll('.al-h2, .al-h2 > span, .al-cta-h, .al-parent-h, .al-hero-mark, .al-rel-artist, .al-era-h').forEach((el) => {
    let p = el.parentElement, clipper = null;
    while (p && p !== document.body) {
      const o = getComputedStyle(p).overflow;
      if (o !== 'visible') { clipper = p; break; }
      p = p.parentElement;
    }
    const eb = el.getBoundingClientRect();
    const cb = clipper ? clipper.getBoundingClientRect() : null;
    const over = cb ? Math.round(eb.right - cb.right) : 0;
    if (over > 1 && !clipper.className.match(/al-rail|al-tl|al-mq/)) res.clipped.push({ sel: el.className || el.tagName, txt: el.textContent.trim().slice(0, 28), over, elW: Math.round(eb.width), clipW: Math.round(cb.width), clipper: clipper.className });
  });

  /* a band's own text must not paint outside the band */
  res.escapes = [];
  document.querySelectorAll('.al-cta, .al-parent, .al-shop, .al-hist, .al-ft').forEach((sec) => {
    const sb = sec.getBoundingClientRect();
    sec.querySelectorAll('h2, h3, p, a').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.height === 0) return;
      const up = Math.round(sb.top - b.top);
      const dn = Math.round(b.bottom - sb.bottom);
      if (up > 2 || dn > 2) res.escapes.push({ sec: sec.className.split(' ')[0], txt: el.textContent.trim().slice(0, 26), up, dn });
    });
  });


  res.roll = (() => {
    const list = document.querySelector('[data-roll-list]');
    const rows = document.querySelectorAll('.al-name');
    const sp = document.querySelector('[data-roll-spacer]');
    return { rows: rows.length, row: rows[0]?.offsetHeight, travel: getComputedStyle(sp).getPropertyValue('--al-roll-travel').trim(), spacerH: sp.offsetHeight, listH: list.offsetHeight };
  })();

  res.h1 = { count: document.querySelectorAll('h1').length, aria: document.querySelector('h1')?.getAttribute('aria-label'), text: document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() };
  res.headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName} ${h.textContent.replace(/\s+/g, ' ').trim().slice(0, 34)}`);

  /* every portrait rendered no larger than its own pixels */
  res.upscale = [...document.querySelectorAll('.al-plate img, .al-rel-img')].map((i) => {
    const b = i.getBoundingClientRect();
    return b.width && i.naturalWidth ? +((b.width * devicePixelRatio) / i.naturalWidth).toFixed(2) : 0;
  }).filter(Boolean).sort((a, b) => b - a).slice(0, 5);

  res.imgs = { total: document.images.length, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc.split('/').pop()) };
  return res;
});

/* scrub reversibility: settle, sample, move, come back, sample again */
const rev = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const probe = () => {
    const el = document.querySelector('.al-hist-head .al-h2');
    return {
      rv: +getComputedStyle(el).getPropertyValue('--rv'),
      roll: +getComputedStyle(document.documentElement).getPropertyValue('--al-roll-y'),
      p: +getComputedStyle(document.documentElement).getPropertyValue('--al-p'),
    };
  };
  const y0 = document.querySelector('.al-hist').offsetTop - innerHeight * 0.55;
  window.scrollTo(0, y0); await wait(1200);
  const a = probe();
  window.scrollTo(0, y0 + innerHeight * 0.5); await wait(1200);
  const b = probe();
  window.scrollTo(0, y0); await wait(1200);
  const c = probe();
  return { a, b, c };
});

const fps = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let frames = 0, long = 0;
  const po = new PerformanceObserver((l) => { long += l.getEntries().length; });
  po.observe({ entryTypes: ['longtask'] });
  let run = true;
  const tick = () => { frames++; if (run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const t0 = performance.now();
  const top = document.querySelector('[data-roll-spacer]').offsetTop;
  for (let i = 0; i < 40; i++) { window.scrollTo(0, top + i * 60); await wait(50); }
  run = false; po.disconnect();
  return { fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1), longtasks: long };
});

console.log(JSON.stringify({ ...out, reversibility: rev, perf: fps, consoleErrors: errs }, null, 1));
await browser.close();
