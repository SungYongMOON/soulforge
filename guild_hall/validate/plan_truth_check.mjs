// Plan-truth check — keeps the program's executed-leaf ledger honest.
//
// Verifies, against the CURRENT repository:
//   1. every commit hash in plan-14's per-leaf trace table exists in git;
//   2. every validator named in the ledger's register exists as a root
//      package.json script;
//   3. every `L-*` leaf id referenced in the lane × maturity table resolves
//      to a trace-table row (no dangling ledger references).
// It asserts EXISTENCE and cross-consistency only — leaf content claims stay
// owned by the commits and reviews themselves.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLAN_PATH = join(ROOT, "docs", "architecture", "foundation", "team_member_engineering_program", "14_ROADMAP_GATES_AND_DAG.md");

const plan = readFileSync(PLAN_PATH, "utf8");
const problems = [];

function section(startHeading, endHeading) {
  const start = plan.indexOf(startHeading);
  if (start === -1) {
    problems.push(`missing_section:${startHeading}`);
    return "";
  }
  const end = endHeading ? plan.indexOf(endHeading, start) : -1;
  return end === -1 ? plan.slice(start) : plan.slice(start, end);
}

// 1) Trace-table commits exist AND are ancestors of HEAD: a dangling or
//    side-branch commit must not satisfy the ledger.
const trace = section("### Per-leaf durable trace", "### Current validator register");
const traceHashes = [...trace.matchAll(/`([0-9a-f]{8})`/g)].map((match) => match[1]);
if (traceHashes.length < 10) problems.push(`trace_table_suspiciously_small:${traceHashes.length}`);
for (const hash of new Set(traceHashes)) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", hash, "HEAD"], { cwd: ROOT, stdio: "ignore" });
  } catch {
    problems.push(`trace_commit_not_ancestor_or_git_unavailable:${hash}`);
  }
}

// 2) Ledger-registered validators exist as npm scripts.
const register = section("### Current validator register", "### Remaining branches");
const validators = [...register.matchAll(/`(validate:[a-z0-9-]+)`/g)].map((match) => match[1]);
if (validators.length < 5) problems.push(`validator_register_suspiciously_small:${validators.length}`);
const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts ?? {};
for (const name of new Set(validators)) {
  if (!(name in scripts)) problems.push(`validator_script_missing:${name}`);
}

// 3) Lane-table leaf ids resolve to trace rows.
const lanes = section("### Lane × maturity", "### Per-leaf durable trace");
const laneIds = [...lanes.matchAll(/`(L-[A-Z0-9-]+)`/g)].map((match) => match[1]);
if (laneIds.length < 10) problems.push(`lane_refs_suspiciously_small:${laneIds.length}`);
const traceIds = new Set([...trace.matchAll(/`(L-[A-Z0-9-]+)`/g)].map((match) => match[1]));
for (const id of new Set(laneIds)) {
  if (!traceIds.has(id)) problems.push(`lane_leaf_unresolved:${id}`);
}

process.stdout.write("Soulforge plan-truth check\n");
process.stdout.write(`trace commits: ${new Set(traceHashes).size}\n`);
process.stdout.write(`registered validators: ${new Set(validators).size}\n`);
process.stdout.write(`lane leaf refs: ${new Set(laneIds).size}\n`);
if (problems.length > 0) {
  for (const problem of problems) process.stdout.write(`VIOLATION ${problem}\n`);
  process.stdout.write(`ok: no (violations: ${problems.length})\n`);
  process.exit(1);
}
process.stdout.write("ok: yes (violations: 0)\n");
