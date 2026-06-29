import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import {
  buildOperationalScorecardRun,
} from "../tools/haengbogwan_reading_operational_scorecard.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_reading_operational_scorecard.mjs");
const PRIVATE_SENTINEL = "PRIVATE_OPERATIONAL_SCORECARD_BODY_SENTINEL_DO_NOT_EMIT";

function makeTempRuntime() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-operational-scorecard-"));
  return {
    root,
    repoRoot: join(root, "runtime"),
    workmetaRoot: join(root, "_workmeta"),
    dbPath: join(root, "dev-erp.db"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeMailDb(dbPath) {
  const store = openStore(dbPath);
  try {
    assert.equal(store.ingestMail({
      id: "MAIL-SCORE-1",
      project_code: "P26-014",
      at: "2026-06-24T09:00:00+09:00",
      subject: "[KVDS] operational scorecard action",
      counterpart: "customer@example.test",
      source_ref: "evt-score-1",
      pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#SCORE1",
      mailbox: "owner@example.test",
      body_text: `${PRIVATE_SENTINEL}\nPlease prepare the KVDS reply package by 2026-07-08.`,
    }).ok, true);
    assert.equal(store.ingestMail({
      id: "MAIL-SCORE-2",
      project_code: "P26-014",
      at: "2026-06-25T09:00:00+09:00",
      subject: "General FYI without body",
      counterpart: "sender@example.test",
      source_ref: "evt-score-2",
      pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#SCORE2",
      mailbox: "owner@example.test",
    }).ok, true);
  } finally {
    store.db.close();
  }
}

test("HAENGBOGWAN-OPERATIONAL-SCORECARD: writes metadata-only owner queue and coverage files", () => {
  const tmp = makeTempRuntime();
  try {
    writeMailDb(tmp.dbPath);
    const result = buildOperationalScorecardRun({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      workmetaRoot: tmp.workmetaRoot,
      projectId: "P26-014",
      limit: 10,
      bodyMode: "two_stage",
      runId: "test_scorecard",
      generatedAt: "2026-06-29T00:00:00.000Z",
    });

    assert.equal(result.scorecard.counts.mail, 2);
    assert.equal(result.scorecard.boundary.raw_body_written_to_artifacts, false);
    assert.equal(result.scorecard.precision_recall.computed, false);

    const scorecardText = readFileSync(join(result.outDir, "scorecard.json"), "utf8");
    const queueText = readFileSync(join(result.outDir, "owner_review_queue.csv"), "utf8");
    const coverageText = readFileSync(join(result.outDir, "body_coverage.csv"), "utf8");
    const candidateText = readFileSync(join(result.outDir, "candidate_summary.csv"), "utf8");
    const summaryText = readFileSync(join(result.outDir, "RUN_SUMMARY.md"), "utf8");
    const combined = [scorecardText, queueText, coverageText, candidateText, summaryText].join("\n");

    assert.equal(combined.includes(PRIVATE_SENTINEL), false);
    assert.match(queueText, /owner_label_is_task/);
    assert.match(queueText, /engine_should_create_task/);
    assert.match(coverageText, /backfill_status/);
    assert.match(coverageText, /needs_body_backfill/);
    assert.match(scorecardText, /owner_labels_required/);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-OPERATIONAL-SCORECARD: CLI help works", () => {
  const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /operational artifacts/);
  assert.match(result.stdout, /owner_review_queue/);
});
