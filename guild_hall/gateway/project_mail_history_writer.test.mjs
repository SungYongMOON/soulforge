import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildProjectMailHistoryEntry,
  projectMailHistoryPaths,
  upsertProjectMailHistory,
} from "./project_mail_history_writer.mjs";

test("upsertProjectMailHistory writes Korean metadata plus workspace XLSX export without duplicate rows", async () => {
  const repoRoot = await createRepoRoot();
  const projectCode = "P26-030";
  const firstEntry = sampleEntry({ projectCode, subject: "Synthetic project mail request" });
  const secondEntry = sampleEntry({ projectCode, subject: "Synthetic project mail request revised" });

  const first = await upsertProjectMailHistory({ repoRoot, projectCode, entry: firstEntry });
  const second = await upsertProjectMailHistory({ repoRoot, projectCode, entry: secondEntry });
  const paths = projectMailHistoryPaths(repoRoot, projectCode);
  const csv = await readFile(paths.csv_path, "utf8");
  const xlsx = await readFile(paths.xlsx_path);
  const schedule = await readFile(paths.schedule_path, "utf8");
  const dataRows = csv.replace(/^\uFEFF/u, "").trim().split(/\r?\n/u).slice(1);

  assert.equal(first.dedupe_status, "inserted");
  assert.equal(second.dedupe_status, "replaced_existing");
  assert.deepEqual(second.written_refs, [
    "_workmeta/P26-030/reports/메일_이력/메일_이력.csv",
    "_workspaces/P26-030/reports/메일_이력/메일_이력.xlsx",
    "_workmeta/P26-030/reports/메일_이력/메일_일정이벤트.ics",
  ]);
  assert.equal(dataRows.length, 1);
  assert.match(csv.split(/\r?\n/u)[0], /후보ID/);
  assert.match(csv, /Synthetic project mail request revised/);
  assert.equal(xlsx.subarray(0, 2).toString("utf8"), "PK");
  await assert.rejects(readFile(paths.legacy_workmeta_xlsx_path), (error) => error.code === "ENOENT");
  assert.match(schedule, /BEGIN:VEVENT/);
  assert.match(schedule, /Synthetic project mail request revised/);
  assert.match(schedule, /원문복사여부: false/);
});

test("project mail history writer keeps raw payload fields out of derived files", async () => {
  const repoRoot = await createRepoRoot();
  const projectCode = "P26-030";
  const entry = buildProjectMailHistoryEntry({
    eventType: "monster_created",
    at: "2026-05-21T00:00:00.000Z",
    projectCode,
    stage: "030_SRR",
    monster: {
      monster_id: "monster_mail_private_boundary",
      source_refs: ["mail_evt_private_boundary"],
      assignment_status: "assigned",
    },
    mail: {
      source_ref: "mail_evt_private_boundary",
      received_at: "2026-05-21T00:00:00.000Z",
      mailbox_id: "company_mailbox",
      subject: "Synthetic private boundary request",
      from: [{ name: "Private Sender", address: "sender@example.test" }],
      attachment_count: 1,
      body_text: "private body must not be copied",
      body_html: "<html>private html</html>",
      attachments: [{ name: "secret.xlsx", local_path: "/private/path/secret.xlsx" }],
    },
    refs: {
      gateway_monster_ref: "guild_hall/state/gateway/intake_inbox/mail_evt_private_boundary/monsters.json#monster_id=monster_mail_private_boundary",
      project_monster_ref: "_workmeta/P26-030/monsters/monster_mail_private_boundary.yaml",
      raw_ref: "guild_hall/state/gateway/mailbox/company/mail/raw/hiworks/2026/2026-05.jsonl",
    },
  });

  await upsertProjectMailHistory({ repoRoot, projectCode, entry });
  const paths = projectMailHistoryPaths(repoRoot, projectCode);
  const rendered = [
    await readFile(paths.csv_path, "utf8"),
    await readFile(paths.schedule_path, "utf8"),
  ].join("\n");

  assert(!rendered.includes("private body"));
  assert(!rendered.includes("private html"));
  assert(!rendered.includes("secret.xlsx"));
  assert(!rendered.includes("/private/path"));
  assert(!rendered.includes("/mail/raw/"));
  assert.match(rendered, /Synthetic private boundary request/);
});

function sampleEntry({ projectCode, subject }) {
  return buildProjectMailHistoryEntry({
    eventType: "monster_created",
    at: "2026-05-21T00:00:00.000Z",
    projectCode,
    stage: "030_SRR",
    monster: {
      monster_id: "monster_mail_history_001",
      source_refs: ["mail_evt_history_001"],
      assignment_status: "assigned",
      assigned_stage: "030_SRR",
      project_monster_ref: "_workmeta/P26-030/monsters/monster_mail_history_001.yaml",
    },
    mail: {
      source_ref: "mail_evt_history_001",
      received_at: "2026-05-21T00:00:00.000Z",
      mailbox_id: "company_mailbox",
      thread_ref: "thread-001",
      subject,
      from: [{ name: "Sender", address: "sender@example.test" }],
      attachment_count: 0,
    },
    refs: {
      gateway_monster_ref: "guild_hall/state/gateway/intake_inbox/mail_evt_history_001/monsters.json#monster_id=monster_mail_history_001",
      project_monster_ref: "_workmeta/P26-030/monsters/monster_mail_history_001.yaml",
    },
  });
}

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-project-mail-history-"));
}
