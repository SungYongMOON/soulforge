import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';

import {
  classifyCmvSourceEvidence,
  cmvAcceptedSourceBindingInput,
  CMV_SOURCE_AUTHORITY_CATALOG,
  CMV_PUBLIC_SYNTHETIC_SCOPE,
  CMV_SOURCE_CLASSIFICATION_CODES,
  validateConsumedCmvSourceClassification,
} from '../source/calibration_measurement_validity_source_classification.mjs';
import {
  deriveCalibrationMeasurementValiditySourceRows,
} from '../derivation/calibration_measurement_validity_source_derivation.mjs';
import {
  adaptCalibrationMeasurementValidityTypedFacts,
  CMV_TYPED_FACT_CODES,
} from '../typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs';
import {
  deriveCalibrationMeasurementValidityObservationCandidates,
} from '../observation/calibration_measurement_validity_observation.mjs';
import {
  assessCalibrationMeasurementValidity,
} from '../evaluator/calibration_measurement_validity.mjs';
import {
  buildCalibrationMeasurementValidityGuidance,
  validateCalibrationMeasurementValidityGuidance,
} from '../guidance/calibration_measurement_validity_guidance.mjs';
import {
  calibrationMeasurementValiditySha256,
  canonicalizeCalibrationMeasurementValidity,
} from '../shared/calibration_measurement_validity_canonical_digest.mjs';
import {
  CALIBRATION_MEASUREMENT_VALIDITY_READ_ONLY_MCP_TOOLS,
  invokeCalibrationMeasurementValidityReadOnlyMcp,
} from '../mcp/calibration_measurement_validity_read_only_mcp.mjs';
import {
  calculateCmvCoreTypedFactsDigest,
  calibrationMeasurementValidityAdapter,
} from '../evaluator/calibration_measurement_validity_evaluator_adapter.mjs';
import {
  deriveCalibrationMeasurementValidityRulesetReference,
} from '../compiler/calibration_measurement_validity_compiler_adapter.mjs';
import {
  evaluateCmvSourceBoundProfileRequirements,
} from '../profile/calibration_measurement_validity_source_bound_profile.mjs';
import {
  buildCalibrationMeasurementValidityPublicSyntheticRequest,
} from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import {
  adaptProjectEvidence,
  arrayOrderRules,
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
  withoutNulls,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

function deepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

function reference(entityId, fill) {
  return {
    entity_id: `synthetic:${entityId}`,
    revision_id: 'v1',
    content_id: `sha256:${fill.repeat(64)}`,
  };
}

function directSource(sourceId = 'NIST-METROLOGICAL-TRACEABILITY-FAQ') {
  return classifyCmvSourceEvidence(cmvAcceptedSourceBindingInput(sourceId, 'synthetic_direct'));
}

function ragSource() {
  return classifyCmvSourceEvidence(cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'rag_retrieval_only'));
}

function sourceBoundProfile() {
  return {
    profile_id: 'synthetic-cmv-direct-source-profile',
    domain_engine_id: 'calibration_measurement_validity',
    revision_or_hash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    extends_or_base_pin: 'calibration_measurement_validity@0.1.0',
    source_refs: ['source:NIST-METROLOGICAL-TRACEABILITY-FAQ'],
    operations: [{
      op: 'source_bound_requirements',
      requirement_id: 'cmv-direct-source-proof',
      required_source_ids: ['NIST-METROLOGICAL-TRACEABILITY-FAQ'],
      required_classification: 'official_public_direct',
    }],
  };
}

function typedFactPacket(sourceClassifications = [directSource()]) {
  return {
    schema_version: 'soulforge.calibration_measurement_validity.source_bound_typed_facts.v1',
    domain_input: buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
    source_classifications: sourceClassifications,
    fact_provenance: {
      instrument_identity: { source_id: sourceClassifications[0].source_id, source_ref: structuredClone(sourceClassifications[0].source_ref) },
      calibration_status: { source_id: sourceClassifications[0].source_id, source_ref: structuredClone(sourceClassifications[0].source_ref) },
      measurement_suitability: { source_id: sourceClassifications[0].source_id, source_ref: structuredClone(sourceClassifications[0].source_ref) },
      traceability: { source_id: sourceClassifications[0].source_id, source_ref: structuredClone(sourceClassifications[0].source_ref) },
      environment: { source_id: sourceClassifications[0].source_id, source_ref: structuredClone(sourceClassifications[0].source_ref) },
      exception: { source_id: sourceClassifications[0].source_id, source_ref: structuredClone(sourceClassifications[0].source_ref) },
    },
  };
}

