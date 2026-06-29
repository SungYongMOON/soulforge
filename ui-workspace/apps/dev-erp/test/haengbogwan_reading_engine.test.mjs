import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
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
import {
  buildProjectKnowledgeOverlay,
} from "../tools/haengbogwan_project_knowledge_overlay.mjs";

const CONTEXT_TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_reading_context_packet.mjs");
const JUDGE_TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_reading_candidate_judge.mjs");
const PRIVATE_SENTINEL = "PRIVATE_BODY_SENTINEL_DO_NOT_EMIT";
const ATTACHMENT_SENTINEL = "private_attachment_name_do_not_emit.zip";
const KNOWLEDGE_SENTINEL = "KNOWLEDGE_BODY_SENTINEL_DO_NOT_EMIT";

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

function writeKnowledgeFixture(repoRoot) {
  const wikiPath = join(repoRoot, "_workspaces", "knowledge", "P26-014", "wiki", "project_page.md");
  mkdirSync(dirname(wikiPath), { recursive: true });
  writeFileSync(wikiPath, `# P26-014 knowledge\n${KNOWLEDGE_SENTINEL}\n`);
  writeFileSync(join(dirname(wikiPath), "kvds_sow_context.md"), `# KVDS SOW context\n${KNOWLEDGE_SENTINEL}\n`);
  const rulesPath = join(repoRoot, "_workmeta", "P26-014", "rules", "haengbogwan_context_hint_rules.json");
  mkdirSync(dirname(rulesPath), { recursive: true });
  writeFileSync(rulesPath, `${JSON.stringify({
    schema_version: "haengbogwan.context_hint_rules.v1",
    project_id: "P26-014",
    rules: [{
      id: "project_kvds_sow_rule",
      priority: 100,
      event_keywords: ["SOW", "coordination package"],
      knowledge_keywords: ["kvds_sow_context", "project_page"],
      target_object: "KVDS SOW rulebook",
      work_types: ["review", "author"],
      required_role: "systems_engineering_owner",
      required_capability: "systems_engineering",
    }],
  }, null, 2)}\n`);
}

function writeRuleOnlyKnowledgeFixture(repoRoot) {
  const rulesPath = join(repoRoot, "_workmeta", "P26-014", "rules", "haengbogwan_context_hint_rules.json");
  mkdirSync(dirname(rulesPath), { recursive: true });
  writeFileSync(rulesPath, `${JSON.stringify({
    schema_version: "haengbogwan.context_hint_rules.v1",
    project_id: "P26-014",
    rules: [{
      id: "project_body_only_sow_rule",
      priority: 120,
      event_keywords: ["body-only SOW coordination package"],
      target_object: "KVDS body-only SOW handoff",
      work_types: ["review", "author"],
      required_role: "systems_engineering_owner",
      required_capability: "systems_engineering",
    }],
  }, null, 2)}\n`);
}

function writeCommonSeKnowledgeBinding(repoRoot) {
  const binding = join(repoRoot, "_workmeta", "system", "bindings", "haengbogwan_common_knowledge_overlay.json");
  mkdirSync(dirname(binding), { recursive: true });
  writeFileSync(binding, `${JSON.stringify({
    schema_version: "haengbogwan.common_knowledge_overlay.v1",
    binding_id: "common_se_reading_test",
    enabled: true,
    applies_to: {
      project_ids: ["P26-014"],
    },
    shared_refs: [{
      id: "common_se_test_eval",
      kind: "registry_knowledge",
      ref: ".registry/knowledge/dapa_weapon_system_test_eval_guidebook/knowledge.yaml",
      title: "DAPA weapon-system test/evaluation guidebook",
      summary: "systems_engineering dapa weapon_system test_eval verification schedule",
      tags: ["systems_engineering", "dapa", "weapon_system", "test_eval", "review_gate"],
      owner_surface: ".registry/knowledge",
      visibility: "public_safe",
      claim_ceiling: "source_supported",
      route_hint: "se_task_schedule",
    }],
    context_hint_rules: [{
      id: "common_se_trr_schedule",
      priority: 110,
      event_keywords: ["TRR", "test readiness review", "시험준비검토"],
      knowledge_keywords: ["systems_engineering", "test_eval"],
      target_object: "SE TRR/test evaluation schedule",
      work_types: ["schedule", "review"],
      required_role: "systems_engineering_owner",
      required_capability: "systems_engineering",
      owner_review_flags: ["common_se_hint"],
    }],
  }, null, 2)}\n`);
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
      {
        id: "MAIL-5",
        project_code: "P26-014",
        at: "2026-06-24T13:00:00+09:00",
        subject: "Ledger-key linked mail task follow up",
        counterpart: "sender@example.test",
        source_ref: "evt005",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#M005",
        mailbox: "owner@example.test",
        body_preview: "Please review the ledger-key linked task follow up.",
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
    const ledgerKeyItem = store.createItem({
      project_id: "P26-014",
      title: "Ledger-key existing mail task",
      origin: "mail",
      origin_mail_id: "mailcsv:M005",
      created_by: "test",
    });
    assert.equal(ledgerKeyItem.ok, true, JSON.stringify(ledgerKeyItem));
  } finally {
    store.db.close();
  }
}

