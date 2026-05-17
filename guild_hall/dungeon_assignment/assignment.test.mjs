import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import YAML from "yaml";

import { materializeDungeonAssignment } from "./assignment.mjs";

const execFile = promisify(execFileCallback);
const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("materializes private filing, project monster, and workspace bridge for a gateway monster", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_001");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_001_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  const result = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_001_a",
    now: "2026-05-17T12:00:00+09:00",
  });

  const filingPacket = await readJson(
    path.join(repoRoot, "_workmeta", "P26-030", "artifacts", "mail_filing", "monster_hiworks_evt_001_a", "filing_packet.json"),
  );
  const projectMonster = YAML.parse(
    await readFile(path.join(repoRoot, "_workmeta", "P26-030", "monsters", "monster_hiworks_evt_001_a.yaml"), "utf8"),
  );
  const workspacePacket = await readJson(
    path.join(
      repoRoot,
      "_workspaces",
      "P26-030",
      "020_MGMT",
      "022_INBOX_원본수집",
      "monster_hiworks_evt_001_a",
      "filing_packet.json",
    ),
  );
  const mailHistory = await readFile(
    path.join(repoRoot, "_workspaces", "P26-030", "020_MGMT", "027_수신이력_이동이력", "mail_receive_history.jsonl"),
    "utf8",
  );
  const rendered = JSON.stringify({ result, filingPacket, projectMonster, workspacePacket, mailHistory });

  assert.equal(result.status, "filed");
  assert.equal(filingPacket.gateway_monster_id, "monster_hiworks_evt_001_a");
  assert.equal(filingPacket.project_code, "P26-030");
  assert.equal(projectMonster.monster_id, "monster_hiworks_evt_001_a");
  assert.equal(projectMonster.source_monster_id, "monster_hiworks_evt_001_a");
  assert.equal(workspacePacket.monster_id, "monster_hiworks_evt_001_a");
  assert.match(mailHistory, /mail_filing_received/);
  assert(!rendered.includes("private body must not be copied"));
  assert(!rendered.includes("<html>private html</html>"));
  assert(!rendered.includes("secret.xlsx"));
  assert(!rendered.includes("https://example.test/secret.xlsx"));
});

test("candidate source preserves caller-provided gateway monster id and routing suggestion", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", "candidate.json");
  await writeJson(candidateFile, sampleCandidate());

  const result = await materializeDungeonAssignment({
    repoRoot,
    candidateFile,
    gatewayMonsterId: "gateway_monster_stable_001",
    now: "2026-05-17T12:05:00+09:00",
  });
  const projectMonster = YAML.parse(
    await readFile(path.join(repoRoot, "_workmeta", "P24-049", "monsters", "gateway_monster_stable_001.yaml"), "utf8"),
  );
  const filingPacket = await readJson(
    path.join(repoRoot, "_workmeta", "P24-049", "artifacts", "mail_filing", "gateway_monster_stable_001", "filing_packet.json"),
  );
  const rendered = JSON.stringify({ result, projectMonster, filingPacket });

  assert.equal(result.status, "filed");
  assert.equal(projectMonster.monster_id, "gateway_monster_stable_001");
  assert.equal(projectMonster.source_monster_id, "gateway_monster_stable_001");
  assert.equal(filingPacket.routing.source, "candidate_project_routing_suggestion");
  assert.equal(filingPacket.routing.route_id, "p24_hint");
  assert(!rendered.includes("candidate private body"));
  assert(!rendered.includes("<html>candidate private html</html>"));
  assert(!rendered.includes("quote.pdf"));
  assert(!rendered.includes("/private/path/quote.pdf"));
});

test("unresolved stage blocks mission handoff while preserving private filing", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_002");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [sampleMonster({ monster_id: "monster_hiworks_evt_002_a", assigned_project_code: "P26-030" })],
  });

  const result = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_002_a",
    emitPublicMissionDraft: true,
    publicProjectCode: "public_demo",
    now: "2026-05-17T12:10:00+09:00",
  });

  assert.equal(result.status, "partially_filed");
  assert.deepEqual(result.blocked_reasons, ["unresolved_stage"]);
  assert.deepEqual(result.mission_handoff, { status: "not_created", reason: "unresolved_stage" });
  await assert.rejects(readFile(path.join(repoRoot, ".mission", "mail_handoff_public_demo_7cd0c993cb16", "mission.yaml"), "utf8"));
  const projectMonster = YAML.parse(
    await readFile(path.join(repoRoot, "_workmeta", "P26-030", "monsters", "monster_hiworks_evt_002_a.yaml"), "utf8"),
  );
  assert.equal(projectMonster.status, "blocked");
});

