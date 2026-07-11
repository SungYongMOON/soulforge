// dev-erp 아침 브리핑 push v1 (2026-07-04 owner 승인 — 팀 정착 진단의 '재방문 루프' 마지막 조각 push).
// 원칙: 메타만(할일 제목·건수·마감일·과제코드). 메일 원문/LLM 무관. SMTP 재구현 없이
// guild_hall/gateway/mail_send 캡슐(send_mail.py)을 자식 프로세스로 재사용 — 자격증명은
// 계정 env 파일에서 캡슐이 직접 읽고, 이 모듈은 경로만 다룬다(값 미접촉).
// 커밋 전 적대검토(2026-07-04) 반영: 제안 집계 SQL 직행(limit 절단 방지), 발신 명의 관리자 한정,
// 수신 도메인 allowlist 게이트, 본문 임시파일 전달(argv 32K 한계 회피), 계정별 오류 격리.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const HIDDEN_STATUSES = new Set(["done", "archived", "unclassified"]);

// 로컬(서버 PC) 기준 날짜키 — UTC slice 는 아침 시간대에 전날로 밀린다.
export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function plusDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

// 계정 1명분 브리핑 집계. 매칭은 기존 '내 일' 규약(accountIdentities: username/표시명/이메일/사람이름) 재사용.
export function buildMorningBrief(store, account, todayKey) {
  const identities = store.accountIdentities(account);
  if (!identities.length) return null;
  const mine = store.items({ assignee_any: identities, limit: 500 }).filter((i) => !HIDDEN_STATUSES.has(i.status));
  const weekEnd = plusDaysKey(todayKey, 7);
  const overdue = mine.filter((i) => i.due && i.due < todayKey);
  const dueToday = mine.filter((i) => i.due === todayKey);
  const dueWeek = mine.filter((i) => i.due && i.due > todayKey && i.due <= weekEnd);
  const blocked = mine.filter((i) => i.status === "blocked");
  // 제안은 SQL 로 직행 — items({status:'unclassified'}) 후 JS 필터는 팀 전체 limit 절단에
  // 최신 제안이 먼저 잘린다(적대검토 확정: 운영 미분류가 하루 ~120건씩 쌓여 300 상한 임박).
  const marks = identities.map(() => "?").join(",");
  const proposals = store.db.prepare(
    `SELECT id, project_id, title, due, suggested_assignee_ref FROM core_item
     WHERE status='unclassified' AND suggested_assignee_ref IN (${marks})
     ORDER BY rowid DESC LIMIT 30`
  ).all(...identities);
  // '실제 일' 가시화(2026-07-05 owner 피드백): 마감 미지정 건은 어느 버킷에도 없어 브리핑에서
  // 보이지 않았다. D2/D3(2026-07-11): 미착수(open)와 진행(doing/waiting)으로 분리 — 노출 레인과 동일 정의.
  const noDue = mine.filter((i) => !i.due && i.status !== "blocked");
  const notStarted = noDue.filter((i) => i.status === "open");
  const inProgress = noDue.filter((i) => i.status !== "open");
  return {
    date: todayKey,
    account: { id: account.id, email: account.email, name: account.display_name || account.username },
    total: mine.length,
    overdue, dueToday, dueWeek, blocked, proposals, notStarted, inProgress,
  };
}

// 발송 가치 판정. D3(S8-3, owner 승인 2026-07-11): 마감 없는 미착수/진행 건도 발송 가치 —
// 2026-07-05 본문 개선(진행 중 섹션)이 이 게이트에서 무효화되던 버그의 게이트측 정합.
// 주간 예정(dueWeek)만으로는 여전히 발송하지 않는다(반복 잔량 소음 방지).
export function hasContent(brief) {
  return !!brief && (brief.overdue.length + brief.dueToday.length + brief.blocked.length + brief.proposals.length
    + (brief.notStarted?.length ?? 0) + (brief.inProgress?.length ?? 0)) > 0;
}

function lineOf(item) {
  const due = item.due ? ` (마감 ${item.due})` : "";
  return `- [${item.project_id ?? "미지정"}] ${String(item.title ?? "").slice(0, 160)}${due}`;
}

