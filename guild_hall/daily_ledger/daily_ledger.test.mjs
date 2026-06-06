import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSyntheticDailyLedger,
  buildSyntheticSoulforgeLedger,
  renderDailyWorklogDraft,
  validateDailyLedgerFiles,
  validateDailyLedgerObject,
} from "./daily_ledger.mjs";

test("validator accepts representative project, P00 inbox, and Soulforge subledger ledgers", async () => {
  const repoRoot = path.resolve(".");
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-daily-ledger-valid-"));

  try {
    const projectFile = await writeLedger(fixtureRoot, "project.json", buildSyntheticDailyLedger({
      project_code: "P26-014",
      ledger_code: "P26-014",
      ledger_id: "P26-014_2026-06-06",
      ledger_family: "company_project",
    }));
    const inboxFile = await writeLedger(fixtureRoot, "inbox.json", buildSyntheticDailyLedger({
      project_code: "P00-000_INBOX",
      ledger_code: "P00-000_INBOX",
      ledger_id: "P00-000_INBOX_2026-06-06",
      ledger_family: "company_inbox",
    }));
    const soulforgeFile = await writeLedger(fixtureRoot, "soulforge.json", buildSyntheticSoulforgeLedger({
      soulforge_subledger: "automation",
      ledger_code: "soulforge/automation",
      ledger_id: "soulforge_automation_2026-06-06",
    }));

    const result = await validateDailyLedgerFiles({
      repoRoot,
      ledgerFiles: [projectFile, inboxFile, soulforgeFile],
    });

    assert.equal(result.ok, true);
    assert.equal(result.ledger_count, 3);
    assert.equal(result.error_count, 0);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("worklog renderer orders project, P00 inbox, and Soulforge subledgers and reports explicit gaps", async () => {
  const repoRoot = path.resolve(".");
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-daily-ledger-render-"));

  try {
    const project = buildSyntheticDailyLedger({
      project_code: "P26-014",
      ledger_code: "P26-014",
      ledger_id: "P26-014_2026-06-06",
      ledger_family: "company_project",
    });
    project.entries[0].entry.summary_label = "Project work first";
    project.entries[0].entry.source_refs = ["_workmeta/P26-014/reports/safe_metadata/nonexistent.json#row=1"];

    const inbox = buildSyntheticDailyLedger({
      project_code: "P00-000_INBOX",
      ledger_code: "P00-000_INBOX",
      ledger_id: "P00-000_INBOX_2026-06-06",
      ledger_family: "company_inbox",
      coverage: {
        accepted_source_count: 1,
        skipped_source_count: 0,
        review_needed_count: 1,
        blocked_count: 0,
      },
    });
    inbox.entries[0].entry.summary_label = "Inbox review item";
    inbox.entries[0].entry.confidence = "review_needed";
    inbox.entries[0].entry.owner_review_state = "review_needed";
    inbox.entries[0].entry.report_visibility = "include_as_gap";

    const soulforge = buildSyntheticSoulforgeLedger({
      soulforge_subledger: "system",
      ledger_code: "soulforge/system",
      ledger_id: "soulforge_system_2026-06-06",
    });
    soulforge.entries[0].entry.summary_label = "Soulforge system work";

    const result = await renderDailyWorklogDraft({
      repoRoot,
      ledgerFiles: [
        await writeLedger(fixtureRoot, "soulforge.json", soulforge),
        await writeLedger(fixtureRoot, "inbox.json", inbox),
        await writeLedger(fixtureRoot, "project.json", project),
      ],
      expectedLedgerCodes: ["P26-014", "P00-000_INBOX", "soulforge/system", "soulforge/knowledge"],
      date: "2026-06-06",
    });

    assert.equal(result.boundary.ledger_only, true);
    assert.equal(result.boundary.source_refs_read, false);
    assert.match(result.markdown, /Project work first/u);
    assert.match(result.markdown, /Inbox review item/u);
    assert.match(result.markdown, /Soulforge system work/u);
    assert(result.markdown.indexOf("Project work first") < result.markdown.indexOf("Inbox review item"));
    assert(result.markdown.indexOf("Inbox review item") < result.markdown.indexOf("Soulforge system work"));
    assert.match(result.markdown, /soulforge\/knowledge: missing_ledger/u);
    assert.match(result.markdown, /P00-000_INBOX: incomplete_ledger/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("validator rejects raw payload fields, raw payload refs, absolute paths, and secrets", () => {
  const rawField = buildSyntheticDailyLedger();
  rawField.entries[0].entry.raw_body = "private body must not become ledger metadata";
  assertValidationError(rawField, "daily_ledger_raw_payload_field_blocked");

  const rawExtension = buildSyntheticDailyLedger();
  rawExtension.entries[0].entry.source_refs = ["_workmeta/P26-014/reports/mail/source.msg"];
  assertValidationError(rawExtension, "daily_ledger_ref_must_not_point_to_raw_payload_extension");

  const windowsAbsolute = buildSyntheticDailyLedger();
  windowsAbsolute.entries[0].entry.source_refs = [`${"C:"}\\Users\\owner\\Downloads\\source.json`];
  assertValidationError(windowsAbsolute, "daily_ledger_ref_must_not_contain_runtime_absolute_path");

  const posixAbsolute = buildSyntheticDailyLedger();
  posixAbsolute.entries[0].entry.work_item_ref = `${"/"}home/owner/source.json`;
  assertValidationError(posixAbsolute, "daily_ledger_ref_must_not_contain_runtime_absolute_path");

  const uncPath = buildSyntheticDailyLedger();
  uncPath.entries[0].entry.source_refs = ["\\\\server\\share\\source.json"];
  assertValidationError(uncPath, "daily_ledger_ref_must_not_contain_runtime_absolute_path");

  const secretText = buildSyntheticDailyLedger();
  secretText.entries[0].entry.summary_label = "token=abc1234567890 should be blocked";
  assertValidationError(secretText, "daily_ledger_text_must_not_contain_secret_like_text");

  const secretPath = buildSyntheticDailyLedger();
  secretPath.entries[0].entry.source_refs = ["_workmeta/P26-014/reports/.env"];
  assertValidationError(secretPath, "daily_ledger_ref_must_not_be_secret_like");
});

test("validator rejects invalid project codes and unknown Soulforge subledgers", () => {
  const invalidProject = buildSyntheticDailyLedger({
    project_code: "general_work",
    ledger_code: "general_work",
    ledger_id: "general_work_2026-06-06",
  });
  invalidProject.entries[0].entry.project_code = "general_work";
  invalidProject.entries[0].entry.ledger_code = "general_work";
  assertValidationError(invalidProject, "daily_ledger_invalid_project_code");

  const unknownSubledger = buildSyntheticSoulforgeLedger({
    soulforge_subledger: "unknown",
    ledger_code: "soulforge/unknown",
    ledger_id: "soulforge_unknown_2026-06-06",
  });
  unknownSubledger.entries[0].entry.soulforge_subledger = "unknown";
  unknownSubledger.entries[0].entry.ledger_code = "soulforge/unknown";
  assertValidationError(unknownSubledger, "daily_ledger_invalid_soulforge_subledger");
});

test("validator rejects project entry attribution drift", () => {
  const mismatchedProject = buildSyntheticDailyLedger({
    project_code: "P26-014",
    ledger_code: "P26-014",
    ledger_id: "P26-014_2026-06-06",
  });
  mismatchedProject.entries[0].entry.project_code = "P99-999";

  assertValidationError(mismatchedProject, "daily_ledger_entry_project_code_mismatch");
});

test("CLI validates explicit files and rejects non-ledger renderer inputs", async () => {
  const repoRoot = path.resolve(".");
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-daily-ledger-cli-"));

  try {
    const ledgerFile = await writeLedger(fixtureRoot, "project.json", buildSyntheticDailyLedger());
    const ok = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "validate", "--repo-root", repoRoot, "--ledger-file", ledgerFile, "--json"],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).ok, true);

    const outsideLedgerRoot = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "render", "--repo-root", repoRoot, "--ledger-ref", "docs/not_a_daily_ledger.json"],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(outsideLedgerRoot.status, 0);
    assert.match(outsideLedgerRoot.stderr, /daily_ledger_ref_must_stay_under_daily_ledger_roots/u);

    const nonLedgerSourceRef = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "render", "--repo-root", repoRoot, "--ledger-file", ledgerFile, "--source-ref", "_workmeta/P26-014/reports/source.json"],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(nonLedgerSourceRef.status, 0);
    assert.match(nonLedgerSourceRef.stderr, /unknown_daily_ledger_flag:source-ref/u);

    const secretLikeFile = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "validate", "--repo-root", repoRoot, "--ledger-file", path.join(fixtureRoot, "token.yaml")],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(secretLikeFile.status, 0);
    assert.match(secretLikeFile.stderr, /daily_ledger_file_secret_like_path_blocked/u);

    const traversalFile = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "validate", "--repo-root", repoRoot, "--ledger-file", "../outside-ledger.json"],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(traversalFile.status, 0);
    assert.match(traversalFile.stderr, /daily_ledger_file_must_not_traverse/u);

    const absoluteTraversalPath = `${fixtureRoot}${path.sep}daily-ledger-fixtures${path.sep}..${path.sep}candidate.json`;
    const absoluteTraversalFile = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "validate", "--repo-root", repoRoot, "--ledger-file", absoluteTraversalPath],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(absoluteTraversalFile.status, 0);
    assert.match(absoluteTraversalFile.stderr, /daily_ledger_file_must_not_traverse/u);

    const secretLikeRef = spawnSync(
      process.execPath,
      ["guild_hall/daily_ledger/cli.mjs", "render", "--repo-root", repoRoot, "--ledger-ref", "_workmeta/P26-014/daily_ledger/2026/session.yaml"],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(secretLikeRef.status, 0);
    assert.match(secretLikeRef.stderr, /daily_ledger_ref_secret_like_path_blocked/u);

    const unknownExpectedSubledger = spawnSync(
      process.execPath,
      [
        "guild_hall/daily_ledger/cli.mjs",
        "render",
        "--repo-root",
        repoRoot,
        "--ledger-file",
        ledgerFile,
        "--expect-ledger",
        "soulforge/unknown",
      ],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    assert.notEqual(unknownExpectedSubledger.status, 0);
    assert.match(unknownExpectedSubledger.stderr, /invalid_expected_ledger_code/u);
    assert.doesNotMatch(unknownExpectedSubledger.stderr, /soulforge\/unknown/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("renderer accepts repo-relative ledger refs only under daily ledger roots", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-daily-ledger-ref-"));

  try {
    const ledgerRef = "_workmeta/P26-014/daily_ledger/2026/2026-06-06.json";
    const ledgerPath = path.join(repoRoot, ...ledgerRef.split("/"));
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, `${JSON.stringify(buildSyntheticDailyLedger(), null, 2)}\n`, "utf8");

    const result = await renderDailyWorklogDraft({
      repoRoot,
      ledgerRefs: [ledgerRef],
      expectedLedgerCodes: ["P26-014"],
      date: "2026-06-06",
    });

    assert.match(result.markdown, /Synthetic metadata-only work entry/u);
    assert.equal(result.gap_count, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeLedger(repoRoot, fileName, ledger) {
  const filePath = path.join(repoRoot, fileName);
  await writeFile(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return filePath;
}

function assertValidationError(ledger, expectedErrorId) {
  const report = validateDailyLedgerObject(ledger);
  assert.equal(report.ok, false);
  assert(
    report.errors.some((error) => error.id === expectedErrorId),
    `expected ${expectedErrorId}, got ${report.errors.map((error) => error.id).join(", ")}`,
  );
}
