// Complete, bounded enumeration of committed Linear metadata. No issue bodies,
// task semantics, issuer, writer, network client or execution authority lives here.
import path from 'node:path';
import { lstat, open, realpath } from 'node:fs/promises';
import { createLinearReadEvidenceReader } from '../../../../guild_hall/linear_history/linear_read_evidence_reader.mjs';
import { assertNoReparseComponents } from '../../../../guild_hall/linear_history/linear_custody.mjs';
import { validateLinearCollectState, identityDigestForBinding, laneRecordFromReceipt } from '../../../../guild_hall/linear_history/linear_collect_runner.mjs';
import { validateLinearCollectRunReceipt } from '../../../../guild_hall/linear_history/linear_collect_receipt.mjs';
import { sha256Canonical } from '../../../../guild_hall/shared/project_history_envelope.mjs';

const GAP = 'polling_cannot_prove_hard_deletes';
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const PIN_KEYS = ['custody_root', 'state_root', 'lane_id', 'identity_digest', 'writer_authority_id', 'writer_epoch',
  'binding_sha256', 'workspace_url_key', 'organization_id', 'project_scope_ref', 'project_code'];
const fail = code => { throw Object.assign(new Error(code), { intakeLinearCode: code }); };
const require = (value, code) => { if (!value) fail(code); };
const safe = (value, pattern) => typeof value === 'string' && pattern.test(value);
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const same = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const contains = (a, b) => { const relative = path.relative(a, b); return same(a, b) || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const unchanged = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs
  && a.ctimeMs === b.ctimeMs && b.isFile() && !b.isSymbolicLink() && b.nlink === 1;
const hold = code => Object.freeze({ status: 'HOLD', hold_code: code, observations: Object.freeze([]), coverage_gaps: Object.freeze([]), execution_authority: false });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

async function metadata(root, segments, maxBytes) {
  let handle;
  try {
    const file = path.resolve(root, ...segments);
    require(contains(root, file) && !same(root, file), 'WORK_INTAKE_LINEAR_PATH_INVALID');
    await assertNoReparseComponents(file, '$work_intake_linear_metadata');
    const before = await lstat(file);
    require(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && same(await realpath(file), file), 'WORK_INTAKE_LINEAR_PATH_INVALID');
    require(before.size >= 2 && before.size <= maxBytes, 'WORK_INTAKE_LINEAR_METADATA_INVALID');
    handle = await open(file, 'r');
    require(unchanged(before, await handle.stat()), 'WORK_INTAKE_LINEAR_CHANGED');
    const bytes = await handle.readFile();
    require(unchanged(before, await handle.stat()) && unchanged(before, await lstat(file)), 'WORK_INTAKE_LINEAR_CHANGED');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await handle?.close(); }
}

export function createWorkIntakeLinearReader({ root, expectedBinding, workflowStatusMap = null,
  maxAgeMs = 30 * 60 * 1000, maximumIssues = 128, maximumEnumeratedIssues = 4096, now = () => new Date() } = {}) {
  let pins, context, reader;
  try {
    pins = structuredClone(expectedBinding);
    require(pins && Object.keys(pins).length === PIN_KEYS.length && PIN_KEYS.every(key => Object.hasOwn(pins, key))
      && [root, pins.custody_root, pins.state_root].every(value => typeof value === 'string' && path.isAbsolute(value))
      && same(root, pins.custody_root) && !contains(root, pins.state_root) && !contains(pins.state_root, root)
      && [pins.lane_id, pins.writer_authority_id, pins.project_scope_ref].every(value => safe(value, TOKEN))
      && [pins.identity_digest, pins.binding_sha256].every(value => safe(value, SHA))
      && safe(pins.workspace_url_key, /^[a-z0-9][a-z0-9-]{0,63}$/u) && safe(pins.organization_id, UUID)
      && safe(pins.project_code, /^[A-Z0-9][A-Z0-9_-]{2,23}$/u) && Number.isSafeInteger(pins.writer_epoch) && pins.writer_epoch > 0
      && Number.isSafeInteger(maxAgeMs) && maxAgeMs > 0 && typeof now === 'function'
      && Number.isSafeInteger(maximumIssues) && maximumIssues > 0 && maximumIssues <= 4096
      && Number.isSafeInteger(maximumEnumeratedIssues) && maximumEnumeratedIssues > 0 && maximumEnumeratedIssues <= 10000,
    'WORK_INTAKE_LINEAR_BINDING_INVALID');
    const binding = { lane_id: pins.lane_id, writer: { authority_id: pins.writer_authority_id, epoch: pins.writer_epoch }, workspace: { url_key: pins.workspace_url_key } };
    require(identityDigestForBinding(binding) === pins.identity_digest, 'WORK_INTAKE_LINEAR_BINDING_INVALID');
    context = { binding, identity_digest: pins.identity_digest };
    reader = createLinearReadEvidenceReader({ root, expectedBinding: pins, workflowStatusMap, maxAgeMs, now });
    freeze(pins);
  } catch { pins = null; }
  function fresh(state, receipt) {
    const time = now(), ms = time instanceof Date ? time.getTime() : typeof time === 'number' ? time : Date.parse(time);
    require(Number.isFinite(ms) && iso(state.last_completed_at) && iso(state.cursor.watermark)
      && Date.parse(state.last_completed_at) <= ms && Date.parse(receipt.window.upper) <= Date.parse(receipt.started_at)
      && Date.parse(state.cursor.watermark) <= Date.parse(receipt.started_at), 'WORK_INTAKE_LINEAR_CLOCK_INVALID');
    require(ms - Date.parse(state.last_completed_at) <= maxAgeMs && ms - Date.parse(state.cursor.watermark) <= maxAgeMs,
      'WORK_INTAKE_LINEAR_STALE');
  }
  async function committed() {
    const state = await metadata(pins.state_root, ['state', 'linear-collect.json'], 8 * 1024 * 1024);
    try { validateLinearCollectState(state, context); } catch { fail('WORK_INTAKE_LINEAR_STATE_INVALID'); }
    require(safe(state.last_run_id, SEGMENT) && iso(state.last_completed_at) && state.cursor.generation_seq > 0, 'WORK_INTAKE_LINEAR_UNCOMMITTED');
    const receipt = await metadata(pins.state_root, ['receipts', `${state.last_run_id}.json`], 128 * 1024);
    try { validateLinearCollectRunReceipt(receipt); } catch { fail('WORK_INTAKE_LINEAR_RECEIPT_INVALID'); }
    require(receipt.status === 'ok' && receipt.run_id === state.last_run_id && receipt.lane_id === pins.lane_id
      && receipt.writer_authority_id === pins.writer_authority_id && receipt.writer_epoch === pins.writer_epoch
      && receipt.binding_sha256 === pins.binding_sha256 && receipt.workspace_url_key === pins.workspace_url_key
      && receipt.organization_id === pins.organization_id, 'WORK_INTAKE_LINEAR_BINDING_MISMATCH');
    require(receipt.generation_seq === state.cursor.generation_seq && receipt.cursor_after.generation_seq === receipt.generation_seq
      && receipt.cursor_before.generation_seq + 1 === receipt.generation_seq && receipt.completed_at === state.last_completed_at
      && sha256Canonical(receipt.cursor_after) === sha256Canonical(state.cursor), 'WORK_INTAKE_LINEAR_GENERATION_MISMATCH');
    require(state.cursor.backfill === null && receipt.coverage_gaps.every(gap => gap === GAP), 'WORK_INTAKE_LINEAR_COVERAGE_INCOMPLETE');
    fresh(state, receipt);
    return { state, receipt };
  }
  async function snapshot() {
    if (!pins) return hold('WORK_INTAKE_LINEAR_BINDING_INVALID');
    try {
      const initial = await committed(), { state, receipt } = initial;
      const allKeys = Object.keys(state.object_index), ids = allKeys.filter(key => key.startsWith('read_evidence:')).map(key => key.slice(14)).sort();
      const issueIds = allKeys.filter(key => key.startsWith('issues:')).map(key => key.slice(7)).sort();
      require(ids.length <= maximumEnumeratedIssues && issueIds.length <= maximumEnumeratedIssues, 'WORK_INTAKE_LINEAR_ENUMERATION_LIMIT');
      require(ids.every(id => safe(id, UUID)) && sha256Canonical(ids) === sha256Canonical(issueIds), 'WORK_INTAKE_LINEAR_INDEX_COVERAGE_MISMATCH');
      require(ids.length > 0 || receipt.objects.issues.observed === 0 && receipt.objects.read_evidence.observed === 0, 'WORK_INTAKE_LINEAR_INDEX_COVERAGE_MISMATCH');
      const observations = []; let foreign = 0;
      const receiptDigest = sha256Canonical(receipt);
      for (const issueId of ids) {
        const observation = await reader.resolve({ issueId });
        if (observation.hold_code === 'LINEAR_PROJECT_SCOPE_MISMATCH') { foreign++; continue; }
        require(observation.status === 'CURRENT' && observation.generation_seq === receipt.generation_seq
          && observation.run_receipt_digest === receiptDigest && observation.observed_at === receipt.completed_at,
        'WORK_INTAKE_LINEAR_ITEM_NOT_CURRENT');
        observations.push(observation);
        require(observations.length <= maximumIssues, 'WORK_INTAKE_LINEAR_PROJECT_LIMIT');
      }
      const rechecked = await committed();
      require(sha256Canonical(initial) === sha256Canonical(rechecked), 'WORK_INTAKE_LINEAR_CHANGED');
      const value = { status: 'CURRENT', hold_code: null, project_ref: pins.project_code, project_code: pins.project_code,
        scope_ref: pins.project_scope_ref, generation_seq: receipt.generation_seq, observed_at: receipt.completed_at,
        watermark: state.cursor.watermark, observations, run_receipt_ref: laneRecordFromReceipt(receipt, receiptDigest).capture_ref,
        run_receipt_digest: receiptDigest, state_sha256: sha256Canonical(state).slice(7), binding_sha256: pins.binding_sha256,
        coverage_gaps: [GAP], coverage: 'complete_committed_index',
        enumerated_count: ids.length, foreign_scope_count: foreign, execution_authority: false };
      return freeze({ ...value, snapshot_sha256: sha256Canonical(value).slice(7) });
    } catch (error) { return hold(error.intakeLinearCode ?? 'WORK_INTAKE_LINEAR_METADATA_INVALID'); }
  }
  return Object.freeze({ snapshot, async current(value) {
    if (!value || value.status !== 'CURRENT' || !safe(value.snapshot_sha256, /^[a-f0-9]{64}$/u)) return false;
    const { snapshot_sha256, ...body } = value;
    try {
      if (sha256Canonical(body).slice(7) !== snapshot_sha256) return false;
      const actual = await snapshot();
      return actual.status === 'CURRENT' && actual.snapshot_sha256 === snapshot_sha256;
    } catch { return false; }
  } });
}
