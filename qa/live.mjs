import puppeteer from 'puppeteer-core';
const URL_ = 'https://sindrimar02.github.io/aldamusic-preview/';
const b = await puppeteer.launch({ timeout:60000, protocolTimeout:120000, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars','--disable-gpu-vsync','--disable-frame-rate-limit'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:1});
const errs=[], failed=[];
p.on('pageerror',e=>errs.push(e.message));
p.on('requestfailed', r=>failed.push(r.url().split('/').pop()));
p.on('response', r=>{ if(r.status()>=400) failed.push(r.status()+' '+r.url().split('/').pop()); });
await p.goto(URL_,{waitUntil:'load',timeout:60000});
await p.evaluate(()=>document.fonts.ready);
await new Promise(r=>setTimeout(r,5200));            // past loader + intro
await p.screenshot({path:'qa/LIVE-landing.jpg', type:'jpeg', quality:92});
console.log(JSON.stringify(await p.evaluate(()=>{
  const mc=document.querySelector('[data-markc]'), lat=document.querySelector('[data-lattice]');
  const inked=(c)=>{const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4*29)if(d[i]>10)n++;return n;};
  const v=document.querySelector('.al-hero-video');
  return {
    title: document.title,
    loaderGone: !document.querySelector('[data-load]'),
    headerOpacity: +getComputedStyle(document.querySelector('[data-hd]')).opacity,
    headerLogoOpacity: +getComputedStyle(document.querySelector('[data-hd-lock]')).opacity,
    wordmarkInked: inked(mc), latticeInked: inked(lat),
    filmPlaying: v ? !v.paused : null, filmTime: v ? +v.currentTime.toFixed(1) : null,
    heroChrome: +getComputedStyle(document.querySelector('.al-tk')).opacity,
    h1: document.querySelector('h1')?.textContent,
    robots: document.querySelector('meta[name=robots]')?.content,
    docH: document.documentElement.scrollHeight,
  };
},null,1)));
console.log('failed requests:', failed.length?failed:'NONE');
console.log('page errors:', errs.length?errs:'NONE');
await b.close();
