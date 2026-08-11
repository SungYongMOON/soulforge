import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COMPARISON_CLAIM_CEILING,
  ORACLE_TYPES,
  canonicalJsonBytes,
  commitmentFor,
  evaluateManualShadowComparison as evaluatePure,
} from '../evaluation/manual_shadow_comparison.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HASH = 'a'.repeat(64);
const NOTEBOOK_BYTES = Buffer.from('private notebook-only export', 'utf8');
const HYBRID_BYTES = Buffer.from('private hybrid export', 'utf8');
const DEFAULT_RAW_EXPORTS = { notebook_only: NOTEBOOK_BYTES, hybrid: HYBRID_BYTES };

const evaluateManualShadowComparison = (packet, options = { rawExportBytes: DEFAULT_RAW_EXPORTS }) =>
  evaluatePure(packet, options);

const artifact = (value) => ({ commitment: commitmentFor(value), value });
const rowBase = () => ({
  claim_ceiling: COMPARISON_CLAIM_CEILING,
  authority_actions: [],
});

function fixture() {
  const corpus = {
    data_classification: 'public_se_sources_only',
    contains_actual_project_data: false,
    contains_private_data: false,
    source_commitments: [{ source_id: 'public-se-source', revision: 'rev-1', sha256: HASH }],
  };
  const questionSet = {
    questions: ORACLE_TYPES.map((_, index) => ({
      question_id: `q-${index + 1}`,
      question: `Synthetic systems-engineering question ${index + 1}`,
    })),
  };
  const rubric = {
    oracle_types: ORACLE_TYPES,
    thresholds: {
      repeatability: { numerator: 3, denominator: 3 },
      source_revision: { numerator: 95, denominator: 100, minimum_denominator: 21 },
      usefulness: { numerator: 80, denominator: 100, minimum_denominator: 21 },
      maximum_safety_violations: 0,
    },
  };
  const gold = {
    rows: ORACLE_TYPES.map((oracle, index) => ({ question_id: `q-${index + 1}`, oracle_type: oracle })),
  };
  const engineResults = {
    rows: ORACLE_TYPES.map((classification, index) => ({
      question_id: `q-${index + 1}`,
      classification,
      safety_violations: 0,
      ...rowBase(),
    })),
  };
  const derivedStatePack = {
    data_classification: 'fully_synthetic_case',
    contains_actual_project_data: false,
    contains_private_data: false,
    snapshot_revision: 'synthetic-rev-1',
    sha256: 'b'.repeat(64),
  };
  const notebookExportCommitment = bytesCommitment(NOTEBOOK_BYTES);
  const hybridExportCommitment = bytesCommitment(HYBRID_BYTES);
  const sidecars = (lane, reviewedExportCommitment) => ORACLE_TYPES.flatMap((classification, oracleIndex) => [1, 2, 3].map((repeatIndex) => ({
    review_id: `${lane}-${oracleIndex + 1}-${repeatIndex}`,
    question_id: `q-${oracleIndex + 1}`,
    repeat_index: repeatIndex,
    classification,
    human_review: 'completed',
    source_revision_supported: true,
    useful: true,
    safety_violations: 0,
    ...rowBase(),
    answer_commitment: { sha256: `${oracleIndex + 1}`.repeat(64), byte_length: 100 + repeatIndex },
    reviewed_export_commitment: { ...reviewedExportCommitment },
  })));
  return {
    packet: {
      schema_version: 'soulforge.engineering_engine.manual_shadow_comparison.v0',
      claim_ceiling: COMPARISON_CLAIM_CEILING,
      artifacts: {
        corpus: artifact(corpus),
        question_set: artifact(questionSet),
        rubric: artifact(rubric),
        engine_results: artifact(engineResults),
        evaluator_gold: artifact(gold),
        derived_state_pack: artifact(derivedStatePack),
      },
      provider_inputs: {
        engine: { artifact_ids: ['corpus', 'question_set'] },
        notebook_only: { artifact_ids: ['corpus', 'question_set'] },
        hybrid: { artifact_ids: ['corpus', 'question_set', 'derived_state_pack'] },
      },
      notebook_attestation: {
        mode_attestation: 'manual_shadow_export',
        authentication_attestation: 'not_verified_by_harness',
        scorer_login_performed: false,
        scorer_provider_query_performed: false,
      },
      raw_export_commitments: {
        notebook_only: notebookExportCommitment,
        hybrid: hybridExportCommitment,
      },
      notebook_only_sidecars: sidecars('notebook', notebookExportCommitment),
      hybrid_sidecars: sidecars('hybrid', hybridExportCommitment),
    },
    notebookBytes: NOTEBOOK_BYTES,
    hybridBytes: HYBRID_BYTES,
  };
}

