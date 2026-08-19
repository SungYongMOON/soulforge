// The guidance layer's first half: one card per rule row, answering "why, when, what, how, who".
//
// The judgement layer (`stage_rules/`, `subjects/`) answers "is it there". It deliberately says
// nothing about how to produce what is missing, because the moment a judge starts explaining the
// work it starts deciding the work. This module is the other side of that wall: it reads the same
// compiled rows and assembles a reading of them for a person or a sub-agent, and it never changes
// a judgement, a presence state, or a requirement.
//
// Three rules give it its shape (design D47, manual 09 §9.0.2 clause 2).
//
// 1. Nothing here is written by a model. Every Korean sentence a card carries is one of the fixed
//    templates in `GUIDE_CARD_TEMPLATES`, rendered over slot values that are copied verbatim from
//    a rule row. A card therefore cannot say anything the rule table did not already say, and a
//    test can re-render every sentence from its template id and check it lands on the same bytes.
// 2. Where a row is silent the card says so. A row with no `template` reads "양식 없음" and a row
//    with no `source_refs` reads "근거 미표기". Filling either in from general knowledge would put
//    an unsourced instruction in front of somebody who has no way to tell it apart from a cited one.
// 3. Citations are locators, never text. A card carries `{source_key, locator}` pairs and, when a
//    catalogue is supplied, the title the catalogue already holds. It never carries a quotation:
//    the canonical texts are private material and a card is a pointer to them, not a copy of them.
//
// Pure: no file, clock, random source, environment value, or network. The caller owns all of that.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { CANONICAL } from '../kernel/contract_config.mjs';
import { artifactTypeEntry } from '../stage_rules/artifact_vocabulary.mjs';

export const GUIDE_CARD_SET_SCHEMA_VERSION = 'soulforge.engine_guide_card_set.v0';
export const GUIDANCE_VERSION = 'v0';

export const GUIDANCE_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'ENGINE_GUIDANCE_REQUEST_INVALID',
  INPUT_UNBOUNDED: 'ENGINE_GUIDANCE_INPUT_UNBOUNDED',
  TEMPLATE_UNKNOWN: 'ENGINE_GUIDANCE_TEMPLATE_UNKNOWN',
  TEMPLATE_SLOT_MISSING: 'ENGINE_GUIDANCE_TEMPLATE_SLOT_MISSING',
  CARD_SET_INVALID: 'ENGINE_GUIDANCE_CARD_SET_INVALID',
  ASSESSMENT_INVALID: 'ENGINE_GUIDANCE_ASSESSMENT_INVALID',
  WORK_ORDER_INVALID: 'ENGINE_GUIDANCE_WORK_ORDER_INVALID',
  CONTEXT_FILL_INVALID: 'ENGINE_GUIDANCE_CONTEXT_FILL_INVALID',
  LOCALE_UNSUPPORTED: 'ENGINE_GUIDANCE_LOCALE_UNSUPPORTED',
});

export class GuidanceError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'GuidanceError';
    this.code = code;
    this.detail = detail;
  }
}

export const guidanceFail = (code, message, detail = {}) => {
  throw new GuidanceError(code, message, detail);
};

export const MAX = Object.freeze({
  rows: 8192,
  cards: 8192,
  stages: 64,
  refs: 128,
  tokens: 256,
  instructions: 256,
  string: 2048,
  slots: 12,
});

// ---------------------------------------------------------------- fixed sentence templates
//
// The whole guidance layer's Korean prose lives here and nowhere else. A slot is written `{name}`
// and is always filled with a value copied off a rule row, a compiled count, or a vocabulary
// label — never with prose composed for the occasion.
export const GUIDE_CARD_TEMPLATES = Object.freeze({
  // --- why: what the thing is for, and what stops without it. These come first because the three
  // sentences below them answer "on whose authority" and not "what for", and a reader who only
  // gets the authority sentences learns that somebody requires the document and nothing else.
  why_purpose_stated: '목적: {purpose}',
  why_purpose_absent: '정본에 목적 문장 없음',
  why_used_by_named: '이것이 없으면 뒤의 {dependents}가 막힌다.',
  why_used_by_named_more: '이것이 없으면 뒤의 {dependents} 등 {dependent_count}건이 막힌다.',
  why_used_by_none: '이것을 입력으로 적은 뒤 항목은 규칙표에 없다.',
  why_gate_role_core: '이 검토회의가 내놓기로 되어 있는 핵심 산출물이다.',
  why_gate_role_entry: '이 검토회의에 들어가기 전에 있어야 할 진입 자료다.',
  // --- why: on whose authority
  why_evidence_regulation_mandated: '규정이 요구하는 항목이다.',
  why_evidence_guidebook_recommended: '정부 가이드북이 권고하는 항목이다.',
  why_evidence_prime_contract: '발주처(주계약사) 계약이 요구하는 항목이다.',
  why_evidence_general_se_guidance: '일반 체계공학 지침이 권고하는 항목이다.',
  why_evidence_internal_management: '내부 관리 항목이며 엔진 요구가 아니다.',
  why_evidence_unstated: '근거가 표기되지 않은 항목이다.',
  why_presence_present: '이 단계에서는 있어야 한다.',
  why_presence_present_or_not_applicable: '이 단계에서는 있거나, 근거를 들어 해당 없음이라고 답해야 한다.',
  why_presence_optional_context: '요구가 아니라 맥락으로 둔다.',
  why_node_activity: '문서가 아니라 수행해야 할 일이며, 증거는 그 일이 남긴 기록이다.',
  why_node_decision: '문서가 아니라 확정해야 할 상태이며, 증거는 그 확정을 남긴 기록이다.',
  why_source_absent: '근거 미표기 — 이 행에는 정본 인용이 없다.',
  why_verification_status: '정본 대조 결과는 {verification_status}다.',
  why_se_floor: '일반 SE 기준선에서의 위치는 {se_floor}다.',
  // --- when
  when_stage_only: '{stage_code} 단계에서 기대된다.',
  when_stage_with_inputs: '{stage_code} 단계에서 기대되며, 같은 게이트 입력 {same_stage}건·앞 게이트 입력 {earlier_stage}건이 있다.',
  when_maturity_absent: '기대 성숙도 미표기',
  // --- how
  how_template_stated: '양식: {template}',
  how_template_absent: '양식 없음',
  how_template_library_found: '양식 파일이 라이브러리에 있다: {template_ref}',
  how_template_library_found_versioned: '양식 파일이 라이브러리에 있다: {template_ref} ({template_version})',
  how_template_library_absent: '양식 파일이 라이브러리에 없다',
  how_template_library_unknown: '양식 라이브러리 미조회',
  how_inputs_none: '선행 입력 없음',
  how_inputs_listed: '선행 입력 {input_count}건이 먼저 있어야 한다.',
  how_inputs_state: '선행 입력 {input_count}건 — 있음 {present_count} · 없음 {absent_count} · 불명 {unknown_count}.',
  how_method_absent: '근거 미표기',
  how_method_listed: '근거 인용 {ref_count}건이 이 행에 붙어 있다.',
  how_method_family: '{family_label} {ref_count}건',
  // --- who
  who_capability: '기본 담당 capability는 {capability}다.',
  who_capability_absent: '기본 담당 capability 미지정',
});

