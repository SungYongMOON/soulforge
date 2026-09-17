import {useMemo,useState} from 'react';
import {useProjectNames} from './project-labels';
import {formatAmount,formatExact} from './core/operations-format.mjs';
import './usage-history-table.css';
type Row=Record<string,any>;
export function UsageHistoryTable({heading,rows,labelKey,labels=new Map<string,string>()}:{heading:string;rows:Row;labelKey:string;labels?:ReadonlyMap<string,string>}){
  const names=useProjectNames(),[query,setQuery]=useState(''),[sort,setSort]=useState('tokens'),[page,setPage]=useState(1);
  const list=useMemo(()=>[...(rows?.top??[]),...(rows?.other?[{[labelKey]:'other',...rows.other}]:[])].map((row:Row):Row=>{
    const id=String(row[labelKey]??''),known=labels.get(id)||row.display_label||row.label||names[id];
    const name=id==='other'?'기타 합계':id==='unassigned'?'미분류':known?String(known):labelKey==='project_id'&&/^[A-Z]\d/.test(id)?id:labelKey==='task_id'?'이름이 제공되지 않은 작업':'이름이 제공되지 않은 업무';
    return {...row,id,name};
  }).filter(row=>`${row.name} ${row.id}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):(b[sort==='turns'?'turns':'total_tokens']??-1)-(a[sort==='turns'?'turns':'total_tokens']??-1)),[rows,labelKey,labels,names,query,sort]);
  const pages=Math.max(1,Math.ceil(list.length/10)),current=Math.min(page,pages);
  return <section className="ou-history" aria-label={heading}><h4>{heading}</h4><div className="ou-history-tools"><input aria-label={`${heading} 검색`} placeholder="이름 또는 ID 검색" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><select aria-label={`${heading} 정렬`} value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="tokens">토큰 많은 순</option><option value="turns">회차 많은 순</option><option value="name">이름순</option></select></div><div className="ou-history-table"><table><thead><tr><th>항목</th><th>회차</th><th>토큰</th><th>크레딧</th></tr></thead><tbody>{list.slice((current-1)*10,current*10).map(row=><tr key={row.id}><th><span>{row.name}</span>{!['other','unassigned'].includes(row.id)&&<details><summary>기술 정보</summary><code>{row.id}</code></details>}</th>{['turns','total_tokens','credits'].map(key=><td key={key} title={formatExact(row[key])}>{formatAmount(row[key])}</td>)}</tr>)}</tbody></table></div>{!list.length&&<p>이 필터에 맞는 항목이 없습니다.</p>}<footer><span>{formatExact(list.length)}개 · {current}/{pages}페이지</span><button disabled={current<=1} onClick={()=>setPage(current-1)}>이전</button><button disabled={current>=pages} onClick={()=>setPage(current+1)}>다음</button></footer></section>;
}
