// Deployment pack contract — data + validators (program plans 12 and 16).
//
// This pins WHAT a pack release must prove before anyone may call it a
// release: the five-pack catalog with contains/must-not-contain boundaries,
// the monotonic release-gate ladder (a later gate without every earlier
// gate's evidence is a lie), the rollout-ring ladder, and the runbook
// catalog with its required fields. It builds nothing, installs nothing, and
// deploys nothing — "a release is not a folder or artifact existing".

export const DEPLOYMENT_PACK_SCHEMA = "soulforge.deployment_pack_contract.v0";

export const PACK_CATALOG = Object.freeze([
  Object.freeze({
    pack_id: "hpp_server_pack",
    // "validators" added 2026-08-30: every pack carries its own test suite
    // so the installed copy can prove itself (tool_workshop precedent).
    contains: Object.freeze(["server_modules", "control_data_plane_services", "manifests", "operator_docs", "supported_migrations", "validators"]),
    must_not_contain: Object.freeze(["project_payload", "plaintext_secrets", "team_client_private_keys"]),
    initial_release_gate: "isolated install/start/stop/smoke/upgrade/rollback/restore proof",
  }),
  Object.freeze({
    pack_id: "team_client_pack",
    contains: Object.freeze(["mcp_client_config_templates", "ui", "local_helper_outbox", "learning_material", "safe_diagnostics"]),
    must_not_contain: Object.freeze(["embedded_credential", "raw_project_data", "implicit_project_grant"]),
    initial_release_gate: "one-seat install, identity/revoke/recovery, exact work/bundle/submission loop",
  }),
  Object.freeze({
    pack_id: "tool_workshop_pack",
    contains: Object.freeze(["tool_adapter", "resource_lease_helper", "workshop_docs", "validators"]),
    must_not_contain: Object.freeze(["license_secret", "customer_libraries", "default_project_context"]),
    initial_release_gate: "one workstation/tool low-risk canary and output validation",
  }),
  Object.freeze({
    pack_id: "project_ai_team_pack",
    contains: Object.freeze(["approved_project_mark_deployment_bindings", "runtime_references"]),
    must_not_contain: Object.freeze(["cross_project_memory", "plaintext_secret", "global_task_authority"]),
    initial_release_gate: "one project isolated deployment/run/rollback proof",
  }),
  Object.freeze({
    pack_id: "backup_recovery_extension",
    contains: Object.freeze(["recovery_policy_adapter", "test_fixtures"]),
    must_not_contain: Object.freeze(["secret_backup", "unapproved_source_bytes"]),
    initial_release_gate: "capture + isolated restore + human restore acceptance",
  }),
]);

// Release ladder from the Owner directive (section 20, Release Gate) as
// refined by plan 12. Claiming gate N requires evidence for gates 0..N.
export const RELEASE_GATES = Object.freeze([
  "build", "unit", "contract", "integration", "e2e", "package", "sbom",
  "install", "start", "smoke", "upgrade", "rollback", "restore", "canary", "acceptance",
]);

export const ROLLOUT_RINGS = Object.freeze([
  "synthetic", "integration", "internal_developer", "one_physical_seat",
  "one_project_low_risk", "repeated_3_to_5", "dev_team_pilot", "broader_rollout",
]);

export const RELEASE_STATUSES = Object.freeze(["draft", "release_candidate", "released", "deprecated"]);

const REF = /^[a-z][a-z0-9_.:/\\-]{1,160}$/;
const DRIVE_PATH = /^[a-z]:[\\/]/;

function validRef(value) {
  return typeof value === "string" && REF.test(value) && !DRIVE_PATH.test(value);
}
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function problem(list, code) {
  list.push(code);
}

