import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { evaluate } from '../../../core/interfaces/domain_engine_adapter.mjs';

import {
  buildQualityReadinessTypedFacts,
  qualityReadinessTypedFactsDigest,
} from '../binding/quality_readiness_typed_facts.mjs';
import {
  compileQualityReadinessRules,
  QR_COMPILER_ERROR_CODES,
} from '../compiler/quality_readiness_compiler_adapter.mjs';
import { qualityReadinessAdapter } from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import { QUALITY_READINESS_RULES, QUALITY_READINESS_RULESET_REF, QUALITY_READINESS_SOURCE_PACKET_REF } from '../rules/quality_readiness_rules.mjs';
import { buildQualityReadinessDeepeningPublicSynthetic, qualityReadinessSyntheticRef } from '../fixtures/quality_readiness_deepening_public_synthetic.mjs';
import { buildQualityReadinessPublicSyntheticRequest } from '../fixtures/quality_readiness_public_synthetic.mjs';
import { buildQualityReadinessGuidance, QUALITY_READINESS_GUIDANCE_CODES } from '../guidance/quality_readiness_guidance.mjs';
import { callQualityReadinessReadTool, QUALITY_READINESS_MCP_CODES } from '../mcp/quality_readiness_read_tools.mjs';
import { projectQualityReadinessObservations, QUALITY_READINESS_OBSERVATION_CODES } from '../observation/quality_readiness_observation.mjs';
import {
  createQualityReadinessRagPacket,
  retrieveQualityReadinessAdvisoryEvidence,
  verifyQualityReadinessRagResult,
  QUALITY_READINESS_RAG_CODES,
} from '../rag/quality_readiness_rag_boundary.mjs';
import {
  admitQualityReadinessDirectSource,
  assertQualityReadinessPublicLocator,
  buildQualityReadinessSourceDirectCorpus,
  QUALITY_READINESS_SOURCE_CODES,
} from '../source/quality_readiness_source_derivation.mjs';
import sharedInventory from '../contracts/quality_readiness_public_source_inventory_candidate_v1.json' with { type: 'json' };
import sharedMatrix from '../contracts/quality_readiness_source_family_matrix_candidate_v1.json' with { type: 'json' };

const here = fileURLToPath(new URL('.', import.meta.url));
const inventoryPath = fileURLToPath(new URL('../contracts/quality_readiness_public_source_inventory_candidate_v1.json', import.meta.url));
const matrixPath = fileURLToPath(new URL('../contracts/quality_readiness_source_family_matrix_candidate_v1.json', import.meta.url));
const schemaRoot = fileURLToPath(new URL('../contracts/schemas/', import.meta.url));
const enginePath = fileURLToPath(new URL('../engine.yaml', import.meta.url));

function refreshTypedFactsDigest(envelope) {
  envelope.typed_project_facts.facts_digest = qualityReadinessTypedFactsDigest(
    envelope.typed_project_facts,
    envelope.assessment_context,
    envelope.compilation_trace,
  );
  return envelope;
}

function baseEffectiveRuleset() {
  return {
    schema_version: 'soulforge.quality_readiness.ruleset.v0',
    ruleset_ref: structuredClone(QUALITY_READINESS_RULESET_REF),
    source_packet_ref: structuredClone(QUALITY_READINESS_SOURCE_PACKET_REF),
    rules: structuredClone(QUALITY_READINESS_RULES),
  };
}

function derivedAssessment() {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const assessment = qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, {});
  const observation = projectQualityReadinessObservations({
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-adversarial-observation', 'r1', 'a'),
    known_at: fixture.typed_facts.typed_project_facts.known_at,
  });
  const guidance = buildQualityReadinessGuidance({
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_projection: observation,
  });
  return { fixture, assessment, observation, guidance };
}

function assertCode(call, code) {
  assert.throws(call, (error) => error?.code === code);
}

function assertPackageCode(call, code) {
  assert.throws(call, (error) => !(error instanceof TypeError) && error?.code === code);
}

function insertionOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) insertionOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      insertionOrderRules(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

function recloseRagOutputDigest(result) {
  const material = {
    schema_version: result.schema_version,
    status: result.status,
    verdict_authority: result.verdict_authority,
    rule_authority: result.rule_authority,
    source_packet_sha256: result.source_packet_sha256,
    query_id: result.query_id,
    candidate_locators: result.candidate_locators,
    receipt: {
      input_sha256: result.receipt.input_sha256,
      effects: result.receipt.effects,
    },
  };
  result.receipt.output_sha256 = sha256Hex(
    `soulforge.quality_readiness.rag_result.v0\n${canonicalise(material, insertionOrderRules(material))}`,
  );
  return result;
}

test('B1/A1: QR evaluation admission refuses hostile wrappers before getters or Proxy traps execute', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  let proxyTraps = 0;
  const proxy = new Proxy({}, {
    get() { proxyTraps += 1; throw new Error('getter must not run'); },
    ownKeys() { proxyTraps += 1; throw new Error('ownKeys must not run'); },
  });
  assertCode(() => qualityReadinessAdapter.evaluate(fixture.assembly, proxy, {}), 'QR_EVALUATION_INPUT_REFUSED');
  assert.equal(proxyTraps, 0);

  let rulesetTraps = 0;
  const proxyRuleset = new Proxy({}, {
    get() { rulesetTraps += 1; throw new Error('ruleset getter must not run'); },
    ownKeys() { rulesetTraps += 1; throw new Error('ruleset ownKeys must not run'); },
  });
  assertCode(() => qualityReadinessAdapter.evaluate(proxyRuleset, fixture.typed_facts, {}), 'QR_EFFECTIVE_RULESET_INVALID');
  assert.equal(rulesetTraps, 0);

  let accessorCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'schema_version', {
    enumerable: true,
    get() { accessorCalls += 1; throw new Error('accessor must not run'); },
  });
  assertCode(() => qualityReadinessAdapter.evaluate(fixture.assembly, accessor, {}), 'QR_EVALUATION_INPUT_REFUSED');
  assert.equal(accessorCalls, 0);

  const hostileVariants = [
    () => { const x = structuredClone(fixture.typed_facts); x[Symbol('x')] = true; return x; },
    () => { const x = structuredClone(fixture.typed_facts); Object.defineProperty(x.assessment_context, '__proto__', { value: 'x', enumerable: true }); return x; },
    () => { const x = structuredClone(fixture.typed_facts); Object.setPrototypeOf(x.assessment_context, null); return x; },
    () => { const x = structuredClone(fixture.typed_facts); Object.setPrototypeOf(x.assessment_context, { inherited: true }); return x; },
    () => { const x = structuredClone(fixture.typed_facts); delete x.typed_project_facts.facts[0]; return x; },
    () => { const x = structuredClone(fixture.typed_facts); x.assessment_context.manifest = x.assessment_context.binding; return x; },
    () => { const x = structuredClone(fixture.typed_facts); x.request = buildQualityReadinessPublicSyntheticRequest(); return x; },
    () => { const x = structuredClone(fixture.typed_facts); x.typed_project_facts.facts[0].hostile_number = Number.NaN; return x; },
  ];
  for (const build of hostileVariants) {
    assertCode(() => qualityReadinessAdapter.evaluate(fixture.assembly, build(), {}), 'QR_EVALUATION_INPUT_REFUSED');
  }
  const deep = structuredClone(fixture.typed_facts);
  let cursor = deep.assessment_context.manifest;
  for (let index = 0; index < 18; index += 1) { cursor.nested = {}; cursor = cursor.nested; }
  assertCode(() => qualityReadinessAdapter.evaluate(fixture.assembly, deep, {}), 'QR_EVALUATION_INPUT_REFUSED');
});

test('B1: base raw and legacy lanes are explicit and derived Typed Facts cannot hybridize', () => {
  const request = buildQualityReadinessPublicSyntheticRequest();
  const raw = qualityReadinessAdapter.evaluate(baseEffectiveRuleset(), request, {});
  const legacy = qualityReadinessAdapter.evaluate(baseEffectiveRuleset(), { request }, {});
  assert.equal(raw.receipt.bindings.evaluation_input_lane, 'base_raw_request');
  assert.equal(legacy.receipt.bindings.evaluation_input_lane, 'base_legacy_wrapper');
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  assertCode(() => qualityReadinessAdapter.evaluate(fixture.assembly, fixture.request, {}), 'QR_EVALUATION_INPUT_REFUSED');
  assertCode(() => qualityReadinessAdapter.evaluate(baseEffectiveRuleset(), fixture.typed_facts, {}), 'QR_EVALUATION_INPUT_REFUSED');
});

test('B1 closure: Core authority/cutoffs are snapshot-bound before lane admission', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const baseline = qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts);
  const empty = qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, {}, {});
  assert.deepEqual(empty, baseline, 'omitted and empty Core arguments preserve the derived lane bytes');
  assert.equal(Object.hasOwn(baseline.receipt.bindings, 'core_supplied_cutoffs_match'), false);

  const exactCutoffs = structuredClone(fixture.typed_facts.assessment_context.cutoffs);
  const matched = evaluate(qualityReadinessAdapter, fixture.assembly, fixture.typed_facts, {}, exactCutoffs);
  assert.equal(matched.receipt.bindings.core_supplied_cutoffs_match, true);
  assert.deepEqual(matched.receipt.bindings.assessment_cutoff_ref, exactCutoffs.assessment_cutoff_ref);

  assertCode(
    () => qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, { action: 'invent-authority' }),
    'QR_EVALUATION_INPUT_REFUSED',
  );
  const badGeneration = structuredClone(exactCutoffs);
  badGeneration.accepted_context_generation += 1;
  assertCode(
    () => qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, {}, badGeneration),
    'QR_EVALUATION_INPUT_REFUSED',
  );
  const badRef = structuredClone(exactCutoffs);
  badRef.assessment_cutoff_ref.content_id = `sha256:${'0'.repeat(64)}`;
  assertCode(
    () => qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, {}, badRef),
    'QR_EVALUATION_INPUT_REFUSED',
  );

  const hostileCutoffs = [];
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'accepted_context_generation', {
    enumerable: true,
    get() { getterCalls += 1; throw new Error('cutoff getter must not run'); },
  });
  hostileCutoffs.push(
    { ...exactCutoffs, unexpected: true },
    accessor,
    new Proxy({}, {
      get() { throw new Error('cutoff proxy getter must not run'); },
      ownKeys() { throw new Error('cutoff proxy ownKeys must not run'); },
    }),
  );
  const customPrototype = structuredClone(exactCutoffs);
  Object.setPrototypeOf(customPrototype, { custom: true });
  hostileCutoffs.push(customPrototype);
  for (const cutoffs of hostileCutoffs) {
    assertCode(
      () => qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, {}, cutoffs),
      'QR_EVALUATION_INPUT_REFUSED',
    );
  }
  assert.equal(getterCalls, 0);

  assertCode(
    () => qualityReadinessAdapter.evaluate(
      fixture.assembly,
      fixture.typed_facts,
      {},
      fixture.typed_facts.assessment_context.cutoffs,
    ),
    'QR_EVALUATION_INPUT_REFUSED',
  );
});

