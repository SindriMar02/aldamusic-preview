import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:45000, protocolTimeout:45000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900});
await p.evaluateOnNewDocument(()=>{const k=()=>{if(document.documentElement)document.documentElement.style.scrollBehavior='auto'};k();document.addEventListener('DOMContentLoaded',k)});
await p.goto('http://localhost:8811/', {waitUntil:'load', timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,2900));  // let the intro finish

// ---- 1. the split: real measured rows, clean accessible names, no mangled text
console.log('SPLIT', JSON.stringify(await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('[data-split]').forEach(el=>{
    const rows=[...el.querySelectorAll('.al-row')];
    out.push({ sel:(el.className||'').split(' ')[0],
      rows: rows.length,
      chars: el.querySelectorAll('.al-ch').length,
      rowTops: [...new Set(rows.map(r=>Math.round(r.getBoundingClientRect().top)))].length,
      accName: el.textContent.replace(/\s+/g,' ').trim().slice(0,44),
      orig: el.dataset.splitText.slice(0,44) });
  });
  return out;
},null,1)));

// ---- 2. the entrance actually staggers (sample two chars mid-flight)
await p.evaluate(()=>window.scrollTo(0,0));
await new Promise(r=>setTimeout(r,400));
const stagger = await p.evaluate(async ()=>{
  const el=document.querySelector('.al-hist-head .al-h2');
  el.classList.remove('is-in');
  el.querySelectorAll('.al-ch').forEach(c=>{c.style.transition='none';c.style.transform='translateY(102%)';c.style.opacity='0'});
  await new Promise(r=>setTimeout(r,60));
  el.querySelectorAll('.al-ch').forEach(c=>{c.style.transition='';c.style.transform='';c.style.opacity=''});
  el.classList.add('is-in');
  await new Promise(r=>setTimeout(r,220));
  const cs=[...el.querySelectorAll('.al-ch')];
  const read=(c)=>+getComputedStyle(c).opacity.slice(0,5);
  return { first:read(cs[0]), last:read(cs[cs.length-1]), n:cs.length };
});
console.log('STAGGER', JSON.stringify(stagger));

// ---- 3. per-line rails fill in order, and are reversible
const rails = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const sec=document.querySelector('.al-hist');
  const read=()=>[...document.querySelectorAll('.al-hist-head .al-row-rail > i')]
    .map(i=>+(new DOMMatrix(getComputedStyle(i).transform).a).toFixed(3));
  const y=sec.offsetTop;
  window.scrollTo(0,y-innerHeight*0.85); await wait(900); const a=read();
  window.scrollTo(0,y-innerHeight*0.35); await wait(900); const bb=read();
  window.scrollTo(0,y-innerHeight*0.85); await wait(900); const c=read();
  return {early:a, later:bb, back:c};
});
console.log('RAILS', JSON.stringify(rails));

// ---- 4. the odometer steps (quantised), and the disc rotation + rail travel scrub
const scrub = await p.evaluate(async ()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const hist=document.querySelector('.al-hist'), shop=document.querySelector('.al-shop');
  const odoY=()=>new DOMMatrix(getComputedStyle(document.querySelector('[data-odo-strip]')).transform).f;
  const odoOn=()=>document.querySelector('[data-odo-item][data-on="1"]')?.textContent;
  const spin=()=>getComputedStyle(shop).getPropertyValue('--al-spin').trim();
  const railX=()=>new DOMMatrix(getComputedStyle(document.querySelector('[data-rail-track]')).transform).e;
  const samples=[];
  for (const f of [0, .3, .55, .8, 1]) {
    window.scrollTo(0, hist.offsetTop - innerHeight + (hist.offsetHeight+innerHeight)*f);
    await wait(750);
    samples.push({ f, odoY:Math.round(odoY()), year:odoOn() });
  }
  const shopS=[];
  for (const f of [.2,.5,.8]) {
    window.scrollTo(0, shop.offsetTop - innerHeight + (shop.offsetHeight+innerHeight)*f);
    await wait(750);
    shopS.push({ f, spin:spin(), railX:Math.round(railX()) });
  }
  return {odo:samples, shop:shopS};
});
console.log('SCRUB', JSON.stringify(scrub,null,1));
await b.close();
