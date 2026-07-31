/* WHY does a style recalc touch ~730 elements every pass?
   Two hypotheses already failed (custom properties, character transitions), so stop
   guessing and read the invalidation records. Blink emits, per invalidation:
     ScheduleStyleInvalidationTracking  - a change scheduled work on a node
     StyleInvalidatorInvalidationTracking - the invalidation set was applied
     StyleRecalcInvalidationTracking    - a node was actually marked for recalc
   each carrying `reason`, the node, and (for attribute/class changes) the name that did it.
   That names the culprit instead of inferring it. */
import puppeteer from 'puppeteer-core';

const AT = +(process.argv[2] || 2.8);
const CPU = +(process.argv[3] || 1);
const W = +(process.argv[4] || 390);

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 60000, protocolTimeout: 180000,
  userDataDir: '/private/tmp/claude-501/alda-qa-inval',
  args: ['--hide-scrollbars'],
});
const p = await b.newPage();
const mob = W < 900;
await p.setViewport({ width: W, height: mob ? 844 : 900, deviceScaleFactor: mob ? 3 : 2, isMobile: mob, hasTouch: mob });
const cdp = await p.target().createCDPSession();
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.goto('http://localhost:8811/', { waitUntil: 'load', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4200));
await p.evaluate((v) => scrollTo(0, v * innerHeight), AT);
await new Promise((r) => setTimeout(r, 800));

const events = [];
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
await cdp.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: {
    includedCategories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.invalidationTracking',
    ],
  },
});
await cdp.send('Input.synthesizeScrollGesture', {
  x: Math.round(W / 2), y: 500, xDistance: 0, yDistance: -1500, speed: 1400,
  gestureSourceType: mob ? 'touch' : 'mouse', repeatCount: 2, repeatDelayMs: 120,
});
await new Promise((r) => setTimeout(r, 500));
await new Promise((res) => { cdp.once('Tracing.tracingComplete', res); cdp.send('Tracing.end'); });

/* how big are the recalcs, and how many */
const trees = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
const counts = trees.map((e) => e.args?.elementCount || e.args?.beginData?.elementCount || 0);
const ms = trees.map((e) => e.dur / 1000);
const sum = (a) => a.reduce((x, y) => x + y, 0);
console.log(`\n  ${W}px · fling at ${AT}vh · ${CPU}x CPU`);
console.log(`  UpdateLayoutTree: ${trees.length} passes, ${sum(counts)} elements total,` +
  ` ${(sum(counts) / Math.max(1, trees.length)).toFixed(0)} avg/pass, ${sum(ms).toFixed(0)}ms total`);

/* what caused them */
const tally = (name, keyfn) => {
  const m = new Map();
  for (const e of events) {
    if (e.name !== name) continue;
    const d = e.args?.data || {};
    const k = keyfn(d);
    if (k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, z) => z[1] - a[1]);
};

const show = (title, rows, n = 14) => {
  if (!rows.length) return;
  console.log(`\n  ${title}`);
  const tot = rows.reduce((a, r) => a + r[1], 0);
  rows.slice(0, n).forEach(([k, v]) =>
    console.log(`    ${String(v).padStart(6)}  ${((v / tot) * 100).toFixed(1).padStart(5)}%  ${String(k).slice(0, 96)}`));
  console.log(`    ${String(tot).padStart(6)}  total`);
};

show('ScheduleStyleInvalidationTracking — what changed:',
  tally('ScheduleStyleInvalidationTracking', (d) =>
    `${d.reason || '?'}  ${d.nodeName || ''}  ${d.invalidatedSelectorId || ''} ${d.changedClass || d.changedAttribute || d.changedId || ''}`.trim()));

show('StyleRecalcInvalidationTracking — what got marked dirty:',
  tally('StyleRecalcInvalidationTracking', (d) => `${d.reason || '?'}  ${d.nodeName || ''}`.trim()));

show('StyleInvalidatorInvalidationTracking — which selectors fanned out:',
  tally('StyleInvalidatorInvalidationTracking', (d) => {
    const sel = (d.selectors || []).map((s) => s.selector || s).join(' , ');
    return `${d.reason || '?'}  ${d.nodeName || ''}  ${sel}`.trim();
  }));

/* raw reason histogram across every invalidation event, in case the names above are empty */
const reasons = new Map();
for (const e of events) {
  if (!/Invalidation/.test(e.name)) continue;
  const r = e.args?.data?.reason;
  if (!r) continue;
  reasons.set(r, (reasons.get(r) || 0) + 1);
}
show('every invalidation reason:', [...reasons.entries()].sort((a, z) => z[1] - a[1]), 20);

/* the reason alone does not say WHICH nodes, and the biggest bucket is the one my named
   tallies above do not cover — so pair every invalidation with its node */
const pairs = new Map();
for (const e of events) {
  if (!/Invalidation/.test(e.name)) continue;
  const d = e.args?.data || {};
  if (!d.reason) continue;
  const k = `${d.reason}   ${d.nodeName || '(no node)'}`;
  pairs.set(k, (pairs.get(k) || 0) + 1);
}
show('reason x node:', [...pairs.entries()].sort((a, z) => z[1] - a[1]), 24);

await b.close();
