export function isRagOverview(value){return value?.state==='ready'&&Array.isArray(value.projects)&&value.projects.every(p=>typeof p?.project==='string');}
export function isRagDetail(value,project){return value?.state==='ready'&&value.project===project&&Array.isArray(value.documents);}
export function startRagRequest(previous){return {...previous,data:previous?.data??null,status:'loading',error:undefined,failedAt:undefined};}
export function finishRagRequest(previous,value,project,at){
  if(!isRagDetail(value,project))return failRagRequest(previous,'과제 상세 응답 확인 실패',at);
  return {data:value,status:'success',error:undefined,failedAt:undefined,source:'과제 상세 API',observed_at:at};
}
export function failRagRequest(previous,error,at){return {...previous,data:previous?.data??null,status:'error',error,source:'과제 상세 API',failedAt:at};}
