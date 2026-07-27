import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:45000, protocolTimeout:45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.evaluateOnNewDocument(()=>{const k=()=>{if(document.documentElement)document.documentElement.style.scrollBehavior='auto'};k();document.addEventListener('DOMContentLoaded',k)});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,2300));
// each rail must travel with NO scrolling at all, and the odometer must follow the timeline
for (const [name, sel, sec] of [['release rail','[data-rail-track]','.al-shop'], ['timeline','[data-tl-track]','.al-hist']]) {
  await p.evaluate((s)=>document.querySelector(s).scrollIntoView({block:'center'}), sec);
  await new Promise(r=>setTimeout(r,900));
  const r = await p.evaluate(async (s)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const t=document.querySelector(s);
    const x=()=>new DOMMatrix(getComputedStyle(t).transform).e;
    const odo=()=>document.querySelector('[data-odo-item][data-on="1"]')?.textContent;
    const a=x(), ya=scrollY, oa=odo();
    await wait(9000);
    return { start:Math.round(a), end:Math.round(x()), scrollMoved: scrollY-ya, odoStart:oa, odoEnd:odo() };
  }, sel);
  console.log(name.padEnd(14), 'travelled', Math.round(r.end - r.start), 'px in 9s with scroll delta', r.scrollMoved, '| odometer', r.odoStart, '->', r.odoEnd);
}
await b.close();
