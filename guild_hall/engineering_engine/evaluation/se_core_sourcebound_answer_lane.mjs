// Evaluation-only Soulforge Engineering Answer Lane.
//
// This lane answers an arbitrary natural-language question over one exact, frozen four-source
// public systems-engineering corpus. It is NOT the deterministic Engine baseline and NOT general
// open question answering. It is an ai_assisted, non-authoritative, source-bound evaluation lane.
//
// The split of responsibility is the whole point of the module:
//
//   deterministic side (here)  corpus pinning, derived-text parsing, corpus-wide retrieval,
//                             evidence selection, citation binding, output schema validation,
//                             claim ceiling, and the payload-free receipt.
//   learned side (injected)    one bounded prose renderer, and optionally one advisory query
//                             expansion that is declared shadow and never authoritative.
//
// The injected model receives only the exact question text, the selected evidence capsules, and
// a closed output policy. It receives no filesystem, network, browser, or tool access, cannot
// create a source or a citation, and cannot set the claim ceiling. This module itself performs
// no filesystem, network, write, or ERP operation, and is provider-independent: nothing here
// knows which runtime serves the model.
//
// Build provenance is Claude Code; that is not a runtime dependency and not an authority.

import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, daysInMonth } from '../kernel/canonical.mjs';
import { ContractError } from '../kernel/errors.mjs';
import {
  SOURCE_TEXT_CORPUS_SEARCH_CONTRACT,
  searchSourceTextCorpus,
} from '../../rag/source_text_index.mjs';

export const ANSWER_LANE_ID = 'soulforge.engineering_answer_lane.se_core_sourcebound.v0';
export const ANSWER_LANE_KIND = 'evaluation_only_sourcebound_answer_lane';
export const ANSWER_LANE_POLICY_REVISION = 'soulforge.se_core_sourcebound_answer_lane.v0';
export const ANSWER_SCHEMA_VERSION = 'soulforge.se_core_sourcebound_answer.v0';
export const RECEIPT_SCHEMA_VERSION = 'soulforge.se_core_sourcebound_answer_receipt.v0';
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
const MODEL_OUTPUT_FIELDS = Object.freeze(['sections']);
const MODEL_SECTION_FIELDS = Object.freeze(['heading', 'text', 'evidence_ids']);
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
  sections: 8,
  section_heading: 120,
  section_text: 4000,
  section_evidence_ids: 8,
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
const HANGUL = /[\p{Script=Hangul}]/u;
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
// Self-attributed authority, not discussion of approval as an engineering artefact. A section
// that describes what an approval record contains stays legal; a section that claims to have
// granted one does not.
const FORBIDDEN_AUTHORITY_CLAIMS = Object.freeze([
  /\b(?:canon)\s*(?:promotion|entry)\s*(?:granted|complete|approved)/iu,
  /\bowner\s+approval\s+(?:granted|complete|obtained)/iu,
  /\bI\s+(?:hereby\s+)?(?:approve|authorise|authorize|promote)\b/iu,
  /\bthis\s+(?:answer|result)\s+is\s+(?:approved|authoritative|canon|final\s+authority)\b/iu,
  /정본\s*(?:등록|승격)(?:을)?\s*(?:완료|허가|승인)/u,
  /승인(?:을)?\s*(?:완료했|부여했|허가했|합니다)/u,
  /(?:작업|과제|태스크)(?:를|을)?\s*(?:생성|등록)(?:했습니다|합니다|함)/u,
]);

