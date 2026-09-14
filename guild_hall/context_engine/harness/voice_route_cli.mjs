// The one writer of the voice route ledger: a person, or the runner a person
// starts. Nothing else writes here -- an investigating bot answers with a
// proposal and a person runs `confirm`, which is why `confirmed` carries a name
// and a time and why this file is a CLI rather than a library a caller can drive.
//
// It writes only the ledger. The recording, its transcripts, the library index
// and the project bindings are never opened for writing, and no transcript text
// is read or printed here at all: the decision is made while reading the session
// elsewhere, and what lands here is the decision.
//
// usage:
//   node voice_route_cli.mjs list    [--routes-dir <dir> | --root-table <file>] [--json]
//   node voice_route_cli.mjs show    --session <id> [...] [--json]
//   node voice_route_cli.mjs set     --session <id> --project <code> --from <s> --to <s>
//                                    --status candidate|unclassified --by <actor>
//                                    [--evidence <ref>]... [--transcript-run <a/b/c>]
//                                    [--now <iso>] [--dry] [--json]
//   node voice_route_cli.mjs confirm --session <id> --project <code> --from <s> --to <s>
//                                    --by <actor> [--evidence <ref>]... [--transcript-run <a/b/c>]
//                                    [--now <iso>] [--dry] [--json]
//   node voice_route_cli.mjs withdraw --session <id> --project <code> --from <s> --to <s>
//                                    [--now <iso>] [--dry] [--json]
//
// `--routes-dir` is for a fixture or a rehearsal; on an estate the folder is
// `control_root/voice-routes`, which the root table locates.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { VOICE_ROUTES_ADDRESS, VOICE_ROUTE_LEDGER_SCHEMA, VOICE_ROUTE_LIMITS, VoiceRouteError,
  isTranscriptRun, validateVoiceRouteLedger } from './voice_routes.mjs';

export const VOICE_ROUTE_COMMANDS = Object.freeze(['list', 'show', 'set', 'confirm', 'withdraw']);
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail = code => { throw new VoiceRouteError(code); };
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index++, next);
    if (flags.has(name)) flags.set(name, [...[flags.get(name)].flat(), value]);
    else flags.set(name, value);
  }
  return flags;
}
const listOf = value => (value === undefined || value === true ? [] : [value].flat().map(String));
const seconds = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail('voice_route_interval_invalid');
  return number;
};

/** An empty ledger for one session: what `set` starts from when there is no file. */
export function emptyLedger(sessionId) {
  return { schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: sessionId, transcript_run: null,
    routes: [], updated_at: null };
}

const sameWindow = (route, { code, from, to }) => route.project_code === code
  && route.start_seconds === from && route.end_seconds === to;

/**
 * Applies one decision to one ledger body and returns the next body. Pure: the
 * caller decides whether it reaches a file, so `--dry` shows exactly what would
 * be written rather than a description of it.
 *
 * `confirm` may create a window that no investigator proposed -- a person who
 * heard the recording does not need a bot's row first -- and it keeps whatever
 * `judged_by` was already there, so promoting a proposal does not overwrite who
 * proposed it.
 */
export function applyRouteDecision(ledger, { command, code, from, to, status, by, evidenceRefs = [],
  transcriptRun = undefined, now } = {}) {
  if (!PROJECT_CODE.test(code ?? '')) fail('voice_route_project_invalid');
  if (!(to > from)) fail('voice_route_interval_invalid');
  const routes = ledger.routes.filter(route => !sameWindow(route, { code, from, to }));
  const held = ledger.routes.find(route => sameWindow(route, { code, from, to })) ?? null;
  if (command === 'withdraw') {
    if (held === null) fail('voice_route_window_absent');
  } else {
    if (!ACTOR.test(by ?? '')) fail('voice_route_actor_required');
    const confirming = command === 'confirm';
    routes.push({ project_code: code, start_seconds: from, end_seconds: to,
      status: confirming ? 'confirmed' : status,
      evidence_refs: evidenceRefs.length > 0 ? [...evidenceRefs] : [...(held?.evidence_refs ?? [])],
      judged_by: held?.judged_by ?? by, judged_at: held?.judged_at ?? now,
      confirmed_by: confirming ? by : null, confirmed_at: confirming ? now : null });
  }
  const next = { ...ledger,
    transcript_run: transcriptRun === undefined ? ledger.transcript_run : transcriptRun,
    routes: routes.sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds
      || a.project_code.localeCompare(b.project_code)),
    updated_at: now };
  // Written only if it reads back as a ledger: a file this CLI cannot read is a
  // file the grant builder cannot read either, and it would fail there silently.
  return validateVoiceRouteLedger(next, { sessionId: ledger.session_id });
}

/** Where the ledgers live: an explicit folder, or `control_root/voice-routes`. */
function routesDirectory(flags) {
  const explicit = flags.get('routes-dir');
  if (typeof explicit === 'string') {
    if (!path.isAbsolute(explicit)) fail('voice_route_routes_dir_not_absolute');
    return explicit;
  }
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) fail('voice_route_routes_dir_required');
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
  return io.path(VOICE_ROUTES_ADDRESS, true);
}

const ledgerFile = (dir, sessionId) => path.join(dir, `${sessionId}.json`);

