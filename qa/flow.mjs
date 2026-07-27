import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.evaluateOnNewDocument(()=>{ document.addEventListener('DOMContentLoaded',()=>document.documentElement.setAttribute('data-qa','1')); });
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,4600));
const r = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const c=document.querySelector('[data-lattice]');
  const a=+c.dataset.travel; const t0=performance.now();
  await wait(3000);
  const el=(performance.now()-t0)/1000;
  return { travelled:+(c.dataset.travel-a).toFixed(1), seconds:+el.toFixed(2), pxPerSec:+(((c.dataset.travel-a))/el).toFixed(2) };
});
console.log('CONVEYOR (measured):', JSON.stringify(r));
await b.close();
