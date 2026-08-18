import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildGuideCards,
  renderGuidanceTemplate,
  guidanceSentence,
  GuidanceError,
  GUIDANCE_ERROR_CODES,
  GUIDE_CARD_SET_SCHEMA_VERSION,
  GUIDE_CARD_TEMPLATES,
} from './guide_cards.mjs';
import { compileStageRules, orderStageWork } from '../stage_rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';

const EXAMPLES = '../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));

const FIXTURE = load('next_steps_synthetic_v0.json');

const compileRequest = () => structuredClone(FIXTURE.compile_request);
const compiled = () => compileStageRules(compileRequest());
const workOrderOf = (result) => orderStageWork(result, structuredClone(FIXTURE.observations));

const buildFromFixture = (overrides = {}) => {
  const result = compiled();
  return buildGuideCards({
    compile_result: result,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    compiled_variant: compileRequest().compiled_variant,
    source_catalog: structuredClone(FIXTURE.source_catalog),
    work_order: workOrderOf(result),
    ...overrides,
  });
};

const cardOf = (built, stageCode, token) => built.cards
  .find((card) => card.stage_code === stageCode && card.artifact_type_id === token);

const throwsWith = (code) => (error) => {
  assert.ok(error instanceof GuidanceError, `expected a GuidanceError, got ${error?.name}`);
  assert.equal(error.code, code);
  return true;
};

// ---------------------------------------------------------------- 1. the fixture's own numbers

test('the synthetic fixture yields the hand-derived card counts', () => {
  const built = buildFromFixture();
  const expected = FIXTURE.expected.card_counts;
  assert.equal(built.schema_version, GUIDE_CARD_SET_SCHEMA_VERSION);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(built.receipt.counts[key], value, `count ${key}`);
  }
  assert.deepEqual(
    built.cards.filter((card) => card.stage_code === '030_SRR').map((card) => card.artifact_type_id).sort(),
    [...FIXTURE.expected.srr_card_tokens].sort(),
  );
});

test('context artifact rows get no card, and activity and decision rows do', () => {
  const built = buildFromFixture();
  // The two inbox rows and the unstated rtm row are context: nobody is being asked to produce them.
  assert.equal(cardOf(built, '030_SRR', 'inbox'), undefined);
  assert.equal(cardOf(built, '030_SRR', 'rtm'), undefined);
  assert.equal(cardOf(built, '030_SRR', 'act_stakeholder_expectations').node_kind, 'activity');
  assert.equal(cardOf(built, '090_PDR', 'dec_allocated_baseline').node_kind, 'decision');
  assert.equal(cardOf(built, '090_PDR', 'dec_allocated_baseline').is_virtual, true);
});

// ---------------------------------------------------------------- 2. no invented text

test('every sentence on every card re-renders from its declared template and row-derived slots', () => {
  const built = buildFromFixture();
  for (const card of built.cards) {
    const allowed = new Set([
      card.stage_code,
      String(card.evidence.verification_status),
      String(card.evidence.se_floor),
      String(card.how.template.value),
      String(card.who.capability_default),
      String(card.how.inputs.length),
      String(card.how.same_stage_inputs.length),
      String(card.how.earlier_stage_inputs.length),
      String(card.how.method_refs.reduce((total, entry) => total + entry.source_refs.length, 0)),
    ]);
    const sentences = [
      ...card.why,
      card.when.stage_sequence_note,
      card.when.maturity_note,
      card.how.template.note,
      card.how.inputs_note,
      card.how.method_note,
      card.who.note,
    ].filter((sentence) => sentence !== null && sentence !== undefined);
    assert.ok(sentences.length > 0);
    for (const sentence of sentences) {
      assert.ok(Object.hasOwn(GUIDE_CARD_TEMPLATES, sentence.template_id),
        `template ${sentence.template_id} is not declared`);
      assert.equal(renderGuidanceTemplate(sentence.template_id, sentence.slots), sentence.text_ko);
      for (const value of Object.values(sentence.slots)) {
        assert.ok(allowed.has(String(value)),
          `slot value "${value}" on ${card.artifact_type_id} traces to no row field`);
      }
      assert.ok(sentence.text_ko.length <= 200, 'a card sentence stays short');
      assert.equal(sentence.text_ko.normalize('NFC'), sentence.text_ko);
    }
  }
});

