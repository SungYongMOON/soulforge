// internal_receipt_catalog.mjs — Watchtower internal time-bound receipt contract catalog and evaluator.
// Public-safe, pure module with zero path/raw/credential leaks.

export const RECEIPT_CLASSIFICATIONS = Object.freeze({
  SAME_AUTHORITY_LOCAL_AUTO_RENEW: "same_authority_local_auto_renew",
  OWNER_REVALIDATION_REQUIRED: "owner_revalidation_required",
  ON_DEMAND_EPHEMERAL_EXCLUDED: "on_demand_ephemeral_excluded",
  EXTERNAL_AUTH_EXCLUDED: "external_auth_excluded",
});

export const RECEIPT_RENEWAL_GOVERNANCE = Object.freeze({
  SAME_AUTHORITY_LOCAL_POLICY: "same_authority_local_policy",
  OWNER_REVALIDATION_REQUIRED: "owner_revalidation_required",
  NONE: "none",
});

export const RECEIPT_HEALTH_STATUSES = Object.freeze({
  CURRENT: "current",
  WARNING: "warning",
  CRITICAL: "critical",
  EXPIRED: "expired",
  INVALID: "invalid",
  UNKNOWN: "unknown",
});

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

const RAW_CONTRACT_CATALOG = [
  // 1. Standing Runtime-Blocking Receipts: same_authority_local_auto_renew
  {
    contract_id: "ingress_writer_authority",
    schema_version: "soulforge.ingress.writer_authority.v1",
    source_ref: "guild_hall/ingress/writer_authority.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.SAME_AUTHORITY_LOCAL_AUTO_RENEW,
    standing_runtime_blocking: true,
    time_field: "expires_at",
    owner: "ingress_writer_owner",
    warning_window_seconds: 259_200, // 72 hours canonical
    critical_window_seconds: 86_400,  // 24 hours canonical
    next_action_on_warning_or_expiry: "Local writer authority renewal policy will extend active primary writer prior to expiry if same authority conditions hold.",
  },

  // 2. Standing Runtime-Blocking Receipts: owner_revalidation_required
  {
    contract_id: "voice_plaud_writer_cutover_receipt",
    schema_version: "soulforge.voice.plaud_writer_cutover_receipt.v1",
    source_ref: "guild_hall/voice_capture/plaud_writer_cutover_receipt.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.OWNER_REVALIDATION_REQUIRED,
    standing_runtime_blocking: true,
    time_field: "valid_until",
    owner: "plaud_source_owner",
    warning_window_seconds: null, // Binding-owned
    critical_window_seconds: null, // Binding-owned
    next_action_on_warning_or_expiry: "Provide fresh PLAUD cutover receipt with renewed valid_until from source owner observation.",
  },
  {
    contract_id: "backup_controller_activation",
    schema_version: "soulforge.backup_controller.activation.v1",
    source_ref: "guild_hall/backup_controller/activation.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.OWNER_REVALIDATION_REQUIRED,
    standing_runtime_blocking: true,
    time_field: "expires_at",
    owner: "backup_controller_owner",
    warning_window_seconds: null, // Binding-owned
    critical_window_seconds: null, // Binding-owned
    next_action_on_warning_or_expiry: "Revalidate backup controller activation receipt with Owner approval before activation window expires.",
  },

  // 3. Excluded: on_demand_ephemeral_excluded
  {
    contract_id: "five_field_cursor_runner_input",
    schema_version: "soulforge.five_field_cursor_runner_input.v4",
    source_ref: ".workflow/five_field_session_capture_v0/tools/five_field_cursor_runner.mjs",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "session_runner_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "five_field_runtime_preflight_input",
    schema_version: "soulforge.five_field_runtime_preflight_input.v2",
    source_ref: ".workflow/five_field_session_capture_v0/tools/five_field_runtime_preflight.mjs",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "session_runner_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "linear_lb1_owner_gate_v1",
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_packet.v1",
    source_ref: "guild_hall/backup_controller/linear_lb1_owner_gate.mjs",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at_utc",
    owner: "backup_controller_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "linear_lb1_owner_gate_v2",
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_packet.v2",
    source_ref: "guild_hall/backup_controller/linear_lb1_owner_gate_v2.mjs",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at_utc",
    owner: "backup_controller_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "task_engine_inventory_c00b_receipt",
    schema_version: "soulforge.task_engine_inventory_c00b_receipt.v1",
    source_ref: "ui-workspace/apps/dev-erp/docs/contracts/task_engine_inventory_c00b_receipt.v1.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "effective_expires_at",
    owner: "task_engine_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "task_engine_inventory_c00b_binding_input",
    schema_version: "soulforge.task_engine_inventory_c00b_binding_input.v1",
    source_ref: "ui-workspace/apps/dev-erp/docs/contracts/task_engine_inventory_c00b_binding_input.v1.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "task_engine_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "ingress_mcp_upload_ticket",
    schema_version: "soulforge.ingress.mcp_upload_ticket.v1",
    source_ref: "ui-workspace/apps/dev-erp-mcp/schema/ingress_mcp_upload_ticket.v1.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "dev_erp_mcp_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },

  // 4. Excluded: external_auth_excluded
  {
    contract_id: "ingress_mcp_auth_registry",
    schema_version: "soulforge.ingress.mcp_auth_registry.v1",
    source_ref: "ui-workspace/apps/dev-erp-mcp/schema/ingress_mcp_auth_registry.v1.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.EXTERNAL_AUTH_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "dev_erp_mcp_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "ingress_mtls_device_registry",
    schema_version: "soulforge.ingress.mtls_device_registry.v1",
    source_ref: "ui-workspace/apps/dev-erp-mcp/schema/ingress_mtls_device_registry.v1.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.EXTERNAL_AUTH_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "dev_erp_mcp_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "ingress_mtls_client_binding",
    schema_version: "soulforge.ingress.mtls_client_binding.v1",
    source_ref: "ui-workspace/apps/dev-erp-mcp/schema/ingress_mtls_client_binding.v1.schema.json",
    classification: RECEIPT_CLASSIFICATIONS.EXTERNAL_AUTH_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "dev_erp_mcp_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
  {
    contract_id: "dev_erp_codex_workspace_registry",
    schema_version: "dev_erp.codex_workspace_registry.v1",
    source_ref: "ui-workspace/apps/dev-erp/src/codex_workspace_registry.mjs",
    classification: RECEIPT_CLASSIFICATIONS.EXTERNAL_AUTH_EXCLUDED,
    standing_runtime_blocking: false,
    time_field: "expires_at",
    owner: "dev_erp_owner",
    warning_window_seconds: null,
    critical_window_seconds: null,
    next_action_on_warning_or_expiry: null,
  },
];

export const INTERNAL_RECEIPT_CONTRACT_CATALOG = deepFreeze(RAW_CONTRACT_CATALOG);

const CATALOG_BY_SCHEMA = new Map(
  INTERNAL_RECEIPT_CONTRACT_CATALOG.map((item) => [item.schema_version, item]),
);
const CATALOG_BY_ID = new Map(
  INTERNAL_RECEIPT_CONTRACT_CATALOG.map((item) => [item.contract_id, item]),
);

const SAFE_PATH_PATTERN = /\b[A-Za-z]:[\\/](?![\\/])|^\/Users|^\/home|^\/tmp|^\/var|^\/private/u;
const PROHIBITED_KEYS = /^(?:prompt|reasoning|tool_(?:input|output)|transcript(?:_path)?|session_path|source_path|cwd|token|password|passwd|cookie|credential|authorization|secret)$/u;
const STRICT_ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

function containsPrivacyOrPathLeaks(val) {
  if (typeof val === "string") {
    if (SAFE_PATH_PATTERN.test(val)) return true;
    if (val.includes("file://")) return true;
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(val)) return true;
  } else if (Array.isArray(val)) {
    return val.some((element) => containsPrivacyOrPathLeaks(element));
  } else if (val !== null && typeof val === "object") {
    for (const [k, v] of Object.entries(val)) {
      if (PROHIBITED_KEYS.test(k)) return true;
      if (containsPrivacyOrPathLeaks(v)) return true;
    }
  }
  return false;
}