const SLOT_PATTERN = /\{([a-z_]+)\}/gu;

/** Renders one fixed template over its slots. Unknown template or missing slot is a refusal. */
export function renderGuidanceTemplate(templateId, slots = {}) {
  const template = Object.hasOwn(GUIDE_CARD_TEMPLATES, templateId)
    ? GUIDE_CARD_TEMPLATES[templateId] : undefined;
  if (typeof template !== 'string') {
    guidanceFail(GUIDANCE_ERROR_CODES.TEMPLATE_UNKNOWN, 'guidance template id is not declared',
      { template_id: templateId });
  }
  return template.replace(SLOT_PATTERN, (_match, name) => {
    if (!Object.hasOwn(slots, name)) {
      guidanceFail(GUIDANCE_ERROR_CODES.TEMPLATE_SLOT_MISSING, 'guidance template slot has no value',
        { template_id: templateId, slot: name });
    }
    return String(slots[name]);
  });
}

/** One traceable sentence: the template it came from, its slot values, and the rendered text. */
export function guidanceSentence(templateId, slots = {}) {
  const keys = Object.keys(slots);
  if (keys.length > MAX.slots) {
    guidanceFail(GUIDANCE_ERROR_CODES.INPUT_UNBOUNDED, 'a guidance sentence declares too many slots',
      { template_id: templateId });
  }
  const ordered = {};
  for (const key of [...keys].sort(compareCodePoints)) ordered[key] = slots[key];
  return { template_id: templateId, text_ko: renderGuidanceTemplate(templateId, ordered), slots: ordered };
}

// ---------------------------------------------------------------- shape assertions

export function assertPlainObject(value, where, code = GUIDANCE_ERROR_CODES.REQUEST_INVALID) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    guidanceFail(code, 'a plain object was expected', { where });
  }
  return value;
}

export function assertExactKeys(value, required, optional, where, code = GUIDANCE_ERROR_CODES.REQUEST_INVALID) {
  assertPlainObject(value, where, code);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) guidanceFail(code, 'a required field is missing', { where, field: key });
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) guidanceFail(code, 'an unexpected field was supplied', { where, field: key });
  }
  return value;
}

export function assertArray(value, where, max, code = GUIDANCE_ERROR_CODES.REQUEST_INVALID) {
  if (!Array.isArray(value)) guidanceFail(code, 'an array was expected', { where });
  if (value.length > max) {
    guidanceFail(GUIDANCE_ERROR_CODES.INPUT_UNBOUNDED, 'an input array exceeds its declared limit',
      { where, limit: max });
  }
  return value;
}

export function assertSafeString(value, where, code = GUIDANCE_ERROR_CODES.REQUEST_INVALID) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
    || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    guidanceFail(code, 'a bounded non-empty NFC string without control characters was expected', { where });
  }
  return value;
}

// ---------------------------------------------------------------- canonical digests

const sha256Hex = (input) => createHash(CANONICAL.hashAlgorithm).update(input).digest('hex');

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === 'object') {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

// The canonical layer forbids null; the guidance outputs use it for "this row said nothing here",
// which reads better in a card a human opens. The digest is taken over the same structure with
// those keys omitted, exactly as the stage rule compiler does.
function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) out[key] = withoutNulls(child);
    }
    return out;
  }
  return value;
}

