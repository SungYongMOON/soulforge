const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const amount=value=>Number.isSafeInteger(value)&&value>=0;
// Align source-specific calendars without extending coverage or mixing grains.
export function sourceComparison(sources=[]){
  const end=sources.map(s=>s.timeline?.end).filter(validDay).sort().at(-1);
  const days=end?Array.from({length:14},(_,i)=>new Date(Date.parse(`${end}T00:00:00Z`)-(13-i)*86400000).toISOString().slice(0,10)):[];
  const units={plaud:'녹음',slack:'메시지',linear:'이슈',mail:'신규 메일',docs:'문서'};
  return {days,start:days[0]??null,end:end??null,rows:sources.map(source=>{
    const index=new Map((source.timeline?.daily??[]).map(r=>[r.date,r]));
    const daily=days.map(date=>{const r=index.get(date);return {date,value:source.state==='unavailable'||!amount(r?.registrations)?null:r.registrations,partial:r?.partial===true};});
    const measured=daily.filter(d=>d.value!==null),total=measured.length?measured.reduce((sum,d)=>sum+d.value,0):null;
    const partial=source.state!=='ready'||daily.some(d=>d.value===null||d.partial);
    return {...source,daily,total,partial,max:Math.max(1,...measured.map(d=>d.value)),unit:units[source.id]??'기록',lastAt:source.rows?.[0]?.at??null};
  })};
}
