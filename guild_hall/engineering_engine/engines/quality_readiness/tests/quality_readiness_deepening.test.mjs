import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { evaluate } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  buildQualityReadinessTypedFacts,
  qualityReadinessFactsDigest,
  requestFromQualityReadinessTypedFacts,
  QUALITY_READINESS_TYPED_FACTS_CODES,
} from '../binding/quality_readiness_typed_facts.mjs';
import { qualityReadinessAdapter } from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import { assessQualityReadiness } from '../evaluator/quality_readiness.mjs';
import {
  buildQualityReadinessDeepeningPublicSynthetic,
  qualityReadinessSyntheticRef,
  QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
} from '../fixtures/quality_readiness_deepening_public_synthetic.mjs';
import { buildQualityReadinessPublicSyntheticRequest } from '../fixtures/quality_readiness_public_synthetic.mjs';
import {
  buildQualityReadinessGuidance,
  QUALITY_READINESS_GUIDANCE_CODES,
} from '../guidance/quality_readiness_guidance.mjs';
import {
  callQualityReadinessReadTool,
  handleQualityReadinessMcpRequest,
  listQualityReadinessReadTools,
  QUALITY_READINESS_MCP_CODES,
} from '../mcp/quality_readiness_read_tools.mjs';
import {
  projectQualityReadinessObservations,
  QUALITY_READINESS_OBSERVATION_CODES,
} from '../observation/quality_readiness_observation.mjs';
import {
  createQualityReadinessRagPacket,
  retrieveQualityReadinessAdvisoryEvidence,
  QUALITY_READINESS_RAG_CODES,
} from '../rag/quality_readiness_rag_boundary.mjs';
import {
  admitQualityReadinessDirectSource,
  buildQualityReadinessSourceDirectCorpus,
  verifyQualityReadinessDirectSourceRecord,
  QUALITY_READINESS_SOURCE_CODES,
} from '../source/quality_readiness_source_derivation.mjs';
import { getQualityReadinessDeepeningTopology } from '../topology/quality_readiness_deepening_topology.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const inventoryPath = fileURLToPath(new URL('../contracts/quality_readiness_public_source_inventory_candidate_v1.json', import.meta.url));
const matrixPath = fileURLToPath(new URL('../contracts/quality_readiness_source_family_matrix_candidate_v1.json', import.meta.url));
const runnerPath = fileURLToPath(new URL('../tools/quality_readiness_runner.mjs', import.meta.url));

