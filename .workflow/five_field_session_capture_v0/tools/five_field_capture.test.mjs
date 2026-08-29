import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "five_field_capture.mjs");

function run(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  let json = null;
  try { json = JSON.parse((result.stdout || "").trim().split("\n").pop()); } catch { /* not json */ }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

function record(overrides = {}) {
  return JSON.stringify({
    request_kind: "test/case",
    judgment: "judged",
    output: "produced",
    verification: "verified once",
    stop_conditions: [],
    ...overrides,
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "five-field-capture-"));
  return root;
}

function ledgerPath(root, project) {
  return join(root, "_workmeta", project, "reports", "procedure_capture", "five_field_log.jsonl");
}

function workmetaDirNames(root) {
  try {
    return readdirSync(join(root, "_workmeta"), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

test("legacy SYSTEM alias lands in the canonical system ledger, not a case-alias directory", async () => {
  const root = fixture();
  try {
    const seed = run([
      "--session-ref", "seed-session",
      "--worker", "codex_test",
      "--repo-root", root,
      "--json", record({ output: "seed" }),
    ]);
    assert.equal(seed.status, 0);
    assert.equal(existsSync(ledgerPath(root, "system")), true);

    const aliased = run([
      "--project", "SYSTEM",
      "--session-ref", "alias-session",
      "--worker", "codex_test",
      "--repo-root", root,
      "--json", record({ output: "aliased" }),
    ]);
    assert.equal(aliased.status, 0, aliased.stderr || aliased.stdout);
    assert.deepEqual(workmetaDirNames(root), ["system"], "must not create a separately-named SYSTEM ledger directory entry");

    const lines = readFileSync(ledgerPath(root, "system"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.project_code === "system"), "future records from the SYSTEM alias must use canonical project_code system");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SYSTEM alias holds instead of writing system into a pre-existing case-variant SYSTEM directory", async () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "_workmeta", "SYSTEM", "reports", "procedure_capture"), { recursive: true });
    assert.equal(existsSync(ledgerPath(root, "system")), false, "canonical system dir must not pre-exist for this case");

    const aliased = run([
      "--project", "SYSTEM",
      "--session-ref", "held-session",
      "--worker", "codex_test",
      "--repo-root", root,
      "--json", record({ output: "held" }),
    ]);
    assert.notEqual(aliased.status, 0);
    assert.equal(aliased.json?.ok, false);
    assert.equal(aliased.json?.error, "project_directory_case_mismatch");
    assert.equal(existsSync(ledgerPath(root, "system")), false, "must not create the canonical system ledger directory");
    assert.deepEqual(workmetaDirNames(root), ["SYSTEM"], "must not create a second case-variant ledger directory entry");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a non-legacy project case mismatch against an existing ledger directory is rejected", async () => {
  const root = fixture();
  try {
    const seed = run([
      "--project", "P26-014",
      "--session-ref", "seed-session",
      "--worker", "codex_test",
      "--repo-root", root,
      "--json", record({ output: "seed" }),
    ]);
    assert.equal(seed.status, 0);
    assert.equal(existsSync(ledgerPath(root, "P26-014")), true);

    const mismatched = run([
      "--project", "p26-014",
      "--session-ref", "mismatch-session",
      "--worker", "codex_test",
      "--repo-root", root,
      "--json", record({ output: "mismatch" }),
    ]);
    assert.notEqual(mismatched.status, 0);
    assert.equal(mismatched.json?.ok, false);
    assert.deepEqual(workmetaDirNames(root), ["P26-014"], "must not create a second case-variant ledger directory entry");

    const lines = readFileSync(ledgerPath(root, "P26-014"), "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 1, "the rejected write must not land in the canonical directory either");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a brand new project code with no existing directory is accepted as-is", async () => {
  const root = fixture();
  try {
    const first = run([
      "--project", "P26-099",
      "--session-ref", "fresh-session",
      "--worker", "codex_test",
      "--repo-root", root,
      "--json", record({ output: "fresh" }),
    ]);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.equal(existsSync(ledgerPath(root, "P26-099")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
