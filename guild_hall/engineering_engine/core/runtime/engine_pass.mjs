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

import { compareStates, GAP_TYPE, validateFinding, validateSnapshotEnvelope, assertProvenanceLayersSeparate } from '../validators/snapshot.mjs';
import { recordSourceConflict } from '../validators/authority.mjs';
import { validateContextRequest } from '../validators/pipeline.mjs';
import { acquireMintingLane, mint } from '../validators/minting.mjs';
import { deterministicReplayFingerprint, classifyRerun, sha256Hex } from '../validators/fingerprint.mjs';
import { FINGERPRINT_INPUT_KEYS, CONTRACT_REVISION, BASELINE_EXECUTION_MODE } from '../validators/contract_config.mjs';
import { canonicalise, compareCodePoints } from '../validators/canonical.mjs';
import { ContractError } from '../validators/errors.mjs';

export const CODES = Object.freeze({
  INPUT_MISSING: 'ENGINE_PASS_INPUT_MISSING',
  CONTEXT_CAPSULE_FINGERPRINT_INVALID: 'ENGINE_PASS_CONTEXT_CAPSULE_FINGERPRINT_INVALID',
  STATE_SUBJECT_MISMATCH: 'ENGINE_PASS_STATE_SUBJECT_MISMATCH',
  STATE_PROJECT_BINDING_MISMATCH: 'ENGINE_PASS_STATE_PROJECT_BINDING_MISMATCH',
  STATE_GENERATION_MISMATCH: 'ENGINE_PASS_STATE_GENERATION_MISMATCH',
  STATE_SEMANTICS_INVALID: 'ENGINE_PASS_STATE_SEMANTICS_INVALID',
  STATE_SNAPSHOT_INVALID: 'ENGINE_PASS_STATE_SNAPSHOT_INVALID',
});

const SHA256 = /^[0-9a-f]{64}$/;
const COMMON_SE_SUBJECT_ID = 'common_se_corpus_projection';
const COMMON_SE_MARKER_FIELDS = Object.freeze([
  'projection_revision', 'projection_sha256', 'manifest_revision', 'manifest_sha256',
]);

function snapshotEngineStates(root) {
  const seen = new WeakSet();
  const walk = (value) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (value === null || typeof value !== 'object') {
      throw new ContractError(CODES.STATE_SNAPSHOT_INVALID,
        'Engine states must contain only plain own JSON data');
    }
    if (seen.has(value)) {
      throw new ContractError(CODES.STATE_SNAPSHOT_INVALID,
        'Engine states must be an acyclic, unaliased data tree');
    }
    seen.add(value);

    const array = Array.isArray(value);
    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      throw new ContractError(CODES.STATE_SNAPSHOT_INVALID,
        'Engine state reflection failed without exposing caller-controlled error text');
    }
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype)) {
      throw new ContractError(CODES.STATE_SNAPSHOT_INVALID,
        'Engine states require plain objects and arrays');
    }

    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new ContractError(CODES.STATE_SNAPSHOT_INVALID, 'Engine states cannot contain symbol properties');
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    const arrayLength = array ? descriptors.length?.value : undefined;
    if (array) {
      if (!Number.isSafeInteger(arrayLength) || arrayLength < 0
          || dataKeys.length !== arrayLength
          || dataKeys.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= arrayLength)) {
        throw new ContractError(CODES.STATE_SNAPSHOT_INVALID,
          'Engine state arrays must be dense and carry no named properties');
      }
    }

    const snapshot = array ? new Array(arrayLength) : {};
    for (const key of dataKeys) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new ContractError(CODES.STATE_SNAPSHOT_INVALID,
          'Engine state fields must be own enumerable data properties');
      }
      Object.defineProperty(snapshot, key, {
        value: walk(descriptor.value), enumerable: true, configurable: true, writable: true,
      });
    }
    return snapshot;
  };

  const snapshot = walk(root);
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ContractError(CODES.STATE_SNAPSHOT_INVALID, 'states must be one plain object');
  }
  return snapshot;
}

