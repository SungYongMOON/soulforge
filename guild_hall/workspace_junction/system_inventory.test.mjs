import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  inventoryWorkspaceSystem,
  workspaceSystemWriteBlocker,
} from "./system_inventory.mjs";

const CLI_PATH = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("reports planned local system directory as review required without absolute path leakage", () => {
  const repoRoot = makeFixture({ bindingState: "planned", localSystemDirectory: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "local_llm_install"), { recursive: true });
  writeFileSync(path.join(repoRoot, "_workspaces", "system", "local_llm_install", "server.pid"), "1234\n", "utf8");
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "rag"), { recursive: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "knowledge_view"), { recursive: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "p25_054_reference_payloads"), { recursive: true });
  mkdirSync(
    path.join(
      repoRoot,
      "_workspaces",
      "system",
      "p25_054_reference_payloads",
      "level1",
      "level2",
      "level3",
      "level4",
      "level5",
      "level6",
      "level7",
      "level8",
      "level9",
    ),
    { recursive: true },
  );
  writeFileSync(
    path.join(
      repoRoot,
      "_workspaces",
      "system",
      "p25_054_reference_payloads",
      "level1",
      "level2",
      "level3",
      "level4",
      "level5",
      "level6",
      "level7",
      "level8",
      "level9",
      "payload.meta",
    ),
    "metadata\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoRoot, "_workspaces", "system", "p25_054_reference_payloads", "payload_conversion.log"),
    "log metadata\n",
    "utf8",
  );
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "reference_payloads"), { recursive: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "scripts"), { recursive: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "unknown_box"), { recursive: true });

  const result = inventoryWorkspaceSystem({ repoRoot });

  assert.equal(result.status, "review_required");
  assert.equal(result.reason, "migration_required_system_not_link");
  assert.equal(result.binding_state, "planned");
  assert.equal(result.observed_local_state, "directory_not_link");
  assert.equal(result.migration_status, "migration_required");
  assert.equal(result.boundary.file_contents_read, false);
  assert.equal(result.boundary.host_local_absolute_paths_in_output, false);
  assert.equal(result.scan_policy.full_scan, true);
  assert.equal(result.counts.scan_complete, true);
  assert.equal(result.counts.scan_limited_count, 0);
  assert.equal(result.counts.shared_generated_view_count, 2);
  assert.equal(result.rows.find((row) => row.relative_path === "local_llm_install").class, "pc_local_runtime_tool");
  assert.equal(
    result.rows.find((row) => row.relative_path === "local_llm_install").proposed_action,
    "move_runtime_to__workspaces_local_or_owner_approved_os_tool_location",
  );
  assert.equal(result.next_actions.some((action) => action.includes("guild_hall/state/tools")), false);
  const p25ReferenceRow = result.rows.find((row) => row.relative_path === "p25_054_reference_payloads");
  assert.equal(p25ReferenceRow.class, "project_reference_payload_review");
  assert.equal(p25ReferenceRow.file_count, 2);
  assert.equal(p25ReferenceRow.scan_complete, true);
  assert.equal(result.rows.find((row) => row.relative_path === "reference_payloads").class, "shared_fixture_candidate");
  assert.equal(result.rows.find((row) => row.relative_path === "scripts").class, "repo_promote_review");
  assert.equal(result.rows.find((row) => row.relative_path === "unknown_box").class, "unknown_review");

  const jsonOutput = JSON.stringify(result);
  assert.equal(jsonOutput.includes(repoRoot), false);
  assert.equal(jsonOutput.includes(path.join(repoRoot, "_workspaces")), false);
});

test("bounded scans are reported as activation blockers", () => {
  const repoRoot = makeFixture({ bindingState: "planned", localSystemDirectory: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "reference_payloads", "level1", "level2"), {
    recursive: true,
  });
  writeFileSync(
    path.join(repoRoot, "_workspaces", "system", "reference_payloads", "level1", "level2", "payload.meta"),
    "metadata\n",
    "utf8",
  );

  const result = inventoryWorkspaceSystem({ repoRoot, maxDepth: 1 });
  const row = result.rows.find((candidate) => candidate.relative_path === "reference_payloads");

  assert.equal(result.scan_policy.full_scan, false);
  assert.equal(result.counts.scan_complete, false);
  assert.equal(result.counts.scan_limited_count, 1);
  assert.equal(row.scan_complete, false);
  assert.equal(row.scan_limited, true);
  assert.equal(row.scan_limited_reason, "max_depth_exceeded");
  assert(result.blockers.includes("system_inventory_scan_limited:reference_payloads"));
  assert(result.next_actions.some((action) => action.includes("full scan")));
});

