import {chartPeriod,inBucket} from './chart-period.mjs';
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function collectionProcessing(sources,rag,days=7){
  const stamps=sources.map(s=>Date.parse(s.timeline?.as_of??s.observed_at??'')).filter(Number.isFinite);
  const asOf=stamps.length?new Date(Math.max(...stamps)).toISOString():null,buckets=chartPeriod(days,asOf);
  const projects=rag?.projects??[],valid=projects.filter(p=>p.comparison==='counts_match'&&p.detail_state==='ready'&&p.source_links?.complete);
  const complete=rag?.state==='ready'&&rag.expected>0&&valid.length===rag.expected&&projects.length===rag.expected;
  const keys=new Set(valid.flatMap(p=>p.source_links.keys??[]));
  const kinds={plaud:'voice',slack:'slack',linear:'linear',mail:'mail',docs:'document'};
  return {asOf,buckets,rows:sources.map(source=>{
    const records=source.timeline?.records??[],index=new Map((days===1?source.timeline?.hourly??[]:source.timeline?.daily??[]).map(r=>[r.date,r]));
    const noSuchKind=complete&&valid.every(p=>!(p.source_links.types?.[kinds[source.id]]>0));
    const daily=buckets.map(bucket=>{
      const cohort=records.filter(r=>inBucket(r.at,bucket));let value=index.get(bucket.key)?.registrations??null;
      if(days===1&&source.id!=='mail')value=cohort.length?cohort.reduce((sum,r)=>sum+(count(r.value)?r.value:1),0):source.id==='plaud'&&source.state==='ready'?0:null;
      if(source.state==='unavailable'||!count(value))value=null;
      let processed=null;
      if(value!==null&&rag?.state==='ready'){
        const matches=new Set(cohort.filter(r=>r.rag_key&&keys.has(r.rag_key)).map(r=>r.rag_key));
        if(matches.size<=value&&(matches.size>0||complete&&cohort.length===value&&cohort.every(r=>r.rag_key)))processed=matches.size;
        if(noSuchKind||value===0&&complete)processed=0;
      }
      return {...bucket,date:bucket.key,value,processed,partial:!complete||source.timeline?.records_limited===true};
    });
    const known=daily.filter(d=>d.value!==null),matched=daily.filter(d=>d.processed!==null);
    const processedSum=matched.reduce((s,d)=>s+d.processed,0);
    return {...source,daily,max:Math.max(1,...known.map(d=>d.value)),total:known.length?known.reduce((s,d)=>s+d.value,0):null,processed:matched.length&&(matched.length===known.length||processedSum>0)?processedSum:null,
      processedPartial:matched.length!==known.length||!complete||source.timeline?.records_limited===true,unit:({plaud:'녹음',slack:'메시지',linear:'이슈',mail:'신규 메일',docs:'문서'})[source.id],lastAt:source.rows?.[0]?.at,partial:source.state!=='ready'||known.length!==daily.length};
  })};
}
