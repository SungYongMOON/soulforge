import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeT5, snapshotProject, restoreProject } from '../harness/fixtures/context_memory_t5_fixture.mjs';
import { hash } from '../harness/fixtures/accepted_context_fixture.mjs';

const refreshInventory=snapshot=>{
  snapshot.manifest_digest=hash(JSON.stringify(snapshot.files.map(({base64,...row})=>row)));
};

test('T5 restore uses pinned asset scope despite relabelled snapshot dependencies',async()=>{
  const x=await materializeT5(),snapshot=await snapshotProject(x),authorization=structuredClone(x.acl);
  authorization.actors[0].grant.allowed_scopes=['project'];
  assert.ok(x.binding.assets.some(asset=>asset.scope==='common'));
  for(const dependency of snapshot.dependencies)dependency.scope='project';
  await assert.rejects(restoreProject(snapshot,{authorization}),/fresh restore authorization/);
});

test('T5 restore rejects a review receipt omitted from files and top-level dependencies',async()=>{
  const x=await materializeT5(),snapshot=await snapshotProject(x),path='source-custody/receipts/review.json';
  snapshot.files=snapshot.files.filter(file=>file.path!==path);
  snapshot.dependencies=snapshot.dependencies.filter(dependency=>dependency.path!==path);
  refreshInventory(snapshot);
  await assert.rejects(restoreProject(snapshot,{authorization:x.acl}),/dependency closure/);
});

test('T5 restore resolves bound episode ref and hash even when dependency inventory is rewritten',async()=>{
  const x=await materializeT5(),snapshot=await snapshotProject(x),path='source-custody/receipts/review.json';
  snapshot.files=snapshot.files.filter(file=>file.path!==path);
  snapshot.dependencies=snapshot.dependencies.filter(dependency=>dependency.path!==path);
  const inventory=snapshot.files.find(file=>file.path===x.info+'/dependencies.json');
  const data=Buffer.from(JSON.stringify({project_ref:x.binding.project_ref,dependencies:snapshot.dependencies}));
  Object.assign(inventory,{base64:data.toString('base64'),sha256:hash(data),bytes:data.length});
  refreshInventory(snapshot);
  await assert.rejects(restoreProject(snapshot,{authorization:x.acl}),/episode dependency closure/);
});
