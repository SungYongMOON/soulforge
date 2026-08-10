// Phase 1-0 contract parameters for the deterministic kernel.
//
// Values are sourced from the frozen Phase 1-0 contract, not invented here, and not
// hardcoded inside the algorithms. A prior round shipped a validator that claimed to read
// the fractional precision from the contract while the implementation was in fact pinned
// to the host formatter's three digits. Keeping every parameter in one declared place, and
// marking the ones that are still owner-undecided, is how that failure is prevented.
//
// Frozen source: phase_1_0_contract_schema.json  sha256 2ec99c8ada5986cf...
// Frozen oracle: phase_1_0_synthetic_oracle.json sha256 19fbf9afadd179f1...

export const CONTRACT_REVISION = 'phase_1_0_contract.v0';

export const CANONICAL = {
  version: 'cs-v0',
  encoding: 'utf-8',
  unicodeNormalization: 'NFC',
  objectKeyOrder: 'unicode_code_point_ascending',
  nullAllowed: false,
  floatAllowed: false,
  hashAlgorithm: 'sha256',
  hashEncoding: 'lowercase_hex',
  domainSeparationPrefix: 'soulforge.se_engine.fingerprint.v0',
};

// D-P10-07 is closed by owner decision: three fractional digits, fixed.
//
// The width is deliberately not widened later. It is hashed into every fingerprint, so a
// change would silently invalidate every value already computed. Ordering of near-
// simultaneous events does not depend on it: state-advancing operations are serialised and
// carry event_seq, which is what actually breaks same-instant ties.
export const TIME_PRECISION = {
  fractionalDigits: 3,
  state: 'settled_by_D-P10-07',
  isSettled: true,
};

// PC-11.4: every array that can appear in canonical input declares its ordering.
// An array at a path with no rule is rejected rather than silently accepted.
export const ARRAY_ORDER_RULES = {
  'canonical_accepted_input_set.source_revision_refs': 'sorted_by:revision_id',
  'canonical_accepted_input_set.artifact_revision_refs': 'sorted_by:revision_id',
};

// PC-06 / PC-07: the fingerprint is computed over this projection only. The run
// observational layer is excluded by contract, because including a per-run identifier
// makes every replay produce a new fingerprint.
export const FINGERPRINT_INPUT_KEYS = [
  'canonical_accepted_input_set',
  'accepted_context_generation',
  'project_binding_ref',
  'replay_relevant_provenance',
];

export const FINGERPRINT_EXCLUDED_LAYERS = ['run_observational_provenance'];

export const REPLAY_RELEVANT_PROVENANCE = [
  'engine_id', 'engine_version', 'engine_build_commit', 'engine_artifact_sha256',
  'engine_contract_revision', 'blueprint_catalog_revision', 'snapshot_schema_version',
  'module_binding_revision', 'policy_bundle_revision', 'policy_bundle_sha256',
  'ruleset_revision', 'ruleset_sha256', 'common_knowledge_revision', 'project_knowledge_revision',
  'context_capsule_fingerprint', 'execution_mode',
  'advisory_model_profile_revision', 'advisory_prompt_sha256', 'advisory_output_sha256',
];

export const RUN_OBSERVATIONAL_PROVENANCE = [
  'engine_run_id', 'invocation_started_at', 'invocation_finished_at',
  'provider_request_id', 'latency_and_cost_receipt_ref', 'execution_receipt_ref',
];

// PC-02: an exact revision ref is only meaningful when fully formed.
export const REF_REQUIRED_FIELDS = ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'];

// PC-09: Phase 1 to 4 baseline runs deterministic only. No learned model is invoked and
// no learned model output reaches an authoritative surface.
export const EXECUTION_MODES = ['deterministic_only', 'ai_assisted'];
export const BASELINE_EXECUTION_MODE = 'deterministic_only';
export const ADVISORY_FIELDS = ['advisory_model_profile_revision', 'advisory_prompt_sha256', 'advisory_output_sha256'];

// Owner decisions that are still open and therefore must not be treated as settled by
// any caller of this kernel.
export const OPEN_OWNER_DECISIONS = [
  { id: 'D-P10-06', affects: 'registered human disposition confirmation authority policy', blocks: 'live disposition confirmation' },
  { id: 'D-P10-08', affects: 'registered human P5 and P8 approver registration policy', blocks: 'live P5 acceptance' },
];

// Closed by owner directive. Recorded so a reader does not have to reconstruct why the
// kernel sits where it does.
export const CLOSED_OWNER_DECISIONS = [
  { id: 'D-P10-01', decision: 'the preserved V1.2 snapshot claim_ceiling field carries evidence axis values' },
  { id: 'D-P10-02', decision: 'guild_hall/engineering_engine is the engine canonical folder and document owner' },
  { id: 'D-P10-03', decision: 'a single serialised minting boundary inside the engine issues every permanent identifier; identifiers are opaque; a collision is rejected rather than retried' },
  { id: 'D-P10-04', decision: 'authority family machine keys adopted as declared' },
  { id: 'D-P10-05', decision: 'evidence_claim_ceiling seven value set adopted' },
  { id: 'D-P10-07', decision: 'canonical time carries exactly three fractional digits, fixed' },
];

// Lane-level questions the owner has not been asked yet. They are listed here so a reader
// does not mistake the shortened OPEN_OWNER_DECISIONS list for "nothing left to decide".
// None of these block Phase 1, which fixes contracts against synthetic fixtures only.
export const OPEN_LANE_QUESTIONS = [
  { lane: '1E', question: 'release artifact store location and owner', blocks: 'first real deployment' },
  { lane: '1E', question: 'binding promotion and rollback authority', blocks: 'first real promotion' },
  { lane: '1B', question: 'which source surfaces are in scope for inventory', blocks: 'phase_2_real_material' },
  { lane: '1A', question: 'high security project isolation threshold', blocks: 'first restricted project' },
];

export function assertParameterUsable(name) {
  const stillOpen = OPEN_OWNER_DECISIONS.find((d) => d.affects.includes(name));
  if (stillOpen) return { usable: true, settled: false, pendingDecision: stillOpen.id };
  return { usable: true, settled: true };
}
