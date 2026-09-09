import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import { evaluateWorkBinding } from "../shared/work_binding.mjs";
import { makeWorkBindingFixture } from "../../docs/architecture/workspace/examples/work_binding/synthetic.mjs";
import { LINEAR_READ_OPERATIONS } from "./linear_graphql_client.mjs";
import { runReceiptObjectKinds, validateLinearCollectRunReceipt } from "./linear_collect_receipt.mjs";
import { identityDigestForBinding, readEvidenceDigest, readEvidenceRecordForIssue } from "./linear_collect_runner.mjs";
import { createLinearReadEvidenceReader } from "./linear_read_evidence_reader.mjs";

const ISSUE = "f8091a2b-3c4d-4859-aa6b-465768798a9b";
const COMPLETED = "2026-09-07T00:00:00.000Z";
const NOW = "2026-09-07T00:05:00.000Z";
const DIGEST = `sha256:${"a".repeat(64)}`;
const fixtureRoots = new Set();
after(async () => {
  for (const root of fixtureRoots) {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^linear-evidence-reader-[A-Za-z0-9]+$/u);
    await rm(root, { recursive: true, force: true });
  }
});
async function save(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), "utf8");
}

async function fixture({ stateName = "In Progress", identifier = "SYN-1",
  receiptSchemaVersion = "soulforge.linear_collect.run_receipt.v1",
  coverageGaps = ["polling_cannot_prove_hard_deletes"] } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "linear-evidence-reader-"));
  fixtureRoots.add(path.resolve(temporary));
  const root = path.join(temporary, "custody", "synthetic-forge");
  const stateRoot = path.join(temporary, "state");
  const binding = { lane_id: "synthetic-linear", writer: { authority_id: "synthetic-writer", epoch: 1 },
    workspace: { url_key: "synthetic-forge", project_scope_map: [{ linear_project_id: "project-1", project_scope_ref: "project:SYN" }] } };
  const expectedBinding = { custody_root: root, state_root: stateRoot, lane_id: binding.lane_id,
    identity_digest: identityDigestForBinding(binding), writer_authority_id: binding.writer.authority_id,
    writer_epoch: 1, binding_sha256: DIGEST, workspace_url_key: "synthetic-forge",
    organization_id: "a8091a2b-3c4d-4859-aa6b-465768798a9b", project_scope_ref: "project:SYN", project_code: "SYN" };
  const issue = { id: ISSUE, identifier, updated_at: "2026-08-01T00:00:00.000Z", state_name: stateName, project_id: "project-1" };
  const envelope = readEvidenceRecordForIssue(binding, issue).envelope;
  const evidenceDigest = sha256Canonical(envelope);
  const wrapper = { schema_version: "soulforge.linear_collect.custody_object.v1", kind: "read_evidence",
    object_id: ISSUE, content_sha256: evidenceDigest, object: envelope };
  const cursor = { schema_version: "soulforge.linear_collect.cursor.v1", watermark: COMPLETED, backfill: null, generation_seq: 2 };
  const state = { schema_version: "soulforge.linear_collect.state.v1", lane_id: expectedBinding.lane_id,
    identity_digest: expectedBinding.identity_digest, writer_authority_id: expectedBinding.writer_authority_id,
    writer_epoch: 1, cursor, object_index: {
      [`issues:${ISSUE}`]: { content_sha256: envelope.issue_content_sha256, updated_at: issue.updated_at },
      [`read_evidence:${ISSUE}`]: { content_sha256: evidenceDigest, updated_at: issue.updated_at },
    }, last_run_id: "run-synthetic", last_completed_at: COMPLETED };
  // A receipt declares its own shape. The default is the version already on
  // disk in front of the running lane, so the suite proves the reader still
  // accepts receipts written before the change log was collected.
  const receiptKinds = runReceiptObjectKinds(receiptSchemaVersion);
  const receipt = { schema_version: receiptSchemaVersion, lane_id: expectedBinding.lane_id,
    run_id: state.last_run_id, generation_seq: 2, mode: "apply", status: "ok", writer_authority_id: expectedBinding.writer_authority_id,
    writer_epoch: 1, binding_sha256: DIGEST, workspace_url_key: expectedBinding.workspace_url_key,
    organization_id: expectedBinding.organization_id, started_at: COMPLETED, completed_at: COMPLETED, duration_ms: 0,
    window: { lower: "2026-09-06T23:45:00.000Z", upper: COMPLETED, phase: "delta", order_observed: "ascending" },
    cursor_before: { ...cursor, generation_seq: 1 }, cursor_after: cursor,
    read_calls: { total: 0, by_operation: Object.fromEntries(LINEAR_READ_OPERATIONS.map(key => [key, 0])) },
    objects: Object.fromEntries(receiptKinds.map(key => [key, { observed: 0, created: 0, unchanged: 0 }])),
    custody_manifest_digest: DIGEST, coverage_gaps: [...coverageGaps].sort(), error_codes: [],
    repository_writes: 0, private_writes: 3, network_used: false };
  validateLinearCollectRunReceipt(receipt);
  const stateFile = path.join(stateRoot, "state", "linear-collect.json");
  const receiptFile = path.join(stateRoot, "receipts", `${state.last_run_id}.json`);
  const evidenceFile = path.join(root, "read_evidence", ISSUE, `${evidenceDigest.slice(7)}.json`);
  await save(stateFile, state);
  await save(receiptFile, receipt);
  await save(evidenceFile, wrapper);
  // Deliberately invalid issue payload: a metadata reader must never parse this file.
  const issueFile = path.join(root, "issues", ISSUE, `${envelope.issue_content_sha256.slice(7)}.json`);
  await mkdir(path.dirname(issueFile), { recursive: true });
  await writeFile(issueFile, "not JSON; issue body must not be read");
  return { root, temporary, state, receipt, wrapper, expectedBinding, stateFile, receiptFile, evidenceFile,
    options: { root, expectedBinding, now: () => new Date(NOW) } };
}

