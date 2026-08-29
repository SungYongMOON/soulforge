// Soulforge shared Engineering MCP — v0 CONTRACT (data, not a server).
//
// This module declares the provider-neutral control-interface contract from
// the Team Member Engineering Program plan (05_ENGINEERING_MCP_CLIENT_DATA_PLANE).
// It registers no MCP server, opens no socket, and grants no authority. The
// contract is the single typed source for later facade/adapter leaves and for
// the adversarial validator suite beside it.
//
// Authority model (fixed by the plan):
// - MCP is a control interface only: not a queue, truth owner, approval
//   authority, binary store, or agent runtime.
// - Binary bytes travel only on the separately authenticated HTTPS data plane.
// - Every mutating request carries an idempotency key and returns an opaque
//   receipt reference. A proposal or closeout is never Official Done.
// - Denied or foreign objects answer with one uniform code and no existence
//   detail.

export const ENGINEERING_MCP_CONTRACT_SCHEMA = "soulforge.engineering_mcp_contract.v0";

export const UNIFORM_DENIAL_CODE = "not_available";

// Field names that must never appear in any request or response schema of this
// interface. This is a named-exclusion lint over the plan's exclusion list —
// it keeps the known byte/transcript/secret spellings out of the contract and
// out of candidate tool descriptions; it is not a semantic proof, and the
// per-tool review gate stays responsible for creative renames.
export const FORBIDDEN_FIELD_NAMES = Object.freeze([
  "bytes",
  "base64",
  "content_base64",
  "file_bytes",
  "raw_body",
  "transcript",
  "raw_prompt",
  "hidden_reasoning",
  "screen_capture",
  "keystrokes",
  "password",
  "secret",
  "token_value",
  "cookie",
  "private_key",
]);

const read = (name, summary, request, response, ceiling) => Object.freeze({
  name,
  kind: "read",
  summary,
  request_fields: Object.freeze(request),
  response_fields: Object.freeze(response),
  requires_idempotency_key: false,
  authority_ceiling: ceiling,
});

const mutate = (name, summary, request, response, ceiling) => Object.freeze({
  name,
  kind: "mutate",
  summary,
  request_fields: Object.freeze([...request, "idempotency_key"]),
  response_fields: Object.freeze([...response, "receipt_ref"]),
  requires_idempotency_key: true,
  authority_ceiling: ceiling,
});

