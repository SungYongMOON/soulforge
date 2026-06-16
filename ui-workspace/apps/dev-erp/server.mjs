#!/usr/bin/env node
// dev-erp P1 서버: 외부 의존성 0 (node:http + node:sqlite).
// 사용: node server.mjs [--port 4300] [--db data/dev-erp.db] [--ingest <json>]
// 기본: DB 가 비어 있으면 synthetic fixture 를 자동 적재 (data_label=synthetic).
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "./src/store.mjs";
import { loadFixture } from "./src/fixture.mjs";
import { ingestFromFile } from "./src/adapter.mjs";
import { getLexicon, LEXICON } from "./src/lexicon.mjs";
import { guideTemplates, docRecipes } from "./src/guide.mjs";
import { modulesFor } from "./src/modules.mjs";
import { crossSearch } from "./src/search.mjs";
import { buildMetaContext, runLlm, answerFromManual } from "./src/llm.mjs";
import { startAutosyncPoll, writeTaskToLedger, writeInputToLedger } from "./src/autosync.mjs";
import { safeWorkspacePath, safeUploadTarget, commitUpload, readSafe } from "./src/filevault.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

// 파일 IO(산출물 입력파일 업/다운로드)는 기본 OFF. 켜기: DEV_ERP_FILEIO=1 또는 --fileio.
// 모든 경로는 <ROOT>/_workspaces 아래로만(filevault path-safety). 절대경로·../·심볼릭 탈출 차단.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FILEIO = process.env.DEV_ERP_FILEIO === "1" || process.argv.includes("--fileio");
const UPLOAD_MAX = Number(process.env.DEV_ERP_UPLOAD_MAX || 50 * 1024 * 1024); // 50MB 기본 상한
const PORT = Number(flag("port", 4300));
// 기본은 localhost 전용(안전). 같은 네트워크 공유가 필요할 때만 --host 0.0.0.0
// (합성 데이터 파일럿 한정 권장 — 실데이터+팀 공개는 P2 RBAC 이후)
const HOST = flag("host", "127.0.0.1");
const DB_PATH = flag("db", join(HERE, "data", "dev-erp.db"));
if (DB_PATH !== ":memory:") mkdirSync(dirname(DB_PATH), { recursive: true });

