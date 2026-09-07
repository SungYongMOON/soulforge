import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {worldCoverageDigest, buildForgeWorldCoverage} from '../../../../../guild_hall/requirement_trace/forge_world_coverage.mjs';
import {createWorldCoverageReader, createWorldCoverageAdapterPlugin, parseWorldCoverage} from './forge-world-coverage-adapter.mjs';
const at = '2026-09-07T00:00:00Z';
function document() {
  const body = {schema_version: 'soulforge.forge_world.coverage.v1', project_code: 'SYN-001', source_kind: 'observed',
    observed_at: at, valid_at: at, input_revision: `sha256:${'a'.repeat(64)}`, unbound_counts: {needs_undeclared: 0, policy_slot_unmapped: 0, unexpected_observed: 0},
    slots: [{project_code: 'SYN-001', stage_code: '120_CDR', artifact_family_id: 'test_report', cell_count: 1,
      observation_count: 1, source_observed_at: at, coverage_state: 'satisfied', coverage_reason: 'satisfied',
      state_counts: {satisfied: 1}, reason_counts: {satisfied: 1}, evidence_refs: [`sha256:${'b'.repeat(64)}`]}]};
  return {...body, generation: worldCoverageDigest(body)};
}
test('pinned metadata read, missing file and corrupt file have distinct honest states', async t => {
  const root = await mkdtemp(join(tmpdir(), 'sf-world-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const reader = createWorldCoverageReader({stateRoot: root, projectCodes:['SYN-001'], now: () => Date.parse(at)});
  assert.equal((await reader.readSnapshot()).projects[0].state, 'unknown');
  const folder = join(root,'operations','forge_world','coverage');
  await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'SYN-001.json'),JSON.stringify(document()));
  assert.equal((await reader.readSnapshot()).projects[0].qualifying_observed_slots, 1);
  await writeFile(join(folder,'SYN-001.json'),'{');
  assert.equal((await reader.readSnapshot()).projects[0].state, 'unavailable');
});
test('wrong project, digest drift, malformed IDs and payload-shaped references reject', () => {
  assert.equal(parseWorldCoverage(JSON.stringify(document()),'OTHER'),null);
  const drift = document(); drift.slots[0].coverage_state = 'gap_missing';
  assert.equal(parseWorldCoverage(JSON.stringify(drift),'SYN-001'),null);
  for (const mutate of [value => {delete value.slots[0].stage_code;}, value => {value.slots[0].evidence_refs = [['C:', 'private', 'body'].join('/')];}]) {
    const value=document(); mutate(value); const {generation,...body}=value; value.generation=worldCoverageDigest(body);
    assert.equal(parseWorldCoverage(JSON.stringify(value),'SYN-001'),null);
  }
  assert.throws(()=>createWorldCoverageReader({stateRoot:tmpdir(),projectCodes:['../outside']}),/WORLD_READER_CONFIG_INVALID/);
});
test('GET endpoint rejects remote, POST, and query-controlled paths before reading', async () => {
  let handler;
  const plugin=createWorldCoverageAdapterPlugin({stateRoot:tmpdir(),projectCodes:[]});
  plugin.configureServer({middlewares:{use:fn=>{handler=fn;}}});
  for (const [method,address,url,status] of [
    ['POST','127.0.0.1','/project-coverage.snapshot.json',405],
    ['GET','192.0.2.1','/project-coverage.snapshot.json',403],
    ['GET','127.0.0.1','/project-coverage.snapshot.json?project=../x',400],
  ]) {
    const response={statusCode:0,setHeader(){},end(){}};
    handler({method,url,socket:{remoteAddress:address}},response,()=>assert.fail('next'));
    assert.equal(response.statusCode,status);
  }
});

test('actual coverage producer conflict and defective-reference reasons survive the reader', () => {
  const fixture=JSON.parse(readFileSync(new URL('../../../../../docs/architecture/workspace/examples/project_requirement_trace/requirement_coverage_synthetic_v0.json',import.meta.url),'utf8'));
  for(const defect of ['conflict','floating','malformed']){
    const input=structuredClone(fixture.input);
    const observation=input.observations.find(row=>row.observation_id==='obs-001');
    if(defect==='floating')delete observation.artifact_revision_ref.revision_id;
    if(defect==='malformed')delete observation.artifact_revision_ref.content_id;
    const policy={schema_version:'se_stage_expected_artifact_policy_v0',stage_family_defaults:input.stages.map(stage=>({
      stage_code:stage.stage_code,required_artifact_families:[...new Set(input.needs.filter(need=>input.requirements.some(requirement=>requirement.stage_code===stage.stage_code&&requirement.requirement_ref.entity_id===need.requirement_ref.entity_id)).map(need=>need.needed_artifact_type_id))].map(artifact_family_id=>({artifact_family_id,minimum_presence_rule:'present'})),
    }))};
    const output=buildForgeWorldCoverage({project_code:'SYN-001',source_kind:'sample',coverage_input:input,
      expected_artifact_policy:policy,source_binding:{project_code:'SYN-001',input_revision:worldCoverageDigest(input),policy_digest:worldCoverageDigest(policy)}});
    const expected=defect==='conflict'?'observation_disagreement':`artifact_ref_${defect}`;
    assert.ok(output.slots.some(slot=>slot.reason_counts[expected]>0),`actual producer emitted ${expected}`);
    assert.deepEqual(parseWorldCoverage(JSON.stringify(output),'SYN-001'),output);
  }
});
