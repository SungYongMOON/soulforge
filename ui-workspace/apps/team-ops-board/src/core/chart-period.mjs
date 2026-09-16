export const kstDay=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
export function chartPeriod(days,asOf){
  const now=Date.parse(asOf??'');if(!Number.isFinite(now)||![1,7,14,30].includes(days))return [];
  const today=Date.parse(`${kstDay(now)}T00:00:00+09:00`),step=days===1?3600000:86400000,start=today-(days-1)*86400000;
  const rows=[];for(let at=start;at<=now;at+=step)rows.push({at,end:at+step,key:days===1?new Date(at).toISOString():kstDay(at),label:days===1?`${new Date(at+9*3600000).getUTCHours()}시`:kstDay(at).slice(5).replace('-','/')});
  return rows;
}
export function inBucket(at,bucket){const ms=Date.parse(at??'');return Number.isFinite(ms)&&ms>=bucket.at&&ms<bucket.end;}
