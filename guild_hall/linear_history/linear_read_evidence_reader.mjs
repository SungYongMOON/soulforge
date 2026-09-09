// Read-only metadata consumer of the collection lane's committed observation.
// Neither issue custody bodies nor credentials are opened. Source observations
// retain their polling gap and can never authorize execution or acceptance.
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import { assertNoReparseComponents } from "./linear_custody.mjs";
import { validateLinearCollectRunReceipt } from "./linear_collect_receipt.mjs";
import {
  identityDigestForBinding, laneRecordFromReceipt, LINEAR_CUSTODY_OBJECT_SCHEMA_VERSION,
  LINEAR_READ_EVIDENCE_ENVELOPE_SCHEMA_VERSION, LINEAR_READ_EVIDENCE_SCHEMA_VERSION,
  readEvidenceDigest, taskStatusTokenForWorkflowState, validateLinearCollectState,
} from "./linear_collect_runner.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const POLLING_GAP = "polling_cannot_prove_hard_deletes";
// Gaps that do not bear on whether this issue's status is the current one.
// A run that could not reach the end of some issue's change log still observed
// every issue in its window, so task currency is unaffected; the gap stays on
// the returned observation so a caller reading history is not misled.
const NON_CURRENCY_GAPS = new Set([POLLING_GAP, "issue_history_continuation_pending"]);
// The task statuses every consumer of this reader already understands. A
// workspace may name its workflow states anything; only these four carry
// meaning downstream, and only "Todo"/"In Progress" are treated as live work.
const CANONICAL_TASK_STATUS = ["Todo", "In Progress", "Done", "Cancelled"];
const BUILTIN_TASK_STATUS_TOKEN = ["Todo", "InProgress", "In Progress", "Done", "Cancelled"];
const PIN_FIELDS = ["custody_root", "state_root", "lane_id", "identity_digest", "writer_authority_id",
  "writer_epoch", "binding_sha256", "workspace_url_key", "organization_id", "project_scope_ref", "project_code"];
const EVIDENCE_FIELDS = ["schema_version", "evidence_state", "provider", "task_id", "forge_task_ref",
  "task_status", "project_scope_ref", "read_receipt_ref", "source_receipt_refs", "read_receipt_digest"];
const exact = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const safe = (value, pattern) => typeof value === "string" && pattern.test(value);
const samePath = (a, b) => process.platform === "win32"
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const containsPath = (parent, child) => {
  const relative = path.relative(parent, child);
  return samePath(parent, child) || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const iso = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = code => { const error = new Error(code); error.readerCode = code; throw error; };
const hold = code => ({ status: "HOLD", hold_code: code, linear_task: null, coverage_gaps: [], execution_authority: false });

async function guardedFile(root, segments) {
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail("LINEAR_READ_PATH_INVALID");
  await assertNoReparseComponents(target, "$linear_metadata");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !samePath(await realpath(target), target)) {
    fail("LINEAR_READ_PATH_INVALID");
  }
  return { target, stat };
}

const unchanged = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size
  && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && b.isFile() && b.nlink === 1;

// Unlike the lane's readPrivateJson helper, this never creates a missing root.
async function readMetadata(root, segments, missingCode, maxBytes) {
  let handle;
  try {
    const { target, stat } = await guardedFile(root, segments);
    if (stat.size < 2 || stat.size > maxBytes) fail("LINEAR_METADATA_INVALID");
    handle = await open(target, "r");
    if (!unchanged(stat, await handle.stat())) fail("LINEAR_METADATA_CHANGED");
    const bytes = await handle.readFile();
    if (!unchanged(stat, await handle.stat()) || !unchanged(stat, await lstat(target))) fail("LINEAR_METADATA_CHANGED");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error.readerCode) throw error;
    fail(error.code === "ENOENT" ? missingCode : error.code === "reparse_path_forbidden"
      ? "LINEAR_READ_PATH_INVALID" : "LINEAR_METADATA_INVALID");
  } finally { await handle?.close(); }
}

