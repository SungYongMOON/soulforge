import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const BINDING_SCHEMA_VERSION = "soulforge.backup_controller.binding.v1";
export const STATE_SCHEMA_VERSION = "soulforge.backup_controller.state.v2";
export const RESULT_SCHEMA_VERSION = "soulforge.backup_controller.result.v1";

export const STAGE_IDS = Object.freeze([
  "hpp_snapshot",
  "workspace_copy",
  "erp_backup",
  "health",
  "weekly_restore",
]);

export const DAILY_CYCLE_STAGE_IDS = Object.freeze([
  "hpp_snapshot",
  "erp_backup",
  "health",
  "weekly_restore",
  "workspace_copy",
]);

export const STAGE_COMMAND_IDS = Object.freeze({
  hpp_snapshot: "hpp_snapshot_v1",
  workspace_copy: "workspace_copy_v1",
  erp_backup: "erp_backup_v1",
  health: "backup_health_v1",
  weekly_restore: "isolated_restore_v1",
});

export const RESOURCE_KINDS = Object.freeze({
  hpp_data_root: "directory",
  hpp_recovery_policy: "pinned_file",
  hpp_restore_test_root: "directory",
  runtime_checkout_root: "directory",
  workspace_root: "onedrive_cloud_directory",
  erp_db_file: "file",
  project_metadata_root: "directory",
  cross_project_state_root: "directory",
  nas_hpp_backup_root: "raidrive_network_directory",
  nas_workspace_backup_root: "raidrive_network_directory",
  nas_erp_backup_root: "raidrive_network_directory",
  nas_restore_root: "raidrive_network_directory",
  nas_report_root: "raidrive_network_directory",
});

const STAGE_RESOURCE_IDS = Object.freeze({
  hpp_snapshot: Object.freeze(["runtime_checkout_root", "hpp_data_root", "hpp_recovery_policy", "hpp_restore_test_root", "nas_hpp_backup_root", "nas_report_root"]),
  workspace_copy: Object.freeze(["runtime_checkout_root", "workspace_root", "nas_workspace_backup_root", "nas_report_root"]),
  erp_backup: Object.freeze(["runtime_checkout_root", "erp_db_file", "project_metadata_root", "cross_project_state_root", "nas_erp_backup_root", "nas_report_root"]),
  health: Object.freeze(["runtime_checkout_root", "nas_hpp_backup_root", "nas_workspace_backup_root", "nas_erp_backup_root", "nas_restore_root", "nas_report_root"]),
  weekly_restore: Object.freeze(["runtime_checkout_root", "hpp_recovery_policy", "hpp_restore_test_root", "nas_hpp_backup_root", "nas_workspace_backup_root", "nas_erp_backup_root", "nas_restore_root", "nas_report_root"]),
});

const DAY_INDEX = Object.freeze({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 });
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SECRET_LIKE_SEGMENT = /^(?:\.env(?:\..*)?|secrets?|credentials?|tokens?|cookies?|auth|\.codex|config\.toml)$/i;
const LEDGER_NAME = "backup-controller.state.json";
const LEASE_NAME = "backup-controller.tick.lease";
const LEASE_SCHEMA_VERSION = "soulforge.backup_controller.lease.v2";

export class BackupControllerError extends Error {
  constructor(code) {
    super(code);
    this.name = "BackupControllerError";
    this.code = code;
  }
}

function fail(code) {
  throw new BackupControllerError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireIso(value, code) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function requireInteger(value, min, max, code) {
  if (!Number.isInteger(value) || value < min || value > max) fail(code);
  return value;
}

function assertSafeAbsolutePath(value, code) {
  if (typeof value !== "string" || !path.isAbsolute(value)) fail(code);
  const segments = path.resolve(value).split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => SECRET_LIKE_SEGMENT.test(segment))) fail("secret_like_path_rejected");
  return path.resolve(value);
}

function requireSafeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function requireSafeRef(value, code) {
  if (typeof value !== "string" || !SAFE_REF.test(value)) fail(code);
  return value;
}

function validateStage(stage) {
  exactKeys(stage, ["stage_id", "cadence", "local_time", "deadline_minutes", "max_runtime_seconds", "command_id", ...(stage?.cadence === "weekly" ? ["day_of_week"] : [])], "binding_stage_shape_invalid");
  if (!STAGE_IDS.includes(stage.stage_id)) fail("binding_stage_id_invalid");
  if (stage.cadence !== "daily" && stage.cadence !== "weekly") fail("binding_stage_cadence_invalid");
  const expectedCadence = stage.stage_id === "weekly_restore" ? "weekly" : "daily";
  if (stage.cadence !== expectedCadence) fail("binding_stage_cadence_invalid");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(stage.local_time)) fail("binding_stage_time_invalid");
  requireInteger(stage.deadline_minutes, 1, 10080, "binding_stage_deadline_invalid");
  requireInteger(stage.max_runtime_seconds, 1, 86400, "binding_stage_runtime_invalid");
  if (stage.max_runtime_seconds > stage.deadline_minutes * 60) fail("binding_stage_runtime_exceeds_deadline");
  if (stage.command_id !== STAGE_COMMAND_IDS[stage.stage_id]) fail("binding_stage_command_invalid");
  if (stage.cadence === "weekly" && !Object.hasOwn(DAY_INDEX, stage.day_of_week)) fail("binding_stage_day_invalid");
}

