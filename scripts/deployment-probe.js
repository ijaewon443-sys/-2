const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const image = require('./probe-image.json');
const out = path.join(dir, 'attempts.jsonl');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath: process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    while (!fs.existsSync(path.join(dir,'stop'))) {
      const phase = fs.readFileSync(path.join(dir,'phase'),'utf8').trim();
      const start = Date.now();
      const row = {phase, start: new Date(start).toISOString(), startMs:start};
      const page = await browser.newPage();
      page.setDefaultTimeout(25000);
      try {
        await page.goto('http://127.0.0.1:8080/?probe='+start, {waitUntil:'load',timeout:25000});
        await page.waitForFunction(() => typeof model !== 'undefined' && model !== null, null, {timeout:25000});
        row.version = await page.evaluate(async () => { try { const r=await fetch('/version.json?probe='+Date.now(),{cache:'no-store'}); return r.ok ? (await r.json()).version : 'legacy'; } catch { return 'unavailable'; } });
        const predicted = await page.evaluate(async image => {
          const source=document.createElement('canvas');source.width=source.height=28;
          const c=source.getContext('2d');const data=c.createImageData(28,28);
          image.pixels.forEach((v,i)=>{data.data[i*4]=data.data[i*4+1]=data.data[i*4+2]=v;data.data[i*4+3]=255;});c.putImageData(data,0,0);
          ctx.fillStyle='#000';ctx.fillRect(0,0,280,280);ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,280,280);ctx.imageSmoothingEnabled=true;
          const input=normalizedTensor(); const output=model.predict(input);const list=Array.isArray(output)?output:[output];const vals=Array.from(await list[0].data());input.dispose();list.forEach(t=>t.dispose());
          return vals.indexOf(Math.max(...vals));
        }, image);
        row.predicted=predicted; row.expected=image.label; row.ok=predicted===image.label;
        if (!row.ok) row.error='incorrect prediction';
      } catch (e) {row.ok=false;row.error=String(e.message).split('\n')[0];}
      row.endMs=Date.now();row.end=new Date(row.endMs).toISOString();
      fs.appendFileSync(out,JSON.stringify(row)+'\n');
      await page.close();
      await new Promise(r=>setTimeout(r,300));
    }
  } finally {await browser.close();}
})().catch(e=>{fs.writeFileSync(path.join(dir,'probe-error'),String(e.stack || e)); process.exitCode=1;});
