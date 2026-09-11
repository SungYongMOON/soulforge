// APP-local packaging inventory. Literal imports are a probe, not standalone
// execution proof. Computed producer/config assets are explicit below.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const APP_REF='guild_hall/context_engine';
export const ENTRY_REF=APP_REF+'/src/app.mjs';
const EXPLICIT_FILES=['guild_hall/rag/project_document_extract.py','guild_hall/context_engine/src/workers/graphrag_worker.py'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const posix=value=>value.replaceAll('\\','/');
const cmp=(a,b)=>a<b?-1:a>b?1:0;

function imports(text){
  const refs=new Set();
  for(const pattern of [/\b(?:import|export)\s+[\w$*\s{},]+\s+from\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*['"]([^'"]+)['"]/gu,/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu]){
    for(const match of text.matchAll(pattern))refs.add(match[1]);
  }
  return [...refs];
}

export function inspectRuntimeClosure(repoRoot=REPO_ROOT){
  const queue=[ENTRY_REF,...EXPLICIT_FILES],seen=new Set(),bare=new Set(),builtins=new Set(),edges=[];
  while(queue.length){
    const ref=queue.shift();if(seen.has(ref))continue;
    if(ref.startsWith('../')||isAbsolute(ref)||!existsSync(resolve(repoRoot,ref)))throw new Error('missing or escaping runtime member: '+ref);
    if(/(?:^|\/)(?:harness|tests|test|fixtures|node_modules)(?:\/|$)/u.test(ref)
      ||ref.startsWith('ui-workspace/')||ref.startsWith('docs/architecture/workspace/examples/'))throw new Error('runtime boundary: '+ref);
    seen.add(ref);
    if(!/\.[cm]?js$/u.test(ref))continue;
    const source=readFileSync(resolve(repoRoot,ref),'utf8');
    for(const specifier of imports(source)){
      if(specifier.startsWith('node:')){builtins.add(specifier);continue;}
      if(!specifier.startsWith('.')){bare.add(specifier);continue;}
      const target=posix(relative(repoRoot,resolve(repoRoot,dirname(ref),specifier)));
      edges.push({from:ref,to:target});queue.push(target);
    }
  }
  if(bare.size)throw new Error('bare imports require explicit package closure: '+[...bare].join(','));
  const modules=new Map();
  for(const ref of [...seen]){
    const parts=ref.split('/');if(parts[0]!=='guild_hall'||parts[1]==='context_engine')continue;
    const manifestRef='guild_hall/'+parts[1]+'/module.manifest.json';
    if(!existsSync(resolve(repoRoot,manifestRef)))continue;
    const manifest=JSON.parse(readFileSync(resolve(repoRoot,manifestRef),'utf8'));
    modules.set(manifest.module_id,{module_id:manifest.module_id,module_version:manifest.module_version,
      interface_version:manifest.interface_version,manifest_ref:manifestRef});seen.add(manifestRef);
  }
  const files=[...seen].sort(cmp).map(path=>({path,sha256:sha(readFileSync(resolve(repoRoot,path)))}));
  return {entry_points:[ENTRY_REF],explicit_computed_assets:EXPLICIT_FILES,
    files,closure_sha256:sha(Buffer.from(JSON.stringify(files))),
    dependency_modules:[...modules.values()].sort((a,b)=>cmp(a.module_id,b.module_id)),
    builtin_imports:[...builtins].sort(cmp),bare_imports:[],edges:edges.sort((a,b)=>cmp(a.from+' '+a.to,b.from+' '+b.to)),
    limitations:['Literal import probe plus explicitly listed computed assets. Actual installed execution is a separate gate.',
      'Node is a declared host runtime. PDF preparation and graph extraction require explicitly bound Python interpreters (PDF profile; neo4j-graphrag venv); no interpreter or Python package is copied.']};
}

export function writeRuntimeClosure(repoRoot=REPO_ROOT){
  const closure=inspectRuntimeClosure(repoRoot);
  const version=JSON.parse(readFileSync(resolve(repoRoot,APP_REF+'/module.manifest.json'),'utf8')).module_version;
  writeFileSync(resolve(repoRoot,APP_REF+'/release/runtime-closure.json'),JSON.stringify(closure,null,2)+'\n');
  const spec={schema:'soulforge.source_lane_spec.v0',lane_id:'context-engine-v'+version.replaceAll('.','-'),
    description:'Standalone synthetic Context Engine installed update and query. Exact runtime and explicit shared byte closure only. No ERP caller, harness, gold, data, service registration or operating writer.',
    tracked_paths:[...closure.files.map(f=>f.path),APP_REF+'/module.manifest.json',APP_REF+'/release/runtime-closure.json'],
    tracked_excludes:[],carried_forward_prefixes:[],entry_points:closure.entry_points};
  writeFileSync(resolve(repoRoot,APP_REF+'/release/context-engine-v1.spec.json'),JSON.stringify(spec,null,2)+'\n');
  return closure;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=process.argv.includes('--write')?writeRuntimeClosure():inspectRuntimeClosure();
  process.stdout.write(JSON.stringify({files:result.files.length,closure_sha256:result.closure_sha256,
    dependency_modules:result.dependency_modules,bare_imports:result.bare_imports})+'\n');
}