export function validateBinding(binding) {
  exactKeys(binding, ["schema_version", "controller_id", "feature_state", "automation", "writer", "mac", "state_root", "resources", "activation", "stages"], "binding_shape_invalid");
  if (binding.schema_version !== BINDING_SCHEMA_VERSION) fail("binding_schema_invalid");
  if (binding.controller_id !== "soulforge-backup-controller") fail("binding_controller_id_invalid");
  if (binding.feature_state !== "off" && binding.feature_state !== "on") fail("binding_feature_state_invalid");

  if (binding.automation?.mode === "hourly_tick") {
    exactKeys(binding.automation, ["name", "mode", "minute", "timezone", "ignore_new"], "binding_automation_invalid");
    requireInteger(binding.automation.minute, 0, 59, "binding_automation_minute_invalid");
  } else if (binding.automation?.mode === "daily_cycle") {
    exactKeys(binding.automation, ["name", "mode", "local_time", "timezone", "ignore_new"], "binding_automation_invalid");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(binding.automation.local_time)) fail("binding_automation_time_invalid");
  } else {
    fail("binding_automation_invalid");
  }
  if (binding.automation.name !== "Soulforge Backup Controller" || binding.automation.timezone !== "Asia/Seoul" || binding.automation.ignore_new !== true) fail("binding_automation_invalid");

  exactKeys(binding.writer, ["node_id", "hostname", "platform", "role", "mode"], "binding_writer_invalid");
  requireSafeId(binding.writer.node_id, "binding_writer_node_invalid");
  requireSafeId(binding.writer.hostname, "binding_writer_hostname_invalid");
  if (binding.writer.platform !== "win32" || binding.writer.role !== "hpp" || binding.writer.mode !== "writer") fail("binding_writer_invalid");

  exactKeys(binding.mac, ["node_id", "mode", "takeover_allowed"], "binding_mac_invalid");
  requireSafeId(binding.mac.node_id, "binding_mac_node_invalid");
  if (!new Set(["monitor_only", "fallback_hold"]).has(binding.mac.mode) || binding.mac.takeover_allowed !== false) fail("binding_mac_invalid");
  if (binding.mac.node_id === binding.writer.node_id) fail("binding_node_overlap");

  binding.state_root = assertSafeAbsolutePath(binding.state_root, "binding_state_root_invalid");
  exactKeys(binding.resources, Object.keys(RESOURCE_KINDS), "binding_resources_invalid");
  for (const [resourceId, expectedKind] of Object.entries(RESOURCE_KINDS)) {
    const resource = binding.resources[resourceId];
    const extraKeys = expectedKind === "pinned_file"
      ? ["sha256"]
      : expectedKind === "onedrive_cloud_directory"
        ? ["reparse_profile"]
        : expectedKind === "raidrive_network_directory"
          ? ["unc_prefix"]
        : [];
    exactKeys(resource, ["kind", "path", ...extraKeys], "binding_resource_shape_invalid");
    if (resource.kind !== expectedKind) fail("binding_resource_kind_invalid");
    resource.path = assertSafeAbsolutePath(resource.path, "binding_resource_path_invalid");
    if (expectedKind === "pinned_file" && (typeof resource.sha256 !== "string" || !SHA256.test(resource.sha256))) fail("binding_resource_digest_invalid");
    if (expectedKind === "onedrive_cloud_directory" && resource.reparse_profile !== "microsoft_onedrive_cloud_0x9000601a") fail("binding_resource_profile_invalid");
    if (expectedKind === "raidrive_network_directory") {
      if (typeof resource.unc_prefix !== "string" || !/^\\\\RaiDrive-[A-Za-z0-9._-]+\\[A-Za-z0-9 $._-]+$/.test(resource.unc_prefix)) fail("binding_resource_unc_prefix_invalid");
      const relative = path.relative(path.resolve(resource.unc_prefix), resource.path);
      if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) fail("binding_resource_unc_path_invalid");
    }
  }
  exactKeys(binding.activation, ["approval_ref", "not_before", "seed_receipts"], "binding_activation_invalid");
  requireSafeRef(binding.activation.approval_ref, "binding_approval_ref_invalid");
  requireIso(binding.activation.not_before, "binding_not_before_invalid");
  exactKeys(binding.activation.seed_receipts, STAGE_IDS, "binding_seed_receipts_invalid");
  for (const stageId of STAGE_IDS) {
    const receipt = binding.activation.seed_receipts[stageId];
    if (receipt !== null) {
      exactKeys(receipt, ["period_key", "completed_at", "receipt_sha256"], "binding_seed_receipt_invalid");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.period_key)) fail("binding_seed_receipt_invalid");
      requireIso(receipt.completed_at, "binding_seed_receipt_invalid");
      if (typeof receipt.receipt_sha256 !== "string" || !SHA256.test(receipt.receipt_sha256)) fail("binding_seed_receipt_invalid");
      if (Date.parse(receipt.completed_at) > Date.parse(binding.activation.not_before)) fail("binding_seed_receipt_after_not_before");
    }
  }

  if (!Array.isArray(binding.stages) || binding.stages.length !== STAGE_IDS.length) fail("binding_stages_invalid");
  for (const stage of binding.stages) validateStage(stage);
  const ids = binding.stages.map((stage) => stage.stage_id).sort();
  if (ids.some((id, index) => id !== [...STAGE_IDS].sort()[index])) fail("binding_stage_set_invalid");
  const hourlySlots = new Set();
  for (const stage of binding.stages) {
    const [, minute] = stage.local_time.split(":").map(Number);
    if (binding.automation.mode === "hourly_tick" && minute !== binding.automation.minute) fail("binding_stage_tick_alignment_invalid");
    if (binding.automation.mode === "hourly_tick" && hourlySlots.has(stage.local_time)) fail("binding_stage_tick_collision");
    hourlySlots.add(stage.local_time);
    if (binding.automation.mode === "daily_cycle" && stage.local_time !== binding.automation.local_time) fail("binding_daily_cycle_time_mismatch");
    if (stage.cadence === "daily" && stage.deadline_minutes > 1440) fail("binding_daily_deadline_overlaps_period");
    const receipt = binding.activation.seed_receipts[stage.stage_id];
    if (receipt !== null) {
      const period = parsePeriodKey(receipt.period_key);
      if (stage.cadence === "weekly" && period.dayIndex !== DAY_INDEX[stage.day_of_week]) fail("binding_seed_period_invalid");
      if (dueInstant(period, stage.local_time).getTime() > Date.parse(receipt.completed_at)) fail("binding_seed_receipt_before_due");
    }
  }
  return binding;
}

