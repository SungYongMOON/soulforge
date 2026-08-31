import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPLOYMENT_PACK_SCHEMA,
  PACK_CATALOG,
  RELEASE_GATES,
  ROLLOUT_RINGS,
  RUNBOOK_CATALOG,
  validatePackReleaseManifest,
  validateRingPromotion,
  validateRunbook,
} from "../src/deployment_pack_contract.mjs";

const REFS = {
  release_notes_ref: "release_notes.hpp_server_pack.v0_1_0",
  install_manual_ref: "manual.install.hpp_server_pack",
  upgrade_manual_ref: "manual.upgrade.hpp_server_pack",
  rollback_manual_ref: "manual.rollback.hpp_server_pack",
  support_owner_ref: "owner.platform_support",
};

function evidenceThrough(gate) {
  const evidence = {};
  for (const entry of RELEASE_GATES) {
    evidence[entry] = `evidence.${entry}.receipt_ref`;
    if (entry === gate) break;
  }
  return evidence;
}

function manifest(overrides = {}) {
  return {
    pack_id: "hpp_server_pack",
    version: "0.1.0",
    status: "draft",
    contents: ["server_modules", "manifests", "operator_docs"],
    config_refs: [],
    secret_refs: ["secret_ref.hpp.tls_cert"],
    ...REFS,
    ...overrides,
  };
}

test("catalog pins the five packs with boundaries, and schema/enums match the plan", () => {
  assert.equal(DEPLOYMENT_PACK_SCHEMA, "soulforge.deployment_pack_contract.v0");
  assert.deepEqual(PACK_CATALOG.map((entry) => entry.pack_id), [
    "hpp_server_pack", "team_client_pack", "tool_workshop_pack",
    "project_ai_team_pack", "backup_recovery_extension",
  ]);
  assert.equal(RELEASE_GATES.length, 15);
  assert.deepEqual(RELEASE_GATES.slice(0, 3), ["build", "unit", "contract"]);
  assert.deepEqual(RELEASE_GATES.slice(-2), ["canary", "acceptance"]);
  assert.equal(ROLLOUT_RINGS.length, 8);
  assert.deepEqual(RUNBOOK_CATALOG, [
    "hpp_server_operator",
    "team_client_install_use_revoke_recovery",
    "mcp_material_receive_result_submit",
    "vault_artifact_revision_promotion",
    "forge_work_generation_review",
    "agent_mark_deployment_run",
    "buzz_hermes_operations_recovery",
    "watch_4192_incident_response",
    "external_connector_backup_restore",
    "workshop_operator",
    "path_registry_resolver",
    "target_folder_materializer",
    "watch_4192_storage_backup_map",
    "new_hire_training",
    "experienced_hire_training",
    "manager_training",
  ]);
  for (const pack of PACK_CATALOG) {
    assert.equal(pack.must_not_contain.length >= 2, true, pack.pack_id);
    assert.equal(typeof pack.initial_release_gate === "string" && pack.initial_release_gate.length > 10, true, pack.pack_id);
  }
  // Every pack that ships code must be able to carry its own validators —
  // and the npm modules those validators resolve (the sbom-gate precursor).
  const hpp = PACK_CATALOG.find((entry) => entry.pack_id === "hpp_server_pack");
  assert.equal(hpp.contains.includes("validators"), true);
  assert.equal(hpp.contains.includes("vendored_dependencies"), true);
  const teamClient = PACK_CATALOG.find((entry) => entry.pack_id === "team_client_pack");
  for (const role of ["shared_modules", "manifests", "validators"]) {
    assert.equal(teamClient.contains.includes(role), true, `team_client contains ${role}`);
  }
  const backupRecovery = PACK_CATALOG.find((entry) => entry.pack_id === "backup_recovery_extension");
  for (const role of ["shared_modules", "manifests", "validators"]) {
    assert.equal(backupRecovery.contains.includes(role), true, `backup_recovery contains ${role}`);
  }
});

test("a draft manifest with complete references validates; missing manuals fail closed", () => {
  assert.deepEqual(validatePackReleaseManifest(manifest()), { ok: true, problems: [] });
  const missing = validatePackReleaseManifest(manifest({ rollback_manual_ref: "" }));
  assert.equal(missing.ok, false);
  assert.equal(missing.problems.includes("rollback_manual_ref_missing"), true);
  assert.equal(validatePackReleaseManifest(manifest({ version: "1.0" })).problems.includes("version_not_semver"), true);
  assert.equal(validatePackReleaseManifest(manifest({ pack_id: "mystery_pack" })).problems.includes("pack_id_unknown"), true);
});

test("the release-gate ladder is monotonic: a claimed gate demands every earlier gate's evidence", () => {
  const smokeWithoutInstall = manifest({
    claimed_gate: "smoke",
    gate_evidence: { ...evidenceThrough("smoke"), install: undefined },
  });
  const verdict = validatePackReleaseManifest(smokeWithoutInstall);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems.includes("gate_evidence_missing_install"), true);

  const complete = manifest({ claimed_gate: "smoke", gate_evidence: evidenceThrough("smoke") });
  assert.deepEqual(validatePackReleaseManifest(complete), { ok: true, problems: [] });

  assert.equal(validatePackReleaseManifest(manifest({ claimed_gate: "vibe_check" }))
    .problems.includes("claimed_gate_unknown"), true);
});

