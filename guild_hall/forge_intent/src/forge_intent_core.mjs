// Forge work-generation seam — pure in-memory core (program plan 04).
//
// This module pins the Forge state machine BETWEEN engineering judgment and
// the external Official Task writer: Work Candidate -> TaskIntent (immutable
// digest) -> approval record -> official task registration through an
// injected writer PORT -> assignment -> issued Work Brief. It owns no source
// truth, no Official Task status, no artifact acceptance, and no external
// action: the writer port is supplied by the caller, and in this repository
// only synthetic adapters exist; binding a real Linear writer is a separately
// gated leaf.
//
// Design defaults honored (program ledger 2026-08-30): accepted context is a
// caller-asserted exact reference (no fallback), proposals carry exactly one
// primary role, and nothing here can mark work complete.

import { createHash } from "node:crypto";

export const FORGE_INTENT_SCHEMA = "soulforge.forge_intent_core.v0";

export const HOLDS = Object.freeze({
  INPUT_UNAVAILABLE: "HOLD_INPUT_UNAVAILABLE",
  STALE_TASK_INTENT: "HOLD_STALE_TASK_INTENT",
  APPROVAL_REQUIRED: "HOLD_APPROVAL_REQUIRED",
  BRIEF_INCOMPLETE: "HOLD_BRIEF_INCOMPLETE",
  ASSIGNMENT_REQUIRED: "HOLD_ASSIGNMENT_REQUIRED",
  STALE_DRAFT: "HOLD_STALE_DRAFT",
});

// The eight critical Work Brief bindings (plan 04). A draft may leave any of
// them empty — visibly — but nothing issues while one is missing.
export const BRIEF_CRITICAL_FIELDS = Object.freeze([
  "problem", "requested_outcome", "allowed_write_scope", "required_evidence",
  "stop_conditions", "escalation_path", "input_bundle_manifest_digest", "required_review_role",
]);

const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;
const HEX64 = /^[a-f0-9]{64}$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value)) fail("ref_invalid", field);
  return value;
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !HEX64.test(value)) fail("digest_invalid", field);
  return value;
}

