// A3: LLM 어댑터 + Codex CLI 브릿지.
// 불변 가드레일: 컨텍스트는 **메타/요약만**(원문 본문·첨부 미포함). 외부전송은
// codex_cli provider(tool_pc 로컬 백엔드)에서만, owner 승인분에 한해. sandbox 기본은
// stub(외부전송 0). 회의록 자동추출·첨부 기반 보고서 등 원문 필요 기능은 갈림길⑨로 보류.

import { runManualAnswerPipeline } from "./chat_pipeline.mjs";

export const CHATBOT_VERSION = Object.freeze({
  release: "v1.1.3",
  build: "chatbot-2026.06.18-stability.11",
  source: "src/llm.mjs"
});

const WEEK_MS = 6 * 86400000;

function envBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return !/^(0|false|off|no)$/i.test(String(value).trim());
}

function numberEnv(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function chatLlmRuntimeConfig(env = process.env) {
  const think = envBool(env.ERP_CHAT_THINK ?? env.ERP_CHAT_REASONING, false);
  return {
    think,
    model: env.ERP_CHAT_MODEL || "gemma3:4b",
    timeout_ms: numberEnv(env.ERP_CHAT_TIMEOUT_MS, think ? 45000 : 20000, { min: 1000, max: 180000 }),
    max_tokens: numberEnv(env.ERP_CHAT_MAX_TOKENS, think ? 1536 : 320, { min: 64, max: 4096 }),
    temperature: numberEnv(env.ERP_CHAT_TEMPERATURE, think ? 0.15 : 0.2, { min: 0, max: 2 }),
    keep_alive: env.ERP_CHAT_KEEP_ALIVE || "30m",
  };
}

// ── 다중 사용자 동시 질문 게이트(로컬 작은 모델 보호) ───────────────────────
// 다른 PC 의 단일 Ollama 인스턴스를 팀이 공유하면, 동시 요청이 몰릴 때 모델이
// 과부하·지연된다. ERP 서버(단일 프로세스)에서 인프로세스 세마포어로 동시
// 실행 수를 제한(기본 1)하고, 대기 한도를 넘으면 '검색 폴백'으로 떨어뜨려
// 어떤 사용자도 무한 대기/끊김을 겪지 않게 한다(기초설계: LOCAL_LLM_MULTIUSER_DESIGN).
export function llmThinkEnabled(env = process.env) {
  return chatLlmRuntimeConfig(env).think;
}

const CHAT_THINK_ENABLED = chatLlmRuntimeConfig().think;
const LLM_CONCURRENCY = Math.max(1, Number(process.env.ERP_LLM_CONCURRENCY || 1));
const LLM_QUEUE_WAIT_MS = Number(process.env.ERP_LLM_QUEUE_WAIT_MS || (CHAT_THINK_ENABLED ? 45000 : 8000));
let _llmActive = 0;
const _llmWaiters = [];
function _acquire(waitMs) {
  if (_llmActive < LLM_CONCURRENCY) { _llmActive++; return Promise.resolve(true); }
  return new Promise((resolve) => {
    const w = { resolve, timer: null };
    w.timer = setTimeout(() => {
      const i = _llmWaiters.indexOf(w);
      if (i >= 0) _llmWaiters.splice(i, 1);
      resolve(false);                      // 대기 초과 → 폴백 신호
    }, Math.max(0, waitMs));
    _llmWaiters.push(w);
  });
}
function _release() {
  const w = _llmWaiters.shift();
  if (w) { clearTimeout(w.timer); w.resolve(true); }  // 슬롯을 다음 대기자에게 인계(active 유지)
  else _llmActive = Math.max(0, _llmActive - 1);
}
// 동시성 제한 큐. 슬롯을 얻으면 fn 실행, 대기 초과면 {queued_timeout:true} 반환(미실행).
export async function runQueued(fn, { waitMs = LLM_QUEUE_WAIT_MS } = {}) {
  const got = await _acquire(waitMs);
  if (!got) return { queued_timeout: true };
  try { return await fn(); } finally { _release(); }
}
export function llmQueueStats() { return { active: _llmActive, waiting: _llmWaiters.length, concurrency: LLM_CONCURRENCY }; }

// 메타/요약 컨텍스트 — 과제 카운트·이벤트 종류·메일 메타(제목/방향/시각)만. 본문/첨부 0.
export function buildMetaContext(store, { project = null, days = 30 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + WEEK_MS).toISOString().slice(0, 10);
  const projects = store.summary(today, weekEnd).filter((p) => !project || p.id === project);
  const events = store.recentEvents(50, project);
  const eventKindCounts = {};
  for (const e of events) eventKindCounts[e.kind] = (eventKindCounts[e.kind] || 0) + 1;
  const mailMeta = store.mail({ project, days }).slice(0, 20)
    .map((m) => ({ at: m.at, dir: m.direction, subject: m.subject })); // subject=메타(본문 아님)
  return {
    kind: "meta_summary_only",          // 원문 미포함 표식(가드)
    generated_at: new Date().toISOString(),
    scope: { project: project ?? "all", days },
    projects: projects.map((p) => ({ id: p.id, title: p.title, open: p.open, blocked: p.blocked, overdue: p.overdue, due_today: p.due_today })),
    event_kind_counts: eventKindCounts,
    recent_mail_meta: mailMeta
  };
}

export function contextToText(ctx) {
  if (!ctx) return "";
  const ps = ctx.projects.map((p) => `- ${p.id} ${p.title}: 미완 ${p.open}, 차단 ${p.blocked}, 연체 ${p.overdue}, 오늘 ${p.due_today}`).join("\n");
  const ev = Object.entries(ctx.event_kind_counts).map(([k, n]) => `${k}:${n}`).join(", ");
  const ml = ctx.recent_mail_meta.slice(0, 5).map((m) => `· ${m.subject}`).join("\n");
  return `[메타 요약 — 원문 미포함]\n과제:\n${ps}\n최근 활동(종류): ${ev}\n최근 메일(제목만):\n${ml}`;
}

// 결정적 stub 응답(외부전송 0). tool_pc 미가용 환경/기본값.
function stubAnswer(user, ctx) {
  const head = `질문: ${String(user ?? "").slice(0, 200)}`;
  const body = ctx ? contextToText(ctx) : "(컨텍스트 없음)";
  return `${head}\n\n${body}\n\n※ 이 응답은 로컬 stub(외부전송 0)입니다. 실제 LLM 답변은 tool_pc Codex CLI 연결 후 제공됩니다.`;
}

function visibleOllamaText(json) {
  let text = String(json?.response ?? "").trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^\s*(thinking process|thought process)\s*:\s*[\s\S]*?(?:\n\s*\n|$)/i, "").trim();
  return text;
}

