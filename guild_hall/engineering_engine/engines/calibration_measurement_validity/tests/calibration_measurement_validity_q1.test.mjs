import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  classifyCmvSourceEvidence,
  CMV_SOURCE_AUTHORITY_CATALOG,
  CMV_SOURCE_CLASSIFICATION_CODES,
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
  buildCalibrationMeasurementValidityGuidance,
} from '../guidance/calibration_measurement_validity_guidance.mjs';
import {
  CALIBRATION_MEASUREMENT_VALIDITY_READ_ONLY_MCP_TOOLS,
  invokeCalibrationMeasurementValidityReadOnlyMcp,
} from '../mcp/calibration_measurement_validity_read_only_mcp.mjs';
import {
  calibrationMeasurementValidityAdapter,
} from '../evaluator/calibration_measurement_validity_evaluator_adapter.mjs';
import {
  evaluateCmvSourceBoundProfileRequirements,
} from '../profile/calibration_measurement_validity_source_bound_profile.mjs';
import {
  buildCalibrationMeasurementValidityPublicSyntheticRequest,
} from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';

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
  return classifyCmvSourceEvidence({
    source_id: sourceId,
    authority: 'National Institute of Standards and Technology',
    revision: 'synthetic-v1',
    access_class: 'official_public',
    direct_access_verified: true,
    retrieval_path: 'direct',
    applicability_state: 'in_scope',
    source_ref: reference(`source-${sourceId}`, 'a'),
  });
}

function ragSource() {
  return classifyCmvSourceEvidence({
    source_id: 'NIST-METROLOGICAL-TRACEABILITY-FAQ',
    authority: 'National Institute of Standards and Technology',
    revision: 'synthetic-v1',
    access_class: 'official_public',
    direct_access_verified: false,
    retrieval_path: 'rag',
    applicability_state: 'candidate_locator_only',
    source_ref: reference('source-rag', 'b'),
  });
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
      instrument_identity: { source_id: sourceClassifications[0].source_id, source_ref: sourceClassifications[0].source_ref },
      calibration_status: { source_id: sourceClassifications[0].source_id, source_ref: sourceClassifications[0].source_ref },
      measurement_suitability: { source_id: sourceClassifications[0].source_id, source_ref: sourceClassifications[0].source_ref },
      traceability: { source_id: sourceClassifications[0].source_id, source_ref: sourceClassifications[0].source_ref },
      environment: { source_id: sourceClassifications[0].source_id, source_ref: sourceClassifications[0].source_ref },
      exception: { source_id: sourceClassifications[0].source_id, source_ref: sourceClassifications[0].source_ref },
    },
  };
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

  const controlled = classifyCmvSourceEvidence({
    source_id: 'ISO-IEC-17025-2017-CITATION-ONLY',
    authority: 'International Organization for Standardization',
    revision: '2017',
    access_class: 'controlled_citation_only',
    direct_access_verified: true,
    retrieval_path: 'direct',
    applicability_state: 'citation_only',
    source_ref: reference('iso-citation-only', 'c'),
  });
  assert.equal(controlled.classification, 'controlled_citation_only');
  assert.equal(controlled.verdict_eligible, false);

  const unknown = classifyCmvSourceEvidence({
    source_id: 'UNREGISTERED-SOURCE',
    authority: 'Unknown Publisher',
    revision: 'synthetic-v1',
    access_class: 'official_public',
    direct_access_verified: true,
    retrieval_path: 'direct',
    applicability_state: 'in_scope',
    source_ref: reference('unknown-source', 'e'),
  });
  assert.equal(unknown.classification, 'unknown_source_hold');
  assert.equal(unknown.hold_code, CMV_SOURCE_CLASSIFICATION_CODES.UNKNOWN_SOURCE);
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
  const held = evaluate(calibrationMeasurementValidityAdapter, effective, ragEnvelope);
  assert.equal(held.assessment.profile_evaluation.status, 'hold');
  assert.equal(held.assessment.profile_evaluation.claim_ceiling, 'observed');
  assert.equal(held.assessment.claim_ceiling, 'observed');
  assert.equal(held.assessment.result_status, 'unknown');
  assert.equal(held.assessment.result_impact, 'hold');

  const bareHeld = evaluate(
    calibrationMeasurementValidityAdapter,
    effective,
    buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
  );
  assert.equal(bareHeld.assessment.profile_evaluation.status, 'hold');
  assert.equal(bareHeld.assessment.profile_evaluation.claim_ceiling, 'observed');

  const notApplicable = evaluateCmvSourceBoundProfileRequirements([], []);
  assert.equal(notApplicable.claim_ceiling, 'observed');

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
  assert.equal(validateAssessment(held.assessment), true, JSON.stringify(validateAssessment.errors));
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
});

test('read-only MCP exposes only pure package calls and the public synthetic pilot is zero-write replayable', () => {
  assert.equal(CALIBRATION_MEASUREMENT_VALIDITY_READ_ONLY_MCP_TOOLS.every((tool) => tool.write === false), true);
  const mcp = invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.classify_source', {
    source: {
      source_id: 'NIST-METROLOGICAL-TRACEABILITY-FAQ',
      authority: 'National Institute of Standards and Technology',
      revision: 'synthetic-v1',
      access_class: 'official_public',
      direct_access_verified: true,
      retrieval_path: 'direct',
      applicability_state: 'in_scope',
      source_ref: reference('mcp-source', 'd'),
    },
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
  const nullProfile = sourceBoundProfile();
  nullProfile.operations = [null];
  assert.throws(
    () => resolveProfileBindings(null, nullProfile),
    (error) => error?.code === 'PROFILE_BINDING_INVALID',
  );
  assert.throws(
    () => invokeCalibrationMeasurementValidityReadOnlyMcp('cmv.write_exception', {}),
    (error) => error?.code === 'CMV_READ_ONLY_MCP_UNKNOWN_TOOL',
  );
});
