// watchtower.mjs — Soulforge 관제 판정 엔진 (W1: 검사·표시 전용, 복구는 W2).
// 이미 생산 중인 하트비트/상태 파일을 period+grace 2단 윈도로 판정해
// 경로가 노출되지 않는 topology health 스냅샷을 만든다. 원문·secret은 읽지 않는다.

import { readFile, readdir, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

import { edgeDeliveryVerdict, summariseEdgeDelivery, topologySkeleton } from "./topology.mjs";

export const WATCHTOWER_BINDING_SCHEMA_VERSION = "soulforge.watchtower.binding.v1";
export const WATCHTOWER_SNAPSHOT_SCHEMA_VERSION = "soulforge.watchtower.topology_health.v2";

const PROBE_KINDS = new Set(["jsonl_tail", "json_file", "dir_latest_mtime", "schtask"]);
const HEALTH_STATES = ["ok", "degraded", "stale", "down", "unmonitored"];
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_DIR_ENTRIES = 4000;
const TASK_RUNNING_MARKERS = ["실행", "Running"];
const TASK_READY_MARKERS = ["준비", "Ready"];
const TASK_DISABLED_MARKERS = ["사용 안 함", "Disabled"];

export class WatchtowerError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "WatchtowerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new WatchtowerError(code, message);
}

function plainObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, "Expected a plain object");
  }
  return value;
}

function fieldPath(value, path) {
  let cursor = value;
  for (const part of String(path).split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

export function validateWatchtowerBinding(binding) {
  plainObject(binding, "binding_invalid");
  if (binding.schema_version !== WATCHTOWER_BINDING_SCHEMA_VERSION) {
    fail("binding_schema_invalid", "Unexpected binding schema_version");
  }
  if (typeof binding.state_root !== "string" || binding.state_root.length === 0) {
    fail("binding_state_root_invalid", "state_root is required");
  }
  plainObject(binding.probes, "binding_probes_invalid");
  for (const [key, probe] of Object.entries(binding.probes)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key)) fail("probe_key_invalid", `probe key ${key}`);
    plainObject(probe, "probe_invalid");
    if (!PROBE_KINDS.has(probe.kind)) fail("probe_kind_invalid", `probe ${key}`);
    if (probe.kind === "schtask") {
      if (typeof probe.task_name !== "string" || probe.task_name.length === 0) {
        fail("probe_task_name_invalid", `probe ${key}`);
      }
    } else if (typeof probe.path !== "string" || probe.path.length === 0) {
      fail("probe_path_invalid", `probe ${key}`);
    }
    if (probe.resident_task !== undefined && probe.scheduled_task !== undefined) {
      fail("probe_task_owner_invalid", `probe ${key}`);
    }
    for (const field of ["resident_task", "scheduled_task"]) {
      if (probe[field] !== undefined && (typeof probe[field] !== "string" || probe[field].length === 0)) {
        fail("probe_task_name_invalid", `probe ${key}.${field}`);
      }
    }
    if (probe.expected_schema_version !== undefined && (typeof probe.expected_schema_version !== "string" || probe.expected_schema_version.length === 0)) {
      fail("probe_schema_contract_invalid", `probe ${key}`);
    }
    for (const field of ["required_fields", "required_string_fields", "required_timestamp_fields", "nullable_timestamp_fields"]) {
      if (probe[field] !== undefined && (!Array.isArray(probe[field]) || probe[field].some((item) => typeof item !== "string" || item.length === 0))) {
        fail("probe_schema_contract_invalid", `probe ${key}.${field}`);
      }
    }
    if (probe.expected_field_values !== undefined) {
      plainObject(probe.expected_field_values, "probe_schema_contract_invalid");
      for (const [field, value] of Object.entries(probe.expected_field_values)) {
        if (typeof field !== "string" || field.length === 0 || typeof value !== "string" || value.length === 0) {
          fail("probe_schema_contract_invalid", `probe ${key}.expected_field_values`);
        }
      }
    }
    if ((probe.activity_field === undefined) !== (probe.activity_values === undefined)
      || (probe.activity_field !== undefined
        && (typeof probe.activity_field !== "string" || probe.activity_field.length === 0
          || !Array.isArray(probe.activity_values) || probe.activity_values.length === 0
          || probe.activity_values.some((value) => typeof value !== "string"
            || !/^[a-z][a-z0-9_]{0,31}$/u.test(value))))) {
      fail("probe_activity_contract_invalid", `probe ${key}`);
    }
    for (const field of ["activity_count_field", "activity_next_at_field"]) {
      if (probe[field] !== undefined
        && (probe.activity_field === undefined || typeof probe[field] !== "string" || probe[field].length === 0)) {
        fail("probe_activity_contract_invalid", `probe ${key}.${field}`);
      }
    }
    for (const field of ["period_seconds", "grace_seconds"]) {
      if (!Number.isSafeInteger(probe[field]) || probe[field] < 0 || probe[field] > 604800) {
        fail("probe_window_invalid", `probe ${key}.${field}`);
      }
    }
    if (probe.period_seconds === 0) fail("probe_window_invalid", `probe ${key}.period_seconds`);
    if (probe.degrade_when !== undefined) {
      if (!Array.isArray(probe.degrade_when)) fail("probe_degrade_invalid", `probe ${key}`);
      for (const rule of probe.degrade_when) {
        plainObject(rule, "probe_degrade_invalid");
        if (typeof rule.field !== "string" || !Number.isFinite(rule.above)) {
          fail("probe_degrade_invalid", `probe ${key}`);
        }
      }
    }
    if (probe.detail !== undefined) {
      plainObject(probe.detail, "probe_detail_invalid");
      if (probe.detail.kind !== "mail_account_summaries") fail("probe_detail_invalid", `probe ${key}`);
      if (typeof probe.detail.path !== "string" || probe.detail.path.length === 0) {
        fail("probe_detail_invalid", `probe ${key}`);
      }
      if (probe.detail.account_labels !== undefined) {
        plainObject(probe.detail.account_labels, "probe_detail_invalid");
        for (const label of Object.values(probe.detail.account_labels)) {
          if (typeof label !== "string" || label.length === 0 || label.length > 40 || label.includes("@")) {
            fail("probe_detail_invalid", `probe ${key}`);
          }
        }
      }
    }
  }
  return binding;
}