test("a run that collected the change log reads exactly like one that did not", async () => {
  const before = await fixture();
  const after = await fixture({ receiptSchemaVersion: "soulforge.linear_collect.run_receipt.v2" });
  const read = (f) => createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  const [older, newer] = [await read(before), await read(after)];
  assert.equal(older.status, "CURRENT");
  assert.equal(newer.status, "CURRENT");
  assert.deepEqual(newer.linear_task, older.linear_task);
  assert.deepEqual(newer.coverage_gaps, older.coverage_gaps);
});

test("an unread tail of some issue's change log does not make a task's status uncertain", async () => {
  // A run that could not reach the end of one issue's change log still observed
  // every issue in its window. Task currency is a different question from
  // history depth, and conflating them would close the whole board.
  const f = await fixture({
    receiptSchemaVersion: "soulforge.linear_collect.run_receipt.v2",
    coverageGaps: ["issue_history_continuation_pending", "polling_cannot_prove_hard_deletes"],
  });
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.status, "CURRENT");
  assert.equal(result.linear_task.task_status, "In Progress");
  // The gap still travels with the observation; it is reported, not swallowed.
  assert.deepEqual(result.coverage_gaps,
    ["issue_history_continuation_pending", "polling_cannot_prove_hard_deletes"]);
});

test("a gap that does bear on currency still closes the reader", async () => {
  for (const gap of ["catalog_continuation_pending", "run_deadline_reached", "max_pages_continuation_pending"]) {
    const f = await fixture({
      receiptSchemaVersion: "soulforge.linear_collect.run_receipt.v2",
      coverageGaps: [gap, "polling_cannot_prove_hard_deletes"],
    });
    const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
    assert.equal(result.status, "HOLD", gap);
    assert.equal(result.hold_code, "LINEAR_COVERAGE_INCOMPLETE", gap);
  }
});