// ---------------------------------------------------------------- model-block output filters
//
// These apply to model-authored headings and bodies only, never to evidence prose. That split is
// deliberate. A real systems-engineering page legitimately says "approval", "official", "page 12",
// or "rev 3"; a *rendered block* has no reason to, because every citation, source, revision, and
// page row in the answer is machine-generated from the selected evidence. So the model's own text
// is held to a much narrower vocabulary than the corpus it is grounded on, and applying the broad
// list to evidence text would refuse correct runs over the real corpus for no safety gain.
//
// What this is: a conservative *structural and forbidden-claim* filter. It refuses markup, foreign
// identifiers, contact details, paths, and self-attributed authority.
//
// What this is NOT: a semantic entailment proof. A grammatical Korean sentence that no selected
// capsule supports passes every check here. Correctness of arbitrary free text in this lane is
// UNKNOWN, is not claimed by the receipt, and cannot be inferred from a PASS result.
const MODEL_BLOCK_MARKUP = Object.freeze([
  /\*\*/u,
  /(?:^|\n)[ \t]{0,3}#{1,6}[ \t]/u,
  /(?:^|\n)[ \t]{0,3}(?:```|~~~)/u,
  /`/u,
  /\[[^\]\n]{0,300}\]\([^)\n]{0,300}\)/u,
  /&(?:#\d{1,6}|#x[0-9a-fA-F]{1,6}|[a-zA-Z]{2,12});/u,
]);
// A rendered block that names a page, an evidence id, a chunk id, a revision, a digest, or another
// source is naming a citation the lane did not bind. The citation rows are the only place any of
// those may appear, and they are generated from selected evidence rather than from prose.
const MODEL_BLOCK_IDENTIFIERS = Object.freeze([
  /\d+\s*(?:페이지|쪽|면)/u,
  /(?:^|[^A-Za-z])(?:pp?\.|pages?)\s*\d/iu,
  /(?:^|[^A-Za-z0-9_])E\d{1,4}(?![A-Za-z0-9_])/u,
  /_p\d+_c\d+/u,
  /\b[0-9a-f]{40,}\b/iu,
  /(?:^|[^A-Za-z])(?:rev|revision)\s*\.?\s*\d/iu,
  /개정\s*\d/u,
  /(?:새|다른|추가|별도|외부)\s*출처/u,
  /출처\s*[:：]/u,
  /\b(?:new|another|additional|external|outside)\s+source\b/iu,
  /\b[A-Z][A-Za-z0-9-]*\s+(?:Manual|Handbook|Standard|Guide|Specification|Spec)\b/u,
]);
// Self-attributed authority, project-use direction, and outcome claims, in the two languages this
// lane renders. Discussing approval as an engineering artefact belongs in the corpus, not in a
// block this lane publishes as its own judgement.
const MODEL_BLOCK_CLAIMS = Object.freeze([
  /(?:owner|오너|책임자)\s*(?:의\s*)?승인/iu,
  /\bowner\s+approval\b/iu,
  /승인(?:은|는|이|가|을|를|도)?\s*(?:이미\s*)?(?:완료|획득|취득|부여|허가|끝났|받았|되었|됐)/u,
  /\bapprov(?:al|als|ed|es)\b/iu,
  /\bauthoris(?:ed|ation)\b|\bauthoriz(?:ed|ation)\b/iu,
  /정본/u,
  /\bcanon(?:ical)?\b/iu,
  /\bofficial(?:ly)?\b/iu,
  /공식\s*(?:승인|자료|출처|문서|채택|입장|기록)/u,
  /실제\s*(?:프로젝트|과제|업무)\s*(?:에|적용|사용)/u,
  /\b(?:project|production)\s+use\b/iu,
  /현업\s*적용/u,
  /\bwinner\b/iu,
  /우승|최우수|1위/u,
  /(?:최종\s*)?채택(?:되었|했|합니다|됐)/u,
  /권한(?:을|이)?\s*(?:부여|승격|확대|획득)/u,
  /\bauthority\s+(?:granted|escalat)/iu,
  /\bfull\s+authority\b/iu,
]);

const ANSWER_INSTRUCTION = [
  '당신은 Soulforge 평가 전용 답변 레인의 문장 렌더러다. 아래 제공된 근거 캡슐만 사용해 한국어로 답한다.',
  '근거에 없는 사실, 새 출처, 새 페이지 번호, URL, 파일 경로는 만들지 않는다.',
  '모든 절에는 제공된 evidence_id 중 최소 하나를 evidence_ids 로 붙인다. 근거 없는 절은 쓰지 않는다.',
  '승인, 정본 등록, 작업 생성, 권한 부여를 주장하지 않는다. 판단은 관찰 수준의 외부 자문 후보다.',
  'HTML, 마크업, 코드 블록, 비밀값, 계정 정보, 로컬 경로를 출력하지 않는다.',
  'You render prose only. Citations, authority, and the claim ceiling are set outside this call.',
].join('\n');

