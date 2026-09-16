const number=n=>Number.isSafeInteger(n)&&n>=0;
// Each point is a stock observation, not a sum of repeated sync receipts.
// All projects must have an observation in the same hour; never carry a stale
// project across a missing bucket or silently display a changing denominator.
export function ragTrend(projects=[],expected=projects.length){
  const hours=new Map();
  for(const p of projects)for(const r of p.runs??[]){
    const at=Date.parse(r.at);if(!Number.isFinite(at))continue;
    const hour=Math.floor(at/3600000)*3600000;
    if(!hours.has(hour))hours.set(hour,new Map());
    const bucket=hours.get(hour),old=bucket.get(p.project);
    if(!old||Date.parse(old.at)<at)bucket.set(p.project,r);
  }
  const keys=[...hours.keys()].sort((a,b)=>a-b);if(!keys.length)return {points:[],expected};
  const start=Math.max(keys[0],keys.at(-1)-47*3600000),end=keys.at(-1),points=[];
  for(let hour=start;hour<=end;hour+=3600000){
    const rows=[...(hours.get(hour)?.values()??[])];
    const sum=get=>rows.length===expected&&expected>0&&rows.every(r=>number(get(r)))?rows.reduce((s,r)=>s+get(r),0):null;
    points.push({at:hour,observed:rows.length,documents:sum(r=>r.verified?r.totals?.documents_in_generation:null),
      chunks:sum(r=>r.verified?r.database?.chunks:null),embedded:sum(r=>r.verified?r.database?.embedded_chunks:null),
      pending:sum(r=>r.totals?.pending),failed:sum(r=>r.totals?.failed)});
  }
  return {points,expected,start,end,partial:projects.some(p=>p.history_scope?.state!=='ready')};
}
