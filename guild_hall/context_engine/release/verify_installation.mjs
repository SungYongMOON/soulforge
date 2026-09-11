// Runs a built APP from its own cwd with Node filesystem permissions. This
// development verifier is not part of the installed runtime byte closure.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyLane } from '../../deployment_pack/tools/build_source_lane.mjs';
import { validateManifest } from '../../engineering_engine/core/validators/module_binding.mjs';
import { APP_REF, ENTRY_REF, REPO_ROOT } from './closure.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function inventory(root){
  const rows=[];
  const walk=(rel='')=>{
    for(const name of readdirSync(join(root,rel))){
      const ref=rel?rel+'/'+name:name,target=join(root,ref),stat=lstatSync(target);
      assert.equal(stat.isSymbolicLink(),false,'unexpected link');
      if(stat.isDirectory())walk(ref);else rows.push({path:ref,sha256:sha(readFileSync(target))});
    }
  };walk();return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function verifyInstallation({laneRoot,inputRef,receiptRef}){
  const lane=realpathSync(laneRoot),input=json(inputRef),state=realpathSync(input.root),stateParent=realpathSync(input.state_parent);
  assert.equal(dirname(state),stateParent);
  const verification=verifyLane(lane);assert.deepEqual(verification.failures,[]);
  const closure=json(join(lane,APP_REF,'release/runtime-closure.json'));
  const module=json(join(lane,APP_REF,'module.manifest.json'));
  const expected=[...closure.files.map(f=>f.path),APP_REF+'/module.manifest.json',APP_REF+'/release/runtime-closure.json',
    'LANE_MANIFEST.sha256','LANE_MANIFEST.md','build.receipt.json'].sort();
  const laneBefore=inventory(lane),stateBefore=inventory(stateParent);
  assert.deepEqual(laneBefore.map(f=>f.path).sort(),expected,'unexpected or absent installed files');
  for(const file of closure.files)assert.equal(sha(readFileSync(join(lane,file.path))),file.sha256,'installed code/config/dependency drift');
  assert.ok(!laneBefore.some(f=>/\/(harness|tests|fixtures)\//u.test(f.path)||f.path.startsWith('ui-workspace/')));
  const permissions=['--permission','--allow-fs-read='+lane,'--allow-fs-read='+stateParent];
  const env={...process.env,TEMP:stateParent,TMP:stateParent,TMPDIR:stateParent,NODE_PATH:'',NODE_OPTIONS:'',NODE_V8_COVERAGE:'',NODE_COMPILE_CACHE:''};
  const run=(args)=>spawnSync(process.execPath,[...permissions,...args],{cwd:lane,env,encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  const args=[ENTRY_REF,'--root',state,'--binding-sha256',input.bindingSha256,'--request-json',JSON.stringify(input.request)];
  const active=run([...args,'--synthetic-only']);assert.equal(active.status,0,active.stderr);
  const pack=JSON.parse(active.stdout);assert.equal(pack.status,'PARTIAL');assert.equal(pack.digest,input.expected_digest);
  assert.ok([...active.stdout].length<=12000);assert.equal(pack.metrics.source_body_loads,2);
  const off=run(args);assert.equal(off.status,0,off.stderr);assert.equal(JSON.parse(off.stdout).status,'NOT_AVAILABLE');
  const denied=run([ENTRY_REF,'--root',state,'--binding-sha256',input.bindingSha256,'--request-json',
    JSON.stringify({...input.request,actor_ref:'actor:unapproved'}),'--synthetic-only']);
  assert.equal(denied.status,0,denied.stderr);assert.equal(JSON.parse(denied.stdout).metrics.source_body_loads,0);
  // The checkout exists, but this installed process is forbidden to read it.
  const checkoutProbe=run(['-e','require("node:fs").readFileSync('+JSON.stringify(join(REPO_ROOT,'package.json'))+')']);
  assert.notEqual(checkoutProbe.status,0);assert.match(checkoutProbe.stderr,/ERR_ACCESS_DENIED/u);
  const writeProbe=run(['-e','require("node:fs").writeFileSync('+JSON.stringify(join(stateParent,'forbidden-write'))+',"x")']);
  assert.notEqual(writeProbe.status,0);assert.match(writeProbe.stderr,/ERR_ACCESS_DENIED/u);
  assert.deepEqual(inventory(lane),laneBefore);assert.deepEqual(inventory(stateParent),stateBefore);
  assert.equal(existsSync(join(stateParent,'forbidden-write')),false);
  const build=json(join(lane,'build.receipt.json'));
  const artifactSha=sha(readFileSync(join(lane,'LANE_MANIFEST.sha256')));
  const profileSha=closure.files.find(f=>f.path===APP_REF+'/profiles/default_v1.mjs').sha256;
  const bindingManifest={module_id:'context_engine',module_version:module.module_version,
    build_commit:build.source_commit,artifact_sha256:artifactSha,engine_contract_abi_range:'>=0.1.0 <0.1.1',
    input_schema_revision:'context_engine.v0:existing-accepted-request',output_schema_revision:'accepted-context-pack/1',
    authority_ceiling:'read_only_synthetic',claim_ceiling:'observed',supported_project_classifications:['public_synthetic'],
    execution_mode:'deterministic_only',dependency_versions:Object.fromEntries(closure.dependency_modules.map(d=>[d.module_id,d.module_version])),
    configuration_hash:profileSha,migration_requirement:null,rollback_compatible_with:[],
    test_receipt_ref:'standalone-query.receipt.json'};
  validateManifest(bindingManifest);
  const receipt={status:'PASS_SYNTHETIC_QUERY_ONLY',built_from_commit:build.source_commit,installed_files:laneBefore.length,
    code_files:closure.files.length,artifact_sha256:artifactSha,configuration_hash:profileSha,
    metadata_only_operability_manifest:true,release_binding_manifest:bindingManifest,
    observed_node_version:process.versions.node,installed_cwd:true,checkout_read_denied:true,writes_denied:true,
    node_path_disabled:true,harness_gold_caller_absent:true,query_digest:pack.digest,query_metrics:pack.metrics,
    limitations:['No live activation or new-generation update. Two-strategy code+data transition and rollback remain unimplemented.',
      'Module binding manifest validation is structural; ABI promotion/review and project binding are not claimed.',
      'PDF preparation uses an explicit external interpreter and was not invoked by installed query.']};
  if(receiptRef)writeFileSync(receiptRef,JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options=Object.fromEntries(process.argv.slice(2).reduce((rows,x,i,a)=>i%2?rows:[...rows,[x,a[i+1]]],[]));
  try{process.stdout.write(JSON.stringify(verifyInstallation({laneRoot:options['--lane'],inputRef:options['--input'],receiptRef:options['--receipt']}))+'\n');}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
