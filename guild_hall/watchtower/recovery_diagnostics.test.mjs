import assert from "node:assert/strict";
import test from "node:test";

import { classifyRecoveryDiagnostic } from "./recovery_diagnostics.mjs";

const VALID_CASES = [
  {
    name: "scheduled_task_action_drift with owner_action_required",
    input: {
      kind: "scheduled_task",
      bound_digest: "a".repeat(64),
      observed_digest: "b".repeat(64),
      exists: true,
      enabled: true,
      state: "ready",
    },
    expected: {
      failure_family: "scheduled_task_action_drift",
      diagnostic_code: "task_action_path_drift",
      disposition: "owner_action_required",
      action_class: "owner_gate",
      proposed_action: "owner_task_rebind",
      verification_requirements: [
        "exact_action_digest_match",
        "task_exists_and_enabled",
        "post_action_heartbeat",
      ],
    },
  },
  {
    name: "usage_event_duplicate_conflict with quarantine_and_continue",
    input: {
      kind: "usage_conflict",
      conflict_count: 2,
      clean_event_count: 10,
      persistence_verified: true,
      recovery_receipt_present: true,
      projection_verified: true,
    },
    expected: {
      failure_family: "usage_event_duplicate_conflict",
      diagnostic_code: "usage_event_duplicate_conflict",
      disposition: "quarantine_and_continue",
      action_class: "none",
      proposed_action: "none",
      verification_requirements: [
        "isolate_conflicting_groups",
        "persist_non_conflicting_events",
        "emit_quarantine_issue",
        "bounded_recovery_receipt",
        "healthy_with_backlog_projection",
      ],
    },
  },
  {
    name: "usage_event_duplicate_conflict unverified persistence requires owner action",
    input: {
      kind: "usage_conflict",
      conflict_count: 2,
      clean_event_count: 10,
      persistence_verified: false,
    },
    expected: {
      failure_family: "usage_event_duplicate_conflict",
      diagnostic_code: "usage_event_duplicate_conflict",
      disposition: "owner_action_required",
      action_class: "owner_gate",
      proposed_action: "owner_revalidate_receipt",
      verification_requirements: [
        "isolate_conflicting_groups",
        "persist_non_conflicting_events",
        "fresh_producer_evidence",
      ],
    },
  },
  {
    name: "usage_event_duplicate_conflict with missing evidence fields requires owner action",
    input: {
      kind: "usage_conflict",
      conflict_count: 2,
      clean_event_count: 10,
    },
    expected: {
      failure_family: "usage_event_duplicate_conflict",
      diagnostic_code: "usage_event_duplicate_conflict",
      disposition: "owner_action_required",
      action_class: "owner_gate",
      proposed_action: "owner_revalidate_receipt",
      verification_requirements: [
        "isolate_conflicting_groups",
        "persist_non_conflicting_events",
        "fresh_producer_evidence",
      ],
    },
  },
  {
    name: "valid standing receipt as healthy no_action_needed",
    input: { kind: "standing_receipt", contract_id: "voice_plaud_writer_cutover_receipt", status: "current" },
    expected: {
      failure_family: "standing_receipt_expired",
      diagnostic_code: "healthy",
      disposition: "no_action_needed",
      action_class: "none",
      proposed_action: "none",
      verification_requirements: [],
    },
  },
  {
    name: "auto-renewable writer authority as auto_repairable",
    input: {
      kind: "standing_receipt",
      contract_id: "ingress_writer_authority",
      status: "expired",
      category: "same_authority_local_auto_renew",
      auto_renew_valid: true,
    },
    expected: {
      failure_family: "standing_receipt_expired",
      diagnostic_code: "writer_authority_expired",
      disposition: "auto_repairable",
      action_class: "safe_repair",
      proposed_action: "revalidate_state",
      verification_requirements: ["local_authority_renewal", "fresh_writer_authority_receipt"],
    },
  },
  {
    name: "owner-required writer authority as owner_action_required",
    input: {
      kind: "standing_receipt",
      contract_id: "ingress_writer_authority",
      status: "expired",
      category: "owner_revalidation_required",
      auto_renew_valid: false,
    },
    expected: {
      failure_family: "standing_receipt_expired",
      diagnostic_code: "writer_authority_expired",
      disposition: "owner_action_required",
      action_class: "owner_gate",
      proposed_action: "owner_revalidate_receipt",
      verification_requirements: ["writer_quiesced", "fresh_writer_authority_receipt"],
    },
  },
  {
    name: "standing_receipt_expired PLAUD cutover",
    input: { kind: "standing_receipt", contract_id: "voice_plaud_writer_cutover_receipt", status: "expired" },
    expected: {
      failure_family: "standing_receipt_expired",
      diagnostic_code: "cutover_receipt_expired",
      disposition: "owner_action_required",
      action_class: "owner_gate",
      proposed_action: "owner_revalidate_receipt",
      verification_requirements: [
        "source_writer_stopped",
        "source_process_count_zero",
        "source_service_disabled",
        "source_restart_disabled",
        "fresh_owner_cutover_receipt",
      ],
    },
  },
  {
    name: "auth_refresh terminal error auth_invalid_grant",
    input: { kind: "auth_refresh", error_code: "auth_invalid_grant" },
    expected: {
      failure_family: "auth_refresh",
      diagnostic_code: "auth_invalid_grant",
      disposition: "owner_action_required",
      action_class: "owner_gate",
      proposed_action: "owner_reauthorize",
      verification_requirements: ["zero_retries", "owner_reauthorization", "fresh_token_exchange"],
    },
  },
  {
    name: "auth_refresh transient error with bounded_retry",
    input: { kind: "auth_refresh", error_code: "auth_transient_retry", retryable: true },
    expected: {
      failure_family: "auth_refresh",
      diagnostic_code: "auth_transient_retry",
      disposition: "bounded_retry",
      action_class: "bounded_retry",
      proposed_action: "bounded_retry",
      verification_requirements: ["max_3_attempts", "exponential_backoff", "valid_access_token_or_circuit_open"],
    },
  },
];

const REJECTION_CASES = [
  { name: "privacy leak token", input: { kind: "auth_refresh", token: "secret_value" }, error: /privacy_leak_rejected/ },
  { name: "privacy leak raw path", input: { kind: "scheduled_task", raw_path: "C:\\Windows\\System32" }, error: /privacy_leak_rejected/ },
  { name: "unsupported kind", input: { kind: "unknown_kind" }, error: /unsupported_evidence_kind/ },
  { name: "extra input key", input: { kind: "auth_refresh", error_code: "auth_invalid_grant", extra: 123 }, error: /unknown_input_key/ },
];

test("recovery_diagnostics table-driven valid classification assertions", () => {
  for (const { name, input, expected } of VALID_CASES) {
    const actual = classifyRecoveryDiagnostic(input);
    assert.deepEqual(actual, expected, `Failed for case: ${name}`);
  }
});

test("recovery_diagnostics table-driven rejection assertions", () => {
  for (const { name, input, error } of REJECTION_CASES) {
    assert.throws(() => classifyRecoveryDiagnostic(input), error, `Failed for case: ${name}`);
  }
});