async function readBoundedFile(path) {
  const info = await stat(path);
  if (info.size > MAX_SOURCE_BYTES) fail("source_too_large", "source file exceeds bound");
  const text = await readFile(path, "utf8");
  return { text, mtimeMs: info.mtimeMs };
}

async function probeJsonFile(probe) {
  const { text, mtimeMs } = await readBoundedFile(probe.path);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("source_invalid_json", "invalid JSON receipt");
  }
  plainObject(parsed, "source_invalid_record");
  if (typeof probe.expected_schema_version === "string" && parsed.schema_version !== probe.expected_schema_version) {
    fail("source_schema_invalid", "unexpected receipt schema_version");
  }
  for (const field of probe.required_fields ?? []) {
    if (fieldPath(parsed, field) === undefined) fail("source_required_field_missing", "required receipt field absent");
  }
  for (const field of probe.required_string_fields ?? []) {
    const value = fieldPath(parsed, field);
    if (typeof value !== "string" || value.length === 0) fail("source_string_invalid", "receipt string field invalid");
  }
  for (const field of probe.required_timestamp_fields ?? []) {
    const value = fieldPath(parsed, field);
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("source_timestamp_invalid", "receipt timestamp invalid");
  }
  for (const field of probe.nullable_timestamp_fields ?? []) {
    const value = fieldPath(parsed, field);
    if (value !== null && (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) fail("source_timestamp_invalid", "receipt timestamp invalid");
  }
  for (const [field, expected] of Object.entries(probe.expected_field_values ?? {})) {
    if (fieldPath(parsed, field) !== expected) fail("source_expected_value_invalid", "receipt fixed field mismatch");
  }
  return { record: parsed, mtimeMs };
}

async function probeJsonlTail(probe) {
  const { text, mtimeMs } = await readBoundedFile(probe.path);
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) fail("source_empty", "jsonl has no records");
  return { record: JSON.parse(lines[lines.length - 1]), mtimeMs };
}

