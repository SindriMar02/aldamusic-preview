import puppeteer from 'puppeteer-core';
for (const extra of [[], ['--disable-gpu-vsync','--disable-frame-rate-limit']]) {
  const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile'+(extra.length?'2':''), args:['--hide-scrollbars',...extra] });
  const p = await b.newPage();
  await p.goto('data:text/html,<body style="height:9000px">x</body>');
  const r = await p.evaluate(async () => {
    let f=0, run=true; const tick=()=>{f++; if(run) requestAnimationFrame(tick)}; requestAnimationFrame(tick);
    const t0=performance.now(); await new Promise(r=>setTimeout(r,2000)); run=false;
    return +(f/((performance.now()-t0)/1000)).toFixed(1);
  });
  console.log('flags', JSON.stringify(extra), 'raw rAF fps on a blank page =', r);
  await b.close();
}