function rehashCoreAssembly(assembly) {
  const clean = withoutNulls(assembly.effective_rule_set);
  const digest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(clean, arrayOrderRules(clean))}`);
  assembly.assembly_digest = digest;
  assembly.compilation_trace.effective_ruleset_digest = digest;
}

test('source classification separates direct official support from RAG-only and controlled references', () => {
  const direct = directSource();
  assert.equal(direct.classification, 'official_public_direct');
  assert.equal(direct.verdict_eligible, true);
  assert.equal(direct.claim_ceiling, 'source_supported');

  const rag = ragSource();
  assert.equal(rag.classification, 'rag_retrieval_only');
  assert.equal(rag.verdict_eligible, false);
  assert.equal(rag.hold_code, CMV_SOURCE_CLASSIFICATION_CODES.RAG_NOT_VERDICT_AUTHORITY);

  const controlled = classifyCmvSourceEvidence(cmvAcceptedSourceBindingInput('ISO-IEC-17025-2017-CITATION-ONLY', 'controlled_citation_only'));
  assert.equal(controlled.classification, 'controlled_citation_only');
  assert.equal(controlled.verdict_eligible, false);

  assert.throws(
    () => classifyCmvSourceEvidence({ source_id: 'UNREGISTERED-SOURCE', source_ref: reference('unknown-source', 'e') }),
    (error) => error?.code === CMV_SOURCE_CLASSIFICATION_CODES.UNKNOWN_SOURCE,
  );
});

test('the source classification catalog is exactly aligned with the public source inventory', () => {
  const inventoryPath = fileURLToPath(new URL('../contracts/public_source_inventory_v1.json', import.meta.url));
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const sourceIds = inventory.sources.map((source) => source.source_id).sort();
  assert.deepEqual(Object.keys(CMV_SOURCE_AUTHORITY_CATALOG).sort(), sourceIds);
  for (const source of inventory.sources) {
    assert.equal(CMV_SOURCE_AUTHORITY_CATALOG[source.source_id].authority, source.authority);
  }
});

test('every closed source binding is a valid pinned SHA-256 identity with a classifier round-trip', () => {
  const seen = new Set();
  for (const [sourceId, catalog] of Object.entries(CMV_SOURCE_AUTHORITY_CATALOG)) {
    for (const [bindingKind, binding] of Object.entries(catalog.bindings)) {
      assert.match(binding.source_ref.content_id, /^sha256:[a-f0-9]{64}$/);
      const identity = `${sourceId}\u001f${binding.source_ref.entity_id}\u001f${binding.source_ref.revision_id}\u001f${binding.source_ref.content_id}`;
      assert.equal(seen.has(identity), false, identity);
      seen.add(identity);
      const classified = classifyCmvSourceEvidence(cmvAcceptedSourceBindingInput(sourceId, bindingKind));
      assert.equal(classified.binding_kind, bindingKind);
      assert.equal(classified.source_ref.content_id, binding.source_ref.content_id);
      assert.equal(classified.verdict_eligible, binding.verdict_eligible);
      assert.equal(classified.classification, binding.classification);
    }
  }
});

test('source derivation rows preserve source references and never raise a RAG-only claim ceiling', () => {
  const directRows = deriveCalibrationMeasurementValiditySourceRows([directSource()]);
  const identity = directRows.rows.find((row) => row.criterion_id === 'CMV-INSTRUMENT-IDENTITY-01');
  assert.equal(identity.derivation_state, 'direct_source_bound');
  assert.equal(identity.claim_ceiling, 'source_supported');
  assert.equal(identity.source_refs[0].source_ref.content_id, directSource().source_ref.content_id);

  const ragRows = deriveCalibrationMeasurementValiditySourceRows([ragSource()]);
  const ragIdentity = ragRows.rows.find((row) => row.criterion_id === 'CMV-INSTRUMENT-IDENTITY-01');
  assert.equal(ragIdentity.derivation_state, 'source_hold');
  assert.equal(ragIdentity.claim_ceiling, 'observed');
  assert.equal(ragRows.receipt.rag_is_not_derivation_authority, true);
});

test('source-bound typed facts preserve provenance and reject RAG-only facts as evaluator input', () => {
  const packet = typedFactPacket();
  const before = JSON.stringify(packet);
  const typed = adaptCalibrationMeasurementValidityTypedFacts(packet);
  assert.equal(JSON.stringify(packet), before);
  assert.equal(typed.schema_version, 'soulforge.calibration_measurement_validity.typed_facts.v1');
  assert.equal(typed.typed_fact_receipt.provenance_count, 6);
  assert.equal(deepFrozen(typed), true);

  assert.throws(
    () => adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket([ragSource()])),
    (error) => error?.code === CMV_TYPED_FACT_CODES.SOURCE_HOLD,
  );

  const inverted = typedFactPacket();
  inverted.domain_input.evaluation_context.known_at = '2026-08-26T09:59:59.000Z';
  assert.throws(
    () => adaptCalibrationMeasurementValidityTypedFacts(inverted),
    (error) => error?.code === CMV_TYPED_FACT_CODES.INVALID_INPUT,
  );

  assert.deepEqual(typed.request.project_binding_ref, CMV_PUBLIC_SYNTHETIC_SCOPE.project_binding_ref);
  assert.equal(typed.request.evaluation_context.tested_at, CMV_PUBLIC_SYNTHETIC_SCOPE.tested_at);
  assert.equal(typed.request.evaluation_context.known_at, CMV_PUBLIC_SYNTHETIC_SCOPE.known_at);

  const liveLike = typedFactPacket();
  liveLike.domain_input.project_binding_ref = reference('live-cmv-audit', 'e');
  assert.throws(
    () => adaptCalibrationMeasurementValidityTypedFacts(liveLike),
    (error) => error?.code === CMV_TYPED_FACT_CODES.SOURCE_HOLD,
  );
});

test('forged direct source-classification envelopes cannot satisfy Typed Facts or source-bound Profiles', () => {
  const forged = structuredClone(ragSource());
  forged.classification = 'official_public_direct';
  forged.verdict_eligible = true;
  forged.claim_ceiling = 'source_supported';
  forged.hold_code = null;
  forged.retrieval_path = 'direct';
  forged.applicability_state = 'in_scope';
  forged.access_class = 'official_public';
  forged.direct_access_verified = true;
  forged.binding_kind = 'synthetic_direct';
  forged.claim_ceiling = 'source_supported';
  forged.hold_code = null;
  forged.retrieval_path = 'direct';
  forged.applicability_state = 'in_scope';
  assert.throws(
    () => adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket([forged])),
    (error) => error?.code === CMV_TYPED_FACT_CODES.SOURCE_HOLD,
  );

  const bindings = resolveProfileBindings(null, sourceBoundProfile());
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, bindings);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, {
      request: buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
      source_classifications: [forged],
    }),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const extraField = structuredClone(directSource());
  extraField.unapproved_extra = true;
  assert.throws(
    () => adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket([extraField])),
    (error) => error?.code === CMV_TYPED_FACT_CODES.SOURCE_HOLD,
  );

  const directTyped = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const forgedTyped = structuredClone(directTyped);
  forgedTyped.source_classifications[0] = forged;
  assert.throws(
    () => deriveCalibrationMeasurementValidityObservationCandidates(forgedTyped),
    (error) => error?.code === 'CMV_OBSERVATION_INVALID_INPUT',
  );
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(directTyped);
  const forgedObservation = structuredClone(observation);
  forgedObservation.candidates[0].source_envelope = forged;
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({
      assessment: evaluate(calibrationMeasurementValidityAdapter, assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []), directTyped).assessment,
      observation: forgedObservation,
    }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
});

test('Core assembly accepts a source-bound profile and holds evaluation when required source class is absent', () => {
  const bindings = resolveProfileBindings(null, sourceBoundProfile());
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, bindings);
  assert.equal(effective.rule_count, 9);
  assert.equal(effective.effective_rule_set.source_bound_profile_requirements.length, 1);
  assert.equal(effective.compilation_trace.profiles[0].operation_digest, bindings[0].operation_digest);
  assert.equal(effective.effective_rule_set.source_bound_profile_requirements[0].operation_digest, bindings[0].operation_digest);

  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const supported = evaluate(calibrationMeasurementValidityAdapter, effective, typed);
  assert.equal(supported.assessment.profile_evaluation.status, 'supported');
  assert.equal(supported.assessment.result_status, 'valid');
  assert.equal(supported.receipt.ruleset_ref.content_id, effective.effective_rule_set.ruleset_ref.content_id);
  assert.notEqual(supported.receipt.assessment_sha256, '');

  const ragEnvelope = {
    request: buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
    source_classifications: [ragSource()],
  };
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, ragEnvelope),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID')),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const invalidTemporal = structuredClone(typed);
  invalidTemporal.request.evaluation_context.known_at = '2026-08-26T09:59:59.000Z';
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, invalidTemporal),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  const mismatchedProvenance = structuredClone(typed);
  mismatchedProvenance.fact_provenance.environment.source_ref = reference('foreign-source', 'f');
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, mismatchedProvenance),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const notApplicable = evaluateCmvSourceBoundProfileRequirements([], []);
  assert.equal(notApplicable.claim_ceiling, 'observed');

  const completeOtherSource = typedFactPacket([directSource('NIST-TN-1297-1994')]);
  const otherTyped = adaptCalibrationMeasurementValidityTypedFacts(completeOtherSource);
  const missingRequiredSource = evaluate(calibrationMeasurementValidityAdapter, effective, otherTyped);
  assert.equal(missingRequiredSource.assessment.profile_evaluation.status, 'hold');
  assert.equal(missingRequiredSource.assessment.profile_evaluation.claim_ceiling, 'observed');
  assert.equal(missingRequiredSource.assessment.result_status, 'unknown');

  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, null),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const tampered = structuredClone(effective);
  tampered.effective_rule_set.source_bound_profile_requirements[0].required_classification = 'rag_retrieval_only';
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, tampered, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  const tamperedSources = structuredClone(effective);
  tamperedSources.effective_rule_set.source_bound_profile_requirements[0].required_source_ids = ['NIST-TN-1297-1994'];
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, tamperedSources, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  const tamperedSourceRefs = structuredClone(effective);
  tamperedSourceRefs.effective_rule_set.source_bound_profile_requirements[0].source_refs = [
    'source:NIST-METROLOGICAL-TRACEABILITY-FAQ',
    'source:NIST-TN-1297-1994',
  ];
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, tamperedSourceRefs, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  const tamperedProvenance = structuredClone(effective);
  tamperedProvenance.effective_rule_set.profile_rule_provenance['cmv-direct-source-proof'].operation_item_digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, tamperedProvenance, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  const staleCoreTrace = structuredClone(effective);
  staleCoreTrace.effective_rule_set.source_bound_profile_requirements[0].source_refs = ['source:NIST-TN-1297-1994'];
  staleCoreTrace.effective_rule_set.source_bound_profile_requirements[0].required_source_ids = ['NIST-TN-1297-1994'];
  staleCoreTrace.effective_rule_set.profile_rule_provenance['cmv-direct-source-proof'].source_refs = ['source:NIST-TN-1297-1994'];
  staleCoreTrace.effective_rule_set.ruleset_ref = deriveCalibrationMeasurementValidityRulesetReference(
    staleCoreTrace.effective_rule_set.source_bound_profile_requirements,
    staleCoreTrace.effective_rule_set.profile_rule_provenance,
  );
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, staleCoreTrace, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const baseSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_schema_v0.json', import.meta.url)), 'utf8'));
  const sourceBoundSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_source_bound_schema_v1.json', import.meta.url)), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat('date-time', /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/);
  ajv.addSchema(baseSchema);
  ajv.addSchema(sourceBoundSchema);
  const validateRuleset = ajv.getSchema(`${baseSchema.$id}#/$defs/ruleset`);
  const validateAssessment = ajv.getSchema(`${baseSchema.$id}#/$defs/assessment`);
  const validateTyped = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/typed_facts`);
  assert.equal(validateRuleset(effective.effective_rule_set), true, JSON.stringify(validateRuleset.errors));
  assert.equal(validateAssessment(supported.assessment), true, JSON.stringify(validateAssessment.errors));
  assert.equal(validateTyped(typed), true, JSON.stringify(validateTyped.errors));
});

test('observation and guidance are deterministic, source-bound, and do not change the assessment', () => {
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
  assert.equal(observation.effects.file_reads, 0);
  assert.equal(observation.effects.file_writes, 0);
  assert.equal(observation.candidates.length, 6);
  assert.equal(observation.candidates.every((candidate) => candidate.source_classification === 'official_public_direct'), true);

  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const expired = evaluate(
    calibrationMeasurementValidityAdapter,
    effective,
    buildCalibrationMeasurementValidityPublicSyntheticRequest('EXPIRED'),
  );
  const guidance = buildCalibrationMeasurementValidityGuidance({ assessment: expired.assessment, observation });
  assert.equal(guidance.judgment_changed, false);
  assert.equal(guidance.effects.external_mutations, 0);
  assert.ok(guidance.cards.some((card) => card.action_code === 'obtain_current_calibration_evidence'));
  assert.equal(deepFrozen(guidance), true);
  const receiptLess = structuredClone(observation);
  delete receiptLess.receipt;
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: expired.assessment, observation: receiptLess }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  const staleReceipt = structuredClone(observation);
  staleReceipt.receipt.candidate_count = 5;
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: expired.assessment, observation: staleReceipt }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
});

test('read-only MCP exposes only pure package calls and the public synthetic pilot is zero-write replayable', () => {
  assert.equal(CALIBRATION_MEASUREMENT_VALIDITY_READ_ONLY_MCP_TOOLS.every((tool) => tool.write === false), true);
  const mcp = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.classify_source', {
    source: cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'synthetic_direct'),
  });
  assert.equal(mcp.effects.external_mutations, 0);
  assert.equal(mcp.structured.classification, 'official_public_direct');
  const evaluationMcp = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.evaluate_public_synthetic', { case_id: 'VALID' });
  assert.equal(evaluationMcp.structured.assessment.result_status, 'valid');
  assert.equal(evaluationMcp.structured.receipt.schema_version, 'soulforge.calibration_measurement_validity.receipt.v0');
  const guidanceMcp = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.guidance_public_synthetic', { case_id: 'EXPIRED' });
  assert.equal(guidanceMcp.structured.receipt.assessment_result_preserved, true);
  assert.equal(guidanceMcp.structured.receipt.source_bound_candidate_count, 6);
  assert.equal(guidanceMcp.structured.receipt.guidance_digest.startsWith('sha256:'), true);

  const runnerPath = fileURLToPath(new URL('../tools/calibration_measurement_validity_zero_write_pilot_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'cmv-q1-pilot-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    const second = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    const output = JSON.parse(first.stdout);
    assert.equal(output.pilot_status, 'public_synthetic_only');
    assert.equal(output.effects.file_writes, 0);
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('hostile profile operations and write-like MCP calls fail closed', () => {
  const hostileProfile = sourceBoundProfile();
  hostileProfile.operations = [{ op: 'add', rule: {} }];
  const hostileBindings = resolveProfileBindings(null, hostileProfile);
  assert.throws(
    () => assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, hostileBindings),
    (error) => error?.code === 'CMV_PROFILE_OPERATION_UNSUPPORTED',
  );
  const validBindings = resolveProfileBindings(null, sourceBoundProfile());
  const invalidOrderBinding = structuredClone(validBindings[0]);
  invalidOrderBinding.order = '0';
  assert.throws(
    () => calibrationMeasurementValidityAdapter.compile([invalidOrderBinding]),
    (error) => error?.code === 'CMV_PROFILE_BINDING_INVALID',
  );
  const invalidDigestBinding = structuredClone(validBindings[0]);
  invalidDigestBinding.operation_digest = '0'.repeat(64);
  assert.throws(
    () => calibrationMeasurementValidityAdapter.compile([invalidDigestBinding]),
    (error) => error?.code === 'CMV_PROFILE_BINDING_INVALID',
  );
  const nullProfile = sourceBoundProfile();
  nullProfile.operations = [null];
  let nullBindings = null;
  let coreNullError = null;
  try {
    nullBindings = resolveProfileBindings(null, nullProfile);
  } catch (error) {
    coreNullError = error;
  }
  if (nullBindings === null) {
    assert.match(coreNullError?.code ?? '', /^(?:PROFILE_BINDING_INVALID|PROFILE_OPERATIONS_INVALID)$/u);
  } else {
    assert.throws(
      () => assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, nullBindings),
      (error) => error?.code === 'CMV_PROFILE_OPERATION_INVALID',
    );
  }
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.write_exception', {}),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_UNKNOWN_TOOL',
  );
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.evaluate_public_synthetic', { case_id: 'UNDECLARED' }),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_INPUT_INVALID',
  );
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.guidance_public_synthetic', { case_id: 'UNDECLARED' }),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_INPUT_INVALID',
  );
});

test('base Core evaluation rejects opaque outer wrappers before a Proxy getter can run', () => {
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const request = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');

  for (const behavior of ['return', 'throw']) {
    let trapCount = 0;
    const wrapper = new Proxy({ request }, {
      get(target, property, receiver) {
        trapCount += 1;
        if (behavior === 'throw') throw new Error('native outer-wrapper getter must not escape');
        return Reflect.get(target, property, receiver);
      },
    });
    let thrown = null;
    try {
      evaluate(calibrationMeasurementValidityAdapter, effective, wrapper);
    } catch (error) {
      thrown = error;
    }
    assert.equal(trapCount, 0, `${behavior} outer-wrapper Proxy getter must not run`);
    assert.match(thrown?.code ?? '', /^CMV_/u, `${behavior} wrapper must fail with a declared CMV ContractError`);
  }
});

test('derived evaluation refuses deep Typed Facts getters before time or provenance admission', () => {
  const bindings = resolveProfileBindings(null, sourceBoundProfile());
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, bindings);
  const typed = structuredClone(adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket()));
  let trapCount = 0;
  typed.request.evaluation_context = new Proxy(typed.request.evaluation_context, {
    get(target, property, receiver) {
      trapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  let thrown = null;
  try {
    evaluate(calibrationMeasurementValidityAdapter, effective, typed);
  } catch (error) {
    thrown = error;
  }
  assert.equal(trapCount, 0, 'derived Typed Facts nested getter must not run');
  assert.match(thrown?.code ?? '', /^CMV_/u, 'derived Typed Facts must fail with a declared CMV ContractError');
});

test('guidance and read-only MCP reject hostile argument wrappers before getters run', () => {
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
  const assessment = evaluate(
    calibrationMeasurementValidityAdapter,
    assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []),
    typed,
  ).assessment;
  let guidanceTrapCount = 0;
  const guidanceInput = new Proxy({ assessment, observation }, {
    get(target, property, receiver) {
      guidanceTrapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  let guidanceError = null;
  try {
    buildCalibrationMeasurementValidityGuidance(guidanceInput);
  } catch (error) {
    guidanceError = error;
  }
  assert.equal(guidanceTrapCount, 0, 'guidance must not read a hostile outer wrapper');
  assert.equal(guidanceError?.code, 'CMV_GUIDANCE_INVALID_INPUT');

  let mcpTrapCount = 0;
  const mcpArgs = new Proxy({ case_id: 'VALID' }, {
    get(target, property, receiver) {
      mcpTrapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  let mcpError = null;
  try {
    invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.evaluate_public_synthetic', mcpArgs);
  } catch (error) {
    mcpError = error;
  }
  assert.equal(mcpTrapCount, 0, 'MCP must not read a hostile args wrapper');
  assert.equal(mcpError?.code, 'CMV_READ_ONLY_MCP_INPUT_INVALID');
});

test('base Core assembly admission rejects stale traces, extra fields, and nested getters', () => {
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const request = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  const stale = structuredClone(effective);
  stale.compilation_trace.effective_ruleset_digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, stale, request),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const extra = structuredClone(effective);
  extra.unapproved_outer_field = true;
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, extra, request),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const nested = structuredClone(effective);
  let trapCount = 0;
  nested.compilation_trace = new Proxy(nested.compilation_trace, {
    get(target, property, receiver) {
      trapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  let thrown = null;
  try {
    evaluate(calibrationMeasurementValidityAdapter, nested, request);
  } catch (error) {
    thrown = error;
  }
  assert.equal(trapCount, 0, 'nested Core trace getter must not run');
  assert.equal(thrown?.code, 'CMV_EFFECTIVE_RULESET_INVALID');
});

test('base evaluation admits only exact raw or complete Typed Facts lanes and rejects hybrids', () => {
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const raw = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  assert.equal(evaluate(calibrationMeasurementValidityAdapter, effective, raw).assessment.result_status, 'valid');
  assert.equal(evaluate(calibrationMeasurementValidityAdapter, effective, typed).assessment.result_status, 'valid');

  const hybrid = { request: raw, source_classifications: [] };
  const extraRaw = { ...raw, source_classifications: [] };
  const staleReceipt = structuredClone(typed);
  staleReceipt.typed_fact_receipt.source_classifications_digest = `sha256:${'0'.repeat(64)}`;
  const staleTime = structuredClone(typed);
  staleTime.request.evaluation_context.known_at = '2026-08-26T09:59:59.000Z';
  const forgedAuthority = structuredClone(typed);
  forgedAuthority.source_classifications[0].authority = 'forged authority';
  const hidden = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  Object.defineProperty(hidden, 'hidden', { value: true, enumerable: false });
  const accessor = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  Object.defineProperty(accessor, 'opaque', { enumerable: true, get() { throw new Error('getter must not run'); } });
  const symbolKeyed = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  symbolKeyed[Symbol('hidden')] = true;
  const customPrototype = Object.assign(Object.create(null), buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'));
  const aliased = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  aliased.traceability = aliased.environment;
  const cyclic = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  cyclic.instrument.self = cyclic;
  const sparse = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  sparse.instrument.history = [];
  sparse.instrument.history[1] = 'unexpected';

  for (const invalid of [
    hybrid, extraRaw, staleReceipt, staleTime, forgedAuthority, hidden, accessor,
    symbolKeyed, customPrototype, aliased, cyclic, sparse,
  ]) {
    assert.throws(
      () => evaluate(calibrationMeasurementValidityAdapter, effective, invalid),
      (error) => typeof error?.code === 'string' && error.code.startsWith('CMV_'),
    );
  }
});

test('derived ruleset ingress rejects rehashed extra provenance and reference fields', () => {
  const bindings = resolveProfileBindings(null, sourceBoundProfile());
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, bindings);
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());

  const extraProvenance = structuredClone(effective);
  extraProvenance.effective_rule_set.profile_rule_provenance['cmv-direct-source-proof'].unapproved_field = 'forged';
  extraProvenance.effective_rule_set.ruleset_ref = deriveCalibrationMeasurementValidityRulesetReference(
    extraProvenance.effective_rule_set.source_bound_profile_requirements,
    extraProvenance.effective_rule_set.profile_rule_provenance,
  );
  rehashCoreAssembly(extraProvenance);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, extraProvenance, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const extraReference = structuredClone(effective);
  extraReference.effective_rule_set.ruleset_ref.unapproved_field = 'forged';
  rehashCoreAssembly(extraReference);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, extraReference, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
});

test('guidance and read-only MCP reject extra payload fields rather than ignoring them', () => {
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
  const assessment = evaluate(
    calibrationMeasurementValidityAdapter,
    assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []),
    typed,
  ).assessment;
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment, observation, unapproved: true }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.evaluate_public_synthetic', {
      case_id: 'VALID',
      unapproved: true,
    }),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_INPUT_INVALID',
  );
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.classify_source', {
      source: cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'synthetic_direct'),
      unapproved: true,
    }),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_INPUT_INVALID',
  );
});

test('guidance rejects malformed assessment shapes before deriving cards', () => {
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
  const assessment = evaluate(
    calibrationMeasurementValidityAdapter,
    assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []),
    typed,
  ).assessment;
  const extraAssessment = { ...assessment, unapproved: true };
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: extraAssessment, observation }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
});

test('published schemas and exact output contracts cover base, derived, MCP, and pilot emissions', () => {
  const baseSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_schema_v0.json', import.meta.url)), 'utf8'));
  const sourceBoundSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_source_bound_schema_v1.json', import.meta.url)), 'utf8'));
  const descriptor = YAML.parse(readFileSync(fileURLToPath(new URL('../engine.yaml', import.meta.url)), 'utf8'));

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat('date-time', /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/);
  ajv.addSchema(baseSchema);
  ajv.addSchema(sourceBoundSchema);
  const validateDescriptor = ajv.compile(baseSchema);
  const validateRuleset = ajv.getSchema(`${baseSchema.$id}#/$defs/ruleset`);
  const validateAssessment = ajv.getSchema(`${baseSchema.$id}#/$defs/assessment`);
  const validateTyped = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/typed_facts`);
  const validateObservation = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/observation_candidates`);
  const validateObservationReceipt = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/observation_receipt`);
  const validateGuidance = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/guidance`);
  const validateGuidanceReceipt = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/guidance_receipt`);
  const validateMcp = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/read_only_mcp`);
  const validatePilot = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/zero_write_pilot`);

  assert.equal(typeof validateDescriptor, 'function');
  assert.equal(typeof validateRuleset, 'function');
  assert.equal(typeof validateAssessment, 'function');
  assert.equal(typeof validateTyped, 'function');
  assert.equal(typeof validateObservation, 'function');
  assert.equal(typeof validateObservationReceipt, 'function');
  assert.equal(typeof validateGuidance, 'function');
  assert.equal(typeof validateGuidanceReceipt, 'function');
  assert.equal(typeof validateMcp, 'function');
  assert.equal(typeof validatePilot, 'function');

  // Engine descriptor matches schema
  assert.equal(validateDescriptor(descriptor), true, JSON.stringify(validateDescriptor.errors));

  const baseEffective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const raw = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  const base = evaluate(calibrationMeasurementValidityAdapter, baseEffective, raw);
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
  const guidance = buildCalibrationMeasurementValidityGuidance({ assessment: base.assessment, observation });
  const derivedEffective = assembleEffectiveRuleSet(
    calibrationMeasurementValidityAdapter,
    resolveProfileBindings(null, sourceBoundProfile()),
  );
  const derived = evaluate(calibrationMeasurementValidityAdapter, derivedEffective, typed);

  for (const [validate, output] of [
    [validateRuleset, baseEffective.effective_rule_set],
    [validateRuleset, derivedEffective.effective_rule_set],
    [validateAssessment, base.assessment],
    [validateAssessment, derived.assessment],
    [validateTyped, typed],
    [validateObservation, observation],
    [validateObservationReceipt, observation.receipt],
    [validateGuidance, guidance],
    [validateGuidanceReceipt, guidance.receipt],
  ]) {
    assert.equal(validate(output), true, JSON.stringify(validate.errors));
  }

  assert.equal(validateCalibrationMeasurementValidityGuidance(guidance, { assessment: base.assessment, observation }), true);
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(guidance),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(guidance, null),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(guidance, { assessment: derived.assessment, observation }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );

  assert.deepEqual(Object.keys(base.receipt).sort(), [
    'assessment_sha256', 'effects', 'execution_mode', 'input_sha256', 'replay_digest', 'ruleset_ref', 'schema_version', 'source_packet_ref',
  ]);
  assert.deepEqual(Object.keys(derived.receipt).sort(), [
    'assessment_sha256', 'effects', 'execution_mode', 'input_sha256', 'profile_evaluation', 'replay_digest', 'ruleset_ref', 'schema_version', 'source_packet_ref',
  ]);
  assert.deepEqual(Object.keys(typed.typed_fact_receipt).sort(), [
    'effects', 'known_at', 'project_binding_ref', 'provenance_count', 'schema_version', 'source_classifications_digest', 'valid_at',
  ]);
  assert.deepEqual(Object.keys(observation.receipt).sort(), [
    'candidate_count', 'candidates_digest', 'known_at', 'observation_is_not_fact_confirmation', 'project_binding_ref', 'schema_version', 'valid_at',
  ]);
  assert.deepEqual(observation.receipt.project_binding_ref, typed.typed_fact_receipt.project_binding_ref);
  assert.equal(observation.receipt.valid_at, typed.typed_fact_receipt.valid_at);
  assert.equal(observation.receipt.known_at, typed.typed_fact_receipt.known_at);
  assert.deepEqual(Object.keys(observation.receipt.project_binding_ref).sort(), [
    'content_id', 'entity_id', 'revision_id',
  ]);
  assert.deepEqual(Object.keys(guidance).sort(), [
    'assessment_digest', 'candidates_digest', 'cards', 'effects', 'judgment_changed', 'known_at', 'project_binding_ref', 'receipt', 'schema_version', 'valid_at',
  ]);
  assert.deepEqual(Object.keys(guidance.receipt).sort(), [
    'assessment_digest', 'assessment_result_preserved', 'candidates_digest', 'guidance_digest', 'known_at', 'project_binding_ref', 'schema_version', 'source_bound_candidate_count', 'valid_at',
  ]);
  assert.deepEqual(guidance.project_binding_ref, observation.receipt.project_binding_ref);
  assert.equal(guidance.valid_at, observation.receipt.valid_at);
  assert.equal(guidance.known_at, observation.receipt.known_at);
  assert.deepEqual(guidance.receipt.project_binding_ref, guidance.project_binding_ref);
  assert.equal(guidance.receipt.valid_at, guidance.valid_at);
  assert.equal(guidance.receipt.known_at, guidance.known_at);
  assert.equal(guidance.receipt.assessment_digest, guidance.assessment_digest);
  assert.equal(guidance.receipt.candidates_digest, guidance.candidates_digest);

  const mcpEvaluation = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.evaluate_public_synthetic', { case_id: 'VALID' });
  const mcpGuidance = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.guidance_public_synthetic', { case_id: 'VALID' });
  const mcpClassification = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.classify_source', {
    source: cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'synthetic_direct'),
  });
  assert.deepEqual(Object.keys(mcpEvaluation).sort(), ['effects', 'schema_version', 'structured']);
  assert.deepEqual(Object.keys(mcpEvaluation.structured).sort(), ['assessment', 'receipt', 'typed_fact_receipt']);
  assert.equal(validateAssessment(mcpEvaluation.structured.assessment), true, JSON.stringify(validateAssessment.errors));
  assert.equal(validateGuidance(mcpGuidance.structured), true, JSON.stringify(validateGuidance.errors));
  assert.equal(validateMcp(mcpEvaluation), true, JSON.stringify(validateMcp.errors));
  assert.equal(validateMcp(mcpGuidance), true, JSON.stringify(validateMcp.errors));
  assert.equal(validateMcp(mcpClassification), true, JSON.stringify(validateMcp.errors));
  assert.deepEqual(mcpEvaluation.effects, {
    network_calls: 0, file_reads: 0, file_writes: 0, external_mutations: 0,
  });
  assert.deepEqual(mcpGuidance.effects, mcpEvaluation.effects);
  assert.deepEqual(mcpClassification.effects, mcpEvaluation.effects);

  const pilotPath = fileURLToPath(new URL('../tools/calibration_measurement_validity_zero_write_pilot_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'cmv-output-parity-'));
  try {
    const pilot = spawnSync(process.execPath, [pilotPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(pilot.status, 0, pilot.stderr);
    const output = JSON.parse(pilot.stdout);
    assert.deepEqual(Object.keys(output).sort(), [
      'assessment', 'effects', 'guidance_receipt', 'observation_receipt', 'pilot_status', 'profile_status', 'schema_version',
    ]);
    assert.equal(output.schema_version, 'soulforge.calibration_measurement_validity.zero_write_pilot.v1');
    assert.equal(validateAssessment(output.assessment), true, JSON.stringify(validateAssessment.errors));
    assert.equal(validateObservationReceipt(output.observation_receipt), true, JSON.stringify(validateObservationReceipt.errors));
    assert.equal(validateGuidanceReceipt(output.guidance_receipt), true, JSON.stringify(validateGuidanceReceipt.errors));
    assert.equal(validatePilot(output), true, JSON.stringify(validatePilot.errors));
    assert.deepEqual(output.effects, mcpEvaluation.effects);
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  // C4 Differential Negatives: schema and runtime rejects
  const hostileRuleset = { ...baseEffective.effective_rule_set, unapproved: true };
  assert.equal(validateRuleset(hostileRuleset), false);

  const hostileRuleNestedExtra = structuredClone(baseEffective.effective_rule_set);
  hostileRuleNestedExtra.rules[0].nested_extra = 'bad';
  assert.equal(validateRuleset(hostileRuleNestedExtra), false);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, { ...baseEffective, effective_rule_set: hostileRuleNestedExtra }, raw),
    (err) => err?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const hostileRuleMissingField = structuredClone(baseEffective.effective_rule_set);
  delete hostileRuleMissingField.rules[0].purpose;
  assert.equal(validateRuleset(hostileRuleMissingField), false);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, { ...baseEffective, effective_rule_set: hostileRuleMissingField }, raw),
    (err) => err?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const hostileRuleWrongEnum = structuredClone(baseEffective.effective_rule_set);
  hostileRuleWrongEnum.rules[0].criterion_id = 'CMV-UNKNOWN-01';
  assert.equal(validateRuleset(hostileRuleWrongEnum), false);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, { ...baseEffective, effective_rule_set: hostileRuleWrongEnum }, raw),
    (err) => err?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const hostileProvenanceExtra = structuredClone(baseEffective.effective_rule_set);
  hostileProvenanceExtra.profile_rule_provenance = { 'cmv-extra': { invalid: 123 } };
  assert.equal(validateRuleset(hostileProvenanceExtra), false);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, { ...baseEffective, effective_rule_set: hostileProvenanceExtra }, raw),
    (err) => err?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const hostileTyped = { ...typed, unapproved: true };
  const hostileObservation = { ...observation, unapproved: true };
  const hostileObservationReceipt = { ...observation.receipt, unapproved: true };
  const hostileGuidance = { ...guidance, unapproved: true };
  const hostileGuidanceReceipt = { ...guidance.receipt, unapproved: true };
  const hostileMcp = { ...mcpEvaluation, unapproved: true };
  assert.equal(validateTyped(hostileTyped), false);
  assert.equal(validateObservation(hostileObservation), false);
  assert.equal(validateObservationReceipt(hostileObservationReceipt), false);
  assert.equal(validateGuidance(hostileGuidance), false);
  assert.equal(validateGuidanceReceipt(hostileGuidanceReceipt), false);
  assert.equal(validateMcp(hostileMcp), false);

  const hostileMcpNestedExtra = structuredClone(mcpEvaluation);
  hostileMcpNestedExtra.structured.nested_extra = 'bad';
  assert.equal(validateMcp(hostileMcpNestedExtra), false);

  const hostileMcpSwappedShape = structuredClone(mcpEvaluation);
  hostileMcpSwappedShape.structured = { schema_version: 'soulforge.unknown.v1', foo: 'bar' };
  assert.equal(validateMcp(hostileMcpSwappedShape), false);

  const hostileDescriptorExtra = { ...descriptor, unapproved_section: {} };
  assert.equal(validateDescriptor(hostileDescriptorExtra), false);
});

test('observation, guidance, and MCP reject nested Proxy payloads before any getter executes', () => {
  const typed = structuredClone(adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket()));
  let observationTrapCount = 0;
  typed.fact_provenance.environment.source_ref = new Proxy(typed.fact_provenance.environment.source_ref, {
    get(target, property, receiver) {
      observationTrapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => deriveCalibrationMeasurementValidityObservationCandidates(typed),
    (error) => error?.code === 'CMV_OBSERVATION_INVALID_INPUT',
  );
  assert.equal(observationTrapCount, 0);

  const validTyped = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = structuredClone(deriveCalibrationMeasurementValidityObservationCandidates(validTyped));
  const assessment = evaluate(
    calibrationMeasurementValidityAdapter,
    assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []),
    validTyped,
  ).assessment;
  let guidanceTrapCount = 0;
  observation.receipt = new Proxy(observation.receipt, {
    get(target, property, receiver) {
      guidanceTrapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment, observation }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.equal(guidanceTrapCount, 0);

  const cleanObs = deriveCalibrationMeasurementValidityObservationCandidates(validTyped);
  const validGuidance = buildCalibrationMeasurementValidityGuidance({ assessment, observation: cleanObs });
  let validateGuidanceTrapCount = 0;
  const proxyGuidance = structuredClone(validGuidance);
  proxyGuidance.receipt = new Proxy(proxyGuidance.receipt, {
    get(target, property, receiver) {
      validateGuidanceTrapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(proxyGuidance, { assessment, observation: cleanObs }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.equal(validateGuidanceTrapCount, 0);

  let validateContextTrapCount = 0;
  const proxyContext = {
    assessment: new Proxy(assessment, {
      get(target, property, receiver) {
        validateContextTrapCount += 1;
        return Reflect.get(target, property, receiver);
      },
    }),
    observation: cleanObs,
  };
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(validGuidance, proxyContext),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.equal(validateContextTrapCount, 0);

  const source = structuredClone(cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'synthetic_direct'));
  let mcpTrapCount = 0;
  source.source_ref = new Proxy(source.source_ref, {
    get(target, property, receiver) {
      mcpTrapCount += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.classify_source', { source }),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_INPUT_INVALID',
  );
  assert.equal(mcpTrapCount, 0);
});

test('canonical consumed-source validation rejects nested Proxy labels before canonicalization', () => {
  const source = structuredClone(directSource());
  let trapCount = 0;
  source.authority = new Proxy({}, {
    ownKeys() {
      trapCount += 1;
      throw new Error('canonicalization must not enumerate a caller Proxy');
    },
  });
  assert.throws(
    () => validateConsumedCmvSourceClassification(source, { requireDirect: true }),
    (error) => error?.code === 'CMV_SOURCE_CLASSIFICATION_CONSUMED_ENVELOPE_INVALID',
  );
  assert.equal(trapCount, 0);
});

test('Core four-argument lane strictly validates authority, cutoffs, and admits Core TypedProjectFacts', () => {
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const req = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  req.requested_measurement.required_accuracy_limit.value = 1;
  req.requested_measurement.maximum_uncertainty.value = 1;
  req.calibration_capability.accuracy_limit.value = 1;
  req.calibration_capability.uncertainty.expanded.value = 1;

  const projectBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.project_binding_ref.entity_id,
    domain_engine_id: 'calibration_measurement_validity',
    binding_revision_hash: req.project_binding_ref.revision_id,
    source_manifest_ref: 'synthetic-cmv-manifest-v0',
  };
  const cutoffs = {
    valid_at: req.evaluation_context.tested_at,
    known_at: req.evaluation_context.known_at,
  };
  const { typed_project_facts } = adaptProjectEvidence(
    projectBinding,
    { source_refs: ['source:NIST-METROLOGICAL-TRACEABILITY-FAQ'], observations: [req] },
    cutoffs,
  );

  // Successful evaluation with Core typed_project_facts
  const result = evaluate(calibrationMeasurementValidityAdapter, effective, typed_project_facts, {}, cutoffs);
  assert.equal(result.assessment.result_status, 'valid');
  assert.equal(result.receipt.schema_version, 'soulforge.calibration_measurement_validity.receipt.v0');
  assert.equal(deepFrozen(result), true);

  // Digest round-trip check
  const calculatedDigest = calculateCmvCoreTypedFactsDigest(typed_project_facts.facts);
  assert.equal(typed_project_facts.facts_digest, calculatedDigest);

  // Authority validation: explicit null, array, primitive, non-empty, symbol keys, custom prototype
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, null, {}),
    (error) => error?.code === 'CMV_AUTHORITY_REFUSED',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, [], {}),
    (error) => error?.code === 'CMV_AUTHORITY_REFUSED',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, 'auth', {}),
    (error) => error?.code === 'CMV_AUTHORITY_REFUSED',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, { execute: true }, {}),
    (error) => error?.code === 'CMV_AUTHORITY_REFUSED',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, { [Symbol('auth')]: 1 }, {}),
    (error) => error?.code === 'CMV_AUTHORITY_REFUSED',
  );
  const customProtoAuth = Object.create({ inherited: true });
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, customProtoAuth, {}),
    (error) => error?.code === 'CMV_AUTHORITY_REFUSED',
  );

  // Cutoffs validation: explicit null, array, primitive, extra keys, mismatch, non-canonical, inverted
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, null),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, []),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, { extra: true }),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, { valid_at: '2026-08-25T00:00:00.000Z' }),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, { known_at: '2026-08-25T00:00:00.000Z' }),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, { valid_at: '2026-08-26' }),
    (error) => error?.code === 'CMV_TIME_INVALID',
  );
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(effective.effective_rule_set, typed_project_facts, {}, {
      valid_at: '2026-08-26T12:00:00.000Z',
      known_at: '2026-08-26T11:00:00.000Z',
    }),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  // Core typed facts admission failures
  const badDigestFacts = structuredClone(typed_project_facts);
  badDigestFacts.facts_digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, badDigestFacts),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const hostileDoc = ['C:', 'secret', 'keys.txt'].join(String.fromCharCode(92));
  const hostileDocFacts = structuredClone(typed_project_facts);
  hostileDocFacts.project_binding_ref.document_refs = [hostileDoc];
  hostileDocFacts.facts_digest = calculateCmvCoreTypedFactsDigest(hostileDocFacts.facts);
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, hostileDocFacts),
    (error) => {
      assert.equal(error?.code, 'CMV_EFFECTIVE_RULESET_INVALID');
      assert.ok(!error.message.includes(hostileDoc), 'must not echo hostile string');
      return true;
    },
  );

  const outOfOrderDocFacts = structuredClone(typed_project_facts);
  outOfOrderDocFacts.project_binding_ref.document_refs = ['doc_z', 'doc_a'];
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, outOfOrderDocFacts),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );

  const invertedTimeFacts = structuredClone(typed_project_facts);
  invertedTimeFacts.valid_at = '2026-08-26T12:00:00.000Z';
  invertedTimeFacts.known_at = '2026-08-26T11:00:00.000Z';
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, effective, invertedTimeFacts),
    (error) => error?.code === 'CMV_TIME_INVALID',
  );
});

test('bare derived ruleset is refused and zero-op profile traces are non-interchangeable', () => {
  const typed = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const bindings = resolveProfileBindings(null, sourceBoundProfile());
  const derivedEffective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, bindings);

  // Bare derived ruleset without Core assembly outer envelope is refused
  assert.throws(
    () => calibrationMeasurementValidityAdapter.evaluate(derivedEffective.effective_rule_set, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID' && error.message.includes('complete Core assembly envelope'),
  );

  // Two different zero-op profiles produce distinct ruleset refs and non-interchangeable assembly traces
  const zeroOpProfile1 = {
    profile_id: 'synthetic-zero-op-1',
    domain_engine_id: 'calibration_measurement_validity',
    revision_or_hash: `sha256:${'1'.repeat(64)}`,
    extends_or_base_pin: 'calibration_measurement_validity@0.1.0',
    source_refs: ['source:NIST-METROLOGICAL-TRACEABILITY-FAQ'],
    operations: [],
  };
  const zeroOpProfile2 = {
    profile_id: 'synthetic-zero-op-2',
    domain_engine_id: 'calibration_measurement_validity',
    revision_or_hash: `sha256:${'2'.repeat(64)}`,
    extends_or_base_pin: 'calibration_measurement_validity@0.1.0',
    source_refs: ['source:NIST-METROLOGICAL-TRACEABILITY-FAQ'],
    operations: [],
  };

  const effective1 = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, resolveProfileBindings(null, zeroOpProfile1));
  const effective2 = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, resolveProfileBindings(null, zeroOpProfile2));
  assert.notEqual(effective1.effective_rule_set.ruleset_ref.content_id, effective2.effective_rule_set.ruleset_ref.content_id);

  const eval1 = evaluate(calibrationMeasurementValidityAdapter, effective1, typed);
  assert.equal(eval1.assessment.result_status, 'valid');

  // Swapped trace must be refused
  const swapped = structuredClone(effective1);
  swapped.compilation_trace = effective2.compilation_trace;
  swapped.assembly_digest = effective2.assembly_digest;
  assert.throws(
    () => evaluate(calibrationMeasurementValidityAdapter, swapped, typed),
    (error) => error?.code === 'CMV_EFFECTIVE_RULESET_INVALID',
  );
});

test('derived HOLD assessment validates against schema and guidance enforces cross-binding', () => {
  const baseSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_schema_v0.json', import.meta.url)), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat('date-time', /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/);
  ajv.addSchema(baseSchema);
  const validateAssessment = ajv.getSchema(`${baseSchema.$id}#/$defs/assessment`);

  const bindings = resolveProfileBindings(null, sourceBoundProfile());
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, bindings);
  const otherSource = classifyCmvSourceEvidence(cmvAcceptedSourceBindingInput('NIST-TN-1297-1994', 'synthetic_direct'));
  const otherTyped = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket([otherSource]));

  const holdResult = evaluate(calibrationMeasurementValidityAdapter, effective, otherTyped);
  assert.equal(holdResult.assessment.result_status, 'unknown');
  assert.equal(holdResult.assessment.profile_evaluation.status, 'hold');
  assert.equal(validateAssessment(holdResult.assessment), true, JSON.stringify(validateAssessment.errors));

  // Guidance cross-binding: mismatched project_binding_ref or timestamps must be refused
  const validTyped = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const observation = deriveCalibrationMeasurementValidityObservationCandidates(validTyped);
  const validAssessment = evaluate(calibrationMeasurementValidityAdapter, assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []), validTyped).assessment;

  const mismatchedBindingAssessment = structuredClone(validAssessment);
  mismatchedBindingAssessment.project_binding_ref.entity_id = 'synthetic:other-project';
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: mismatchedBindingAssessment, observation }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT' && error.message.includes('exact same project_binding_ref'),
  );

  const mismatchedTimeAssessment = structuredClone(validAssessment);
  mismatchedTimeAssessment.evaluated_at.tested_at = '2026-08-25T00:00:00.000Z';
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: mismatchedTimeAssessment, observation }),
    (error) => error?.code === 'CMV_GUIDANCE_INVALID_INPUT' && error.message.includes('matching evaluated_at and cutoff timestamps'),
  );
});

