import { createHash } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  canonicalize,
  operationalNonAcceptanceReceipt,
} from "./five_field_recovery_contract.mjs";
import {
  runRuntimePreflight,
  runtimeLaunchBindingDigest,
} from "./five_field_runtime_preflight.mjs";

export const AUTOMATION_BUILDER_V1_INPUT_SCHEMA =
  "soulforge.five_field_automation_builder_input.v1";
export const AUTOMATION_BUILDER_INPUT_SCHEMA =
  "soulforge.five_field_automation_builder_input.v2";
export const AUTOMATION_BUILDER_RECEIPT_SCHEMA =
  "soulforge.five_field_automation_builder_receipt.v2";
export const GENERATED_AUTOMATION_NAME = "AI 작업 결과 누락 복구 (매일)";

const AUTOMATION_FIELDS = Object.freeze([
  "version",
  "id",
  "kind",
  "name",
  "prompt",
  "status",
  "rrule",
  "model",
  "reasoning_effort",
  "execution_environment",
  "target",
  "cwds",
  "created_at",
  "updated_at",
]);
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const SAFE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/u;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const SECRET_OR_URL_RE =
  /(?:ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|bearer|credential|cookie)\s*[:=]\s*\S+|(?:https?|ssh|git):\/\/|git@)/iu;

class BuilderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new BuilderError(code);
}

function exactKeys(value, allowed, code) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))
    || allowed.some((key) => !Object.hasOwn(value, key))
  ) fail(code);
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function decodeString(raw, code) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "string") fail(code);
    return parsed;
  } catch (error) {
    if (error instanceof BuilderError) throw error;
    fail(code);
  }
}

function decodeInteger(raw, code) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) fail(code);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail(code);
  return value;
}

function decodeStringArray(raw, code) {
  try {
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed)
      || !parsed.every((value) => typeof value === "string")
    ) fail(code);
    return parsed;
  } catch (error) {
    if (error instanceof BuilderError) throw error;
    fail(code);
  }
}

function decodeTarget(raw) {
  const match = raw.match(
    /^\{\s*type\s*=\s*("(?:[^"\\]|\\.)*")\s*,\s*project_id\s*=\s*("(?:[^"\\]|\\.)*")\s*\}$/u,
  );
  if (!match) fail("automation_target_invalid");
  return {
    type: decodeString(match[1], "automation_target_invalid"),
    project_id: decodeString(match[2], "automation_target_invalid"),
  };
}

function parseAutomationToml(bytes) {
  if (
    typeof bytes !== "string"
    || bytes.length === 0
    || bytes.includes("\0")
    || SECRET_OR_URL_RE.test(bytes)
  ) fail("automation_bytes_boundary_invalid");
  const rawValues = new Map();
  for (const line of bytes.replace(/\r\n/gu, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-z][a-z0-9_]*)\s*=\s*(.+)$/u);
    if (!match) fail("automation_toml_invalid");
    if (rawValues.has(match[1])) fail("automation_field_duplicate");
    rawValues.set(match[1], match[2]);
  }
  if (
    rawValues.size !== AUTOMATION_FIELDS.length
    || AUTOMATION_FIELDS.some((field) => !rawValues.has(field))
    || [...rawValues.keys()].some((field) =>
      !AUTOMATION_FIELDS.includes(field))
  ) fail("automation_fields_invalid");
  const strings = [
    "id",
    "kind",
    "name",
    "prompt",
    "status",
    "rrule",
    "model",
    "reasoning_effort",
    "execution_environment",
  ];
  const parsed = {};
  parsed.version = decodeInteger(
    rawValues.get("version"),
    "automation_version_invalid",
  );
  for (const field of strings) {
    parsed[field] = decodeString(
      rawValues.get(field),
      `automation_${field}_invalid`,
    );
  }
  parsed.target = decodeTarget(rawValues.get("target"));
  parsed.cwds = decodeStringArray(
    rawValues.get("cwds"),
    "automation_cwds_invalid",
  );
  parsed.created_at = decodeInteger(
    rawValues.get("created_at"),
    "automation_created_at_invalid",
  );
  parsed.updated_at = decodeInteger(
    rawValues.get("updated_at"),
    "automation_updated_at_invalid",
  );
  return parsed;
}