const deepFrozen = (value) => {
  if (!value || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(deepFrozen);
};

function sourceCorpus() {
  return buildQualityReadinessSourceDirectCorpus({
    inventory: JSON.parse(readFileSync(inventoryPath, 'utf8')),
    matrix: JSON.parse(readFileSync(matrixPath, 'utf8')),
  });
}

function syntheticDirectRecord({ source_id = 'qr_public_synthetic_source_02', access_class = 'public_synthetic' } = {}) {
  const fill = createHash('sha256').update(source_id).digest('hex');
  const ref = (label, offset) => qualityReadinessSyntheticRef(
    `qr-deep-${label}-${source_id}`,
    'r1',
    fill[(offset % fill.length)],
  );
  return admitQualityReadinessDirectSource({
    source_id,
    authority_family: 'quality_guidance',
    official_url: `https://example.invalid/${source_id}`,
    metadata_revision_ref: ref('metadata', 0),
    body_revision_ref: ref('body', 1),
    status_receipt_ref: ref('status', 2),
    exact_locator: 'synthetic-section-2',
    access_class,
    applicability_ceiling: 'unknown_hold',
  });
}

test('Q1-G2: the checked-in 56-row catalog deterministically emits a public-safe direct-source record with bounded ceilings', () => {
  const first = sourceCorpus();
  const second = sourceCorpus();
  assert.equal(first.source_count, 56);
  assert.deepEqual(first.counts, {
    total: 56,
    official_public_routing_only: 55,
    excluded_nonofficial_overlay: 1,
    proof_subset_packet_bound: 3,
    direct_confirmation_required: 37,
    hold: 15,
  });
  assert.equal(first.derivation_sha256, second.derivation_sha256);
  assert.equal(first.claim_ceiling, 'source_supported');
  assert.equal(first.applicability_ceiling, 'unknown_hold');
  assert.equal(first.source_adoption, false);
  assert.equal(first.rule_acceptance, false);
  assert.ok(first.records.every((record) => record.applicability_ceiling === 'unknown_hold'));
  assert.ok(first.records.every((record) => ['observed', 'source_supported'].includes(record.claim_ceiling)));
  assert.equal(first.records.filter((record) => record.claim_ceiling === 'source_supported').length, 3);
  assert.deepEqual(
    first.records.filter((record) => record.direct_source_state === 'proof_subset_packet_bound')
      .map((record) => record.proof_subset_source_ref).sort(),
    ['S2-FAR-46', 'S1-MIL-STD-1916', 'S3-NASA-STD-8739.6B'].sort(),
  );
  assert.equal(first.records.filter((record) => record.authority_class === 'excluded_nonofficial').length, 1);
  assert.ok(first.records.every((record) => !Object.hasOwn(record, 'source_body') && !Object.hasOwn(record, 'chunks')));
  assert.deepEqual(first.effects, {
    filesystem_reads: 0,
    filesystem_writes: 0,
    network_calls: 0,
    model_calls: 0,
    rag_calls: 0,
  });
  assert.equal(deepFrozen(first), true);
});

test('Q1-G2: direct-source admission requires separate pinned metadata, body, and status refs and preserves no source body', () => {
  const direct = syntheticDirectRecord();
  assert.equal(direct.claim_ceiling, 'observed');
  assert.equal(direct.direct_source_state, 'synthetic_direct_confirmed');
  assert.equal(syntheticDirectRecord({ source_id: 'qr_official_direct_01', access_class: 'official_public' }).claim_ceiling, 'source_supported');
  assert.equal(verifyQualityReadinessDirectSourceRecord(direct).record_sha256, direct.record_sha256);
  const forged = structuredClone(direct);
  forged.record_sha256 = '0'.repeat(64);
  assert.throws(
    () => verifyQualityReadinessDirectSourceRecord(forged),
    (error) => error.code === QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID,
  );
  assert.throws(
    () => admitQualityReadinessDirectSource({
      source_id: 'qr_direct_bad',
      authority_family: 'quality_guidance',
      official_url: 'https://example.invalid/bad',
      metadata_revision_ref: qualityReadinessSyntheticRef('same-ref', 'r1', 'a'),
      body_revision_ref: qualityReadinessSyntheticRef('same-ref', 'r1', 'a'),
      status_receipt_ref: qualityReadinessSyntheticRef('status-ref', 'r1', 'b'),
      exact_locator: 'synthetic-section-3',
      access_class: 'public_synthetic',
      applicability_ceiling: 'unknown_hold',
    }),
    (error) => error.code === QUALITY_READINESS_SOURCE_CODES.DIRECT_RECORD_INVALID,
  );
});

test('Q1 hardening: controlled-dependency classification uses bounded tokens and does not collide with eligible', () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const candidate = matrix.sources.find((row) => row.source_id === 'dapa_quality_management_rule_law_20251017');
  candidate.unresolved_or_hold = 'eligible commentary is still awaiting direct confirmation';
  const eligibleCorpus = buildQualityReadinessSourceDirectCorpus({ inventory, matrix });
  assert.equal(
    eligibleCorpus.records.find((record) => record.source_id === candidate.source_id).direct_source_state,
    'direct_confirmation_required',
  );

  const controlledInventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const controlledMatrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const controlled = controlledMatrix.sources.find((row) => row.source_id === 'dapa_quality_management_rule_law_20251017');
  controlled.unresolved_or_hold = 'paid controlled baseline requires an authorized channel';
  const controlledCorpus = buildQualityReadinessSourceDirectCorpus({ inventory: controlledInventory, matrix: controlledMatrix });
  assert.equal(
    controlledCorpus.records.find((record) => record.source_id === controlled.source_id).direct_source_state,
    'hold_controlled_dependency',
  );
});

