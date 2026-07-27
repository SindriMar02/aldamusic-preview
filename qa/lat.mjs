import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,4200));           // past loader + intro
// the lattice must be drawing, and must duck under the wordmark band
const ink = await p.evaluate(()=>{
  const c=document.querySelector('[data-lattice]');
  const g=c.getContext('2d');
  const d=g.getImageData(0,0,c.width,c.height).data;
  /* find the band by scanning the WORDMARK canvas for rows that actually carry glyph ink,
     rather than trusting an element box (the mark canvas is inset:0 = the whole frame) */
  const mc=document.querySelector('[data-markc]');
  const mg=mc.getContext('2d').getImageData(0,0,mc.width,mc.height).data;
  let b0=mc.height, b1=0;
  for(let y=0;y<mc.height;y+=2){ for(let x=0;x<mc.width;x+=8){
    if(mg[(y*mc.width+x)*4+3]>24){ if(y<b0)b0=y; if(y>b1)b1=y; break; } } }
  let lit=0, tot=0, inBand=0, bandTot=0;
  const H=c.height, W=c.width, dpr=devicePixelRatio;
  for(let y=0;y<H;y+=4){ for(let x=0;x<W;x+=6){
    const a=d[(y*W+x)*4+3]; const band=(y>=b0&&y<=b1);
    if(band){bandTot++; if(a>6)inBand++;} else {tot++; if(a>6)lit++;}
  }}
  return { glyphBand:[Math.round(b0),Math.round(b1)], canvas:`${W}x${H}`, outsideBand:+(lit/tot*100).toFixed(2), insideBand:+(inBand/bandTot*100).toFixed(2) };
});
console.log('LATTICE', JSON.stringify(ink));
// A pointer peak must DISPLACE the wires where the cursor is. Total ink in a box cannot
// test this: lifting a wire carries ink out of the box as readily as into it, which is why
// the first version of this check reported "far brighter than near" on a working field.
// So: record the ink profile of a column, put the cursor on it, and compare.
const profile = (x) => `(() => { const c=document.querySelector('[data-lattice]');
  const g=c.getContext('2d'); const dpr=devicePixelRatio;
  const d=g.getImageData(Math.round(${x}*dpr), Math.round(560*dpr), 2, Math.round(300*dpr)).data;
  const out=[]; for(let i=3;i<d.length;i+=4*2) out.push(d[i]>20?1:0); return out.join(''); })()`;
await p.mouse.move(1300, 300);
await new Promise(r=>setTimeout(r,900));
const beforeNear = await p.evaluate(profile(400));
const beforeFar  = await p.evaluate(profile(1000));
await p.mouse.move(400, 700);
await new Promise(r=>setTimeout(r,600));
const afterNear = await p.evaluate(profile(400));
const afterFar  = await p.evaluate(profile(1000));
const diff = (a,b) => { let d=0; for(let i=0;i<Math.min(a.length,b.length);i++) if(a[i]!==b[i]) d++; return d; };
const dn = diff(beforeNear, afterNear), df = diff(beforeFar, afterFar);
console.log('PEAK displacement — under cursor:', dn, 'px changed | 600px away:', df,
            '| responds where pointed:', dn > df);


// A hard horizontal edge shows up as a large jump in mean alpha between adjacent scanlines.
const seam = await p.evaluate(()=>{
  const c=document.querySelector('[data-lattice]'); const g=c.getContext('2d');
  const d=g.getImageData(0,0,c.width,c.height).data;
  const W=c.width, H=c.height;
  const rows=[];
  for(let y=0;y<H;y++){ let s=0; for(let x=0;x<W;x+=4) s+=d[(y*W+x)*4+3]; rows.push(s/(W/4)); }
  let worst=0, at=0;
  for(let y=1;y<H;y++){ const dv=Math.abs(rows[y]-rows[y-1]); if(dv>worst){worst=dv; at=y;} }
  const mean=rows.reduce((a,b)=>a+b,0)/H;
  return { maxRowJump:+worst.toFixed(2), atY:at, meanAlpha:+mean.toFixed(2),
           jumpVsMean:+(worst/Math.max(mean,0.01)).toFixed(2) };
});
console.log('SEAM', JSON.stringify(seam));
await p.screenshot({path:'qa/lattice.jpg', type:'jpeg', quality:86});
// fps with the lattice live
const perf = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let f=0,long=0,run=true;
  const po=new PerformanceObserver(l=>{long+=l.getEntries().length}); po.observe({entryTypes:['longtask']});
  const tick=()=>{f++; if(run)requestAnimationFrame(tick)}; requestAnimationFrame(tick);
  const t0=performance.now(); await wait(2500); run=false; po.disconnect();
  return { fps:+(f/((performance.now()-t0)/1000)).toFixed(1), long };
});
console.log('HERO PERF', JSON.stringify(perf), '| errors', errs.length?errs:'NONE');
await b.close();
