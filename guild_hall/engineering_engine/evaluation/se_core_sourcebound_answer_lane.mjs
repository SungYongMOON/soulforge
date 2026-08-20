// Evaluation-only Soulforge Engineering Answer Lane.
//
// This lane answers an arbitrary natural-language question over one exact, frozen four-source
// public systems-engineering corpus. It is NOT the deterministic Engine baseline and NOT general
// open question answering. It is an ai_assisted, non-authoritative, source-bound evaluation lane.
//
// The split of responsibility is the whole point of the module:
//
//   deterministic side (here)  corpus pinning, derived-text parsing, corpus-wide retrieval,
//                             statement ownership, exact-excerpt rendering, citation binding,
//                             claim ceiling, and the payload-free receipt.
//   learned side (injected)    one bounded statement-and-relation selection, and optionally one
//                             advisory query expansion that is declared shadow and never authoritative.
//
// The injected model receives only the exact question text, host statement ids and entire exact
// normalized chunks, plus a closed selection policy. Citation metadata fields (evidence id, title,
// revision, page, chunk id, byte commitments) never cross that seam: they stay here and are bound
// back to the host statement ids the model selected.
// Exact question/evidence prose is not semantically scrubbed and may naturally mention such terms.
// The model receives no filesystem, network,
// browser, or tool access, cannot create a source or a citation, and cannot set the claim ceiling.
// This module itself performs no filesystem, network, write, or ERP operation, and is
// provider-independent: nothing here knows which runtime serves the model.
//
// Initial v4 build provenance is Claude Code with Codex review corrections; neither is a runtime
// dependency or an authority.

import { createHash } from 'node:crypto';
import { types } from 'node:util';

import { canonicalise, compareCodePoints, daysInMonth } from '../kernel/canonical.mjs';
import { ContractError } from '../kernel/errors.mjs';
import {
  SOURCE_TEXT_CORPUS_SEARCH_CONTRACT,
  searchSourceTextCorpus,
} from '../../rag/source_text_index.mjs';

export const ANSWER_LANE_ID = 'soulforge.engineering_answer_lane.se_core_sourcebound.v0';
export const ANSWER_LANE_KIND = 'evaluation_only_sourcebound_answer_lane';
// v2 removes model-authored answer prose. The model can emit only a closed statement-selection
// object; the host renders fixed Korean labels plus exact retrieved chunks.
export const ANSWER_LANE_POLICY_REVISION = 'soulforge.se_core_sourcebound_answer_lane.v2';
export const ANSWER_SCHEMA_VERSION = 'soulforge.se_core_sourcebound_answer.v1';
export const STATEMENT_SELECTION_SCHEMA_VERSION =
  'soulforge.se_core_sourcebound_statement_selection.v0';
export const HOST_RENDERING_REVISION = 'soulforge.se_core_sourcebound_host_korean_rendering.v0';
// v2 records host statement commitments and exact-evidence projection instead of free-text checks.
export const RECEIPT_SCHEMA_VERSION = 'soulforge.se_core_sourcebound_answer_receipt.v2';
export const SOURCE_SET_CONTRACT_SCHEMA_VERSION = 'soulforge.se_core_sourcebound_source_set.v0';
export const SOURCE_COHORT_COMMITMENT_SCHEMA_VERSION = 'soulforge.se_core_sourcebound_source_cohort.v0';
export const RESULT_CLAIM_CEILING = 'observed';
export const CANDIDATE_DISPOSITION = 'external_advisory_candidate';
export const EXPECTED_SOURCE_COUNT = 4;
export const STRUCTURAL_LIMIT = 'evaluation_only_sourcebound_lane_not_engine_baseline_not_general_qa';

export const CODES = Object.freeze({
  INPUT_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_INPUT_INVALID',
  FORBIDDEN_PARTICIPANT_INPUT: 'SE_CORE_SOURCEBOUND_ANSWER_FORBIDDEN_PARTICIPANT_INPUT',
  SCOPE_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_SCOPE_INVALID',
  QUESTION_PIN_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_QUESTION_PIN_INVALID',
  QUESTION_TEXT_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_QUESTION_TEXT_INVALID',
  SOURCE_SET_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_SOURCE_SET_INVALID',
  SOURCE_SET_PIN_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_SOURCE_SET_PIN_INVALID',
  BENCHMARK_PIN_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_BENCHMARK_PIN_INVALID',
  DERIVED_TEXT_PIN_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_DERIVED_TEXT_PIN_INVALID',
  DERIVED_TEXT_MALFORMED: 'SE_CORE_SOURCEBOUND_ANSWER_DERIVED_TEXT_MALFORMED',
  MODEL_ADAPTER_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_MODEL_ADAPTER_INVALID',
  QUERY_EXPANSION_REFUSED: 'SE_CORE_SOURCEBOUND_ANSWER_QUERY_EXPANSION_REFUSED',
  RETRIEVAL_REFUSED: 'SE_CORE_SOURCEBOUND_ANSWER_RETRIEVAL_REFUSED',
  RETRIEVAL_EMPTY: 'SE_CORE_SOURCEBOUND_ANSWER_RETRIEVAL_EMPTY',
  MODEL_CALL_FAILED: 'SE_CORE_SOURCEBOUND_ANSWER_MODEL_CALL_FAILED',
  MODEL_OUTPUT_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_MODEL_OUTPUT_INVALID',
  CITATION_UNBOUND: 'SE_CORE_SOURCEBOUND_ANSWER_CITATION_UNBOUND',
  OUTPUT_SAFETY_FAILED: 'SE_CORE_SOURCEBOUND_ANSWER_OUTPUT_SAFETY_FAILED',
  RECEIPT_NOT_PAYLOAD_FREE: 'SE_CORE_SOURCEBOUND_ANSWER_RECEIPT_NOT_PAYLOAD_FREE',
});

/**
 * Why one run failed output safety, as one closed family token.
 *
 * `CODES.OUTPUT_SAFETY_FAILED` says a rendered block or a rendered answer was refused. On its own
 * it does not say *which* check refused it, and every refusal message here is fixed text that
 * carries none of what it refused — so a hold was opaque: markup, a URL, a leaked path, a
 * fabricated citation identifier, and a self-attributed authority claim all reported one code.
 *
 * These tokens name the family of check that refused and nothing else. Each is a fixed literal in
 * this module: no token is derived from, influenced by, or varied with the refused text, the
 * question, the evidence, a location, a path, an account, or any provider value. The set is closed,
 * so a reader can key on it.
 *
 * `UNSPECIFIED_INTERNAL` is an exhaustiveness backstop, not a family. Every output-safety refusal
 * this module can take names one of the eight families above it, and the suite proves that against
 * every probe it has. The backstop exists so an output-safety hold can never report *no* reason,
 * which is the one answer this field must never give.
 */
export const OUTPUT_SAFETY_REASONS = Object.freeze({
  MARKUP: 'markup_detected',
  URL: 'url_detected',
  SENSITIVE_PATTERN: 'sensitive_pattern_detected',
  CITATION_IDENTIFIER: 'citation_identifier_in_prose',
  AUTHORITY_CLAIM: 'authority_claim_pattern',
  MODEL_PAYLOAD_FIELD: 'model_payload_field_forbidden',
  ANSWER_CANONICALISATION: 'answer_canonicalisation_failed',
  RENDERED_ANSWER_SCAN: 'rendered_answer_scan_failed',
  UNSPECIFIED_INTERNAL: 'unspecified_internal',
});
const OUTPUT_SAFETY_REASON_TOKENS = new Set(Object.values(OUTPUT_SAFETY_REASONS));

const BLOCKER_STAGE = Object.freeze({
  [CODES.INPUT_INVALID]: 'input',
  [CODES.FORBIDDEN_PARTICIPANT_INPUT]: 'input',
  [CODES.SCOPE_INVALID]: 'input',
  [CODES.QUESTION_PIN_INVALID]: 'question',
  [CODES.QUESTION_TEXT_INVALID]: 'question',
  [CODES.SOURCE_SET_INVALID]: 'corpus',
  [CODES.SOURCE_SET_PIN_INVALID]: 'corpus',
  [CODES.BENCHMARK_PIN_INVALID]: 'benchmark_pin',
  [CODES.DERIVED_TEXT_PIN_INVALID]: 'corpus',
  [CODES.DERIVED_TEXT_MALFORMED]: 'corpus',
  [CODES.MODEL_ADAPTER_INVALID]: 'model_adapter',
  [CODES.QUERY_EXPANSION_REFUSED]: 'query_expansion',
  [CODES.RETRIEVAL_REFUSED]: 'retrieval',
  [CODES.RETRIEVAL_EMPTY]: 'retrieval',
  [CODES.MODEL_CALL_FAILED]: 'model_call',
  [CODES.MODEL_OUTPUT_INVALID]: 'model_output',
  [CODES.CITATION_UNBOUND]: 'citation_binding',
  [CODES.OUTPUT_SAFETY_FAILED]: 'output_safety',
  [CODES.RECEIPT_NOT_PAYLOAD_FREE]: 'receipt',
});

const INPUT_FIELDS = Object.freeze([
  'questionBytes', 'expectedQuestionSha256', 'expectedQuestionBytes',
  'corpus', 'scope', 'retrieval', 'queryExpansion',
]);
const CORPUS_FIELDS = Object.freeze(['sourceSetContract', 'expectedSourceSetSha256', 'sources']);
const CONTRACT_FIELDS = Object.freeze(['schema_version', 'source_set_id', 'sources']);
const CONTRACT_SOURCE_FIELDS = Object.freeze([
  'source_id', 'title', 'revision', 'source_pdf_sha256', 'derived_text_sha256', 'page_count',
]);
const SOURCE_FIELDS = Object.freeze([
  'source_id', 'title', 'revision', 'source_pdf_sha256', 'derived_text_sha256',
  'derived_text_bytes', 'page_count', 'approval', 'permissions',
]);
const APPROVAL_FIELDS = Object.freeze(['approval_status', 'reuse_rights_reviewed']);
const BENCHMARK_PIN_FIELDS = Object.freeze([
  'pin_id', 'source_set_id', 'expected_cohort_sha256', 'allowed_source_ids',
]);
// `reuse_rights_reviewed` is what the operator declares at run time, having reviewed the public
// rights metadata for that source. It is never a verbatim field lifted out of a source card, and
// nothing here should be read as reproducing source-card data.
const REUSE_RIGHTS_BASIS = 'runtime_operator_declaration_over_reviewed_public_rights_metadata';
const PERMISSION_FIELDS = Object.freeze([
  'public_source_analysis', 'evaluation_lane_retrieval', 'canon_promotion', 'external_upload',
]);
const SCOPE_FIELDS = Object.freeze([
  'evaluation_only', 'point_in_time', 'actual_project_data_included', 'private_data_included',
  'authority_to_approve', 'authority_to_create_task', 'authority_to_promote_canon',
  'action_execution_allowed',
]);
const SCOPE_FALSE_FIELDS = Object.freeze([
  'actual_project_data_included', 'private_data_included', 'authority_to_approve',
  'authority_to_create_task', 'authority_to_promote_canon', 'action_execution_allowed',
]);
const RETRIEVAL_FIELDS = Object.freeze(['max_evidence', 'max_per_source']);
const QUERY_EXPANSION_FIELDS = Object.freeze(['requested', 'max_terms']);
const MODEL_CONTEXT_FIELDS = Object.freeze(['answerModel']);
const MODEL_DESCRIPTOR_FIELDS = Object.freeze([
  'adapter_id', 'adapter_revision', 'stateless', 'tools_enabled', 'history_enabled',
]);
const MODEL_OUTPUT_FIELDS = Object.freeze(['schema_version', 'result', 'propositions']);
const MODEL_PROPOSITION_FIELDS = Object.freeze(['statement_id', 'relation']);
const MODEL_EXPANSION_FIELDS = Object.freeze(['terms']);
// The exact statuses an operator may declare for a source in this lane. `official_public_source`
// records what the document is; `owner_approved_*` records that the owner cleared it for this
// analysis. Both facts can hold at once, so the combined status is its own accepted value rather
// than something a caller has to flatten into one of the other two.
const APPROVED_SOURCE_STATUS = new Set([
  'owner_approved_public_source',
  'official_public_source',
  'owner_approved_official_public_source',
]);

