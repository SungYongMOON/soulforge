// Relation judgement profile (rule R1). A local model reads two units of two
// different records and says what, if anything, connects them. It is asked for one
// pair at a time and for one answer shape; it never writes, never searches, and
// never sees more than the two units and the context the program hands it.
//
// The profile exists so the prompt and the answer shape have a version: a relation
// in the graph names the digest of this prompt and schema, so an edge made under
// one wording is never read as an edge made under another. Changing a word here is
// a new profile_version.
//
// The five kinds are deliberately few and deliberately include three that link
// nothing. "Same subject", "material one needs to read the other" and "merely
// alike" are different claims, and the last is not a reason to join two records.
const TEXT = { type: 'string' };
const EVIDENCE = { type: 'object', required: ['unit_id', 'quote'], properties: { unit_id: TEXT, quote: TEXT } };

export const RELATION_KINDS = Object.freeze(['same_test_context', 'condition_material_for', 'similar_topic',
  'insufficient', 'different_event']);
// Only these two are ever written as an edge. The others are answers to keep, not
// relations to assert.
export const LINKABLE_RELATION_KINDS = Object.freeze(['same_test_context', 'condition_material_for']);
export const RELATION_DIRECTIONS = Object.freeze(['a_to_b', 'b_to_a', 'symmetric']);

export const RELATION_JUDGEMENT_PROFILE = Object.freeze({
  profile_id: 'context-engine/relation-judgement-v1',
  profile_version: '0.1.0',
  relation_kinds: RELATION_KINDS,
  linkable_relation_kinds: LINKABLE_RELATION_KINDS,
  directions: RELATION_DIRECTIONS,
  // One call per pair, plus room for a retry. The program lowers this further.
  budget: Object.freeze({ max_model_calls: 6 }),
  prompt: [
    '너는 두 기록이 같은 업무를 이해하는 데 어떻게 이어지는지 판단한다. JSON으로만 답한다.',
    '입력의 record_a와 record_b는 서로 다른 자료의 한 단위이며, 각각 제목·과제·시각·앞뒤 단위 맥락이 함께 온다.',
    '',
    '먼저 각 기록이 다루는 업무·장비·시험·문제가 무엇인지 스스로 정한 뒤 relation_kind를 하나 고른다.',
    '- same_test_context: 두 기록이 같은 시험·같은 사건을 다룬다.',
    '- condition_material_for: 한쪽이 다른 쪽 업무를 확인·검증하는 데 필요한 조건·배치·절차 자료다.',
    '- similar_topic: 주제가 비슷할 뿐 같은 사건도, 서로에게 필요한 자료도 아니다.',
    '- insufficient: 본문만으로는 가를 근거가 부족하다.',
    '- different_event: 날짜나 장비 이름이 겹치더라도 서로 다른 사건이다.',
    '',
    'direction은 관계가 읽히는 방향이다. a_to_b는 A에서 B로, b_to_a는 B에서 A로, symmetric은 양쪽이 대등하다.',
    'condition_material_for에서는 "조건 자료인 쪽 → 그 조건을 쓰는 쪽" 방향으로 적는다.',
    '',
    'evidence_a와 evidence_b에는 그 판단을 뒷받침하는 구절을 **본문에서 그대로 옮겨** 적고, 그 구절이 있는 unit_id를 적는다.',
    '본문에 없는 문장을 지어내거나 요약해 쓰지 않는다. 옮길 구절이 없으면 relation_kind를 insufficient로 한다.',
    '',
    'counter_conditions에는 같은 사건으로 보면 안 되는 이유가 될 만한 것을 적는다.',
    '같은 날짜지만 다른 시험, 같은 장비지만 다른 판본·조건, 게시일과 본문이 가리키는 시험일의 차이 같은 것이다.',
    'unresolved에는 본문만으로 확정할 수 없는 것을 적는다.',
    '',
    '날짜가 같다는 것만으로, 또는 이름·제목이 비슷하다는 것만으로 same_test_context를 고르지 않는다.',
    '연결하더라도 원인·결과, 완료·승인, 두 수치의 직접 비교 가능성까지는 판단하지 않는다.',
    '본문의 "그 시험", "지난번 조건" 같은 표현을 맥락 없이 독립된 사실로 읽지 않는다.',
  ].join('\n'),
  schema: Object.freeze({
    type: 'object',
    required: ['subject_a', 'subject_b', 'relation_kind', 'direction', 'evidence_a', 'evidence_b',
      'counter_conditions', 'unresolved'],
    properties: {
      subject_a: TEXT,
      subject_b: TEXT,
      relation_kind: { type: 'string', enum: [...RELATION_KINDS] },
      direction: { type: 'string', enum: [...RELATION_DIRECTIONS] },
      evidence_a: EVIDENCE,
      evidence_b: EVIDENCE,
      counter_conditions: { type: 'array', items: TEXT },
      unresolved: { type: 'array', items: TEXT },
    },
  }),
});
