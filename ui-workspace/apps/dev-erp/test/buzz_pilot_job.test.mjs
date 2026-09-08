import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProtectedWorkingBytes } from '../../../../guild_hall/shared/protected_working_bytes.mjs';
import { BUZZ_PILOT_ROLES, createBuzzPilotJob } from '../src/buzz_pilot_job.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const iso = value => new Date(value).toISOString();
const OWNER = '1'.repeat(64), BOT = '2'.repeat(64), CHAT = '00000000-0000-4000-8000-000000000001';
const message = number => number.toString(16).padStart(64, '0');
const instruction = Buffer.from('  Review the synthetic note and clarify its audience.\n');
const question = 'Who should read this synthetic note?';
const choices = ['Engineering', 'Management'];
const input = { question, choices, multi_select: false };
const access = { accountId: 'owner.synthetic', checkSession: async () => true,
  canAccessProject: async projectId => projectId === 'project.synthetic' };

async function fixture(t, options = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'buzz-pilot-ledger-'));
  const root = path.join(parent, 'protected'); await mkdir(root);
  const f = { parent, root, time: Date.parse('2026-09-08T00:00:01.000Z'), permit: true, calls: [] };
  const binding = { version: 1, job_id: 'job.synthetic', project_id: 'project.synthetic',
    owner_account_id: access.accountId, expected_owner_pubkey: OWNER, expected_bot_pubkey: BOT,
    chat_id: CHAT, profile_ref: 'profile.synthetic', instruction_sha256: hash(instruction),
    issued_at: '2026-09-08T00:00:00.000Z', expires_at: '2026-09-08T01:00:00.000Z' };
  const port = createProtectedWorkingBytes({ root, repositoryRoot, storageClass: 'owner_approved_shared_worksite',
    ownerApprovalRef: 'approval.synthetic-buzz', roles: BUZZ_PILOT_ROLES });
  f.binding = binding; f.port = port; f.dbPath = path.join(parent, 'control.sqlite');
  f.db = new DatabaseSync(f.dbPath);
  f.authorize = async (action, context, actor) => {
    f.calls.push({ action, context });
    if (!f.permit) return false;
    if (action === 'append') return actor.job_id === context.job_id;
    return actor?.accountId === context.owner_account_id && await actor?.checkSession?.() === true
      && await actor?.canAccessProject?.(context.project_id) === true;
  };
  f.make = (overrides = {}) => createBuzzPilotJob({ db: f.db, workingBytes: port, binding,
    authorize: f.authorize, now: () => f.time, ...overrides });
  f.core = f.make(options);
  f.event = (type, payload, overrides = {}) => ({ version: 1, observation_id: `event.${++f.counter}`,
    job_id: binding.job_id, event_type: type, profile_ref: binding.profile_ref, chat_id: CHAT, bot_pubkey: BOT,
    actor_pubkey: ['instruction_received', 'answer_received', 'answer_accepted'].includes(type) ? OWNER : BOT,
    session_key: 'session:synthetic', session_id: 'session.actual-1', observed_at: iso(f.time), payload, ...overrides });
  f.counter = 0;
  f.issue = () => f.core.issue({ instructionBytes: instruction }, access);
  f.append = (type, payload, overrides) => f.core.append(f.event(type, payload, overrides));
  t.after(async () => { f.db.close(); await rm(parent, { recursive: true, force: true }); });
  return f;
}
async function started(f, { rawInput = input, inputContract } = {}) {
  await f.issue();
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString().trim() }, { session_id: null });
  return f.append('tool_started', { tool_call_id: 'call.actual-1', tool_name: 'clarify', input: rawInput,
    ...(inputContract === undefined ? {} : { input_contract: inputContract }) });
}
async function registered(f) {
  await started(f);
  await f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...input });
}
async function waiting(f) {
  await registered(f);
  await f.append('question_delivery', { clarify_id: 'clarify.actual-1', delivery_status: 'sent', message_id: message(2) });
}
async function answered(f) {
  await waiting(f);
  await f.append('answer_received', { clarify_id: 'clarify.actual-1', message_id: message(3), text: 'Engineering' });
  await f.append('answer_accepted', { clarify_id: 'clarify.actual-1', message_id: message(3) });
  await f.append('resumed', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1' });
}
async function finished(f) {
  await answered(f);
  await f.append('tool_completed', { tool_call_id: 'call.actual-1', tool_name: 'clarify', output: 'Engineering', outcome: 'completed' });
  await f.append('final_response', { text: 'Synthetic public review: the note needs an engineering audience.' });
  await f.append('final_delivery', { delivery_status: 'sent', message_id: message(4) });
}
const code = expected => error => { assert.equal(error.code, expected); return true; };

test('v2 preserves raw input separately and registers only the exact actual prepared JSON SHA', async t => {
  const f = await fixture(t);
  const raw = { question: '  Who is this for?  ', choices: ['Engineering (recommended)', 'Management'] };
  const effective = { question: 'Who is this for?', choices: ['⭐ Engineering (recommended)', 'Management'], multi_select: false };
  const start = await started(f, { rawInput: raw, inputContract: 'prepared_v2' });
  const prepared = await f.append('tool_input_prepared', { tool_call_id: 'call.actual-1', tool_name: 'clarify',
    tool_input_ref: start.evidence_refs[0].ref, input: effective });
  const ref = prepared.evidence_refs[0]; assert.equal(ref.role, 'tool_input_effective');
  const rawRead = await f.core.readEvidence({ role: 'tool_input', observation_id: start.observation_id }, access);
  const effectiveRead = await f.core.readEvidence({ role: 'tool_input_effective', observation_id: prepared.observation_id }, access);
  assert.deepEqual(JSON.parse(rawRead.bytes), raw); assert.deepEqual(JSON.parse(effectiveRead.bytes), effective);
  assert.equal(effectiveRead.bytes.toString(), JSON.stringify({ choices: effective.choices, multi_select: false, question: effective.question }));
  assert.notEqual(rawRead.sha256, ref.sha256); assert.equal(hash(effectiveRead.bytes), ref.sha256);
  assert.equal(JSON.parse(f.db.prepare('SELECT state_json FROM buzz_pilot_jobs').get().state_json).question_shape_sha256, ref.sha256);
  await f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...effective });
  await f.append('question_delivery', { clarify_id: 'clarify.actual-1', delivery_status: 'sent', message_id: message(2) });
  const view = await f.core.snapshot(access); assert.equal(view.state, 'waiting_owner'); assert.equal(view.sequence, 5);
  assert.equal(view.evidence_refs.length, 5); assert.equal(view.actual_tool_starts, 1);
  const metadata = JSON.stringify(view) + JSON.stringify(f.db.prepare('SELECT * FROM buzz_pilot_events').all());
  for (const text of [raw.question, effective.question, effective.choices[0]]) assert.equal(metadata.includes(text), false);
  await f.append('answer_received', { clarify_id: 'clarify.actual-1', message_id: message(3), text: 'Engineering' });
  await f.append('answer_accepted', { clarify_id: 'clarify.actual-1', message_id: message(3) });
  await f.append('resumed', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1' });
  await f.append('tool_completed', { tool_call_id: 'call.actual-1', tool_name: 'clarify', output: 'Engineering', outcome: 'completed' });
  await f.append('final_response', { text: 'The synthetic note is for engineering.' });
  await f.append('final_delivery', { delivery_status: 'sent', message_id: message(4) });
  const final = await f.core.snapshot(access); assert.equal(final.state, 'delivered'); assert.equal(final.sequence, 11);
  assert.equal(final.evidence_refs.length, 8); assert.equal(final.actual_tool_completions, 1);
  assert.equal(final.event_refs.filter(row => row.event_type === 'resumed').length, 1);
  assert.equal(final.official_done, false); assert.equal(final.human_accepted, false); assert.equal(final.canonical, false);
});

