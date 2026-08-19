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
    template_library: structuredClone(FIXTURE.template_library),
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
    // Every slot value a card may carry, and where it came from: a field copied off the rule row,
    // a label the vocabulary published, a count of a computed relation, or the library's own
    // reference. Nothing else is admissible, which is what "no invented text" means here.
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
      // purpose: the spec row's own sentence, never composed here
      String(card.purpose.purpose_ko),
      // used_by: vocabulary labels of the rows that name this one as an input, and their count
      card.used_by.slice(0, 3).map((row) => row.label_ko ?? row.artifact_type_id).join('·'),
      String(card.used_by.length),
      // the form the project holds
      String(card.how.template.library.template_ref),
      String(card.how.template.library.version),
      // input states, counted
      String(card.how.input_state_counts.present),
      String(card.how.input_state_counts.absent),
      String(card.how.input_state_counts.unknown),
      // declared source-family labels and their per-family counts
      ...card.how.method_families.map((family) => family.label_ko),
      ...card.how.method_families.map((family) => String(family.ref_count)),
    ]);
    const sentences = [
      ...card.why,
      card.when.stage_sequence_note,
      card.when.maturity_note,
      card.how.template.note,
      card.how.template.library.note,
      card.how.inputs_note,
      card.how.input_state_note,
      card.how.method_note,
      ...card.how.method_families.map((family) => family.note),
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
      assert.ok(sentence.text_ko.length <= 260, 'a card sentence stays short');
      assert.equal(sentence.text_ko.normalize('NFC'), sentence.text_ko);
    }
  }
});

// ---------------------------------------------------------------- 2A. the "왜" a person asked for

test('a purpose sentence is the spec row\'s own, and its absence is stated rather than filled in', () => {
  const built = buildFromFixture();
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  const specSsrs = compileRequest().compiled_variant.gates
    .find((gate) => gate.code === 30).tasks.find((task) => task.artifact_type_id === 'ssrs');
  assert.equal(ssrs.purpose.stated, true);
  assert.equal(ssrs.purpose.purpose_ko, specSsrs.purpose_ko);
  assert.deepEqual(ssrs.purpose.purpose_refs, specSsrs.purpose_refs);
  assert.equal(ssrs.why[0].template_id, 'why_purpose_stated');
  assert.deepEqual(ssrs.why[0].source_refs, specSsrs.purpose_refs);

  const wbs = cardOf(built, '030_SRR', 'wbs');
  assert.equal(wbs.purpose.stated, false);
  assert.equal(wbs.purpose.purpose_ko, null);
  assert.deepEqual(wbs.purpose.purpose_refs, []);
  assert.equal(wbs.why[0].template_id, 'why_purpose_absent');
  assert.equal(wbs.why[0].text_ko, '정본에 목적 문장 없음');
});

test('a card names what stops without it, counted from the rule table\'s own edges', () => {
  const built = buildFromFixture();
  for (const [token, count] of Object.entries(FIXTURE.expected.used_by_counts)) {
    const card = built.cards.find((row) => row.artifact_type_id === token);
    assert.equal(card.used_by.length, count, `used_by count for ${token}`);
  }
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.deepEqual(ssrs.used_by.map((row) => `${row.stage_code}/${row.artifact_type_id}`),
    ['030_SRR/review_minutes_srr', '030_SRR/rtm', '090_PDR/act_architecture_design']);
  assert.equal(ssrs.why[1].template_id, 'why_used_by_named');
  assert.equal(ssrs.why[1].slots.dependents,
    ssrs.used_by.map((row) => row.label_ko ?? row.artifact_type_id).join('·'));
  assert.ok(ssrs.why[1].text_ko.endsWith('가 막힌다.'));

  // Nothing in the table names the plan as an input, and the card says that rather than staying
  // silent — "no later item needs this" is itself an answer to "why now".
  const semp = cardOf(built, '030_SRR', 'semp');
  assert.deepEqual(semp.used_by, []);
  assert.equal(semp.why[1].template_id, 'why_used_by_none');
});

test('the gate role speaks only when the canon marked one', () => {
  const built = buildFromFixture();
  assert.equal(cardOf(built, '030_SRR', 'ssrs').gate_role, 'core');
  assert.ok(cardOf(built, '030_SRR', 'ssrs').why.some((row) => row.template_id === 'why_gate_role_core'));
  assert.equal(cardOf(built, '030_SRR', 'conops').gate_role, 'entry');
  assert.ok(cardOf(built, '030_SRR', 'conops').why.some((row) => row.template_id === 'why_gate_role_entry'));
  // `supporting` is the compiler's default and the canon said nothing, so nothing is said.
  const semp = cardOf(built, '030_SRR', 'semp');
  assert.equal(semp.gate_role, 'supporting');
  assert.ok(!semp.why.some((row) => String(row.template_id).startsWith('why_gate_role')));
});

