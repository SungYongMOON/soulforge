export function projectLabel(code,names={}){return `${code} · ${names[code]||'명칭 미확인'}`;}
export function namedProjectText(value,names={}){
  return typeof value==='string'?value.replace(/\b(?:P\d{2}-\d{3}|D\d+-\d{2}-\d{3})\b/gu,code=>projectLabel(code,names)):value;
}