test('v2 marker requires preparation; unknown markers and legacy preparation are refused', async t => {
  const f = await fixture(t); await f.issue();
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString() });
  for (const input_contract of ['raw_v1', 'prepared_v3', null, true]) await assert.rejects(f.append('tool_started', {
    tool_call_id: 'call.actual-1', tool_name: 'clarify', input, input_contract }), code('buzz_pilot_input_contract_invalid'));
  await f.append('tool_started', { tool_call_id: 'call.actual-1', tool_name: 'clarify', input, input_contract: 'prepared_v2' });
  await assert.rejects(f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...input }),
    code('buzz_pilot_prepared_input_required'));
  assert.equal((await f.core.snapshot(access)).sequence, 2);
  const legacy = await fixture(t); const start = await started(legacy);
  await assert.rejects(legacy.append('tool_input_prepared', { tool_call_id: 'call.actual-1', tool_name: 'clarify',
    tool_input_ref: start.evidence_refs[0].ref, input }), code('buzz_pilot_prepared_input_mismatch'));
  await legacy.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...input });
});

test('prepared input rejects wrong call, raw ref, tool, contract change and malformed callback values', async t => {
  const f = await fixture(t); const start = await started(f, { inputContract: 'prepared_v2' });
  const payload = { tool_call_id: 'call.actual-1', tool_name: 'clarify', tool_input_ref: start.evidence_refs[0].ref, input };
  for (const delta of [{ tool_call_id: 'call.other' }, { tool_input_ref: `${start.evidence_refs[0].ref}x` },
    { tool_input_ref: start.evidence_refs[0] }, { tool_name: 'other' }, { input_contract: 'raw_v1' },
    { input: { question } }, { input: { ...input, choices: null } }, { input: { ...input, multi_select: null } },
    { input: { ...input, choices: 'Engineering' } }, { input: { ...input, extra: true } }]) {
    await assert.rejects(f.append('tool_input_prepared', { ...payload, ...delta }));
  }
  assert.equal((await f.core.snapshot(access)).sequence, 2);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM buzz_pilot_events WHERE committed = 0').get().n, 0);
});

test('prepared replay survives reopen; duplicate preparation and later question mutation cannot advance', async t => {
  const f = await fixture(t); const start = await started(f, { inputContract: 'prepared_v2' });
  const effective = { ...input, choices: ['⭐ Engineering (recommended)', 'Management'] };
  const event = f.event('tool_input_prepared', { tool_call_id: 'call.actual-1', tool_name: 'clarify',
    tool_input_ref: start.evidence_refs[0].ref, input: effective });
  const first = await f.core.append(event);
  f.db.close(); f.db = new DatabaseSync(f.dbPath); f.core = f.make();
  assert.deepEqual(await f.core.append(event), { ...first, status: 'replayed' });
  await assert.rejects(f.core.append({ ...event, payload: { ...event.payload, input } }), code('buzz_pilot_conflicting_replay'));
  await assert.rejects(f.append('tool_input_prepared', event.payload), code('buzz_pilot_prepared_input_mismatch'));
  for (const delta of [{ question: `${question} ` }, { choices }, { choices: [...effective.choices].reverse() },
    { choices: ['⭐ Engineering (recommended) ', 'Management'] }, { multi_select: true }]) {
    await assert.rejects(f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1',
      ...effective, ...delta }), code('buzz_pilot_question_mismatch'));
  }
  assert.equal((await f.core.snapshot(access)).sequence, 3);
  await f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...effective });
  await assert.rejects(f.append('tool_input_prepared', event.payload), code('buzz_pilot_event_order'));
  assert.equal((await f.core.snapshot(access)).sequence, 4);
});

