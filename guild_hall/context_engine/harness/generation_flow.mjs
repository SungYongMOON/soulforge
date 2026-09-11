// Development harness. Installed runtime never imports fixtures or this file.
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRuntimeClosure,REPO_ROOT,APP_REF,ENTRY_REF } from '../release/closure.mjs';
import { computeInstallClosureSha256,selectGeneration } from '../src/runtime/pair_store.mjs';
import { createGenerationStoreFixture } from './fixtures/generation_store_fixture.mjs';
import { UPDATE_PROFILES } from '../profiles/update_profiles.mjs';
import { updatePinnedGeneration,createContextEngineRuntime } from '../src/app.mjs';
import { INSTALLED_UPDATE_PROFILE } from '../profiles/selected_update.mjs';

const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export function describeInstallation(root,profile,{development=false}={}){
  const closure=development?inspectRuntimeClosure(root):JSON.parse(readFileSync(join(root,APP_REF,'release/runtime-closure.json'),'utf8'));
  const refs=[...closure.files.map(f=>f.path),APP_REF+'/module.manifest.json'];
  const files=refs.map(path=>({path,sha256:hash(readFileSync(join(root,path)))}));
  const config_path=APP_REF+'/profiles/selected_update.mjs';
  return {id:profile,root:resolve(root),version:JSON.parse(readFileSync(join(root,APP_REF,'module.manifest.json'))).module_version,
    entry_path:ENTRY_REF,config_path,files,code_sha256:files.find(f=>f.path===ENTRY_REF).sha256,
    config_sha256:files.find(f=>f.path===config_path).sha256,closure_sha256:computeInstallClosureSha256(files),composition:UPDATE_PROFILES[profile]};
}
export async function runDevelopmentGeneration(){
  const profile=INSTALLED_UPDATE_PROFILE.profile_id;
  const install=describeInstallation(REPO_ROOT,profile,{development:true});
  const fixture=await createGenerationStoreFixture({installs:[install],profile,generationId:'generation-1'});
  const generated=await updatePinnedGeneration(fixture.args);
  if(generated.status!=='PREPARED'||generated.counts.complete!==generated.counts.total)throw new Error('generation did not complete: '+JSON.stringify(generated));
  const selected=await selectGeneration({storeRoot:fixture.storeRoot,bindingSha256:fixture.bindingSha256,request:{
    actor_ref:fixture.request.actor_ref,project_ref:fixture.request.project_ref,purpose:fixture.request.purpose,scope:'project',
    install_id:install.id,expected_prior:null,generation_ref:{path:generated.manifest_ref,sha256:generated.manifest_sha256}}});
  if(selected.status!=='COMMITTED')throw new Error('selection did not commit: '+JSON.stringify(selected));
  const pack=await createContextEngineRuntime({root:fixture.storeRoot,bindingSha256:fixture.bindingSha256,syntheticOnly:true}).contextPack(fixture.queryRequest);
  if(pack.status!=='PARTIAL'&&pack.status!=='OK')throw new Error('new generation query failed: '+JSON.stringify(pack));
  const receipt={stage:'development-full-snapshot-query',generated,selected,pack,
    storeRoot:fixture.storeRoot,sourceOwnerRoot:fixture.sourceOwnerRoot,bindingSha256:fixture.bindingSha256};
  await writeFile(join(fixture.storeRoot,'development-query.receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await runDevelopmentGeneration();process.stdout.write(JSON.stringify({generation:r.generated,selection:r.selected.status,
    query_status:r.pack.status,facts:r.pack.facts.map(f=>f.id),digest:r.pack.digest,storeRoot:r.storeRoot})+'\n');
}
