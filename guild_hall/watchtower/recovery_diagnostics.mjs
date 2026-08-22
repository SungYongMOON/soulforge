// recovery_diagnostics.mjs — Watchtower pure recovery diagnostic classifier.
// Public-safe, pure module with zero path/raw/credential leaks.

export const RECOVERY_FAILURE_FAMILIES = Object.freeze([
  "scheduled_task_action_drift", "usage_event_duplicate_conflict",
  "standing_receipt_expired", "auth_refresh",
]);

export const RECOVERY_DIAGNOSTIC_CODES = Object.freeze([
  "task_action_path_drift", "usage_event_duplicate_conflict", "usage_event_conflict", "quarantine_applied",
  "cutover_receipt_expired", "writer_authority_expired", "backup_activation_expired",
  "auth_invalid_grant", "auth_token_revoked", "auth_mfa_required",
  "auth_consent_required", "auth_invalid_client", "auth_transient_retry",
  "auth_terminal_error", "auth_unknown_failure", "healthy", "healthy_idle",
]);

export const RECOVERY_DISPOSITIONS = Object.freeze([
  "auto_repairable", "owner_action_required", "quarantine_and_continue",
  "fail_closed_quiesce", "bounded_retry", "no_action_needed",
]);

export const RECOVERY_ACTION_CLASSES = Object.freeze([
  "safe_repair", "owner_gate", "bounded_retry", "none",
]);

export const RECOVERY_PROPOSED_ACTIONS = Object.freeze([
  "restart_owned_task", "revalidate_state", "refresh_projection", "bounded_retry",
  "owner_task_rebind", "owner_reauthorize", "owner_revalidate_receipt", "none",
]);

const ENVELOPE_KEYS = Object.freeze([
  "failure_family", "diagnostic_code", "disposition",
  "action_class", "proposed_action", "verification_requirements",
]);

const PROHIBITED_KEYS = /^(?:prompt|reasoning|tool_(?:input|output)|transcript(?:_path)?|session_path|source_path|cwd|token|password|passwd|cookie|credential|authorization|secret)$/iu;
const PROHIBITED_VALUE_PATTERNS = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+[A-Za-z0-9_.-]+|\b[A-Za-z]:[\\/]|^\/Users|^\/home|^\/tmp|^\/var|^\/private|file:\/\/)/iu;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertSanitized(value, key = null) {
  if (value === null || value === undefined) return;
  if (key !== null && PROHIBITED_KEYS.test(key)) fail("privacy_leak_rejected");
  if (typeof value === "string") {
    if (PROHIBITED_VALUE_PATTERNS.test(value)) fail("privacy_leak_rejected");
  } else if (Array.isArray(value)) {
    for (const item of value) assertSanitized(item);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertSanitized(v, k);
  }
}

function buildEnvelope({
  failureFamily,
  diagnosticCode,
  disposition,
  actionClass,
  proposedAction,
  verificationRequirements = [],
}) {
  if (!RECOVERY_FAILURE_FAMILIES.includes(failureFamily)) fail("invalid_failure_family");
  if (!RECOVERY_DIAGNOSTIC_CODES.includes(diagnosticCode)) fail("invalid_diagnostic_code");
  if (!RECOVERY_DISPOSITIONS.includes(disposition)) fail("invalid_disposition");
  if (!RECOVERY_ACTION_CLASSES.includes(actionClass)) fail("invalid_action_class");
  if (!RECOVERY_PROPOSED_ACTIONS.includes(proposedAction)) fail("invalid_proposed_action");
  if (!Array.isArray(verificationRequirements) || verificationRequirements.some((r) => typeof r !== "string" || !r)) {
    fail("invalid_verification_requirements");
  }

  const envelope = {
    failure_family: failureFamily,
    diagnostic_code: diagnosticCode,
    disposition,
    action_class: actionClass,
    proposed_action: proposedAction,
    verification_requirements: Object.freeze([...verificationRequirements]),
  };

  const keys = Object.keys(envelope);
  if (keys.length !== ENVELOPE_KEYS.length || !ENVELOPE_KEYS.every((k) => Object.hasOwn(envelope, k))) {
    fail("envelope_keys_invalid");
  }
  return Object.freeze(envelope);
}