test('a row with no form and no citation says so instead of filling either in', () => {
  const built = buildFromFixture();
  const wbs = cardOf(built, '030_SRR', 'wbs');
  assert.equal(wbs.how.template.stated, false);
  assert.equal(wbs.how.template.value, null);
  assert.equal(wbs.how.template.note.text_ko, '양식 없음');
  assert.deepEqual(wbs.citations, []);
  assert.equal(wbs.how.method_note.text_ko, '근거 미표기');
  assert.ok(wbs.why.some((sentence) => sentence.template_id === 'why_source_absent'));

  const semp = cardOf(built, '030_SRR', 'semp');
  assert.equal(semp.how.template.stated, true);
  assert.equal(semp.how.template.value, 'synthetic appendix form 3');
  assert.equal(semp.when.maturity_expected, 'preliminary');
});

test('every declared template renders, and an undeclared one or a missing slot refuses', () => {
  for (const templateId of Object.keys(GUIDE_CARD_TEMPLATES)) {
    const slots = {};
    for (const match of GUIDE_CARD_TEMPLATES[templateId].matchAll(/\{([a-z_]+)\}/gu)) slots[match[1]] = 'x';
    assert.equal(typeof renderGuidanceTemplate(templateId, slots), 'string');
  }
  assert.throws(() => renderGuidanceTemplate('no_such_template'),
    throwsWith(GUIDANCE_ERROR_CODES.TEMPLATE_UNKNOWN));
  assert.throws(() => guidanceSentence('when_stage_only', {}),
    throwsWith(GUIDANCE_ERROR_CODES.TEMPLATE_SLOT_MISSING));
});

// ---------------------------------------------------------------- 3. citations

test('a citation is a locator and never a quotation', () => {
  const built = buildFromFixture();
  const fields = ['ref_kind', 'source_key', 'locator', 'catalog_known', 'title', 'edition'];
  for (const card of built.cards) {
    for (const citation of card.citations) {
      assert.deepEqual(Object.keys(citation).sort(), [...fields].sort());
      assert.equal(typeof citation.source_key, 'string');
      assert.equal(typeof citation.locator, 'string');
    }
  }
  // The catalogue names one of the two synthetic sources, so the other is honestly unknown.
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.ok(ssrs.citations.some((ref) => ref.catalog_known === true && ref.title === 'Synthetic rule book'));
  assert.ok(ssrs.citations.some((ref) => ref.catalog_known === false && ref.title === null));
});

test('without a catalogue a card says nothing about whether a source is known', () => {
  const built = buildFromFixture({ source_catalog: undefined });
  for (const card of built.cards) {
    for (const citation of card.citations) assert.equal(citation.catalog_known, null);
  }
});

// ---------------------------------------------------------------- 4. the graph a card reports

test('a card names both what it needs and what needs it', () => {
  const built = buildFromFixture();
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.deepEqual(ssrs.how.inputs.map((input) => input.artifact_type_id), ['act_stakeholder_expectations']);
  assert.equal(ssrs.how.inputs[0].label_ko, '이해관계자 기대 정의');
  assert.equal(ssrs.how.inputs[0].scope, 'in_scope');
  assert.deepEqual(
    ssrs.how.produces_for.map((row) => `${row.stage_code}/${row.artifact_type_id}`),
    ['030_SRR/review_minutes_srr', '030_SRR/rtm', '090_PDR/act_architecture_design'],
  );

  const stp = cardOf(built, '090_PDR', 'stp');
  assert.deepEqual(stp.how.inputs.map((input) => input.scope), ['unresolved']);
  assert.equal(stp.how.inputs[0].label_ko, null);
});

