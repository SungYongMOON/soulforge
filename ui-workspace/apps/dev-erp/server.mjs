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
import { guideTemplates } from "./src/guide.mjs";
import { modulesFor } from "./src/modules.mjs";
import { crossSearch } from "./src/search.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

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

function lastIngestAt() {
  const rows = store.db.prepare("SELECT at FROM event_log WHERE kind='ingest' ORDER BY id DESC LIMIT 1").get();
  return rows?.at ?? null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const qp = Object.fromEntries(url.searchParams.entries());
  try {
    if (path === "/api/health") return send(res, 200, { ok: true, schema: "dev_erp.v1", counts: store.counts() });
    if (path === "/api/summary") {
      const today = todayKey();
      const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      return send(res, 200, { today, week_end: weekEnd, freshness: lastIngestAt(), projects: store.summary(today, weekEnd) });
    }
    if (path === "/api/items" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createItem({ ...input, created_by: "owner" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: "owner", actor_kind: "human", kind: "item_create",
        item_ref: result.item.id, to: result.item.title, project_ref: result.item.project_id,
        used_refs: result.item.guide_artifact_id ? ["items", "guide"] : ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/status" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, status, bottleneck_reason } = JSON.parse(body || "{}");
      const result = store.setItemStatus(id, status);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: "owner", actor_kind: "human", kind: "item_status",
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
        actor_ref: "owner", actor_kind: "human", kind: "item_assign",
        item_ref: id, from: result.from, to: assignee_ref || null, project_ref: result.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/promote" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      const result = store.promoteMail(mail_id, "owner");
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: "owner", actor_kind: "human", kind: "item_promote",
        item_ref: result.item.id, from: mail_id, to: result.item.title,
        project_ref: result.item.project_id, used_refs: ["items", "mail"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items") return send(res, 200, store.items({ project: qp.project, status: qp.status, q: qp.q, due_before: qp.due === "soon" ? todayKey() : undefined }));
    if (path === "/api/mail") return send(res, 200, store.mail({
      project: qp.project, days: qp.days !== undefined ? Number(qp.days) : 90,
      q: qp.q, direction: qp.direction, label_id: qp.label_id
    }));
    if (path === "/api/guide/templates") return send(res, 200, guideTemplates(qp.mode));
    if (path === "/api/gates") return send(res, 200, { mode: store.gateMode(), stages: store.gates({ project: qp.project }) });
    if (path === "/api/gates/clear" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { stage_id, force } = JSON.parse(body || "{}");
      const result = store.clearStage(stage_id, { force: !!force });
      if (result.error) return send(res, result.error === "stage_not_found" ? 404 : 409, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "gate_clear", to: stage_id, project_ref: result.project_id, used_refs: ["gates"], data_label: "real", note: result.forced ? `forced(${result.mode})` : result.mode });
      return send(res, 200, result);
    }
    if (path === "/api/settings/gate_mode" && req.method === "GET") return send(res, 200, { mode: store.gateMode() });
    if (path === "/api/settings/gate_mode" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mode } = JSON.parse(body || "{}");
      const r = store.setGateMode(mode);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "gate_mode_set", to: r.mode, used_refs: ["gates", "settings"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/guide/summary") return send(res, 200, store.guideSummary());
    if (path === "/api/guide") return send(res, 200, store.guideState(qp.project ?? ""));
    if (path === "/api/guide/artifact" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, stage_code, name } = JSON.parse(body || "{}");
      const result = store.addGuideArtifact(project_id, stage_code, name);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "guide_artifact_add", item_ref: `${project_id}:${stage_code}`, to: name, project_ref: project_id, used_refs: ["guide", ".registry/skills/se_foldertree_generate"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/guide/step" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { artifact_id, step_key, on } = JSON.parse(body || "{}");
      const result = store.setGuideStep(artifact_id, step_key, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: on !== false ? "guide_step_done" : "guide_step_undo", item_ref: `guide:${artifact_id}`, to: step_key, project_ref: result.project_id, used_refs: ["guide"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_ids, project_id, make_items } = JSON.parse(body || "{}");
      const result = store.assignMails(mail_ids, project_id, { make_items: make_items === true, created_by: "owner" });
      if (result.error) return send(res, 400, result);
      for (const r of result.results) {
        if (r.error || r.unchanged) continue;
        store.appendEvent({
          actor_ref: "owner", actor_kind: "human", kind: "mail_assign",
          item_ref: r.mail_id, from: r.from, to: project_id, project_ref: project_id,
          used_refs: ["mail"], data_label: "real"
        });
        if (r.item_moved) store.appendEvent({
          actor_ref: "owner", actor_kind: "human", kind: "item_move",
          item_ref: r.item_moved, from: r.from, to: project_id, project_ref: project_id,
          used_refs: ["items", "mail"], data_label: "real"
        });
        if (r.item_created) store.appendEvent({
          actor_ref: "owner", actor_kind: "human", kind: "item_promote",
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "label_create", to: result.label.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/label" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id, label_id, on } = JSON.parse(body || "{}");
      const result = store.setMailLabel(mail_id, label_id, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: on !== false ? "label_add" : "label_remove", item_ref: mail_id, to: String(label_id), used_refs: ["mail_label_map"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/artifacts") return send(res, 200, store.artifacts({ project: qp.project, kind: qp.kind }));
    if (path === "/api/people") return send(res, 200, store.people());
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
      const a = currentAccount(req);
      if (!a) return send(res, 200, { anonymous: true, account_count: store.accountCount() });
      return send(res, 200, { account: { id: a.id, username: a.username }, person_id: a.person_id, roles: store.rolesFor(a.id), perms: store.permsFor(a.id) });
    }
    if (path === "/api/auth/login" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { username, password } = JSON.parse(body || "{}");
      const a = store.verifyLogin(username, password);
      if (!a) return send(res, 401, { error: "invalid_credentials" });
      const token = store.createSession(a.id);
      store.appendEvent({ actor_ref: a.username, actor_kind: "human", kind: "login", used_refs: ["auth"], data_label: "real" });
      const cookie = `${SID}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`;
      return send(res, 200, { ok: true, account: { id: a.id, username: a.username }, roles: store.rolesFor(a.id), perms: store.permsFor(a.id) }, "application/json", { "set-cookie": cookie });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      const tok = readCookie(req, SID);
      if (tok) store.deleteSession(tok);
      return send(res, 200, { ok: true }, "application/json", { "set-cookie": `${SID}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
    }
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

    // ---------- 회의록(메타 전용) ----------
    if (path === "/api/meetings" && req.method === "GET") return send(res, 200, store.meetings({ project: qp.project }));
    if (path === "/api/meetings" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createMeeting({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "meeting_create", to: result.id, project_ref: input.project_id ?? null, used_refs: ["meetings"], data_label: "real" });
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
});
