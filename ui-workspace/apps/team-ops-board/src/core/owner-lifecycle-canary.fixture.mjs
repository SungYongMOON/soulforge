import {
  THREAD_ENROLLMENT_SCHEMA,
  THREAD_RESULT_GATE_SCHEMA
} from "./live-thread-projection.mjs";

export const OWNER_LIFECYCLE_CANARY_AT = "2026-08-04T03:00:00.000Z";

export function ownerLifecycleEnrollmentEntry(threadId, overrides = {}) {
  return {
    thread_id: threadId,
    organization_group_id: "development1_company",
    route_id: null,
    work_id: "canary-work",
    thread_kind: "manager",
    display_label: "Synthetic lifecycle canary",
    relationship: "primary",
    lifecycle: "current",
    parent_thread_id: null,
    prior_thread_history_pointer: null,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    enrolled_at: OWNER_LIFECYCLE_CANARY_AT,
    updated_at: OWNER_LIFECYCLE_CANARY_AT,
    ...overrides
  };
}

export function ownerLifecycleRegistry(entries) {
  return {
    schema_version: THREAD_ENROLLMENT_SCHEMA,
    registry_revision: 1,
    updated_at: OWNER_LIFECYCLE_CANARY_AT,
    disabled: false,
    entries
  };
}

export function ownerLifecycleEvent(eventId, threadId, eventType, target, targetThreadId, occurredAt = OWNER_LIFECYCLE_CANARY_AT) {
  return {
    event_id: eventId,
    thread_id: threadId,
    event_type: eventType,
    target,
    target_thread_id: targetThreadId,
    occurred_at: occurredAt,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

export function ownerLifecycleGateRegistry(events, { disabled = false } = {}) {
  return {
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: 1,
    updated_at: OWNER_LIFECYCLE_CANARY_AT,
    disabled,
    events
  };
}
