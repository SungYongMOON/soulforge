import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assessManufacturingReadiness } from '../evaluator/manufacturing_readiness.mjs';
import {
  buildManufacturingReadinessPublicSyntheticRequest,
  MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_PROJECT_BINDING_REF,
} from '../fixtures/manufacturing_readiness_public_synthetic.mjs';
import {
  MANUFACTURING_READINESS_RULES,
  MANUFACTURING_READINESS_SOURCE_INVENTORY_REF,
  MANUFACTURING_READINESS_SOURCE_PACKET_REF,
} from '../rules/manufacturing_readiness_rules.mjs';

const ALL_FACETS = [
  'drawings',
  'bom',
  'processes',
  'tooling',
  'work_instructions',
  'personnel_and_equipment',
  'inspections',
  'materials',
];

function assertDeepFrozen(value, path = 'value') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}

test('all resolved synthetic build-start facets project evidence-ready-for-owner-review without granting start authority', () => {
  const result = assessManufacturingReadiness({
    schema_version: 'soulforge.manufacturing_readiness.domain_input.v0',
    project_binding_ref: { ...MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_PROJECT_BINDING_REF },
    facets: ALL_FACETS.map((facet_id) => ({
      facet_id,
      applicability: 'applicable',
      evidence_state: 'present',
      evaluation_state: 'criteria_met',
    })),
  });

  assert.equal(result.assessment.overall_state, 'build_start_evidence_ready_for_owner_review');
  assert.equal(Object.hasOwn(result.assessment, 'build_start_authorized'), false);
  assert.deepEqual(result.receipt.effects, {
    filesystem: 0,
    network: 0,
    model: 0,
    rag: 0,
    wiki: 0,
    erp: 0,
    task: 0,
    approval: 0,
  });
});

test('direct evaluation refuses an otherwise-ready request without an exact Project Binding', () => {
  const unbound = buildManufacturingReadinessPublicSyntheticRequest('ready');
  delete unbound.project_binding_ref;
  assert.throws(
    () => assessManufacturingReadiness(unbound),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
});

test('direct evaluation accepts the canonical Core ProjectBinding shape, including defined optionals', () => {
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: 'synthetic-manufacturing-project',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'synthetic-manufacturing-binding-r1',
    source_manifest_ref: 'synthetic-manufacturing-source-manifest-r1',
    authority_family: 'public_synthetic',
    valid_at: '2026-08-26T00:00:00.000Z',
    known_at: '2026-08-26T00:00:00.000Z',
    document_refs: ['synthetic-manufacturing-document-r1'],
  };
  assert.equal(
    assessManufacturingReadiness(request).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );
});

