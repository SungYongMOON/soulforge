import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  classifyMailMetadata,
  normalizeOutlookRuleInventory,
  runMailProjectShadowClassification,
} from "../tools/mail_outlook_shadow_classify.mjs";

function inventoryFixture() {
  const move = (folder) => [
    { name: "Stop", values: [] },
    { name: "MoveToFolder", values: [{ folder_path: `\\\\mailbox\\${folder}`, folder_name: folder }] },
  ];
  return {
    rules: [
      {
        execution_order: 1,
        name: "sender and subject",
        enabled: true,
        conditions: [
          { name: "From", values: [{ name: "Sender", address: "sender@example.test" }] },
          { name: "Subject", values: ["alpha"] },
        ],
        actions: move("P24-049 Alpha"),
      },
      {
        execution_order: 2,
        name: "recipient",
        enabled: true,
        conditions: [{ name: "SentTo", values: ["recipient@example.test"] }],
        actions: move("P25-054 Beta"),
      },
      {
        execution_order: 3,
        name: "voice",
        enabled: true,
        conditions: [{ name: "From", values: ["no-reply@plaud.example"] }],
        actions: move("PLAUD"),
      },
    ],
  };
}

const ownerRule = {
  rule_id: "owner_subject_after_override_001",
  subject_contains: "SAS",
  not_before: "2024-01-01",
  project_code: "P24-049",
};

test("normalizes Outlook destinations and preserves execution order", () => {
  const rules = normalizeOutlookRuleInventory(inventoryFixture());
  assert.equal(rules.length, 3);
  assert.equal(rules[0].project_code, "P24-049");
  assert.equal(rules[2].target_kind, "system_voice");
  assert.deepEqual(rules.map((rule) => rule.execution_order), [1, 2, 3]);
});

test("uses safe precedence before Outlook replay", () => {
  const outlookRules = normalizeOutlookRuleInventory(inventoryFixture());
  const base = { id: "m1", project_id: "P00-000_INBOX", at: "2026-01-01T00:00:00Z", direction: "in", counterpart: "sender@example.test" };
  assert.equal(classifyMailMetadata({ ...base, project_id: "P26-014", subject: "SAS" }, { outlookRules, ownerRule }).primary_rule_id, "existing_assignment");
  assert.equal(classifyMailMetadata({ ...base, subject: "P25-054 SAS" }, { outlookRules, ownerRule }).candidate_project, "P25-054");
  assert.equal(classifyMailMetadata({ ...base, subject: "SAS status" }, { outlookRules, ownerRule }).primary_rule_id, ownerRule.rule_id);
  assert.equal(classifyMailMetadata({ ...base, subject: "alpha status" }, { outlookRules, ownerRule }).candidate_project, "P24-049");
  assert.equal(classifyMailMetadata({ ...base, subject: "none", counterpart: "none@example.test" }, { outlookRules, ownerRule }).status, "unclassified");
});

test("matches SentTo only for outgoing metadata", () => {
  const outlookRules = normalizeOutlookRuleInventory(inventoryFixture());
  const common = { project_id: "P00-000_INBOX", at: "2026-01-01T00:00:00Z", subject: "hello", counterpart: "recipient@example.test" };
  assert.equal(classifyMailMetadata({ ...common, direction: "out" }, { outlookRules, ownerRule }).candidate_project, "P25-054");
  assert.equal(classifyMailMetadata({ ...common, direction: "in" }, { outlookRules, ownerRule }).status, "unclassified");
});

test("runs query-only against a synthetic DB and writes private Shadow packets", () => {
  const root = mkdtempSync(join(tmpdir(), "sf-mail-outlook-shadow-"));
  const dbPath = join(root, "dev-erp.db");
  const rulesPath = join(root, "outlook.json");
  const outputDir = join(root, "output");
  try {
    writeFileSync(rulesPath, `\uFEFF${JSON.stringify(inventoryFixture())}`, "utf8");
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE core_mail (
      id TEXT, project_id TEXT, at TEXT, direction TEXT, subject TEXT,
      counterpart TEXT, hidden INTEGER NOT NULL DEFAULT 0, body_text TEXT
    )`);
    db.prepare("INSERT INTO core_mail (id,project_id,at,direction,subject,counterpart,hidden,body_text) VALUES (?,?,?,?,?,?,0,?)")
      .run("m1", "P00-000_INBOX", "2026-01-01T00:00:00Z", "in", "SAS update", "sender@example.test", "must-not-be-read");
    db.close();

    const report = runMailProjectShadowClassification({
      dbPath,
      outlookRulesPath: rulesPath,
      outputDir,
      fromProject: "P00-000_INBOX",
      ownerSubjectContains: "SAS",
      ownerNotBefore: "2024-01-01",
      ownerProject: "P24-049",
      includeHidden: false,
      now: new Date("2026-07-22T00:00:00Z"),
    });
    assert.equal(report.summary.scanned, 1);
    assert.equal(report.summary.source_rows_total, 1);
    assert.equal(report.summary.hidden_rows_excluded, 0);
    assert.equal(report.summary.by_target["P24-049"], 1);
    assert.equal(report.summary.sqlite_total_changes, 0);
    assert.equal(report.summary.body_read, false);
    assert.equal(existsSync(report.resultPath), true);
    assert.equal(existsSync(report.latestPath), true);
    assert.equal(readFileSync(report.resultPath, "utf8").includes("must-not-be-read"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
