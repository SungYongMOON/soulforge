import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildGuideCards, GuidanceError, GUIDANCE_ERROR_CODES } from '../guidance/guide_cards.mjs';
import {
  buildInstructionPackets,
  ENGINE_FINDING_BY_ISSUE_KIND,
  INSTRUCTION_PACKET_SCHEMA_VERSION,
  NEXT_READY_FINDING,
} from '../guidance/instruction_packet.mjs';
import { compileStageRules, orderStageWork } from '../rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../rules/artifact_vocabulary.mjs';

const EXAMPLES = '../../../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));

const FIXTURE = load('next_steps_synthetic_v0.json');

const throwsWith = (code) => (error) => {
  assert.ok(error instanceof GuidanceError, `expected a GuidanceError, got ${error?.name}`);
  assert.equal(error.code, code);
  return true;
};

function pipeline(overrides = {}) {
  const compileResult = compileStageRules(structuredClone(FIXTURE.compile_request));
  const workOrder = orderStageWork(compileResult, structuredClone(FIXTURE.observations));
  const cards = buildGuideCards({
    compile_result: compileResult,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    compiled_variant: structuredClone(FIXTURE.compile_request.compiled_variant),
    source_catalog: structuredClone(FIXTURE.source_catalog),
    template_library: structuredClone(FIXTURE.template_library),
    work_order: workOrder,
  });
  const request = {
    assessment: structuredClone(FIXTURE.assessment_stdout),
    work_order: workOrder,
    guide_cards: cards,
    known_at: FIXTURE.known_at,
    context_fill: structuredClone(FIXTURE.context_fill),
    include_next_ready: true,
    top_n: 3,
    ...overrides,
  };
  return { compileResult, workOrder, cards, request, built: buildInstructionPackets(request) };
}

// ---------------------------------------------------------------- 1. the fixture's own numbers

test('the synthetic assessment yields the hand-derived instruction set', () => {
  const { built } = pipeline();
  assert.equal(built.schema_version, INSTRUCTION_PACKET_SCHEMA_VERSION);
  for (const [key, value] of Object.entries(FIXTURE.expected.instruction_counts)) {
    assert.deepEqual(built.receipt.counts[key], value, `count ${key}`);
  }
  assert.deepEqual(
    built.instructions.map((row) => row.for.engine_requirement_id),
    FIXTURE.expected.instruction_subjects,
  );
  assert.deepEqual(
    built.instructions.map((row) => row.instruction_kind),
    ['mission_candidate', 'mission_candidate', 'mission_candidate', 'next_ready'],
  );
});

test('a mission candidate carries the engine finding and a ready-but-unobserved item does not', () => {
  const { built } = pipeline();
  const [first] = built.instructions;
  assert.equal(first.why.engine_finding, ENGINE_FINDING_BY_ISSUE_KIND.unknown);
  assert.equal(first.why.reason_code, 'observation_not_available');
  const last = built.instructions.at(-1);
  assert.equal(last.why.engine_finding, NEXT_READY_FINDING);
  assert.equal(last.why.reason_code, null);
  assert.equal(last.mission_candidate_handle, null);
});

test('nothing is included when the caller does not ask for ready-but-unobserved work', () => {
  const { built } = pipeline({ include_next_ready: false });
  assert.equal(built.receipt.counts.from_next_ready, 0);
  assert.equal(built.instructions.length, 3);
});

// ---------------------------------------------------------------- 2. the judgement is copied, never remade

test('judgment_ref carries the engine policy ref, assessment handle and count snapshot', () => {
  const { built } = pipeline();
  const bound = FIXTURE.assessment_stdout.role_bound_assessment;
  for (const instruction of built.instructions) {
    assert.deepEqual(instruction.judgment_ref.policy_ref, bound.policy_ref);
    assert.equal(instruction.judgment_ref.assessment_handle, bound.assessment_handle);
    assert.equal(instruction.judgment_ref.assessment_state, bound.assessment_state);
    assert.deepEqual(instruction.judgment_ref.requirement_counts, bound.current_stage.requirement_counts);
    assert.equal(instruction.judgment_ref.judgment_changed_by_guidance, false);
    assert.equal(instruction.claim_ceiling, 'candidate');
  }
  assert.equal(built.receipt.judgment_changed, false);
});

test('an instruction changes no presence, creates no task, and assigns nobody', () => {
  const { built } = pipeline();
  const forbidden = built.receipt.forbidden_instruction_keys;
  assert.ok(forbidden.includes('presence_state'));
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((child, index) => walk(child, `${path}[${index}]`));
    if (node === null || typeof node !== 'object') return undefined;
    for (const [key, child] of Object.entries(node)) {
      assert.equal(forbidden.includes(key), false, `${path}.${key} is a write-shaped field`);
      walk(child, `${path}.${key}`);
    }
    return undefined;
  };
  for (const instruction of built.instructions) {
    walk(instruction, 'instruction');
    for (const [flag, value] of Object.entries(instruction.authority)) {
      assert.equal(value, false, `authority.${flag}`);
    }
    for (const value of Object.values(instruction.effects)) assert.equal(value, 0);
  }
});

test('a write-shaped field arriving from a card refuses the whole build', () => {
  const { request, cards } = pipeline();
  const poisoned = structuredClone({ cards: cards.cards });
  poisoned.cards[0].how.template.presence_state = 'present';
  assert.throws(() => buildInstructionPackets({ ...request, guide_cards: poisoned }),
    throwsWith(GUIDANCE_ERROR_CODES.CARD_SET_INVALID));
});

// ---------------------------------------------------------------- 3. context fill

