import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceCapabilityProbe } from "./device_capability_probe.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const STATUS_PATH = path.join(REPO_ROOT, "guild_hall", "state", "doctor", "status.json");
const GIT_INDEX_PATH = path.join(REPO_ROOT, ".git", "index");
const HEAD = "0123456789abcdef0123456789abcdef01234567";

test("darwin fixture reports aggregate capabilities without disclosing configured sentinels", async () => {
  const report = await buildDeviceCapabilityProbe({
    repoRoot: path.join("fixture-root", "private-account", "Soulforge"),
    identity: {
      schema_version: "soulforge.local_node.v0",
      node_role: "work_pc",
      node_id: "SENTINEL_NODE_ID",
      capability_probe: {
        cloud_roots: {
          onedrive: path.join("fixture-cloud", "SENTINEL_ACCOUNT", "OneDrive-SENTINEL_ACCOUNT_ID"),
          google_drive: path.join("fixture-cloud", "SENTINEL_GOOGLE_ROOT"),
        },
        dev_erp_loopback: true,
        nas_targets: [
          path.join("fixture-nas", "SENTINEL_REACHABLE"),
          path.join("fixture-nas", "SENTINEL_MISSING"),
          path.join("fixture-nas", "SENTINEL_TIMEOUT"),
        ],
        sync_receipts: [
          { path: path.join("fixture-receipt", "SENTINEL_RECEIPT", "fresh-secret.json"), max_age_hours: 24 },
        ],
      },
    },
    platform: "darwin",
    arch: "arm64",
    homeDir: path.join("fixture-home", "SENTINEL_ACCOUNT"),
    now: new Date("2026-07-11T00:00:00.000Z"),
    exists: (candidate) => candidate === "/Applications/OneDrive.app",
    workspaceAudit: () => ({
      status: "gaps_found",
      declared_active_count: 3,
      checked_count: 3,
      rows: [{ workspace_alias: "SENTINEL_ALIAS" }],
      problems: [{ actual_target_tail: "SENTINEL_TARGET_TAIL" }],
    }),
    runCommand: darwinCommandFixture({ dirty: true }),
    fetcher: async (url) => ({ ok: url.includes("127.0.0.1") }),
    pathProbe: (target) => target.includes("REACHABLE")
      ? "reachable"
      : target.includes("MISSING") ? "missing" : "timeout",
    receiptProbe: () => ({ status: "present", mtimeMs: Date.parse("2026-07-10T23:00:00.000Z") }),
  });

  assert.equal(report.schema_version, "soulforge.device_capability_probe.v0");
  assert.deepEqual(report.node, {
    identity_status: "present",
    identity_schema: "soulforge.local_node.v0",
    role: "work_pc",
    platform: "darwin",
    arch: "arm64",
  });
  assert.deepEqual(report.workspace_links, {
    status: "gaps_found",
    configured_count: 3,
    checked_count: 3,
    healthy_count: 2,
    gap_count: 1,
  });
  assert.deepEqual(report.cloud_apps.onedrive, {
    status: "running",
    installed: true,
    running: true,
    root_configured: true,
  });
  assert.equal(report.cloud_apps.google_drive.status, "not_detected");
  assert.equal(report.repository.head, HEAD);
  assert.equal(report.repository.dirty_count, 2);
  assert.deepEqual(report.nas, {
    status: "observed",
    configured_count: 3,
    reachable_count: 1,
    missing_count: 1,
    timeout_count: 1,
    unknown_count: 0,
  });
  assert.equal(report.sync_receipts.fresh_count, 1);
  assert.equal(report.ollama.status, "available");
  assert.equal(report.dev_erp_loopback.status, "healthy");
  assertPrivacyBoundary(report, [
    "SENTINEL",
    "fresh-secret.json",
    "SENTINEL_ALIAS",
    "SENTINEL_TARGET_TAIL",
  ]);
});

test("win32 fixture uses fixed app and process candidates", async () => {
  const report = await buildDeviceCapabilityProbe({
    repoRoot: path.win32.join("fixture-root", "SENTINEL_ACCOUNT", "Soulforge"),
    identity: {
      schema_version: "soulforge.local_node.v0",
      node_role: "dev_worker_pc",
      capability_probe: {},
    },
    platform: "win32",
    arch: "x64",
    env: {
      ProgramFiles: "fixture-program-files",
      LOCALAPPDATA: path.win32.join("fixture-local-app-data", "SENTINEL_ACCOUNT"),
    },
    exists: (candidate) => candidate.endsWith("GoogleDriveFS.exe"),
    workspaceAudit: () => ({ status: "blocked" }),
    runCommand: win32CommandFixture(),
    fetcher: async () => ({ ok: false }),
  });

  assert.equal(report.node.platform, "win32");
  assert.equal(report.node.arch, "x64");
  assert.equal(report.cloud_apps.onedrive.status, "running");
  assert.equal(report.cloud_apps.onedrive.installed, false);
  assert.equal(report.cloud_apps.google_drive.status, "installed");
  assert.equal(report.cloud_apps.google_drive.running, false);
  assert.equal(report.workspace_links.status, "not_configured");
  assert.equal(report.repository.dirty_count, 0);
  assertPrivacyBoundary(report, ["SENTINEL", "GoogleDriveFS.exe"]);
});

