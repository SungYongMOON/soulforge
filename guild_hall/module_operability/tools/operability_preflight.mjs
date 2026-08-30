// Module-operability preflight — the aggregate gate CLI (leaf 2).
//
//   node guild_hall/module_operability/tools/operability_preflight.mjs
//     [--stamp <module-dir>]   stamp the computed release digest into that
//                              module's manifest (an explicit release action,
//                              never automatic)
//
// Runs, fail-closed, over the DECLARED manifest set (all guild_hall module
// manifests plus the explicitly enrolled app manifests):
//   1. manifest completeness schema (incl. lifecycle-probe and
//      release-digest-staleness rules, digest computed per module);
//   2. declared-dependency resolution (capabilities and module ids);
//   3. validator-existence: every command in every manifest's `validators`
//      must reference test files that exist on disk (the fixture/integration
//      contract — a declared validator that does not exist is a lie);
//   4. import-cycle scan across guild_hall and the enrolled app source.
// Prints a receipt and exits nonzero on any violation.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";

import { computeModuleReleaseDigest, validateModuleManifest } from "../src/manifest_schema.mjs";
import { checkDeclaredDependencies } from "../src/dependency_check.mjs";
import { findImportCycles } from "../src/import_cycle_check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// App surfaces enrolled into the manifest set beyond guild_hall/*/.
export const ENROLLED_APP_MANIFESTS = Object.freeze([
  "ui-workspace/apps/dev-erp/module.manifest.json",
  "ui-workspace/apps/team-ops-board/module.manifest.json",
]);

export function discoverManifestPaths() {
  const paths = [];
  const guildHall = join(ROOT, "guild_hall");
  for (const name of readdirSync(guildHall).sort()) {
    const candidate = join(guildHall, name, "module.manifest.json");
    if (statSync(join(guildHall, name), { throwIfNoEntry: false })?.isDirectory() && existsSync(candidate)) {
      paths.push(`guild_hall/${name}/module.manifest.json`);
    }
  }
  for (const extra of ENROLLED_APP_MANIFESTS) {
    if (existsSync(join(ROOT, ...extra.split("/")))) paths.push(extra);
  }
  return paths;
}

// guild_hall child directories WITHOUT a manifest. Absence is not silent: the
// preflight receipt lists the count so unenrolled modules stay visible.
// (Enrolling the legacy modules is deliberate follow-on work, not a
// side-effect of this gate.)
export function listUnenrolledGuildHallDirs() {
  const unenrolled = [];
  const guildHall = join(ROOT, "guild_hall");
  for (const name of readdirSync(guildHall).sort()) {
    const dir = join(guildHall, name);
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    if (name === "state") continue;
    if (!existsSync(join(dir, "module.manifest.json"))) unenrolled.push(`guild_hall/${name}`);
  }
  return unenrolled;
}

export function runPreflight() {
  const problems = [];
  const manifests = [];
  const manifestPaths = discoverManifestPaths();
  for (const relPath of manifestPaths) {
    const moduleDir = join(ROOT, ...dirname(relPath).split("/"));
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(ROOT, ...relPath.split("/")), "utf8"));
    } catch {
      problems.push(`manifest_unreadable:${relPath}`);
      continue;
    }
    const computed = manifest.release_digest === null ? undefined : computeModuleReleaseDigest(moduleDir);
    const verdict = validateModuleManifest(manifest, { computedReleaseDigest: computed });
    for (const code of verdict.problems) problems.push(`${relPath}:${code}`);
    // Validator-existence: every test file named in a validator command must
    // exist (commands are node --test/--check style with repo-relative args).
    for (const command of manifest.validators ?? []) {
      for (const token of String(command).split(/\s+/)) {
        if (/\.(mjs|cjs|js)$/.test(token) && !token.startsWith("-")) {
          if (!existsSync(join(ROOT, ...token.split("/")))) {
            problems.push(`validator_file_missing:${relPath}:${token}`);
          }
        }
      }
    }
    manifests.push(manifest);
  }

  const dependencyVerdict = checkDeclaredDependencies(manifests);
  for (const code of dependencyVerdict.problems) problems.push(`dependency:${code}`);

  const cycleRoots = ["guild_hall", "ui-workspace/apps/dev-erp/src", "ui-workspace/apps/team-ops-board/src"];
  const cycleResult = findImportCycles(ROOT, cycleRoots);
  for (const cycle of cycleResult.cycles) {
    problems.push(`import_cycle:${cycle.join(" -> ")}`);
  }

  return {
    manifest_count: manifestPaths.length,
    unenrolled_guild_hall_dirs: listUnenrolledGuildHallDirs().length,
    scanned_modules: cycleResult.moduleCount,
    scanned_edges: cycleResult.edgeCount,
    problems,
    ok: problems.length === 0,
  };
}

function cliMain() {
  const args = process.argv.slice(2);
  const stampIndex = args.indexOf("--stamp");
  if (stampIndex !== -1) {
    const moduleRel = args[stampIndex + 1];
    if (!moduleRel) {
      process.stderr.write("--stamp requires a module directory\n");
      process.exit(2);
    }
    const manifestPath = join(ROOT, ...moduleRel.split("/"), "module.manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.release_digest = computeModuleReleaseDigest(join(ROOT, ...moduleRel.split("/")));
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`stamped ${moduleRel} release_digest=${manifest.release_digest}\n`);
  }
  const receipt = runPreflight();
  process.stdout.write("Soulforge module-operability preflight\n");
  process.stdout.write(`manifests: ${receipt.manifest_count} (unenrolled guild_hall dirs: ${receipt.unenrolled_guild_hall_dirs})\n`);
  process.stdout.write(`import scan: ${receipt.scanned_modules} files / ${receipt.scanned_edges} edges\n`);
  for (const problem of receipt.problems) process.stdout.write(`VIOLATION ${problem}\n`);
  process.stdout.write(`ok: ${receipt.ok ? "yes" : "no"} (violations: ${receipt.problems.length})\n`);
  process.exit(receipt.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain();
}
