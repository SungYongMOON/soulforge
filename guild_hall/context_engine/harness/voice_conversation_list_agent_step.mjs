// Step-driven CLI for answering the conversation-list pipeline
// (`voice_conversation_list_cli.mjs`'s `runConversationList`) with an OUTSIDE
// agent instead of the local model the rest of this lane is built around.
//
// The local pipeline's only transport is a loopback model, by design: an
// unclassified recording's transcript belongs to no project's admission and
// must not leave this host (see `voice_conversation_list_cli.mjs`'s own
// header). This harness exists only because the Owner recorded a one-off,
// explicit exception for the BACKLOG of old sessions -- a Claude Opus
// sub-agent operated by a coordinator answers the same ~14 questions per
// session a local model would, and this session's transcript excerpts may
// leave the host for that purpose. That exception is not ambient: every
// pipeline config this harness accepts must carry a signed
// `offhost_transcripts` block (`allowed: true, decided_by, decided_at,
// scope`) and must declare `model.transport === 'agent_step'` -- anything
// else is refused before a single byte of a transcript is touched. The
// ordinary CLI and nightly lane already refuse an `agent_step` transport on
// their own (`ollama_chat.mjs`'s `validateChatBinding` only knows `ollama`
// and `openai_chat`); this file adds no exception to that, it adds a
// parallel path that never calls `createLocalChat` at all.
//
// There is no long-lived process and no polling. Each invocation reads
// whatever is cached on disk, replays it, and either finishes the pass or
// stops at the first question nobody has answered yet -- writing that single
// question to `<run dir>/pending/<key>.request.json` and returning the
// pipeline's own "budget exhausted" status so the pass ends cleanly rather
// than failing. An outside agent answers by writing the model's JSON
// straight into the pipeline's own answer cache (`answer`), in exactly the
// shape `makeAsk` (in `voice_conversation_list_cli.mjs`) already reads, so
// the next `step` is a cache hit and nothing here duplicates the pipeline's
// own caching, budgeting or verification.
//
// Provenance is the whole point of this file existing separately: `pinFor`
// here never claims a weight digest it does not have -- it returns
// `{ digest: null, pin_kind: 'external_agent_unpinned', alias }` -- so a run
// made through this harness is distinguishable from a local-model run by its
// manifest alone, honestly.
//
// usage:
//   node voice_conversation_list_agent_step.mjs plan --root-table <file>
//        --root-table-sha256 sha256:<hex> --tools-config <file>
//        --pipeline-config <file> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
//        [--order oldest|newest] [--limit N] [--json]
//   node voice_conversation_list_agent_step.mjs step --root-table <file>
//        --root-table-sha256 sha256:<hex> --tools-config <file>
//        --pipeline-config <file> --session <id> [--with-system]
//   node voice_conversation_list_agent_step.mjs answer --root-table <file>
//        --root-table-sha256 sha256:<hex> --tools-config <file>
//        --pipeline-config <file> --session <id> --key <key>
//        (--file <json file> | --stdin)
//   node voice_conversation_list_agent_step.mjs status --root-table <file>
//        --root-table-sha256 sha256:<hex> --tools-config <file>
//        --pipeline-config <file> --session <id>
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { ConversationListError, DEFAULT_LIMITS, PIPELINE_CONFIG_SCHEMA, cacheKeyFor, runIdFor }
  from '../src/runtime/voice_conversation_list.mjs';
import { preparePlaudLabeler, readPrompts, readSessionInputs, runConversationList } from './voice_conversation_list_cli.mjs';
import { classifySession } from './voice_conversation_list_nightly.mjs';
import { VOICE_SESSIONS_ADDRESS } from './voice_segment_drafts.mjs';

