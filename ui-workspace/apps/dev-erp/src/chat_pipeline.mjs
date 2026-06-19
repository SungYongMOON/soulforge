const PIPELINE_ID = "manual_chat_pipeline_v1";
export const CHAT_CONTEXT_TURNS_DEFAULT = 5;
export const CHAT_CONTEXT_TURNS_MAX = 10;
export const CHAT_RETRIEVAL_LIMIT_DEFAULT = 3;
export const CHAT_RETRIEVAL_LIMIT_MAX = 10;

function envBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return !/^(0|false|off|no)$/i.test(String(value).trim());
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function chatPipelineConfig(env = process.env) {
  const think = envBool(env.ERP_CHAT_THINK ?? env.ERP_CHAT_REASONING, false);
  return {
    context_turns: clampInt(env.ERP_CHAT_CONTEXT_TURNS, CHAT_CONTEXT_TURNS_DEFAULT, 0, CHAT_CONTEXT_TURNS_MAX),
    retrieval_limit: clampInt(env.ERP_CHAT_RETRIEVAL_LIMIT, think ? 5 : CHAT_RETRIEVAL_LIMIT_DEFAULT, 1, CHAT_RETRIEVAL_LIMIT_MAX),
    strong_norm: Number.isFinite(Number(env.ERP_CHAT_STRONG_NORM)) ? Number(env.ERP_CHAT_STRONG_NORM) : 0.5,
    strong_score: Number.isFinite(Number(env.ERP_CHAT_STRONG_SCORE)) ? Number(env.ERP_CHAT_STRONG_SCORE) : 2,
    followup_score: Number.isFinite(Number(env.ERP_CHAT_FOLLOWUP_SCORE)) ? Number(env.ERP_CHAT_FOLLOWUP_SCORE) : 0.6,
    llm_assist_weak: envBool(env.ERP_CHAT_LLM_ASSIST_WEAK, true),
    reasoning: think,
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

function hasFollowupMarker(question) {
  const q = String(question ?? "").trim();
  return /(그거|그건|그게|그걸|이거|이건|이게|이걸|저거|아까|방금|이전|앞에서|위에서|전에|방금전|그럼|그러면|그렇게|거기|다음|이어|다시|직접|적어줘|작성해줘|등록해줘|추가해줘|만들어줘|처리해줘|해줘|너가|네가|내용|기억|문맥)/i.test(q);
}

function isContextPriorityQuestion(question) {
  const q = String(question ?? "").trim();
  return hasFollowupMarker(q) || /(계속|방금|아까|이전|같은\s*대화|새\s*대화|새\s*채팅|thread|스레드)/i.test(q);
}

function isChatMemoryQuestion(question) {
  const q = String(question ?? "").trim();
  return /(문맥|기억|이전\s*대화|새\s*대화|새\s*채팅|같은\s*대화|대화방|thread|스레드|몇\s*개|몇개)/i.test(q)
    && /(기억|문맥|대화|채팅|thread|스레드|이어|계속|몇)/i.test(q);
}

function shouldUseChatHistory(store, question, history = []) {
  if (!history.length) return false;
  const q = String(question ?? "").trim();
  if (!q) return false;
  if (hasFollowupMarker(q)) return true;
  if (q.length <= 36 && /(줘|해줘|해봐|적어|작성|등록|추가|만들|처리|기억|문맥)/i.test(q)) return true;
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

function isStrongHit(hit, config, contextual = false) {
  return !!hit && (
    hit.norm >= config.strong_norm ||
    hit.score >= config.strong_score ||
    (contextual && hit.score >= config.followup_score)
  );
}

function isPinnedCurrentHit(hit, config) {
  return !!hit && (
    hit.norm >= Math.max(0.85, config.strong_norm) ||
    hit.score >= Math.max(3, config.strong_score)
  );
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

function isChatAlivePing(question) {
  const q = String(question ?? "").trim().toLowerCase();
  const compact = q.replace(/[?!?.。！？~\s]/g, "");
  return /^(너)?(되니|되냐|돼|살아있어|살아있니|작동해|응답해|응답가능|대답해|대답가능|연결됐어|테스트|핑|ping|alive|online)$/.test(compact);
}

function runtimeDirectAnswer(question, config = chatPipelineConfig(), contextQuestions = []) {
  const q = String(question ?? "");
  if (isChatAlivePing(q)) {
    return [
      "네, 응답하고 있어요.",
      "ERP 사용법, 화면 위치, 과제/메일/산출물 처리처럼 실제 업무 질문을 이어서 물어보시면 바로 안내할게요.",
    ].join("\n\n");
  }
  if (isChatMemoryQuestion(q)) {
    const turns = Number.isFinite(Number(config.context_turns)) ? Number(config.context_turns) : CHAT_CONTEXT_TURNS_DEFAULT;
    const current = contextQuestions.length;
    return [
      `지금 설정은 같은 로그인 사용자와 같은 대화에서 최근 ${turns}개 질문을 이어묻기 문맥으로 봅니다.`,
      "새 대화 버튼이나 `/new`를 누르면 새 대화가 시작되어 이전 문맥을 일부러 섞지 않습니다. 반대로 버튼을 누르지 않으면 같은 대화로 이어져야 합니다.",
      current
        ? `이번 요청에서는 이 대화에 저장된 이전 질문 ${Math.min(current, turns)}개를 확인할 수 있습니다.`
        : "이번 요청에서는 아직 같은 대화의 이전 질문이 없거나, 새 대화로 시작된 상태입니다.",
    ].join("\n\n");
  }
  if (/(추론|reasoning|think|품질|질\s*.*떨어|답변.*빠르|답.*짧|더\s*자세)/i.test(q)) {
    return [
      "가능해요. 운영자가 품질 모드로 켜면 로컬 Gemma/Ollama 호출에 추론을 사용하게 할 수 있습니다.",
      "다만 팀원이 직접 바꾸는 설정은 아니고, 켜면 답변은 더 느려질 수 있어요.",
      "운영자에게는 `ERP_CHAT_THINK=1`, 충분한 timeout/queue wait, 더 넉넉한 토큰 설정으로 전달하면 됩니다.",
    ].join("\n\n");
  }
  return null;
}

export function runManualRetrievalPipeline({ store, question, thread_id = null, actor_ref = null, config = chatPipelineConfig() } = {}) {
  const trace = {
    id: PIPELINE_ID,
    config: { context_turns: config.context_turns, retrieval_limit: config.retrieval_limit, llm_assist_weak: config.llm_assist_weak, reasoning: config.reasoning || false },
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
  const contextPriority = isContextPriorityQuestion(q);
  trace.steps.push(step("context", "ok", { enabled: config.context_turns > 0, turns: contextQuestions.length, allowed: contextAllowed, priority: contextPriority }));

  let effectiveQuestion = q;
  const poolLimit = contextAllowed ? Math.max(config.retrieval_limit, 8) : config.retrieval_limit;
  let hits = rerankHitsForFollowup(store, store.retrieveFaqMany(q, poolLimit), contextAllowed ? weights : new Map(), contextAllowed ? q : "")
    .slice(0, config.retrieval_limit);
  const directPinned = isPinnedCurrentHit(hits[0], config);
  trace.steps.push(step("retrieve", hits.length ? "ok" : "empty", { n: hits.length }));

  if (contextAllowed) {
    const contextQuestion = contextRetrievalQuestion(q, contextQuestions, config.context_turns);
    const contextHits = rerankHitsForFollowup(store, store.retrieveFaqMany(contextQuestion, poolLimit), weights, q)
      .slice(0, config.retrieval_limit);
    if (contextHits.length && (contextPriority || !directPinned)) {
      hits = contextHits;
      effectiveQuestion = contextQuestion;
      trace.context_used = true;
    }
    trace.steps.push(step("context_retrieve", contextHits.length ? "ok" : "empty", { n: contextHits.length }));
  } else {
    trace.steps.push(step("context_retrieve", "skipped"));
  }

  const top = hits[0] || null;
  const runtimeText = runtimeDirectAnswer(q, config, contextQuestions);
  const strong = runtimeText ? false : isStrongHit(top, config, trace.context_used);
  const matchedId = strong ? top.faq.id : null;
  trace.matched_faq_id = matchedId;
  trace.steps.push(step("match", strong ? "ok" : "weak_or_empty", { matched_faq_id: matchedId }));

  store.logChatQuery({ actor_ref, thread_id, question: q, matched_faq_id: matchedId });
  trace.steps.push(step("log", "ok"));

  if (runtimeText) {
    trace.mode = "runtime_direct";
    trace.steps.push(step("compose_runtime", "ok"));
    return {
      matched: false,
      grounded: false,
      source: null,
      candidates: [],
      text: runtimeText,
      runtime_direct: true,
      context_used: trace.context_used,
      context_questions: contextQuestions,
      effective_question: effectiveQuestion,
      pipeline: trace,
      pipeline_public: publicTrace(trace),
    };
  }

  const result = makeRetrievalAnswer({ q, hits, top, strong, context_used: trace.context_used, contextQuestions, effectiveQuestion, trace });
  if (!result.text) {
    const topics = [...new Set(store.faqs().map((f) => f.topic).filter(Boolean))].slice(0, 8);
    const hint = topics.length ? ` 지금은 ${topics.join(", ")} 같은 주제를 잘 답합니다.` : "";
    result.text = `아직 매뉴얼에 정리되지 않은 질문이에요. 질문은 저장해 두었고 야간 보강 대상에 들어갑니다.${hint} 화면 이름이나 하고 싶은 일을 한 단어만 더 붙여 다시 물어봐 주세요.`;
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
  if (base.runtime_direct) {
    base.pipeline.steps.push(step("llm_gate", "skipped", { reason: "runtime_direct" }));
    base.pipeline.steps.push(step("llm_answer", "skipped"));
    base.pipeline_public = publicTrace(base.pipeline);
    return { ...base, mode: "runtime_direct", external: false, provider, model: null, llm: false, handled_by_runtime: true };
  }
  const promptHits = (base.candidates || [])
    .map((c) => faqById(store, c.id))
    .filter(Boolean)
    .map((faq, idx) => ({ faq, score: Math.max(0, config.retrieval_limit - idx), norm: 1 }));
  const canLlm = wantLlm && typeof runLlm === "function" && typeof buildPrompt === "function";
  const shouldLlm = canLlm && (base.matched || config.llm_assist_weak);
  base.pipeline.steps.push(step("llm_gate", shouldLlm ? "ok" : "skipped", { matched: base.matched, weak_assist: !base.matched && !!config.llm_assist_weak }));
  if (shouldLlm) {
    const prompt = buildPrompt(question, promptHits, base.context_questions || [], {
      matched: base.matched,
      source_id: base.source?.id ?? null,
      candidates: base.candidates || [],
      mode: base.matched ? "grounded" : "assist",
    });
    const r = await runLlm({ provider, user: prompt, context: null }, { store });
    if (r.delivered) {
      base.pipeline.mode = base.matched ? "rag" : "llm_assist";
      base.pipeline.steps.push(step("llm_answer", "ok", { provider, model: r.model ?? null }));
      base.pipeline_public = publicTrace(base.pipeline);
      return {
        ...base,
        text: r.text,
        candidates: base.matched ? base.candidates : [],
        mode: base.pipeline.mode,
        external: r.external,
        provider,
        model: r.model ?? null,
        reasoning: r.reasoning || false,
        llm: true,
        handled_by_llm: !base.matched,
      };
    }
    base.pipeline.steps.push(step("llm_answer", "fallback"));
  } else {
    base.pipeline.steps.push(step("llm_answer", "skipped"));
  }
  base.pipeline.mode = promptHits.length ? "retrieval" : "retrieval_empty";
  base.pipeline_public = publicTrace(base.pipeline);
  return { ...base, mode: base.pipeline.mode, external: false, provider, model: null, llm: false };
}