async function newestMtimeUnder(root, depthLeft, budget) {
  let newest = null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (budget.count >= MAX_DIR_ENTRIES) break;
    budget.count += 1;
    const target = join(root, entry.name);
    try {
      if (entry.isDirectory()) {
        if (depthLeft > 0) {
          const child = await newestMtimeUnder(target, depthLeft - 1, budget);
          if (child !== null && (newest === null || child > newest)) newest = child;
        }
      } else if (entry.isFile()) {
        const info = await stat(target);
        if (newest === null || info.mtimeMs > newest) newest = info.mtimeMs;
      }
    } catch {
      continue;
    }
  }
  return newest;
}

function defaultRunSchtasks(taskName) {
  return new Promise((resolve) => {
    const child = spawn("schtasks.exe", ["/query", "/tn", taskName, "/fo", "LIST"], {
      windowsHide: true,
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      let text;
      try {
        text = new TextDecoder("euc-kr").decode(Buffer.concat(chunks));
      } catch {
        text = Buffer.concat(chunks).toString("utf8");
      }
      resolve(text);
    });
  });
}

async function schtaskState(probe, runSchtasks) {
  const text = await runSchtasks(probe.task_name);
  if (text === null) return "query_failed";
  if (TASK_RUNNING_MARKERS.some((marker) => text.includes(marker))) return "running";
  if (TASK_DISABLED_MARKERS.some((marker) => text.includes(marker))) return "disabled";
  if (TASK_READY_MARKERS.some((marker) => text.includes(marker))) return "ready";
  return "unknown";
}

function judgeTaskOwner(state, mode) {
  if (state === "query_failed" || state === "unknown") {
    return { state: "unmonitored", reason: "task_state_unknown" };
  }
  if (mode === "scheduled") {
    return state === "disabled"
      ? { state: "down", reason: "task_disabled" }
      : { state: "ok", reason: null };
  }
  return state === "running"
    ? { state: "ok", reason: null }
    : { state: "down", reason: state === "disabled" ? "task_disabled" : "task_not_running" };
}

async function judgeProbeTaskOwner(probe, runSchtasks) {
  if (typeof runSchtasks !== "function") return null;
  if (typeof probe.resident_task === "string") {
    const state = await schtaskState({ task_name: probe.resident_task }, runSchtasks);
    return judgeTaskOwner(state, "resident");
  }
  if (typeof probe.scheduled_task === "string") {
    const state = await schtaskState({ task_name: probe.scheduled_task }, runSchtasks);
    return judgeTaskOwner(state, "scheduled");
  }
  return null;
}

function judgeWindow(ageSeconds, probe) {
  if (ageSeconds <= probe.period_seconds) return "fresh";
  if (ageSeconds <= probe.period_seconds + probe.grace_seconds) return "late";
  return "stale";
}

const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,127}$/u;
const WATCHTOWER_CHECK_INTERVAL_SECONDS = 300;
const TRACKING_EVIDENCE_OWNER_BY_NODE = Object.freeze({
  gate_five_field: "five_field_event_validator",
  store_workmeta: "workmeta_owner_bounded_validator",
  watchtower_self: "independent_watchdog",
});
const TRACKING_ESCALATION_OWNER_BY_NODE = Object.freeze({
  gate_five_field: "five_field_owner",
  store_workmeta: "workmeta_owner",
  watchtower_self: "watchtower_owner",
});
const TRACKING_REASON_BY_NODE = Object.freeze({
  gate_five_field: "event_validation_receipt_absent",
  store_workmeta: "owner_bounded_validation_receipt_absent",
});