test('direct evaluation refuses temporal pins outside the Core millisecond contract with an E05 error', () => {
  for (const instant of [
    '2026-08-26T00:00:00Z',
    '2026-08-26T00:00:00.9Z',
    '2026-08-26T00:00:00.90Z',
    '2026-08-26T00:00:00.0000Z',
  ]) {
    const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
    request.project_binding_ref.valid_at = instant;
    request.project_binding_ref.known_at = instant;
    assert.throws(
      () => assessManufacturingReadiness(request),
      (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
      instant,
    );
  }
});

test('direct evaluation preserves Core ProjectBinding public strings with spaces', () => {
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: 'Project Alpha',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'Binding Revision Alpha',
    source_manifest_ref: 'Source Manifest Alpha',
    authority_family: 'Manufacturing Owner',
    document_refs: ['Drawing A'],
  };
  assert.equal(
    assessManufacturingReadiness(request).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );

  request.project_binding_ref.document_refs = ['_workspaces/private/Drawing A'];
  assert.throws(
    () => assessManufacturingReadiness(request),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
});

test('direct evaluation refuses the legacy noncanonical three-field ProjectBinding shape', () => {
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref = {
    project_id: 'synthetic-manufacturing-project',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'synthetic-manufacturing-binding-r1',
  };
  assert.throws(
    () => assessManufacturingReadiness(request),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
});

test('direct evaluation keeps canonical ProjectBinding additional-properties closure', () => {
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref.unexpected_public_field = 'must-not-enter-e05';
  assert.throws(
    () => assessManufacturingReadiness(request),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
});

test('replay normalizes caller facet order, preserves input, and deeply freezes the receipt', () => {
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  const reversed = structuredClone(request);
  reversed.facets.reverse();
  const before = JSON.stringify(request);
  const normal = assessManufacturingReadiness(request);
  const replay = assessManufacturingReadiness(reversed);

  assert.equal(JSON.stringify(request), before);
  assert.deepEqual(replay, normal);
  assert.equal(Object.isFrozen(normal), true);
  assert.equal(Object.isFrozen(normal.receipt.effects), true);
});

test('assessment, domain result, and receipt use exact frozen output contracts', () => {
  const result = assessManufacturingReadiness(buildManufacturingReadinessPublicSyntheticRequest('ready'));
  assert.deepEqual(Object.keys(result).sort(), ['assessment', 'domain_result', 'receipt']);
  assert.deepEqual(Object.keys(result.assessment).sort(), [
    'assessment_kind',
    'canon_claim_ceiling',
    'decision_boundary',
    'overall_state',
    'result_counts',
    'schema_version',
  ]);
  assert.deepEqual(Object.keys(result.domain_result).sort(), [
    'canon_claim_ceiling',
    'counts',
    'results',
    'schema_version',
  ]);
  assert.deepEqual(Object.keys(result.receipt).sort(), ['bindings', 'counts', 'digests', 'effects', 'schema_version']);
  assert.deepEqual(Object.keys(result.receipt.digests).sort(), [
    'assessment_sha256',
    'domain_result_sha256',
    'input_sha256',
  ]);
  assert.deepEqual(Object.keys(result.receipt.bindings).sort(), [
    'execution_mode',
    'project_binding_ref',
    'ruleset_ref',
    'source_inventory_ref',
    'source_packet_ref',
  ]);
  assert.deepEqual(Object.keys(result.domain_result.results[0]).sort(), [
    'applicability',
    'canon_claim_ceiling',
    'evaluation_state',
    'evidence_state',
    'facet_id',
    'reason_code',
    'rule_id',
    'source_locators',
    'source_refs',
    'state',
  ]);
  assertDeepFrozen(result);
});

test('not-applicable needs a basis while incomplete or payload-bearing facts fail closed', () => {
  const missingBasis = buildManufacturingReadinessPublicSyntheticRequest('ready');
  const inspections = missingBasis.facets.find((row) => row.facet_id === 'inspections');
  inspections.applicability = 'not_applicable';
  inspections.evidence_state = 'unknown';
  inspections.evaluation_state = 'unknown';
  assert.throws(
    () => assessManufacturingReadiness(missingBasis),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );

  const boundedBasis = structuredClone(missingBasis);
  boundedBasis.facets.find((row) => row.facet_id === 'inspections').not_applicable_basis_ref = 'synthetic-inspection-basis-r1';
  const boundedResult = assessManufacturingReadiness(boundedBasis);
  assert.equal(
    boundedResult.domain_result.results.find((row) => row.facet_id === 'inspections').state,
    'not_applicable',
  );
  assert.equal(boundedResult.assessment.overall_state, 'build_start_evidence_ready_for_owner_review');
  assert.deepEqual(boundedResult.domain_result.counts, {
    satisfied: 7,
    gap_missing: 0,
    gap_unknown: 0,
    gap_conflict: 0,
    not_applicable: 1,
    total: 8,
  });
  assert.deepEqual(boundedResult.assessment.result_counts, {
    satisfied: 7,
    gap_missing: 0,
    gap_unknown: 0,
    gap_conflict: 0,
    not_applicable: 1,
    total: 8,
  });

  const incomplete = buildManufacturingReadinessPublicSyntheticRequest('ready');
  incomplete.facets.pop();
  assert.throws(
    () => assessManufacturingReadiness(incomplete),
    (error) => error?.code === 'MANUFACTURING_READINESS_FACET_INCOMPLETE',
  );

  const payload = buildManufacturingReadinessPublicSyntheticRequest('ready');
  payload.project_payload = 'not-allowed';
  assert.throws(
    () => assessManufacturingReadiness(payload),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
});

test('source packet bytes remain pinned by the public ruleset reference', () => {
  const packetPath = fileURLToPath(new URL('../contracts/manufacturing_readiness_source_packet_v0.md', import.meta.url));
  const actual = createHash('sha256').update(readFileSync(packetPath)).digest('hex');
  assert.equal(MANUFACTURING_READINESS_SOURCE_PACKET_REF.content_id, `sha256:${actual}`);
});

test('source inventory bytes, revisions, and executable rule crosswalk remain locked without source bodies', () => {
  const inventoryPath = fileURLToPath(new URL('../contracts/manufacturing_readiness_source_inventory_candidate_v1.json', import.meta.url));
  const bytes = readFileSync(inventoryPath);
  const actual = createHash('sha256').update(bytes).digest('hex');
  const inventory = JSON.parse(bytes);
  assert.equal(MANUFACTURING_READINESS_SOURCE_INVENTORY_REF.content_id, `sha256:${actual}`);
  assert.equal(inventory.schema_version, 'soulforge.manufacturing_readiness.source_inventory.v1');
  assert.deepEqual(
    Object.fromEntries(inventory.sources.map((source) => [source.source_id, source.revision])),
    {
      'S1-NASA-8739.6B': 'B-change-0-2021-02-04',
      'S2-NASA-8739.12A': 'A-2024-11-20',
      'S3-NASA-8739.14': 'baseline-2020-06-02',
      'S4-DOD-MRL-2025': '2025-release-announcement-observed',
    },
  );
  for (const source of inventory.sources) {
    assert.equal(Object.hasOwn(source, 'source_body'), false);
    assert.equal(Object.hasOwn(source, 'project_payload'), false);
    assert.equal(Object.hasOwn(source, 'private_path'), false);
  }
  const s4 = inventory.sources.find((source) => source.source_id === 'S4-DOD-MRL-2025');
  assert.equal(Object.hasOwn(s4, 'body_url'), false);
  assert.equal(typeof s4.announcement_url, 'string');
  assert.equal(typeof s4.legacy_2020_guidance_url, 'string');
  assert.deepEqual(
    inventory.rule_crosswalk.map((entry) => ({
      rule_id: entry.rule_id,
      facet_id: entry.facet_id,
      source_ids: entry.source_ids,
      source_locators: entry.source_locators,
    })),
    MANUFACTURING_READINESS_RULES.map((rule) => ({
      rule_id: rule.rule_id,
      facet_id: rule.facet_id,
      source_ids: rule.source_refs,
      source_locators: rule.source_locators,
    })),
  );
});

test('hostile accessor-backed and custom-prototype inputs are refused before evaluation', () => {
  const accessor = buildManufacturingReadinessPublicSyntheticRequest('ready');
  let getterCalls = 0;
  Object.defineProperty(accessor, 'schema_version', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return 'soulforge.manufacturing_readiness.domain_input.v0'; },
  });
  assert.throws(
    () => assessManufacturingReadiness(accessor),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
  assert.equal(getterCalls, 0);

  const customPrototype = buildManufacturingReadinessPublicSyntheticRequest('ready');
  Object.setPrototypeOf(customPrototype.facets, Object.create(Array.prototype));
  assert.throws(
    () => assessManufacturingReadiness(customPrototype),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
});

test('direct evaluator refuses a Proxy before any handler trap can observe the request', () => {
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  let trapCalls = 0;
  const proxied = new Proxy(request, {
    get(target, key, receiver) {
      trapCalls += 1;
      return Reflect.get(target, key, receiver);
    },
    getPrototypeOf(target) {
      trapCalls += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      trapCalls += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      trapCalls += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.throws(
    () => assessManufacturingReadiness(proxied),
    (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
  );
  assert.equal(trapCalls, 0);
});

test('direct evaluator rejects symbol, hidden, sparse, cyclic, and revoked hostile data with its closed error', () => {
  const variants = [
    ['symbol', () => {
      const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
      request[Symbol('hostile')] = true;
      return request;
    }],
    ['hidden', () => {
      const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
      Object.defineProperty(request, 'hidden', { enumerable: false, value: true });
      return request;
    }],
    ['sparse', () => {
      const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
      request.facets = new Array(8);
      return request;
    }],
    ['cycle', () => {
      const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
      request.facets[0].cycle = request.facets[0];
      return request;
    }],
    ['revoked Proxy', () => {
      const revocable = Proxy.revocable(buildManufacturingReadinessPublicSyntheticRequest('ready'), {});
      revocable.revoke();
      return revocable.proxy;
    }],
  ];
  for (const [label, build] of variants) {
    assert.throws(
      () => assessManufacturingReadiness(build()),
      (error) => error?.code === 'MANUFACTURING_READINESS_INPUT_REFUSED',
      label,
    );
  }
});

test('result cannot impersonate ERP, design, quality, inspection, or build-start authority', () => {
  const forbidden = new Set([
    'build_start_authorized',
    'design_approved',
    'quality_accepted',
    'inspection_accepted',
    'erp_inventory',
    'material_available',
  ]);
  const inspect = (value, path = 'result') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `${path}.${key} is outside manufacturing readiness authority`);
      inspect(child, `${path}.${key}`);
    }
  };

  inspect(assessManufacturingReadiness(buildManufacturingReadinessPublicSyntheticRequest('ready')));
});
