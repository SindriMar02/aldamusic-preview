import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width:390, height:844, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument(()=>{const k=()=>{if(document.documentElement)document.documentElement.style.scrollBehavior='auto'};k();document.addEventListener('DOMContentLoaded',k)});
await p.goto('http://localhost:8811/',{waitUntil:'load',timeout:30000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,4800));
const R={};
R.layout = await p.evaluate(()=>({
  hOverflow: document.documentElement.scrollWidth - innerWidth,
  docH: document.documentElement.scrollHeight,
  vw: innerWidth, dpr: devicePixelRatio,
}));
// tap targets: everything interactive must clear 44px
R.taps = await p.evaluate(()=>{
  const bad=[];
  document.querySelectorAll('a,button,input,[tabindex]').forEach(el=>{
    const b=el.getBoundingClientRect();
    if(b.width<1&&b.height<1) return;
    if(getComputedStyle(el).display==='none') return;
    const w=Math.round(b.width), h=Math.round(b.height);
    if(h<44||w<24) bad.push({el:(el.className||el.tagName).toString().slice(0,26), txt:(el.textContent||'').trim().slice(0,18), w, h});
  });
  return { checked: document.querySelectorAll('a,button,input,[tabindex]').length, under44: bad.slice(0,14), count: bad.length };
});
// the heavy hero machinery must be off or cheap on a phone
R.hero = await p.evaluate(()=>{
  const lat=document.querySelector('[data-lattice]'), mc=document.querySelector('[data-markc]');
  const v=document.querySelector('.al-hero-video');
  return { latticeCanvas: lat?`${lat.width}x${lat.height}`:null, markCanvas: mc?`${mc.width}x${mc.height}`:null,
    videoPlaying: v?!v.paused:null, cursorEl: !!document.querySelector('.al-cur') };
});
// the burger must be reachable and work
R.menu = await p.evaluate(async ()=>{
  const bg=document.querySelector('[data-burger]'), m=document.querySelector('[data-menu]');
  const bb=bg.getBoundingClientRect();
  const hit=document.elementFromPoint(bb.left+bb.width/2, bb.top+bb.height/2);
  bg.click(); await new Promise(r=>setTimeout(r,700));
  const open={exp:bg.getAttribute('aria-expanded'), op:+getComputedStyle(m).opacity, ov:getComputedStyle(document.body).overflow};
  const linkH=Math.round(document.querySelector('.al-menu-l').getBoundingClientRect().height);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await new Promise(r=>setTimeout(r,700));
  return { burgerHit: hit?.closest('[data-burger]')?'burger':(hit?.className||hit?.tagName), tap:[Math.round(bb.width),Math.round(bb.height)], open, menuLinkH:linkH, closed:bg.getAttribute('aria-expanded') };
});
// the roll must still pin and select on a phone
R.roll = await p.evaluate(async ()=>{
  const sp=document.querySelector('[data-roll-spacer]');
  /* absolute document position, not offsetTop: offsetTop is relative to the offsetParent */
  const abs = sp.getBoundingClientRect().top + scrollY;
  window.scrollTo(0, abs + 1500); await new Promise(r=>setTimeout(r,1100));
  const vp=document.querySelector('.al-roll-vp').getBoundingClientRect();
  return { spacerAbs:Math.round(abs), spacerH:sp.offsetHeight, scrolledTo:Math.round(scrollY),
    vpTop:Math.round(vp.top), vpH:Math.round(vp.height),
    name:document.querySelector('[data-roll-name]')?.textContent, num:document.querySelector('[data-roll-num]')?.textContent };
});
// rails must be swipeable (touch) and still auto-slide
await p.evaluate(()=>window.scrollTo(0, document.querySelector('.al-shop').offsetTop - 100));
await new Promise(r=>setTimeout(r,900));
R.rail = await p.evaluate(async ()=>{
  const t=document.querySelector('[data-rail-track]');
  const x=()=>new DOMMatrix(getComputedStyle(t).transform).e;
  const a=x(); await new Promise(r=>setTimeout(r,2500));
  return { autoSlidPx: Math.round(x()-a) };
});
R.errors = errs;
console.log(JSON.stringify(R,null,1));
await b.close();
