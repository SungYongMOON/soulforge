import test from "node:test";
import assert from "node:assert/strict";
import { classifyPath, classifyPaths, PATH_BUDGET } from "./path_length_policy.mjs";

test("short conventional paths pass", () => {
  assert.equal(classifyPath("docs/architecture/workspace/README.md").ok, true);
  assert.equal(classifyPath("_workmeta/P26-014/runs/pilot_01/receipts/execution_receipt.json").ok, true);
  assert.equal(classifyPath("guild_hall/engineering_engine/stage_rules", { kind: "directory" }).ok, true);
});

test("total length over the budget is refused", () => {
  const long = "a/" + "b".repeat(PATH_BUDGET.max_total) + "/c.json";
  const r = classifyPath(long);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.id === "path_too_long"));
});

test("a directory segment over 60 and a basename over 60 are refused", () => {
  const seg = classifyPath(`x/${"d".repeat(61)}/f.txt`);
  assert.ok(seg.violations.some((v) => v.id === "dir_segment_too_long"));
  const base = classifyPath(`x/${"m".repeat(61)}.txt`);
  assert.ok(base.violations.some((v) => v.id === "basename_too_long"));
  // only the final extension is stripped; a compound suffix counts toward the stem
  assert.equal(classifyPath(`x/${"m".repeat(55)}.card.json`).ok, true);
  assert.equal(classifyPath(`x/${"m".repeat(60)}.source_card.json`).ok, false);
});

test("a slug folder must not be repeated in the file name", () => {
  const r = classifyPath("knowledge/common/dapa_program_management_rule/dapa_program_management_rule.source_card.json");
  assert.ok(r.violations.some((v) => v.id === "slug_repeated_in_basename"));
  assert.equal(classifyPath("knowledge/common/dapa_program_management_rule/source_card.json").ok, true);
  // short parents are not slugs
  assert.equal(classifyPath("docs/README.md").ok, true);
});

test("hashes longer than 16 hex in names are refused", () => {
  const h = "aue_" + "0123456789abcdef".repeat(4);
  assert.ok(classifyPath(`state/${h}/record.json`).violations.some((v) => v.id === "hash_too_long_in_dir_name"));
  assert.equal(classifyPath("state/aue_0123456789abcdef/record.json").ok, true);
});

test("classifyPaths reports only offending rows", () => {
  const report = classifyPaths(["ok/a.md", `bad/${"z".repeat(70)}.md`]);
  assert.equal(report.ok, false);
  assert.equal(report.checked, 2);
  assert.equal(report.violation_count, 1);
});
