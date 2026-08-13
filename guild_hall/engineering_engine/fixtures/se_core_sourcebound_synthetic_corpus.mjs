// Public synthetic fixtures for the evaluation-only Soulforge Engineering Answer Lane tests.
//
// Every byte here is invented for the test suite. No private source, no real handbook text, no
// homefield benchmark question, and no evaluator material is present. The four "sources" are
// deliberately labelled synthetic so a fixture can never be mistaken for an approved source.

import { createHash } from 'node:crypto';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const pageBlock = (number, body) => `## Page ${number}\n\n${body}\n`;

export const SYNTHETIC_SOURCES = Object.freeze([
  Object.freeze({
    source_id: 'syn_alpha_practice_guide',
    title: 'Synthetic Systems Engineering Practice Guide',
    revision: 'SYN-A rev 1',
    page_count: 4,
    pages: Object.freeze([
      'Each verification activity declares measurable pass and fail criteria before it runs. '
      + 'A criteria statement without a threshold is not a verification criterion.',
      'A verification criteria record names the responsible role, the applicable revision, and '
      + 'the evidence reference that closes the activity.',
      'Bidirectional traceability links each requirement to the verification activity that '
      + 'verifies it and back again.',
      'Configuration baselines are stored with a unique identifier and a declared validity window.',
    ]),
  }),
  Object.freeze({
    source_id: 'syn_bravo_interface_manual',
    title: 'Synthetic Interface Control Manual',
    revision: 'SYN-B rev 2',
    page_count: 3,
    pages: Object.freeze([
      'Interface agreements record the controlling threshold and the record that owns it.',
      'When two current records disagree, the higher authority record governs until the '
      + 'disagreement is resolved, and both claims are preserved with their revisions.',
      'Verification evidence is traced to the requirement it verifies and to its design revision.',
    ]),
  }),
  Object.freeze({
    source_id: 'syn_charlie_support_guide',
    title: 'Synthetic Product Support Guide',
    revision: 'SYN-C rev 1',
    page_count: 2,
    pages: Object.freeze([
      'Logistics planning products are reviewed at each declared milestone.',
      'Training material is delivered with the fielded configuration and its revision label.',
    ]),
  }),
  Object.freeze({
    source_id: 'syn_delta_production_guide',
    title: 'Synthetic Production Readiness Guide',
    revision: 'SYN-D rev 3',
    page_count: 2,
    pages: Object.freeze([
      'Manufacturing readiness is assessed against declared production criteria.',
      'Supplier data rights are recorded in the acquisition file with the applicable clause.',
    ]),
  }),
]);

export const SYNTHETIC_QUESTION =
  '이 자료에서 verification 활동의 pass 및 fail criteria 요구를 설명해 주세요.';
export const SYNTHETIC_SOURCE_SET_ID = 'syn_four_source_evaluation_set';
export const SYNTHETIC_SOURCE_SET_SCHEMA = 'soulforge.se_core_sourcebound_source_set.v0';
export const SYNTHETIC_POINT_IN_TIME = '2026-08-13';

export const SYNTHETIC_APPROVAL = Object.freeze({
  approval_status: 'owner_approved_public_source',
  reuse_rights_reviewed: true,
});
export const SYNTHETIC_PERMISSIONS = Object.freeze({
  public_source_analysis: true,
  evaluation_lane_retrieval: true,
  canon_promotion: false,
  external_upload: false,
});

export const derivedTextFor = (source) => Buffer.from(
  source.pages.map((body, index) => pageBlock(index + 1, body)).join('\n'),
  'utf8',
);

// The authorized derived-text artifacts open with a bounded metadata preamble before their first
// page heading. This provenance line is invented for the fixture: it names no real tool run, no
// local path, and no operator.
export const SYNTHETIC_EXTRACTION =
  'synthetic fixture extraction, page-aware markdown, no OCR pass';

/** The five known metadata bullets, bound to one runtime source descriptor. */
export function preambleBullets(descriptor) {
  return [
    ['source_id', descriptor.source_id],
    ['revision', descriptor.revision],
    ['source_pdf_sha256', descriptor.source_pdf_sha256],
    ['page_count', String(descriptor.page_count)],
    ['extraction', SYNTHETIC_EXTRACTION],
  ];
}

/**
 * One derived-text stream in the real artifact shape: an H1 title, the metadata bullets, then the
 * unchanged page-aware body.
 *
 * `title`, `omitTitle`, `bullets`, and `trailing` exist so a test can mutate exactly one element
 * of the preamble; the page body is identical to `derivedTextFor` in every case.
 */
export function derivedTextWithPreamble(source, descriptor, options = {}) {
  const bullets = options.bullets ?? preambleBullets(descriptor);
  const head = [
    ...(options.omitTitle === true ? [] : [`# ${options.title ?? descriptor.title}`, '']),
    ...bullets.map(([key, value]) => `- ${key}: ${value}`),
    ...(options.trailing ?? []),
    '',
  ];
  return Buffer.from(
    `${head.join('\n')}\n${derivedTextFor(source).toString('utf8')}`,
    'utf8',
  );
}

/** Four mutable runtime descriptors in canonical source_id order. */
export function sourceDescriptors() {
  return SYNTHETIC_SOURCES.map((source) => {
    const derived = derivedTextFor(source);
    return {
      source_id: source.source_id,
      title: source.title,
      revision: source.revision,
      source_pdf_sha256: sha256(`synthetic-pdf:${source.source_id}`),
      derived_text_sha256: sha256(derived),
      derived_text_bytes: derived,
      page_count: source.page_count,
      approval: { ...SYNTHETIC_APPROVAL },
      permissions: { ...SYNTHETIC_PERMISSIONS },
    };
  });
}

