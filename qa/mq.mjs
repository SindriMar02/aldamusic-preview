import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-mq', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900});
await p.goto('http://localhost:8811/', {waitUntil:'load'});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,900));
console.log(await p.evaluate(()=>{
  const bands=[...document.querySelectorAll('.al-mq')];
  return JSON.stringify(bands.map(m=>{
    const tr=[...m.querySelectorAll('.al-mq-track')];
    return { tracks: tr.length, cells: m.querySelectorAll('.al-mq-i').length,
      bandH: Math.round(m.getBoundingClientRect().height),
      trackW: Math.round(tr[0].scrollWidth), half: Math.round(tr[0].scrollWidth/2),
      rows: new Set([...m.querySelectorAll('.al-mq-t')].map(t=>Math.round(t.getBoundingClientRect().top))).size };
  }),null,1);
}));
// travel + no gap over a full loop
const el = await p.$('.al-mq');
await el.evaluate(e=>e.scrollIntoView({block:'center'}));
await new Promise(r=>setTimeout(r,600));
const shots=[];
for (let i=0;i<3;i++){ await new Promise(r=>setTimeout(r,900)); shots.push(await p.evaluate(()=>{
  const t=document.querySelector('.al-mq-track'); const m=t.closest('.al-mq');
  const tb=t.getBoundingClientRect(), mb=m.getBoundingClientRect();
  return { left: Math.round(tb.left-mb.left), coversRight: Math.round(tb.right-mb.right) };
}));}
console.log('samples', JSON.stringify(shots));
await p.screenshot({path:'qa/mq-band.png', clip: await p.evaluate(()=>{const b=document.querySelector('.al-mq').getBoundingClientRect(); return {x:0,y:Math.max(0,b.top-10),width:1440,height:Math.min(b.height+20,300)};})});
await b.close();