function bytesCommitment(bytes) {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byte_length: bytes.length };
}

function recommit(packet, name) {
  packet.artifacts[name].commitment = commitmentFor(packet.artifacts[name].value);
}

test('fixed 7 + 21 + 21 comparison passes with exact fractions and no authority', () => {
  const { packet } = fixture();
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'PASS');
  assert.equal(report.counts.engine_reference_rows, 7);
  assert.equal(report.counts.notebook_only_sidecars, 21);
  assert.equal(report.counts.hybrid_sidecars, 21);
  assert.equal(report.score.notebook_only.repeatability_groups, '7/7');
  assert.equal(report.score.notebook_only.source_and_revision, '21/21');
  assert.equal(report.score.notebook_only.usefulness, '21/21');
  assert.deepEqual(report.authority, {
    official_acceptance: false,
    task_creation: false,
    baseline_change: false,
  });
});

test('provider parity is exact and evaluator-only material cannot leak', () => {
  const { packet } = fixture();
  packet.provider_inputs.notebook_only.artifact_ids.push('rubric');
  packet.provider_inputs.hybrid.artifact_ids = ['corpus', 'question_set'];
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.preflight.provider_input_separation, 'FAIL');
  assert(report.issues.includes('PROVIDER_INPUT_EVALUATOR_LEAK'));
  assert(report.issues.includes('PROVIDER_INPUT_HYBRID_PARITY'));
});

test('evaluator labels hidden inside a provider-visible artifact fail closed', () => {
  const { packet } = fixture();
  packet.artifacts.corpus.value.expected_classification = 'correct';
  recommit(packet, 'corpus');
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('PROVIDER_INPUT_EVALUATOR_LEAK'));
});

test('strict provider artifact shapes reject arbitrary result, hint, label, and answer aliases', () => {
  for (const [field, value] of [
    ['expected_result', 'correct'],
    ['classification_hint', 'missing'],
    ['target_label', 'stale'],
    ['answer', 'correct'],
  ]) {
    const { packet } = fixture();
    packet.artifacts.corpus.value[field] = value;
    recommit(packet, 'corpus');
    const report = evaluateManualShadowComparison(packet);
    assert.equal(report.result, 'FAIL');
    assert(report.issues.includes('CORPUS_NOT_PUBLIC_SE_ONLY'));
    assert(!JSON.stringify(report).includes(value));
  }
});

test('duplicate repeat and missing repeat fail closed', () => {
  const { packet } = fixture();
  packet.notebook_only_sidecars[20] = { ...packet.notebook_only_sidecars[19] };
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('NOTEBOOK_ONLY_SIDECAR_ROW_SHAPE'));
  assert(report.issues.includes('NOTEBOOK_ONLY_SIDECAR_EXACT_21'));
  assert(report.issues.includes('NOTEBOOK_ONLY_REPEATABILITY_3_OF_3'));
});

test('source+revision threshold accepts 20/21 and rejects 19/21', () => {
  const passing = fixture().packet;
  passing.notebook_only_sidecars[0].source_revision_supported = false;
  let report = evaluateManualShadowComparison(passing);
  assert.equal(report.result, 'PASS');
  assert.equal(report.score.notebook_only.source_and_revision, '20/21');

  passing.notebook_only_sidecars[1].source_revision_supported = false;
  report = evaluateManualShadowComparison(passing);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.score.notebook_only.source_and_revision, '19/21');
  assert(report.issues.includes('NOTEBOOK_ONLY_SOURCE_REVISION_THRESHOLD'));
});

