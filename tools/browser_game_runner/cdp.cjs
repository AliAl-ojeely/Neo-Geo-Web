'use strict';
class CDP{
 constructor(url){this.url=url;this.pending=new Map();this.id=0;this.events=[];this.listeners=[];}
 async open(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});this.ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else{this.events.push(m);if(this.events.length>10000)this.events.shift();for(const fn of this.listeners)fn(m);}};return this;}
 send(method,params={},timeout=15000){return new Promise((resolve,reject)=>{const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression,timeout=10000){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},timeout);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
 close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP_CLOSED'));}this.pending.clear();this.ws?.close();}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports={CDP,delay};