const BUFFER_PATHS = new Set(['questionBytes', 'corpus.sources[].derived_text_bytes']);

const MAX = Object.freeze({
  depth: 10,
  values: 400,
  array: 8,
  object_keys: 24,
  string: 400,
  key: 64,
  identifier: 64,
  question_bytes: 8192,
  derived_text_bytes: 8 * 1024 * 1024,
  page_count: 5000,
  parsed_pages: 5000,
  preamble_lines: 32,
  chunks_per_source: 20000,
  chunk_chars: 900,
  evidence: 24,
  per_source: 8,
  propositions: 8,
  expansion_terms: 12,
  expansion_term_chars: 60,
});

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const PAGE_HEADING = /^##[ \t]+Page[ \t]+(\d{1,6})[ \t]*$/u;
// The authorized derived-text artifacts open with a bounded metadata preamble before their first
// page heading: one H1 title, then these five bullets. `##` cannot match the H1 pattern, so a
// stream that starts at its first page heading never enters the preamble path at all.
const PREAMBLE_TITLE = /^#[ \t]+(\S.*)$/u;
const PREAMBLE_BULLET = /^-[ \t]+([A-Za-z][A-Za-z0-9_]{0,31})[ \t]*:[ \t]*(\S.*)$/u;
// A metadata bullet may write its value plainly or as one Markdown code span; both are the same
// value, and the unwrapped value still has to bind exactly.
const PREAMBLE_CODE_SPAN = /^`([^`]+)`$/u;
const PREAMBLE_KEYS = Object.freeze([
  'source_id', 'revision', 'source_pdf_sha256', 'page_count', 'extraction',
]);
const PREAMBLE_PINNED_KEYS = Object.freeze([
  'source_id', 'revision', 'source_pdf_sha256', 'page_count',
]);
const HTML_LIKE = /<\s*\/?\s*[A-Za-z!]/u;
// A model that emits a URL has named a source this lane never retrieved. The answer instruction
// and the output schema both already forbid one; this is where that policy is enforced, because
// an unenforced instruction would let a fabricated reference ride into a published answer whose
// whole claim is that every block is bound to a retrieved capsule.
const URL_LIKE = /(?:^|[^A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]*:\/\/|(?:^|[^A-Za-z0-9.-])www\.[A-Za-z0-9-]+\.[A-Za-z]{2,}/u;
// The two derived-text control characters replaced with SPACE in memory. After that replacement
// the set that remains disallowed is exactly `FORBIDDEN_CONTROL` below.
const REPLACED_DERIVED_CONTROL = new RegExp('[\\u0000\\u001f]', 'u');
// Everything in C0/C1 except tab and newline. Derived text keeps tabs and newlines; a question
// may be multi-line; nothing else survives.
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u;

const FORBIDDEN_PARTICIPANT_KEYS = new Set([
  'crosswalk', 'crosswalk_ref', 'crosswalk_bytes', 'rubric', 'rubric_minimum', 'rubric_ref',
  'evaluator_gold', 'gold', 'gold_answer', 'answer_key', 'answer_keys', 'expected_answer',
  'expected_answers', 'prior_answer', 'prior_answers', 'prior_review', 'prior_reviews',
  'review_receipt', 'review_receipt_bytes', 'notebook_output', 'notebooklm', 'notebook_answer',
  'notebooklm_answer', 'page_hint', 'page_hints', 'question_set', 'question_set_bytes', 'oracle',
  'oracle_type', 'synthetic_case_kind', 'candidate_application', 'evaluator_note', 'winner',
  'provider_parity',
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'secret', 'secrets', 'credential', 'credentials', 'password', 'passwd', 'cookie', 'session',
  'session_id', 'token', 'access_token', 'refresh_token', 'api_key', 'apikey', 'absolute_path',
  'private_path', 'source_path', 'runtime_path', 'account', 'account_id', 'user_id', 'username',
  'hostname', 'prompt', 'completion', 'raw_body', 'response_body', 'history',
]);
const FORBIDDEN_STRINGS = Object.freeze([
  // The left context is "not an identifier character" rather than a slash: a private-plane path
  // leaks mid-sentence in rendered prose, not only at the start of a path-shaped string.
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  // A POSIX absolute path leaks mid-sentence just as a Windows one does, so the well-known roots
  // are matched anywhere, not only at the start of a path-shaped string.
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data|Applications|Library|Volumes)\/\S/iu,
  // One address is one route out of the boundary and one person named in a public-safe artifact.
  /(?:^|[^A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+/u,
  /\bfile:\/\//iu,
  /\bP\d{2,4}[-_]\d{2,6}\b/u,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);
// -------------------------------------------------------------- statement-selection contract
//
// The model cannot author answer prose. It can only select up to eight host-owned statements and
// label each selection with one closed relation. The host keeps source metadata, renders fixed
// Korean labels, and projects the exact retrieved chunk. This removes semantic phrase
// classification from the safety boundary: no free-prose authority parser exists in this lane.
export const STATEMENT_RELATIONS = Object.freeze([
  'direct', 'support', 'qualification', 'contrast',
]);
const STATEMENT_RELATION_SET = new Set(STATEMENT_RELATIONS);
const STATEMENT_ID = /^S(?:[1-9]|1[0-9]|2[0-4])$/u;
const NO_STATEMENT_SENTINEL = '__NO_RETRIEVED_STATEMENT__';

const RELATION_RENDERING = Object.freeze({
  direct: Object.freeze({
    heading: '직접 근거',
    prefix: '모델이 직접 관련 근거로 선택한 원문: ',
  }),
  support: Object.freeze({
    heading: '보조 근거',
    prefix: '모델이 보조 근거로 선택한 원문: ',
  }),
  qualification: Object.freeze({
    heading: '조건·제약 근거',
    prefix: '모델이 조건 또는 제약 근거로 선택한 원문: ',
  }),
  contrast: Object.freeze({
    heading: '대조 근거',
    prefix: '모델이 대조 근거로 선택한 원문: ',
  }),
});
const ABSTAIN_RENDERING = Object.freeze({
  relation: 'abstain',
  heading: '답변 보류',
  text: '모델이 직접 관련 근거를 선택하지 않아 답변을 보류합니다.',
  citations: Object.freeze([]),
});

const ANSWER_INSTRUCTION = [
  '당신은 Soulforge 평가 전용 근거 선택기다. 답변 문장을 작성하지 않는다.',
  '아래 host 소유 statements 중 질문에 관련된 항목만 선택한다.',
  'answer이면 1~8개의 서로 다른 statement_id를 고르고, relation은 direct, support, qualification, contrast 중 하나만 쓴다.',
  'answer에는 direct relation이 최소 하나 있어야 한다. 적절한 직접 근거가 없으면 abstain과 빈 propositions를 반환한다.',
  '제공되지 않은 statement_id나 다른 키, 자유 문장, 설명, 출처, 페이지, 권한 판단을 출력하지 않는다.',
  'Return exactly one JSON object matching output_schema. No prose and no extra keys.',
].join('\n');

/**
 * One closed provider schema whose statement-id vocabulary is bound to this retrieval.
 *
 * Invalid public calls receive a sentinel enum that the lane never accepts. The production path
 * always supplies S1..S24 from the retrieved statement list, so its enum is exactly that allowlist.
 */
export function statementSelectionResponseJsonSchema(statementIds) {
  const valid = Array.isArray(statementIds)
    && statementIds.length >= 1
    && statementIds.length <= MAX.evidence
    && statementIds.every((id, index) => typeof id === 'string'
      && STATEMENT_ID.test(id) && statementIds.indexOf(id) === index);
  const ids = valid ? [...statementIds] : [NO_STATEMENT_SENTINEL];
  const proposition = {
    type: 'object',
    additionalProperties: false,
    required: ['statement_id', 'relation'],
    properties: {
      statement_id: { type: 'string', enum: ids },
      relation: { type: 'string', enum: [...STATEMENT_RELATIONS] },
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schema_version', 'result', 'propositions'],
    properties: {
      schema_version: { type: 'string', const: STATEMENT_SELECTION_SCHEMA_VERSION },
      result: { type: 'string', enum: ['answer', 'abstain'] },
      propositions: {
        type: 'array',
        maxItems: MAX.propositions,
        uniqueItems: true,
        items: proposition,
      },
    },
    oneOf: [
      {
        properties: {
          result: { const: 'answer' },
          propositions: {
            minItems: 1,
            maxItems: MAX.propositions,
            uniqueItems: true,
            contains: {
              type: 'object',
              required: ['relation'],
              properties: { relation: { const: 'direct' } },
            },
            minContains: 1,
          },
        },
      },
      {
        properties: {
          result: { const: 'abstain' },
          propositions: { maxItems: 0 },
        },
      },
    ],
  };
}
const EXPANSION_INSTRUCTION = [
  '아래 질문을 영어 공개 자료에서 어휘 검색하기 위한 보조 검색어만 제안한다.',
  '이 출력은 자문(shadow)이며 정본 검색을 대체하지 않는다. 답변, 결론, 출처, 페이지를 쓰지 않는다.',
  'Return only short search terms. No sentence, no answer, no citation, no page number.',
].join('\n');

const EXPANSION_OUTPUT_SCHEMA = Object.freeze({
  root: 'one plain object whose only key is terms',
  terms: 'array of short search-term strings',
  forbidden: 'any other key, any sentence, any citation, any page number, any answer',
});

const ANSWER_BOUNDARY_NOTE = [
  '경계: 이 답변은 고정된 4종 공개 체계공학 자료에 대한 평가 전용 source-bound 결과입니다.',
  '결정론 Engine 기준선도, 일반 개방형 QA도 아니며 근거 선택에는 로컬 학습 모델이 관여했습니다.',
  '실제 프로젝트 적합성, 출처 진리, 승인, 정본 등록, 작업 생성을 의미하지 않습니다.',
].join(' ');

const ANSWER_ORDER_RULES = Object.freeze({
  sections: 'insertion_ordered',
  'sections[].citations': 'insertion_ordered',
  evidence: 'insertion_ordered',
  authority_actions: 'insertion_ordered',
});
const RECEIPT_ORDER_RULES = Object.freeze({
  'source_set.sources': 'insertion_ordered',
  'retrieval.per_source': 'insertion_ordered',
  'prompt_commitment.evidence_ids': 'insertion_ordered',
  'prompt_commitment.evidence_commitments': 'insertion_ordered',
  'prompt_commitment.statement_commitments': 'insertion_ordered',
});
const MODEL_REQUEST_ORDER_RULES = Object.freeze({
  statements: 'insertion_ordered',
  'output_schema.required': 'insertion_ordered',
  'output_schema.properties.result.enum': 'insertion_ordered',
  'output_schema.properties.propositions.items.required': 'insertion_ordered',
  'output_schema.properties.propositions.items.properties.statement_id.enum': 'insertion_ordered',
  'output_schema.properties.propositions.items.properties.relation.enum': 'insertion_ordered',
  'output_schema.oneOf': 'insertion_ordered',
  'output_schema.oneOf[].properties.propositions.contains.required': 'insertion_ordered',
});

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

/** Refuses output safety with one closed family token and, as before, none of what it refused. */
function failOutputSafety(reason, message) {
  fail(CODES.OUTPUT_SAFETY_FAILED, message, { output_safety_reason: reason });
}

/**
 * One closed family token read back from a refusal detail this module authored.
 *
 * The detail is never caller or model material: every value it can carry here was written by a
 * `fail` call in this file, from the frozen table above. The membership test is what makes that
 * structural rather than merely true — a token this module does not publish is not passed through,
 * it is replaced by the caller's fallback, so nothing arbitrary can reach the receipt by this path.
 */
function outputSafetyReasonToken(detail, fallback = OUTPUT_SAFETY_REASONS.UNSPECIFIED_INTERNAL) {
  const token = detail === null || typeof detail !== 'object'
    ? undefined
    : detail.output_safety_reason;
  return typeof token === 'string' && OUTPUT_SAFETY_REASON_TOKENS.has(token) ? token : fallback;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

// ------------------------------------------------------------------ input snapshot

function assertSafeString(value, code, maxLength = MAX.string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
      || value.normalize('NFC') !== value || FORBIDDEN_CONTROL.test(value)) {
    fail(code, 'a metadata string must be bounded NFC text without control characters');
  }
  if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(value))) {
    // This shared string gate is used for caller metadata and for closed model-selection fields.
    // Caller input ends at `FORBIDDEN_PARTICIPANT_INPUT`; a forbidden model-response field is
    // translated by the structured-response validator into one fixed output-safety family token.
    fail(CODES.FORBIDDEN_PARTICIPANT_INPUT,
      'a path, secret, account, or runtime identifier is forbidden in public-safe metadata',
      { output_safety_reason: OUTPUT_SAFETY_REASONS.SENSITIVE_PATTERN });
  }
}

function assertIdentifier(value, code) {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) {
    fail(code, 'an identifier must be one bounded safe token');
  }
}

/**
 * Recursively snapshots the invocation as plain own data.
 *
 * Prototypes, accessors, symbol keys, sparse arrays, cycles, and host objects are refused rather
 * than normalised, because a getter that returns one value during validation and another during
 * use would make every later check meaningless. Buffers are accepted only at the two declared
 * byte positions; anywhere else the prototype check refuses them.
 */
function snapshotPlainOwnData(root, options = {}) {
  // Metadata strings, selection identifiers, and advisory terms have different legitimate bounds,
  // so the caller states which bound applies rather than one cap silently refusing a valid closed
  // value. An advisory term list is bounded the same way: its declared ceiling is larger than the
  // invocation's array cap, and a generic cap below it would refuse a model obeying its budget.
  const maxString = options.maxString ?? MAX.string;
  const maxArray = options.maxArray ?? MAX.array;
  const seen = new WeakSet();
  let values = 0;
  const walk = (value, path, depth) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(CODES.INPUT_INVALID, 'the invocation exceeds the bounded input tree limits');
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail(CODES.INPUT_INVALID, 'numbers must be safe integers');
      return value;
    }
    if (typeof value === 'string') {
      assertSafeString(value, CODES.INPUT_INVALID, maxString);
      return value;
    }
    if (value === null || typeof value !== 'object') {
      fail(CODES.INPUT_INVALID, 'only non-null plain JSON values and declared Buffers are accepted');
    }
    // A Proxy can answer each reflection with a different surface. Refuse it before any trap can
    // run; otherwise an exact-key precheck and the snapshot could validate two different objects.
    if (types.isProxy(value)) {
      fail(CODES.INPUT_INVALID, 'proxy-backed values are not accepted at this boundary');
    }
    if (Buffer.isBuffer(value)) {
      if (!BUFFER_PATHS.has(path)) {
        fail(CODES.INPUT_INVALID, 'byte payloads are accepted only at the declared byte fields');
      }
      return Buffer.from(value);
    }
    if (seen.has(value)) {
      fail(CODES.INPUT_INVALID, 'cyclic or aliased object graphs are not accepted input trees');
    }
    seen.add(value);

    const array = Array.isArray(value);
    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      fail(CODES.INPUT_INVALID, 'input reflection failed without exposing caller-controlled text');
    }
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype)) {
      fail(CODES.INPUT_INVALID, 'custom prototypes and host objects are forbidden');
    }
    const length = array ? descriptors.length?.value : undefined;
    if (array && (!Number.isSafeInteger(length) || length < 0 || length > maxArray)) {
      fail(CODES.INPUT_INVALID, 'an input array exceeds the hard item limit');
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      fail(CODES.INPUT_INVALID, 'symbol properties are not accepted input');
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    if (array) {
      const expected = new Set(Array.from({ length }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        fail(CODES.INPUT_INVALID, 'sparse arrays and named array properties are forbidden');
      }
    } else if (dataKeys.length > MAX.object_keys) {
      fail(CODES.INPUT_INVALID, 'an input object exceeds the hard field limit');
    }
    const snapshot = array ? new Array(length) : {};
    for (const key of dataKeys) {
      if (key.length > MAX.key || key.normalize('NFC') !== key) {
        fail(CODES.INPUT_INVALID, 'object keys must be bounded NFC strings');
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(CODES.INPUT_INVALID, 'accessors and hidden fields are forbidden');
      }
      const lowered = key.toLowerCase();
      if (FORBIDDEN_PARTICIPANT_KEYS.has(lowered)) {
        fail(CODES.FORBIDDEN_PARTICIPANT_INPUT,
          'crosswalk, rubric, gold, prior answer, and Notebook material are forbidden participant inputs',
          { output_safety_reason: OUTPUT_SAFETY_REASONS.MODEL_PAYLOAD_FIELD });
      }
      if (FORBIDDEN_PAYLOAD_KEYS.has(lowered)) {
        fail(CODES.FORBIDDEN_PARTICIPANT_INPUT,
          'secret, account, runtime, and raw-body fields are forbidden at this boundary',
          { output_safety_reason: OUTPUT_SAFETY_REASONS.MODEL_PAYLOAD_FIELD });
      }
      // A canonical own "__proto__" data property is legal input and stays a plain key here;
      // it never reaches an object literal assignment that would retarget a prototype.
      Object.defineProperty(snapshot, key, {
        value: walk(descriptor.value, array ? `${path}[]` : childPath(path, key), depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return snapshot;
  };
  return walk(root, '', 0);
}

function childPath(path, key) {
  return path === '' ? key : `${path}.${key}`;
}

function snapshotInvocation(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
      || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    fail(CODES.INPUT_INVALID, 'the lane invocation must be one plain object');
  }
  if (!exactKeys(input, INPUT_FIELDS)) {
    fail(CODES.INPUT_INVALID, 'the lane invocation uses one closed field set');
  }
  return snapshotPlainOwnData(input);
}

// ------------------------------------------------------------------ scope and question

function validateScope(scope) {
  if (!exactKeys(scope, SCOPE_FIELDS)) {
    fail(CODES.SCOPE_INVALID, 'the declared evaluation scope uses one closed field set');
  }
  if (scope.evaluation_only !== true) {
    fail(CODES.SCOPE_INVALID, 'this lane runs only when the caller declares an evaluation-only scope');
  }
  for (const field of SCOPE_FALSE_FIELDS) {
    if (scope[field] !== false) {
      fail(CODES.SCOPE_INVALID,
        'actual/private project data and every authority or action boolean must be declared false');
    }
  }
  const parts = CALENDAR_DAY.exec(scope.point_in_time ?? '');
  if (!parts) fail(CODES.SCOPE_INVALID, 'point_in_time must be one explicit YYYY-MM-DD calendar day');
  const [year, month, day] = parts.slice(1, 4).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    fail(CODES.SCOPE_INVALID, 'point_in_time must name one real calendar day');
  }
  return { point_in_time: scope.point_in_time };
}

function validateQuestion(snapshot) {
  const bytes = snapshot.questionBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    fail(CODES.QUESTION_PIN_INVALID, 'questionBytes must be one non-empty Buffer');
  }
  if (bytes.length > MAX.question_bytes) {
    fail(CODES.QUESTION_PIN_INVALID, 'the question exceeds the accepted byte ceiling');
  }
  if (typeof snapshot.expectedQuestionSha256 !== 'string'
      || !SHA256.test(snapshot.expectedQuestionSha256)
      || !Number.isSafeInteger(snapshot.expectedQuestionBytes)) {
    fail(CODES.QUESTION_PIN_INVALID, 'the question pin must be one lowercase sha256 and one byte length');
  }
  const digest = sha256Hex(bytes);
  if (digest !== snapshot.expectedQuestionSha256 || bytes.length !== snapshot.expectedQuestionBytes) {
    fail(CODES.QUESTION_PIN_INVALID, 'the supplied question bytes do not match the expected pin');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(CODES.QUESTION_TEXT_INVALID, 'the question bytes are not decodable UTF-8');
  }
  if (text.normalize('NFC') !== text) {
    fail(CODES.QUESTION_TEXT_INVALID, 'the question must already be NFC normalised');
  }
  if (FORBIDDEN_CONTROL.test(text) || text.trim().length === 0) {
    fail(CODES.QUESTION_TEXT_INVALID, 'the question must be non-blank text without control characters');
  }
  if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(text))) {
    fail(CODES.QUESTION_TEXT_INVALID,
      'the question carries a path, secret, account, or project identifier this lane will not consume');
  }
  return { text, sha256: digest, bytes: bytes.length };
}

// ------------------------------------------------------------------ source set

/** Canonical commitment over the frozen four-source contract, independent of member order. */
export function seCoreSourceSetContractSha256(contract) {
  if (!exactKeys(contract, CONTRACT_FIELDS) || !Array.isArray(contract.sources)) {
    fail(CODES.SOURCE_SET_INVALID, 'the source-set contract uses one closed field set');
  }
  const material = {
    schema_version: contract.schema_version,
    source_set_id: contract.source_set_id,
    sources: [...contract.sources]
      .map((source) => {
        if (!exactKeys(source, CONTRACT_SOURCE_FIELDS)) {
          fail(CODES.SOURCE_SET_INVALID, 'a source-set descriptor uses one closed field set');
        }
        return {
          source_id: source.source_id,
          title: source.title,
          revision: source.revision,
          source_pdf_sha256: source.source_pdf_sha256,
          derived_text_sha256: source.derived_text_sha256,
          page_count: source.page_count,
        };
      })
      .sort((a, b) => compareCodePoints(String(a.source_id), String(b.source_id))),
  };
  let serialised;
  try {
    serialised = canonicalise(material, { sources: 'insertion_ordered' });
  } catch {
    fail(CODES.SOURCE_SET_INVALID, 'the source-set contract could not be canonicalised');
  }
  return sha256Hex(`${SOURCE_SET_CONTRACT_SCHEMA_VERSION}\n${serialised}`);
}

/**
 * Canonical commitment over the **full** runtime cohort material, independent of member order.
 *
 * `seCoreSourceSetContractSha256` above commits to identity and byte hashes only, which is what a
 * generic validated-contract run needs. It deliberately does not cover approval or permissions, so
 * a caller can hand over arbitrary descriptors, recompute that hash from its own descriptors, and
 * present a self-consistent run — which is exactly why that hash cannot qualify a run as *the*
 * fixed benchmark. This commitment covers identity, byte hashes, the approval status, the operator
 * reuse-rights declaration, and every permission boolean, so a benchmark pin compares against
 * material the caller cannot vary without changing the commitment.
 */
export function seCoreSourceCohortSha256(sources) {
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > MAX.array) {
    fail(CODES.SOURCE_SET_INVALID, 'a cohort commitment is taken over one bounded source list');
  }
  const material = {
    schema_version: SOURCE_COHORT_COMMITMENT_SCHEMA_VERSION,
    sources: [...sources]
      .map((source) => {
        if (!exactKeys(source, SOURCE_FIELDS) || !exactKeys(source.approval, APPROVAL_FIELDS)
            || !exactKeys(source.permissions, PERMISSION_FIELDS)) {
          fail(CODES.SOURCE_SET_INVALID, 'a cohort member uses one closed full-material field set');
        }
        return {
          source_id: source.source_id,
          title: source.title,
          revision: source.revision,
          source_pdf_sha256: source.source_pdf_sha256,
          derived_text_sha256: source.derived_text_sha256,
          page_count: source.page_count,
          approval_status: source.approval.approval_status,
          reuse_rights_reviewed: source.approval.reuse_rights_reviewed,
          public_source_analysis: source.permissions.public_source_analysis,
          evaluation_lane_retrieval: source.permissions.evaluation_lane_retrieval,
          canon_promotion: source.permissions.canon_promotion,
          external_upload: source.permissions.external_upload,
        };
      })
      .sort((a, b) => compareCodePoints(String(a.source_id), String(b.source_id))),
  };
  let serialised;
  try {
    serialised = canonicalise(material, { sources: 'insertion_ordered' });
  } catch {
    fail(CODES.SOURCE_SET_INVALID, 'the runtime source cohort could not be canonicalised');
  }
  return sha256Hex(`${SOURCE_COHORT_COMMITMENT_SCHEMA_VERSION}\n${serialised}`);
}

/**
 * Validates one caller-supplied benchmark cohort pin.
 *
 * The pin is operator configuration, supplied per call. This module hard-codes no cohort hash, no
 * source id, no path, and no content, so nothing here can quietly bless a private corpus: whichever
 * cohort is pinned is the one the caller configured and can be read back from its own receipt.
 */
function validateBenchmarkPin(pin) {
  if (pin === null || typeof pin !== 'object' || Array.isArray(pin)
      || Object.getPrototypeOf(pin) !== Object.prototype || !exactKeys(pin, BENCHMARK_PIN_FIELDS)) {
    fail(CODES.BENCHMARK_PIN_INVALID, 'a benchmark cohort pin uses one closed plain field set');
  }
  let snapshot;
  try {
    snapshot = snapshotPlainOwnData(pin);
  } catch {
    fail(CODES.BENCHMARK_PIN_INVALID, 'a benchmark cohort pin must be bounded plain own data');
  }
  assertIdentifier(snapshot.pin_id, CODES.BENCHMARK_PIN_INVALID);
  assertIdentifier(snapshot.source_set_id, CODES.BENCHMARK_PIN_INVALID);
  if (typeof snapshot.expected_cohort_sha256 !== 'string'
      || !SHA256.test(snapshot.expected_cohort_sha256)) {
    fail(CODES.BENCHMARK_PIN_INVALID, 'expected_cohort_sha256 must be one lowercase sha256');
  }
  if (!Array.isArray(snapshot.allowed_source_ids)
      || snapshot.allowed_source_ids.length !== EXPECTED_SOURCE_COUNT
      || new Set(snapshot.allowed_source_ids).size !== EXPECTED_SOURCE_COUNT) {
    fail(CODES.BENCHMARK_PIN_INVALID,
      'a benchmark cohort pin allowlists exactly four distinct source ids');
  }
  for (const id of snapshot.allowed_source_ids) assertIdentifier(id, CODES.BENCHMARK_PIN_INVALID);
  const ordered = [...snapshot.allowed_source_ids].sort(compareCodePoints);
  if (snapshot.allowed_source_ids.some((id, index) => id !== ordered[index])) {
    fail(CODES.BENCHMARK_PIN_INVALID,
      'a benchmark cohort pin lists its members in canonical source_id order');
  }
  return snapshot;
}

/** Binds the validated runtime cohort to the pin, before a single model call can happen. */
function bindBenchmarkCohort(pin, contract, descriptors) {
  const cohortSha256 = seCoreSourceCohortSha256(descriptors);
  if (pin === null) {
    return { cohort_sha256: cohortSha256, pinned: false, pin_id: 'none' };
  }
  if (contract.source_set_id !== pin.source_set_id) {
    fail(CODES.BENCHMARK_PIN_INVALID, 'the pinned benchmark names a different source set');
  }
  if (descriptors.some((source, index) => source.source_id !== pin.allowed_source_ids[index])) {
    fail(CODES.BENCHMARK_PIN_INVALID, 'a runtime source is not an allowlisted cohort member');
  }
  if (cohortSha256 !== pin.expected_cohort_sha256) {
    fail(CODES.BENCHMARK_PIN_INVALID,
      'the runtime cohort does not match its pinned full-material commitment');
  }
  return { cohort_sha256: cohortSha256, pinned: true, pin_id: pin.pin_id };
}

function validateSourceSet(corpus) {
  if (!exactKeys(corpus, CORPUS_FIELDS)) {
    fail(CODES.SOURCE_SET_INVALID, 'the corpus invocation uses one closed field set');
  }
  const contract = corpus.sourceSetContract;
  if (!exactKeys(contract, CONTRACT_FIELDS)
      || contract.schema_version !== SOURCE_SET_CONTRACT_SCHEMA_VERSION) {
    fail(CODES.SOURCE_SET_INVALID,
      `the source-set contract must declare ${SOURCE_SET_CONTRACT_SCHEMA_VERSION}`);
  }
  assertIdentifier(contract.source_set_id, CODES.SOURCE_SET_INVALID);
  if (!Array.isArray(contract.sources) || contract.sources.length !== EXPECTED_SOURCE_COUNT) {
    fail(CODES.SOURCE_SET_INVALID, 'the frozen source set contains exactly four allowlisted sources');
  }
  const seen = new Set();
  for (const source of contract.sources) {
    if (!exactKeys(source, CONTRACT_SOURCE_FIELDS)) {
      fail(CODES.SOURCE_SET_INVALID, 'a source-set descriptor uses one closed field set');
    }
    assertIdentifier(source.source_id, CODES.SOURCE_SET_INVALID);
    assertSafeString(source.title, CODES.SOURCE_SET_INVALID);
    assertSafeString(source.revision, CODES.SOURCE_SET_INVALID);
    if (!SHA256.test(source.source_pdf_sha256 ?? '') || !SHA256.test(source.derived_text_sha256 ?? '')) {
      fail(CODES.SOURCE_SET_INVALID, 'every source needs a lowercase PDF and derived-text sha256');
    }
    if (!Number.isSafeInteger(source.page_count) || source.page_count < 1
        || source.page_count > MAX.page_count) {
      fail(CODES.SOURCE_SET_INVALID, 'every source needs one bounded positive page count');
    }
    if (seen.has(source.source_id)) {
      fail(CODES.SOURCE_SET_INVALID, 'a source_id may appear only once in the frozen source set');
    }
    seen.add(source.source_id);
  }
  // Contract order is canonical, so a reordered runtime set is an ambiguity rather than a
  // convenience: two different orders would otherwise select different bounded evidence.
  const ordered = [...contract.sources].map((source) => source.source_id)
    .sort(compareCodePoints);
  if (contract.sources.some((source, index) => source.source_id !== ordered[index])) {
    fail(CODES.SOURCE_SET_INVALID,
      'the source-set contract must list its four sources in canonical source_id order');
  }
  if (typeof corpus.expectedSourceSetSha256 !== 'string' || !SHA256.test(corpus.expectedSourceSetSha256)) {
    fail(CODES.SOURCE_SET_PIN_INVALID, 'expectedSourceSetSha256 must be one lowercase sha256');
  }
  const computed = seCoreSourceSetContractSha256(contract);
  if (computed !== corpus.expectedSourceSetSha256) {
    fail(CODES.SOURCE_SET_PIN_INVALID,
      'the source-set contract does not match its expected canonical commitment',
      { computed_source_set_sha256: computed });
  }

  if (!Array.isArray(corpus.sources) || corpus.sources.length !== EXPECTED_SOURCE_COUNT) {
    fail(CODES.SOURCE_SET_INVALID, 'exactly four runtime source descriptors are required');
  }
  return corpus.sources.map((descriptor, index) => {
    const pinned = contract.sources[index];
    if (!exactKeys(descriptor, SOURCE_FIELDS)) {
      fail(CODES.SOURCE_SET_INVALID, 'a runtime source descriptor uses one closed field set');
    }
    if (descriptor.source_id !== pinned.source_id || descriptor.title !== pinned.title
        || descriptor.revision !== pinned.revision
        || descriptor.source_pdf_sha256 !== pinned.source_pdf_sha256
        || descriptor.derived_text_sha256 !== pinned.derived_text_sha256
        || descriptor.page_count !== pinned.page_count) {
      fail(CODES.SOURCE_SET_INVALID,
        'each runtime source must match its frozen contract member at the same canonical position');
    }
    if (!exactKeys(descriptor.approval, APPROVAL_FIELDS)
        || !APPROVED_SOURCE_STATUS.has(descriptor.approval.approval_status)
        || descriptor.approval.reuse_rights_reviewed !== true) {
      fail(CODES.SOURCE_SET_INVALID,
        'every source needs a reviewed public-source approval sufficient for this analysis');
    }
    if (!exactKeys(descriptor.permissions, PERMISSION_FIELDS)
        || descriptor.permissions.public_source_analysis !== true
        || descriptor.permissions.evaluation_lane_retrieval !== true
        || descriptor.permissions.canon_promotion !== false
        || descriptor.permissions.external_upload !== false) {
      fail(CODES.SOURCE_SET_INVALID,
        'source permissions must allow evaluation-lane analysis and forbid promotion and upload');
    }
    const bytes = descriptor.derived_text_bytes;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX.derived_text_bytes) {
      fail(CODES.DERIVED_TEXT_PIN_INVALID, 'derived_text_bytes must be one bounded non-empty Buffer');
    }
    if (sha256Hex(bytes) !== descriptor.derived_text_sha256) {
      fail(CODES.DERIVED_TEXT_PIN_INVALID,
        'a derived-text byte stream does not match its pinned derived_text_sha256');
    }
    return descriptor;
  });
}

// ------------------------------------------------------------------ derived text parsing

function splitOversizedBlock(block, limit) {
  if (block.length <= limit) return [block];
  const pieces = [];
  let buffer = '';
  for (const word of block.split(' ')) {
    for (const part of hardSlice(word, limit)) {
      if (buffer.length === 0) { buffer = part; continue; }
      if (buffer.length + 1 + part.length <= limit) { buffer = `${buffer} ${part}`; continue; }
      pieces.push(buffer);
      buffer = part;
    }
  }
  if (buffer.length > 0) pieces.push(buffer);
  return pieces;
}

/**
 * Splits one oversized word into pieces of at most `limit` UTF-16 units.
 *
 * The cut is taken between code points, never inside one. Slicing by index would cut a surrogate
 * pair in half whenever the boundary landed at an odd offset inside an astral run, and each half
 * is a lone surrogate: it would be chunked, hashed, handed to the model, and rendered as a
 * replacement character, so two different chunks could even commit to the same `chunk_sha256`.
 * The unit budget is kept because every other length bound in this module counts UTF-16 units.
 */
function hardSlice(word, limit) {
  if (word.length <= limit) return [word];
  const parts = [];
  let buffer = '';
  for (const codePoint of word) {
    if (buffer.length > 0 && buffer.length + codePoint.length > limit) {
      parts.push(buffer);
      buffer = '';
    }
    buffer += codePoint;
  }
  if (buffer.length > 0) parts.push(buffer);
  return parts;
}

const PREAMBLE_ABSENT = Object.freeze({
  present: false,
  title_matches_pinned_title: false,
  next_index: 0,
});

/** Preamble metadata is public-safe bounded text; a URL there names a location, not a document. */
function assertPreambleText(value) {
  assertSafeString(value, CODES.DERIVED_TEXT_MALFORMED);
  if (URL_LIKE.test(value)) {
    fail(CODES.FORBIDDEN_PARTICIPANT_INPUT,
      'a URL in a derived-text metadata preamble names a location this lane never retrieved');
  }
}

/**
 * Consumes the bounded metadata preamble the authorized derived-text artifacts carry before their
 * first page heading, and binds it to the already-pinned source-set descriptor.
 *
 * Exactly one shape is accepted: one H1 title, the five known metadata bullets — in any order,
 * because the binding is by key and an emitted order carries no meaning — then the first
 * `## Page N` heading, with blank lines free between them. A missing, repeated, or unknown key, a
 * malformed bullet, a second H1, or any other non-blank line before the first page heading refuses
 * the run. This is one closed shape, not arbitrary front matter.
 *
 * `source_id`, `revision`, `source_pdf_sha256`, and `page_count` must equal the pinned source-set
 * member exactly, so a preamble that describes a different document refuses the run instead of
 * being ignored. `extraction` is bounded, safe, non-empty provenance text and is deliberately not
 * part of the source-set commitment: it records how the text was produced, not which document it
 * is, and pinning it would refuse a re-extraction of identical bytes.
 *
 * The H1 title is required, but it is *not* required to equal the pinned title. The pinned title is
 * an operator-curated label in the source-set contract; the H1 is whatever the extraction step
 * rendered from the document itself, so a subtitle, an edition suffix, or punctuation can differ
 * for the same document. Identity is already pinned four ways above, and the H1 bytes are already
 * committed by `derived_text_sha256`, so a byte equality here could only refuse a correct run — it
 * could not catch a substituted document. The divergence is reported as one receipt boolean rather
 * than equated.
 *
 * No preamble line is ever chunked, indexed, retrieved, cited, or copied into evidence or receipt.
 */
