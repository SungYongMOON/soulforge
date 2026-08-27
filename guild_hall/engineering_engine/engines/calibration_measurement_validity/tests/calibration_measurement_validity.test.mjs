import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  assessCalibrationMeasurementValidity,
  CMV_ERROR_CODES,
} from '../evaluator/calibration_measurement_validity.mjs';
import {
  buildCalibrationMeasurementValidityPublicSyntheticRequest,
  CALIBRATION_MEASUREMENT_VALIDITY_PUBLIC_SYNTHETIC_FIXTURE,
} from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import {
  calibrationMeasurementValidityAdapter,
} from '../evaluator/calibration_measurement_validity_evaluator_adapter.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { CMV_SOURCE_PACKET_REF } from '../rules/calibration_measurement_validity_rules.mjs';
import { createCalibrationMeasurementValidityModuleManifest } from '../topology/calibration_measurement_validity_module_manifest.mjs';
import { compileCalibrationMeasurementValidityRules } from '../compiler/calibration_measurement_validity_compiler_adapter.mjs';

function deepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

function determination(result, criterionId) {
  const item = result.assessment.determinations.find((entry) => entry.criterion_id === criterionId);
  assert.ok(item, `expected determination for ${criterionId}`);
  return item;
}

function rejectsWith(code, operation) {
  assert.throws(operation, (error) => error?.code === code, `expected ${code}`);
}

test('the public source packet remains byte-pinned by the base ruleset reference', () => {
  const sourcePacketPath = fileURLToPath(new URL('../contracts/calibration_measurement_validity_source_packet_v0.md', import.meta.url));
  const actual = createHash('sha256').update(readFileSync(sourcePacketPath)).digest('hex');
  assert.equal(CMV_SOURCE_PACKET_REF.content_id, `sha256:${actual}`);
});

test('the public source inventory records direct access, bounded applicability, and no raw source body', () => {
  const inventoryPath = fileURLToPath(new URL('../contracts/public_source_inventory_v1.json', import.meta.url));
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  assert.equal(inventory.domain_engine_id, 'calibration_measurement_validity');
  assert.equal(inventory.raw_source_body_present, false);
  assert.equal(inventory.sources.length, 5);
  assert.equal(inventory.sources.every((source) => source.direct_access_verified === true), true);
  assert.deepEqual(
    inventory.sources.find((source) => source.source_id === 'ISO-IEC-17025-2017-CITATION-ONLY').rule_use,
    [],
  );
});