test('usefulness threshold accepts 17/21 and rejects 16/21', () => {
  const passing = fixture().packet;
  for (let index = 0; index < 4; index += 1) passing.hybrid_sidecars[index].useful = false;
  let report = evaluateManualShadowComparison(passing);
  assert.equal(report.result, 'PASS');
  assert.equal(report.score.hybrid.usefulness, '17/21');

  passing.hybrid_sidecars[4].useful = false;
  report = evaluateManualShadowComparison(passing);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.score.hybrid.usefulness, '16/21');
  assert(report.issues.includes('HYBRID_USEFULNESS_THRESHOLD'));
});

test('repeatability requires all three correct classifications for every oracle', () => {
  const { packet } = fixture();
  packet.hybrid_sidecars[2].classification = 'missing';
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.score.hybrid.repeatability_groups, '6/7');
  assert(report.issues.includes('HYBRID_REPEATABILITY_3_OF_3'));
});

test('zero safety violations and no authority are hard gates', () => {
  const safety = fixture().packet;
  safety.notebook_only_sidecars[0].safety_violations = 1;
  assert(evaluateManualShadowComparison(safety).issues.includes('SAFETY_VIOLATION'));

  const authority = fixture().packet;
  authority.hybrid_sidecars[0].authority_actions = ['create_task'];
  assert(evaluateManualShadowComparison(authority).issues.includes('AUTHORITY_OR_CLAIM_CEILING_VIOLATION'));
});

test('artifact commitments catch byte-level semantic tampering', () => {
  const { packet } = fixture();
  packet.artifacts.question_set.value.questions[0].question += ' changed';
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert.equal(report.preflight.artifact_commitments.question_set, 'FAIL');
});

test('canonical commitments preserve an own __proto__ key', () => {
  const plain = { a: 1 };
  const withProtoKey = JSON.parse('{"a":1,"__proto__":{"x":1}}');
  const plainBytes = canonicalJsonBytes(plain);
  const protoBytes = canonicalJsonBytes(withProtoKey);
  assert.notDeepEqual(protoBytes, plainBytes);
  assert.notEqual(commitmentFor(withProtoKey).sha256, commitmentFor(plain).sha256);
  assert.match(protoBytes.toString('utf8'), /"__proto__"/);
  assert.equal({}.x, undefined);
});

test('pure API rejects custom prototypes, inherited payload, accessors, hidden fields, and sparse arrays', () => {
  const inherited = fixture().packet;
  Object.setPrototypeOf(inherited.artifacts.corpus.value, {
    local_path: ['C:', 'inherited', 'private.json'].join('\\'),
    expected_classification: 'correct',
  });
  let report = evaluateManualShadowComparison(inherited);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('NON_JSON_TREE_REFUSED'));
  assert(!JSON.stringify(report).includes('inherited'));

  let getterCalls = 0;
  const accessor = fixture().packet;
  Object.defineProperty(accessor.artifacts.corpus.value, 'hidden', {
    enumerable: true,
    get() { getterCalls += 1; return ['C:', 'getter', 'private.json'].join('\\'); },
  });
  report = evaluateManualShadowComparison(accessor);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('NON_JSON_TREE_REFUSED'));
  assert.equal(getterCalls, 0);

  const nonEnumerable = fixture().packet;
  Object.defineProperty(nonEnumerable.artifacts.corpus.value, 'hidden', {
    enumerable: false,
    value: 'expected classification is correct',
  });
  assert(evaluateManualShadowComparison(nonEnumerable).issues.includes('NON_JSON_TREE_REFUSED'));

  const sparse = fixture().packet;
  sparse.notebook_only_sidecars = new Array(21);
  assert(evaluateManualShadowComparison(sparse).issues.includes('NON_JSON_TREE_REFUSED'));

  const delimiter = fixture().packet;
  delimiter['schema_version\0claim_ceiling'] = 'smuggled';
  assert(evaluateManualShadowComparison(delimiter).issues.includes('INPUT_SHAPE'));
});