test('Q1-G3: advisory RAG returns only locator candidates and fails closed for stale, forged, mixed, and raw packets', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const result = retrieveQualityReadinessAdvisoryEvidence({
    packet: fixture.rag_packet,
    query: {
      query_id: 'qr_deepening_query_01',
      topic_tags: ['quality'],
      source_packet_sha256: fixture.rag_packet.packet_sha256,
    },
  });
  assert.equal(result.status, 'advisory_locator_candidates');
  assert.equal(result.verdict_authority, false);
  assert.equal(result.rule_authority, false);
  assert.equal(result.candidate_locators.length, 1);
  assert.equal(result.candidate_locators[0].claim_ceiling, 'observed');
  assert.equal(result.candidate_locators[0].confirmation_required_before_rule_or_verdict, true);
  assert.deepEqual(result.receipt.effects, {
    filesystem_reads: 0,
    filesystem_writes: 0,
    network_calls: 0,
    model_calls: 0,
    rag_calls: 0,
  });
  const noMatch = retrieveQualityReadinessAdvisoryEvidence({
    packet: fixture.rag_packet,
    query: {
      query_id: 'qr_deepening_query_no_match',
      topic_tags: ['unmatched'],
      source_packet_sha256: fixture.rag_packet.packet_sha256,
    },
  });
  assert.equal(noMatch.status, 'hold_no_admissible_locator');
  assert.deepEqual(noMatch.candidate_locators, []);

  assert.throws(
    () => retrieveQualityReadinessAdvisoryEvidence({
      packet: fixture.rag_packet,
      query: { query_id: 'qr_deepening_query_01', topic_tags: ['quality'], source_packet_sha256: '0'.repeat(64) },
    }),
    (error) => error.code === QUALITY_READINESS_RAG_CODES.PACKET_STALE,
  );
  assert.throws(
    () => retrieveQualityReadinessAdvisoryEvidence({
      packet: null,
      query: { query_id: 'qr_deepening_query_01', topic_tags: ['quality'], source_packet_sha256: fixture.rag_packet.packet_sha256 },
    }),
    (error) => error.code === QUALITY_READINESS_RAG_CODES.PACKET_REFUSED,
  );
  const forgedPacket = structuredClone(fixture.rag_packet);
  forgedPacket.packet_sha256 = '0'.repeat(64);
  assert.throws(
    () => retrieveQualityReadinessAdvisoryEvidence({
      packet: forgedPacket,
      query: { query_id: 'qr_deepening_query_01', topic_tags: ['quality'], source_packet_sha256: forgedPacket.packet_sha256 },
    }),
    (error) => error.code === QUALITY_READINESS_RAG_CODES.PACKET_FORGED,
  );
  const unauthorized = syntheticDirectRecord({ source_id: 'qr_official_like_01', access_class: 'official_public' });
  assert.throws(
    () => createQualityReadinessRagPacket({
      source_set_kind: 'public_synthetic',
      corpus_derivation_sha256: 'public_synthetic_no_corpus',
      direct_source_records: [unauthorized],
      retrieval_records: [{
        source_id: unauthorized.source_id,
        direct_record_sha256: unauthorized.record_sha256,
        locator: 'synthetic-section-2',
        topic_tags: ['quality'],
      }],
    }),
    (error) => error.code === QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED,
  );
  assert.throws(
    () => createQualityReadinessRagPacket({
      source_set_kind: 'public_synthetic',
      corpus_derivation_sha256: 'public_synthetic_no_corpus',
      direct_source_records: [fixture.source_direct_record],
      retrieval_records: [{
        source_id: fixture.source_direct_record.source_id,
        direct_record_sha256: fixture.source_direct_record.record_sha256,
        locator: 'synthetic-section-1',
        topic_tags: ['quality'],
        raw_text: 'forbidden',
      }],
    }),
    (error) => error.code === QUALITY_READINESS_RAG_CODES.PACKET_UNAUTHORIZED,
  );
});

