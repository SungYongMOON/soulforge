import { createHash } from "node:crypto";
import { LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION } from "./linear_lb1_v2.mjs";

export function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function makeCompleteLinearLb1V2Fixture() {
  const windowsSpecPath = `C:${"\\"}${["Users", "user", "repo", "spec.md"].join("\\")}`;
  const windowsLogPath = `C:${"\\"}${["data", "logs", "build.log"].join("\\")}`;
  const windowsFileUrl = `file:${"///"}${["C:", "Users", "user", "repo", "spec.md"].join("/")}`;
  const workspaceFileUrl = `file:${"///"}${["workspace", "ref"].join("/")}`;
  const logFileUrl = `file:${"///"}${["var", "log", "syslog"].join("/")}`;
  const descBody1 = `# Synthetic Issue 101 Description\n\nFull bounded markdown description body with evidence refs.\nWindows path: ${windowsSpecPath}\nFile URL: ${windowsFileUrl}\nSecret-shaped text: Bearer synthetic_token_sample_12345\nPassword-like: password=synthetic_dummy_pass`;
  const descBody2 = `# Synthetic Issue 102 Description\n\nFull bounded markdown description body for dependent issue.\nIncludes newlines and symbols: [Link](${workspaceFileUrl}).`;
  const commentBody1 = `Synthetic comment 001 body text on issue 101.\nPath note: ${windowsLogPath}\nAPI key text: api_key=synthetic_sample_key_12345`;
  const commentBody2 = `Synthetic comment 002 reply body text on issue 101.\nLine 2 details with ${logFileUrl}.`;

  return {
    schema_version: LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION,
    snapshot_id: "synthetic-linear-lb1-v2-001",
    collected_at: "2026-08-20T09:00:00.000Z",
    source_scope: {
      kind: "public_synthetic_fixture",
      workspace_id: "synthetic-workspace-001",
      scope_mode: "entire_workspace",
      team_ids: [],
      project_ids: [],
    },
    teams: [
      {
        team_id: "synthetic-team-001",
        name: "Engineering",
        key: "ENG",
        updated_at: "2026-08-20T08:00:00.000Z",
      },
    ],
    projects: [
      {
        project_id: "synthetic-project-001",
        name: "Core Platform",
        team_id: "synthetic-team-001",
        updated_at: "2026-08-20T08:00:00.000Z",
      },
    ],
    assignees: [
      {
        assignee_id: "synthetic-assignee-001",
        name: "Alice Engineer",
        email: "alice@example.com",
        updated_at: "2026-08-20T08:00:00.000Z",
      },
      {
        assignee_id: "synthetic-assignee-002",
        name: "Bob Reviewer",
        email: "bob@example.com",
        updated_at: "2026-08-20T08:00:00.000Z",
      },
    ],
    statuses: [
      {
        status_id: "status-open",
        name: "Triage",
        type: "triage",
        team_id: "synthetic-team-001",
      },
      {
        status_id: "status-in-progress",
        name: "In Progress",
        type: "started",
        team_id: "synthetic-team-001",
      },
      {
        status_id: "status-done",
        name: "Done",
        type: "completed",
        team_id: "synthetic-team-001",
      },
      {
        status_id: "status-canceled",
        name: "Canceled",
        type: "canceled",
        team_id: "synthetic-team-001",
      },
    ],
    cutoff: {
      cutoff_at: "2026-08-20T09:00:00.000Z",
      page_count: 1,
      total_issues: 2,
      pagination_complete: true,
    },
    issues: [
      {
        issue_id: "issue-001",
        human_id: "ENG-101",
        title: "Implement LB1 V2 Snapshot Architecture",
        priority: 1,
        team_id: "synthetic-team-001",
        project_id: "synthetic-project-001",
        assignee_id: "synthetic-assignee-001",
        status_id: "status-in-progress",
        parent_issue_id: null,
        created_at: "2026-08-19T09:00:00.000Z",
        updated_at: "2026-08-20T08:30:00.000Z",
        started_at: "2026-08-20T08:00:00.000Z",
        completed_at: null,
        canceled_at: null,
        archived_at: null,
        due_at: "2026-08-25T00:00:00.000Z",
        tombstone: null,
        relations: [
          {
            relation_id: "relation-001",
            relation_type: "blocks",
            target_issue_id: "issue-002",
          },
        ],
        description: {
          revision_id: "desc-rev-001",
          body: descBody1,
          content_sha256: sha256Text(descBody1),
          updated_at: "2026-08-20T08:25:00.000Z",
          author_id: "synthetic-assignee-001",
          tombstone: null,
        },
        comments: [
          {
            comment_id: "comment-001",
            revision_id: "comment-rev-002",
            body: commentBody1,
            content_sha256: sha256Text(commentBody1),
            author_id: "synthetic-assignee-001",
            parent_comment_id: null,
            created_at: "2026-08-20T08:10:00.000Z",
            edited_at: null,
            updated_at: "2026-08-20T08:10:00.000Z",
            archived_at: null,
            resolved_at: null,
            tombstone: null,
          },
          {
            comment_id: "comment-002",
            revision_id: "comment-rev-003",
            body: commentBody2,
            content_sha256: sha256Text(commentBody2),
            author_id: "synthetic-assignee-002",
            parent_comment_id: "comment-001",
            created_at: "2026-08-20T08:15:00.000Z",
            edited_at: null,
            updated_at: "2026-08-20T08:15:00.000Z",
            archived_at: null,
            resolved_at: null,
            tombstone: null,
          },
        ],
        state_history: [
          {
            history_id: "state-hist-001",
            from_status_id: "status-open",
            to_status_id: "status-in-progress",
            actor_id: "synthetic-assignee-001",
            occurred_at: "2026-08-20T08:20:00.000Z",
          },
        ],
        assignee_history: [
          {
            history_id: "assignee-hist-001",
            from_assignee_id: null,
            to_assignee_id: "synthetic-assignee-001",
            actor_id: "synthetic-assignee-001",
            occurred_at: "2026-08-19T09:05:00.000Z",
          },
        ],
        project_history: [
          {
            history_id: "proj-hist-001",
            from_project_id: null,
            to_project_id: "synthetic-project-001",
            actor_id: "synthetic-assignee-001",
            occurred_at: "2026-08-19T09:06:00.000Z",
          },
        ],
        due_history: [
          {
            history_id: "due-hist-001",
            from_due_at: null,
            to_due_at: "2026-08-25T00:00:00.000Z",
            actor_id: "synthetic-assignee-001",
            occurred_at: "2026-08-19T09:10:00.000Z",
          },
        ],
        waiting_info: [
          {
            ref_id: "waiting-ref-001",
            reason: "Waiting on design review signoff",
            required_input: "Design token specifications",
            next_action_owner_id: "synthetic-assignee-002",
            due_at: "2026-08-22T00:00:00.000Z",
            reply_due_at: "2026-08-21T18:00:00.000Z",
            manager_decision_required: false,
            captured_at: "2026-08-20T08:21:00.000Z",
          },
        ],
        completion_records: [
          {
            ref_id: "completion-ref-001",
            executor_succeeded_at: "2026-08-20T08:22:00.000Z",
            business_completed_at: "2026-08-20T08:22:30.000Z",
            official_task_done_at: "2026-08-20T08:23:00.000Z",
            completion_criteria_met: true,
            result: "Synthetic success verified and attested",
            evidence_refs: ["evidence-ref-001"],
            captured_at: "2026-08-20T08:23:10.000Z",
          },
        ],
        evidence_refs: [
          {
            ref_id: "evidence-ref-001",
            uri: "https://linear.app/soulforge/issue/ENG-101#evidence-001",
            kind: "test_report",
            title: "Synthetic LB1 Integration Evidence",
            mime_type: "text/plain",
            size: 512,
            content_sha256: sha256Text("Synthetic Evidence Content ENG-101"),
            captured_at: "2026-08-20T08:23:00.000Z",
            availability: "available",
          },
        ],
      },
      {
        issue_id: "issue-002",
        human_id: "ENG-102",
        title: "Dependent LB1 Integration Task",
        priority: 2,
        team_id: "synthetic-team-001",
        project_id: "synthetic-project-001",
        assignee_id: null,
        status_id: "status-open",
        parent_issue_id: "issue-001",
        created_at: "2026-08-20T07:00:00.000Z",
        updated_at: "2026-08-20T08:00:00.000Z",
        started_at: null,
        completed_at: null,
        canceled_at: null,
        archived_at: null,
        due_at: null,
        tombstone: null,
        relations: [],
        description: {
          revision_id: "desc-rev-002",
          body: descBody2,
          content_sha256: sha256Text(descBody2),
          updated_at: "2026-08-20T08:00:00.000Z",
          author_id: "synthetic-assignee-001",
          tombstone: null,
        },
        comments: [],
        state_history: [],
        assignee_history: [],
        project_history: [],
        due_history: [],
        waiting_info: [],
        completion_records: [],
        evidence_refs: [
          {
            ref_id: "evidence-ref-002",
            uri: "https://linear.app/soulforge/issue/ENG-102#evidence-002",
            kind: "test_report",
            title: "Synthetic LB1 Dependent Evidence",
            mime_type: "text/plain",
            size: 256,
            content_sha256: sha256Text("Synthetic Evidence Content ENG-102"),
            captured_at: "2026-08-20T08:00:00.000Z",
            availability: "available",
          },
        ],
      },
    ],
  };
}

export function makeCommentChangedLinearLb1V2Fixture() {
  const fixture = makeCompleteLinearLb1V2Fixture();
  const changedPath = `C:${"\\"}${["changed", "log.txt"].join("\\")}`;
  const changedCommentBody = `Modified comment text with path ${changedPath} that alters body and hash.`;
  fixture.issues[0].comments[0].body = changedCommentBody;
  fixture.issues[0].comments[0].content_sha256 = sha256Text(changedCommentBody);
  return fixture;
}

export function makeDescriptionChangedLinearLb1V2Fixture() {
  const fixture = makeCompleteLinearLb1V2Fixture();
  const changedDescBody = "# Modified Description Header\n\nAltered body text with secret ghp_changedfakekey12345.";
  fixture.issues[0].description.body = changedDescBody;
  fixture.issues[0].description.content_sha256 = sha256Text(changedDescBody);
  return fixture;
}