function consumePreamble(lines, descriptor, controlLines) {
  let index = 0;
  while (index < lines.length && lines[index].trim().length === 0) index += 1;
  if (index >= lines.length) return PREAMBLE_ABSENT;
  const heading = PREAMBLE_TITLE.exec(lines[index]);
  // Not an H1: either a stream that starts at its first page heading, or content the page parser
  // below already refuses. Either way the old behaviour is unchanged.
  if (heading === null) return PREAMBLE_ABSENT;

  const values = new Map();
  let cursor = index + 1;
  while (cursor < lines.length && !PAGE_HEADING.test(lines[cursor])) {
    if (cursor - index >= MAX.preamble_lines) {
      fail(CODES.DERIVED_TEXT_MALFORMED,
        'the derived-text metadata preamble exceeds its bounded line budget');
    }
    const line = lines[cursor];
    cursor += 1;
    if (line.trim().length === 0) continue;
    const bullet = PREAMBLE_BULLET.exec(line);
    if (bullet === null || !PREAMBLE_KEYS.includes(bullet[1])) {
      fail(CODES.DERIVED_TEXT_MALFORMED,
        'only the known metadata bullets may precede the first "## Page N" heading');
    }
    if (values.has(bullet[1])) {
      fail(CODES.DERIVED_TEXT_MALFORMED,
        'a derived-text metadata key may appear exactly once in the preamble');
    }
    const trimmed = bullet[2].trim();
    const span = PREAMBLE_CODE_SPAN.exec(trimmed);
    values.set(bullet[1], span === null ? trimmed : span[1].trim());
  }
  if (PREAMBLE_KEYS.some((key) => !values.has(key))) {
    fail(CODES.DERIVED_TEXT_MALFORMED,
      'the derived-text metadata preamble must declare each known metadata key exactly once');
  }
  // U+0000 and U+001F are replaced with SPACE before this parser sees the stream, which is right
  // for page prose — the whitespace collapses — but would let a control character break a private
  // path, a secret, or a project code apart just enough to slip past the leakage scan below. In
  // metadata, a replaced control is evasion, not formatting, so the whole preamble region is
  // refused if any of its lines carried one.
  if (controlLines.slice(0, cursor).some(Boolean)) {
    fail(CODES.DERIVED_TEXT_MALFORMED,
      'a control character inside the derived-text metadata preamble refuses the stream');
  }
  const title = heading[1].trim();
  for (const value of [title, ...values.values()]) assertPreambleText(value);
  if (PREAMBLE_PINNED_KEYS.some((key) => values.get(key) !== String(descriptor[key]))) {
    fail(CODES.DERIVED_TEXT_PIN_INVALID,
      'a derived-text metadata preamble does not bind to its pinned source-set descriptor');
  }
  return {
    present: true,
    title_matches_pinned_title: title === descriptor.title,
    next_index: cursor,
  };
}

