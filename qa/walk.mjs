/* Viewport-by-viewport visual walk.
 *
 * This page is built on SCRUBBED reveals, so a full-page screenshot is worthless: return
 * to the top and every reveal correctly drives back to 0, which looks exactly like four
 * broken sections. The authoritative visual review eases to each depth in several hops so
 * the damped channels track a real read, settles, then captures.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.URL || 'http://localhost:8811/';
const W = Number(process.env.W) || 1440;
const H = Number(process.env.H) || 900;
const RM = process.env.RM === '1';
const OUT = join(here, process.env.OUT || 'walk');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  /* never touch the user's own profile, and never kill their browser */
  userDataDir: '/private/tmp/claude-501/alda-qa-profile',
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
if (RM) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

/* window.scrollTo ANIMATES when a page sets smooth scrolling, so every probe would sample
   a mid-flight position. Kill it in the harness, not in the page. */
await page.evaluateOnNewDocument(() => {
  const kill = () => { if (document.documentElement) document.documentElement.style.scrollBehavior = 'auto'; };
  kill();
  document.addEventListener('DOMContentLoaded', kill);
});

await page.goto(URL_, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 900));

const total = await page.evaluate(() => document.documentElement.scrollHeight);
const steps = Math.ceil(total / (H * 0.92));
console.log(`page ${total}px · ${steps} frames · ${W}x${H}${RM ? ' · reduced-motion' : ''}`);

let prev = 0;
for (let i = 0; i < steps; i++) {
  const y = Math.min(Math.round(i * H * 0.92), total - H);
  /* ease there in hops: one instant jump would show the damped channels mid-convergence */
  const hops = 6;
  for (let h = 1; h <= hops; h++) {
    const yy = Math.round(prev + ((y - prev) * h) / hops);
    await page.evaluate((v) => window.scrollTo(0, v), yy);
    await new Promise((r) => setTimeout(r, 70));
  }
  prev = y;
  await new Promise((r) => setTimeout(r, 700)); /* >= 6 tau */
  const f = join(OUT, `${String(i).padStart(2, '0')}-y${y}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 });
  process.stdout.write(`  ${i} @${y}\n`);
}

await writeFile(join(OUT, 'meta.json'), JSON.stringify({ URL_, W, H, RM, total, steps }, null, 1));
await browser.close();
console.log(`wrote ${steps} frames to ${OUT}`);