/** The pinned contract: identity and byte commitments only. */
export function sourceSetContract(descriptors) {
  return {
    schema_version: SYNTHETIC_SOURCE_SET_SCHEMA,
    source_set_id: SYNTHETIC_SOURCE_SET_ID,
    sources: descriptors.map((descriptor) => ({
      source_id: descriptor.source_id,
      title: descriptor.title,
      revision: descriptor.revision,
      source_pdf_sha256: descriptor.source_pdf_sha256,
      derived_text_sha256: descriptor.derived_text_sha256,
      page_count: descriptor.page_count,
    })),
  };
}

/** The operator-authored contract file, which also declares approval and permission posture. */
export function contractFileDocument(descriptors) {
  return {
    schema_version: SYNTHETIC_SOURCE_SET_SCHEMA,
    source_set_id: SYNTHETIC_SOURCE_SET_ID,
    sources: descriptors.map((descriptor) => ({
      source_id: descriptor.source_id,
      title: descriptor.title,
      revision: descriptor.revision,
      source_pdf_sha256: descriptor.source_pdf_sha256,
      derived_text_sha256: descriptor.derived_text_sha256,
      page_count: descriptor.page_count,
      approval: { ...SYNTHETIC_APPROVAL },
      permissions: { ...SYNTHETIC_PERMISSIONS },
    })),
  };
}

/**
 * One complete, valid lane invocation.
 *
 * `commitment` is injected rather than imported so the fixture module stays free of any
 * dependency on the module under test.
 */
export function laneInput({ commitment, question = SYNTHETIC_QUESTION } = {}) {
  const descriptors = sourceDescriptors();
  const contract = sourceSetContract(descriptors);
  const questionBytes = Buffer.from(question, 'utf8');
  return {
    questionBytes,
    expectedQuestionSha256: sha256(questionBytes),
    expectedQuestionBytes: questionBytes.length,
    corpus: {
      sourceSetContract: contract,
      expectedSourceSetSha256: commitment(contract),
      sources: descriptors,
    },
    scope: {
      evaluation_only: true,
      point_in_time: SYNTHETIC_POINT_IN_TIME,
      actual_project_data_included: false,
      private_data_included: false,
      authority_to_approve: false,
      authority_to_create_task: false,
      authority_to_promote_canon: false,
      action_execution_allowed: false,
    },
    retrieval: { max_evidence: 6, max_per_source: 2 },
    queryExpansion: { requested: false, max_terms: 6 },
  };
}

export const SYNTHETIC_BENCHMARK_PIN_ID = 'syn_four_source_evaluation_pin_v0';

/**
 * One independently configured benchmark cohort pin over a runtime source set.
 *
 * `cohort` is injected exactly like `commitment` above, so this fixture module still depends on
 * nothing from the module under test. A pin is operator configuration: it names the pinned set,
 * its allowlisted members, and the expected commitment over the *full* member material — identity,
 * byte hashes, approval, and permissions — so a caller that recomputes its own descriptors and its
 * own contract hash cannot silently present them as the fixed benchmark.
 */
export function benchmarkPin({ cohort, input, pinId = SYNTHETIC_BENCHMARK_PIN_ID }) {
  return {
    pin_id: pinId,
    source_set_id: input.corpus.sourceSetContract.source_set_id,
    expected_cohort_sha256: cohort(input.corpus.sources),
    allowed_source_ids: input.corpus.sources.map((source) => source.source_id),
  };
}

/** One single-page derived-text stream, so a test can pin exact bytes without page bookkeeping. */
export const singlePageDerivedText = (body) => Buffer.from(`## Page 1\n\n${body}\n`, 'utf8');

export const KOREAN_SECTIONS = (evidenceIds) => ({
  sections: [
    {
      heading: '핵심 판단',
      text: '검증 활동은 실행 전에 측정 가능한 합격·불합격 기준을 선언해야 합니다.',
      evidence_ids: [evidenceIds[0]],
    },
    {
      heading: '근거 정리',
      text: '기준 기록에는 책임 역할과 적용 개정이 함께 남아야 합니다.',
      evidence_ids: evidenceIds.slice(0, 2),
    },
  ],
});

/** An in-memory bounded answer model. `behaviour` overrides either seam per test. */
export function fakeAnswerModel(behaviour = {}) {
  const model = {
    descriptor: {
      adapter_id: 'in_memory_fake_answer_model',
      adapter_revision: 'soulforge.test.fake_answer_model.v0',
      stateless: true,
      tools_enabled: false,
      history_enabled: false,
    },
    calls: [],
    async composeAnswer(request) {
      model.calls.push({ kind: 'compose', request });
      if (behaviour.compose) return behaviour.compose(request, model);
      return KOREAN_SECTIONS(request.evidence.map((item) => item.evidence_id));
    },
    async proposeQueryExpansion(request) {
      model.calls.push({ kind: 'expand', request });
      if (behaviour.expand) return behaviour.expand(request, model);
      return { terms: ['traceability', 'requirement'] };
    },
  };
  return model;
}

export const composeCalls = (model) => model.calls.filter((call) => call.kind === 'compose').length;