test("passes when active system binding is a link with only shared generated views", () => {
  const repoRoot = makeFixture({ bindingState: "active" });
  const target = path.join(repoRoot, "shared", "system");
  mkdirSync(path.join(target, "rag"), { recursive: true });
  mkdirSync(path.join(target, "knowledge_view"), { recursive: true });
  linkDir(target, path.join(repoRoot, "_workspaces", "system"));

  const result = inventoryWorkspaceSystem({ repoRoot });

  assert.equal(result.status, "passed");
  assert.equal(result.observed_local_state, "link_ok");
  assert.equal(result.migration_status, "ready_for_active_binding");
  assert.equal(result.blockers.length, 0);
});

test("write blocker rejects default system output while system binding is planned and local", () => {
  const repoRoot = makeFixture({ bindingState: "planned", localSystemDirectory: true });

  const blocker = workspaceSystemWriteBlocker({
    repoRoot,
    outputRef: "_workspaces/system/rag/manifests/example/rag_manifest.json",
  });
  const localBlocker = workspaceSystemWriteBlocker({
    repoRoot,
    outputRef: "_workspaces/_local/pc-fixture/system/rag/manifests/example/rag_manifest.json",
  });

  assert.equal(blocker.code, "workspace_system_migration_required");
  assert.equal(blocker.binding_state, "planned");
  assert.equal(blocker.observed_local_state, "directory_not_link");
  assert.equal(localBlocker, null);
});

test("inventory-system CLI returns JSON and stays non-mutating by default", () => {
  const repoRoot = makeFixture({ bindingState: "planned", localSystemDirectory: true });

  const cli = spawnSync(process.execPath, [CLI_PATH, "inventory-system", "--repo-root", repoRoot, "--json"], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 0);
  assert.equal(cli.stderr, "");
  const result = JSON.parse(cli.stdout);
  assert.equal(result.status, "review_required");
  assert.equal(result.boundary.mutations_performed, false);
  assert.equal(cli.stdout.includes(repoRoot), false);
});

test("inventory-system CLI accepts bounded scan options and reports scan limits", () => {
  const repoRoot = makeFixture({ bindingState: "planned", localSystemDirectory: true });
  mkdirSync(path.join(repoRoot, "_workspaces", "system", "reference_payloads", "level1", "level2"), {
    recursive: true,
  });
  writeFileSync(
    path.join(repoRoot, "_workspaces", "system", "reference_payloads", "level1", "level2", "payload.meta"),
    "metadata\n",
    "utf8",
  );

  const cli = spawnSync(
    process.execPath,
    [CLI_PATH, "inventory-system", "--repo-root", repoRoot, "--json", "--max-depth", "1"],
    {
      encoding: "utf8",
    },
  );

  assert.equal(cli.status, 0);
  assert.equal(cli.stderr, "");
  const result = JSON.parse(cli.stdout);
  assert.equal(result.counts.scan_complete, false);
  assert.equal(result.counts.scan_limited_count, 1);
  assert(result.blockers.includes("system_inventory_scan_limited:reference_payloads"));
  assert.equal(cli.stdout.includes(repoRoot), false);
});

function makeFixture({ bindingState, localSystemDirectory = false } = {}) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "soulforge-system-inventory-"));
  mkdirSync(path.join(repoRoot, "_workmeta", "system", "bindings"), { recursive: true });
  mkdirSync(path.join(repoRoot, "_workspaces"), { recursive: true });
  if (localSystemDirectory) {
    mkdirSync(path.join(repoRoot, "_workspaces", "system"), { recursive: true });
  }
  writeFileSync(
    path.join(repoRoot, "_workmeta", "system", "bindings", "workspace_junctions.yaml"),
    `schema_version: soulforge.workspace_junction_binding.v1
junctions:
  - workspace_alias: system
    project_code: null
    cloud_relative_path: system
    link_relative_path: _workspaces/system
    state: ${bindingState}
`,
    "utf8",
  );
  return repoRoot;
}

function linkDir(target, linkPath) {
  symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}
