export const REPRESENTATION_PROFILE = 'accepted-typed-v1';

// Call only after common membership/ref/acceptance/temporal guards pass.
export function projectAcceptedMembership(item) {
  return {
    source_span_ref: item.source_span_ref,
    source_revision_ref: structuredClone(item.source_revision_ref),
    source_lane: item.source_lane,
    context_event_ref: item.context_event_ref,
    context_unit_ref: item.context_unit_ref,
    context_branch_ref: item.context_branch_ref,
    membership_state: item.membership_state,
    correction_state: item.correction_state,
    claim_ceiling: 'observed',
    valid_at: item.valid_at,
    known_at: item.known_at,
  };
}

export function projectTypedRecord(row, taskRef) {
  return { ...row, task_ref: taskRef };
}
