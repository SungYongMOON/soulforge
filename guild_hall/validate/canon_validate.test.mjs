import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const validatorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "canon_validate.mjs");

test("canon validator accepts canonical knowledge and class-local knowledge refs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-knowledge-"));
  try {
    await writeValidFixture(root);

    const result = await runValidator(root);

    assert.equal(result.code, 0);
    assert.equal(result.report.ok, true);
    assert.equal(result.report.checked.includes(".registry/knowledge/frontline_doctrine/knowledge.yaml"), true);
    assert.equal(result.report.checked.includes(".registry/classes/knight/knowledge_refs.yaml"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator rejects unresolved and duplicate knowledge refs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-knowledge-"));
  try {
    await writeValidFixture(root, {
      refsYaml: [
        "class_id: knight",
        "kind: knowledge_refs",
        "status: active",
        "assign:",
        "  - assign: line_doctrine",
        "    ref: missing_knowledge",
        "  - assign: line_doctrine",
        "    ref: frontline_doctrine",
        "",
      ].join("\n"),
    });

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(issueIds.includes("knowledge_refs_ref_unresolved"), true);
    assert.equal(issueIds.includes("knowledge_refs_duplicate_assign"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canon validator checks knowledge id, kind, status, and class pointer structure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-canon-knowledge-"));
  try {
    await writeValidFixture(root, {
      knowledgeYaml: [
        "knowledge_id: wrong_id",
        "kind: note",
        "title: Frontline Doctrine",
        "",
      ].join("\n"),
      classYaml: [
        "class_id: knight",
        "kind: class",
        "status: active",
        "knowledge_refs: missing_refs.yaml",
        "",
      ].join("\n"),
      refsYaml: null,
    });

    const result = await runValidator(root);
    const issueIds = result.report.errors.map((error) => error.id);

    assert.equal(result.code, 1);
    assert.equal(result.report.ok, false);
    assert.equal(issueIds.includes("knowledge_id_mismatch"), true);
    assert.equal(issueIds.includes("knowledge_kind_invalid"), true);
    assert.equal(issueIds.includes("knowledge_status_missing"), true);
    assert.equal(issueIds.includes("knowledge_refs_file_missing"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function runValidator(root) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [validatorPath, "--root", root, "--json"], { maxBuffer: 1024 * 1024 });
    return { code: 0, report: JSON.parse(stdout) };
  } catch (error) {
    return {
      code: error.code,
      report: JSON.parse(error.stdout),
    };
  }
}

async function writeValidFixture(root, overrides = {}) {
  const knowledgeYaml = overrides.knowledgeYaml ?? [
    "knowledge_id: frontline_doctrine",
    "kind: knowledge",
    "status: active",
    "title: Frontline Doctrine",
    "",
  ].join("\n");
  const classYaml = overrides.classYaml ?? [
    "class_id: knight",
    "kind: class",
    "status: active",
    "knowledge_refs: knowledge_refs.yaml",
    "",
  ].join("\n");
  const refsYaml = overrides.refsYaml === undefined ? [
    "class_id: knight",
    "kind: knowledge_refs",
    "status: active",
    "assign:",
    "  - assign: line_doctrine",
    "    ref: frontline_doctrine",
    "",
  ].join("\n") : overrides.refsYaml;

  await mkdir(path.join(root, ".unit"), { recursive: true });
  await writeFixture(root, "_workspaces/README.md", "# Workspaces\n");
  await writeFixture(root, ".registry/index.yaml", "entries: []\n");
  await writeFixture(root, ".workflow/index.yaml", "entries: []\n");
  await writeFixture(root, ".party/index.yaml", "entries: []\n");
  await writeFixture(root, ".mission/index.yaml", "entries: []\n");
  await writeFixture(root, ".registry/species/human/species.yaml", "species_id: human\nheroes: []\n");
  await writeFixture(root, ".registry/classes/knight/class.yaml", classYaml);
  if (refsYaml !== null) {
    await writeFixture(root, ".registry/classes/knight/knowledge_refs.yaml", refsYaml);
  }
  await writeFixture(root, ".registry/knowledge/frontline_doctrine/knowledge.yaml", knowledgeYaml);
}

async function writeFixture(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