test('B1/A1/A2: Typed Facts digest binds complete context/time/trace and builder round-trips', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const variants = [
    (x) => { x.assessment_context.manifest.version = 'tampered'; },
    (x) => { x.assessment_context.cutoffs.accepted_context_generation = 99; },
    (x) => { x.typed_project_facts.valid_at = '2026-08-25T00:00:00.000Z'; },
    (x) => { x.compilation_trace.profiles[0].source_refs[0] = 'forged-source'; },
  ];
  for (const mutate of variants) {
    const forged = structuredClone(fixture.typed_facts);
    mutate(forged);
    assertCode(() => qualityReadinessAdapter.evaluate(fixture.assembly, forged, {}), 'QR_EVALUATION_INPUT_REFUSED');
  }
  const rebuilt = buildQualityReadinessTypedFacts({
    request: fixture.request,
    compilation_trace: fixture.assembly.compilation_trace,
    valid_at: fixture.typed_facts.typed_project_facts.valid_at,
    known_at: fixture.typed_facts.typed_project_facts.known_at,
  });
  assert.equal(rebuilt.typed_project_facts.facts_digest, fixture.typed_facts.typed_project_facts.facts_digest);
  assert.equal(qualityReadinessAdapter.evaluate(fixture.assembly, rebuilt, {}).receipt.bindings.typed_facts_sha256, rebuilt.typed_project_facts.facts_digest);
});

test('B2/A4: QR recomputes assembly/trace and refuses caller-agreed phantom Profile chains', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const cases = [
    (assembly, typed) => { assembly.assembly_digest = '0'.repeat(64); typed.compilation_trace.effective_ruleset_digest = '0'.repeat(64); },
    (assembly, typed) => { assembly.compilation_trace.effective_ruleset_digest = 'f'.repeat(64); typed.compilation_trace.effective_ruleset_digest = 'f'.repeat(64); },
    (assembly, typed) => { assembly.compilation_trace.compilation_scope = { forged: true }; typed.compilation_trace.compilation_scope = { forged: true }; },
    (assembly, typed) => { assembly.compilation_trace.profiles[0].applied_operations_count = 99; typed.compilation_trace.profiles[0].applied_operations_count = 99; },
    (assembly, typed) => { assembly.compilation_trace.profiles[0].profile_id = 'phantom'; typed.compilation_trace.profiles[0].profile_id = 'phantom'; },
    (assembly, typed) => { assembly.compilation_trace.profiles[0].source_refs = ['forged-source']; typed.compilation_trace.profiles[0].source_refs = ['forged-source']; },
  ];
  for (const mutate of cases) {
    const assembly = structuredClone(fixture.assembly);
    const typed = structuredClone(fixture.typed_facts);
    mutate(assembly, typed);
    refreshTypedFactsDigest(typed);
    assert.throws(
      () => qualityReadinessAdapter.evaluate(assembly, typed, {}),
      (error) => error?.code === 'QR_EFFECTIVE_RULESET_INVALID' || error?.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED' || error?.code === 'QR_EVALUATION_INPUT_REFUSED',
    );
  }
});

test('A3: QR compiler locally refuses hostile Profile/operation/rule graphs before Core normalisation', () => {
  const valid = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'qr_adversarial_profile',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'r1',
    extends_or_base_pin: 'quality_readiness_base_v0',
    source_refs: ['qr-adversarial-source'],
    operations: [{
      op: 'add',
      rule: {
        rule_id: 'QR-ADVERSARIAL-01',
        source_ref: 'qr-adversarial-source',
        source_locator: 'synthetic-section-1',
        source_modality: 'public synthetic evidence only',
        allowed_artifact_tokens: [null],
        required_authority_families: ['company_approved_procedure'],
        context_ref_fields: [],
        sufficiency_fields: [],
      },
    }],
    order: 0,
  };
  // A hostile graph must be rejected before digest normalisation can inspect a getter/trap.
  let calls = 0;
  const proxyOps = new Proxy([], { get() { calls += 1; throw new Error('must not run'); } });
  const hostile = { ...valid, operations: proxyOps, operation_digest: '0'.repeat(64) };
  assertCode(() => compileQualityReadinessRules([hostile]), QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);
  assert.equal(calls, 0);
  const customArray = { ...valid, operations: [] };
  Object.setPrototypeOf(customArray.operations, { custom: true });
  customArray.operation_digest = '0'.repeat(64);
  assertCode(() => compileQualityReadinessRules([customArray]), QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);
});