function ownerGateEnvelope(failureFamily, diagnosticCode, proposedAction, verificationRequirements) {
  return buildEnvelope({
    failureFamily,
    diagnosticCode,
    disposition: "owner_action_required",
    actionClass: "owner_gate",
    proposedAction,
    verificationRequirements,
  });
}

function healthyEnvelope(failureFamily) {
  return buildEnvelope({
    failureFamily,
    diagnosticCode: "healthy",
    disposition: "no_action_needed",
    actionClass: "none",
    proposedAction: "none",
    verificationRequirements: [],
  });
}

const ALLOWED_INPUT_KEYS = Object.freeze({
  scheduled_task: new Set(["kind", "bound_digest", "observed_digest", "exists", "enabled", "state"]),
  usage_conflict: new Set(["kind", "conflict_count", "conflicted_event_ids", "clean_event_count", "persistence_verified", "recovery_receipt_present", "projection_verified"]),
  standing_receipt: new Set(["kind", "contract_id", "status", "category", "auto_renew_valid"]),
  auth_refresh: new Set(["kind", "error_code", "status", "retryable"]),
});

const TERMINAL_AUTH_CODES = Object.freeze({
  auth_invalid_grant: "auth_invalid_grant",
  invalid_grant: "auth_invalid_grant",
  auth_token_revoked: "auth_token_revoked",
  token_revoked: "auth_token_revoked",
  revoked: "auth_token_revoked",
  auth_consent_required: "auth_consent_required",
  consent_required: "auth_consent_required",
  auth_mfa_required: "auth_mfa_required",
  mfa_required: "auth_mfa_required",
  auth_invalid_client: "auth_invalid_client",
  invalid_client: "auth_invalid_client",
  unauthorized_client: "auth_invalid_client",
});

const TRANSIENT_AUTH_CODES = new Set([
  "auth_transient_retry",
  "transient_network",
  "timeout",
  "token_url_error",
  "token_http_429",
  "token_http_500",
  "token_http_502",
  "token_http_503",
  "token_http_504",
]);

const RECEIPT_CONTRACT_DESCRIPTORS = Object.freeze({
  voice_plaud_writer_cutover_receipt: {
    code: "cutover_receipt_expired",
    action: "owner_revalidate_receipt",
    requirements: [
      "source_writer_stopped",
      "source_process_count_zero",
      "source_service_disabled",
      "source_restart_disabled",
      "fresh_owner_cutover_receipt",
    ],
  },
  backup_controller_activation: {
    code: "backup_activation_expired",
    action: "owner_revalidate_receipt",
    requirements: ["quiesce_activation", "fresh_owner_activation_approval"],
  },
});

function classifyScheduledTask(evidence) {
  const { bound_digest, observed_digest, exists, enabled, state } = evidence;
  if (exists === true && enabled === true && typeof bound_digest === "string" && typeof observed_digest === "string") {
    if (bound_digest !== observed_digest) {
      return ownerGateEnvelope("scheduled_task_action_drift", "task_action_path_drift", "owner_task_rebind", [
        "exact_action_digest_match",
        "task_exists_and_enabled",
        "post_action_heartbeat",
      ]);
    }
    if (state === "ready" || state === "queued") {
      return buildEnvelope({
        failureFamily: "scheduled_task_action_drift",
        diagnosticCode: "healthy",
        disposition: "auto_repairable",
        actionClass: "safe_repair",
        proposedAction: "restart_owned_task",
        verificationRequirements: ["post_action_heartbeat", "fresh_producer_evidence"],
      });
    }
  }
  return ownerGateEnvelope("scheduled_task_action_drift", "task_action_path_drift", "owner_task_rebind", [
    "task_exists_and_enabled",
    "exact_action_digest_match",
  ]);
}

