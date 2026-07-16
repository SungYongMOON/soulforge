#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKET_SCHEMA = "soulforge.a8_synth_secure_access_packet.v1";
const OUTPUT_SCHEMA = "soulforge.a8_synth_secure_access_output.v1";
const ERROR_SCHEMA = "soulforge.a8_synth_secure_access_error.v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SAFE_REF = /^[a-z][a-z0-9_-]{1,95}(?::[a-z0-9][a-z0-9_-]{0,95})*$/;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
const MAX_PACKET_BYTES = 1024 * 1024;
const SYNTHETIC_TRANSFER_BYTES = Buffer.from("soulforge-a8-synth-range-fixture-v1", "utf8");
const SYNTHETIC_CONTENT_HASH = `sha256:${createHash("sha256").update(SYNTHETIC_TRANSFER_BYTES).digest("hex")}`;
const SYNTHETIC_MANIFEST_DIGEST = SYNTHETIC_CONTENT_HASH;
const RANGE_SPLIT = 13;
const rangeDigest = (start, end) => `sha256:${createHash("sha256").update(SYNTHETIC_TRANSFER_BYTES.subarray(start, end)).digest("hex")}`;
const SET_ARRAY_KEYS = new Set([
  "actions", "actor_binding_fields", "agent_policy_actions", "approved_operations",
  "baseline_refs", "cache_key_fields", "consumers", "custody_matrix", "derivative_policy_fields", "effective_actions",
  "human_grant_actions", "knowledge_provenance_fields", "parent_expiries",
  "policy_refs", "prerequisite_refs", "scopes", "source_kinds", "step_up_actions", "task_object_actions",
  "ticket_binding_fields", "trusted_device_actions",
]);

class A8SynthError extends Error {
  constructor(exitCode, reasonCode) {
    super(reasonCode);
    this.exitCode = exitCode;
    this.reasonCode = reasonCode;
  }
}