export function guidanceDigest(domain, value) {
  const projected = withoutNulls(value);
  let canonical;
  try {
    canonical = canonicalise(projected, arrayOrderRules(projected));
  } catch (error) {
    return guidanceFail(GUIDANCE_ERROR_CODES.REQUEST_INVALID,
      'guidance material is not canonically serialisable',
      { domain, contract_code: error?.code ?? null });
  }
  return sha256Hex(`${domain}\n${canonical}`);
}

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// A content-derived handle, not a minted identifier. Guidance is computed in parallel with other
// work and the engine's minting boundary is serialised (`kernel/minting.mjs`), so a card is
// addressed by what it is made of; two callers holding the same rows get the same handle.
export const cardHandle = (digest) => `guide-${digest.slice(0, 32)}`;

export const ZERO_EFFECTS = Object.freeze({
  erp_writes: 0,
  filesystem_writes: 0,
  model_calls: 0,
  network_calls: 0,
  clock_reads: 0,
});

// ---------------------------------------------------------------- declared vocabularies

const EVIDENCE_TEMPLATE = Object.freeze({
  regulation_mandated: 'why_evidence_regulation_mandated',
  guidebook_recommended: 'why_evidence_guidebook_recommended',
  prime_contract: 'why_evidence_prime_contract',
  general_se_guidance: 'why_evidence_general_se_guidance',
  internal_management: 'why_evidence_internal_management',
  unstated: 'why_evidence_unstated',
});

const PRESENCE_TEMPLATE = Object.freeze({
  present: 'why_presence_present',
  present_or_not_applicable: 'why_presence_present_or_not_applicable',
  optional_context: 'why_presence_optional_context',
});

const NODE_KIND_TEMPLATE = Object.freeze({
  activity: 'why_node_activity',
  decision: 'why_node_decision',
});

// What the row is to the gate it sits in (compiler `gate_role`, manual 02 §2.7). `supporting` is
// the default and the canon says nothing about it, so it gets no sentence.
const GATE_ROLE_TEMPLATE = Object.freeze({
  core: 'why_gate_role_core',
  entry: 'why_gate_role_entry',
});

// How many later items a card names before it stops naming them. Past three the sentence stops
// being a reason and becomes a list, and the structured `used_by` carries the rest anyway.
const USED_BY_NAMED_LIMIT = 3;

// The observation the work order recorded for an input token, said the way a person reads it.
// `unobserved` and `unknown` both land on 불명 on purpose: "nobody looked" and "somebody looked and
// could not tell" are both "we do not know", and the raw state stays on the input for whoever
// needs the difference.
const INPUT_STATE_BY_OBSERVATION = Object.freeze({
  present: 'present',
  absence_confirmed: 'absent',
  unknown: 'unknown',
  unobserved: 'unknown',
});

// Display vocabulary for the source families a citation can belong to. The family itself is not
// decided here — it arrives on the source catalogue entry, because which family a canonical text
// belongs to is a fact about that text and not about this renderer.
export const SOURCE_FAMILIES = Object.freeze(['regulation', 'guidebook', 'practice_guide', 'general_se',
  'prime_contract', 'unknown']);
const SOURCE_FAMILY_LABEL_KO = Object.freeze({
  regulation: '규정',
  guidebook: '가이드북',
  practice_guide: '실무지침서',
  general_se: '일반SE',
  prime_contract: '발주처 계약',
  unknown: '출처 계열 미표기',
});
const SOURCE_FAMILY_RANK = Object.freeze(
  Object.fromEntries(SOURCE_FAMILIES.map((family, index) => [family, index])),
);

const REQUEST_FIELDS = Object.freeze(['compile_result', 'vocabulary']);
const REQUEST_OPTIONAL_FIELDS = Object.freeze(['compiled_variant', 'source_catalog', 'work_order',
  'template_library']);
const VOCABULARY_FIELDS = Object.freeze(['artifact_type_id', 'family', 'label_ko', 'label_en', 'capability_default']);
const CATALOGUE_ENTRY_REQUIRED = Object.freeze(['source_key']);
const CATALOGUE_ENTRY_OPTIONAL = Object.freeze(['title', 'edition', 'locator_kind', 'source_family']);
const TEMPLATE_LIBRARY_FIELDS = Object.freeze(['library_id', 'entries']);
const TEMPLATE_LIBRARY_ENTRY_REQUIRED = Object.freeze(['template_ref']);
const TEMPLATE_LIBRARY_ENTRY_OPTIONAL = Object.freeze(['artifact_type_id', 'name', 'term', 'version']);

// ---------------------------------------------------------------- input readers

function vocabularyIndex(vocabulary) {
  const rows = assertArray(vocabulary, 'request.vocabulary', MAX.rows);
  const index = new Map();
  rows.forEach((row, position) => {
    const where = `request.vocabulary[${position}]`;
    assertExactKeys(row, VOCABULARY_FIELDS, [], where);
    assertSafeString(row.artifact_type_id, `${where}.artifact_type_id`);
    index.set(row.artifact_type_id, row);
  });
  return index;
}

function sourceCatalogueIndex(catalogue) {
  if (catalogue === null || catalogue === undefined) return null;
  assertExactKeys(catalogue, ['sources'], ['schema_version', 'catalog_id'], 'request.source_catalog');
  const rows = assertArray(catalogue.sources, 'request.source_catalog.sources', MAX.rows);
  const index = new Map();
  rows.forEach((row, position) => {
    const where = `request.source_catalog.sources[${position}]`;
    assertExactKeys(row, CATALOGUE_ENTRY_REQUIRED, CATALOGUE_ENTRY_OPTIONAL, where);
    assertSafeString(row.source_key, `${where}.source_key`);
    for (const field of CATALOGUE_ENTRY_OPTIONAL) {
      if (row[field] !== undefined && row[field] !== null) assertSafeString(row[field], `${where}.${field}`);
    }
    if (row.source_family !== undefined && row.source_family !== null
      && !SOURCE_FAMILIES.includes(row.source_family)) {
      guidanceFail(GUIDANCE_ERROR_CODES.REQUEST_INVALID, 'a source family is not one of the declared families',
        { where: `${where}.source_family`, declared: [...SOURCE_FAMILIES] });
    }
    index.set(row.source_key, row);
  });
  return index;
}

