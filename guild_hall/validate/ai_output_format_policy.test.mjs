import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  POLICY_DOC_RELATIVE_PATH,
  parseArgs,
  validatePolicyDoc,
} from "./ai_output_format_policy.mjs";

test("validatePolicyDoc accepts a policy doc with hyphenated required terms", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-ai-output-policy-"));
  try {
    await writePolicy(
      root,
      [
        "# AI Output Format Policy",
        "",
        "- source-of-truth governs output format decisions.",
        "- Every human-review artifact stays reviewable.",
        "- Markdown is the default authoring surface.",
        "- HTML is allowed only as an explicit rendering target.",
        "- Export steps must preserve the reviewed artifact.",
        "- The secrets/private boundary is never crossed by generated output.",
        "",
      ].join("\n"),
    );

    const report = await validatePolicyDoc({ root });

    assert.equal(report.ok, true);
    assert.deepEqual(report.missing_terms, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validatePolicyDoc accepts underscore source and review artifact terms", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-ai-output-policy-"));
  try {
    await writePolicy(
      root,
      [
        "# AI Output Format Policy",
        "",
        "- source_of_truth names the governing document.",
        "- human_review_artifact names the reviewable output.",
        "- markdown remains required.",
        "- html remains an explicit target.",
        "- export remains an explicit step.",
        "- secret/private boundary handling stays mandatory.",
        "",
      ].join("\n"),
    );

    const report = await validatePolicyDoc({ root });

    assert.equal(report.ok, true);
    assert.deepEqual(report.missing_terms, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validatePolicyDoc fails when the policy doc is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-ai-output-policy-"));
  try {
    const report = await validatePolicyDoc({ root });

    assert.equal(report.ok, false);
    assert.equal(report.errors[0].id, "policy_doc_missing");
    assert.equal(report.errors[0].path, POLICY_DOC_RELATIVE_PATH);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validatePolicyDoc fails when required terms are missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-ai-output-policy-"));
  try {
    await writePolicy(
      root,
      [
        "# AI Output Format Policy",
        "",
        "- source-of-truth governs output format decisions.",
        "- Every human-review artifact stays reviewable.",
        "- Markdown is the default authoring surface.",
        "- Export steps must preserve the reviewed artifact.",
        "- The secrets/private boundary is never crossed by generated output.",
        "",
      ].join("\n"),
    );

    const report = await validatePolicyDoc({ root });

    assert.equal(report.ok, false);
    assert.equal(report.errors[0].id, "missing_required_policy_terms");
    assert.deepEqual(report.missing_terms, ["html"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parseArgs supports fixture roots for deterministic CLI checks", () => {
  assert.deepEqual(parseArgs(["--json", "--root", "/tmp/example", "--policy-path=policy.md"]), {
    json: true,
    root: "/tmp/example",
    policyPath: "policy.md",
  });
});

async function writePolicy(root, content) {
  const policyPath = path.join(root, POLICY_DOC_RELATIVE_PATH);
  await mkdir(path.dirname(policyPath), { recursive: true });
  await writeFile(policyPath, content, "utf8");
}