const invalid = (reasonCode = "packet_or_cli_invalid") => {
  throw new A8SynthError(2, reasonCode);
};
const digestMismatch = () => { throw new A8SynthError(3, "approved_packet_digest_mismatch"); };
const sentinelFailure = () => { throw new A8SynthError(5, "raw_path_secret_sentinel"); };
const readFailure = () => { throw new A8SynthError(6, "packet_read_failed"); };

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const PUBLIC_SYNTHETIC_PACKET = deepFreeze({
  schema_version: PACKET_SCHEMA,
  packet_id: "a8_synth_public_secure_access_001",
  evaluation_time: "2026-07-16T03:00:00Z",
  baseline_refs: ["baseline_main_09f3ae7", "master_plan_a8_synth_v1"],
  prerequisite_refs: ["d27_secure_ingress_contract", "d28_delegated_session_contract", "d29_acl_query_contract", "security_packet_public_synthetic_v1"],
  profile: {
    public_safe: true,
    pathless: true,
    synthetic: true,
    feature_mode: "off",
  },
  external_approval_binding: {
    authority_ref: "synthetic_external_authority_fixture",
    approval_ref: "synthetic_approval_binding_fixture",
    issued_at: "2026-07-16T00:00:00Z",
    expires_at: "2027-06-01T00:00:00Z",
    revocation_ref: "synthetic_revocation_registry_fixture",
    revoked_at_or_none: "none",
    binding_state: "synthetic_fixture_only",
    owner_acceptance: false,
  },
  actor_chain: {
    user_id: "user_synth_001",
    device_id: "device_synth_001",
    agent_id: "agent_synth_001",
    opaque_thread_ref: "opaque_thread_synth_001",
    task_id: "task_synth_001",
    project_id: "project_synth_001",
    artifact_id: "artifact_synth_001",
    revision_id: "revision_synth_001",
    action: "download_exact",
    expires_at: "2027-01-01T00:00:00Z",
  },
  access: {
    enrollment: {
      one_time: true,
      recovery_requires_step_up: true,
      new_device_requires_step_up: true,
    },
    transport: {
      mtls_required: true,
      enrolled_device_required: true,
      network_scope: "strict_private_office_lan",
    },
    broker: {
      storage_class: "os_protected",
      routine_silent_refresh: true,
      routine_human_prompt_required: false,
    },
    delegation: {
      intersection_required: true,
      earliest_expiry_required: true,
      cascade_revoke: true,
      human_grant_actions: ["checkpoint", "download_exact", "submit_candidate", "upload"],
      trusted_device_actions: ["checkpoint", "download_exact", "upload"],
      agent_policy_actions: ["checkpoint", "download_exact", "move", "upload"],
      task_object_actions: ["checkpoint", "download_exact", "upload"],
      effective_actions: ["checkpoint", "download_exact", "upload"],
      parent_expiries: [
        "2030-01-01T00:00:00Z",
        "2029-01-01T00:00:00Z",
        "2028-01-01T00:00:00Z",
        "2027-01-01T00:00:00Z",
      ],
      child_requested_expiry: "2031-01-01T00:00:00Z",
      effective_expiry: "2027-01-01T00:00:00Z",
      refresh_after_revoke_allowed: false,
      child_grant_after_revoke_allowed: false,
      ticket_after_revoke_allowed: false,
      protected_mutation_after_revoke_allowed: false,
    },
    step_up_actions: [
      "completion", "delete", "knowledge_promotion", "move", "new_device", "promotion",
      "recovery", "restricted_download", "restricted_reveal", "scope_expansion",
    ],
  },
  access_fixture: {
    enrollment_attempts: [
      { case_id: "enroll_once", attempt_id: "enrollment_attempt_001", device_id: "device_synth_001", token_id: "enrollment_token_001", certificate_ref: "certificate_synth_001", certificate_trusted: true, audience: "hpp_auth_broker", parent_revoked: false },
      { case_id: "replay_same_token", attempt_id: "enrollment_attempt_002", device_id: "device_synth_001", token_id: "enrollment_token_001", certificate_ref: "certificate_synth_001", certificate_trusted: true, audience: "hpp_auth_broker", parent_revoked: false },
      { case_id: "untrusted_certificate", attempt_id: "enrollment_attempt_003", device_id: "device_synth_002", token_id: "enrollment_token_002", certificate_ref: "certificate_synth_untrusted", certificate_trusted: false, audience: "hpp_auth_broker", parent_revoked: false },
      { case_id: "wrong_enrollment_audience", attempt_id: "enrollment_attempt_004", device_id: "device_synth_003", token_id: "enrollment_token_003", certificate_ref: "certificate_synth_003", certificate_trusted: true, audience: "hpp_transfer_service", parent_revoked: false },
      { case_id: "revoked_parent_enrollment", attempt_id: "enrollment_attempt_005", device_id: "device_synth_004", token_id: "enrollment_token_004", certificate_ref: "certificate_synth_004", certificate_trusted: true, audience: "hpp_auth_broker", parent_revoked: true },
    ],
    transport_cases: [
      { case_id: "trusted_mtls", device_id: "device_synth_001", mtls_present: true, certificate_ref: "certificate_synth_001", certificate_trusted: true, enrolled_device: true, device_revoked: false, audience: "hpp_transfer_service", parent_revoked: false },
      { case_id: "missing_mtls", device_id: "device_synth_001", mtls_present: false, certificate_ref: "certificate_synth_001", certificate_trusted: true, enrolled_device: true, device_revoked: false, audience: "hpp_transfer_service", parent_revoked: false },
      { case_id: "untrusted_transport_certificate", device_id: "device_synth_002", mtls_present: true, certificate_ref: "certificate_synth_untrusted", certificate_trusted: false, enrolled_device: true, device_revoked: false, audience: "hpp_transfer_service", parent_revoked: false },
      { case_id: "unenrolled_device", device_id: "device_synth_005", mtls_present: true, certificate_ref: "certificate_synth_005", certificate_trusted: true, enrolled_device: false, device_revoked: false, audience: "hpp_transfer_service", parent_revoked: false },
      { case_id: "wrong_transport_audience", device_id: "device_synth_001", mtls_present: true, certificate_ref: "certificate_synth_001", certificate_trusted: true, enrolled_device: true, device_revoked: false, audience: "hpp_auth_broker", parent_revoked: false },
      { case_id: "revoked_transport_parent", device_id: "device_synth_004", mtls_present: true, certificate_ref: "certificate_synth_004", certificate_trusted: true, enrolled_device: true, device_revoked: false, audience: "hpp_transfer_service", parent_revoked: true },
      { case_id: "enrolled_then_device_revoked", device_id: "device_synth_006", mtls_present: true, certificate_ref: "certificate_synth_006", certificate_trusted: true, enrolled_device: true, device_revoked: true, audience: "hpp_transfer_service", parent_revoked: false },
    ],
    broker_cases: [
      { case_id: "routine_checkpoint", device_id: "device_synth_001", enrolled_device: true, device_revoked: false, certificate_trusted: true, parent_revoked: false, action: "checkpoint", refresh_requested: true, human_prompt_requested: false, child_grant_requested: false, ticket_requested: false, pending_protected_mutation_requested: false },
      { case_id: "recovery_step_up", device_id: "device_synth_001", enrolled_device: true, device_revoked: false, certificate_trusted: true, parent_revoked: false, action: "recovery", refresh_requested: true, human_prompt_requested: true, child_grant_requested: false, ticket_requested: false, pending_protected_mutation_requested: false },
      { case_id: "revoked_refresh", device_id: "device_synth_004", enrolled_device: true, device_revoked: false, certificate_trusted: true, parent_revoked: true, action: "checkpoint", refresh_requested: true, human_prompt_requested: false, child_grant_requested: true, ticket_requested: true, pending_protected_mutation_requested: true },
      { case_id: "device_revoked_cascade", device_id: "device_synth_006", enrolled_device: true, device_revoked: true, certificate_trusted: true, parent_revoked: false, action: "checkpoint", refresh_requested: true, human_prompt_requested: false, child_grant_requested: true, ticket_requested: true, pending_protected_mutation_requested: true },
    ],
  },
  storage: {
    project_owner_class: "project_payload_owner",
    common_owner_class: "common_payload_owner",
    project_common_separated: true,
    project_metadata_only: true,
    system_metadata_only: true,
    consumers: ["answer", "index", "review", "trace", "work_card"],
    task_truth_owner: "dev_erp_transaction_coordinator",
    second_task_truth_allowed: false,
    hwp_direct_parse_allowed: false,
    hwpx_derivative_required: true,
    source_original_delete_allowed: false,
    logical_topology_unchanged: true,
    cloud_sync_runtime_allowed: false,
    non_hpp_direct_storage_allowed: false,
    direct_smb_allowed: false,
    direct_sqlite_allowed: false,
    client_access_surface: "mcp_api_receipt_only",
    custody_owner: "hpp_custody",
    transfer_writer: "hpp_transfer_service",
    binding_writer: "hpp_promoter",
    history_writer: "hpp_project_history_projector",
  },
  ingress: {
    source_kinds: [
      "erp_chat_attachment", "external_se_schedule", "mail_raw_attachment", "personal_mcp_artifact",
      "project_file_activity", "run_log", "voice_audio_transcript",
    ],
    custody_matrix: [
      { source_kind: "mail_raw_attachment", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
      { source_kind: "erp_chat_attachment", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
      { source_kind: "personal_mcp_artifact", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
      { source_kind: "voice_audio_transcript", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
      { source_kind: "external_se_schedule", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
      { source_kind: "project_file_activity", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
      { source_kind: "run_log", custody_owner: "hpp_custody", staging_owner: "hpp_transfer_service", quarantine_owner: "hpp_transfer_service", promoter: "hpp_promoter", destination_binding_state: "verify_hp_hold", retention_ref: "retention_policy_synth", acl_ref: "acl_policy_synth", scan_ref: "scan_policy_synth", backup_ref: "backup_policy_synth" },
    ],
    custody_matrix_complete: true,
    physical_binding_state: "verify_hp_hold",
    mail_classifier_payload_write_allowed: false,
    upload_receipt_promotes_project: false,
    upload_receipt_creates_artifact_revision: false,
    upload_receipt_writes_knowledge_or_task: false,
    default_operation: "reference",
    approved_operations: ["copy", "derive", "reference"],
    explicit_approval_required: true,
    move_allowed: false,
    delete_allowed: false,
    same_operation_same_digest: "same_receipt",
    same_operation_different_digest: "quarantine",
    required_scan_missing_or_failed_blocks: true,
    extension_or_hash_counts_as_scan: false,
    blocked_type_quarantined: true,
    archive_bomb_quarantined: true,
    hash_size_media_match_required: true,
    promoter_separate_from_other_writers: true,
    policy_refs: ["acl_policy_synth", "backup_policy_synth", "retention_policy_synth", "scan_policy_synth"],
    source_custody_preserved_on_rollback: true,
    prior_binding_restored_on_rollback: true,
    accepted_parity_required_for_current: true,
    ticket_binding_fields: [
      "action", "agent_id", "artifact_id", "audience", "content_hash", "device_id",
      "expires_at", "method", "opaque_thread_ref", "project_id", "revision_id", "size_bytes",
      "task_id", "user_id",
    ],
    url_is_bearer_authority: false,
    ticket_replay_policy: "same_digest_noop_or_reject",
    finalize_idempotent: true,
    revoke_before_commit_accepts_mutation: false,
    control_plane: "mcp",
    binary_plane: "mtls_https",
    public_ingress_allowed: false,
    remote_network_allowed: false,
    port_forward_allowed: false,
    client_selected_destination_allowed: false,
    traversal_allowed: false,
    exact_revision_only: true,
    range_resume_bounded: true,
    reassembled_hash_required: true,
    latest_revision_fallback_allowed: false,
    source_fallback_allowed: false,
    client_binary_write_allowed: false,
    projector_binding_write_allowed: false,
  },
  transfer_fixture: {
    ticket: {
      ticket_id: "ticket_synth_001",
      delegation_ref: "synthetic_approval_binding_fixture",
      user_id: "user_synth_001",
      device_id: "device_synth_001",
      agent_id: "agent_synth_001",
      opaque_thread_ref: "opaque_thread_synth_001",
      task_id: "task_synth_001",
      project_id: "project_synth_001",
      artifact_id: "artifact_synth_001",
      revision_id: "revision_synth_001",
      action: "download_exact",
      method: "GET",
      audience: "hpp_transfer_service",
      content_hash: SYNTHETIC_CONTENT_HASH,
      size_bytes: SYNTHETIC_TRANSFER_BYTES.length,
      media_type: "application/octet-stream",
      expires_at: "2027-01-01T00:00:00Z",
    },
    finalize_attempts: [
      { attempt_id: "finalize_attempt_001", operation_id: "finalize_operation_001", idempotency_key: "finalize_key_001", ticket_id: "ticket_synth_001", content_hash: SYNTHETIC_CONTENT_HASH, revoked_before_commit: false },
      { attempt_id: "finalize_attempt_002", operation_id: "finalize_operation_001", idempotency_key: "finalize_key_001", ticket_id: "ticket_synth_001", content_hash: SYNTHETIC_CONTENT_HASH, revoked_before_commit: false },
      { attempt_id: "finalize_attempt_003", operation_id: "finalize_operation_001", idempotency_key: "finalize_key_001", ticket_id: "ticket_synth_001", content_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", revoked_before_commit: false },
      { attempt_id: "finalize_attempt_004", operation_id: "finalize_operation_002", idempotency_key: "finalize_key_002", ticket_id: "ticket_synth_001", content_hash: SYNTHETIC_CONTENT_HASH, revoked_before_commit: true },
    ],
    download: {
      ticket_id: "ticket_synth_001",
      artifact_id: "artifact_synth_001",
      revision_id: "revision_synth_001",
      action: "download_exact",
      method: "GET",
      audience: "hpp_transfer_service",
      accepted_manifest_digest: SYNTHETIC_MANIFEST_DIGEST,
      expected_content_hash: SYNTHETIC_CONTENT_HASH,
      expected_size_bytes: SYNTHETIC_TRANSFER_BYTES.length,
      ranges: [
        { start: 0, end_exclusive: RANGE_SPLIT, range_hash: rangeDigest(0, RANGE_SPLIT) },
        { start: RANGE_SPLIT, end_exclusive: SYNTHETIC_TRANSFER_BYTES.length, range_hash: rangeDigest(RANGE_SPLIT, SYNTHETIC_TRANSFER_BYTES.length) },
      ],
    },
    content_cases: [
      { case_id: "archive_bomb", gate_result: "quarantined", promotion_allowed: false },
      { case_id: "blocked_type", gate_result: "quarantined", promotion_allowed: false },
      { case_id: "hash_mismatch", gate_result: "quarantined", promotion_allowed: false },
      { case_id: "media_mismatch", gate_result: "quarantined", promotion_allowed: false },
      { case_id: "size_mismatch", gate_result: "quarantined", promotion_allowed: false },
    ],
  },
  work_session: {
    start_bind_atomic: true,
    one_active_primary_per_assignment_account: true,
    second_start_policy: "same_receipt_or_409",
    same_event_digest_policy: "same_receipt",
    changed_event_digest_policy: "quarantine",
    gap_projection_allowed: false,
    auth_race_fail_closed: true,
    durable_receipt_recovery: true,
    compact_before_verified_ack_allowed: false,
    accepted_start_required_for_missing: true,
    local_pending_equals_server_missing: false,
    handoff_overwrites_old_binding: false,
    old_terminal_followup_write_allowed: false,
    new_session_chain_preserved: true,
    checkpoint_task_mutation_allowed: false,
    closeout_task_mutation_allowed: false,
    proposal_task_mutation_allowed: false,
    official_completion_writer: "authorized_task_coordinator",
    official_completion_event_count: 1,
    proposal_kinds_separated: true,
    thread_representation: "opaque_digest_only",
    foreign_existence_safe: true,
    outage_mode: "local_hold_last_accepted_read_only",
    remote_mount_allowed: false,
    split_writer_allowed: false,
    ack_replay_same_receipt: true,
  },
  session_fixture: {
    start_attempts: [
      { attempt_id: "start_attempt_001", assignment_epoch: "assignment_epoch_001", account_id: "account_synth_001", start_key: "start_key_001", session_id: "session_synth_001", binding_id: "binding_synth_001", start_digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111", actor_state: "active" },
      { attempt_id: "start_attempt_002", assignment_epoch: "assignment_epoch_001", account_id: "account_synth_001", start_key: "start_key_001", session_id: "session_synth_001", binding_id: "binding_synth_001", start_digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111", actor_state: "active" },
      { attempt_id: "start_attempt_003", assignment_epoch: "assignment_epoch_001", account_id: "account_synth_001", start_key: "start_key_002", session_id: "session_synth_002", binding_id: "binding_synth_002", start_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222", actor_state: "active" },
    ],
    event_attempts: [
      { attempt_id: "event_attempt_001", session_id: "session_synth_001", sequence: 1, previous_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", event_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333" },
      { attempt_id: "event_attempt_002", session_id: "session_synth_001", sequence: 1, previous_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", event_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333" },
      { attempt_id: "event_attempt_003", session_id: "session_synth_001", sequence: 1, previous_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", event_digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444" },
      { attempt_id: "event_attempt_004", session_id: "session_synth_001", sequence: 3, previous_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333", event_digest: "sha256:5555555555555555555555555555555555555555555555555555555555555555" },
    ],
    crash_stages: ["after_ack_before_compact", "after_server_commit_before_ack", "before_send"],
    auth_race_states: ["disabled_during_body", "reassigned_during_body", "revoked_during_body", "spoofed_node"],
    outbox_states: ["pending", "verified_server_ack", "compacted"],
    missing_case: { accepted_start_exists: false, local_pending: true, server_missing_closeout: false, states_treated_equal: false },
    handoff_case: { old_binding_overwrite_requested: false, old_terminal_followup_requested: true, new_session_chain_linked: true },
    task_event_requests: [
      { kind: "checkpoint", requested_task_delta: 0 },
      { kind: "closeout", requested_task_delta: 0 },
      { kind: "completion_proposal", requested_task_delta: 0 },
    ],
    proposal_kinds: ["knowledge_candidate", "knowledge_memo", "task_completion"],
    official_completion: { writer: "authorized_task_coordinator", expected_revision_matched: true, requested_event_count: 1 },
    private_boundary: { opaque_thread_digest_only: true, raw_fields_copied: false, foreign_existence_disclosed: false },
    outage_case: { hpp_available: false, remote_mount_attempted: false, split_writer_attempted: false, ack_replay_digest_matches: true },
  },
  query: {
    scopes: ["common", "project"],
    explicit_scope_required: true,
    implicit_fallback_allowed: false,
    foreign_existence_safe: true,
    accepted_generation_only: true,
    stale_generation_mutation_allowed: false,
    previous_generation_preserved_on_failure: true,
    api_file_parity_required: true,
    reverse_import_allowed: false,
    knowledge_provenance_fields: ["claim_ceiling", "content_ref", "locator_ref", "revision_id", "scope"],
    fuzzy_result_acceptance_allowed: false,
    read_business_mutation_allowed: false,
    candidate_write_surface: "candidate_ledger_only",
    direct_truth_write_allowed: false,
    stronger_claim_request_policy: "reject_422",
    generation_pinned_cursor: true,
    ui_mcp_typed_digest_equal: true,
    uniform_existence_policy: true,
    rag_prefilter_required: true,
    rag_postfilter_required: true,
    locator_acl_required: true,
    cache_key_fields: ["acl_revision", "policy_revision", "source_revision"],
    stale_cache_after_revoke_allowed: false,
    derivative_policy_fields: ["comments_notes", "embedded_objects", "formulas", "hidden_sheets_slides"],
    derivative_immutable: true,
    exact_source_lineage_required: true,
    source_fallback_allowed: false,
    exact_download_manifest_digest: SYNTHETIC_MANIFEST_DIGEST,
    download_audience_method_revision_swap_allowed: false,
  },
  query_fixture: {
    existence_cases: [
      { case_id: "authorized_existing", authorized: true, exists: true, expected_status: "200", expected_existence_disclosed: true, expected_result_count: 1 },
      { case_id: "authorized_missing", authorized: true, exists: false, expected_status: "404", expected_existence_disclosed: false, expected_result_count: 0 },
      { case_id: "unauthorized_existing", authorized: false, exists: true, expected_status: "404_masked", expected_existence_disclosed: false, expected_result_count: 0 },
    ],
    rag_cases: [
      { case_id: "all_acl_allowed", field_allowed: true, chunk_allowed: true, locator_allowed: true, expected_hits: 1 },
      { case_id: "field_acl_denied", field_allowed: false, chunk_allowed: true, locator_allowed: true, expected_hits: 0 },
      { case_id: "chunk_acl_denied", field_allowed: true, chunk_allowed: false, locator_allowed: true, expected_hits: 0 },
      { case_id: "locator_acl_denied", field_allowed: true, chunk_allowed: true, locator_allowed: false, expected_hits: 0 },
    ],
    cache_cases: [
      { case_id: "active_acl_revision", revoked: false, expected_body_hits: 1, expected_locator_hits: 1 },
      { case_id: "revoked_acl_revision", revoked: true, expected_body_hits: 0, expected_locator_hits: 0 },
    ],
    redacted_derivative: {
      source_revision_id: "revision_synth_001",
      derivative_revision_id: "revision_redacted_synth_001",
      hidden_sheets_slides_included: false,
      formulas_included: false,
      comments_notes_included: false,
      embedded_objects_included: false,
      immutable: true,
      raw_fallback: false,
    },
  },
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, template) {
  if (!isObject(value)) invalid();
  const actual = Object.keys(value).sort();
  const expected = Object.keys(template).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid("unknown_or_missing_key");
}

function validateShape(value, template) {
  if (template === null) {
    if (value !== null) invalid();
    return;
  }
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) invalid();
    if (new Set(value.map((entry) => compactCanonical(entry))).size !== value.length) invalid("duplicate_array_entry");
    if (template.length > 0) {
      for (const entry of value) validateShape(entry, template[0]);
    } else if (value.length !== 0) {
      invalid();
    }
    return;
  }
  if (isObject(template)) {
    exactKeys(value, template);
    for (const key of Object.keys(template)) validateShape(value[key], template[key]);
    return;
  }
  if (typeof value !== typeof template) invalid();
  if (typeof value === "string" && (value.length === 0 || value.length > 192 || /[\u0000-\u001f\u007f]/.test(value))) invalid();
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) invalid();
}

function unsafeString(value) {
  return /(?:\b[A-Za-z]:[\\/]|\\\\|(?:^|[\s"'(])\/(?:[A-Za-z0-9._-]+\/|[A-Za-z0-9._-]+$)|(?:^|[\\/])\.\.?[\\/]|https?:\/\/|file:\/\/|\bBearer\s+|\bsk-[A-Za-z0-9_-]{12,}|-----BEGIN|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(value);
}

function enforceSentinels(value, template) {
  if (Array.isArray(value)) {
    const childTemplate = Array.isArray(template) ? template[0] : undefined;
    for (const entry of value) enforceSentinels(entry, childTemplate);
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string" && unsafeString(value)) sentinelFailure();
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const keyIsAllowed = isObject(template) && Object.hasOwn(template, key);
    if (!keyIsAllowed && /(?:^|_)(?:body|payload|transcript|thread_id|local_path|destination_path|source_path|output_path|secret|token|credential|password|cookie|hostname)(?:_|$)/i.test(key)) {
      sentinelFailure();
    }
    enforceSentinels(child, keyIsAllowed ? template[key] : undefined);
  }
}

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const result = value.map((entry) => canonicalize(entry));
    if (SET_ARRAY_KEYS.has(key)) result.sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
    return result;
  }
  if (typeof value === "string") return value.normalize("NFC");
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((childKey) => [childKey, canonicalize(value[childKey], childKey)]));
}

function compactCanonical(value) {
  return JSON.stringify(canonicalize(value));
}

function digestValue(value, domain = "generic-v1") {
  const prefix = `soulforge\u0000a8-synth-secure-access\u0000${domain}\u0000`;
  return `sha256:${createHash("sha256").update(prefix).update(compactCanonical(value)).digest("hex")}`;
}

function validUtc(value) {
  if (!STRICT_UTC.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().replace(".000Z", "Z") === value.replace(/\.000Z$/, "Z");
}

function sameSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && [...actual].sort(compareCodeUnits).every((value, index) => value === [...expected].sort(compareCodeUnits)[index]);
}

function distinctActorChain(chain) {
  const values = [
    chain.user_id, chain.device_id, chain.agent_id, chain.opaque_thread_ref, chain.task_id,
    chain.project_id, chain.artifact_id, chain.revision_id,
  ];
  return values.every((value) => SAFE_REF.test(value)) && new Set(values).size === values.length;
}

function intersection(arrays) {
  return [...new Set(arrays[0])].filter((value) => arrays.slice(1).every((array) => array.includes(value))).sort(compareCodeUnits);
}

function delegationCeiling(packet) {
  const delegation = packet.access.delegation;
  const effectiveActions = intersection([
    delegation.human_grant_actions,
    delegation.trusted_device_actions,
    delegation.agent_policy_actions,
    delegation.task_object_actions,
  ]);
  const earliest = effectiveExpiry(packet);
  if (earliest === null) return false;
  const evaluationTime = Date.parse(packet.evaluation_time);
  return delegation.intersection_required
    && delegation.earliest_expiry_required
    && sameSet(delegation.effective_actions, effectiveActions)
    && delegation.effective_expiry === earliest
    && packet.actor_chain.expires_at === earliest
    && Number.isFinite(evaluationTime)
    && Date.parse(earliest) > evaluationTime
    && delegation.effective_actions.includes(packet.actor_chain.action)
    && approvalWindow(packet);
}

const EXPECTED_TICKET_FIELDS = [
  "action", "agent_id", "artifact_id", "audience", "content_hash", "device_id", "expires_at",
  "method", "opaque_thread_ref", "project_id", "revision_id", "size_bytes", "task_id", "user_id",
];
const EXPECTED_STEP_UP = [
  "completion", "delete", "knowledge_promotion", "move", "new_device", "promotion", "recovery",
  "restricted_download", "restricted_reveal", "scope_expansion",
];
const EXPECTED_SOURCE_KINDS = [
  "erp_chat_attachment", "external_se_schedule", "mail_raw_attachment", "personal_mcp_artifact",
  "project_file_activity", "run_log", "voice_audio_transcript",
];
const EXPECTED_BASELINE_REFS = ["baseline_main_09f3ae7", "master_plan_a8_synth_v1"];
const EXPECTED_PREREQUISITE_REFS = [
  "d27_secure_ingress_contract", "d28_delegated_session_contract", "d29_acl_query_contract",
  "security_packet_public_synthetic_v1",
];

function simulateEnrollment(attempts) {
  const consumedTokens = new Set();
  return attempts.map((attempt) => {
    let outcome;
    if (attempt.parent_revoked) outcome = "rejected_revoked";
    else if (!attempt.certificate_trusted) outcome = "rejected_untrusted_certificate";
    else if (attempt.audience !== "hpp_auth_broker") outcome = "rejected_audience";
    else if (consumedTokens.has(attempt.token_id)) outcome = "rejected_replay";
    else {
      consumedTokens.add(attempt.token_id);
      outcome = "enrolled_once";
    }
    return { case_id: attempt.case_id, outcome };
  });
}

function validEnrollmentFixture(packet) {
  const expected = {
    enroll_once: "enrolled_once",
    replay_same_token: "rejected_replay",
    untrusted_certificate: "rejected_untrusted_certificate",
    wrong_enrollment_audience: "rejected_audience",
    revoked_parent_enrollment: "rejected_revoked",
  };
  const outcomes = simulateEnrollment(packet.access_fixture.enrollment_attempts);
  return outcomes.length === Object.keys(expected).length
    && sameSet(outcomes.map((entry) => entry.case_id), Object.keys(expected))
    && outcomes.every((entry) => expected[entry.case_id] === entry.outcome);
}

function evaluateTransport(entry) {
  let outcome = "accepted_synthetic_transport";
  if (entry.parent_revoked) outcome = "rejected_revoked";
  else if (entry.device_revoked) outcome = "rejected_device_revoked";
  else if (!entry.mtls_present) outcome = "rejected_mtls_missing";
  else if (!entry.certificate_trusted) outcome = "rejected_untrusted_certificate";
  else if (!entry.enrolled_device) outcome = "rejected_unenrolled_device";
  else if (entry.audience !== "hpp_transfer_service") outcome = "rejected_audience";
  return { outcome, accepted_transport_effect_count: outcome === "accepted_synthetic_transport" ? 1 : 0 };
}

function validTransportFixture(packet) {
  const expected = {
    trusted_mtls: { outcome: "accepted_synthetic_transport", accepted_transport_effect_count: 1 },
    missing_mtls: { outcome: "rejected_mtls_missing", accepted_transport_effect_count: 0 },
    untrusted_transport_certificate: { outcome: "rejected_untrusted_certificate", accepted_transport_effect_count: 0 },
    unenrolled_device: { outcome: "rejected_unenrolled_device", accepted_transport_effect_count: 0 },
    wrong_transport_audience: { outcome: "rejected_audience", accepted_transport_effect_count: 0 },
    revoked_transport_parent: { outcome: "rejected_revoked", accepted_transport_effect_count: 0 },
    enrolled_then_device_revoked: { outcome: "rejected_device_revoked", accepted_transport_effect_count: 0 },
  };
  const cases = packet.access_fixture.transport_cases;
  const deviceRevoked = cases.find((entry) => entry.case_id === "enrolled_then_device_revoked");
  return cases.length === Object.keys(expected).length
    && sameSet(cases.map((entry) => entry.case_id), Object.keys(expected))
    && cases.every((entry) => compactCanonical(expected[entry.case_id]) === compactCanonical(evaluateTransport(entry)))
    && deviceRevoked?.enrolled_device === true
    && deviceRevoked.device_revoked === true
    && deviceRevoked.parent_revoked === false;
}

function evaluateBroker(entry, stepUpActions) {
  const zeroEffects = {
    broker_refresh_effect_count: 0,
    child_grant_effect_count: 0,
    ticket_effect_count: 0,
    pending_protected_mutation_effect_count: 0,
  };
  if (entry.parent_revoked) return { outcome: "rejected_revoked", ...zeroEffects };
  if (entry.device_revoked) return { outcome: "rejected_device_revoked", ...zeroEffects };
  if (!entry.enrolled_device || !entry.certificate_trusted) return { outcome: "rejected_untrusted_device", ...zeroEffects };
  if (stepUpActions.includes(entry.action)) {
    return { outcome: entry.human_prompt_requested ? "step_up_required" : "rejected_step_up_missing", ...zeroEffects };
  }
  if (entry.refresh_requested && !entry.human_prompt_requested) {
    return {
      outcome: "silently_refreshed",
      broker_refresh_effect_count: 1,
      child_grant_effect_count: entry.child_grant_requested ? 1 : 0,
      ticket_effect_count: entry.ticket_requested ? 1 : 0,
      pending_protected_mutation_effect_count: entry.pending_protected_mutation_requested ? 1 : 0,
    };
  }
  return { outcome: "rejected_routine_prompt", ...zeroEffects };
}

function validBrokerFixture(packet) {
  const expected = {
    routine_checkpoint: { outcome: "silently_refreshed", broker_refresh_effect_count: 1, child_grant_effect_count: 0, ticket_effect_count: 0, pending_protected_mutation_effect_count: 0 },
    recovery_step_up: { outcome: "step_up_required", broker_refresh_effect_count: 0, child_grant_effect_count: 0, ticket_effect_count: 0, pending_protected_mutation_effect_count: 0 },
    revoked_refresh: { outcome: "rejected_revoked", broker_refresh_effect_count: 0, child_grant_effect_count: 0, ticket_effect_count: 0, pending_protected_mutation_effect_count: 0 },
    device_revoked_cascade: { outcome: "rejected_device_revoked", broker_refresh_effect_count: 0, child_grant_effect_count: 0, ticket_effect_count: 0, pending_protected_mutation_effect_count: 0 },
  };
  const cases = packet.access_fixture.broker_cases;
  const deviceRevoked = cases.find((entry) => entry.case_id === "device_revoked_cascade");
  return cases.length === Object.keys(expected).length
    && sameSet(cases.map((entry) => entry.case_id), Object.keys(expected))
    && cases.every((entry) => compactCanonical(expected[entry.case_id]) === compactCanonical(evaluateBroker(entry, packet.access.step_up_actions)))
    && deviceRevoked?.enrolled_device === true
    && deviceRevoked.device_revoked === true
    && deviceRevoked.parent_revoked === false
    && deviceRevoked.refresh_requested === true
    && deviceRevoked.child_grant_requested === true
    && deviceRevoked.ticket_requested === true
    && deviceRevoked.pending_protected_mutation_requested === true;
}

function effectiveExpiry(packet) {
  const expiries = [
    ...packet.access.delegation.parent_expiries,
    packet.access.delegation.child_requested_expiry,
    packet.external_approval_binding.expires_at,
  ];
  if (!expiries.every(validUtc)) return null;
  return expiries.reduce((left, right) => Date.parse(left) <= Date.parse(right) ? left : right);
}

function approvalWindow(packet) {
  const binding = packet.external_approval_binding;
  if (!validUtc(packet.evaluation_time) || !validUtc(binding.issued_at) || !validUtc(binding.expires_at)) return false;
  const evaluated = Date.parse(packet.evaluation_time);
  const revokedAt = binding.revoked_at_or_none === "none" ? null : binding.revoked_at_or_none;
  if (revokedAt !== null && (!validUtc(revokedAt) || Date.parse(revokedAt) <= evaluated)) return false;
  return binding.binding_state === "synthetic_fixture_only"
    && binding.owner_acceptance === false
    && Date.parse(binding.issued_at) <= evaluated
    && evaluated < Date.parse(binding.expires_at);
}

function validCustodyMatrix(packet) {
  const rows = packet.ingress.custody_matrix;
  if (!Array.isArray(rows) || rows.length !== EXPECTED_SOURCE_KINDS.length) return false;
  const byKind = new Map(rows.map((row) => [row.source_kind, row]));
  if (byKind.size !== rows.length || !sameSet([...byKind.keys()], EXPECTED_SOURCE_KINDS)) return false;
  return [...byKind.values()].every((row) => row.custody_owner === "hpp_custody"
    && row.staging_owner === "hpp_transfer_service"
    && row.quarantine_owner === "hpp_transfer_service"
    && row.promoter === "hpp_promoter"
    && row.destination_binding_state === "verify_hp_hold"
    && row.retention_ref === "retention_policy_synth"
    && row.acl_ref === "acl_policy_synth"
    && row.scan_ref === "scan_policy_synth"
    && row.backup_ref === "backup_policy_synth");
}

function validTicket(packet) {
  const ticket = packet.transfer_fixture.ticket;
  const chain = packet.actor_chain;
  for (const field of [
    "user_id", "device_id", "agent_id", "opaque_thread_ref", "task_id", "project_id",
    "artifact_id", "revision_id", "action", "expires_at",
  ]) {
    if (ticket[field] !== chain[field]) return false;
  }
  return ticket.delegation_ref === packet.external_approval_binding.approval_ref
    && ticket.method === "GET"
    && ticket.audience === "hpp_transfer_service"
    && ticket.content_hash === SYNTHETIC_CONTENT_HASH
    && ticket.size_bytes === SYNTHETIC_TRANSFER_BYTES.length
    && ticket.media_type === "application/octet-stream"
    && ticket.expires_at === effectiveExpiry(packet)
    && Date.parse(ticket.expires_at) > Date.parse(packet.evaluation_time)
    && sameSet(packet.ingress.ticket_binding_fields, EXPECTED_TICKET_FIELDS);
}

function simulateFinalize(attempts) {
  const receipts = new Map();
  return attempts.map((attempt) => {
    if (attempt.revoked_before_commit) return { outcome: "rejected_revoked", receipt_id: null };
    const key = `${attempt.operation_id}\u0000${attempt.idempotency_key}`;
    const existing = receipts.get(key);
    if (!existing) {
      const receipt = {
        ticket_id: attempt.ticket_id,
        content_hash: attempt.content_hash,
        receipt_id: `receipt_${digestValue({
          operation_id: attempt.operation_id,
          idempotency_key: attempt.idempotency_key,
          ticket_id: attempt.ticket_id,
          content_hash: attempt.content_hash,
        }, "finalize-receipt-v1").slice(7, 23)}`,
      };
      receipts.set(key, receipt);
      return { outcome: "accepted_synthetic_receipt", receipt_id: receipt.receipt_id };
    }
    if (existing.ticket_id === attempt.ticket_id && existing.content_hash === attempt.content_hash) {
      return { outcome: "same_receipt", receipt_id: existing.receipt_id };
    }
    return { outcome: "quarantined_conflict", receipt_id: null };
  });
}

function validFinalizeFixture(packet) {
  const attempts = packet.transfer_fixture.finalize_attempts;
  const outcomes = simulateFinalize(attempts);
  return attempts.every((attempt) => attempt.ticket_id === packet.transfer_fixture.ticket.ticket_id)
    && outcomes.length === 4
    && outcomes[0].outcome === "accepted_synthetic_receipt"
    && outcomes[1].outcome === "same_receipt"
    && outcomes[0].receipt_id === outcomes[1].receipt_id
    && outcomes[2].outcome === "quarantined_conflict"
    && outcomes[2].receipt_id === null
    && outcomes[3].outcome === "rejected_revoked"
    && outcomes[3].receipt_id === null;
}

function validContentCases(packet) {
  const expected = ["archive_bomb", "blocked_type", "hash_mismatch", "media_mismatch", "size_mismatch"];
  const cases = packet.transfer_fixture.content_cases;
  return cases.length === expected.length
    && sameSet(cases.map((entry) => entry.case_id), expected)
    && cases.every((entry) => entry.gate_result === "quarantined" && entry.promotion_allowed === false);
}

function validDownloadFixture(packet) {
  const download = packet.transfer_fixture.download;
  const ticket = packet.transfer_fixture.ticket;
  if (download.ticket_id !== ticket.ticket_id
    || download.artifact_id !== ticket.artifact_id
    || download.revision_id !== ticket.revision_id
    || download.action !== ticket.action
    || download.method !== ticket.method
    || download.audience !== ticket.audience
    || download.accepted_manifest_digest !== packet.query.exact_download_manifest_digest
    || download.expected_content_hash !== ticket.content_hash
    || download.expected_size_bytes !== ticket.size_bytes
    || download.ranges.length !== 2) return false;
  const ranges = [...download.ranges].sort((a, b) => a.start - b.start);
  if (ranges[0].start !== 0 || ranges.at(-1).end_exclusive !== SYNTHETIC_TRANSFER_BYTES.length) return false;
  const slices = [];
  let cursor = 0;
  for (const range of ranges) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end_exclusive)
      || range.start !== cursor || range.end_exclusive <= range.start
      || range.end_exclusive > SYNTHETIC_TRANSFER_BYTES.length) return false;
    const slice = SYNTHETIC_TRANSFER_BYTES.subarray(range.start, range.end_exclusive);
    const digest = `sha256:${createHash("sha256").update(slice).digest("hex")}`;
    if (range.range_hash !== digest) return false;
    slices.push(slice);
    cursor = range.end_exclusive;
  }
  const reassembled = Buffer.concat(slices);
  return reassembled.length === download.expected_size_bytes
    && `sha256:${createHash("sha256").update(reassembled).digest("hex")}` === download.expected_content_hash;
}

function validExistenceCases(packet) {
  const expectedCases = {
    authorized_existing: { authorized: true, exists: true, status: "200", disclosed: true, count: 1 },
    authorized_missing: { authorized: true, exists: false, status: "404", disclosed: false, count: 0 },
    unauthorized_existing: { authorized: false, exists: true, status: "404_masked", disclosed: false, count: 0 },
  };
  const cases = packet.query_fixture.existence_cases;
  return cases.length === Object.keys(expectedCases).length
    && sameSet(cases.map((entry) => entry.case_id), Object.keys(expectedCases))
    && cases.every((entry) => {
    const expected = expectedCases[entry.case_id];
    const actual = entry.authorized
      ? (entry.exists
        ? { status: "200", disclosed: true, count: 1 }
        : { status: "404", disclosed: false, count: 0 })
      : { status: "404_masked", disclosed: false, count: 0 };
    return expected !== undefined
      && entry.authorized === expected.authorized
      && entry.exists === expected.exists
      && actual.status === expected.status
      && actual.disclosed === expected.disclosed
      && actual.count === expected.count
      && entry.expected_status === actual.status
      && entry.expected_existence_disclosed === actual.disclosed
      && entry.expected_result_count === actual.count;
  });
}

function validRagCases(packet) {
  const expectedCases = {
    all_acl_allowed: { field: true, chunk: true, locator: true, hits: 1 },
    field_acl_denied: { field: false, chunk: true, locator: true, hits: 0 },
    chunk_acl_denied: { field: true, chunk: false, locator: true, hits: 0 },
    locator_acl_denied: { field: true, chunk: true, locator: false, hits: 0 },
  };
  const cases = packet.query_fixture.rag_cases;
  return cases.length === Object.keys(expectedCases).length
    && sameSet(cases.map((entry) => entry.case_id), Object.keys(expectedCases))
    && cases.every((entry) => {
    const expected = expectedCases[entry.case_id];
    const hits = entry.field_allowed && entry.chunk_allowed && entry.locator_allowed ? 1 : 0;
    return expected !== undefined
      && entry.field_allowed === expected.field
      && entry.chunk_allowed === expected.chunk
      && entry.locator_allowed === expected.locator
      && hits === expected.hits
      && entry.expected_hits === hits;
  });
}

function validCacheCases(packet) {
  const expectedCases = {
    active_acl_revision: { revoked: false, hits: 1 },
    revoked_acl_revision: { revoked: true, hits: 0 },
  };
  const cases = packet.query_fixture.cache_cases;
  return cases.length === Object.keys(expectedCases).length
    && sameSet(cases.map((entry) => entry.case_id), Object.keys(expectedCases))
    && cases.every((entry) => {
    const expected = expectedCases[entry.case_id];
    const hits = entry.revoked ? 0 : 1;
    return expected !== undefined
      && entry.revoked === expected.revoked
      && hits === expected.hits
      && entry.expected_body_hits === hits
      && entry.expected_locator_hits === hits;
  });
}

function validRedactedDerivative(packet) {
  const derivative = packet.query_fixture.redacted_derivative;
  return derivative.source_revision_id === packet.actor_chain.revision_id
    && derivative.derivative_revision_id !== derivative.source_revision_id
    && SAFE_REF.test(derivative.derivative_revision_id)
    && !derivative.hidden_sheets_slides_included
    && !derivative.formulas_included
    && !derivative.comments_notes_included
    && !derivative.embedded_objects_included
    && derivative.immutable
    && !derivative.raw_fallback;
}

function simulateSessionStarts(attempts) {
  const active = new Map();
  return attempts.map((attempt) => {
    if (attempt.actor_state !== "active") {
      return { outcome: "rejected_auth", session_created: 0, binding_created: 0, receipt_created: 0 };
    }
    const cardinalityKey = `${attempt.assignment_epoch}\u0000${attempt.account_id}`;
    const existing = active.get(cardinalityKey);
    if (!existing) {
      active.set(cardinalityKey, attempt);
      return { outcome: "accepted", session_created: 1, binding_created: 1, receipt_created: 1 };
    }
    const same = existing.start_key === attempt.start_key
      && existing.start_digest === attempt.start_digest
      && existing.session_id === attempt.session_id
      && existing.binding_id === attempt.binding_id;
    return {
      outcome: same ? "same_receipt" : "conflict_409",
      session_created: 0,
      binding_created: 0,
      receipt_created: 0,
    };
  });
}

function validSessionStarts(packet) {
  const outcomes = simulateSessionStarts(packet.session_fixture.start_attempts);
  return outcomes.length === 3
    && outcomes.map((row) => row.outcome).join(",") === "accepted,same_receipt,conflict_409"
    && outcomes.every((row) => row.session_created === row.binding_created && row.binding_created === row.receipt_created)
    && outcomes.reduce((sum, row) => sum + row.session_created, 0) === 1;
}

function simulateSessionEvents(attempts) {
  const accepted = new Map();
  let nextSequence = 1;
  let previousDigest = `sha256:${"0".repeat(64)}`;
  return attempts.map((attempt) => {
    const existing = accepted.get(attempt.sequence);
    if (existing) {
      const same = existing.event_digest === attempt.event_digest
        && existing.previous_digest === attempt.previous_digest;
      return { outcome: same ? "same_receipt" : "quarantined_conflict", projected: 0 };
    }
    if (attempt.sequence !== nextSequence || attempt.previous_digest !== previousDigest) {
      return { outcome: "held_gap", projected: 0 };
    }
    accepted.set(attempt.sequence, attempt);
    nextSequence += 1;
    previousDigest = attempt.event_digest;
    return { outcome: "accepted", projected: 1 };
  });
}

function validSessionEvents(packet) {
  const outcomes = simulateSessionEvents(packet.session_fixture.event_attempts);
  return outcomes.length === 4
    && outcomes.map((row) => row.outcome).join(",") === "accepted,same_receipt,quarantined_conflict,held_gap"
    && outcomes.reduce((sum, row) => sum + row.projected, 0) === 1;
}

function validCrashReplay(packet) {
  return sameSet(packet.session_fixture.crash_stages, [
    "before_send", "after_server_commit_before_ack", "after_ack_before_compact",
  ]);
}

function validAuthRaces(packet) {
  const states = packet.session_fixture.auth_race_states;
  return sameSet(states, ["disabled_during_body", "reassigned_during_body", "revoked_during_body", "spoofed_node"])
    && states.every((state) => state !== "active");
}

function validOutboxLifecycle(packet) {
  return packet.session_fixture.outbox_states.join(",") === "pending,verified_server_ack,compacted";
}

function validMissingCase(packet) {
  const value = packet.session_fixture.missing_case;
  return !value.accepted_start_exists && value.local_pending && !value.server_missing_closeout && !value.states_treated_equal;
}

function validHandoffCase(packet) {
  const value = packet.session_fixture.handoff_case;
  const terminalFollowupOutcome = value.old_terminal_followup_requested ? "rejected" : "not_requested";
  return !value.old_binding_overwrite_requested
    && terminalFollowupOutcome === "rejected"
    && value.new_session_chain_linked;
}

function validTaskSeparation(packet) {
  const requests = packet.session_fixture.task_event_requests;
  return sameSet(requests.map((entry) => entry.kind), ["checkpoint", "closeout", "completion_proposal"])
    && requests.every((entry) => entry.requested_task_delta === 0);
}

function validOfficialCompletion(packet) {
  const value = packet.session_fixture.official_completion;
  return value.writer === "authorized_task_coordinator"
    && value.expected_revision_matched
    && value.requested_event_count === 1;
}

function validProposalKinds(packet) {
  return sameSet(packet.session_fixture.proposal_kinds, ["knowledge_candidate", "knowledge_memo", "task_completion"]);
}

function validSessionPrivateBoundary(packet) {
  const value = packet.session_fixture.private_boundary;
  return value.opaque_thread_digest_only && !value.raw_fields_copied && !value.foreign_existence_disclosed;
}

function validOutageCase(packet) {
  const value = packet.session_fixture.outage_case;
  return !value.hpp_available
    && !value.remote_mount_attempted
    && !value.split_writer_attempted
    && value.ack_replay_digest_matches;
}

const CHECKS = deepFreeze([
  ["HP-STORAGE-01", "storage_owner_map_bound", (p) => p.storage.project_common_separated && p.storage.project_owner_class !== p.storage.common_owner_class],
  ["HP-STORAGE-02", "metadata_only_boundaries", (p) => p.storage.project_metadata_only && p.storage.system_metadata_only],
  ["HP-STORAGE-03", "all_consumers_bound", (p) => sameSet(p.storage.consumers, ["answer", "index", "review", "trace", "work_card"])],
  ["HP-STORAGE-04", "single_task_truth_owner", (p) => p.storage.task_truth_owner === "dev_erp_transaction_coordinator" && !p.storage.second_task_truth_allowed],
  ["HP-STORAGE-05", "system_rag_metadata_only", (p) => p.storage.system_metadata_only],
  ["HP-STORAGE-06", "hwpx_derivative_only", (p) => !p.storage.hwp_direct_parse_allowed && p.storage.hwpx_derivative_required],
  ["HP-STORAGE-07", "source_original_preserved", (p) => !p.storage.source_original_delete_allowed],
  ["HP-STORAGE-08", "logical_topology_unchanged", (p) => p.storage.logical_topology_unchanged && p.profile.public_safe && p.profile.pathless && p.profile.synthetic && p.profile.feature_mode === "off" && sameSet(p.baseline_refs, EXPECTED_BASELINE_REFS)],
  ["HP-STORAGE-09", "runtime_excluded_from_cloud_sync", (p) => !p.storage.cloud_sync_runtime_allowed && p.storage.custody_owner === "hpp_custody"],
  ["HP-STORAGE-10", "non_hpp_direct_storage_blocked", (p) => !p.storage.non_hpp_direct_storage_allowed && !p.storage.direct_smb_allowed && !p.storage.direct_sqlite_allowed && p.storage.client_access_surface === "mcp_api_receipt_only"],

  ["HP-INGRESS-01", "logical_custody_matrix_bound", (p) => p.ingress.custody_matrix_complete && p.ingress.physical_binding_state === "verify_hp_hold" && sameSet(p.ingress.source_kinds, EXPECTED_SOURCE_KINDS) && validCustodyMatrix(p)],
  ["HP-INGRESS-02", "mail_classifier_payload_write_zero", (p) => !p.ingress.mail_classifier_payload_write_allowed],
  ["HP-INGRESS-03", "upload_receipt_claim_ceiling", (p) => !p.ingress.upload_receipt_promotes_project && !p.ingress.upload_receipt_creates_artifact_revision && !p.ingress.upload_receipt_writes_knowledge_or_task],
  ["HP-INGRESS-04", "operation_matrix_fail_closed", (p) => p.ingress.default_operation === "reference" && sameSet(p.ingress.approved_operations, ["copy", "derive", "reference"]) && p.ingress.explicit_approval_required && !p.ingress.move_allowed && !p.ingress.delete_allowed],
  ["HP-INGRESS-05", "promotion_idempotency_conflict", (p) => p.ingress.same_operation_same_digest === "same_receipt" && p.ingress.same_operation_different_digest === "quarantine" && validFinalizeFixture(p)],
  ["HP-INGRESS-06", "required_scan_not_overclaimed", (p) => p.ingress.required_scan_missing_or_failed_blocks && !p.ingress.extension_or_hash_counts_as_scan && p.ingress.blocked_type_quarantined],
  ["HP-INGRESS-07", "ingress_authority_separated", (p) => p.ingress.promoter_separate_from_other_writers && p.storage.transfer_writer === "hpp_transfer_service" && p.storage.binding_writer === "hpp_promoter" && p.storage.history_writer === "hpp_project_history_projector" && new Set([p.storage.transfer_writer, p.storage.binding_writer, p.storage.history_writer, p.storage.task_truth_owner]).size === 4],
  ["HP-INGRESS-08", "public_pathless_raw_boundary", (p) => p.profile.public_safe && p.profile.pathless && p.profile.synthetic && p.profile.feature_mode === "off"],
  ["HP-INGRESS-09", "source_policy_refs_bound", (p) => sameSet(p.ingress.policy_refs, ["acl_policy_synth", "backup_policy_synth", "retention_policy_synth", "scan_policy_synth"]) && sameSet(p.prerequisite_refs, EXPECTED_PREREQUISITE_REFS) && approvalWindow(p)],
  ["HP-INGRESS-10", "rollback_preserves_accepted_state", (p) => p.ingress.source_custody_preserved_on_rollback && p.ingress.prior_binding_restored_on_rollback && p.ingress.accepted_parity_required_for_current],
  ["HP-INGRESS-11", "ticket_actor_object_binding_exact", (p) => distinctActorChain(p.actor_chain) && !p.ingress.url_is_bearer_authority && validTicket(p)],
  ["HP-INGRESS-12", "ticket_replay_finalize_revoke_closed", (p) => p.ingress.ticket_replay_policy === "same_digest_noop_or_reject" && p.ingress.finalize_idempotent && !p.ingress.revoke_before_commit_accepts_mutation && validFinalizeFixture(p)],
  ["HP-INGRESS-13", "mtls_office_lan_boundary", (p) => p.ingress.control_plane === "mcp" && p.ingress.binary_plane === "mtls_https" && p.access.transport.mtls_required && p.access.transport.network_scope === "strict_private_office_lan" && !p.ingress.public_ingress_allowed && !p.ingress.remote_network_allowed && !p.ingress.port_forward_allowed && !p.ingress.client_selected_destination_allowed && !p.ingress.traversal_allowed && validTransportFixture(p)],
  ["HP-INGRESS-14", "content_adversarial_quarantine", (p) => p.ingress.archive_bomb_quarantined && p.ingress.blocked_type_quarantined && p.ingress.hash_size_media_match_required && validContentCases(p)],
  ["HP-INGRESS-15", "exact_revision_range_hash", (p) => p.ingress.exact_revision_only && p.ingress.range_resume_bounded && p.ingress.reassembled_hash_required && !p.ingress.latest_revision_fallback_allowed && !p.ingress.source_fallback_allowed && validDownloadFixture(p)],
  ["HP-INGRESS-16", "hpp_sole_binary_binding_writers", (p) => p.storage.transfer_writer === "hpp_transfer_service" && p.storage.binding_writer === "hpp_promoter" && p.storage.history_writer === "hpp_project_history_projector" && !p.ingress.client_binary_write_allowed && !p.ingress.projector_binding_write_allowed],

  ["HP-SESSION-01", "start_bind_atomic", (p) => p.work_session.start_bind_atomic && validSessionStarts(p)],
  ["HP-SESSION-02", "one_active_primary", (p) => p.work_session.one_active_primary_per_assignment_account && p.work_session.second_start_policy === "same_receipt_or_409" && validSessionStarts(p)],
  ["HP-SESSION-03", "event_chain_idempotent", (p) => p.work_session.same_event_digest_policy === "same_receipt" && p.work_session.changed_event_digest_policy === "quarantine" && !p.work_session.gap_projection_allowed && validSessionEvents(p)],
  ["HP-SESSION-04", "auth_race_fail_closed", (p) => p.work_session.auth_race_fail_closed && validAuthRaces(p)],
  ["HP-SESSION-05", "crash_replay_durable_receipt", (p) => p.work_session.durable_receipt_recovery && p.work_session.ack_replay_same_receipt && validCrashReplay(p)],
  ["HP-SESSION-06", "ack_before_compact", (p) => !p.work_session.compact_before_verified_ack_allowed && validOutboxLifecycle(p)],
  ["HP-SESSION-07", "missing_semantics_separated", (p) => p.work_session.accepted_start_required_for_missing && !p.work_session.local_pending_equals_server_missing && validMissingCase(p)],
  ["HP-SESSION-08", "handoff_supersession_append_only", (p) => !p.work_session.handoff_overwrites_old_binding && !p.work_session.old_terminal_followup_write_allowed && p.work_session.new_session_chain_preserved && validHandoffCase(p)],
  ["HP-SESSION-09", "session_events_do_not_mutate_task", (p) => !p.work_session.checkpoint_task_mutation_allowed && !p.work_session.closeout_task_mutation_allowed && !p.work_session.proposal_task_mutation_allowed && validTaskSeparation(p)],
  ["HP-SESSION-10", "official_completion_separate", (p) => p.work_session.official_completion_writer === "authorized_task_coordinator" && p.work_session.official_completion_event_count === 1 && validOfficialCompletion(p)],
  ["HP-SESSION-11", "proposal_kinds_separated", (p) => p.work_session.proposal_kinds_separated && validProposalKinds(p)],
  ["HP-SESSION-12", "thread_and_existence_private", (p) => p.work_session.thread_representation === "opaque_digest_only" && p.work_session.foreign_existence_safe && p.profile.pathless && validSessionPrivateBoundary(p)],
  ["HP-SESSION-13", "actor_chain_complete_distinct", (p) => distinctActorChain(p.actor_chain) && validTicket(p) && validUtc(p.actor_chain.expires_at)],
  ["HP-SESSION-14", "delegation_intersection_earliest_expiry", (p) => delegationCeiling(p)],
  ["HP-SESSION-15", "revoke_cascade_closed", (p) => p.access.delegation.cascade_revoke && !p.access.delegation.refresh_after_revoke_allowed && !p.access.delegation.child_grant_after_revoke_allowed && !p.access.delegation.ticket_after_revoke_allowed && !p.access.delegation.protected_mutation_after_revoke_allowed && approvalWindow(p) && validFinalizeFixture(p) && validEnrollmentFixture(p) && validTransportFixture(p) && validBrokerFixture(p)],
  ["HP-SESSION-16", "trusted_device_silent_refresh", (p) => p.access.enrollment.one_time && p.access.transport.enrolled_device_required && p.access.broker.storage_class === "os_protected" && p.access.broker.routine_silent_refresh && !p.access.broker.routine_human_prompt_required && validEnrollmentFixture(p) && validTransportFixture(p) && validBrokerFixture(p)],
  ["HP-SESSION-17", "step_up_boundary_exact", (p) => p.access.enrollment.recovery_requires_step_up && p.access.enrollment.new_device_requires_step_up && sameSet(p.access.step_up_actions, EXPECTED_STEP_UP) && validBrokerFixture(p)],
  ["HP-SESSION-18", "outage_hold_no_split_writer", (p) => p.work_session.outage_mode === "local_hold_last_accepted_read_only" && !p.work_session.remote_mount_allowed && !p.work_session.split_writer_allowed && p.work_session.ack_replay_same_receipt && validOutageCase(p) && validCrashReplay(p)],

  ["HP-QUERY-01", "explicit_scope_acl_existence_safe", (p) => sameSet(p.query.scopes, ["common", "project"]) && p.query.explicit_scope_required && p.query.foreign_existence_safe && validExistenceCases(p)],
  ["HP-QUERY-02", "implicit_fallback_zero", (p) => !p.query.implicit_fallback_allowed],
  ["HP-QUERY-03", "accepted_generation_only", (p) => p.query.accepted_generation_only && !p.query.stale_generation_mutation_allowed && p.query.previous_generation_preserved_on_failure],
  ["HP-QUERY-04", "api_file_parity_no_reverse_import", (p) => p.query.api_file_parity_required && !p.query.reverse_import_allowed],
  ["HP-QUERY-05", "knowledge_provenance_exact", (p) => sameSet(p.query.knowledge_provenance_fields, ["claim_ceiling", "content_ref", "locator_ref", "revision_id", "scope"])],
  ["HP-QUERY-06", "fuzzy_result_not_accepted", (p) => !p.query.fuzzy_result_acceptance_allowed],
  ["HP-QUERY-07", "read_business_mutation_zero", (p) => !p.query.read_business_mutation_allowed],
  ["HP-QUERY-08", "candidate_ledger_only", (p) => p.query.candidate_write_surface === "candidate_ledger_only" && !p.query.direct_truth_write_allowed],
  ["HP-QUERY-09", "stronger_claim_rejected", (p) => p.query.stronger_claim_request_policy === "reject_422"],
  ["HP-QUERY-10", "generation_pinned_cursor", (p) => p.query.generation_pinned_cursor],
  ["HP-QUERY-11", "ui_mcp_typed_digest_equal", (p) => p.query.ui_mcp_typed_digest_equal],
  ["HP-QUERY-12", "uniform_artifact_revision_action_existence", (p) => p.query.uniform_existence_policy && p.query.foreign_existence_safe && validExistenceCases(p) && validTicket(p)],
  ["HP-QUERY-13", "rag_pre_post_locator_acl", (p) => p.query.rag_prefilter_required && p.query.rag_postfilter_required && p.query.locator_acl_required && validRagCases(p)],
  ["HP-QUERY-14", "cache_revoke_bound", (p) => sameSet(p.query.cache_key_fields, ["acl_revision", "policy_revision", "source_revision"]) && !p.query.stale_cache_after_revoke_allowed && validCacheCases(p)],
  ["HP-QUERY-15", "immutable_redacted_derivative_lineage", (p) => sameSet(p.query.derivative_policy_fields, ["comments_notes", "embedded_objects", "formulas", "hidden_sheets_slides"]) && p.query.derivative_immutable && p.query.exact_source_lineage_required && !p.query.source_fallback_allowed && validRedactedDerivative(p)],
  ["HP-QUERY-16", "exact_download_manifest_and_ticket", (p) => SHA256.test(p.query.exact_download_manifest_digest) && p.query.exact_download_manifest_digest === SYNTHETIC_MANIFEST_DIGEST && p.ingress.exact_revision_only && p.ingress.reassembled_hash_required && !p.query.download_audience_method_revision_swap_allowed && validDownloadFixture(p) && validTicket(p)],
]);

export const A8_SYNTH_CHECK_IDS = Object.freeze(CHECKS.map(([id]) => id));

export function createA8SynthPacketFixture() {
  return structuredClone(PUBLIC_SYNTHETIC_PACKET);
}

export function digestA8SynthPacket(packet) {
  return digestValue(packet, "packet-v1");
}

function validatePacket(packet) {
  enforceSentinels(packet, PUBLIC_SYNTHETIC_PACKET);
  validateShape(packet, PUBLIC_SYNTHETIC_PACKET);
  if (packet.schema_version !== PACKET_SCHEMA || !SAFE_REF.test(packet.packet_id)) invalid();
  if (!packet.profile.public_safe || !packet.profile.pathless || !packet.profile.synthetic
    || packet.profile.feature_mode !== "off") invalid("profile_invalid");
  if (!sameSet(packet.baseline_refs, EXPECTED_BASELINE_REFS)
    || !sameSet(packet.prerequisite_refs, EXPECTED_PREREQUISITE_REFS)) invalid("prerequisite_invalid");
  if (packet.external_approval_binding.binding_state !== "synthetic_fixture_only"
    || packet.external_approval_binding.owner_acceptance !== false) invalid("approval_binding_invalid");
  for (const key of ["evaluation_time"]) if (!validUtc(packet[key])) invalid("timestamp_invalid");
  for (const key of ["issued_at", "expires_at"]) {
    if (!validUtc(packet.external_approval_binding[key])) invalid("timestamp_invalid");
  }
  if (packet.external_approval_binding.revoked_at_or_none !== "none"
    && !validUtc(packet.external_approval_binding.revoked_at_or_none)) invalid("timestamp_invalid");
  if (!validUtc(packet.actor_chain.expires_at)) invalid("timestamp_invalid");
  for (const value of packet.access.delegation.parent_expiries) if (!validUtc(value)) invalid("timestamp_invalid");
  for (const key of ["child_requested_expiry", "effective_expiry"]) {
    if (!validUtc(packet.access.delegation[key])) invalid("timestamp_invalid");
  }
  if (!SHA256.test(packet.query.exact_download_manifest_digest)) invalid("digest_invalid");
  if (!SHA256.test(packet.transfer_fixture.ticket.content_hash)) invalid("digest_invalid");
  for (const attempt of packet.transfer_fixture.finalize_attempts) {
    if (!SHA256.test(attempt.content_hash)) invalid("digest_invalid");
  }
  for (const range of packet.transfer_fixture.download.ranges) {
    if (!SHA256.test(range.range_hash)) invalid("digest_invalid");
  }
}

function zeroAuthorityEffect() {
  return {
    d27_owner_accepted: false,
    d28_owner_accepted: false,
    d29_owner_accepted: false,
    security_packet_owner_accepted: false,
    owner_approval_created: false,
    writer_authority_created: false,
    verify_hp_resolved: false,
    p0_p10_unlocks: [],
    task_engine_unlocked: false,
    a8_canary_unlocked: false,
    bulk_activation_unlocked: false,
    team_activation_unlocked: false,
    production_activation_unlocked: false,
  };
}

function zeroLiveEffect() {
  return {
    live_binding_created: false,
    live_data_read: false,
    live_endpoint_called: false,
    network_opened: false,
    database_opened: false,
    private_binding_read: false,
    physical_path_discovered: false,
  };
}

function zeroWriteEffect() {
  return {
    filesystem_written: false,
    payload_written: false,
    binding_written: false,
    task_written: false,
    history_written: false,
    knowledge_written: false,
    pointer_advanced: false,
    source_moved_or_deleted: false,
  };
}

function zeroSideEffectCounts() {
  return {
    filesystem_writes: 0,
    network_calls: 0,
    sqlite_opens: 0,
    child_processes: 0,
    live_data_reads: 0,
    authority_mutations: 0,
  };
}

function categoryFor(id) {
  return id.slice(3, id.lastIndexOf("-"));
}

function summarizeCategories(checks) {
  return ["STORAGE", "INGRESS", "SESSION", "QUERY"].map((category) => {
    const rows = checks.filter((row) => categoryFor(row.id) === category);
    const failed = rows.filter((row) => row.verdict === "FAIL").length;
    return {
      category,
      total: rows.length,
      passed: rows.length - failed,
      failed,
      category_digest: digestValue(rows.map(({ id, verdict }) => ({ id, verdict })), `category-${category.toLowerCase()}-v1`),
    };
  });
}

export function verifyA8SynthSecureAccess(packet, approvedPacketDigest) {
  validatePacket(packet);
  if (!SHA256.test(approvedPacketDigest)) invalid("approved_digest_invalid");
  const packetDigest = digestA8SynthPacket(packet);
  if (packetDigest !== approvedPacketDigest) digestMismatch();

  const checks = CHECKS.map(([id, passCode, predicate]) => {
    let passed = false;
    try { passed = predicate(packet) === true; } catch { passed = false; }
    return {
      id,
      verdict: passed ? "PASS" : "FAIL",
      reason_code: passed ? passCode : `${id.toLowerCase().replaceAll("-", "_")}_contract_violation`,
      fixture_source: "public_pathless_computed_fixture",
    };
  });
  const failedIds = checks.filter((row) => row.verdict === "FAIL").map((row) => row.id);
  const passed = checks.length - failedIds.length;
  const result = failedIds.length === 0 ? "PASS" : "FAIL";
  const suiteDescriptor = CHECKS.map(([id, passCode]) => ({ id, pass_code: passCode, category: categoryFor(id) }));
  const outputBody = {
    schema_version: OUTPUT_SCHEMA,
    result,
    evaluation_time: packet.evaluation_time,
    packet_id: packet.packet_id,
    packet_digest: packetDigest,
    approved_packet_digest: approvedPacketDigest,
    approved_packet_digest_match: true,
    baseline_refs: [...packet.baseline_refs],
    prerequisite_refs: [...packet.prerequisite_refs],
    external_approval_binding: { ...packet.external_approval_binding },
    policy_digest: digestValue({
      baseline_refs: packet.baseline_refs,
      prerequisite_refs: packet.prerequisite_refs,
      profile: packet.profile,
      external_approval_binding: packet.external_approval_binding,
      access: packet.access,
      storage: packet.storage,
      ingress: packet.ingress,
      work_session: packet.work_session,
      query: packet.query,
    }, "policy-v1"),
    suite_digest: digestValue(suiteDescriptor, "suite-definition-v1"),
    effective_expires_at: effectiveExpiry(packet),
    profile: { ...packet.profile },
    checks,
    category_summaries: summarizeCategories(checks),
    coverage: {
      expected_total: 60,
      observed_total: checks.length,
      complete: checks.length === 60 && new Set(checks.map((row) => row.id)).size === 60,
      exact_check_ids: checks.map((row) => row.id),
      coverage_digest: digestValue(checks.map((row) => row.id), "coverage-v1"),
    },
    summary: {
      total: checks.length,
      passed,
      failed: failedIds.length,
      failed_ids: failedIds,
      check_set_digest: digestValue(checks.map(({ id, verdict }) => ({ id, verdict })), "check-results-v1"),
    },
    authority_effect: zeroAuthorityEffect(),
    live_effect: zeroLiveEffect(),
    write_effect: zeroWriteEffect(),
    side_effect_counts: zeroSideEffectCounts(),
    raw_sentinel_violations: [],
  };
  return canonicalize({ ...outputBody, receipt_digest: digestValue(outputBody, "receipt-v1") });
}

function parseCli(argv) {
  const switches = new Set(["--synthetic", "--feature-off", "--json"]);
  const valued = new Set(["--packet", "--approved-packet-digest"]);
  const seen = new Set();
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if ((!switches.has(flag) && !valued.has(flag)) || seen.has(flag)) invalid("cli_invalid");
    seen.add(flag);
    if (valued.has(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) invalid("cli_invalid");
      parsed[flag] = value;
    }
  }
  if ([...switches, ...valued].some((flag) => !seen.has(flag)) || argv.length !== 7) invalid("cli_invalid");
  const packetPath = parsed["--packet"];
  if (!/\.json$/i.test(packetPath)
    || /[*?\[\]{}!\u0000\r\n]/.test(packetPath)
    || /^(?:-|stdin|default)$/i.test(packetPath)
    || /:\/\//.test(packetPath)
    || isAbsolute(packetPath)
    || /^(?:\\\\|\/\/|\\\\[.?]\\)/.test(packetPath)
    || packetPath.includes(":")
    || packetPath.split(/[\\/]+/).some((part) => part === "..")) invalid("literal_packet_required");
  if (!SHA256.test(parsed["--approved-packet-digest"])) invalid("approved_digest_invalid");
  return { packetPath, approvedPacketDigest: parsed["--approved-packet-digest"] };
}

function rejectEnvironment(environment) {
  if (Object.keys(environment).some((key) => /^(?:A8_SYNTH|SOULFORGE_A8_SYNTH)(?:_|$)/i.test(key))) {
    invalid("environment_input_forbidden");
  }
}

function errorEnvelope(error) {
  const exitCode = error instanceof A8SynthError ? error.exitCode : 6;
  const reasonByExit = {
    2: "packet_or_cli_invalid",
    3: "approved_packet_digest_mismatch",
    5: "raw_path_secret_sentinel",
    6: "packet_read_failed",
  };
  return {
    exitCode,
    output: compactCanonical({
      schema_version: ERROR_SCHEMA,
      result: "BLOCKED",
      exit_code: exitCode,
      reason_code: reasonByExit[exitCode] ?? reasonByExit[6],
      profile: {
        public_safe: true,
        pathless: true,
        synthetic: true,
        feature_mode: "off",
      },
      authority_effect: zeroAuthorityEffect(),
      live_effect: zeroLiveEffect(),
      write_effect: zeroWriteEffect(),
      side_effect_counts: zeroSideEffectCounts(),
      raw_sentinel_violations: exitCode === 5 ? ["redacted_input_sentinel"] : [],
    }),
  };
}

export function runA8SynthSecureAccessCli(argv, environment = process.env, cwd = process.cwd()) {
  try {
    rejectEnvironment(environment);
    const { packetPath, approvedPacketDigest } = parseCli(argv);
    let source;
    try {
      const root = realpathSync(cwd);
      const candidate = resolve(root, packetPath);
      const candidateRelative = relative(root, candidate);
      if (!candidateRelative || candidateRelative.startsWith("..") || isAbsolute(candidateRelative)) invalid("literal_packet_required");
      const stat = lstatSync(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) invalid("literal_packet_required");
      if (stat.size > MAX_PACKET_BYTES) invalid("packet_too_large");
      const actual = realpathSync(candidate);
      const actualRelative = relative(root, actual);
      if (!actualRelative || actualRelative.startsWith("..") || isAbsolute(actualRelative)) invalid("literal_packet_required");
      source = readFileSync(actual, "utf8");
    } catch (error) {
      if (error instanceof A8SynthError) throw error;
      readFailure();
    }
    let packet;
    try { packet = JSON.parse(source); } catch { invalid("packet_json_invalid"); }
    const output = verifyA8SynthSecureAccess(packet, approvedPacketDigest);
    return { exitCode: output.result === "PASS" ? 0 : 4, output: compactCanonical(output) };
  } catch (error) {
    return errorEnvelope(error);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const result = runA8SynthSecureAccessCli(process.argv.slice(2));
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}
