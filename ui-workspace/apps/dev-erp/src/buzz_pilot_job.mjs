import { createHash } from 'node:crypto';

const LIMIT = 64 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const KEY = /^[a-f0-9]{64}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const CORE = ['version', 'job_id', 'project_id', 'owner_account_id', 'expected_owner_pubkey',
  'expected_bot_pubkey', 'chat_id', 'profile_ref', 'instruction_sha256', 'issued_at', 'expires_at'];
const COMMON = ['version', 'observation_id', 'job_id', 'event_type', 'profile_ref', 'chat_id',
  'bot_pubkey', 'actor_pubkey', 'session_key', 'session_id', 'observed_at', 'payload'];
const OWNER_EVENTS = new Set(['instruction_received', 'answer_received', 'answer_accepted']);
const TERMINAL = new Set(['delivered', 'final_delivery_failed', 'final_delivery_unknown', 'failed', 'cancelled']);
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const check = (ok, code) => { if (!ok) fail(code); };
const isId = value => typeof value === 'string' && ID.test(value);
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};

// JSON-shaped values only, without invoking accessors or ignoring hidden fields.
function copyJson(value, depth = 0, budget = { left: 4096 }) {
  check(depth <= 8 && --budget.left >= 0, 'buzz_pilot_input_limit');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { check(Number.isFinite(value), 'buzz_pilot_input_invalid'); return value; }
  check(value && typeof value === 'object' && (Array.isArray(value)
    || [Object.prototype, null].includes(Object.getPrototypeOf(value))), 'buzz_pilot_input_invalid');
  check(Object.getOwnPropertySymbols(value).length === 0, 'buzz_pilot_unknown_field');
  const result = Array.isArray(value) ? [] : {};
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor && 'value' in descriptor && descriptor.enumerable && key !== '__proto__', 'buzz_pilot_input_invalid');
    if (Array.isArray(value)) check(/^(0|[1-9][0-9]*)$/u.test(key), 'buzz_pilot_unknown_field');
    result[key] = copyJson(descriptor.value, depth + 1, budget);
  }
  if (Array.isArray(value)) check(result.length === value.length
    && Object.keys(result).length === result.length, 'buzz_pilot_input_invalid');
  return result;
}
function exact(value, required, optional = []) {
  check(value && !Array.isArray(value) && typeof value === 'object', 'buzz_pilot_input_invalid');
  check(Object.keys(value).every(key => required.includes(key) || optional.includes(key))
    && required.every(key => Object.hasOwn(value, key)), 'buzz_pilot_unknown_field');
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function clock(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'buzz_pilot_time_invalid');
  return Date.parse(value);
}
function textBytes(value, empty = false) {
  check(typeof value === 'string' && (empty || value.length > 0), 'buzz_pilot_text_invalid');
  const bytes = Buffer.from(value, 'utf8');
  check(bytes.length <= LIMIT && bytes.toString('utf8') === value, 'buzz_pilot_text_invalid');
  check(!/<\/?(?:think|thinking|analysis|reasoning)>/iu.test(value), 'buzz_pilot_reasoning_forbidden');
  return bytes;
}
function question(input) {
  exact(input, ['question'], ['choices', 'multi_select']);
  textBytes(input.question);
  const choices = input.choices ?? [];
  check(Array.isArray(choices) && choices.length <= 16, 'buzz_pilot_choices_invalid');
  for (const choice of choices) check(textBytes(choice).length <= 2048, 'buzz_pilot_choices_invalid');
  check(input.multi_select === undefined || typeof input.multi_select === 'boolean', 'buzz_pilot_choices_invalid');
  const normalized = { question: input.question, choices, multi_select: input.multi_select ?? false };
  check(Buffer.byteLength(canonical(normalized)) <= LIMIT, 'buzz_pilot_input_limit');
  return normalized;
}
function validateBinding(value) {
  const binding = copyJson(value); exact(binding, CORE);
  check(binding.version === 1 && ['job_id', 'project_id', 'owner_account_id', 'profile_ref']
    .every(key => isId(binding[key])) && KEY.test(binding.expected_owner_pubkey)
    && KEY.test(binding.expected_bot_pubkey) && binding.expected_owner_pubkey !== binding.expected_bot_pubkey
    && UUID.test(binding.chat_id) && SHA.test(binding.instruction_sha256), 'buzz_pilot_binding_invalid');
  check(clock(binding.expires_at) > clock(binding.issued_at), 'buzz_pilot_time_invalid');
  return frozen(binding);
}
export { validateBinding as validateBuzzPilotBinding };