test("status ceilings: released demands the full ladder through acceptance; a folder existing proves nothing", () => {
  const folderOnly = validatePackReleaseManifest(manifest({ status: "released" }));
  assert.equal(folderOnly.ok, false);
  assert.equal(folderOnly.problems.includes("released_requires_acceptance_gate"), true);

  const rcTooEarly = validatePackReleaseManifest(manifest({ status: "release_candidate", claimed_gate: "e2e", gate_evidence: evidenceThrough("e2e") }));
  assert.equal(rcTooEarly.problems.includes("release_candidate_requires_package_gate"), true);

  const released = validatePackReleaseManifest(manifest({
    status: "released", claimed_gate: "acceptance", gate_evidence: evidenceThrough("acceptance"),
  }));
  assert.deepEqual(released, { ok: true, problems: [] });
});

test("must-not-contain boundaries and secret-material shapes are rejected", () => {
  const poisoned = validatePackReleaseManifest(manifest({ contents: ["server_modules", "plaintext_secrets"] }));
  assert.equal(poisoned.problems.includes("forbidden_content_plaintext_secrets"), true);

  const clientPack = validatePackReleaseManifest(manifest({
    pack_id: "team_client_pack", contents: ["ui", "embedded_credential"],
  }));
  assert.equal(clientPack.problems.includes("forbidden_content_embedded_credential"), true);

  const materialLooking = validatePackReleaseManifest(manifest({
    secret_refs: ["QWxhZGRpbjpvcGVuIHNlc2FtZUFsYWRkaW46b3BlbiBzZXNhbWU="],
  }));
  assert.equal(materialLooking.problems.includes("secret_refs_look_like_material"), true);
});

test("ring promotions are strictly ordered with decision, evidence, support owner, and rollback target", () => {
  const promotion = {
    pack_id: "hpp_server_pack",
    from_ring: "one_physical_seat", to_ring: "one_project_low_risk",
    target_release_manifest_ref: "release_manifest.hpp_server_pack.v0_1_0",
    promotion_decision_ref: "decision.ring.4", evidence_bundle_ref: "evidence.ring.4",
    support_owner_ref: "owner.platform_support", rollback_trigger_ref: "trigger.smoke_regression",
    known_issues_ref: "notes.known_issues.v0_1_0",
  };
  assert.deepEqual(validateRingPromotion(promotion), { ok: true, problems: [] });

  const skip = validateRingPromotion({ ...promotion, from_ring: "synthetic", to_ring: "dev_team_pilot" });
  assert.equal(skip.problems.includes("ring_skip_forbidden"), true);

  const sameRing = validateRingPromotion({ ...promotion, to_ring: "one_physical_seat" });
  assert.equal(sameRing.problems.includes("ring_skip_forbidden"), true);

  const missingTarget = validateRingPromotion({ ...promotion, target_release_manifest_ref: "" });
  assert.equal(missingTarget.problems.includes("target_release_manifest_ref_missing"), true);

  const missingTrigger = validateRingPromotion({ ...promotion, rollback_trigger_ref: "" });
  assert.equal(missingTrigger.problems.includes("rollback_trigger_ref_missing"), true);

  // The probe is concatenated so this tracked source never contains a literal
  // path shape (the repo path policy scans source bytes).
  const drivePath = validateRingPromotion({ ...promotion, evidence_bundle_ref: "c" + ":/evi" + "dence/x" });
  assert.equal(drivePath.problems.includes("evidence_bundle_ref_missing"), true, "drive-letter paths are not refs");
});

test("runbooks demand owner, preconditions, allowed actions, evidence outputs, and a rollback path — and never secrets", () => {
  const good = validateRunbook({
    runbook_id: "watch_4192_incident_response",
    owner_ref: "owner.watch_operator",
    audience: "operator",
    release_version: "0.1.0",
    entry_preconditions: ["panel shows hold or unavailable"],
    allowed_actions: ["open safe pointer", "file an approved action request"],
    evidence_outputs: ["request-to-receipt trace"],
    rollback_escalation_path: ["escalate to bastion runbook"],
  });
  assert.deepEqual(good, { ok: true, problems: [] });

  const goodCandidate = {
    runbook_id: "watch_4192_incident_response",
    owner_ref: "owner.watch_operator",
    audience: "operator",
    release_version: "0.1.0",
    entry_preconditions: ["panel shows hold or unavailable"],
    allowed_actions: ["open safe pointer", "file an approved action request"],
    evidence_outputs: ["request-to-receipt trace"],
    rollback_escalation_path: ["escalate to bastion runbook"],
  };
  assert.equal(validateRunbook({ ...goodCandidate, runbook_id: "vibe_manual" }).problems.includes("runbook_id_unknown"), true);
  assert.equal(validateRunbook({
    runbook_id: "workshop_operator", owner_ref: "owner.x", audience: "operator", release_version: "0.1.0",
    entry_preconditions: [], allowed_actions: ["a"], evidence_outputs: ["b"], rollback_escalation_path: ["c"],
  }).problems.includes("entry_preconditions_missing"), true);
  assert.equal(validateRunbook({
    ...goodCandidate, allowed_actions: ["use Password hunter2 to log in"],
  }).problems.includes("runbook_embeds_secret_material"), true);
  assert.equal(validateRunbook({
    ...goodCandidate, allowed_actions: ["paste the -----BEGIN RSA PRIVATE KEY----- block"],
  }).problems.includes("runbook_embeds_secret_material"), true);
  assert.equal(validateRunbook({
    ...goodCandidate, entry_preconditions: ["open " + "/ho" + "me/someone/notes.txt first"],
  }).problems.includes("runbook_embeds_local_path"), true);
  assert.equal(validateRunbook({ ...goodCandidate, release_version: "v1" }).problems.includes("release_version_not_semver"), true);
});