const EXPANSION_INSTRUCTION = [
  '아래 질문을 영어 공개 자료에서 어휘 검색하기 위한 보조 검색어만 제안한다.',
  '이 출력은 자문(shadow)이며 정본 검색을 대체하지 않는다. 답변, 결론, 출처, 페이지를 쓰지 않는다.',
  'Return only short search terms. No sentence, no answer, no citation, no page number.',
].join('\n');

const OUTPUT_SCHEMA = Object.freeze({
  root: 'one plain object whose only key is sections',
  sections: 'array of 1 to 8 plain objects, in reading order',
  'sections[].heading': 'short Korean heading string',
  'sections[].text': 'Korean prose, at most 4000 characters',
  'sections[].evidence_ids': 'array of 1 to 8 evidence_id strings taken from the supplied evidence',
  forbidden: 'any other key, any new source, any page number, any URL, any file path, any HTML, '
    + 'any approval or authority claim, any claim ceiling',
});

const EXPANSION_OUTPUT_SCHEMA = Object.freeze({
  root: 'one plain object whose only key is terms',
  terms: 'array of short search-term strings',
  forbidden: 'any other key, any sentence, any citation, any page number, any answer',
});

const ANSWER_BOUNDARY_NOTE = [
  '경계: 이 답변은 고정된 4종 공개 체계공학 자료에 대한 평가 전용 source-bound 결과입니다.',
  '결정론 Engine 기준선도, 일반 개방형 QA도 아니며 문장 표현에는 로컬 학습 모델이 관여했습니다.',
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
});
const MODEL_REQUEST_ORDER_RULES = Object.freeze({ evidence: 'insertion_ordered' });

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
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
    fail(CODES.FORBIDDEN_PARTICIPANT_INPUT,
      'a path, secret, account, or runtime identifier is forbidden in public-safe metadata');
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
  // Metadata strings and rendered prose have different legitimate lengths, so the caller states
  // which bound applies rather than one cap silently truncating a real answer. An advisory term
  // list is bounded the same way: its declared ceiling is larger than the invocation's array cap,
  // and a generic cap below a declared ceiling would refuse a model that obeyed its budget.
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
          'crosswalk, rubric, gold, prior answer, and Notebook material are forbidden participant inputs');
      }
      if (FORBIDDEN_PAYLOAD_KEYS.has(lowered)) {
        fail(CODES.FORBIDDEN_PARTICIPANT_INPUT,
          'secret, account, runtime, and raw-body fields are forbidden at this boundary');
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
      || Object.getPrototypeOf(input) !== Object.prototype) {
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
      || Object.getPrototypeOf(context) !== Object.prototype || !exactKeys(context, MODEL_CONTEXT_FIELDS)) {
    fail(CODES.MODEL_ADAPTER_INVALID, 'the lane takes one closed model context with an answerModel');
  }
  const adapterSlot = ownDataSlot(context, 'answerModel');
  const answerModel = adapterSlot === null ? null : adapterSlot.value;
  if (answerModel === null || typeof answerModel !== 'object' || Array.isArray(answerModel)
      || Object.getPrototypeOf(answerModel) !== Object.prototype) {
    fail(CODES.MODEL_ADAPTER_INVALID, 'answerModel must be one plain own-data adapter object');
  }
  const composeSlot = ownDataSlot(answerModel, 'composeAnswer');
  if (composeSlot === null || typeof composeSlot.value !== 'function') {
    fail(CODES.MODEL_ADAPTER_INVALID,
      'answerModel must expose composeAnswer as one own enumerable data function');
  }
  // Optional: only a requested advisory expansion needs it. Present-but-not-own-data is still a
  // refusal, because a lane that tolerated it would call whatever the second read returned.
  const expansionSlot = ownDataSlot(answerModel, 'proposeQueryExpansion');
  if (expansionSlot === null
      ? Object.hasOwn(answerModel, 'proposeQueryExpansion')
      : typeof expansionSlot.value !== 'function') {
    fail(CODES.MODEL_ADAPTER_INVALID,
      'proposeQueryExpansion, when present, must be one own enumerable data function');
  }
  const descriptorSlot = ownDataSlot(answerModel, 'descriptor');
  const descriptor = descriptorSlot === null ? null : descriptorSlot.value;
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)
      || Object.getPrototypeOf(descriptor) !== Object.prototype
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