test('prepared capture interruption needs exact recovery and keeps current read authority and immutable bytes', async t => {
  const f = await fixture(t); const start = await started(f, { inputContract: 'prepared_v2' });
  const event = f.event('tool_input_prepared', { tool_call_id: 'call.actual-1', tool_name: 'clarify',
    tool_input_ref: start.evidence_refs[0].ref, input });
  f.core = f.make({ workingBytes: { ...f.port, async writeRole(args) {
    await f.port.writeRole(args); throw Object.assign(new Error('synthetic_interruption'), { code: 'synthetic_interruption' });
  } } });
  await assert.rejects(f.core.append(event), code('synthetic_interruption'));
  let view = await f.core.snapshot(access); assert.equal(view.state, 'capture_incomplete'); assert.equal(view.sequence, 2);
  assert.equal(view.operations_attention, true); assert.equal(view.owner_action_required, false);
  await assert.rejects(f.append('failed', { reason_code: 'pilot_append_unknown' }), code('buzz_pilot_capture_incomplete'));
  f.db.close(); f.db = new DatabaseSync(f.dbPath); f.core = f.make();
  const ack = await f.core.append(event); assert.equal(ack.seq, 3);
  const query = { role: 'tool_input_effective', observation_id: event.observation_id };
  const before = await readFile(f.dbPath), reader = f.make({ readOnly: true });
  assert.equal((await reader.readEvidence(query, access)).sha256, ack.evidence_refs[0].sha256);
  await assert.rejects(reader.append(event), code('buzz_pilot_read_only'));
  assert.deepEqual(await readFile(f.dbPath), before);
  f.permit = false; await assert.rejects(reader.readEvidence(query, access), code('buzz_pilot_not_authorized')); f.permit = true;
  const ref = JSON.parse(f.db.prepare('SELECT evidence_json FROM buzz_pilot_events WHERE observation_id = ?').get(event.observation_id).evidence_json)[0];
  const filename = path.join(f.root, ref.groupId, 'tool_input_effective.json');
  await chmod(filename, 0o600); await writeFile(filename, '{}');
  await assert.rejects(reader.readEvidence(query, access), code('protected_bytes_digest_mismatch'));
  assert.equal(await readFile(filename, 'utf8'), '{}');
});

test('a rejected registration remains unrecorded until an observed native failure is appended separately', async t => {
  const f = await fixture(t); await started(f);
  await assert.rejects(f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1',
    ...input, choices: ['⭐ Engineering (recommended)', 'Management'] }), code('buzz_pilot_question_mismatch'));
  let view = await f.core.snapshot(access); assert.equal(view.state, 'tool_running'); assert.equal(view.sequence, 2);
  assert.equal(view.failure_reason_code, null); assert.equal(view.owner_action_required, false);
  const failed = f.event('failed', { reason_code: 'pilot_append_rejected' }); await f.core.append(failed);
  f.db.close(); f.db = new DatabaseSync(f.dbPath); f.core = f.make({ readOnly: true });
  view = await f.core.snapshot(access); assert.equal(view.state, 'failed'); assert.equal(view.sequence, 3);
  assert.equal(view.operations_attention, true); assert.equal(view.failure_reason_code, 'pilot_append_rejected');
  assert.equal(view.question_ref, null); assert.equal(view.answer_ref, null); assert.equal(view.final_produced, false);
  assert.deepEqual(view.event_refs.map(row => row.event_type), ['instruction_received', 'tool_started', 'failed']);
});

test('full text flow uses actual SQLite and protected bytes, with separate production/delivery/acceptance facts', async t => {
  const f = await fixture(t); await finished(f);
  const view = await f.core.snapshot(access);
  assert.equal(view.state, 'delivered'); assert.equal(view.sequence, 10);
  assert.equal(view.actual_tool_starts, 1); assert.equal(view.actual_tool_completions, 1);
  assert.equal(view.final_produced, true); assert.equal(view.final_delivered, true);
  assert.equal(view.result_verification, 'not_verified'); assert.equal(view.human_accepted, false);
  assert.equal(view.official_done, false); assert.equal(view.canonical, false);
  assert.equal(view.buzz_url, `buzz://message?channel=${CHAT}&id=${message(2)}`);
  assert.equal(view.evidence_refs.length, 7);
  const original = await f.core.readEvidence({ role: 'instruction' }, access);
  assert.deepEqual(original.bytes, instruction); assert.equal(original.sha256, hash(instruction));
  for (const event of view.event_refs) for (const ref of event.evidence_refs) {
    const read = await f.core.readEvidence({ observation_id: event.observation_id, role: ref.role }, access);
    assert.equal(read.ref, ref.ref); assert.equal(hash(read.bytes), ref.sha256); assert.equal(read.size, ref.size);
  }
  const dbText = JSON.stringify(f.db.prepare('SELECT * FROM buzz_pilot_jobs').all())
    + JSON.stringify(f.db.prepare('SELECT * FROM buzz_pilot_events').all());
  for (const raw of [instruction.toString().trim(), question, 'Engineering', 'Synthetic public review']) assert.equal(dbText.includes(raw), false);
  assert.equal(JSON.stringify(view).includes(f.root), false);
});

