// APP-owned immutable derived generations and one code/data selection pointer.
// Source custody, acceptance and ACL remain externally owned, pinned inputs.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync, openSync, closeSync, fstatSync } from 'node:fs';
import { open, mkdir, unlink } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isDeepStrictEqual as equal } from 'node:util';
import { writeTextAtomic } from '../../../shared/io.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { createProjectAcceptedContextRuntime } from '../adapters/accepted_context_project_runtime.mjs';
import { finalizeContextPackObservation } from './accepted_context_pack.mjs';
import { INSTALLED_UPDATE_PROFILE } from '../../profiles/selected_update.mjs';

const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(value)
  && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(value);
const safeRel = value => typeof value === 'string' && value.length < 1024 && !isAbsolute(value)
  && !/[\\:]/u.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..' && !/[. ]$/u.test(p));
const fail = () => { throw new Error('context pair unavailable'); };
const stamp = s => ['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'].map(key => s[key]);
const AREAS = ['20_문서검색/본문·표_추출', '20_문서검색/원문위치·추출품질', '20_문서검색/검색_색인',
  '30_프로젝트맥락/결정·약속·제약', '30_프로젝트맥락/사건·관계', '30_프로젝트맥락/업무가지·프로젝트요약',
  '40_기억관리/회수용_기억', '40_기억관리/선택정책', '40_기억관리/회수·활용_평가',
  '50_업무맥락/업무별_맥락꾸러미·선택근거', '60_업무경험/결과·검토·실패·재작업의_연결'];

function rooted(root) {
  if (!isAbsolute(root || '') || lstatSync(root).isSymbolicLink()) fail();
  const canonical = realpathSync(root);
  function path(name, missing = false) {
    if (!safeRel(name) || realpathSync(root) !== canonical || lstatSync(root).isSymbolicLink()) fail();
    let target = canonical;
    for (const part of name.split('/')) {
      target = join(target, part);
      try { if (lstatSync(target).isSymbolicLink() || realpathSync(target) !== target) fail(); }
      catch (error) { if (!missing || error.code !== 'ENOENT') throw error; }
    }
    return target;
  }
  function read(name, maxBytes = 8 * 1024 * 1024) {
    const target = path(name), stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(maxBytes)) fail();
    const fd = openSync(target, 'r');
    try {
      if (!equal(stamp(stat), stamp(fstatSync(fd, { bigint: true })))) fail();
      const bytes = readFileSync(fd);
      if (!equal(stamp(stat), stamp(lstatSync(path(name), { bigint: true })))) fail();
      return bytes;
    } finally { closeSync(fd); }
  }
  return { root: canonical, path, read };
}

// The same rooted-path guards serve other APP-owned project store writers.
export { rooted as rootedStore, safeRel as safeStoreRel, token as storeToken };

export function computeInstallClosureSha256(files) {
  return sha256Canonical([...files].map(({ path, sha256 }) => ({ path, sha256 })).sort((a,b) => a.path.localeCompare(b.path)));
}

function admitted(acl, binding, request, operation) {
  const grant = acl.actors?.find(a => a.actor_ref === request?.actor_ref)?.grant;
  if (!request || request.actor_ref !== binding.actor_ref || !sameExactRef(request.project_ref, binding.project_ref)
    || !grant || acl.revoked_actors?.includes(request.actor_ref)
    || !grant.allowed_projects?.includes(exactRefIdentityKey(binding.project_ref))
    || !grant.allowed_scopes?.includes(request.scope) || !grant.allowed_purposes?.includes(request.purpose)
    || !grant.allowed_data_classes?.includes('public_synthetic')) fail();
  if(!Array.isArray(binding.required_scopes) || !binding.required_scopes.length
    || binding.required_scopes.some(scope=>!['project','common'].includes(scope) || !grant.allowed_scopes.includes(scope)))fail();
  if (operation !== 'query' && (!binding.write_authority?.actors?.includes(request.actor_ref)
    || !binding.write_authority.operations?.includes(operation))) fail();
}