// ------------------------------------------------------------------ model answer validation

/**
 * Fails closed on one model-authored block, echoing nothing of what it refused.
 *
 * Every refusal message below is fixed text. The offending value is never interpolated into the
 * error, the receipt, or the log, because a refusal that quoted the refused string back would be
 * exactly the leak this check exists to prevent.
 */
function assertModelBlockSafe(value) {
  if (HTML_LIKE.test(value) || MODEL_BLOCK_MARKUP.some((pattern) => pattern.test(value))) {
    fail(CODES.OUTPUT_SAFETY_FAILED, 'the model returned markup where only prose is accepted');
  }
  if (URL_LIKE.test(value)) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'the model named a URL, which would be a source this lane never retrieved');
  }
  if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(value))) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'the model returned a path, secret, account, or runtime identifier; it is not echoed');
  }
  if (MODEL_BLOCK_IDENTIFIERS.some((pattern) => pattern.test(value))) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'the model named a source, page, revision, or evidence identifier the lane never bound');
  }
  if (FORBIDDEN_AUTHORITY_CLAIMS.some((pattern) => pattern.test(value))
      || MODEL_BLOCK_CLAIMS.some((pattern) => pattern.test(value))) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'the model claimed approval, canon, project use, or authority this lane cannot hold');
  }
}

function validateModelSections(response, allowedEvidenceIds) {
  let snapshot;
  try {
    snapshot = snapshotPlainOwnData(response, { maxString: MAX.section_text });
  } catch (error) {
    // A path, secret, or forbidden field arriving *from* the model is an output-safety failure,
    // not merely a malformed shape.
    if (error instanceof ContractError && error.code === CODES.FORBIDDEN_PARTICIPANT_INPUT) {
      fail(CODES.OUTPUT_SAFETY_FAILED,
        'the model response carries a forbidden path, secret, or field family; it is not echoed');
    }
    fail(CODES.MODEL_OUTPUT_INVALID, 'the model response is not bounded plain own data');
  }
  if (!exactKeys(snapshot, MODEL_OUTPUT_FIELDS) || !Array.isArray(snapshot.sections)
      || snapshot.sections.length === 0 || snapshot.sections.length > MAX.sections) {
    fail(CODES.MODEL_OUTPUT_INVALID,
      'the model may return only one bounded sections array and no other field');
  }
  const sections = snapshot.sections.map((section) => {
    if (!exactKeys(section, MODEL_SECTION_FIELDS)) {
      fail(CODES.MODEL_OUTPUT_INVALID, 'a model section uses one closed field set');
    }
    const { heading, text } = section;
    if (typeof heading !== 'string' || heading.trim().length === 0
        || heading.length > MAX.section_heading || heading.normalize('NFC') !== heading
        || FORBIDDEN_CONTROL.test(heading)) {
      fail(CODES.MODEL_OUTPUT_INVALID, 'a model section heading is malformed');
    }
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX.section_text
        || text.normalize('NFC') !== text || FORBIDDEN_CONTROL.test(text)) {
      fail(CODES.MODEL_OUTPUT_INVALID, 'a model section body is malformed, empty, or oversize');
    }
    for (const value of [heading, text]) assertModelBlockSafe(value);
    if (!Array.isArray(section.evidence_ids) || section.evidence_ids.length === 0
        || section.evidence_ids.length > MAX.section_evidence_ids) {
      fail(CODES.CITATION_UNBOUND,
        'every substantive block must cite between one and eight retrieved evidence ids');
    }
    const ids = [];
    for (const id of section.evidence_ids) {
      if (typeof id !== 'string' || !allowedEvidenceIds.has(id)) {
        fail(CODES.CITATION_UNBOUND,
          'a citation names an unknown or foreign evidence id outside the retrieved allowlist');
      }
      if (ids.includes(id)) {
        fail(CODES.CITATION_UNBOUND, 'a section repeats one evidence id');
      }
      ids.push(id);
    }
    return { heading: heading.trim(), text, evidence_ids: ids };
  });
  if (!sections.some((section) => HANGUL.test(section.text))) {
    fail(CODES.MODEL_OUTPUT_INVALID, 'the Korean lane requires Korean prose in the rendered answer');
  }
  return sections;
}

