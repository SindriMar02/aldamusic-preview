import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:45000, protocolTimeout:45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,2300));
const S = '.al-shop,.al-hist,.al-parent,.al-cta,.al-ft';
async function sweep(label, css){
  await p.evaluate((c)=>{ let el=document.getElementById('ab'); if(!el){el=document.createElement('style');el.id='ab';document.head.appendChild(el);} el.textContent=c; }, css||'');
  const r = await p.evaluate(async ()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    let f=0,long=0,run=true;
    const po=new PerformanceObserver(l=>{long+=l.getEntries().length}); po.observe({entryTypes:['longtask']});
    const tick=()=>{f++; if(run)requestAnimationFrame(tick)}; requestAnimationFrame(tick);
    const t0=performance.now();
    const top=document.querySelector('[data-roll-spacer]').offsetTop;
    for(let i=0;i<40;i++){ window.scrollTo(0, top+i*60); await wait(50); }
    run=false; po.disconnect();
    return { fps:+(f/((performance.now()-t0)/1000)).toFixed(1), long };
  });
  console.log(label.padEnd(40), JSON.stringify(r));
}
await sweep('baseline (full stack)');
await sweep('archive backdrop blur off', '.al-plate[data-archive]::before{filter:none!important}');
await sweep('archive plates hidden', '.al-plate[data-archive]{display:none!important}');
await sweep('roll bg blur off', '[data-roll-bg]{filter:none!important}');
await sweep('stack off entirely', `${S}{transform:none!important;border-radius:0!important;overflow:visible!important}.al-shop::after,.al-hist::after,.al-parent::after,.al-cta::after{display:none!important}`);
await b.close();
