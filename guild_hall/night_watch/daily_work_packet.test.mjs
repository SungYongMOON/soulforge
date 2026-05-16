import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyWorkPacket, renderDailyWorkPacketMarkdown } from "./daily_work_packet.mjs";

test("buildDailyWorkPacket derives blocked mission items and owner questions", async () => {
  const packet = await buildDailyWorkPacket({
    repoRoot: "C:/Soulforge",
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
  });

  assert.equal(packet.summary.blocked_or_active_mission_count, 2);
  assert.equal(packet.mission_work_queue[0].bottleneck_reason, "missing_owner_boundary");
  assert.equal(packet.mission_work_queue[1].bottleneck_reason, "quality_review_needed");
  assert.equal(packet.owner_questions.length, 2);
  assert.equal(packet.summary.dev_worker_status, "no_task");
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
    },
    owner_questions: ["Which one?"],
    notes: ["draft only"],
  });

  assert.match(markdown, /Mission Work Queue/u);
  assert.match(markdown, /Dev Worker Claim State/u);
  assert.match(markdown, /codex\/node-task/u);
});