function comparablePath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathContains(root, target) {
  const rel = relative(root, target);
  return rel === "" || (
    rel !== ".."
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel)
  );
}

function exactAbsolutePath(value, code) {
  if (
    typeof value !== "string"
    || !isAbsolute(value)
    || resolve(value) !== value
    || /[\0\r\n"]/u.test(value)
  ) fail(code);
  return value;
}

function renderAutomation(values, prompt) {
  return [
    "# Generated by five_field_automation_builder.mjs.",
    "# PAUSED candidate only; installation, execution, and activation remain",
    "# outside this public builder's authority.",
    "",
    `version = ${values.version}`,
    `id = ${JSON.stringify(values.id)}`,
    `kind = ${JSON.stringify(values.kind)}`,
    `name = ${JSON.stringify(GENERATED_AUTOMATION_NAME)}`,
    `prompt = ${JSON.stringify(prompt)}`,
    'status = "PAUSED"',
    `rrule = ${JSON.stringify(values.rrule)}`,
    `model = ${JSON.stringify(values.model)}`,
    `reasoning_effort = ${JSON.stringify(values.reasoning_effort)}`,
    `execution_environment = ${JSON.stringify(values.execution_environment)}`,
    `target = { type = ${JSON.stringify(values.target.type)}, project_id = ${JSON.stringify(values.target.project_id)} }`,
    `cwds = [${JSON.stringify(values.isolated.cwd)}]`,
    `created_at = ${values.created_at}`,
    `updated_at = ${values.candidate_updated_at}`,
    "",
  ].join("\n");
}

function holdResult(code) {
  return {
    status: "HOLD",
    candidate: null,
    rollback: null,
    receipt: {
      schema_version: AUTOMATION_BUILDER_RECEIPT_SCHEMA,
      status: "HOLD",
      hold_reasons: [code],
      candidate_sha256: null,
      rollback_sha256: null,
      runtime_manifest_digest: null,
      runtime_launch_binding_digest: null,
      runtime_evidence_digest: null,
      candidate_status: "UNKNOWN",
      ...operationalNonAcceptanceReceipt(),
    },
  };
}

export function buildPausedAutomation(input) {
  try {
    if (input?.schema_version === AUTOMATION_BUILDER_V1_INPUT_SCHEMA) {
      fail("automation_builder_v1_explicit_hold");
    }
    exactKeys(input, [
      "schema_version",
      "current_toml_bytes",
      "expected_current_sha256",
      "candidate_updated_at",
      "runtime_preflight_input",
      "runtime_preflight_receipt",
      "isolated",
    ], "automation_builder_contract_invalid");
    if (input.schema_version !== AUTOMATION_BUILDER_INPUT_SCHEMA) {
      fail("automation_builder_schema_invalid");
    }
    if (
      typeof input.expected_current_sha256 !== "string"
      || !DIGEST_RE.test(input.expected_current_sha256)
    ) fail("automation_current_digest_invalid");
    if (
      sha256Bytes(input.current_toml_bytes)
      !== input.expected_current_sha256
    ) fail("automation_current_digest_mismatch");
    if (
      !Number.isSafeInteger(input.candidate_updated_at)
      || input.candidate_updated_at < 0
    ) fail("automation_updated_at_invalid");
    exactKeys(
      input.runtime_preflight_receipt,
      [
        "schema_version",
        "status",
        "hold_reasons",
        "manifest_digest",
        "launch_binding_digest",
        "evidence_digest",
        "forbidden_union_digest",
        "topology",
        "inventory",
        "evidence",
        "lease_policy",
        "official_completion",
        "worksession_acceptance",
        "taskdriver_acceptance",
        "erp_acceptance",
        "mcp_acceptance",
        "claim_ceiling",
      ],
      "runtime_preflight_receipt_invalid",
    );
    const reviewedPreflight = input.runtime_preflight_receipt;
    if (
      reviewedPreflight.status !== "PASS"
      || typeof reviewedPreflight.manifest_digest !== "string"
      || !DIGEST_RE.test(reviewedPreflight.manifest_digest)
      || typeof reviewedPreflight.launch_binding_digest !== "string"
      || !DIGEST_RE.test(reviewedPreflight.launch_binding_digest)
      || typeof reviewedPreflight.evidence_digest !== "string"
      || !DIGEST_RE.test(reviewedPreflight.evidence_digest)
      || typeof reviewedPreflight.forbidden_union_digest !== "string"
      || !DIGEST_RE.test(reviewedPreflight.forbidden_union_digest)
    ) fail("runtime_preflight_receipt_invalid");
    const recomputedPreflight = runRuntimePreflight(
      input.runtime_preflight_input,
    );
    if (recomputedPreflight.status !== "PASS") {
      fail("runtime_preflight_recheck_failed");
    }
    if (
      canonicalize(recomputedPreflight) !== canonicalize(reviewedPreflight)
    ) fail("runtime_preflight_receipt_mismatch");
    if (
      recomputedPreflight.hold_reasons.length !== 0
      || !Object.values(recomputedPreflight.topology).every((value) =>
        Array.isArray(value) || value === true)
      || !Object.values(recomputedPreflight.evidence).every(
        (value) => value === "VERIFIED",
      )
      || recomputedPreflight.inventory.status !== "VERIFIED"
      || recomputedPreflight.inventory.fresh !== true
      || recomputedPreflight.inventory.codex_zero
        !== (recomputedPreflight.inventory.codex_count === 0)
      || recomputedPreflight.inventory.orca_zero
        !== (recomputedPreflight.inventory.orca_count === 0)
      || recomputedPreflight.lease_policy.operational_primary !== true
      || recomputedPreflight.lease_policy.first_lease_stale !== false
      || !DIGEST_RE.test(
        recomputedPreflight.lease_policy.host_identity_digest || "",
      )
      || !Number.isSafeInteger(
        recomputedPreflight.lease_policy.restored_writer_epoch,
      )
      || recomputedPreflight.lease_policy.restored_writer_epoch < 0
      || !Number.isSafeInteger(
        recomputedPreflight.lease_policy.authority_writer_epoch,
      )
      || recomputedPreflight.lease_policy.authority_writer_epoch < 0
      || !Number.isSafeInteger(
        recomputedPreflight.lease_policy.receipt_writer_epoch,
      )
      || recomputedPreflight.lease_policy.receipt_writer_epoch < 0
      || recomputedPreflight.lease_policy.initial_writer_epoch !== Math.max(
        recomputedPreflight.lease_policy.restored_writer_epoch,
        recomputedPreflight.lease_policy.authority_writer_epoch,
        recomputedPreflight.lease_policy.receipt_writer_epoch,
        0,
      ) + 1
      || recomputedPreflight.official_completion !== false
      || recomputedPreflight.worksession_acceptance !== false
      || recomputedPreflight.taskdriver_acceptance !== false
      || recomputedPreflight.erp_acceptance !== false
      || recomputedPreflight.mcp_acceptance !== false
      || recomputedPreflight.claim_ceiling !== "operational_evidence_only"
    ) fail("runtime_preflight_receipt_invalid");
    exactKeys(input.isolated, [
      "cwd",
      "node_path",
      "runner_script_path",
      "input_path",
    ], "automation_isolated_paths_invalid");
    const isolated = {
      cwd: exactAbsolutePath(
        input.isolated.cwd,
        "automation_cwd_invalid",
      ),
      node_path: exactAbsolutePath(
        input.isolated.node_path,
        "automation_node_path_invalid",
      ),
      runner_script_path: exactAbsolutePath(
        input.isolated.runner_script_path,
        "automation_runner_path_invalid",
      ),
      input_path: exactAbsolutePath(
        input.isolated.input_path,
        "automation_input_path_invalid",
      ),
    };
    if (!pathContains(isolated.cwd, isolated.runner_script_path)) {
      fail("automation_runner_outside_cwd");
    }
    if (
      basename(isolated.cwd) !== "runner"
      || basename(dirname(isolated.input_path)) !== "config"
      || comparablePath(dirname(isolated.cwd))
        !== comparablePath(dirname(dirname(isolated.input_path)))
    ) fail("automation_topology_binding_invalid");
    const launchBindingDigest = runtimeLaunchBindingDigest({
      runner_root: isolated.cwd,
      config_root: dirname(isolated.input_path),
      input_path: isolated.input_path,
    });
    if (
      launchBindingDigest
      !== reviewedPreflight.launch_binding_digest
    ) fail("runtime_launch_binding_mismatch");
    if (
      [
        isolated.cwd,
        isolated.node_path,
        isolated.runner_script_path,
        isolated.input_path,
      ].some((value) => SECRET_OR_URL_RE.test(value))
    ) fail("automation_path_boundary_invalid");

    const current = parseAutomationToml(input.current_toml_bytes);
    if (
      current.version !== 1
      || current.id !== "soulforge-five-field-sweep"
      || current.kind !== "cron"
      || current.execution_environment !== "local"
      || !["ACTIVE", "PAUSED"].includes(current.status)
      || current.target.type !== "project"
      || !SAFE_ID_RE.test(current.target.project_id)
      || !SAFE_TOKEN_RE.test(current.model)
      || !SAFE_TOKEN_RE.test(current.reasoning_effort)
    ) fail("automation_contract_invalid");
    const command = [
      JSON.stringify(isolated.node_path),
      JSON.stringify(isolated.runner_script_path),
      "--runtime-root",
      JSON.stringify(isolated.cwd),
      "--config-root",
      JSON.stringify(dirname(isolated.input_path)),
      "--runtime-manifest-digest",
      reviewedPreflight.manifest_digest,
      "--runtime-evidence-digest",
      reviewedPreflight.evidence_digest,
      "--runtime-launch-binding-digest",
      reviewedPreflight.launch_binding_digest,
      "--input",
      JSON.stringify(isolated.input_path),
    ].join(" ");
    const prompt = [
      "[GENERATED PAUSED CANDIDATE / LIVE HOLD]",
      "Do not install, run, schedule, or activate without the immediately preceding human Owner approval of the exact bytes and bindings.",
      `Runtime manifest: ${reviewedPreflight.manifest_digest}`,
      `Runtime evidence: ${reviewedPreflight.evidence_digest}`,
      `Runtime launch binding: ${reviewedPreflight.launch_binding_digest}`,
      "Run exactly one bounded transaction only after that approval:",
      command,
      "Require ledger commit, non-force push, fresh remote inclusion, then cursor CAS/commit/push/inclusion. UNKNOWN_AFTER_PUSH requires reconciliation. Never reset, rebase, force, delete, or rewrite append-only records.",
      "The receipt must keep official_completion=false, worksession_acceptance=false, taskdriver_acceptance=false, erp_acceptance=false, mcp_acceptance=false, and claim_ceiling=operational_evidence_only.",
      "Keep this automation PAUSED after the one-shot. ACTIVE requires a separate human Owner approval.",
    ].join("\n\n");
    const candidateBytes = renderAutomation({
      ...current,
      isolated,
      candidate_updated_at: input.candidate_updated_at,
    }, prompt);
    const candidateSha256 = sha256Bytes(candidateBytes);
    const rollbackSha256 = sha256Bytes(input.current_toml_bytes);
    return {
      status: "SUCCESS",
      candidate: {
        bytes: candidateBytes,
        sha256: candidateSha256,
      },
      rollback: {
        bytes: input.current_toml_bytes,
        sha256: rollbackSha256,
      },
      receipt: {
        schema_version: AUTOMATION_BUILDER_RECEIPT_SCHEMA,
        status: "SUCCESS",
        hold_reasons: [],
        candidate_sha256: candidateSha256,
        rollback_sha256: rollbackSha256,
        runtime_manifest_digest:
          reviewedPreflight.manifest_digest,
        runtime_launch_binding_digest: launchBindingDigest,
        runtime_evidence_digest: reviewedPreflight.evidence_digest,
        candidate_status: "PAUSED",
        ...operationalNonAcceptanceReceipt(),
      },
    };
  } catch (error) {
    return holdResult(
      error instanceof BuilderError
        ? error.code
        : "automation_builder_failed",
    );
  }
}
