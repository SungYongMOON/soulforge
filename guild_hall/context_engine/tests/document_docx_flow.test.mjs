// Parent-owned integration: a real local DOCX parser, then the actual inactive
// preparation store and readback. No graph model, database, or real source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { makeGraphIndexStore, indexerRequest, INDEX_NOW, INDEX_PROJECT, READER_REQUEST,
  cannedGraphWorker } from '../harness/fixtures/graph_index_fixture.mjs';
import { GRAPH_INDEX_BINDING_FILE, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { runPreparationFlow } from '../harness/preparation_flow.mjs';
import { readPreparationGeneration } from '../src/runtime/preparation_store.mjs';
import { readOriginal } from '../src/runtime/original_read.mjs';
import { rootedStore } from '../src/runtime/pair_store.mjs';
const python=process.env.SOULFORGE_TEST_DOCX_PYTHON;
const skip=python?false:'set SOULFORGE_TEST_DOCX_PYTHON for the real local DOCX parser';
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
test('real minimal DOCX preserves body/table order through inactive store and reports fidelity gap', {skip}, async t=>{
  const fixture=await mkdtemp(path.join(os.tmpdir(),'ctx-docx-flow-source-'));
  const fixtureFile=path.join(fixture,'trial.docx');
  t.after(async()=>{assert.equal(path.dirname(fixture),os.tmpdir());await rm(fixture,{recursive:true,force:true});});
  await promisify(execFile)(python,['-I','-X','utf8','-c',
    "from docx import Document; import sys; d=Document(); d.add_paragraph('Before table: verified setup'); t=d.add_table(rows=2, cols=2); t.cell(0,0).text='Voltage'; t.cell(0,1).text='28 V'; t.cell(1,0).text='Status'; t.cell(1,1).text='Pending'; d.add_paragraph('After table: do not use 24 V'); d.save(sys.argv[1])",fixtureFile],
    {timeout:30000,maxBuffer:1024*1024});
  const bytes=await readFile(fixtureFile), store=await makeGraphIndexStore({memos:{'trial.docx':bytes},writeOperations:['index','prepare']});
  t.after(async()=>{for(const dir of [store.storeRoot,store.sourceRoot]){assert.equal(path.dirname(dir),os.tmpdir());await rm(dir,{recursive:true,force:true});}});
  store.binding.document_tools={docx:{interpreterPath:python,extractionProfile:'python-docx-structure-v1',disableSiteStartup:process.platform==='win32'}};
  store.bindingSha256=(await store.put(GRAPH_INDEX_BINDING_FILE,store.binding)).sha256;
  const request=indexerRequest(), base={storeRoot:store.storeRoot,bindingSha256:store.bindingSha256,request,now:INDEX_NOW};
  const receipt=await runPreparationFlow({...base,runId:'docx-flow',validationRunId:'docx-flow-val'});
  assert.equal(receipt.steps.prepare.documents,1,JSON.stringify(receipt.steps.prepare));
  assert.equal(receipt.steps.validate.outcome,'pass');
  const readback=await readPreparationGeneration({...base,generationId:'docx-flow'});
  const doc=readback.documents[0];
  assert.equal(doc.primary_revision_sha256,sha(bytes));
  assert.deepEqual(doc.units.map(u=>u.text),['Before table: verified setup','Voltage','28 V','Status','Pending','After table: do not use 24 V']);
  for(const unit of doc.units){
    assert.deepEqual(unit.locator.path,['trial.docx']);
    assert.equal(unit.locator.part,'word/document.xml');
    assert.equal(Object.hasOwn(unit.locator,'page_number'),false);
  }
  assert.notEqual(receipt.steps.source_check.outcome,'pass');
  assert.equal(sha(await readFile(path.join(store.sourceRoot,'trial.docx'))),sha(bytes));
  await assert.rejects(readFile(path.join(store.storeRoot,INDEX_PROJECT,'00_프로젝트_안내/graph_index_current.json')),e=>e.code==='ENOENT');
  const replay=await runPreparationFlow({...base,runId:'docx-flow',validationRunId:'docx-flow-val'});
  assert.equal(replay.steps.land.status,'REPLAYED');
  const worker=cannedGraphWorker();
  const indexed=await updateGraphIndex({...base,request:indexerRequest({generation_id:'docx-g1',expected_prior:null}),runWorker:worker.runWorker});
  assert.equal(indexed.status,'COMMITTED');
  await store.put('control_root/project-bindings/'+store.fsKey+'/graph_index_binding.unified.json',store.binding);
  const original=await readOriginal({io:rootedStore(store.storeRoot),project:store.fsKey,itemId:'trial.docx',
    actorRef:READER_REQUEST.actor_ref,now:INDEX_NOW,tools:null});
  assert.equal(original.status,'ok');
  assert.equal(original.internal.parser_calls_scope,'attachment_derivation_only');
  assert.deepEqual(original.units.map(u=>u.text),doc.units.map(u=>u.text));
});
