import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  POLICY_DOC_RELATIVE_PATH,
  parseArgs,
  schemaVersion,
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
  assert.deepEqual(parseArgs(["--json", "--root", "_workspaces/example", "--policy-path=policy.md"]), {
    json: true,
    root: "_workspaces/example",
    policyPath: "policy.md",
  });
});

test("CLI --json reports success without leaking the temp root or policy body", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-ai-output-policy-"));
  const bodyMarker = "SYNTHETIC_POLICY_BODY_MARKER_SHOULD_NOT_APPEAR";
  try {
    await writePolicy(
      root,
      [
        "# AI Output Format Policy",
        "",
        `- ${bodyMarker}`,
        "- source-of-truth governs output format decisions.",
        "- Every human-review artifact stays reviewable.",
        "- Markdown is the default authoring surface.",
        "- HTML is allowed only as an explicit rendering target.",
        "- Export steps must preserve the reviewed artifact.",
        "- The secrets/private boundary is never crossed by generated output.",
        "",
      ].join("\n"),
    );

    const result = await runCli(["--json", "--root", root]);
    const report = JSON.parse(result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(report.schema_version, schemaVersion);
    assert.equal(report.ok, true);
    assert.equal(report.policy_path, POLICY_DOC_RELATIVE_PATH);
    assert.deepEqual(report.missing_terms, []);
    assert.deepEqual(report.errors, []);
    assert.equal(output.includes(root), false);
    assert.equal(output.includes(bodyMarker), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI --json reports failures without leaking paths, stack traces, or policy body", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-ai-output-policy-"));
  const bodyMarker = "SYNTHETIC_POLICY_BODY_MARKER_SHOULD_NOT_APPEAR";
  try {
    await writePolicy(
      root,
      [
        "# AI Output Format Policy",
        "",
        `- ${bodyMarker}`,
        "- source-of-truth governs output format decisions.",
        "- Every human-review artifact stays reviewable.",
        "- Markdown is the default authoring surface.",
        "- Export steps must preserve the reviewed artifact.",
        "- The secrets/private boundary is never crossed by generated output.",
        "",
      ].join("\n"),
    );

    const result = await runCli(["--json", "--root", root]);
    const report = JSON.parse(result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.equal(report.schema_version, schemaVersion);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing_terms, ["html"]);
    assert.equal(report.errors[0].id, "missing_required_policy_terms");
    assert.equal(output.includes(root), false);
    assert.equal(output.includes(bodyMarker), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writePolicy(root, content) {
  const policyPath = path.join(root, POLICY_DOC_RELATIVE_PATH);
  await mkdir(path.dirname(policyPath), { recursive: true });
  await writeFile(policyPath, content, "utf8");
}

async function runCli(args) {
  const cliPath = fileURLToPath(new URL("./ai_output_format_policy.mjs", import.meta.url));

  return await new Promise((resolve) => {
    execFile(process.execPath, [cliPath, ...args], { encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({
        code: error?.code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}
