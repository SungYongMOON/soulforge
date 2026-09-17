export function sourceGroupState(sources={},keys=[]){
  const rows=keys.map(key=>sources[key]??{status:'idle'});
  const pending=rows.filter(r=>r.status==='idle'||r.status==='loading');
  const missing=rows.filter(r=>r.value===undefined);
  const lastSuccessAt=rows.every(r=>r.lastSuccessAt)?rows.map(r=>r.lastSuccessAt).sort()[0]:null;
  return {pending:pending.length>0,initialPending:pending.length>0&&missing.length>0,missing:missing.length>0,errors:rows.filter(r=>r.status==='error'),slow:rows.some(r=>r.slow),lastSuccessAt};
}

export function createSourceStore(loaders,{now=Date.now,delayMs=6000}={}){
  let sources=Object.fromEntries(Object.keys(loaders).map(key=>[key,{status:'idle',value:undefined,startedAt:null,lastSuccessAt:null,failedAt:null,error:null,slow:false}]));
  let batch=Object.keys(loaders),disposed=false;
  const listeners=new Set(),inFlight=new Map(),controllers=new Map();
  const time=()=>new Date(now()).toISOString();
  const makeSnapshot=()=>({sources,progress:{total:batch.length,completed:batch.filter(key=>['success','error'].includes(sources[key].status)).length,active:batch.some(key=>sources[key].status==='loading'),delayed:batch.filter(key=>sources[key].slow)}});
  let state=makeSnapshot();
  const publish=()=>{state=makeSnapshot();if(!disposed)listeners.forEach(fn=>fn());};
  function run(key){
    if(disposed||!loaders[key])return Promise.resolve();
    if(inFlight.has(key))return inFlight.get(key);
    const controller=new AbortController();controllers.set(key,controller);
    sources={...sources,[key]:{...sources[key],status:'loading',startedAt:time(),slow:false}};
    const timer=setTimeout(()=>{if(!disposed&&sources[key].status==='loading'){sources={...sources,[key]:{...sources[key],slow:true}};publish();}},delayMs);
    const request=Promise.resolve().then(()=>loaders[key]({signal:controller.signal})).then(value=>{
      if(disposed)return;
      sources={...sources,[key]:{...sources[key],status:'success',value,lastSuccessAt:time(),failedAt:null,error:null,slow:false}};
    },error=>{
      if(disposed)return;
      const code=/^(HTTP_\d{3}|INVALID_RESPONSE|SOURCE_UNAVAILABLE|TIMEOUT|CANCELLED)$/.test(error?.code??'')?error.code:error?.name==='TimeoutError'?'TIMEOUT':error?.name==='AbortError'?'CANCELLED':'REQUEST_FAILED';
      sources={...sources,[key]:{...sources[key],status:'error',failedAt:time(),error:{code},slow:false}};
    }).finally(()=>{clearTimeout(timer);inFlight.delete(key);controllers.delete(key);if(!disposed)publish();});
    inFlight.set(key,request);publish();return request;
  }
  return {
    snapshot:()=>state,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    refresh(){batch=Object.keys(loaders);return Promise.allSettled(batch.map(run));},
    retry(key){if(!loaders[key])return Promise.resolve();if(inFlight.has(key))return inFlight.get(key);batch=inFlight.size?[...new Set([...batch,key])]:[key];return run(key);},
    dispose(){disposed=true;controllers.forEach(c=>c.abort());listeners.clear();},
  };
}
