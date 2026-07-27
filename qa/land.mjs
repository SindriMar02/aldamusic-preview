import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
for (const [w,h,label] of [[1440,900,'desktop 1440'],[1024,768,'small desktop 1024'],[390,844,'phone 390']]) {
  const p = await b.newPage();
  await p.setViewport({width:w,height:h,deviceScaleFactor:1});
  await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
  await p.evaluate(()=>document.fonts.ready);
  // sample the flown artwork against the header artwork the instant the flight settles
  const r = await p.evaluate(async ()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for (let i=0;i<160;i++){
      const lock=document.querySelector('[data-load-lock]');
      if (!lock) break;
      if (lock.style.transform) {           // flight has been applied
        await wait(820);                     // let the .82s transition finish
        const f=lock.querySelector('.al-lock')?.getBoundingClientRect();
        const t=document.querySelector('[data-hd-lock] .al-lock')?.getBoundingClientRect();
        if(!f||!t) break;
        return { left:+(f.left-t.left).toFixed(2), top:+(f.top-t.top).toFixed(2),
                 right:+(f.right-t.right).toFixed(2), bottom:+(f.bottom-t.bottom).toFixed(2),
                 flownW:Math.round(f.width), targetW:Math.round(t.width) };
      }
      await wait(40);
    }
    return null;
  });
  if (!r) { console.log(label.padEnd(20), 'could not sample the flight'); }
  else {
    const worst = Math.max(...['left','top','right','bottom'].map(k=>Math.abs(r[k])));
    console.log(label.padEnd(20), JSON.stringify(r), '| worst edge error:', worst.toFixed(2)+'px',
                worst < 1 ? '✓' : '✗');
  }
  await p.close();
}
await b.close();