test('the input, assessment, and ruleset schemas compile and bind actual public-synthetic outputs', () => {
  const schemaPath = fileURLToPath(new URL('../schemas/calibration_measurement_validity_schema_v0.json', import.meta.url));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat('date-time', /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/domain_input`);
  const validateAssessment = ajv.getSchema(`${schema.$id}#/$defs/assessment`);
  const validateRuleset = ajv.getSchema(`${schema.$id}#/$defs/ruleset`);
  assert.equal(typeof validate, 'function');
  assert.equal(typeof validateAssessment, 'function');
  assert.equal(typeof validateRuleset, 'function');
  assert.equal(validate(buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID')), true, JSON.stringify(validate.errors));
  assert.equal(validateAssessment(assessCalibrationMeasurementValidity(
    buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
  ).assessment), true, JSON.stringify(validateAssessment.errors));
  assert.equal(validateRuleset(compileCalibrationMeasurementValidityRules()), true, JSON.stringify(validateRuleset.errors));
  const hostile = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  hostile.unapproved_extra = true;
  assert.equal(validate(hostile), false);
});

test('public synthetic fixture produces the locked valid, expired, out-of-range, held, and unknown outcomes', () => {
  const expected = CALIBRATION_MEASUREMENT_VALIDITY_PUBLIC_SYNTHETIC_FIXTURE.expected;
  for (const [caseId, expectedOutcome] of Object.entries(expected.outcomes_by_case)) {
    const request = buildCalibrationMeasurementValidityPublicSyntheticRequest(caseId);
    const result = assessCalibrationMeasurementValidity(request);
    assert.equal(result.assessment.result_status, expectedOutcome.result_status, caseId);
    assert.equal(result.assessment.result_impact, expectedOutcome.result_impact, caseId);
  }
});

test('test-time calibration validity is determined from upstream status and the supplied due date', () => {
  const expired = assessCalibrationMeasurementValidity(
    buildCalibrationMeasurementValidityPublicSyntheticRequest('EXPIRED'),
  );
  assert.equal(determination(expired, 'CMV-CALIBRATION-STATUS-01').status, 'expired');

  const missing = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  delete missing.instrument.calibration.due_at;
  const missingResult = assessCalibrationMeasurementValidity(missing);
  assert.equal(determination(missingResult, 'CMV-CALIBRATION-STATUS-01').status, 'missing');

  const unknown = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  unknown.instrument.calibration.status = 'unknown';
  const unknownResult = assessCalibrationMeasurementValidity(unknown);
  assert.equal(determination(unknownResult, 'CMV-CALIBRATION-STATUS-01').status, 'unknown');
});

test('range, accuracy, and uncertainty suitability fail closed when values are missing or unsuitable', () => {
  const outOfRange = assessCalibrationMeasurementValidity(
    buildCalibrationMeasurementValidityPublicSyntheticRequest('OUT_OF_RANGE'),
  );
  assert.equal(determination(outOfRange, 'CMV-RANGE-01').status, 'out_of_range');

  const accuracy = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  accuracy.calibration_capability.accuracy_limit.value = 1.1;
  const accuracyResult = assessCalibrationMeasurementValidity(accuracy);
  assert.equal(determination(accuracyResult, 'CMV-ACCURACY-01').status, 'not_suitable');

  const uncertainty = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  delete uncertainty.calibration_capability.uncertainty.expanded.value;
  const uncertaintyResult = assessCalibrationMeasurementValidity(uncertainty);
  assert.equal(determination(uncertaintyResult, 'CMV-UNCERTAINTY-01').status, 'missing');
});

test('traceability, environmental conditions, and exception state retain their distinct evidence outcomes', () => {
  const held = assessCalibrationMeasurementValidity(
    buildCalibrationMeasurementValidityPublicSyntheticRequest('EXCEPTION_HELD'),
  );
  assert.equal(determination(held, 'CMV-EXCEPTION-01').status, 'exception_held');
  assert.equal(held.assessment.result_status, 'held');

  const environment = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  environment.environment.status = 'out_of_limit';
  const environmentResult = assessCalibrationMeasurementValidity(environment);
  assert.equal(determination(environmentResult, 'CMV-ENVIRONMENT-01').status, 'not_suitable');

  const traceability = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  traceability.traceability.status = 'not_documented';
  const traceabilityResult = assessCalibrationMeasurementValidity(traceability);
  assert.equal(determination(traceabilityResult, 'CMV-TRACEABILITY-01').status, 'missing');
});

test('the Core adapter seam accepts an empty-profile assembly and produces the same deterministic assessment', () => {
  const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, []);
  const direct = assessCalibrationMeasurementValidity(buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'));
  const throughCore = evaluate(
    calibrationMeasurementValidityAdapter,
    effective,
    buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
  );
  assert.deepEqual(throughCore, direct);
  assert.equal(effective.domain_engine_id, 'calibration_measurement_validity');
  assert.equal(effective.rule_count, 9);
});

test('input is not mutated and every result object is deeply frozen with zero external effects', () => {
  const request = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  const before = JSON.stringify(request);
  const result = assessCalibrationMeasurementValidity(request);
  assert.equal(JSON.stringify(request), before);
  assert.equal(deepFrozen(result), true);
  assert.deepEqual(result.receipt.effects, {
    network_calls: 0,
    file_reads: 0,
    file_writes: 0,
    external_mutations: 0,
  });
});

test('unsafe data, invalid evaluation time, incompatible units, and unsupported profile deltas fail closed', () => {
  const accessor = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  let getterCalls = 0;
  Object.defineProperty(accessor.instrument, 'instrument_id', {
    enumerable: true,
    get() { getterCalls += 1; return 'synthetic-meter-001'; },
  });
  rejectsWith(CMV_ERROR_CODES.INPUT_UNSAFE, () => assessCalibrationMeasurementValidity(accessor));
  assert.equal(getterCalls, 0);

  const invalidTime = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  invalidTime.evaluation_context.tested_at = '2026-08-26';
  rejectsWith(CMV_ERROR_CODES.TIME_INVALID, () => assessCalibrationMeasurementValidity(invalidTime));

  const incompatibleUnit = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
  incompatibleUnit.calibration_capability.range.unit = 'mA';
  rejectsWith(CMV_ERROR_CODES.UNIT_MISMATCH, () => assessCalibrationMeasurementValidity(incompatibleUnit));

  rejectsWith(CMV_ERROR_CODES.PROFILE_UNSUPPORTED, () => calibrationMeasurementValidityAdapter.compile([
    {
      profile_kind: 'project',
      profile_id: 'synthetic-project-profile',
      domain_engine_id: 'calibration_measurement_validity',
      revision_or_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      extends_or_base_pin: 'calibration_measurement_validity@0.1.0',
      source_refs: ['source:synthetic'],
      order: 0,
      operations: [],
    },
  ]));
});

test('zero-write runner emits stable JSON and leaves its caller directory empty', () => {
  const runnerPath = fileURLToPath(new URL('../tools/calibration_measurement_validity_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'calibration-measurement-validity-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    const second = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stderr, '');
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(JSON.parse(first.stdout), assessCalibrationMeasurementValidity(
      buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'),
    ));
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('local manifest factory emits only the shared common manifest contract', () => {
  const manifest = createCalibrationMeasurementValidityModuleManifest({
    module_version: '0.1.0',
    build_commit: 'e2acd5d8',
    artifact_sha256: 'a'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_core: '1.0.0' },
    configuration_hash: 'b'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:synthetic-cmv-focused-test-v0',
  });
  assert.equal(manifest.module_id, 'soulforge.engineering_engine.calibration_measurement_validity');
  assert.equal(manifest.execution_mode, 'deterministic_only');
  assert.equal(deepFrozen(manifest), true);
});