test('B3/A4: observation, guidance, and MCP refuse stale predecessor receipts, payloads, and actions', () => {
  const { fixture, assessment, observation, guidance } = derivedAssessment();
  const forgedAssessment = structuredClone(assessment);
  forgedAssessment.receipt.digests.assessment_sha256 = '0'.repeat(64);
  assertCode(() => projectQualityReadinessObservations({
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: forgedAssessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-forged-observation', 'r1', 'b'),
    known_at: fixture.typed_facts.typed_project_facts.known_at,
  }), QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY);
  const staleState = structuredClone(assessment);
  staleState.domain_result.results[0].state = 'satisfied';
  assertCode(() => buildQualityReadinessGuidance({
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: staleState,
    observation_projection: observation,
  }), QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY);
  const staleObservation = structuredClone(observation);
  staleObservation.receipt.observations_sha256 = '0'.repeat(64);
  assertCode(() => buildQualityReadinessGuidance({
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_projection: staleObservation,
  }), QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY);
  const payloadGuidance = structuredClone(guidance);
  payloadGuidance.cards[0].project_payload = { forbidden: true };
  assertCode(() => callQualityReadinessReadTool({
    name: 'guidance_next_steps',
    input: {
      effective_rule_set: fixture.assembly,
      typed_facts: fixture.typed_facts,
      assessment_run: assessment,
      observation_projection: observation,
      guidance: payloadGuidance,
    },
  }), QUALITY_READINESS_MCP_CODES.REQUEST_INVALID);
  const actionGuidance = structuredClone(guidance);
  actionGuidance.cards[0].next_action = 'write_a_project_file';
  assertCode(() => callQualityReadinessReadTool({
    name: 'guidance_next_steps',
    input: {
      effective_rule_set: fixture.assembly,
      typed_facts: fixture.typed_facts,
      assessment_run: assessment,
      observation_projection: observation,
      guidance: actionGuidance,
    },
  }), QUALITY_READINESS_MCP_CODES.REQUEST_INVALID);
});

test('B3/B4: MCP validates advisory receipt and source/RAG locators never accept workspace-private paths', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const rag = retrieveQualityReadinessAdvisoryEvidence({
    packet: fixture.rag_packet,
    query: { query_id: 'qr-adversarial-rag', topic_tags: ['quality'], source_packet_sha256: fixture.rag_packet.packet_sha256 },
  });
  const forgedRag = structuredClone(rag);
  forgedRag.receipt.output_sha256 = '0'.repeat(64);
  assertCode(() => callQualityReadinessReadTool({
    name: 'rag_status',
    input: {
      rag_result: forgedRag,
      rag_packet: fixture.rag_packet,
      query: { query_id: 'qr-adversarial-rag', topic_tags: ['quality'], source_packet_sha256: fixture.rag_packet.packet_sha256 },
    },
  }), QUALITY_READINESS_MCP_CODES.REQUEST_INVALID);
  assertCode(() => assertQualityReadinessPublicLocator('/workspace/private/secret', 'hostile locator'), QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY);
  assertCode(() => admitQualityReadinessDirectSource({
    source_id: 'qr-hostile-url', authority_family: 'quality_guidance', official_url: 'https://example.invalid/workspace/private',
    metadata_revision_ref: qualityReadinessSyntheticRef('qr-hostile-metadata', 'r1', 'a'),
    body_revision_ref: qualityReadinessSyntheticRef('qr-hostile-body', 'r1', 'b'),
    status_receipt_ref: qualityReadinessSyntheticRef('qr-hostile-status', 'r1', 'c'),
    exact_locator: 'synthetic-section-1', access_class: 'public_synthetic', applicability_ceiling: 'unknown_hold',
  }), QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY);
  assertCode(() => createQualityReadinessRagPacket({
    source_set_kind: 'public_synthetic', corpus_derivation_sha256: 'public_synthetic_no_corpus',
    direct_source_records: [fixture.source_direct_record],
    retrieval_records: [{ source_id: fixture.source_direct_record.source_id, direct_record_sha256: fixture.source_direct_record.record_sha256, locator: '/workspace/private/secret', topic_tags: ['quality'] }],
  }), QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED);
});