export async function loadBinding(bindingRef) {
  const resolved = assertSafeAbsolutePath(bindingRef, "binding_ref_invalid");
  let bytes;
  try {
    bytes = await readFile(resolved);
  } catch {
    fail("binding_read_failed");
  }
  let binding;
  try {
    binding = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("binding_json_invalid");
  }
  validateBinding(binding);
  return {
    binding,
    binding_sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function kstParts(instant) {
  const shifted = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayIndex: shifted.getUTCDay(),
  };
}

function localDateShift(parts, days) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), dayIndex: shifted.getUTCDay() };
}

function dateKey(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function parsePeriodKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("binding_seed_period_invalid");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const parts = { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate(), dayIndex: parsed.getUTCDay() };
  if (dateKey(parts) !== value) fail("binding_seed_period_invalid");
  return parts;
}

function dueInstant(parts, localTime) {
  const [hour, minute] = localTime.split(":").map(Number);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute));
}

function latestOccurrence(stage, now) {
  let parts = kstParts(now);
  if (stage.cadence === "weekly") {
    parts = localDateShift(parts, -((parts.dayIndex - DAY_INDEX[stage.day_of_week] + 7) % 7));
  }
  let dueAt = dueInstant(parts, stage.local_time);
  if (dueAt > now) {
    parts = localDateShift(parts, stage.cadence === "daily" ? -1 : -7);
    dueAt = dueInstant(parts, stage.local_time);
  }
  return {
    period_key: dateKey(parts),
    due_at: dueAt.toISOString(),
    deadline_at: new Date(dueAt.getTime() + stage.deadline_minutes * 60_000).toISOString(),
  };
}

function initialStageState(receipt) {
  const period = receipt?.period_key ?? null;
  return {
    status: period ? "seeded" : "never",
    last_period_key: period,
    last_receipt_at: receipt?.completed_at ?? null,
    last_receipt_sha256: receipt?.receipt_sha256 ?? null,
    attempt: 0,
    checkpoint: null,
    last_error_code: null,
  };
}

function createSeedLedger(binding, bindingSha256, now) {
  const stages = {};
  for (const stageId of STAGE_IDS) {
    stages[stageId] = initialStageState(binding.activation.seed_receipts[stageId]);
  }
  return {
    schema_version: STATE_SCHEMA_VERSION,
    controller_id: binding.controller_id,
    binding_sha256: bindingSha256,
    approval_ref_sha256: createHash("sha256").update(binding.activation.approval_ref).digest("hex"),
    not_before: binding.activation.not_before,
    seeded_at: now.toISOString(),
    revision: 1,
    stages,
  };
}

function validateStageState(value) {
  exactKeys(value, ["status", "last_period_key", "last_receipt_at", "last_receipt_sha256", "attempt", "checkpoint", "last_error_code"], "state_stage_shape_invalid");
  if (!new Set(["never", "seeded", "running", "succeeded", "failed", "skipped_deadline"]).has(value.status)) fail("state_stage_status_invalid");
  if (value.last_period_key !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value.last_period_key)) fail("state_stage_period_invalid");
  if (value.last_receipt_at !== null) requireIso(value.last_receipt_at, "state_stage_receipt_invalid");
  if (value.last_receipt_sha256 !== null && (typeof value.last_receipt_sha256 !== "string" || !SHA256.test(value.last_receipt_sha256))) fail("state_stage_receipt_invalid");
  requireInteger(value.attempt, 0, Number.MAX_SAFE_INTEGER, "state_stage_attempt_invalid");
  if (value.last_error_code !== null && (typeof value.last_error_code !== "string" || !SAFE_ID.test(value.last_error_code))) fail("state_stage_error_invalid");
  if (value.checkpoint !== null) {
    exactKeys(value.checkpoint, ["phase", "period_key", "attempt", "started_at", "deadline_at", "operation_key", "fence_token"], "state_checkpoint_invalid");
    if (!new Set(["executing", "retry_pending", "complete", "deadline_skipped"]).has(value.checkpoint.phase)) fail("state_checkpoint_invalid");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.checkpoint.period_key)) fail("state_checkpoint_invalid");
    requireInteger(value.checkpoint.attempt, 0, Number.MAX_SAFE_INTEGER, "state_checkpoint_invalid");
    requireIso(value.checkpoint.started_at, "state_checkpoint_invalid");
    requireIso(value.checkpoint.deadline_at, "state_checkpoint_invalid");
    if (typeof value.checkpoint.operation_key !== "string" || !/^backup-operation-[a-f0-9]{64}$/.test(value.checkpoint.operation_key)) fail("state_checkpoint_invalid");
    if (typeof value.checkpoint.fence_token !== "string" || !/^[a-f0-9-]{36}$/.test(value.checkpoint.fence_token)) fail("state_checkpoint_invalid");
  }
}

