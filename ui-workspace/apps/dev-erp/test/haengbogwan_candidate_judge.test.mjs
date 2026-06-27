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
} from "../tools/haengbogwan_context_packet.mjs";
import {
  buildLedgerCandidates,
  judgeContextPacket,
  validateMetadataOnlyContextPacket,
} from "../tools/haengbogwan_candidate_judge.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_candidate_judge.mjs");
const LEDGER_TOOL = resolve(import.meta.dirname, "..", "tools", "mail_to_task_ledger.mjs");

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
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-candidate-"));
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

function writeBotOnlyOverlayDb(dbPath) {
  const store = openStore(dbPath);
  try {
    const actorApplied = applyActorOverlayImport(store, {
      actorOverlay: {
        schema_version: "soulforge.company.actor_overlay.v1",
        source_refs: ["_workspaces/knowledge/common/test/actor_source.json"],
        actors: [
          {
            actor_ref: "bot_task_classifier",
            actor_type: "bot",
            display_name: "Task Classifier Bot",
            capabilities: [{ capability: "classify_mail_task", label: "Classify mail into tasks" }],
            authority: "propose_only",
            approval_required: true,
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

function writeCandidateFixture(root, project = "P26-014") {
  const projectRoot = join(root, project);
  writeCsv(
    join(projectRoot, MAIL_LEDGER_RELATIVE_PATH),
    ["이력키", "제목", "발신자", "메일수신시각", "메일함", "메일소스ID", "마감일"],
    [
      {
        이력키: "M001",
        제목: "deadline review",
        발신자: "sender-a@example.test",
        메일수신시각: "2026-06-26T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-1",
        마감일: "2026-07-03",
      },
      {
        이력키: "M002",
        제목: "ordinary review",
        발신자: "sender-b@example.test",
        메일수신시각: "2026-06-27T10:00:00+09:00",
        메일함: "team@example.test",
        메일소스ID: "SRC-2",
        마감일: "",
      },
    ]
  );
  writeCsv(
    join(projectRoot, TASK_LEDGER_RELATIVE_PATH),
    ["할일키", "프로젝트코드", "할일명", "담당자", "업무유형", "상태", "마감일", "완료기준", "검토상태", "관련메일이력키"],
    []
  );
}

test("HAENGBOGWAN-CANDIDATE: judge emits ledger-compatible candidate map keyed by history key", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeCandidateFixture(tmp.root, project);
    const packet = buildContextPacketForProject({
      workmetaRoot: tmp.root,
      projectId: project,
      limit: 10,
      today: "2026-06-27",
      generatedAt: "2026-06-27T00:00:00.000Z",
    });
    const candidates = buildLedgerCandidates(packet);
    assert.deepEqual(Object.keys(candidates).sort(), ["M001", "M002"]);
    assert.equal(candidates.M001.work_type, "review");
    assert.equal(candidates.M001.review_status, "needs_review");
    assert.equal(candidates.M001.status_hint, "unclassified");
    assert.equal(candidates.M001.due, "2026-07-03");
    assert.equal(candidates.M001.route_candidate, project);
    assert.equal(candidates.M001.required_role, "mail_triage_owner");
    assert.equal(candidates.M001.required_capability, "mail_metadata_review");
    assert.equal(candidates.M001.source_mail_ref, "mailcsv:M001");
    assert.equal(candidates.M001.source_mail_source_id, "SRC-1");
    assert.equal(candidates.M001.generation_rule_ref, "haengbogwan_candidate_judge_skeleton.v0");
    assert.equal(candidates.M001.body_access, "metadata_only");
    assert.equal(candidates.M002.due, "");

    const judged = judgeContextPacket(packet);
    assert.equal(judged.candidate_count, 2);
    assert.equal(judged.candidates.M001.work_type, "review");

    const candidatePath = join(tmp.root, "candidates.json");
    writeFileSync(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const dryRun = spawnSync(process.execPath, [
      LEDGER_TOOL,
      "--workmeta",
      tmp.root,
      "--project",
      project,
      "--candidates",
      candidatePath,
    ], { encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /dry-run/);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CANDIDATE: db overlay suggests assignee metadata without final assignment", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeCandidateFixture(tmp.root, project);
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

    const candidates = buildLedgerCandidates(packet);
    assert.equal(candidates.M001.required_role, "mail_triage_owner");
    assert.equal(candidates.M001.required_capability, "mail_metadata_review");
    assert.equal(candidates.M001.review_status, "needs_review");
    assert.equal(candidates.M001.suggested_assignee_ref, "mail_team");
    assert.equal(candidates.M001.assignee_confidence, "low");
    assert.match(candidates.M001.route_reason, /db projection/);
    assert.deepEqual(candidates.M001.supporting_actor_refs, ["bot_task_classifier"]);
    assert.equal(Object.hasOwn(candidates.M001, "assignee_ref"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CANDIDATE: bot-only overlay remains supporting metadata, not assignee suggestion", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeCandidateFixture(tmp.root, project);
    const dbPath = join(tmp.root, "dev-erp.db");
    writeBotOnlyOverlayDb(dbPath);
    const packet = buildContextPacketForProject({
      workmetaRoot: tmp.root,
      projectId: project,
      limit: 10,
      today: "2026-06-27",
      generatedAt: "2026-06-27T00:00:00.000Z",
      dbPath,
    });

    const candidates = buildLedgerCandidates(packet);
    assert.equal(candidates.M001.suggested_assignee_ref, "");
    assert.equal(candidates.M001.assignee_confidence, "");
    assert.deepEqual(candidates.M001.supporting_actor_refs, ["bot_task_classifier"]);
    assert.equal(Object.hasOwn(candidates.M001, "assignee_ref"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CANDIDATE: CLI reads a context file and help works", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeCandidateFixture(tmp.root, project);
    const packet = buildContextPacketForProject({
      workmetaRoot: tmp.root,
      projectId: project,
      limit: 1,
      today: "2026-06-27",
      generatedAt: "2026-06-27T00:00:00.000Z",
    });
    const contextPath = join(tmp.root, "context.json");
    writeFileSync(contextPath, `${JSON.stringify(packet, null, 2)}\n`);

    const result = spawnSync(process.execPath, [TOOL, "--context", contextPath, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const candidates = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(candidates), ["M002"]);
    assert.equal(candidates.M002.review_status, "needs_review");

    const help = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /candidate JSON map keyed by mail history key/);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-CANDIDATE: unsafe context packets are rejected before candidate output", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    writeCandidateFixture(tmp.root, project);
    const packet = buildContextPacketForProject({
      workmetaRoot: tmp.root,
      projectId: project,
      limit: 1,
      today: "2026-06-27",
      generatedAt: "2026-06-27T00:00:00.000Z",
    });

    assert.equal(validateMetadataOnlyContextPacket(packet), true);

    const notMetadataOnly = {
      ...packet,
      boundary: { ...packet.boundary, metadata_only: false },
    };
    assert.throws(() => buildLedgerCandidates(notMetadataOnly), /unsafe_context_boundary:not_metadata_only/);

    const localBodyAllowed = {
      ...packet,
      source_events: [{ ...packet.source_events[0], body_access: "local_body_allowed" }],
    };
    assert.throws(() => buildLedgerCandidates(localBodyAllowed), /unsafe_source_event_body_access/);

    const rawFieldInjected = {
      ...packet,
      source_events: [{ ...packet.source_events[0], body_preview: "raw preview must not enter judge" }],
    };
    assert.throws(() => buildLedgerCandidates(rawFieldInjected), /unsafe_source_event_payload_field:body_preview/);

    const contextPath = join(tmp.root, "unsafe-context.json");
    writeFileSync(contextPath, `${JSON.stringify(rawFieldInjected, null, 2)}\n`);
    const result = spawnSync(process.execPath, [TOOL, "--context", contextPath, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unsafe_source_event_payload_field:body_preview/);
  } finally {
    tmp.cleanup();
  }
});