test('only a sent, current pending question exposes Owner action and wallclock wait', async t => {
  const f = await fixture(t); await waiting(f); f.time += 5000;
  const view = await f.core.snapshot(access);
  assert.equal(view.state, 'waiting_owner'); assert.equal(view.wait_elapsed_ms, 5000);
  assert.equal(view.owner_action_required, true); assert.equal(view.operations_attention, false);
  assert.deepEqual(view.expected_responder, { account_id: access.accountId, pubkey: OWNER });
  assert.ok(view.question_ref); assert.equal(view.actual_tool_starts, 1); assert.equal(view.actual_tool_completions, 0);
});

for (const status of ['unknown', 'failed']) test(`question send ${status} remains operations attention and cannot accept an answer`, async t => {
  const f = await fixture(t); await registered(f);
  await f.append('question_delivery', { clarify_id: 'clarify.actual-1', delivery_status: status, message_id: null });
  const view = await f.core.snapshot(access);
  assert.equal(view.state, `question_delivery_${status}`); assert.equal(view.owner_action_required, false);
  assert.equal(view.operations_attention, true); assert.equal(view.expected_responder, null); assert.equal(view.wait_started_at, null);
  await assert.rejects(f.append('answer_received', { clarify_id: 'clarify.actual-1', message_id: message(3), text: 'Engineering' }), code('buzz_pilot_event_order'));
});

test('final produced, uncertain delivery and failed/cancelled outcomes remain distinct', async t => {
  const f = await fixture(t); await f.issue();
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString() });
  await f.append('final_response', { text: 'A synthetic review.' });
  let view = await f.core.snapshot(access);
  assert.equal(view.final_produced, true); assert.equal(view.final_delivered, false); assert.equal(view.state, 'final_produced');
  await f.append('final_delivery', { delivery_status: 'unknown', message_id: null });
  view = await f.core.snapshot(access); assert.equal(view.state, 'final_delivery_unknown');
  assert.equal(view.final_delivered, false); assert.equal(view.operations_attention, true);
  await assert.rejects(f.append('failed', { reason_code: 'later_error' }), code('buzz_pilot_terminal'));
});

for (const outcome of ['cancelled', 'failed']) test(`actual early tool ${outcome} needs no fabricated answer or resume`, async t => {
  const f = await fixture(t); await started(f);
  await f.append('tool_completed', { tool_call_id: 'call.actual-1', tool_name: 'clarify', output: 'No answer was accepted.', outcome });
  const view = await f.core.snapshot(access);
  assert.equal(view.state, outcome); assert.equal(view.actual_tool_completions, 1); assert.equal(view.answer_ref, null);
  assert.equal(view.event_refs.some(event => event.event_type === 'resumed'), false);
});

test('binding requires exact core shape, typed pins and mandatory trusted authorization', async t => {
  const f = await fixture(t);
  for (const delta of [{ other: true }, { version: 2 }, { chat_id: 'display-name' }, { expected_bot_pubkey: OWNER },
    { instruction_sha256: 'approval.valid' }, { issued_at: '2026-02-30T00:00:00.000Z' }, { issued_at: '2026-09-08T00:00:00Z' }]) {
    assert.throws(() => f.make({ binding: { ...f.binding, ...delta } }));
  }
  assert.throws(() => f.make({ authorize: undefined }), code('buzz_pilot_ports_required'));
  f.permit = false; await assert.rejects(f.issue(), code('buzz_pilot_not_authorized'));
  const authRef = f.make({ authorize: () => 'approval.valid' });
  await assert.rejects(authRef.issue({ instructionBytes: instruction }, access), code('buzz_pilot_not_authorized'));
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM buzz_pilot_jobs').get().n, 0);
});

test('instruction bytes are pinned UTF-8 and preserve documented edge trimming only', async t => {
  const f = await fixture(t);
  await assert.rejects(f.core.issue({ instructionBytes: Buffer.from('changed') }, access), code('buzz_pilot_instruction_mismatch'));
  await f.issue();
  await assert.rejects(f.append('instruction_received', { message_id: message(1), text: 'Review something else' }), code('buzz_pilot_instruction_mismatch'));
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString().trim() });
  const huge = Buffer.alloc(65537, 97);
  const oversized = f.make({ binding: { ...f.binding, instruction_sha256: hash(huge) } });
  await assert.rejects(oversized.issue({ instructionBytes: huge }, access));
  const badUtf8 = Buffer.from([0xc0, 0xaf]);
  const invalid = f.make({ binding: { ...f.binding, instruction_sha256: hash(badUtf8) } });
  await assert.rejects(invalid.issue({ instructionBytes: badUtf8 }, access));
});

