// Accepted SE-core crosswalk -> common-SE projection compiler.
//
// This module is intentionally pure. It accepts byte-pinned public corpus metadata, a
// separately reviewed private crosswalk, and that review receipt; it never reads a PDF,
// filesystem, RAG index, Wiki, Notebook, model, clock, or network. The emitted graph is a
// rebuildable candidate projection and every derived node is capped at `llm_proposal`.

import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { ContractError } from '../kernel/errors.mjs';

export const CODES = Object.freeze({
  INPUT_INVALID: 'SE_CORE_CROSSWALK_INPUT_INVALID',
  INPUT_TOO_LARGE: 'SE_CORE_CROSSWALK_INPUT_TOO_LARGE',
  JSON_INVALID: 'SE_CORE_CROSSWALK_JSON_INVALID',
  SCHEMA_CLOSED: 'SE_CORE_CROSSWALK_SCHEMA_CLOSED',
  FORBIDDEN_PAYLOAD: 'SE_CORE_CROSSWALK_FORBIDDEN_PAYLOAD',
  PIN_INVALID: 'SE_CORE_CROSSWALK_PIN_INVALID',
  CORPUS_INVALID: 'SE_CORE_CROSSWALK_CORPUS_INVALID',
  CROSSWALK_INVALID: 'SE_CORE_CROSSWALK_DOCUMENT_INVALID',
  REVIEW_INVALID: 'SE_CORE_CROSSWALK_REVIEW_INVALID',
  SOURCE_PIN_INVALID: 'SE_CORE_CROSSWALK_SOURCE_PIN_INVALID',
  PAGE_MARKER_INVALID: 'SE_CORE_CROSSWALK_PAGE_MARKER_INVALID',
  AUTHORITY_ESCALATION: 'SE_CORE_CROSSWALK_AUTHORITY_ESCALATION',
});

export const COMPILER_POLICY_REVISION = 'soulforge.se_core_crosswalk_projection_compiler.v0';
export const PROJECT_BINDING_REF = 'synthetic-se-core-eval-v1';
export const PROJECTION_INSTANT = '2026-08-12T00:00:00.000Z';

const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_BYTES = Object.freeze({ corpus: 32_000, crosswalk: 128_000, review: 32_000 });
const MAX_TREE = Object.freeze({ depth: 20, values: 10_000, array: 200, keys: 64, string: 4_000 });
const DERIVED_AUTHORITY = 'llm_proposal';
const SOURCE_RULE_AUTHORITY = 'owner_approved_official_public_source';
const SOURCE_RULE_CLAIM = 'source_supported';
const SOURCE_RULE_REVIEW = 'needs_independent_review';
const ENGINE_POLICY_AUTHORITY = 'observed_engine_boundary_contract';
const CROSSWALK_NON_AUTHORITY = 'This crosswalk is an LLM-authored evaluator candidate. It does not alter source truth, accept a systems-engineering rule, prove Engine/Notebook parity, approve an answer, create work, or authorize promotion into canon.';

const INPUT_FIELDS = Object.freeze([
  'corpusBytes', 'crosswalkBytes', 'reviewReceiptBytes',
  'expectedCorpusSha256', 'expectedCrosswalkSha256', 'expectedReviewReceiptSha256',
]);
const CORPUS_FIELDS = Object.freeze([
  'data_classification', 'contains_actual_project_data', 'contains_private_data', 'source_commitments',
]);
const CORPUS_SOURCE_FIELDS = Object.freeze(['source_id', 'revision', 'sha256']);
const CROSSWALK_FIELDS = Object.freeze([
  'schema_version', 'artifact_state', 'review_state', 'claim_ceiling', 'source_set_id', 'purpose',
  'provider_visibility', 'boundaries', 'receipt_refs', 'source_coverage', 'source_backed_cases',
  'engine_boundary_cases', 'non_authority_statement',
]);
const BOUNDARY_FIELDS = Object.freeze([
  'contains_actual_project_data', 'contains_private_project_data', 'contains_provider_answers',
  'contains_evaluator_acceptance', 'creates_or_approves_work', 'source_principles_are_not_engine_policy',
  'engine_boundary_policies_are_not_claimed_as_source_doctrine',
]);
const RECEIPT_REF_FIELDS = Object.freeze([
  'source_manifest', 'extraction_receipt', 'question_set', 'evaluator_gold',
]);
const COVERAGE_FIELDS = Object.freeze([
  'source_id', 'title', 'revision', 'original_pdf_sha256', 'derived_text_sha256',
  'page_count', 'reviewed_rule_count', 'zero_rule_review_reason',
]);
const SOURCE_CASE_FIELDS = Object.freeze([
  'question_id', 'synthetic_case_kind', 'oracle_type', 'source_rules', 'candidate_application',
]);
const SOURCE_RULE_FIELDS = Object.freeze([
  'rule_id', 'source_id', 'revision', 'original_pdf_sha256', 'derived_text_sha256',
  'page_numbers', 'paraphrase', 'authority', 'claim_ceiling', 'review_state',
]);
const ENGINE_CASE_FIELDS = Object.freeze([
  'question_id', 'synthetic_case_kind', 'oracle_type', 'policy_id', 'policy_basis',
  'contract_refs', 'candidate_application', 'authority', 'claim_ceiling', 'review_state',
]);
const CONTRACT_REF_FIELDS = Object.freeze(['repo_relative_path', 'sha256', 'sections']);
const REVIEW_FIELDS = Object.freeze([
  'schema_version', 'review_scope', 'reviewer_role', 'author_is_reviewer', 'crosswalk_file',
  'crosswalk_sha256', 'verdict', 'verified', 'scope_notes', 'not_granted', 'claim_ceiling',
]);
const REVIEW_VERIFIED_FIELDS = Object.freeze([
  'pdf_hashes', 'derived_text_hashes', 'cited_page_markers', 'engine_boundary_contracts_for_q6_q7',
]);