test('B5: public locator boundary rejects embedded paths, secret markers, and non-public HTTPS destinations with package codes', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const publicSynthetic = 'synthetic-section-1';
  assert.equal(assertQualityReadinessPublicLocator(publicSynthetic, 'public synthetic locator'), publicSynthetic);
  for (const publicOfficialUrl of [
    'https://example.invalid/public/record',
    'https://example.invalid/users/alice/record',
    'https://example.invalid/home/record',
  ]) {
    assert.equal(
      assertQualityReadinessPublicLocator(publicOfficialUrl, 'public official URL', { officialUrl: true }),
      publicOfficialUrl,
    );
  }
  const hostileLocators = [
    `note ${['C:', 'Users', 'owner', 'record'].join('\\')}`,
    `note ${['', '', 'server', 'share', 'record'].join('\\')}`,
    `note ${['', 'home', 'owner', 'record'].join('/')}`,
    'token=${API_KEY}',
    'api_key=synthetic-secret-value',
    ['s', 'k', '-', 'syntheticnotaworkingkey'].join(''),
    ['g', 'h', 'p', '_', 'syntheticnotaworkingtoken'].join(''),
    ['github', '_pat_', 'syntheticnotaworkingtoken'].join(''),
    ['xox', 'b-', 'synthetic-not-a-working-token'].join(''),
    '   ',
  ];
  for (const locator of hostileLocators) {
    assertPackageCode(
      () => assertQualityReadinessPublicLocator(locator, 'hostile locator'),
      QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
    );
  }
  const hostileOfficialUrls = [
    'not an official URL',
    'http://example.invalid/record',
    'https://user:password@example.invalid/record',
    'https://example.invalid/record?token=synthetic-secret-value',
    'https://example.invalid/record#private-anchor',
    'https://localhost/record',
    'https://service.internal/record',
    'https://printer.lan/record',
    'https://127.0.0.1/record',
    'https://10.0.0.1/record',
    'https://172.16.0.1/record',
    'https://192.168.1.1/record',
    'https://169.254.1.1/record',
    'https://100.64.0.1/record',
    'https://198.18.0.1/record',
    'https://service.localdomain/record',
    'https://[::]/record',
    'https://[::1]/record',
    'https://[fe80::1]/record',
    'https://[fd00::1]/record',
    'https://example.invalid/public/api_key%3Dsynthetic-secret-value',
    'https://example.invalid/public/%24%7BAPI_KEY%7D',
    'https://example.invalid/%255Fworkmeta/report',
    'data:text/plain,synthetic',
    'javascript:synthetic',
  ];
  for (const official_url of hostileOfficialUrls) {
    assertPackageCode(
      () => assertQualityReadinessPublicLocator(official_url, 'hostile official URL', { officialUrl: true }),
      QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
    );
    assertPackageCode(
      () => admitQualityReadinessDirectSource({
        source_id: 'qr-hostile-public-locator', authority_family: 'quality_guidance', official_url,
        metadata_revision_ref: qualityReadinessSyntheticRef('qr-hostile-locator-metadata', 'r1', 'a'),
        body_revision_ref: qualityReadinessSyntheticRef('qr-hostile-locator-body', 'r1', 'b'),
        status_receipt_ref: qualityReadinessSyntheticRef('qr-hostile-locator-status', 'r1', 'c'),
        exact_locator: publicSynthetic, access_class: 'public_synthetic', applicability_ceiling: 'unknown_hold',
      }),
      QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
    );
    if (official_url !== 'not an official URL') {
      assertPackageCode(
        () => createQualityReadinessRagPacket({
          source_set_kind: 'public_synthetic', corpus_derivation_sha256: 'public_synthetic_no_corpus',
          direct_source_records: [fixture.source_direct_record],
          retrieval_records: [{
            source_id: fixture.source_direct_record.source_id,
            direct_record_sha256: fixture.source_direct_record.record_sha256,
            locator: official_url,
            topic_tags: ['quality'],
          }],
        }),
        QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED,
      );
      const emitted = structuredClone(retrieveQualityReadinessAdvisoryEvidence({
        packet: fixture.rag_packet,
        query: { query_id: 'qr-hostile-emitted-locator', topic_tags: ['quality'], source_packet_sha256: fixture.rag_packet.packet_sha256 },
      }));
      emitted.candidate_locators[0].exact_locator = official_url;
      recloseRagOutputDigest(emitted);
      assertPackageCode(
        () => verifyQualityReadinessRagResult(emitted),
        QUALITY_READINESS_RAG_CODES.PACKET_FORGED,
      );
    }
  }
});

test('B5: corpus and RAG retrieval wrappers are admitted before caller fields are read', () => {
  for (const [call, code] of [
    [buildQualityReadinessSourceDirectCorpus, QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID],
    [retrieveQualityReadinessAdvisoryEvidence, QUALITY_READINESS_RAG_CODES.PACKET_REFUSED],
  ]) {
    assertPackageCode(() => call(undefined), code);
    assertPackageCode(() => call(null), code);
    let traps = 0;
    const hostile = new Proxy({}, {
      get() { traps += 1; throw new Error('outer wrapper field read must not run'); },
      ownKeys() { traps += 1; throw new Error('outer wrapper key read must not run'); },
    });
    assertPackageCode(() => call(hostile), code);
    assert.equal(traps, 0);
  }
});