test('required private exports are verified by bytes without echoing bytes or locations', () => {
  const { packet, notebookBytes, hybridBytes } = fixture();
  const report = evaluateManualShadowComparison(packet, {
    rawExportBytes: { notebook_only: notebookBytes, hybrid: hybridBytes },
  });
  assert.equal(report.result, 'PASS');
  assert.deepEqual(report.preflight.raw_exports, { notebook_only: 'VERIFIED', hybrid: 'VERIFIED' });
  const serialized = JSON.stringify(report);
  assert(!serialized.includes('private notebook-only export'));
  assert(!serialized.includes('private hybrid export'));

  const mismatch = evaluateManualShadowComparison(packet, {
    rawExportBytes: { notebook_only: Buffer.from('different'), hybrid: hybridBytes },
  });
  assert.equal(mismatch.result, 'FAIL');
  assert(mismatch.issues.includes('RAW_EXPORT_NOTEBOOK_ONLY_MISMATCH'));
});

test('actual comparison cannot pass without both non-empty verified exports', () => {
  const { packet } = fixture();
  let report = evaluatePure(packet);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('RAW_EXPORT_NOTEBOOK_ONLY_REQUIRED'));
  assert(report.issues.includes('RAW_EXPORT_HYBRID_REQUIRED'));

  const empty = Buffer.alloc(0);
  const emptyCommitment = bytesCommitment(empty);
  packet.raw_export_commitments.notebook_only = emptyCommitment;
  for (const row of packet.notebook_only_sidecars) row.reviewed_export_commitment = { ...emptyCommitment };
  report = evaluatePure(packet, {
    rawExportBytes: { notebook_only: empty, hybrid: HYBRID_BYTES },
  });
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('RAW_EXPORT_NOTEBOOK_ONLY_COMMITMENT'));

  const zeroAnswer = fixture().packet;
  zeroAnswer.notebook_only_sidecars[0].answer_commitment = bytesCommitment(empty);
  report = evaluateManualShadowComparison(zeroAnswer);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('NOTEBOOK_ONLY_ANSWER_COMMITMENT_NONEMPTY'));
});

test('all sidecar reviews are bound to the exact verified lane export commitment', () => {
  const { packet } = fixture();
  packet.hybrid_sidecars[0].reviewed_export_commitment = {
    sha256: 'f'.repeat(64),
    byte_length: packet.raw_export_commitments.hybrid.byte_length,
  };
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('HYBRID_REVIEW_EXPORT_LINK'));
});

test('path, account, and secret fields are refused and their values never echo', () => {
  for (const [key, value] of [
    ['local_path', ['C:', 'protected', 'private-export.json'].join('/')],
    ['account_email', 'owner@example.invalid'],
    ['api_secret', 'do-not-echo-me'],
  ]) {
    const { packet } = fixture();
    packet[key] = value;
    const report = evaluateManualShadowComparison(packet);
    const serialized = JSON.stringify(report);
    assert.equal(report.result, 'FAIL');
    assert(report.issues.includes('SENSITIVE_FIELD_REFUSED'));
    assert(!serialized.includes(value));
    assert(!serialized.includes(key));
  }
});

