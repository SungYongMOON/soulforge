// One investigation's call budget, shared by the search CLI and the original
// read CLI.
//
// A bot asked to find something can otherwise keep asking: each call is cheap
// on its own and the turn as a whole is not. Hermes has no tool-call ceiling of
// its own (only `agent.max_turns`), so the ceiling lives here, where the calls
// actually happen, and it is counted per investigation rather than per command.
//
// The key is the session the gateway bound for this turn (`HERMES_SESSION_ID`,
// narrowed by `HERMES_SESSION_MESSAGE_ID` when the host binds one). Those
// variables reach a spawned shell: the terminal tool builds its child
// environment through `_make_run_env`, whose last steps bridge the gateway's
// session ContextVars onto the child. A run with neither variable is not a
// session at all -- a developer at a prompt -- and is refused unless it names a
// development bucket with `--dev-run <label>`, so a regression run can never be
// counted against somebody's live turn.
//
// A row is written *before* the work starts, so a call that fails, times out or
// is retried still costs. The end row records what the call became; only start
// rows count against the limit. Receipts that cannot be written are a refusal,
// not a silent allowance: without the ledger there is no budget.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const INVESTIGATION_BUDGET_SCHEMA = 'soulforge.context_investigation_budget.v1';
/** Calls one investigation may make, counting failures and retries. */
export const INVESTIGATION_BUDGET_LIMIT = 6;
export const BUDGET_EXHAUSTED_CODE = 'investigation_budget_exhausted';
const SESSION_ID = 'HERMES_SESSION_ID';
const MESSAGE_ID = 'HERMES_SESSION_MESSAGE_ID';
const PROFILE = 'HERMES_SESSION_PROFILE';
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;
const SAFE = value => String(value).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120);

export class InvestigationBudgetError extends Error {
  constructor(code) { super(code); this.name = 'InvestigationBudgetError'; this.code = code; }
}
const fail = code => { throw new InvestigationBudgetError(code); };

/**
 * Which investigation this call belongs to. A gateway turn is its session (plus
 * the message the turn is answering, when one is bound); a developer run is the
 * label it declares. Nothing else is a key.
 */
export function investigationKey({ env = process.env, devRun = null } = {}) {
  const session = typeof env[SESSION_ID] === 'string' ? env[SESSION_ID].trim() : '';
  const message = typeof env[MESSAGE_ID] === 'string' ? env[MESSAGE_ID].trim() : '';
  if (session || message) {
    const key = message ? `${session}#${message}` : session;
    const profile = typeof env[PROFILE] === 'string' && env[PROFILE].trim() ? SAFE(env[PROFILE].trim()) : 'cli';
    return Object.freeze({ bucket: 'session', key, directory: profile, file: `${SAFE(key)}.jsonl` });
  }
  if (devRun === null || devRun === undefined) fail('investigation_budget_key_unavailable');
  if (typeof devRun !== 'string' || !LABEL.test(devRun)) fail('investigation_budget_dev_run_invalid');
  return Object.freeze({ bucket: 'dev', key: `dev:${devRun}`, directory: 'dev', file: `${devRun}.jsonl` });
}

function readRows(ledgerPath) {
  let text;
  try { text = readFileSync(ledgerPath, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return []; return fail('investigation_budget_unavailable'); }
  if (Buffer.byteLength(text, 'utf8') > MAX_LEDGER_BYTES) fail('investigation_budget_unavailable');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { fail('investigation_budget_unreadable'); }
    rows.push(row);
  }
  return rows;
}

/**
 * Opens the ledger for one call and charges it. `receiptsRoot` is an absolute
 * directory the tool configuration names -- this module never guesses a place to
 * write. Returns the charged call: `summary` is what a caller shows when the
 * budget is spent, `finish` records what this call became.
 *
 * Throws `investigation_budget_exhausted` when the limit is already reached; the
 * caller is expected to render `error.summary` and exit 2 without doing the work.
 */
export function chargeInvestigation({ receiptsRoot, cli, env = process.env, devRun = null, args = {},
  limit = INVESTIGATION_BUDGET_LIMIT, now = () => new Date() } = {}) {
  if (typeof receiptsRoot !== 'string' || !receiptsRoot) fail('investigation_budget_receipts_root_required');
  if (cli !== 'query' && cli !== 'read') fail('investigation_budget_cli_invalid');
  const identity = investigationKey({ env, devRun });
  const directory = join(receiptsRoot, identity.directory);
  const ledgerPath = join(directory, identity.file);
  const rows = readRows(ledgerPath).filter(row => row?.key === identity.key);
  const previous = rows.filter(row => row?.phase === 'start');
  if (previous.length >= limit) {
    const error = new InvestigationBudgetError(BUDGET_EXHAUSTED_CODE);
    // The start row is what a call costs; the end row is what it became. The
    // summary a refused caller gets has to carry the second one, or it says six
    // questions were asked and nothing about what came back.
    const ended = new Map(rows.filter(row => row?.phase === 'end').map(row => [row.call, row.outcome]));
    error.summary = previous.slice(0, limit).map((row, index) =>
      `${index + 1}. ${row.ts ?? '-'} ${row.cli ?? '-'} ${describe(row.arguments)} -> ${ended.get(row.call) ?? 'no result recorded'}`);
    error.calls = previous.length;
    throw error;
  }
  const started = now().toISOString();
  const base = { schema_version: INVESTIGATION_BUDGET_SCHEMA, ts: started, cli, key: identity.key,
    bucket: identity.bucket, call: previous.length + 1, limit, arguments: { ...args } };
  write(directory, ledgerPath, { ...base, phase: 'start', outcome: null,
    internal: { parser_calls: 0, parser_calls_scope: 'attachment_derivation_only', render_calls: 0, model_calls: 0 } });
  let closed = false;
  return Object.freeze({
    bucket: identity.bucket, key: identity.key, call: base.call, remaining: limit - base.call, ledger_path: ledgerPath,
    // The place is host-local; a receipt quotes the digest of the ledger's name
    // rather than the name itself when it has to travel.
    ledger_ref: `sha256:${createHash('sha256').update(ledgerPath).digest('hex')}`,
    finish(outcome, internal = {}) {
      if (closed) return;
      closed = true;
      write(directory, ledgerPath, { ...base, ts: now().toISOString(), phase: 'end', outcome: String(outcome ?? 'unknown'),
        internal: { parser_calls: Number(internal.parser_calls ?? 0), parser_calls_scope: 'attachment_derivation_only',
          render_calls: Number(internal.render_calls ?? 0),
          model_calls: 0 } });
    },
  });
}

function write(directory, ledgerPath, row) {
  try {
    mkdirSync(directory, { recursive: true });
    appendFileSync(ledgerPath, `${JSON.stringify(row)}\n`, 'utf8');
  } catch { fail('investigation_budget_unwritable'); }
}

function describe(args) {
  if (args === null || typeof args !== 'object') return '-';
  return Object.entries(args).filter(([, value]) => value !== null && value !== false && value !== undefined)
    .map(([name, value]) => `${name}=${value === true ? 'yes' : String(value).slice(0, 48)}`).join(' ') || '-';
}
