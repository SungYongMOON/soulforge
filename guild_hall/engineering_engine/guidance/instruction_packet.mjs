// The guidance layer's second half: the instruction a sub-agent or a team member is handed.
//
// Design D47 (proposal, `docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md` section 8).
// An instruction is three things joined: the engine's mission candidate (what is missing or
// unknown, and why the engine says so), the guide card for that row (why the rule exists, what
// the thing is, how it is made, who normally makes it), and whatever context the caller can fill
// in (a due date, a named owner). It is a candidate for a person or an agent to act on, never a
// Task, never an approval, and never a change to what the engine decided.
//
// What this module must not do is the whole point of it:
//
//   * it never changes a judgement. The engine's counts, findings and policy ref are copied in as
//     `judgment_ref` and are never recomputed here from a different rule;
//   * it never marks anything done, present, or approved. A build that would emit such a field
//     refuses instead, so that the boundary is enforced rather than merely intended;
//   * it never invents an owner. `who.principal_ref` is filled only from `context_fill.owners`,
//     and the role is the logical role the engine already named — a logical role is not a person.
//
// Pure: no file, clock, random source, environment value, or network. `known_at` is a caller input
// precisely so this module never reads a clock.
import { isCanonicalInstant } from '../kernel/canonical.mjs';
import {
  GUIDANCE_ERROR_CODES,
  MAX,
  ZERO_EFFECTS,
  assertArray,
  assertExactKeys,
  assertPlainObject,
  assertSafeString,
  deepFreeze,
  guidanceDigest,
  guidanceFail,
} from './guide_cards.mjs';

export const INSTRUCTION_PACKET_SCHEMA_VERSION = 'soulforge.engine_instruction_packet.v0';
export const INSTRUCTION_CLAIM_CEILING = 'candidate';

// How the engine's issue vocabulary reads as a finding on an instruction. The left side is the
// subject's own `issue_kind`; the right side is the wording the plan and the manual use.
export const ENGINE_FINDING_BY_ISSUE_KIND = Object.freeze({
  missing: 'gap_missing',
  unknown: 'gap_unknown',
  conflict: 'gap_conflict',
  risk: 'open_risk',
});

// A work item that is ready and has never been observed is not a finding: nobody has looked. It
// is still the next thing to do, which is why it can be included, and it is labelled as its own
// kind so that a reader cannot mistake it for something the engine judged.
export const NEXT_READY_FINDING = 'not_yet_observed';

const INSTRUCTION_KINDS = Object.freeze(['mission_candidate', 'next_ready']);

// Field names that would turn an instruction into a write. An instruction that carried an
// observation, a revision ref, or a completion flag would be indistinguishable from the packet a
// writer consumes, and somebody would eventually feed it to one.
const FORBIDDEN_INSTRUCTION_KEYS = Object.freeze([
  'presence_state', 'observation_id', 'observation_attempt_ref', 'artifact_revision_ref',
  'task_intent', 'task_intent_created', 'approval_ref', 'approved', 'done', 'completed',
  'stage_cleared', 'erp_write',
]);

const REQUEST_FIELDS = Object.freeze(['assessment', 'work_order', 'guide_cards', 'known_at']);
const REQUEST_OPTIONAL_FIELDS = Object.freeze(['role_roster', 'context_fill', 'include_next_ready', 'top_n']);
const CONTEXT_FILL_FIELDS = Object.freeze([]);
const CONTEXT_FILL_OPTIONAL = Object.freeze(['due_dates', 'owners', 'notes']);
const DUE_DATE_FIELDS = Object.freeze(['stage_code', 'due_at']);
const OWNER_FIELDS = Object.freeze(['capability', 'principal_ref']);

const KEY = (left, right) => `${left}::${right}`;

const instructionHandle = (digest) => `instr-${digest.slice(0, 32)}`;