test("NAS and receipt aggregates distinguish reachable, missing, timeout, fresh, stale, and missing", async () => {
  const now = new Date("2026-07-11T12:00:00.000Z");
  const report = await buildDeviceCapabilityProbe({
    identity: {
      schema_version: "soulforge.local_node.v0",
      node_role: "tool_pc",
      capability_probe: {
        nas_targets: ["nas-reachable", "nas-missing", "nas-timeout"],
        sync_receipts: [
          { path: "receipt-fresh", max_age_hours: 2 },
          { path: "receipt-stale", max_age_hours: 2 },
          { path: "receipt-missing", max_age_hours: 2 },
        ],
      },
    },
    now,
    workspaceAudit: () => ({ status: "passed", declared_active_count: 0, checked_count: 0, problems: [] }),
    runCommand: darwinCommandFixture({ dirty: false }),
    fetcher: async () => ({ ok: false }),
    pathProbe: (target) => target.endsWith("reachable")
      ? "reachable"
      : target.endsWith("missing") ? "missing" : "timeout",
    receiptProbe: (target) => {
      if (target.endsWith("fresh")) return { status: "present", mtimeMs: now.getTime() - 60 * 60 * 1000 };
      if (target.endsWith("stale")) return { status: "present", mtimeMs: now.getTime() - 3 * 60 * 60 * 1000 };
      return { status: "missing" };
    },
  });

  assert.deepEqual(report.nas, {
    status: "observed",
    configured_count: 3,
    reachable_count: 1,
    missing_count: 1,
    timeout_count: 1,
    unknown_count: 0,
  });
  assert.deepEqual(report.sync_receipts, {
    status: "observed",
    configured_count: 3,
    fresh_count: 1,
    stale_count: 1,
    missing_count: 1,
    timeout_count: 0,
    unknown_count: 0,
  });
});

test("default workspace audit is timeout-bounded and does not disclose child errors", async () => {
  let workspaceTimeoutObserved = false;
  const report = await buildDeviceCapabilityProbe({
    identity: {
      schema_version: "soulforge.local_node.v0",
      node_role: "always_on_node",
    },
    runCommand: (command, args, options) => {
      if (command === process.execPath && args.includes("guild_hall/workspace_junction/cli.mjs")) {
        workspaceTimeoutObserved = options.timeout === 2000;
        return { status: null, error: { code: "ETIMEDOUT" }, stderr: "SENTINEL_STALLED_TARGET" };
      }
      return darwinCommandFixture({ dirty: false })(command, args, options);
    },
    fetcher: async () => ({ ok: false }),
  });

  assert.equal(workspaceTimeoutObserved, true);
  assert.deepEqual(report.workspace_links, {
    status: "timeout",
    reason_code: "workspace_audit_timeout",
    configured_count: 0,
  });
  assertPrivacyBoundary(report, ["SENTINEL_STALLED_TARGET"]);
});

test("CLI device capability branch leaves doctor status and Git index untouched", () => {
  const before = localStateSnapshot();
  const execution = spawnSync(process.execPath, ["guild_hall/doctor/cli.mjs", "--device-capabilities", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 10000,
  });
  const after = localStateSnapshot();

  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(execution.stdout);
  assert.equal(report.schema_version, "soulforge.device_capability_probe.v0");
  assert.equal(report.boundary.status_file_written, false);
  assert.deepEqual(after, before);
});

function darwinCommandFixture({ dirty }) {
  return (command, args, options = {}) => {
    if (command === "git") assert.equal(options.env?.GIT_OPTIONAL_LOCKS, "0");
    if (command === "git" && args.includes("rev-parse")) return { status: 0, stdout: `${HEAD}\n` };
    if (command === "git" && args.includes("status")) {
      return { status: 0, stdout: dirty ? " M first-secret.txt\n?? second-secret.txt\n" : "" };
    }
    if (command === "pgrep") return { status: args.at(-1) === "OneDrive" ? 0 : 1, stdout: "" };
    if (command === "ollama") return { status: 0, stdout: "ollama version" };
    return { status: 1, stdout: "", stderr: "SENTINEL_RAW_ERROR" };
  };
}

function win32CommandFixture() {
  return (command, args, options = {}) => {
    if (command === "git") assert.equal(options.env?.GIT_OPTIONAL_LOCKS, "0");
    if (command === "git" && args.includes("rev-parse")) return { status: 0, stdout: `${HEAD}\r\n` };
    if (command === "git" && args.includes("status")) return { status: 0, stdout: "" };
    if (command === "tasklist.exe") {
      const processName = args[1].split(" ").at(-1);
      return processName === "OneDrive.exe"
        ? { status: 0, stdout: "OneDrive.exe 100 Console" }
        : { status: 0, stdout: "INFO: No tasks are running which match the specified criteria." };
    }
    if (command === "ollama") return { status: 1, stdout: "", stderr: "not found" };
    return { status: 1, stdout: "" };
  };
}

function assertPrivacyBoundary(report, forbidden) {
  const encoded = JSON.stringify(report);
  for (const sentinel of forbidden) {
    assert.equal(encoded.includes(sentinel), false, `output disclosed forbidden value: ${sentinel}`);
  }
  assert.equal(report.boundary.read_only, true);
  assert.equal(report.boundary.secrets_read, false);
  assert.equal(report.boundary.payloads_included, false);
  assert.equal(report.boundary.absolute_paths_included, false);
  assert.equal(report.boundary.account_identifiers_included, false);
  assert.equal(report.boundary.filenames_included, false);
  assert.equal(report.boundary.raw_errors_included, false);
}

function localStateSnapshot() {
  return {
    doctor_status: fileSnapshot(STATUS_PATH),
    git_index: fileSnapshot(GIT_INDEX_PATH),
  };
}

function fileSnapshot(filePath) {
  if (!existsSync(filePath)) return { exists: false };
  const stat = statSync(filePath);
  const sha256 = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs, sha256 };
}