const SOURCE_CONTRACT = Object.freeze([
  Object.freeze({
    crosswalk_id: 'nasa_se_handbook_rev2', corpus_id: 'NASA_SE_HDBK_R2',
    title: 'NASA Systems Engineering Handbook', crosswalk_revision: 'NASA/SP-2016-6105 Rev 2',
    corpus_revision: 'NASA/SP-2016-6105 Rev 2',
    pdf_sha256: '3153ae2e53e29452d5997efafe280a5f05cd21b43a047e988a17e1dd5207a38e',
    derived_sha256: '2b060aa0f48e7b358ade36b635edb122de3c67392833b1fa2d3186fde4502e7c',
    page_count: 356, reviewed_rule_count: 3,
  }),
  Object.freeze({
    crosswalk_id: 'nasa_hdbk_1009a', corpus_id: 'NASA_HDBK_1009A',
    title: 'NASA Systems Modeling Handbook for Systems Engineering',
    crosswalk_revision: 'Revision A, approved 2025-03-12',
    corpus_revision: 'Revision A approved 2025-03-12',
    pdf_sha256: '0433f3e9d7de8999182e2f64584ff3cbbcec507b2152aadd4bc48206f16f2cf9',
    derived_sha256: 'ae34e223cd406f319201994b7da39b2d4693d42b1ce621b5afa2fa901767f266',
    page_count: 88, reviewed_rule_count: 2,
  }),
  Object.freeze({
    crosswalk_id: 'dod_se_guidebook_2022', corpus_id: 'DOD_SE_GUIDEBOOK_2022',
    title: 'Systems Engineering Guidebook', crosswalk_revision: 'February 2022',
    corpus_revision: 'February 2022',
    pdf_sha256: '1a4a839253c3580d1e3cec2bc3f0d066182e56cee1cbb9f0d3293d9fb6bffe62',
    derived_sha256: '255e11072c1a0660584cced2a672abe8d3fd2156f0158ec8000756008db604ef',
    page_count: 240, reviewed_rule_count: 3,
  }),
  Object.freeze({
    crosswalk_id: 'dod_engineering_defense_systems_c2', corpus_id: 'DOD_EDS_GUIDEBOOK_C2',
    title: 'Engineering of Defense Systems Guidebook',
    crosswalk_revision: 'Change 2, October 2024', corpus_revision: 'Change 2 October 2024',
    pdf_sha256: 'e83901401a6dbf230a4bfaa5491762d9cf698618571f4e0957cdcdc8379908e5',
    derived_sha256: 'ca8bcfed25b8e6a4af079187d8147a0184a10a3570a9dd87854f78941f52e6cc',
    page_count: 186, reviewed_rule_count: 3,
  }),
]);
const SOURCE_BY_CROSSWALK_ID = new Map(SOURCE_CONTRACT.map((source) => [source.crosswalk_id, source]));

const SOURCE_CASE_CONTRACT = Object.freeze({
  'se-q-01': Object.freeze({ kind: 'complete', oracle: 'correct', application: Object.freeze([
    'basis', 'candidate_outcome', 'evidence_limit', 'action_limit',
  ]) }),
  'se-q-02': Object.freeze({ kind: 'absent', oracle: 'missing', application: Object.freeze([
    'basis', 'candidate_outcome', 'next_evidence_handling', 'evidence_limit', 'action_limit',
  ]) }),
  'se-q-03': Object.freeze({ kind: 'unknown', oracle: 'unknown', application: Object.freeze([
    'basis', 'candidate_outcome', 'next_evidence_request', 'evidence_limit', 'action_limit',
  ]) }),
  'se-q-04': Object.freeze({ kind: 'conflicting', oracle: 'contradictory', application: Object.freeze([
    'basis', 'candidate_outcome', 'preservation_requirement', 'evidence_limit', 'action_limit',
  ]) }),
  'se-q-05': Object.freeze({ kind: 'stale', oracle: 'stale', application: Object.freeze([
    'basis', 'candidate_outcome', 'next_evidence_request', 'evidence_limit', 'action_limit',
  ]) }),
});
const ENGINE_CASE_CONTRACT = Object.freeze({
  'se-q-06': Object.freeze({
    kind: 'unauthorized', oracle: 'unauthorized', policy_id: 'ENGINE-BOUNDARY-UNAUTHORIZED-01',
  }),
  'se-q-07': Object.freeze({
    kind: 'wrong_project', oracle: 'wrong-project', policy_id: 'ENGINE-BOUNDARY-WRONG-PROJECT-01',
  }),
});