// mail 계정별 요약(logs/last_run_summary.json)을 훑어 실패 계정을 사람 말로
// 특정한다. 주소·경로·원문은 절대 싣지 않는다 — 라벨(owner 제공) 또는 별칭만.
export async function collectMailAccountDetails(detail) {
  const labels = detail.account_labels ?? {};
  const reasons = [];
  let entries;
  try {
    entries = await readdir(detail.path, { withFileTypes: true });
  } catch {
    return { reasons: [], scanned: 0 };
  }
  let scanned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^acc_[a-z0-9_]+$/u.test(entry.name)) continue;
    scanned += 1;
    try {
      const summaryPath = join(detail.path, entry.name, "logs", "last_run_summary.json");
      const { text } = await readBoundedFile(summaryPath);
      const summary = JSON.parse(text);
      const codes = new Set();
      const harvest = (value) => {
        if (Array.isArray(value)) {
          for (const item of value) harvest(item);
          return;
        }
        if (value === null || typeof value !== "object") return;
        for (const code of Array.isArray(value.error_codes) ? value.error_codes : []) {
          if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) codes.add(code);
        }
        if (typeof value.code === "string" && SAFE_ERROR_CODE.test(value.code)) codes.add(value.code);
      };
      harvest(summary.sources);
      harvest(summary.errors);
      const partial = summary.partial === true
        || (Array.isArray(summary.sources) && summary.sources.some((source) => source?.partial === true));
      if (partial || codes.size > 0) {
        const label = labels[entry.name] ?? entry.name;
        const codeText = codes.size > 0 ? [...codes].sort().join("/") : "partial";
        reasons.push(`메일 계정 ${label}: ${codeText}`);
      }
    } catch {
      continue;
    }
  }
  return { reasons: reasons.sort(), scanned };
}

export async function runProbe(probe, { now, run_schtasks: runSchtasks }) {
  const reasons = [];
  let observedAtMs = null;
  let record = null;

  if (probe.kind === "schtask") {
    const state = await schtaskState(probe, runSchtasks);
    const verdict = judgeTaskOwner(state, probe.operation_mode === "scheduled" ? "scheduled" : "resident");
    return verdict.state === "ok"
      ? { state: "ok", reasons: [], age_seconds: 0 }
      : { state: verdict.state, reasons: [verdict.reason], age_seconds: null };
  }

  const taskOwner = await judgeProbeTaskOwner(probe, runSchtasks);
  if (taskOwner?.state === "down") {
    return { state: "down", reasons: [taskOwner.reason], age_seconds: null };
  }
  if (taskOwner?.state === "unmonitored") {
    return { state: "unmonitored", reasons: [taskOwner.reason], age_seconds: null };
  }

  try {
    if (probe.kind === "json_file") {
      const result = await probeJsonFile(probe);
      record = result.record;
      observedAtMs = result.mtimeMs;
    } else if (probe.kind === "jsonl_tail") {
      const result = await probeJsonlTail(probe);
      record = result.record;
      observedAtMs = result.mtimeMs;
    } else {
      const newest = await newestMtimeUnder(probe.path, 3, { count: 0 });
      if (newest === null) fail("source_empty", "no files under directory");
      observedAtMs = newest;
    }
  } catch (error) {
    const code = error instanceof WatchtowerError ? error.code : "source_missing";
    if (probe.missing_is_unmonitored === true) {
      return { state: "unmonitored", reasons: ["heartbeat_receipt_unavailable", code], age_seconds: null };
    }
    return { state: "down", reasons: [code], age_seconds: null };
  }

  if (record !== null && typeof probe.timestamp_field === "string") {
    const raw = fieldPath(record, probe.timestamp_field);
    const parsed = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    if (Number.isFinite(parsed)) observedAtMs = parsed;
  }

  const ageSeconds = Math.max(0, Math.round((now - observedAtMs) / 1000));
  const window = judgeWindow(ageSeconds, probe);
  if (window === "stale") {
    const staleReasons = ["heartbeat_stale"];
    if (record !== null && Array.isArray(record.error_codes)) {
      for (const code of record.error_codes) {
        if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) staleReasons.push(code);
      }
    }
    const result = { state: "stale", reasons: staleReasons, age_seconds: ageSeconds };
    return result;
  }
  if (window === "late") reasons.push("heartbeat_late");

  if (record !== null && typeof probe.status_field === "string") {
    const status = fieldPath(record, probe.status_field);
    const okValues = Array.isArray(probe.ok_values) ? probe.ok_values : ["ok"];
    if (typeof status === "string" && !okValues.includes(status)) {
      reasons.push(`status_${status.replace(/[^a-z0-9_]/giu, "_").slice(0, 32)}`);
    }
  }
  if (record !== null && Array.isArray(probe.degrade_when)) {
    for (const rule of probe.degrade_when) {
      const value = fieldPath(record, rule.field);
      if (Number.isFinite(value) && value > rule.above) {
        reasons.push(`count_${rule.field.split(".").at(-1)}_${value}`);
      }
    }
  }
  // heartbeat record가 안전 코드(error_codes)를 실어 오면 판정 사유로 그대로 노출한다.
  if (record !== null && Array.isArray(record.error_codes)) {
    for (const code of record.error_codes) {
      if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) reasons.push(code);
    }
  }

  if (probe.detail !== undefined) {
    const details = await collectMailAccountDetails(probe.detail);
    reasons.push(...details.reasons);
  }

  let activityState = record?.activity_changed === true ? "collecting"
    : record?.activity_changed === false ? "idle" : null;
  let activityCount;
  let activityNextAt;
  if (record !== null && typeof probe.activity_field === "string") {
    const observedActivityState = fieldPath(record, probe.activity_field);
    if (!probe.activity_values.includes(observedActivityState)) {
      reasons.push("activity_state_invalid");
      activityState = null;
    } else {
      activityState = observedActivityState;
    }
    if (typeof probe.activity_count_field === "string") {
      const observedActivityCount = fieldPath(record, probe.activity_count_field);
      if (!Number.isSafeInteger(observedActivityCount) || observedActivityCount < 0) {
        reasons.push("activity_count_invalid");
      } else {
        activityCount = observedActivityCount;
      }
    }
    if (typeof probe.activity_next_at_field === "string") {
      const observedActivityNextAt = fieldPath(record, probe.activity_next_at_field);
      if (observedActivityNextAt === null) {
        activityNextAt = null;
      } else if (typeof observedActivityNextAt !== "string"
        || !Number.isFinite(Date.parse(observedActivityNextAt))) {
        reasons.push("activity_next_at_invalid");
      } else {
        activityNextAt = observedActivityNextAt;
      }
    }
  }
  return {
    state: reasons.length > 0 ? "degraded" : "ok",
    reasons,
    age_seconds: ageSeconds,
    ...(activityState === null ? {} : { activity_state: activityState }),
    ...(activityCount === undefined ? {} : { activity_count: activityCount }),
    ...(activityNextAt === undefined ? {} : { activity_next_at: activityNextAt }),
  };
}