export function openPairStore({ storeRoot, bindingSha256, request, operation = 'query', ioMetrics } = {}) {
  request=structuredClone(request);
  if (!['prepare','select','query'].includes(operation)) fail();
  const io = rooted(storeRoot), bindingBytes = io.read('binding.json');
  if (!hashPattern.test(bindingSha256) || digest(bindingBytes) !== bindingSha256) fail();
  const binding = JSON.parse(bindingBytes);
  if (binding.mode !== 'context_engine_store' || !token(binding.approved_fs_key)
    || !exactRefIdentityKey(binding.project_ref) || !Array.isArray(binding.installs)
    || !binding.source_snapshot || !binding.accepted_snapshot) fail();
  const readRoots=(binding.read_roots || []).map(rooted);
  for(const owner of readRoots) {
    const a=relative(io.root,owner.root).replaceAll('\\','/'),b=relative(owner.root,io.root).replaceAll('\\','/');
    if(!a || !b || safeRel(a) || safeRel(b))fail();
  }
  function ownerIo(name) {
    if(!isAbsolute(name || ''))return {owner:io,name};
    const matches=readRoots.flatMap(owner=>{
      const rel=relative(owner.root,name).replaceAll('\\','/');
      return safeRel(rel)?[{owner,name:rel}]:[];
    });
    if(matches.length!==1)fail();return matches[0];
  }
  function readOwned(name) {const route=ownerIo(name);return route.owner.read(route.name);}
  function resolveReadPath(name) {const route=ownerIo(name);return route.owner.path(route.name);}
  const projectPath = 'data_root/20_PROJECTS/' + binding.approved_fs_key;
  const commonPath=binding.common_derived_path ?? null;
  if(commonPath!==null) {
    if(!safeRel(commonPath))fail();
    const common=resolve(io.root,commonPath),project=resolve(io.root,'data_root/20_PROJECTS');
    const toProject=relative(common,project).replaceAll('\\','/'),toCommon=relative(project,common).replaceAll('\\','/');
    if(!toProject || !toCommon || safeRel(toProject) || safeRel(toCommon))fail();
    const target=io.path(commonPath,true);
    try {if(!lstatSync(target).isDirectory())fail();}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const infoPath = projectPath + '/00_프로젝트_안내';
  const aclBytes = readOwned(binding.acl_path), aclValue = JSON.parse(aclBytes);
  admitted(aclValue, binding, request, operation);
  const metrics=ioMetrics || {};
  Object.assign(metrics,{snapshot_hash_reads:0,snapshot_hash_bytes:0,pinned_read_attempts:0,pinned_bytes_loaded:0});
  function checkMetadata(ref, admission = ref) {
    if (!ref || !hashPattern.test(ref.sha256)) fail();
    const route=ownerIo(ref.path);if(!safeRel(route.name))fail();
    if (admission?.data_class !== undefined && admission.data_class !== 'public_synthetic') fail();
    if (admission?.actors && !admission.actors.includes(request.actor_ref)) fail();
    if (admission?.purposes && !admission.purposes.includes(request.purpose)) fail();
    if (admission?.project_ref && !sameExactRef(admission.project_ref, binding.project_ref)) fail();
    if (admission?.scope && admission.kind !== 'accepted'
      && (operation === 'query' ? admission.scope !== request.scope
        : !aclValue.actors.find(a=>a.actor_ref===request.actor_ref).grant.allowed_scopes.includes(admission.scope))) fail();
  }
  // Snapshot references must not point into APP-writable generation areas.
  for (const ref of [binding.source_snapshot, binding.accepted_snapshot]) {
    checkMetadata(ref);
    if (ref.path.startsWith(projectPath + '/') && (ref.path.includes('/generations/') || ref.path.startsWith(infoPath + '/'))) fail();
    if(commonPath && !isAbsolute(ref.path) && (ref.path===commonPath || ref.path.startsWith(commonPath+'/')))fail();
  }
  const snapshotWitness=new Map();
  for(const ref of [binding.source_snapshot,binding.accepted_snapshot]) {
    const bytes=readOwned(ref.path);metrics.snapshot_hash_reads++;metrics.snapshot_hash_bytes+=bytes.length;
    if(digest(bytes)!==ref.sha256)fail();
    if(commonPath) {
      const packet=JSON.parse(bytes);
      for(const input of [ref,...(packet.documents || []),...(packet.preserved_dependencies || []),
        ...(packet.receipt_refs || []),...(packet.accepted_bundle_ref?[packet.accepted_bundle_ref]:[])]) {
        const route=ownerIo(input.path),inputRoot=isAbsolute(input.path)?route.owner.root:resolve(io.root,dirname(route.name));
        const common=resolve(io.root,commonPath),a=relative(inputRoot,common).replaceAll('\\','/'),b=relative(common,inputRoot).replaceAll('\\','/');
        if(!a || !b || safeRel(a) || safeRel(b))fail();
      }
    }
    snapshotWitness.set(ref.path,stamp(lstatSync(resolveReadPath(ref.path),{bigint:true})));
  }
  function current() {
    try {
      const bytes=io.read(infoPath+'/current.json'),value=JSON.parse(bytes);
      if(!Number.isSafeInteger(value.selection_epoch) || value.selection_epoch<1
        || !sameExactRef(value.project_ref,binding.project_ref) || typeof value.install_id!=='string'
        || !value.engine || !safeRel(value.generation_ref?.path) || !hashPattern.test(value.generation_ref?.sha256))fail();
      return {value,sha256:digest(bytes)};
    }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const prior = current();
  function assertUnchanged() {
    if (digest(io.read('binding.json')) !== bindingSha256 || !equal(prior, current())) fail();
    const freshAcl = readOwned(binding.acl_path);
    admitted(JSON.parse(freshAcl), binding, request, operation);
    if (!freshAcl.equals(aclBytes)) fail();
    for (const [path,witness] of snapshotWitness)if(!equal(witness,stamp(lstatSync(resolveReadPath(path),{bigint:true}))))fail();
  }
  function readPinned(ref, admission) {
    assertUnchanged(); checkMetadata(ref, admission || ref);
    metrics.pinned_read_attempts++;
    const bytes = readOwned(ref.path);
    metrics.pinned_bytes_loaded+=bytes.length;
    if (digest(bytes) !== ref.sha256) fail();
    assertUnchanged(); return bytes;
  }
  async function writeDerived(name, bytes, {scope='project'}={}) {
    assertUnchanged();
    const owner=scope==='project'?projectPath:scope==='common'?commonPath:null;
    const grant=aclValue.actors.find(a=>a.actor_ref===request.actor_ref).grant;
    if (operation !== 'prepare' || !token(request.generation_id) || !owner
      || !(binding.write_authority.scopes || ['project']).includes(scope) || !grant.allowed_scopes.includes(scope)
      || !AREAS.some(area => name.startsWith(owner+'/'+area+'/generations/'+request.generation_id+'/'))) fail();
    const target = io.path(name, true);
    await mkdir(dirname(target), { recursive: true });
    assertUnchanged(); io.path(name, true);
    const handle = await open(target, 'wx');
    try { assertUnchanged(); await handle.writeFile(bytes); await handle.sync(); assertUnchanged(); }
    finally { await handle.close(); }
    return { path:name, sha256:digest(bytes) };
  }
  assertUnchanged();
  if (operation === 'prepare') {
    const install = binding.installs.find(i => i.id === request.install_id);
    if (!install || !equal(request.composition, install.composition)
      || !Object.hasOwn(request,'expected_prior') || request.expected_prior !== (prior?.sha256 || null)) fail();
  }
  return Object.freeze({ binding, projectPath, commonPath, infoPath, readPinned, readJson: ref => JSON.parse(readPinned(ref)),
    assertUnchanged, guard:assertUnchanged, writeDerived, current, acl:()=>{assertUnchanged();return structuredClone(aclValue);},
    resolveReadPath,metrics:()=>({...metrics}), _io:io, _prior:prior });
}

export const loadStoreBinding = openPairStore;
export const guardOwnedRead = (store, ref, admission) => store.readPinned(ref, admission);
export const writeCreateOnly = (store, path, bytes, admission) => store.writeDerived(path, bytes, admission);

function verifiedInstall(store, id) {
  const matches = store.binding.installs.filter(i => i.id === id);
  if (matches.length !== 1) fail();
  const install = matches[0], io = rooted(install.root), seen = new Set();
  if (!safeRel(install.entry_path) || !safeRel(install.config_path) || !Array.isArray(install.files)
    || install.files.length < 1 || install.files.length > 1000 || !/^\d+\.\d+\.\d+$/u.test(install.version)) fail();
  for (const file of install.files) {
    if (!safeRel(file.path) || seen.has(file.path.toLowerCase()) || !hashPattern.test(file.sha256)
      || digest(io.read(file.path)) !== file.sha256) fail();
    seen.add(file.path.toLowerCase());
  }
  // The declared closure must include each local literal import; only Node builtins
  // are allowed as bare imports. Computed installation dispatch is checked below.
  for(const file of install.files.filter(f=>/\.[cm]?js$/u.test(f.path))) {
    const source=io.read(file.path).toString('utf8');
    const imports=new Set();
    for(const pattern of [/\b(?:import|export)\s+[\w$*\s{},]+\s+from\s*['"]([^'"]+)['"]/gu,
      /\bimport\s*['"]([^'"]+)['"]/gu,/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu]) {
      for(const match of source.matchAll(pattern))imports.add(match[1]);
    }
    for(const specifier of imports) {
      if(specifier.startsWith('node:'))continue;
      if(!specifier.startsWith('.'))fail();
      const dependency=relative(io.root,resolve(dirname(io.path(file.path)),specifier)).replaceAll('\\','/');
      if(!safeRel(dependency) || !seen.has(dependency.toLowerCase()))fail();
    }
  }
  if (computeInstallClosureSha256(install.files) !== install.closure_sha256
    || install.files.find(f=>f.path===install.entry_path)?.sha256 !== install.code_sha256
    || install.files.find(f=>f.path===install.config_path)?.sha256 !== install.config_sha256) fail();
  const manifestPath='guild_hall/context_engine/module.manifest.json';
  if (!seen.has(manifestPath) || JSON.parse(io.read(manifestPath)).module_version !== install.version) fail();
  return { install, entry:io.path(install.entry_path) };
}

export function verifyPreparedInstall({storeRoot,bindingSha256,request,engineEntryUrl}={}) {
  const store=openPairStore({storeRoot,bindingSha256,request,operation:'prepare'});
  const {entry}=verifiedInstall(store,request.install_id);
  if(!engineEntryUrl || fileURLToPath(engineEntryUrl)!==entry)fail();
  store.assertUnchanged();return true;
}

function enginePin(install) {
  return { version:install.version, code_sha256:install.code_sha256, config_sha256:install.config_sha256,
    closure_sha256:install.closure_sha256, composition:install.composition };
}

function verifiedGeneration(store, ref, install, verifyAssets = true) {
  if(!ref || Object.keys(ref).length!==2 || !safeRel(ref.path) || !hashPattern.test(ref.sha256))fail();
  const manifest = store.readJson(ref);
  if (!token(manifest.generation_id) || manifest.status !== 'complete'
    || !sameExactRef(manifest.project_ref, store.binding.project_ref)
    || !equal(manifest.composition, install.composition) || !Array.isArray(manifest.assets)
    || !Array.isArray(manifest.preserved_refs) || !manifest.query_binding || !manifest.query_current
    || !equal(manifest.query_binding.assets, manifest.assets)
    || !sameExactRef(manifest.query_binding.project_ref,store.binding.project_ref)
    || manifest.query_binding.approved_fs_key!==store.binding.approved_fs_key
    || (manifest.query_binding.common_derived_path ?? null)!==store.commonPath
    || !Number.isSafeInteger(manifest.counts?.total) || manifest.counts.total<1
    || manifest.counts.complete!==manifest.counts.total
    || ['failed','unsupported','review_pending'].some(k=>manifest.counts[k]!==0)
    || ['source','extraction','index','typed','projection','policy','summary','generation','pack','accepted'].some(kind=>
      !manifest.assets.some(a=>a.kind===kind))) fail();
  const prefix=store.projectPath+'/50_업무맥락/업무별_맥락꾸러미·선택근거/generations/'+manifest.generation_id+'/';
  if (!ref.path.startsWith(prefix)) fail();
  const acceptedAssets=manifest.assets.filter(asset=>asset.kind==='accepted');
  if(acceptedAssets.some(asset=>asset.path!==store.binding.accepted_snapshot.path
    || asset.sha256!==store.binding.accepted_snapshot.sha256)
    || !acceptedAssets.some(asset=>asset.id===manifest.query_current.accepted_asset))fail();
  const accepted=store.readJson(store.binding.accepted_snapshot),source=store.readJson(store.binding.source_snapshot);
  const preservedAuthority=[store.binding.source_snapshot,store.binding.accepted_snapshot,...(source.documents || []),
    ...(source.preserved_dependencies || []),...(accepted.receipt_refs || [])];
  if(manifest.preserved_refs.some(ref=>!preservedAuthority.some(p=>p.path===ref.path && p.sha256===ref.sha256)))fail();
  for (const pinned of [store.binding.source_snapshot,store.binding.accepted_snapshot]) {
    if (!manifest.preserved_refs.some(p=>p.path===pinned.path && p.sha256===pinned.sha256)) fail();
  }
  for (const asset of [...manifest.preserved_refs,...manifest.assets]) {
    const preserved=manifest.preserved_refs.some(p=>p.path===asset.path && p.sha256===asset.sha256);
    const owner=asset.scope==='project'?store.projectPath:asset.scope==='common'?store.commonPath:null;
    if (!preserved && (!owner || !(store.binding.write_authority.scopes || ['project']).includes(asset.scope)
      || !AREAS.some(area=>asset.path.startsWith(owner+'/'+area+'/generations/'+manifest.generation_id+'/')))) fail();
    const authority=preserved?preservedAuthority.find(p=>p.path===asset.path && p.sha256===asset.sha256):asset;
    if(preserved && ['actors','purposes','data_class','scope'].some(key=>authority[key]!==undefined
      && asset[key]!==undefined && !equal(authority[key],asset[key])))fail();
    if(verifyAssets)store.readPinned(asset, { ...authority, scope:undefined });
  }
  if (!sameExactRef(manifest.accepted_generation_ref,accepted.accepted_bundle?.manifest?.accepted_generation_ref)
    || !sameExactRef(manifest.query_current.accepted_pointer?.generation_ref,manifest.accepted_generation_ref)
    || !equal(manifest.query_current.accepted_pointer,accepted.accepted_pointer)
    || !equal(manifest.source_revisions,accepted.source_revisions)
    || !equal(manifest.query_binding.source_bindings,accepted.source_bindings)
    || !sameExactRef(manifest.query_binding.producer_binding_ref,store.binding.producer_binding_ref)
    || store.acl().revoked_generations?.includes(exactRefIdentityKey(manifest.accepted_generation_ref))) fail();
  return manifest;
}

export async function selectGeneration({ storeRoot, bindingSha256, request, hooks = {} } = {}) {
  request=structuredClone(request);
  let committed=false, lock, lockPath, selected, result;
  try {
    const store=openPairStore({storeRoot,bindingSha256,request,operation:'select'});
    lockPath=store._io.path(store.infoPath+'/selection.lock',true);
    lock=await open(lockPath,'wx'); await lock.writeFile(randomUUID()); await lock.sync();
    store.assertUnchanged();
    if (!Object.hasOwn(request,'expected_prior') || request.expected_prior !== (store._prior?.sha256 || null)) fail();
    const {install}=verifiedInstall(store,request.install_id);
    verifiedGeneration(store,request.generation_ref,install);
    selected={project_ref:store.binding.project_ref,selection_epoch:(store._prior?.value.selection_epoch || 0)+1,
      install_id:install.id,engine:enginePin(install),generation_ref:request.generation_ref};
    if (store._prior && equal({...store._prior.value,selection_epoch:0},{...selected,selection_epoch:0})) {
      result={status:'UNCHANGED',current:store._prior.value,current_sha256:store._prior.sha256};
    } else {
      await hooks.beforeCommit?.();
      store.assertUnchanged(); verifiedInstall(store,request.install_id); verifiedGeneration(store,request.generation_ref,install);
      const bytes=JSON.stringify(selected)+'\n';
      // The lock serializes APP writers; all old bytes stay selected until this rename.
      await writeTextAtomic(store._io.path(store.infoPath+'/current.json',true),bytes);
      committed=true;
      result={status:'COMMITTED',current:selected,current_sha256:digest(bytes)};
      await hooks.afterCommit?.();
    }
  } catch { result={status:committed?'COMMITTED_CLEANUP_FAILED':'HOLD_PRECOMMIT',...(committed?{current:selected}:{})}; }
  finally {
    if(lock) {
      try { await lock.close(); await hooks.beforeCleanup?.(); await unlink(lockPath); }
      catch { result={...result,status:committed?'COMMITTED_CLEANUP_FAILED':'HOLD_PRECOMMIT'}; }
    }
  }
  return result;
}

function selectedView(store, pair) {
  if (!pair || !equal(store.current()?.value,pair) || !sameExactRef(pair.project_ref,store.binding.project_ref)) fail();
  const {install,entry}=verifiedInstall(store,pair.install_id);
  if (!equal(pair.engine,enginePin(install))) fail();
  const manifest=verifiedGeneration(store,pair.generation_ref,install,false);
  return { install,entry,manifest };
}

export async function queryPinnedGeneration({storeRoot,bindingSha256,request,pair,engineEntryUrl,hooks={}}={}) {
  request=structuredClone(request);pair=structuredClone(pair);
  const ioMetrics={};let result,unavailable=false;
  try {
    const store=openPairStore({storeRoot,bindingSha256,request,ioMetrics}), {install,entry,manifest}=selectedView(store,pair);
    // This module must physically belong to the chosen installation.
    if (resolve(dirname(fileURLToPath(import.meta.url)),'../app.mjs')!==entry) fail();
    if(engineEntryUrl && fileURLToPath(engineEntryUrl)!==entry)fail();
    if(!equal(install.composition,INSTALLED_UPDATE_PROFILE))fail();
    const memoryProfile=install.composition.memory;
    if(!['ranked-decision-v1','related-evidence-v2'].includes(memoryProfile))fail();
    const codeIo=rooted(install.root),codeWitness=install.files.map(f=>({path:f.path,stamp:stamp(lstatSync(codeIo.path(f.path),{bigint:true}))}));
    const guard=()=>{store.assertUnchanged();
      for(const file of codeWitness)if(!equal(file.stamp,stamp(lstatSync(codeIo.path(file.path),{bigint:true}))))fail();
      if(digest(store.readPinned(pair.generation_ref))!==pair.generation_ref.sha256)fail();};
    const runtime=createProjectAcceptedContextRuntime({root:storeRoot,bindingSha256,memoryProfile,
      generationView:{binding:manifest.query_binding,pointer:manifest.query_current,source:manifest.source_revisions,
        acl:store.acl,preservedRefs:manifest.preserved_refs,resolveReadPath:store.resolveReadPath,metrics:store.metrics,guard}});
    if(!runtime)fail();
    result=await runtime.contextPack(request);await hooks.afterQuery?.(result);guard();
  } catch {unavailable=true;}
  // The runtime already included this store's earlier counters. Replace them.
  return finalizeContextPackObservation(result,{...result?.metrics,...ioMetrics},request,{suppress:unavailable});
}

export function isPairStoreBinding({storeRoot,bindingSha256}={}) {
  try {const bytes=rooted(storeRoot).read('binding.json');return digest(bytes)===bindingSha256
    && JSON.parse(bytes).mode==='context_engine_store';}catch{return false;}
}

export async function querySelectedContext({storeRoot,bindingSha256,request,hooks={}}={}) {
  request=structuredClone(request);
  const ioMetrics={};let result,unavailable=false;
  try {
    const store=openPairStore({storeRoot,bindingSha256,request,ioMetrics}), pair=store.current()?.value;
    const {entry}=selectedView(store,pair);
    await hooks.beforeImport?.(); store.assertUnchanged(); selectedView(store,pair);
    if(entry===resolve(dirname(fileURLToPath(import.meta.url)),'../app.mjs')) {
      // During the CLI's top-level await, importing its own entry would wait
      // for that same evaluation to finish. The local core checks its profile.
      result=await queryPinnedGeneration({storeRoot,bindingSha256,request,pair});
    } else {
      const selected=await import(pathToFileURL(entry).href);
      store.assertUnchanged();
      if(typeof selected.queryPinnedGeneration!=='function')fail();
      result=await selected.queryPinnedGeneration({storeRoot,bindingSha256,request,pair});
    }
    await hooks.afterQuery?.(result);
    store.assertUnchanged(); selectedView(store,pair);
  } catch {unavailable=true;}
  // Only the dispatcher is new IO; add it exactly once to the inner totals.
  const metrics={...result?.metrics};
  for(const [key,value] of Object.entries(ioMetrics))metrics[key]=(metrics[key] || 0)+value;
  return finalizeContextPackObservation(result,metrics,request,{suppress:unavailable});
}
