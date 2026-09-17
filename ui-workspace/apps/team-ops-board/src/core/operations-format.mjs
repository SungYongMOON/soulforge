const compactKo=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});
const exactKo=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:20});
export function formatAmount(value,{compact=true}={}){
  if(typeof value!=='number'||!Number.isFinite(value))return '—';
  if(compact&&value!==0&&Math.abs(value)<1)return new Intl.NumberFormat('ko-KR',{maximumSignificantDigits:3}).format(value);
  return (compact?compactKo:exactKo).format(value);
}
export function formatExact(value){return formatAmount(value,{compact:false});}
export function displayModelName(value){return value==='unassigned'?'미분류':value==='other'?'기타 모델':value??'이름 없음';}
