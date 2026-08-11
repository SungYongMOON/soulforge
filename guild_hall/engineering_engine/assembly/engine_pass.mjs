// One engine pass, assembled from the kernel.
//
// The kernel is pure functions; this is the file that wires them into a judgement. It is kept
// separate from the CLI so a test can drive a whole pass with controlled inputs — the clock and
// the identifier source are injected rather than read, which is the only way a replay can be
// compared to its original.
//
//   subject states -> compare -> mint -> snapshot -> context request candidate
//
// Nothing here accepts, promotes, or writes. P5 and P8 are not invoked, so everything this
// produces is a candidate.

import { compareStates, GAP_TYPE, validateFinding, validateSnapshotEnvelope, assertProvenanceLayersSeparate } from '../kernel/snapshot.mjs';
import { recordSourceConflict } from '../kernel/authority.mjs';
import { validateContextRequest } from '../kernel/pipeline.mjs';
import { acquireMintingLane, mint } from '../kernel/minting.mjs';
import { deterministicReplayFingerprint, classifyRerun } from '../kernel/fingerprint.mjs';
import { FINGERPRINT_INPUT_KEYS, CONTRACT_REVISION, BASELINE_EXECUTION_MODE } from '../kernel/contract_config.mjs';
import { ContractError } from '../kernel/errors.mjs';

export const CODES = Object.freeze({ INPUT_MISSING: 'ENGINE_PASS_INPUT_MISSING' });

/**
 * Runs one pass and returns everything it produced.
 *
 * `mintValue` supplies identifier values and `takenAt` supplies the instant. Both are injected
 * because the pass has to be reproducible: with the same inputs and the same injected values a
 * replay is byte-identical, and with the same inputs but fresh identifiers the fingerprint must
 * still match. Those two properties are what the test checks.
 */
