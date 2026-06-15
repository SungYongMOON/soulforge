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
    if (path === "/api/items/confirm" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.confirmItem(input.id, input);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: "owner", actor_kind: "human", kind: "item_confirm",
        item_ref: result.item.id, to: result.item.work_type ?? "", project_ref: result.item.project_id,
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
    if (path === "/api/mail" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createMail({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "mail_register", to: result.mail.subject, project_ref: result.mail.project_id ?? null, used_refs: ["mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail") return send(res, 200, store.mail({
      project: qp.project, days: qp.days !== undefined ? Number(qp.days) : 90,
      q: qp.q, direction: qp.direction, label_id: qp.label_id
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "chat_query", to: r.matched ? "matched" : "unanswered", used_refs: ["chat", "faq"], data_label: "meta", note: thread_id ? `thread=${thread_id}` : null });
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "knowledge_upsert", item_ref: r.id, to: b.title, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
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
      if (!r.error) store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "embed_register", to: r.id, used_refs: ["embed_view"], data_label: "meta" });
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "calculator_activate", item_ref: id, used_refs: ["calculator"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/chat/unanswered") return send(res, 200, store.unansweredQueries(qp.limit ? Number(qp.limit) : 50));
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "deliverable_edit", to: `${b.template_key}/${b.deliverable_name}=${b.offset_days}`, used_refs: ["se_stage_template"], data_label: "real" });
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
      const r = store.approveProposal(JSON.parse(body || "{}").id, { decided_by: "owner" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/reject" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.rejectProposal(b.id, { decided_by: "owner", reason: b.reason ?? null });
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "part_upsert", to: r.id, used_refs: ["parts"], data_label: "real" });
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "stock_set", item_ref: part_id, to: String(qty), used_refs: ["stock"], data_label: "real" });
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
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "contact_create", to: r.id, used_refs: ["contacts"], data_label: "real" });
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
      const r = store.addAttachment({ ...JSON.parse(body || "{}"), created_by: "owner", data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "attachment_add", to: r.id, used_refs: ["attachment"], data_label: "real" });
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
      const r = store.createPurchase({ ...JSON.parse(body || "{}"), created_by: "owner", data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "purchase_create", to: r.id, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/stage" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, stage } = JSON.parse(body || "{}");
      const r = store.setPurchaseStage(id, stage);
      if (r.error) return send(res, r.error === "purchase_not_found" ? 404 : 400, r);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "purchase_stage", item_ref: id, from: r.from, to: r.to, used_refs: ["purchase"], data_label: "real" });
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
    // P-6 능력 매트릭스 + 콕핏 nudges (점수 미저장·감시 아닌 지원)
    if (path === "/api/capability/matrix") return send(res, 200, store.capabilityMatrix());
    if (path === "/api/people/skill" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setPersonSkill(b.person_id, b.capability_label, { source_ref: b.source_ref ?? null, weight: b.weight ?? 1 });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "person_skill_set", item_ref: b.person_id, to: b.capability_label, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
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

    // ---------- 개발요청함(인입 채널) ----------
    if (path === "/api/requests" && req.method === "GET") return send(res, 200, store.requests({ project: qp.project, status: qp.status }));
    if (path === "/api/requests" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createRequest({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "request_create", to: result.id, project_ref: input.project_id ?? null, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/requests/promote" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.promoteRequest(id, "owner");
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "item_promote", item_ref: result.item.id, from: id, to: result.item.title, project_ref: result.item.project_id, used_refs: ["items", "requests"], data_label: "real" });
      return send(res, 200, result);
    }

    // ---------- SE 산출물 레지스터(목록은 ingest: tools/scan_se_foldertree.mjs --apply. 일정만 owner 편집 가능) ----------
    if (path === "/api/deliverables" && req.method === "GET") return send(res, 200, store.coreDeliverables({ project: qp.project, stage: qp.stage }));
    // 일정(due) owner 직접 지정 — '언제'는 RAG/스캔에 없어 사람이 변경한다(나중에 Codex 자동 분석 예정).
    if (path === "/api/deliverables/due" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setDeliverableDue(b.id, b.due);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "deliverable_due_edit", to: `${b.id}=${r.due ?? "(해제)"}`, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }
    // 완료게이트 검토단계 진행/되돌리기(작성됨→본인→팀→리드=완료). 검토자 식별은 이벤트 actor 에 기록.
    if (path === "/api/deliverables/review" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setDeliverableReview(b.id, b.stage);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: currentAccount(req)?.username ?? "owner", actor_kind: "human", kind: "deliverable_review", to: `${b.id}=${r.review_stage}`, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
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