test("committed metadata yields the Board projection, with hard-delete uncertainty and no execution authority", async () => {
  const f = await fixture();
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.status, "CURRENT");
  assert.deepEqual(result.linear_task, { task_ref: { provider: "linear", task_id: "SYN-1" }, project_code: "SYN",
    state: "current", task_status: "In Progress", read_receipt_ref: f.wrapper.object.evidence.read_receipt_ref });
  assert.equal(result.issue_id, ISSUE);
  assert.equal(result.execution_authority, false);
  assert.deepEqual(result.coverage_gaps, ["polling_cannot_prove_hard_deletes"]);
  assert.equal(result.generation_seq, 2);
  assert.equal(result.read_receipt_digest, f.wrapper.object.evidence.read_receipt_digest);
  assert.equal(result.run_receipt_ref, `receipt.linear.run.${sha256Canonical(f.receipt).slice(7)}`);
  assert.equal(JSON.stringify(result).includes(f.temporary), false);
  assert.equal(JSON.stringify(result).includes("issue body"), false);
});

test("a future cursor watermark cannot declare an issue current", async () => {
  const f = await fixture();
  f.state.cursor.watermark = "2026-09-07T01:00:00.000Z";
  f.receipt.cursor_after = f.state.cursor;
  await save(f.stateFile, f.state);
  await save(f.receiptFile, f.receipt);
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.status, "HOLD");
  assert.equal(result.hold_code, "LINEAR_CLOCK_INVALID");
});

async function publishEnvelope(f) {
  const digest = sha256Canonical(f.wrapper.object);
  f.wrapper.content_sha256 = digest;
  f.state.object_index[`read_evidence:${ISSUE}`].content_sha256 = digest;
  f.evidenceFile = path.join(f.root, "read_evidence", ISSUE, `${digest.slice(7)}.json`);
  await save(f.evidenceFile, f.wrapper);
  await save(f.stateFile, f.state);
}

for (const [name, mutate, code] of [
  ["foreign lane identity", f => { f.state.identity_digest = DIGEST; }, "LINEAR_STATE_INVALID"],
  ["foreign writer epoch", f => { f.state.writer_epoch += 1; }, "LINEAR_STATE_INVALID"],
  ["uncommitted initial state", f => { f.state.last_run_id = null; }, "LINEAR_STATE_UNCOMMITTED"],
  ["absent committed issue", f => { delete f.state.object_index[`issues:${ISSUE}`]; }, "LINEAR_ISSUE_NOT_COMMITTED"],
  ["absent committed envelope", f => { delete f.state.object_index[`read_evidence:${ISSUE}`]; }, "LINEAR_ISSUE_NOT_COMMITTED"],
  ["issue hash mismatch", f => { f.state.object_index[`issues:${ISSUE}`].content_sha256 = DIGEST; }, "LINEAR_ISSUE_SNAPSHOT_MISMATCH"],
  ["issue update mismatch", f => { f.state.object_index[`issues:${ISSUE}`].updated_at = COMPLETED; }, "LINEAR_ISSUE_SNAPSHOT_MISMATCH"],
  ["foreign binding receipt", f => { f.receipt.binding_sha256 = `sha256:${"b".repeat(64)}`; }, "LINEAR_RUN_RECEIPT_BINDING_MISMATCH"],
  ["foreign organization receipt", f => { f.receipt.organization_id = ISSUE; }, "LINEAR_RUN_RECEIPT_BINDING_MISMATCH"],
  ["foreign workspace receipt", f => { f.receipt.workspace_url_key = "other-workspace"; }, "LINEAR_RUN_RECEIPT_BINDING_MISMATCH"],
  ["failed latest run", f => { f.receipt.status = "error"; }, "LINEAR_RUN_RECEIPT_BINDING_MISMATCH"],
  ["foreign generation receipt", f => { f.receipt.generation_seq += 1; }, "LINEAR_GENERATION_MISMATCH"],
  ["nonconsecutive generation receipt", f => { f.receipt.cursor_before.generation_seq = 0; }, "LINEAR_GENERATION_MISMATCH"],
  ["mismatched completion", f => { f.state.last_completed_at = NOW; }, "LINEAR_GENERATION_MISMATCH"],
  ["changed wrapper digest", f => { f.wrapper.content_sha256 = DIGEST; }, "LINEAR_READ_EVIDENCE_DIGEST_MISMATCH"],
  ["changed wrapper kind", f => { f.wrapper.kind = "issues"; }, "LINEAR_READ_EVIDENCE_DIGEST_MISMATCH"],
]) {
  test(`${name} holds with a bounded diagnostic`, async () => {
    const f = await fixture();
    mutate(f);
    await save(f.stateFile, f.state);
    await save(f.receiptFile, f.receipt);
    await save(f.evidenceFile, f.wrapper);
    const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
    assert.equal(result.status, "HOLD");
    assert.equal(result.hold_code, code);
    assert.equal(result.linear_task, null);
    assert.equal(result.execution_authority, false);
    assert.equal(JSON.stringify(result).includes(f.temporary), false);
  });
}

