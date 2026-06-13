// A3: LLM 어댑터 + Codex CLI 브릿지.
// 불변 가드레일: 컨텍스트는 **메타/요약만**(원문 본문·첨부 미포함). 외부전송은
// codex_cli provider(tool_pc 로컬 백엔드)에서만, owner 승인분에 한해. sandbox 기본은
// stub(외부전송 0). 회의록 자동추출·첨부 기반 보고서 등 원문 필요 기능은 갈림길⑨로 보류.

const WEEK_MS = 6 * 86400000;

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

// 어댑터. provider: "stub"(기본, 외부0) | "codex_cli"(tool_pc 전용).
export async function runLlm({ provider = "stub", user = "", context = null } = {}, { store = null } = {}) {
  const external = provider === "codex_cli";
  let text, ok = true;
  if (external) {
    // tool_pc 로컬 백엔드에서 Codex CLI 호출 지점. sandbox/localhost 파일럿은 미가용 → stub 폴백.
    text = stubAnswer(user, context);
    ok = false; // 실제 외부 호출 미수행 표식
  } else {
    text = stubAnswer(user, context);
  }
  if (store && typeof store.appendEvent === "function") {
    store.appendEvent({
      actor_ref: "erp", actor_kind: "ai", kind: "llm_call",
      to: provider, used_refs: ["llm", context ? `ctx:${context.kind}` : "llm"],
      data_label: "meta", note: `external=${external} delivered=${ok && external}`
    });
  }
  return { text, provider, external, delivered: external && ok };
}
