import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import {
  buildReadingContextPacket,
  redactReadingContextPacket,
} from "../tools/haengbogwan_reading_context_packet.mjs";
import {
  judgeReadingContextPacket,
} from "../tools/haengbogwan_reading_candidate_judge.mjs";
import {
  buildCodexJudgeRequest,
  redactCodexJudgeRequest,
} from "../tools/haengbogwan_reading_codex_judge.mjs";

const CONTEXT_TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_reading_context_packet.mjs");
const JUDGE_TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_reading_candidate_judge.mjs");
const PRIVATE_SENTINEL = "PRIVATE_BODY_SENTINEL_DO_NOT_EMIT";
const ATTACHMENT_SENTINEL = "private_attachment_name_do_not_emit.zip";

function makeTempRuntime() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-reading-"));
  return {
    root,
    repoRoot: join(root, "runtime"),
    dbPath: join(root, "dev-erp.db"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeEventSink(repoRoot) {
  const eventPath = join(repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "mail", "events", "hiworks", "2026", "2026-06.jsonl");
  mkdirSync(dirname(eventPath), { recursive: true });
  const rows = [
    {
      schema_version: "email.fetch.event.v1",
      event_id: "evt001",
      source: "hiworks",
      provider_message_id: "synthetic-evt001",
      thread_id: "thread-a",
      subject: "[KVDS] CSCI SDD submit request",
      from: [{ name: "Customer", address: "customer@example.test" }],
      to: [{ name: "Owner", address: "owner@example.test" }],
      cc: [],
      received_at: "2026-06-24T09:00:00+09:00",
      body_text: `${PRIVATE_SENTINEL}\nKVDS CSCI SDD document submit request by 2026-07-03. Please prepare and send the SDD document.\n----- Original Message -----\nOld quoted mail says due by 2026-06-01.`,
      body_html: "",
      attachments: [{ name: ATTACHMENT_SENTINEL, size: 1234 }],
      raw: { uidl: "synthetic-uidl" },
      metadata: { mailbox: { email: "owner@example.test" } },
    },
    {
      schema_version: "email.fetch.event.v1",
      event_id: "evt002",
      source: "hiworks",
      provider_message_id: "synthetic-evt002",
      thread_id: "thread-b",
      subject: "Read: FYI package",
      from: [{ name: "Sender", address: "sender@example.test" }],
      to: [{ name: "Owner", address: "owner@example.test" }],
      cc: [],
      received_at: "2026-06-24T10:00:00+09:00",
      body_text: "Read receipt only.",
      body_html: "",
      attachments: [],
      raw: { uidl: "synthetic-uidl-2" },
      metadata: { mailbox: { email: "owner@example.test" } },
    },
  ];
  writeFileSync(eventPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function writeMailDb(dbPath) {
  const store = openStore(dbPath);
  try {
    const mails = [
      {
        id: "MAIL-1",
        project_code: "P26-014",
        at: "2026-06-24T09:00:00+09:00",
        subject: "[KVDS] CSCI SDD submit request",
        counterpart: "customer@example.test",
        source_ref: "evt001",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#M001",
        mailbox: "owner@example.test",
        body_preview: "",
      },
      {
        id: "MAIL-2",
        project_code: "P26-014",
        at: "2026-06-24T10:00:00+09:00",
        subject: "Read: FYI package",
        counterpart: "sender@example.test",
        source_ref: "evt002",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#M002",
        mailbox: "owner@example.test",
        body_preview: "",
      },
      {
        id: "MAIL-3",
        project_code: "P26-014",
        at: "2026-06-24T11:00:00+09:00",
        subject: "Existing mail task follow up",
        counterpart: "sender@example.test",
        source_ref: "evt003",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#M003",
        mailbox: "owner@example.test",
        body_preview: "Please review the existing task follow up.",
      },
      {
        id: "MAIL-4",
        project_code: "P26-014",
        at: "2026-06-24T12:00:00+09:00",
        subject: "Pointer linked mail task follow up",
        counterpart: "sender@example.test",
        source_ref: "evt004",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#M004",
        mailbox: "owner@example.test",
        body_preview: "Please review the pointer linked task follow up.",
      },
    ];
    for (const mail of mails) {
      const result = store.ingestMail(mail);
      assert.equal(result.ok, true, JSON.stringify(result));
    }
    const item = store.createItem({
      project_id: "P26-014",
      title: "Existing mail task",
      origin: "mail",
      origin_mail_id: "MAIL-3",
      created_by: "test",
    });
    assert.equal(item.ok, true, JSON.stringify(item));
    const pointerItem = store.createItem({
      project_id: "P26-014",
      title: "Pointer linked existing mail task",
      origin: "mail",
      created_by: "test",
    });
    assert.equal(pointerItem.ok, true, JSON.stringify(pointerItem));
    store.db.prepare("UPDATE core_item SET source_mail_ref=? WHERE id=?")
      .run("_workmeta/P26-014/reports/mail_history/mail_history.csv#M004", pointerItem.item.id);
  } finally {
    store.db.close();
  }
}

test("HAENGBOGWAN-READING: context reads local event body only in private packet and redacts CLI output", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeMailDb(tmp.dbPath);

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      limit: 5,
      bodyMode: "two_stage",
      includeText: true,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(packet.counts.mail, 4);
    assert.equal(packet.counts.event_body_read, 2);
    const mail1 = packet.mail_events.find((row) => row.mail_ref === "MAIL-1");
    assert.equal(mail1.body_access, "event_body_text");
    assert.equal(mail1.recipient_role, "to");
    assert.equal(mail1.attachment_count, 1);
    assert.match(mail1.reading_text, /PRIVATE_BODY_SENTINEL/);

    const redacted = redactReadingContextPacket(packet);
    const redactedText = JSON.stringify(redacted);
    assert.equal(redactedText.includes(PRIVATE_SENTINEL), false);
    assert.equal(redactedText.includes(ATTACHMENT_SENTINEL), false);
    assert.equal(redacted.boundary.protected_text_in_packet, false);

    const cli = spawnSync(process.execPath, [
      CONTEXT_TOOL,
      "--db", tmp.dbPath,
      "--repo-root", tmp.repoRoot,
      "--project", "P26-014",
      "--limit", "2",
      "--body-mode", "two_stage",
      "--json",
    ], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.includes(PRIVATE_SENTINEL), false);
    assert.equal(cli.stdout.includes(ATTACHMENT_SENTINEL), false);

    const forbidden = spawnSync(process.execPath, [
      CONTEXT_TOOL,
      "--db", tmp.dbPath,
      "--repo-root", tmp.repoRoot,
      "--project", "P26-014",
      "--include-reading-text",
    ], { encoding: "utf8" });
    assert.equal(forbidden.status, 2);
    assert.match(forbidden.stderr, /include_reading_text_cli_forbidden/);
    assert.equal(forbidden.stdout.includes(PRIVATE_SENTINEL), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: judge builds context groups, ledger candidates, and update-existing reports without body leakage", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeMailDb(tmp.dbPath);

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      limit: 5,
      bodyMode: "two_stage",
      includeText: true,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const bundle = judgeReadingContextPacket(packet, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const text = JSON.stringify(bundle);
    assert.equal(text.includes(PRIVATE_SENTINEL), false);
    assert.equal(text.includes(ATTACHMENT_SENTINEL), false);
    assert.equal(bundle.boundary.raw_body_persisted, false);
    assert.equal(bundle.boundary.reading_text_emitted, false);
    assert.equal(bundle.counts.candidate_mail, 1);
    assert.equal(bundle.counts.update_existing_mail, 2);
    assert.equal(bundle.counts.reference_or_no_action_mail, 1);
    assert.equal(bundle.work_context_groups.length >= 1, true);

    const report = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-1");
    assert.equal(report.disposition, "candidate");
    assert.equal(report.due, "2026-07-03");
    assert.equal(report.required_role, "systems_engineering_owner");
    assert.equal(report.source_mail_ref, "mailcsv:M001");
    assert.equal(report.signals.includes("document_or_submission"), true);
    assert.equal(report.bot_hint, "document_draft_bot");

    const existing = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-3");
    assert.equal(existing.disposition, "update_existing");
    assert.equal(existing.existing_task_refs.length, 1);
    const pointerExisting = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-4");
    assert.equal(pointerExisting.disposition, "update_existing");
    assert.equal(pointerExisting.existing_task_refs.length, 1);

    assert.deepEqual(Object.keys(bundle.ledger_candidates), ["M001"]);
    const candidateList = Array.isArray(bundle.ledger_candidates.M001)
      ? bundle.ledger_candidates.M001
      : [bundle.ledger_candidates.M001];
    const candidate = candidateList.find((row) => row.work_type === "author");
    assert.ok(candidate);
    assert.equal(candidate.work_type, "author");
    assert.equal(candidate.due, "2026-07-03");
    assert.equal(candidate.source_mail_ref, "mailcsv:M001");
    assert.equal(candidate.route_confidence, "review");

    const contextPath = join(tmp.root, "reading-context.json");
    writeFileSync(contextPath, `${JSON.stringify(packet, null, 2)}\n`);
    const cli = spawnSync(process.execPath, [JUDGE_TOOL, "--context", contextPath, "--json"], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.includes(PRIVATE_SENTINEL), false);
    const cliBundle = JSON.parse(cli.stdout);
    assert.equal(cliBundle.counts.ledger_candidate_keys, 1);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: Codex judgment overlay improves candidates while code keeps keys and redacts body", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeMailDb(tmp.dbPath);

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      limit: 5,
      bodyMode: "two_stage",
      includeText: true,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const baseBundle = judgeReadingContextPacket(packet, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const request = buildCodexJudgeRequest(packet, baseBundle.mail_reading_reports, { generatedAt: "2026-06-28T00:00:00.000Z" });
    assert.match(request.mail_events.find((row) => row.mail_ref === "MAIL-1").reading_text, /PRIVATE_BODY_SENTINEL/);
    const redactedRequest = redactCodexJudgeRequest(request);
    assert.equal(JSON.stringify(redactedRequest).includes(PRIVATE_SENTINEL), false);

    const mail1 = packet.mail_events.find((row) => row.mail_ref === "MAIL-1");
    const mail3 = packet.mail_events.find((row) => row.mail_ref === "MAIL-3");
    const codexJudgments = {
      schema_version: "haengbogwan.reading_codex_judgment_bundle.v1",
      model_ref: "codex-automation-test",
      prompt_rule_ref: "haengbogwan.reading_codex_judge_request.v1",
      judgments: [
        {
          mail_ref: "MAIL-1",
          ledger_key: "M001",
          input_reading_text_hash: mail1.reading_text_hash,
          disposition: "candidate",
          work_types: ["answer"],
          primary_work_type: "answer",
          title: "KVDS CSCI SDD reply package prepare",
          target_object: "KVDS CSCI SDD document reply",
          completion_goal: "Prepare reply package for KVDS CSCI SDD request",
          due: "2026-07-04",
          priority: "high",
          completion_criteria: "Reply package prepared and owner can approve the response.",
          next_action: "Prepare the response draft and document handoff checklist.",
          required_role: "systems_engineering_owner",
          required_capability: "systems_engineering",
          suggested_assignee_ref: "dev_team_2",
          bot_hint: "reply_draft_bot",
          confidence: 0.88,
          reason_codes: ["reply_request_detected"],
          evidence_summary: "Codex saw a reply/document request; body text redacted",
        },
        {
          mail_ref: "MAIL-3",
          ledger_key: "M003",
          input_reading_text_hash: mail3.reading_text_hash,
          disposition: "candidate",
          work_types: ["author"],
          primary_work_type: "author",
          title: "Should not create duplicate",
          target_object: "Existing task",
          completion_goal: "Existing task follow-up",
          confidence: 0.95,
          evidence_summary: "Existing mail follow-up; body text redacted",
        },
      ],
    };

    const bundle = judgeReadingContextPacket(packet, {
      generatedAt: "2026-06-28T00:00:00.000Z",
      codexJudgments,
    });
    const text = JSON.stringify(bundle);
    assert.equal(text.includes(PRIVATE_SENTINEL), false);
    assert.equal(text.includes(ATTACHMENT_SENTINEL), false);

    const report = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-1");
    assert.equal(report.codex_judgment_status, "applied");
    assert.equal(report.primary_work_type, "answer");
    assert.equal(report.due, "2026-07-04");
    assert.equal(report.target_object, "KVDS CSCI SDD document reply");
    assert.equal(report.generation_rule_ref.includes("haengbogwan_reading_codex_overlay.v1"), true);

    const candidate = Array.isArray(bundle.ledger_candidates.M001)
      ? bundle.ledger_candidates.M001[0]
      : bundle.ledger_candidates.M001;
    assert.equal(candidate.title, "KVDS CSCI SDD reply package prepare");
    assert.equal(candidate.work_type, "answer");
    assert.equal(candidate.completion_criteria, "Reply package prepared and owner can approve the response.");
    assert.equal(candidate.source_mail_ref, "mailcsv:M001");
    assert.equal(candidate.review_status, "needs_review");
    assert.match(candidate.review_reason, /codex=applied/);

    const existing = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-3");
    assert.equal(existing.disposition, "update_existing");
    assert.equal(Object.keys(bundle.ledger_candidates).includes("M003"), false);

    const mismatched = {
      schema_version: "haengbogwan.reading_codex_judgment_bundle.v1",
      model_ref: "codex-automation-test",
      judgments: [{
        mail_ref: "MAIL-1",
        input_reading_text_hash: "wrong-hash",
        disposition: "candidate",
        work_types: ["answer"],
        title: "Ignored title",
        confidence: 0.99,
      }],
    };
    const ignoredBundle = judgeReadingContextPacket(packet, { codexJudgments: mismatched });
    const ignored = ignoredBundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-1");
    assert.equal(ignored.codex_judgment_status, "not_requested_or_missing");

    const leaking = {
      schema_version: "haengbogwan.reading_codex_judgment_bundle.v1",
      judgments: [{
        mail_ref: "MAIL-1",
        input_reading_text_hash: mail1.reading_text_hash,
        disposition: "candidate",
        work_types: ["answer"],
        reading_text: PRIVATE_SENTINEL,
      }],
    };
    assert.throws(() => judgeReadingContextPacket(packet, { codexJudgments: leaking }), /codex_output_forbidden_field/);

    const judgmentPath = join(tmp.root, "codex-judgments.json");
    writeFileSync(judgmentPath, `${JSON.stringify(codexJudgments, null, 2)}\n`);
    const contextPath = join(tmp.root, "reading-context.json");
    writeFileSync(contextPath, `${JSON.stringify(packet, null, 2)}\n`);
    const cli = spawnSync(process.execPath, [
      JUDGE_TOOL,
      "--context", contextPath,
      "--codex-judgments", judgmentPath,
      "--json",
    ], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.includes(PRIVATE_SENTINEL), false);
    const cliBundle = JSON.parse(cli.stdout);
    assert.equal(cliBundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-1").codex_judgment_status, "applied");
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: CLI help works", () => {
  const contextHelp = spawnSync(process.execPath, [CONTEXT_TOOL, "--help"], { encoding: "utf8" });
  assert.equal(contextHelp.status, 0, contextHelp.stderr);
  assert.match(contextHelp.stdout, /reading context packet/);

  const judgeHelp = spawnSync(process.execPath, [JUDGE_TOOL, "--help"], { encoding: "utf8" });
  assert.equal(judgeHelp.status, 0, judgeHelp.stderr);
  assert.match(judgeHelp.stdout, /work_context_groups/);
});