test('trusted snapshot exposes only the stored current issued instruction comparison digest', async t => {
  const f = await fixture(t);
  await assert.rejects(f.core.snapshot(access), code('buzz_pilot_job_missing'));
  await f.issue();
  const stored = f.db.prepare('SELECT instruction_trim_sha256 FROM buzz_pilot_jobs').get().instruction_trim_sha256;
  const before = await readFile(f.dbPath);
  const view = await f.core.snapshot(access);
  assert.equal(view.recovery_metadata.instruction_trim_sha256, stored);
  assert.equal(stored, hash(instruction.toString().trim()));
  assert.notEqual(stored, f.binding.instruction_sha256);
  assert.equal(view.evidence_refs[0].sha256, f.binding.instruction_sha256);
  assert.equal(JSON.stringify(view).includes(instruction.toString().trim()), false);
  assert.deepEqual(await readFile(f.dbPath), before);
  await assert.rejects(f.core.snapshot({ ...access, accountId: 'wrong.owner' }), code('buzz_pilot_not_authorized'));
  const historical = f.make({ binding: { ...f.binding, instruction_sha256: hash('other instruction') } });
  assert.equal((await historical.snapshot(access)).recovery_metadata.instruction_trim_sha256, null);
  f.db.prepare('UPDATE buzz_pilot_jobs SET issued = 0').run();
  assert.equal((await f.core.snapshot(access)).state, 'capture_incomplete');
  assert.equal((await f.core.snapshot(access)).recovery_metadata.instruction_trim_sha256, null);
  for (const invalid of ['', 'SHA256:' + 'a'.repeat(64), 'sha256:missing']) {
    f.db.prepare('UPDATE buzz_pilot_jobs SET instruction_trim_sha256 = ?').run(invalid);
    await assert.rejects(f.core.snapshot(access), code('buzz_pilot_ledger_corrupt'));
  }
});

test('instruction comparison digest keeps ECMAScript trim semantics and interior UTF-8 bytes', async t => {
  for (const [raw, trimmed] of [['\uFEFF\u00A0\t A  B\r\nC \u2028\u2029', 'A  B\r\nC'],
    ['\u0085A\u0085', '\u0085A\u0085'], ['\u200BA\u200B', '\u200BA\u200B']]) {
    const f = await fixture(t), bytes = Buffer.from(raw);
    f.core = f.make({ binding: { ...f.binding, instruction_sha256: hash(bytes) } });
    await f.core.issue({ instructionBytes: bytes }, access);
    assert.equal((await f.core.snapshot(access)).recovery_metadata.instruction_trim_sha256, hash(trimmed));
    await f.append('instruction_received', { message_id: message(1), text: trimmed });
    assert.deepEqual((await f.core.readEvidence({ role: 'instruction' }, access)).bytes, bytes);
  }
});

test('wrong actor/source/project/chat/profile/key and unknown/thinking fields are refused before capture', async t => {
  const f = await fixture(t); await f.issue();
  const event = f.event('instruction_received', { message_id: message(1), text: instruction.toString() });
  for (const delta of [{ actor_pubkey: BOT }, { bot_pubkey: OWNER }, { chat_id: '00000000-0000-4000-8000-000000000009' },
    { profile_ref: 'profile.other' }, { job_id: 'job.other' }, { session_key: null }, { reasoning: 'hidden' }]) {
    await assert.rejects(f.core.append({ ...event, ...delta }));
  }
  await assert.rejects(f.core.append({ ...event, payload: { ...event.payload, thinking: 'hidden' } }), code('buzz_pilot_unknown_field'));
  const hidden = { ...event }; Object.defineProperty(hidden, 'hidden', { value: 1 });
  await assert.rejects(f.core.append(hidden), code('buzz_pilot_input_invalid'));
  let getterCalls = 0; const getter = { ...event }; Object.defineProperty(getter, 'payload', { get() { getterCalls++; } });
  await assert.rejects(f.core.append(getter)); assert.equal(getterCalls, 0);
  await assert.rejects(f.core.append({ ...event, payload: { ...event.payload, text: '<think>hidden</think>' } }), code('buzz_pilot_reasoning_forbidden'));
  assert.equal((await f.core.snapshot(access)).sequence, 0);
});

test('current reader/issuer scope is checked and historical reads do not require live source or execution expiry', async t => {
  const f = await fixture(t); await waiting(f);
  for (const wrong of [{ ...access, accountId: 'owner.other' }, { ...access, canAccessProject: async () => false },
    { ...access, checkSession: async () => false }, { ref: 'approval.valid' }]) {
    await assert.rejects(f.core.snapshot(wrong), code('buzz_pilot_not_authorized'));
    await assert.rejects(f.core.readEvidence({ role: 'instruction' }, wrong), code('buzz_pilot_not_authorized'));
  }
  f.time = Date.parse(f.binding.expires_at);
  assert.equal((await f.core.snapshot(access)).state, 'expired');
  assert.equal((await f.core.snapshot(access)).owner_action_required, false);
  assert.deepEqual((await f.core.readEvidence({ role: 'instruction' }, access)).bytes, instruction);
  const otherCurrent = f.make({ binding: { ...f.binding, project_id: 'project.current-but-unrelated',
    instruction_sha256: hash('changed'), issued_at: '2026-09-08T01:00:00.000Z', expires_at: '2026-09-08T02:00:00.000Z' } });
  assert.equal((await otherCurrent.snapshot(access)).project_id, 'project.synthetic');
  assert.deepEqual((await otherCurrent.readEvidence({ role: 'instruction' }, access)).bytes, instruction);
  await assert.rejects(otherCurrent.append(f.event('failed', { reason_code: 'source_changed' })), code('buzz_pilot_stale_source'));
  await assert.rejects(f.append('failed', { reason_code: 'expired' }));
});