function section(label, items, max = 5) {
  if (!items.length) return "";
  const shown = items.slice(0, max).map(lineOf);
  const more = items.length > max ? `\n  … 외 ${items.length - max}건` : "";
  return `\n${label} ${items.length}건\n${shown.join("\n")}${more}\n`;
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Outlook 호환 HTML 섹션(2026-07-05 owner 피드백: pre-wrap CSS 를 Outlook(Word 렌더러)이 무시해
// 전체가 한 문단으로 붙어 보였음 → 제목 <p> + 목록 <ul><li> 마크업으로 줄구조를 태그에 싣는다).
function htmlSection(title, items, { color = "#1f48d4", max = 5 } = {}) {
  if (!items.length) return "";
  const lis = items.slice(0, max).map((i) => {
    const proj = i.project_id ? `<span style="color:#8a94a3;font-size:12px">[${escapeHtml(i.project_id)}]</span> ` : "";
    const due = i.due ? ` <span style="color:#b3261e;font-size:12px">(마감 ${escapeHtml(i.due)})</span>` : "";
    return `<li style="margin:3px 0">${proj}${escapeHtml(String(i.title ?? "").slice(0, 120))}${due}</li>`;
  }).join("");
  const more = items.length > max ? `<p style="color:#8a94a3;font-size:12px;margin:2px 0 0 22px">… 외 ${items.length - max}건</p>` : "";
  return `<p style="margin:16px 0 4px;font-size:14px;font-weight:bold;color:${color}">${title} <span style="font-weight:normal;color:#555">${items.length}건</span></p>
<ul style="margin:0;padding-left:22px;font-size:13.5px">${lis}</ul>${more}`;
}

export function briefBodies(brief, { appUrl = "" } = {}) {
  // D3 가독성: 비어있지 않은 버킷만 제목에 — '오늘 0·지연 0' 나열은 소음이고 진행-only 메일에서 오도.
  const subjectParts = [
    ["지연", brief.overdue.length], ["오늘", brief.dueToday.length], ["차단", brief.blocked.length],
    ["새 제안", brief.proposals.length], ["미착수", (brief.notStarted ?? []).length], ["진행", (brief.inProgress ?? []).length],
  ].filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
  const subject = `[dev-erp] ${brief.date} 아침 브리핑 — ${subjectParts.join("·") || "잔량 없음"}`;
  const text = [
    `${brief.account.name}님, ${brief.date} 아침 브리핑입니다.`,
    section("🔴 지연", brief.overdue),
    section("📌 오늘 마감", brief.dueToday),
    section("⛔ 차단됨", brief.blocked),
    section("📥 내게 온 새 제안(분류 대기)", brief.proposals),
    section("🆕 미착수(마감 미지정)", brief.notStarted ?? []),
    section("📋 진행 중(마감 미지정)", brief.inProgress ?? []),
    section("🗓️ 7일 내 예정", brief.dueWeek, 3),
    appUrl ? `\n자세히: ${appUrl}` : "",
    "\n— dev-erp 자동 브리핑(회신 불필요)",
  ].filter(Boolean).join("\n");

  const summaryChip = (label, n, color) => n
    ? `<span style="color:${color};font-weight:bold">${label} ${n}</span>` : `<span style="color:#8a94a3">${label} 0</span>`;
  const summary = [
    summaryChip("지연", brief.overdue.length, "#b3261e"),
    summaryChip("오늘 마감", brief.dueToday.length, "#9a6700"),
    summaryChip("차단", brief.blocked.length, "#b3261e"),
    summaryChip("새 제안", brief.proposals.length, "#1f48d4"),
    summaryChip("미착수", (brief.notStarted ?? []).length, "#9a6700"),
    summaryChip("진행 중", (brief.inProgress ?? []).length, "#3d6a4f"),
  ].join('<span style="color:#c6ccd4"> &nbsp;·&nbsp; </span>');
  const html = `<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:14px;color:#222;line-height:1.6;max-width:640px">
<p style="margin:0 0 4px;font-size:16px"><b>${escapeHtml(brief.account.name)}</b>님, <b>${escapeHtml(brief.date)}</b> 아침 브리핑입니다.</p>
<p style="margin:0 0 6px;font-size:13px">${summary}</p>
${htmlSection("🔴 지연", brief.overdue, { color: "#b3261e" })}
${htmlSection("📌 오늘 마감", brief.dueToday, { color: "#9a6700" })}
${htmlSection("⛔ 차단됨", brief.blocked, { color: "#b3261e" })}
${htmlSection("📥 내게 온 새 제안 (분류 대기)", brief.proposals, { color: "#1f48d4" })}
${htmlSection("🆕 미착수 (마감 미지정)", brief.notStarted ?? [], { color: "#9a6700" })}
${htmlSection("📋 진행 중 (마감 미지정)", brief.inProgress ?? [], { color: "#3d6a4f" })}
${htmlSection("🗓️ 7일 내 예정", brief.dueWeek, { color: "#555", max: 3 })}
${appUrl ? `<p style="margin:20px 0 8px"><a href="${escapeHtml(appUrl)}" style="background:#1f48d4;color:#ffffff;padding:9px 22px;border-radius:6px;text-decoration:none;font-weight:bold">ERP 열기</a></p>` : ""}
<p style="margin:14px 0 0;color:#8a94a3;font-size:12px">— dev-erp 자동 브리핑 · 회신 불필요</p>
</div>`;
  return { subject, text, html };
}

// 발신 env 결정: 명시 경로(env) > **관리자(owner) 계정** 중 메일함 연결 + env 실존 첫 파일.
// 일반 팀원 계정으로의 폴백 금지(적대검토 확정: 당사자 미인지 상태로 그 명의 발송 위험).
export function resolveSenderEnvPath(store, { repoRoot, override = "" } = {}) {
  if (override) {
    const p = resolve(repoRoot ?? ".", override); // 상대경로는 repoRoot 기준(실존검사와 동일 기준)
    return existsSync(p) ? p : null;              // 명시 지정 실패는 폴백 없이 드러낸다(사이클이 기록·재시도)
  }
  for (const a of store.listAccounts()) {
    if (!a.is_admin || a.status !== "active" || !a.mailbox_enabled || !a.mailbox_env_ref) continue;
    const p = resolve(repoRoot, a.mailbox_env_ref);
    if (existsSync(p)) return p;
  }
  return null;
}

// guild_hall 발송 캡슐 호출. EMAIL_SEND_ENABLED 는 이 spawn 에만 주입(secret 파일 무수정).
// 본문은 임시파일로 전달 — argv 는 Windows 32K 한계에서 spawn 이 동기 throw 한다(적대검토 실측).
export function sendBriefMail({ repoRoot, envFile, to, subject, text, html = "", pythonBin = process.env.DEV_ERP_PYTHON || "python", timeoutMs = 60000, dryRun = false }) {
  return new Promise((resolvePromise) => {
    let tmp = null;
    let child = null;
    const cleanup = () => { if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 이미 제거 */ } tmp = null; } };
    try {
      tmp = mkdtempSync(join(tmpdir(), "dev-erp-brief-"));
      writeFileSync(join(tmp, "body.txt"), text, "utf-8");
      if (html) writeFileSync(join(tmp, "body.html"), html, "utf-8");
      const script = resolve(repoRoot, "guild_hall", "gateway", "mail_send", "send_mail.py");
      const args = [script, "--env-file", envFile, "--to", to, "--subject", subject,
        "--body-text-file", join(tmp, "body.txt"),
        "--json", "--approved-by", "owner_20260704_morning_brief_v1", "--source-ref", "dev-erp:morning_brief"];
      if (html) args.push("--body-html-file", join(tmp, "body.html"));
      if (dryRun) args.push("--dry-run");
      child = spawn(pythonBin, args, { env: { ...process.env, EMAIL_SEND_ENABLED: "true" }, windowsHide: true });
    } catch (e) {
      cleanup();
      return resolvePromise({ ok: false, code: null, result: null, error: `spawn_failed:${e.message}`.slice(0, 400) });
    }
    let out = ""; let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* 이미 종료 */ } }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* 비JSON 출력 */ }
      const ok = code === 0 && parsed?.ok !== false;
      resolvePromise({ ok, code, result: parsed, error: ok ? null : (String(err || parsed?.error || `exit_${code}`).slice(0, 400)) });
    });
    child.on("error", (e) => { clearTimeout(timer); cleanup(); resolvePromise({ ok: false, code: null, result: null, error: e.message }); });
  });
}

