// Experimental 맥락이 profile. v0.9 §4 B gives the model the request meaning,
// the check questions, the search choice per question, the sufficiency judgment
// and the written sections; v0.9 §14 keeps prompts, question strategy and the
// additional-search policy as test-time variables. Its budget is a default
// under the program ceiling (PLANNER_BUDGET_CEILING); it carries no endpoint or
// grant, and it cannot relax citation enforcement, coverage reporting or the
// claim ceiling, which the program owns.
const SECTIONS = ['background', 'work_history', 'decisions', 'reusable', 'impact'];
const TEXT = { type: 'string' };
const SEARCH = { type: 'object', required: ['question_id', 'mode', 'query'], properties: {
  question_id: TEXT, mode: { type: 'string', enum: ['lexical', 'exact', 'graph'] }, query: TEXT } };
const STATEMENT = { type: 'object', required: ['text', 'kind', 'evidence'], properties: {
  text: TEXT, kind: { type: 'string', enum: ['fact', 'claim', 'interpretation', 'unknown'] },
  evidence: { type: 'array', items: TEXT } } };

export const CONTEXT_PLANNER_PROFILE = Object.freeze({
  profile_id: 'context-engine/context-planner-v1',
  profile_version: '0.1.0',
  sections: SECTIONS,
  budget: Object.freeze({ max_model_calls: 4, max_search_rounds: 2, max_searches_per_round: 6, max_evidence: 12,
    max_evidence_characters: 12000, max_questions: 8, max_statements_per_section: 8, max_statement_characters: 600 }),
  prompts: Object.freeze({
    plan: [
      '너는 맥락이다. 수행자가 새 요청을 받아 착수하기 전에 되짚어야 할 것을 찾도록 돕는다.',
      '입력의 request_text와 task_purpose를 읽고 JSON으로만 답한다.',
      '- deliverables: 요청이 만들어 달라는 산출물이나 확인 대상(없으면 빈 목록).',
      '- questions: 착수 전에 확인할 질문(id는 q1, q2 …). 이미 한 일인지, 무엇의 후속인지, 관련 결정·정정·취소·충돌,',
      '  작성·제출 이력, 재사용할 자료·방법, 먼저 확인할 사항을 필요한 만큼만 다룬다.',
      '- searches: 질문마다 검색 방법. lexical은 명칭·번호·핵심 단어 검색이며 query에 그 단어를 쓴다.',
      '  exact는 catalog에 있는 item_id를 query에 그대로 쓴다. graph는 표현이 다른 내용이나 연결 관계를 찾는 의미 검색이다.',
      'catalog에 없는 item_id를 만들지 않는다. 자료 내용을 추측해 사실처럼 쓰지 않는다.',
    ].join('\n'),
    review: [
      '너는 맥락이다. questions와 지금까지 모은 evidence(E1, E2 …)를 보고 JSON으로만 답한다.',
      '- answered: evidence로 답할 수 있는 질문 id.',
      '- missing: 아직 근거가 부족한 질문 id와 부족한 이유.',
      '- searches: 부족한 질문을 위한 추가 검색(형식은 계획 때와 같다). 더 찾을 것이 없으면 빈 목록.',
      'evidence에 없는 내용을 있다고 하지 않는다.',
    ].join('\n'),
    compose: [
      '너는 맥락이다. 수행자가 이 작업에 쓸 맥락을 evidence만으로 정리해 JSON으로만 답한다.',
      'sections의 각 절은 문장 목록이다.',
      '- background: 요청 배경과 무엇의 후속인지.',
      '- work_history: 관련 기존 업무와 진행·작성·제출 이력.',
      '- decisions: 결정·제안·정정·취소·충돌과 그 시간순 변화(시각이 있으면 쓴다).',
      '- reusable: 재사용할 작성본·자료·조사·절차·선례와 그 판본.',
      '- impact: 작업에 미치는 영향과 먼저 확인할 사항.',
      '문장마다 kind를 붙인다. fact는 evidence로 확인된 사실, claim은 자료가 주장하거나 요청한 내용,',
      'interpretation은 너의 해석, unknown은 확인되지 않은 것이다.',
      'fact와 claim에는 뒷받침하는 evidence id를 반드시 넣는다. evidence에 없는 내용은 fact나 claim으로 쓰지 않는다.',
      '답하지 못한 질문과 더 확인할 것은 open_questions에 쓴다. 해당 내용이 없는 절은 빈 목록으로 둔다.',
    ].join('\n'),
  }),
  schemas: Object.freeze({
    plan: { type: 'object', required: ['deliverables', 'questions', 'searches'], properties: {
      deliverables: { type: 'array', items: TEXT },
      questions: { type: 'array', items: { type: 'object', required: ['id', 'text'], properties: { id: TEXT, text: TEXT } } },
      searches: { type: 'array', items: SEARCH } } },
    review: { type: 'object', required: ['answered', 'missing', 'searches'], properties: {
      answered: { type: 'array', items: TEXT },
      missing: { type: 'array', items: { type: 'object', required: ['question_id', 'reason'], properties: { question_id: TEXT, reason: TEXT } } },
      searches: { type: 'array', items: SEARCH } } },
    compose: { type: 'object', required: ['sections', 'open_questions'], properties: {
      sections: { type: 'object', required: SECTIONS, properties: Object.fromEntries(SECTIONS.map(name => [name, { type: 'array', items: STATEMENT }])) },
      open_questions: { type: 'array', items: TEXT } } },
  }),
});