const RULE_MARKERS = Object.freeze({
  'SE-COMPLETE-01': Object.freeze({ question: 'se-q-01', source: 'nasa_se_handbook_rev2', pages: Object.freeze([83, 118, 127]) }),
  'SE-COMPLETE-02': Object.freeze({ question: 'se-q-01', source: 'nasa_hdbk_1009a', pages: Object.freeze([35, 36]) }),
  'SE-ABSENT-01': Object.freeze({ question: 'se-q-02', source: 'nasa_hdbk_1009a', pages: Object.freeze([35, 36]) }),
  'SE-ABSENT-02': Object.freeze({ question: 'se-q-02', source: 'dod_se_guidebook_2022', pages: Object.freeze([57, 73]) }),
  'SE-UNKNOWN-01': Object.freeze({ question: 'se-q-03', source: 'nasa_se_handbook_rev2', pages: Object.freeze([169, 171]) }),
  'SE-UNKNOWN-02': Object.freeze({ question: 'se-q-03', source: 'dod_engineering_defense_systems_c2', pages: Object.freeze([32]) }),
  'SE-CONFLICT-01': Object.freeze({ question: 'se-q-04', source: 'dod_se_guidebook_2022', pages: Object.freeze([130, 131, 133, 142]) }),
  'SE-CONFLICT-02': Object.freeze({ question: 'se-q-04', source: 'dod_engineering_defense_systems_c2', pages: Object.freeze([56, 75]) }),
  'SE-STALE-01': Object.freeze({ question: 'se-q-05', source: 'dod_engineering_defense_systems_c2', pages: Object.freeze([69, 70]) }),
  'SE-STALE-02': Object.freeze({ question: 'se-q-05', source: 'dod_se_guidebook_2022', pages: Object.freeze([150]) }),
  'SE-STALE-03': Object.freeze({ question: 'se-q-05', source: 'nasa_se_handbook_rev2', pages: Object.freeze([134]) }),
});

const CONTRACT_MARKERS = Object.freeze({
  'guild_hall/engineering_engine/contracts/phase_2_synthetic_oracles_v0.md': Object.freeze({
    sha256: 'b6658f9883375d3b6ba21c5f6be3caa7f3864c193b374addbe13c612a5bb71d6',
    questions: Object.freeze({
      'se-q-06': Object.freeze(['2', '3 O6_unauthorized']),
      'se-q-07': Object.freeze(['3 O7_wrong_project']),
    }),
  }),
  'guild_hall/engineering_engine/contracts/lane_1c_graph_and_capsule_v0.md': Object.freeze({
    sha256: 'a114640a2b756bfecc39a901944e3ba00c8c2819e9cfb7aaecaa22d30da6d3e4',
    questions: Object.freeze({
      'se-q-06': Object.freeze(['4.4', '4.6']),
      'se-q-07': Object.freeze(['4.6']),
    }),
  }),
  'guild_hall/engineering_engine/contracts/lane_1d_mcp_concurrency_v0.md': Object.freeze({
    sha256: 'f8d7a0f1babd433e1bb912501175360aed3fa63077eee4ea0f08f4b14dc23d5f',
    questions: Object.freeze({ 'se-q-07': Object.freeze(['6', '8']) }),
  }),
});

const REVIEW_SCOPE_NOTES = Object.freeze([
  'q1_through_q5_source_paraphrases_are_materially_supported_by_the_cited_pages',
  'q6_and_q7_are_engine_boundary_policy_cases_not_public_source_doctrine',
  'q3_unknown_and_q4_r7_precedence_depend_on_the_sealed_synthetic_case_facts',
  'acceptance_is_for_scoring_and_projection_candidate_use_only',
]);
const REVIEW_NOT_GRANTED = Object.freeze([
  'public_canon_promotion', 'actual_project_use', 'runtime_activation',
  'owner_or_p5_acceptance', 'notebook_or_engine_output_as_gold',
]);

const FORBIDDEN_KEYS = new Set([
  'absolute_path', 'local_path', 'filesystem_path', 'account', 'account_id', 'email',
  'secret', 'credential', 'password', 'cookie', 'token', 'raw_text', 'source_text',
  'payload', 'prompt', 'completion', 'private_path',
]);
const FORBIDDEN_STRINGS = Object.freeze([
  /^[a-z]:[\\/]/iu,
  /^\\\\/u,
  /^\/(?:users|home|private|var|tmp)\//iu,
  /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/iu,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
  /\bP\d{2,4}[-_]\d{2,6}\b/u,
]);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sortedStrings = (values) => [...values].sort(compareCodePoints);
const sameStringSet = (actual, expected) => Array.isArray(actual)
  && actual.every((entry) => typeof entry === 'string')
  && expected.every((entry) => typeof entry === 'string')
  && actual.length === expected.length
  && JSON.stringify(sortedStrings(actual)) === JSON.stringify(sortedStrings(expected));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digestCanonical = (domain, value, arrayRules = {}) => createHash('sha256')
  .update(`${domain}\n${canonicalise(value, arrayRules)}`).digest('hex');

function assertExactKeys(value, fields, code = CODES.SCHEMA_CLOSED) {
  if (!isObject(value)) throw new ContractError(code, 'a contract object is required');
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...fields].sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ContractError(code, 'contract objects use one closed, exact field set');
  }
}

function assertNonemptyString(value, code) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ContractError(code, 'a required bounded string is absent');
  }
}

function asBytes(value, label, limit) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1) {
    throw new ContractError(CODES.INPUT_INVALID, `${label} must be non-empty bytes`);
  }
  if (value.byteLength > limit) {
    throw new ContractError(CODES.INPUT_TOO_LARGE, `${label} exceeds its fixed byte ceiling`);
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ContractError(CODES.JSON_INVALID, `${label} is not valid UTF-8 JSON`);
  }
}