export function validateStateLedger(state, binding, bindingSha256) {
  exactKeys(state, ["schema_version", "controller_id", "binding_sha256", "approval_ref_sha256", "not_before", "seeded_at", "revision", "stages"], "state_shape_invalid");
  if (state.schema_version !== STATE_SCHEMA_VERSION || state.controller_id !== binding.controller_id) fail("state_schema_invalid");
  if (state.binding_sha256 !== bindingSha256) fail("state_binding_digest_mismatch");
  if (state.approval_ref_sha256 !== createHash("sha256").update(binding.activation.approval_ref).digest("hex")) fail("state_approval_mismatch");
  if (state.not_before !== binding.activation.not_before) fail("state_not_before_mismatch");
  requireIso(state.seeded_at, "state_seeded_at_invalid");
  requireInteger(state.revision, 1, Number.MAX_SAFE_INTEGER, "state_revision_invalid");
  exactKeys(state.stages, STAGE_IDS, "state_stages_invalid");
  for (const stageId of STAGE_IDS) validateStageState(state.stages[stageId]);
  return state;
}

function ledgerRef(binding) {
  return path.join(binding.state_root, LEDGER_NAME);
}

async function readLedger(binding, bindingSha256, { optional = false } = {}) {
  let raw;
  try {
    raw = await readFile(ledgerRef(binding), "utf8");
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    fail("state_read_failed");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("state_json_invalid");
  }
  return validateStateLedger(parsed, binding, bindingSha256);
}