test("a republished envelope with a stale read receipt digest is held", async () => {
  const f = await fixture();
  f.wrapper.object.evidence.task_status = "Todo";
  await publishEnvelope(f);
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_READ_RECEIPT_DIGEST_MISMATCH");
});

test("a correctly hashed envelope still requires exact issue identity and project membership", async () => {
  for (const [mutate, code] of [
    [e => { e.issue_id = "different-issue"; }, "LINEAR_ISSUE_SNAPSHOT_MISMATCH"],
    [e => { e.evidence.project_scope_ref = "project:OTHER"; }, "LINEAR_PROJECT_SCOPE_MISMATCH"],
    [e => { e.evidence.source_receipt_refs = ["receipt:unrelated"]; }, "LINEAR_READ_RECEIPT_REF_MISMATCH"],
    [e => { e.evidence.task_id = "SYN-2"; }, "LINEAR_READ_EVIDENCE_INVALID"],
    [e => { e.title = "body content must not escape"; }, "LINEAR_ISSUE_SNAPSHOT_MISMATCH"],
  ]) {
    const f = await fixture();
    mutate(f.wrapper.object);
    const { read_receipt_digest, ...body } = f.wrapper.object.evidence;
    f.wrapper.object.evidence.read_receipt_digest = readEvidenceDigest(body);
    await publishEnvelope(f);
    const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
    assert.equal(result.hold_code, code);
    assert.equal(JSON.stringify(result).includes("body content"), false);
  }
});

test("the committed index wins over an uncommitted newer envelope", async () => {
  const f = await fixture();
  const oldState = structuredClone(f.state);
  f.wrapper.object.evidence.task_status = "Done";
  const { read_receipt_digest, ...body } = f.wrapper.object.evidence;
  f.wrapper.object.evidence.read_receipt_digest = readEvidenceDigest(body);
  await publishEnvelope(f);
  await save(f.stateFile, oldState);
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.status, "CURRENT");
  assert.equal(result.linear_task.task_status, "In Progress");
});

test("elapsed collection freshness and incomplete coverage hold even if envelope says current", async () => {
  const f = await fixture();
  assert.equal((await createLinearReadEvidenceReader({ ...f.options, maxAgeMs: 60_000 }).resolve({ issueId: ISSUE })).hold_code,
    "LINEAR_EVIDENCE_STALE");
  for (const gap of ["max_pages_continuation_pending", "backfill_stalled_window_advanced", "catalog_continuation_pending", "run_deadline_reached"]) {
    f.receipt.coverage_gaps = [gap, "polling_cannot_prove_hard_deletes"].sort();
    await save(f.receiptFile, f.receipt);
    assert.equal((await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE })).hold_code, "LINEAR_COVERAGE_INCOMPLETE");
  }
});

test("only the InProgress display spelling is translated; unknown states stay held", async () => {
  for (const stateName of ["Todo", "Done", "Cancelled", "Backlog", "In Review", "Canceled"]) {
    const f = await fixture({ stateName });
    const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
    if (["Todo", "Done", "Cancelled"].includes(stateName)) assert.equal(result.linear_task.task_status, stateName);
    else assert.equal(result.hold_code, "LINEAR_TASK_STATUS_UNSUPPORTED");
  }
});