function inspectTree(root) {
  let values = 0;
  const walk = (value, depth) => {
    values += 1;
    if (values > MAX_TREE.values || depth > MAX_TREE.depth) {
      throw new ContractError(CODES.INPUT_TOO_LARGE, 'an input JSON tree exceeds its fixed structural ceiling');
    }
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new ContractError(CODES.JSON_INVALID, 'JSON numbers must be safe integers');
      return;
    }
    if (typeof value === 'string') {
      if (value.length > MAX_TREE.string || value.normalize('NFC') !== value
          || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new ContractError(CODES.JSON_INVALID, 'strings must be bounded NFC text without control characters');
      }
      if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(value))) {
        throw new ContractError(CODES.FORBIDDEN_PAYLOAD,
          'local paths, account identifiers, project identifiers, and credentials are forbidden');
      }
      return;
    }
    if (!Array.isArray(value) && !isObject(value)) {
      throw new ContractError(CODES.JSON_INVALID, 'only plain JSON values are accepted');
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_TREE.array) throw new ContractError(CODES.INPUT_TOO_LARGE, 'an input array is too large');
      value.forEach((entry) => walk(entry, depth + 1));
      return;
    }
    const keys = Object.keys(value);
    if (keys.length > MAX_TREE.keys) throw new ContractError(CODES.INPUT_TOO_LARGE, 'an input object has too many fields');
    for (const key of keys) {
      if (key.length > 100 || key.normalize('NFC') !== key || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new ContractError(CODES.FORBIDDEN_PAYLOAD, 'a forbidden payload field is present');
      }
      walk(value[key], depth + 1);
    }
  };
  walk(root, 0);
}

function validateExpectedPins(expected) {
  for (const pin of expected) {
    if (typeof pin !== 'string' || !SHA256.test(pin)) {
      throw new ContractError(CODES.PIN_INVALID, 'expected byte pins must be lowercase SHA-256 values');
    }
  }
}

function validateCorpus(corpus) {
  assertExactKeys(corpus, CORPUS_FIELDS, CODES.CORPUS_INVALID);
  if (corpus.data_classification !== 'public_se_sources_only'
      || corpus.contains_actual_project_data !== false || corpus.contains_private_data !== false
      || !Array.isArray(corpus.source_commitments)
      || corpus.source_commitments.length !== SOURCE_CONTRACT.length) {
    throw new ContractError(CODES.CORPUS_INVALID,
      'the corpus must be exactly the four-source public SE evaluation set');
  }
  const byId = new Map();
  for (const source of corpus.source_commitments) {
    assertExactKeys(source, CORPUS_SOURCE_FIELDS, CODES.CORPUS_INVALID);
    if (byId.has(source.source_id)) throw new ContractError(CODES.CORPUS_INVALID, 'corpus source ids must be unique');
    byId.set(source.source_id, source);
  }
  for (const expected of SOURCE_CONTRACT) {
    const source = byId.get(expected.corpus_id);
    if (!source || source.revision !== expected.corpus_revision || source.sha256 !== expected.pdf_sha256) {
      throw new ContractError(CODES.SOURCE_PIN_INVALID,
        'a corpus source id, revision, or exact PDF hash does not match the accepted source contract');
    }
  }
  return [...byId.values()].sort((a, b) => compareCodePoints(a.source_id, b.source_id));
}

function validateApplication(application, fields) {
  assertExactKeys(application, fields, CODES.CROSSWALK_INVALID);
  for (const field of fields) assertNonemptyString(application[field], CODES.CROSSWALK_INVALID);
}

function validateSourceRule(rule, questionId, seenRules) {
  assertExactKeys(rule, SOURCE_RULE_FIELDS, CODES.CROSSWALK_INVALID);
  const marker = RULE_MARKERS[rule.rule_id];
  if (!marker || marker.question !== questionId || marker.source !== rule.source_id) {
    throw new ContractError(CODES.PAGE_MARKER_INVALID,
      'a source rule id, question binding, or source marker differs from the independently reviewed marker set');
  }
  if (seenRules.has(rule.rule_id)) throw new ContractError(CODES.CROSSWALK_INVALID, 'source rule ids must be unique');
  seenRules.add(rule.rule_id);
  const source = SOURCE_BY_CROSSWALK_ID.get(rule.source_id);
  if (!source || rule.revision !== source.crosswalk_revision
      || rule.original_pdf_sha256 !== source.pdf_sha256
      || rule.derived_text_sha256 !== source.derived_sha256) {
    throw new ContractError(CODES.SOURCE_PIN_INVALID,
      'a source rule does not carry the exact reviewed source revision and byte commitments');
  }
  if (!Array.isArray(rule.page_numbers)
      || rule.page_numbers.some((page) => !Number.isSafeInteger(page) || page < 1 || page > source.page_count)
      || JSON.stringify([...rule.page_numbers].sort((a, b) => a - b)) !== JSON.stringify([...marker.pages])) {
    throw new ContractError(CODES.PAGE_MARKER_INVALID,
      'a rule page marker differs from the independently reviewed page set');
  }
  if (rule.authority !== SOURCE_RULE_AUTHORITY || rule.claim_ceiling !== SOURCE_RULE_CLAIM
      || rule.review_state !== SOURCE_RULE_REVIEW) {
    throw new ContractError(CODES.AUTHORITY_ESCALATION,
      'a source-backed candidate may not change its reviewed authority or claim state');
  }
  assertNonemptyString(rule.paraphrase, CODES.CROSSWALK_INVALID);
  return {
    rule_id: rule.rule_id,
    source_id: source.corpus_id,
    source_revision: source.corpus_revision,
    original_pdf_sha256: source.pdf_sha256,
    derived_text_sha256: source.derived_sha256,
    page_numbers: [...marker.pages],
    paraphrase: rule.paraphrase,
    source_authority_family: 'general_se_guidance',
    candidate_claim_ceiling: SOURCE_RULE_CLAIM,
  };
}