async function persistLedger(binding, state) {
  const temporary = path.join(binding.state_root, `.backup-controller.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, ledgerRef(binding));
  } catch {
    await unlink(temporary).catch(() => {});
    fail("state_write_failed");
  }
}

function defaultPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function validateLeaseRecord(value) {
  exactKeys(value, ["schema_version", "token", "operation_key", "hostname", "platform", "pid", "created_at", "deadline_at"], "lease_record_invalid");
  if (value.schema_version !== LEASE_SCHEMA_VERSION || typeof value.token !== "string" || !/^[a-f0-9-]{36}$/.test(value.token)) fail("lease_record_invalid");
  if (typeof value.operation_key !== "string" || !/^[a-z0-9][a-z0-9._-]{7,127}$/.test(value.operation_key)) fail("lease_record_invalid");
  requireSafeId(value.hostname, "lease_record_invalid");
  if (value.platform !== "win32" || !Number.isInteger(value.pid) || value.pid < 1) fail("lease_record_invalid");
  requireIso(value.created_at, "lease_record_invalid");
  requireIso(value.deadline_at, "lease_record_invalid");
  if (Date.parse(value.deadline_at) <= Date.parse(value.created_at)) fail("lease_record_invalid");
  return value;
}

async function acquireLease(binding, now, {
  operationKey = "backup-controller-hourly-tick",
  deadlineAt = new Date(now.getTime() + 60 * 60_000),
  hostname = binding.writer.hostname,
  platform = binding.writer.platform,
  pid = process.pid,
  isPidAlive = defaultPidAlive,
} = {}) {
  const leaseRef = path.join(binding.state_root, LEASE_NAME);
  const fenceToken = randomUUID();
  const record = {
    schema_version: LEASE_SCHEMA_VERSION,
    token: fenceToken,
    operation_key: operationKey,
    hostname: String(hostname).toLowerCase(),
    platform,
    pid,
    created_at: now.toISOString(),
    deadline_at: deadlineAt.toISOString(),
  };
  validateLeaseRecord(record);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = await open(leaseRef, "wx");
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
      await handle.close();
      return {
        fence_token: fenceToken,
        operation_key: operationKey,
        release: async () => {
          try {
            const current = validateLeaseRecord(JSON.parse(await readFile(leaseRef, "utf8")));
            if (current.token === fenceToken && current.operation_key === operationKey) await unlink(leaseRef);
          } catch {
            // Never remove an unreadable, replaced, or foreign lease.
          }
        },
      };
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error?.code !== "EEXIST") fail("lease_acquire_failed");
      if (attempt > 0) return null;
      let existing;
      try {
        existing = validateLeaseRecord(JSON.parse(await readFile(leaseRef, "utf8")));
      } catch {
        return null;
      }
      const sameHost = existing.hostname === record.hostname && existing.platform === record.platform;
      const expired = Date.parse(existing.deadline_at) < now.getTime();
      if (!sameHost || !expired || await isPidAlive(existing.pid)) return null;
      try {
        const confirmed = validateLeaseRecord(JSON.parse(await readFile(leaseRef, "utf8")));
        if (confirmed.token !== existing.token || confirmed.operation_key !== existing.operation_key) return null;
        await unlink(leaseRef);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function result(operation, mode, status, bindingSha256, now, extra = {}) {
  return {
    schema_version: RESULT_SCHEMA_VERSION,
    operation,
    mode,
    status,
    binding_sha256: bindingSha256,
    observed_at: now.toISOString(),
    selected_stage: null,
    period_key: null,
    checkpoint_status: null,
    write_performed: false,
    command_dispatched: false,
    ...extra,
  };
}

function authorizeApply(binding, actualDigest, expectedDigest, approvalRef) {
  if (typeof expectedDigest !== "string" || !SHA256.test(expectedDigest)) fail("expected_binding_digest_required");
  if (expectedDigest !== actualDigest) fail("binding_digest_mismatch");
  if (typeof approvalRef !== "string" || approvalRef !== binding.activation.approval_ref) fail("approval_ref_mismatch");
}

function normalizeNow(value) {
  const now = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(now.getTime())) fail("now_invalid");
  return now;
}

export async function seedController({ bindingRef, apply = false, expectedBindingSha256, approvalRef, now: nowInput } = {}) {
  const now = normalizeNow(nowInput);
  const { binding, binding_sha256: bindingSha256 } = await loadBinding(bindingRef);
  if (!apply) return result("seed", "dry_run", binding.feature_state === "on" ? "would_seed" : "feature_off", bindingSha256, now);
  authorizeApply(binding, bindingSha256, expectedBindingSha256, approvalRef);
  if (binding.feature_state !== "on") return result("seed", "apply", "feature_off", bindingSha256, now);
  await mkdir(binding.state_root, { recursive: true });
  const lease = await acquireLease(binding, now);
  if (!lease) return result("seed", "apply", "ignore_new_lease_held", bindingSha256, now, { checkpoint_status: "held" });
  try {
    const existing = await readLedger(binding, bindingSha256, { optional: true });
    if (existing) return result("seed", "apply", "already_seeded", bindingSha256, now, { checkpoint_status: "seeded" });
    const ledger = createSeedLedger(binding, bindingSha256, now);
    await persistLedger(binding, ledger);
    return result("seed", "apply", "seeded", bindingSha256, now, { checkpoint_status: "seeded", write_performed: true });
  } finally {
    await lease.release();
  }
}

function chooseStage(binding, state, now) {
  for (const stageId of STAGE_IDS) {
    const stage = binding.stages.find((item) => item.stage_id === stageId);
    const occurrence = latestOccurrence(stage, now);
    if (new Date(occurrence.due_at) < new Date(binding.activation.not_before)) continue;
    const stageState = state.stages[stageId];
    if (stageState.last_period_key === occurrence.period_key && stageState.status !== "failed") continue;
    const latestSafeStart = new Date(occurrence.deadline_at).getTime() - stage.max_runtime_seconds * 1000;
    return { stage, occurrence, action: now.getTime() > latestSafeStart ? "skip_deadline" : "execute" };
  }
  return null;
}

function safeErrorCode(error) {
  const candidate = typeof error?.code === "string" ? error.code.toLowerCase() : "stage_failed";
  return SAFE_ID.test(candidate) ? candidate : "stage_failed";
}

function operationKey(bindingSha256, stageId, periodKey) {
  return `backup-operation-${createHash("sha256").update(`${bindingSha256}\0${stageId}\0${periodKey}`).digest("hex")}`;
}

function executorResources(binding, stageId) {
  return Object.freeze(Object.fromEntries(STAGE_RESOURCE_IDS[stageId].map((resourceId) => {
    const resource = binding.resources[resourceId];
    return [resourceId, Object.freeze({ ...resource })];
  })));
}

async function reconcileRunningStage({ binding, bindingSha256, ledger, stage, now, receiptReconciler }) {
  const stageState = ledger.stages[stage.stage_id];
  if (stageState.status !== "running" || typeof receiptReconciler !== "function") return null;
  const checkpoint = stageState.checkpoint;
  const reconciled = await receiptReconciler(Object.freeze({
    stage_id: stage.stage_id,
    command_id: stage.command_id,
    operation_key: checkpoint.operation_key,
    expected_fence_token: checkpoint.fence_token,
    resources: executorResources(binding, stage.stage_id),
    period_key: checkpoint.period_key,
  }));
  if (reconciled === null || reconciled === undefined) return null;
  if (!isRecord(reconciled) || reconciled.ok !== true || typeof reconciled.receipt_sha256 !== "string" || !SHA256.test(reconciled.receipt_sha256)) fail("external_receipt_reconciliation_invalid");
  const receiptAt = requireIso(reconciled.receipt_at, "external_receipt_reconciliation_invalid");
  ledger.stages[stage.stage_id] = {
    ...stageState,
    status: "succeeded",
    last_period_key: checkpoint.period_key,
    last_receipt_at: receiptAt,
    last_receipt_sha256: reconciled.receipt_sha256,
    checkpoint: { ...checkpoint, phase: "complete" },
    last_error_code: null,
  };
  ledger.revision += 1;
  await persistLedger(binding, ledger);
  return { status: "succeeded_reconciled", selected_stage: stage.stage_id, period_key: checkpoint.period_key, checkpoint_status: "complete", write_performed: true, command_dispatched: false };
}

async function executeStageForCycle({ binding, bindingSha256, ledger, stage, occurrence, now, lease, executors, receiptReconciler }) {
  const stageState = ledger.stages[stage.stage_id];
  if (stageState.status === "running") {
    const reconciled = await reconcileRunningStage({ binding, bindingSha256, ledger, stage, now, receiptReconciler });
    if (reconciled) return reconciled;
    return { status: "resume_required", selected_stage: stage.stage_id, period_key: stageState.checkpoint?.period_key ?? null, checkpoint_status: "executing", write_performed: false, command_dispatched: false };
  }
  if (stageState.last_period_key === occurrence.period_key && stageState.status !== "failed") {
    return { status: "already_complete", selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: stageState.status, write_performed: false, command_dispatched: false };
  }

  const stageOperationKey = operationKey(bindingSha256, stage.stage_id, occurrence.period_key);
  const latestSafeStart = Date.parse(occurrence.deadline_at) - stage.max_runtime_seconds * 1000;
  if (now.getTime() > latestSafeStart) {
    const attempt = stageState.attempt;
    ledger.stages[stage.stage_id] = {
      status: "skipped_deadline",
      last_period_key: occurrence.period_key,
      last_receipt_at: now.toISOString(),
      last_receipt_sha256: null,
      attempt,
      checkpoint: { phase: "deadline_skipped", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
      last_error_code: "deadline_gate",
    };
    ledger.revision += 1;
    await persistLedger(binding, ledger);
    return { status: "skipped_deadline", selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "deadline_skipped", write_performed: true, command_dispatched: false };
  }

  const executor = executors[stage.command_id];
  if (typeof executor !== "function") return { status: "executor_unavailable", selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "not_started", write_performed: false, command_dispatched: false };
  const attempt = stageState.status === "failed" && stageState.checkpoint?.period_key === occurrence.period_key ? stageState.attempt + 1 : 1;
  ledger.stages[stage.stage_id] = {
    status: "running",
    last_period_key: stageState.last_period_key,
    last_receipt_at: stageState.last_receipt_at,
    last_receipt_sha256: stageState.last_receipt_sha256,
    attempt,
    checkpoint: { phase: "executing", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
    last_error_code: null,
  };
  ledger.revision += 1;
  await persistLedger(binding, ledger);

  let deadlineTimer;
  try {
    const abortController = new AbortController();
    const budgetMilliseconds = Math.max(1, Math.min(stage.max_runtime_seconds * 1000, Date.parse(occurrence.deadline_at) - now.getTime()));
    deadlineTimer = setTimeout(() => abortController.abort(), budgetMilliseconds);
    deadlineTimer.unref?.();
    const execution = await executor(Object.freeze({
      stage_id: stage.stage_id,
      command_id: stage.command_id,
      operation_key: stageOperationKey,
      previous_fence_token: stageState.checkpoint?.fence_token ?? null,
      fence_token: lease.fence_token,
      signal: abortController.signal,
      resources: executorResources(binding, stage.stage_id),
      period_key: occurrence.period_key,
      attempt,
      deadline_at: occurrence.deadline_at,
      max_runtime_seconds: stage.max_runtime_seconds,
    }));
    if (abortController.signal.aborted) fail("executor_deadline_exceeded");
    if (!isRecord(execution) || execution.ok !== true || typeof execution.receipt_sha256 !== "string" || !SHA256.test(execution.receipt_sha256)) fail("executor_receipt_invalid");
    const receiptAt = execution.receipt_at === undefined ? now.toISOString() : requireIso(execution.receipt_at, "executor_receipt_invalid");
    ledger.stages[stage.stage_id] = {
      status: "succeeded",
      last_period_key: occurrence.period_key,
      last_receipt_at: receiptAt,
      last_receipt_sha256: execution.receipt_sha256,
      attempt,
      checkpoint: { phase: "complete", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
      last_error_code: null,
    };
    ledger.revision += 1;
    await persistLedger(binding, ledger);
    return { status: "succeeded", selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "complete", write_performed: true, command_dispatched: true };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    ledger.stages[stage.stage_id] = {
      status: "failed",
      last_period_key: stageState.last_period_key,
      last_receipt_at: stageState.last_receipt_at,
      last_receipt_sha256: stageState.last_receipt_sha256,
      attempt,
      checkpoint: { phase: "retry_pending", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
      last_error_code: errorCode,
    };
    ledger.revision += 1;
    await persistLedger(binding, ledger);
    return { status: "failed_retry_pending", selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "retry_pending", write_performed: true, command_dispatched: true, error_code: errorCode };
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

export async function tickController({ bindingRef, apply = false, expectedBindingSha256, approvalRef, now: nowInput, executors = {}, receiptReconciler } = {}) {
  const now = normalizeNow(nowInput);
  const { binding, binding_sha256: bindingSha256 } = await loadBinding(bindingRef);
  if (!apply) {
    if (binding.feature_state === "off") return result("tick", "dry_run", "feature_off", bindingSha256, now);
    const ledger = await readLedger(binding, bindingSha256, { optional: true });
    if (!ledger) return result("tick", "dry_run", "state_unseeded", bindingSha256, now);
    const running = STAGE_IDS.find((stageId) => ledger.stages[stageId].status === "running");
    if (running) return result("tick", "dry_run", "resume_required", bindingSha256, now, { selected_stage: running, period_key: ledger.stages[running].checkpoint?.period_key ?? null, checkpoint_status: "executing" });
    const chosen = chooseStage(binding, ledger, now);
    return chosen
      ? result("tick", "dry_run", chosen.action === "execute" ? "would_run" : "would_skip_deadline", bindingSha256, now, { selected_stage: chosen.stage.stage_id, period_key: chosen.occurrence.period_key, checkpoint_status: chosen.action })
      : result("tick", "dry_run", "no_due_stage", bindingSha256, now);
  }

  authorizeApply(binding, bindingSha256, expectedBindingSha256, approvalRef);
  if (binding.feature_state !== "on") return result("tick", "apply", "feature_off", bindingSha256, now);
  const lease = await acquireLease(binding, now);
  if (!lease) return result("tick", "apply", "ignore_new_lease_held", bindingSha256, now, { checkpoint_status: "held" });
  try {
    const ledger = await readLedger(binding, bindingSha256);
    const running = STAGE_IDS.find((stageId) => ledger.stages[stageId].status === "running");
    if (running) {
      const stage = binding.stages.find((item) => item.stage_id === running);
      const reconciled = await reconcileRunningStage({ binding, bindingSha256, ledger, stage, now, receiptReconciler });
      if (reconciled) return result("tick", "apply", reconciled.status, bindingSha256, now, reconciled);
      return result("tick", "apply", "resume_required", bindingSha256, now, { selected_stage: running, period_key: ledger.stages[running].checkpoint?.period_key ?? null, checkpoint_status: "executing" });
    }

    const chosen = chooseStage(binding, ledger, now);
    if (!chosen) return result("tick", "apply", "no_due_stage", bindingSha256, now);
    const { stage, occurrence, action } = chosen;
    const stageState = ledger.stages[stage.stage_id];

    if (action === "skip_deadline") {
      const attempt = stageState.attempt;
      const stageOperationKey = operationKey(bindingSha256, stage.stage_id, occurrence.period_key);
      ledger.stages[stage.stage_id] = {
        status: "skipped_deadline",
        last_period_key: occurrence.period_key,
        last_receipt_at: now.toISOString(),
        last_receipt_sha256: null,
        attempt,
        checkpoint: { phase: "deadline_skipped", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
        last_error_code: "deadline_gate",
      };
      ledger.revision += 1;
      await persistLedger(binding, ledger);
      return result("tick", "apply", "skipped_deadline", bindingSha256, now, { selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "deadline_skipped", write_performed: true });
    }

    const executor = executors[stage.command_id];
    if (typeof executor !== "function") return result("tick", "apply", "executor_unavailable", bindingSha256, now, { selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "not_started" });

    const attempt = stageState.status === "failed" && stageState.checkpoint?.period_key === occurrence.period_key ? stageState.attempt + 1 : 1;
    const stageOperationKey = operationKey(bindingSha256, stage.stage_id, occurrence.period_key);
    ledger.stages[stage.stage_id] = {
      status: "running",
      last_period_key: stageState.last_period_key,
      last_receipt_at: stageState.last_receipt_at,
      last_receipt_sha256: stageState.last_receipt_sha256,
      attempt,
      checkpoint: { phase: "executing", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
      last_error_code: null,
    };
    ledger.revision += 1;
    await persistLedger(binding, ledger);

    let deadlineTimer;
    try {
      const abortController = new AbortController();
      const budgetMilliseconds = Math.max(1, Math.min(
        stage.max_runtime_seconds * 1000,
        Date.parse(occurrence.deadline_at) - now.getTime(),
      ));
      deadlineTimer = setTimeout(() => abortController.abort(), budgetMilliseconds);
      deadlineTimer.unref?.();
      const execution = await executor(Object.freeze({
        stage_id: stage.stage_id,
        command_id: stage.command_id,
        operation_key: stageOperationKey,
        previous_fence_token: stageState.checkpoint?.fence_token ?? null,
        fence_token: lease.fence_token,
        signal: abortController.signal,
        resources: executorResources(binding, stage.stage_id),
        period_key: occurrence.period_key,
        attempt,
        deadline_at: occurrence.deadline_at,
        max_runtime_seconds: stage.max_runtime_seconds,
      }));
      if (abortController.signal.aborted) fail("executor_deadline_exceeded");
      if (!isRecord(execution) || execution.ok !== true) fail("executor_receipt_invalid");
      const receiptAt = execution.receipt_at === undefined ? now.toISOString() : requireIso(execution.receipt_at, "executor_receipt_invalid");
      if (typeof execution.receipt_sha256 !== "string" || !SHA256.test(execution.receipt_sha256)) fail("executor_receipt_invalid");
      ledger.stages[stage.stage_id] = {
        status: "succeeded",
        last_period_key: occurrence.period_key,
        last_receipt_at: receiptAt,
        last_receipt_sha256: execution.receipt_sha256,
        attempt,
        checkpoint: { phase: "complete", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
        last_error_code: null,
      };
      ledger.revision += 1;
      await persistLedger(binding, ledger);
      return result("tick", "apply", "succeeded", bindingSha256, now, { selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "complete", write_performed: true, command_dispatched: true });
    } catch (error) {
      const errorCode = safeErrorCode(error);
      ledger.stages[stage.stage_id] = {
        status: "failed",
        last_period_key: stageState.last_period_key,
        last_receipt_at: stageState.last_receipt_at,
        last_receipt_sha256: stageState.last_receipt_sha256,
        attempt,
        checkpoint: { phase: "retry_pending", period_key: occurrence.period_key, attempt, started_at: now.toISOString(), deadline_at: occurrence.deadline_at, operation_key: stageOperationKey, fence_token: lease.fence_token },
        last_error_code: errorCode,
      };
      ledger.revision += 1;
      await persistLedger(binding, ledger);
      return result("tick", "apply", "failed_retry_pending", bindingSha256, now, { selected_stage: stage.stage_id, period_key: occurrence.period_key, checkpoint_status: "retry_pending", write_performed: true, command_dispatched: true, error_code: errorCode });
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  } finally {
    await lease.release();
  }
}

function isWeeklyStageDueToday(stage, now) {
  if (stage.cadence !== "weekly") return true;
  const today = kstParts(now);
  return today.dayIndex === DAY_INDEX[stage.day_of_week] && dueInstant(today, stage.local_time) <= now;
}

export async function dailyCycleController({ bindingRef, apply = false, expectedBindingSha256, approvalRef, now: nowInput, executors = {}, receiptReconciler, leaseRuntime = {} } = {}) {
  const now = normalizeNow(nowInput);
  const { binding, binding_sha256: bindingSha256 } = await loadBinding(bindingRef);
  if (binding.automation.mode !== "daily_cycle") fail("daily_cycle_mode_required");
  if (!apply) return result("daily_cycle", "dry_run", binding.feature_state === "on" ? "would_run_cycle" : "feature_off", bindingSha256, now, { stage_results: [] });
  authorizeApply(binding, bindingSha256, expectedBindingSha256, approvalRef);
  if (binding.feature_state !== "on") return result("daily_cycle", "apply", "feature_off", bindingSha256, now, { stage_results: [] });

  const lease = await acquireLease(binding, now, {
    operationKey: "backup-controller-daily-cycle",
    deadlineAt: new Date(now.getTime() + 24 * 60 * 60_000),
    ...leaseRuntime,
  });
  if (!lease) return result("daily_cycle", "apply", "ignore_new_lease_held", bindingSha256, now, { checkpoint_status: "held", stage_results: [] });
  try {
    const ledger = await readLedger(binding, bindingSha256);
    const stageResults = [];
    let reconciledBeforeCycle = false;
    const runningStageId = DAILY_CYCLE_STAGE_IDS.find((stageId) => ledger.stages[stageId].status === "running");
    if (runningStageId) {
      const runningStage = binding.stages.find((item) => item.stage_id === runningStageId);
      const reconciled = await reconcileRunningStage({ binding, bindingSha256, ledger, stage: runningStage, now, receiptReconciler });
      if (!reconciled) return result("daily_cycle", "apply", "resume_required", bindingSha256, now, { selected_stage: runningStageId, period_key: ledger.stages[runningStageId].checkpoint?.period_key ?? null, checkpoint_status: "executing", stage_results: [] });
      reconciledBeforeCycle = true;
    }
    let anyWrite = reconciledBeforeCycle;
    let anyDispatch = false;
    for (const stageId of DAILY_CYCLE_STAGE_IDS) {
      const stage = binding.stages.find((item) => item.stage_id === stageId);
      if (!isWeeklyStageDueToday(stage, now)) {
        stageResults.push({ stage_id: stageId, status: "not_scheduled_today" });
        continue;
      }
      const occurrence = latestOccurrence(stage, now);
      if (Date.parse(occurrence.due_at) < Date.parse(binding.activation.not_before)) {
        stageResults.push({ stage_id: stageId, status: "before_activation" });
        continue;
      }
      const stageResult = await executeStageForCycle({ binding, bindingSha256, ledger, stage, occurrence, now, lease, executors, receiptReconciler });
      stageResults.push({ stage_id: stageId, status: stageResult.status, period_key: stageResult.period_key ?? null, error_code: stageResult.error_code ?? null });
      anyWrite ||= stageResult.write_performed === true;
      anyDispatch ||= stageResult.command_dispatched === true;
      if (["resume_required", "executor_unavailable", "skipped_deadline", "failed_retry_pending"].includes(stageResult.status)) {
        const workspaceWarning = stageId === "workspace_copy";
        return result("daily_cycle", "apply", workspaceWarning ? "completed_with_warning" : stageResult.status, bindingSha256, now, {
          selected_stage: stageId,
          period_key: stageResult.period_key ?? null,
          checkpoint_status: stageResult.checkpoint_status,
          write_performed: anyWrite,
          command_dispatched: anyDispatch,
          error_code: stageResult.error_code,
          stage_results: stageResults,
        });
      }
    }
    const executed = reconciledBeforeCycle || stageResults.some((item) => item.status === "succeeded" || item.status === "succeeded_reconciled");
    return result("daily_cycle", "apply", executed ? "succeeded" : "no_due_stage", bindingSha256, now, {
      checkpoint_status: "complete",
      write_performed: anyWrite,
      command_dispatched: anyDispatch,
      stage_results: stageResults,
    });
  } finally {
    await lease.release();
  }
}
