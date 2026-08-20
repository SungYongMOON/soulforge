import { LINEAR_LB1_SNAPSHOT_SCHEMA_VERSION } from "./linear_lb1.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

export function makeCompleteLinearLb1Fixture() {
  return {
    schema_version: LINEAR_LB1_SNAPSHOT_SCHEMA_VERSION,
    snapshot_id: "synthetic-linear-lb1-001",
    collected_at: "2026-08-20T09:00:00.000Z",
    source_scope: {
      kind: "public_synthetic_fixture",
      workspace_id: "synthetic-workspace-001",
      team_id: "synthetic-team-001",
      project_id: "synthetic-project-001",
    },
    projects: [
      { project_id: "synthetic-project-001", updated_at: "2026-08-20T08:00:00.000Z" },
    ],
    assignees: [
      { assignee_id: "synthetic-assignee-001" },
    ],
    statuses: [
      { status_id: "status-open" },
      { status_id: "status-in-progress" },
      { status_id: "status-done" },
    ],
    issues: [
      {
        issue_id: "issue-001",
        project_id: "synthetic-project-001",
        assignee_id: "synthetic-assignee-001",
        status_id: "status-in-progress",
        created_at: "2026-08-19T09:00:00.000Z",
        updated_at: "2026-08-20T08:30:00.000Z",
        due_at: "2026-08-25T00:00:00.000Z",
        relations: [
          { relation_id: "relation-001", relation_type: "blocks", target_issue_id: "issue-002" },
        ],
        description_revision: {
          revision_id: "description-revision-001",
          content_sha256: A,
          updated_at: "2026-08-20T08:25:00.000Z",
        },
        comments: [
          {
            comment_id: "comment-001",
            revision_id: "comment-revision-001",
            content_sha256: B,
            created_at: "2026-08-20T08:10:00.000Z",
            updated_at: "2026-08-20T08:10:00.000Z",
          },
        ],
        state_history: [
          {
            history_id: "history-001",
            from_status_id: "status-open",
            to_status_id: "status-in-progress",
            occurred_at: "2026-08-20T08:20:00.000Z",
          },
        ],
        waiting_refs: [
          { ref_id: "waiting-ref-001", captured_at: "2026-08-20T08:21:00.000Z" },
        ],
        completion_refs: [
          { ref_id: "completion-ref-001", captured_at: "2026-08-20T08:22:00.000Z" },
        ],
        evidence_refs: [
          { ref_id: "evidence-ref-001", captured_at: "2026-08-20T08:23:00.000Z" },
        ],
      },
      {
        issue_id: "issue-002",
        project_id: "synthetic-project-001",
        assignee_id: "synthetic-assignee-001",
        status_id: "status-open",
        created_at: "2026-08-20T07:00:00.000Z",
        updated_at: "2026-08-20T08:00:00.000Z",
        due_at: null,
        relations: [],
        description_revision: {
          revision_id: "description-revision-002",
          content_sha256: C,
          updated_at: "2026-08-20T08:00:00.000Z",
        },
        comments: [],
        state_history: [],
        waiting_refs: [],
        completion_refs: [],
        evidence_refs: [
          { ref_id: "evidence-ref-002", captured_at: "2026-08-20T08:00:00.000Z" },
        ],
      },
    ],
  };
}

export function makeCommentChangedLinearLb1Fixture() {
  const fixture = makeCompleteLinearLb1Fixture();
  fixture.issues[0].comments[0].content_sha256 = D;
  return fixture;
}