function validateCoverage(coverage) {
  if (!Array.isArray(coverage) || coverage.length !== SOURCE_CONTRACT.length) {
    throw new ContractError(CODES.CROSSWALK_INVALID, 'source coverage must name exactly four sources');
  }
  const byId = new Map();
  for (const entry of coverage) {
    assertExactKeys(entry, COVERAGE_FIELDS, CODES.CROSSWALK_INVALID);
    if (byId.has(entry.source_id)) throw new ContractError(CODES.CROSSWALK_INVALID, 'coverage source ids must be unique');
    byId.set(entry.source_id, entry);
  }
  for (const source of SOURCE_CONTRACT) {
    const entry = byId.get(source.crosswalk_id);
    if (!entry || entry.title !== source.title || entry.revision !== source.crosswalk_revision
        || entry.original_pdf_sha256 !== source.pdf_sha256 || entry.derived_text_sha256 !== source.derived_sha256
        || entry.page_count !== source.page_count || entry.reviewed_rule_count !== source.reviewed_rule_count
        || entry.zero_rule_review_reason !== null) {
      throw new ContractError(CODES.SOURCE_PIN_INVALID,
        'source coverage differs from the reviewed source, revision, extraction, page, or rule-count commitments');
    }
  }
}

function validateSourceCases(cases) {
  if (!Array.isArray(cases) || cases.length !== Object.keys(SOURCE_CASE_CONTRACT).length) {
    throw new ContractError(CODES.CROSSWALK_INVALID, 'the five source-backed evaluation cases are required');
  }
  const byQuestion = new Map();
  const seenRules = new Set();
  for (const entry of cases) {
    assertExactKeys(entry, SOURCE_CASE_FIELDS, CODES.CROSSWALK_INVALID);
    const contract = SOURCE_CASE_CONTRACT[entry.question_id];
    if (!contract || byQuestion.has(entry.question_id)
        || entry.synthetic_case_kind !== contract.kind || entry.oracle_type !== contract.oracle
        || !Array.isArray(entry.source_rules) || entry.source_rules.length < 1) {
      throw new ContractError(CODES.CROSSWALK_INVALID,
        'a source-backed question id, case kind, oracle type, or rule set is invalid');
    }
    validateApplication(entry.candidate_application, contract.application);
    const rules = entry.source_rules.map((rule) => validateSourceRule(rule, entry.question_id, seenRules))
      .sort((a, b) => compareCodePoints(a.rule_id, b.rule_id));
    byQuestion.set(entry.question_id, {
      question_id: entry.question_id,
      synthetic_case_kind: entry.synthetic_case_kind,
      oracle_type: entry.oracle_type,
      grounding_kind: 'source_backed_candidate',
      source_rules: rules,
      candidate_application: structuredClone(entry.candidate_application),
    });
  }
  if (seenRules.size !== Object.keys(RULE_MARKERS).length) {
    throw new ContractError(CODES.PAGE_MARKER_INVALID, 'the reviewed source-rule marker set is incomplete');
  }
  return [...byQuestion.values()].sort((a, b) => compareCodePoints(a.question_id, b.question_id));
}

function validateContractRef(ref, questionId) {
  assertExactKeys(ref, CONTRACT_REF_FIELDS, CODES.CROSSWALK_INVALID);
  const contract = CONTRACT_MARKERS[ref.repo_relative_path];
  const expectedSections = contract?.questions?.[questionId];
  if (!contract || ref.sha256 !== contract.sha256 || !sameStringSet(ref.sections, expectedSections ?? [])) {
    throw new ContractError(CODES.SOURCE_PIN_INVALID,
      'an Engine boundary contract ref, hash, or reviewed section marker differs from the accepted set');
  }
  return {
    repo_relative_path: ref.repo_relative_path,
    sha256: ref.sha256,
    sections: sortedStrings(ref.sections),
  };
}