function assertText(value, field, max = 4000) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail("text_invalid", field);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function frozen(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function intentDigest(intentBody) {
  return createHash("sha256").update(canonical(intentBody), "utf8").digest("hex");
}

export function createForgeIntentCore({ taskWriter } = {}) {
  if (!taskWriter || typeof taskWriter.createOfficialTask !== "function") {
    fail("task_writer_port_required");
  }
  const candidates = new Map();
  const intents = new Map();
  const approvals = new Map();   // intent_id -> approval record
  const tasks = new Map();       // intent_id -> { task_ref, writer_ref }
  const assignments = new Map(); // assignment_id -> assignment record
  const briefs = new Map();      // brief_id -> issued brief record
  const briefByAssignment = new Map(); // assignment_id -> brief_id (exactly one issued brief)
  const briefDrafts = new Map(); // assignment_id -> [draft records, oldest first]
  const draftIndex = new Map();  // draft_ref -> draft record
  const events = [];

  function append(kind, payload) {
    events.push(frozen({ seq: events.length + 1, kind, ...payload }));
  }

  function isPresent(value) {
    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
  }

  // Validates one PRESENT critical field. This is the ONE validation source
  // for both the draft path and the issued-brief builder, so a draft can
  // never hold junk that would later "issue fine" — and a wrong TYPE (a
  // string where a list belongs) fails with a coded error, never a raw
  // TypeError.
  function validateCriticalField(field, value) {
    switch (field) {
      case "problem":
      case "requested_outcome":
        return assertText(value, field);
      case "allowed_write_scope":
        if (!Array.isArray(value)) fail("text_invalid", field);
        return value.map((entry, index) => assertText(entry, `${field}[${index}]`, 500));
      case "required_evidence":
      case "stop_conditions":
        if (!Array.isArray(value)) fail("text_invalid", field);
        return value.map((entry, index) => assertText(entry, `${field}[${index}]`, 1000));
      case "escalation_path":
        return assertText(value, field, 500);
      case "required_review_role":
        return assertRef(value, field);
      case "input_bundle_manifest_digest":
        return assertDigest(value, field);
      default:
        return fail("critical_field_unknown", field);
    }
  }

  // Shared issued-brief builder: the single place an issued Work Brief record
  // comes into existence, for both the direct path and the draft path.
  function buildIssuedBrief(briefId, assignment, critical, sourceDraftRef) {
    if (briefs.has(briefId)) fail("brief_duplicate", briefId);
    if (briefByAssignment.has(assignment.assignment_id)) {
      fail("assignment_brief_exists", assignment.assignment_id);
    }
    const validated = {};
    for (const field of BRIEF_CRITICAL_FIELDS) {
      validated[field] = validateCriticalField(field, critical[field]);
    }
    const record = frozen({
      brief_id: briefId,
      assignment_id: assignment.assignment_id,
      task_ref: assignment.task_ref,
      intent_id: assignment.intent_id,
      primary_role: assignment.primary_role,
      ...validated,
      source_draft_ref: sourceDraftRef ?? null,
      expires_at: assignment.expires_at,
    });
    briefs.set(briefId, record);
    briefByAssignment.set(assignment.assignment_id, briefId);
    append("work_brief_issued", { brief_id: briefId, assignment_id: assignment.assignment_id });
    return record;
  }

  return Object.freeze({
    schema: FORGE_INTENT_SCHEMA,

    // Forge candidate: interpretation of accepted facts. Requires an exact
    // accepted-context reference; nothing is synthesized when it is missing.
    createWorkCandidate(input) {
      const id = assertRef(input?.candidate_id, "candidate_id");
      if (candidates.has(id)) fail("candidate_duplicate", id);
      if (typeof input.accepted_context_ref !== "string" || input.accepted_context_ref.length === 0) {
        fail(HOLDS.INPUT_UNAVAILABLE, "accepted_context_ref");
      }
      const record = frozen({
        candidate_id: id,
        accepted_context_ref: assertRef(input.accepted_context_ref, "accepted_context_ref"),
        engine_finding_refs: (Array.isArray(input.engine_finding_refs) && input.engine_finding_refs.length > 0
          ? input.engine_finding_refs.map((ref, index) => assertRef(ref, `engine_finding_refs[${index}]`))
          : fail(HOLDS.INPUT_UNAVAILABLE, "engine_finding_refs")),
        rationale: assertText(input.rationale, "rationale"),
        confidence: ["low", "medium", "high"].includes(input.confidence)
          ? input.confidence : fail("confidence_invalid", input.confidence),
        stop_conditions: (Array.isArray(input.stop_conditions) ? input.stop_conditions : [])
          .map((entry, index) => assertText(entry, `stop_conditions[${index}]`, 1000)),
      });
      candidates.set(id, record);
      append("work_candidate_created", { candidate_id: id });
      return record;
    },

    // TaskIntent: an immutable digest over the exact requested change and the
    // expected prior task state. Applying it is the writer's business, later.
    createTaskIntent(input) {
      const id = assertRef(input?.intent_id, "intent_id");
      if (intents.has(id)) fail("intent_duplicate", id);
      const candidate = candidates.get(assertRef(input.candidate_id, "candidate_id"));
      if (!candidate) fail(HOLDS.INPUT_UNAVAILABLE, "candidate_id");
      const body = {
        candidate_id: candidate.candidate_id,
        accepted_context_ref: candidate.accepted_context_ref,
        requested_change: assertText(input.requested_change, "requested_change"),
        expected_prior_state: assertText(input.expected_prior_state, "expected_prior_state", 1000),
      };
      const record = frozen({ intent_id: id, ...body, intent_digest: intentDigest(body) });
      intents.set(id, record);
      append("task_intent_created", { intent_id: id, intent_digest: record.intent_digest });
      return record;
    },

    // Human/exact-policy approval record. A rejection or hold is preserved and
    // permanently blocks that intent; approval never applies the task itself.
    recordApproval(input) {
      const intent = intents.get(assertRef(input?.intent_id, "intent_id"));
      if (!intent) fail(HOLDS.INPUT_UNAVAILABLE, "intent_id");
      if (approvals.has(intent.intent_id)) fail("approval_duplicate", intent.intent_id);
      if (!["approve", "reject", "hold"].includes(input.decision)) fail("decision_invalid", input.decision);
      if (assertDigest(input.intent_digest, "intent_digest") !== intent.intent_digest) {
        fail(HOLDS.STALE_TASK_INTENT, "digest_mismatch");
      }
      const record = frozen({
        approval_ref: assertRef(input.approval_ref, "approval_ref"),
        intent_id: intent.intent_id,
        authority_ref: assertRef(input.authority_ref, "authority_ref"),
        decision: input.decision,
      });
      approvals.set(intent.intent_id, record);
      append("approval_recorded", { intent_id: intent.intent_id, decision: input.decision });
      return record;
    },

    // Official task registration: allowed only for an approved, digest-fresh
    // intent, and only through the injected writer port. The returned task_ref
    // is a typed external reference — never a second task history.
    async registerOfficialTask(input) {
      const intent = intents.get(assertRef(input?.intent_id, "intent_id"));
      if (!intent) fail(HOLDS.INPUT_UNAVAILABLE, "intent_id");
      const approval = approvals.get(intent.intent_id);
      if (!approval || approval.decision !== "approve") fail(HOLDS.APPROVAL_REQUIRED, intent.intent_id);
      // The digest gate runs before the replay return: a caller holding a
      // stale worldview is told so instead of silently reading back a task.
      if (assertDigest(input.intent_digest, "intent_digest") !== intent.intent_digest) {
        fail(HOLDS.STALE_TASK_INTENT, "digest_mismatch");
      }
      if (tasks.has(intent.intent_id)) {
        // Idempotent: an approved intent maps to exactly one official task.
        return frozen({ replay: true, ...tasks.get(intent.intent_id) });
      }
      const written = await taskWriter.createOfficialTask({
        intent_id: intent.intent_id,
        intent_digest: intent.intent_digest,
        requested_change: intent.requested_change,
        expected_prior_state: intent.expected_prior_state,
      });
      const taskRef = assertRef(written?.task_ref, "writer.task_ref");
      const record = frozen({ task_ref: taskRef, writer_ref: assertRef(written.writer_ref, "writer.writer_ref"), intent_id: intent.intent_id });
      tasks.set(intent.intent_id, record);
      append("official_task_registered", { intent_id: intent.intent_id, task_ref: taskRef });
      return record;
    },

    // Assignment: the assignment authority binds one actor to the official
    // task under an epoch and expiry. Forge itself never picks the person.
    createAssignment(input) {
      const id = assertRef(input?.assignment_id, "assignment_id");
      if (assignments.has(id)) fail("assignment_duplicate", id);
      const intentId = assertRef(input.intent_id, "intent_id");
      const task = tasks.get(intentId);
      if (!task) fail(HOLDS.ASSIGNMENT_REQUIRED, "official_task_missing");
      const record = frozen({
        assignment_id: id,
        task_ref: task.task_ref,
        intent_id: intentId,
        primary_role: assertRef(input.primary_role, "primary_role"),
        actor_ref: assertRef(input.actor_ref, "actor_ref"),
        authority_ref: assertRef(input.authority_ref, "authority_ref"),
        assignment_epoch: Number.isSafeInteger(input.assignment_epoch) && input.assignment_epoch > 0
          ? input.assignment_epoch : fail("epoch_invalid", "assignment_epoch"),
        expires_at: assertText(input.expires_at, "expires_at", 40),
      });
      assignments.set(id, record);
      append("assignment_created", { assignment_id: id, task_ref: task.task_ref });
      return record;
    },

    // Work Brief: bounded, never free-form. Every critical binding must be
    // present or the brief is not issued and the caller sees a HOLD.
    issueWorkBrief(input) {
      const id = assertRef(input?.brief_id, "brief_id");
      if (briefs.has(id)) fail("brief_duplicate", id);
      const assignment = assignments.get(assertRef(input.assignment_id, "assignment_id"));
      if (!assignment) fail(HOLDS.ASSIGNMENT_REQUIRED, input.assignment_id);
      if (briefByAssignment.has(assignment.assignment_id)) {
        fail("assignment_brief_exists", assignment.assignment_id);
      }
      const critical = {
        problem: input.problem,
        requested_outcome: input.requested_outcome,
        allowed_write_scope: input.allowed_write_scope,
        required_evidence: input.required_evidence,
        stop_conditions: input.stop_conditions,
        escalation_path: input.escalation_path,
        input_bundle_manifest_digest: input.input_bundle_manifest_digest,
        required_review_role: input.required_review_role,
      };
      for (const [field, value] of Object.entries(critical)) {
        const present = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
        if (!present) fail(HOLDS.BRIEF_INCOMPLETE, field);
      }
      if (!/^[a-f0-9]{64}$/.test(input.input_bundle_manifest_digest)) fail("manifest_digest_invalid", "input_bundle_manifest_digest");
      return buildIssuedBrief(id, assignment, critical, null);
    },

    // Work Brief DRAFT: an immutable pre-issuance revision whose GAPS are
    // visible data. A draft is never ISSUABLE material — it can never appear
    // on the issued-brief surface; issuance is the only path to one.
    draftWorkBrief(input) {
      const draftRef = assertRef(input?.draft_ref, "draft_ref");
      if (draftIndex.has(draftRef)) fail("draft_duplicate", draftRef);
      const assignment = assignments.get(assertRef(input.assignment_id, "assignment_id"));
      if (!assignment) fail(HOLDS.ASSIGNMENT_REQUIRED, input.assignment_id);
      if (briefByAssignment.has(assignment.assignment_id)) {
        fail("assignment_brief_exists", assignment.assignment_id);
      }
      const bindings = {};
      const missing = [];
      for (const field of BRIEF_CRITICAL_FIELDS) {
        const value = input[field];
        if (!isPresent(value)) {
          missing.push(field);
        } else {
          bindings[field] = validateCriticalField(field, value);
        }
      }
      missing.sort();
      const list = briefDrafts.get(assignment.assignment_id) ?? [];
      const record = frozen({
        draft_ref: draftRef,
        assignment_id: assignment.assignment_id,
        draft_revision: list.length + 1,
        bindings,
        missing_bindings: missing,
        complete: missing.length === 0,
        claim: "draft_not_issuable_material",
      });
      list.push(record);
      briefDrafts.set(assignment.assignment_id, list);
      draftIndex.set(draftRef, record);
      append("work_brief_drafted", {
        draft_ref: draftRef, assignment_id: assignment.assignment_id,
        draft_revision: record.draft_revision, missing_count: missing.length,
      });
      return record;
    },

    // Issue from a draft: only the LATEST draft of the assignment, only when
    // it is complete, and only by the assignment's own authority.
    issueWorkBriefFromDraft(input) {
      const briefId = assertRef(input?.brief_id, "brief_id");
      const assignment = assignments.get(assertRef(input.assignment_id, "assignment_id"));
      if (!assignment) fail(HOLDS.ASSIGNMENT_REQUIRED, input.assignment_id);
      const draft = draftIndex.get(assertRef(input.draft_ref, "draft_ref"));
      if (!draft || draft.assignment_id !== assignment.assignment_id) {
        fail(HOLDS.INPUT_UNAVAILABLE, "draft_ref");
      }
      // Authority first: a caller without issuance authority learns nothing
      // about the draft's freshness or completeness.
      const issuer = assertRef(input.issuer_ref, "issuer_ref");
      if (issuer !== assignment.authority_ref) {
        fail("issuer_not_assignment_authority", issuer);
      }
      const list = briefDrafts.get(assignment.assignment_id);
      const latest = list[list.length - 1];
      if (draft.draft_ref !== latest.draft_ref) {
        // Issuing a superseded draft would silently drop the newer revision's
        // corrections; the caller must re-read and decide.
        fail(HOLDS.STALE_DRAFT, `latest=${latest.draft_ref}`);
      }
      if (!draft.complete) {
        fail(HOLDS.BRIEF_INCOMPLETE, draft.missing_bindings.join(","));
      }
      return buildIssuedBrief(briefId, assignment, draft.bindings, draft.draft_ref);
    },

    getIssuedBrief(briefId) {
      return briefs.get(assertRef(briefId, "brief_id")) ?? null;
    },

    getLatestDraft(assignmentId) {
      const list = briefDrafts.get(assertRef(assignmentId, "assignment_id")) ?? [];
      return list.length > 0 ? list[list.length - 1] : null;
    },

    eventLog() {
      return events.slice();
    },
  });
}