function validatedPins(root, value, maxAgeMs) {
  if (!exact(value, PIN_FIELDS) || ![root, value.custody_root, value.state_root].every(v => typeof v === "string" && path.isAbsolute(v))
    || !samePath(root, value.custody_root) || containsPath(root, value.state_root) || containsPath(value.state_root, root)
    || ![value.lane_id, value.writer_authority_id, value.project_scope_ref].every(v => safe(v, ID))
    || ![value.identity_digest, value.binding_sha256].every(v => safe(v, SHA))
    || !safe(value.workspace_url_key, /^[a-z0-9][a-z0-9-]{0,63}$/u)
    || !safe(value.organization_id, UUID) || !safe(value.project_code, /^[A-Z0-9][A-Z0-9_-]{2,23}$/u)
    || !Number.isSafeInteger(value.writer_epoch) || value.writer_epoch < 1
    || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) fail("LINEAR_BINDING_INVALID");
  const binding = { lane_id: value.lane_id, writer: { authority_id: value.writer_authority_id, epoch: value.writer_epoch },
    workspace: { url_key: value.workspace_url_key } };
  if (identityDigestForBinding(binding) !== value.identity_digest) fail("LINEAR_BINDING_INVALID");
  return { pins: structuredClone(value), context: { binding, identity_digest: value.identity_digest } };
}

// An installer-pinned translation from this workspace's committed workflow
// state tokens to the four statuses every consumer understands. It may only
// add states the built-in vocabulary does not already cover, so a mapping can
// never restate "Done" as live work.
function validatedWorkflowStatusMap(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) fail("LINEAR_WORKFLOW_STATUS_MAP_INVALID");
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 32
    || !entries.every(([token, status]) => safe(token, ID) && !BUILTIN_TASK_STATUS_TOKEN.includes(token)
      && CANONICAL_TASK_STATUS.includes(status))) fail("LINEAR_WORKFLOW_STATUS_MAP_INVALID");
  return Object.freeze({ ...value });
}

// A mapped token carries meaning only while exactly one committed workflow
// state produces it. Two states behind one token cannot be told apart from the
// evidence, and one of them may be the state that authorizes execution.
async function committedWorkflowStatesFor(custodyRoot, state, token) {
  const keys = Object.keys(state.object_index).filter(key => key.startsWith("states:"));
  if (keys.length > 512) fail("LINEAR_WORKFLOW_STATE_LIMIT");
  let matches = 0;
  for (const key of keys) {
    const stateId = key.slice("states:".length);
    const entry = state.object_index[key];
    if (!safe(stateId, SEGMENT) || !safe(entry?.content_sha256, SHA)) fail("LINEAR_WORKFLOW_STATE_INVALID");
    const wrapper = await readMetadata(custodyRoot, ["states", stateId, `${entry.content_sha256.slice(7)}.json`],
      "LINEAR_WORKFLOW_STATE_MISSING", 32 * 1024);
    if (!exact(wrapper, ["schema_version", "kind", "object_id", "content_sha256", "object"])
      || wrapper.schema_version !== LINEAR_CUSTODY_OBJECT_SCHEMA_VERSION || wrapper.kind !== "states"
      || wrapper.object_id !== stateId || wrapper.content_sha256 !== entry.content_sha256
      || sha256Canonical(wrapper.object) !== entry.content_sha256) fail("LINEAR_WORKFLOW_STATE_DIGEST_MISMATCH");
    if (taskStatusTokenForWorkflowState(wrapper.object?.name, wrapper.object?.id) === token && ++matches > 1) break;
  }
  return matches;
}

function assertFresh(state, receipt, now, maxAgeMs) {
  const current = now();
  const nowMs = current instanceof Date ? current.getTime() : typeof current === "number" ? current : Date.parse(current);
  if (!Number.isFinite(nowMs)) fail("LINEAR_CLOCK_INVALID");
  if (Date.parse(state.last_completed_at) > nowMs || Date.parse(receipt.window.upper) > Date.parse(receipt.started_at)
    || Date.parse(state.cursor.watermark) > Date.parse(receipt.started_at)) fail("LINEAR_CLOCK_INVALID");
  if (nowMs - Date.parse(state.last_completed_at) > maxAgeMs || !iso(state.cursor.watermark)
    || nowMs - Date.parse(state.cursor.watermark) > maxAgeMs) fail("LINEAR_EVIDENCE_STALE");
}

/** root is the exact custody workspace directory. expectedBinding is a trusted
 * server descriptor with PIN_FIELDS, including the accepted project scope/code.
 * resolve uses the issue custody ID; linear_task.task_ref uses its Linear identifier.
 */
