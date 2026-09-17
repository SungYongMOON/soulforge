export const RAG_SOURCES={slack:'Slack',mail:'메일',linear:'Linear',voice:'PLAUD·음성',document:'문서',buzz:'Buzz'};
const numeric=n=>Number.isSafeInteger(n)&&n>=0;
export function ragConnections(snapshot){
  const projects=snapshot?.projects??[],nodes=[],edges=[],totals=new Map();
  projects.forEach((p,i)=>{
    const ready=p.comparison==='counts_match'&&p.detail_state==='ready';
    nodes.push({id:p.project,kind:'project',label:p.project_name?`${p.project} · ${p.project_name}`:p.project,project:p.project,count:ready?p.store?.counts?.documents:null,x:460,y:i*95});
    if(!ready)return;
    for(const [source,count] of Object.entries(p.source_links?.types??{})){
      if(!numeric(count)||count===0)continue;
      totals.set(source,(totals.get(source)??0)+count);
      edges.push({id:`${source}:${p.project}`,source:`source:${source}`,target:p.project,label:`${count} 문서`,count});
    }
  });
  [...totals].forEach(([source,count],i)=>nodes.push({id:`source:${source}`,kind:'source',label:RAG_SOURCES[source]??source,count,x:0,y:i*95}));
  return {nodes,edges,complete:Boolean(snapshot?.expected&&projects.length===snapshot.expected&&projects.every(p=>p.comparison==='counts_match'&&p.detail_state==='ready')),sources:[...totals].map(([id,count])=>({id,label:RAG_SOURCES[id]??id,count}))};
}
export function ragGraphScene(graph){
  const columns=[0,0,0];
  const nodes=(graph?.nodes??[]).map(n=>{
    const labels=Array.isArray(n.labels)?n.labels:[];
    const kind=labels.includes('Document')?'document':labels.includes('Chunk')?'chunk':'entity';
    const column=kind==='document'?0:kind==='chunk'?1:2,index=columns[column]++;
    const label=n.name||(kind==='document'?(n.document?(n.document.length>28?`${n.document.slice(0,20)}…`:n.document):'문서'):kind==='chunk'?(n.unit?`청크 ${n.unit.split(':').at(-1)}`:`청크 ${index+1}`):labels[0]??'개체');
    return {...n,kind,label,x:column*360+(kind==='entity'?Math.floor(index/12)*320:0),y:(kind==='entity'?index%12:index)*96};
  });
  const ids=new Set(nodes.map(n=>n.id));
  const names={FROM_DOCUMENT:'문서에 속함',FROM_CHUNK:'본문 출처',NEXT_CHUNK:'다음 청크',REFERS_TO:'명시적 참조',RELATED_EVIDENCE:'관련 근거'};
  return {nodes,edges:(graph?.edges??[]).filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>({...e,label:names[e.type]??e.type}))};
}
