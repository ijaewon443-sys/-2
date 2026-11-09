const fs=require('fs'),path=require('path');
const dir=process.argv[2];
let rows=[];try {rows=fs.readFileSync(path.join(dir,'attempts.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);} catch {}
const phases=['before','during','after'];
const esc=x=>String(x).replace(/[|\r\n]/g,' ');
let md='## Digit Lens deployment: browser inference\n\n';
md+='Fixed MNIST test image #30; expected digit '+require('./probe-image.json').label+'. Each attempt reloads the app at 127.0.0.1:8080 and runs its browser model.\n\n';
md+='| Phase | Success / attempts | Failures | Observed versions |\n|---|---:|---:|---|\n';
for(const phase of phases){const a=rows.filter(r=>r.phase===phase),ok=a.filter(r=>r.ok).length; const versions=[...new Set(a.filter(r=>r.version).map(r=>r.version==='legacy' ? process.env.OLD_IMAGE+' (legacy)' : r.version))];md+=`| ${phase} | ${ok} / ${a.length} | ${a.length-ok} | ${esc(versions.join(', ')||'none')} |\n`;}
let max=0;for(let i=1;i<rows.length;i++) max=Math.max(max, rows[i].startMs-rows[i-1].startMs);
md+=`\nPrevious image: **${esc(process.env.OLD_IMAGE || 'unknown')}**  \nNew image: **${esc(process.env.NEW_IMAGE || 'unknown')}**  \nMaximum interval between attempt starts: **${(max/1000).toFixed(2)} s** (${rows.length} attempts). This is the measurement interval, not a bound on outage duration.\n\n`;
const failures=rows.filter(r=>!r.ok);if(failures.length) md+='Failure details: '+failures.map(r=>esc(`${r.phase}: ${r.error}`)).slice(0,8).join('; ')+'\n\n';
if(fs.existsSync(path.join(dir,'probe-error'))) md+='Probe error: '+esc(fs.readFileSync(path.join(dir,'probe-error'),'utf8'))+'\n\n';
if(process.env.DEPLOY_ERROR)md+='Deployment error: '+esc(process.env.DEPLOY_ERROR)+'\n\n';
md+='The first migration from the old direct port binding requires a port handoff; failures and sampling gaps above are reported as observed.\n';
fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
console.log(md);
if(phases.some(p=>!rows.some(r=>r.phase===p))||failures.length||process.env.DEPLOY_ERROR)process.exitCode=1;
