// Path-length and name-budget policy.
//
// Owner decision 2026-08-18: Windows long paths stay OFF (OneDrive/Explorer/Office/HWP break on
// long paths regardless of the registry switch), so every path we create must fit a budget:
//
//   total path under the repo root  <= 200 characters (counted as a 13-char drive+repo prefix + relative)
//   one directory segment           <= 60 characters (workflow/mission ids are descriptive)
//   one file basename (without ext) <= 60 characters
//   a file inside a slug folder must not repeat the folder's slug in its own name
//   content hashes used as names    <= 16 hex characters
//
// This module is a pure classifier plus a small CLI. It never renames or writes.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PATH_LENGTH_POLICY_SCHEMA_VERSION = "soulforge.path_length_policy.v0";
export const PATH_BUDGET = Object.freeze({
  // Length of the local checkout prefix (drive letter, colon, separator, repo folder, separator)
  // kept as a number rather than a literal path so this public file carries no host-local path.
  root_prefix_length: 13,
  max_total: 200,
  max_dir_segment: 60,
  max_basename: 60,
  max_hash_in_name: 16,
  slug_repeat_min_parent: 12,
});

const HEX_RUN = /[0-9a-f]{17,}/i;

/**
 * Classify one repo-relative path (forward or back slashes). Returns { ok, violations[] }.
 * `kind` is "file" (default) or "directory".
 */
export function classifyPath(relativePath, { kind = "file", budget = PATH_BUDGET } = {}) {
  const violations = [];
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return { ok: false, violations: [{ id: "path_empty" }] };
  }
  const rel = relativePath.replace(/\//g, "\\").replace(/^\.\\/, "");
  const total = budget.root_prefix_length + rel.length;
  if (total > budget.max_total) violations.push({ id: "path_too_long", total, max: budget.max_total });
  const segments = rel.split("\\").filter(Boolean);
  const dirSegments = kind === "file" ? segments.slice(0, -1) : segments;
  for (const seg of dirSegments) {
    if (seg.length > budget.max_dir_segment) violations.push({ id: "dir_segment_too_long", segment: seg, length: seg.length, max: budget.max_dir_segment });
    if (HEX_RUN.test(seg)) violations.push({ id: "hash_too_long_in_dir_name", segment: seg, max_hex: budget.max_hash_in_name });
  }
  if (kind === "file") {
    const base = segments[segments.length - 1] ?? "";
    const stem = base.replace(/(\.[A-Za-z0-9]{1,8})+$/, "");
    if (stem.length > budget.max_basename) violations.push({ id: "basename_too_long", basename: base, length: stem.length, max: budget.max_basename });
    if (HEX_RUN.test(stem)) violations.push({ id: "hash_too_long_in_basename", basename: base, max_hex: budget.max_hash_in_name });
    const parent = segments[segments.length - 2] ?? "";
    if (parent.length >= budget.slug_repeat_min_parent && stem.startsWith(parent)) {
      violations.push({ id: "slug_repeated_in_basename", parent, basename: base });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Classify many paths; returns a report with counts and the offending rows. */
export function classifyPaths(paths, options = {}) {
  const rows = [];
  for (const p of paths) {
    const r = classifyPath(p, options);
    if (!r.ok) rows.push({ path: p, violations: r.violations });
  }
  return {
    schema_version: PATH_LENGTH_POLICY_SCHEMA_VERSION,
    ok: rows.length === 0,
    checked: paths.length,
    violation_count: rows.length,
    budget: PATH_BUDGET,
    violations: rows,
  };
}

function gitList(repoRoot, args) {
  try {
    const out = execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return out.split(/\0|\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

export function collectScopedPaths(repoRoot, scope) {
  if (scope === "tracked") return gitList(repoRoot, ["ls-files", "-z"]);
  // changed = worktree diff vs HEAD + staged + untracked (not ignored)
  const changed = new Set([
    ...gitList(repoRoot, ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"]),
    ...gitList(repoRoot, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRTUXB", "--"]),
    ...gitList(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return [...changed];
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true; else { args[key] = next; i += 1; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
  const json = args.json === true;
  let report;
  if (args["assert-path"]) {
    const kind = args.kind === "directory" ? "directory" : "file";
    const r = classifyPath(String(args["assert-path"]), { kind });
    report = { schema_version: PATH_LENGTH_POLICY_SCHEMA_VERSION, ok: r.ok, target: args["assert-path"], kind, budget: PATH_BUDGET, violations: r.violations };
  } else {
    const scope = args.scope === "tracked" ? "tracked" : "changed";
    const paths = collectScopedPaths(repoRoot, scope);
    report = { ...classifyPaths(paths), scope };
  }
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`Soulforge Path Length Policy\nok: ${report.ok ? "yes" : "no"}\n`);
    if (report.scope) process.stdout.write(`scope: ${report.scope}\nchecked: ${report.checked}\nviolations: ${report.violation_count}\n`);
    if (report.target) process.stdout.write(`target: ${report.target}\n`);
    for (const row of (report.violations ?? []).slice(0, 25)) {
      process.stdout.write(`- ${row.path ?? report.target}: ${(row.violations ?? [row]).map((v) => v.id).join(", ")}\n`);
    }
    if ((report.violations ?? []).length > 25) process.stdout.write(`... ${report.violations.length - 25} more (use --json)\n`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((error) => { process.stderr.write(`${error?.stack ?? error}\n`); process.exitCode = 2; });
}