test("root and identity pins are immutable and cannot redirect a configured reader", async () => {
  const f = await fixture();
  const reader = createLinearReadEvidenceReader(f.options);
  f.expectedBinding.project_code = "FOREIGN";
  f.expectedBinding.state_root = path.join(f.temporary, "missing");
  assert.equal((await reader.resolve({ issueId: ISSUE })).linear_task.project_code, "SYN");
  assert.equal((await createLinearReadEvidenceReader({ ...f.options, root: f.temporary }).resolve({ issueId: ISSUE })).hold_code,
    "LINEAR_BINDING_INVALID");
  for (const issueId of ["../other", "a/b", "a\\b", "a:stream", "", null]) {
    assert.equal((await reader.resolve({ issueId })).hold_code, "LINEAR_ISSUE_ID_INVALID");
  }
});

test("missing and corrupt metadata never create roots or expose parse errors", async () => {
  const f = await fixture();
  const missing = path.join(f.temporary, "missing-state");
  const reader = createLinearReadEvidenceReader({ ...f.options, expectedBinding: { ...f.expectedBinding, state_root: missing } });
  assert.equal((await reader.resolve({ issueId: ISSUE })).hold_code, "LINEAR_STATE_MISSING");
  assert.equal((await readdir(f.temporary)).includes("missing-state"), false);
  await writeFile(f.stateFile, "invalid metadata with body text");
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_METADATA_INVALID");
  assert.equal(JSON.stringify(result).includes("body text"), false);
});

test("a linked custody root is rejected without following its evidence", async () => {
  const f = await fixture();
  const alias = path.join(f.temporary, "custody-alias");
  await symlink(f.root, alias, process.platform === "win32" ? "junction" : "dir");
  const result = await createLinearReadEvidenceReader({ ...f.options, root: alias,
    expectedBinding: { ...f.expectedBinding, custody_root: alias } }).resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_READ_PATH_INVALID");
});

test("reading current evidence leaves every metadata byte unchanged", async () => {
  const f = await fixture();
  const paths = [f.stateFile, f.receiptFile, f.evidenceFile];
  const before = await Promise.all(paths.map(file => readFile(file, "utf8")));
  await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.deepEqual(await Promise.all(paths.map(file => readFile(file, "utf8"))), before);
});

test("overlapping state and custody roots cannot become an accepted binding", async () => {
  const f = await fixture();
  for (const state_root of [f.root, path.join(f.root, "state"), path.dirname(f.root)]) {
    const reader = createLinearReadEvidenceReader({ ...f.options, expectedBinding: { ...f.expectedBinding, state_root } });
    assert.equal((await reader.resolve({ issueId: ISSUE })).hold_code, "LINEAR_BINDING_INVALID");
  }
});

test("current projection is accepted at the actual Board work-binding seam", async () => {
  const f = await fixture();
  const { request, evidence } = makeWorkBindingFixture();
  const result = await createLinearReadEvidenceReader({ ...f.options,
    expectedBinding: { ...f.expectedBinding, project_code: request.project_code } }).resolve({ issueId: ISSUE });
  request.policy_refs.task_ref = { provider: "linear", task_id: "SYN-1" };
  evidence.mappings[0].task_ref = request.policy_refs.task_ref;
  evidence.linear_applicability = "real_work";
  evidence.linear_task = result.linear_task;
  assert.equal(evaluateWorkBinding(request, evidence).status, "MAPPED");
});

test("an overlong receipt ref never becomes a malformed Board projection", async () => {
  const f = await fixture({ identifier: `SYN-${"1".repeat(155)}` });
  const result = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(result.status, "HOLD");
  assert.equal(result.hold_code, "LINEAR_READ_EVIDENCE_INVALID");
});

test("freshness is checked again after metadata reads complete", async () => {
  const f = await fixture();
  let clockCalls = 0;
  const now = () => new Date(clockCalls++ === 0 ? NOW : "2026-09-07T01:05:00.000Z");
  const result = await createLinearReadEvidenceReader({ ...f.options, now }).resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_EVIDENCE_STALE");
  assert.equal(result.linear_task, null);
});

test("a run receipt changed after its first read cannot supply current evidence", async () => {
  const f = await fixture();
  let mutated = false;
  const now = () => {
    if (!mutated) {
      mutated = true;
      writeFileSync(f.receiptFile, JSON.stringify({ ...f.receipt, status: "error" }));
    }
    return new Date(NOW);
  };
  const result = await createLinearReadEvidenceReader({ ...f.options, now }).resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_METADATA_CHANGED");
  assert.equal(result.linear_task, null);
});