function validateEngineCases(cases) {
  if (!Array.isArray(cases) || cases.length !== Object.keys(ENGINE_CASE_CONTRACT).length) {
    throw new ContractError(CODES.CROSSWALK_INVALID, 'the two Engine-boundary evaluation cases are required');
  }
  const byQuestion = new Map();
  for (const entry of cases) {
    assertExactKeys(entry, ENGINE_CASE_FIELDS, CODES.CROSSWALK_INVALID);
    const contract = ENGINE_CASE_CONTRACT[entry.question_id];
    if (!contract || byQuestion.has(entry.question_id)
        || entry.synthetic_case_kind !== contract.kind || entry.oracle_type !== contract.oracle
        || entry.policy_id !== contract.policy_id
        || entry.policy_basis !== 'engineering_engine_contract_only_not_public_source_doctrine'
        || entry.authority !== ENGINE_POLICY_AUTHORITY || entry.claim_ceiling !== 'observed'
        || entry.review_state !== SOURCE_RULE_REVIEW || !Array.isArray(entry.contract_refs)
        || entry.contract_refs.length < 1 || typeof entry.candidate_application !== 'string'
        || entry.candidate_application.length === 0) {
      throw new ContractError(CODES.AUTHORITY_ESCALATION,
        'an Engine-boundary case differs from its candidate-only policy and authority contract');
    }
    const refs = entry.contract_refs.map((ref) => validateContractRef(ref, entry.question_id))
      .sort((a, b) => compareCodePoints(a.repo_relative_path, b.repo_relative_path));
    const expectedPaths = Object.entries(CONTRACT_MARKERS)
      .filter(([, marker]) => Object.hasOwn(marker.questions, entry.question_id))
      .map(([path]) => path);
    if (new Set(refs.map((ref) => ref.repo_relative_path)).size !== refs.length
        || !sameStringSet(refs.map((ref) => ref.repo_relative_path), expectedPaths)) {
      throw new ContractError(CODES.CROSSWALK_INVALID,
        'Engine contract refs must be unique and complete within each reviewed case');
    }
    byQuestion.set(entry.question_id, {
      question_id: entry.question_id,
      synthetic_case_kind: entry.synthetic_case_kind,
      oracle_type: entry.oracle_type,
      grounding_kind: 'engine_boundary_candidate',
      policy_id: entry.policy_id,
      contract_refs: refs,
      candidate_application: entry.candidate_application,
    });
  }
  return [...byQuestion.values()].sort((a, b) => compareCodePoints(a.question_id, b.question_id));
}

function validateCrosswalk(crosswalk) {
  assertExactKeys(crosswalk, CROSSWALK_FIELDS, CODES.CROSSWALK_INVALID);
  if (crosswalk.schema_version !== 'soulforge.se_core_eval.candidate_source_rule_crosswalk.v0'
      || crosswalk.artifact_state !== 'llm_authored_candidate'
      || crosswalk.review_state !== SOURCE_RULE_REVIEW || crosswalk.claim_ceiling !== 'observed'
      || crosswalk.source_set_id !== 'se_core_eval_v1'
      || crosswalk.provider_visibility !== 'evaluator_only_do_not_upload_or_pass_to_either_provider'
      || crosswalk.non_authority_statement !== CROSSWALK_NON_AUTHORITY) {
    throw new ContractError(CODES.AUTHORITY_ESCALATION,
      'the crosswalk must remain the exact candidate-only, evaluator-only artifact class');
  }
  assertNonemptyString(crosswalk.purpose, CODES.CROSSWALK_INVALID);
  assertExactKeys(crosswalk.boundaries, BOUNDARY_FIELDS, CODES.CROSSWALK_INVALID);
  const requiredBoundaries = {
    contains_actual_project_data: false,
    contains_private_project_data: false,
    contains_provider_answers: false,
    contains_evaluator_acceptance: false,
    creates_or_approves_work: false,
    source_principles_are_not_engine_policy: true,
    engine_boundary_policies_are_not_claimed_as_source_doctrine: true,
  };
  if (Object.keys(requiredBoundaries).some((key) => crosswalk.boundaries[key] !== requiredBoundaries[key])) {
    throw new ContractError(CODES.AUTHORITY_ESCALATION,
      'the crosswalk boundary declarations may not be weakened');
  }
  assertExactKeys(crosswalk.receipt_refs, RECEIPT_REF_FIELDS, CODES.CROSSWALK_INVALID);
  for (const ref of Object.values(crosswalk.receipt_refs)) {
    assertNonemptyString(ref, CODES.CROSSWALK_INVALID);
    if (/^[a-z]:[\\/]|^\\\\|^\//iu.test(ref)) {
      throw new ContractError(CODES.FORBIDDEN_PAYLOAD, 'receipt refs must remain relative identifiers');
    }
  }
  validateCoverage(crosswalk.source_coverage);
  return [
    ...validateSourceCases(crosswalk.source_backed_cases),
    ...validateEngineCases(crosswalk.engine_boundary_cases),
  ].sort((a, b) => compareCodePoints(a.question_id, b.question_id));
}

function validateReview(review, crosswalkSha256) {
  assertExactKeys(review, REVIEW_FIELDS, CODES.REVIEW_INVALID);
  assertExactKeys(review.verified, REVIEW_VERIFIED_FIELDS, CODES.REVIEW_INVALID);
  if (review.schema_version !== 'soulforge.se_core_crosswalk_review_receipt.v1'
      || review.review_scope !== 'source_support_for_public_synthetic_se_evaluation_only'
      || review.reviewer_role !== 'fresh_independent_agent' || review.author_is_reviewer !== false
      || review.crosswalk_file !== 'candidate_source_rule_crosswalk.json'
      || review.crosswalk_sha256 !== crosswalkSha256 || review.verdict !== 'accept'
      || review.verified.pdf_hashes !== 4 || review.verified.derived_text_hashes !== 4
      || review.verified.cited_page_markers !== 11
      || review.verified.engine_boundary_contracts_for_q6_q7 !== 3
      || !sameStringSet(review.scope_notes, REVIEW_SCOPE_NOTES)
      || !sameStringSet(review.not_granted, REVIEW_NOT_GRANTED)
      || review.claim_ceiling !== 'observed_source_supported_candidate') {
    throw new ContractError(CODES.REVIEW_INVALID,
      'the independent receipt does not accept this exact crosswalk for candidate projection use');
  }
}

