// Runtime heartbeats for engine surfaces.
//
// A heartbeat answers one question: did this surface actually run recently? It does not say
// the surface is correct, and it says nothing at all about any other surface. Those limits
// are the point — a single "system healthy" light is what lets a dead component hide behind
// a live neighbour.
//
// The period+grace two-stage window matches the semantics the operations plane already uses
// for its own probes, so a reader does not have to learn a second freshness rule. It is
// reimplemented here rather than imported: the kernel keeps zero dependencies, and the
// operations contract is owned elsewhere and must not be forked by an import.
//
// Nothing here reads a clock. `now` is supplied, so a judgement is reproducible from its
// recorded inputs like everything else in this kernel.

import { inspectInstant } from './canonical.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  SURFACE_UNKNOWN: 'HEARTBEAT_SURFACE_UNKNOWN',
  FIELD_MISSING: 'HEARTBEAT_FIELD_MISSING',
  INSTANT_INVALID: 'HEARTBEAT_INSTANT_INVALID',
  OUTCOME_INVALID: 'HEARTBEAT_OUTCOME_INVALID',
  WINDOW_INVALID: 'HEARTBEAT_WINDOW_INVALID',
  WINDOW_ABSENT: 'HEARTBEAT_WINDOW_ABSENT',
  FUTURE_OBSERVATION: 'HEARTBEAT_FUTURE_OBSERVATION',
  NEIGHBOUR_INFERENCE_FORBIDDEN: 'HEARTBEAT_NEIGHBOUR_INFERENCE_FORBIDDEN',
});

/**
 * The engine surfaces that can produce a heartbeat.
 *
 * Deliberately a closed list. A surface nobody declared cannot report itself alive, because
 * an open list would let a typo invent a component that is always green.
 */
export const HEARTBEAT_SURFACES = Object.freeze([
  'kernel_conformance',
  'lane_1a_conformance',
  'lane_1b_conformance',
  'lane_1c_conformance',
  'lane_1d_conformance',
  'lane_1e_conformance',
  'minting_conformance',
  'runtime_observation_conformance',
  'mutation_lock',
  'topology_emit',
  'integration_check',
]);

export const HEARTBEAT_STATES = Object.freeze(['fresh', 'late', 'stale', 'failed', 'absent']);
export const OUTCOMES = Object.freeze(['passed', 'failed']);

export const REQUIRED_HEARTBEAT_FIELDS = Object.freeze([
  'surface_id', 'observed_at', 'outcome', 'evidence',
]);

export function assertKnownSurface(surfaceId) {
  if (!HEARTBEAT_SURFACES.includes(surfaceId)) {
    throw new ContractError(CODES.SURFACE_UNKNOWN,
      'surface is not declared; a new surface is a contract change, not a new string',
      { surface_id: surfaceId ?? null });
  }
  return true;
}

/** Validates one heartbeat record. Nothing defaults, including the outcome. */
export function validateHeartbeat(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new ContractError(CODES.FIELD_MISSING, 'heartbeat is not an object');
  }
  for (const f of REQUIRED_HEARTBEAT_FIELDS) {
    if (!Object.hasOwn(record, f)) {
      throw new ContractError(CODES.FIELD_MISSING, `heartbeat field "${f}" is missing`, { field: f });
    }
  }
  assertKnownSurface(record.surface_id);
  if (!inspectInstant(record.observed_at).valid) {
    throw new ContractError(CODES.INSTANT_INVALID, 'observed_at must be a canonical instant');
  }
  if (!OUTCOMES.includes(record.outcome)) {
    throw new ContractError(CODES.OUTCOME_INVALID, `outcome must be one of ${OUTCOMES.join(', ')}`);
  }
  if (record.evidence === null || typeof record.evidence !== 'object') {
    throw new ContractError(CODES.FIELD_MISSING,
      'a heartbeat must carry the evidence of the run it reports, otherwise it is only a claim that something happened');
  }
  return { valid: true, surface_id: record.surface_id, outcome: record.outcome };
}