test('B5: package-owned proof identity is immutable and malformed matrix values fail with package codes', () => {
  const sharedRow = sharedInventory.sources.find((row) => row.source_id === 'mil_std_1916_acceptance_product');
  const originalUrl = sharedRow.official_url;
  try {
    sharedRow.official_url = 'https://example.invalid/new-caller-query?token=synthetic-caller-material';
    assertPackageCode(
      () => buildQualityReadinessSourceDirectCorpus({ inventory: sharedInventory, matrix: sharedMatrix }),
      QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
    );
  } finally {
    sharedRow.official_url = originalUrl;
  }

  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const hostileRow = matrix.sources.find((row) => ![
    'mil_std_1916_acceptance_product',
    'far_part_46_quality_assurance',
    'nasa_std_8739_6_workmanship_implementation',
  ].includes(row.source_id));
  hostileRow.unresolved_or_hold = { toString: 'blocked', valueOf: 'blocked' };
  assertPackageCode(
    () => buildQualityReadinessSourceDirectCorpus({ inventory, matrix }),
    QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID,
  );

  const secretInventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const secretMatrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const hwpHold = secretMatrix.sources.find((row) => row.body_access_state === 'official_public_extracted_hwp_blocked');
  hwpHold.unresolved_or_hold = ['pass', 'word=', 'synthetic-not-a-real-value'].join('');
  assertPackageCode(
    () => buildQualityReadinessSourceDirectCorpus({ inventory: secretInventory, matrix: secretMatrix }),
    QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
  );

  const titleInventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const titleMatrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  titleInventory.sources[0].title = ['client', '_secret=', 'synthetic-not-a-real-value'].join('');
  assertPackageCode(
    () => buildQualityReadinessSourceDirectCorpus({ inventory: titleInventory, matrix: titleMatrix }),
    QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
  );

  const preImportProbe = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    const inventory = (await import('./guild_hall/engineering_engine/engines/quality_readiness/contracts/quality_readiness_public_source_inventory_candidate_v1.json', { with: { type: 'json' } })).default;
    const matrix = (await import('./guild_hall/engineering_engine/engines/quality_readiness/contracts/quality_readiness_source_family_matrix_candidate_v1.json', { with: { type: 'json' } })).default;
    inventory.sources.find((row) => row.source_id === 'mil_std_1916_acceptance_product').official_url = 'https://example.invalid/preimport-caller-query?token=synthetic-caller-material';
    let output;
    try {
      const source = await import('./guild_hall/engineering_engine/engines/quality_readiness/source/quality_readiness_source_derivation.mjs');
      const corpus = source.buildQualityReadinessSourceDirectCorpus({ inventory, matrix });
      const row = corpus.records.find((record) => record.source_id === 'mil_std_1916_acceptance_product');
      output = { accepted: true, claim_ceiling: row.claim_ceiling, state: row.direct_source_state };
    } catch (error) {
      output = { accepted: false, code: error?.code ?? null, type: error?.constructor?.name ?? null };
    }
    process.stdout.write(JSON.stringify(output));
  `], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(preImportProbe.status, 0, preImportProbe.stderr);
  assert.deepEqual(JSON.parse(preImportProbe.stdout), {
    accepted: false,
    code: QUALITY_READINESS_SOURCE_CODES.PUBLIC_BOUNDARY,
    type: 'ContractError',
  });

  const preImportCycleProbe = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    const inventory = (await import('./guild_hall/engineering_engine/engines/quality_readiness/contracts/quality_readiness_public_source_inventory_candidate_v1.json', { with: { type: 'json' } })).default;
    const matrix = (await import('./guild_hall/engineering_engine/engines/quality_readiness/contracts/quality_readiness_source_family_matrix_candidate_v1.json', { with: { type: 'json' } })).default;
    const cycle = {};
    cycle.self = cycle;
    inventory.sources[0].title = cycle;
    let output;
    try {
      const source = await import('./guild_hall/engineering_engine/engines/quality_readiness/source/quality_readiness_source_derivation.mjs');
      source.buildQualityReadinessSourceDirectCorpus({ inventory, matrix });
      output = { accepted: true };
    } catch (error) {
      output = { accepted: false, code: error?.code ?? null, type: error?.constructor?.name ?? null };
    }
    process.stdout.write(JSON.stringify(output));
  `], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(preImportCycleProbe.status, 0, preImportCycleProbe.stderr);
  assert.deepEqual(JSON.parse(preImportCycleProbe.stdout), {
    accepted: false,
    code: QUALITY_READINESS_SOURCE_CODES.INVENTORY_INVALID,
    type: 'ContractError',
  });
});

test('B4: an impostor proof-subset identity is held and cannot mint source-supported state', () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const source = inventory.sources.find((row) => row.source_id === 'mil_std_1916_acceptance_product');
  source.official_url = 'https://example.invalid/impostor-proof-row';
  const corpus = buildQualityReadinessSourceDirectCorpus({ inventory, matrix });
  const impostor = corpus.records.find((row) => row.source_id === 'mil_std_1916_acceptance_product');
  assert.equal(impostor.claim_ceiling, 'observed');
  assert.equal(impostor.direct_source_state, 'hold_canonical_identity_mismatch');
  assert.equal(Object.hasOwn(impostor, 'proof_subset_source_ref'), false);
});