test('Q1-G4: derived Profile evaluation uses the Core-compatible Typed Facts envelope and retains full per-Profile trace', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const before = JSON.stringify(fixture.request);
  const result = evaluate(qualityReadinessAdapter, fixture.assembly, fixture.typed_facts, {});
  const profileResult = result.domain_result.results.find((row) => row.rule_id === 'QR-SYNTH-01');
  assert.equal(profileResult.state, 'satisfied');
  assert.equal(profileResult.canon_claim_ceiling, 'observed');
  assert.equal(JSON.stringify(fixture.request), before);
  assert.equal(result.receipt.bindings.profile_source_bindings.length, 1);
  assert.equal(result.receipt.bindings.profile_evaluation_lane, 'public_synthetic');
  assert.deepEqual(
    result.receipt.bindings.profile_source_bindings[0].direct_derivation_ref,
    fixture.source_direct_record.direct_derivation_ref,
  );
  assert.deepEqual(result.receipt.bindings.profile_compilation_trace.profiles[0], {
    order: 0,
    profile_kind: 'organization',
    profile_id: 'qr_public_synthetic_org_01',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'r1',
    extends_or_base_pin: 'quality_readiness_base_v0',
    operation_digest: fixture.assembly.compilation_trace.profiles[0].operation_digest,
    applied_operations_count: 1,
    source_refs: ['qr_public_synthetic_source_01'],
  });
  assert.equal(fixture.typed_facts.typed_project_facts.schema_version, 'soulforge.typed_project_facts.v0');
  assert.equal(fixture.typed_facts.typed_project_facts.facts.length, 6);
  assert.equal(deepFrozen(fixture.typed_facts), true);
  const roundTrip = requestFromQualityReadinessTypedFacts(fixture.typed_facts);
  assert.deepEqual(roundTrip.compilation_trace, fixture.assembly.compilation_trace);
  assert.deepEqual(roundTrip.compilation_trace.compilation_scope, { execution_lane: 'public_synthetic' });
  assert.equal(deepFrozen(roundTrip), true);

  const badDigest = structuredClone(fixture.typed_facts);
  badDigest.typed_project_facts.facts_digest = '0'.repeat(64);
  assert.throws(
    () => requestFromQualityReadinessTypedFacts(badDigest),
    (error) => error.code === QUALITY_READINESS_TYPED_FACTS_CODES.DIGEST_MISMATCH,
  );
  const badTrace = structuredClone(fixture.typed_facts);
  badTrace.compilation_trace.profiles[0].profile_id = 'forged_profile';
  assert.throws(
    () => evaluate(qualityReadinessAdapter, fixture.assembly, badTrace, {}),
    (error) => error.code === QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH,
  );
  const badScope = structuredClone(fixture.typed_facts);
  badScope.compilation_trace.compilation_scope = { forged_scope: true };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, fixture.assembly, badScope, {}),
    (error) => error.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED',
  );
});

test('Q1 hardening: derived Profile source bindings refuse missing, downgraded, duplicate, and lane-confused inputs', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const assertProfileRefused = (mutate) => {
    const envelope = structuredClone(fixture.typed_facts);
    mutate(envelope.assessment_context.binding);
    assert.throws(
      () => evaluate(qualityReadinessAdapter, fixture.assembly, envelope, {}),
      (error) => error.code === 'QUALITY_READINESS_PROFILE_SOURCE_REFUSED',
    );
  };
  assertProfileRefused((binding) => { delete binding.profile_source_bindings; });
  assertProfileRefused((binding) => { binding.profile_source_bindings[0].claim_ceiling = 'source_supported'; });
  assertProfileRefused((binding) => { binding.profile_source_bindings.push(structuredClone(binding.profile_source_bindings[0])); });
  assertProfileRefused((binding) => { binding.profile_source_bindings[0].source_lane = 'official_public'; });
  const widenedClassification = structuredClone(fixture.typed_facts);
  widenedClassification.assessment_context.manifest.supported_project_classifications = ['public_synthetic', 'real_project'];
  widenedClassification.assessment_context.binding.module_bindings[0].supported_project_classifications = ['public_synthetic', 'real_project'];
  assert.throws(
    () => evaluate(qualityReadinessAdapter, fixture.assembly, widenedClassification, {}),
    (error) => error.code === 'QUALITY_READINESS_PROFILE_SOURCE_REFUSED',
  );
});