/**
 * Parses one runtime derived-text stream into page-aware chunks.
 *
 * The runtime format is Markdown with `## Page N` headings, optionally opened by the one bounded
 * metadata preamble `consumePreamble` accepts, and nothing else is guessed: other content before
 * the first heading, a repeated page, a non-increasing page, or a page beyond the pinned page
 * count refuses the run. A chunk never crosses a page boundary, so a citation page is exact rather
 * than inferred. Raw PDFs are never read here.
 */
function parsePageAwareChunks(descriptor) {
  // The raw byte pin is already verified against `derived_text_sha256` before this runs, so the
  // stream normalised below is provably the stream the source set committed to. Verifying a
  // normalised form instead would commit to bytes nobody supplied.
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(descriptor.derived_text_bytes);
  } catch {
    fail(CODES.DERIVED_TEXT_MALFORMED, 'a derived-text stream is not decodable UTF-8');
  }
  // A UTF-8 BOM is consumed by the decoder itself, not by any rewrite here. It is still one byte
  // difference between the pinned stream and the parsed text, so it is reported rather than left
  // to be inferred from two hashes that disagree while both replacement counts read zero.
  const bytes = descriptor.derived_text_bytes;
  const bomStripped = bytes.length >= 3
    && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  // Exactly two characters are rewritten, in memory only, and both are counted. Real extraction
  // output carries stray NUL and UNIT SEPARATOR bytes where a PDF had a cell or record break, and
  // both are unambiguously word separators there. Every other C0/C1 character is refused rather
  // than guessed at: LINE FEED and TAB are the stream's own structure and are preserved, and a
  // carriage return, form feed, or escape would be a different extraction shape than this parser
  // was written for. Nothing normalised here is ever written back to disk.
  const replacements = { u0000: 0, u001f: 0 };
  const normalised = text.replace(/[\u0000\u001f]/gu, (character) => {
    if (character === '\u0000') replacements.u0000 += 1; else replacements.u001f += 1;
    return ' ';
  });
  if (FORBIDDEN_CONTROL.test(normalised)) {
    fail(CODES.DERIVED_TEXT_MALFORMED, 'a derived-text stream carries forbidden control characters');
  }
  if (normalised.normalize('NFC') !== normalised) {
    fail(CODES.DERIVED_TEXT_MALFORMED, 'a derived-text stream is not NFC normalised');
  }
  const lines = normalised.split('\n');
  // Neither replaced character is a line separator, so the raw and normalised line arrays are the
  // same shape and a replacement can be attributed to the exact line it happened on.
  const controlLines = text.split('\n').map((line) => REPLACED_DERIVED_CONTROL.test(line));
  const preamble = consumePreamble(lines, descriptor, controlLines);
  const pages = [];
  let current = null;
  for (const line of lines.slice(preamble.next_index)) {
    const heading = PAGE_HEADING.exec(line);
    if (heading) {
      if (current !== null) pages.push(current);
      current = { page: Number(heading[1]), lines: [] };
      continue;
    }
    if (current === null) {
      if (line.trim().length > 0) {
        fail(CODES.DERIVED_TEXT_MALFORMED,
          'derived text must begin with one "## Page N" heading before any content');
      }
      continue;
    }
    current.lines.push(line);
  }
  if (current !== null) pages.push(current);
  if (pages.length === 0 || pages.length > MAX.parsed_pages) {
    fail(CODES.DERIVED_TEXT_MALFORMED, 'derived text must declare between one and 5000 pages');
  }
  for (let index = 0; index < pages.length; index += 1) {
    const { page } = pages[index];
    if (page < 1 || page > descriptor.page_count
        || (index > 0 && page <= pages[index - 1].page)) {
      fail(CODES.DERIVED_TEXT_MALFORMED,
        'derived-text page headings must strictly increase and stay within the pinned page count');
    }
  }
  const chunks = [];
  for (const { page, lines } of pages) {
    const blocks = lines.join('\n')
      .split(/\n[ \t]*\n+/u)
      .map((block) => block.replace(/\s+/gu, ' ').trim())
      .filter((block) => block.length > 0);
    const packed = [];
    let buffer = '';
    for (const block of blocks) {
      for (const piece of splitOversizedBlock(block, MAX.chunk_chars)) {
        if (buffer.length === 0) { buffer = piece; continue; }
        if (buffer.length + 1 + piece.length <= MAX.chunk_chars) {
          buffer = `${buffer} ${piece}`;
          continue;
        }
        packed.push(buffer);
        buffer = piece;
      }
    }
    if (buffer.length > 0) packed.push(buffer);
    packed.forEach((chunkText, index) => {
      chunks.push({
        chunk_id: `${descriptor.source_id}_p${page}_c${index + 1}`,
        page_numbers: [page],
        text: chunkText,
      });
    });
  }
  if (chunks.length === 0 || chunks.length > MAX.chunks_per_source) {
    fail(CODES.DERIVED_TEXT_MALFORMED,
      'a derived-text stream produced no usable chunk or exceeded the chunk ceiling');
  }
  return {
    chunks,
    parsed_page_count: pages.length,
    // Commitments and counts only: no normalised byte is returned, kept, or written anywhere.
    normalized_text_sha256: sha256Hex(normalised),
    replacement_counts: { ...replacements },
    bom_stripped_by_decoder: bomStripped,
    // Shape facts only: no preamble text leaves this function.
    preamble: {
      present: preamble.present,
      title_matches_pinned_title: preamble.title_matches_pinned_title,
    },
  };
}