export function readLedgerFile(dir, sessionId) {
  const file = ledgerFile(dir, sessionId);
  if (!existsSync(file)) return { ledger: emptyLedger(sessionId), existed: false };
  const bytes = readFileSync(file);
  if (bytes.length > VOICE_ROUTE_LIMITS.ledger_bytes) fail('voice_route_ledger_too_large');
  let body;
  try { body = JSON.parse(bytes); } catch { return fail('voice_route_ledger_unreadable'); }
  return { ledger: validateVoiceRouteLedger(body, { sessionId }), existed: true, sha256: sha256(bytes) };
}

function writeLedgerFile(dir, ledger) {
  mkdirSync(dir, { recursive: true });
  const file = ledgerFile(dir, ledger.session_id);
  const bytes = encode(ledger);
  // Through a neighbour and a rename, so a reader never sees half a decision.
  const staging = `${file}.writing`;
  writeFileSync(staging, bytes);
  renameSync(staging, file);
  return { file, sha256: sha256(bytes) };
}

const summarize = ledger => ({ session_id: ledger.session_id, transcript_run: ledger.transcript_run,
  updated_at: ledger.updated_at, routes: ledger.routes.length,
  confirmed: ledger.routes.filter(route => route.status === 'confirmed').length,
  candidate: ledger.routes.filter(route => route.status === 'candidate').length,
  unclassified: ledger.routes.filter(route => route.status === 'unclassified').length });

const routeLine = route => `${route.project_code} | ${route.start_seconds}-${route.end_seconds}s | ${route.status}`
  + ` | 판정 ${route.judged_by} ${route.judged_at}`
  + (route.status === 'confirmed' ? ` | 확정 ${route.confirmed_by} ${route.confirmed_at}` : '')
  + (route.evidence_refs.length ? ` | 근거 ${route.evidence_refs.length}건` : '');

export function runVoiceRouteCli(argv) {
  const command = argv[0];
  if (!VOICE_ROUTE_COMMANDS.includes(command)) fail('voice_route_command_unknown');
  const flags = options(argv.slice(1));
  const dir = routesDirectory(flags);
  const json = flags.get('json') === true;
  const dry = flags.get('dry') === true;

  if (command === 'list') {
    // The folder is shared with the voice inbox access declaration, so a file
    // that declares another schema is another owner's record, not a bad ledger.
    const rows = [], others = [];
    for (const name of (existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : [])
      .filter(entry => entry.endsWith('.json')).sort()) {
      const sessionId = name.slice(0, -'.json'.length);
      let declared = null;
      try { const body = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
        declared = body?.schema_version ?? body?.schema ?? null; } catch { declared = null; }
      if (typeof declared === 'string' && declared !== VOICE_ROUTE_LEDGER_SCHEMA) { others.push({ file: name, schema: declared }); continue; }
      try { rows.push(summarize(readLedgerFile(dir, sessionId).ledger)); }
      catch (error) { rows.push({ session_id: sessionId, unreadable: error?.code ?? 'voice_route_ledger_unreadable' }); }
    }
    return { command, ledgers: rows, other_schemas: others, ...(json ? {} : { text: [
      ...rows.map(row => row.unreadable ? `${row.session_id} | 읽을 수 없음: ${row.unreadable}`
        : `${row.session_id} | 확정 ${row.confirmed} · 후보 ${row.candidate} · 미분류 ${row.unclassified}`),
      ...others.map(row => `${row.file} | 다른 기록(${row.schema})`)].join('\n') }) };
  }

  const sessionId = String(flags.get('session') ?? '');
  if (!SESSION_ID.test(sessionId)) fail('voice_route_session_invalid');
  const held = readLedgerFile(dir, sessionId);

  if (command === 'show') {
    return { command, existed: held.existed, ...summarize(held.ledger),
      routes: held.ledger.routes.map(route => ({ ...route })),
      ...(json ? {} : { text: [`${sessionId} | 전사 ${held.ledger.transcript_run?.join('/') ?? '세션 전사'}`,
        ...held.ledger.routes.map(routeLine)].join('\n') }) };
  }

  const runFlag = flags.get('transcript-run');
  const transcriptRun = runFlag === undefined ? undefined
    : runFlag === true ? null : String(runFlag).split('/').filter(Boolean);
  if (transcriptRun !== undefined && !isTranscriptRun(transcriptRun)) fail('voice_route_transcript_run_invalid');
  const status = command === 'set' ? String(flags.get('status') ?? '') : null;
  if (command === 'set' && !['candidate', 'unclassified'].includes(status)) fail('voice_route_status_invalid');
  const now = String(flags.get('now') ?? new Date().toISOString());
  const next = applyRouteDecision(held.ledger, { command, code: String(flags.get('project') ?? ''),
    from: seconds(flags.get('from')), to: seconds(flags.get('to')), status,
    by: flags.get('by') === undefined ? null : String(flags.get('by')),
    evidenceRefs: listOf(flags.get('evidence')), transcriptRun, now });
  const written = dry ? null : writeLedgerFile(dir, next);
  return { command, dry, ...summarize(next), routes: next.routes.map(route => ({ ...route })),
    file_sha256: written?.sha256 ?? null,
    ...(json ? {} : { text: [`${dry ? '[미기록] ' : ''}${sessionId} | ${command}`,
      ...next.routes.map(routeLine)].join('\n') }) };
}

function main() {
  const argv = process.argv.slice(2);
  const result = runVoiceRouteCli(argv);
  const { text, ...body } = result;
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(body)}\n` : `${text}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`[voice-route] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  }
}