// ------------------------------------------------------------------ rendering and receipts

function renderAnswer({ question, sourceSet, evidence, sections }) {
  const byId = new Map(evidence.map((item) => [item.evidence_id, item]));
  const renderedSections = sections.map((section) => ({
    heading: section.heading,
    text: section.text,
    citations: section.evidence_ids.map((id) => {
      const item = byId.get(id);
      if (item === undefined) {
        fail(CODES.CITATION_UNBOUND, 'a citation could not be bound to selected evidence');
      }
      return {
        evidence_id: item.evidence_id,
        source_id: item.source_id,
        title: item.title,
        revision: item.revision,
        page_number: item.page_number,
      };
    }),
  }));
  const citedIds = new Set(renderedSections.flatMap(
    (section) => section.citations.map((citation) => citation.evidence_id),
  ));
  return {
    schema_version: ANSWER_SCHEMA_VERSION,
    lane_id: ANSWER_LANE_ID,
    lane_kind: ANSWER_LANE_KIND,
    policy_revision: ANSWER_LANE_POLICY_REVISION,
    structural_limit: STRUCTURAL_LIMIT,
    language: 'ko',
    question_sha256: question.sha256,
    question_bytes: question.bytes,
    source_set_id: sourceSet.source_set_id,
    source_set_sha256: sourceSet.source_set_sha256,
    sections: renderedSections,
    evidence: evidence
      .filter((item) => citedIds.has(item.evidence_id))
      .map((item) => ({
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
    fail(CODES.OUTPUT_SAFETY_FAILED, 'the rendered answer could not be canonicalised');
  }
  if (FORBIDDEN_STRINGS.some((pattern) => pattern.test(serialised))
      || FORBIDDEN_AUTHORITY_CLAIMS.some((pattern) => pattern.test(serialised))
      || URL_LIKE.test(serialised)
      || HTML_LIKE.test(serialised.replace(/\\u003c/gu, ''))) {
    fail(CODES.OUTPUT_SAFETY_FAILED, 'the rendered answer failed the output safety scan');
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

    const modelRequest = deepFreeze({
      policy_revision: ANSWER_LANE_POLICY_REVISION,
      language: 'ko',
      instruction: ANSWER_INSTRUCTION,
      question_text: question.text,
      evidence: evidence.map((item) => ({
        evidence_id: item.evidence_id,
        source_title: item.title,
        source_revision: item.revision,
        page_number: item.page_number,
        text: item.text,
      })),
      output_schema: { ...OUTPUT_SCHEMA },
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
    const sections = validateModelSections(
      response,
      new Set(evidence.map((item) => item.evidence_id)),
    );
    const sourceSet = {
      source_set_id: snapshot.corpus.sourceSetContract.source_set_id,
      source_set_sha256: snapshot.corpus.expectedSourceSetSha256,
    };
    const answer = renderAnswer({ question, sourceSet, evidence, sections });
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
        selected_evidence_count: evidence.length,
        uncited_section_count: 0,
        html_present: false,
        // Naming the ceiling is part of the contract. Every rendered block passed a conservative
        // structural and forbidden-claim filter; nothing here checked whether the prose follows
        // from the cited capsules, so free-text correctness stays UNKNOWN in this lane.
        free_text_verification: 'structural_and_forbidden_claim_filter_only',
        semantic_entailment_verified: false,
        free_text_correctness: 'unknown',
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