// A pack release manifest candidate is DATA the future release tooling emits.
// This validator decides how strong a claim that data may make.
export function validatePackReleaseManifest(candidate) {
  const problems = [];
  if (!candidate || typeof candidate !== "object") return { ok: false, problems: ["manifest_shape_invalid"] };

  const pack = PACK_CATALOG.find((entry) => entry.pack_id === candidate.pack_id);
  if (!pack) problem(problems, "pack_id_unknown");
  if (typeof candidate.version !== "string" || !SEMVER.test(candidate.version)) problem(problems, "version_not_semver");
  if (!RELEASE_STATUSES.includes(candidate.status)) problem(problems, "status_invalid");

  for (const field of ["release_notes_ref", "install_manual_ref", "upgrade_manual_ref", "rollback_manual_ref", "support_owner_ref"]) {
    if (!validRef(candidate[field])) problem(problems, `${field}_missing`);
  }
  if (!Array.isArray(candidate.config_refs)) problem(problems, "config_refs_missing");
  if (!Array.isArray(candidate.secret_refs)) problem(problems, "secret_refs_missing");
  // secret_refs are REFERENCES; a value that looks like base64 material
  // rather than a reference is rejected.
  if (Array.isArray(candidate.secret_refs)
    && candidate.secret_refs.some((entry) => typeof entry === "string" && /[A-Za-z0-9+/]{32,}={0,2}$/.test(entry) && !entry.includes("_ref"))) {
    problem(problems, "secret_refs_look_like_material");
  }

  // Contains / must-not-contain boundaries.
  if (pack) {
    const declared = Array.isArray(candidate.contents) ? candidate.contents : null;
    if (!declared) problem(problems, "contents_missing");
    if (declared) {
      for (const banned of pack.must_not_contain) {
        if (declared.includes(banned)) problem(problems, `forbidden_content_${banned}`);
      }
    }
  }

  // Monotonic gate ladder: gate_evidence maps gate -> evidence ref.
  const evidence = candidate.gate_evidence && typeof candidate.gate_evidence === "object" ? candidate.gate_evidence : {};
  const claimed = candidate.claimed_gate;
  if (claimed !== undefined) {
    const claimedIndex = RELEASE_GATES.indexOf(claimed);
    if (claimedIndex === -1) problem(problems, "claimed_gate_unknown");
    else {
      for (let index = 0; index <= claimedIndex; index += 1) {
        const gate = RELEASE_GATES[index];
        if (!validRef(evidence[gate])) {
          problem(problems, `gate_evidence_missing_${gate}`);
        }
      }
    }
  }

  // Status ceilings: released requires the FULL ladder through acceptance;
  // release_candidate requires at least the package gate.
  if (candidate.status === "released" && claimed !== "acceptance") problem(problems, "released_requires_acceptance_gate");
  if (candidate.status === "release_candidate") {
    const claimedIndex = RELEASE_GATES.indexOf(claimed ?? "");
    if (claimedIndex < RELEASE_GATES.indexOf("package")) problem(problems, "release_candidate_requires_package_gate");
  }

  return { ok: problems.length === 0, problems };
}

// Ring promotion: each ring needs its own promotion decision, evidence
// bundle, support owner, and rollback target; rings are strictly ordered.
export function validateRingPromotion(candidate) {
  const problems = [];
  if (!candidate || typeof candidate !== "object") return { ok: false, problems: ["promotion_shape_invalid"] };
  const fromIndex = ROLLOUT_RINGS.indexOf(candidate.from_ring);
  const toIndex = ROLLOUT_RINGS.indexOf(candidate.to_ring);
  if (fromIndex === -1) problem(problems, "from_ring_unknown");
  if (toIndex === -1) problem(problems, "to_ring_unknown");
  if (fromIndex !== -1 && toIndex !== -1 && toIndex !== fromIndex + 1) problem(problems, "ring_skip_forbidden");
  // Plan-12 promotion record kinds: target release manifest, decision,
  // known issues, support owner, rollback trigger, evidence bundle.
  if (!PACK_CATALOG.some((entry) => entry.pack_id === candidate.pack_id)) problem(problems, "pack_id_unknown");
  for (const field of ["target_release_manifest_ref", "promotion_decision_ref", "evidence_bundle_ref", "support_owner_ref", "rollback_trigger_ref", "known_issues_ref"]) {
    if (!validRef(candidate[field])) problem(problems, `${field}_missing`);
  }
  return { ok: problems.length === 0, problems };
}

// Plan-16 runbook catalog (13 manuals) and the per-runbook required fields.
export const RUNBOOK_CATALOG = Object.freeze([
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
  "new_hire_training",
  "experienced_hire_training",
  "manager_training",
]);

export function validateRunbook(candidate) {
  const problems = [];
  if (!candidate || typeof candidate !== "object") return { ok: false, problems: ["runbook_shape_invalid"] };
  if (!RUNBOOK_CATALOG.includes(candidate.runbook_id)) problem(problems, "runbook_id_unknown");
  for (const field of ["owner_ref", "audience"]) {
    if (typeof candidate[field] !== "string" || candidate[field].length === 0) problem(problems, `${field}_missing`);
  }
  if (typeof candidate.release_version !== "string" || !SEMVER.test(candidate.release_version)) problem(problems, "release_version_not_semver");
  for (const field of ["entry_preconditions", "allowed_actions", "evidence_outputs", "rollback_escalation_path"]) {
    const value = candidate[field];
    if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
      problem(problems, `${field}_missing`);
    }
  }
  // A runbook must never embed credentials or raw payloads.
  const text = JSON.stringify(candidate);
  if (/password|passwd|api[_-]?key|token_value|secret_value|private[_ ]key|BEGIN [A-Z ]+KEY/i.test(text)) {
    problem(problems, "runbook_embeds_secret_material");
  }
  if (/[A-Za-z]:\\\\|[A-Za-z]:\/|\/(Users|home)\//.test(text)) problem(problems, "runbook_embeds_local_path");
  return { ok: problems.length === 0, problems };
}
