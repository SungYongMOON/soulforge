import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyWorkPacket, renderDailyWorkPacketMarkdown } from "./daily_work_packet.mjs";

test("buildDailyWorkPacket derives blocked mission items and owner questions", async () => {
  const packet = await buildDailyWorkPacket({
    repoRoot: "workspace_root",
    generatedAt: new Date("2026-05-16T00:00:00.000Z"),
    snapshot: {
      repo: { branch: "main" },
      projects: [{ project_code: "system" }],
      missions: { items: [{ mission_id: "m1" }, { mission_id: "m2" }] },
      gateway: { pending_monsters: { count: 2 } },
      diagnostics: { summary: { highest_severity: "ok" } },
      operation_board: {
        sections: {
          mission_board: {
            items: [
              {
                mission_id: "mission_blocked",
                title: "Blocked Mission",
                status: "blocked",
                readiness_status: "blocked",
                workflow_id_present: false,
                display_group: "blocked",
              },
              {
                mission_id: "mission_active",
                title: "Active Mission",
                status: "active",
                readiness_status: "ready",
                workflow_id_present: true,
                display_group: "active",
              },
            ],
          },
          action_queue: {
            items: [{ id: "next1", status: "next", summary: "Do the next thing." }],
          },
        },
      },
    },
    latestContext: {
      open_threads: [
        {
          entry_id: "activity_1",
          scope: "night_watch",
          action: "preflight",
          summary: "Carry forward issue",
          next_action: "Review it",
          carry_forward: true,
        },
      ],
    },
    devWorkerClaim: {
      selected: null,
      eligible_count: 0,
      scanned_count: 0,
    },
    devWorkerCandidates: {
      candidates: [],
      promotable_count: 0,
      auto_approvable_count: 0,
    },
  });

  assert.equal(packet.summary.blocked_or_active_mission_count, 2);
  assert.equal(packet.mission_work_queue[0].bottleneck_reason, "missing_owner_boundary");
  assert.equal(packet.mission_work_queue[1].bottleneck_reason, "quality_review_needed");
  assert.equal(packet.owner_questions.length, 2);
  assert.equal(packet.summary.dev_worker_status, "no_task");
});

test("buildDailyWorkPacket prioritizes active dev worker candidates for display", async () => {
  const completedCandidates = Array.from({ length: 9 }, (_, index) => ({
    task_id: `completed_${index + 1}`,
    status: "completed",
    summary: `Already completed candidate ${index + 1}.`,
    promotable: false,
    auto_approval: { eligible: false },
    ineligible_reason: "status_closed:completed",
  }));
  const candidates = [
    ...completedCandidates,
    {
      task_id: "proposed_attention",
      status: "proposed",
      summary: "Proposed candidate that needs attention.",
      promotable: false,
      auto_approval: { eligible: false },
      ineligible_reason: "status_not_approved:proposed",
    },
    {
      task_id: "auto_attention",
      status: "open",
      summary: "Auto-approvable candidate that needs attention.",
      promotable: false,
      auto_approval: { eligible: true },
      ineligible_reason: "status_not_approved:open",
    },
    {
      task_id: "promotable_attention",
      status: "approved",
      summary: "Promotable candidate that needs attention.",
      promotable: true,
      auto_approval: { eligible: false },
      ineligible_reason: null,
    },
  ];

  const packet = await buildDailyWorkPacket({
    repoRoot: "workspace_root",
    generatedAt: new Date("2026-05-16T00:00:00.000Z"),
    snapshot: {
      repo: { branch: "main" },
      projects: [],
      missions: { items: [] },
      gateway: { pending_monsters: { count: 0 } },
      diagnostics: { summary: { highest_severity: "ok" } },
      operation_board: {
        sections: {
          mission_board: { items: [] },
          action_queue: { items: [] },
        },
      },
    },
    latestContext: { open_threads: [] },
    devWorkerClaim: {
      selected: null,
      eligible_count: 0,
      scanned_count: 0,
    },
    devWorkerCandidates: {
      candidates,
      promotable_count: 1,
      auto_approvable_count: 1,
    },
  });

  assert.equal(packet.summary.dev_worker_candidate_count, 12);
  assert.equal(packet.dev_worker.candidate_count, 12);
  assert.equal(packet.dev_worker.candidates.length, 8);
  assert.deepEqual(
    packet.dev_worker.candidates.map((candidate) => candidate.task_id),
    [
      "promotable_attention",
      "auto_attention",
      "proposed_attention",
      "completed_1",
      "completed_2",
      "completed_3",
      "completed_4",
      "completed_5",
    ],
  );
});