// A form the project already holds, addressed the way the library addresses it. The reference is
// required to be relative: the library lives in a private worksite and its absolute location is
// the caller's business, so a card carries a path inside the library and never the path to it.
function templateLibraryIndex(library) {
  if (library === null || library === undefined) return null;
  assertExactKeys(library, TEMPLATE_LIBRARY_FIELDS, [], 'request.template_library');
  assertSafeString(library.library_id, 'request.template_library.library_id');
  const rows = assertArray(library.entries, 'request.template_library.entries', MAX.rows);
  const byToken = new Map();
  const byName = new Map();
  const byTerm = new Map();
  rows.forEach((row, position) => {
    const where = `request.template_library.entries[${position}]`;
    assertExactKeys(row, TEMPLATE_LIBRARY_ENTRY_REQUIRED, TEMPLATE_LIBRARY_ENTRY_OPTIONAL, where);
    assertSafeString(row.template_ref, `${where}.template_ref`);
    if (/^(?:[A-Za-z]:|[\\/])/u.test(row.template_ref) || row.template_ref.split(/[\\/]/u).includes('..')) {
      guidanceFail(GUIDANCE_ERROR_CODES.REQUEST_INVALID,
        'a template reference must be relative to the library root and must not climb out of it',
        { where: `${where}.template_ref` });
    }
    for (const field of TEMPLATE_LIBRARY_ENTRY_OPTIONAL) {
      if (row[field] !== undefined && row[field] !== null) assertSafeString(row[field], `${where}.${field}`);
    }
    const entry = {
      library_id: library.library_id,
      artifact_type_id: row.artifact_type_id ?? null,
      name: row.name ?? null,
      term: row.term ?? null,
      template_ref: row.template_ref,
      version: row.version ?? null,
    };
    // First writer wins in every map, so a library listing two forms for one artifact resolves the
    // same way on every run rather than by whichever entry happened to be read last.
    if (entry.artifact_type_id !== null && !byToken.has(entry.artifact_type_id)) {
      byToken.set(entry.artifact_type_id, entry);
    }
    if (entry.name !== null && !byName.has(entry.name)) byName.set(entry.name, entry);
    if (entry.term !== null && !byTerm.has(entry.term)) byTerm.set(entry.term, entry);
  });
  return { library_id: library.library_id, byToken, byName, byTerm, size: rows.length };
}

/** Token, then spec row name, then term — most specific match first, and the match kind is kept. */
function lookupTemplate(library, token, specRow) {
  if (library === null) return { looked_up: false, found: false, match_kind: null, entry: null };
  const attempts = [
    ['artifact_type_id', library.byToken.get(token) ?? null],
    ['name', specRow?.name === undefined || specRow?.name === null ? null : library.byName.get(specRow.name) ?? null],
    ['term', specRow?.term === undefined || specRow?.term === null ? null : library.byTerm.get(specRow.term) ?? null],
  ];
  for (const [matchKind, entry] of attempts) {
    if (entry !== null) return { looked_up: true, found: true, match_kind: matchKind, entry };
  }
  return { looked_up: true, found: false, match_kind: null, entry: null };
}

// (stage_code, task_id) -> the spec row the compiler graded. The mapping table keeps the grade and
// the edges; `desc`, `name`, `term`, `template` and `verification_status` stay on the spec, so a
// card that wants to say what the thing is has to read the spec the compile came from.
function specRowIndex(compiledVariant) {
  if (compiledVariant === null || compiledVariant === undefined) return null;
  assertPlainObject(compiledVariant, 'request.compiled_variant');
  const gates = assertArray(compiledVariant.gates, 'request.compiled_variant.gates', MAX.stages);
  const index = new Map();
  gates.forEach((gate, gateIndex) => {
    const where = `request.compiled_variant.gates[${gateIndex}]`;
    assertPlainObject(gate, where);
    const tasks = assertArray(gate.tasks, `${where}.tasks`, MAX.rows);
    for (const task of tasks) index.set(`${gate.code}\u001f${task.id}`, task);
  });
  return index;
}