function trackingReasonCode(node, health) {
  if (health.state === "unmonitored" && TRACKING_REASON_BY_NODE[node.id] !== undefined) {
    return TRACKING_REASON_BY_NODE[node.id];
  }
  const supported = health.reasons.find((reason) => typeof reason === "string" && SAFE_ERROR_CODE.test(reason));
  return supported ?? `health_${health.state}`;
}

function nonGreenTracking(node, health, probe, observedAtMs) {
  const isIndependentEvidenceAbsence = health.state === "unmonitored"
    && ["watchtower_self", "gate_five_field", "store_workmeta"].includes(node.id);
  const isStructuralAbsence = health.state === "unmonitored"
    && (node.probe === null || isIndependentEvidenceAbsence);
  const evidenceOwner = TRACKING_EVIDENCE_OWNER_BY_NODE[node.id]
    ?? (node.health_scope === "provider" ? `${node.provider}_provider_owner`
      : probe !== undefined ? "watchtower_probe"
        : node.probe === null ? "declared_node_owner" : "watchtower_binding_owner");
  const escalationOwner = TRACKING_ESCALATION_OWNER_BY_NODE[node.id]
    ?? (node.health_scope === "provider" ? `${node.provider}_provider_owner`
      : node.probe === null ? "node_owner" : "watchtower_operator");
  const lastCheckedAt = new Date(observedAtMs).toISOString();
  const nextCheckAt = new Date(
    observedAtMs + WATCHTOWER_CHECK_INTERVAL_SECONDS * 1000,
  ).toISOString();
  const nextEvidenceDueAt = probe !== undefined
    && Number.isSafeInteger(probe.period_seconds)
    && Number.isFinite(health.age_seconds)
    ? new Date(
      observedAtMs - health.age_seconds * 1000 + probe.period_seconds * 1000,
    ).toISOString()
    : null;
  return {
    node_id: node.id,
    reason_code: trackingReasonCode(node, health),
    evidence_owner: evidenceOwner,
    last_checked_at: lastCheckedAt,
    next_check_at: nextCheckAt,
    next_evidence_due_at: nextEvidenceDueAt,
    repairability: isStructuralAbsence ? "not_available" : "manual",
    repair_action: null,
    verification_state: health.state === "unmonitored" ? "evidence_absent" : "observed",
    escalation_owner: escalationOwner,
  };
}

