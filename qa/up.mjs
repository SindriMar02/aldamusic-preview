import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:45000, protocolTimeout:45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,2600));
console.log(JSON.stringify(await p.evaluate(()=>{
  return [...document.querySelectorAll('.al-plate img, .al-rel-img')].map(i=>{
    const b=i.getBoundingClientRect();
    return { f:(i.currentSrc||i.src).split('/').pop(), cssW:Math.round(b.width), natW:i.naturalWidth,
      ratio:+(b.width/(i.naturalWidth||1)).toFixed(2), cls:i.className };
  }).filter(x=>x.cssW>0 && x.natW>0).sort((a,b)=>b.ratio-a.ratio).slice(0,6);
}),null,1));
await b.close();