function parseDomainAllow(raw) {
  return String(raw ?? "").split(",").map((s) => s.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

// 1회 사이클. 멱등 키 = event_log morning_brief_sent item_ref(brief:<date>:<account>) — 실패/미발송
// 계정만 재시도 대상으로 남는다(같은 날 재호출 시). 호출 빈도·시도 상한은 서버 스케줄러가 소유.
// sender 주입은 테스트/드라이런용. domainAllow 비면 게이트 없음(운영은 ops 스크립트가 회사 도메인 고정).
export async function runMorningBriefCycle(store, {
  todayKey = localDateKey(), repoRoot, appUrl = "", senderEnvOverride = "",
  domainAllow = parseDomainAllow(process.env.DEV_ERP_BRIEF_DOMAIN_ALLOW),
  sender = null, log = () => {}, force = false, onlyAccountId = null,
} = {}) {
  const sentKeys = new Set(
    store.queryEvents({ kind: "morning_brief_sent", limit: 1000 }).map((e) => e.item_ref)
  );
  let envFile = null;
  if (!sender) {
    envFile = resolveSenderEnvPath(store, { repoRoot, override: senderEnvOverride });
    if (!envFile) return { ok: false, error: "sender_env_missing", sender_env: null, results: [] };
  }
  const accounts = store.listAccounts().filter((a) =>
    a.status === "active" && String(a.email ?? "").trim() && (!onlyAccountId || a.id === onlyAccountId));
  const results = [];
  for (const account of accounts) {
    const key = `brief:${todayKey}:${account.id}`;
    try {
      if (!force && sentKeys.has(key)) { results.push({ account: account.id, skipped: "already_sent" }); continue; }
      // 수신 도메인 게이트(정책 '팀 내부 한정' 강제): allowlist 밖 주소는 발송하지 않고 기록으로 드러낸다.
      const domain = String(account.email).split("@")[1]?.trim().toLowerCase() ?? "";
      if (domainAllow.length && !domainAllow.includes(domain)) {
        store.appendEvent({ kind: "morning_brief_error", item_ref: key, actor_ref: "system", actor_kind: "system", data_label: "real", note: `domain_not_allowed:${domain}` });
        results.push({ account: account.id, skipped: "domain_not_allowed" });
        continue;
      }
      const brief = buildMorningBrief(store, account, todayKey);
      if (!hasContent(brief)) { results.push({ account: account.id, skipped: "empty" }); continue; }
      const { subject, text, html } = briefBodies(brief, { appUrl });
      const r = await (sender
        ? sender({ to: account.email, subject, text, html, account, brief })
        : sendBriefMail({ repoRoot, envFile, to: account.email, subject, text, html }));
      store.appendEvent({
        kind: r.ok ? "morning_brief_sent" : "morning_brief_error",
        item_ref: key, actor_ref: "system", actor_kind: "system", data_label: "real",
        note: r.ok
          ? `${account.email} 오늘${brief.dueToday.length} 지연${brief.overdue.length} 차단${brief.blocked.length} 제안${brief.proposals.length}`
          : String(r.error ?? "unknown").slice(0, 200),
      });
      log(`[morning-brief] ${account.email}: ${r.ok ? "발송" : `실패(${r.error})`}`);
      results.push({ account: account.id, ok: r.ok, error: r.error ?? null });
    } catch (e) {
      // 계정별 격리: 한 계정의 예외(빌드/발송/기록)가 잔여 계정 발송을 막지 않는다.
      try { store.appendEvent({ kind: "morning_brief_error", item_ref: key, actor_ref: "system", actor_kind: "system", data_label: "real", note: String(e.message ?? e).slice(0, 200) }); } catch { /* 기록 실패는 결과로만 */ }
      results.push({ account: account.id, ok: false, error: String(e.message ?? e).slice(0, 200) });
    }
  }
  return { ok: true, date: todayKey, sender_env: envFile ? basename(envFile) : "injected_sender", results };
}