test('authorization revoked during awaited protected reads or writes cannot return bytes or commit', async t => {
  const f = await fixture(t); await f.issue();
  const wrapped = { ...f.port, async readRole(args) { const result = await f.port.readRole(args); f.permit = false; return result; } };
  const revokedRead = f.make({ workingBytes: wrapped });
  await assert.rejects(revokedRead.readEvidence({ role: 'instruction' }, access), code('buzz_pilot_not_authorized'));
  f.permit = true;
  const event = f.event('instruction_received', { message_id: message(1), text: instruction.toString() });
  await assert.rejects(revokedRead.append(event), code('buzz_pilot_not_authorized'));
  f.permit = true;
  const view = await f.core.snapshot(access);
  assert.equal(view.state, 'capture_incomplete'); assert.equal(view.sequence, 0); assert.equal(view.recorded_state, 'issued');
  assert.equal((await f.core.append(event)).status, 'recorded');
});

test('exact duplicate replay is durable across database reopen; conflicting content is refused', async t => {
  const f = await fixture(t); await f.issue();
  const event = f.event('instruction_received', { message_id: message(1), text: instruction.toString() });
  const first = await f.core.append(event), replay = await f.core.append(event);
  assert.equal(replay.status, 'replayed'); assert.deepEqual({ ...replay, status: 'recorded' }, first);
  f.db.close(); f.db = new DatabaseSync(f.dbPath); f.core = f.make();
  assert.deepEqual(await f.core.append(event), replay); assert.equal((await f.core.snapshot(access)).sequence, 1);
  await assert.rejects(f.core.append({ ...event, payload: { ...event.payload, text: `${event.payload.text} ` } }), code('buzz_pilot_conflicting_replay'));
});

test('unfinished write claims survive restart and allow only exact safe create-only recovery', async t => {
  const f = await fixture(t); await f.issue();
  let failOnce = true;
  f.core = f.make({ workingBytes: { ...f.port, async writeRole(args) {
    const result = await f.port.writeRole(args);
    if (failOnce) { failOnce = false; throw Object.assign(new Error('synthetic_interruption'), { code: 'synthetic_interruption' }); }
    return result;
  } } });
  const event = f.event('instruction_received', { message_id: message(1), text: instruction.toString() });
  await assert.rejects(f.core.append(event), code('synthetic_interruption'));
  assert.equal((await f.core.snapshot(access)).state, 'capture_incomplete');
  await assert.rejects(f.append('failed', { reason_code: 'other_event' }), code('buzz_pilot_capture_incomplete'));
  f.db.close(); f.db = new DatabaseSync(f.dbPath); f.core = f.make();
  const ack = await f.core.append(event); assert.equal(ack.seq, 1); assert.equal(ack.state, 'running');
  assert.equal((await f.core.snapshot(access)).state, 'running');
});

test('instruction write interruption is recoverable and does not advertise readable evidence before commit', async t => {
  const f = await fixture(t);
  let first = true;
  f.core = f.make({ workingBytes: { ...f.port, async writeRole(args) {
    const result = await f.port.writeRole(args); if (first) { first = false; throw new Error('synthetic crash'); } return result;
  } } });
  await assert.rejects(f.issue());
  const view = await f.core.snapshot(access); assert.equal(view.state, 'capture_incomplete'); assert.equal(view.evidence_refs.length, 0);
  f.core = f.make(); await f.issue();
  assert.equal((await f.core.snapshot(access)).state, 'issued');
});

test('changed or missing protected evidence fails pin verification and is never overwritten', async t => {
  const f = await fixture(t); await f.issue();
  const ref = JSON.parse(f.db.prepare('SELECT instruction_json FROM buzz_pilot_jobs').get().instruction_json);
  const file = path.join(f.root, ref.groupId, 'instruction.txt');
  await chmod(file, 0o600); await writeFile(file, 'corrupted synthetic text');
  await assert.rejects(f.core.readEvidence({ role: 'instruction' }, access), code('protected_bytes_digest_mismatch'));
  await assert.rejects(f.issue(), code('protected_bytes_digest_mismatch'));
  assert.equal(await readFile(file, 'utf8'), 'corrupted synthetic text');
  await rm(file);
  await assert.rejects(f.core.readEvidence({ role: 'instruction' }, access));
});

test('evidence query is role-pinned and cannot accept caller paths, refs or another event role', async t => {
  const f = await fixture(t); await waiting(f);
  for (const query of [{ role: 'question' }, { role: 'thinking' }, { role: 'instruction', ref: 'bp:any' },
    { role: 'instruction', path: f.root }, { role: 'instruction', observation_id: 'event.3' },
    { role: 'question', observation_id: 'event.missing' }]) await assert.rejects(f.core.readEvidence(query, access));
  const dbRef = JSON.parse(f.db.prepare('SELECT instruction_json FROM buzz_pilot_jobs').get().instruction_json);
  f.db.prepare('UPDATE buzz_pilot_jobs SET instruction_json = ?').run(JSON.stringify({ ...dbRef, groupId: `bp-${'3'.repeat(64)}` }));
  await assert.rejects(f.core.readEvidence({ role: 'instruction' }, access), code('buzz_pilot_evidence_scope'));
});

test('out-of-order callbacks, wrong question/reply IDs and session drift never advance state', async t => {
  const f = await fixture(t); await started(f);
  await assert.rejects(f.append('tool_completed', { tool_call_id: 'call.actual-1', tool_name: 'clarify', output: 'x', outcome: 'completed' }), code('buzz_pilot_event_order'));
  await assert.rejects(f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.other', ...input }), code('buzz_pilot_tool_mismatch'));
  await assert.rejects(f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...input, question: 'Different?' }), code('buzz_pilot_question_mismatch'));
  await assert.rejects(f.append('failed', { reason_code: 'drift' }, { session_id: 'session.other' }), code('buzz_pilot_session_drift'));
  await assert.rejects(f.append('failed', { reason_code: 'drift' }, { session_id: null }), code('buzz_pilot_session_drift'));
  await assert.rejects(f.append('failed', { reason_code: 'drift' }, { session_key: 'session:other' }), code('buzz_pilot_session_drift'));
  await assert.rejects(f.append('failed', { reason_code: 'backward' }, { observed_at: f.binding.issued_at }), code('buzz_pilot_event_order'));
  assert.equal((await f.core.snapshot(access)).sequence, 2);
});

