// A3: LLM 어댑터 + Codex CLI 브릿지.
// 불변 가드레일: 컨텍스트는 **메타/요약만**(원문 본문·첨부 미포함). 외부전송은
// codex_cli provider(tool_pc 로컬 백엔드)에서만, owner 승인분에 한해. sandbox 기본은
// stub(외부전송 0). 회의록 자동추출·첨부 기반 보고서 등 원문 필요 기능은 갈림길⑨로 보류.

import { runManualAnswerPipeline } from "./chat_pipeline.mjs";

const WEEK_MS = 6 * 86400000;

// ── 다중 사용자 동시 질문 게이트(로컬 작은 모델 보호) ───────────────────────
// 다른 PC 의 단일 Ollama 인스턴스를 팀이 공유하면, 동시 요청이 몰릴 때 모델이
// 과부하·지연된다. ERP 서버(단일 프로세스)에서 인프로세스 세마포어로 동시
// 실행 수를 제한(기본 1)하고, 대기 한도를 넘으면 '검색 폴백'으로 떨어뜨려
// 어떤 사용자도 무한 대기/끊김을 겪지 않게 한다(기초설계: LOCAL_LLM_MULTIUSER_DESIGN).
const LLM_CONCURRENCY = Math.max(1, Number(process.env.ERP_LLM_CONCURRENCY || 1));
const LLM_QUEUE_WAIT_MS = Number(process.env.ERP_LLM_QUEUE_WAIT_MS || 8000);
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

// ── RAG 챗봇: 검색(매뉴얼) → LLM이 '그 근거 안에서만' 표현 ──────────────
// owner 의도: LLM은 기본 동작하되 '메뉴얼을 보고' 답한다(추론으로 새 사실 X).
// 로컬 작은 모델이 붙으면 grounded 프롬프트로 사람처럼 표현, 없으면 검색 폴백.

// 검색된 매뉴얼 조각만 담는 grounded 프롬프트. 모델에 "이 안에서만, 없으면 모른다고" 지시.
export function buildManualPrompt(question, hits, history = []) {
  const snippets = hits.map((h, i) =>
    `[자료 ${i + 1}] (${h.faq.topic ?? "일반"}) Q:${h.faq.question}\nA:${h.faq.answer}`).join("\n\n");
  const prior = history.length
    ? `이전 질문(같은 사용자·같은 대화 안에서만, 현재 질문 해석 보조용):\n${history.map((h) => `- ${h}`).join("\n")}\n`
    : "";
  return [
    "너는 사내 ERP 매뉴얼 안내원이다. 아래 [자료]에 적힌 내용만 근거로 답해라.",
    "자료에 없는 ERP 사실은 지어내지 마라. 다만 말투는 사람처럼 자연스럽게, 친절하게.",
    "이전 질문은 '그거/아까/그러면' 같은 말을 해석할 때만 참고하고, 답변 근거로 쓰지 마라.",
    "자료가 질문과 맞으면 먼저 핵심 답을 2~4문장으로 말하고, 더 필요한 확인 질문은 마지막에 한 가지만 붙여라.",
    "답변에는 '[자료 1]' 같은 내부 근거 라벨을 쓰지 마라.",
    "자료가 질문과 무관하면 모른다고 말하고 관련 주제를 제안하라.",
    "",
    prior,
    snippets || "(관련 자료 없음)",
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
async function callOllama(prompt) {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const model = process.env.ERP_CHAT_MODEL || "gemma3:4b"; // 공통 기본값(맥미니 M4·회사 NVIDIA 둘 다 적합)
  const ms = Number(process.env.ERP_CHAT_TIMEOUT_MS || 20000);
  const numPredict = Number(process.env.ERP_CHAT_MAX_TOKENS || 320); // 출력 상한 — 짧을수록 빠름
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const resp = await fetch(`${host}/api/generate`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
      // num_predict로 응답 길이를 제한해 지연을 줄인다. think=false는 Gemma4 계열이 사고 토큰만 쓰고 빈 response를 돌려주는 일을 막는다.
      body: JSON.stringify({ model, prompt, stream: false, think: false, keep_alive: "30m", options: { temperature: 0.2, num_predict: numPredict } })
    });
    const j = await resp.json();
    const text = visibleOllamaText(j);
    return text ? { text, ok: true, model } : { text: "", ok: false, model };
  } catch {
    return { text: "", ok: false, model };   // 미기동/타임아웃 → 폴백(끊기지 않음)
  } finally { clearTimeout(timer); }
}

// 어댑터. provider: "stub"(기본, 외부0) | "ollama"(owner PC 로컬) | "codex_cli"(tool_pc 전용).
export async function runLlm({ provider = "stub", user = "", context = null } = {}, { store = null } = {}) {
  const internet = provider === "codex_cli"; // 인터넷 외부전송 가능 경로(tool_pc 승인분)
  let text, ok = true, delivered = false, model = null;
  if (provider === "ollama") {
    // 다중 사용자 게이트: 동시 호출은 직렬화, 대기 초과면 검색 폴백(끊기지 않음).
    const q = await runQueued(() => callOllama(user));   // 로컬 호출 — 인터넷 egress 아님
    const r = q.queued_timeout ? { ok: false, text: "" } : q;
    text = r.ok ? r.text : stubAnswer(user, context);
    ok = r.ok; delivered = r.ok;
    model = r.model ?? (process.env.ERP_CHAT_MODEL || "gemma3:4b");
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
      data_label: "meta", note: `provider=${provider} model=${model ?? ""} internet=${internet} delivered=${delivered}`
    });
  }
  return { text, provider, model: model ?? null, external: internet, delivered };
}