function classifyUsageConflict(evidence) {
  const conflictCount = Number.isSafeInteger(evidence.conflict_count) ? evidence.conflict_count : 0;
  if (conflictCount > 0) {
    if (evidence.persistence_verified !== true || evidence.projection_verified !== true || evidence.recovery_receipt_present !== true) {
      return ownerGateEnvelope("usage_event_duplicate_conflict", "usage_event_duplicate_conflict", "owner_revalidate_receipt", [
        "isolate_conflicting_groups",
        "persist_non_conflicting_events",
        "fresh_producer_evidence",
      ]);
    }
    return buildEnvelope({
      failureFamily: "usage_event_duplicate_conflict",
      diagnosticCode: "usage_event_duplicate_conflict",
      disposition: "quarantine_and_continue",
      actionClass: "none",
      proposedAction: "none",
      verificationRequirements: [
        "isolate_conflicting_groups",
        "persist_non_conflicting_events",
        "emit_quarantine_issue",
        "bounded_recovery_receipt",
        "healthy_with_backlog_projection",
      ],
    });
  }
  return healthyEnvelope("usage_event_duplicate_conflict");
}

function classifyStandingReceipt(evidence) {
  const { contract_id, status, category, auto_renew_valid } = evidence;
  if (status === "current" || status === "valid") {
    return healthyEnvelope("standing_receipt_expired");
  }
  if (contract_id === "ingress_writer_authority") {
    if (category === "same_authority_local_auto_renew" && auto_renew_valid === true) {
      return buildEnvelope({
        failureFamily: "standing_receipt_expired",
        diagnosticCode: "writer_authority_expired",
        disposition: "auto_repairable",
        actionClass: "safe_repair",
        proposedAction: "revalidate_state",
        verificationRequirements: ["local_authority_renewal", "fresh_writer_authority_receipt"],
      });
    }
    return ownerGateEnvelope("standing_receipt_expired", "writer_authority_expired", "owner_revalidate_receipt", [
      "writer_quiesced",
      "fresh_writer_authority_receipt",
    ]);
  }
  const desc = RECEIPT_CONTRACT_DESCRIPTORS[contract_id];
  if (desc) {
    return ownerGateEnvelope("standing_receipt_expired", desc.code, desc.action, desc.requirements);
  }
  return ownerGateEnvelope("standing_receipt_expired", "cutover_receipt_expired", "owner_revalidate_receipt", [
    "fresh_owner_receipt_revalidation",
  ]);
}

function classifyAuthRefresh(evidence) {
  const errorCode = typeof evidence.error_code === "string" ? evidence.error_code.toLowerCase() : "";
  const terminalCode = TERMINAL_AUTH_CODES[errorCode];
  if (terminalCode) {
    return ownerGateEnvelope("auth_refresh", terminalCode, "owner_reauthorize", [
      "zero_retries",
      "owner_reauthorization",
      "fresh_token_exchange",
    ]);
  }
  if (TRANSIENT_AUTH_CODES.has(errorCode) || evidence.retryable === true) {
    return buildEnvelope({
      failureFamily: "auth_refresh",
      diagnosticCode: "auth_transient_retry",
      disposition: "bounded_retry",
      actionClass: "bounded_retry",
      proposedAction: "bounded_retry",
      verificationRequirements: ["max_3_attempts", "exponential_backoff", "valid_access_token_or_circuit_open"],
    });
  }
  return ownerGateEnvelope("auth_refresh", "auth_unknown_failure", "owner_reauthorize", [
    "zero_retries",
    "owner_investigation",
  ]);
}

/**
 * Classify a sanitized recovery evidence observation into a standardized envelope.
 * Zero external authority, zero mutation.
 */
export function classifyRecoveryDiagnostic(sanitizedEvidence) {
  if (sanitizedEvidence === null || typeof sanitizedEvidence !== "object" || Array.isArray(sanitizedEvidence)) {
    fail("invalid_evidence_envelope");
  }
  assertSanitized(sanitizedEvidence);

  const kind = sanitizedEvidence.kind;
  const allowedKeys = ALLOWED_INPUT_KEYS[kind];
  if (!allowedKeys) fail("unsupported_evidence_kind");

  for (const key of Object.keys(sanitizedEvidence)) {
    if (!allowedKeys.has(key)) fail("unknown_input_key");
  }

  switch (kind) {
    case "scheduled_task":
      return classifyScheduledTask(sanitizedEvidence);
    case "usage_conflict":
      return classifyUsageConflict(sanitizedEvidence);
    case "standing_receipt":
      return classifyStandingReceipt(sanitizedEvidence);
    case "auth_refresh":
      return classifyAuthRefresh(sanitizedEvidence);
    default:
      fail("unsupported_evidence_kind");
  }
}
