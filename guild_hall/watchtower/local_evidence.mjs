import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateWorkmetaPayloadPolicy } from "../validate/workmeta_payload_policy.mjs";
import { topologySkeleton } from "./topology.mjs";

export const LOCAL_EVIDENCE_SCHEMA_VERSION =
  "soulforge.watchtower.external_evidence.v1";

export const LOCAL_EVIDENCE_LANES = Object.freeze({
  watchtower_self: "watchtower_cli_snapshot_contract_validity",
  gate_five_field: "five_field_ledger_set_integrity",
  store_workmeta: "workmeta_metadata_payload_policy_validity",
});

const SNAPSHOT_SCHEMA = "soulforge.watchtower.topology_health.v2";
const FIVE_FIELD_SCHEMA = "soulforge.five_field_capture.v0";
const SAFE_CODE = /^[a-z][a-z0-9_]{0,127}$/u;
// Historical five-field capture rows used `+` in two stable session IDs. Keep
// that single legacy-safe separator while still rejecting path and email forms.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:+-]{1,199}$/u;
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_LEDGER_BYTES = 32 * 1024 * 1024;
const MAX_LINE_BYTES = 64 * 1024;
const MAX_LEDGER_COUNT = 512;

const FIVE_FIELD_KEYS = new Set([
  "schema_version", "id", "at", "occurred_at", "recorded_at", "worker",
  "session_ref", "project_code", "request_kind", "input_refs", "judgment",
  "output", "verification", "stop_conditions", "needs_backfill", "data_label",
]);
const FIVE_FIELD_REQUIRED_KEYS = [
  "schema_version", "id", "at", "worker", "session_ref", "project_code",
  "request_kind", "input_refs", "judgment", "output", "verification",
  "stop_conditions", "needs_backfill", "data_label",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactTimestamp(value) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}

function safeText(value, max = 2_000) {
  return typeof value === "string" && value.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function validFiveFieldRecord(record, projectCode) {
  if (record === null || typeof record !== "object" || Array.isArray(record)
    || Object.keys(record).some((key) => !FIVE_FIELD_KEYS.has(key))
    || FIVE_FIELD_REQUIRED_KEYS.some((key) => !Object.hasOwn(record, key))
    || record.schema_version !== FIVE_FIELD_SCHEMA
    || !SAFE_ID.test(record.id)
    || !SAFE_ID.test(record.session_ref)
    || record.project_code !== projectCode
    || !SAFE_PROJECT.test(record.project_code)
    || !exactTimestamp(record.at)
    || (record.occurred_at !== undefined && !exactTimestamp(record.occurred_at))
    || (record.recorded_at !== undefined && !exactTimestamp(record.recorded_at))
    || !safeText(record.worker, 80)
    || !/^[a-z0-9][a-z0-9_\-./]{1,79}$/u.test(record.request_kind)
    || !Array.isArray(record.input_refs) || record.input_refs.length > 12
    || !record.input_refs.every((value) => safeText(value, 300))
    || !safeText(record.judgment) || !safeText(record.output)
    || !safeText(record.verification, 600)
    || !Array.isArray(record.stop_conditions) || record.stop_conditions.length > 5
    || !record.stop_conditions.every((value) => safeText(value, 300))
    || ![0, 1].includes(record.needs_backfill)
    || !safeText(record.data_label, 40)) return false;
  return true;
}

async function normalFile(file) {
  try {
    const info = await lstat(file);
    return info.isFile() && !info.isSymbolicLink() ? info : null;
  } catch {
    return null;
  }
}

export async function validateFiveFieldLedgerSet({ workmetaRoot } = {}) {
  if (!path.isAbsolute(workmetaRoot ?? "")) {
    return { ok: false, error_codes: ["workmeta_root_invalid"], validated_count: 0 };
  }
  let projects;
  try {
    projects = (await readdir(workmetaRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()
        && SAFE_PROJECT.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch {
    return { ok: false, error_codes: ["workmeta_root_unavailable"], validated_count: 0 };
  }
  const ledgers = [];
  for (const projectCode of projects) {
    const file = path.join(
      workmetaRoot, projectCode, "reports", "procedure_capture", "five_field_log.jsonl",
    );
    const info = await normalFile(file);
    if (info !== null) ledgers.push({ projectCode, file, size: info.size });
  }
  if (ledgers.length === 0) {
    return { ok: false, error_codes: ["five_field_ledger_absent"], validated_count: 0 };
  }
  if (ledgers.length > MAX_LEDGER_COUNT
    || ledgers.some((ledger) => ledger.size > MAX_LEDGER_BYTES)) {
    return { ok: false, error_codes: ["five_field_ledger_bounds_exceeded"], validated_count: 0 };
  }

  const identities = new Map();
  const ledgerDigests = [];
  let validatedCount = 0;
  for (const ledger of ledgers) {
    let text;
    try {
      text = await readFile(ledger.file, "utf8");
    } catch {
      return { ok: false, error_codes: ["five_field_ledger_unreadable"], validated_count: validatedCount };
    }
    const rows = text.split(/\r?\n/u).filter((line) => line.length > 0);
    for (const line of rows) {
      if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
        return { ok: false, error_codes: ["five_field_line_bounds_exceeded"], validated_count: validatedCount };
      }
      let record;
      try { record = JSON.parse(line); } catch {
        return { ok: false, error_codes: ["five_field_json_invalid"], validated_count: validatedCount };
      }
      if (!validFiveFieldRecord(record, ledger.projectCode)) {
        return { ok: false, error_codes: ["five_field_record_invalid"], validated_count: validatedCount };
      }
      const digest = sha256(canonical(record));
      const prior = identities.get(record.id);
      if (prior !== undefined && prior !== digest) {
        return { ok: false, error_codes: ["five_field_identity_conflict"], validated_count: validatedCount };
      }
      identities.set(record.id, digest);
      validatedCount += 1;
    }
    ledgerDigests.push(`${ledger.projectCode}:${sha256(text)}`);
  }
  return {
    ok: true,
    error_codes: [],
    validated_count: validatedCount,
    validation_digest: sha256(ledgerDigests.join("\n")),
  };
}

export async function validateWorkmetaStore({ repoRoot, workmetaRoot } = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(workmetaRoot ?? "")) {
    return { ok: false, error_codes: ["workmeta_root_invalid"], validated_count: 0 };
  }
  try {
    const report = await validateWorkmetaPayloadPolicy({ repoRoot, workmetaRoot });
    const safeSummary = {
      present: report.present === true,
      files_scanned: Number.isSafeInteger(report.files_scanned) ? report.files_scanned : 0,
      violation_count: Number.isSafeInteger(report.violation_count) ? report.violation_count : 0,
      violation_codes: Array.isArray(report.violations)
        ? report.violations.map((entry) => entry?.id).filter((value) => SAFE_CODE.test(value)).sort()
        : [],
    };
    return {
      ok: report.ok === true && report.present === true,
      error_codes: report.present !== true ? ["workmeta_store_absent"]
        : report.ok !== true ? ["workmeta_policy_violation"] : [],
      validated_count: safeSummary.files_scanned,
      validation_digest: sha256(canonical(safeSummary)),
    };
  } catch {
    return { ok: false, error_codes: ["workmeta_validation_failed"], validated_count: 0 };
  }
}

export function validateWatchtowerExecution(snapshot) {
  const skeleton = topologySkeleton();
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)
    || snapshot.schema_version !== SNAPSHOT_SCHEMA
    || !exactTimestamp(snapshot.observed_at)
    || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)
    || snapshot.nodes.length !== skeleton.nodes.length
    || snapshot.edges.length !== skeleton.edges.length) {
    return { ok: false, error_codes: ["watchtower_snapshot_invalid"], validated_count: 0 };
  }
  const expectedNodes = skeleton.nodes.map((node) => node.id).sort();
  const actualNodes = snapshot.nodes.map((node) => node?.id).sort();
  const expectedEdges = skeleton.edges.map((edge) => `${edge.from}\0${edge.to}\0${edge.flow}`).sort();
  const actualEdges = snapshot.edges.map((edge) => `${edge?.from}\0${edge?.to}\0${edge?.flow}`).sort();
  if (canonical(actualNodes) !== canonical(expectedNodes)
    || canonical(actualEdges) !== canonical(expectedEdges)) {
    return { ok: false, error_codes: ["watchtower_snapshot_contract_mismatch"], validated_count: 0 };
  }
  return {
    ok: true,
    error_codes: [],
    validated_count: snapshot.nodes.length + snapshot.edges.length,
    validation_digest: sha256(canonical({ nodes: actualNodes, edges: actualEdges })),
  };
}

