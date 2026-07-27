import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,4600));
// park the pointer far away and let any ambient ripple die, so only STRUCTURE remains
await p.mouse.move(5, 5);
await new Promise(r=>setTimeout(r,1500));
const r = await p.evaluate(()=>{
  const c=document.querySelector('[data-lattice]'); const g=c.getContext('2d');
  const d=g.getImageData(0,0,c.width,c.height).data; const W=c.width,H=c.height;
  const rows=[]; for(let y=0;y<H;y++){let s=0;for(let x=0;x<W;x+=4)s+=d[(y*W+x)*4+3];rows.push(s/(W/4));}
  // smooth over the 8px line pitch so the per-line ink pattern is not read as a seam
  const sm=[]; for(let y=0;y<H;y++){let s=0,n=0;for(let k=-4;k<=4;k++){const i=y+k;if(i>=0&&i<H){s+=rows[i];n++;}}sm.push(s/n);}
  let worst=0, at=0;
  for(let y=9;y<H-9;y++){const dv=Math.abs(sm[y]-sm[y-1]); if(dv>worst){worst=dv;at=y;}}
  const mean=sm.reduce((a,b)=>a+b,0)/H;
  return { maxSmoothedRowJump:+worst.toFixed(3), atY:at, meanAlpha:+mean.toFixed(2), ratio:+(worst/Math.max(mean,.01)).toFixed(3) };
});
console.log('STRUCTURAL SEAM (no pointer):', JSON.stringify(r));
await p.screenshot({path:'qa/lattice-calm.jpg', type:'jpeg', quality:88});
await b.close();