test('Q1 B1: aggregate and guidance claim ceilings clamp to the weakest evaluated source lane', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const syntheticAssessment = evaluate(qualityReadinessAdapter, fixture.assembly, fixture.typed_facts, {});
  assert.ok(syntheticAssessment.domain_result.results.some((row) => row.canon_claim_ceiling === 'source_supported'));
  assert.ok(syntheticAssessment.domain_result.results.some((row) => row.canon_claim_ceiling === 'observed'));
  assert.equal(syntheticAssessment.domain_result.canon_claim_ceiling, 'observed');
  assert.equal(syntheticAssessment.assessment.canon_claim_ceiling, 'observed');
  const syntheticObservation = projectQualityReadinessObservations({
    typed_facts: fixture.typed_facts,
    assessment_run: syntheticAssessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-b1-observation-run', 'r1', 'b'),
    known_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
  });
  const syntheticGuidance = buildQualityReadinessGuidance({
    assessment_run: syntheticAssessment,
    observation_projection: syntheticObservation,
  });
  assert.equal(syntheticGuidance.claim_ceiling, 'observed');

  const syntheticLaneBaseOnly = structuredClone(fixture.typed_facts);
  syntheticLaneBaseOnly.assessment_context.binding.accepted_rule_bindings = syntheticLaneBaseOnly
    .assessment_context.binding.accepted_rule_bindings
    .filter((binding) => binding.rule_id !== 'QR-SYNTH-01');
  syntheticLaneBaseOnly.typed_project_facts.facts = syntheticLaneBaseOnly.typed_project_facts.facts
    .filter((fact) => fact.rule_id !== 'QR-SYNTH-01');
  syntheticLaneBaseOnly.typed_project_facts.facts_digest = qualityReadinessFactsDigest(
    syntheticLaneBaseOnly.typed_project_facts.facts,
  );
  const baseOnlyAssessment = evaluate(qualityReadinessAdapter, fixture.assembly, syntheticLaneBaseOnly, {});
  assert.ok(baseOnlyAssessment.domain_result.results.every((row) => row.canon_claim_ceiling === 'source_supported'));
  assert.equal(baseOnlyAssessment.domain_result.canon_claim_ceiling, 'observed');
  assert.equal(baseOnlyAssessment.assessment.canon_claim_ceiling, 'observed');
  const baseOnlyObservation = projectQualityReadinessObservations({
    typed_facts: syntheticLaneBaseOnly,
    assessment_run: baseOnlyAssessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-b1-base-only-observation-run', 'r1', 'c'),
    known_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
  });
  assert.equal(
    buildQualityReadinessGuidance({ assessment_run: baseOnlyAssessment, observation_projection: baseOnlyObservation }).claim_ceiling,
    'observed',
  );

  const officialAssessment = assessQualityReadiness(buildQualityReadinessPublicSyntheticRequest());
  assert.ok(officialAssessment.domain_result.results.every((row) => row.canon_claim_ceiling === 'source_supported'));
  assert.equal(officialAssessment.domain_result.canon_claim_ceiling, 'source_supported');
  assert.equal(officialAssessment.assessment.canon_claim_ceiling, 'source_supported');
});