export async function composeTopologyHealth(binding, options = {}) {
  validateWatchtowerBinding(binding);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const runSchtasks = typeof options.run_schtasks === "function" ? options.run_schtasks : defaultRunSchtasks;
  const skeleton = topologySkeleton();
  const deliveryOptions = {
    receipts: options.receipts ?? {},
    windows: options.receipt_windows ?? {},
    now,
  };
  const nodes = [];
  const summary = Object.fromEntries(HEALTH_STATES.map((state) => [state, 0]));

  for (const node of skeleton.nodes) {
    let health;
    if (node.probe === null) {
      health = { state: "unmonitored", reasons: [node.unmonitored_reason], age_seconds: null };
    } else {
      const probe = binding.probes[node.probe];
      health = probe === undefined
        ? { state: "unmonitored", reasons: [node.unmonitored_reason, "probe_unbound"], age_seconds: null }
        : await runProbe(probe, { now, run_schtasks: runSchtasks });
    }
    summary[health.state] += 1;
    const projectedNode = {
      id: node.id,
      label: node.label,
      kind: node.kind,
      group: node.group,
      operation_mode: node.operation_mode,
      health_scope: node.health_scope,
      col: node.col,
      row: node.row,
      health,
    };
    if (node.provider !== undefined) projectedNode.provider = node.provider;
    if (health.state !== "ok") {
      projectedNode.tracking = nonGreenTracking(node, health, binding.probes[node.probe], now);
    }
    nodes.push(projectedNode);
  }

  return {
    schema_version: WATCHTOWER_SNAPSHOT_SCHEMA_VERSION,
    observed_at: new Date(now).toISOString(),
    summary,
    nodes,
    edges: skeleton.edges.map((edge) => ({
      ...edge,
      delivery: edgeDeliveryVerdict(edge, deliveryOptions),
    })),
    edge_delivery: summariseEdgeDelivery(skeleton.edges, deliveryOptions),
  };
}

export function assertSnapshotPathFree(snapshot, binding) {
  const text = JSON.stringify(snapshot);
  const leaks = [];
  if (/[A-Za-z]:\\|\\\\[^\\]|\/(?:Users|home|var|tmp|private|Volumes)\//u.test(text)) leaks.push("absolute_path");
  const boundPaths = [binding.state_root];
  for (const probe of Object.values(binding.probes)) {
    if (typeof probe.path === "string") boundPaths.push(probe.path);
    if (typeof probe.detail?.path === "string") boundPaths.push(probe.detail.path);
  }
  if (boundPaths.some((boundPath) => typeof boundPath === "string" && boundPath.length > 3 && text.includes(boundPath))) {
    leaks.push("probe_path");
  }
  const prohibitedKeys = /^(?:prompt|reasoning|tool_(?:input|output)|transcript(?:_path)?|session_path|source_path|cwd)$/u;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (prohibitedKeys.test(key)) leaks.push("raw_field");
      visit(child);
    }
  }
  visit(snapshot);
  if (leaks.length > 0) fail("snapshot_path_leak", [...new Set(leaks)].join(","));
  return snapshot;
}

export async function writeTopologyHealthSnapshot(binding, snapshot) {
  const target = join(binding.state_root, "snapshot", "topology_health.v2.json");
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(snapshot, null, 2), "utf8");
  await rename(temp, target);
  return target;
}