function workOrderIndex(workOrder) {
  if (workOrder === null || workOrder === undefined) return null;
  assertPlainObject(workOrder, 'request.work_order', GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
  const stages = assertArray(workOrder.stages, 'request.work_order.stages', MAX.stages,
    GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
  const index = new Map();
  for (const stage of stages) {
    assertPlainObject(stage, 'request.work_order.stages[]', GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
    const items = assertArray(stage.work_items, 'request.work_order.stages[].work_items', MAX.rows,
      GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
    for (const item of items) index.set(`${stage.stage_code}\u001f${item.artifact_type_id}`, item);
  }
  return index;
}

// ---------------------------------------------------------------- card assembly

const labelOf = (token, vocabulary) => {
  const supplied = vocabulary.get(token);
  if (supplied !== undefined) return supplied;
  return artifactTypeEntry(token);
};

const tokenLabel = (token, vocabulary) => {
  const entry = labelOf(token, vocabulary);
  return {
    artifact_type_id: token,
    label_ko: entry === null ? null : entry.label_ko,
  };
};

function citationsOf(row, catalogue) {
  const refs = [];
  const seen = new Set();
  const push = (ref, refKind) => {
    const key = `${refKind}\u001f${ref.source_key}\u001f${ref.locator}`;
    if (seen.has(key)) return;
    seen.add(key);
    const known = catalogue === null ? null : catalogue.get(ref.source_key) ?? null;
    refs.push({
      ref_kind: refKind,
      source_key: ref.source_key,
      locator: ref.locator,
      catalog_known: catalogue === null ? null : known !== null,
      title: known?.title ?? null,
      edition: known?.edition ?? null,
      source_family: known?.source_family ?? null,
    });
  };
  for (const ref of row.source_refs ?? []) push(ref, 'row');
  for (const ref of row.depends_on_refs ?? []) push(ref, 'dependency');
  return refs;
}

// The purpose the canonical text itself states for this artifact, carried on the spec row as
// `purpose_ko` with its own locators (`purpose_refs`). It is extracted at spec-authoring time by a
// reader from the canon's own description of the product, exactly the way `desc` and the citations
// were (manual 03 §3.10); this module copies it and never composes one. Where the canon says
// nothing, the card says so rather than filling the gap from general knowledge.
function purposeOf(specRow) {
  const stated = specRow ?? null;
  const text = typeof stated?.purpose_ko === 'string' && stated.purpose_ko.length > 0
    ? stated.purpose_ko : null;
  const refs = text === null ? [] : (stated?.purpose_refs ?? []).map((ref) => ({
    source_key: ref.source_key, locator: ref.locator,
  }));
  return {
    stated: text !== null,
    purpose_ko: text,
    purpose_refs: refs,
    note: text === null
      ? guidanceSentence('why_purpose_absent')
      : guidanceSentence('why_purpose_stated', { purpose: text }),
  };
}

// Which later rows named this artifact as an input. This is the reason a person actually needs:
// not "a rule requires it" but "these are the things that cannot start until it exists". The
// relation is computed from the rule table's own edges, so it says nothing the table did not say.
function usedBySentence(usedBy) {
  if (usedBy.length === 0) return guidanceSentence('why_used_by_none');
  const named = usedBy.slice(0, USED_BY_NAMED_LIMIT)
    .map((row) => row.label_ko ?? row.artifact_type_id)
    .join('·');
  return usedBy.length <= USED_BY_NAMED_LIMIT
    ? guidanceSentence('why_used_by_named', { dependents: named })
    : guidanceSentence('why_used_by_named_more', { dependents: named, dependent_count: usedBy.length });
}

function whySentences(row, specRow, purpose, usedBy) {
  const why = [];
  why.push({ ...purpose.note, source_refs: purpose.purpose_refs.map((ref) => ({ ...ref })) });
  why.push({ ...usedBySentence(usedBy), source_refs: [] });
  const gateRoleTemplate = GATE_ROLE_TEMPLATE[row.gate_role];
  if (gateRoleTemplate !== undefined) why.push({ ...guidanceSentence(gateRoleTemplate), source_refs: [] });
  const evidenceTemplate = EVIDENCE_TEMPLATE[row.evidence_level] ?? 'why_evidence_unstated';
  why.push({ ...guidanceSentence(evidenceTemplate), source_refs: (row.source_refs ?? []).map((ref) => ({ ...ref })) });
  const presenceTemplate = PRESENCE_TEMPLATE[row.minimum_presence_rule];
  if (presenceTemplate !== undefined) why.push({ ...guidanceSentence(presenceTemplate), source_refs: [] });
  const nodeTemplate = NODE_KIND_TEMPLATE[row.node_kind];
  if (nodeTemplate !== undefined) why.push({ ...guidanceSentence(nodeTemplate), source_refs: [] });
  if ((row.source_refs ?? []).length === 0) {
    why.push({ ...guidanceSentence('why_source_absent'), source_refs: [] });
  }
  const verification = specRow?.verification_status ?? null;
  if (verification !== null) {
    why.push({
      ...guidanceSentence('why_verification_status', { verification_status: verification }),
      source_refs: [],
    });
  }
  if (row.se_floor !== null && row.se_floor !== undefined) {
    why.push({ ...guidanceSentence('why_se_floor', { se_floor: row.se_floor }), source_refs: [] });
  }
  return why;
}

function howBlock(row, specRow, workItem, producesFor, vocabulary, templateMatch, observationByToken, catalogue) {
  const templateValue = specRow?.template ?? null;
  // The 체계개발 spec writes "없음" where a row has no form. Treating that as a stated form would
  // put the word 없음 in the 양식 line of an instruction, which reads as a form called "없음".
  const templateStated = typeof templateValue === 'string' && templateValue.length > 0
    && templateValue !== '없음';
  const inputs = (row.depends_on ?? []).map((token) => {
    const resolution = row.dependency_resolution ?? { in_scope: [], out_of_scope: [], unresolved: [] };
    const scope = (resolution.in_scope ?? []).includes(token) ? 'in_scope'
      : (resolution.out_of_scope ?? []).includes(token) ? 'out_of_scope' : 'unresolved';
    // What the eye said about this input, if anybody supplied observations. An input nobody looked
    // at is 불명 and never 없음: the difference is whether somebody looked, and this layer is not
    // the one that decides that.
    const observationState = observationByToken.get(token) ?? null;
    return {
      ...tokenLabel(token, vocabulary),
      scope,
      observation_state: observationState,
      input_state: observationState === null ? 'unknown'
        : INPUT_STATE_BY_OBSERVATION[observationState] ?? 'unknown',
    };
  });
  const stateCounts = { present: 0, absent: 0, unknown: 0 };
  for (const input of inputs) stateCounts[input.input_state] += 1;
  const methodRefs = [];
  if ((row.source_refs ?? []).length > 0) {
    methodRefs.push({
      ref_kind: 'row',
      evidence_level: row.evidence_level,
      source_refs: row.source_refs.map((ref) => ({ ...ref })),
    });
  }
  if ((row.depends_on_refs ?? []).length > 0) {
    methodRefs.push({
      ref_kind: 'dependency',
      evidence_level: row.depends_on_evidence ?? 'unstated',
      source_refs: row.depends_on_refs.map((ref) => ({ ...ref })),
    });
  }
  const refCount = methodRefs.reduce((total, entry) => total + entry.source_refs.length, 0);
  // The same citations again, grouped by which canonical family they come from, because "규정 2건 ·
  // 가이드북 3건" is the shape of "how do I do this properly" and a flat locator list is not. The
  // family is whatever the catalogue said; with no catalogue every citation is honestly `unknown`.
  const familyOf = (sourceKey) => (catalogue === null ? 'unknown'
    : catalogue.get(sourceKey)?.source_family ?? 'unknown');
  const families = new Map();
  for (const entry of methodRefs) {
    for (const ref of entry.source_refs) {
      const family = familyOf(ref.source_key);
      if (!families.has(family)) families.set(family, []);
      families.get(family).push({ ...ref, ref_kind: entry.ref_kind, evidence_level: entry.evidence_level });
    }
  }
  const methodFamilies = [...families.entries()]
    .sort((left, right) => (SOURCE_FAMILY_RANK[left[0]] ?? 9) - (SOURCE_FAMILY_RANK[right[0]] ?? 9))
    .map(([family, refs]) => ({
      family,
      label_ko: SOURCE_FAMILY_LABEL_KO[family] ?? SOURCE_FAMILY_LABEL_KO.unknown,
      ref_count: refs.length,
      source_refs: refs,
      note: guidanceSentence('how_method_family', {
        family_label: SOURCE_FAMILY_LABEL_KO[family] ?? SOURCE_FAMILY_LABEL_KO.unknown,
        ref_count: refs.length,
      }),
    }));
  const libraryNote = () => {
    if (!templateMatch.looked_up) return guidanceSentence('how_template_library_unknown');
    if (!templateMatch.found) return guidanceSentence('how_template_library_absent');
    return templateMatch.entry.version === null
      ? guidanceSentence('how_template_library_found', { template_ref: templateMatch.entry.template_ref })
      : guidanceSentence('how_template_library_found_versioned', {
        template_ref: templateMatch.entry.template_ref, template_version: templateMatch.entry.version,
      });
  };
  return {
    template: {
      stated: templateStated,
      value: templateStated ? templateValue : null,
      note: templateStated
        ? guidanceSentence('how_template_stated', { template: templateValue })
        : guidanceSentence('how_template_absent'),
      // The form the spec names is a locator into a canonical text ("p.131 (서식)"); this is the
      // file the project actually holds, if the caller pointed at a template library.
      library: {
        looked_up: templateMatch.looked_up,
        found: templateMatch.found,
        match_kind: templateMatch.match_kind,
        library_id: templateMatch.entry?.library_id ?? null,
        template_ref: templateMatch.entry?.template_ref ?? null,
        version: templateMatch.entry?.version ?? null,
        note: libraryNote(),
      },
    },
    inputs,
    inputs_note: inputs.length === 0
      ? guidanceSentence('how_inputs_none')
      : guidanceSentence('how_inputs_listed', { input_count: inputs.length }),
    input_state_counts: { ...stateCounts },
    input_state_note: inputs.length === 0 ? null : guidanceSentence('how_inputs_state', {
      input_count: inputs.length,
      present_count: stateCounts.present,
      absent_count: stateCounts.absent,
      unknown_count: stateCounts.unknown,
    }),
    produces_for: producesFor,
    method_refs: methodRefs,
    method_families: methodFamilies,
    method_note: refCount === 0
      ? guidanceSentence('how_method_absent')
      : guidanceSentence('how_method_listed', { ref_count: refCount }),
    same_stage_inputs: workItem === null ? [] : [...(workItem.same_stage_inputs ?? [])],
    earlier_stage_inputs: workItem === null ? [] : [...(workItem.earlier_stage_inputs ?? [])],
  };
}

/**
 * One guide card per rule row that the engine either requires or that names work rather than a
 * document, assembled from the compiled rows and the spec they came from.
 *
 * @param request `{compile_result, vocabulary, compiled_variant?, source_catalog?, work_order?}`
 * @returns `{schema_version, cards, receipt}` deeply frozen
 */
export function buildGuideCards(request) {
  assertExactKeys(request, REQUEST_FIELDS, REQUEST_OPTIONAL_FIELDS, 'request');
  const compileResult = assertPlainObject(request.compile_result, 'request.compile_result');
  const mappingTable = assertArray(compileResult.mapping_table, 'request.compile_result.mapping_table', MAX.rows);
  const vocabulary = vocabularyIndex(request.vocabulary);
  const catalogue = sourceCatalogueIndex(request.source_catalog ?? null);
  const specRows = specRowIndex(request.compiled_variant ?? null);
  const workItems = workOrderIndex(request.work_order ?? null);
  const templateLibrary = templateLibraryIndex(request.template_library ?? null);

  // What the eye saw, by token rather than by (stage, token): an input usually lives in an earlier
  // gate than the row that needs it, and its observation is a fact about the artifact, not about
  // the gate the question was asked from.
  const observationByToken = new Map();
  for (const stage of request.work_order?.stages ?? []) {
    for (const item of stage.work_items ?? []) {
      if (!observationByToken.has(item.artifact_type_id) && item.observation_state !== undefined) {
        observationByToken.set(item.artifact_type_id, item.observation_state);
      }
    }
  }

  const stageSequence = new Map();
  const declarations = compileResult.needs_stage_declarations?.stages ?? [];
  for (const stage of assertArray(declarations, 'request.compile_result.needs_stage_declarations.stages', MAX.stages)) {
    stageSequence.set(stage.stage_code, stage.sequence);
  }
  // An engine stage code is the gate code, zero-padded to three digits, followed by the gate name
  // (`030_SRR`). Keying the spec rows off that prefix lets this module find the row a mapping entry
  // came from without restating the compiler's gate table.
  const gateCodeByPrefix = new Map();
  if (specRows !== null) {
    for (const gate of request.compiled_variant.gates) {
      gateCodeByPrefix.set(String(gate.code).padStart(3, '0'), gate.code);
    }
  }

  // Which rows name this token as an input. A card says both what it needs and what needs it,
  // because "why am I doing this now" is usually answered by the second one.
  const producesFor = new Map();
  for (const row of mappingTable) {
    for (const token of row.depends_on ?? []) {
      if (!producesFor.has(token)) producesFor.set(token, new Map());
      producesFor.get(token).set(`${row.stage_code}\u001f${row.artifact_type_id}`, {
        stage_code: row.stage_code,
        artifact_type_id: row.artifact_type_id,
      });
    }
  }

  // One card per (stage, artifact type). Two rows can share a pair — the overlay may add beside a
  // standard row — so the group is folded the way the compiler folds it: the row bound to an
  // engine requirement speaks, failing that the first in table order.
  const groups = new Map();
  for (const row of mappingTable) {
    const key = `${row.stage_code}\u001f${row.artifact_type_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const counts = {
    cards: 0,
    engine_requirement_cards: 0,
    context_node_cards: 0,
    by_node_kind: { artifact: 0, activity: 0, decision: 0 },
    cards_without_template: 0,
    cards_without_source: 0,
    cards_with_unresolved_input: 0,
    cards_with_purpose: 0,
    cards_without_purpose: 0,
    cards_with_used_by: 0,
    cards_with_template_ref: 0,
    template_library_lookups: 0,
    by_gate_role: { core: 0, entry: 0, supporting: 0 },
    citations: 0,
    citations_unknown_source: 0,
    citations_unknown_family: 0,
    skipped_context_rows: 0,
  };

  const cards = [];
  for (const [key, rows] of groups) {
    const governing = rows.find((row) => row.engine_requirement_id !== null && row.engine_requirement_id !== undefined)
      ?? rows[0];
    const nodeKind = governing.node_kind ?? 'artifact';
    const isEngineRequirement = governing.engine_requirement_id !== null
      && governing.engine_requirement_id !== undefined;
    // Engine requirements get a card because somebody has to produce them. Activity and decision
    // rows get one even when they stayed context, because they are the rows that say what work
    // has to happen, and a checklist that hides them reads as documents-only again.
    if (!isEngineRequirement && nodeKind === 'artifact') {
      counts.skipped_context_rows += 1;
      continue;
    }
    const [stageCode] = key.split('\u001f');
    const gateCode = gateCodeByPrefix.get(stageCode.slice(0, 3)) ?? null;
    const specRow = specRows === null || governing.task_id === null || governing.task_id === undefined
      ? null : specRows.get(`${gateCode}\u001f${governing.task_id}`) ?? null;
    const entry = labelOf(governing.artifact_type_id, vocabulary);
    const workItem = workItems === null ? null : workItems.get(key) ?? null;
    const dependents = [...(producesFor.get(governing.artifact_type_id)?.values() ?? [])]
      .map((row) => ({ ...row, ...tokenLabel(row.artifact_type_id, vocabulary) }))
      .sort((left, right) => compareCodePoints(
        `${left.stage_code}\u001f${left.artifact_type_id}`,
        `${right.stage_code}\u001f${right.artifact_type_id}`,
      ));

    // Only what comes after this row: a later item that names this artifact as an input is the
    // thing that stops without it. An item in an earlier gate that happens to name it is a forward
    // edge and not a consequence of this row being missing.
    const ownSequence = stageSequence.get(stageCode) ?? 0;
    const usedBy = dependents.filter((row) => (stageSequence.get(row.stage_code) ?? 0) >= ownSequence
      && !(row.stage_code === stageCode && row.artifact_type_id === governing.artifact_type_id));
    const templateMatch = lookupTemplate(templateLibrary, governing.artifact_type_id, specRow);
    const purpose = purposeOf(specRow);
    const how = howBlock(governing, specRow, workItem, dependents, vocabulary, templateMatch,
      observationByToken, catalogue);
    const why = whySentences(governing, specRow, purpose, usedBy);
    const citations = citationsOf(governing, catalogue);
    const maturity = governing.maturity ?? null;
    const sameStage = how.same_stage_inputs.length;
    const earlierStage = how.earlier_stage_inputs.length;

    const body = {
      stage_code: stageCode,
      stage_sequence: stageSequence.get(stageCode) ?? null,
      artifact_type_id: governing.artifact_type_id,
      node_kind: nodeKind,
      is_virtual: governing.is_virtual === true,
      engine_requirement_id: isEngineRequirement ? governing.engine_requirement_id : null,
      alias: governing.alias ?? null,
      gate_role: governing.gate_role ?? null,
      title_ko: entry === null ? null : entry.label_ko,
      title_en: entry === null ? null : entry.label_en,
      purpose: {
        stated: purpose.stated,
        purpose_ko: purpose.purpose_ko,
        purpose_refs: purpose.purpose_refs,
      },
      used_by: usedBy.map((row) => ({ ...row })),
      why,
      when: {
        stage_code: stageCode,
        stage_sequence: stageSequence.get(stageCode) ?? null,
        maturity_expected: maturity,
        maturity_note: maturity === null ? guidanceSentence('when_maturity_absent') : null,
        stage_sequence_note: workItem === null
          ? guidanceSentence('when_stage_only', { stage_code: stageCode })
          : guidanceSentence('when_stage_with_inputs', {
            stage_code: stageCode, same_stage: sameStage, earlier_stage: earlierStage,
          }),
      },
      what: {
        name: specRow?.name ?? null,
        term: specRow?.term ?? null,
        desc: specRow?.desc ?? null,
        evidence_record: [...(governing.evidence_record ?? [])]
          .map((token) => tokenLabel(token, vocabulary)),
      },
      how,
      who: {
        capability_default: entry === null ? null : entry.capability_default,
        note: entry === null
          ? guidanceSentence('who_capability_absent')
          : guidanceSentence('who_capability', { capability: entry.capability_default }),
      },
      evidence: {
        evidence_level: governing.evidence_level,
        verification_status: specRow?.verification_status ?? null,
        se_floor: governing.se_floor ?? null,
        minimum_presence_rule: governing.minimum_presence_rule,
      },
      citations,
    };
    const card = { card_id: cardHandle(guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.card`, body)), ...body };
    cards.push(card);

    counts.cards += 1;
    if (isEngineRequirement) counts.engine_requirement_cards += 1; else counts.context_node_cards += 1;
    if (Object.hasOwn(counts.by_node_kind, nodeKind)) counts.by_node_kind[nodeKind] += 1;
    if (!how.template.stated) counts.cards_without_template += 1;
    if (citations.length === 0) counts.cards_without_source += 1;
    if (how.inputs.some((input) => input.scope === 'unresolved')) counts.cards_with_unresolved_input += 1;
    if (purpose.stated) counts.cards_with_purpose += 1; else counts.cards_without_purpose += 1;
    if (usedBy.length > 0) counts.cards_with_used_by += 1;
    if (templateMatch.looked_up) counts.template_library_lookups += 1;
    if (templateMatch.found) counts.cards_with_template_ref += 1;
    if (Object.hasOwn(counts.by_gate_role, body.gate_role)) counts.by_gate_role[body.gate_role] += 1;
    counts.citations += citations.length;
    counts.citations_unknown_source += citations.filter((ref) => ref.catalog_known === false).length;
    counts.citations_unknown_family += how.method_families
      .filter((family) => family.family === 'unknown')
      .reduce((total, family) => total + family.ref_count, 0);
  }

  cards.sort((left, right) => compareCodePoints(
    `${String(left.stage_sequence ?? 0).padStart(6, '0')}\u001f${left.stage_code}\u001f${left.artifact_type_id}`,
    `${String(right.stage_sequence ?? 0).padStart(6, '0')}\u001f${right.stage_code}\u001f${right.artifact_type_id}`,
  ));

  if (cards.length > MAX.cards) {
    guidanceFail(GUIDANCE_ERROR_CODES.INPUT_UNBOUNDED, 'the compile result yields more cards than the declared limit',
      { limit: MAX.cards });
  }

  const receipt = {
    schema_version: GUIDE_CARD_SET_SCHEMA_VERSION,
    guidance_version: GUIDANCE_VERSION,
    deterministic: true,
    claim_ceiling: 'observed',
    judgment_changed: false,
    template_ids: Object.keys(GUIDE_CARD_TEMPLATES).sort(compareCodePoints),
    template_library_id: templateLibrary === null ? null : templateLibrary.library_id,
    source_families: [...SOURCE_FAMILIES],
    input_digests: {
      mapping_table: guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.mapping_table`, mappingTable),
      compiled_variant: specRows === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.compiled_variant`, request.compiled_variant),
      work_order: workItems === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.work_order`, request.work_order),
      source_catalog: catalogue === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.source_catalog`, request.source_catalog),
      template_library: templateLibrary === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.template_library`, request.template_library),
    },
    output_digests: {
      cards: guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.cards`, cards),
    },
    counts,
    effects: { ...ZERO_EFFECTS },
  };

  return deepFreeze({ schema_version: GUIDE_CARD_SET_SCHEMA_VERSION, cards, receipt });
}
