import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readStableFile } from './receipt-expiry-adapter.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function projectGraphReceipt(value, project, now = Date.now()) {
  if (value?.schema_version !== 'soulforge.context_graph_sync_receipt.v1' || value.project_code !== project || value.dry !== false
    || !['SYNCED','UNCHANGED','HOLD','FAILED'].includes(value.status) || !stamp(value.ran_at) || Date.parse(value.ran_at) > now + 5000) return null;
  const verified = ['SYNCED','UNCHANGED'].includes(value.status) && value.database?.agrees_with_generation === true
    && value.completed?.verified_by === 'database read-back of chunk and node counts'
    && count(value.completed.items) !== null && value.completed.items === value.totals?.completed;
  return { project, status: value.status, observed_at: value.ran_at, freshness: now - Date.parse(value.ran_at) > 45*60_000 ? 'stale' : 'fresh',
    verified, completed: verified ? count(value.totals?.completed) : null, pending: count(value.totals?.pending), failed: count(value.totals?.failed),
    reflected_at: stamp(value.totals?.last_reflected_at), code: /^[a-z][a-z0-9_]{0,127}$/u.test(value.code ?? '') ? value.code : null };
}
export function createGraphReceiptReader({ receiptsRoot, projects = [], responseAgentLabel, now = Date.now } = {}) {
  let cached = null, inFlight = null;
  async function read() {
    if (cached && now()-cached.at < 60_000) return cached.value;
    if(inFlight) return inFlight;
    inFlight = (async()=>{
      const label = typeof responseAgentLabel === 'string' && /^[\p{L}\p{N} _-]{1,40}$/u.test(responseAgentLabel) ? responseAgentLabel : null;
      const missing = { state:'unavailable',rows:[],summary:null,expected:projects.length,scope:'configured_projects_only',response_agent_label:label };
      if (!path.isAbsolute(receiptsRoot ?? '') || projects.length===0 || projects.length>32 || new Set(projects).size!==projects.length
        || projects.some(p=>!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u.test(p))) return missing;
      const rows=[];
      for(const project of projects) {
        try {
          const directory=path.join(receiptsRoot,project), stat=await lstat(directory);
          if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(directory)!==directory) continue;
          let latest=null, examined=0, overflow=false;
          for await (const entry of await opendir(directory)) {
            if(examined++>=512){overflow=true;break;}
            if(/^\d{8}T\d{6}\.json$/u.test(entry.name) && (!latest||entry.name>latest)) latest=entry.name;
          }
          if(overflow||!latest)continue;
          const readback=await readStableFile(path.join(directory,latest));
          const bytes=readback.bytes ?? readback;
          const projected=projectGraphReceipt(JSON.parse(Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes)),project,now());
          if(projected)rows.push(projected);
        } catch { /* no paths or source bodies in failures */ }
      }
      const all=rows.length===projects.length;
      const metric=key=>all&&rows.every(r=>r[key]!==null)?rows.reduce((sum,r)=>sum+r[key],0):null;
      const times=rows.map(r=>r.reflected_at).filter(Boolean).sort();
      return { state:all?'ready':rows.length?'partial':'unavailable',rows,expected:projects.length,scope:'configured_projects_only',response_agent_label:label,
        summary:{completed:metric('completed'),pending:metric('pending'),failed:metric('failed'),
          last_reflected_at:times.at(-1)??null,verified:all&&rows.every(r=>r.verified),fresh:all&&rows.every(r=>r.freshness==='fresh') } };
    })();
    try { const value=await inFlight;cached={at:now(),value};return value; }finally{inFlight=null;}
  }
  return {read};
}
export function createGraphReceiptPlugin(options={}) {
  const reader=createGraphReceiptReader(options);
  const configure=server=>{server.middlewares.use((req,res,next)=>{
    if((req.url||'').split('?')[0]!=='/operations-graph-receipts.json')return next();
    if(req.method!=='GET'){res.statusCode=405;res.end();return;}
    if(!isDirectLoopbackRequest(req)){res.statusCode=403;res.end();return;}
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    void reader.read().then(body=>res.end(JSON.stringify(body)),()=>{res.statusCode=503;res.end('{}');});
  });};
  return {name:'operations-graph-receipts-read-only',configureServer:configure,configurePreviewServer:configure};
}