test('an activity card names the record that would show the work happened', () => {
  const built = buildFromFixture();
  const activity = cardOf(built, '030_SRR', 'act_stakeholder_expectations');
  assert.deepEqual(activity.what.evidence_record,
    [{ artifact_type_id: 'review_minutes_srr', label_ko: 'SRR 회의록' }]);
});

// ---------------------------------------------------------------- 5. determinism and shape

test('two builds over the same inputs agree byte for byte', () => {
  const first = buildFromFixture();
  const second = buildFromFixture();
  assert.equal(first.receipt.output_digests.cards, second.receipt.output_digests.cards);
  assert.equal(JSON.stringify(first.cards), JSON.stringify(second.cards));
  assert.deepEqual(first.cards.map((card) => card.card_id), second.cards.map((card) => card.card_id));
});

test('a card set is frozen, claims nothing, and declares no effect', () => {
  const built = buildFromFixture();
  assert.ok(Object.isFrozen(built));
  assert.ok(Object.isFrozen(built.cards[0]));
  assert.equal(built.receipt.judgment_changed, false);
  assert.equal(built.receipt.claim_ceiling, 'observed');
  for (const value of Object.values(built.receipt.effects)) assert.equal(value, 0);
});

test('the spec, the work order and the catalogue are optional and their absence is recorded', () => {
  const result = compiled();
  const built = buildGuideCards({ compile_result: result, vocabulary: ARTIFACT_VOCABULARY_V0 });
  assert.equal(built.receipt.input_digests.compiled_variant, null);
  assert.equal(built.receipt.input_digests.work_order, null);
  assert.equal(built.receipt.input_digests.source_catalog, null);
  // With no spec there is no desc and no form to state, and the card says exactly that.
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.equal(ssrs.what.desc, null);
  assert.equal(ssrs.how.template.stated, false);
  assert.equal(ssrs.when.stage_sequence_note.template_id, 'when_stage_only');
});

test('an unexpected request field is refused rather than ignored', () => {
  const result = compiled();
  assert.throws(() => buildGuideCards({
    compile_result: result, vocabulary: ARTIFACT_VOCABULARY_V0, observations: [],
  }), throwsWith(GUIDANCE_ERROR_CODES.REQUEST_INVALID));
  assert.throws(() => buildGuideCards({ vocabulary: ARTIFACT_VOCABULARY_V0 }),
    throwsWith(GUIDANCE_ERROR_CODES.REQUEST_INVALID));
});

// ---------------------------------------------------------------- 6. static effect pin

test('the guidance modules and everything they import read no file, clock, network, or model', () => {
  const FORBIDDEN_TOKENS = [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:dns', 'node:child_process',
    'node:worker_threads', 'node:process', 'node:os', 'node:readline', 'node:url',
    'Date.now', 'new Date', 'Math.random', 'process.env', 'process.argv',
    'process.hrtime', 'performance.now', 'fetch(', 'XMLHttpRequest', 'require(',
  ];
  const ALLOWED_BARE_SPECIFIERS = new Set(['node:crypto']);

  const seen = new Map();
  const walk = (url) => {
    const href = url.href;
    if (seen.has(href)) return;
    const source = readFileSync(url, 'utf8');
    seen.set(href, source);
    for (const match of source.matchAll(/\bfrom\s+'([^']+)'/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) walk(new URL(specifier, url));
      else assert.ok(ALLOWED_BARE_SPECIFIERS.has(specifier), `unexpected bare import "${specifier}" in ${href}`);
    }
  };
  for (const entry of ['./guide_cards.mjs', './instruction_packet.mjs', './answer_render.mjs']) {
    walk(new URL(entry, import.meta.url));
  }

  assert.ok(seen.size >= 5, 'the import graph should include the vocabulary and the kernel modules');
  for (const [href, source] of seen) {
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(source.includes(token), false, `${href} must not contain "${token}"`);
    }
  }
});