function normaliseCaseMaterial(entry) {
  // `synthetic_case_kind`, `oracle_type`, and the evaluator's candidate application are
  // validated above as crosswalk-review metadata, but deliberately do not enter the Engine
  // projection. The runtime receives grounded rule commitments and a question id, never a
  // target label or an answer-shaped digest that the case classifier could follow.
  if (entry.grounding_kind === 'source_backed_candidate') {
    const groundingCommitments = entry.source_rules.map((rule) => ({
      grounding_id: rule.rule_id,
      sha256: digestCanonical('soulforge.se_core_crosswalk.source_rule.v0', rule, {
        page_numbers: 'insertion_ordered',
      }),
    }));
    return {
      question_id: entry.question_id,
      grounding_kind: entry.grounding_kind,
      grounding_commitments: groundingCommitments,
    };
  }
  const groundingCommitments = entry.contract_refs.map((ref) => ({
    grounding_id: ref.repo_relative_path,
    sha256: digestCanonical('soulforge.se_core_crosswalk.engine_contract_ref.v0', ref, {
      sections: 'insertion_ordered',
    }),
  }));
  return {
    question_id: entry.question_id,
    grounding_kind: entry.grounding_kind,
    grounding_commitments: groundingCommitments,
  };
}

function ref(entityId, revisionId, sha256) {
  return {
    entity_id: entityId,
    revision_id: revisionId,
    content_id: `sha256:${sha256}`,
    content_hash_alg: 'sha256',
  };
}

function compareTuples(a, b) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= a.length) return -1;
    if (index >= b.length) return 1;
    const compared = compareCodePoints(String(a[index]), String(b[index]));
    if (compared !== 0) return compared;
  }
  return 0;
}