export function validateWindow(window, surfaceId = '') {
  if (window === undefined || window === null) {
    throw new ContractError(CODES.WINDOW_ABSENT,
      'no freshness window is declared for this surface, so its age cannot be judged', { surface_id: surfaceId });
  }
  for (const field of ['period_seconds', 'grace_seconds']) {
    if (!Number.isSafeInteger(window[field]) || window[field] < 0) {
      throw new ContractError(CODES.WINDOW_INVALID, `${field} must be a non-negative safe integer`, { surface_id: surfaceId });
    }
  }
  if (window.period_seconds === 0) {
    throw new ContractError(CODES.WINDOW_INVALID, 'period_seconds must be greater than zero', { surface_id: surfaceId });
  }
  return true;
}

/**
 * Judges one surface from its own heartbeat only.
 *
 * A failed run is reported as failed even when it is recent: freshness and success are
 * different questions, and a surface that runs promptly and fails every time is not healthy.
 */
export function judgeSurface({ surfaceId, heartbeat, window, now }) {
  assertKnownSurface(surfaceId);
  validateWindow(window, surfaceId);
  if (!Number.isFinite(now)) throw new ContractError(CODES.FIELD_MISSING, 'now must be supplied; this kernel reads no clock');

  if (heartbeat === undefined || heartbeat === null) {
    // Never ran, as far as anything can tell. That is not the same as ran and failed.
    return { surface_id: surfaceId, state: 'absent', reason: 'no_heartbeat_recorded', alive: false };
  }
  validateHeartbeat(heartbeat);
  if (heartbeat.surface_id !== surfaceId) {
    throw new ContractError(CODES.SURFACE_UNKNOWN, 'heartbeat belongs to a different surface',
      { expected: surfaceId, given: heartbeat.surface_id });
  }
  const observedMs = Date.parse(heartbeat.observed_at);
  if (observedMs > now) {
    throw new ContractError(CODES.FUTURE_OBSERVATION,
      'heartbeat is dated after the observation time, so the clock or the record is wrong', { surface_id: surfaceId });
  }
  const ageSeconds = Math.max(0, Math.floor((now - observedMs) / 1000));

  if (heartbeat.outcome === 'failed') {
    return { surface_id: surfaceId, state: 'failed', age_seconds: ageSeconds, alive: true, reason: 'last_run_failed' };
  }
  if (ageSeconds <= window.period_seconds) {
    return { surface_id: surfaceId, state: 'fresh', age_seconds: ageSeconds, alive: true };
  }
  if (ageSeconds <= window.period_seconds + window.grace_seconds) {
    return { surface_id: surfaceId, state: 'late', age_seconds: ageSeconds, alive: true, reason: 'grace_window' };
  }
  return { surface_id: surfaceId, state: 'stale', age_seconds: ageSeconds, alive: false, reason: 'outside_window' };
}

/**
 * Judges every declared surface. A surface with no heartbeat is reported, not omitted.
 *
 * Omitting it would make the summary look complete while hiding the components nobody has
 * evidence for, which is the failure this whole file exists to prevent.
 */
export function judgeAllSurfaces({ heartbeats = {}, windows = {}, now, surfaces = HEARTBEAT_SURFACES }) {
  const verdicts = surfaces.map((surfaceId) => judgeSurface({
    surfaceId, heartbeat: heartbeats[surfaceId], window: windows[surfaceId] ?? windows.default, now,
  }));
  const counts = Object.fromEntries(HEARTBEAT_STATES.map((s) => [s, 0]));
  for (const v of verdicts) counts[v.state] += 1;
  return {
    verdicts,
    counts,
    surfaces_declared: surfaces.length,
    surfaces_with_evidence: verdicts.filter((v) => v.state !== 'absent').length,
    // The claim a caller may make, phrased so it cannot overstate what was observed.
    claim: counts.fresh === surfaces.length
      ? `${surfaces.length}/${surfaces.length} surfaces reported a passing run inside their window`
      : `${counts.fresh}/${surfaces.length} surfaces fresh · ${counts.absent} without any heartbeat · ${counts.failed} failing`,
  };
}

/**
 * A surface's state may never be derived from another surface.
 *
 * Enforced by refusing the call rather than documented, because this is the shortcut that
 * makes a topology look healthier than its evidence.
 */
export function forbidNeighbourInference(operation) {
  throw new ContractError(CODES.NEIGHBOUR_INFERENCE_FORBIDDEN,
    `${operation} would derive one surface's state from another; each surface is judged only by its own heartbeat`,
    { operation });
}
