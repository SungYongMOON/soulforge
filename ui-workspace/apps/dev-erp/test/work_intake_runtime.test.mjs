import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openWorkIntakeRuntime } from '../src/work_intake_runtime.mjs';
import { createCompanyIntakeFixture } from './helpers/work_intake_runtime_fixture.mjs';
import { repinWorkIntakeContextFixture } from './helpers/work_intake_context_fixture.mjs';

const CLI = fileURLToPath(new URL('../tools/work_intake_cli.mjs', import.meta.url));
const access = { accountId: 'synthetic-reviewer', checkSession: async () => true, canAccessProject: async project => project === 'SYN' };
const nativeCount = f => fs.readFile(path.join(f.jobs.jobRoot, 'child-start-count.txt'), 'utf8').catch(() => '');
async function setup(t, options) {
  const f = await createCompanyIntakeFixture(options); let runtime;
  t.after(async () => { runtime?.close(); await f.close(); });
  return { f, async open(readOnly = false) { runtime?.close(); runtime = await openWorkIntakeRuntime({ ...f.options, readOnly }); return runtime; } };
}
test('real executable composes signed released facts, current Linear, genuine native judge, P0-P3 store and restart readback', async t => {
  const { f, open } = await setup(t);
  const invoke = () => JSON.parse(execFileSync(process.execPath, [CLI, 'run', '--deployment', f.options.deploymentPath, '--sha256', f.options.deploymentSha256],
    { windowsHide: true, encoding: 'utf8', timeout: 90000 }));
  const first = invoke(); assert.equal(first.status, 'COMPLETED'); assert.equal(first.candidates, 1);
  const count = await nativeCount(f), replay = invoke(); assert.equal(replay.status, 'NO_CHANGE'); assert.equal(await nativeCount(f), count);
  const runtime = await open(true), list = await runtime.snapshot({ limit: 10 }, access);
  assert.equal(list.items.length, 1); assert.equal(list.items[0].state, 'COMMITTED');
  const report = await runtime.detail({ run_id: first.run_id, ref: first.result_ref, sha256: first.result_sha256 }, access);
  assert.equal(report.provenance, 'source_bound'); assert.equal(report.data_provenance, 'synthetic');
  assert.equal(report.candidates[0].classification, 'NEW'); assert.equal(report.candidates[0].engineering, null);
  assert.match(report.candidates[0].model_receipt_ref, /^work-intake\.judge\./u);
  assert.equal(report.external_effects, 0); assert.equal(report.official_done, false);
  for (const fact of f.facts) assert.equal(JSON.stringify(report).includes(fact.segments[0].text), false);
  const inspected = await runtime.inspect(); assert.deepEqual(inspected.unknown_models, []);
});
test('actual accepted-context and Rune gap feeds actual Forge preview with preserved exact target bindings', async t => {
  const { f, open } = await setup(t, { engineering: 'missing' });
  const runtime = await open(), result = await runtime.runOnce(); assert.equal(result.status, 'COMPLETED');
  const report = await runtime.detail({ run_id: result.run_id, ref: result.result_ref, sha256: result.result_sha256 }, access);
  const value = report.candidates[0].engineering;
  assert.equal(value.status, 'READ_ONLY_ASSESSED'); assert.equal(value.findings[0].gap_type, 'gap_missing');
  assert.equal(value.candidate.accepted_context_ref, value.ref_bindings.accepted.ref);
  assert.deepEqual(value.ref_bindings.accepted.exact_ref, value.accepted_context_ref);
  assert.equal(value.ref_bindings.findings[0].finding_id, value.findings[0].finding_id);
  assert.equal(report.official_done, false); assert.equal(await nativeCount(f), '1');
});
test('unknown engineering evidence holds before native judgment while lightweight discovery does not need Rune', async t => {
  const { f, open } = await setup(t, { engineering: 'unknown' });
  const runtime = await open(), result = await runtime.runOnce(); assert.equal(result.status, 'HOLD', JSON.stringify(result));
  const report = await runtime.detail({ run_id: result.run_id, ref: result.result_ref, sha256: result.result_sha256 }, access);
  assert.equal(report.candidates[0].classification, 'HOLD'); assert.deepEqual(report.candidates[0].reason_codes, ['ENGINEERING_EVIDENCE_UNKNOWN']);
  assert.equal(await nativeCount(f), '');
});
test('current release revocation and wrong project are rejected before any model call and retained as failures', async t => {
  const { f, open } = await setup(t);
  const runtime = await open();
  const current = JSON.parse(await fs.readFile(f.release.currentPath)); current.revoked = true;
  await f.save(f.release.currentPath, current);
  const result = await runtime.runOnce(); assert.equal(result.status, 'HELD'); assert.equal(await nativeCount(f), '');
  assert.equal((await runtime.inspect()).runs.length, 1);
  current.revoked = false; await f.save(f.release.currentPath, current);
  f.index.project_ref = 'OTHER'; await f.save(f.indexPath, f.index);
  assert.equal((await runtime.runOnce()).status, 'HELD'); assert.equal(await nativeCount(f), '');
});
test('source amendments create a reviewed successor and old exact output remains immutable', async t => {
  const { f, open } = await setup(t);
  let runtime = await open(), first = await runtime.runOnce(); assert.equal(first.status, 'COMPLETED');
  const oldBytes = await fs.readFile(path.join(f.deployment.evidence_root, `${first.result_ref}.json`));
  f.index.generation++;
  f.index.events[0].revision_sha256 = 'e'.repeat(64);
  f.facts[0].segments[0].text = 'Synthetic requester explicitly withdraws the request.';
  f.answer.classification = 'NO_ACTION'; f.answer.reason_code = 'NO_NEW_REQUEST'; f.answer.action_semantic_sha256 = null;
  await f.save(path.join(f.jobs.jobRoot, 'work-intake-reply.json'), f.answer);
  await f.republish(); runtime = await open();
  const corrected = await runtime.runOnce(); assert.equal(corrected.status, 'COMPLETED'); assert.notEqual(corrected.run_id, first.run_id);
  const report = await runtime.detail({ run_id: corrected.run_id, ref: corrected.result_ref, sha256: corrected.result_sha256 }, access);
  assert.equal(report.candidates[0].classification, 'NO_ACTION');
  assert.deepEqual(await fs.readFile(path.join(f.deployment.evidence_root, `${first.result_ref}.json`)), oldBytes);
  assert.equal((await runtime.inspect()).runs.length, 2);
});
test('persisted model uncertainty blocks restart calls without inventing process closure', async t => {
  const { f, open } = await setup(t); await open();
  const db = new DatabaseSync(path.join(f.deployment.control_root, 'work-intake.runtime.sqlite'));
  db.prepare("INSERT INTO intake_runtime_model VALUES(?,?,?,?,'UNKNOWN',?)").run('synthetic.crash', 'synthetic.run', 'a'.repeat(64), 'synthetic.session', 'interrupted'); db.close();
  const runtime = await open(); assert.equal((await runtime.runOnce()).status, 'MODEL_CLOSURE_UNKNOWN');
  assert.equal(await nativeCount(f), ''); assert.equal((await runtime.inspect()).unknown_models.length, 1);
});
test('current project access and exact result hashes protect independent read-only review', async t => {
  const { open } = await setup(t), runtime = await open(), result = await runtime.runOnce();
  await assert.rejects(runtime.snapshot({}, { ...access, checkSession: async () => false }), /VIEW_FORBIDDEN/);
  await assert.rejects(runtime.snapshot({}, { ...access, canAccessProject: async () => false }), /VIEW_FORBIDDEN/);
  await assert.rejects(runtime.detail({ run_id: result.run_id, ref: result.result_ref, sha256: 'f'.repeat(64) }, access), /RESULT_NOT_FOUND/);
});
test('producer cannot replace trusted reviewer and verifier binding even with unchanged valid permit signature', async t => {
  const { f, open } = await setup(t);
  const binding = JSON.parse(await fs.readFile(f.release.bindingPath));
  const review = JSON.parse(await fs.readFile(binding.review.path)); review.actor_ref = 'reviewer.self-asserted';
  binding.review = await f.save(binding.review.path, review); binding.expected.reviewer_ref = review.actor_ref;
  const substituted = await f.save(f.release.bindingPath, binding);
  for (const entry of [...f.index.events, ...f.index.linear_projections]) entry.release_binding = substituted;
  await f.save(f.indexPath, f.index);
  const runtime = await open(), result = await runtime.runOnce();
  assert.equal(result.status, 'HELD'); assert.equal(result.reason, 'INTAKE_RELEASE_PROFILE_MISMATCH'); assert.equal(await nativeCount(f), '');
});
test('stored correction rejection remains HOLD with no active candidate or Forge preview', async t => {
  const { f, open } = await setup(t, { engineering: 'missing' });
  f.index.events[0].correction = { supersedes_cycle_ref: 'cycle:missing', category: 'EVIDENCE_CORRECTION' };
  await f.republish();
  const runtime = await open(), result = await runtime.runOnce(); assert.equal(result.status, 'HOLD');
  const report = await runtime.detail({ run_id: result.run_id, ref: result.result_ref, sha256: result.result_sha256 }, access);
  assert.equal(report.decision_status, 'HOLD'); assert.equal(report.applied_candidates, 0);
  assert.equal(report.candidates[0].classification, 'HOLD'); assert.equal(report.candidates[0].engineering.candidate, null);
  assert.ok(report.store_receipt.decisions.every(decision => decision.status === 'ROLLED_BACK'));
});
test('explicit material-change source retains its source identity through real discovery instead of becoming mail', async t => {
  const { f, open } = await setup(t);
  f.grant.allowed_sources = ['gmail', 'file_change'];
  f.grant.source_lanes = { file_change: 'source.team_files' };
  const original = f.index.source_reads[0]; original.status = 'empty'; f.index.captures[0].item_count = 0;
  f.index.source_reads.push({ ...original, source: 'file_change', scope_ref: 'scope:file_change', status: 'read',
    evidence_refs: ['capture.file.synthetic'] });
  f.index.captures.push({ ...f.index.captures[0], source_ref: 'source.team_files', item_count: 1, capture_ref: 'capture.file.synthetic' });
  f.index.events[0].source = 'file_change'; f.index.events[0].scope_ref = 'scope:file_change';
  f.facts[0].segments[0].text = 'Synthetic released drawing revision requests additional verification.';
  await f.republish();
  const runtime = await open(), result = await runtime.runOnce(); assert.equal(result.status, 'COMPLETED', JSON.stringify(result));
  const storeDb = new DatabaseSync(path.join(f.deployment.control_root, 'work-intake.source-bound.sqlite'), { readOnly: true });
  const stored = JSON.parse(storeDb.prepare('SELECT payload FROM intake_runs').get().payload); storeDb.close();
  assert.equal(stored.attempts.find(attempt => attempt.kind === 'event').source, 'file_change');
});
test('invalid unstarted judge configuration is recoverable without pretending that a model is still running', async t => {
  const { f, open } = await setup(t);
  f.deployment.judge.purpose = 'invalid-purpose'; await f.reseal();
  let runtime = await open(), result = await runtime.runOnce();
  assert.equal(result.status, 'HELD'); assert.equal(await nativeCount(f), '');
  assert.deepEqual((await runtime.inspect()).unknown_models, []);
  assert.equal((await runtime.inspect()).runs[0].state, 'HELD');
  f.deployment.judge.purpose = 'company_work_discovery'; await f.reseal(); runtime = await open();
  result = await runtime.runOnce(); assert.equal(result.status, 'COMPLETED'); assert.equal(await nativeCount(f), '1');
});
test('released data cannot inherit a disabled synthetic release route', async t => {
  const { f, open } = await setup(t);
  f.deployment.data_provenance = 'released'; await f.reseal();
  const runtime = await open(), result = await runtime.runOnce();
  assert.equal(result.status, 'HELD'); assert.equal(result.reason, 'INTAKE_LIVE_ROUTE_DISABLED'); assert.equal(await nativeCount(f), '');
});
test('fresh historical as-of cannot apply an exception that has already expired in the current company pipeline', async t => {
  const { f, open } = await setup(t, { engineering: 'layers' });
  const now = Date.now(), asOf = new Date(now - 240000).toISOString(), expired = new Date(now - 60000).toISOString();
  const context = f.context;
  context.request.as_of = asOf; context.typed.engine.taken_at = asOf; context.typed.engine.valid_at = asOf;
  const exception = { exception_ref: context.profileRefs.project[5], approval_ref: context.profileRefs.project[6],
    rule_revision_ref: context.profileRefs.project[2], scope: structuredClone(context.typed.rule_profile.selection),
    expected_element_id: 'grade_basic_rule', decision: 'exclude', approved: true, approver_kind: 'registered_human',
    valid_at: asOf, expires_at: expired };
  context.typed.rule_profile.exceptions = [exception]; context.config.rule_profile_binding.approved_exceptions = [structuredClone(exception)];
  repinWorkIntakeContextFixture(context);
  f.index.window.end = asOf; f.index.events[0].observed_at = asOf;
  f.index.events[0].occurred_at = new Date(Date.parse(asOf) - 1000).toISOString();
  f.index.events[0].engineering = { config: { path: context.options.configPath, sha256: context.options.configSha256 }, request: context.request };
  await f.republish();
  const runtime = await open(), result = await runtime.runOnce(); assert.equal(result.status, 'HOLD', JSON.stringify(result));
  assert.equal(await nativeCount(f), '');
  const report = await runtime.detail({ run_id: result.run_id, ref: result.result_ref, sha256: result.result_sha256 }, access);
  assert.equal(report.candidates[0].engineering.status, 'HOLD'); assert.equal(report.candidates[0].engineering.candidate, null);
});
test('stale engineering item does not prevent independent lightweight discovery in the same released batch', async t => {
  const { f, open } = await setup(t, { engineering: 'missing' });
  const light = f.index.events[0], stale = structuredClone(light);
  delete light.engineering; stale.event_ref = 'event.engineering.stale';
  stale.engineering.request.as_of = new Date(Date.now() - 3600000).toISOString();
  f.index.events.push(stale); f.index.captures[0].item_count = 2; await f.republish();
  const runtime = await open(), result = await runtime.runOnce(); assert.equal(result.status, 'HOLD', JSON.stringify(result));
  const report = await runtime.detail({ run_id: result.run_id, ref: result.result_ref, sha256: result.result_sha256 }, access);
  assert.equal(report.candidates.find(item => item.event_ref === light.event_ref).classification, 'NEW');
  assert.equal(report.candidates.find(item => item.event_ref === stale.event_ref).classification, 'HOLD');
  assert.equal(report.applied_candidates, 1); assert.equal(await nativeCount(f), '1');
});
