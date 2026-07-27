import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
// sample the header's opacity continuously through the loader -> hero handoff
const trace = await p.evaluate(async ()=>{
  const hd=document.querySelector('[data-hd]');
  const logo=document.querySelector('[data-hd-lock]');
  const out=[];
  const t0=performance.now();
  for(let i=0;i<44;i++){
    out.push({ ms:Math.round(performance.now()-t0),
      header:+getComputedStyle(hd).opacity,
      logo:+getComputedStyle(logo).opacity,
      loader: document.querySelector('[data-load]') ? +getComputedStyle(document.querySelector('[data-load]')).opacity : null });
    await new Promise(r=>setTimeout(r,120));
  }
  return out;
});
// the header must never fall back toward 0 once it has come up
let peak=0, dip=null;
for (const s of trace) { if (s.header>peak) peak=s.header; if (peak>0.85 && s.header<0.6 && !dip) dip=s; }
console.log('header opacity over the handoff:');
console.log(trace.filter((_,i)=>i%3===0).map(s=>`${s.ms}ms hd=${s.header.toFixed(2)} logo=${s.logo.toFixed(2)} load=${s.loader===null?'gone':s.loader.toFixed(2)}`).join('\n'));
console.log(dip ? `FAIL: header dipped back to ${dip.header} at ${dip.ms}ms after reaching ${peak}` : 'PASS: header never fades back once up');
await b.close();