function resolveRenewalGovernance(classification) {
  if (classification === RECEIPT_CLASSIFICATIONS.SAME_AUTHORITY_LOCAL_AUTO_RENEW) {
    return RECEIPT_RENEWAL_GOVERNANCE.SAME_AUTHORITY_LOCAL_POLICY;
  }
  if (classification === RECEIPT_CLASSIFICATIONS.OWNER_REVALIDATION_REQUIRED) {
    return RECEIPT_RENEWAL_GOVERNANCE.OWNER_REVALIDATION_REQUIRED;
  }
  return RECEIPT_RENEWAL_GOVERNANCE.NONE;
}

export function getReceiptContractCatalog() {
  return INTERNAL_RECEIPT_CONTRACT_CATALOG;
}

export function getStandingRuntimeBlockingCatalog() {
  return INTERNAL_RECEIPT_CONTRACT_CATALOG.filter((item) => item.standing_runtime_blocking === true);
}

export function classifyReceiptContract(schemaVersionOrId) {
  if (typeof schemaVersionOrId !== "string" || !schemaVersionOrId) return null;
  return CATALOG_BY_SCHEMA.get(schemaVersionOrId) || CATALOG_BY_ID.get(schemaVersionOrId) || null;
}

export function evaluateReceiptObservation(descriptorOrSchema, observation, options = {}) {
  const nowMs = Number.isFinite(options.now) ? options.now : Date.now();

  // Reject arbitrary caller-supplied descriptor objects! Must resolve via fixed catalog only.
  if (typeof descriptorOrSchema !== "string") {
    return {
      contract_id: "unknown_contract",
      schema_version: "unknown",
      classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
      standing_runtime_blocking: false,
      status: RECEIPT_HEALTH_STATUSES.INVALID,
      time_field: "expires_at",
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: "unknown_owner",
      owner_action_required: false,
      next_action: "Provide a registered contract ID or schema_version string.",
      renewal_governance: RECEIPT_RENEWAL_GOVERNANCE.NONE,
      diagnostic_code: "descriptor_object_injection_rejected",
    };
  }

  const descriptor = classifyReceiptContract(descriptorOrSchema);

  if (!descriptor) {
    return {
      contract_id: "unknown_contract",
      schema_version: descriptorOrSchema,
      classification: RECEIPT_CLASSIFICATIONS.ON_DEMAND_EPHEMERAL_EXCLUDED,
      standing_runtime_blocking: false,
      status: RECEIPT_HEALTH_STATUSES.UNKNOWN,
      time_field: "expires_at",
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: "unknown_owner",
      owner_action_required: false,
      next_action: "Register contract in catalog before evaluation.",
      renewal_governance: RECEIPT_RENEWAL_GOVERNANCE.NONE,
      diagnostic_code: "contract_unregistered",
    };
  }

  const isStanding = descriptor.standing_runtime_blocking === true;
  const renewalGovernance = resolveRenewalGovernance(descriptor.classification);

  if (observation === null) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.UNKNOWN,
      time_field: descriptor.time_field,
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: descriptor.next_action_on_warning_or_expiry || "Provide receipt observation evidence.",
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_evidence_missing",
    };
  }

  if (typeof observation !== "object" || Array.isArray(observation) || observation.evidence_state === "invalid" || observation.status === "invalid") {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.INVALID,
      time_field: descriptor.time_field,
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: "Provide valid evidence receipt matching canonical schema and owner constraints.",
      renewal_governance: renewalGovernance,
      diagnostic_code: (observation && observation.diagnostic_code) || "receipt_evidence_invalid",
    };
  }

  if (containsPrivacyOrPathLeaks(observation)) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.INVALID,
      time_field: descriptor.time_field,
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: "Sanitize receipt payload to exclude private paths or raw secrets.",
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_privacy_or_path_leak_detected",
    };
  }

  const rawSchema = observation.schema_version;
  if (typeof rawSchema === "string" && rawSchema !== descriptor.schema_version) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.INVALID,
      time_field: descriptor.time_field,
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: "Provide receipt evidence matching canonical schema_version.",
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_schema_mismatch",
    };
  }

  const rawTimestamp = observation[descriptor.time_field];
  if (typeof rawTimestamp !== "string" || !STRICT_ISO_TIMESTAMP_PATTERN.test(rawTimestamp)) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.INVALID,
      time_field: descriptor.time_field,
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: `Ensure receipt contains valid strict UTC ISO-8601 timestamp in field ${descriptor.time_field}.`,
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_timestamp_not_strict_iso",
    };
  }

  const parsedMs = Date.parse(rawTimestamp);
  if (!Number.isFinite(parsedMs)) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.INVALID,
      time_field: descriptor.time_field,
      timestamp_iso: null,
      expires_in_seconds: null,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: `Ensure receipt timestamp in field ${descriptor.time_field} parses as valid date.`,
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_timestamp_unparseable",
    };
  }

  const timestampIso = new Date(parsedMs).toISOString();
  const expiresInSeconds = Math.floor((parsedMs - nowMs) / 1000);

  if (expiresInSeconds <= 0) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.EXPIRED,
      time_field: descriptor.time_field,
      timestamp_iso: timestampIso,
      expires_in_seconds: expiresInSeconds,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: descriptor.next_action_on_warning_or_expiry || "Receipt has expired. Revalidate or renew receipt.",
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_expired",
    };
  }

  // Resolve warning and critical windows from canonical default or options.windows / binding
  const providedWindows = options.windows?.[descriptor.contract_id]
    || options.windows?.[descriptor.schema_version]
    || options.contract_windows?.[descriptor.contract_id]
    || null;

  const warningWindowSeconds = providedWindows?.warning_window_seconds ?? descriptor.warning_window_seconds;
  const criticalWindowSeconds = providedWindows?.critical_window_seconds ?? descriptor.critical_window_seconds;

  if (warningWindowSeconds !== null || criticalWindowSeconds !== null) {
    if (
      !Number.isSafeInteger(warningWindowSeconds)
      || !Number.isSafeInteger(criticalWindowSeconds)
      || criticalWindowSeconds <= 0
      || warningWindowSeconds <= criticalWindowSeconds
      || warningWindowSeconds > 31 * 86_400
    ) {
      return {
        contract_id: descriptor.contract_id,
        schema_version: descriptor.schema_version,
        classification: descriptor.classification,
        standing_runtime_blocking: isStanding,
        status: RECEIPT_HEALTH_STATUSES.INVALID,
        time_field: descriptor.time_field,
        timestamp_iso: timestampIso,
        expires_in_seconds: expiresInSeconds,
        owner: descriptor.owner,
        owner_action_required: isStanding,
        next_action: `Fix invalid warning/critical window bounds for contract ${descriptor.contract_id}.`,
        renewal_governance: renewalGovernance,
        diagnostic_code: "receipt_window_bounds_invalid",
      };
    }
  } else if (isStanding) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.UNKNOWN,
      time_field: descriptor.time_field,
      timestamp_iso: timestampIso,
      expires_in_seconds: expiresInSeconds,
      owner: descriptor.owner,
      owner_action_required: true,
      next_action: `Configure exact warning/critical window in binding for standing contract ${descriptor.contract_id}.`,
      renewal_governance: renewalGovernance,
      diagnostic_code: "warning_window_unconfigured",
    };
  }

  if (criticalWindowSeconds !== null && expiresInSeconds <= criticalWindowSeconds) {
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.CRITICAL,
      time_field: descriptor.time_field,
      timestamp_iso: timestampIso,
      expires_in_seconds: expiresInSeconds,
      owner: descriptor.owner,
      owner_action_required: isStanding,
      next_action: descriptor.next_action_on_warning_or_expiry || "Receipt expiry imminent. Take owner revalidation action immediately.",
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_expiring_imminent",
    };
  }

  if (warningWindowSeconds !== null && expiresInSeconds <= warningWindowSeconds) {
    const actionRequired = isStanding && descriptor.classification === RECEIPT_CLASSIFICATIONS.OWNER_REVALIDATION_REQUIRED;
    return {
      contract_id: descriptor.contract_id,
      schema_version: descriptor.schema_version,
      classification: descriptor.classification,
      standing_runtime_blocking: isStanding,
      status: RECEIPT_HEALTH_STATUSES.WARNING,
      time_field: descriptor.time_field,
      timestamp_iso: timestampIso,
      expires_in_seconds: expiresInSeconds,
      owner: descriptor.owner,
      owner_action_required: actionRequired,
      next_action: descriptor.next_action_on_warning_or_expiry || "Receipt approaching expiry window.",
      renewal_governance: renewalGovernance,
      diagnostic_code: "receipt_expiring_soon",
    };
  }

  return {
    contract_id: descriptor.contract_id,
    schema_version: descriptor.schema_version,
    classification: descriptor.classification,
    standing_runtime_blocking: isStanding,
    status: RECEIPT_HEALTH_STATUSES.CURRENT,
    time_field: descriptor.time_field,
    timestamp_iso: timestampIso,
    expires_in_seconds: expiresInSeconds,
    owner: descriptor.owner,
    owner_action_required: false,
    next_action: null,
    renewal_governance: renewalGovernance,
    diagnostic_code: null,
  };
}

export function evaluateStandingReceiptProbes(probesEvidence = {}, options = {}) {
  const nowMs = Number.isFinite(options.now) ? options.now : Date.now();
  const standingContracts = getStandingRuntimeBlockingCatalog();
  const evaluatedList = [];

  const summary = {
    total: standingContracts.length,
    current: 0,
    warning: 0,
    critical: 0,
    expired: 0,
    invalid: 0,
    unknown: 0,
    owner_action_required_count: 0,
  };

  for (const contract of standingContracts) {
    const obs = probesEvidence[contract.contract_id]
      ?? probesEvidence[contract.schema_version]
      ?? null;
    const evaluated = evaluateReceiptObservation(contract.contract_id, obs, {
      now: nowMs,
      windows: options.windows || options.contract_windows,
    });
    evaluatedList.push(evaluated);

    if (Object.hasOwn(summary, evaluated.status)) {
      summary[evaluated.status] += 1;
    }
    if (evaluated.owner_action_required) {
      summary.owner_action_required_count += 1;
    }
  }

  return {
    schema_version: "soulforge.watchtower.receipt_health_projection.v1",
    observed_at: new Date(nowMs).toISOString(),
    summary,
    receipts: evaluatedList,
  };
}