test("HAENGBOGWAN-READING: context uses stored ERP body_text before event sink", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      const result = store.ingestMail({
        id: "MAIL-BODY-TEXT",
        project_code: "P26-014",
        at: "2026-06-25T09:00:00+09:00",
        subject: "[KVDS] SDD action",
        counterpart: "customer@example.test",
        source_ref: "evt-body-text",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#MBODY",
        mailbox: "owner@example.test",
        body_text: "Please prepare and send the KVDS CSCI SDD document by 2026-07-03.",
      });
      assert.equal(result.ok, true, JSON.stringify(result));
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      limit: 1,
      bodyMode: "two_stage",
      includeText: true,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const event = packet.mail_events[0];
    assert.equal(event.body_access, "core_mail.body_text");
    assert.equal(event.event_body_read, false);
    assert.equal(packet.counts.db_body_text, 1);
    assert.match(event.reading_text, /SDD document by 2026-07-03/);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: event body truncation records source length", () => {
  const tmp = makeTempRuntime();
  try {
    const eventPath = join(tmp.repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "mail", "events", "hiworks", "2026", "2026-06.jsonl");
    mkdirSync(dirname(eventPath), { recursive: true });
    writeFileSync(eventPath, `${JSON.stringify({
      schema_version: "email.fetch.event.v1",
      event_id: "evt-truncate",
      source: "hiworks",
      subject: "Truncated event body",
      from: [{ address: "sender@example.test" }],
      to: [{ address: "owner@example.test" }],
      received_at: "2026-06-25T09:00:00+09:00",
      body_text: "1234567890abcdefghijklmnopqrstuvwxyz Please prepare document by 2026-07-12.",
      attachments: [],
    })}\n`);
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "MAIL-EVENT-TRUNCATE",
        project_code: "P26-014",
        at: "2026-06-25T09:00:00+09:00",
        subject: "Truncated event body",
        counterpart: "sender@example.test",
        source_ref: "evt-truncate",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#EVENTTRUNCATE",
        mailbox: "owner@example.test",
      }).ok, true);
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "Truncated event",
      limit: 1,
      bodyMode: "full",
      maxTextChars: 20,
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const event = packet.mail_events[0];
    assert.equal(event.body_access, "event_body_text");
    assert.equal(event.reading_text_len, 20);
    assert.equal(event.reading_text_source_len > event.reading_text_len, true);
    assert.equal(event.reading_text_truncated, true);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: subject and preview modes do not promote stored full body", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "MAIL-BODY-MODE",
        project_code: "P26-014",
        at: "2026-06-25T09:00:00+09:00",
        subject: "[KVDS] body mode guard",
        counterpart: "customer@example.test",
        source_ref: "evt-body-mode",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#MBODYMODE",
        mailbox: "owner@example.test",
        body_preview: "Preview-only request without a date.",
        body_text: "FULL_BODY_ONLY_TOKEN Please submit the hidden package by 2026-07-09.",
      }).ok, true);
    } finally {
      store.db.close();
    }

    const subjectPacket = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "body mode guard",
      limit: 1,
      bodyMode: "subject",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(subjectPacket.mail_events[0].body_access, "subject_only");
    assert.equal(subjectPacket.mail_events[0].reading_text.includes("FULL_BODY_ONLY_TOKEN"), false);

    const previewPacket = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "body mode guard",
      limit: 1,
      bodyMode: "preview",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(previewPacket.mail_events[0].body_access, "core_mail.body_preview");
    assert.match(previewPacket.mail_events[0].reading_text, /Preview-only request/);
    assert.equal(previewPacket.mail_events[0].reading_text.includes("FULL_BODY_ONLY_TOKEN"), false);

    const twoStagePacket = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "body mode guard",
      limit: 1,
      bodyMode: "two_stage",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(twoStagePacket.mail_events[0].body_access, "core_mail.body_text");
    assert.match(twoStagePacket.mail_events[0].reading_text, /FULL_BODY_ONLY_TOKEN/);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: project mail rows can read sibling stored body_text by source_ref", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "P00-000_INBOX:shared-source-body",
        project_code: "P00-000_INBOX",
        at: "2026-06-25T09:00:00+09:00",
        subject: "[KVDS] shared source body",
        counterpart: "customer@example.test",
        source_ref: "evt-shared-body",
        pointer_ref: "_workmeta/P00-000_INBOX/reports/mail_history/mail_history.csv#SHARED",
        mailbox: "owner@example.test",
        body_text: "Please prepare the KVDS fallback body package by 2026-07-05.",
      }).ok, true);
      assert.equal(store.ingestMail({
        id: "P26-014:project-empty-body",
        project_code: "P26-014",
        at: "2026-06-25T10:00:00+09:00",
        subject: "[KVDS] project row without body",
        counterpart: "customer@example.test",
        source_ref: "evt-shared-body",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#PROJECT",
        mailbox: "company_mailbox",
      }).ok, true);

      const detail = store.mailDetail("P26-014:project-empty-body");
      assert.equal(detail.body_text_available, 1);
      assert.equal(detail.body_text_fallback_available, 1);
      assert.equal(detail.body_fallback_ref, "P00-000_INBOX:shared-source-body");
      assert.match(detail.body_text, /fallback body package by 2026-07-05/);
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "project row",
      limit: 1,
      bodyMode: "two_stage",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const event = packet.mail_events[0];
    assert.equal(event.body_access, "core_mail.body_text_fallback");
    assert.equal(event.body_fallback_ref, "P00-000_INBOX:shared-source-body");
    assert.equal(packet.counts.db_body_text_fallback, 1);
    assert.match(event.reading_text, /fallback body package by 2026-07-05/);

    const bundle = judgeReadingContextPacket(packet, { generatedAt: "2026-06-28T00:00:00.000Z" });
    assert.equal(JSON.stringify(bundle).includes("fallback body package"), false);
    assert.equal(bundle.mail_reading_reports[0].due, "2026-07-05");
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: project query can match exact sibling fallback body text", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "P00-000_INBOX:fallback-search-source",
        project_code: "P00-000_INBOX",
        at: "2026-06-25T09:00:00+09:00",
        subject: "Inbox source row",
        counterpart: "customer@example.test",
        source_ref: "evt-fallback-search",
        pointer_ref: "_workmeta/P00-000_INBOX/reports/mail_history/mail_history.csv#SEARCH",
        mailbox: "owner@example.test",
        body_text: "FALLBACK_ONLY_SDD_TOKEN Please prepare SDD by 2026-07-05.",
      }).ok, true);
      assert.equal(store.ingestMail({
        id: "P26-014:project-fallback-search",
        project_code: "P26-014",
        at: "2026-06-25T10:00:00+09:00",
        subject: "Project row without searchable words",
        counterpart: "customer@example.test",
        source_ref: "evt-fallback-search",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#PROJECTSEARCH",
        mailbox: "company_mailbox",
      }).ok, true);
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "FALLBACK_ONLY_SDD_TOKEN",
      limit: 5,
      bodyMode: "two_stage",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(packet.counts.mail, 1);
    assert.equal(packet.mail_events[0].mail_ref, "P26-014:project-fallback-search");
    assert.equal(packet.mail_events[0].body_access, "core_mail.body_text_fallback");
    assert.match(packet.mail_events[0].reading_text, /2026-07-05/);

    const bundle = judgeReadingContextPacket(packet, { generatedAt: "2026-06-28T00:00:00.000Z" });
    assert.equal(bundle.mail_reading_reports[0].due, "2026-07-05");
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: fallback body does not attach by subject and time alone", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "P00-000_INBOX:false-fallback-source",
        project_code: "P00-000_INBOX",
        at: "2026-06-25T09:00:00+09:00",
        subject: "Same subject same minute",
        counterpart: "customer@example.test",
        source_ref: "evt-source-with-body",
        pointer_ref: "_workmeta/P00-000_INBOX/reports/mail_history/mail_history.csv#FALSEBODY",
        mailbox: "owner@example.test",
        body_text: "This unrelated body must not attach by subject and time alone.",
      }).ok, true);
      assert.equal(store.ingestMail({
        id: "P26-014:false-fallback-project",
        project_code: "P26-014",
        at: "2026-06-25T09:00:00+09:00",
        subject: "Same subject same minute",
        counterpart: "customer@example.test",
        source_ref: "evt-different-empty-source",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#FALSEPROJECT",
        mailbox: "company_mailbox",
      }).ok, true);
      store.db.prepare("UPDATE core_mail SET dup_of=NULL, hidden=0 WHERE id=?").run("P26-014:false-fallback-project");

      const detail = store.mailDetail("P26-014:false-fallback-project");
      assert.equal(detail.body_text_fallback_available, 0);
      assert.equal(detail.body_fallback_ref, "");
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "Same subject",
      limit: 5,
      bodyMode: "two_stage",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(packet.counts.mail, 1);
    assert.equal(packet.mail_events[0].body_access, "subject_only");
    assert.equal(packet.mail_events[0].body_fallback_ref, "");
    assert.equal(packet.mail_events[0].reading_text.includes("unrelated body"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: maxTextChars caps stored and fallback reading text", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "MAIL-LONG-STORED",
        project_code: "P26-014",
        at: "2026-06-25T11:00:00+09:00",
        subject: "Long stored body",
        counterpart: "customer@example.test",
        source_ref: "evt-long-stored",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#LONGSTORED",
        mailbox: "owner@example.test",
        body_text: "1234567890abcdefghijklmnopqrstuvwxyz Please prepare document by 2026-07-10.",
      }).ok, true);
      assert.equal(store.ingestMail({
        id: "P00-000_INBOX:long-fallback-source",
        project_code: "P00-000_INBOX",
        at: "2026-06-25T10:00:00+09:00",
        subject: "Fallback source long body",
        counterpart: "customer@example.test",
        source_ref: "evt-long-fallback",
        pointer_ref: "_workmeta/P00-000_INBOX/reports/mail_history/mail_history.csv#LONGFALLBACK",
        mailbox: "owner@example.test",
        body_text: "abcdefghij1234567890 fallback body asks review by 2026-07-11.",
      }).ok, true);
      assert.equal(store.ingestMail({
        id: "P26-014:long-fallback-project",
        project_code: "P26-014",
        at: "2026-06-25T10:00:00+09:00",
        subject: "Long fallback project",
        counterpart: "customer@example.test",
        source_ref: "evt-long-fallback",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#LONGPROJECT",
        mailbox: "company_mailbox",
      }).ok, true);
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "Long",
      limit: 5,
      bodyMode: "two_stage",
      maxTextChars: 20,
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const stored = packet.mail_events.find((row) => row.mail_ref === "MAIL-LONG-STORED");
    const fallback = packet.mail_events.find((row) => row.mail_ref === "P26-014:long-fallback-project");
    assert.equal(stored.reading_text_len, 20);
    assert.equal(stored.reading_text_truncated, true);
    assert.equal(fallback.reading_text_len, 20);
    assert.equal(fallback.reading_text_truncated, true);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: context can read legacy runtime DBs that only have body_preview", () => {
  const tmp = makeTempRuntime();
  try {
    const db = new DatabaseSync(tmp.dbPath);
    try {
      db.exec(`
        CREATE TABLE core_mail (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          at TEXT,
          direction TEXT,
          subject TEXT NOT NULL,
          counterpart TEXT,
          pointer_ref TEXT,
          stage_code TEXT,
          source_ref TEXT,
          mailbox TEXT,
          data_label TEXT,
          body_preview TEXT,
          hidden INTEGER DEFAULT 0,
          dup_of TEXT
        );
      `);
      db.prepare(
        `INSERT INTO core_mail(id,project_id,at,direction,subject,counterpart,pointer_ref,stage_code,source_ref,mailbox,data_label,body_preview,hidden,dup_of)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        "MAIL-LEGACY-PREVIEW",
        "P26-014",
        "2026-06-26T09:00:00+09:00",
        "in",
        "[KVDS] cable data request",
        "customer@example.test",
        "_workmeta/P26-014/reports/mail_history/mail_history.csv#MLEGACY",
        "",
        "evt-legacy-preview",
        "owner@example.test",
        "real",
        "Please confirm the cable data package by 2026-06-30.",
        0,
        null,
      );
    } finally {
      db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "cable",
      limit: 3,
      bodyMode: "preview",
      includeText: true,
      includeKnowledge: false,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(packet.counts.mail, 1);
    assert.equal(packet.counts.db_body_text, 0);
    assert.equal(packet.mail_events[0].body_access, "core_mail.body_preview");
    assert.equal(packet.mail_events[0].body_text_len, 0);
    assert.match(packet.mail_events[0].reading_text, /2026-06-30/);

    const cli = spawnSync(process.execPath, [
      CONTEXT_TOOL,
      "--db", tmp.dbPath,
      "--repo-root", tmp.repoRoot,
      "--project", "P26-014",
      "--query", "cable",
      "--body-mode", "preview",
      "--no-knowledge",
      "--json",
    ], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    const out = JSON.parse(cli.stdout);
    assert.equal(out.counts.mail, 1);
    assert.equal(out.mail_events[0].body_access, "core_mail.body_preview");
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: context reads local event body only in private packet and redacts CLI output", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeKnowledgeFixture(tmp.repoRoot);
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
    assert.equal(packet.counts.mail, 5);
    assert.equal(packet.counts.event_body_read, 2);
    assert.equal(packet.boundary.project_knowledge_overlay_loaded, true);
    assert.equal(packet.knowledge_context.boundary.metadata_only, true);
    assert.equal(packet.knowledge_context.boundary.source_text_loaded, false);
    assert.ok(packet.knowledge_context.wiki_page_refs.some((row) => row.page_ref === "_workspaces/knowledge/P26-014/wiki/project_page.md"));
    const mail1 = packet.mail_events.find((row) => row.mail_ref === "MAIL-1");
    assert.equal(mail1.body_access, "event_body_text");
    assert.equal(mail1.recipient_role, "to");
    assert.equal(mail1.attachment_count, 1);
    assert.match(mail1.reading_text, /PRIVATE_BODY_SENTINEL/);

    const redacted = redactReadingContextPacket(packet);
    const redactedText = JSON.stringify(redacted);
    assert.equal(redactedText.includes(PRIVATE_SENTINEL), false);
    assert.equal(redactedText.includes(ATTACHMENT_SENTINEL), false);
    assert.equal(redactedText.includes(KNOWLEDGE_SENTINEL), false);
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
    assert.equal(cli.stdout.includes(KNOWLEDGE_SENTINEL), false);

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

test("HAENGBOGWAN-READING: context uses project-prefixed core mail id as the task ledger key", () => {
  const tmp = makeTempRuntime();
  try {
    const store = openStore(tmp.dbPath);
    try {
      const result = store.ingestMail({
        id: "P26-014:outlook:sent:kvds-submit",
        project_code: "P26-014",
        at: "2026-06-24T09:00:00+09:00",
        subject: "[KVDS] CSCI SDD submit request",
        counterpart: "customer@example.test",
        source_ref: "evt-prefers-source-ref-for-event-body",
        pointer_ref: "_workmeta/P26-014/reports/메일_이력/메일_이력.csv#evt-prefers-source-ref-for-event-body",
        mailbox: "owner@example.test",
        body_preview: "Please prepare and send the KVDS CSCI SDD document.",
      });
      assert.equal(result.ok, true, JSON.stringify(result));
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      limit: 1,
      bodyMode: "preview",
      includeText: true,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(packet.mail_events[0].ledger_key, "outlook:sent:kvds-submit");
    assert.equal(packet.mail_events[0].source_ref, "evt-prefers-source-ref-for-event-body");
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: judge builds context groups, ledger candidates, and update-existing reports without body leakage", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeKnowledgeFixture(tmp.repoRoot);
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
    assert.equal(text.includes(KNOWLEDGE_SENTINEL), false);
    assert.equal(bundle.boundary.raw_body_persisted, false);
    assert.equal(bundle.boundary.reading_text_emitted, false);
    assert.equal(bundle.counts.candidate_mail, 1);
    assert.equal(bundle.counts.update_existing_mail, 3);
    assert.equal(bundle.counts.reference_or_no_action_mail, 1);
    assert.equal(bundle.work_context_groups.length >= 1, true);

    const report = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-1");
    assert.equal(report.disposition, "candidate");
    assert.equal(report.due, "2026-07-03");
    assert.equal(report.required_role, "systems_engineering_owner");
    assert.equal(report.source_mail_ref, "mailcsv:M001");
    assert.equal(report.signals.includes("document_or_submission"), true);
    assert.equal(report.bot_hint, "document_draft_bot");
    assert.ok(report.supporting_knowledge_refs.includes("_workspaces/knowledge/P26-014/wiki/project_page.md"));
    assert.equal(bundle.knowledge_context.loaded, true);
    assert.equal(bundle.knowledge_context.source_text_loaded, false);

    const existing = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-3");
    assert.equal(existing.disposition, "update_existing");
    assert.equal(existing.existing_task_refs.length, 1);
    const pointerExisting = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-4");
    assert.equal(pointerExisting.disposition, "update_existing");
    assert.equal(pointerExisting.existing_task_refs.length, 1);
    const ledgerKeyExisting = bundle.mail_reading_reports.find((row) => row.mail_ref === "MAIL-5");
    assert.equal(ledgerKeyExisting.disposition, "update_existing");
    assert.equal(ledgerKeyExisting.existing_task_refs.length, 1);

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

test("HAENGBOGWAN-READING: Outlook style colon history keys stay eligible for task ledger candidates", () => {
  const packet = {
    schema_version: "haengbogwan.reading_context_packet.v1",
    generated_at: "2026-06-28T00:00:00.000Z",
    source: "dev_erp.core_mail",
    project_id: "P26-014",
    body_mode: "preview",
    body_access: "core_mail.body_preview",
    boundary: {
      metadata_only: false,
      local_event_body_read: false,
      raw_body_persisted: false,
      attachments_loaded: false,
      attachment_payloads_loaded: false,
      secret_loaded: false,
      protected_text_in_packet: true,
      output_should_redact_reading_text: true,
    },
    counts: { mail: 1 },
    knowledge_context: null,
    mail_events: [{
      mail_ref: "P26-014:outlook:sent:kvds-submit",
      ledger_key: "outlook:sent:kvds-submit",
      project_id: "P26-014",
      received_at: "2026-06-23T09:00:00+09:00",
      direction: "out",
      subject: "[KVDS] CSCI SDD submit request",
      counterpart: "owner@example.test",
      mailbox_ref: "owner@example.test",
      pointer_ref: "_workmeta/P26-014/reports/메일_이력/메일_이력.csv#outlook:sent:kvds-submit",
      source_ref: "outlook:sent:kvds-submit",
      body_access: "core_mail.body_preview",
      event_body_read: false,
      existing_task_refs: [],
      recipient_role: "unknown",
      attachment_count: 0,
      reading_text: "Please prepare and send the KVDS CSCI SDD document.",
    }],
  };

  const bundle = judgeReadingContextPacket(packet, { generatedAt: "2026-06-28T00:00:00.000Z" });
  assert.deepEqual(Object.keys(bundle.ledger_candidates), ["outlook:sent:kvds-submit"]);
  const candidate = bundle.ledger_candidates["outlook:sent:kvds-submit"];
  assert.equal(candidate.source_mail_ref, "mailcsv:outlook:sent:kvds-submit");
});

test("HAENGBOGWAN-READING: project knowledge metadata can influence context grouping without body leakage", () => {
  const tmp = makeTempRuntime();
  try {
    writeKnowledgeFixture(tmp.repoRoot);
    const baseEvent = {
      mail_ref: "MAIL-SOW",
      project_id: "P26-014",
      received_at: "2026-06-28T09:00:00+09:00",
      direction: "inbound",
      subject: "KVDS SOW coordination package",
      counterpart: "customer@example.test",
      mailbox_ref: "owner@example.test",
      pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#SOW",
      source_ref: "evt-sow",
      stage_code: "",
      body_access: "subject_only",
      event_body_read: false,
      event_found: false,
      event_ref: "",
      event_file_ref: "",
      event_line: null,
      recipient_role: "unknown",
      attachment_count: 1,
      body_preview_len: 0,
      reading_text_len: 0,
      reading_text_hash: "",
      existing_task_refs: [],
    };
    const packetBase = {
      schema_version: "haengbogwan.reading_context_packet.v1",
      generated_at: "2026-06-28T00:00:00.000Z",
      project_id: "P26-014",
      body_mode: "subject",
      body_access: "subject_only",
      boundary: {
        raw_body_persisted: false,
        attachments_loaded: false,
        attachment_payloads_loaded: false,
        secret_loaded: false,
        protected_text_in_packet: false,
      },
      mail_events: [baseEvent],
    };
    const knowledge = buildProjectKnowledgeOverlay({
      repoRoot: tmp.repoRoot,
      dbPath: "",
      projectId: "P26-014",
      queryTerms: ["KVDS SOW coordination package"],
      limit: 20,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const offBundle = judgeReadingContextPacket({ ...packetBase, knowledge_context: null }, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const onBundle = judgeReadingContextPacket({ ...packetBase, knowledge_context: knowledge }, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const offReport = offBundle.mail_reading_reports[0];
    const onReport = onBundle.mail_reading_reports[0];

    assert.equal(JSON.stringify(onBundle).includes(KNOWLEDGE_SENTINEL), false);
    assert.equal(offReport.knowledge_hint_applied, false);
    assert.equal(onReport.knowledge_hint_applied, true);
    assert.notEqual(offReport.context_key, onReport.context_key);
    assert.equal(offReport.target_object, "KVDS");
    assert.equal(onReport.target_object, "KVDS SOW rulebook");
    assert.equal(onReport.required_role, "systems_engineering_owner");
    assert.deepEqual(onReport.work_types, ["review", "author"]);
    assert.match(onReport.knowledge_hint_reason, /project_kvds_sow_rule/);
    assert.ok(onReport.supporting_knowledge_refs.some((ref) => ref.includes("kvds_sow_context.md")));
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: common SE knowledge binding can guide schedule/review classification", () => {
  const tmp = makeTempRuntime();
  try {
    writeCommonSeKnowledgeBinding(tmp.repoRoot);
    const event = {
      mail_ref: "MAIL-TRR",
      project_id: "P26-014",
      received_at: "2026-06-28T09:00:00+09:00",
      direction: "inbound",
      subject: "TRR 일정 조정 요청",
      counterpart: "customer@example.test",
      mailbox_ref: "owner@example.test",
      pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#TRR",
      source_ref: "evt-trr",
      stage_code: "",
      body_access: "subject_only",
      event_body_read: false,
      event_found: false,
      event_ref: "",
      event_file_ref: "",
      event_line: null,
      recipient_role: "unknown",
      attachment_count: 0,
      body_preview_len: 0,
      reading_text_len: 0,
      reading_text_hash: "",
      existing_task_refs: [],
    };
    const packetBase = {
      schema_version: "haengbogwan.reading_context_packet.v1",
      generated_at: "2026-06-28T00:00:00.000Z",
      project_id: "P26-014",
      body_mode: "subject",
      body_access: "subject_only",
      boundary: {
        raw_body_persisted: false,
        attachments_loaded: false,
        attachment_payloads_loaded: false,
        secret_loaded: false,
        protected_text_in_packet: false,
      },
      mail_events: [event],
    };
    const knowledge = buildProjectKnowledgeOverlay({
      repoRoot: tmp.repoRoot,
      dbPath: "",
      projectId: "P26-014",
      queryTerms: ["TRR 일정 조정 요청"],
      limit: 20,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const offBundle = judgeReadingContextPacket({ ...packetBase, knowledge_context: null }, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const onBundle = judgeReadingContextPacket({ ...packetBase, knowledge_context: knowledge }, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const offReport = offBundle.mail_reading_reports[0];
    const onReport = onBundle.mail_reading_reports[0];

    assert.equal(offReport.knowledge_hint_applied, false);
    assert.equal(onReport.knowledge_hint_applied, true);
    assert.match(onReport.knowledge_hint_reason, /common_se_trr_schedule/);
    assert.equal(onReport.target_object, "SE TRR/test evaluation schedule");
    assert.deepEqual(onReport.work_types, ["schedule", "review"]);
    assert.equal(onReport.required_role, "systems_engineering_owner");
    assert.ok(onReport.supporting_knowledge_refs.some((ref) => ref.includes("dapa_weapon_system_test_eval_guidebook")));
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: body_text plus rule-only knowledge can classify without leaking body text", () => {
  const tmp = makeTempRuntime();
  try {
    writeRuleOnlyKnowledgeFixture(tmp.repoRoot);
    const store = openStore(tmp.dbPath);
    try {
      assert.equal(store.ingestMail({
        id: "MAIL-BODY-RULE",
        project_code: "P26-014",
        at: "2026-06-28T09:00:00+09:00",
        subject: "General coordination follow-up",
        counterpart: "customer@example.test",
        source_ref: "evt-body-rule",
        pointer_ref: "_workmeta/P26-014/reports/mail_history/mail_history.csv#BODYRULE",
        mailbox: "owner@example.test",
        body_text: `${PRIVATE_SENTINEL}\nPlease review the body-only SOW coordination package by 2026-07-06.`,
      }).ok, true);
    } finally {
      store.db.close();
    }

    const packet = buildReadingContextPacket({
      dbPath: tmp.dbPath,
      repoRoot: tmp.repoRoot,
      projectId: "P26-014",
      query: "General coordination",
      limit: 1,
      bodyMode: "two_stage",
      includeText: true,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    assert.equal(packet.mail_events[0].body_access, "core_mail.body_text");
    assert.match(packet.mail_events[0].reading_text, /body-only SOW coordination package/);
    assert.equal(JSON.stringify(redactReadingContextPacket(packet)).includes(PRIVATE_SENTINEL), false);

    const offBundle = judgeReadingContextPacket({ ...packet, knowledge_context: null }, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const onBundle = judgeReadingContextPacket(packet, { generatedAt: "2026-06-28T00:00:00.000Z" });
    const offReport = offBundle.mail_reading_reports[0];
    const onReport = onBundle.mail_reading_reports[0];

    assert.equal(JSON.stringify(onBundle).includes(PRIVATE_SENTINEL), false);
    assert.equal(offReport.knowledge_hint_applied, false);
    assert.equal(onReport.knowledge_hint_applied, true);
    assert.equal(onReport.target_object, "KVDS body-only SOW handoff");
    assert.deepEqual(onReport.work_types, ["review", "author"]);
    assert.equal(onReport.required_role, "systems_engineering_owner");
    assert.equal(onReport.knowledge_hint_authority, "metadata_hint");
    assert.equal(onReport.knowledge_claim_ceiling, "observed");
    assert.equal(onReport.owner_review_required, true);
    assert.equal(onReport.due, "2026-07-06");
    assert.match(onReport.knowledge_hint_reason, /project_body_only_sow_rule/);
    const candidate = Array.isArray(onBundle.ledger_candidates.BODYRULE)
      ? onBundle.ledger_candidates.BODYRULE[0]
      : onBundle.ledger_candidates.BODYRULE;
    assert.equal(candidate.knowledge_hint_authority, "metadata_hint");
    assert.equal(candidate.knowledge_claim_ceiling, "observed");
    assert.equal(candidate.owner_review_required, true);
    assert.match(candidate.review_reason, /knowledge_hint_authority=metadata_hint/);
    assert.equal(onBundle.proposal_candidates[0].knowledge_hint_authority, "metadata_hint");
    assert.equal(onBundle.proposal_candidates[0].knowledge_claim_ceiling, "observed");
    assert.equal(onBundle.proposal_candidates[0].owner_review_required, true);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-READING: Codex judgment overlay improves candidates while code keeps keys and redacts body", () => {
  const tmp = makeTempRuntime();
  try {
    writeEventSink(tmp.repoRoot);
    writeKnowledgeFixture(tmp.repoRoot);
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
    assert.equal(text.includes(KNOWLEDGE_SENTINEL), false);

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
