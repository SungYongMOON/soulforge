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

test("project mail history XLSX uses readable filtered sheets with wrapped key text", async () => {
  const repoRoot = await createRepoRoot();
  const projectCode = "P26-030";
  const received = sampleEntry({
    projectCode,
    eventType: "mail_received",
    sourceRef: "mail_evt_received_readability",
    monsterId: "monster_mail_received_readability",
    subject: "Long synthetic received project request that should wrap instead of being clipped in the first view",
    workStatus: "pending_review",
    attachmentCount: 2,
  });
  const sent = sampleEntry({
    projectCode,
    eventType: "mail_sent",
    sourceRef: "mail_evt_sent_readability",
    monsterId: "monster_mail_sent_readability",
    subject: "Synthetic sent follow-up",
    workStatus: "sent",
  });

  await upsertProjectMailHistory({ repoRoot, projectCode, entry: received });
  await upsertProjectMailHistory({ repoRoot, projectCode, entry: sent });
  const paths = projectMailHistoryPaths(repoRoot, projectCode);
  const xlsxEntries = readZipEntries(await readFile(paths.xlsx_path));
  const workbookXml = xlsxEntries.get("xl/workbook.xml");
  const historySheetXml = xlsxEntries.get("xl/worksheets/sheet1.xml");
  const receivedSheetXml = xlsxEntries.get("xl/worksheets/sheet2.xml");
  const sentSheetXml = xlsxEntries.get("xl/worksheets/sheet3.xml");
  const needsReviewSheetXml = xlsxEntries.get("xl/worksheets/sheet4.xml");
  const technicalSheetXml = xlsxEntries.get("xl/worksheets/sheet5.xml");

  assert.match(workbookXml, /<sheet name="메일_이력" sheetId="1" r:id="rId1"\/>/);
  assert.match(workbookXml, /<sheet name="수신" sheetId="2" r:id="rId2"\/>/);
  assert.match(workbookXml, /<sheet name="발신" sheetId="3" r:id="rId3"\/>/);
  assert.match(workbookXml, /<sheet name="검토필요" sheetId="4" r:id="rId4"\/>/);
  assert.match(workbookXml, /<sheet name="기술정보" sheetId="5" state="hidden" r:id="rId5"\/>/);
  assert.match(historySheetXml, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(historySheetXml, /<autoFilter ref="A1:O3"\/>/);
  assert.match(historySheetXml, /<col min="3" max="3" width="48" customWidth="1"\/>/);
  assert.match(historySheetXml, /<c r="A2" s="3"><v>\d+(?:\.\d+)?<\/v><\/c>/);
  assert.match(historySheetXml, /<c r="C2" s="2" t="inlineStr">/);
  assert(historySheetXml.indexOf("<t>날짜</t>") < historySheetXml.indexOf("<t>메일소스ID</t>"));
  assert(!historySheetXml.includes("<t>이력키</t>"));
  assert.match(receivedSheetXml, /Long synthetic received project request/);
  assert(!receivedSheetXml.includes("Synthetic sent follow-up"));
  assert.match(sentSheetXml, /Synthetic sent follow-up/);
  assert(!sentSheetXml.includes("Long synthetic received project request"));
  assert.match(needsReviewSheetXml, /pending_review/);
  assert.match(technicalSheetXml, /<t>이력키<\/t>/);
  assert.match(technicalSheetXml, /<t>스키마버전<\/t>/);
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
  const xlsxText = [...readZipEntries(await readFile(paths.xlsx_path)).values()].join("\n");
  const rendered = [
    await readFile(paths.csv_path, "utf8"),
    await readFile(paths.schedule_path, "utf8"),
    xlsxText,
  ].join("\n");

  assert(!rendered.includes("private body"));
  assert(!rendered.includes("private html"));
  assert(!rendered.includes("secret.xlsx"));
  assert(!rendered.includes("/private/path"));
  assert(!rendered.includes("/mail/raw/"));
  assert.match(rendered, /Synthetic private boundary request/);
});

function sampleEntry({
  projectCode,
  subject,
  eventType = "monster_created",
  sourceRef = "mail_evt_history_001",
  monsterId = "monster_mail_history_001",
  workStatus = "assigned",
  attachmentCount = 0,
}) {
  return buildProjectMailHistoryEntry({
    eventType,
    at: "2026-05-21T00:00:00.000Z",
    projectCode,
    stage: "030_SRR",
    monster: {
      monster_id: monsterId,
      source_refs: [sourceRef],
      assignment_status: workStatus,
      assigned_stage: "030_SRR",
      project_monster_ref: `_workmeta/P26-030/monsters/${monsterId}.yaml`,
    },
    mail: {
      source_ref: sourceRef,
      received_at: "2026-05-21T00:00:00.000Z",
      mailbox_id: "company_mailbox",
      thread_ref: "thread-001",
      subject,
      from: [{ name: "Sender", address: "sender@example.test" }],
      attachment_count: attachmentCount,
    },
    refs: {
      gateway_monster_ref: `guild_hall/state/gateway/intake_inbox/${sourceRef}/monsters.json#monster_id=${monsterId}`,
      project_monster_ref: `_workmeta/P26-030/monsters/${monsterId}.yaml`,
    },
  });
}

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    assert.equal(method, 0, `unexpected compression method for ${name}`);
    entries.set(name, buffer.subarray(dataStart, dataStart + compressedSize).toString("utf8"));
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-project-mail-history-"));
}