export const AGENT_STEP_COMMANDS = Object.freeze(['plan', 'step', 'answer', 'status']);
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const KEY = /^[0-9a-f]{64}$/u;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_ANSWER_BYTES = 200 * 1024;
// A lock held longer than this is treated as abandoned rather than a `step`
// still in flight -- long enough for one session's worth of agent round
// trips (the pipeline never budgets wall clock for a single call, so a slow
// agent is not itself a reason to reclaim), short enough that a genuinely
// dead process does not block a session for a whole work day.
export const AGENT_STEP_LOCK_STALE_MS = 30 * 60 * 1000;
const LOCK_FILE_NAME = 'agent_step.lock';
function buildControlCharacterClass() {
  const cc = code => String.fromCharCode(code);
  return '[' + cc(0) + '-' + cc(8) + cc(11) + cc(12) + cc(14) + '-' + cc(31) + cc(127) + ']';
}
const CONTROL_CHARACTER = new RegExp(buildControlCharacterClass(), 'u');

const fail = code => { throw new ConversationListError(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = bytes => createHash('sha256').update(bytes).digest('hex');

// This file's own root: three levels above `harness/` is the repository root
// in a dev checkout, and the same three levels above a built lane's copy of
// this file is that lane's own root -- a relative `prompts_dir` in a
// pipeline config therefore resolves correctly wherever this file runs from,
// with no environment variable and no lane-specific configuration.
export const AGENT_STEP_REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index++, next));
  }
  return flags;
}
const str = (flags, name) => { const value = flags.get(name); return value === undefined || value === true ? null : String(value); };

function requireSession(flags) {
  const sessionId = str(flags, 'session');
  if (!sessionId || !SESSION_ID.test(sessionId)) fail('voice_agent_step_session_invalid');
  return sessionId;
}

// --------------------------------------------------------------- config
/**
 * The pipeline config this harness will run with, validated for exactly the
 * shape the Owner's exception covers -- and nothing else. `readPipelineConfig`
 * (the shared reader every other caller of this pipeline uses) is
 * deliberately not reused here: it requires `model.host`, which an external
 * agent has none of, and it has no notion of the off-host exception at all.
 * Reusing it would mean loosening it for every caller; this is a separate,
 * additive reader instead; the pipeline runtime it feeds
 * (`runConversationList`) is exactly the same function every other caller
 * uses, unmodified.
 */
export function readAgentStepPipelineConfig(bytes, { repoRoot = AGENT_STEP_REPO_ROOT } = {}) {
  let value;
  try { value = JSON.parse(bytes); } catch { fail('voice_agent_step_config_unreadable'); }
  if (value?.schema !== PIPELINE_CONFIG_SCHEMA) fail('voice_agent_step_config_schema_unknown');
  const model = value.model;
  if (!plain(model) || typeof model.model !== 'string' || !model.model) fail('voice_agent_step_config_invalid');
  if (model.transport !== 'agent_step') fail('voice_agent_step_transport_required');
  if (model.host !== undefined && model.host !== null
    && (typeof model.host !== 'string' || !model.host)) fail('voice_agent_step_config_invalid');
  if (typeof value.prompts_dir !== 'string' || !value.prompts_dir) fail('voice_agent_step_config_invalid');
  const exception = value.offhost_transcripts;
  if (!plain(exception) || exception.allowed !== true
    || typeof exception.decided_by !== 'string' || !exception.decided_by.trim()
    || typeof exception.decided_at !== 'string' || !DATE_DIR.test(exception.decided_at)
    || typeof exception.scope !== 'string' || !exception.scope.trim()) {
    fail('voice_agent_step_offhost_exception_required');
  }
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, given] of Object.entries(value.limits ?? {})) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) fail('voice_agent_step_config_limit_unknown');
    if (!Number.isSafeInteger(given) || given < 1) fail('voice_agent_step_config_invalid');
    limits[key] = given;
  }
  if (limits.llm_calls > 100) fail('voice_agent_step_config_budget_too_large');
  const promptsDir = path.isAbsolute(value.prompts_dir) ? value.prompts_dir : path.join(repoRoot, value.prompts_dir);
  return Object.freeze({ schema: value.schema,
    model: Object.freeze({ model: model.model, transport: 'agent_step', host: model.host ?? null }),
    prompts_dir: promptsDir, limits: Object.freeze(limits),
    offhost_transcripts: Object.freeze({ ...exception }),
    note: typeof value.note === 'string' ? value.note : null });
}

