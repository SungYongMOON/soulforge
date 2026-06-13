import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditWorkspaceJunctions } from "./audit.mjs";

const CLI_PATH = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("passes when links match binding target suffixes", () => {
  const repoRoot = makeFixture();
  const result = auditWorkspaceJunctions({ repoRoot });

  assert.equal(result.status, "passed");
  assert.equal(result.problems.length, 0);
  assert.equal(result.extras.length, 0);
  assert.equal(result.rows.every((row) => row.target_suffix_ok), true);
  assert.equal(result.host_local_absolute_paths_in_output, false);
});

test("reports stale target suffix and extra root mirror", () => {
  const repoRoot = makeFixture({ stale: true, extra: true });
  const result = auditWorkspaceJunctions({ repoRoot });

  assert.equal(result.status, "gaps_found");
  assert.equal(result.problems.some((row) => row.workspace_alias === "P24-049" && row.target_suffix_ok === false), true);
  assert.equal(result.extras.some((row) => row.workspace_alias === "company"), true);
});

test("ignores local workspace navigation index files", () => {
  const repoRoot = makeFixture({ navigationIndex: true });
  const result = auditWorkspaceJunctions({ repoRoot });

  assert.equal(result.status, "passed");
  assert.equal(result.extras.some((row) => row.workspace_alias === "00_project_index.html"), false);
});

test("ignores reserved PC-local namespaces and non-active system binding rows", () => {
  const repoRoot = makeFixture({ localNamespaces: true, seTemplateLibrary: true });
  const bindingPath = path.join(repoRoot, "_workmeta", "system", "bindings", "workspace_junctions.yaml");
  writeFileSync(
    bindingPath,
    `${readFileSync(bindingPath, "utf8")}  - workspace_alias: system
    project_code: null
    cloud_relative_path: system
    link_relative_path: _workspaces/system
    state: planned
`,
    "utf8",
  );
  const result = auditWorkspaceJunctions({ repoRoot });

  assert.equal(result.status, "passed");
  assert.equal(result.declared_active_count, 2);
  assert.equal(result.extras.some((row) => row.workspace_alias === "_local"), false);
  assert.equal(result.extras.some((row) => row.workspace_alias === "_local_hold"), false);
  assert.equal(result.extras.some((row) => row.workspace_alias === "SE_TEMPLATE_LIBRARY"), false);
  assert.equal(result.rows.some((row) => row.workspace_alias === "system"), false);
});

test("reports declared directories and files as non-link gaps without local path leakage", () => {
  const repoRoot = makeFixture({
    generalDirectoryNotLink: true,
    projectFileNotLink: true,
  });
  const cloudRoot = path.join(repoRoot, "cloud");
  const result = auditWorkspaceJunctions({ repoRoot });

  assert.equal(result.status, "gaps_found");

  const directoryProblem = result.problems.find((row) => row.workspace_alias === "general_work");
  assert.equal(directoryProblem.observed_local_state, "directory_not_link");
  assert.equal(directoryProblem.target_suffix_ok, false);
  assert.equal(directoryProblem.action, "owner_decision_required");
  assert.equal(Object.hasOwn(directoryProblem, "actual_target_tail"), false);

  const fileProblem = result.problems.find((row) => row.workspace_alias === "P24-049");
  assert.equal(fileProblem.observed_local_state, "file_not_link");
  assert.equal(fileProblem.target_suffix_ok, false);
  assert.equal(fileProblem.action, "owner_decision_required");
  assert.equal(Object.hasOwn(fileProblem, "actual_target_tail"), false);

  const jsonOutput = JSON.stringify(result);
  assert.equal(jsonOutput.includes(repoRoot), false);
  assert.equal(jsonOutput.includes(cloudRoot), false);

  const cli = spawnSync(process.execPath, [CLI_PATH, "audit", "--repo-root", repoRoot], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr, "");
  assert.equal(cli.stdout.includes("- general_work: directory_not_link; action=owner_decision_required; expected=general_work; actual_tail="), true);
  assert.equal(cli.stdout.includes("- P24-049: file_not_link; action=owner_decision_required; expected=P24-049 저주파SAS; actual_tail="), true);
  assert.equal(cli.stdout.includes(repoRoot), false);
  assert.equal(cli.stdout.includes(cloudRoot), false);
});

function makeFixture(options = {}) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "soulforge-junction-audit-"));
  const bindingDir = path.join(repoRoot, "_workmeta", "system", "bindings");
  const workspaceRoot = path.join(repoRoot, "_workspaces");
  const cloudRoot = path.join(repoRoot, "cloud");
  mkdirSync(bindingDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(path.join(workspaceRoot, "system"), { recursive: true });

  const projectTarget = path.join(cloudRoot, "P24-049 저주파SAS");
  const wrongTarget = path.join(cloudRoot, "P24-049 wrong");
  const generalTarget = path.join(cloudRoot, "general_work");
  mkdirSync(projectTarget, { recursive: true });
  mkdirSync(wrongTarget, { recursive: true });
  mkdirSync(generalTarget, { recursive: true });

  if (options.generalDirectoryNotLink) {
    mkdirSync(path.join(workspaceRoot, "general_work"), { recursive: true });
  } else {
    linkDir(generalTarget, path.join(workspaceRoot, "general_work"));
  }
  if (options.projectFileNotLink) {
    writeFileSync(path.join(workspaceRoot, "P24-049"), "synthetic non-link fixture\n", "utf8");
  } else {
    linkDir(options.stale ? wrongTarget : projectTarget, path.join(workspaceRoot, "P24-049"));
  }
  if (options.extra) {
    linkDir(cloudRoot, path.join(workspaceRoot, "company"));
  }
  if (options.navigationIndex) {
    writeFileSync(path.join(workspaceRoot, "00_project_index.html"), "<!doctype html>\n", "utf8");
  }
  if (options.localNamespaces) {
    mkdirSync(path.join(workspaceRoot, "_local", "pc-fixture"), { recursive: true });
    mkdirSync(path.join(workspaceRoot, "_local_hold", "system"), { recursive: true });
  }
  if (options.seTemplateLibrary) {
    mkdirSync(path.join(workspaceRoot, "SE_TEMPLATE_LIBRARY"), { recursive: true });
  }

  writeFileSync(
    path.join(bindingDir, "workspace_junctions.yaml"),
    `schema_version: soulforge.workspace_junction_binding.v1
junctions:
  - workspace_alias: general_work
    project_code: null
    cloud_relative_path: general_work
    link_relative_path: _workspaces/general_work
    state: active
  - workspace_alias: P24-049
    project_code: P24-049
    cloud_relative_path: P24-049 저주파SAS
    link_relative_path: _workspaces/P24-049
    state: active
`,
    "utf8",
  );

  return repoRoot;
}

function linkDir(target, linkPath) {
  symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}
