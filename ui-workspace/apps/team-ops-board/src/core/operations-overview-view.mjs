const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function observedTotal(rows,get,expected=rows.length){
  const values=rows.map(get).filter(numeric);
  return {value:values.length?values.reduce((a,b)=>a+b,0):null,known:values.length,expected,complete:expected>0&&values.length===expected};
}
export function ragOverview(data){
  const rows=data?.projects??[],expected=data?.expected??0;
  const total=get=>observedTotal(rows,get,expected);
  const models=new Map();
  for(const row of rows){const store=row.store;if(!store)continue;
    for(const [role,model,calls] of [['추출',store.model?.extractor,store.llm?.calls],['임베딩',store.model?.embedder,store.embedding?.calls??store.llm?.embedder_calls]]){
      if(!model)continue;const key=`${role}:${model}`;if(!models.has(key))models.set(key,{role,model,rows:[]});
      models.get(key).rows.push({calls,prompt:role==='추출'?store.llm?.prompt_tokens:null,output:role==='추출'?store.llm?.output_tokens:null,errors:role==='추출'?store.llm?.errors:null});
    }
  }
  return {rows,expected,matched:rows.filter(r=>r.comparison==='counts_match').length,
    documents:total(r=>r.store?.counts?.documents),prepared:total(r=>r.preparation?.state==='ready'?r.preparation.counts?.prepared:null),
    refused:total(r=>r.preparation?.state==='ready'?r.preparation.counts?.refused:null),preparationFailed:total(r=>r.preparation?.state==='ready'?r.preparation.counts?.failed:null),
    chunks:total(r=>r.database?.chunks),embedded:total(r=>r.database?.embedded_chunks),unembedded:total(r=>r.database?.unembedded_chunks),pending:total(r=>r.pending?.count),
    reflected:total(r=>r.last_run?.verified?r.last_run.totals?.completed:null),runPending:total(r=>r.last_run?.totals?.pending),runFailed:total(r=>r.last_run?.totals?.failed),
    duplicates:total(r=>r.quality?.duplicate_ids),sourceMismatch:total(r=>r.quality?.chunks_mismatched),sourceMissing:total(r=>r.quality?.entities_without_chunk),outsideRelations:total(r=>r.quality?.relationships_outside_fragment),
    models:[...models.values()].map(m=>{const metric=get=>{const result=observedTotal(m.rows,get);return {...result,complete:result.complete&&rows.length===expected&&rows.every(r=>r.store)};};return {role:m.role,model:m.model,calls:metric(r=>r.calls),prompt:metric(r=>r.prompt),output:metric(r=>r.output),errors:metric(r=>r.errors)};})};
}