test('Q1-G5: observation and guidance remain zero-write owner-review projections, and local MCP exposes only read tools', () => {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const assessment = evaluate(qualityReadinessAdapter, fixture.assembly, fixture.typed_facts, {});
  const observation = projectQualityReadinessObservations({
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-deep-observation-run', 'r1', '9'),
    known_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
  });
  const guidance = buildQualityReadinessGuidance({ assessment_run: assessment, observation_projection: observation });
  assert.equal(observation.receipt.assessment_sha256, assessment.receipt.digests.assessment_sha256);
  assert.equal(observation.receipt.typed_facts_sha256, assessment.receipt.bindings.typed_facts_sha256);
  for (const tamperedCeiling of ['canon_entry', 'totally_bogus']) {
    const tamperedAssessment = structuredClone(assessment);
    tamperedAssessment.assessment.canon_claim_ceiling = tamperedCeiling;
    assert.throws(
      () => buildQualityReadinessGuidance({ assessment_run: tamperedAssessment, observation_projection: observation }),
      (error) => error.code === QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY,
      `guidance must refuse tampered canon ceiling ${tamperedCeiling}`,
    );
  }
  assert.deepEqual(observation.counts, {
    total: 6,
    observed_present: 4,
    observed_absence_confirmed: 1,
    observation_unavailable: 1,
  });
  assert.equal(guidance.verdict_authority, false);
  assert.equal(guidance.cards.length, 6);
  assert.ok(guidance.cards.every((card) => card.owner_review_required && card.verdict_authority === false));
  assert.ok(listQualityReadinessReadTools().every((tool) => tool.write === false));
  const topology = getQualityReadinessDeepeningTopology();
  assert.equal(topology.global_registration, false);
  assert.equal(topology.writer_enabled, false);
  const mcpGuidance = callQualityReadinessReadTool({ name: 'guidance_next_steps', input: { guidance } });
  assert.equal(mcpGuidance.cards.length, 6);
  const mcpList = handleQualityReadinessMcpRequest({ method: 'tools/list', params: {} });
  assert.equal(mcpList.tools.length, 5);
  assert.throws(
    () => callQualityReadinessReadTool({ name: 'engine_status', input: { write: true } }),
    (error) => error.code === QUALITY_READINESS_MCP_CODES.WRITE_REFUSED,
  );
  assert.throws(
    () => callQualityReadinessReadTool({ name: 'engine_status', input: Object.create({ write: true }) }),
    (error) => error.code === QUALITY_READINESS_MCP_CODES.WRITE_REFUSED,
  );
  assert.throws(
    () => callQualityReadinessReadTool({ name: 'engine_status', input: Object.create({}) }),
    (error) => error.code === QUALITY_READINESS_MCP_CODES.REQUEST_INVALID,
  );
  assert.throws(
    () => callQualityReadinessReadTool({ name: 'engine_status', input: null }),
    (error) => error.code === QUALITY_READINESS_MCP_CODES.REQUEST_INVALID,
  );
  assert.throws(
    () => handleQualityReadinessMcpRequest({
      method: 'tools/call',
      params: { name: 'engine_status', arguments: null },
    }),
    (error) => error.code === QUALITY_READINESS_MCP_CODES.REQUEST_INVALID,
  );
  const staleObservation = structuredClone(observation);
  staleObservation.receipt.assessment_sha256 = '0'.repeat(64);
  assert.throws(
    () => buildQualityReadinessGuidance({ assessment_run: assessment, observation_projection: staleObservation }),
    (error) => error.code === QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY,
  );
  const mismatchedAssessment = structuredClone(assessment);
  mismatchedAssessment.receipt.bindings.typed_facts_sha256 = '0'.repeat(64);
  assert.throws(
    () => projectQualityReadinessObservations({
      typed_facts: fixture.typed_facts,
      assessment_run: mismatchedAssessment,
      observation_run_ref: qualityReadinessSyntheticRef('qr-deep-observation-run-mismatch', 'r1', 'a'),
      known_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
    }),
    (error) => error.code === QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY,
  );
  for (const effects of [observation.receipt.effects, guidance.receipt.effects, mcpGuidance.effects]) {
    assert.deepEqual(effects, {
      filesystem_reads: 0,
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_calls: 0,
    });
  }
});

test('Q1-G6: the public-synthetic deepening runner is replay-stable and leaves its caller directory untouched', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'quality-readiness-deepening-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath, '--deepening'], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 10_000,
    });
    const second = spawnSync(process.execPath, [runnerPath, '--deepening'], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stderr, '');
    assert.equal(second.stdout, first.stdout);
    const result = JSON.parse(first.stdout);
    assert.equal(result.schema_version, 'soulforge.quality_readiness.public_synthetic_deepening_run.v0');
    assert.equal(result.rag.verdict_authority, false);
    assert.equal(result.effects.filesystem_writes, 0);
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