test("public mission draft is blocked, redacted, and requires an explicit public project code", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_003");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_003_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  const blocked = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_003_a",
    emitPublicMissionDraft: true,
    now: "2026-05-17T12:15:00+09:00",
  });
  assert.equal(blocked.mission_handoff.reason, "public_project_code_required");

  const result = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_003_a",
    emitPublicMissionDraft: true,
    publicProjectCode: "public_demo",
    missionId: "public_mail_handoff_demo_001",
    now: "2026-05-17T12:20:00+09:00",
  });
  const missionText = await readFile(path.join(repoRoot, ".mission", "public_mail_handoff_demo_001", "mission.yaml"), "utf8");
  const readinessText = await readFile(path.join(repoRoot, ".mission", "public_mail_handoff_demo_001", "readiness.yaml"), "utf8");
  const missionIndexText = await readFile(path.join(repoRoot, ".mission", "index.yaml"), "utf8");
  const rendered = `${missionText}\n${readinessText}\n${missionIndexText}`;
  const mission = YAML.parse(missionText);
  const missionIndex = YAML.parse(missionIndexText);

  assert.equal(result.mission_handoff.status, "created_blocked_public_safe_draft");
  assert(result.written_refs.includes(".mission/index.yaml"));
  assert.equal(mission.status, "blocked");
  assert.equal(mission.project_code, "public_demo");
  assert.equal(mission.redaction.raw_payload_copied, false);
  assert.deepEqual(missionIndex.entries.at(-1), {
    mission_id: "public_mail_handoff_demo_001",
    title: "Redacted Mail-Derived Mission Draft",
    status: "blocked",
    workflow_id: null,
    party_id: "guild_master_cell",
    project_code: "public_demo",
    readiness_status: "blocked",
  });
  assert(!rendered.includes("P26-030"));
  assert(!rendered.includes("Private Sender"));
  assert(!rendered.includes("sender@example.test"));
  assert(!rendered.includes("secret.xlsx"));
  assert(!rendered.includes("private body"));
});

test("public mission draft updates an existing mission index", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_existing_index");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_existing_index_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });
  await writeYaml(path.join(repoRoot, ".mission", "index.yaml"), {
    version: "v1",
    owner: ".mission",
    kind: "mission_catalog",
    status: "active",
    entries: [
      {
        mission_id: "public_mail_handoff_existing_index_001",
        title: "Previous Title",
        status: "ready",
        workflow_id: "previous_workflow",
        party_id: "previous_party",
        project_code: "previous_public_project",
        readiness_status: "ready",
        retained_field: "keep",
      },
    ],
    notes: ["existing note"],
  });

  const result = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_existing_index_a",
    emitPublicMissionDraft: true,
    publicProjectCode: "public_demo",
    missionId: "public_mail_handoff_existing_index_001",
    now: "2026-05-17T12:22:00+09:00",
  });
  const missionIndex = YAML.parse(await readFile(path.join(repoRoot, ".mission", "index.yaml"), "utf8"));

  assert.equal(result.mission_handoff.status, "created_blocked_public_safe_draft");
  assert.deepEqual(missionIndex.notes, ["existing note"]);
  assert.deepEqual(missionIndex.entries, [
    {
      mission_id: "public_mail_handoff_existing_index_001",
      title: "Redacted Mail-Derived Mission Draft",
      status: "blocked",
      workflow_id: null,
      party_id: "guild_master_cell",
      project_code: "public_demo",
      readiness_status: "blocked",
      retained_field: "keep",
    },
  ]);
});