test('one accepted answer and exactly one actual resumed event bind the captured response', async t => {
  const f = await fixture(t); await waiting(f);
  await assert.rejects(f.append('answer_received', { clarify_id: 'clarify.other', message_id: message(3), text: 'x' }), code('buzz_pilot_question_mismatch'));
  await assert.rejects(f.append('answer_received', { clarify_id: 'clarify.actual-1', message_id: message(2), text: 'x' }), code('buzz_pilot_answer_mismatch'));
  await f.append('answer_received', { clarify_id: 'clarify.actual-1', message_id: message(3), text: 'Engineering' });
  await assert.rejects(f.append('answer_received', { clarify_id: 'clarify.actual-1', message_id: message(5), text: 'Management' }), code('buzz_pilot_event_order'));
  await assert.rejects(f.append('answer_accepted', { clarify_id: 'clarify.actual-1', message_id: message(5) }), code('buzz_pilot_answer_mismatch'));
  await f.append('answer_accepted', { clarify_id: 'clarify.actual-1', message_id: message(3) });
  const resume = f.event('resumed', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1' });
  await f.core.append(resume); assert.equal((await f.core.append(resume)).status, 'replayed');
  await assert.rejects(f.append('resumed', resume.payload), code('buzz_pilot_event_order'));
  assert.equal((await f.core.snapshot(access)).event_refs.filter(event => event.event_type === 'resumed').length, 1);
});

test('one active job per profile/chat is durable and expiry releases only the active guard', async t => {
  const f = await fixture(t); await f.issue();
  const nextBinding = { ...f.binding, job_id: 'job.synthetic-next' };
  const next = f.make({ binding: nextBinding });
  await assert.rejects(next.issue({ instructionBytes: instruction }, access), code('buzz_pilot_active_job_exists'));
  f.time = Date.parse(f.binding.expires_at);
  const future = f.make({ binding: { ...nextBinding, issued_at: iso(f.time), expires_at: iso(f.time + 3600000) } });
  assert.equal((await future.issue({ instructionBytes: instruction }, access)).status, 'issued');
  assert.equal((await f.core.snapshot(access)).state, 'expired');
  assert.deepEqual((await f.core.readEvidence({ role: 'instruction' }, access)).bytes, instruction);
});

test('concurrent instances cannot commit a second event while a protected write is pending', async t => {
  const f = await fixture(t); await f.issue();
  let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const pause = new Promise(resolve => { release = resolve; });
  const first = f.make({ workingBytes: { ...f.port, async writeRole(args) { entered(); await pause; return f.port.writeRole(args); } } });
  const append = first.append(f.event('instruction_received', { message_id: message(1), text: instruction.toString() }));
  await enteredPromise;
  await assert.rejects(f.append('failed', { reason_code: 'concurrent' }), code('buzz_pilot_capture_incomplete'));
  release(); await append;
  assert.equal((await f.core.snapshot(access)).sequence, 1);
});

test('fixed clarify scope rejects other tools, extra input fields and forged produced output order', async t => {
  const f = await fixture(t); await f.issue();
  await assert.rejects(f.append('final_response', { text: 'never executed' }), code('buzz_pilot_event_order'));
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString() });
  await assert.rejects(f.append('tool_started', { tool_call_id: 'call.x', tool_name: 'shell', input }), code('buzz_pilot_tool_forbidden'));
  await assert.rejects(f.append('tool_started', { tool_call_id: 'call.x', tool_name: 'clarify', input: { ...input, chain_of_thought: 'hidden' } }), code('buzz_pilot_unknown_field'));
  await assert.rejects(f.append('tool_started', { tool_call_id: 'call.x', tool_name: 'clarify', input: { ...input, choices: ['x'.repeat(2049)] } }), code('buzz_pilot_choices_invalid'));
  assert.equal((await f.core.snapshot(access)).actual_tool_starts, 0);
});

test('revocation during asynchronous authorization closes snapshot and claimed issue paths', async t => {
  const f = await fixture(t); await f.issue();
  let calls = 0;
  const viewer = f.make({ authorize: async () => ++calls === 1 });
  await assert.rejects(viewer.snapshot(access), code('buzz_pilot_not_authorized'));
  assert.equal(calls, 2);
  calls = 0;
  const other = f.make({ binding: { ...f.binding, job_id: 'job.uncommitted', chat_id: '00000000-0000-4000-8000-000000000002' },
    authorize: async () => ++calls === 1 });
  await assert.rejects(other.issue({ instructionBytes: instruction }), code('buzz_pilot_not_authorized'));
  const row = f.db.prepare('SELECT * FROM buzz_pilot_jobs WHERE job_id = ?').get('job.uncommitted');
  assert.equal(row.issued, 0); assert.equal(row.sequence, 0);
});