export function createLinearReadEvidenceReader({ root, expectedBinding, workflowStatusMap = null,
  now = () => new Date(), maxAgeMs = 30 * 60 * 1000 } = {}) {
  let config;
  try {
    config = { ...validatedPins(root, expectedBinding, maxAgeMs), statusMap: validatedWorkflowStatusMap(workflowStatusMap) };
  } catch { /* Configuration remains held. */ }
  return Object.freeze({ async resolve({ issueId } = {}) {
    if (!config) return hold("LINEAR_BINDING_INVALID");
    if (!safe(issueId, SEGMENT)) return hold("LINEAR_ISSUE_ID_INVALID");
    const { pins, context, statusMap } = config;
    try {
      const state = await readMetadata(pins.state_root, ["state", "linear-collect.json"], "LINEAR_STATE_MISSING", 8 * 1024 * 1024);
      try { validateLinearCollectState(state, context); } catch { fail("LINEAR_STATE_INVALID"); }
      if (!safe(state.last_run_id, SEGMENT) || !iso(state.last_completed_at) || state.cursor.generation_seq < 1) fail("LINEAR_STATE_UNCOMMITTED");
      const receipt = await readMetadata(pins.state_root, ["receipts", `${state.last_run_id}.json`], "LINEAR_RUN_RECEIPT_MISSING", 128 * 1024);
      try { validateLinearCollectRunReceipt(receipt); } catch { fail("LINEAR_RUN_RECEIPT_INVALID"); }
      if (receipt.status !== "ok" || receipt.run_id !== state.last_run_id || receipt.lane_id !== pins.lane_id
        || receipt.writer_authority_id !== pins.writer_authority_id || receipt.writer_epoch !== pins.writer_epoch
        || receipt.binding_sha256 !== pins.binding_sha256 || receipt.workspace_url_key !== pins.workspace_url_key
        || receipt.organization_id !== pins.organization_id) fail("LINEAR_RUN_RECEIPT_BINDING_MISMATCH");
      if (receipt.generation_seq !== state.cursor.generation_seq || receipt.cursor_after.generation_seq !== receipt.generation_seq
        || receipt.cursor_before.generation_seq + 1 !== receipt.generation_seq
        || sha256Canonical(receipt.cursor_after) !== sha256Canonical(state.cursor)
        || receipt.completed_at !== state.last_completed_at) fail("LINEAR_GENERATION_MISMATCH");
      assertFresh(state, receipt, now, maxAgeMs);
      if (state.cursor.backfill !== null || receipt.coverage_gaps.some(gap => !NON_CURRENCY_GAPS.has(gap))) fail("LINEAR_COVERAGE_INCOMPLETE");
      const entry = state.object_index[`read_evidence:${issueId}`];
      const issueEntry = state.object_index[`issues:${issueId}`];
      if (!entry || !issueEntry) fail("LINEAR_ISSUE_NOT_COMMITTED");
      const wrapper = await readMetadata(pins.custody_root, ["read_evidence", issueId, `${entry.content_sha256.slice(7)}.json`],
        "LINEAR_READ_EVIDENCE_MISSING", 32 * 1024);
      if (!exact(wrapper, ["schema_version", "kind", "object_id", "content_sha256", "object"])
        || wrapper.schema_version !== LINEAR_CUSTODY_OBJECT_SCHEMA_VERSION || wrapper.kind !== "read_evidence"
        || wrapper.object_id !== issueId || wrapper.content_sha256 !== entry.content_sha256
        || sha256Canonical(wrapper.object) !== entry.content_sha256) fail("LINEAR_READ_EVIDENCE_DIGEST_MISMATCH");
      const envelope = wrapper.object;
      if (!exact(envelope, ["schema_version", "issue_id", "issue_identifier", "issue_updated_at", "issue_content_sha256", "evidence"])
        || envelope.schema_version !== LINEAR_READ_EVIDENCE_ENVELOPE_SCHEMA_VERSION || envelope.issue_id !== issueId
        || !safe(envelope.issue_identifier, ID) || !iso(envelope.issue_updated_at)
        || envelope.issue_updated_at !== entry.updated_at || envelope.issue_updated_at !== issueEntry.updated_at
        || envelope.issue_content_sha256 !== issueEntry.content_sha256
        || Date.parse(envelope.issue_updated_at) > Date.parse(receipt.completed_at)) fail("LINEAR_ISSUE_SNAPSHOT_MISMATCH");
      const evidence = envelope.evidence;
      if (!exact(evidence, EVIDENCE_FIELDS) || evidence.schema_version !== LINEAR_READ_EVIDENCE_SCHEMA_VERSION
        || evidence.evidence_state !== "current" || evidence.provider !== "linear"
        || evidence.task_id !== envelope.issue_identifier || evidence.forge_task_ref !== `linear.task:${envelope.issue_identifier.toLowerCase()}`
        || !safe(evidence.task_status, ID) || !safe(evidence.read_receipt_ref, ID)
        || !safe(evidence.read_receipt_digest, SHA)) fail("LINEAR_READ_EVIDENCE_INVALID");
      const { read_receipt_digest: readDigest, ...body } = evidence;
      if (readEvidenceDigest(body) !== readDigest) fail("LINEAR_READ_RECEIPT_DIGEST_MISMATCH");
      const shortHex = envelope.issue_content_sha256.slice(7, 23);
      const expectedRef = `receipt:linear-read:${evidence.task_id.toLowerCase()}:${shortHex}`;
      if (evidence.read_receipt_ref !== expectedRef || !Array.isArray(evidence.source_receipt_refs)
        || sha256Canonical(evidence.source_receipt_refs) !== sha256Canonical([expectedRef, `receipt:linear-issue-snapshot:${shortHex}`].sort())) {
        fail("LINEAR_READ_RECEIPT_REF_MISMATCH");
      }
      if (evidence.project_scope_ref !== pins.project_scope_ref) fail("LINEAR_PROJECT_SCOPE_MISMATCH");
      let taskStatus = evidence.task_status === "InProgress" ? "In Progress" : evidence.task_status;
      if (!CANONICAL_TASK_STATUS.includes(taskStatus)) {
        const mapped = statusMap?.[evidence.task_status];
        if (mapped === undefined) fail("LINEAR_TASK_STATUS_UNSUPPORTED");
        const matches = await committedWorkflowStatesFor(pins.custody_root, state, evidence.task_status);
        if (matches === 0) fail("LINEAR_TASK_STATUS_UNRESOLVED");
        if (matches > 1) fail("LINEAR_TASK_STATUS_AMBIGUOUS");
        taskStatus = mapped;
      }
      // Recheck the immutable receipt and committed generation after evidence IO.
      const receiptDigest = sha256Canonical(receipt);
      const receiptRechecked = await readMetadata(pins.state_root, ["receipts", `${state.last_run_id}.json`],
        "LINEAR_RUN_RECEIPT_MISSING", 128 * 1024);
      if (receiptDigest !== sha256Canonical(receiptRechecked)) fail("LINEAR_METADATA_CHANGED");
      const rechecked = await readMetadata(pins.state_root, ["state", "linear-collect.json"], "LINEAR_STATE_MISSING", 8 * 1024 * 1024);
      if (sha256Canonical(state) !== sha256Canonical(rechecked)) fail("LINEAR_METADATA_CHANGED");
      assertFresh(state, receipt, now, maxAgeMs);
      return { status: "CURRENT", hold_code: null, issue_id: issueId,
        linear_task: { task_ref: { provider: "linear", task_id: evidence.task_id }, project_code: pins.project_code,
          state: "current", task_status: taskStatus, read_receipt_ref: evidence.read_receipt_ref },
        read_receipt_digest: readDigest, issue_content_sha256: envelope.issue_content_sha256,
        project_scope_ref: evidence.project_scope_ref, run_receipt_ref: laneRecordFromReceipt(receipt, receiptDigest).capture_ref,
        run_receipt_digest: receiptDigest, generation_seq: receipt.generation_seq,
        observed_at: receipt.completed_at, issue_updated_at: envelope.issue_updated_at,
        coverage_gaps: [...new Set([...receipt.coverage_gaps, POLLING_GAP])].sort(), execution_authority: false };
    } catch (error) { return hold(error.readerCode ?? "LINEAR_METADATA_INVALID"); }
  } });
}