// ------------------------------------------------------------------ model adapter

/**
 * Reads one own enumerable **data** property, without ever invoking an accessor.
 *
 * Returns a one-element holder so a legitimately `undefined` value stays distinguishable from an
 * absent, inherited, hidden, or accessor-backed slot.
 */
function ownDataSlot(target, key) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(target, key);
  } catch {
    return null;
  }
  if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    return null;
  }
  return { value: descriptor.value };
}

/**
 * Validates the injected adapter and binds its seams once.
 *
 * The adapter is the one input this lane cannot snapshot, because it must carry functions. So it
 * is required to be a plain object whose declared seams and descriptor fields are own enumerable
 * data properties, and each is read exactly once through its property descriptor — which never
 * runs a getter. A stable accessor is refused for the same reason a shifting one is: the value the
 * validator saw and the value the lane later uses are two reads of a caller-controlled function, so
 * an accessor could hand a safe `adapter_id` to the receipt and a substituted renderer to the call,
 * and the receipt would describe a run that never happened. The bound seam is what actually runs.
 */
function validateModelContext(context) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)
      || types.isProxy(context) || Object.getPrototypeOf(context) !== Object.prototype
      || !exactKeys(context, MODEL_CONTEXT_FIELDS)) {
    fail(CODES.MODEL_ADAPTER_INVALID, 'the lane takes one closed model context with an answerModel');
  }
  const adapterSlot = ownDataSlot(context, 'answerModel');
  const answerModel = adapterSlot === null ? null : adapterSlot.value;
  if (answerModel === null || typeof answerModel !== 'object' || Array.isArray(answerModel)
      || types.isProxy(answerModel) || Object.getPrototypeOf(answerModel) !== Object.prototype) {
    fail(CODES.MODEL_ADAPTER_INVALID, 'answerModel must be one plain own-data adapter object');
  }
  const composeSlot = ownDataSlot(answerModel, 'composeAnswer');
  if (composeSlot === null || typeof composeSlot.value !== 'function'
      || types.isProxy(composeSlot.value)) {
    fail(CODES.MODEL_ADAPTER_INVALID,
      'answerModel must expose composeAnswer as one own enumerable data function');
  }
  // Optional: only a requested advisory expansion needs it. Present-but-not-own-data is still a
  // refusal, because a lane that tolerated it would call whatever the second read returned.
  const expansionSlot = ownDataSlot(answerModel, 'proposeQueryExpansion');
  if (expansionSlot === null
      ? Object.hasOwn(answerModel, 'proposeQueryExpansion')
      : typeof expansionSlot.value !== 'function' || types.isProxy(expansionSlot.value)) {
    fail(CODES.MODEL_ADAPTER_INVALID,
      'proposeQueryExpansion, when present, must be one own enumerable data function');
  }
  const descriptorSlot = ownDataSlot(answerModel, 'descriptor');
  const descriptor = descriptorSlot === null ? null : descriptorSlot.value;
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)
      || types.isProxy(descriptor) || Object.getPrototypeOf(descriptor) !== Object.prototype
      || !exactKeys(descriptor, MODEL_DESCRIPTOR_FIELDS)) {
    fail(CODES.MODEL_ADAPTER_INVALID, 'answerModel.descriptor uses one closed plain field set');
  }
  const declared = {};
  for (const field of MODEL_DESCRIPTOR_FIELDS) {
    const slot = ownDataSlot(descriptor, field);
    if (slot === null) {
      fail(CODES.MODEL_ADAPTER_INVALID,
        'every adapter descriptor field must be one own enumerable data property');
    }
    declared[field] = slot.value;
  }
  assertIdentifier(declared.adapter_id, CODES.MODEL_ADAPTER_INVALID);
  assertSafeString(declared.adapter_revision, CODES.MODEL_ADAPTER_INVALID);
  if (declared.stateless !== true || declared.tools_enabled !== false
      || declared.history_enabled !== false) {
    fail(CODES.MODEL_ADAPTER_INVALID,
      'the answer model must be declared stateless with no tools and no conversation history');
  }
  const material = {
    adapter_id: declared.adapter_id,
    adapter_revision: declared.adapter_revision,
    stateless: true,
    tools_enabled: false,
    history_enabled: false,
  };
  return {
    seams: {
      receiver: answerModel,
      composeAnswer: composeSlot.value,
      proposeQueryExpansion: expansionSlot === null ? null : expansionSlot.value,
    },
    descriptor: {
      ...material,
      descriptor_sha256: sha256Hex(`${ANSWER_LANE_POLICY_REVISION}\n${canonicalise(material)}`),
    },
  };
}