async function loadContext(flags) {
  const tablePath = str(flags, 'root-table');
  if (!tablePath) fail('voice_agent_step_root_table_required');
  const toolsPath = str(flags, 'tools-config');
  if (!toolsPath) fail('voice_agent_step_tools_config_required');
  const configPath = str(flags, 'pipeline-config');
  if (!configPath) fail('voice_agent_step_pipeline_config_required');
  // No fallback default the way the ordinary CLI has: this harness requires
  // the pin on every invocation rather than silently trusting the file it
  // just read the hash of.
  const expectedSha256 = str(flags, 'root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256 }));
  const tools = readToolsConfig(readFileSync(toolsPath));
  if (!tools.derived_root) fail('voice_agent_step_derived_root_required');
  const configBytes = readFileSync(configPath);
  if (configBytes.length > MAX_CONFIG_BYTES) fail('voice_agent_step_config_too_large');
  const config = readAgentStepPipelineConfig(configBytes);
  const configSha256 = hex(configBytes);
  const { prompts, digests } = readPrompts(config.prompts_dir);
  return { io, tools, config, prompts, promptDigests: digests, configSha256 };
}

/** The model identity this harness ever claims: no digest, named honestly. */
export async function agentStepPinFor(binding) {
  return { digest: null, pin_kind: 'external_agent_unpinned', alias: binding.model };
}

/**
 * Where one session's run will live, computed the same way
 * `runConversationList` computes it internally -- before that function is
 * called, so the pending directory and the session lock can be found. This
 * reads the session's inputs a second time (the pipeline reads them again
 * itself); both reads are read-only and cheap, and computing the same run id
 * twice from the same unchanged inputs always lands on the same id.
 */
async function resolveRun(ctx, sessionId, now) {
  const source = ctx.config.transcript_source ?? 'whisper';
  if (source === 'plaud') await preparePlaudLabeler();
  const input = readSessionInputs({ io: ctx.io, sessionId, transcriptSource: source });
  const model = await agentStepPinFor(ctx.config.model);
  const runId = runIdFor({ sessionId, transcript: input.transcript,
    semanticRun: { run_id: input.semantic.run_id, sha256: input.semantic.sha256 },
    prompts: ctx.promptDigests, model: { ...model, alias: ctx.config.model.model }, configSha256: ctx.configSha256 });
  const sessionDir = path.join(ctx.tools.derived_root, 'voice', sessionId);
  const outDir = path.join(sessionDir, runId);
  return { runId, outDir, pendingDir: path.join(outDir, 'pending'), lockFile: path.join(sessionDir, LOCK_FILE_NAME) };
}

// ----------------------------------------------------------------- lock
function acquireLock(lockFile, now) {
  mkdirSync(path.dirname(lockFile), { recursive: true });
  const write = () => writeFileSync(lockFile, `${JSON.stringify({ pid: process.pid, started_at: now }, null, 2)}\n`,
    { flag: 'wx' });
  try { write(); return { acquired: true, reclaimed_stale: null }; }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let previous = null;
    try { previous = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { previous = null; }
    const startedMs = previous ? Date.parse(previous.started_at) : NaN;
    const stale = !Number.isFinite(startedMs) || (Date.parse(now) - startedMs) > AGENT_STEP_LOCK_STALE_MS;
    if (!stale) return { acquired: false, reclaimed_stale: null };
    try { rmSync(lockFile, { force: true }); write(); return { acquired: true, reclaimed_stale: previous }; }
    catch { return { acquired: false, reclaimed_stale: null }; }
  }
}
const releaseLock = lockFile => { try { rmSync(lockFile, { force: true }); } catch { /* already gone */ } };

// ------------------------------------------------------------- chat/pin
/**
 * `chatFor` for `runConversationList`: on a cache MISS (this is only ever
 * called after `makeAsk` already found no cached answer) it writes the
 * pending request once and, for every call in this same pass after that
 * first one, answers `budget_exhausted` without writing anything else --
 * mirroring the local model's own exhausted-budget behaviour exactly, so
 * this pass's remaining steps note the gap and finish rather than throw.
 */
function createAgentStepChatFor({ outDir, promptDigests, onPending }) {
  return function chatFor({ binding }) {
    const rows = [];
    let asked = false;
    async function chat({ step, system, user, schema }) {
      const key = cacheKeyFor({ step, model: binding.model, system, user, schema });
      if (asked) { rows.push({ call: rows.length + 1, step, status: 'budget_exhausted' }); return { status: 'budget_exhausted' }; }
      asked = true;
      const promptName = step;
      const promptSha256 = promptDigests[promptName] ?? null;
      const pendingDir = path.join(outDir, 'pending');
      mkdirSync(pendingDir, { recursive: true });
      const requestFile = path.join(pendingDir, `${key}.request.json`);
      const schemaFile = path.join(pendingDir, `${key}.schema.json`);
      const request = { key, step, prompt_name: promptName, prompt_sha256: promptSha256, system, user, schema };
      writeFileSync(requestFile, `${JSON.stringify(request, null, 2)}\n`);
      writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`);
      onPending({ ...request, request_file: requestFile, schema_file: schemaFile });
      rows.push({ call: rows.length + 1, step, status: 'budget_exhausted' });
      return { status: 'budget_exhausted' };
    }
    return Object.freeze({ chat, trace: () => rows.map(row => ({ ...row })), model: binding });
  };
}

// -------------------------------------------------------------- schema
/**
 * A small, strict validator over exactly the JSON Schema subset the five
 * conversation-list answer schemas use: `object`/`required`/
 * `additionalProperties: false`/`properties`, `array`/`items`, `string`,
 * `integer`, `boolean`, `enum`, and a `type` array such as
 * `["string", "null"]`. Nothing here executes or interprets the value being
 * checked -- it only walks its shape against the schema's own shape.
 */
function typeMatches(value, type) {
  switch (type) {
    case 'object': return plain(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
}

export function validateAgainstSchema(value, schema, at = '$') {
  if (!plain(schema) || schema.type === undefined) return { ok: false, code: `${at}: schema_shape_invalid` };
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some(type => typeMatches(value, type))) return { ok: false, code: `${at}: type_mismatch` };
  if (schema.enum !== undefined && !schema.enum.includes(value)) return { ok: false, code: `${at}: enum_mismatch` };
  if (plain(value) && types.includes('object')) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) return { ok: false, code: `${at}.${key}: required_missing` };
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) return { ok: false, code: `${at}.${key}: additional_property` };
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        const checked = validateAgainstSchema(value[key], sub, `${at}.${key}`);
        if (!checked.ok) return checked;
      }
    }
  }
  if (Array.isArray(value) && types.includes('array') && schema.items) {
    for (let index = 0; index < value.length; index++) {
      const checked = validateAgainstSchema(value[index], schema.items, `${at}[${index}]`);
      if (!checked.ok) return checked;
    }
  }
  return { ok: true, code: null };
}

// Written with numeric code points rather than `\u` escapes on purpose: this
// source file has to survive being authored through tool layers that decode
// a literal `\uXXXX` escape into the actual (here, structurally invalid on
// its own) UTF-16 code unit before it ever reaches disk -- a lone surrogate
// embedded directly in a UTF-8 source file is not well-formed UTF-8 at all.
// Plain hex number literals carry no such risk.
const HIGH_SURROGATE_START = 0xd800, HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00, LOW_SURROGATE_END = 0xdfff;

/** Whether `text` contains a UTF-16 surrogate half with no matching partner -- not valid Unicode text. */
function hasUnpairedSurrogate(text) {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= HIGH_SURROGATE_START && code <= HIGH_SURROGATE_END) {
      const next = text.charCodeAt(index + 1);
      // `charCodeAt` past the end of the string returns `NaN`, which fails
      // every ordered comparison -- explicit here so "nothing follows the
      // high surrogate at all" is treated as unpaired, not silently as paired.
      if (Number.isNaN(next) || next < LOW_SURROGATE_START || next > LOW_SURROGATE_END) return true;
      index += 1; // the well-formed pair just consumed
    } else if (code >= LOW_SURROGATE_START && code <= LOW_SURROGATE_END) {
      return true; // a low surrogate with nothing before it
    }
  }
  return false;
}

/**
 * The first problem found in any string leaf: a control character (other
 * than `\n`/`\t`), or a lone UTF-16 surrogate half (never valid Unicode text
 * on its own, and not something JSON.stringify/JSON.parse round-trips
 * safely). Returns `null` when the value has neither.
 */
export function findControlCharacter(value) {
  if (typeof value === 'string') {
    if (CONTROL_CHARACTER.test(value)) return 'string_value';
    return hasUnpairedSurrogate(value) ? 'unpaired_surrogate' : null;
  }
  if (Array.isArray(value)) { for (const item of value) { const found = findControlCharacter(item); if (found) return found; } return null; }
  if (plain(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (CONTROL_CHARACTER.test(key) || hasUnpairedSurrogate(key)) return 'object_key';
      const found = findControlCharacter(item);
      if (found) return found;
    }
  }
  return null;
}

// -------------------------------------------------------------- listing
function listDirNames(io, address) {
  try {
    return readdirSync(io.path(address, true), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch { return []; }
}

/**
 * `classifySession`'s own vocabulary, mapped onto the backlog's coarser one.
 * Called with `configSha256: null, promptDigests: null` on purpose: passed
 * that way, `staleReasonFor` never compares a run's recorded model/config/
 * prompt pins (both are `null`), so ANY verified run -- from any model, any
 * config, local or agent -- is `skipped_existing`. This is a deliberate
 * difference from the nightly lane's own default, which re-runs a verified
 * session whose pins moved on (`existing_run_stale:<field>`): the backlog's
 * job is to give every old session exactly one verified card, once, however
 * it was made, not to keep it current with whichever config answers it next.
 */
function bucketFor(described) {
  if (described.classification === 'skipped_short') {
    return described.reason === 'transcript_absent' ? 'transcript_absent' : 'skipped_short';
  }
  if (described.classification === 'skipped_existing') return 'skipped_existing';
  if (described.classification === 'failed') return 'failed';
  return 'todo';
}

// ------------------------------------------------------------- commands
async function commandPlan(argv) {
  const flags = options(argv);
  const from = str(flags, 'from'), to = str(flags, 'to');
  if (!DATE_DIR.test(from ?? '') || !DATE_DIR.test(to ?? '') || from > to) fail('voice_agent_step_plan_range_invalid');
  const order = str(flags, 'order') ?? 'oldest';
  if (!['oldest', 'newest'].includes(order)) fail('voice_agent_step_plan_order_invalid');
  const limitFlag = flags.get('limit');
  const limit = limitFlag === undefined ? null : Number(limitFlag);
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) fail('voice_agent_step_plan_limit_invalid');
  const asJson = flags.get('json') === true;
  const ctx = await loadContext(flags);

  const dates = listDirNames(ctx.io, VOICE_SESSIONS_ADDRESS).filter(name => DATE_DIR.test(name) && name >= from && name <= to);
  const rows = [];
  for (const date of dates) {
    for (const sessionId of listDirNames(ctx.io, `${VOICE_SESSIONS_ADDRESS}/${date}`)) {
      const described = classifySession({ io: ctx.io, tools: ctx.tools, sessionsAddress: VOICE_SESSIONS_ADDRESS,
        date, sessionId, configSha256: null, promptDigests: null,
        transcriptSource: ctx.config.transcript_source ?? null });
      rows.push({ date, session_id: sessionId, title: described.title, duration_seconds: described.duration_seconds,
        classification: bucketFor(described) });
    }
  }
  rows.sort((a, b) => (a.date === b.date ? (a.session_id < b.session_id ? -1 : 1) : (a.date < b.date ? -1 : 1)));
  if (order === 'newest') rows.reverse();
  const limited = limit === null ? rows : rows.slice(0, limit);
  if (asJson) return { exitCode: 0, text: `${JSON.stringify({ command: 'plan', from, to, order, sessions: limited })}\n` };
  const lines = limited.map(row => `${row.date} ${row.session_id} ${row.classification}`
    + ` · ${row.duration_seconds ?? '-'}s · ${row.title}`);
  return { exitCode: 0, text: `${(lines.length === 0 ? ['(no candidates)'] : lines).join('\n')}\n` };
}

async function commandStep(argv, { now }) {
  const flags = options(argv);
  const sessionId = requireSession(flags);
  const withSystem = flags.get('with-system') === true;
  const ctx = await loadContext(flags);
  const { outDir, lockFile } = await resolveRun(ctx, sessionId, now);
  const lock = acquireLock(lockFile, now);
  if (!lock.acquired) return { exitCode: 3, text: `STATUS=lock_held SESSION=${sessionId}\n` };
  try {
    let pending = null;
    const chatFor = createAgentStepChatFor({ outDir, promptDigests: ctx.promptDigests,
      onPending: request => { pending = request; } });
    const result = await runConversationList({ io: ctx.io, tools: ctx.tools, config: ctx.config,
      prompts: ctx.prompts, promptDigests: ctx.promptDigests, configSha256: ctx.configSha256,
      sessionId, chatFor, pinFor: agentStepPinFor, now });
    if (pending !== null) {
      const header = `STATUS=need_answer KEY=${pending.key} STEP=${pending.step} PROMPT=${pending.prompt_name}`
        + ` PROMPT_SHA256=${pending.prompt_sha256} SCHEMA_FILE=${pending.schema_file} REQUEST_FILE=${pending.request_file}`;
      const lines = [header, ''];
      if (withSystem) lines.push('SYSTEM:', pending.system, '', 'USER:');
      lines.push(pending.user);
      return { exitCode: 10, text: `${lines.join('\n')}\n` };
    }
    const verified = result.list.verified === true;
    return { exitCode: verified ? 0 : 2, text: `STATUS=done RUN_ID=${result.run_id} VERIFIED=${verified}`
      + ` CONVERSATIONS=${result.list.segments.length} LLM_ANSWERS=${result.manifest.calls.cache_hits}\n` };
  } finally { releaseLock(lockFile); }
}

async function commandAnswer(argv) {
  const flags = options(argv);
  const sessionId = requireSession(flags);
  const key = str(flags, 'key');
  if (key === null) fail('voice_agent_step_key_required');
  const filePath = str(flags, 'file');
  const useStdin = flags.get('stdin') === true;
  if ((filePath !== null) === useStdin) fail('voice_agent_step_answer_source_invalid');
  // A malformed key is rejected before any config is loaded or any run
  // resolved -- there is no pending request to find for it whatever the
  // config says, so the expensive IO below would only be discarded.
  if (!KEY.test(key)) return { exitCode: 5, text: 'STATUS=rejected REASON=key_unknown\n' };
  const ctx = await loadContext(flags);
  const now = new Date().toISOString();
  const { outDir, pendingDir } = await resolveRun(ctx, sessionId, now);

  const requestFile = path.join(pendingDir, `${key}.request.json`);
  if (!existsSync(requestFile)) return { exitCode: 5, text: 'STATUS=rejected REASON=key_not_pending\n' };
  let request;
  try { request = JSON.parse(readFileSync(requestFile, 'utf8')); }
  catch { return { exitCode: 5, text: 'STATUS=rejected REASON=request_unreadable\n' }; }

  let raw;
  try { raw = useStdin ? readFileSync(0) : readFileSync(filePath); }
  catch { return { exitCode: 5, text: 'STATUS=rejected REASON=answer_unreadable\n' }; }
  if (raw.length > MAX_ANSWER_BYTES) return { exitCode: 5, text: 'STATUS=rejected REASON=answer_too_large\n' };
  let value;
  try { value = JSON.parse(raw.toString('utf8')); }
  catch { return { exitCode: 5, text: 'STATUS=rejected REASON=answer_json_invalid\n' }; }
  // Schema first, control-character/surrogate scan second: `validateAgainstSchema`
  // only ever recurses as deep as the SCHEMA goes (every one of the five answer
  // schemas is a handful of levels deep, never self-referential), so a value
  // nested far deeper than the schema expects is rejected the moment a branch's
  // `type` stops matching -- long before this file's own recursive scan would
  // ever walk that deep. Scanning strings for control characters first, on an
  // answer whose *shape* was never checked, let a pathologically nested (but
  // still under 200 KB) value reach unbounded recursion instead of a clean
  // rejection.
  const checked = validateAgainstSchema(value, request.schema);
  if (!checked.ok) return { exitCode: 5, text: `STATUS=rejected REASON=${checked.code}\n` };
  const control = findControlCharacter(value);
  if (control !== null) return { exitCode: 5, text: `STATUS=rejected REASON=control_character:${control}\n` };

  const cacheDir = path.join(outDir, 'cache', request.step);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path.join(cacheDir, `${key}.json`), `${JSON.stringify({ step: request.step, value }, null, 2)}\n`);
  try { rmSync(requestFile, { force: true }); rmSync(path.join(pendingDir, `${key}.schema.json`), { force: true }); }
  catch { /* the cache entry is already the answer of record even if cleanup stumbles */ }
  return { exitCode: 0, text: 'STATUS=accepted\n' };
}

async function commandStatus(argv) {
  const flags = options(argv);
  const sessionId = requireSession(flags);
  const ctx = await loadContext(flags);
  const now = new Date().toISOString();
  const { runId, outDir, pendingDir } = await resolveRun(ctx, sessionId, now);
  let pendingNames = [];
  try { pendingNames = readdirSync(pendingDir).filter(name => name.endsWith('.request.json')); } catch { pendingNames = []; }
  const pendingRows = pendingNames.map(name => {
    try { const body = JSON.parse(readFileSync(path.join(pendingDir, name), 'utf8'));
      return { key: body.key, step: body.step, prompt_name: body.prompt_name }; } catch { return null; }
  }).filter(Boolean);
  let list = null, manifest = null;
  try { list = JSON.parse(readFileSync(path.join(outDir, 'conversation_list.v0.json'), 'utf8')); } catch { list = null; }
  try { manifest = JSON.parse(readFileSync(path.join(outDir, 'run_manifest.json'), 'utf8')); } catch { manifest = null; }
  const lines = [`RUN_ID=${runId}`, `PENDING=${pendingRows.length}`,
    ...pendingRows.map(row => `  KEY=${row.key} STEP=${row.step} PROMPT=${row.prompt_name}`),
    `DONE=${list !== null}`,
    ...(list !== null ? [`VERIFIED=${list.verified === true}`, `CONVERSATIONS=${list.segments.length}`] : []),
    ...(manifest !== null ? [`LLM_ANSWERS=${manifest.calls.cache_hits}`] : [])];
  return { exitCode: 0, text: `${lines.join('\n')}\n` };
}

// ------------------------------------------------------------------ main
export async function runVoiceConversationAgentStepCli(argv, { now = new Date().toISOString() } = {}) {
  const command = argv[0];
  if (!AGENT_STEP_COMMANDS.includes(command)) fail('voice_agent_step_command_unknown');
  const rest = argv.slice(1);
  if (command === 'plan') return commandPlan(rest);
  if (command === 'status') return commandStatus(rest);
  if (command === 'answer') return commandAnswer(rest);
  return commandStep(rest, { now });
}

// A thrown error only ever reaches here from argument/config validation
// (this file's own `fail()` calls, or `readRootTable`/`readToolsConfig`
// rejecting a bad file) or from a read the pipeline itself needed (a session
// with no transcript, an ambiguous semantic-label run, ...). The first class
// is "you called this wrong" (exit 4); the second is a real failure of the
// run itself (exit 2) -- the same distinction the spec draws.
const CONFIG_CLASS_PREFIXES = Object.freeze(['voice_agent_step_', 'root_table_', 'tools_config_']);
const isConfigClassCode = code => typeof code === 'string'
  && (CONFIG_CLASS_PREFIXES.some(prefix => code.startsWith(prefix)) || code === 'voice_pipeline_prompt_absent');

async function main() {
  try {
    const { exitCode, text } = await runVoiceConversationAgentStepCli(process.argv.slice(2));
    process.stdout.write(text);
    return exitCode;
  } catch (error) {
    process.stderr.write(`[voice-conversation-list-agent-step] ${error?.code ?? error?.message ?? 'failed'}\n`);
    return isConfigClassCode(error?.code) ? 4 : 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, () => { process.exitCode = 2; });
}