test("buildDailyWorkPacket displays owner-approved proposed candidates as promotable without promoting them", async () => {
  const sharedGlossaryCandidate = {
    task_id: "shared_glossary_v0",
    status: "proposed",
    summary: "Unapproved proposed candidate that still needs owner approval.",
    promotable: false,
    auto_approval: { eligible: false },
    owner_approval: {
      required: true,
      approved: false,
    },
    ineligible_reason: "status_not_approved:proposed",
  };
  const approvalOnlyCandidate = {
    task_id: "owner_approved_still_proposed",
    status: "proposed",
    summary: "Owner approval exists, so the next automation trigger may promote it.",
    promotable: true,
    auto_approval: { eligible: false },
    owner_approval: {
      required: true,
      approved: true,
      approved_by: "owner",
      approved_at: "2026-06-05T00:00:00.000Z",
    },
    ineligible_reason: null,
  };
  const statusOnlyApprovalCandidate = {
    task_id: "owner_approval_status_only",
    status: "proposed",
    summary: "Equivalent approved display state from detail-style data.",
    promotable: true,
    auto_approval: { eligible: false },
    owner_approval: {
      required: true,
      status: "approved-only",
    },
    ineligible_reason: null,
  };
  const promotableCandidate = {
    task_id: "promotable_owner_approved",
    status: "approved",
    summary: "Fully approved candidate that is promotable.",
    promotable: true,
    auto_approval: { eligible: false },
    owner_approval: {
      required: true,
      approved: true,
    },
    ineligible_reason: null,
  };
  const candidates = [
    sharedGlossaryCandidate,
    approvalOnlyCandidate,
    statusOnlyApprovalCandidate,
    promotableCandidate,
  ];

  const packet = await buildDailyWorkPacket({
    repoRoot: "workspace_root",
    generatedAt: new Date("2026-06-05T00:00:00.000Z"),
    snapshot: {
      repo: { branch: "main" },
      projects: [],
      missions: { items: [] },
      gateway: { pending_monsters: { count: 0 } },
      diagnostics: { summary: { highest_severity: "ok" } },
      operation_board: {
        sections: {
          mission_board: { items: [] },
          action_queue: { items: [] },
        },
      },
    },
    latestContext: { open_threads: [] },
    devWorkerClaim: {
      selected: null,
      eligible_count: 0,
      scanned_count: 0,
    },
    devWorkerCandidates: {
      candidates,
      promotable_count: 3,
      auto_approvable_count: 0,
    },
  });

  const byTaskId = new Map(packet.dev_worker.candidates.map((candidate) => [candidate.task_id, candidate]));

  assert.equal(packet.summary.dev_worker_candidate_count, 4);
  assert.equal(packet.summary.dev_worker_promotable_candidate_count, 3);
  assert.equal(packet.summary.dev_worker_auto_approvable_candidate_count, 0);
  assert.equal(packet.dev_worker.candidate_count, 4);
  assert.equal(packet.dev_worker.promotable_candidate_count, 3);
  assert.equal(packet.dev_worker.auto_approvable_candidate_count, 0);
  assert.equal(
    byTaskId.get("shared_glossary_v0").owner_approval_state,
    "not-approved (needs owner approval; not promotable)",
  );
  assert.equal(
    byTaskId.get("owner_approved_still_proposed").owner_approval_state,
    "approved (promotable)",
  );
  assert.equal(
    byTaskId.get("owner_approval_status_only").owner_approval_state,
    "approved (promotable)",
  );
  assert.equal(byTaskId.get("promotable_owner_approved").owner_approval_state, "approved (promotable)");
  assert.equal(byTaskId.get("owner_approved_still_proposed").promotable, true);
  assert.equal(byTaskId.get("owner_approved_still_proposed").status, "proposed");
  assert.equal("promoted_to" in byTaskId.get("owner_approved_still_proposed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(approvalOnlyCandidate, "owner_approval_state"), false);

  const markdown = renderDailyWorkPacketMarkdown(packet);
  assert.match(
    markdown,
    /owner_approval_state `not-approved \(needs owner approval; not promotable\)` shared_glossary_v0/u,
  );
  assert.match(
    markdown,
    /owner_approval_state `approved \(promotable\)` owner_approved_still_proposed/u,
  );
  assert.doesNotMatch(markdown, /promoted_to/u);
});

test("renderDailyWorkPacketMarkdown includes mission and dev worker sections", () => {
  const markdown = renderDailyWorkPacketMarkdown({
    schema_version: "soulforge.daily_work_packet.v0",
    generated_at: "2026-05-16T00:00:00.000Z",
    repo_branch: "main",
    summary: {
      project_count: 1,
      mission_count: 1,
      blocked_or_active_mission_count: 1,
      pending_monster_count: 0,
      carry_forward_thread_count: 0,
      dev_worker_status: "task_available",
      dev_worker_candidate_count: 1,
      dev_worker_promotable_candidate_count: 1,
      dev_worker_auto_approvable_candidate_count: 1,
      diagnostics_status: "ok",
    },
    mission_work_queue: [
      {
        mission_id: "mission_1",
        title: "Mission One",
        status: "blocked",
        readiness_status: "blocked",
        display_group: "blocked",
        bottleneck_reason: "human_confirmation_required",
        intervention_budget: 1,
        suggested_next_action: "Ask one question.",
        stop_conditions: ["stop_a", "stop_b"],
        escalation_question: "Which one?",
      },
    ],
    carry_forward_threads: [],
    board_actions: [{ status: "next", summary: "Do this." }],
    dev_worker: {
      selected: {
        task_id: "task_1",
        suggested_branch: "codex/node-task",
        packet_ref: ".mission/mission_1/dev_worker_request.yaml",
      },
      candidates: [
        {
          task_id: "candidate_1",
          status: "approved",
          summary: "Promotable candidate.",
          promotable: false,
          auto_approval: {
            eligible: true,
          },
        },
      ],
    },
    owner_questions: ["Which one?"],
    notes: ["draft only"],
  });

  assert.match(markdown, /Mission Work Queue/u);
  assert.match(markdown, /Dev Worker Claim State/u);
  assert.match(markdown, /Dev Worker Candidate Queue/u);
  assert.match(markdown, /Auto-approvable candidates: 1/u);
  assert.match(markdown, /auto-approvable/u);
  assert.match(markdown, /codex\/node-task/u);
  assert.match(markdown, /candidate_1/u);
});