function stateElementsFingerprint(states) {
  if (!Array.isArray(states.expected) || !Array.isArray(states.observed)) {
    throw new ContractError(CODES.STATE_SEMANTICS_INVALID,
      'states.expected and states.observed must be explicit arrays');
  }
  try {
    // Canonical strings are compared as complete values instead of joining selected fields
    // with a separator. Reordering is inert, while any accepted expected/observed semantic
    // change remains replay relevant even when its artifact revision ref is unchanged.
    const expected = states.expected.map((element) => canonicalise(element)).sort(compareCodePoints);
    const observed = states.observed.map((element) => canonicalise(element)).sort(compareCodePoints);
    const material = canonicalise({ expected, observed }, {
      expected: 'insertion_ordered',
      observed: 'insertion_ordered',
    });
    return sha256Hex(`soulforge.se_engine.state_elements.v0\n${material}`);
  } catch {
    throw new ContractError(CODES.STATE_SEMANTICS_INVALID,
      'expected and observed state semantics could not be canonicalised');
  }
}

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
  // Snapshot once, before any validation or fingerprinting. Every later comparison and output
  // reads this copy, so a Proxy cannot present one state to the fingerprint and another to the
  // snapshot after the hash has been computed.
  const stateSnapshot = snapshotEngineStates(states);
  const hasStateSubject = Object.hasOwn(stateSnapshot, 'subject_id');
  const hasStateBinding = Object.hasOwn(stateSnapshot, 'project_binding_ref');
  const hasStateGeneration = Object.hasOwn(stateSnapshot, 'accepted_context_generation');
  const commonSeMarked = subjectId === COMMON_SE_SUBJECT_ID
    || stateSnapshot.subject_id === COMMON_SE_SUBJECT_ID
    || COMMON_SE_MARKER_FIELDS.some((field) => Object.hasOwn(stateSnapshot, field));

  if ((hasStateSubject && stateSnapshot.subject_id !== subjectId)
      || (commonSeMarked && (!hasStateSubject || stateSnapshot.subject_id !== COMMON_SE_SUBJECT_ID
        || subjectId !== COMMON_SE_SUBJECT_ID))) {
    throw new ContractError(CODES.STATE_SUBJECT_MISMATCH,
      'state subject identity must exactly match the caller and common-SE identity cannot be removed or relabelled');
  }
  if ((hasStateBinding && stateSnapshot.project_binding_ref !== projectBindingRef)
      || (commonSeMarked && !hasStateBinding)) {
    throw new ContractError(CODES.STATE_PROJECT_BINDING_MISMATCH,
      'state project binding must exactly match the caller');
  }
  if ((hasStateGeneration && stateSnapshot.accepted_context_generation !== generation)
      || (commonSeMarked && !hasStateGeneration)) {
    throw new ContractError(CODES.STATE_GENERATION_MISMATCH,
      'state accepted context generation must exactly match the caller');
  }
  const contextCapsuleFingerprint = stateSnapshot.context_capsule_fingerprint;
  if ((commonSeMarked && !SHA256.test(contextCapsuleFingerprint ?? ''))
      || (contextCapsuleFingerprint !== undefined && !SHA256.test(contextCapsuleFingerprint))) {
    throw new ContractError(CODES.CONTEXT_CAPSULE_FINGERPRINT_INVALID,
      'a common-SE subject requires one lowercase SHA-256 context capsule fingerprint');
  }
  const canonicalStateElementsFingerprint = stateElementsFingerprint(stateSnapshot);

  // ---- compare
  //
  // A subject that can detect a contradiction says so here. Without this the assembled engine
  // could never report gap_conflict at all: the kernel supports it and compareStates accepts
  // the signal, but nothing was passing one, so a whole verdict class was unreachable end to
  // end. The frozen Phase 2 spec is what exposed that.
  const conflicting = new Set(stateSnapshot.conflicting_element_ids ?? []);
  // Two sources that disagree are two records, and the pass has to carry both. The subject
  // supplies the claims per element; a conflict signalled without them is refused rather
  // than reported as a conflict whose sides nobody can inspect.
  const sourceClaims = stateSnapshot.source_claims ?? {};
  const observedById = new Map(stateSnapshot.observed.map((o) => [o.element_id, o]));
  const gaps = stateSnapshot.expected.map((expected) => {
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
    canonical_accepted_input_set: stateSnapshot.canonical_accepted_input_set,
    accepted_context_generation: generation,
    project_binding_ref: projectBindingRef,
    replay_relevant_provenance: {
      engine_contract_revision: CONTRACT_REVISION,
      snapshot_schema_version: 'snap.v1',
      execution_mode: BASELINE_EXECUTION_MODE,
      subject_id: subjectId,
      topology_digest: topologyDigest,
      observation_run_id: observationRunId,
      state_elements_fingerprint: canonicalStateElementsFingerprint,
      ...(contextCapsuleFingerprint === undefined ? {} : { context_capsule_fingerprint: contextCapsuleFingerprint }),
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
    expected_state_elements: stateSnapshot.expected,
    observed_state_elements: stateSnapshot.observed,
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
    requirements_judged: stateSnapshot.expected.length,
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
