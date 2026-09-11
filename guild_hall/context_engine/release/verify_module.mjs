// Development preflight through the existing module/catalog contracts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModuleManifest, computeModuleReleaseDigest } from '../../module_operability/src/manifest_schema.mjs';
import { checkDeclaredDependencies } from '../../module_operability/src/dependency_check.mjs';
import { loadProductCompositionInputs, runProductPreflight } from '../../module_operability/src/product_composition_check.mjs';
import { REPO_ROOT, APP_REF, inspectRuntimeClosure } from './closure.mjs';

export function verifyModule(repoRoot=REPO_ROOT){
  const manifest=JSON.parse(readFileSync(resolve(repoRoot,APP_REF+'/module.manifest.json'),'utf8'));
  const computed=computeModuleReleaseDigest(resolve(repoRoot,APP_REF));
  const declaration=validateModuleManifest(manifest,{computedReleaseDigest:computed});
  assert.equal(declaration.ok,true,JSON.stringify(declaration.problems));
  const inputs=loadProductCompositionInputs(repoRoot);
  const dependencies=checkDeclaredDependencies(inputs.moduleRecords.map(r=>r.manifest));
  assert.equal(dependencies.ok,true,JSON.stringify(dependencies.problems));
  const catalog=runProductPreflight({root:repoRoot});
  assert.equal(catalog.ok,true,JSON.stringify(catalog.problems));
  const row=inputs.catalog.modules.find(r=>r.module_id===manifest.module_id);
  assert.equal(row.classification,'shared');assert.equal(row.product_id,null);
  assert.deepEqual(row.current_caller_module_ids,[],'unregistered ERP callers are not module IDs');
  const actual=inspectRuntimeClosure(repoRoot);
  const pinned=JSON.parse(readFileSync(resolve(repoRoot,APP_REF+'/release/runtime-closure.json'),'utf8'));
  assert.deepEqual(actual,pinned,'runtime byte/import closure drift');
  assert.deepEqual([...manifest.required_dependencies].sort(),actual.dependency_modules.map(m=>m.module_id).sort());
  for(const dependency of actual.dependency_modules)assert.equal(manifest.compatible_version_ranges[dependency.module_id],dependency.module_version);
  return {ok:true,manifest_fields:Object.keys(manifest).length,catalog_modules:catalog.module_count,
    catalog_shared:catalog.shared_module_count,unresolved_interfaces:catalog.unresolved_interface_count,
    runtime_files:actual.files.length,runtime_closure_sha256:actual.closure_sha256,
    source_tree_digest:computed,operability_release_digest_stamped:manifest.release_digest!==null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(JSON.stringify(verifyModule())+'\n');}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
