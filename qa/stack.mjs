import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:45000, protocolTimeout:45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.evaluateOnNewDocument(()=>{const k=()=>{if(document.documentElement)document.documentElement.style.scrollBehavior='auto'};k();document.addEventListener('DOMContentLoaded',k)});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,2400));

// Does the roll's sticky viewport still PIN while its ancestor is transformed?
const pin = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const sp=document.querySelector('[data-roll-spacer]');
  const vp=document.querySelector('.al-roll-vp');
  const out=[];
  const base=sp.offsetTop;
  for (const d of [0, 500, 1400, 2400]) {
    window.scrollTo(0, base + d); await wait(700);
    out.push({ d, vpTop: Math.round(vp.getBoundingClientRect().top),
      vpH: Math.round(vp.getBoundingClientRect().height),
      name: document.querySelector('[data-roll-name]')?.textContent });
  }
  return out;
});
console.log('ROLL PIN', JSON.stringify(pin));

// the stack values must actually change and be reversible
const stack = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const read=()=>[...document.querySelectorAll('.al-shop,.al-hist,.al-cta')].map(e=>({
    s:e.className.split(' ')[0],
    exit:+getComputedStyle(e).getPropertyValue('--al-exit'),
    enter:+getComputedStyle(e).getPropertyValue('--al-enter'),
    m:getComputedStyle(e).transform.slice(0,30) }));
  const hist=document.querySelector('.al-hist');
  window.scrollTo(0, hist.offsetTop - 600); await wait(800); const a=read();
  window.scrollTo(0, hist.offsetTop + 900); await wait(800); const bb=read();
  window.scrollTo(0, hist.offsetTop - 600); await wait(800); const c=read();
  return {a, b:bb, back:c};
});
console.log('STACK', JSON.stringify(stack,null,1));
await b.close();