// Namespace → minimum v0 tools. Field lists are typed metadata names only;
// exact JSON Schemas harden per-tool in the facade leaf that first serves them.
export const ENGINEERING_MCP_NAMESPACES = Object.freeze([
  Object.freeze({
    namespace: "identity",
    authority_ceiling: "Read the effective grant only; never issues or widens a credential.",
    tools: Object.freeze([
      read("identity.get_effective_actor", "Effective account/device/agent actor chain and expiry.",
        [], ["actor_ref", "device_ref", "agent_ref", "project_scopes", "expires_at", "policy_revision"],
        "No credential issuance; reflection of the already-granted intersection only."),
      read("identity.get_device_policy", "Device posture and allowed client release range.",
        [], ["device_ref", "release_range", "posture_state"],
        "Read-only policy reflection."),
      read("identity.get_capabilities", "Capability discovery for this actor and interface version.",
        [], ["interface_version", "capabilities"],
        "Discovery only; capability names are not grants."),
    ]),
  }),
  Object.freeze({
    namespace: "task",
    authority_ceiling: "Official Task truth remains the current external SoR (Linear); no completion or status mutation exists on this interface.",
    tools: Object.freeze([
      read("task.get_official", "One official task reference by exact external ref.",
        ["task_ref"], ["task_ref", "status", "assignee_ref", "priority", "due", "source_system"],
        "Typed external reference; never a second task history."),
      read("task.get_assignment", "One assignment with epoch and expiry.",
        ["assignment_id"], ["assignment_id", "assignment_epoch", "task_ref", "actor_ref", "expires_at"],
        "Assignment reflection; claiming happens through the assignment authority, not here."),
      read("task.list_assigned", "Bounded list of the caller's assignments.",
        ["limit", "cursor"], ["assignments", "next_cursor"],
        "Caller-scoped list only; no foreign-actor enumeration."),
    ]),
  }),
  Object.freeze({
    namespace: "work",
    authority_ceiling: "WorkSession lifecycle; a closeout or completion proposal is never Official Done and never mutates the task SoR.",
    tools: Object.freeze([
      read("work.get_brief", "The immutable Work Brief for one assignment.",
        ["assignment_id"], ["work_brief_ref", "task_ref", "input_bundle_manifest_digest", "expires_at"],
        "Issued brief reflection; a missing binding returns HOLD, never a guessed brief."),
      mutate("work.start_session", "Bind one active primary WorkSession to an assignment epoch.",
        ["assignment_id", "assignment_epoch", "thread_ref_digest"], ["session_ref"],
        "One active primary per approved cardinality (D28 design default)."),
      mutate("work.append_checkpoint", "Append one ordered bounded checkpoint.",
        ["session_ref", "sequence", "summary", "evidence_refs"], ["accepted_sequence"],
        "Append-only; conflicting sequence holds, replay of identical frames is idempotent."),
      mutate("work.declare_blocker", "Record a blocker with a reason code.",
        ["session_ref", "reason_code", "dependency_ref"], ["blocker_ref"],
        "Visibility only; never auto-creates a task."),
      mutate("work.closeout", "Terminal closeout of one session.",
        ["session_ref", "closeout_kind", "outcome_summary", "result_refs"], ["closeout_ref"],
        "Closeout is not Official Done and not human acceptance."),
      mutate("work.propose_completion", "Propose completion for review by the authorized path.",
        ["session_ref", "task_ref", "revision_refs", "evidence_refs"], ["proposal_ref"],
        "A proposal only; the authorized task/acceptance path decides."),
    ]),
  }),
  Object.freeze({
    namespace: "bundle",
    authority_ceiling: "Exact accepted revision/baseline material only; no latest, raw, or cross-project fallback exists.",
    tools: Object.freeze([
      read("bundle.get_manifest", "The immutable input-bundle manifest for one assignment.",
        ["assignment_id", "manifest_revision"], ["bundle_id", "manifest_revision", "manifest_digest", "entries"],
        "Exact revision pin required; there is no default and no latest mode."),
      mutate("bundle.prepare_download", "One-time audience-bound tickets for exact manifest objects.",
        ["bundle_id", "manifest_digest", "object_selection"], ["tickets", "expires_at"],
        "Tickets bind actor chain, digest, and range; a URL alone is never authority."),
      read("bundle.get_download_status", "Status of a prepared download.",
        ["receipt_ref"], ["state", "verified_objects"],
        "Status reflection only."),
    ]),
  }),
  Object.freeze({
    namespace: "artifact",
    authority_ceiling: "Metadata only; existence/ACL denial is uniform and fail-closed.",
    tools: Object.freeze([
      read("artifact.list_visible", "Safe descriptors visible to this actor for one task.",
        ["task_ref", "limit", "cursor"], ["artifacts", "next_cursor"],
        "No byte fallback; host paths never appear."),
      read("artifact.get_revision_metadata", "Metadata of one exact artifact revision.",
        ["artifact_revision_id"], ["logical_artifact_id", "parent_revision_ids", "content_id", "manifest_digest", "acceptance_state"],
        "A revision id is evidence, not acceptance."),
      read("artifact.get_candidate_status", "Candidate/review status of one submission.",
        ["submission_id"], ["state", "review_refs"],
        "Status reflection; review records stay with the review namespace."),
    ]),
  }),
  Object.freeze({
    namespace: "submission",
    authority_ceiling: "Custody only; a finalized upload is never promotion, revision acceptance, or task consequence.",
    tools: Object.freeze([
      mutate("submission.prepare_upload", "Ticket for an authenticated data-plane upload.",
        ["assignment_id", "filename", "size", "sha256"], ["ticket_ref", "expires_at"],
        "Bytes travel only on the data plane; MCP JSON never carries them."),
      read("submission.get_upload_status", "Status of one prepared or finalized upload.",
        ["ticket_ref"], ["state", "custody_receipt_ref"],
        "Status reflection only."),
      mutate("submission.finalize", "Integrity finalize of a completed transfer.",
        ["ticket_ref", "declared_sha256", "declared_size"], ["custody_receipt_ref", "quarantine_state"],
        "Produces a custody receipt only; the promoter is a separate sole writer (D27 design default)."),
      read("submission.get_custody_receipt", "One custody receipt by reference.",
        ["custody_receipt_ref"], ["state", "quarantine_state", "scan_class"],
        "Scan class is classification, not ACL, binding, or acceptance."),
    ]),
  }),
  Object.freeze({
    namespace: "review",
    authority_ceiling: "Review records only; final acceptance stays with the human authority.",
    tools: Object.freeze([
      read("review.list_pending", "Bounded pending review packets for an authorized reviewer.",
        ["limit", "cursor"], ["packets", "next_cursor"],
        "Reviewer-scoped list; no foreign project detail."),
      read("review.get_packet", "One review packet with provenance references.",
        ["packet_ref"], ["candidate_refs", "evidence_refs", "parent_head_state"],
        "References only; no raw foreign material."),
      mutate("review.submit_review", "Record ACCEPT/REVISE/HOLD as a review record.",
        ["packet_ref", "verdict", "findings_refs"], ["review_ref"],
        "A review record never silently changes a task or baseline."),
      mutate("review.request_human_acceptance", "Route a reviewed candidate to the human acceptance authority.",
        ["packet_ref", "review_ref"], ["request_ref"],
        "A request is not acceptance."),
    ]),
  }),
  Object.freeze({
    namespace: "context",
    authority_ceiling: "Accepted-generation queries only under the D36 owner; no implicit project or common fallback exists.",
    tools: Object.freeze([
      read("context.get_accepted_generation", "The exact accepted context generation for one explicit scope.",
        ["project_ref", "generation_ref"], ["generation_ref", "manifest_digest", "accepted_at"],
        "Explicit project plus approved common revisions only (D29 design default)."),
      mutate("context.submit_candidate_feedback", "Submit one bounded context feedback candidate.",
        ["generation_ref", "candidate_kind", "candidate_ref"], ["feedback_ref"],
        "Candidate ledger append only; never a context writer."),
    ]),
  }),
  Object.freeze({
    namespace: "agent",
    authority_ceiling: "Guild query/proposal surface only; no Agent Mark or deployment mutation exists on generic client tools.",
    tools: Object.freeze([
      read("agent.get_assignment_binding", "The approved deployment binding for one assignment, when one exists.",
        ["assignment_id"], ["deployment_ref", "mark_ref", "binding_state"],
        "Binding reflection only."),
      read("agent.get_run_status", "Bounded status of one agent run.",
        ["run_ref"], ["state", "receipt_refs"],
        "Aggregate status; no transcript, memory, or hidden reasoning."),
    ]),
  }),
  Object.freeze({
    namespace: "ops",
    authority_ceiling: "A request is not an execution; Watch stays read/approval-request and Bastion validates and executes separately.",
    tools: Object.freeze([
      read("ops.get_client_release_policy", "Supported client release range and rollback target.",
        [], ["release_range", "rollback_target"],
        "Policy reflection only."),
      read("ops.get_health_projection", "Coarse typed health projection for permitted scopes.",
        ["scope"], ["panels"],
        "Aggregate states only; missing evidence is unknown, not green."),
      mutate("ops.request_approved_action", "File an action request for separately authorized execution.",
        ["action_kind", "target_ref", "policy_ref", "expires_at"], ["request_ref"],
        "Bastion validates and executes under its own authority; this call changes nothing."),
    ]),
  }),
]);

export function listContractTools() {
  return ENGINEERING_MCP_NAMESPACES.flatMap((entry) => entry.tools.map((tool) => tool));
}

export function getContractTool(name) {
  return listContractTools().find((tool) => tool.name === name) ?? null;
}
