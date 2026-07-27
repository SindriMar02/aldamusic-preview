import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, userDataDir:'/private/tmp/claude-501/alda-qa-profile', args:['--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({width:1440,height:900});
const seen = new Map();
p.on('response', async (r) => {
  try { const l = r.headers()['content-length']; seen.set(r.url(), { t: r.request().resourceType(), n: l ? +l : (await r.buffer().catch(()=>({length:0}))).length }); } catch {}
});
await p.goto('http://localhost:8811/', { waitUntil:'load' });
await new Promise(r=>setTimeout(r,1200));
const first = [...seen.values()];
const sum = (rs) => rs.reduce((a,x)=>a+(x.n||0),0);
const byType = {};
for (const r of first) byType[r.t] = (byType[r.t]||0) + (r.n||0);
console.log('FIRST VIEW:', (sum(first)/1e6).toFixed(2), 'MB across', first.length, 'requests');
console.log(Object.entries(byType).map(([k,v])=>`  ${k}: ${(v/1024).toFixed(0)}KB`).join('\n'));
// then scroll the whole roll
await p.evaluate(async () => { const h=document.documentElement.scrollHeight; for(let y=0;y<h;y+=400){window.scrollTo(0,y); await new Promise(r=>setTimeout(r,60));} });
await new Promise(r=>setTimeout(r,2500));
const all = [...seen.values()];
console.log('AFTER FULL SCROLL:', (sum(all)/1e6).toFixed(2), 'MB across', all.length, 'requests');
await b.close();