const store = openStore(DB_PATH);
// P1b: data/real_meta.json 이 있으면 (갱신 시각 기준) 자동 ingest.
// 최초 실데이터 도착 시 합성 표본은 제거한다 (가짜/실제 혼합 방지).
const realMetaPath = join(HERE, "data", "real_meta.json");
if (existsSync(realMetaPath)) {
  const mtime = String(statSync(realMetaPath).mtimeMs);
  if (store.getMeta("real_ingest_mtime") !== mtime) {
    const purged = store.purgeSynthetic();
    const report = ingestFromFile(store, realMetaPath, { label: "real" });
    store.setMeta("real_ingest_mtime", mtime);
    console.log("[dev-erp] real meta ingested:", JSON.stringify({ purged_synthetic: purged, ...report }));
  }
} else if (store.counts().projects === 0) {
  const ingestPath = flag("ingest", null);
  if (ingestPath) {
    const report = ingestFromFile(store, resolve(ingestPath));
    console.log("[dev-erp] ingest:", JSON.stringify(report));
  } else {
    const counts = loadFixture(store);
    console.log("[dev-erp] synthetic fixture loaded:", JSON.stringify(counts));
  }
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const todayKey = () => new Date().toISOString().slice(0, 10);

function send(res, code, body, type = "application/json", extraHeaders = {}) {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", ...extraHeaders });
  res.end(payload);
}

const SID = "dev_erp_sid";
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
// 현재 로그인 계정(없으면 null=익명). 익명이면 앱은 현행대로 동작.
function currentAccount(req) {
  return store.sessionAccount(readCookie(req, SID));
}
// 세션 쿠키 문자열. HttpOnly+SameSite=Lax(로컬/사내망 http 파일럿이라 Secure 미설정).
function sessionCookie(token, maxAgeSec) {
  return `${SID}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
// 관리자 가드: admin 역할 계정만. 아니면 null.
function requireAdmin(req) {
  const a = currentAccount(req);
  return a && store.isAdmin(a.id) ? a : null;
}
async function readJson(req) {
  let body = ""; for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || "{}"); } catch { return {}; }
}
// 보기 대상(view) → 할일 담당자 식별자 배열. view=계정id|team, mine=1=본인.
// 권한: 관리자=아무 계정, 팀원=본인만(타인 요청은 본인으로 강등). 익명/팀=전체(하위호환).
function viewIdentities(req, qp) {
  const me = currentAccount(req);
  if (qp.mine === "1") return me ? store.accountIdentities(me) : [];
  const v = qp.view;
  if (!v || v === "team") {
    if (!me || store.isAdmin(me.id)) return undefined; // 전체(필터 없음)
    return store.accountIdentities(me);                // 일반 팀원의 '팀' 기본은 본인
  }
  if (me && (store.isAdmin(me.id) || me.id === v)) {
    const acc = store.db.prepare("SELECT id,username,person_id,email,display_name FROM core_account WHERE id=?").get(v);
    return acc ? store.accountIdentities(acc) : [];
  }
  return me ? store.accountIdentities(me) : [];
}
// 보기 대상(view) → 메일함(mailbox=계정 이메일). 전체는 undefined, 메일 없는 계정은 빈 결과 키.
function viewMailbox(req, qp) {
  const me = currentAccount(req);
  const v = qp.view;
  if (qp.mine === "1") return me?.email || "__none__";
  if (!v || v === "team") {
    if (!me || store.isAdmin(me.id)) return undefined; // 전체
    return me.email || "__none__";
  }
  if (me && (store.isAdmin(me.id) || me.id === v)) {
    const acc = store.db.prepare("SELECT email FROM core_account WHERE id=?").get(v);
    return acc?.email || "__none__";
  }
  return me?.email || "__none__";
}

function lastIngestAt() {
  const rows = store.db.prepare("SELECT at FROM event_log WHERE kind='ingest' ORDER BY id DESC LIMIT 1").get();
  return rows?.at ?? null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const qp = Object.fromEntries(url.searchParams.entries());
  // 작업 행위자 = 로그인 세션 사용자(없으면 익명 'anon'). event_log·created_by 출처를 실제 사용자로 기록(BE-2).
  const actor = currentAccount(req)?.username ?? "anon";
  try {
    if (path === "/api/health") return send(res, 200, { ok: true, schema: "dev_erp.v1", counts: store.counts() });

    // ---------- P2b 팀: 계정·인증·관리자 ----------
    // 정체성 조회는 /api/me(클라이언트 계약). 여기서는 로그인/로그아웃/bootstrap/계정관리.
    // 첫 계정은 bootstrap 으로 관리자 생성(계정이 1개라도 있으면 차단).
    if (path === "/api/auth/login" && req.method === "POST") {
      const { username, password } = await readJson(req);
      const a = store.verifyLogin(username, password);
      if (!a) return send(res, 401, { error: "invalid_login" });
      const token = store.createSession(a.id);
      store.appendEvent({ actor_ref: a.username, actor_kind: "human", kind: "auth_login", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      const tok = readCookie(req, SID);
      if (tok) store.deleteSession(tok);
      return send(res, 200, { ok: true }, "application/json", { "set-cookie": sessionCookie("", 0) });
    }
    if (path === "/api/auth/bootstrap" && req.method === "POST") {
      if (store.accountCount() !== 0) return send(res, 409, { error: "already_initialized" });
      const { username, password, email, display_name } = await readJson(req);
      const r = store.createAccount({ username, password, email, display_name, roles: ["admin"] });
      if (r.error) return send(res, 400, r);
      const token = store.createSession(r.id);
      store.appendEvent({ actor_ref: username, actor_kind: "human", kind: "auth_bootstrap", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    // 계정 생성/조회/수정/상태 — 관리자 전용.
    if (path === "/api/accounts" && req.method === "GET") {
      if (!requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      return send(res, 200, { accounts: store.listAccounts(), roles: store.db.prepare("SELECT id,name FROM rbac_role ORDER BY id").all() });
    }
    if (path === "/api/accounts" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { username, password, email, display_name, role } = await readJson(req);
      const r = store.createAccount({ username, password, email, display_name, roles: [role === "admin" ? "admin" : "member"] });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "account_create", to: username, used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, r);
    }
    if (path === "/api/accounts/update" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, email, display_name, role } = await readJson(req);
      const r = store.updateAccount(id, { email, display_name, role });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/accounts/status" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, status } = await readJson(req);
      if (id === admin.id && status === "disabled") return send(res, 400, { error: "cannot_disable_self" });
      const r = store.setAccountStatus(id, status);
      return send(res, r.error ? 400 : 200, r);
    }
    // 보기 대상(팀/사용자) 선택지: 관리자는 전체 계정, 팀원은 본인만.
    if (path === "/api/accounts/scopes") {
      const a = currentAccount(req);
      if (!a) return send(res, 200, { scopes: [], self: null, is_admin: false });
      if (store.isAdmin(a.id)) {
        const scopes = store.listAccounts().filter((x) => x.status === "active")
          .map((x) => ({ id: x.id, label: x.display_name || x.username, email: x.email || null }));
        return send(res, 200, { scopes: [{ id: "team", label: "팀 전체", email: null }, ...scopes], self: a.id, is_admin: true });
      }
      const p = store.accountProfile(a);
      return send(res, 200, { scopes: [{ id: a.id, label: p.display_name || a.username, email: p.email }], self: a.id, is_admin: false });
    }
    if (path === "/api/summary") {
      const today = todayKey();
      const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      return send(res, 200, { today, week_end: weekEnd, freshness: lastIngestAt(), projects: store.summary(today, weekEnd) });
    }
    if (path === "/api/items" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      // F3: 수동 생성 시 담당 미지정이면 작성자 본인으로 백필 — '내 할 일'에 본인 일이 안 뜨는 문제 방지.
      const me = currentAccount(req);
      if (!input.assignee_ref && me) input.assignee_ref = store.accountDisplayName(me) || me.username;
      const result = store.createItem({ ...input, created_by: actor });
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_create",
        item_ref: result.item.id, to: result.item.title, project_ref: result.item.project_id,
        used_refs: result.item.guide_artifact_id ? ["items", "guide"] : ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/throughput") return send(res, 200, store.throughput({ days: Number(qp.days) || 14, project: qp.project }));
    if (path === "/api/items/status" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, status, bottleneck_reason } = JSON.parse(body || "{}");
      const result = store.setItemStatus(id, status);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_status",
        item_ref: id, from: result.from, to: status, project_ref: result.project_id,
        bottleneck_reason: bottleneck_reason ?? null, used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, assignee_ref } = JSON.parse(body || "{}");
      const result = store.setItemAssignee(id, assignee_ref);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_assign",
        item_ref: id, from: result.from, to: assignee_ref || null, project_ref: result.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/update" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, title, due } = JSON.parse(body || "{}");
      const patch = {};
      if (title !== undefined) patch.title = title;
      if (due !== undefined) patch.due = due;
      const result = store.updateItem(id, patch);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_edit",
        item_ref: id, to: result.item.title, project_ref: result.item.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/delete" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.archiveItem(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_archive",
        item_ref: id, from: result.from, to: "archived", project_ref: result.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/confirm" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.confirmItem(input.id, input);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_confirm",
        item_ref: result.item.id, to: result.item.work_type ?? "", project_ref: result.item.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/promote" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      const result = store.promoteMail(mail_id, actor);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_promote",
        item_ref: result.item.id, from: mail_id, to: result.item.title,
        project_ref: result.item.project_id, used_refs: ["items", "mail"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items") {
      // 보기 대상(view=계정id|team)·mine=1 → 담당자 식별자 필터. 없으면 전체(하위호환).
      const assignee_any = (qp.mine === "1" || qp.view) ? viewIdentities(req, qp) : undefined;
      return send(res, 200, store.items({ project: qp.project, status: qp.status, q: qp.q, due_before: qp.due === "soon" ? todayKey() : undefined, assignee_any }));
    }
    if (path === "/api/mail" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createMail({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_register", to: result.mail.subject, project_ref: result.mail.project_id ?? null, used_refs: ["mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail") return send(res, 200, store.mail({
      project: qp.project, days: qp.days !== undefined ? Number(qp.days) : 90,
      q: qp.q, direction: qp.direction, label_id: qp.label_id,
      mailbox: (qp.mine === "1" || qp.view) ? viewMailbox(req, qp) : undefined
    }));
    if (path === "/api/guide/templates") return send(res, 200, guideTemplates(qp.mode));
    if (path === "/api/doc/recipes") return send(res, 200, docRecipes(qp.mode));
    if (path === "/api/embeds" && req.method === "GET") return send(res, 200, store.listEmbeds({ project: qp.project ?? null }));
    // ERP 챗봇 — RAG: 매뉴얼 검색 → (provider 연결 시) 로컬 작은 모델이 '그 근거 안에서만' 표현.
    // 매뉴얼 밖 추론 금지. provider 없으면 검색 기반 사람형 폴백(끊기지 않음). 질문은 로그에 저장.
    // provider는 ERP_CHAT_PROVIDER 환경변수로 주입(기본 stub=외부0). 야간 매뉴얼 갱신은 별도 고급 LLM.
    if (path === "/api/chat" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { message, thread_id } = JSON.parse(body || "{}");
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      const r = await answerFromManual({ store, question: message, thread_id, provider });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "chat_query", to: r.matched ? "matched" : "unanswered", used_refs: ["chat", "faq"], data_label: "meta", note: thread_id ? `thread=${thread_id}` : null });
      return send(res, 200, { text: r.text, matched: r.matched, source: r.source, candidates: r.candidates || [], mode: r.mode, external: r.external, llm: r.llm });
    }
    if (path === "/api/faq" && req.method === "GET") return send(res, 200, store.faqs({ topic: qp.topic }));
    if (path === "/api/faq" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertFaq({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    // P-10 지식 카탈로그 (검색·등재·통합검색 — 추론 0·외부전송 0)
    if (path === "/api/knowledge" && req.method === "GET") return send(res, 200, store.knowledge({ topic: qp.topic, q: qp.q }));
    if (path === "/api/knowledge" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.upsertKnowledge({ ...b, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "knowledge_upsert", item_ref: r.id, to: b.title, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/knowledge/search") return send(res, 200, store.catalogSearch(qp.q ?? ""));
    // P-11 계산기 (안전 평가·회귀검증·통과해야 active)
    if (path === "/api/calculators" && req.method === "GET") return send(res, 200, store.calculators({ category: qp.category }));
    if (path === "/api/calculators" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertCalculator({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/embeds" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertEmbed({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (!r.error) store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "embed_register", to: r.id, used_refs: ["embed_view"], data_label: "meta" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/calculators/example" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.addCalculatorExample(b.calculator_id, b.inputs, b.expected, b.tolerance ?? 1e-6));
    }
    if (path === "/api/calculators/eval" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.evalCalculator(b.id, b.inputs));
    }
    if (path === "/api/calculators/verify" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      return send(res, 200, store.verifyCalculator(JSON.parse(body || "{}").id));
    }
    if (path === "/api/calculators/activate" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const id = JSON.parse(body || "{}").id;
      const r = store.activateCalculator(id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "calculator_activate", item_ref: id, used_refs: ["calculator"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/chat/unanswered") return send(res, 200, store.unansweredQueries(qp.limit ? Number(qp.limit) : 50));
    if (path === "/api/gates") return send(res, 200, { mode: store.gateMode(), stages: store.gates({ project: qp.project }) });
    if (path === "/api/gates/clear" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { stage_id, force } = JSON.parse(body || "{}");
      const result = store.clearStage(stage_id, { force: !!force });
      if (result.error) return send(res, result.error === "stage_not_found" ? 404 : 409, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "gate_clear", to: stage_id, project_ref: result.project_id, used_refs: ["gates"], data_label: "real", note: result.forced ? `forced(${result.mode})` : result.mode });
      return send(res, 200, result);
    }
    if (path === "/api/settings/gate_mode" && req.method === "GET") return send(res, 200, { mode: store.gateMode() });
    if (path === "/api/settings/gate_mode" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mode } = JSON.parse(body || "{}");
      const r = store.setGateMode(mode);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "gate_mode_set", to: r.mode, used_refs: ["gates", "settings"], data_label: "real" });
      return send(res, 200, r);
    }
    // P-2 SE 스케줄러 + P-1 완결성 요구
    if (path === "/api/schedule/templates") return send(res, 200, store.scheduleTemplates());
    if (path === "/api/schedule/apply" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, template_key, anchorDates } = JSON.parse(body || "{}");
      const r = store.applyTemplate(project_id, template_key, { anchorDates: anchorDates || {} });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/schedule/anchor" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, anchor_stage_code, date } = JSON.parse(body || "{}");
      const r = store.setAnchor(project_id, anchor_stage_code, date);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/schedule/deliverable" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.upsertDeliverable(b.template_key, b.anchor_stage_code, b.deliverable_name, { offset_days: b.offset_days, default_artifact_type: b.default_artifact_type });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_edit", to: `${b.template_key}/${b.deliverable_name}=${b.offset_days}`, used_refs: ["se_stage_template"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/requirements" && req.method === "GET") return send(res, 200, store.artifactRequirements({ scope_kind: qp.scope_kind, scope_key: qp.scope_key }));
    if (path === "/api/requirements" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.setArtifactRequirement(JSON.parse(body || "{}"));
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/parts/completeness") { const r = store.boardCompleteness(qp.part); return send(res, r.error ? 404 : 200, r); }
    if (path === "/api/risk") return send(res, 200, store.riskAlerts({ project: qp.project ?? null }));
    if (path === "/api/inputs/fulfillment") return send(res, 200, store.inputFulfillment(qp.project));
    if (path === "/api/inputs/generate" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const ful = store.inputFulfillment(b.project_id).find((d) => d.scope_key === b.deliverable_name);
      if (!ful || !ful.fulfilled) return send(res, 409, { error: "inputs_incomplete", missing: ful?.missing ?? [] });
      // 키스톤(P-4-ai-A) 머지됨 → 자동 생성 대신 ai_proposal 큐에 pending 적재(사람 승인 후에만 실제 생성).
      const r = store.createProposal({ source: "input_fulfillment", kind: "create_item", payload: { project_id: b.project_id, title: `${b.deliverable_name} 초안` }, summary: `입력 충족: ${b.deliverable_name}`, used_refs: ["inputs"], data_label: "real" });
      return send(res, r.error ? 400 : 200, { ok: !r.error, queued: !r.error, proposal_id: r.id, status: "pending", note: "입력 충족 — ai_proposal 큐 적재(승인 후 생성)" });
    }
    if (path === "/api/proposals" && req.method === "GET") return send(res, 200, store.proposals({ status: qp.status || "pending" }));
    if (path === "/api/proposals" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createProposal({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/approve" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.approveProposal(JSON.parse(body || "{}").id, { decided_by: actor });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/reject" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.rejectProposal(b.id, { decided_by: actor, reason: b.reason ?? null });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/recommenders/run" && req.method === "POST") {
      // 수동 트리거(자동 cron 아님). 추천은 createProposal pending 만 — 자동 도메인 쓰기 0.
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.runRecommenders({ scope: b.scope ?? "all", project: b.project ?? null }));
    }
    // P3 재고/BOM/부품 (내부 판정만·외부전송 0)
    if (path === "/api/parts" && req.method === "GET") return send(res, 200, store.parts({ type: qp.type, grp: qp.grp, project: qp.project, q: qp.q }));
    if (path === "/api/parts" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertPart({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "part_upsert", to: r.id, used_refs: ["parts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/parts/link" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { part_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkPartProject(part_id, project_id);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/bom" && req.method === "GET") return send(res, 200, store.bom(qp.parent ?? ""));
    if (path === "/api/bom" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { parent_part_id, child_part_id, qty, ref_des } = JSON.parse(body || "{}");
      const r = store.addBomEdge(parent_part_id, child_part_id, qty, ref_des);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/locations" && req.method === "GET") return send(res, 200, store.locations());
    if (path === "/api/locations" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertLocation({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/stock" && req.method === "GET") return send(res, 200, store.stock({ part: qp.part, location: qp.location }));
    if (path === "/api/stock" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { part_id, location_id, qty } = JSON.parse(body || "{}");
      const r = store.setStock(part_id, location_id, qty);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "stock_set", item_ref: part_id, to: String(qty), used_refs: ["stock"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/stock/low") return send(res, 200, store.stockLow());
    if (path === "/api/bom/changes") return send(res, 200, store.bomChanges(qp.limit ? Number(qp.limit) : 20));
    // 연락처 마스터
    if (path === "/api/contacts" && req.method === "GET") return send(res, 200, store.contacts({ project: qp.project, party: qp.party }));
    if (path === "/api/contacts" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createContact({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_create", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts/link" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { contact_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkContactProject(contact_id, project_id);
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    // 파일 첨부(메타 포인터) + 배치 제안(⑧ reversible, 적용 아님)
    if (path === "/api/attachments" && req.method === "GET") return send(res, 200, store.attachments({ entity_type: qp.entity_type, entity_id: qp.entity_id }));
    if (path === "/api/attachments/suggest") return send(res, 200, store.suggestPlacement(qp.name ?? ""));
    if (path === "/api/attachments" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.addAttachment({ ...JSON.parse(body || "{}"), created_by: actor, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "attachment_add", to: r.id, used_refs: ["attachment"], data_label: "real" });
      return send(res, 200, r);
    }
    // 구매/발주
    if (path === "/api/parties/ledger") return send(res, 200, store.partyLedger());
    if (path === "/api/parties" && req.method === "GET") return send(res, 200, store.parties({ kind: qp.kind }));
    if (path === "/api/parties" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertParty({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    if (path === "/api/purchases" && req.method === "GET") return send(res, 200, store.purchases({ project: qp.project, party: qp.party, stage: qp.stage }));
    if (path === "/api/purchases" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createPurchase({ ...JSON.parse(body || "{}"), created_by: actor, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_create", to: r.id, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/stage" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, stage } = JSON.parse(body || "{}");
      const r = store.setPurchaseStage(id, stage);
      if (r.error) return send(res, r.error === "purchase_not_found" ? 404 : 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_stage", item_ref: id, from: r.from, to: r.to, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/link" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { purchase_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkPurchaseProject(purchase_id, project_id);
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    if (path === "/api/worklog/draft") return send(res, 200, store.worklogDraft({ project: qp.project ?? null, days: qp.days ? Number(qp.days) : 7 }));
    if (path === "/api/report/draft") return send(res, 200, store.reportDraft({ project: qp.project ?? null, kind: qp.kind === "note" ? "note" : "report" }));
    if (path === "/api/guide/summary") return send(res, 200, store.guideSummary());
    if (path === "/api/guide") return send(res, 200, store.guideState(qp.project ?? ""));
    if (path === "/api/guide/artifact" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, stage_code, name } = JSON.parse(body || "{}");
      const result = store.addGuideArtifact(project_id, stage_code, name);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "guide_artifact_add", item_ref: `${project_id}:${stage_code}`, to: name, project_ref: project_id, used_refs: ["guide", ".registry/skills/se_foldertree_generate"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/guide/step" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { artifact_id, step_key, on } = JSON.parse(body || "{}");
      const result = store.setGuideStep(artifact_id, step_key, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: on !== false ? "guide_step_done" : "guide_step_undo", item_ref: `guide:${artifact_id}`, to: step_key, project_ref: result.project_id, used_refs: ["guide"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_ids, project_id, make_items } = JSON.parse(body || "{}");
      const result = store.assignMails(mail_ids, project_id, { make_items: make_items === true, created_by: actor });
      if (result.error) return send(res, 400, result);
      for (const r of result.results) {
        if (r.error || r.unchanged) continue;
        store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "mail_assign",
          item_ref: r.mail_id, from: r.from, to: project_id, project_ref: project_id,
          used_refs: ["mail"], data_label: "real"
        });
        if (r.item_moved) store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "item_move",
          item_ref: r.item_moved, from: r.from, to: project_id, project_ref: project_id,
          used_refs: ["items", "mail"], data_label: "real"
        });
        if (r.item_created) store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "item_promote",
          item_ref: r.item_created, from: r.mail_id, project_ref: project_id,
          used_refs: ["items", "mail"], data_label: "real", note: "assign_spawn"
        });
      }
      return send(res, 200, result);
    }
    if (path === "/api/labels" && req.method === "GET") return send(res, 200, store.labels());
    if (path === "/api/labels" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { name, color } = JSON.parse(body || "{}");
      const result = store.createLabel(name, color);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_create", to: result.label.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/label" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id, label_id, on } = JSON.parse(body || "{}");
      const result = store.setMailLabel(mail_id, label_id, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: on !== false ? "label_add" : "label_remove", item_ref: mail_id, to: String(label_id), used_refs: ["mail_label_map"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/artifacts") return send(res, 200, store.artifacts({ project: qp.project, kind: qp.kind }));
    if (path === "/api/people") return send(res, 200, store.people());
    // P-6 능력 매트릭스 + 콕핏 nudges (점수 미저장·감시 아닌 지원)
    if (path === "/api/capability/matrix") return send(res, 200, store.capabilityMatrix());
    if (path === "/api/people/skill" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setPersonSkill(b.person_id, b.capability_label, { source_ref: b.source_ref ?? null, weight: b.weight ?? 1 });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "person_skill_set", item_ref: b.person_id, to: b.capability_label, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/nudges") return send(res, 200, store.nudges({ person: qp.person, limit: qp.limit ? Number(qp.limit) : 5 }));
    if (path === "/api/workload") return send(res, 200, store.workload(new Date().toISOString().slice(0, 10)));
    if (path === "/api/meetings/open") return send(res, 200, store.meetingOpenRollup());
    if (path === "/api/calendar.ics") {
      const ics = store.calendarIcs({ person: qp.person ?? null });
      return send(res, 200, ics, "text/calendar", { "content-disposition": `attachment; filename="dev-erp${qp.person ? `-${qp.person}` : ""}.ics"` });
    }
    if (path === "/api/search") return send(res, 200, crossSearch(store, qp.q));
    if (path === "/api/lexicon") return send(res, 200, { mode: qp.mode ?? "business", modes: Object.keys(LEXICON), labels: getLexicon(qp.mode) });
    if (path === "/api/modules") return send(res, 200, modulesFor(qp.mode));
    if (path === "/api/events/recent") return send(res, 200, store.recentEvents(qp.limit ? Number(qp.limit) : 30, qp.project ?? null));
    if (path === "/api/events" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const event = JSON.parse(body || "{}");
      if (!event.kind) return send(res, 400, { error: "kind_required" });
      store.appendEvent({ ...event, actor_kind: event.actor_kind ?? "human", data_label: event.data_label ?? "real" });
      return send(res, 200, { ok: true });
    }
    // ---------- P2b: 계정·권한·계정별 레이아웃 ----------
    if (path === "/api/me") {
      // 클라이언트 정체성 계약. 익명이면 account_count 로 bootstrap 필요 여부 판단.
      const a = currentAccount(req);
      if (!a) return send(res, 200, { anonymous: true, account_count: store.accountCount() });
      const prof = store.accountProfile(a);
      return send(res, 200, { account: prof, person_id: a.person_id, roles: prof.roles, perms: prof.perms, account_count: store.accountCount() });
    }
    // (인증/계정 엔드포인트는 상단 P2b 블록에서 처리 — 여기 중복 제거됨)
    if (path === "/api/dashboard/layout" && req.method === "GET") {
      const a = currentAccount(req);
      return send(res, 200, { layout: a ? store.getLayout(a.id) : null });
    }
    if (path === "/api/dashboard/layout" && req.method === "PUT") {
      const a = currentAccount(req);
      if (!a) return send(res, 401, { error: "login_required" });
      let body = ""; for await (const chunk of req) body += chunk;
      const { layout } = JSON.parse(body || "{}");
      if (!Array.isArray(layout)) return send(res, 400, { error: "layout_array_required" });
      store.setLayout(a.id, layout);
      return send(res, 200, { ok: true });
    }

    // ---------- 개발요청함(인입 채널) ----------
    if (path === "/api/requests" && req.method === "GET") return send(res, 200, store.requests({ project: qp.project, status: qp.status }));
    if (path === "/api/requests" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createRequest({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "request_create", to: result.id, project_ref: input.project_id ?? null, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/requests/promote" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.promoteRequest(id, actor);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "item_promote", item_ref: result.item.id, from: id, to: result.item.title, project_ref: result.item.project_id, used_refs: ["items", "requests"], data_label: "real" });
      return send(res, 200, result);
    }

    // ---------- SE 산출물 레지스터(목록은 ingest: tools/scan_se_foldertree.mjs --apply. 일정만 owner 편집 가능) ----------
    if (path === "/api/deliverables" && req.method === "GET") return send(res, 200, store.coreDeliverables({ project: qp.project, stage: qp.stage }));
    // owner 직접 산출물 등록 — 고정 단계 밖 중간번호(31·32…) 등 실제 산출물 추가.
    if (path === "/api/deliverables" && req.method === "POST") {
      const input = await readJson(req);
      const r = store.addDeliverable(input);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_add", to: input.name, project_ref: input.project_id, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }
    // 산출물 입력파일(메타·포인터 전용). 종류별 In 하위폴더 제안 + 등록/조회/상태.
    if (path === "/api/deliverables/input-subfolders") return send(res, 200, { subfolders: store.inputSubfoldersFor(qp.type) });
    if (path === "/api/deliverables/inputs" && req.method === "GET")
      return send(res, 200, store.deliverableInputs({ deliverable_id: qp.deliverable, project: qp.project }));
    if (path === "/api/deliverables/inputs" && req.method === "POST") {
      const r = store.registerDeliverableInput(await readJson(req));
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_input", to: r.id, used_refs: ["deliverables", "input"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/deliverables/inputs/status" && req.method === "POST") {
      const { id, status } = await readJson(req);
      const r = store.setDeliverableInputStatus(id, status);
      return send(res, r.error ? 400 : 200, r);
    }
    // 입력파일 다운로드/서빙 — 등록된 입력만(화이트리스트) + filevault 경로 봉쇄. 기본 OFF.
    if (path === "/api/deliverables/inputs/file") {
      if (!FILEIO) return send(res, 404, { error: "fileio_disabled" });
      const inp = store.deliverableInput(qp.id);
      if (!inp || !inp.pointer) return send(res, 404, { error: "input_or_pointer_missing" });
      const safe = safeWorkspacePath(ROOT, inp.pointer, { mustExist: true }); // 등록 포인터만 + 봉쇄
      if (safe.error) return send(res, 400, { error: `unsafe_${safe.error}` });
      const r = readSafe(safe);
      if (r.error) return send(res, 500, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "input_download", to: qp.id, used_refs: ["fileio"], data_label: "meta" });
      res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(inp.file_name || "file")}` });
      return res.end(r.bytes);
    }
    // 입력파일 업로드 — 산출물 in_pointer(02_Input) 하위 subfolder/filename 으로 기록 + 장부 등록. 기본 OFF.
    // body = 원본 바이트(브라우저 fetch 의 파일 blob). 메타(deliverable/subfolder/filename)는 쿼리.
    if (path === "/api/deliverables/inputs/upload" && req.method === "POST") {
      if (!FILEIO) return send(res, 404, { error: "fileio_disabled" });
      const did = qp.deliverable, subfolder = qp.subfolder || "", filename = qp.filename || "";
      const d = store.db.prepare("SELECT in_pointer, project_id FROM core_deliverable WHERE id=?").get(did);
      if (!d) return send(res, 404, { error: "deliverable_not_found" });
      if (!d.in_pointer) return send(res, 400, { error: "in_pointer_unset" }); // 02_Input 경로 미설정(스캔/등록 필요)
      // 원본 바이트 수신(상한 초과 시 중단 — 메모리 남용 방지).
      const chunks = []; let total = 0;
      for await (const c of req) { total += c.length; if (total > UPLOAD_MAX) return send(res, 413, { error: "too_large" }); chunks.push(c); }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) return send(res, 400, { error: "empty_body" });
      const target = safeUploadTarget(ROOT, d.in_pointer, subfolder, filename);
      if (target.error) return send(res, 400, { error: `unsafe_${target.error}` });
      const w = commitUpload(ROOT, target, bytes);
      if (w.error) return send(res, 400, { error: `write_${w.error}` });
      const reg = store.registerDeliverableInput({ deliverable_id: did, subfolder, file_name: filename, pointer: w.rel, source: "erp", sha256: w.sha256, size: w.size, status: "received" });
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "input_upload", to: reg.id, project_ref: d.project_id, used_refs: ["fileio"], data_label: "real" });
      return send(res, 200, { ok: true, id: reg.id, rel: w.rel, size: w.size, sha256: w.sha256 });
    }
    // 일정(due) owner 직접 지정 — '언제'는 RAG/스캔에 없어 사람이 변경한다(나중에 Codex 자동 분석 예정).
    if (path === "/api/deliverables/due" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setDeliverableDue(b.id, b.due);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_due_edit", to: `${b.id}=${r.due ?? "(해제)"}`, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }
    // 일정→할일: 산출물 1건 → 그 산출물 작성 할일 생성(SE앵커·연결·마감 상속). 중복 spawn 방지.
    if (path === "/api/deliverables/spawn-task" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.spawnTaskFromDeliverable(b.id, { work_type: b.work_type, created_by: actor });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "task_spawn_deliverable", item_ref: r.item.id, to: r.item.title, project_ref: r.item.project_id, used_refs: ["deliverables", "items"], data_label: "real" });
      return send(res, 200, r);
    }
    // 완료게이트 검토단계 진행/되돌리기(작성됨→본인→팀→리드=완료). 검토자 식별은 이벤트 actor 에 기록.
    if (path === "/api/deliverables/review" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setDeliverableReview(b.id, b.stage);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_review", to: `${b.id}=${r.review_stage}`, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }

    // ---------- 회의록(메타 전용) ----------
    if (path === "/api/meetings" && req.method === "GET") return send(res, 200, store.meetings({ project: qp.project }));
    if (path === "/api/meetings" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createMeeting({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "meeting_create", to: result.id, project_ref: input.project_id ?? null, used_refs: ["meetings"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/meetings/actions" && req.method === "GET") return send(res, 200, store.meetingActions(qp.meeting ?? ""));
    if (path === "/api/meetings/action" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { meeting_id, item_id } = JSON.parse(body || "{}");
      const result = store.linkActionItem(meeting_id, item_id);
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }

    if (path.startsWith("/api/")) return send(res, 404, { error: "not_found" });

    // 정적 파일 (no-build 클라이언트)
    const file = path === "/" ? "/index.html" : path;
    const full = join(HERE, "static", file);
    if (!full.startsWith(join(HERE, "static")) || !existsSync(full)) return send(res, 404, "not found", "text/plain");
    return send(res, 200, readFileSync(full, "utf-8"), MIME[extname(full)] ?? "text/plain");
  } catch (error) {
    return send(res, 500, { error: String(error?.message ?? error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-erp] http://${HOST}:${PORT} (db: ${DB_PATH})`);
  if (HOST !== "127.0.0.1") {
    console.log("[dev-erp] 주의: 같은 네트워크에 열려 있음 - 합성 데이터 파일럿 용도로만");
  }
  // autosync Phase 2: 할일_장부 → ERP 자동 import 폴링(결정적·LLM 무관). 동기 버튼 불필요.
  // 기본 OFF(테스트·:memory: 무영향). 켜기: 환경변수 DEV_ERP_AUTOSYNC=1 또는 --autosync. 간격 DEV_ERP_AUTOSYNC_MS(기본 10s).
  if (process.env.DEV_ERP_AUTOSYNC === "1" || args.includes("--autosync")) {
    const root = resolve(HERE, "..", "..", "..");
    // Phase 2: 할일_장부 → ERP 자동 import 폴링.
    startAutosyncPoll(store, { root, intervalMs: Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000, log: console.log });
    // Phase 1: ERP 할일 생성/수정 → 할일_장부 write-through(동기 버튼 없이). 실패는 로그(향후 sync_error 표면화).
    store.afterItemWrite = (id) => {
      try { const r = writeTaskToLedger(store, id, { root }); if (r?.error && r.error !== "item_or_project_missing") console.error("[autosync] write-through 실패:", id, r.error); }
      catch (e) { console.error("[autosync] write-through 오류:", id, e.message); } // TODO: 항목 sync_error 상태 + 재시도(Phase 3)
    };
    // 입력파일: ERP 등록/상태변경 → 입력파일_장부 write-through(같은 양방향 패턴).
    store.afterInputWrite = (id) => {
      try { const r = writeInputToLedger(store, id, { root }); if (r?.error && r.error !== "input_or_project_missing") console.error("[autosync] 입력 write-through 실패:", id, r.error); }
      catch (e) { console.error("[autosync] 입력 write-through 오류:", id, e.message); }
    };
    console.log(`[dev-erp] autosync ON — 할일_장부·입력파일_장부 ↔ ERP 양방향(import 폴링 ${Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000}ms + write-through). root: ${root}`);
  }
});
