import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkIntakeDocuments, isValidatedWorkIntakeDocuments } from "../src/work_intake_documents.mjs";

function packet(action = "hourly_intake") {
  const definitions = [
    ["authority_policy", ["hourly_intake", "source_index", "backlog"], "authority-v2", ["read-boundary"]],
    ["intake_policy", ["hourly_intake"], "intake-v5", ["recent-window", "effect-zero"]],
    ["source_policy", ["source_index"], "source-v3", ["late-arrival", "revision-lineage"]],
    ["queue_policy", ["backlog"], "queue-v8", ["queue-boundary", "claim-reconcile"]],
    ["executor_policy", ["backlog"], "executor-v4", ["result-verification"]],
    ["source_index", ["source_index", "hourly_intake"], "index-v1", ["source-ref", "revision"]],
  ];
  const manifest = definitions.map(([role, actions, revision, sections]) => ({
    document_ref: `synthetic:${role}`, document_role: role, required_for: role === "source_index" ? ["source_index"] : actions,
    applicable_actions: actions, revision_policy: { mode: "exact", revisions: [revision] }, required_sections: sections,
    authority_ref: role.endsWith("_policy") ? "synthetic:owner-read-only" : null,
  }));
  return { action, manifest, documents: manifest.map((spec) => ({ document_ref: spec.document_ref, revision: spec.revision_policy.revisions[0], sections: [...spec.required_sections], authority_ref: spec.authority_ref, read_status: "read" })) };
}

test("six heterogeneous document roles pass without identical Queue markers or versions", () => {
  for (const action of ["hourly_intake", "source_index", "backlog"]) {
    const value = validateWorkIntakeDocuments(packet(action));
    assert.equal(value.status, "VALIDATED");
    assert.equal(value.action, action);
    assert.equal(isValidatedWorkIntakeDocuments(value), true);
    assert.equal(Object.isFrozen(value.checked_documents), true);
  }
});

test("wrong exact ID, policy revision, authority, or required section fails closed", () => {
  for (const [field, replacement, code] of [
    ["document_ref", "synthetic:wrong-id", "UNDECLARED_DOCUMENT_REF"],
    ["revision", "intake-v4", "DOCUMENT_REVISION_MISMATCH"],
    ["authority_ref", "synthetic:different-authority", "DOCUMENT_AUTHORITY_MISMATCH"],
    ["sections", ["queue-boundary"], "DOCUMENT_SECTION_MISSING"],
  ]) {
    const input = packet(); input.documents[1][field] = replacement;
    const value = validateWorkIntakeDocuments(input);
    assert.equal(value.status, "HOLD"); assert.ok(value.hold_codes.includes(code), code);
  }
});

test("unrelated Queue read failure does not block hourly intake, required partial policy does", () => {
  const input = packet(); input.documents[3].read_status = "unavailable";
  assert.equal(validateWorkIntakeDocuments(input).status, "VALIDATED");
  input.documents[1].read_status = "partial";
  assert.ok(validateWorkIntakeDocuments(input).hold_codes.includes("DOCUMENT_PARTIAL"));
});

test("optional index failure is a warning for intake and a hold for source indexing", () => {
  const input = packet(); input.documents.pop();
  const intake = validateWorkIntakeDocuments(input);
  assert.equal(intake.status, "VALIDATED"); assert.equal(intake.warnings.length, 1);
  input.action = "source_index";
  assert.ok(validateWorkIntakeDocuments(input).hold_codes.includes("DOCUMENT_NOT_READ"));
});

test("empty or weakened caller manifest cannot remove mandatory authority and action policy", () => {
  for (const mutate of [
    (input) => { input.manifest = []; input.documents = []; },
    (input) => { input.manifest[1].required_for = []; },
    (input) => { input.manifest[1].revision_policy = { mode: "allowed", revisions: ["intake-v5", "intake-v4"] }; },
    (input) => { input.manifest[0].authority_ref = null; input.documents[0].authority_ref = null; },
    (input) => { input.manifest[1].required_sections = []; },
  ]) {
    const input = packet(); mutate(input);
    assert.equal(validateWorkIntakeDocuments(input).status, "HOLD");
  }
});

test("duplicate refs and raw payload fields are rejected; validation branding cannot be copied", () => {
  const input = packet(); input.documents.push(input.documents[0]);
  assert.ok(validateWorkIntakeDocuments(input).hold_codes.includes("DUPLICATE_DOCUMENT_READ"));
  const raw = packet(); raw.documents[0].body = "unneeded content";
  assert.ok(validateWorkIntakeDocuments(raw).hold_codes.includes("INVALID_DOCUMENT_READ"));
  const valid = validateWorkIntakeDocuments(packet());
  assert.equal(isValidatedWorkIntakeDocuments(structuredClone(valid)), false);
});

test("manifest digest is order independent and detached from caller mutations", () => {
  const first = packet(), second = packet(); second.manifest.reverse(); second.documents.reverse();
  const valid = validateWorkIntakeDocuments(first);
  assert.equal(valid.manifest_sha256, validateWorkIntakeDocuments(second).manifest_sha256);
  first.manifest[1].revision_policy.revisions[0] = "changed";
  assert.equal(valid.checked_documents.find((row) => row.document_role === "intake_policy").revision, "intake-v5");
});
