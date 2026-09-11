// Explicit synthetic source-owner/store separation for APP tests only.
import { readFile,writeFile,mkdtemp,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash,randomUUID } from 'node:crypto';
import { inspectPreparationRuntime } from '../../src/runtime/generation_update.mjs';
import { materializeT5 } from './context_memory_t5_fixture.mjs';
import { UPDATE_PROFILES } from '../../profiles/update_profiles.mjs';

const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value));

async function createSeed(interpreterPath){
  if(!interpreterPath)throw new Error('explicit interpreterPath or SOULFORGE_TEST_PDF_PYTHON required');
  const original=await materializeT5({interpreterPath});
  const read=rel=>readFile(join(original.root,rel));
  const asset=id=>original.assets.find(a=>a.id===id);
  const scopes=await Promise.all(Object.values(original.pointer.manifest_asset).map(async id=>JSON.parse(await read(asset(id).path))));
  const docs=scopes.flatMap(scope=>scope.documents);
  const metadata=scope=>({scope,data_class:'public_synthetic',actors:[original.request.actor_ref],purposes:[original.request.purpose]});
  const sourceSnapshot={project_ref:original.binding.project_ref,documents:docs.map(doc=>{
    const src=asset(doc.source_asset);
    return {...metadata(src.scope),source_span_ref:doc.source_span_ref,source_revision_ref:doc.source_revision_ref,
      media_type:'application/pdf',path:join(original.root,src.path),sha256:src.sha256};
  }),preserved_dependencies:[...original.dependencies,...original.assets.filter(a=>['accepted','typed'].includes(a.kind))]
    .map(ref=>({...metadata(ref.scope),...ref,path:join(original.root,ref.path)}))};
  const acceptedSnapshot={project_ref:original.binding.project_ref,
    accepted_bundle:JSON.parse(await read(asset(original.pointer.accepted_asset).path)),
    accepted_bundle_ref:{...asset(original.pointer.accepted_asset),path:join(original.root,asset(original.pointer.accepted_asset).path)},
    accepted_pointer:original.pointer.accepted_pointer,source_revisions:original.state.source,
    source_bindings:original.binding.source_bindings,records:await Promise.all(docs.map(async doc=>{
      const typed=JSON.parse(await read(asset(doc.typed_asset).path));
      return {source_span_ref:doc.source_span_ref,source_revision_ref:doc.source_revision_ref,
        scope:asset(doc.source_asset).scope,records_json:typed.records_json,locations:typed.locations};
    })),receipt_refs:original.dependencies.filter(r=>r.owner==='receipt').map(ref=>({
      ...metadata(ref.scope),...ref,ref:'receipt:'+ref.path.split('/').at(-1).replace('.json',''),path:join(original.root,ref.path)}))};
  return {original,interpreterPath,sourceSnapshot,acceptedSnapshot,
    observations:await inspectPreparationRuntime(interpreterPath)};
}

export async function createGenerationStoreFixture({installs,interpreterPath=process.env.SOULFORGE_TEST_PDF_PYTHON,
  seed,profile='decision-v1',transform=()=>{},generationId='generation-'+randomUUID()}={}){
  seed=seed||await createSeed(interpreterPath);
  const {original,observations}=seed;
  interpreterPath=seed.interpreterPath;
  const sourceSnapshot=structuredClone(seed.sourceSnapshot),acceptedSnapshot=structuredClone(seed.acceptedSnapshot);
  transform(sourceSnapshot,acceptedSnapshot);
  const refs={};
  for(const [key,value] of [['source_snapshot',sourceSnapshot],['accepted_snapshot',acceptedSnapshot]]){
    const path=join(original.root,key+'-'+randomUUID()+'.json'),bytes=encode(value);
    await writeFile(path,bytes,{flag:'wx'});refs[key]={path,sha256:digest(bytes)};
  }
  const storeRoot=await mkdtemp(join(tmpdir(),'context-generation-producer-'));
  const projectPath='data_root/20_PROJECTS/'+original.binding.approved_fs_key;
  await mkdir(join(storeRoot,projectPath,'00_프로젝트_안내'),{recursive:true});
  installs=installs||[{id:'fixture',composition:UPDATE_PROFILES[profile]}];
  const install=installs.find(item=>item.composition.profile_id===profile)||installs[0];
  const binding={mode:'context_engine_store',project_ref:original.binding.project_ref,
    producer_binding_ref:original.binding.producer_binding_ref,approved_fs_key:original.binding.approved_fs_key,
    actor_ref:original.request.actor_ref,read_roots:[original.root],required_scopes:['project','common'],...refs,
    common_derived_path:'common-owner',
    acl_path:join(original.root,original.info,'acl.json'),
    write_authority:{actors:[original.request.actor_ref],operations:['prepare','select'],scopes:['project','common']},installs,
    preparation:{interpreter_path:interpreterPath,interpreter_sha256:observations.interpreter_sha256,
      worker_sha256:observations.worker_sha256,expected_runtime:observations.runtime}};
  const bindingBytes=encode(binding);await writeFile(join(storeRoot,'binding.json'),bindingBytes,{flag:'wx'});
  const request={actor_ref:original.request.actor_ref,project_ref:binding.project_ref,purpose:original.request.purpose,
    scope:'project',install_id:install.id,generation_id:generationId,composition:install.composition,expected_prior:null};
  const bindingSha256=digest(bindingBytes),args={storeRoot,bindingSha256,request};
  return {sourceOwnerRoot:original.root,storeRoot,binding,bindingSha256,request,queryRequest:original.request,
    sourceSnapshot,acceptedSnapshot,projectPath,seed,args,root:storeRoot};
}
