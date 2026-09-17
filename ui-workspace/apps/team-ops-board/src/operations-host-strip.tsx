import {Cpu,MemoryStick,HardDrive,Clock3} from 'lucide-react';
import {buildHostStatsViewModel,formatGb,formatUptime} from './core/host-stats.mjs';
import './operations-host-strip.css';

type Row=Record<string,any>;
export function OperationsHostStrip({snapshot,failed=false}:{snapshot?:Row;failed?:boolean}){
  const host=buildHostStatsViewModel(snapshot);
  const retained=failed || (host.available && Date.now()-Date.parse(host.observedAt)>180000);
  const time=host.observedAt ? new Date(host.observedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '미확인';
  const values=host.available ? [
    {key:'cpu',label:'CPU',Icon:Cpu,percent:snapshot!.cpu.percent,value:`${Math.round(snapshot!.cpu.percent)}%`},
    {key:'memory',label:'메모리',Icon:MemoryStick,percent:snapshot!.memory.percent,value:`${formatGb(snapshot!.memory.used_bytes)} / ${formatGb(snapshot!.memory.total_bytes)} GB`},
    ...snapshot!.disks.map((d:Row)=>({key:d.drive,label:`디스크 ${d.drive}`,Icon:HardDrive,percent:d.percent,value:`${formatGb(d.used_bytes)} / ${formatGb(d.total_bytes)} GB`})),
  ] : [
    {key:'cpu',label:'CPU',Icon:Cpu,percent:null,value:'—'},
    {key:'memory',label:'메모리',Icon:MemoryStick,percent:null,value:'—'},
    {key:'disk',label:'디스크',Icon:HardDrive,percent:null,value:'—'},
  ];
  return <section className={`op-host-strip${retained?' is-retained':''}`} aria-label="현재 컴퓨터 자원 상태">
    <div className="op-host-caption"><strong>이 PC</strong><span>{!host.available?'상태 미확인':retained?'이전 확인 결과':'현재 사용량'}</span></div>
    <div className="op-host-metrics">{values.map(({key,label,Icon,percent,value})=><div className="op-host-metric" key={key}>
      <div><Icon size={13} aria-hidden="true"/><span>{label}</span><b>{value}</b></div>
      <div className={`op-host-meter${percent===null?' is-unknown':''}`} role="img" aria-label={`${label} ${retained?'이전 ':''}사용률 ${percent===null?'미확인':`${Math.round(percent)}%`}`}>
        {percent!==null && <i style={{width:`${percent}%`}}/>}
      </div>
    </div>)}</div>
    <div className="op-host-time"><span><Clock3 size={12} aria-hidden="true"/>가동 {host.available?formatUptime(snapshot!.uptime_seconds):'—'}</span><time title={host.observedAt??undefined}>확인 {time}</time></div>
  </section>;
}