/** Callers construct the protected port with this fixed allowlist. No arbitrary role/path writes. */
export const BUZZ_PILOT_ROLES = frozen(Object.fromEntries([
  'instruction', 'original_message', 'question', 'answer', 'tool_input', 'tool_output', 'final_response',
].map(role => [role, { filename: `${role}.${role === 'tool_input' ? 'json' : 'txt'}`,
  maxBytes: LIMIT, mediaType: role === 'tool_input' ? 'application/json' : 'text/plain' }])));

/** Observations only: no model, tool, network, root provisioning or canonical writer.
 * authorize(action, context, accessOrEvent) is a mandatory current trusted server
 * decision (exact true). It is called again after awaited evidence/auth work.
 * SQLite claims precede create-only bytes; incomplete claims stay visible and
 * only exact replay can finish them. A retry never resumes a model or tool.
 */
export function createBuzzPilotJob({ db, workingBytes, binding: suppliedBinding, authorize, now = Date.now, readOnly = false } = {}) {
  const binding = validateBinding(suppliedBinding);
  check(db && typeof db.exec === 'function' && typeof db.prepare === 'function'
    && workingBytes && ['createGroup', 'writeRole', 'readRole'].every(key => typeof workingBytes[key] === 'function')
    && typeof authorize === 'function' && typeof now === 'function' && typeof readOnly === 'boolean', 'buzz_pilot_ports_required');
  const bindingJson = canonical(binding), bindingHash = sha(bindingJson);
  if (!readOnly) db.exec(`CREATE TABLE IF NOT EXISTS buzz_pilot_jobs (
    job_id TEXT PRIMARY KEY, profile_ref TEXT NOT NULL, chat_id TEXT NOT NULL,
    binding_json TEXT NOT NULL, binding_sha256 TEXT NOT NULL, expires_ms INTEGER NOT NULL,
    active INTEGER NOT NULL, issued INTEGER NOT NULL, instruction_json TEXT NOT NULL,
    instruction_trim_sha256 TEXT NOT NULL, state_json TEXT NOT NULL, sequence INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS buzz_pilot_one_active ON buzz_pilot_jobs(profile_ref, chat_id) WHERE active = 1;
    CREATE TABLE IF NOT EXISTS buzz_pilot_events (
    job_id TEXT NOT NULL, observation_id TEXT NOT NULL, digest TEXT NOT NULL,
    sequence INTEGER NOT NULL, committed INTEGER NOT NULL, metadata_json TEXT NOT NULL,
    evidence_json TEXT NOT NULL, next_state_json TEXT NOT NULL, ack_json TEXT,
    PRIMARY KEY(job_id, observation_id), UNIQUE(job_id, sequence));
    CREATE UNIQUE INDEX IF NOT EXISTS buzz_pilot_one_pending ON buzz_pilot_events(job_id) WHERE committed = 0;`);
  // Existing readers must never bootstrap a missing/foreign database.
  for (const [table, columns] of Object.entries({
    buzz_pilot_jobs: ['job_id:TEXT:1', 'profile_ref:TEXT:0', 'chat_id:TEXT:0', 'binding_json:TEXT:0',
      'binding_sha256:TEXT:0', 'expires_ms:INTEGER:0', 'active:INTEGER:0', 'issued:INTEGER:0',
      'instruction_json:TEXT:0', 'instruction_trim_sha256:TEXT:0', 'state_json:TEXT:0', 'sequence:INTEGER:0'],
    buzz_pilot_events: ['job_id:TEXT:1', 'observation_id:TEXT:2', 'digest:TEXT:0', 'sequence:INTEGER:0',
      'committed:INTEGER:0', 'metadata_json:TEXT:0', 'evidence_json:TEXT:0', 'next_state_json:TEXT:0', 'ack_json:TEXT:0'],
  })) {
    const type = db.prepare('SELECT type FROM sqlite_schema WHERE name = ?').get(table)?.type;
    const found = db.prepare(`PRAGMA table_info(${table})`).all().map(column => `${column.name}:${column.type}:${column.pk}`);
    check(type === 'table' && canonical(found) === canonical(columns), 'buzz_pilot_schema_required');
  }
  for (const [index, table, columns, predicate] of [
    ['buzz_pilot_one_active', 'buzz_pilot_jobs', ['profile_ref', 'chat_id'], 'active = 1'],
    ['buzz_pilot_one_pending', 'buzz_pilot_events', ['job_id'], 'committed = 0'],
  ]) {
    const definition = db.prepare('SELECT tbl_name, sql FROM sqlite_schema WHERE name = ? AND type = ?').get(index, 'index');
    const flags = db.prepare(`PRAGMA index_list(${table})`).all().find(item => item.name === index);
    const found = db.prepare(`PRAGMA index_info(${index})`).all().map(column => column.name);
    check(definition?.tbl_name === table && definition.sql.endsWith(`WHERE ${predicate}`) && flags?.unique === 1
      && flags.partial === 1 && canonical(found) === canonical(columns), 'buzz_pilot_schema_required');
  }
  let tail = Promise.resolve(), queued = 0;
  function serial(run) {
    if (queued >= 32) return Promise.reject(Object.assign(new Error('buzz_pilot_queue_limit'), { code: 'buzz_pilot_queue_limit' }));
    queued += 1;
    const operation = tail.then(run);
    tail = operation.catch(() => {}).finally(() => { queued -= 1; });
    return operation;
  }
  function transaction(run) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = run(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const jobRow = () => db.prepare('SELECT * FROM buzz_pilot_jobs WHERE job_id = ?').get(binding.job_id);
  const eventRow = observationId => db.prepare('SELECT * FROM buzz_pilot_events WHERE job_id = ? AND observation_id = ?')
    .get(binding.job_id, observationId);
  function storedBinding(row) {
    check(row && sha(row.binding_json) === row.binding_sha256, 'buzz_pilot_ledger_corrupt');
    return validateBinding(JSON.parse(row.binding_json));
  }
  function currentSource(row) {
    check(row && row.binding_sha256 === bindingHash && row.binding_json === bindingJson, 'buzz_pilot_stale_source');
  }
  function currentTime() {
    const value = now(); check(Number.isSafeInteger(value) && value >= 0, 'buzz_pilot_clock_invalid'); return value;
  }
  function live() {
    const time = currentTime();
    check(time >= clock(binding.issued_at) && time < clock(binding.expires_at), 'buzz_pilot_binding_expired');
    return time;
  }
  async function allowed(action, source, access, extra = {}) {
    const context = frozen({ binding: source, job_id: source.job_id, project_id: source.project_id,
      owner_account_id: source.owner_account_id, ...extra });
    check(await authorize(action, context, access) === true, 'buzz_pilot_not_authorized');
  }
  function pin(observationId, role, bytes) {
    const groupId = groupFor(observationId);
    return { groupId, role, ref: `bp:${groupId}:${role}`, sha256: sha(bytes), size: bytes.length,
      mediaType: BUZZ_PILOT_ROLES[role].mediaType };
  }
  function groupFor(observationId) {
    return `bp-${sha(canonical([binding.job_id, observationId === null ? 'instruction' : 'event', observationId])).slice(7)}`;
  }
  async function readPin(ref) {
    check(ref && Object.hasOwn(BUZZ_PILOT_ROLES, ref.role) && /^bp-[a-f0-9]{64}$/u.test(ref.groupId)
      && ref.ref === `bp:${ref.groupId}:${ref.role}` && SHA.test(ref.sha256)
      && Number.isSafeInteger(ref.size) && ref.size >= 0 && ref.size <= LIMIT
      && ref.mediaType === BUZZ_PILOT_ROLES[ref.role].mediaType, 'buzz_pilot_ledger_corrupt');
    const read = await workingBytes.readRole({ groupId: ref.groupId, role: ref.role,
      expectedSha256: ref.sha256, expectedSize: ref.size });
    check(Buffer.isBuffer(read.bytes) && sha(read.bytes) === ref.sha256 && read.bytes.length === ref.size
      && read.sha256 === ref.sha256 && read.size === ref.size && read.mediaType === ref.mediaType, 'buzz_pilot_evidence_mismatch');
    return read;
  }
  async function storePin(ref, bytes) {
    try { await workingBytes.createGroup(ref.groupId); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    try { await workingBytes.writeRole({ groupId: ref.groupId, role: ref.role, bytes }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const read = await readPin(ref);
    check(read.bytes.equals(bytes), 'buzz_pilot_evidence_mismatch');
  }
  const publicPin = ref => ({ ref: ref.ref, role: ref.role, sha256: ref.sha256, size: ref.size, mediaType: ref.mediaType });
  function ack(sequence, state, observationId, digest, refs, eventType = 'issued') {
    return { version: 1, status: observationId === null ? 'issued' : 'recorded', job_id: binding.job_id,
      observation_id: observationId, event_type: eventType, seq: sequence,
      state, digest, evidence_refs: refs.map(publicPin), official_done: false, canonical: false };
  }
  function validateEvent(raw) {
    const event = copyJson(raw); exact(event, COMMON);
    check(Buffer.byteLength(canonical(event)) <= 192 * 1024, 'buzz_pilot_input_limit');
    check(event.version === 1 && isId(event.observation_id) && event.job_id === binding.job_id
      && event.profile_ref === binding.profile_ref && event.chat_id === binding.chat_id
      && event.bot_pubkey === binding.expected_bot_pubkey && isId(event.session_key)
      && (event.session_id === null || isId(event.session_id)), 'buzz_pilot_event_scope');
    check(event.actor_pubkey === (OWNER_EVENTS.has(event.event_type)
      ? binding.expected_owner_pubkey : binding.expected_bot_pubkey), 'buzz_pilot_actor_mismatch');
    const observed = clock(event.observed_at);
    check(observed >= clock(binding.issued_at) && observed < clock(binding.expires_at)
      && observed <= currentTime(), 'buzz_pilot_event_time');
    return frozen(event);
  }
  function plan(event, row) {
    const state = JSON.parse(row.state_json), p = event.payload;
    check(!TERMINAL.has(state.status), 'buzz_pilot_terminal');
    check(!state.session_key || state.session_key === event.session_key, 'buzz_pilot_session_drift');
    check(state.session_id === null || state.session_id === event.session_id, 'buzz_pilot_session_drift');
    check(!state.last_observed_at || clock(event.observed_at) >= clock(state.last_observed_at), 'buzz_pilot_event_order');
    state.session_key = event.session_key; state.session_id = event.session_id;
    state.last_observed_at = event.observed_at;
    let role = null, bytes = null, facts = {};
    const at = (...statuses) => check(statuses.includes(state.status), 'buzz_pilot_event_order');
    const ids = (...keys) => check(keys.every(key => isId(p[key])), 'buzz_pilot_id_invalid');
    const clarify = () => { ids('clarify_id'); check(p.clarify_id === state.clarify_id, 'buzz_pilot_question_mismatch'); };
    const tool = () => { ids('tool_call_id'); check(p.tool_call_id === state.tool_call_id, 'buzz_pilot_tool_mismatch'); };
    const delivery = () => {
      check(['sent', 'failed', 'unknown'].includes(p.delivery_status)
        && (p.message_id === null || isId(p.message_id))
        && (p.delivery_status !== 'sent' || isId(p.message_id)), 'buzz_pilot_delivery_invalid');
    };
    switch (event.event_type) {
      case 'instruction_received':
        exact(p, ['message_id', 'text']); ids('message_id'); at('issued');
        bytes = textBytes(p.text); role = 'original_message';
        check(sha(Buffer.from(p.text.trim())) === row.instruction_trim_sha256, 'buzz_pilot_instruction_mismatch');
        state.original_message_id = p.message_id; facts = { message_id: p.message_id }; state.status = 'running'; break;
      case 'tool_started': {
        exact(p, ['tool_call_id', 'tool_name', 'input']); ids('tool_call_id'); at('running');
        check(p.tool_name === 'clarify' && !state.tool_call_id, 'buzz_pilot_tool_forbidden');
        const normalized = question(p.input);
        bytes = Buffer.from(canonical(p.input)); role = 'tool_input';
        state.question_shape_sha256 = sha(canonical(normalized)); state.tool_call_id = p.tool_call_id;
        facts = { tool_call_id: p.tool_call_id, tool_name: 'clarify' }; state.status = 'tool_running'; break;
      }
      case 'question_registered':
        exact(p, ['clarify_id', 'tool_call_id', 'question', 'choices', 'multi_select']); ids('clarify_id'); tool(); at('tool_running');
        check(sha(canonical(question({ question: p.question, choices: p.choices, multi_select: p.multi_select })))
          === state.question_shape_sha256, 'buzz_pilot_question_mismatch');
        role = 'question'; bytes = textBytes(p.question); state.clarify_id = p.clarify_id;
        facts = { clarify_id: p.clarify_id, tool_call_id: p.tool_call_id, choices_count: p.choices.length, multi_select: p.multi_select };
        state.status = 'question_registered'; break;
      case 'question_delivery':
        exact(p, ['clarify_id', 'delivery_status', 'message_id']); clarify(); delivery(); at('question_registered');
        state.question_delivery = p.delivery_status; state.question_message_id = p.message_id;
        if (p.delivery_status === 'sent') { state.status = 'waiting_owner'; state.wait_started_at = event.observed_at; }
        else state.status = `question_delivery_${p.delivery_status}`;
        facts = { ...p }; break;
      case 'answer_received':
        exact(p, ['clarify_id', 'message_id', 'text']); clarify(); ids('message_id'); at('waiting_owner');
        check(p.message_id !== state.original_message_id && p.message_id !== state.question_message_id, 'buzz_pilot_answer_mismatch');
        role = 'answer'; bytes = textBytes(p.text); state.answer_message_id = p.message_id;
        state.wait_ended_at = event.observed_at; facts = { clarify_id: p.clarify_id, message_id: p.message_id };
        state.status = 'answer_received'; break;
      case 'answer_accepted':
        exact(p, ['clarify_id', 'message_id']); clarify(); ids('message_id'); at('answer_received');
        check(p.message_id === state.answer_message_id, 'buzz_pilot_answer_mismatch');
        facts = { ...p }; state.status = 'answer_accepted'; break;
      case 'resumed':
        exact(p, ['clarify_id', 'tool_call_id']); clarify(); tool(); at('answer_accepted');
        facts = { ...p }; state.status = 'resumed'; state.resumed_count = 1; break;
      case 'tool_completed':
        exact(p, ['tool_call_id', 'tool_name', 'output', 'outcome']); tool();
        check(p.tool_name === 'clarify' && ['completed', 'cancelled', 'failed'].includes(p.outcome), 'buzz_pilot_tool_forbidden');
        if (p.outcome === 'completed') at('resumed');
        else at('tool_running', 'question_registered', 'waiting_owner', 'question_delivery_failed',
          'question_delivery_unknown', 'answer_received', 'answer_accepted', 'resumed');
        role = 'tool_output'; bytes = textBytes(p.output, true);
        facts = { tool_call_id: p.tool_call_id, tool_name: 'clarify', outcome: p.outcome };
        state.tool_outcome = p.outcome; state.status = p.outcome === 'completed' ? 'tool_completed' : p.outcome; break;
      case 'final_response':
        exact(p, ['text']); at('running', 'tool_completed');
        role = 'final_response'; bytes = textBytes(p.text); state.status = 'final_produced'; state.final_produced = true; break;
      case 'final_delivery':
        exact(p, ['delivery_status', 'message_id']); delivery(); at('final_produced');
        state.final_delivery = p.delivery_status; state.final_message_id = p.message_id;
        state.status = p.delivery_status === 'sent' ? 'delivered' : `final_delivery_${p.delivery_status}`; facts = { ...p }; break;
      case 'failed': case 'cancelled':
        exact(p, ['reason_code']);
        check(typeof p.reason_code === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(p.reason_code), 'buzz_pilot_reason_invalid');
        state.status = event.event_type; state.reason_code = p.reason_code; facts = { ...p }; break;
      default: fail('buzz_pilot_event_type');
    }
    const ref = role ? pin(event.observation_id, role, bytes) : null;
    if (ref) state[`${role}_ref`] = ref.ref;
    if (state.wait_started_at && !state.wait_ended_at && state.status !== 'waiting_owner') state.wait_ended_at = event.observed_at;
    return { nextState: state, refs: ref ? [ref] : [], bytes,
      metadata: { ...event, payload: facts } };
  }

  return Object.freeze({
    issue(input, access) {
      if (readOnly) return Promise.reject(Object.assign(new Error('buzz_pilot_read_only'), { code: 'buzz_pilot_read_only' }));
      let bytes;
      try {
        check(input && Object.getPrototypeOf(input) === Object.prototype
          && Reflect.ownKeys(input).length === 1 && Object.hasOwn(input, 'instructionBytes')
          && Buffer.isBuffer(Object.getOwnPropertyDescriptor(input, 'instructionBytes')?.value), 'buzz_pilot_instruction_invalid');
        bytes = Buffer.from(input.instructionBytes);
        check(bytes.length > 0 && bytes.length <= LIMIT && sha(bytes) === binding.instruction_sha256
          && textBytes(bytes.toString('utf8')).equals(bytes), 'buzz_pilot_instruction_mismatch');
      } catch (error) { return Promise.reject(error); }
      return serial(async () => {
        live(); await allowed('issue', binding, access); live();
        const ref = pin(null, 'instruction', bytes);
        const state = { status: 'issued', session_key: null, session_id: null, last_observed_at: null,
          instruction_ref: ref.ref, resumed_count: 0, final_produced: false, final_delivery: null };
        let row = transaction(() => {
          const existing = jobRow();
          if (existing) { currentSource(existing); return existing; }
          // Expiry releases the uniqueness guard, without inventing a completion event.
          db.prepare('UPDATE buzz_pilot_jobs SET active = 0 WHERE active = 1 AND expires_ms <= ?').run(currentTime());
          check(!db.prepare('SELECT job_id FROM buzz_pilot_jobs WHERE profile_ref = ? AND chat_id = ? AND active = 1')
            .get(binding.profile_ref, binding.chat_id), 'buzz_pilot_active_job_exists');
          db.prepare('INSERT INTO buzz_pilot_jobs VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, 0)').run(binding.job_id,
            binding.profile_ref, binding.chat_id, bindingJson, bindingHash, clock(binding.expires_at), canonical(ref),
            sha(Buffer.from(bytes.toString('utf8').trim())), canonical(state));
          return jobRow();
        });
        check(row.instruction_json === canonical(ref), 'buzz_pilot_ledger_corrupt');
        if (row.issued) await readPin(ref); else await storePin(ref, bytes);
        await allowed('issue', binding, access); live();
        transaction(() => { row = jobRow(); currentSource(row);
          db.prepare('UPDATE buzz_pilot_jobs SET issued = 1 WHERE job_id = ?').run(binding.job_id); });
        return frozen(ack(0, 'issued', null, bindingHash, [ref]));
      });
    },
    append(raw) {
      if (readOnly) return Promise.reject(Object.assign(new Error('buzz_pilot_read_only'), { code: 'buzz_pilot_read_only' }));
      let event;
      try { event = validateEvent(raw); } catch (error) { return Promise.reject(error); }
      return serial(async () => {
        live(); await allowed('append', binding, event, { observation_id: event.observation_id }); live();
        const digest = sha(canonical(event));
        let work;
        let claim = transaction(() => {
          const row = jobRow(); currentSource(row); check(row.issued === 1, 'buzz_pilot_instruction_incomplete');
          const existing = eventRow(event.observation_id);
          if (existing) {
            check(existing.digest === digest, 'buzz_pilot_conflicting_replay');
            if (!existing.committed) work = plan(event, row);
            return existing;
          }
          check(row.sequence < 64, 'buzz_pilot_event_limit');
          check(!db.prepare('SELECT observation_id FROM buzz_pilot_events WHERE job_id = ? AND committed = 0')
            .get(binding.job_id), 'buzz_pilot_capture_incomplete');
          work = plan(event, row);
          db.prepare('INSERT INTO buzz_pilot_events VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL)').run(binding.job_id,
            event.observation_id, digest, row.sequence + 1, canonical(work.metadata), canonical(work.refs), canonical(work.nextState));
          return eventRow(event.observation_id);
        });
        if (claim.committed) return frozen({ ...JSON.parse(claim.ack_json), status: 'replayed' });
        check(claim.evidence_json === canonical(work.refs) && claim.next_state_json === canonical(work.nextState)
          && claim.metadata_json === canonical(work.metadata), 'buzz_pilot_ledger_corrupt');
        for (const ref of work.refs) await storePin(ref, work.bytes);
        await allowed('append', binding, event, { observation_id: event.observation_id }); live();
        return transaction(() => {
          const row = jobRow(); currentSource(row); claim = eventRow(event.observation_id);
          if (claim.committed) return frozen({ ...JSON.parse(claim.ack_json), status: 'replayed' });
          check(claim.sequence === row.sequence + 1 && claim.digest === digest, 'buzz_pilot_capture_conflict');
          const result = ack(claim.sequence, work.nextState.status, event.observation_id, digest, work.refs, event.event_type);
          db.prepare('UPDATE buzz_pilot_events SET committed = 1, ack_json = ? WHERE job_id = ? AND observation_id = ?')
            .run(canonical(result), binding.job_id, event.observation_id);
          db.prepare('UPDATE buzz_pilot_jobs SET state_json = ?, sequence = ?, active = ? WHERE job_id = ?')
            .run(claim.next_state_json, claim.sequence, TERMINAL.has(work.nextState.status) ? 0 : 1, binding.job_id);
          return frozen(result);
        });
      });
    },
    async snapshot(access) {
      let row = jobRow(); check(row, 'buzz_pilot_job_missing');
      const source = storedBinding(row); await allowed('snapshot', source, access);
      row = jobRow(); check(row.binding_json === canonical(source), 'buzz_pilot_ledger_corrupt');
      const state = JSON.parse(row.state_json), time = currentTime();
      const pending = db.prepare('SELECT observation_id FROM buzz_pilot_events WHERE job_id = ? AND committed = 0').get(binding.job_id);
      const events = db.prepare('SELECT * FROM buzz_pilot_events WHERE job_id = ? AND committed = 1 ORDER BY sequence').all(binding.job_id);
      const expired = time >= clock(source.expires_at) && !TERMINAL.has(state.status);
      const status = !row.issued || pending ? 'capture_incomplete' : expired ? 'expired' : state.status;
      const waiting = status === 'waiting_owner';
      const attention = ['capture_incomplete', 'expired', 'failed', 'question_delivery_failed',
        'question_delivery_unknown', 'final_delivery_failed', 'final_delivery_unknown'].includes(status);
      const refs = [JSON.parse(row.instruction_json), ...events.flatMap(event => JSON.parse(event.evidence_json))];
      const result = { version: 1, job_id: source.job_id, task_id: source.job_id, project_id: source.project_id,
        profile_ref: source.profile_ref, state: status, recorded_state: state.status, sequence: row.sequence,
        source_ref: `bp-source:${row.binding_sha256.slice(7)}`, source_sha256: row.binding_sha256,
        issued_at: source.issued_at, expires_at: source.expires_at,
        buzz_url: KEY.test(state.question_message_id ?? '')
          ? `buzz://message?channel=${source.chat_id}&id=${state.question_message_id}` : `buzz://channel/${source.chat_id}`,
        expected_responder: waiting ? { account_id: source.owner_account_id, pubkey: source.expected_owner_pubkey } : null,
        owner_action_required: waiting, operations_attention: attention,
        wait_started_at: state.wait_started_at ?? null,
        wait_elapsed_ms: state.wait_started_at ? Math.max(0, (state.wait_ended_at ? clock(state.wait_ended_at) : time) - clock(state.wait_started_at)) : null,
        pending_observation_id: pending?.observation_id ?? null,
        instruction_ref: state.instruction_ref, original_message_ref: state.original_message_ref ?? null,
        question_ref: state.question_ref ?? null, answer_ref: state.answer_ref ?? null,
        output_ref: state.final_response_ref ?? null, evidence_refs: row.issued ? refs.map(publicPin) : [],
        event_refs: events.map(event => ({ observation_id: event.observation_id, sequence: event.sequence,
          ref: `bp-event:${sha(canonical([source.job_id, event.observation_id])).slice(7)}`, digest: event.digest,
          event_type: JSON.parse(event.metadata_json).event_type, evidence_refs: JSON.parse(event.evidence_json).map(publicPin) })),
        actual_tool_starts: events.filter(event => JSON.parse(event.metadata_json).event_type === 'tool_started').length,
        actual_tool_completions: events.filter(event => JSON.parse(event.metadata_json).event_type === 'tool_completed').length,
        final_produced: state.final_produced, final_delivered: state.final_delivery === 'sent',
        delivery_status: state.final_delivery, result_verification: 'not_verified', human_accepted: false,
        official_done: false, canonical: false };
      await allowed('snapshot', source, access);
      return frozen(result);
    },
    async readEvidence(query, access) {
      const request = copyJson(query); exact(request, ['role'], ['observation_id']);
      check(Object.hasOwn(BUZZ_PILOT_ROLES, request.role) && (request.observation_id === undefined
        || isId(request.observation_id)), 'buzz_pilot_role_invalid');
      const row = jobRow(); check(row && row.issued, 'buzz_pilot_job_missing');
      const source = storedBinding(row);
      const extra = { role: request.role, observation_id: request.observation_id ?? null };
      await allowed('readEvidence', source, access, extra);
      let ref;
      if (request.observation_id === undefined) {
        check(request.role === 'instruction', 'buzz_pilot_evidence_missing'); ref = JSON.parse(row.instruction_json);
      } else {
        const event = eventRow(request.observation_id); check(event?.committed, 'buzz_pilot_evidence_missing');
        ref = JSON.parse(event.evidence_json).find(item => item.role === request.role);
        check(ref, 'buzz_pilot_evidence_missing');
      }
      check(ref.role === request.role && ref.groupId === groupFor(request.observation_id ?? null), 'buzz_pilot_evidence_scope');
      const result = await readPin(ref);
      await allowed('readEvidence', source, access, extra);
      return { bytes: Buffer.from(result.bytes), sha256: result.sha256, size: result.size, mediaType: result.mediaType, ref: ref.ref };
    },
  });
}