async function fetchOllamaGenerate(host, payload, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify(payload),
    });
    if (resp.ok === false) { // HTTP 404/500(모델 없음·OOM)을 성공으로 위장하지 않음 — 호출부 catch 로 전파(실 Response만; mock은 ok undefined)
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `ollama HTTP ${resp.status}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── RAG 챗봇: 검색(매뉴얼) → LLM이 '그 근거 안에서만' 표현 ──────────────
// owner 의도: LLM은 기본 동작하되 '메뉴얼을 보고' 답한다(추론으로 새 사실 X).
// 로컬 작은 모델이 붙으면 grounded 프롬프트로 사람처럼 표현, 없으면 검색 폴백.

// 검색된 매뉴얼 조각 + 런타임 원칙을 담는 프롬프트.
// ERP 사실은 매뉴얼 근거 안에서만, 챗봇 자체/사용자 반응은 런타임 원칙으로 답하게 한다.
function runtimeIntentKind(question) {
  const q = String(question ?? "");
  if (/(추론|reasoning|think|품질|질\s*.*떨어|너무\s*빠르|답변.*빠르|답.*짧|더\s*자세)/i.test(q)) {
    return "quality";
  }
  if (/(설정할\s*수\s*없|내가\s*설정|권한.*없)/i.test(q)) {
    return "settings";
  }
  return "";
}

function runtimeIntentHint(question) {
  const kind = runtimeIntentKind(question);
  if (kind === "quality") {
    return [
      "현재 사용자 의도 힌트: 사용자는 ERP 기능 사실이 아니라 챗봇 답변 품질과 추론/품질 모드 가능 여부를 묻고 있다.",
      "Intent hint: the user asks whether reasoning/quality mode can be enabled because answers feel too fast or low quality; answer in Korean that it is possible as an operator setting, slower, and not a normal team-member action.",
    ].join("\n");
  }
  if (kind === "settings") {
    return "현재 사용자 의도 힌트: 사용자는 팀원이 직접 바꿀 수 없는 설정을 지적하고 있으므로, 먼저 인정하고 관리자/운영자 전달 항목으로 안내한다.";
  }
  return "";
}

export function buildManualPrompt(question, hits, history = [], options = {}) {
  const intentKind = runtimeIntentKind(question);
  const intentHint = runtimeIntentHint(question);
  if (intentKind === "quality" && !options.matched) {
    return [
      "너는 사내 ERP 챗봇의 로컬 LLM 안내원이다.",
      "반드시 자연스러운 한국어로만 답한다.",
      "사용자 의도: 답변이 너무 빠르고 품질이 낮아 보여서 추론/품질 모드를 켤 수 있는지 묻고 있다.",
      "답변해야 할 핵심: 가능하다. 운영자가 ERP_CHAT_THINK=1 품질 모드로 켤 수 있다.",
      "주의: 일반 팀원에게 서버 환경변수나 Ollama 설정을 직접 바꾸라고 말하지 말고, 운영자 설정 또는 관리자에게 전달할 항목이라고 말한다.",
      "트레이드오프: 품질 모드는 더 느려질 수 있으므로 답변 준비중 표시와 충분한 대기 시간이 필요하다.",
      "형식: 2~3개의 짧은 문단으로 답하고, 내부 사고 과정이나 [자료] 라벨은 쓰지 마라.",
      "",
      intentHint,
      "",
      `질문: ${question}`,
    ].join("\n");
  }
  const snippets = hits.map((h, i) =>
    `[자료 ${i + 1}] (${h.faq.topic ?? "일반"}) Q:${h.faq.question}\nA:${h.faq.answer}`).join("\n\n");
  const prior = history.length
    ? `이전 질문(같은 사용자·같은 대화 안에서만, 현재 질문 해석 보조용):\n${history.map((h) => `- ${h}`).join("\n")}\n`
    : "";
  const searchState = options.matched
    ? `검색 상태: 매뉴얼 항목이 강하게 매칭됨${options.source_id ? ` (${options.source_id})` : ""}.`
    : "검색 상태: 강한 매뉴얼 매칭은 없음. 후보는 참고만 하고, 억지로 특정 항목에 끼워 맞추지 말 것.";
  return [
    "너는 사내 ERP 사용을 돕는 로컬 LLM 안내원이다.",
    "반드시 자연스러운 한국어로 답하고, 영어로 답하지 마라.",
    "답변은 다음 두 근거 중 하나로만 한다: (1) 아래 [자료]의 ERP 매뉴얼 조각, (2) 아래 [챗봇 런타임 원칙].",
    "ERP 기능·화면·권한·데이터 사실은 [자료]에 있을 때만 답하고, 자료에 없는 ERP 사실은 지어내지 마라.",
    "사용자가 챗봇 자체의 상태·능력·답변 품질·오류·멈춤·설정 불가·질문 방법을 말하면 [챗봇 런타임 원칙]으로 자연스럽게 답해라. 이런 말을 매뉴얼 FAQ에 끼워 맞추지 마라.",
    "사용자가 '너 살아있어?/작동해?/대답 가능해?'처럼 단순 상태 확인만 하면 장애 상황으로 과장하지 말고, '네, 응답하고 있어요'라고 확인한 뒤 ERP 사용법 질문을 받을 수 있다고 말해라.",
    "사용자가 '멈춤/오류/응답 없음/계속 질문하니 멈춤'을 말하면 답변 품질 불만보다 장애·대기 상황으로 우선 해석해라.",
    "멈춤/오류 답변에는 연속으로 계속 보내지 말기, 잠시 기다린 뒤 같은 질문 한 번만 다시 보내기, 반복되면 새 대화 또는 관리자 전달을 포함해라.",
    "사용자가 '너무 빠름/너무 짧음/더 자세히'를 말할 때만 답변 길이·자세함 문제로 해석해라.",
    "사용자가 '내가 설정할 수 없는 것'이라고 반박하면 먼저 그 지적을 인정하고, 팀원이 직접 바꾸는 설정이 아니라면 관리자/운영자에게 전달해야 한다고 말해라.",
    "현재 사용자 의도 힌트가 있으면 강한 매뉴얼 매칭이 없어도 그 힌트를 우선하고, 화면 이름을 더 달라고 되묻지 마라.",
    "강한 매뉴얼 매칭이 없으면 후보 질문을 정답처럼 단정하지 마라. 사용자가 어떤 화면/업무를 말하는지 모르면 한 단어만 더 달라고 물어봐라.",
    "일반 팀원에게 서버 환경변수·Ollama·LLM 설정을 직접 하라고 말하지 마라. 그런 내용은 관리자/운영자에게 전달할 항목으로 바꿔 말해라.",
    "이전 질문은 '그거/아까/그러면' 같은 말을 해석할 때만 참고하고, 답변 근거로 쓰지 마라.",
    "한 문단으로 길게 붙여 쓰지 마라. 답변은 짧은 문단 2~3개로 나누고, 각 문단은 1문장만 써라.",
    "전체 답변은 가능하면 250자 안팎으로 줄이고, 절차가 필요할 때만 최대 3줄 목록으로 말해라.",
    "다만 사용자가 답변 품질이 낮다, 너무 짧다, 더 자세히 말해 달라고 하거나 질문이 복합적이면 400~600자까지 허용하고 핵심/이유/다음 행동을 나눠라.",
    "더 긴 설명이 필요하면 마지막에 어느 부분을 더 볼지 한 가지만 물어봐라.",
    "답변에는 '[자료 1]' 같은 내부 근거 라벨을 쓰지 마라.",
    "",
    searchState,
    intentHint,
    "",
    "[챗봇 런타임 원칙]",
    "- 이 챗봇은 ERP 매뉴얼과 운영 원칙을 바탕으로 사용법을 안내한다.",
    "- 단순 상태 확인에는 '네, 응답하고 있어요'처럼 짧게 답하고, 멈춤·오류 대응은 사용자가 실제로 멈춤/오류를 말할 때만 안내한다.",
    "- 팀원이 할 수 있는 일은 질문을 더 구체화하거나, 같은 질문을 한 번만 다시 보내거나, 새 대화를 눌러 새 흐름을 시작하거나, 반복 문제의 질문/시각을 관리자에게 전달하는 것이다.",
    "- 팀원은 ERP_CHAT_* 값, OLLAMA_HOST, 모델 태그, 서버 큐 같은 운영 설정을 직접 바꾸지 않는다.",
    "- 팀원이 바꿀 수 없는 설정을 지적하면, 팀원이 직접 설정할 일이 아니라고 인정하고 관리자/운영자 전달로 안내한다.",
    "- 응답이 멈춘 것처럼 보이면 연속 클릭을 하지 말고 잠시 기다린 뒤 같은 질문을 한 번만 다시 보내며, 반복되면 새 대화와 관리자 전달로 처리한다.",
    "- 답이 너무 짧거나 빠르게 느껴지면 '더 자세히', '팀원이 누르는 순서대로', '예시를 들어서'처럼 이어서 요청할 수 있다.",
    "- 챗봇이 할 수 있는 일은 ERP 화면 위치, 버튼 의미, 과제·메일·산출물·승인·감사로그 같은 사용법을 안내하는 것이다. 매뉴얼에 없는 ERP 사실은 보강 대상으로 남긴다.",
    "",
    prior,
    snippets ? `[자료]\n${snippets}` : "[자료]\n(강한 관련 자료 없음)",
    "",
    intentHint ? `[질문 의도]\n${intentHint}` : "",
    "",
    `질문: ${question}`
  ].join("\n");
}

// 챗봇 진입점. provider!="stub"이고 외부 호출이 실제 성공하면 LLM 표현,
// 그 외에는 store.chatAnswer 의 검색 기반 사람형 폴백을 그대로 쓴다(절대 끊기지 않음).
export async function answerFromManual({ store, question, thread_id = null, actor_ref = null, provider = "stub" } = {}) {
  return runManualAnswerPipeline({ store, question, thread_id, actor_ref, provider, runLlm, buildPrompt: buildManualPrompt });
}

// 로컬 Ollama 호출(owner PC의 localhost — 인터넷 외부전송 아님). 타임아웃+실패 시 폴백.
// 모델은 ERP_CHAT_MODEL(예: gemma2:2b / gemma2:9b / gemma3:4b 등), 호스트는 OLLAMA_HOST.
async function callOllama(prompt, runtime = chatLlmRuntimeConfig()) {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const model = runtime.model; // 공통 기본값(맥미니 M4·회사 NVIDIA 둘 다 적합)
  try {
    // 기본은 안정 모드(think=false). ERP_CHAT_THINK=1이면 thinking 계열 모델의 추론을 켜되 visibleOllamaText에서 내부 사고는 숨긴다.
    const j = await fetchOllamaGenerate(host, {
      model, prompt, stream: false, think: runtime.think, keep_alive: runtime.keep_alive,
      options: { temperature: runtime.temperature, num_predict: runtime.max_tokens },
    }, runtime.timeout_ms);
    let text = visibleOllamaText(j);
    if (!text && runtime.think && String(j?.thinking ?? "").trim()) {
      const finalPrompt = `${prompt}\n\n위 지침을 지켜 최종 답변만 한국어로 출력해라. 내부 사고 과정, 영어, [자료] 라벨은 쓰지 마라.`;
      const retry = await fetchOllamaGenerate(host, {
        model, prompt: finalPrompt, stream: false, think: false, keep_alive: runtime.keep_alive,
        options: { temperature: runtime.temperature, num_predict: Math.min(runtime.max_tokens, 700) },
      }, Math.min(runtime.timeout_ms, 30000));
      text = visibleOllamaText(retry);
    }
    return text ? { text, ok: true, model, reasoning: runtime.think } : { text: "", ok: false, model, reasoning: runtime.think };
  } catch {
    return { text: "", ok: false, model, reasoning: runtime.think };   // 미기동/타임아웃 → 폴백(끊기지 않음)
  }
}

// 어댑터. provider: "stub"(기본, 외부0) | "ollama"(owner PC 로컬) | "codex_cli"(tool_pc 전용).
export async function runLlm({ provider = "stub", user = "", context = null } = {}, { store = null } = {}) {
  const internet = provider === "codex_cli"; // 인터넷 외부전송 가능 경로(tool_pc 승인분)
  let text, ok = true, delivered = false, model = null;
  let reasoning = false;
  if (provider === "ollama") {
    const runtime = chatLlmRuntimeConfig();
    reasoning = runtime.think;
    // 다중 사용자 게이트: 동시 호출은 직렬화, 대기 초과면 검색 폴백(끊기지 않음).
    const q = await runQueued(() => callOllama(user, runtime));   // 로컬 호출 — 인터넷 egress 아님
    const r = q.queued_timeout ? { ok: false, text: "" } : q;
    text = r.ok ? r.text : stubAnswer(user, context);
    ok = r.ok; delivered = r.ok;
    model = r.model ?? runtime.model;
    reasoning = r.reasoning ?? runtime.think;
  } else if (internet) {
    // tool_pc 로컬 백엔드에서 Codex CLI 호출 지점. sandbox/localhost 파일럿은 미가용 → stub 폴백.
    text = stubAnswer(user, context);
    ok = false; delivered = false;
  } else {
    text = stubAnswer(user, context);          // stub: 외부 0
    delivered = false;
  }
  if (store && typeof store.appendEvent === "function") {
    store.appendEvent({
      actor_ref: "erp", actor_kind: "ai", kind: "llm_call",
      to: provider, used_refs: ["llm", context ? `ctx:${context.kind}` : "llm"],
      data_label: "meta", note: `provider=${provider} model=${model ?? ""} think=${reasoning} internet=${internet} delivered=${delivered}`
    });
  }
  return { text, provider, model: model ?? null, external: internet, delivered, reasoning };
}

// 분해 제안(S4): 로컬 LLM이 할일 메타를 보고 {is_task, should_split, sub_tasks:[{title, monster_type}]} 제안.
// LLM은 제안만 — 실제 자식 생성은 owner 확인 후(UI). 본문 미전달(메타-온리). 로컬 ollama만(외부 egress 없음).
export async function suggestSplit(item = {}, monsterTypes = [], { provider = "stub" } = {}) {
  const empty = { is_task: true, should_split: false, reason: "", sub_tasks: [] };
  if (provider !== "ollama") return { ...empty, reason: "llm_unavailable" }; // stub/codex 파일럿: 제안 없음
  if (!monsterTypes.length) return { ...empty, reason: "party_match_unavailable" }; // 매칭할 파티 어휘 없음 → 모순 프롬프트 방지
  const runtime = chatLlmRuntimeConfig();
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const types = monsterTypes.join(", ");
  // 사용자 입력 필드는 JSON 인코딩해 전달 — 제목 등에 개행/지시문이 있어도 프롬프트 규칙을 못 흔들게(인젝션 방지).
  const itemData = JSON.stringify({ title: item.title ?? "", project_id: item.project_id ?? "-", work_type: item.work_type ?? "-", completion_criteria: item.completion_criteria ?? "-" });
  const prompt = `당신은 업무를 "할 일"로 분해하는 분류기다. 아래 할일(JSON)을 보고 JSON으로만 답하라. 본문은 없고 메타만 있다.
할일: ${itemData}
규칙:
- is_task: 실제 처리할 업무면 true, 단순 공지/안내면 false.
- should_split: 한 번에 끝낼 수 있으면 false, 여러 단계가 필요하면 true.
- sub_tasks: should_split=true일 때만 2~5개. 각 title(한국어 한 줄)과 monster_type.
- monster_type 은 반드시 다음 중 하나: ${types}
형식만 출력: {"is_task":bool,"should_split":bool,"reason":"한 문장","sub_tasks":[{"title":"...","monster_type":"..."}]}`;
  try {
    const q = await runQueued(() => fetchOllamaGenerate(host, {
      model: runtime.model, prompt, stream: false, format: "json",
      options: { temperature: 0.2, num_predict: 500 },
    }, runtime.timeout_ms));
    if (q && q.queued_timeout) return { ...empty, reason: "busy" };
    const parsed = JSON.parse(q?.response ?? "{}");
    const subs = Array.isArray(parsed.sub_tasks) ? parsed.sub_tasks : [];
    return {
      is_task: parsed.is_task !== false,
      should_split: !!parsed.should_split,
      reason: String(parsed.reason ?? "").slice(0, 200),
      sub_tasks: subs.slice(0, 8).map((s) => ({
        title: String(s?.title ?? "").trim().slice(0, 200),
        monster_type: String(s?.monster_type ?? "").trim(),
      })).filter((s) => s.title && monsterTypes.includes(s.monster_type)), // LLM 할루시네이션 타입은 제외(허용목록 검증)
      model: runtime.model,
    };
  } catch (e) {
    return { ...empty, reason: "llm_error", error: String(e?.message ?? e) };
  }
}

// S6 완료 훅: 완료된 할일의 Codex 대화 로그를 1회 요약 → {완료요약, 다음액션후보, 지식후보}. 제안일 뿐(사람 검토). 외부 egress 없음(로컬 ollama). ollama 미가용/대화없음/오류면 빈 결과로 graceful.
export async function summarizeCompletion(item = {}, messages = [], { provider = "stub" } = {}) {
  const empty = { summary: "", next_actions: [], knowledge: "" };
  if (provider !== "ollama") return { ...empty, reason: "llm_unavailable" };
  if (!messages.length) return { ...empty, reason: "no_thread" };
  const runtime = chatLlmRuntimeConfig();
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const log = messages.map((m) => `[${m.role}] ${String(m.text ?? "").replace(/\s+/g, " ").slice(0, 600)}`).join("\n").slice(0, 5000);
  const itemData = JSON.stringify({ title: item.title ?? "", project_id: item.project_id ?? "-", work_type: item.work_type ?? "-" });
  const prompt = `당신은 완료된 업무를 정리하는 비서다. 아래 할일(JSON)과 Codex 대화 로그를 보고 JSON으로만 답하라. 로그에 없는 내용은 지어내지 마라.
할일: ${itemData}
대화로그:
${log}
규칙:
- summary: 무엇을 했고 결과가 무엇인지 2~3문장(한국어).
- next_actions: 이어서 할 일 후보 0~3개(각 한국어 한 줄). 없으면 [].
- knowledge: 다음에 재사용할 지식/주의점 한 줄. 없으면 "".
형식만 출력: {"summary":"...","next_actions":["..."],"knowledge":"..."}`;
  try {
    const q = await runQueued(() => fetchOllamaGenerate(host, {
      model: runtime.model, prompt, stream: false, format: "json",
      options: { temperature: 0.2, num_predict: 600 },
    }, runtime.timeout_ms));
    if (q && q.queued_timeout) return { ...empty, reason: "busy" };
    const parsed = JSON.parse(q?.response ?? "{}");
    return {
      summary: String(parsed.summary ?? "").trim().slice(0, 1000),
      next_actions: (Array.isArray(parsed.next_actions) ? parsed.next_actions : []).slice(0, 3).map((s) => String(s ?? "").trim().slice(0, 200)).filter(Boolean),
      knowledge: String(parsed.knowledge ?? "").trim().slice(0, 500),
      model: runtime.model,
    };
  } catch (e) {
    return { ...empty, reason: "llm_error", error: String(e?.message ?? e) };
  }
}