test("private mission handoff writes project-local mission artifacts without raw payload", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_private_mission");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_private_mission_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  const result = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_private_mission_a",
    emitPrivateMissionHandoff: true,
    missionId: "private_mail_handoff_demo_001",
    workflowId: "workflow_private_review",
    now: "2026-05-17T12:30:00+09:00",
  });

  const missionRoot = path.join(repoRoot, "_workmeta", "P26-030", "missions", "private_mail_handoff_demo_001");
  const mission = YAML.parse(await readFile(path.join(missionRoot, "mission.yaml"), "utf8"));
  const readiness = YAML.parse(await readFile(path.join(missionRoot, "readiness.yaml"), "utf8"));
  const dispatch = YAML.parse(await readFile(path.join(missionRoot, "dispatch_request.yaml"), "utf8"));
  const resolvedPlan = YAML.parse(await readFile(path.join(missionRoot, "resolved_plan.yaml"), "utf8"));
  const missionIndex = YAML.parse(await readFile(path.join(repoRoot, "_workmeta", "P26-030", "missions", "index.yaml"), "utf8"));
  const projectMonster = YAML.parse(
    await readFile(path.join(repoRoot, "_workmeta", "P26-030", "monsters", "monster_hiworks_evt_private_mission_a.yaml"), "utf8"),
  );
  const rendered = JSON.stringify({ mission, readiness, dispatch, resolvedPlan, missionIndex });

  assert.equal(result.mission_handoff.status, "created_private_handoff");
  assert.equal(result.mission_handoff.mission_ref, "_workmeta/P26-030/missions/private_mail_handoff_demo_001");
  assert(result.written_refs.includes("_workmeta/P26-030/missions/private_mail_handoff_demo_001/mission.yaml"));
  assert(!result.written_refs.some((entry) => entry.startsWith(".mission/")));
  assert.equal(projectMonster.mission_ref, "_workmeta/P26-030/missions/private_mail_handoff_demo_001");
  assert.equal(mission.status, "ready");
  assert.equal(mission.workflow_id, "workflow_private_review");
  assert.equal(readiness.checks.raw_payload_absent, "pass");
  assert.equal(readiness.checks.workflow_present, "pass");
  assert.deepEqual(readiness.blockers, []);
  assert.equal(dispatch.request.source_ref, "_workmeta/P26-030/artifacts/mail_filing/monster_hiworks_evt_private_mission_a/filing_packet.json");
  assert.equal(resolvedPlan.workflow.selection_status, "selected");
  assert.deepEqual(missionIndex.entries.at(-1), {
    mission_id: "private_mail_handoff_demo_001",
    status: "ready",
    workflow_id: "workflow_private_review",
    party_id: "guild_master_cell",
    project_code: "P26-030",
    stage: "150_TRR_DT",
    readiness_status: "ready",
    mission_ref: "_workmeta/P26-030/missions/private_mail_handoff_demo_001",
  });
  await assert.rejects(readFile(path.join(repoRoot, ".mission", "private_mail_handoff_demo_001", "mission.yaml"), "utf8"));
  assert(!rendered.includes("Private project request"));
  assert(!rendered.includes("Review private project request"));
  assert(!rendered.includes("Private Sender"));
  assert(!rendered.includes("sender@example.test"));
  assert(!rendered.includes("private body must not be copied"));
  assert(!rendered.includes("<html>private html</html>"));
  assert(!rendered.includes("secret.xlsx"));
  assert(!rendered.includes("https://example.test/secret.xlsx"));
});

test("private mission handoff remains blocked without workflow selection", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_private_blocked");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_private_blocked_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  const result = await materializeDungeonAssignment({
    repoRoot,
    inboxDir,
    monsterId: "monster_hiworks_evt_private_blocked_a",
    emitPrivateMissionHandoff: true,
    missionId: "private_mail_handoff_blocked_001",
    now: "2026-05-17T12:32:00+09:00",
  });
  const readiness = YAML.parse(
    await readFile(path.join(repoRoot, "_workmeta", "P26-030", "missions", "private_mail_handoff_blocked_001", "readiness.yaml"), "utf8"),
  );

  assert.equal(result.mission_handoff.status, "created_private_handoff");
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.checks.workflow_present, "missing");
  assert.deepEqual(readiness.blockers, ["workflow_id is not resolved for this private mission handoff."]);
});

test("mission output modes are mutually exclusive", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_mutual_exclusion");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_mutual_exclusion_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  await assert.rejects(
    materializeDungeonAssignment({
      repoRoot,
      inboxDir,
      monsterId: "monster_hiworks_evt_mutual_exclusion_a",
      emitPrivateMissionHandoff: true,
      emitPublicMissionDraft: true,
      publicProjectCode: "public_demo",
      now: "2026-05-17T12:34:00+09:00",
    }),
    /choose either --emit-private-mission-handoff or --emit-public-mission-draft/,
  );
});

test("CLI file command supports dry-run planning", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_cli");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_cli_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "file",
    "--repo-root",
    repoRoot,
    "--inbox-dir",
    inboxDir,
    "--monster-id",
    "monster_hiworks_evt_cli_a",
    "--dry-run",
    "--now",
    "2026-05-17T12:25:00+09:00",
  ]);
  const result = JSON.parse(stdout);

  assert.equal(result.dry_run, true);
  assert.equal(result.status, "filed");
  assert(result.planned_writes.some((entry) => entry.includes("_workmeta/P26-030/monsters/monster_hiworks_evt_cli_a.yaml")));
});

