import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BackupControllerError, DAILY_CYCLE_STAGE_IDS, STAGE_COMMAND_IDS } from "./controller.mjs";
import { parseWindowsReparseTag, preflightBinding } from "./preflight.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-backup-preflight-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policyRef = path.join(root, "control", "policy.json");
  const policyBytes = Buffer.from("{\"schema\":\"test\"}\n");
  await mkdir(path.dirname(policyRef), { recursive: true });
  await writeFile(policyRef, policyBytes);
  const uncPrefix = "\\\\RaiDrive-test\\Synology";
  const nas = (name) => ({ kind: "raidrive_network_directory", path: path.join(uncPrefix, "backup-controller-tests", path.basename(root), name), unc_prefix: uncPrefix });
  const binding = {
    schema_version: "soulforge.backup_controller.binding.v1",
    controller_id: "soulforge-backup-controller",
    feature_state: "off",
    automation: { name: "Soulforge Backup Controller", mode: "daily_cycle", local_time: "09:15", timezone: "Asia/Seoul", ignore_new: true },
    writer: { node_id: "hpp-primary", hostname: "hpp-host-test", platform: "win32", role: "hpp", mode: "writer" },
    mac: { node_id: "mac-monitor", mode: "monitor_only", takeover_allowed: false },
    state_root: path.join(root, "control", "state"),
    resources: {
      hpp_data_root: { kind: "directory", path: path.join(root, "hpp") },
      hpp_recovery_policy: { kind: "pinned_file", path: policyRef, sha256: createHash("sha256").update(policyBytes).digest("hex") },
      hpp_restore_test_root: { kind: "directory", path: path.join(root, "restore") },
      runtime_checkout_root: { kind: "directory", path: path.join(root, "runtime") },
      workspace_root: { kind: "onedrive_cloud_directory", path: path.join(root, "workspace"), reparse_profile: "microsoft_onedrive_cloud_0x9000601a" },
      erp_db_file: { kind: "file", path: path.join(root, "erp", "db.sqlite") },
      project_metadata_root: { kind: "directory", path: path.join(root, "metadata") },
      cross_project_state_root: { kind: "directory", path: path.join(root, "private-state") },
      nas_hpp_backup_root: nas("hpp"),
      nas_workspace_backup_root: nas("workspace"),
      nas_erp_backup_root: nas("erp"),
      nas_restore_root: nas("restore"),
      nas_report_root: nas("report"),
    },
    activation: { approval_ref: "approval-preflight-test-v1", not_before: "2026-07-19T00:00:00.000Z", seed_receipts: Object.fromEntries(Object.keys(STAGE_COMMAND_IDS).map((id) => [id, null])) },
    stages: DAILY_CYCLE_STAGE_IDS.map((stageId) => ({ stage_id: stageId, cadence: stageId === "weekly_restore" ? "weekly" : "daily", ...(stageId === "weekly_restore" ? { day_of_week: "mon" } : {}), local_time: "09:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: STAGE_COMMAND_IDS[stageId] })),
  };
  const pathInspector = async (resource) => ({
    type: resource.kind === "file" || resource.kind === "pinned_file" ? "file" : "directory",
    realpath: resource.path,
    is_link: false,
    reparse_tag: resource.kind === "onedrive_cloud_directory" ? "0x9000601a" : null,
  });
  const options = {
    observedHost: { hostname: "HPP-HOST-TEST", platform: "win32", user: "owner" },
    pathInspector,
    commandRunner: async ({ file }) => file === "icacls.exe" ? { code: 0, stdout: "OWNER:(F)\nNT AUTHORITY\\SYSTEM:(F)", stderr: "" } : { code: 0, stdout: "", stderr: "" },
  };
  return { root, binding, options };
}

test("preflight accepts exact typed paths, OneDrive tag, RaiDrive UNC roots, ACL, and policy without Git inspection", async (t) => {
  const fx = await fixture(t);
  const commands = [];
  const result = await preflightBinding(fx.binding, {
    ...fx.options,
    commandRunner: async ({ file }) => {
      commands.push(file);
      return file === "icacls.exe" ? { code: 0, stdout: "OWNER:(F)\nNT AUTHORITY\\SYSTEM:(F)", stderr: "" } : { code: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.write_probe_performed, false);
  assert.equal(result.policy_sha256, fx.binding.resources.hpp_recovery_policy.sha256);
  assert.ok(!commands.includes("git.exe"));
});

test("Windows reparse output parser returns the exact tag without requiring a capture group", () => {
  assert.equal(parseWindowsReparseTag("Reparse Tag Value : 0x9000601A\r\n"), "0x9000601a");
  assert.throws(() => parseWindowsReparseTag("Reparse Tag Value : unavailable\r\n"), (error) => error instanceof BackupControllerError && error.code === "preflight_reparse_unparseable");
});

test("preflight rejects host drift and any resource overlap", async (t) => {
  const fx = await fixture(t);
  await assert.rejects(preflightBinding(structuredClone(fx.binding), { ...fx.options, observedHost: { hostname: "other-host", platform: "win32", user: "owner" } }), (error) => error instanceof BackupControllerError && error.code === "observed_writer_mismatch");
  const overlap = structuredClone(fx.binding);
  overlap.resources.hpp_restore_test_root.path = overlap.resources.hpp_data_root.path;
  await assert.rejects(preflightBinding(overlap, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");
});

test("runtime containment allows only exact _workmeta/private-state children, never equality or reverse containment", async (t) => {
  const fx = await fixture(t);
  const allowed = structuredClone(fx.binding);
  allowed.resources.project_metadata_root.path = path.join(allowed.resources.runtime_checkout_root.path, "_workmeta");
  allowed.resources.cross_project_state_root.path = path.join(allowed.resources.runtime_checkout_root.path, "private-state");
  assert.equal((await preflightBinding(allowed, fx.options)).ok, true);

  const equal = structuredClone(fx.binding);
  equal.resources.project_metadata_root.path = equal.resources.runtime_checkout_root.path;
  await assert.rejects(preflightBinding(equal, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");

  const reverse = structuredClone(fx.binding);
  reverse.resources.runtime_checkout_root.path = path.join(reverse.resources.project_metadata_root.path, "runtime");
  await assert.rejects(preflightBinding(reverse, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");
});

test("preflight permits only the bound ERP DB and pinned recovery policy as strict operational descendants", async (t) => {
  const fx = await fixture(t);
  const allowed = structuredClone(fx.binding);
  allowed.resources.erp_db_file.path = path.join(allowed.resources.runtime_checkout_root.path, "ui-workspace", "apps", "dev-erp", "data", "dev-erp.db");
  allowed.resources.hpp_recovery_policy.path = path.join(allowed.resources.project_metadata_root.path, "recovery", "policy.json");
  await mkdir(path.dirname(allowed.resources.hpp_recovery_policy.path), { recursive: true });
  await writeFile(allowed.resources.hpp_recovery_policy.path, "{\"schema\":\"test\"}\n");
  assert.equal((await preflightBinding(allowed, fx.options)).ok, true);

  const equalDb = structuredClone(fx.binding);
  equalDb.resources.erp_db_file.path = equalDb.resources.runtime_checkout_root.path;
  await assert.rejects(preflightBinding(equalDb, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");

  const equalPolicy = structuredClone(fx.binding);
  equalPolicy.resources.hpp_recovery_policy.path = equalPolicy.resources.project_metadata_root.path;
  await assert.rejects(preflightBinding(equalPolicy, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");

  const reverseDb = structuredClone(fx.binding);
  reverseDb.resources.runtime_checkout_root.path = path.join(reverseDb.resources.erp_db_file.path, "runtime");
  await assert.rejects(preflightBinding(reverseDb, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");

  const reversePolicy = structuredClone(fx.binding);
  reversePolicy.resources.project_metadata_root.path = path.join(reversePolicy.resources.hpp_recovery_policy.path, "metadata");
  await assert.rejects(preflightBinding(reversePolicy, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");

  const unrelatedRuntimeChild = structuredClone(fx.binding);
  unrelatedRuntimeChild.resources.hpp_data_root.path = path.join(unrelatedRuntimeChild.resources.runtime_checkout_root.path, "hpp");
  await assert.rejects(preflightBinding(unrelatedRuntimeChild, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");

  const transitive = structuredClone(fx.binding);
  transitive.resources.project_metadata_root.path = path.join(transitive.resources.runtime_checkout_root.path, "_workmeta");
  transitive.resources.hpp_recovery_policy.path = path.join(transitive.resources.project_metadata_root.path, "recovery", "policy.json");
  await assert.rejects(preflightBinding(transitive, fx.options), (error) => error instanceof BackupControllerError && error.code === "preflight_path_overlap");
});

test("preflight still enforces physical file and directory types for approved containment pairs", async (t) => {
  const fx = await fixture(t);
  const allowed = structuredClone(fx.binding);
  allowed.resources.erp_db_file.path = path.join(allowed.resources.runtime_checkout_root.path, "ui-workspace", "apps", "dev-erp", "data", "dev-erp.db");
  await assert.rejects(preflightBinding(allowed, {
    ...fx.options,
    pathInspector: async (resource, context) => ({
      type: context.resourceId === "erp_db_file" ? "directory" : resource.kind === "file" || resource.kind === "pinned_file" ? "file" : "directory",
      realpath: resource.path,
      is_link: false,
      reparse_tag: resource.kind === "onedrive_cloud_directory" ? "0x9000601a" : null,
    }),
  }), (error) => error instanceof BackupControllerError && error.code === "preflight_resource_type_mismatch");

  const policyInsideMetadata = structuredClone(fx.binding);
  policyInsideMetadata.resources.hpp_recovery_policy.path = path.join(policyInsideMetadata.resources.project_metadata_root.path, "recovery", "policy.json");
  await assert.rejects(preflightBinding(policyInsideMetadata, {
    ...fx.options,
    pathInspector: async (resource, context) => ({
      type: context.resourceId === "hpp_recovery_policy" ? "directory" : resource.kind === "file" || resource.kind === "pinned_file" ? "file" : "directory",
      realpath: resource.path,
      is_link: false,
      reparse_tag: resource.kind === "onedrive_cloud_directory" ? "0x9000601a" : null,
    }),
  }), (error) => error instanceof BackupControllerError && error.code === "preflight_resource_type_mismatch");
});

test("preflight permits only the exact OneDrive cloud tag and rejects other reparse points", async (t) => {
  const fx = await fixture(t);
  await assert.rejects(preflightBinding(structuredClone(fx.binding), {
    ...fx.options,
    pathInspector: async (resource) => ({ type: resource.kind === "file" || resource.kind === "pinned_file" ? "file" : "directory", realpath: resource.path, is_link: false, reparse_tag: resource.kind === "onedrive_cloud_directory" ? "0xa0000003" : null }),
  }), (error) => error instanceof BackupControllerError && error.code === "preflight_onedrive_profile_mismatch");
  await assert.rejects(preflightBinding(structuredClone(fx.binding), {
    ...fx.options,
    pathInspector: async (resource, context) => ({ type: resource.kind === "file" || resource.kind === "pinned_file" ? "file" : "directory", realpath: resource.path, is_link: false, reparse_tag: context.resourceId === "hpp_data_root" ? "0xa0000003" : resource.kind === "onedrive_cloud_directory" ? "0x9000601a" : null }),
  }), (error) => error instanceof BackupControllerError && error.code === "preflight_unapproved_reparse_point");
});

test("preflight blocks broad local HPP write ACLs and unparseable ACL output", async (t) => {
  const fx = await fixture(t);
  await assert.rejects(preflightBinding(structuredClone(fx.binding), { ...fx.options, commandRunner: async () => ({ code: 0, stdout: "NT AUTHORITY\\Authenticated Users:(M)\nOWNER:(F)", stderr: "" }) }), (error) => error instanceof BackupControllerError && error.code === "hpp_acl_not_writer_exclusive");
  await assert.rejects(preflightBinding(structuredClone(fx.binding), { ...fx.options, commandRunner: async () => ({ code: 0, stdout: "localized output without entries", stderr: "" }) }), (error) => error instanceof BackupControllerError && error.code === "acl_output_unparseable");
  await assert.rejects(preflightBinding(structuredClone(fx.binding), { ...fx.options, commandRunner: async () => ({ code: 0, stdout: "OWNER:(F)\nNT AUTHORITY\\Authenticated Users:(M) trailing", stderr: "" }) }), (error) => error instanceof BackupControllerError && error.code === "acl_output_unparseable");
});