export function runEnginePass({
  states, subjectId, projectBindingRef, generation, topologyDigest, observationRunId,
  takenAt, validAt, mintValue,
}) {
  for (const [name, value] of [['states', states], ['takenAt', takenAt], ['mintValue', mintValue]]) {
    if (!value) throw new ContractError(CODES.INPUT_MISSING, `${name} is required`);
  }

  // ---- compare
  //
  // A subject that can detect a contradiction says so here. Without this the assembled engine
  // could never report gap_conflict at all: the kernel supports it and compareStates accepts
  // the signal, but nothing was passing one, so a whole verdict class was unreachable end to
  // end. The frozen Phase 2 spec is what exposed that.
  const conflicting = new Set(states.conflicting_element_ids ?? []);
  // Two sources that disagree are two records, and the pass has to carry both. The subject
  // supplies the claims per element; a conflict signalled without them is refused rather
  // than reported as a conflict whose sides nobody can inspect.
  const sourceClaims = states.source_claims ?? {};
  const observedById = new Map(states.observed.map((o) => [o.element_id, o]));
  const gaps = states.expected.map((expected) => {
    const observed = observedById.get(`obs_${expected.element_id}`);
    return {
      expected,
      observed,
      ...compareStates({ expected, observed, conflicts: conflicting.has(expected.element_id) }),
    };
  });

  // ---- mint at the serialised boundary, one lane held for the pass
  const lane = acquireMintingLane({ held: false });
  const issued = new Set();
  const mintId = (family) => {
    const value = mint({ family, value: mintValue(), laneToken: lane.token, registry: issued, derivation: 'random' }).value;
    issued.add(value);
    return value;
  };

  const snapshotId = mintId('snapshot_id');

  const findings = [];
  for (const gap of gaps) {
    if (gap.gap_type === GAP_TYPE.SATISFIED) continue;
    const finding = {
      finding_id: mintId('finding_id'),
      snapshot_id: snapshotId,
      gap_type: gap.gap_type,
      expected_element_id: gap.expected.element_id,
      observed_presence_state: gap.observed?.presence_state,
      // An unknown gap cannot claim to rest on an observed artifact. Its ceiling says so.
      evidence_claim_ceiling: gap.gap_type === GAP_TYPE.UNKNOWN ? 'unknown' : 'observed_artifact',
      authority_family: gap.expected.authority_family,
      known_at: takenAt,
      disposition_state: 'candidate',
      ...(gap.gap_type === GAP_TYPE.CONFLICT
        ? { source_conflict: recordSourceConflict(sourceClaims[gap.expected.element_id] ?? []) }
        : {}),
      // The citable thing for a missing or unknown gap is the record of the attempt, because
      // the whole point of the finding is that a span could not be produced.
      observation_attempt_ref: `${observationRunId ?? 'unknown_run'}:${gap.expected.element_id}`,
      reason: gap.reason,
    };
    validateFinding(finding);
    findings.push(finding);
  }

  // ---- snapshot
  const fingerprintInput = {
    canonical_accepted_input_set: states.canonical_accepted_input_set,
    accepted_context_generation: generation,
    project_binding_ref: projectBindingRef,
    replay_relevant_provenance: {
      engine_contract_revision: CONTRACT_REVISION,
      snapshot_schema_version: 'snap.v1',
      execution_mode: BASELINE_EXECUTION_MODE,
      subject_id: subjectId,
      topology_digest: topologyDigest,
      observation_run_id: observationRunId,
    },
  };
  const fingerprint = deterministicReplayFingerprint(
    Object.fromEntries(FINGERPRINT_INPUT_KEYS.map((k) => [k, fingerprintInput[k]])),
  );

  const snapshot = {
    snapshot_id: snapshotId,
    ...fingerprintInput,
    snapshot_schema_version: 'snap.v1',
    taken_at: takenAt,
    deterministic_replay_fingerprint: fingerprint,
    run_observational_provenance: { engine_run_id: `engine-${snapshotId}`, invocation_finished_at: takenAt },
    expected_state_elements: states.expected,
    observed_state_elements: states.observed,
    findings,
    claim_ceiling: findings.some((f) => f.evidence_claim_ceiling === 'unknown') ? 'unknown' : 'observed_artifact',
    execution_mode: BASELINE_EXECUTION_MODE,
    custody_summary: { subject: subjectId, pinned: 0, retained_spans: 0, note: 'self-observation carries no external bytes' },
  };

  assertProvenanceLayersSeparate(snapshot);
  const envelope = validateSnapshotEnvelope(snapshot);

  // ---- context request, only where the evidence was too weak to judge
  const unknownFindings = findings.filter((f) => f.gap_type === GAP_TYPE.UNKNOWN);
  let contextRequest = null;
  if (unknownFindings.length > 0) {
    contextRequest = {
      context_request_id: mintId('receipt_id'),
      snapshot_id: snapshotId,
      finding_ids: unknownFindings.map((f) => f.finding_id),
      question_text: 'observation could not establish traversal for these connections; confirm whether they are expected to be exercised',
      requested_from_role: 'systems_engineer',
      authority_family_sought: 'company_approved_procedure',
      known_at: takenAt,
      candidate_only: true,
      erp_delta: 0,
    };
    validateContextRequest(contextRequest);
  }

  const gapCounts = {};
  for (const g of gaps) gapCounts[g.gap_type] = (gapCounts[g.gap_type] ?? 0) + 1;

  return {
    snapshot, findings, contextRequest, envelope, fingerprint,
    gap_counts: gapCounts,
    requirements_judged: states.expected.length,
    identifiers_issued: issued.size,
    erp_writes: 0,
    learned_model_invocations: 0,
  };
}

/**
 * Classifies a second pass against a prior one.
 *
 * The kernel recomputes the fingerprint from the tuple rather than being handed one, which is
 * the same rule the envelope follows: a fingerprint nobody recomputes is a comment. An
 * identical result means the same question was asked again, so the answer is a verification
 * receipt against the existing snapshot rather than a new snapshot. Without this a replay
 * would look like new information every time it ran.
 */
export function classifyReplay({ prior, next }) {
  return classifyRerun({
    priorFingerprint: prior.fingerprint,
    priorSnapshotId: prior.snapshot.snapshot_id,
    tuple: Object.fromEntries(FINGERPRINT_INPUT_KEYS.map((k) => [k, next.snapshot[k]])),
  });
}