async function readPriorReceipt(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value?.schema_version === LOCAL_EVIDENCE_SCHEMA_VERSION ? value : null;
  } catch {
    return null;
  }
}

export async function persistLocalEvidenceReceipt({
  evidenceRoot, lane, result, attemptedAt, now = () => new Date(),
} = {}) {
  if (!path.isAbsolute(evidenceRoot ?? "") || !Object.hasOwn(LOCAL_EVIDENCE_LANES, lane)
    || !exactTimestamp(attemptedAt)) throw new TypeError("local_evidence_input_invalid");
  const target = path.join(evidenceRoot, `${lane}.json`);
  const prior = await readPriorReceipt(target);
  const completedAt = now().toISOString();
  const succeeded = result?.ok === true && typeof result.validation_digest === "string"
    && SHA256.test(result.validation_digest);
  const priorDigest = prior?.validation_digest ?? null;
  const receipt = {
    schema_version: LOCAL_EVIDENCE_SCHEMA_VERSION,
    lane,
    validation_scope: LOCAL_EVIDENCE_LANES[lane],
    attempted_at: attemptedAt,
    completed_at: completedAt,
    last_success_at: succeeded ? completedAt : prior?.last_success_at ?? null,
    status: succeeded ? "ok" : "error",
    validation_digest: succeeded ? result.validation_digest : priorDigest,
    validated_count: succeeded && Number.isSafeInteger(result.validated_count)
      ? result.validated_count : prior?.validated_count ?? 0,
    activity_changed: succeeded && priorDigest !== null
      ? priorDigest !== result.validation_digest : null,
    error_codes: succeeded ? [] : Array.isArray(result?.error_codes)
      ? result.error_codes.filter((code) => SAFE_CODE.test(code)).slice(0, 8)
      : ["validation_failed"],
  };
  await mkdir(evidenceRoot, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
  return receipt;
}
