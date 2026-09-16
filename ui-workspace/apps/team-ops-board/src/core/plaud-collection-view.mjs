export function plaudCollectionObservation(health,receipt,now=Date.now()){
  if(health?.schema_version!=='soulforge.ingress.continuous_health.v3'||receipt?.schema_version!=='soulforge.ingress.continuous_run_receipt.v3')return null;
  const at=receipt?.completed_at,ms=Date.parse(at??''),p=receipt?.plaud;
  if(!p||receipt.run_id!==health?.last_run_id||!Number.isFinite(ms)||ms>now||now-ms>900000)return null;
  const codes=(receipt.errors??[]).map(r=>r?.code).filter(x=>typeof x==='string');
  const recovering=p.applied===true&&p.status==='degraded'&&p.catalog_complete===true&&p.custody_complete===true
    &&p.import_failed_retryable_count===0&&p.post_import_warning_count===0&&p.unknown_state_count===0
    &&codes.length>0&&codes.every(c=>c==='plaud_collection_degraded');
  const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  return {observed_at:at,recovering,status:p.status,imported:number(p.imported_count),catalog:number(p.catalog_count),
    identity_verified:number(p.existing_identity_verified_count),catalog_complete:p.catalog_complete===true,custody_complete:p.custody_complete===true,errors:codes};
}