test('bounded queue refuses overload while admitted operations retain durable dedupe', async t => {
  const f = await fixture(t); await f.issue();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const core = f.make({ authorize: async (action, context, actor) => {
    if (action === 'append') { entered(); await blocked; }
    return f.authorize(action, context, actor);
  } });
  const event = f.event('instruction_received', { message_id: message(1), text: instruction.toString() });
  const jobs = Array.from({ length: 32 }, () => core.append(event));
  await ready;
  await assert.rejects(core.append(event), code('buzz_pilot_queue_limit'));
  release(); const results = await Promise.all(jobs);
  assert.equal(results.filter(result => result.status === 'recorded').length, 1);
  assert.equal(results.filter(result => result.status === 'replayed').length, 31);
  assert.equal((await core.snapshot(access)).sequence, 1);
});

test('a waiting cancellation ends the measured wait without recording an Owner answer', async t => {
  const f = await fixture(t); await waiting(f); f.time += 3000;
  await f.append('cancelled', { reason_code: 'gateway_cancelled' }); f.time += 9000;
  const view = await f.core.snapshot(access);
  assert.equal(view.wait_elapsed_ms, 3000); assert.equal(view.state, 'cancelled');
  assert.equal(view.owner_action_required, false); assert.equal(view.answer_ref, null);
});

test('readOnly actual file database reads existing evidence and refuses every mutation without creating files', async t => {
  const f = await fixture(t); await waiting(f);
  const beforeFiles = await readdir(f.parent), beforeBytes = await readFile(f.dbPath);
  const readDb = new DatabaseSync(f.dbPath, { readOnly: true });
  try {
    let ddlCalls = 0, writeCalls = 0;
    readDb.exec = () => { ddlCalls++; throw new Error('read-only DDL forbidden'); };
    const reader = f.make({ db: readDb, readOnly: true, workingBytes: { ...f.port,
      createGroup: async () => { writeCalls++; throw new Error('write forbidden'); },
      writeRole: async () => { writeCalls++; throw new Error('write forbidden'); } } });
    assert.equal((await reader.snapshot(access)).state, 'waiting_owner');
    assert.deepEqual((await reader.readEvidence({ role: 'instruction' }, access)).bytes, instruction);
    assert.equal((await reader.readEvidence({ role: 'question', observation_id: 'event.3' }, access)).bytes.toString(), question);
    await assert.rejects(reader.issue({ instructionBytes: instruction }, access), code('buzz_pilot_read_only'));
    await assert.rejects(reader.append(f.event('failed', { reason_code: 'read_only_attempt' })), code('buzz_pilot_read_only'));
    assert.equal(ddlCalls, 0); assert.equal(writeCalls, 0);
  } finally { readDb.close(); }
  assert.deepEqual(await readdir(f.parent), beforeFiles); assert.deepEqual(await readFile(f.dbPath), beforeBytes);
});

test('readOnly constructor rejects missing or foreign schema without bootstrapping tables', async t => {
  const f = await fixture(t);
  for (const foreign of [false, true]) {
    const dbPath = path.join(f.parent, foreign ? 'foreign.sqlite' : 'empty.sqlite');
    const setup = new DatabaseSync(dbPath);
    if (foreign) setup.exec('CREATE TABLE buzz_pilot_jobs (job_id TEXT PRIMARY KEY, body TEXT)');
    setup.close();
    const before = await readFile(dbPath), files = await readdir(f.parent);
    const readDb = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.throws(() => f.make({ db: readDb, readOnly: true }), code('buzz_pilot_schema_required'));
      assert.equal(readDb.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'buzz_pilot_events'").get().n, 0);
    } finally { readDb.close(); }
    assert.deepEqual(await readFile(dbPath), before); assert.deepEqual(await readdir(f.parent), files);
  }
});

test('an authorized restarted observer can retire a lost gateway wait using only recorded session metadata', async t => {
  const f = await fixture(t); await f.issue();
  const instruction_trim_sha256 = hash(instruction.toString().trim());
  assert.deepEqual((await f.core.snapshot(access)).recovery_metadata, { session_key: null, session_id: null, instruction_trim_sha256 });
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString().trim() }, { session_id: null });
  assert.deepEqual((await f.core.snapshot(access)).recovery_metadata, { session_key: 'session:synthetic', session_id: null, instruction_trim_sha256 });
  await f.append('tool_started', { tool_call_id: 'call.actual-1', tool_name: 'clarify', input });
  await f.append('question_registered', { clarify_id: 'clarify.actual-1', tool_call_id: 'call.actual-1', ...input });
  await f.append('question_delivery', { clarify_id: 'clarify.actual-1', delivery_status: 'sent', message_id: message(2) });
  f.db.close(); f.db = new DatabaseSync(f.dbPath); f.core = f.make();
  await assert.rejects(f.core.snapshot({ ...access, accountId: 'unrelated.synthetic' }), code('buzz_pilot_not_authorized'));
  const waiting = await f.core.snapshot(access);
  assert.equal(waiting.owner_action_required, true);
  assert.deepEqual(waiting.recovery_metadata, { session_key: 'session:synthetic', session_id: 'session.actual-1', instruction_trim_sha256 });
  const { session_key, session_id } = waiting.recovery_metadata;
  const event = f.event('failed', { reason_code: 'gateway_wait_lost' }, { session_key, session_id });
  await f.core.append(event);
  const retired = await f.core.snapshot(access);
  assert.equal(retired.state, 'failed'); assert.equal(retired.owner_action_required, false);
  assert.equal(retired.operations_attention, true); assert.equal(retired.sequence, 5);
  assert.equal(retired.event_refs.some(row => row.event_type === 'resumed'), false);
  assert.equal((await f.core.append(event)).status, 'replayed');
  assert.equal((await f.core.snapshot(access)).sequence, 5);
});
