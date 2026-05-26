import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { auditWorkspaceJunctions } from "./audit.mjs";

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

  linkDir(generalTarget, path.join(workspaceRoot, "general_work"));
  linkDir(options.stale ? wrongTarget : projectTarget, path.join(workspaceRoot, "P24-049"));
  if (options.extra) {
    linkDir(cloudRoot, path.join(workspaceRoot, "company"));
  }
  if (options.navigationIndex) {
    writeFileSync(path.join(workspaceRoot, "00_project_index.html"), "<!doctype html>\n", "utf8");
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