test('a due date and an owner arrive only from the caller', () => {
  const { built } = pipeline();
  const first = built.instructions[0];
  assert.deepEqual(first.due, { due_at: '2026-09-30T00:00:00.000Z', due_source: 'context_fill' });
  assert.equal(first.who.principal_ref, 'role:synthetic_systems_engineer');
  assert.equal(first.who.person_assigned, false);

  const { built: bare } = pipeline({ context_fill: undefined });
  for (const instruction of bare.instructions) {
    assert.equal(instruction.due, null);
    assert.equal(instruction.who.principal_ref, null);
  }
});

test('a capability with no declared owner leaves the person empty rather than guessing', () => {
  const { built } = pipeline();
  const wbs = built.instructions.at(-1);
  assert.equal(wbs.who.capability_default, 'project_management');
  assert.equal(wbs.who.principal_ref, null);
  assert.equal(wbs.who.role_id, null);
});

test('a due date that is not a canonical instant is refused', () => {
  const { request } = pipeline();
  assert.throws(() => buildInstructionPackets({
    ...request,
    context_fill: { due_dates: [{ stage_code: '030_SRR', due_at: '2026-09-30' }] },
  }), throwsWith(GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID));
});

// ---------------------------------------------------------------- 4. inputs and outputs

test('an input state is read from the work order and never invented', () => {
  const { built } = pipeline();
  const activity = built.instructions[0];
  assert.deepEqual(activity.inputs, [{
    artifact_type_id: 'conops',
    label_ko: '운용개념서',
    scope: 'in_scope',
    input_state: 'present',
    observation_state: 'present',
  }]);
  const ssrs = built.instructions[2];
  assert.deepEqual(ssrs.inputs.map((input) => input.input_state), ['unknown']);
  // Nobody looked at this one. That is 불명, and it stays distinguishable from 없음.
  assert.deepEqual(ssrs.inputs.map((input) => input.observation_state), ['unobserved']);
  assert.deepEqual(ssrs.why.blocked_by, ['act_stakeholder_expectations']);
  assert.equal(ssrs.why.ready, false);
});

test('an instruction carries the purpose, what stops without it, and the gate role', () => {
  const { built, cards } = pipeline();
  const ssrs = built.instructions[2];
  const card = cards.cards.find((row) => row.card_id === ssrs.guidance_ref);
  assert.deepEqual(ssrs.why.purpose, card.purpose);
  assert.equal(ssrs.why.purpose.stated, true);
  assert.deepEqual(ssrs.why.used_by, card.used_by);
  assert.equal(ssrs.why.gate_role, 'core');
  // The three template sentences the card already carried are still there, and behind the purpose.
  assert.equal(ssrs.why.guidance[0].template_id, 'why_purpose_stated');
  assert.ok(ssrs.why.guidance.some((row) => row.template_id === 'why_evidence_regulation_mandated'));

  const wbs = built.instructions[3];
  assert.equal(wbs.why.purpose.stated, false);
  assert.deepEqual(wbs.why.used_by, []);
  assert.equal(wbs.why.gate_role, 'supporting');
});

test('an instruction carries the form the project holds and the citations by family', () => {
  const { built, cards } = pipeline();
  const ssrs = built.instructions[2];
  const card = cards.cards.find((row) => row.card_id === ssrs.guidance_ref);
  assert.equal(ssrs.how.template.library.found, true);
  assert.equal(ssrs.how.template.library.template_ref, card.how.template.library.template_ref);
  assert.deepEqual(ssrs.how.method_families.map((family) => family.family), ['regulation', 'unknown']);
  assert.equal(ssrs.how.input_state_note.template_id, 'how_inputs_state');
  // semp and ssrs state a purpose; the activity and the wbs row do not.
  assert.equal(built.receipt.counts.with_purpose, 2);
  assert.equal(built.receipt.counts.with_used_by, 2);
  assert.equal(built.receipt.counts.with_template_ref, 2);
});

test('the expected output repeats the rule row rather than restating it', () => {
  const { built, cards } = pipeline();
  const semp = built.instructions[1];
  const card = cards.cards.find((row) => row.card_id === semp.guidance_ref);
  assert.equal(semp.output.artifact_type_id, 'semp');
  assert.equal(semp.output.maturity_expected, 'preliminary');
  assert.equal(semp.output.minimum_presence_rule, card.evidence.minimum_presence_rule);
  assert.deepEqual(semp.how.template, card.how.template);
  assert.deepEqual(semp.why.guidance, card.why);
});

// ---------------------------------------------------------------- 5. determinism and refusals

test('two builds over the same inputs agree byte for byte', () => {
  const first = pipeline().built;
  const second = pipeline().built;
  assert.equal(first.receipt.output_digests.instructions, second.receipt.output_digests.instructions);
  assert.equal(JSON.stringify(first.instructions), JSON.stringify(second.instructions));
});

test('known_at is a caller input, and an uncanonical one is refused', () => {
  const { request } = pipeline();
  assert.throws(() => buildInstructionPackets({ ...request, known_at: 'yesterday' }),
    throwsWith(GUIDANCE_ERROR_CODES.REQUEST_INVALID));
});

test('an assessment missing a field this layer reads is refused', () => {
  const { request } = pipeline();
  const broken = structuredClone(FIXTURE.assessment_stdout);
  delete broken.role_bound_assessment.next_mission_candidates;
  assert.throws(() => buildInstructionPackets({ ...request, assessment: broken }),
    throwsWith(GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID));
});

test('the built set is frozen and declares no effect', () => {
  const { built } = pipeline();
  assert.ok(Object.isFrozen(built));
  assert.ok(Object.isFrozen(built.instructions[0]));
  for (const value of Object.values(built.receipt.effects)) assert.equal(value, 0);
});
