// codex_retention_refresh_registrar.mjs
// Deterministic, non-LLM planner/registrar for a report-only Windows Scheduled
// Task that re-runs `codex_retention_automation_cli.mjs` often enough to keep
// `reports/codex_retention/current.json` inside its 24h freshness window.
//
// This module never touches a real Windows Scheduled Task by itself: the
// register step requires an explicit caller-supplied `register` adapter.
// Without one it fails closed. It only ever plans/attempts a report-only
// refresh action; it carries no archive/delete/remove/prune/branch-delete,
// credential, raw-transcript, network-provider, or runtime-kill authority.
import { access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

export const TASK_NAME = "Soulforge-Codex-Retention-Refresh";
export const REGISTRAR_SCHEMA = "soulforge.codex_thread_manager.codex_retention_refresh_registrar.v1";
export const RECEIPT_SCHEMA = "soulforge.codex_thread_manager.codex_retention_refresh_receipt.v1";
export const MAX_REGISTER_ATTEMPTS = 3;
// Well under the 24h freshness window this refresh exists to protect.
export const REFRESH_INTERVAL_HOURS = 6;

const DIGEST_RE = /^[0-9a-f]{64}$/u;
const SAFE_ERROR_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/u;
const DESTRUCTIVE_TOKENS = Object.freeze(new Set([
  "--apply", "--delete", "--archive", "--remove", "--prune", "--branch-delete",
  "approve", "apply", "verify", "delete", "archive", "remove", "prune",
]));

class RegistrarError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new RegistrarError(code);
}

function assertAbsolute(value, code) {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) fail(code);
  return value;
}

function assertNoDestructiveTokens(args) {
  for (const token of args) {
    const bare = String(token).split("=")[0].toLowerCase();
    if (DESTRUCTIVE_TOKENS.has(bare)) fail("destructive_switch_forbidden");
  }
}

export function buildHiddenLaunchAction({
  powerShellPath,
  wscriptPath,
  hiddenLauncherPath,
  launcherScriptPath,
  launchArgs,
}) {
  assertAbsolute(powerShellPath, "invalid_powershell_path");
  assertAbsolute(wscriptPath, "invalid_wscript_path");
  assertAbsolute(hiddenLauncherPath, "invalid_hidden_launcher_path");
  assertAbsolute(launcherScriptPath, "invalid_launcher_script_path");
  if (!Array.isArray(launchArgs) || launchArgs.some((value) => typeof value !== "string")) {
    fail("invalid_launch_args");
  }
  assertNoDestructiveTokens(launchArgs);
  const powershellArgs = [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    launcherScriptPath,
    ...launchArgs,
  ];
  const args = ["//B", "//NoLogo", hiddenLauncherPath, powerShellPath, ...powershellArgs];
  return {
    execute: wscriptPath,
    args,
    hidden: true,
    noninteractive: true,
  };
}

