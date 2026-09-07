// Read-only display semantics. No clock, network, state mutation or acceptance.
export const WORLD_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const labels = Object.freeze({ lit: '정책 충족 관측', warm: '관측·판정 유보', missing: '부재 확인',
  fog: '미확인', conflict: '근거 상충', planned: '적용 제외' });
const fogLabels = Object.freeze({coverage_not_attempted:'관측 미시도', needs_undeclared:'기대 산출물 미선언',
  coverage_revision_stale:'입력 판본 불일치', source_stale:'관측 만료', source_in_future:'관측 시각 오류',
  artifact_ref_floating:'산출물 판본 미고정', artifact_ref_malformed:'산출물 참조 오류', artifact_bytes_unresolvable:'산출물 확인 불가'});

export function deriveWorldSlotState(slot, { nowMs, observedAt, ttlMs = WORLD_EVIDENCE_MAX_AGE_MS } = {}) {
  const age = nowMs - Date.parse(slot?.source_observed_at);
  const generationAge = nowMs - Date.parse(observedAt);
  let state = 'fog', reason = 'source_unavailable';
  if (Number.isFinite(age) && Number.isFinite(generationAge) && Number.isFinite(ttlMs) && ttlMs > 0) {
    if (age < 0 || generationAge < 0) reason = 'source_in_future';
    else if (age > ttlMs || generationAge > ttlMs) reason = 'source_stale';
    else if (slot.coverage_state === 'gap_conflict') { state = 'conflict'; reason = slot.coverage_reason; }
    else if (slot.coverage_state === 'satisfied') { state = 'lit'; reason = 'coverage_satisfied'; }
    else if (slot.coverage_state === 'gap_missing') { state = 'missing'; reason = 'absence_confirmed'; }
    else if (slot.coverage_state === 'not_applicable') { state = 'planned'; reason = 'not_applicable'; }
    else if (slot.coverage_state === 'gap_unknown') {
      reason = slot.coverage_reason;
      if (reason === 'observation_inconclusive') state = 'warm';
    }
  }
  return { state, reason, label: state === 'fog' ? fogLabels[reason] ?? labels.fog : labels[state],
    border: reason === 'needs_undeclared' ? 'dashed' : 'solid', acceptance_label: '수락 미확인' };
}

export function projectWorldCoverage(document, { projectCode, nowMs, includeSamples = false } = {}) {
  const empty = reason => ({ state: 'unknown', reason, project_code: projectCode, slots: [],
    observed_slots: 0, sample_slots: 0, qualifying_observed_slots: 0 });
  if (!document || document.schema_version !== 'soulforge.forge_world.coverage.v1'
    || document.project_code !== projectCode || !Array.isArray(document.slots)
    || !['sample', 'observed'].includes(document.source_kind)) return empty('source_unavailable');
  if (document.source_kind === 'sample' && !includeSamples) return empty('sample_hidden');
  const identities = new Set();
  const slots = [];
  for (const slot of document.slots) {
    const identity = JSON.stringify([slot.project_code, slot.stage_code, slot.artifact_family_id]);
    if (slot.project_code !== projectCode || identities.has(identity)) return empty('source_scope_conflict');
    identities.add(identity);
    slots.push({
      project_code: slot.project_code, stage_code: slot.stage_code, artifact_family_id: slot.artifact_family_id,
      cell_count: slot.cell_count, observation_count: slot.observation_count,
      source_observed_at: slot.source_observed_at, evidence_refs: slot.evidence_refs,
      state_counts: slot.state_counts, reason_counts: slot.reason_counts,
      display: deriveWorldSlotState(slot, { nowMs, observedAt: document.observed_at }),
    });
  }
  const observed = document.source_kind === 'observed';
  return {
    state: 'available', reason: null, project_code: projectCode, generation: document.generation,
    observed_at: document.observed_at, source_kind: document.source_kind, slots,
    observed_slots: observed ? slots.filter(slot => slot.observation_count > 0).length : 0,
    sample_slots: observed ? 0 : slots.length,
    qualifying_observed_slots: observed ? slots.filter(slot => slot.observation_count > 0
      && ['lit', 'missing'].includes(slot.display.state)).length : 0,
    unbound_counts: document.unbound_counts,
  };
}