test('B6 RED: Ajv mutations expose shallow acceptance before schemas are recursively closed', () => {
  const { fixture, assessment, observation, guidance } = derivedAssessment();
  const rag = retrieveQualityReadinessAdvisoryEvidence({
    packet: fixture.rag_packet,
    query: { query_id: 'qr-schema-rag', topic_tags: ['quality'], source_packet_sha256: fixture.rag_packet.packet_sha256 },
  });
  const mcpPreview = callQualityReadinessReadTool({
    name: 'guidance_next_steps',
    input: {
      effective_rule_set: fixture.assembly,
      typed_facts: fixture.typed_facts,
      assessment_run: assessment,
      observation_projection: observation,
      guidance,
    },
  });
  const deepening = {
    schema_version: 'soulforge.quality_readiness.public_synthetic_deepening_run.v0', assessment, rag, observation, guidance, mcp_preview: mcpPreview,
    effects: { filesystem_reads: 0, filesystem_writes: 0, network_calls: 0, model_calls: 0, rag_calls: 0 },
  };
  const schemaCases = [
    ['quality_readiness_evaluation_input_schema_v1.json', 'soulforge.quality_readiness.evaluation_input.v1', fixture.typed_facts],
    ['quality_readiness_typed_facts_envelope_schema_v1.json', 'soulforge.quality_readiness.typed_facts_envelope.v0', fixture.typed_facts],
    ['quality_readiness_assessment_result_schema_v1.json', 'soulforge.quality_readiness.assessment_result.v1', assessment],
    ['quality_readiness_rag_result_schema_v1.json', 'soulforge.quality_readiness.rag_result.v0', rag],
    ['quality_readiness_observation_projection_schema_v1.json', 'soulforge.quality_readiness.observation_projection.v0', observation],
    ['quality_readiness_guidance_schema_v1.json', 'soulforge.quality_readiness.guidance.v0', guidance],
    ['quality_readiness_deepening_run_schema_v1.json', 'soulforge.quality_readiness.public_synthetic_deepening_run.v0', deepening],
  ];
  const ajv = new Ajv2020({ strict: false });
  for (const [file, expectedId] of schemaCases) {
    const schema = JSON.parse(readFileSync(`${schemaRoot}${file}`, 'utf8'));
    assert.equal(schema.$id, expectedId, `${file} must retain its published semantic ID`);
    ajv.addSchema(schema);
  }
  for (const [file, expectedId, value] of schemaCases) {
    const validate = ajv.getSchema(expectedId);
    assert.ok(validate, `${file} must register by its unchanged $id`);
    assert.equal(validate(value), true, `${file}: ${JSON.stringify(validate.errors)}`);
  }
  const evaluationValidate = ajv.getSchema('soulforge.quality_readiness.evaluation_input.v1');
  const baseRequest = buildQualityReadinessPublicSyntheticRequest();
  assert.equal(evaluationValidate(baseRequest), true, JSON.stringify(evaluationValidate.errors));
  assert.equal(evaluationValidate({ request: baseRequest }), true, JSON.stringify(evaluationValidate.errors));
  const typedValidate = ajv.getSchema('soulforge.quality_readiness.typed_facts_envelope.v0');
  const extra = structuredClone(fixture.typed_facts); extra.extra = true;
  const badDigest = structuredClone(fixture.typed_facts); badDigest.typed_project_facts.facts_digest = 'bad';
  assert.equal(typedValidate(extra), false);
  assert.equal(typedValidate(badDigest), false);
  const assessmentValidate = ajv.getSchema('soulforge.quality_readiness.assessment_result.v1');
  const baseAssessment = qualityReadinessAdapter.evaluate(baseEffectiveRuleset(), baseRequest, {});
  assert.equal(assessmentValidate(baseAssessment), true, JSON.stringify(assessmentValidate.errors));
  const baseAssessmentWithoutLane = structuredClone(baseAssessment);
  delete baseAssessmentWithoutLane.receipt.bindings.evaluation_input_lane;
  assert.equal(assessmentValidate(baseAssessmentWithoutLane), false);
  const badLane = structuredClone(assessment); badLane.receipt.bindings.profile_evaluation_lane = 'forged_lane';
  assert.equal(assessmentValidate(badLane), false);
  const mutations = [
    ['typed nested extra', typedValidate, fixture.typed_facts, (value) => { value.typed_project_facts.facts[0].context_refs.extra = true; }],
    ['typed ref ID', typedValidate, fixture.typed_facts, (value) => { value.typed_project_facts.project_binding_ref.content_id = 'not-a-sha256-ref'; }],
    ['typed profile binding shape', typedValidate, fixture.typed_facts, (value) => { value.compilation_trace.profiles[0].source_refs = []; }],
    ['assessment count extra', assessmentValidate, assessment, (value) => { value.assessment.result_counts.extra = 1; }],
    ['assessment result ID', assessmentValidate, assessment, (value) => { value.domain_result.results[0].rule_id = 'forged rule id'; }],
    ['assessment source binding', assessmentValidate, assessment, (value) => { value.receipt.bindings.profile_source_bindings[0].access_class = 'forged'; }],
    ['assessment canon ceiling', assessmentValidate, assessment, (value) => { value.assessment.canon_claim_ceiling = 'canon_entry'; }],
    ['assessment source tuple', assessmentValidate, assessment, (value) => { value.receipt.bindings.profile_source_bindings[0].source_lane = 'official_public'; }],
    ['assessment typed binding missing', assessmentValidate, assessment, (value) => { delete value.receipt.bindings.profile_source_bindings; }],
    ['typed profile order', typedValidate, fixture.typed_facts, (value) => { value.compilation_trace.profiles[0].order = 1; }],
    ['typed duplicate project topology', typedValidate, fixture.typed_facts, (value) => {
      value.compilation_trace.profiles[0].profile_kind = 'project';
      const secondProject = structuredClone(value.compilation_trace.profiles[0]);
      secondProject.order = 1;
      value.compilation_trace.profiles.push(secondProject);
      value.compilation_trace.organization_trace = null;
      const { order, profile_kind, ...summary } = value.compilation_trace.profiles[0];
      value.compilation_trace.project_trace = summary;
    }],
    ['typed absent project summary', typedValidate, fixture.typed_facts, (value) => { value.compilation_trace.project_trace = structuredClone(value.compilation_trace.organization_trace); }],
    ['typed Profile claim ceiling', typedValidate, fixture.typed_facts, (value) => { value.assessment_context.binding.profile_source_bindings[0].claim_ceiling = 'source_supported'; }],
    ['RAG candidate extra', ajv.getSchema('soulforge.quality_readiness.rag_result.v0'), rag, (value) => { value.candidate_locators[0].extra = true; }],
    ['RAG effects', ajv.getSchema('soulforge.quality_readiness.rag_result.v0'), rag, (value) => { value.receipt.effects.network_calls = 1; }],
    ['RAG status cardinality', ajv.getSchema('soulforge.quality_readiness.rag_result.v0'), rag, (value) => { value.status = 'hold_no_admissible_locator'; }],
    ['RAG private locator', ajv.getSchema('soulforge.quality_readiness.rag_result.v0'), rag, (value) => { value.candidate_locators[0].exact_locator = '/workspace/private/secret'; }],
    ['observation row ID', ajv.getSchema('soulforge.quality_readiness.observation_projection.v0'), observation, (value) => { value.observations[0].observation_id = 'forged observation'; }],
    ['observation count extra', ajv.getSchema('soulforge.quality_readiness.observation_projection.v0'), observation, (value) => { value.counts.extra = 1; }],
    ['observation state combination', ajv.getSchema('soulforge.quality_readiness.observation_projection.v0'), observation, (value) => { value.observations[0].observation_state = 'observation_unavailable'; value.observations[0].presence_state = 'present'; }],
    ['guidance card ID', ajv.getSchema('soulforge.quality_readiness.guidance.v0'), guidance, (value) => { value.cards[0].guide_id = 'forged guide'; }],
    ['guidance effects', ajv.getSchema('soulforge.quality_readiness.guidance.v0'), guidance, (value) => { value.receipt.effects.rag_calls = 1; }],
    ['deepening mcp shape', ajv.getSchema('soulforge.quality_readiness.public_synthetic_deepening_run.v0'), deepening, (value) => { value.mcp_preview.cards[0].extra = true; }],
    ['deepening lane', ajv.getSchema('soulforge.quality_readiness.public_synthetic_deepening_run.v0'), deepening, (value) => { value.assessment.receipt.bindings.profile_evaluation_lane = 'forged_lane'; }],
  ];
  for (const [label, validate, original, mutate] of mutations) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.equal(validate(forged), false, `${label}: ${JSON.stringify(validate.errors)}`);
  }
  const ragValidate = ajv.getSchema('soulforge.quality_readiness.rag_result.v0');
  for (const [index, locator] of ['https://example.invalid/public/record', '§46.407'].entries()) {
    const packet = createQualityReadinessRagPacket({
      source_set_kind: 'public_synthetic',
      corpus_derivation_sha256: 'public_synthetic_no_corpus',
      direct_source_records: [fixture.source_direct_record],
      retrieval_records: [{
        source_id: fixture.source_direct_record.source_id,
        direct_record_sha256: fixture.source_direct_record.record_sha256,
        locator,
        topic_tags: ['quality'],
      }],
    });
    const result = retrieveQualityReadinessAdvisoryEvidence({
      packet,
      query: { query_id: `qr-schema-public-locator-${index}`, topic_tags: ['quality'], source_packet_sha256: packet.packet_sha256 },
    });
    assert.equal(ragValidate(result), true, `${locator}: ${JSON.stringify(ragValidate.errors)}`);
  }
  const engine = readFileSync(enginePath, 'utf8');
  assert.match(engine, /^claim_ceiling: observed$/mu);
  for (const schemaFile of schemaCases.map(([file]) => file)) assert.match(engine, new RegExp(schemaFile.replace(/[.]/gu, '\\.'), 'u'));
});
