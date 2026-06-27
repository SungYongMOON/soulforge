import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import { applyActorOverlayImport } from "../tools/import_actor_overlay.mjs";
import { applyRoleOverlayImport } from "../tools/import_role_overlay.mjs";
import {
  MAIL_LEDGER_RELATIVE_PATH,
  TASK_LEDGER_RELATIVE_PATH,
  buildContextPacketForProject,
  buildSourceEventsForProject,
} from "../tools/haengbogwan_context_packet.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_context_packet.mjs");

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(filePath, headers, rows) {
  mkdirSync(dirname(filePath), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`);
}

function makeTempWorkmeta() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-context-"));
  return {
    root,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeRoutingOverlayDb(dbPath, project = "P26-014") {
  const store = openStore(dbPath);
  try {
    const roleApplied = applyRoleOverlayImport(store, {
      teamOverlay: {
        schema_version: "soulforge.company.team_role_overlay.v1",
        source_refs: ["_workspaces/knowledge/common/test/source_card.json"],
        org_units: [
          {
            org_unit_ref: "mail_team",
            display_name: "Mail Routing Team",
            capabilities: [
              { capability: "mail_metadata_review", label: "Mail metadata review" },
              { capability: "project_management", label: "Project management" }
            ],
            status: "active"
          }
        ]
      },
      projectOverlay: {
        schema_version: "soulforge.company.project_role_overlay.v1",
        source_refs: ["_workspaces/knowledge/common/test/project_index.json"],
        assignments: [
          {
            project_code: project,
            role_area: "mail_triage",
            owning_org_unit_ref: "mail_team",
            confidence: "team_only",
            status: "active"
          }
        ]
      }
    });
    assert.equal(roleApplied.applied, true);
    const actorApplied = applyActorOverlayImport(store, {
      actorOverlay: {
        schema_version: "soulforge.company.actor_overlay.v1",
        source_refs: ["_workspaces/knowledge/common/test/actor_source.json"],
        actors: [
          {
            actor_ref: "mail_team",
            actor_type: "team",
            display_name: "Mail Routing Team",
            team_ref: "mail_team",
            capabilities: [{ capability: "mail_metadata_review", label: "Mail metadata review" }],
            authority: "responsible_owner",
            approval_required: false,
            status: "active"
          },
          {
            actor_ref: "bot_task_classifier",
            actor_type: "bot",
            display_name: "Task Classifier Bot",
            capabilities: [{ capability: "classify_mail_task", label: "Classify mail into tasks" }],
            authority: "propose_only",
            approval_required: true,
            handoff_to_ref: "mail_team",
            forbidden_actions: ["external_side_effect_without_owner_approval"],
            status: "active"
          }
        ]
      }
    });
    assert.equal(actorApplied.applied, true);
  } finally {
    store.db.close();
  }
}

function writeContextFixture(root, project = "P26-014") {
  const projectRoot = join(root, project);
  const rawPayload = join(root, "_workspaces", project, "raw-mail.eml");
  mkdirSync(dirname(rawPayload), { recursive: true });
  writeFileSync(rawPayload, "RAW_BODY_SENTINEL_MUST_NOT_APPEAR");

  writeCsv(
    join(projectRoot, MAIL_LEDGER_RELATIVE_PATH),
    ["이력키", "제목", "발신자", "메일수신시각", "메일함", "메일소스ID", "마감일", "본문경로"],
    [
      {
        이력키: "M001",
        제목: "first pending",
        발신자: "sender-a@example.test",
        메일수신시각: "2026-06-26T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-1",
        마감일: "2026-06-30",
        본문경로: rawPayload,
      },
      {
        이력키: "M002",
        제목: "latest pending",
        발신자: "sender-b@example.test",
        메일수신시각: "2026-06-27T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-2",
        마감일: "",
        본문경로: "",
      },
      {
        이력키: "M003",
        제목: "old pending",
        발신자: "sender-c@example.test",
        메일수신시각: "2026-06-25T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-3",
        마감일: "",
        본문경로: "",
      },
    ]
  );

  writeCsv(
    join(projectRoot, TASK_LEDGER_RELATIVE_PATH),
    ["할일키", "프로젝트코드", "할일명", "담당자", "업무유형", "상태", "마감일", "완료기준", "검토상태", "관련메일이력키"],
    [
      {
        할일키: "T-overdue",
        프로젝트코드: project,
        할일명: "late metadata review",
        담당자: "team:dev",
        업무유형: "review",
        상태: "open",
        마감일: "2026-06-26",
        완료기준: "review recorded",
        검토상태: "ready",
        관련메일이력키: "",
      },
      {
        할일키: "T-today",
        프로젝트코드: project,
        할일명: "today metadata review",
        담당자: "team:dev",
        업무유형: "review",
        상태: "open",
        마감일: "2026-06-27",
        완료기준: "review recorded",
        검토상태: "ready",
        관련메일이력키: "",
      },
    ]
  );
}

test("HAENGBOGWAN-CONTEXT: source events are idempotent and metadata-only", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeContextFixture(tmp.root, project);

    const first = buildSourceEventsForProject({ workmetaRoot: tmp.root, projectId: project, limit: 10 });
    const second = buildSourceEventsForProject({ workmetaRoot: tmp.root, projectId: project, limit: 10 });
    assert.deepEqual(first, second);
    assert.equal(first[0].history_key, "M002");
    assert.equal(first[0].event_ref, "mailhistory:P26-014:M002");
    assert.equal(first[0].idempotency_key, "mailtask:M002");
    assert.equal(first[0].body_access, "metadata_only");
    assert.equal(first.every((event) => event.source_refs.mail_history_ref.startsWith("mailcsv:")), true);
    assert.equal(JSON.stringify(first).includes("RAW_BODY_SENTINEL_MUST_NOT_APPEAR"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CONTEXT: packet caps summaries and reports unloaded boundaries", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeContextFixture(tmp.root, project);

    const packet = buildContextPacketForProject({
      workmetaRoot: tmp.root,
      projectId: project,
      limit: 2,
      today: "2026-06-27",
      generatedAt: "2026-06-27T00:00:00.000Z",
    });
    assert.equal(packet.project_id, project);
    assert.equal(packet.generated_at, "2026-06-27T00:00:00.000Z");
    assert.equal(packet.source_events.length, 2);
    assert.equal(packet.recent_mail_refs.length, 2);
    assert.equal(packet.open_tasks_summary.length, 2);
    assert.deepEqual(packet.open_tasks_summary.map((row) => row.bucket), ["overdue", "due_today"]);
    assert.equal(packet.snapshot_summary.pending_mail_count, 3);
    assert.equal(packet.snapshot_summary.overdue_count, 1);
    assert.equal(packet.snapshot_summary.due_today_count, 1);
    assert.equal(packet.snapshot_summary.raw_boundary_skip_count, 1);
    assert.equal(packet.boundary.metadata_only, true);
    assert.equal(packet.boundary.raw_body_loaded, false);
    assert.equal(packet.boundary.attachments_loaded, false);
    assert.equal(packet.not_loaded.roles.status, "not_loaded");
    assert.equal(packet.not_loaded.actors.status, "not_loaded");
    assert.equal(packet.not_loaded.memory.status, "not_loaded");
    assert.equal(Object.hasOwn(packet, "role_overlay"), false);
    assert.equal(Object.hasOwn(packet, "actor_overlay"), false);
    assert.equal(JSON.stringify(packet).includes("RAW_BODY_SENTINEL_MUST_NOT_APPEAR"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CONTEXT: optional db loads bounded role and actor projections", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeContextFixture(tmp.root, project);
    const dbPath = join(tmp.root, "dev-erp.db");
    writeRoutingOverlayDb(dbPath, project);

    const packet = buildContextPacketForProject({
      workmetaRoot: tmp.root,
      projectId: project,
      limit: 10,
      today: "2026-06-27",
      generatedAt: "2026-06-27T00:00:00.000Z",
      dbPath,
    });
    assert.equal(packet.not_loaded.roles.status, "loaded_from_db_projection");
    assert.equal(packet.not_loaded.actors.status, "loaded_from_db_projection");
    assert.equal(packet.not_loaded.memory.status, "not_loaded");
    assert.equal(packet.role_overlay.length, 1);
    assert.equal(packet.role_overlay[0].project_code, project);
    assert.equal(packet.role_overlay[0].role_area, "mail_triage");
    assert.deepEqual(packet.role_overlay[0].capabilities.map((cap) => cap.capability), ["mail_metadata_review", "project_management"]);
    assert.equal(packet.actor_overlay.length, 2);
    const bot = packet.actor_overlay.find((actor) => actor.actor_ref === "bot_task_classifier");
    assert.equal(bot.kind, "bot");
    assert.deepEqual(bot.forbidden_action_refs, ["external_side_effect_without_owner_approval"]);
    assert.equal(JSON.stringify(packet).includes("RAW_BODY_SENTINEL_MUST_NOT_APPEAR"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CONTEXT: CLI help smoke", () => {
  const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /metadata-only source_event\/context packet/);
});
