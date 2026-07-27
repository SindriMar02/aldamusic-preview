import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:45000, protocolTimeout:45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
// capture the dissolve in flight
for (const t of [220, 620, 1050, 1500, 2100, 3400]) {
  const now = Date.now();
  await new Promise(r=>setTimeout(r, Math.max(0, t - (Date.now()-now))));
  await p.screenshot({path:`qa/load-${t}.jpg`, type:'jpeg', quality:80});
}
await new Promise(r=>setTimeout(r,1600));
console.log(JSON.stringify(await p.evaluate(()=>{
  const load=document.querySelector('[data-load]');
  const hd=document.querySelector('[data-hd-lock] .al-lock');
  const hdb=hd?.getBoundingClientRect();
  return { loaderRemoved: !load, bodyOverflow: getComputedStyle(document.body).overflow,
    headerLockW: hdb?Math.round(hdb.width):null, headerLockVisible: hd?+getComputedStyle(hd.closest('a')).opacity:null,
    heroChromeShown: +getComputedStyle(document.querySelector('.al-tk')).opacity,
    introClass: document.body.className };
}),null,1));
console.log('errors', errs.length?errs:'NONE');
await b.close();