test('C8: guidance admission, receipts, and MCP bind complete project, time, assessment, and observation context', () => {
  const baseSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_schema_v0.json', import.meta.url)), 'utf8'));
  const sourceBoundSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/calibration_measurement_validity_source_bound_schema_v1.json', import.meta.url)), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat('date-time', /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/);
  ajv.addSchema(baseSchema);
  ajv.addSchema(sourceBoundSchema);
  const validateGuidance = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/guidance`);
  const validateGuidanceReceipt = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/guidance_receipt`);
  const validateMcp = ajv.getSchema(`${sourceBoundSchema.$id}#/$defs/read_only_mcp`);

  const typed1 = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const obs1 = deriveCalibrationMeasurementValidityObservationCandidates(typed1);
  const raw1 = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  const eval1 = evaluate(calibrationMeasurementValidityAdapter, assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []), raw1);

  // Positive same-context:
  const g1a = buildCalibrationMeasurementValidityGuidance({ assessment: eval1.assessment, observation: obs1 });
  const g1b = buildCalibrationMeasurementValidityGuidance({ assessment: eval1.assessment, observation: obs1 });
  assert.equal(canonicalizeCalibrationMeasurementValidity(g1a), canonicalizeCalibrationMeasurementValidity(g1b));
  assert.equal(g1a.receipt.guidance_digest, g1b.receipt.guidance_digest);
  assert.equal(validateGuidance(g1a), true, JSON.stringify(validateGuidance.errors));
  assert.equal(validateGuidanceReceipt(g1a.receipt), true, JSON.stringify(validateGuidanceReceipt.errors));
  assert.equal(validateCalibrationMeasurementValidityGuidance(g1a, { assessment: eval1.assessment, observation: obs1 }), true);

  // Negative cross-context: distinct contexts produce distinct digests and output bytes
  const raw2 = buildCalibrationMeasurementValidityPublicSyntheticRequest('EXPIRED');
  const typed2 = adaptCalibrationMeasurementValidityTypedFacts(typedFactPacket());
  const eval2 = evaluate(calibrationMeasurementValidityAdapter, assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []), raw2);
  const obs2 = deriveCalibrationMeasurementValidityObservationCandidates(typed2);

  const g2 = buildCalibrationMeasurementValidityGuidance({ assessment: eval2.assessment, observation: obs2 });
  assert.notEqual(g1a.receipt.guidance_digest, g2.receipt.guidance_digest);
  assert.notEqual(canonicalizeCalibrationMeasurementValidity(g1a), canonicalizeCalibrationMeasurementValidity(g2));

  // Context 3: different project binding ref and timestamps
  const eval3Assessment = structuredClone(eval1.assessment);
  eval3Assessment.project_binding_ref.entity_id = 'synthetic:project-gamma';
  eval3Assessment.project_binding_ref.content_id = 'sha256:' + 'c'.repeat(64);
  eval3Assessment.evaluated_at.tested_at = '2026-08-27T12:00:00.000Z';
  eval3Assessment.evaluated_at.known_at = '2026-08-27T12:05:00.000Z';
  const obs3 = structuredClone(obs1);
  obs3.receipt.project_binding_ref.entity_id = 'synthetic:project-gamma';
  obs3.receipt.project_binding_ref.content_id = 'sha256:' + 'c'.repeat(64);
  obs3.receipt.valid_at = '2026-08-27T12:00:00.000Z';
  obs3.receipt.known_at = '2026-08-27T12:05:00.000Z';
  const g3 = buildCalibrationMeasurementValidityGuidance({ assessment: eval3Assessment, observation: obs3 });
  assert.notEqual(g1a.receipt.guidance_digest, g3.receipt.guidance_digest);
  assert.notEqual(canonicalizeCalibrationMeasurementValidity(g1a), canonicalizeCalibrationMeasurementValidity(g3));

  // Negative cross-context substitution:
  // 1. Mismatched project binding ref
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: eval3Assessment, observation: obs1 }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT' && err.message.includes('exact same project_binding_ref'),
  );

  // 2. Mismatched timestamps
  const mismatchedTimeObs = structuredClone(obs3);
  mismatchedTimeObs.receipt.valid_at = '2026-08-26T00:00:00.000Z';
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: eval3Assessment, observation: mismatchedTimeObs }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT' && err.message.includes('matching evaluated_at and cutoff timestamps'),
  );

  // 3. Stale candidate digest in observation receipt
  const staleObs = structuredClone(obs1);
  staleObs.receipt.candidates_digest = 'sha256:' + '0'.repeat(64);
  assert.throws(
    () => buildCalibrationMeasurementValidityGuidance({ assessment: eval1.assessment, observation: staleObs }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT' && err.message.includes('missing, stale, or mismatched'),
  );

  // 4. Reclosed/forged guidance substitution
  const forgedGuidance = structuredClone(g1a);
  forgedGuidance.assessment_digest = 'sha256:' + 'f'.repeat(64);
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(forgedGuidance, { assessment: eval1.assessment, observation: obs1 }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );

  const staleDigestGuidance = structuredClone(g1a);
  staleDigestGuidance.receipt.guidance_digest = 'sha256:' + '0'.repeat(64);
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(staleDigestGuidance, { assessment: eval1.assessment, observation: obs1 }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );

  // Reclosed context substitution attack:
  // Caller takes g1a (from context 1), changes guidance and receipt project_binding_ref,
  // valid_at, and known_at to context 3 (project-gamma / 2026-08-27), and recomputes guidance_digest.
  const reclosedGuidance = structuredClone(g1a);
  reclosedGuidance.project_binding_ref = structuredClone(eval3Assessment.project_binding_ref);
  reclosedGuidance.valid_at = eval3Assessment.evaluated_at.tested_at;
  reclosedGuidance.known_at = eval3Assessment.evaluated_at.known_at;

  reclosedGuidance.receipt.project_binding_ref = structuredClone(eval3Assessment.project_binding_ref);
  reclosedGuidance.receipt.valid_at = eval3Assessment.evaluated_at.tested_at;
  reclosedGuidance.receipt.known_at = eval3Assessment.evaluated_at.known_at;

  const reclosedReceiptBody = {
    schema_version: 'soulforge.calibration_measurement_validity.guidance_receipt.v1',
    project_binding_ref: reclosedGuidance.receipt.project_binding_ref,
    valid_at: reclosedGuidance.receipt.valid_at,
    known_at: reclosedGuidance.receipt.known_at,
    assessment_digest: reclosedGuidance.receipt.assessment_digest,
    candidates_digest: reclosedGuidance.receipt.candidates_digest,
    assessment_status: eval1.assessment.result_status,
    assessment_result_preserved: true,
    source_bound_candidate_count: reclosedGuidance.receipt.source_bound_candidate_count,
    cards: reclosedGuidance.cards,
  };
  reclosedGuidance.receipt.guidance_digest = `sha256:${calibrationMeasurementValiditySha256(reclosedReceiptBody)}`;

  // The reclosed envelope and its MCP union are structurally schema-valid:
  assert.equal(validateGuidance(reclosedGuidance), true, JSON.stringify(validateGuidance.errors));
  assert.equal(validateGuidanceReceipt(reclosedGuidance.receipt), true, JSON.stringify(validateGuidanceReceipt.errors));
  const reclosedMcp = {
    schema_version: 'soulforge.calibration_measurement_validity.read_only_mcp.v1',
    structured: reclosedGuidance,
    effects: { network_calls: 0, file_reads: 0, file_writes: 0, external_mutations: 0 },
  };
  assert.equal(validateMcp(reclosedMcp), true, JSON.stringify(validateMcp.errors));

  // Runtime refusal: validateCalibrationMeasurementValidityGuidance must REFUSE this reclosed envelope against the ORIGINAL trusted context 1
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(reclosedGuidance, { assessment: eval1.assessment, observation: obs1 }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );

  // Positive test for matching context 1:
  assert.equal(validateCalibrationMeasurementValidityGuidance(g1a, { assessment: eval1.assessment, observation: obs1 }), true);
  // Positive test for separately built legitimate second context (context 3):
  assert.equal(validateCalibrationMeasurementValidityGuidance(g3, { assessment: eval3Assessment, observation: obs3 }), true);
  // Positive test for context 2:
  assert.equal(validateCalibrationMeasurementValidityGuidance(g2, { assessment: eval2.assessment, observation: obs2 }), true);

  // Missing or incomplete context must fail closed:
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(g1a),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(g1a, null),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(g1a, {}),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(g1a, { assessment: eval1.assessment }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );
  assert.throws(
    () => validateCalibrationMeasurementValidityGuidance(g1a, { observation: obs1 }),
    (err) => err?.code === 'CMV_GUIDANCE_INVALID_INPUT',
  );

  // MCP preservation:
  for (const caseId of ['VALID', 'EXPIRED', 'OUT_OF_RANGE', 'EXCEPTION_HELD', 'UNKNOWN']) {
    const mcp = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.guidance_public_synthetic', { case_id: caseId });
    assert.equal(validateMcp(mcp), true, JSON.stringify(validateMcp.errors));
    assert.equal(validateGuidance(mcp.structured), true, JSON.stringify(validateGuidance.errors));
    assert.equal(validateGuidanceReceipt(mcp.structured.receipt), true, JSON.stringify(validateGuidanceReceipt.errors));
    const caseRaw = buildCalibrationMeasurementValidityPublicSyntheticRequest(caseId);
    const caseDirectSource = directSource();
    const caseTyped = adaptCalibrationMeasurementValidityTypedFacts({
      schema_version: 'soulforge.calibration_measurement_validity.source_bound_typed_facts.v1',
      domain_input: caseRaw,
      source_classifications: [caseDirectSource],
      fact_provenance: Object.fromEntries([
        'instrument_identity', 'calibration_status', 'measurement_suitability', 'traceability', 'environment', 'exception',
      ].map((factKey) => [factKey, { source_id: caseDirectSource.source_id, source_ref: structuredClone(caseDirectSource.source_ref) }])),
    });
    const caseAssessment = assessCalibrationMeasurementValidity(caseRaw).assessment;
    const caseObservation = deriveCalibrationMeasurementValidityObservationCandidates(caseTyped);
    assert.equal(validateCalibrationMeasurementValidityGuidance(mcp.structured, { assessment: caseAssessment, observation: caseObservation }), true);
  }
});

test('all package-local Markdown links resolve across README, manual, contracts, topology, and integration request', () => {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const scopes = ['README.md', 'manual', 'contracts', 'topology', 'integration_request.md'];
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  function markdownFiles(root) {
    if (!existsSync(root)) return [];
    return readdirSync(root).flatMap((entry) => {
      const path = resolve(root, entry);
      if (statSync(path).isDirectory()) return markdownFiles(path);
      return path.endsWith('.md') ? [path] : [];
    });
  }

  for (const scope of scopes) {
    const path = resolve(packageRoot, scope);
    if (!existsSync(path)) continue;
    const files = statSync(path).isDirectory() ? markdownFiles(path) : [path];
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const match of contents.matchAll(linkPattern)) {
        const target = match[1].split('#', 1)[0].split('?', 1)[0];
        if (!target || /^(?:https?:|mailto:)/iu.test(target)) continue;
        assert.equal(existsSync(resolve(dirname(file), target)), true, `${file} -> ${target}`);
      }
    }
  }
});