/** Calls the seam bound at validation time, never a fresh read of the adapter property. */
async function callModel(seams, seam, request, counters, kind) {
  counters.total += 1;
  counters[kind] += 1;
  let response;
  try {
    response = await seams[seam].call(seams.receiver, request);
  } catch {
    fail(CODES.MODEL_CALL_FAILED,
      'the bounded answer model failed or timed out; no provider text is echoed');
  }
  return response;
}

// ------------------------------------------------------------------ query expansion (advisory)

async function advisoryQueryExpansion({ seams, questionText, queryExpansion, counters }) {
  if (!exactKeys(queryExpansion, QUERY_EXPANSION_FIELDS)
      || typeof queryExpansion.requested !== 'boolean'
      || !Number.isSafeInteger(queryExpansion.max_terms) || queryExpansion.max_terms < 1
      || queryExpansion.max_terms > MAX.expansion_terms) {
    fail(CODES.QUERY_EXPANSION_REFUSED, 'the query-expansion request uses one closed bounded field set');
  }
  if (queryExpansion.requested !== true) {
    return { posture: 'not_requested', terms: [], offered: 0 };
  }
  if (seams.proposeQueryExpansion === null) {
    fail(CODES.QUERY_EXPANSION_REFUSED,
      'an advisory expansion was requested but the adapter exposes no proposeQueryExpansion');
  }
  const request = deepFreeze({
    policy_revision: ANSWER_LANE_POLICY_REVISION,
    language: 'ko',
    instruction: EXPANSION_INSTRUCTION,
    question_text: questionText,
    max_terms: queryExpansion.max_terms,
    output_schema: { ...EXPANSION_OUTPUT_SCHEMA },
  });
  const response = await callModel(seams, 'proposeQueryExpansion', request, counters, 'expansion');
  let snapshot;
  try {
    // The declared advisory ceiling, not the invocation array cap: the caller's own `max_terms`
    // below is what actually bounds this list, so a compliant term list is never refused as
    // oversize before that check can apply.
    snapshot = snapshotPlainOwnData(response, { maxArray: MAX.expansion_terms });
  } catch {
    fail(CODES.QUERY_EXPANSION_REFUSED, 'the advisory expansion response is not plain own data');
  }
  if (!exactKeys(snapshot, MODEL_EXPANSION_FIELDS) || !Array.isArray(snapshot.terms)
      || snapshot.terms.length === 0 || snapshot.terms.length > queryExpansion.max_terms) {
    fail(CODES.QUERY_EXPANSION_REFUSED,
      'an advisory expansion must be one closed bounded term list and nothing else');
  }
  const terms = [];
  for (const term of snapshot.terms) {
    if (typeof term !== 'string' || term.length < 2 || term.length > MAX.expansion_term_chars
        || term.normalize('NFC') !== term || FORBIDDEN_CONTROL.test(term)
        || HTML_LIKE.test(term) || URL_LIKE.test(term)
        || FORBIDDEN_STRINGS.some((pattern) => pattern.test(term))) {
      fail(CODES.QUERY_EXPANSION_REFUSED, 'an advisory expansion term is malformed or forbidden');
    }
    const normalised = term.trim();
    if (normalised.length < 2) {
      fail(CODES.QUERY_EXPANSION_REFUSED, 'an advisory expansion term is malformed or forbidden');
    }
    if (!terms.includes(normalised)) terms.push(normalised);
  }
  return { posture: 'model_advisory_shadow', terms, offered: snapshot.terms.length };
}

// ------------------------------------------------------------------ model selection validation

function validateModelSelection(response, statementById) {
  let snapshot;
  try {
    snapshot = snapshotPlainOwnData(response, {
      maxArray: MAX.propositions,
      maxString: MAX.identifier,
    });
  } catch (error) {
    if (error instanceof ContractError && error.code === CODES.FORBIDDEN_PARTICIPANT_INPUT) {
      failOutputSafety(
        outputSafetyReasonToken(error.detail, OUTPUT_SAFETY_REASONS.MODEL_PAYLOAD_FIELD),
        'the model response carries a forbidden path, secret, or field family; it is not echoed',
      );
    }
    fail(CODES.MODEL_OUTPUT_INVALID, 'the model response is not bounded plain own data');
  }
  if (!exactKeys(snapshot, MODEL_OUTPUT_FIELDS)
      || snapshot.schema_version !== STATEMENT_SELECTION_SCHEMA_VERSION
      || (snapshot.result !== 'answer' && snapshot.result !== 'abstain')
      || !Array.isArray(snapshot.propositions)) {
    fail(CODES.MODEL_OUTPUT_INVALID,
      'the model must return the exact closed statement-selection shape');
  }
  if (snapshot.result === 'abstain') {
    if (snapshot.propositions.length !== 0) {
      fail(CODES.MODEL_OUTPUT_INVALID, 'an abstention must carry an empty propositions array');
    }
    return { result: 'abstain', propositions: [] };
  }
  if (snapshot.propositions.length < 1 || snapshot.propositions.length > MAX.propositions) {
    fail(CODES.MODEL_OUTPUT_INVALID,
      'an answer must select between one and eight propositions');
  }
  const seen = new Set();
  const propositions = snapshot.propositions.map((proposition) => {
    if (!exactKeys(proposition, MODEL_PROPOSITION_FIELDS)
        || typeof proposition.statement_id !== 'string'
        || typeof proposition.relation !== 'string'
        || !STATEMENT_RELATION_SET.has(proposition.relation)) {
      fail(CODES.MODEL_OUTPUT_INVALID, 'a proposition uses one closed relation-labelled field set');
    }
    if (!statementById.has(proposition.statement_id)) {
      fail(CODES.CITATION_UNBOUND,
        'a proposition names a statement outside the retrieved allowlist');
    }
    if (seen.has(proposition.statement_id)) {
      fail(CODES.CITATION_UNBOUND, 'a model response repeats one statement id');
    }
    seen.add(proposition.statement_id);
    return {
      statement_id: proposition.statement_id,
      relation: proposition.relation,
    };
  });
  if (!propositions.some(({ relation }) => relation === 'direct')) {
    fail(CODES.MODEL_OUTPUT_INVALID, 'an answer requires at least one direct proposition');
  }
  return { result: 'answer', propositions };
}

