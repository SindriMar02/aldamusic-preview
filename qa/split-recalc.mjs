/* Partition the ~800-element style recalc pass.
   Each arm disables exactly one suspect and reports UpdateLayoutTree.elementCount. These are
   DIAGNOSTIC arms — several of them break the page on purpose — the point is to find which
   input owns the recalc, not to ship any of them. Interleaved, median of REPS, because only
   counts survive a loaded machine (absolute ms do not). */
import puppeteer from 'puppeteer-core';

const REPS = +(process.argv[2] || 3);
const W = +(process.argv[3] || 390);

/* `block` = custom-property names whose setProperty is swallowed; `css` = injected override */
const ARMS = {
  current: {},
  no_root_props: { block: ['--al-p', '--al-vel', '--al-rule'] },
  no_section_props: { block: ['--al-exit', '--al-enter', '--rv', '--al-cardp', '--al-spin'] },
  no_all_props: { block: ['--al-p', '--al-vel', '--al-rule', '--al-exit', '--al-enter', '--rv', '--al-cardp', '--al-spin', '--al-hx', '--al-tl-fill'] },
  no_transitions: { css: '*, *::before, *::after { transition: none !important; }' },
  no_animations: { css: '*, *::before, *::after { animation: none !important; }' },
  no_motion_at_all: { css: '*, *::before, *::after { transition: none !important; animation: none !important; }' },
};

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 240000,
  userDataDir: '/private/tmp/claude-501/alda-qa-split',
  args: ['--hide-scrollbars'],
});
const mob = W < 900;

async function run(arm) {
  const p = await b.newPage();
  await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: mob ? 3 : 2, isMobile: mob, hasTouch: mob });
  if (arm.block) {
    await p.evaluateOnNewDocument((names) => {
      const set = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function (k, v, pr) {
        if (names.includes(k)) return;
        return set.call(this, k, v, pr);
      };
    }, arm.block);
  }
  const cdp = await p.target().createCDPSession();
  await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
  if (arm.css) await p.addStyleTag({ content: arm.css });
  await new Promise((r) => setTimeout(r, 4200));
  await p.evaluate(() => scrollTo(0, 2.8 * innerHeight));
  await new Promise((r) => setTimeout(r, 800));
  const nodes = await p.evaluate(() => document.querySelectorAll('*').length);

  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
  });
  await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(W / 2), y: 500, xDistance: 0, yDistance: -1500, speed: 1400,
    gestureSourceType: mob ? 'touch' : 'mouse', repeatCount: 2, repeatDelayMs: 120,
  });
  await new Promise((r) => setTimeout(r, 400));
  await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

  const trees = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  const el = trees.reduce((a, e) => a + (e.args?.elementCount || 0), 0);
  await p.close();
  return { nodes, passes: trees.length, el, perPass: el / Math.max(1, trees.length) };
}

const names = Object.keys(ARMS);
const acc = Object.fromEntries(names.map((n) => [n, []]));
for (let r = 0; r < REPS; r++) {
  for (const n of names) acc[n].push(await run(ARMS[n]));
  process.stdout.write(`  rep ${r + 1}/${REPS}\n`);
}
const med = (xs) => xs.slice().sort((a, z) => a - z)[Math.floor(xs.length / 2)];
const base = med(acc.current.map((x) => x.perPass));

console.log(`\n  ${W}px · page has ${acc.current[0].nodes} elements · median of ${REPS}\n`);
console.log('  arm                  elements/pass    passes   total elements   vs current');
for (const n of names) {
  const s = acc[n];
  const pp = med(s.map((x) => x.perPass));
  console.log(
    `  ${n.padEnd(20)}${pp.toFixed(0).padStart(13)}${med(s.map((x) => x.passes)).toFixed(0).padStart(10)}` +
    `${med(s.map((x) => x.el)).toFixed(0).padStart(17)}` +
    `${(((pp - base) / base) * 100).toFixed(0).padStart(10)}%`
  );
}
await b.close();
