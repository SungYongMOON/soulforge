// Compatibility crosswalk: current dev-erp-mcp tool surfaces → shared
// Engineering MCP v0 contract positions (plan 05 table, grounded against the
// actual registered tool names in ui-workspace/apps/dev-erp-mcp/src).
//
// Dispositions:
// - map: the current tool becomes a thin facade of the named contract tool in
//   a later leaf, keeping its current name for existing clients.
// - keep_legacy_facade: the current tool stays as-is; it must never be
//   relabeled as the richer contract tool until the named guard closes.
// - keep_source_query: bounded source read that stays outside the contract
//   namespaces on purpose (it is neither a context nor a task writer).
//
// The pinned current-tool lists are literal copies of the registered names in
// exactly three source files of ui-workspace/apps/dev-erp-mcp/src —
// tools.mjs (8 + 1 flagged), ingress_tools.mjs (6), and
// project_history_tools.mjs (2). The company-mail query surface
// (company_mail_tools.mjs, 3 tools) is deliberately OUT of this crosswalk: it
// is a separate mailbox-scoped stdio server outside the shared engineering
// interface, and mapping it here would misread a source query as a contract
// position. The validator suite fails when a pin and its crosswalk rows drift
// apart; a later integration leaf reconciles these pins against the live
// registries.

export const EXCLUDED_SURFACES = Object.freeze([
  Object.freeze({
    surface: "company_mail_tools.mjs",
    tools: Object.freeze(["company_mail_status", "company_mail_search", "company_mail_read"]),
    reason: "separate mailbox-scoped stdio query server; bounded source read outside the shared engineering interface",
  }),
]);

export const CURRENT_PERSONAL_ERP_TOOLS = Object.freeze([
  "erp_whoami",
  "erp_get_my_agenda",
  "erp_get_task_context",
  "erp_list_mail",
  "erp_get_mail_detail",
  "erp_list_task_artifacts",
  "erp_publish_work_session",
  "erp_prepare_artifact_upload",
  // feature-flagged ninth tool (ERP_MCP_REVIEW_TOOLS=1 + DEV_ERP_MCP_REVIEW_READ=1)
  "erp_list_pending_reviews",
]);

export const CURRENT_PROJECT_HISTORY_TOOLS = Object.freeze([
  "erp_get_project_history",
  "erp_prepare_project_history_download",
]);

export const CURRENT_INGRESS_TOOLS = Object.freeze([
  "ingress_whoami",
  "ingress_prepare_file_upload",
  "ingress_get_upload_status",
  "ingress_publish_work_event",
  "ingress_publish_run_receipt",
  "ingress_get_submission_status",
]);

export const COMPATIBILITY_ROWS = Object.freeze([
  Object.freeze({ current_tool: "erp_whoami", disposition: "map", target: "identity.get_effective_actor", guard: "none" }),
  Object.freeze({ current_tool: "erp_get_my_agenda", disposition: "map", target: "task.list_assigned", guard: "none" }),
  Object.freeze({
    current_tool: "erp_get_task_context",
    disposition: "keep_legacy_facade",
    target: "work.get_brief",
    guard: "exact assignment semantics (D28/D29 activation) must exist before this read is relabeled as a Work Brief",
  }),
  Object.freeze({ current_tool: "erp_list_mail", disposition: "keep_source_query", target: null, guard: "never an implicit context or task writer" }),
  Object.freeze({ current_tool: "erp_get_mail_detail", disposition: "keep_source_query", target: null, guard: "body is untrusted source material only" }),
  Object.freeze({ current_tool: "erp_list_task_artifacts", disposition: "map", target: "artifact.list_visible", guard: "no byte fallback" }),
  Object.freeze({
    current_tool: "erp_publish_work_session",
    disposition: "keep_legacy_facade",
    target: null,
    guard: "one-shot structured record; it is not work.start_session/append_checkpoint/closeout and must not be retro-read as one",
  }),
  Object.freeze({
    current_tool: "erp_prepare_artifact_upload",
    disposition: "map",
    target: "submission.prepare_upload",
    guard: "current service-owned inbox stays custody-only; promotion remains the separate D27 sole writer",
  }),
  Object.freeze({ current_tool: "erp_list_pending_reviews", disposition: "map", target: "review.list_pending", guard: "read-only and admin-gated; approval stays human cookie UI" }),
  Object.freeze({
    current_tool: "erp_get_project_history",
    disposition: "keep_legacy_facade",
    target: null,
    guard: "attested copied-history query over one explicit project/generation; never relabeled as a canonical input-bundle or accepted-history endpoint",
  }),
  Object.freeze({
    current_tool: "erp_prepare_project_history_download",
    disposition: "keep_legacy_facade",
    target: null,
    guard: "one-time copied CSV/XLSX ticket only; it is not bundle.prepare_download and must never masquerade as one",
  }),
  Object.freeze({ current_tool: "ingress_whoami", disposition: "map", target: "identity.get_effective_actor", guard: "ingress credential scope only" }),
  Object.freeze({ current_tool: "ingress_prepare_file_upload", disposition: "map", target: "submission.prepare_upload", guard: "HPP outbox custody only" }),
  Object.freeze({ current_tool: "ingress_get_upload_status", disposition: "map", target: "submission.get_upload_status", guard: "none" }),
  Object.freeze({
    current_tool: "ingress_publish_work_event",
    disposition: "keep_legacy_facade",
    target: null,
    guard: "bounded PC work event; not a WorkSession checkpoint until D28 session semantics exist",
  }),
  Object.freeze({
    current_tool: "ingress_publish_run_receipt",
    disposition: "keep_legacy_facade",
    target: null,
    guard: "run receipt publication; not agent.get_run_status truth and not a completion signal",
  }),
  Object.freeze({ current_tool: "ingress_get_submission_status", disposition: "map", target: "submission.get_custody_receipt", guard: "pending/verified server ack only; never promotion" }),
]);

// Contract positions with no current implementation at all. This is the honest
// build backlog for later leaves; a facade leaf may not silently claim one.
export const CONTRACT_GAPS = Object.freeze([
  "identity.get_device_policy",
  "identity.get_capabilities",
  "task.get_official",
  "task.get_assignment",
  "work.get_brief",
  "work.start_session",
  "work.append_checkpoint",
  "work.declare_blocker",
  "work.closeout",
  "work.propose_completion",
  "bundle.get_manifest",
  "bundle.prepare_download",
  "bundle.get_download_status",
  "artifact.get_revision_metadata",
  "artifact.get_candidate_status",
  "submission.finalize",
  "review.get_packet",
  "review.submit_review",
  "review.request_human_acceptance",
  "context.get_accepted_generation",
  "context.submit_candidate_feedback",
  "agent.get_assignment_binding",
  "agent.get_run_status",
  "ops.get_client_release_policy",
  "ops.get_health_projection",
  "ops.request_approved_action",
]);