// ------------------------------------------------------------------ rendering and receipts

function hostCitation(statement) {
  const item = statement.evidence;
  return {
    evidence_id: item.evidence_id,
    source_id: item.source_id,
    title: item.title,
    revision: item.revision,
    page_number: item.page_number,
  };
}

function renderAnswer({ question, sourceSet, statements, selection }) {
  const statementById = new Map(statements.map((statement) => [
    statement.statement_id, statement,
  ]));
  const selectedStatements = selection.propositions.map((proposition) => {
    const statement = statementById.get(proposition.statement_id);
    if (statement === undefined) {
      fail(CODES.CITATION_UNBOUND, 'a selected statement could not be host-bound');
    }
    return { proposition, statement };
  });
  const renderedSections = selection.result === 'abstain'
    ? [{
      relation: ABSTAIN_RENDERING.relation,
      heading: ABSTAIN_RENDERING.heading,
      text: ABSTAIN_RENDERING.text,
      citations: [],
    }]
    : selectedStatements.map(({ proposition, statement }) => {
      const rendering = RELATION_RENDERING[proposition.relation];
      return {
        relation: proposition.relation,
        heading: rendering.heading,
        text: `${rendering.prefix}${statement.excerpt}`,
        citations: [hostCitation(statement)],
      };
    });
  const selectedEvidence = selectedStatements.map(({ statement }) => statement.evidence);
  return {
    schema_version: ANSWER_SCHEMA_VERSION,
    lane_id: ANSWER_LANE_ID,
    lane_kind: ANSWER_LANE_KIND,
    policy_revision: ANSWER_LANE_POLICY_REVISION,
    structural_limit: STRUCTURAL_LIMIT,
    result: selection.result,
    rendering_mode: 'host_korean_labels_exact_source_excerpts',
    model_output_contract: STATEMENT_SELECTION_SCHEMA_VERSION,
    model_authored_prose_present: false,
    language: 'ko+source-original',
    question_sha256: question.sha256,
    question_bytes: question.bytes,
    source_set_id: sourceSet.source_set_id,
    source_set_sha256: sourceSet.source_set_sha256,
    sections: renderedSections,
    evidence: selectedEvidence.map((item) => ({
      evidence_id: item.evidence_id,
      source_id: item.source_id,
      title: item.title,
      revision: item.revision,
      page_number: item.page_number,
      source_pdf_sha256: item.source_pdf_sha256,
      derived_text_sha256: item.derived_text_sha256,
    })),
    boundary_note: ANSWER_BOUNDARY_NOTE,
    claim_ceiling: RESULT_CLAIM_CEILING,
    candidate_disposition: CANDIDATE_DISPOSITION,
    authority_actions: [],
  };
}

function canonicalAnswerJson(answer) {
  let serialised;
  try {
    serialised = canonicalise(answer, ANSWER_ORDER_RULES);
  } catch {
    failOutputSafety(OUTPUT_SAFETY_REASONS.ANSWER_CANONICALISATION,
      'the rendered answer could not be canonicalised');
  }
  // One final scan covers host labels, exact selected excerpts, and machine-owned metadata. The
  // family is the scan itself rather than the particular pattern: naming that pattern would start
  // to describe the refused source or operator-curated value.
  if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(serialised))
      || URL_LIKE.test(serialised)
      || HTML_LIKE.test(serialised.replace(/\\u003c/gu, ''))) {
    failOutputSafety(OUTPUT_SAFETY_REASONS.RENDERED_ANSWER_SCAN,
      'the rendered answer failed the output safety scan');
  }
  return `${serialised}\n`;
}

const ZERO_AUTHORITY = Object.freeze({
  owner_approval: false,
  canon_promotion: false,
  task_creation: false,
  disposition_decision: false,
  p5_authority: false,
  p8_authority: false,
  action_execution: false,
  source_truth: false,
  engine_baseline_equivalence: false,
});
const ZERO_WRITES = Object.freeze({
  filesystem_writes: 0,
  erp_writes: 0,
  network_calls_from_lane: 0,
  notebook_calls: 0,
});
const RECEIPT_BOUNDARY = Object.freeze({
  payload_free: true,
  question_text_included: false,
  source_prose_included: false,
  answer_prose_included: false,
  provider_response_body_included: false,
  absolute_paths_included: false,
  runtime_or_session_ids_included: false,
  credentials_included: false,
});

/** Nothing in the receipt may reproduce question, source, or answer prose. */
function assertReceiptPayloadFree(receipt, payloads) {
  let serialised;
  try {
    serialised = canonicalise(receipt, RECEIPT_ORDER_RULES);
  } catch {
    fail(CODES.RECEIPT_NOT_PAYLOAD_FREE, 'the receipt could not be canonicalised');
  }
  if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(serialised))) {
    fail(CODES.RECEIPT_NOT_PAYLOAD_FREE, 'the receipt carries a path, secret, or account identifier');
  }
  for (const payload of payloads) {
    if (typeof payload !== 'string' || payload.length < 12) continue;
    const probe = JSON.stringify(payload.slice(0, 32)).slice(1, -1);
    if (serialised.includes(probe)) {
      fail(CODES.RECEIPT_NOT_PAYLOAD_FREE,
        'the receipt reproduces question, source, or answer prose');
    }
  }
  const walk = (value) => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
        fail(CODES.RECEIPT_NOT_PAYLOAD_FREE, 'the receipt uses a forbidden payload field name');
      }
      walk(child);
    }
  };
  walk(receipt);
  return serialised;
}

function holdReceipt({ code, counters, detail = {} }) {
  const receipt = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    result: 'HOLD',
    lane_id: ANSWER_LANE_ID,
    lane_kind: ANSWER_LANE_KIND,
    policy_revision: ANSWER_LANE_POLICY_REVISION,
    structural_limit: STRUCTURAL_LIMIT,
    claim_ceiling: RESULT_CLAIM_CEILING,
    candidate_disposition: CANDIDATE_DISPOSITION,
    answer_rendered: false,
    blocker_code: code,
    blocker_stage: BLOCKER_STAGE[code] ?? 'unknown',
    // One closed family token when — and only when — this hold is an output-safety refusal, and
    // the key is absent on every other hold. It names which check refused, never what it refused,
    // and never where. The token is chosen inside this module; no caller, adapter, or model value
    // reaches it. Absence rather than `null` is the canonical kernel's own rule for a field that
    // has nothing to say, so this receipt needs no serialisation special case to obey it.
    ...(code === CODES.OUTPUT_SAFETY_FAILED
      ? { output_safety_reason: outputSafetyReasonToken(detail) }
      : {}),
    authority: { ...ZERO_AUTHORITY },
    model: {
      invocation_count: counters.total,
      answer_invocation_count: counters.answer,
      expansion_invocation_count: counters.expansion,
    },
    writes: { ...ZERO_WRITES },
    boundary: { ...RECEIPT_BOUNDARY },
    ...(SHA256.test(detail.computed_source_set_sha256 ?? '')
      ? { computed_source_set_sha256: detail.computed_source_set_sha256 }
      : {}),
  };
  return deepFreeze({ answer: null, receipt });
}

// ------------------------------------------------------------------ public interface

/**
 * Answers one exact question over one caller-supplied, contract-validated four-source corpus.
 *
 * This is the **generic validated-contract API**. It proves that the descriptors it was given are
 * internally consistent, allowlisted for evaluation-lane analysis, and byte-pinned — it does not
 * and cannot prove that they are the fixed benchmark cohort, because the caller supplied both the
 * descriptors and the contract commitment over them. The receipt says exactly that:
 * `source_set.benchmark_pin.fixed_benchmark_identity_asserted` is `false`. Use
 * `runSeCorePinnedBenchmarkAnswerLane` when the run has to be the pinned benchmark.
 *
 * Returns `{ answer, receipt }`. Every contract failure returns a fail-closed HOLD receipt with
 * `answer: null` and a truthful model invocation count; nothing is invented to fill a gap.
 */
export async function runSeCoreSourceboundAnswerLane(input, context = {}) {
  return executeAnswerLane(input, context, null);
}

/**
 * Answers one exact question over one **explicitly pinned** benchmark cohort.
 *
 * `benchmarkPin` is independently configured by the caller and names the pinned set, its
 * allowlisted members, and the expected commitment over the full member material — identity, byte
 * hashes, approval, and permissions. A changed approval status, a changed permission, or a changed
 * source identity refuses the run even when the caller recomputes every hash it controls, because
 * the pin is not derived from the descriptors under test. The gate closes before any model call.
 */
export async function runSeCorePinnedBenchmarkAnswerLane(input, context = {}, benchmarkPin) {
  return executeAnswerLane(input, context, { supplied: benchmarkPin });
}