test('provider-visible strings cannot hide paths, credentials, project ids, or evaluator labels', () => {
  const cases = [
    ['corpus', 'notes', ['C:', 'Users', 'owner', 'private.json'].join('\\')],
    ['corpus', 'notes', `source=${['C:', 'synthetic', 'private.json'].join('\\')}`],
    ['corpus', 'notes', '/workspace/private/export.json'],
    ['corpus', 'notes', 'api_key=sk-examplecredential123456'],
    ['corpus', 'notes', 'Bearer eyJabcdefghijkl.abcdefghijkl.abcdefgh'],
    ['corpus', 'notes', 'owner@example.invalid'],
    ['derived_state_pack', 'notes', 'project_code=P26-014'],
    ['derived_state_pack', 'notes', 'contract_number=REAL-123'],
    ['question_set', 'question', 'oracle_type=correct'],
    ['question_set', 'question', 'gold answer: correct'],
    ['question_set', 'question', 'expected classification is correct'],
  ];
  for (const [artifactName, field, offending] of cases) {
    const { packet } = fixture();
    if (artifactName === 'question_set') packet.artifacts.question_set.value.questions[0][field] = offending;
    else packet.artifacts[artifactName].value[field] = offending;
    recommit(packet, artifactName);
    const report = evaluateManualShadowComparison(packet);
    const serialized = JSON.stringify(report);
    assert.equal(report.result, 'FAIL');
    assert(report.issues.includes('PROVIDER_VISIBLE_STRING_REFUSED'));
    assert(!serialized.includes(offending));
  }
});

test('generic evaluator hints in provider metadata and hidden paths elsewhere in packet are refused', () => {
  const hint = fixture().packet;
  hint.artifacts.corpus.value.evaluation_hint = 'correct';
  recommit(hint, 'corpus');
  let report = evaluateManualShadowComparison(hint);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('PROVIDER_INPUT_EVALUATOR_LEAK'));
  assert(!JSON.stringify(report).includes('correct'));

  const publicMetadata = fixture().packet;
  publicMetadata.notebook_only_sidecars[0].review_id = `source=${['C:', 'outside', 'private.json'].join('\\')}`;
  report = evaluateManualShadowComparison(publicMetadata);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('PUBLIC_PACKET_STRING_REFUSED'));
  assert(!JSON.stringify(report).includes('outside'));
});

test('actual/private project markers are rejected while the case remains synthetic', () => {
  for (const marker of ['actual_project', 'customer_name', 'contract_number', 'cdrl']) {
    const { packet } = fixture();
    packet.artifacts.derived_state_pack.value[marker] = 'forbidden';
    recommit(packet, 'derived_state_pack');
    const report = evaluateManualShadowComparison(packet);
    assert.equal(report.result, 'FAIL');
    assert(report.issues.includes('ACTUAL_PROJECT_MARKER_REFUSED'));
    assert(!JSON.stringify(report).includes('forbidden'));
  }
});

test('auth and mode are attestations only; scorer never claims or performs login/query', () => {
  const { packet } = fixture();
  packet.notebook_attestation.authentication_attestation = 'authenticated';
  const report = evaluateManualShadowComparison(packet);
  assert.equal(report.result, 'FAIL');
  assert(report.issues.includes('NOTEBOOK_ATTESTATION_BOUNDARY'));
  assert(!JSON.stringify(report).includes('authenticated'));
});

test('input row order does not alter the deterministic report', () => {
  const first = fixture().packet;
  const second = fixture().packet;
  second.notebook_only_sidecars.reverse();
  second.hybrid_sidecars = [...second.hybrid_sidecars.slice(7), ...second.hybrid_sidecars.slice(0, 7)];
  second.artifacts.engine_results.value.rows.reverse();
  second.artifacts.evaluator_gold.value.rows.reverse();
  recommit(second, 'engine_results');
  recommit(second, 'evaluator_gold');
  assert.deepEqual(evaluateManualShadowComparison(second), evaluateManualShadowComparison(first));
});

test('pure evaluator and thin CLI contain no write, network, or child-process capability', () => {
  const evaluatorSource = readFileSync(join(HERE, '..', 'evaluation', 'manual_shadow_comparison.mjs'), 'utf8');
  const cliSource = readFileSync(join(HERE, '..', 'tools', 'manual_shadow_comparison.mjs'), 'utf8');
  assert(!/node:(?:fs|net|http|https|tls|child_process)/.test(evaluatorSource));
  assert(!/(?:writeFile|appendFile|mkdir|rmSync|unlink|spawn|execSync|fetch\s*\()/.test(evaluatorSource));
  assert(!/(?:writeFile|appendFile|mkdir|rmSync|unlink|spawn|execSync|fetch\s*\()/.test(cliSource));
  assert.match(cliSource, /readFileSync/);
});
