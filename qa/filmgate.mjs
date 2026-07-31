/* Does the film actually stop when the hero leaves, and does it come back?
   Counts real graded blits by wrapping drawImage, so this measures the work done rather than
   trusting the paused flag. Also checks the endless CSS animations get paused off screen. */
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-film',
  args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.evaluateOnNewDocument(() => {
  window.__blits = 0;
  const d = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) {
    if (src instanceof HTMLVideoElement) window.__blits++;
    return d.call(this, src, ...rest);
  };
});
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));

const probe = async () => p.evaluate(() => {
  const v = document.querySelector('.al-hero-video');
  const anims = document.getAnimations().filter((a) => a.playState === 'running').length;
  const n = window.__blits; window.__blits = 0;
  return { paused: v ? v.paused : null, t: v ? +v.currentTime.toFixed(2) : null, anims, n };
});

const sample = async (label) => {
  await probe();                                   /* reset the counter */
  await new Promise((r) => setTimeout(r, 2000));   /* watch two seconds */
  const s = await probe();
  console.log(`  ${label.padEnd(26)} video ${s.paused ? 'PAUSED' : 'playing'}  t=${String(s.t).padStart(5)}` +
    `  graded blits/2s ${String(s.n).padStart(3)}  running CSS animations ${String(s.anims).padStart(3)}`);
  return s;
};

console.log('');
const atHero = await sample('at the hero');
await p.evaluate(() => scrollTo(0, 4 * innerHeight));
const away = await sample('four screens away');
await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
const bottom = await sample('at the very bottom');
await p.evaluate(() => scrollTo(0, 0));
const back = await sample('back at the hero');

const ok = (c, s) => console.log(`  ${c ? 'PASS' : 'FAIL'}  ${s}`);
console.log('');
ok(atHero.n > 10, `film runs at the hero (${atHero.n} blits/2s)`);
/* <=1 rather than 0: a requestVideoFrameCallback already queued when the observer fires
   still lands once before the cancel takes effect. One trailing frame, then nothing. */
ok(away.n <= 1 && away.paused, `film stopped four screens away (${away.n} trailing blit)`);
ok(bottom.n === 0 && bottom.paused, 'film fully stopped at the bottom');
ok(back.n > 10 && !back.paused, `film resumes on return (${back.n} blits/2s)`);
ok(bottom.anims < atHero.anims, `fewer CSS animations running off screen (${atHero.anims} -> ${bottom.anims})`);
await b.close();