// ---------------------------------------------------------------- 2B. the "어떻게" a person asked for

test('a form the project holds is found by token, by spec row name, or by term', () => {
  const built = buildFromFixture();
  for (const [token, matchKind] of Object.entries(FIXTURE.expected.template_matches)) {
    const card = built.cards.find((row) => row.artifact_type_id === token);
    assert.equal(card.how.template.library.found, true, `${token} should find a form`);
    assert.equal(card.how.template.library.match_kind, matchKind);
    assert.equal(card.how.template.library.library_id, FIXTURE.template_library.library_id);
    assert.ok(!card.how.template.library.template_ref.startsWith('/'));
    assert.ok(!/^[A-Za-z]:/u.test(card.how.template.library.template_ref),
      'a card never carries the absolute location of a private library');
  }
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.equal(ssrs.how.template.library.version, 'Rev3');
  assert.equal(ssrs.how.template.library.note.template_id, 'how_template_library_found_versioned');
  const semp = cardOf(built, '030_SRR', 'semp');
  assert.equal(semp.how.template.library.version, null);
  assert.equal(semp.how.template.library.note.template_id, 'how_template_library_found');

  const wbs = cardOf(built, '030_SRR', 'wbs');
  assert.equal(wbs.how.template.library.found, false);
  assert.equal(wbs.how.template.library.note.text_ko, '양식 파일이 라이브러리에 없다');
});

test('with no library a card says it did not look rather than that nothing is there', () => {
  const built = buildFromFixture({ template_library: undefined });
  assert.equal(built.receipt.input_digests.template_library, null);
  assert.equal(built.receipt.template_library_id, null);
  for (const card of built.cards) {
    assert.equal(card.how.template.library.looked_up, false);
    assert.equal(card.how.template.library.found, false);
    assert.equal(card.how.template.library.note.text_ko, '양식 라이브러리 미조회');
  }
});

test('an absolute or climbing template reference is refused', () => {
  const bad = (ref) => () => buildFromFixture({
    template_library: { library_id: 'X', entries: [{ artifact_type_id: 'ssrs', template_ref: ref }] },
  });
  // Assembled rather than written out: a literal drive-letter path in a tracked file is itself a
  // policy violation, and this test is about the refusal, not about naming anybody's disk.
  const driveRooted = `${String.fromCharCode(67)}:/private/library/form.md`;
  assert.throws(bad(driveRooted), throwsWith(GUIDANCE_ERROR_CODES.REQUEST_INVALID));
  assert.throws(bad('/library/form.md'), throwsWith(GUIDANCE_ERROR_CODES.REQUEST_INVALID));
  assert.throws(bad('../outside/form.md'), throwsWith(GUIDANCE_ERROR_CODES.REQUEST_INVALID));
});

test('an input carries what the eye said about it, and 없음 never stands in for 불명', () => {
  const built = buildFromFixture();
  // The fixture observes conops present and nothing else, so the activity that needs it reads 있음.
  const activity = cardOf(built, '030_SRR', 'act_stakeholder_expectations');
  assert.deepEqual(activity.how.inputs.map((input) => input.input_state), ['present']);
  assert.deepEqual(activity.how.inputs.map((input) => input.observation_state), ['present']);
  assert.deepEqual(activity.how.input_state_counts, { present: 1, absent: 0, unknown: 0 });
  assert.equal(activity.how.input_state_note.template_id, 'how_inputs_state');

  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.deepEqual(ssrs.how.inputs.map((input) => input.input_state), ['unknown']);
  assert.equal(ssrs.how.inputs[0].observation_state, 'unobserved');

  const semp = cardOf(built, '030_SRR', 'semp');
  assert.deepEqual(semp.how.inputs, []);
  assert.equal(semp.how.input_state_note, null);
});

test('method citations are grouped by the family the catalogue named, unknown families included', () => {
  const built = buildFromFixture();
  const ssrs = cardOf(built, '030_SRR', 'ssrs');
  assert.deepEqual(ssrs.how.method_families.map((family) => family.family), ['regulation', 'unknown']);
  assert.deepEqual(ssrs.how.method_families.map((family) => family.label_ko), ['규정', '출처 계열 미표기']);
  assert.equal(ssrs.how.method_families.reduce((total, family) => total + family.ref_count, 0),
    ssrs.how.method_refs.reduce((total, entry) => total + entry.source_refs.length, 0));

  // Without a catalogue nobody has said which family anything belongs to, so everything is unknown
  // rather than being sorted into a family this layer guessed.
  const blind = buildFromFixture({ source_catalog: undefined });
  for (const card of blind.cards) {
    for (const family of card.how.method_families) assert.equal(family.family, 'unknown');
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
  const fields = ['ref_kind', 'source_key', 'locator', 'catalog_known', 'title', 'edition', 'source_family'];
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
