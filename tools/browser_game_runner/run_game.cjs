const fs=require('fs'),path=require('path'),cp=require('child_process');const {CDP,delay}=require('./cdp.cjs');
(async()=>{
 const options=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const root=options.root,endpoint=options.endpoint||'http://127.0.0.1:9224',evidence=path.join(root,'reports/game_boot_evidence',options.evidenceId);fs.mkdirSync(evidence,{recursive:true});
 const version=await(await fetch(endpoint+'/json/version')).json();const browser=await new CDP(version.webSocketDebuggerUrl).open();let page,targetId;const result={filename:options.filename,evidenceId:options.evidenceId,runAt:new Date().toISOString(),url:options.url,phase:options.phase||'original',expectedDriver:options.expectedDriver,samples:[],network:[],externalAttempts:[],exceptions:[],inputEvents:[],screenshots:[],status:'NOT VERIFIED',classification:null,coreSha256:options.coreSha256,runtimeFiles:options.runtimeFiles,browser:version.Browser};
 const started=Date.now();let lastFrame=null,lastProgress=Date.now(),lastMemory=0,lastCheckpoint=0,lastNative=0;const processBefore=await browser.send('SystemInfo.getProcessInfo');
 try{result.processMemoryBefore=JSON.parse(cp.execFileSync(options.python||'python',[path.join(root,'tools/browser_game_runner/process_memory.py'),processBefore.processInfo.map(p=>p.id).join(',')],{encoding:'utf8'}));}catch(e){result.beforeMemoryError=String(e);}
 try{
  const created=await browser.send('Target.createTarget',{url:'about:blank',background:false});targetId=created.targetId;
  const targets=await(await fetch(endpoint+'/json')).json();page=await new CDP(targets.find(t=>t.id===targetId).webSocketDebuggerUrl).open();
  page.listeners.push(m=>{if(m.method==='Network.requestWillBeSent'){const q=m.params.request;result.network.push({url:q.url,method:q.method});}if(m.method==='Fetch.requestPaused'){const p=m.params,u=p.request.url;if(/^https?:/.test(u)&&!/^http:\/\/(127\.0\.0\.1|localhost):/.test(u)){result.externalAttempts.push(u);page.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'InternetDisconnected'}).catch(()=>{});}else page.send('Fetch.continueRequest',{requestId:p.requestId}).catch(()=>{});}if(m.method==='Network.responseReceived')result.network.push({url:m.params.response.url,status:m.params.response.status});if(m.method==='Network.loadingFailed')result.network.push({requestId:m.params.requestId,error:m.params.errorText});if(m.method==='Runtime.exceptionThrown')result.exceptions.push(m.params.exceptionDetails);});
  await page.send('Page.enable');await page.send('Runtime.enable');await page.send('Network.enable');await page.send('Performance.enable');await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});await page.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
  if(options.cold)await page.send('Network.setCacheDisabled',{cacheDisabled:true});
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(root,'tools/browser_game_runner/probe.js'),'utf8')});await page.send('Page.navigate',{url:options.url});
  let clicked=false,initializedAt=null,shotAt=0,inputs=false,lateInputs=false;const timeout=options.timeoutSeconds||50,observe=options.observeSeconds||12;
  while((Date.now()-started)/1000<timeout){
   if (!clicked) {
    const button = await page.evaluate(`(() => {
     const element = document.querySelector('.ejs_start_button');
     const rect = element?.getBoundingClientRect();
     return rect?.width && rect?.height
      ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      : null;
    })()`);
    if (button) {
     await page.send('Page.bringToFront');
     for (const [type, buttons] of [['mousePressed', 1], ['mouseReleased', 0]]) {
      await page.send('Input.dispatchMouseEvent', {
       type, ...button, button: 'left', buttons, clickCount: 1
      });
     }
     clicked = true;
    } else {
     clicked = await page.evaluate('!!window.EJS_emulator?.started');
    }
   }
   const sample=await page.evaluate('window.__NGSample?.()');if(sample){result.samples.push({...sample,driverLogs:undefined});const logs=sample.driverLogs||[];const init=logs.find(t=>/\[FBNeo\] Initialized driver for /.test(t));const failure=logs.find(t=>/ROM at index .* is required|Failed initializing driver|doesn.t exist|not supported by this version|Failed to load content|No compatible/.test(t));
    if(init&&!initializedAt){initializedAt=Date.now();result.gameInitMessage=init;result.loadingSeconds=(initializedAt-started)/1000;}
    if(!initializedAt&&failure){result.failureMessage=failure;break;}
    if(!initializedAt&&sample.started&&logs.some(t=>/\[Core\]: Geometry: 640x480/.test(t))&&(Date.now()-started)>6000){result.failureMessage='FBNeo entered its 640x480 error renderer before driver initialization';break;}
    if(sample.errors?.length||sample.gpuLoss?.length){result.observedErrors=sample.errors;}
    const since=initializedAt?(Date.now()-initializedAt)/1000:0;
    if(initializedAt){
      if(sample.frames!==lastFrame){lastFrame=sample.frames;lastProgress=Date.now();}
      if(!sample.paused&&Date.now()-lastProgress>5000){result.watchdogFailure='FRAME_PROGRESS_STALLED';break;}
      if(sample.audio?.contextStates?.includes('closed')){result.watchdogFailure='AUDIO_CONTEXT_CLOSED';break;}
      if(sample.errors?.length||sample.gpuLoss?.length){result.watchdogFailure='RUNTIME_OR_GPU_ERROR';break;}
      if(options.stability&&Date.now()-lastMemory>30000){lastMemory=Date.now();const p=await browser.send('SystemInfo.getProcessInfo');try{const memory=JSON.parse(cp.execFileSync(options.python||'python',[path.join(root,'tools/browser_game_runner/process_memory.py'),p.processInfo.map(x=>x.id).join(',')],{encoding:'utf8'}));(result.memoryTimeline||=[]).push({seconds:(Date.now()-started)/1000,processes:memory});}catch(e){result.memoryError=String(e);}}
      if(options.stability&&!options.disablePeriodicSnapshots&&since>60&&Date.now()-lastNative>60000){lastNative=Date.now();try{const b64=await page.evaluate('__NGFrame()');const name='frame-'+Math.floor(since)+'.png';fs.writeFileSync(path.join(evidence,name),Buffer.from(b64,'base64'));result.screenshots.push(name);}catch(e){result.screenshotError=String(e);}}
      if(options.stability&&Date.now()-lastCheckpoint>30000){lastCheckpoint=Date.now();fs.writeFileSync(path.join(evidence,'checkpoint.json'),JSON.stringify({at:new Date().toISOString(),seconds:since,sample},null,2));}
    }

    if(initializedAt&&since>=5&&result.screenshots.length===0){try{const b64=await page.evaluate('__NGFrame()');fs.writeFileSync(path.join(evidence,'frame-before.png'),Buffer.from(b64,'base64'));result.screenshots.push('frame-before.png');}catch(e){result.screenshotError=String(e);}}
    if(initializedAt&&since>=7&&!inputs){inputs=true;await page.send('Page.bringToFront');await page.evaluate('EJS_emulator.elements.parent.focus()');const controls=await page.evaluate('EJS_emulator.controls?.[0]');for(const index of ['2','3','8']){const vk=controls?.[index]?.value;if(!vk||vk>255)continue;await page.send('Input.dispatchKeyEvent',{type:'keyDown',windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});await delay(120);await page.send('Input.dispatchKeyEvent',{type:'keyUp',windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});result.inputEvents.push({index,keyCode:vk,at:new Date().toISOString(),status:'DELIVERED_NOT_RESPONSE_VERIFIED'});await delay(350);}}
    if(options.stability&&initializedAt&&since>=25&&!lateInputs){lateInputs=true;await page.send('Page.bringToFront');await page.evaluate('EJS_emulator.elements.parent.focus()');const controls=await page.evaluate('EJS_emulator.controls?.[0]');for(const index of ['2','2','3','0','8']){const vk=controls?.[index]?.value;if(!vk||vk>255)continue;await page.send('Input.dispatchKeyEvent',{type:'keyDown',windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});await delay(150);await page.send('Input.dispatchKeyEvent',{type:'keyUp',windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});result.inputEvents.push({index,keyCode:vk,seconds:since,status:'DELIVERED_NOT_RESPONSE_VERIFIED'});await delay(450);}}
    if(initializedAt&&since>=observe){result.bootObserved=true;break;}
   }
   await delay(500);
  }
  result.final=await page.evaluate('window.__NGSample?.()');result.diagnostics=await page.evaluate('window.NGRuntimeDiagnostics?.report');result.pageText=await page.evaluate('document.body.innerText.slice(-12000)');
  try{if(result.final?.started){const b64=await page.evaluate('__NGFrame()');fs.writeFileSync(path.join(evidence,'frame-after.png'),Buffer.from(b64,'base64'));result.screenshots.push('frame-after.png');}}
  catch(e){result.screenshotError=String(e);}
  if(result.gameInitMessage){for(let i=1;i<=2;i++){await delay(1000);try{const b64=await page.evaluate('__NGFrame()'),name='frame-after-'+i+'.png';fs.writeFileSync(path.join(evidence,name),Buffer.from(b64,'base64'));result.screenshots.push(name);}catch(e){result.screenshotError=String(e);}}}
  await page.evaluate("if(document.querySelector('details'))document.querySelector('details').open=false;window.scrollTo(0,0)");const screen=await page.send('Page.captureScreenshot');fs.writeFileSync(path.join(evidence,'page.png'),Buffer.from(screen.data,'base64'));
  result.domCounters=await page.send('Memory.getDOMCounters');result.performanceMetrics=await page.send('Performance.getMetrics');
  result.pcm=await page.evaluate('window.__NGProbe?.audio?.pcm||[]');
  result.rafTimes=await page.evaluate('window.__NGRafTimes?.()||window.__NGProbe?.rafTimes||[]');
  result.processBefore=processBefore;result.processAfter=await browser.send('SystemInfo.getProcessInfo');
  try{result.processMemory=JSON.parse(cp.execFileSync(options.python||'python',[path.join(root,'tools/browser_game_runner/process_memory.py'),result.processAfter.processInfo.map(p=>p.id).join(',')],{encoding:'utf8'}));}catch(e){result.memoryError=String(e);}

 }catch(e){result.runnerError=String(e);}
 finally{
  result.elapsedSeconds=(Date.now()-started)/1000;if(page)page.close();
  if(targetId){try{await browser.send('Target.closeTarget',{targetId});result.targetClosed=true;}catch(e){result.cleanupError=String(e);}}
  await delay(1000);try{result.afterCloseProcesses=await browser.send('SystemInfo.getProcessInfo');result.processMemoryAfterClose=JSON.parse(cp.execFileSync(options.python||'python',[path.join(root,'tools/browser_game_runner/process_memory.py'),result.afterCloseProcesses.processInfo.map(p=>p.id).join(',')],{encoding:'utf8'}));}catch(e){result.afterCloseMemoryError=String(e);}
  const targets=await browser.send('Target.getTargets');result.afterCloseTargets=targets.targetInfos.map(t=>({type:t.type,url:t.url}));
  fs.writeFileSync(path.join(evidence,'runtime.json'),JSON.stringify(result,null,2));browser.close();console.log(JSON.stringify({filename:result.filename,initialized:!!result.gameInitMessage,seconds:result.elapsedSeconds,failure:result.failureMessage,runnerError:result.runnerError,evidence:options.evidenceId}));
 }
})();
