// Deterministic Engine kernel — public surface.
//
// The kernel compares an expected state to an observed state and reports what is missing,
// unknown, or in conflict. It invokes no learned model, holds no project material, and
// accepts nothing on a human's behalf. Everything it exports is a pure function over
// supplied values, so a run can always be replayed from its recorded inputs.
//
// Location: guild_hall/engineering_engine. The engine canonical folder owner decision
// (D-P10-02) is closed, and the engine sits beside the providers it consumes through
// adapter contracts: guild_hall/rag, knowledge_graph, knowledge_access, knowledge_canon.
// See ../README.md.

export {
  CONTRACT_REVISION, CANONICAL, TIME_PRECISION,
  OPEN_OWNER_DECISIONS, CLOSED_OWNER_DECISIONS, OPEN_LANE_QUESTIONS, ARRAY_ORDER_RULES,
} from './contract_config.mjs';
export { ContractError, CODES as ERROR_CODES } from './errors.mjs';

// PC-03, PC-11
export { canonicalise, inspectInstant, isCanonicalInstant, compareCodePoints, daysInMonth } from './canonical.mjs';

// PC-01, PC-02
export {
  classifyRef, isWellFormedRef, RESOLUTION,
  sameEntity, sameRevision, sameContent,
  PLACEHOLDERS, isPlaceholder, assertNotPlaceholder, inspectIdentifierOpacity,
} from './identity.mjs';

// PC-06, PC-07
export {
  deterministicReplayFingerprint, projectFingerprintInput, splitProvenance, classifyRerun, sha256Hex,
} from './fingerprint.mjs';

// PC-04
export {
  AUTHORITY_FAMILIES, APPLICABILITY, APPLICABILITY_COMPONENTS,
  resolveApplicability, resolveAuthority, forbidRankArithmetic,
  SCOPE, assertSearchScope,
} from './authority.mjs';

// PC-05
export {
  CANON_CLAIM_CEILING, EVIDENCE_CLAIM_CEILING,
  isCanonCeiling, isEvidenceCeiling, assertCanonCeiling, assertEvidenceCeiling,
  convertBetweenAxes, SNAPSHOT_CLAIM_CEILING_AXIS, readSnapshotClaimCeiling,
  assertCanonAxisAbsentFromSnapshot, assertExplicitFieldName,
} from './ceilings.mjs';

// PC-08
export {
  DISPOSITION, CHAIN, compareEvents, foldCurrentView, routeDisposition, assertChainStep,
} from './finding.mjs';

// PC-09
export {
  VERDICT, BASELINE_PHASE, ALLOWED_AUTHORITATIVE_RETRIEVAL,
  evaluate, inspectActiveEligibility, classifyLegacyMaterial, advisoryFieldsAbsent,
} from './execution_mode.mjs';

// Lane 1C — typed graph projection
export {
  NODE_TYPES, EDGE_TYPES, EDGE_SHAPES, REQUIRED_EDGE_ATTRIBUTES,
  validateEdge, assertNotTruthOwner, projectionDescriptor,
} from './graph.mjs';

// Lane 1C — bounded Context Capsule
export {
  SELECTOR_CONTRACT_VERSION, MAX_HOPS_CEILING, REQUIRED_SELECTOR_FIELDS, REQUIRED_BUDGETS, RANKING_KEYS,
  selectCapsule, contextCapsuleFingerprint, compareCandidates, assertNoRawPayload,
} from './capsule.mjs';

// Lane 1D — MCP request admission and concurrency
export {
  REQUIRED_REQUEST_FIELDS, CEILINGS, OPERATIONS,
  admitRequest, resolveIdempotency, recordIdempotency, acquireLane, releaseLane, cacheKey,
  assertCacheEntryServesRequest, assertEvidenceWithinKnownAt, classifyConcurrency,
} from './mcp_contract.mjs';

// D-P10-03 — the serialised identifier minting boundary
export {
  MINTED_FAMILIES, DERIVED_FAMILIES, CALLER_FAMILIES, MINTING_LANE,
  classifyIdentifierFamily, acquireMintingLane, assertMintingLaneHeld, mint,
  candidateHandle, isCandidateHandle, assertIsMintedIdentifier,
  assertParallelStageMayNotMint, evaluateMinterOutage,
} from './minting.mjs';

// Lane 1E — module ABI, project binding, release artifact, rollback
export {
  REQUIRED_MANIFEST_FIELDS, REQUIRED_BINDING_FIELDS,
  parseAbiRange, abiSatisfies, validateManifest, validateBinding, bindingRevision,
  planModuleTransition, validateRelease, planRollback,
} from './module_binding.mjs';

// Lane 1B — source inventory, byte custody, eligibility
export {
  CUSTODY_MODE, PRESENCE, LICENSE_STATES, SENSITIVITY_STATES, REQUIRED_INVENTORY_FIELDS,
  assertSingleCustodyMode, validateInventoryRecord, validateCitedSpan, assertSpanRetained,
  classifyIntegrity, evaluateReplayability, evaluateEligibility, planRetentionWithdrawal,
} from './custody.mjs';

// Lane 1B — knowledge lineage
export {
  CHAIN_KINDS, REQUIRED_EXTRACTION_FIELDS,
  assertWithinSourceAuthority, propagateProvenance, validateExtractionRun,
  validateLineageChain, assertNoOrphanClaim,
} from './lineage.mjs';

// Lane 1A — snapshot envelope, state axes, Finding schema
export {
  AXIS, GAP_TYPE, REQUIRED_ENVELOPE_FIELDS, REQUIRED_FINDING_FIELDS,
  validateStateElement, compareStates, classifyUnmatchedObservation, assertMissingIsConfirmed,
  validateFinding, validateSnapshotEnvelope, assertSnapshotImmutable, assertProvenanceLayersSeparate,
} from './snapshot.mjs';

// Lane 1A — Context Request schema and the P5 to P8 boundary contract
export {
  SERIALISED_BOUNDARIES, BOUNDARY_LANES, BOUNDARY_EFFECTS, P7,
  REQUIRED_CONTEXT_REQUEST_FIELDS,
  assertStageDefined, assertBoundarySeparation, evaluateP5Acceptance, evaluateGenerationAdvance,
  validateContextRequest, assertZeroErpDelta, evaluateP8Write,
} from './pipeline.mjs';

/**
 * What this kernel deliberately does not do. Kept in code so a future caller does not have
 * to infer the boundary from documentation alone.
 */
export const NON_CAPABILITIES = Object.freeze([
  'invoke a local or remote learned model',
  'accept context on behalf of a registered human',
  'advance an accepted context generation',
  'write to the ERP task ledger',
  'generate identifier values (the serialised boundary supplies them; the kernel validates and registers)',
  'read actual project material, source bodies, or credentials',
  'invoke embedding or semantic reranking on the authoritative path',
]);