test("committed state changed during evidence IO is rejected by the final state recheck", async () => {
  const f = await fixture();
  let mutated = false;
  const now = () => {
    if (!mutated) {
      mutated = true;
      writeFileSync(f.stateFile, JSON.stringify({ ...f.state, last_run_id: "run-new-generation" }));
    }
    return new Date(NOW);
  };
  const result = await createLinearReadEvidenceReader({ ...f.options, now }).resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_METADATA_CHANGED");
  assert.equal(result.linear_task, null);
});

// ---------------------------------------------------------------------------
// Workspace workflow states outside the built-in four.
// ---------------------------------------------------------------------------

async function commitWorkflowStates(f, states) {
  for (const value of states) {
    const digest = sha256Canonical(value);
    await save(path.join(f.root, "states", value.id, `${digest.slice(7)}.json`),
      { schema_version: "soulforge.linear_collect.custody_object.v1", kind: "states",
        object_id: value.id, content_sha256: digest, object: value });
    f.state.object_index[`states:${value.id}`] = { content_sha256: digest, updated_at: value.updated_at };
  }
  await save(f.stateFile, f.state);
}
const workflowState = (id, name) => ({ id, name, type: "started", updated_at: "2026-08-01T00:00:00.000Z" });
const STATE_A = "17a61409-4594-4ad0-944d-31e11f241bc4";
const STATE_B = "27a61409-4594-4ad0-944d-31e11f241bc4";

test("a workspace state outside the built-in four stays unsupported until it is explicitly mapped", async () => {
  const f = await fixture({ stateName: "Waiting" });
  await commitWorkflowStates(f, [workflowState(STATE_A, "Waiting")]);
  const unmapped = await createLinearReadEvidenceReader(f.options).resolve({ issueId: ISSUE });
  assert.equal(unmapped.hold_code, "LINEAR_TASK_STATUS_UNSUPPORTED");
  assert.equal(unmapped.linear_task, null);
  const mapped = await createLinearReadEvidenceReader({ ...f.options, workflowStatusMap: { Waiting: "In Progress" } })
    .resolve({ issueId: ISSUE });
  assert.equal(mapped.status, "CURRENT");
  assert.equal(mapped.linear_task.task_status, "In Progress");
  assert.equal(mapped.execution_authority, false);
});

test("a mapped token backed by two committed workflow states cannot be read as either of them", async () => {
  const f = await fixture({ stateName: "Waiting" });
  await commitWorkflowStates(f, [workflowState(STATE_A, "Waiting"), workflowState(STATE_B, " Waiting")]);
  const result = await createLinearReadEvidenceReader({ ...f.options, workflowStatusMap: { Waiting: "Todo" } })
    .resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_TASK_STATUS_AMBIGUOUS");
  assert.equal(result.linear_task, null);
});

test("a mapped token no committed workflow state produces is never resolved from the mapping alone", async () => {
  const f = await fixture({ stateName: "Waiting" });
  await commitWorkflowStates(f, [workflowState(STATE_A, "AI 실행대기")]);
  const result = await createLinearReadEvidenceReader({ ...f.options, workflowStatusMap: { Waiting: "Todo" } })
    .resolve({ issueId: ISSUE });
  assert.equal(result.hold_code, "LINEAR_TASK_STATUS_UNRESOLVED");
  assert.equal(result.linear_task, null);
});

test("a mapping can neither restate a built-in status nor invent one outside the four", async () => {
  const f = await fixture({ stateName: "Waiting" });
  await commitWorkflowStates(f, [workflowState(STATE_A, "Waiting")]);
  for (const map of [{ Done: "Todo" }, { InProgress: "Todo" }, { "In Progress": "Done" },
    { Waiting: "Waiting" }, { Waiting: "InProgress" }, { "": "Todo" }, {}, [], "Waiting"]) {
    const result = await createLinearReadEvidenceReader({ ...f.options, workflowStatusMap: map }).resolve({ issueId: ISSUE });
    assert.equal(result.hold_code, "LINEAR_BINDING_INVALID", JSON.stringify(map));
  }
});