function projectionSha256(projection) {
  const nodes = [...projection.nodes].sort((a, b) => compareTuples(
    [a.ref.revision_id, a.ref.entity_id, a.ref.content_id, a.ref.content_hash_alg, a.node_type],
    [b.ref.revision_id, b.ref.entity_id, b.ref.content_id, b.ref.content_hash_alg, b.node_type],
  ));
  const edges = [...projection.edges].sort((a, b) => compareTuples(
    [a.edge_id, a.from_ref.revision_id, a.to_ref.revision_id, a.evidence_ref.revision_id],
    [b.edge_id, b.from_ref.revision_id, b.to_ref.revision_id, b.evidence_ref.revision_id],
  ));
  const { projection_sha256: _excluded, ...fields } = projection;
  return digestCanonical('soulforge.common_se_corpus_projection.v0', { ...fields, nodes, edges }, {
    nodes: 'insertion_ordered', edges: 'insertion_ordered',
  });
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function buildProjection({ corpusSha256, crosswalkSha256, reviewSha256, corpusCommitments, cases }) {
  const compiledCases = cases.map((entry) => {
    const material = normaliseCaseMaterial(entry);
    const ruleSha256 = digestCanonical('soulforge.se_core_crosswalk.question_rule.v0', material, {
      grounding_commitments: 'insertion_ordered',
    });
    const elementId = `se_core_eval_expected_${entry.question_id.replaceAll('-', '_')}`;
    const expectedSha256 = digestCanonical('soulforge.se_core_crosswalk.expected_state.v0', {
      element_id: elementId,
      question_rule_sha256: ruleSha256,
      derived_authority_family: DERIVED_AUTHORITY,
      applicability: true,
      valid_at: PROJECTION_INSTANT,
      known_at: PROJECTION_INSTANT,
    });
    const ruleRef = ref(
      `se-core-eval-rule-${entry.question_id}`,
      `se-core-eval-rule-${entry.question_id}-${ruleSha256.slice(0, 16)}`,
      ruleSha256,
    );
    const expectedRef = ref(
      `se-core-eval-expected-${entry.question_id}`,
      `se-core-eval-expected-${entry.question_id}-${expectedSha256.slice(0, 16)}`,
      expectedSha256,
    );
    return { entry, ruleSha256, expectedSha256, ruleRef, expectedRef, elementId };
  });

  const corpusSemanticSha256 = digestCanonical('soulforge.se_core_crosswalk.corpus_semantics.v0', {
    source_commitments: corpusCommitments,
  }, { source_commitments: 'insertion_ordered' });
  const semanticCommitments = compiledCases.map(({ entry, ruleSha256 }) => ({
    question_id: entry.question_id,
    rule_sha256: ruleSha256,
  }));
  const inputSemanticSha256 = digestCanonical('soulforge.se_core_crosswalk.projection_semantics.v0', {
    compiler_policy_revision: COMPILER_POLICY_REVISION,
    corpus_semantic_sha256: corpusSemanticSha256,
    question_rule_commitments: semanticCommitments,
  }, { question_rule_commitments: 'insertion_ordered' });
  // The exact accepted bytes remain replay-relevant even when their normalised semantics are
  // unchanged. This aggregate does not reveal a private path or payload, but it prevents a
  // semantically reordered crosswalk from masquerading as the exact reviewed artifact.
  const inputBundleSha256 = digestCanonical('soulforge.se_core_crosswalk.projection_inputs.v0', {
    compiler_policy_revision: COMPILER_POLICY_REVISION,
    corpus_sha256: corpusSha256,
    crosswalk_sha256: crosswalkSha256,
    independent_review_receipt_sha256: reviewSha256,
    semantic_sha256: inputSemanticSha256,
  });
  const projectionRevision = `se-core-crosswalk-projection-${inputBundleSha256.slice(0, 16)}`;

  const nodes = [];
  const edges = [];
  for (const compiled of compiledCases) {
    nodes.push({
      node_type: 'rule',
      ref: structuredClone(compiled.ruleRef),
      content_sha256: compiled.ruleSha256,
      project_binding_ref: PROJECT_BINDING_REF,
      authority_family: DERIVED_AUTHORITY,
      applicability: true,
    });
    nodes.push({
      node_type: 'expected_state_element',
      ref: structuredClone(compiled.expectedRef),
      content_sha256: compiled.expectedSha256,
      project_binding_ref: PROJECT_BINDING_REF,
      authority_family: DERIVED_AUTHORITY,
      applicability: true,
      state_element: {
        element_id: compiled.elementId,
        axis: 'expected',
        requirement_ref: structuredClone(compiled.expectedRef),
        authority_family: DERIVED_AUTHORITY,
        applicability: true,
        valid_at: PROJECTION_INSTANT,
        known_at: PROJECTION_INSTANT,
      },
    });
    edges.push({
      edge_id: `se-core-eval-requires-${compiled.entry.question_id}`,
      edge_type: 'requires',
      from_type: 'rule',
      from_ref: structuredClone(compiled.ruleRef),
      to_type: 'expected_state_element',
      to_ref: structuredClone(compiled.expectedRef),
      evidence_ref: structuredClone(compiled.ruleRef),
      authority_family: DERIVED_AUTHORITY,
      applicability: true,
      valid_at: PROJECTION_INSTANT,
      known_at: PROJECTION_INSTANT,
      review_state: 'independent_review_accept_candidate_only',
      evidence_claim_ceiling: 'source_referenced',
      generating_policy_revision: COMPILER_POLICY_REVISION,
      project_binding_ref: PROJECT_BINDING_REF,
    });
  }
  nodes.sort((a, b) => compareTuples(
    [a.ref.revision_id, a.ref.entity_id, a.ref.content_id, a.ref.content_hash_alg, a.node_type],
    [b.ref.revision_id, b.ref.entity_id, b.ref.content_id, b.ref.content_hash_alg, b.node_type],
  ));
  edges.sort((a, b) => compareCodePoints(a.edge_id, b.edge_id));

  const manifestRevision = `se-core-eval-v1-corpus-${corpusSha256.slice(0, 16)}`;
  const projection = {
    schema_version: 'soulforge.common_se_corpus_projection.v0',
    immutable_derived_projection: true,
    is_truth_owner: false,
    projection_revision: projectionRevision,
    projection_ref: ref('se-core-crosswalk-projection', projectionRevision, inputBundleSha256),
    projection_sha256: '0'.repeat(64),
    project_binding_kind: 'synthetic',
    project_binding_ref: PROJECT_BINDING_REF,
    authority_ceiling: DERIVED_AUTHORITY,
    manifest_ref: ref('se-core-eval-v1-corpus', manifestRevision, corpusSha256),
    manifest_sha256: corpusSha256,
    nodes,
    edges,
  };
  projection.projection_sha256 = projectionSha256(projection);
  return deepFreeze(projection);
}

/**
 * Compile one independently reviewed SE-core crosswalk into the existing common-SE projection
 * interface. Expected hashes are caller-supplied acceptance pins; they grant no authority and
 * are all checked against the exact input bytes.
 */
export function compileSeCoreCrosswalkProjection(input) {
  assertExactKeys(input, INPUT_FIELDS, CODES.INPUT_INVALID);
  const {
    corpusBytes: corpusInput, crosswalkBytes: crosswalkInput, reviewReceiptBytes: reviewInput,
    expectedCorpusSha256, expectedCrosswalkSha256, expectedReviewReceiptSha256,
  } = input;
  validateExpectedPins([expectedCorpusSha256, expectedCrosswalkSha256, expectedReviewReceiptSha256]);
  const corpusBytes = asBytes(corpusInput, 'corpusBytes', MAX_BYTES.corpus);
  const crosswalkBytes = asBytes(crosswalkInput, 'crosswalkBytes', MAX_BYTES.crosswalk);
  const reviewBytes = asBytes(reviewInput, 'reviewReceiptBytes', MAX_BYTES.review);
  const corpus = parseJson(corpusBytes, 'corpusBytes');
  const crosswalk = parseJson(crosswalkBytes, 'crosswalkBytes');
  const review = parseJson(reviewBytes, 'reviewReceiptBytes');
  for (const document of [corpus, crosswalk, review]) inspectTree(document);

  const corpusCommitments = validateCorpus(corpus);
  const cases = validateCrosswalk(crosswalk);
  const corpusSha256 = digest(corpusBytes);
  const crosswalkSha256 = digest(crosswalkBytes);
  const reviewSha256 = digest(reviewBytes);
  if (corpusSha256 !== expectedCorpusSha256 || crosswalkSha256 !== expectedCrosswalkSha256
      || reviewSha256 !== expectedReviewReceiptSha256) {
    throw new ContractError(CODES.PIN_INVALID,
      'one or more exact corpus, crosswalk, or independent-review byte pins are stale');
  }
  validateReview(review, crosswalkSha256);
  return buildProjection({
    corpusSha256, crosswalkSha256, reviewSha256, corpusCommitments, cases,
  });
}

/** Canonical compact JSON bytes for the emitted projection. */
export function canonicalSeCoreCrosswalkProjectionJson(projection) {
  return `${canonicalise(projection, { nodes: 'insertion_ordered', edges: 'insertion_ordered' })}\n`;
}
