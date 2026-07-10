#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { probeCodexPermissionBoundary } from "../src/codex_bridge.mjs";

const rawHome = String(process.env.DEV_ERP_CODEX_HOME || "").trim();
const HERE = dirname(fileURLToPath(import.meta.url));
const pathInside = (base, target) => {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
let boundaryError = null;
let codexHome = null;
try {
  const sourceRoot = realpathSync(String(execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: HERE,
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  })).trim());
  const entry = lstatSync(rawHome);
  codexHome = realpathSync(rawHome);
  const tempRoot = realpathSync(tmpdir());
  if (!entry.isDirectory() || entry.isSymbolicLink()
      || pathInside(sourceRoot, codexHome) || pathInside(codexHome, sourceRoot)
      || pathInside(sourceRoot, tempRoot) || pathInside(tempRoot, sourceRoot)) {
    boundaryError = "probe_runtime_roots_unsafe";
  }
} catch {
  boundaryError = "probe_runtime_roots_unavailable";
}
if (!rawHome || !isAbsolute(rawHome)) {
  process.stdout.write(`${JSON.stringify({
    schema: "dev_erp.codex_permission_boundary_probe.v3",
    proven: false,
    error: "dedicated_codex_home_required",
  })}\n`);
  process.exitCode = 2;
} else if (boundaryError) {
  process.stdout.write(`${JSON.stringify({
    schema: "dev_erp.codex_permission_boundary_probe.v3",
    proven: false,
    error: boundaryError,
  })}\n`);
  process.exitCode = 2;
} else {
  const result = probeCodexPermissionBoundary({ codexHome });
  process.stdout.write(`${JSON.stringify({
    schema: "dev_erp.codex_permission_boundary_probe.v3",
    proven: result.proven === true,
    source: result.source,
    error: result.error,
    runtime_identity_sha256: result.codex_command_revision || null,
    permission_profile_revision: result.permission_profile_revision || null,
  })}\n`);
  process.exitCode = result.proven ? 0 : 1;
}
