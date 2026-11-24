const fs=require('fs');const {CDP}=require('./cdp.cjs');
(async()=>{const endpoint=process.argv[2]||'http://127.0.0.1:9224';const version=await(await fetch(endpoint+'/json/version')).json();const browser=await new CDP(version.webSocketDebuggerUrl).open();const tabs=await(await fetch(endpoint+'/json')).json();const cleaned=[];
for(const t of tabs){if(t.type!=='page'||!/^http:\/\/127\.0\.0\.1:8765\/player\.html/.test(t.url))continue;
 if(process.argv[3]==='baseline'){try{const page=await new CDP(t.webSocketDebuggerUrl).open();const state=await page.evaluate("JSON.stringify({frames:EJS_emulator.gameManager?.functions.getFrameNum(),diagnostics:NGRuntimeDiagnostics.report,audio:window.__audioEvidence?{scheduled:__audioEvidence.scheduled,nonzero:__audioEvidence.nonzero,peak:__audioEvidence.peak}:null})");fs.writeFileSync('reports/v014_baseline_breakers_runtime.json',state);page.close();}catch{}}
 await browser.send('Target.closeTarget',{targetId:t.id});cleaned.push(t.url);
}
console.log(JSON.stringify({closed:cleaned}));browser.close()})();