async function executeAnswerLane(input, context, pinRequest) {
  const counters = { total: 0, answer: 0, expansion: 0 };
  try {
    const pin = pinRequest === null ? null : validateBenchmarkPin(pinRequest.supplied);
    const snapshot = snapshotInvocation(input);
    const question = validateQuestion(snapshot);
    const scope = validateScope(snapshot.scope);
    const descriptors = validateSourceSet(snapshot.corpus);
    const cohort = bindBenchmarkCohort(pin, snapshot.corpus.sourceSetContract, descriptors);
    const { seams, descriptor: adapter } = validateModelContext(context);
    if (!exactKeys(snapshot.retrieval, RETRIEVAL_FIELDS)
        || !Number.isSafeInteger(snapshot.retrieval.max_evidence)
        || snapshot.retrieval.max_evidence < 1 || snapshot.retrieval.max_evidence > MAX.evidence
        || !Number.isSafeInteger(snapshot.retrieval.max_per_source)
        || snapshot.retrieval.max_per_source < 1
        || snapshot.retrieval.max_per_source > MAX.per_source) {
      fail(CODES.INPUT_INVALID, 'the retrieval budget uses one closed bounded field set');
    }

    const parsed = descriptors.map((descriptor) => ({
      descriptor,
      ...parsePageAwareChunks(descriptor),
    }));
    const expansion = await advisoryQueryExpansion({
      seams, questionText: question.text, queryExpansion: snapshot.queryExpansion, counters,
    });

    let search;
    try {
      search = searchSourceTextCorpus({
        sources: parsed.map(({ descriptor, chunks }) => ({
          source_id: descriptor.source_id,
          chunks,
        })),
        queryText: question.text,
        advisoryTerms: expansion.terms,
        maxEvidence: snapshot.retrieval.max_evidence,
        maxPerSource: snapshot.retrieval.max_per_source,
      });
    } catch {
      fail(CODES.RETRIEVAL_REFUSED, 'the corpus-wide retrieval seam refused this bounded request');
    }
    if (search.receipt.searched_source_count !== EXPECTED_SOURCE_COUNT) {
      fail(CODES.RETRIEVAL_REFUSED, 'the retrieval receipt must prove all four sources were searched');
    }
    if (search.hits.length === 0) {
      fail(CODES.RETRIEVAL_EMPTY,
        'no chunk in the frozen corpus matched this question; the lane answers nothing unsupported');
    }

    const chunkIndex = new Map();
    for (const { descriptor, chunks } of parsed) {
      for (const chunk of chunks) {
        chunkIndex.set(`${descriptor.source_id}|${chunk.chunk_id}`, { descriptor, chunk });
      }
    }
    const evidence = search.hits.map((hit, index) => {
      const found = chunkIndex.get(`${hit.source_id}|${hit.chunk_id}`);
      if (found === undefined) {
        fail(CODES.RETRIEVAL_REFUSED, 'a retrieval hit did not resolve to one parsed corpus chunk');
      }
      return {
        evidence_id: `E${index + 1}`,
        source_id: found.descriptor.source_id,
        title: found.descriptor.title,
        revision: found.descriptor.revision,
        page_number: hit.page_numbers[0],
        chunk_id: hit.chunk_id,
        chunk_sha256: sha256Hex(found.chunk.text),
        derived_text_sha256: found.descriptor.derived_text_sha256,
        source_pdf_sha256: found.descriptor.source_pdf_sha256,
        text: found.chunk.text,
      };
    });

    // One retrieved chunk becomes one host-owned statement in evidence order. The excerpt is the
    // entire exact normalized chunk; the model can select its S-id but cannot author a span.
    const statements = evidence.map((item, index) => ({
      statement_id: `S${index + 1}`,
      excerpt: item.text,
      evidence: item,
    }));
    const statementIds = statements.map(({ statement_id: statementId }) => statementId);
    const modelRequest = deepFreeze({
      policy_revision: ANSWER_LANE_POLICY_REVISION,
      language: 'ko+source-original',
      instruction: ANSWER_INSTRUCTION,
      question_text: question.text,
      statements: statements.map((statement) => ({
        statement_id: statement.statement_id,
        excerpt: statement.excerpt,
      })),
      output_schema: statementSelectionResponseJsonSchema(statementIds),
    });
    let promptSha256;
    try {
      promptSha256 = sha256Hex(
        `${ANSWER_LANE_POLICY_REVISION}\n${canonicalise(modelRequest, MODEL_REQUEST_ORDER_RULES)}`,
      );
    } catch {
      fail(CODES.RETRIEVAL_REFUSED, 'the bounded model request could not be canonicalised');
    }

    const response = await callModel(seams, 'composeAnswer', modelRequest, counters, 'answer');
    const selection = validateModelSelection(
      response,
      new Map(statements.map((statement) => [statement.statement_id, statement])),
    );
    const sourceSet = {
      source_set_id: snapshot.corpus.sourceSetContract.source_set_id,
      source_set_sha256: snapshot.corpus.expectedSourceSetSha256,
    };
    const answer = renderAnswer({ question, sourceSet, statements, selection });
    const answerJson = canonicalAnswerJson(answer);
    const citationCount = answer.sections.reduce(
      (total, section) => total + section.citations.length, 0,
    );

    const receipt = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      result: 'PASS',
      lane_id: ANSWER_LANE_ID,
      lane_kind: ANSWER_LANE_KIND,
      policy_revision: ANSWER_LANE_POLICY_REVISION,
      structural_limit: STRUCTURAL_LIMIT,
      claim_ceiling: RESULT_CLAIM_CEILING,
      candidate_disposition: CANDIDATE_DISPOSITION,
      answer_rendered: true,
      // No `output_safety_reason` key: a run that rendered an answer refused nothing on output
      // safety, and the canonical rule for a field with nothing to say is to omit it.
      evaluation_scope: {
        evaluation_only: true,
        point_in_time: scope.point_in_time,
        actual_project_data_included: false,
        private_data_included: false,
        deterministic_engine_baseline: false,
        general_open_qa: false,
        production_ready: false,
        numeric_score_claimed: false,
      },
      authority: { ...ZERO_AUTHORITY },
      question: {
        sha256: question.sha256,
        bytes: question.bytes,
        normalization: 'nfc_utf8',
        text_persisted: false,
      },
      source_set: {
        source_set_id: sourceSet.source_set_id,
        source_set_sha256: sourceSet.source_set_sha256,
        source_count: EXPECTED_SOURCE_COUNT,
        // The contract commitment covers identity and byte hashes; the cohort commitment covers
        // the full member material, so the two together say what was validated and what was pinned.
        cohort_sha256: cohort.cohort_sha256,
        cohort_material: 'identity_bytes_approval_permissions',
        reuse_rights_reviewed_basis: REUSE_RIGHTS_BASIS,
        benchmark_pin: {
          pinned: cohort.pinned,
          pin_id: cohort.pin_id,
          cohort_commitment_verified: cohort.pinned,
          // False on the generic API: validated descriptors plus a caller-recomputed contract hash
          // are a consistent corpus, not evidence that this is the fixed benchmark.
          fixed_benchmark_identity_asserted: cohort.pinned,
        },
        sources: parsed.map(({
          descriptor, chunks, parsed_page_count: pageCount, preamble,
          normalized_text_sha256: normalizedSha256, replacement_counts: replacements,
        }) => ({
          source_id: descriptor.source_id,
          revision: descriptor.revision,
          approval_status: descriptor.approval.approval_status,
          source_pdf_sha256: descriptor.source_pdf_sha256,
          // The pinned hash of the bytes as supplied, verified before any decode or replacement.
          raw_derived_text_sha256: descriptor.derived_text_sha256,
          // The hash of the in-memory normalised text that was actually parsed. Equal to the raw
          // hash whenever both replacement counts are zero, so the two together say precisely what
          // changed. The normalised bytes themselves are never persisted.
          normalized_text_sha256: normalizedSha256,
          replacement_counts: replacements,
          normalized_bytes_persisted: false,
          pinned_page_count: descriptor.page_count,
          parsed_page_count: pageCount,
          chunk_count: chunks.length,
          preamble_present: preamble.present,
          // False when no preamble is present. A true value means an H1 was present and matched
          // the pinned title; a false value on a present preamble records a cosmetic divergence
          // the lane deliberately does not treat as a mismatch.
          preamble_title_matches_pinned_title: preamble.title_matches_pinned_title,
        })),
      },
      retrieval: { ...search.receipt },
      query_expansion: {
        posture: expansion.posture,
        authoritative: false,
        engine_retrieval: false,
        ai_assisted_shadow: expansion.posture === 'model_advisory_shadow',
        terms_offered: expansion.offered,
        terms_accepted: expansion.terms.length,
        terms_sha256: sha256Hex(`${ANSWER_LANE_POLICY_REVISION}\n${expansion.terms.join(' ')}`),
        provenance: expansion.posture === 'model_advisory_shadow'
          ? adapter.adapter_id
          : 'none',
      },
      prompt_commitment: {
        policy_revision: ANSWER_LANE_POLICY_REVISION,
        prompt_sha256: promptSha256,
        evidence_ids: evidence.map((item) => item.evidence_id),
        evidence_commitments: evidence.map((item) => ({
          evidence_id: item.evidence_id,
          source_id: item.source_id,
          page_number: item.page_number,
          chunk_id: item.chunk_id,
          chunk_sha256: item.chunk_sha256,
        })),
        statement_commitments: statements.map((statement) => ({
          statement_id: statement.statement_id,
          evidence_id: statement.evidence.evidence_id,
          excerpt_sha256: sha256Hex(statement.excerpt),
          excerpt_byte_length: Buffer.byteLength(statement.excerpt, 'utf8'),
        })),
      },
      model_adapter: { ...adapter },
      model: {
        invocation_count: counters.total,
        answer_invocation_count: counters.answer,
        expansion_invocation_count: counters.expansion,
      },
      output: {
        answer_sha256: sha256Hex(answerJson),
        section_count: answer.sections.length,
        citation_count: citationCount,
        cited_evidence_count: answer.evidence.length,
        retrieved_evidence_count: evidence.length,
        selected_statement_count: selection.propositions.length,
        evidence_section_count: selection.propositions.length,
        uncited_evidence_section_count: 0,
        html_present: false,
        model_authored_prose_present: false,
        rendering_revision: HOST_RENDERING_REVISION,
        excerpt_binding: 'exact_host_chunk',
        content_verification: 'exact_host_evidence_projection',
        semantic_entailment_verified: false,
        selection_correctness: 'unknown',
      },
      writes: { ...ZERO_WRITES },
      boundary: { ...RECEIPT_BOUNDARY },
    };
    assertReceiptPayloadFree(receipt, [
      question.text,
      ...evidence.map((item) => item.text),
      ...answer.sections.map((section) => section.text),
      ...answer.sections.map((section) => section.heading),
    ]);
    return deepFreeze({ answer, receipt, answer_json: answerJson });
  } catch (error) {
    const code = error instanceof ContractError && Object.values(CODES).includes(error.code)
      ? error.code
      : CODES.INPUT_INVALID;
    return holdReceipt({
      code,
      counters,
      detail: error instanceof ContractError ? (error.detail ?? {}) : {},
    });
  }
}

/** Canonical answer bytes for one completed run. */
export function canonicalSeCoreSourceboundAnswerJson(run) {
  if (run === null || typeof run !== 'object' || typeof run.answer_json !== 'string') {
    fail(CODES.INPUT_INVALID, 'one completed answer-lane run is required');
  }
  return run.answer_json;
}

/** Canonical payload-free receipt bytes for one completed or held run. */
export function canonicalSeCoreSourceboundReceiptJson(run) {
  if (run === null || typeof run !== 'object' || run.receipt === null
      || typeof run.receipt !== 'object') {
    fail(CODES.INPUT_INVALID, 'one answer-lane receipt is required');
  }
  let serialised;
  try {
    serialised = canonicalise(run.receipt, RECEIPT_ORDER_RULES);
  } catch {
    fail(CODES.RECEIPT_NOT_PAYLOAD_FREE, 'the receipt could not be canonicalised');
  }
  return `${serialised}\n`;
}

export { SOURCE_TEXT_CORPUS_SEARCH_CONTRACT };
