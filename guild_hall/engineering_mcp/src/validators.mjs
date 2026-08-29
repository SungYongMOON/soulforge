// Pure structural validators for the Engineering MCP v0 contract.
// No I/O, no server, no network — deterministic checks a test or a later
// facade leaf can run against the contract data and against any candidate
// tool description before it is served.

import {
  ENGINEERING_MCP_NAMESPACES,
  FORBIDDEN_FIELD_NAMES,
  UNIFORM_DENIAL_CODE,
  listContractTools,
} from "./contract.mjs";

const NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const FIELD_PATTERN = /^[a-z][a-z0-9_]*$/;

export function validateContract() {
  const problems = [];
  const seen = new Set();
  for (const entry of ENGINEERING_MCP_NAMESPACES) {
    if (!/^[a-z][a-z0-9_]*$/.test(entry.namespace)) problems.push(`namespace_invalid:${entry.namespace}`);
    if (!entry.authority_ceiling || entry.authority_ceiling.length < 10) problems.push(`namespace_ceiling_missing:${entry.namespace}`);
    for (const tool of entry.tools) {
      if (!NAME_PATTERN.test(tool.name)) problems.push(`tool_name_invalid:${tool.name}`);
      if (!tool.name.startsWith(`${entry.namespace}.`)) problems.push(`tool_namespace_mismatch:${tool.name}`);
      if (seen.has(tool.name)) problems.push(`tool_duplicate:${tool.name}`);
      seen.add(tool.name);
      if (!["read", "mutate"].includes(tool.kind)) problems.push(`tool_kind_invalid:${tool.name}`);
      if (!tool.authority_ceiling || tool.authority_ceiling.length < 10) problems.push(`tool_ceiling_missing:${tool.name}`);
      const fieldProblems = validateFieldNames([...tool.request_fields, ...tool.response_fields]);
      problems.push(...fieldProblems.map((code) => `${code}:${tool.name}`));
      if (tool.kind === "mutate") {
        if (tool.requires_idempotency_key !== true) problems.push(`mutate_missing_idempotency_flag:${tool.name}`);
        if (!tool.request_fields.includes("idempotency_key")) problems.push(`mutate_missing_idempotency_field:${tool.name}`);
        if (!tool.response_fields.some((field) => field.endsWith("_ref"))) problems.push(`mutate_missing_receipt_ref:${tool.name}`);
      } else {
        if (tool.requires_idempotency_key !== false) problems.push(`read_wrong_idempotency_flag:${tool.name}`);
        if (tool.request_fields.includes("idempotency_key")) problems.push(`read_carries_idempotency:${tool.name}`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export function validateFieldNames(fields) {
  const problems = [];
  for (const field of fields) {
    if (!FIELD_PATTERN.test(field)) problems.push(`field_shape_invalid_${field}`);
    const lowered = field.toLowerCase();
    for (const forbidden of FORBIDDEN_FIELD_NAMES) {
      if (lowered === forbidden || lowered.endsWith(`_${forbidden}`) || lowered.startsWith(`${forbidden}_`)) {
        problems.push(`forbidden_field_${forbidden}`);
      }
    }
  }
  return problems;
}

// A candidate tool description (from any future facade) must satisfy the same
// structural rules before registration. This mirrors validateContract for one
// externally supplied description and never mutates it.
export function validateCandidateToolDescription(candidate) {
  const problems = [];
  if (!candidate || typeof candidate !== "object") return { ok: false, problems: ["candidate_shape_invalid"] };
  const name = String(candidate.name ?? "");
  if (!NAME_PATTERN.test(name)) problems.push("tool_name_invalid");
  const namespace = name.split(".")[0];
  if (NAME_PATTERN.test(name)
    && !ENGINEERING_MCP_NAMESPACES.some((entry) => entry.namespace === namespace)) {
    problems.push("tool_namespace_unknown");
  }
  if (!["read", "mutate"].includes(candidate.kind)) problems.push("tool_kind_invalid");
  const request = Array.isArray(candidate.request_fields) ? candidate.request_fields : null;
  const response = Array.isArray(candidate.response_fields) ? candidate.response_fields : null;
  if (!request || !response) problems.push("field_lists_missing");
  if (request && response) problems.push(...validateFieldNames([...request, ...response]));
  if (candidate.kind === "mutate" && request && !request.includes("idempotency_key")) problems.push("mutate_missing_idempotency_field");
  if (candidate.kind === "mutate" && response && !response.some((field) => String(field).endsWith("_ref"))) problems.push("mutate_missing_receipt_ref");
  if (candidate.kind === "read" && request && request.includes("idempotency_key")) problems.push("read_carries_idempotency");
  if (typeof candidate.authority_ceiling !== "string" || candidate.authority_ceiling.length < 10) problems.push("tool_ceiling_missing");
  return { ok: problems.length === 0, problems };
}

// The denial envelope every implementation must use for a denied, foreign,
// absent, revoked, or out-of-scope object: one uniform code, no existence
// detail, no resource echo beyond the caller's own request id.
export function validateDenialEnvelope(envelope) {
  const problems = [];
  if (!envelope || typeof envelope !== "object") return { ok: false, problems: ["denial_shape_invalid"] };
  if (envelope.code !== UNIFORM_DENIAL_CODE) problems.push("denial_code_not_uniform");
  if ("request_id" in envelope && typeof envelope.request_id !== "string") problems.push("denial_request_id_not_string");
  const keys = Object.keys(envelope).sort();
  const allowed = ["code", "request_id"];
  for (const key of keys) if (!allowed.includes(key)) problems.push(`denial_leaks_field_${key}`);
  return { ok: problems.length === 0, problems };
}

// Convenience: the contract must contain no tool that can be mistaken for a
// task-completion or acceptance authority.
export function validateNoCompletionAuthority() {
  const problems = [];
  // Name-lint only: it blocks the listed authority verbs from ever appearing as
  // a tool's local verb. `finalize` (integrity custody) and `closeout`
  // (session terminal state) are deliberately legal because their ceilings
  // state they are not completion/acceptance; semantic honesty is the review
  // gate's job, not this lint's.
  const verbs = ["complete", "accept", "approve", "promote", "set_status", "done", "resolve", "publish", "mark"];
  for (const tool of listContractTools()) {
    const local = tool.name.split(".")[1];
    if (verbs.some((verb) => local === verb || local.startsWith(`${verb}_`))) {
      problems.push(`completion_authority_shape:${tool.name}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
