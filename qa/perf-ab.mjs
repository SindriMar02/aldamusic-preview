import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900});
await p.goto('http://localhost:8811/', {waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,700));
async function sweep(label, prep){
  await p.evaluate(prep||(()=>{}));
  const r = await p.evaluate(async () => {
    const wait = ms => new Promise(r=>setTimeout(r,ms));
    let frames=0, long=0, run=true;
    const po=new PerformanceObserver(l=>{long+=l.getEntries().length}); po.observe({entryTypes:['longtask']});
    const tick=()=>{frames++; if(run) requestAnimationFrame(tick)}; requestAnimationFrame(tick);
    const t0=performance.now();
    const top=document.querySelector('[data-roll-spacer]').offsetTop;
    for(let i=0;i<40;i++){ window.scrollTo(0, top+i*60); await wait(50); }
    run=false; po.disconnect();
    return { fps:+(frames/((performance.now()-t0)/1000)).toFixed(1), long };
  });
  console.log(label.padEnd(34), JSON.stringify(r));
}
await sweep('baseline');
await sweep('no backdrop', ()=>{ document.querySelector('[data-roll-bg]').style.display='none'; });
await sweep('no backdrop + no plates', ()=>{ document.querySelectorAll('.al-plate').forEach(e=>e.style.display='none'); });
await sweep('+ no roll canvas', ()=>{ document.querySelector('[data-wave="roll"]').style.display='none'; });
await sweep('+ no grain', ()=>{ document.querySelector('.al-grain').style.display='none'; });
await b.close();
