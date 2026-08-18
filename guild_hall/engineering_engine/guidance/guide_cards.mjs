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
  // --- why
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
  how_inputs_none: '선행 입력 없음',
  how_inputs_listed: '선행 입력 {input_count}건이 먼저 있어야 한다.',
  how_method_absent: '근거 미표기',
  how_method_listed: '근거 인용 {ref_count}건이 이 행에 붙어 있다.',
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

const REQUEST_FIELDS = Object.freeze(['compile_result', 'vocabulary']);
const REQUEST_OPTIONAL_FIELDS = Object.freeze(['compiled_variant', 'source_catalog', 'work_order']);
const VOCABULARY_FIELDS = Object.freeze(['artifact_type_id', 'family', 'label_ko', 'label_en', 'capability_default']);
const CATALOGUE_ENTRY_REQUIRED = Object.freeze(['source_key']);
const CATALOGUE_ENTRY_OPTIONAL = Object.freeze(['title', 'edition', 'locator_kind']);

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
    index.set(row.source_key, row);
  });
  return index;
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
    });
  };
  for (const ref of row.source_refs ?? []) push(ref, 'row');
  for (const ref of row.depends_on_refs ?? []) push(ref, 'dependency');
  return refs;
}

function whySentences(row, specRow) {
  const why = [];
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

function howBlock(row, specRow, workItem, producesFor, vocabulary) {
  const templateValue = specRow?.template ?? null;
  const templateStated = typeof templateValue === 'string' && templateValue.length > 0;
  const inputs = (row.depends_on ?? []).map((token) => {
    const resolution = row.dependency_resolution ?? { in_scope: [], out_of_scope: [], unresolved: [] };
    const scope = (resolution.in_scope ?? []).includes(token) ? 'in_scope'
      : (resolution.out_of_scope ?? []).includes(token) ? 'out_of_scope' : 'unresolved';
    return { ...tokenLabel(token, vocabulary), scope };
  });
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
  return {
    template: {
      stated: templateStated,
      value: templateStated ? templateValue : null,
      note: templateStated
        ? guidanceSentence('how_template_stated', { template: templateValue })
        : guidanceSentence('how_template_absent'),
    },
    inputs,
    inputs_note: inputs.length === 0
      ? guidanceSentence('how_inputs_none')
      : guidanceSentence('how_inputs_listed', { input_count: inputs.length }),
    produces_for: producesFor,
    method_refs: methodRefs,
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
    citations: 0,
    citations_unknown_source: 0,
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

    const how = howBlock(governing, specRow, workItem, dependents, vocabulary);
    const why = whySentences(governing, specRow);
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
      title_ko: entry === null ? null : entry.label_ko,
      title_en: entry === null ? null : entry.label_en,
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
    counts.citations += citations.length;
    counts.citations_unknown_source += citations.filter((ref) => ref.catalog_known === false).length;
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
    input_digests: {
      mapping_table: guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.mapping_table`, mappingTable),
      compiled_variant: specRows === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.compiled_variant`, request.compiled_variant),
      work_order: workItems === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.work_order`, request.work_order),
      source_catalog: catalogue === null ? null
        : guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.source_catalog`, request.source_catalog),
    },
    output_digests: {
      cards: guidanceDigest(`${GUIDE_CARD_SET_SCHEMA_VERSION}.cards`, cards),
    },
    counts,
    effects: { ...ZERO_EFFECTS },
  };

  return deepFreeze({ schema_version: GUIDE_CARD_SET_SCHEMA_VERSION, cards, receipt });
}