function assertNoWriteIntent(value, where) {
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_INSTRUCTION_KEYS.includes(key)) {
        guidanceFail(GUIDANCE_ERROR_CODES.CARD_SET_INVALID,
          'an instruction may not carry an observation, an approval, or a completion field',
          { where: `${path}.${key}` });
      }
      walk(child, `${path}.${key}`);
    }
  };
  walk(value, where);
  return value;
}

// The runner writes the whole pilot result; the role-bound assessment is one field of it. Either
// shape is accepted because the caller should not have to unwrap a receipt to ask a question.
function readAssessment(assessment) {
  assertPlainObject(assessment, 'request.assessment', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  const bound = Object.hasOwn(assessment, 'role_bound_assessment')
    ? assessment.role_bound_assessment : assessment;
  assertPlainObject(bound, 'request.assessment.role_bound_assessment', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  for (const field of ['assessment_handle', 'assessment_state', 'current_stage', 'issues', 'next_mission_candidates']) {
    if (!Object.hasOwn(bound, field)) {
      guidanceFail(GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID, 'the assessment is missing a field this layer reads',
        { field });
    }
  }
  assertPlainObject(bound.current_stage, 'assessment.current_stage', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  assertArray(bound.issues, 'assessment.issues', MAX.rows, GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  assertArray(bound.next_mission_candidates, 'assessment.next_mission_candidates', MAX.instructions,
    GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
  return bound;
}

function readContextFill(contextFill) {
  if (contextFill === null || contextFill === undefined) {
    return { dueByStage: new Map(), ownerByCapability: new Map(), notes: null };
  }
  assertExactKeys(contextFill, CONTEXT_FILL_FIELDS, CONTEXT_FILL_OPTIONAL, 'request.context_fill',
    GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
  const dueByStage = new Map();
  for (const row of assertArray(contextFill.due_dates ?? [], 'request.context_fill.due_dates', MAX.stages,
    GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID)) {
    assertExactKeys(row, DUE_DATE_FIELDS, [], 'request.context_fill.due_dates[]',
      GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
    assertSafeString(row.stage_code, 'request.context_fill.due_dates[].stage_code',
      GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
    if (!isCanonicalInstant(row.due_at)) {
      guidanceFail(GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID, 'a due date must be a canonical instant',
        { where: 'request.context_fill.due_dates[].due_at' });
    }
    dueByStage.set(row.stage_code, row.due_at);
  }
  const ownerByCapability = new Map();
  for (const row of assertArray(contextFill.owners ?? [], 'request.context_fill.owners', MAX.tokens,
    GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID)) {
    assertExactKeys(row, OWNER_FIELDS, [], 'request.context_fill.owners[]',
      GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
    assertSafeString(row.capability, 'request.context_fill.owners[].capability',
      GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
    assertSafeString(row.principal_ref, 'request.context_fill.owners[].principal_ref',
      GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
    ownerByCapability.set(row.capability, row.principal_ref);
  }
  const notes = contextFill.notes ?? null;
  if (notes !== null) assertSafeString(notes, 'request.context_fill.notes', GUIDANCE_ERROR_CODES.CONTEXT_FILL_INVALID);
  return { dueByStage, ownerByCapability, notes };
}

function indexWorkOrder(workOrder) {
  assertPlainObject(workOrder, 'request.work_order', GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
  const stages = assertArray(workOrder.stages, 'request.work_order.stages', MAX.stages,
    GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID);
  const byRequirement = new Map();
  const byToken = new Map();
  const ordered = [];
  for (const stage of stages) {
    for (const item of assertArray(stage.work_items, 'request.work_order.stages[].work_items', MAX.rows,
      GUIDANCE_ERROR_CODES.WORK_ORDER_INVALID)) {
      const row = { ...item, stage_code: item.stage_code ?? stage.stage_code, stage_sequence: stage.stage_sequence };
      ordered.push(row);
      if (row.engine_requirement_id !== null && row.engine_requirement_id !== undefined) {
        byRequirement.set(row.engine_requirement_id, row);
      }
      byToken.set(KEY(row.stage_code, row.artifact_type_id), row);
    }
  }
  return { byRequirement, byToken, ordered };
}

function indexCards(cardSet) {
  const cards = Array.isArray(cardSet) ? cardSet : cardSet?.cards;
  assertArray(cards, 'request.guide_cards', MAX.cards, GUIDANCE_ERROR_CODES.CARD_SET_INVALID);
  const byRequirement = new Map();
  const byToken = new Map();
  for (const card of cards) {
    assertPlainObject(card, 'request.guide_cards[]', GUIDANCE_ERROR_CODES.CARD_SET_INVALID);
    byToken.set(KEY(card.stage_code, card.artifact_type_id), card);
    if (card.engine_requirement_id !== null && card.engine_requirement_id !== undefined) {
      byRequirement.set(card.engine_requirement_id, card);
    }
  }
  return { byRequirement, byToken, cards };
}

function inputsOf(card, workItem) {
  // The work order records one thing about an input: whether an observation put it present. Any
  // other input is `unknown` and never `missing` — the difference is whether anybody looked, and
  // this layer is not the one that decides that.
  const satisfied = new Set(workItem?.satisfied_inputs ?? []);
  return (card?.how?.inputs ?? []).map((input) => ({
    artifact_type_id: input.artifact_type_id,
    label_ko: input.label_ko ?? null,
    scope: input.scope,
    input_state: satisfied.has(input.artifact_type_id) ? 'present' : 'unknown',
  }));
}

function whoOf(card, roleDecision, ownerByCapability) {
  const capability = card?.who?.capability_default ?? roleDecision?.required_capability ?? null;
  const principal = capability === null ? null : ownerByCapability.get(capability) ?? null;
  return {
    capability_default: capability,
    role_id: roleDecision?.role_id ?? null,
    role_decision_state: roleDecision?.state ?? null,
    role_reason_code: roleDecision?.reason_code ?? null,
    // A logical role is not a person. A principal appears only when the caller supplied one, and
    // even then the instruction is a candidate: nothing here assigns anybody.
    principal_ref: principal,
    person_assigned: false,
  };
}

function buildInstruction(parameters) {
  const {
    kind, rank, stageCode, workItem, card, mission, issue, judgment, dueByStage, ownerByCapability, knownAt,
  } = parameters;
  const artifactTypeId = card?.artifact_type_id ?? workItem?.artifact_type_id ?? null;
  const engineFinding = mission === null ? NEXT_READY_FINDING
    : ENGINE_FINDING_BY_ISSUE_KIND[issue?.issue_kind] ?? 'gap_unknown';
  const body = {
    instruction_kind: kind,
    rank,
    for: {
      stage_code: stageCode,
      artifact_type_id: artifactTypeId,
      node_kind: card?.node_kind ?? workItem?.node_kind ?? null,
      engine_requirement_id: mission?.subject_id ?? workItem?.engine_requirement_id ?? null,
      alias: card?.alias ?? workItem?.alias ?? null,
    },
    what: {
      title_ko: card?.title_ko ?? null,
      name: card?.what?.name ?? null,
      desc: card?.what?.desc ?? null,
    },
    why: {
      engine_finding: engineFinding,
      reason_code: issue?.reason_code ?? null,
      blocked_by: [...(workItem?.blocked_by ?? [])],
      ready: workItem?.ready ?? null,
      guidance: (card?.why ?? []).map((sentence) => ({ ...sentence })),
    },
    inputs: inputsOf(card, workItem),
    output: {
      artifact_type_id: artifactTypeId,
      title_ko: card?.title_ko ?? null,
      maturity_expected: card?.when?.maturity_expected ?? null,
      minimum_presence_rule: card?.evidence?.minimum_presence_rule ?? workItem?.minimum_presence_rule ?? null,
      evidence_record: (card?.what?.evidence_record ?? []).map((row) => ({ ...row })),
      is_virtual: card?.is_virtual ?? workItem?.is_virtual ?? null,
    },
    how: {
      template: card === undefined || card === null ? null : { ...card.how.template },
      inputs_note: card?.how?.inputs_note ?? null,
      method_refs: (card?.how?.method_refs ?? []).map((entry) => ({
        ref_kind: entry.ref_kind,
        evidence_level: entry.evidence_level,
        source_refs: entry.source_refs.map((ref) => ({ ...ref })),
      })),
      method_note: card?.how?.method_note ?? null,
      produces_for: (card?.how?.produces_for ?? []).map((row) => ({ ...row })),
    },
    who: whoOf(card, mission?.role_decision ?? null, ownerByCapability),
    due: dueByStage.has(stageCode)
      ? { due_at: dueByStage.get(stageCode), due_source: 'context_fill' }
      : null,
    judgment_ref: judgment,
    guidance_ref: card?.card_id ?? null,
    mission_candidate_handle: mission?.mission_candidate_handle ?? null,
    issue_handle: mission?.issue_handle ?? null,
    known_at: knownAt,
    claim_ceiling: INSTRUCTION_CLAIM_CEILING,
    authority: {
      judgment_changed: false,
      presence_changed: false,
      task_created: false,
      approval_made: false,
      completion_marked: false,
      person_assigned: false,
      canon_promotion_claimed: false,
    },
    effects: { ...ZERO_EFFECTS },
  };
  assertNoWriteIntent(body, 'instruction');
  return {
    instruction_id: instructionHandle(guidanceDigest(`${INSTRUCTION_PACKET_SCHEMA_VERSION}.instruction`, body)),
    ...body,
  };
}

/**
 * Turns the engine's mission candidates into instructions a person or a sub-agent can act on.
 *
 * @param request `{assessment, work_order, guide_cards, known_at, role_roster?, context_fill?,
 *                 include_next_ready?, top_n?}`
 * @returns `{schema_version, instructions, receipt}` deeply frozen
 */
export function buildInstructionPackets(request) {
  assertExactKeys(request, REQUEST_FIELDS, REQUEST_OPTIONAL_FIELDS, 'request');
  const assessment = readAssessment(request.assessment);
  const work = indexWorkOrder(request.work_order);
  const guide = indexCards(request.guide_cards);
  const { dueByStage, ownerByCapability, notes } = readContextFill(request.context_fill ?? null);
  const knownAt = request.known_at;
  if (!isCanonicalInstant(knownAt)) {
    guidanceFail(GUIDANCE_ERROR_CODES.REQUEST_INVALID, 'request.known_at must be a canonical instant', {});
  }
  const includeNextReady = request.include_next_ready === true;
  const topN = request.top_n ?? 3;
  if (!Number.isSafeInteger(topN) || topN < 0 || topN > MAX.instructions) {
    guidanceFail(GUIDANCE_ERROR_CODES.REQUEST_INVALID, 'request.top_n must be a bounded non-negative integer', {});
  }
  if (request.role_roster !== undefined && request.role_roster !== null) {
    assertPlainObject(request.role_roster, 'request.role_roster');
  }

  const stageCode = assessment.current_stage.stage_code;
  const issueByHandle = new Map(assessment.issues.map((issue) => [issue.issue_handle, issue]));
  // Copied, never recomputed. If this layer ever derived a count of its own, two numbers would be
  // in circulation and the one on the instruction would be the one people read.
  const judgment = {
    policy_ref: assessment.policy_ref ?? null,
    assessment_handle: assessment.assessment_handle,
    assessment_state: assessment.assessment_state,
    project_binding_ref: assessment.project_binding_ref ?? null,
    stage_code: stageCode,
    stage_label: assessment.current_stage.stage_label ?? null,
    requirement_counts: { ...assessment.current_stage.requirement_counts },
    evidence_claim_ceiling: assessment.evidence_claim_ceiling ?? null,
    judgment_changed_by_guidance: false,
  };

  const counts = {
    instructions: 0,
    from_mission_candidates: 0,
    from_next_ready: 0,
    by_engine_finding: {},
    without_guide_card: 0,
    without_work_item: 0,
    with_due_date: 0,
    with_principal: 0,
  };
  const instructions = [];
  const coveredRequirements = new Set();

  assessment.next_mission_candidates.forEach((mission, position) => {
    assertPlainObject(mission, 'assessment.next_mission_candidates[]', GUIDANCE_ERROR_CODES.ASSESSMENT_INVALID);
    const requirementId = mission.subject_id ?? null;
    const workItem = requirementId === null ? null : work.byRequirement.get(requirementId) ?? null;
    const card = requirementId === null ? null : guide.byRequirement.get(requirementId) ?? null;
    if (card === null) counts.without_guide_card += 1;
    if (workItem === null) counts.without_work_item += 1;
    if (requirementId !== null) coveredRequirements.add(requirementId);
    const instruction = buildInstruction({
      kind: 'mission_candidate',
      rank: mission.rank ?? position + 1,
      stageCode: mission.stage_code ?? stageCode,
      workItem,
      card,
      mission,
      issue: issueByHandle.get(mission.issue_handle) ?? null,
      judgment,
      dueByStage,
      ownerByCapability,
      knownAt,
    });
    instructions.push(instruction);
    counts.from_mission_candidates += 1;
  });

  if (includeNextReady) {
    const candidates = work.ordered.filter((item) => item.stage_code === stageCode
      && item.ready === true
      && item.observation_state !== 'present'
      && !coveredRequirements.has(item.engine_requirement_id));
    for (const item of candidates.slice(0, topN)) {
      const card = guide.byRequirement.get(item.engine_requirement_id)
        ?? guide.byToken.get(KEY(item.stage_code, item.artifact_type_id)) ?? null;
      if (card === null) counts.without_guide_card += 1;
      instructions.push(buildInstruction({
        kind: 'next_ready',
        rank: instructions.length + 1,
        stageCode: item.stage_code,
        workItem: item,
        card,
        mission: null,
        issue: null,
        judgment,
        dueByStage,
        ownerByCapability,
        knownAt,
      }));
      counts.from_next_ready += 1;
    }
  }

  for (const instruction of instructions) {
    counts.instructions += 1;
    const finding = instruction.why.engine_finding;
    counts.by_engine_finding[finding] = (counts.by_engine_finding[finding] ?? 0) + 1;
    if (instruction.due !== null) counts.with_due_date += 1;
    if (instruction.who.principal_ref !== null) counts.with_principal += 1;
  }

  const receipt = {
    schema_version: INSTRUCTION_PACKET_SCHEMA_VERSION,
    deterministic: true,
    claim_ceiling: INSTRUCTION_CLAIM_CEILING,
    judgment_changed: false,
    instruction_kinds: [...INSTRUCTION_KINDS],
    forbidden_instruction_keys: [...FORBIDDEN_INSTRUCTION_KEYS],
    context_fill_note: notes,
    input_digests: {
      assessment_handle: assessment.assessment_handle,
      work_order: guidanceDigest(`${INSTRUCTION_PACKET_SCHEMA_VERSION}.work_order`, request.work_order),
      guide_cards: guidanceDigest(`${INSTRUCTION_PACKET_SCHEMA_VERSION}.guide_cards`, guide.cards),
      context_fill: request.context_fill === undefined || request.context_fill === null ? null
        : guidanceDigest(`${INSTRUCTION_PACKET_SCHEMA_VERSION}.context_fill`, request.context_fill),
    },
    output_digests: {
      instructions: guidanceDigest(`${INSTRUCTION_PACKET_SCHEMA_VERSION}.instructions`, instructions),
    },
    counts,
    effects: { ...ZERO_EFFECTS },
  };

  return deepFreeze({ schema_version: INSTRUCTION_PACKET_SCHEMA_VERSION, instructions, receipt });
}