export function computeActionDigest(action) {
  const canonical = JSON.stringify({ execute: action.execute, args: action.args });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function holdPlan(codes) {
  return { status: "HOLD", hold_reasons: codes, plan: null, already_registered: false };
}

export async function planCodexRetentionRefreshRegistration(input = {}, adapters = {}) {
  try {
    const accessFn = adapters.access ?? access;

    if (input.taskName !== undefined && input.taskName !== TASK_NAME) fail("task_identity_fixed");

    const sourceScriptPath = assertAbsolute(input.sourceScriptPath, "invalid_source_script_path");
    if (input.sourceDisabled === true) return holdPlan(["source_disabled"]);
    try {
      await accessFn(sourceScriptPath);
    } catch {
      return holdPlan(["source_script_missing_or_disabled"]);
    }

    const nodePath = assertAbsolute(input.nodePath, "invalid_node_path");
    const localRoot = assertAbsolute(input.localRoot, "invalid_local_root");
    const activityRoot = assertAbsolute(input.activityRoot, "invalid_activity_root");
    // The runtime launcher (ops/run-codex-retention-refresh.ps1) has a fixed,
    // closed parameter set. There is no caller-extensible argument surface;
    // any attempt to extend the launch args is rejected outright rather than
    // filtered.
    if (input.extraArgs !== undefined) fail("extra_args_not_supported");

    let action;
    try {
      action = buildHiddenLaunchAction({
        powerShellPath: input.powerShellPath,
        wscriptPath: input.wscriptPath,
        hiddenLauncherPath: input.hiddenLauncherPath,
        launcherScriptPath: input.launcherScriptPath,
        launchArgs: [
          "-NodePath", nodePath,
          "-SourceScriptPath", sourceScriptPath,
          "-LocalRoot", localRoot,
          "-ActivityRoot", activityRoot,
        ],
      });
    } catch (error) {
      if (error instanceof RegistrarError) return holdPlan([error.code]);
      throw error;
    }

    const actionDigest = computeActionDigest(action);

    // The caller must explicitly report what it observed before planning can
    // proceed: `null` for "checked, no existing task", or the exact existing
    // task object for "checked, task present". Omitting the field entirely
    // means no observation was made, and must HOLD rather than silently plan
    // a fresh registration that could force-overwrite an unobserved task.
    if (input.existingTask === undefined) fail("existing_task_observation_required");
    if (input.existingTask !== null) {
      const existing = input.existingTask;
      if (!existing || existing.taskName !== TASK_NAME || !DIGEST_RE.test(existing.actionDigest || "")) {
        fail("existing_task_identity_mismatch");
      }
      if (typeof input.expectedExistingActionDigest !== "string" || !DIGEST_RE.test(input.expectedExistingActionDigest)) {
        fail("expected_existing_digest_required");
      }
      if (input.expectedExistingActionDigest !== existing.actionDigest) {
        return holdPlan(["expected_existing_digest_mismatch"]);
      }
      if (existing.actionDigest === actionDigest) {
        return {
          status: "NOOP",
          hold_reasons: [],
          plan: null,
          already_registered: true,
          action_digest: actionDigest,
        };
      }
    }

    return {
      status: "READY",
      hold_reasons: [],
      already_registered: false,
      plan: {
        schema_version: REGISTRAR_SCHEMA,
        task_name: TASK_NAME,
        refresh_interval_hours: REFRESH_INTERVAL_HOURS,
        action,
        action_digest: actionDigest,
        report_only: true,
      },
    };
  } catch (error) {
    if (error instanceof RegistrarError) return holdPlan([error.code]);
    throw error;
  }
}

export async function registerCodexRetentionRefreshTask(input = {}, adapters = {}) {
  const plan = await planCodexRetentionRefreshRegistration(input, adapters);
  if (plan.status === "HOLD") {
    return {
      schema_version: RECEIPT_SCHEMA,
      status: "HOLD",
      hold_reasons: plan.hold_reasons,
      attempts: 0,
      task_name: TASK_NAME,
      action_digest: null,
      error: null,
    };
  }
  if (plan.status === "NOOP") {
    return {
      schema_version: RECEIPT_SCHEMA,
      status: "NOOP",
      hold_reasons: [],
      attempts: 0,
      task_name: TASK_NAME,
      action_digest: plan.action_digest,
      error: null,
    };
  }

  const registerFn = adapters.register;
  if (typeof registerFn !== "function") {
    const error = new Error("register_adapter_required");
    error.code = "register_adapter_required";
    throw error;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_REGISTER_ATTEMPTS; attempt += 1) {
    try {
      await registerFn(plan.plan);
      return {
        schema_version: RECEIPT_SCHEMA,
        status: "SUCCESS",
        hold_reasons: [],
        attempts: attempt,
        task_name: TASK_NAME,
        action_digest: plan.plan.action_digest,
        error: null,
      };
    } catch (error) {
      // Never echo an arbitrary error.message into the receipt (it can carry
      // paths, stack fragments, or other adapter-internal detail). Only a
      // safely shaped .code is trusted; anything else collapses to the same
      // closed fallback code.
      const code = error?.code;
      lastError = typeof code === "string" && SAFE_ERROR_CODE_RE.test(code) ? code : "register_failed";
    }
  }
  return {
    schema_version: RECEIPT_SCHEMA,
    status: "FAILED",
    hold_reasons: [],
    attempts: MAX_REGISTER_ATTEMPTS,
    task_name: TASK_NAME,
    action_digest: plan.plan.action_digest,
    error: lastError,
  };
}
