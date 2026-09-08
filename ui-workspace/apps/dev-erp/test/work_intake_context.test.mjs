import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkIntakeContextConsumer } from '../src/work_intake_context.mjs';
import { workIntakeContextFixture, writeJson } from './helpers/work_intake_context_fixture.mjs';
import { ref } from './helpers/accepted_context_fixture.mjs';

async function setup(t, options) {
  const f = await workIntakeContextFixture(options);
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  return { ...f, consumer: createWorkIntakeContextConsumer(f.options) };
}
function held(result) {
  assert.equal(result.status, 'HOLD'); assert.equal(result.accepted_context_ref, null);
  assert.deepEqual(result.engine_finding_refs, []); assert.deepEqual(result.findings, []);
  assert.equal(result.side_effects, 0); assert.equal(result.official_done, false);
}

test('genuine accepted file generation reaches the actual Rune pass and preserves unknown', async t => {
  const f = await setup(t);
  const result = await f.consumer.read(f.request);
  assert.equal(result.status, 'READ_ONLY_ASSESSED');
  assert.deepEqual(result.accepted_context_ref, f.request.accepted_generation_ref);
  assert.equal(result.findings[0].gap_type, 'gap_unknown');
  assert.equal(result.findings[0].evidence_claim_ceiling, 'unknown');
  assert.deepEqual(result.engine_finding_refs, result.findings.map(finding => finding.finding_id));
  assert.equal(result.findings[0].snapshot_id, result.assessment.snapshot_id);
  assert.equal(result.findings[0].disposition_state, 'candidate');
  assert.equal(result.side_effects, 0); assert.equal(result.official_done, false);
  assert.match(result.evidence_digests.engine_fingerprint_sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(result).includes(f.root), false);
  const replay = await f.consumer.read(f.request);
  assert.equal(replay.evidence_digests.engine_fingerprint_sha256, result.evidence_digests.engine_fingerprint_sha256);
  assert.notEqual(replay.assessment.snapshot_id, result.assessment.snapshot_id);
});

test('confirmed absence alone yields gap_missing and present evidence yields no gap', async t => {
  const missing = await setup(t, { presence: 'absence_confirmed' });
  const result = await missing.consumer.read(missing.request);
  assert.equal(result.status, 'READ_ONLY_ASSESSED');
  assert.equal(result.findings[0].gap_type, 'gap_missing');
  const present = await setup(t, { presence: 'present' });
  const satisfied = await present.consumer.read(present.request);
  assert.equal(satisfied.status, 'READ_ONLY_ASSESSED'); assert.deepEqual(satisfied.findings, []);
});

test('wrong project, generation, actor and absent typed evidence have uniform HOLD', async t => {
  const f = await setup(t);
  for (const delta of [{ project_ref: ref(999) }, { accepted_generation_ref: ref(998) }, { actor_ref: 'actor:other' },
    { typed_input: null }, { typed_input: { path: join(f.trusted, 'missing.json'), sha256: f.request.typed_input.sha256 } }]) {
    held(await f.consumer.read({ ...f.request, ...delta }));
  }
});

test('current ACL revocation after construction blocks previous successful access', async t => {
  const f = await setup(t);
  assert.equal((await f.consumer.read(f.request)).status, 'READ_ONLY_ASSESSED');
  writeJson(f.files.acl.path, { ...f.acl, revoked_actors: [f.request.actor_ref] });
  held(await f.consumer.read(f.request));
});

test('ACL revocation during reader awaits cannot return stale engine evidence', async t => {
  const f = await setup(t);
  const pending = f.consumer.read(f.request);
  queueMicrotask(() => writeJson(f.files.acl.path, { ...f.acl, revoked_actors: [f.request.actor_ref] }));
  held(await pending);
});

test('accessor input is refused without executing caller code', async t => {
  const f = await setup(t); let accessed = false;
  const input = { ...f.request };
  Object.defineProperty(input, 'typed_input', { enumerable: true, get() { accessed = true; return f.request.typed_input; } });
  held(await f.consumer.read(input)); assert.equal(accessed, false);
});

test('current source revision change and pointer advance cannot reuse accepted generation', async t => {
  const f = await setup(t);
  const source = structuredClone(f.accepted.state.source);
  source.source_revision_refs[0].source_revision_ref = ref(987);
  writeJson(f.files.source_revisions.path, source);
  held(await f.consumer.read(f.request));
  writeJson(f.files.source_revisions.path, f.accepted.state.source);
  writeJson(f.files.pointer.path, { ...f.accepted.store.getCurrentPointer(), generation_ref: ref(986) });
  held(await f.consumer.read(f.request));
});

test('missing or modified accepted bytes and configuration digest fail closed', async t => {
  const f = await setup(t);
  const saved = readFileSync(f.files.accepted_generation.path);
  writeFileSync(f.files.accepted_generation.path, '{}'); held(await f.consumer.read(f.request));
  writeFileSync(f.files.accepted_generation.path, saved);
  rmSync(f.files.accepted_generation.path); held(await f.consumer.read(f.request));
  writeJson(f.options.configPath, { ...f.config, producer_binding_ref: ref(981) });
  held(await f.consumer.read(f.request));
});

test('typed source and expected/observed refs must be current active accepted revisions', async t => {
  for (const mutateTyped of [typed => { typed.project_ref = ref(99); },
    typed => { typed.accepted_generation_ref = ref(98); },
    typed => { typed.source_revision_refs[0] = ref(97); },
    typed => { typed.engine.states.observed[0].artifact_revision_ref = ref(96); },
    typed => { typed.engine.states.expected = []; },
    typed => { typed.engine.states.observed[0].known_at = '2027-01-01T00:00:00.000Z'; }]) {
    const f = await setup(t, { mutateTyped }); held(await f.consumer.read(f.request));
  }
});

test('writable roots cannot supply pinned configuration or typed evidence', async t => {
  const f = await setup(t);
  const configFile = writeJson(join(f.writable, 'config.json'), f.config);
  held(await createWorkIntakeContextConsumer({ ...f.options, configPath: configFile.path, configSha256: configFile.sha256 }).read(f.request));
  const typedInput = writeJson(join(f.writable, 'typed.json'), f.typed);
  held(await f.consumer.read({ ...f.request, typed_input: typedInput }));
  writeFileSync(f.request.typed_input.path, '{}'); held(await f.consumer.read(f.request));
});

test('linked configured input is rejected even when bytes match', async t => {
  const f = await setup(t);
  const alias = join(f.root, 'linked');
  symlinkSync(f.trusted, alias, process.platform === 'win32' ? 'junction' : 'dir');
  held(await createWorkIntakeContextConsumer({ ...f.options,
    configPath: join(alias, 'context-config.json') }).read(f.request));
});