test("CLI file command supports private mission handoff dry-run planning", async () => {
  const repoRoot = await createRepoRoot();
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "hiworks_evt_cli_private");
  await writeJson(path.join(inboxDir, "inbox.json"), sampleInbox());
  await writeJson(path.join(inboxDir, "monsters.json"), {
    monsters: [
      sampleMonster({
        monster_id: "monster_hiworks_evt_cli_private_a",
        assigned_project_code: "P26-030",
        assigned_stage: "150_TRR_DT",
      }),
    ],
  });

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "file",
    "--repo-root",
    repoRoot,
    "--inbox-dir",
    inboxDir,
    "--monster-id",
    "monster_hiworks_evt_cli_private_a",
    "--emit-private-mission-handoff",
    "--mission-id",
    "private_mail_handoff_cli_001",
    "--dry-run",
    "--now",
    "2026-05-17T12:36:00+09:00",
  ]);
  const result = JSON.parse(stdout);

  assert.equal(result.dry_run, true);
  assert.equal(result.status, "filed");
  assert.equal(result.mission_handoff.status, "created_private_handoff");
  assert(result.planned_writes.includes("_workmeta/P26-030/missions/private_mail_handoff_cli_001/mission.yaml"));
  assert(!result.planned_writes.some((entry) => entry.startsWith(".mission/")));
});

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-dungeon-assignment-"));
}

function sampleInbox() {
  return {
    workspace_intake_inbox_id: "hiworks_evt_001",
    source_kind: "mail",
    source_ref: "hiworks_evt_001",
    event_ref: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-05.jsonl#event_id=hiworks_evt_001",
    raw_ref: "guild_hall/state/gateway/mailbox/company/mail/raw/hiworks/2026/2026-05.jsonl#provider_message_id=provider-001",
    attachment_refs: [
      "guild_hall/state/gateway/mailbox/company/mail/attachments/hiworks/secret.xlsx",
      "https://example.test/secret.xlsx",
    ],
    received_at: "2026-05-17T09:00:00+09:00",
    mailbox_id: "company_mailbox",
    subject: "Private project request",
    from: [{ name: "Private Sender", address: "sender@example.test" }],
    to: [{ name: "Owner", address: "owner@example.test" }],
    cc: [],
    body_text: "private body must not be copied",
    body_html: "<html>private html</html>",
  };
}

function sampleMonster(overrides = {}) {
  return {
    monster_id: "monster_hiworks_evt_001_a",
    monster_family: "unknown_monster",
    monster_name: null,
    work_pattern: "mail_candidate_review",
    objective: "Review private project request",
    due_state: "no_due",
    known_status: "unknown",
    source_refs: ["hiworks_evt_001"],
    last_mail_at: "2026-05-17T09:00:00+09:00",
    mail_touch_count: 1,
    last_mail_role: "new_request",
    dedupe_key: "mail:hiworks:hiworks_evt_001",
    ...overrides,
  };
}

function sampleCandidate() {
  return {
    schema_version: "mail_candidate.queue_item.v1",
    candidate_id: "mail_candidate_hiworks_evt_candidate_001",
    status: "pending_review",
    created_at: "2026-05-17T08:00:00+09:00",
    updated_at: "2026-05-17T08:05:00+09:00",
    source_event: {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      workspace: "company",
      event_file: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-05.jsonl",
      received_at: "2026-05-17T08:00:00+09:00",
      ingested_at: "2026-05-17T08:01:00+09:00",
    },
    mail_summary: {
      subject: "Candidate private request",
      from: [{ name: "Candidate Sender", address: "candidate@example.test" }],
      to_count: 1,
      cc_count: 0,
      attachment_count: 1,
      attachment_types: ["reference_attachment"],
      classification: "mail",
    },
    body_text: "candidate private body",
    body_html: "<html>candidate private html</html>",
    attachments: [{ name: "quote.pdf", local_path: "/private/path/quote.pdf" }],
    business_review: {
      required: true,
      status: "triaged",
      next_action: "review_project_routing_suggestion",
      project_routing_suggestion: {
        schema_version: "mail_project_routing_suggestion.v1",
        status: "suggested",
        project_code: "P24-049",
        stage: "030_SRR",
        route_id: "p24_hint",
        confidence: 0.8,
        next_action: "review_project_routing_suggestion",
      },
    },
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeYaml(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${YAML.stringify(value)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
