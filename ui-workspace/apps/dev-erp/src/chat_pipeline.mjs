const PIPELINE_ID = "manual_chat_pipeline_v1";
export const CHAT_CONTEXT_TURNS_DEFAULT = 5;
export const CHAT_CONTEXT_TURNS_MAX = 10;
export const CHAT_RETRIEVAL_LIMIT_DEFAULT = 3;
export const CHAT_RETRIEVAL_LIMIT_MAX = 10;

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function chatPipelineConfig(env = process.env) {
  return {
    context_turns: clampInt(env.ERP_CHAT_CONTEXT_TURNS, CHAT_CONTEXT_TURNS_DEFAULT, 0, CHAT_CONTEXT_TURNS_MAX),
    retrieval_limit: clampInt(env.ERP_CHAT_RETRIEVAL_LIMIT, CHAT_RETRIEVAL_LIMIT_DEFAULT, 1, CHAT_RETRIEVAL_LIMIT_MAX),
    strong_norm: Number.isFinite(Number(env.ERP_CHAT_STRONG_NORM)) ? Number(env.ERP_CHAT_STRONG_NORM) : 0.5,
    strong_score: Number.isFinite(Number(env.ERP_CHAT_STRONG_SCORE)) ? Number(env.ERP_CHAT_STRONG_SCORE) : 2,
    followup_score: Number.isFinite(Number(env.ERP_CHAT_FOLLOWUP_SCORE)) ? Number(env.ERP_CHAT_FOLLOWUP_SCORE) : 0.6,
  };
}

function step(id, status = "ok", data = {}) {
  return { id, status, ...data };
}

function publicTrace(trace) {
  return {
    id: trace.id,
    steps: trace.steps.map((s) => ({ id: s.id, status: s.status })),
    context_used: trace.context_used,
    matched_faq_id: trace.matched_faq_id ?? null,
    mode: trace.mode ?? null,
  };
}

function shouldUseChatHistory(store, question, history = []) {
  if (!history.length) return false;
  const q = String(question ?? "").trim();
  if (!q) return false;
  if (/(그거|그건|그게|그걸|이거|이건|이게|저거|아까|방금|위에서|앞에서|이전|그럼|그러면|그렇게|거기서|다음은|다음엔|이어|다시)/i.test(q)) return true;
  return q.length <= 24 && store._tokenize(q).length <= 2;
}

function contextRetrievalQuestion(question, history = [], contextTurns = CHAT_CONTEXT_TURNS_DEFAULT) {
  const q = String(question ?? "").trim();
  const prior = history.slice(-contextTurns).map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  return prior ? `${prior} ${q}` : q;
}

function faqById(store, id) {
  if (!id) return null;
  return store.faqs().find((f) => f.id === id) || null;
}

function topicWeights(store, historyRows = []) {
  const weights = new Map();
  const n = Math.max(1, historyRows.length);
  historyRows.forEach((row, idx) => {
    const f = faqById(store, row.matched_faq_id);
    const topic = f?.topic;
    if (!topic) return;
    const recency = (idx + 1) / n;
    const weight = 0.25 + (0.75 * recency);
    weights.set(topic, Math.max(weights.get(topic) || 0, weight));
  });
  return weights;
}

function currentQuestionBoost(store, question, faq) {
  const toks = store._tokenize(question);
  if (!toks.length || !faq) return 0;
  const hay = store._tokenize(`${faq.question} ${faq.keywords ?? ""} ${faq.topic ?? ""}`);
  let boost = 0;
  for (const t of toks) {
    if (hay.includes(t)) { boost += 0.9; continue; }
    if (hay.some((h) => h.includes(t) || t.includes(h))) boost += 0.55;
  }
  return boost;
}

function rerankHitsForFollowup(store, hits = [], weights = new Map(), currentQuestion = "") {
  if ((!weights.size && !currentQuestion) || hits.length < 2) return hits;
  return hits.map((h, idx) => ({
    ...h,
    _pipeline_rank: h.score + currentQuestionBoost(store, currentQuestion, h.faq) + (1.2 * (weights.get(h.faq.topic) || 0)),
    _pipeline_order: idx,
  })).sort((a, b) => {
    const delta = b._pipeline_rank - a._pipeline_rank;
    if (Math.abs(delta) > 1e-9) return delta;
    return a._pipeline_order - b._pipeline_order;
  });
}

function makeRetrievalAnswer({ q, hits, top, strong, context_used, contextQuestions, effectiveQuestion, trace }) {
  const candidates = hits.map((h) => ({ id: h.faq.id, topic: h.faq.topic, question: h.faq.question }));
  if (strong) {
    const f = top.faq;
    const text = `${f.answer}${f.pointer ? `\n\n📎 참고: ${f.pointer}` : ""}`;
    return {
      matched: true,
      grounded: true,
      source: { id: f.id, topic: f.topic, question: f.question },
      candidates,
      text,
      context_used,
      context_questions: contextQuestions,
      effective_question: effectiveQuestion,
      pipeline: trace,
      pipeline_public: publicTrace(trace),
    };
  }
  if (hits.length) {
    const lines = hits.map((h) => `· ${h.faq.question}${h.faq.topic ? ` (${h.faq.topic})` : ""}`).join("\n");
    const text = `딱 맞는 매뉴얼 항목을 못 찾았지만, 이런 게 관련 있어 보여요:\n${lines}\n\n이 중 가까운 게 있을까요? 아니면 조금 더 구체적으로 말씀해 주시면 찾아볼게요.`;
    return {
      matched: false,
      grounded: false,
      source: null,
      candidates,
      text,
      context_used,
      context_questions: contextQuestions,
      effective_question: effectiveQuestion,
      pipeline: trace,
      pipeline_public: publicTrace(trace),
    };
  }
  return {
    matched: false,
    grounded: false,
    source: null,
    candidates: [],
    text: null,
    context_used,
    context_questions: contextQuestions,
    effective_question: effectiveQuestion,
    pipeline: trace,
    pipeline_public: publicTrace(trace),
  };
}

