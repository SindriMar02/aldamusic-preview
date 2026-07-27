import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout: 45000, protocolTimeout: 45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900});
await p.goto('http://localhost:8811/', {waitUntil:'load', timeout: 30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,1800));
// pointer in the lower-left third, where the crest should rise
await p.mouse.move(420, 640);
await new Promise(r=>setTimeout(r,700));
await p.screenshot({path:'qa/hero-a.png', clip:{x:0,y:0,width:1440,height:900}});
await p.mouse.move(1080, 380);
await new Promise(r=>setTimeout(r,700));
await p.screenshot({path:'qa/hero-b.png', clip:{x:0,y:0,width:1440,height:900}});
console.log(JSON.stringify(await p.evaluate(()=>{
  const c=document.querySelector('[data-wave="hero"]');
  const g=c.getContext('2d'); const d=g.getImageData(0,0,c.width,c.height).data;
  let lit=0,tot=0; for(let i=3;i<d.length;i+=4*13){tot++; if(d[i]>10)lit++;}
  const v=document.querySelector('.al-hero-video');
  return { canvas:`${c.width}x${c.height}`, inkCoverage:+(lit/tot*100).toFixed(1),
    videoPlaying: v ? !v.paused : null, videoTime: v ? +v.currentTime.toFixed(2) : null,
    filmBrightness: getComputedStyle(v).filter };
}),null,1));
await b.close();
