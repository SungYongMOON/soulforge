import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

// Preview only. Existing dashboard components keep consuming the installed
// Board's read projections. No arbitrary destination, force refresh, or writer.
export const PREVIEW_READ_PATHS = Object.freeze([
  '/codex-threads.snapshot.json', '/host-stats.snapshot.json',
  '/antigravity-usage.snapshot.json', '/antigravity-quota.snapshot.json',
  '/provider-limits.snapshot.json', '/receipt-expiry.snapshot.json',
  '/tongs.snapshot.json', '/secure-work.snapshot.json', '/scheduled-tasks.snapshot.json',
  '/storage-map.snapshot.json', '/erp-pending-reviews.snapshot.json',
  '/codex-retention.snapshot.json', '/agent-runtime.snapshot.json',
]);
export function createOperationsPreviewReadPlugin({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  async function read(route) {
    const old = cache.get(route);
    if (old && now()-old.at < 10_000) return old.body;
    if (pending.has(route)) return pending.get(route);
    const operation = (async()=>{
      const url = `http://127.0.0.1:4192${route}${route==='/erp-pending-reviews.snapshot.json'?'?read_only=1':''}`;
      const response = await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{Accept:'application/json'}});
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('read_unavailable');
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.byteLength;if(size>4*1024*1024)throw new Error('read_limit');chunks.push(Buffer.from(chunk));}
      const body=Buffer.concat(chunks).toString('utf8');JSON.parse(body);
      cache.set(route,{at:now(),body});return body;
    })();
    pending.set(route,operation);
    try{return await operation;}finally{pending.delete(route);}
  }
  const configure=server=>{server.middlewares.use((req,res,next)=>{
    let url;try{url=new URL(req.url||'/','http://127.0.0.1');}catch{res.statusCode=400;res.end();return;}
    if(!PREVIEW_READ_PATHS.includes(url.pathname))return next();
    if(req.method!=='GET'){res.statusCode=405;res.end();return;}
    if(!isDirectLoopbackRequest(req)){res.statusCode=403;res.end();return;}
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    void read(url.pathname).then(body=>res.end(body),()=>{res.statusCode=503;res.end('{"state":"unavailable"}');});
  });};
  return {name:'operations-preview-existing-reads',configureServer:configure,configurePreviewServer:configure};
}