export function runManualRetrievalPipeline({ store, question, thread_id = null, actor_ref = null, config = chatPipelineConfig() } = {}) {
  const trace = {
    id: PIPELINE_ID,
    config: { context_turns: config.context_turns, retrieval_limit: config.retrieval_limit },
    steps: [],
    context_used: false,
    matched_faq_id: null,
    mode: null,
  };

  const q = String(question ?? "").trim();
  trace.steps.push(step("normalize", q ? "ok" : "error"));
  if (!q) return { error: "question_required", pipeline: trace, pipeline_public: publicTrace(trace) };

  const historyRows = config.context_turns > 0
    ? store.recentChatQueries({ actor_ref, thread_id, limit: config.context_turns })
    : [];
  const contextQuestions = historyRows.map((x) => x.question);
  const weights = topicWeights(store, historyRows);
  const contextAllowed = config.context_turns > 0 && shouldUseChatHistory(store, q, contextQuestions);
  trace.steps.push(step("context", "ok", { enabled: config.context_turns > 0, turns: contextQuestions.length, allowed: contextAllowed }));

  let effectiveQuestion = q;
  const poolLimit = contextAllowed ? Math.max(config.retrieval_limit, 8) : config.retrieval_limit;
  let hits = rerankHitsForFollowup(store, store.retrieveFaqMany(q, poolLimit), contextAllowed ? weights : new Map(), contextAllowed ? q : "")
    .slice(0, config.retrieval_limit);
  trace.steps.push(step("retrieve", hits.length ? "ok" : "empty", { n: hits.length }));

  if (contextAllowed) {
    trace.context_used = true;
    effectiveQuestion = contextRetrievalQuestion(q, contextQuestions, config.context_turns);
    const contextHits = rerankHitsForFollowup(store, store.retrieveFaqMany(effectiveQuestion, poolLimit), weights, q)
      .slice(0, config.retrieval_limit);
    if (contextHits.length) hits = contextHits;
    trace.steps.push(step("context_retrieve", contextHits.length ? "ok" : "empty", { n: contextHits.length }));
  } else {
    trace.steps.push(step("context_retrieve", "skipped"));
  }

  const top = hits[0] || null;
  const strong = top && (top.norm >= config.strong_norm || top.score >= config.strong_score || (trace.context_used && top.score >= config.followup_score));
  const matchedId = strong ? top.faq.id : null;
  trace.matched_faq_id = matchedId;
  trace.steps.push(step("match", strong ? "ok" : "weak_or_empty", { matched_faq_id: matchedId }));

  store.logChatQuery({ actor_ref, thread_id, question: q, matched_faq_id: matchedId });
  trace.steps.push(step("log", "ok"));

  const result = makeRetrievalAnswer({ q, hits, top, strong, context_used: trace.context_used, contextQuestions, effectiveQuestion, trace });
  if (!result.text) {
    const topics = [...new Set(store.faqs().map((f) => f.topic).filter(Boolean))];
    const hint = topics.length ? ` 참고로 지금 정리된 주제는 ${topics.join(", ")} 쪽이에요.` : "";
    result.text = `아직 매뉴얼에 정리되지 않은 내용이라 정확히 답드리긴 어렵네요. 질문은 저장해 두었고, 야간에 매뉴얼이 보강됩니다.${hint} 혹시 관련된 주제로 다시 여쭤봐 주실래요?`;
  }
  trace.mode = result.matched ? "retrieval_match" : (hits.length ? "retrieval_candidates" : "retrieval_empty");
  trace.steps.push(step("compose_retrieval", "ok"));
  result.pipeline_public = publicTrace(trace);
  return result;
}

export async function runManualAnswerPipeline({
  store,
  question,
  thread_id = null,
  actor_ref = null,
  provider = "stub",
  runLlm,
  buildPrompt,
  config = chatPipelineConfig(),
} = {}) {
  const base = runManualRetrievalPipeline({ store, question, thread_id, actor_ref, config });
  if (base.error) return base;
  const wantLlm = provider && provider !== "stub";
  const hits = store.retrieveFaqMany(base.effective_question || question, config.retrieval_limit);
  base.pipeline.steps.push(step("llm_gate", wantLlm && base.matched && hits.length ? "ok" : "skipped"));
  if (wantLlm && base.matched && hits.length && typeof runLlm === "function" && typeof buildPrompt === "function") {
    const prompt = buildPrompt(question, hits, base.context_questions || []);
    const r = await runLlm({ provider, user: prompt, context: null }, { store });
    if (r.delivered) {
      base.pipeline.mode = "rag";
      base.pipeline.steps.push(step("llm_answer", "ok", { provider, model: r.model ?? null }));
      base.pipeline_public = publicTrace(base.pipeline);
      return { ...base, text: r.text, mode: "rag", external: r.external, provider, model: r.model ?? null, llm: true };
    }
    base.pipeline.steps.push(step("llm_answer", "fallback"));
  } else {
    base.pipeline.steps.push(step("llm_answer", "skipped"));
  }
  base.pipeline.mode = hits.length ? "retrieval" : "retrieval_empty";
  base.pipeline_public = publicTrace(base.pipeline);
  return { ...base, mode: base.pipeline.mode, external: false, provider, model: null, llm: false };
}
