#!/usr/bin/env node
// dev-erp P1 서버: 외부 의존성 0 (node:http + node:sqlite).
// 사용: node server.mjs [--port 4310] [--db data/dev-erp.db] [--ingest <json>] [--fixture]
// 포트 원칙: runtime checkout 운영본만 4300, 개발/작업본 기본은 4310.
// 기본: 빈 DB 는 비워 둔다. 데모 데이터는 --fixture 또는 DEV_ERP_LOAD_FIXTURE=1 일 때만 적재.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, extname, resolve, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "./src/store.mjs";
import { loadFixture } from "./src/fixture.mjs";
import { ingestFromFile } from "./src/adapter.mjs";
import { getLexicon, LEXICON } from "./src/lexicon.mjs";
import { guideTemplates, docRecipes } from "./src/guide.mjs";
import { modulesFor } from "./src/modules.mjs";
import { groupedKnowledge, knowledgeRegistryDir } from "./src/knowledge_registry.mjs";
import {
  scanKnowledgeLedgers,
  scanKnowledgeShellContract,
  scanKnowledgeSpaces,
  scanRagRoutes,
  scanRagWorkCards,
  scanWikiPageRefs,
} from "./src/knowledge_shell.mjs";
import { crossSearch } from "./src/search.mjs";
import { buildMetaContext, runLlm, answerFromManual, CHATBOT_VERSION, llmThinkEnabled, suggestSplit, summarizeCompletion } from "./src/llm.mjs";
import { loadPartyMonsterTypes } from "./src/party_match.mjs";
import { startAutosyncPoll, writeTaskToLedger, writeInputToLedger } from "./src/autosync.mjs";
import { mailboxEnvRelPath, hiworksEnvUpdates, writeMailboxEnv, deleteMailboxEnv, parseMailTestResult } from "./src/mailbox_env.mjs";
import { collectAllMailboxes, isCollecting } from "./src/mail_collect.mjs";
const execFileP = promisify(execFile);
import { safeWorkspacePath, safeUploadTarget, commitUpload, readSafe } from "./src/filevault.mjs";
import { CODEX_TASK_BRIDGE_VERSION, runCodexTaskTurn } from "./src/codex_bridge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

// 파일 IO(산출물 입력파일 업/다운로드)는 기본 OFF. 켜기: DEV_ERP_FILEIO=1 또는 --fileio.
// 모든 경로는 <ROOT>/_workspaces 아래로만(filevault path-safety). 절대경로·../·심볼릭 탈출 차단.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CODEX_TASK_BRIDGE_MODE = process.env.DEV_ERP_CODEX_TASK_BRIDGE || "app-server";
const CODEX_TASK_BRIDGE_CWD = resolve(process.env.DEV_ERP_CODEX_TASK_CWD || ROOT);
const CODEX_TASK_TIMEOUT_MS = Number(process.env.DEV_ERP_CODEX_TASK_TIMEOUT_MS || 120000);
const CODEX_HOME = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const CODEX_TASK_ATTACHMENT_ROOT = resolve(process.env.DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT || join(ROOT, "_workspaces", "system", "dev-erp", "codex-task-attachments"));
const CODEX_TASK_IMAGE_MAX = Number(process.env.DEV_ERP_CODEX_TASK_IMAGE_MAX || 8 * 1024 * 1024);
const CODEX_TASK_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const CODEX_TASK_BASE_MODEL_OPTIONS = ["gpt-5.5", "gpt-5.4", "gpt-5.3"];
const CODEX_TASK_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"];
const CODEX_TASK_ALLOW_FAST = process.env.DEV_ERP_CODEX_TASK_ALLOW_FAST === "1";
const CODEX_TASK_SERVICE_TIER_OPTIONS = []; // 속도(tier) 선택 제거 — flex·fast 안 씀. codex 기본 tier 사용(config.toml 에 service_tier 없음) → "unknown variant" 오류 영구 차단.
const CODEX_TASK_DEFAULT_MODEL = String(process.env.DEV_ERP_CODEX_TASK_MODEL || CODEX_TASK_BASE_MODEL_OPTIONS[0]).trim() || CODEX_TASK_BASE_MODEL_OPTIONS[0];
const CODEX_TASK_DEFAULT_EFFORT_RAW = String(process.env.DEV_ERP_CODEX_TASK_EFFORT || "").trim().toLowerCase();
const CODEX_TASK_DEFAULT_EFFORT = CODEX_TASK_EFFORT_OPTIONS.includes(CODEX_TASK_DEFAULT_EFFORT_RAW) ? CODEX_TASK_DEFAULT_EFFORT_RAW : "medium";
const CODEX_TASK_DEFAULT_SERVICE_TIER_RAW = String(process.env.DEV_ERP_CODEX_TASK_SERVICE_TIER || process.env.DEV_ERP_CODEX_SERVICE_TIER || "").trim().toLowerCase();
const CODEX_TASK_DEFAULT_SERVICE_TIER = CODEX_TASK_SERVICE_TIER_OPTIONS.includes(CODEX_TASK_DEFAULT_SERVICE_TIER_RAW) ? CODEX_TASK_DEFAULT_SERVICE_TIER_RAW : ""; // tier override 안 보냄 → codex 기본값
const CODEX_TASK_DEFAULTS = Object.freeze({
  model: CODEX_TASK_DEFAULT_MODEL,
  effort: CODEX_TASK_DEFAULT_EFFORT,
  service_tier: CODEX_TASK_DEFAULT_SERVICE_TIER,
});
const KNOWLEDGE_SHELL_ROOT = resolve(flag("knowledge_shell_root", ROOT));
const FILEIO = process.env.DEV_ERP_FILEIO === "1" || process.argv.includes("--fileio");
const UPLOAD_MAX = Number(process.env.DEV_ERP_UPLOAD_MAX || 50 * 1024 * 1024); // 50MB 기본 상한
const isRuntimeCheckout = (p) => /(^|[\\/])Soulforge-runtime([\\/]|$)/i.test(resolve(p));
const IS_RUNTIME_CHECKOUT = isRuntimeCheckout(ROOT) || isRuntimeCheckout(HERE);
const RUNTIME_PORT = Number(process.env.DEV_ERP_RUNTIME_PORT || 4300);
const DEV_PORT = Number(process.env.DEV_ERP_DEV_PORT || 4310);
const DEFAULT_PORT = IS_RUNTIME_CHECKOUT ? RUNTIME_PORT : DEV_PORT;
const PORT = Number(flag("port", DEFAULT_PORT));
const ALLOW_NON_RUNTIME_4300 = process.env.DEV_ERP_ALLOW_DEV_4300 === "1" || args.includes("--allow-dev-4300");
if (PORT === RUNTIME_PORT && !IS_RUNTIME_CHECKOUT && !ALLOW_NON_RUNTIME_4300) {
  console.error(`[dev-erp] refused: port ${RUNTIME_PORT} is reserved for the runtime checkout. Use --port ${DEV_PORT} for development, or set DEV_ERP_ALLOW_DEV_4300=1 for an explicit emergency override.`);
  process.exit(2);
}
// 기본은 localhost 전용(안전). 같은 네트워크 공유가 필요할 때만 --host 0.0.0.0
// (합성 데이터 파일럿 한정 권장 — 실데이터+팀 공개는 P2 RBAC 이후)
const HOST = flag("host", "127.0.0.1");
// HTTPS reverse proxy/tunnel 뒤에서 팀 공개 시 켠다. 로컬 http 파일럿은 기본 OFF.
const COOKIE_SECURE = process.env.DEV_ERP_COOKIE_SECURE === "1" || args.includes("--secure-cookie");
// 팀 운영 기본값은 관리자/roster 생성 계정만 허용. localhost 자가가입 파일럿 때만 명시적으로 켠다.
const ALLOW_SELF_REGISTER = process.env.DEV_ERP_ALLOW_SELF_REGISTER === "1" || args.includes("--allow-self-register");
// 빈 DB 는 실제 운영/PC 동기화에서 샘플이 되살아나지 않게 기본 비움. 데모/테스트만 명시적으로 켠다.
const LOAD_FIXTURE = (process.env.DEV_ERP_LOAD_FIXTURE === "1" || args.includes("--fixture")) && !args.includes("--no-fixture") && process.env.DEV_ERP_NO_FIXTURE !== "1";
const DEFAULT_DB_PATH = join(HERE, "data", "dev-erp.db");
const DB_PATH = flag("db", DEFAULT_DB_PATH);
const DB_IS_DEFAULT = DB_PATH !== ":memory:" && resolve(DB_PATH) === resolve(DEFAULT_DB_PATH);
const INGEST_PATH = flag("ingest", null);
const AUTO_REAL_META = (DB_IS_DEFAULT || process.env.DEV_ERP_AUTO_REAL_META === "1") && !args.includes("--no-real-meta") && process.env.DEV_ERP_NO_REAL_META !== "1";
if (DB_PATH !== ":memory:") mkdirSync(dirname(DB_PATH), { recursive: true });
// Canon 지식 저장소(읽기 전용 소비). 기본 = repo 루트 .registry/knowledge (상대 resolve).
const KNOW_DIR = flag("knowledge_dir", knowledgeRegistryDir(HERE));
const KNOWLEDGE_SHELL = { root: KNOWLEDGE_SHELL_ROOT };
const STATIC_ROOT = resolve(HERE, "static");
const SKIN_ROOTS = [...new Set([
  flag("skins_dir", null),
  process.env.DEV_ERP_SKINS_DIR || null,
  join(ROOT, "_workspaces", "system", "dev-erp", "skins"),
  join(HERE, "static", "skins"),
].filter(Boolean).map((p) => resolve(p)))];
// 4번째 버전 세그먼트 = dev-erp 경로 커밋수(자동 증가). 매 dev-erp 배포(커밋)마다 +1 → '버전이 그대로'를 수동 깜빡임 없이 방지. git 없으면 0(best-effort).
function erpBuildSeq() {
  try { return Number(execSync("git rev-list --count HEAD -- .", { cwd: HERE, encoding: "utf8" }).trim()) || 0; } catch { return 0; }
}
const ERP_VERSION = Object.freeze({
  release: `v1.2.0.${erpBuildSeq()}`,   // MAJOR.MINOR.PATCH.BUILD — 기능 묶음=PATCH 수동, 매 배포=BUILD 자동
  build: "ui-2026.06.23",
  source: "server.mjs"
});

const store = openStore(DB_PATH);
try { const bf = store.backfillCompletionLog(); if (bf.inserted) console.log(`[completion_log] 과거 완료 ${bf.inserted}건 백필`); } catch { /* 백필 실패가 기동을 막지 않음 */ }
// 분해: 정본 파티 허용목록(.party) — createItem party_ref 검증 + split-suggest 매칭에 재사용(시작 시 1회 로드).
const PARTY_MATCH = loadPartyMonsterTypes(ROOT);
store.setValidParties(new Set(Object.values(PARTY_MATCH.typeToParty)));
// 감사로그 '조회·잡음' kind — UI EVENT_HIDE 와 동일. noise=0 시 서버에서 제외.
const AUDIT_NOISE_KINDS = ["view", "llm_call", "chat_query", "recommender_run"];
// P1b: data/real_meta.json 이 있으면 (갱신 시각 기준) 자동 ingest.
// 최초 실데이터 도착 시 합성 표본은 제거한다 (가짜/실제 혼합 방지).
const realMetaPath = join(HERE, "data", "real_meta.json");
if (INGEST_PATH) {
  const report = ingestFromFile(store, resolve(INGEST_PATH));
  console.log("[dev-erp] ingest:", JSON.stringify(report));
} else if (AUTO_REAL_META && existsSync(realMetaPath)) {
  const mtime = String(statSync(realMetaPath).mtimeMs);
  if (store.getMeta("real_ingest_mtime") !== mtime) {
    const purged = store.purgeSynthetic();
    const report = ingestFromFile(store, realMetaPath, { label: "real" });
    store.setMeta("real_ingest_mtime", mtime);
    console.log("[dev-erp] real meta ingested:", JSON.stringify({ purged_synthetic: purged, ...report }));
  }
} else if (store.counts().projects === 0) {
  if (LOAD_FIXTURE) {
    const counts = loadFixture(store);
    console.log("[dev-erp] synthetic fixture loaded:", JSON.stringify(counts));
  } else {
    console.log("[dev-erp] empty db: synthetic fixture skipped (use --fixture to load demo data)");
  }
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const todayKey = () => new Date().toISOString().slice(0, 10);

function send(res, code, body, type = "application/json", extraHeaders = {}) {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", ...extraHeaders });
  res.end(payload);
}
function isInside(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}
function serveFile(res, full) {
  const type = MIME[extname(full)] ?? "text/plain";
  // 텍스트류는 utf-8, 이미지 등 바이너리는 Buffer 그대로(utf-8로 읽으면 깨짐).
  const binary = !(type.startsWith("text/") || type === "application/json" || type === "image/svg+xml");
  return send(res, 200, binary ? readFileSync(full) : readFileSync(full, "utf-8"), type);
}
function serveFromRoot(res, root, relPath) {
  const full = resolve(root, relPath);
  if (!isInside(root, full) || !existsSync(full)) return false;
  try {
    if (!statSync(full).isFile()) return false;
  } catch {
    return false;
  }
  serveFile(res, full);
  return true;
}

const SID_BASE = "dev_erp_sid";
const SID = `${SID_BASE}_${PORT}`;
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
// 로그인 브루트포스 방지: IP+아이디별 인메모리 실패 카운트. 5회 연속 실패 시 60초 차단, 성공 시 초기화.
// 사내망 전제라 인메모리로 충분(서버 재시작 시 리셋 — 영속 잠금은 과잉).
const LOGIN_FAILS = new Map(); // key -> { n, until }
function loginBlockedSec(key) {
  const f = LOGIN_FAILS.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function noteLoginFail(key) {
  const f = LOGIN_FAILS.get(key) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.until = Date.now() + 60_000; f.n = 0; }
  LOGIN_FAILS.set(key, f);
}
// 세션 쿠키 문자열. HttpOnly+SameSite=Lax, 팀 공개 HTTPS proxy/tunnel 에서는 Secure 옵션 사용.
function sessionCookie(token, maxAgeSec) {
  const attrs = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${COOKIE_SECURE ? "; Secure" : ""}`;
  const primary = `${SID}=${encodeURIComponent(token)}; ${attrs}`;
  const clearLegacy = `${SID_BASE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
  return SID === SID_BASE ? primary : [primary, clearLegacy];
}
// 관리자 가드: admin 역할 계정만. 아니면 null.
function requireAdmin(req) {
  const a = currentAccount(req);
  return a && store.isAdmin(a.id) ? a : null;
}
function allowSharedWrite(req, res) {
  if (store.accountCount() === 0 || requireAdmin(req)) return true;
  send(res, 403, { error: "admin_only" });
  return false;
}
async function readJson(req) {
  let body = ""; for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || "{}"); } catch { return {}; }
}
async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error("too_large");
      err.code = "too_large";
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function intParam(value, fallback, { min = 0, max = 500 } = {}) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function wantsPage(qp) {
  return qp.page === "1" || qp.page === "true";
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

function canAccessMail(req, mail_id) {
  const mailbox = viewMailbox(req, {});
  if (!mailbox || mailbox === "team") return true;
  if (mailbox === "__none__") return false;
  const row = store.db.prepare("SELECT mailbox FROM core_mail WHERE id=?").get(mail_id);
  if (!row) return true;
  if (!row.mailbox || !String(row.mailbox).trim()) return true; // 메일함 메타 없는 수집 받은함 메일=로그인 팀원이 함께 분류·분배하는 공용 큐(canAccessItem unclassified 예외와 대칭)
  return store.mailboxMatches(row.mailbox, mailbox);
}

function requestScope(req, qp = {}) {
  const me = currentAccount(req);
  if (!me || store.isAdmin(me.id)) return { all: true };
  return { actor: me.username, assignee_any: viewIdentities(req, qp), mailbox: viewMailbox(req, qp) };
}

function canAccessItem(req, item_id) {
  const me = currentAccount(req);
  if (!me || store.isAdmin(me.id)) return true;
  const row = store.db.prepare("SELECT assignee_ref,status FROM core_item WHERE id=?").get(item_id);
  if (!row) return true;
  if (row.status === "unclassified") return true; // 미분류 인입함은 로그인 팀원이 함께 분류하는 공용 큐.
  if (!row.assignee_ref && !["done", "archived"].includes(row.status)) return true; // 미배정(주인 없는) 활성 할일 = 아무나 먼저 잡는 공용 풀
  return viewIdentities(req, {}).includes(row.assignee_ref);
}

function lastIngestAt() {
  const rows = store.db.prepare("SELECT at FROM event_log WHERE kind IN ('ingest','mail_ingest') ORDER BY id DESC LIMIT 1").get();
  return rows?.at ?? null;
}
function runtimeVersion() {
  return {
    schema: "dev_erp.version.v1",
    erp: ERP_VERSION,
    chatbot: CHATBOT_VERSION,
    runtime: {
      port: PORT,
      checkout: IS_RUNTIME_CHECKOUT ? "runtime" : "development",
      llm: {
        provider: process.env.ERP_CHAT_PROVIDER || "stub",
        model: process.env.ERP_CHAT_MODEL || "gemma3:4b",
        thinking: llmThinkEnabled()
      },
      codex_task: {
        mode: CODEX_TASK_BRIDGE_MODE,
        bridge: CODEX_TASK_BRIDGE_VERSION.release
      }
    }
  };
}

let codexSkillCache = { at: 0, rows: [] };
function cleanFrontmatterValue(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}
function parseSkillMeta(skillPath) {
  let text = "";
  try { text = readFileSync(skillPath, "utf8"); } catch { return null; }
  const head = text.startsWith("---") ? text.slice(3, text.indexOf("\n---", 3) > 0 ? text.indexOf("\n---", 3) : 3000) : text.slice(0, 3000);
  const name = cleanFrontmatterValue(head.match(/^name:\s*(.+)$/m)?.[1]) || basename(dirname(skillPath));
  const description = cleanFrontmatterValue(head.match(/^description:\s*(.+)$/m)?.[1]);
  if (!name) return null;
  return { name, description, path: skillPath };
}
function collectSkillFiles(root, { maxDepth = 8, maxFiles = 500 } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    if (found.length >= maxFiles || depth > maxDepth) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= maxFiles) break;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") found.push(full);
      else if (entry.isDirectory()) walk(full, depth + 1);
    }
  };
  if (existsSync(root)) walk(root, 0);
  return found;
}
function listCodexSkills({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && codexSkillCache.rows.length && now - codexSkillCache.at < 30000) return codexSkillCache.rows;
  const roots = [
    join(CODEX_HOME, "skills"),
    join(CODEX_HOME, "plugins", "cache"),
  ];
  const byName = new Map();
  for (const root of roots) {
    for (const file of collectSkillFiles(root)) {
      const meta = parseSkillMeta(file);
      if (!meta) continue;
      const prev = byName.get(meta.name);
      if (!prev || file.includes(`${sep}skills${sep}`)) byName.set(meta.name, meta);
    }
  }
  codexSkillCache = {
    at: now,
    rows: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400),
  };
  return codexSkillCache.rows;
}
function codexTaskCapabilities() {
  return {
    ok: true,
    defaults: CODEX_TASK_DEFAULTS,
    model_options: [...new Set([CODEX_TASK_DEFAULT_MODEL, ...CODEX_TASK_BASE_MODEL_OPTIONS])],
    effort_options: CODEX_TASK_EFFORT_OPTIONS,
    service_tier_options: CODEX_TASK_SERVICE_TIER_OPTIONS,
    attachments: {
      local_image: true,
      arbitrary_file: false,
      max_image_bytes: CODEX_TASK_IMAGE_MAX,
      note: "Codex app-server input supports localImage paths; arbitrary file upload is intentionally not converted into prompt text.",
    },
    skills: listCodexSkills(),
  };
}
function normalizeCodexTaskServiceTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  return CODEX_TASK_SERVICE_TIER_OPTIONS.includes(tier) ? tier : CODEX_TASK_DEFAULT_SERVICE_TIER;
}
function mentionedCodexSkills(text) {
  const skills = listCodexSkills();
  const byName = new Map(skills.map((s) => [s.name, s]));
  const picked = new Map();
  const re = /(^|\s)[$/]([A-Za-z0-9_.:-]{2,})/g;
  for (const m of String(text || "").matchAll(re)) {
    const name = m[2];
    const skill = byName.get(name) || skills.find((s) => s.name.endsWith(`:${name}`));
    if (skill) picked.set(skill.name, skill);
    if (picked.size >= 8) break;
  }
  return [...picked.values()];
}
function safeAttachmentFilename(name) {
  const base = basename(String(name || "image")).replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_").replace(/\s+/g, " ").trim();
  return (base || "image").slice(0, 120);
}
function codexTaskAttachmentDir(itemId) {
  const safeId = String(itemId || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "unknown";
  const dir = resolve(CODEX_TASK_ATTACHMENT_ROOT, safeId);
  if (!isInside(CODEX_TASK_ATTACHMENT_ROOT, dir)) return null;
  mkdirSync(dir, { recursive: true });
  return dir;
}
function localImagesFromAttachments(attachments) {
  const rows = Array.isArray(attachments) ? attachments : [];
  const out = [];
  for (const a of rows) {
    if (a?.type !== "localImage" || !a.path) continue;
    const full = resolve(String(a.path));
    if (!isInside(CODEX_TASK_ATTACHMENT_ROOT, full)) continue;
    if (!CODEX_TASK_IMAGE_EXTS.has(extname(full).toLowerCase())) continue;
    if (!existsSync(full)) continue;
    out.push({ path: full });
    if (out.length >= 6) break;
  }
  return out;
}

function codexTaskState(item, extra = {}) {
  return {
    ok: true,
    mode: CODEX_TASK_BRIDGE_MODE,
    bridge: CODEX_TASK_BRIDGE_VERSION,
    item,
    binding: store.codexTaskBinding(item.id) ?? null,
    messages: store.codexTaskMessages(item.id),
    full_access: store.codexFullAccess(item.id), // 대화별 전체권한 토글 상태(UI 표시)
    ...extra,
  };
}

function appendWorkLifecycleEvent({ actor, item, from, to, kind, note = null, used_refs = ["items"] } = {}) {
  if (!item?.id || !kind) return;
  store.appendEvent({
    actor_ref: actor,
    actor_kind: "human",
    kind,
    item_ref: item.id,
    from,
    to,
    project_ref: item.project_id,
    used_refs,
    data_label: "real",
    note,
  });
}

function afterWorkStarted({ actor, item, from, to } = {}) {
  if (!item?.id || from !== "open" || to !== "doing") return;
  appendWorkLifecycleEvent({
    actor,
    item,
    from,
    to,
    kind: "work_started",
    note: "source_surface=erp;trigger=item_status",
  });
}

function afterWorkCompleted({ actor, item, from, to } = {}) {
  if (!item?.id || to !== "done" || from === "done") return null;
  const clog = store.logCompletion(item, { completed_by: actor });
  const binding = store.codexTaskBinding(item.id);
  const used_refs = ["items", "completion_log"];
  const noteParts = ["source_surface=erp", "trigger=item_status"];
  if (clog?.id) noteParts.push(`completion_log_id=${clog.id}`);
  if (binding?.thread_id) {
    used_refs.push("codex_thread_binding");
    noteParts.push(`codex_thread_id=${binding.thread_id}`);
  }
  appendWorkLifecycleEvent({
    actor,
    item,
    from,
    to,
    kind: "work_completed",
    used_refs,
    note: noteParts.join(";"),
  });
  (async () => {
    let msgs = [];
    let latestMsg = null;
    const hookUsedRefs = () => {
      const refs = ["completion_log"];
      if (binding?.thread_id) refs.push("codex_thread_binding");
      if (msgs.length) refs.push("codex_thread_message");
      return refs;
    };
    const hookNote = (phase, proposal = null) => [
      phase ? `phase=${phase}` : null,
      clog?.id ? `completion_log_id=${clog.id}` : null,
      proposal?.id ? `proposal_id=${proposal.id}` : null,
      binding?.thread_id ? `codex_thread_id=${binding.thread_id}` : null,
      latestMsg?.id ? `codex_last_message_id=${latestMsg.id}` : null,
    ].filter(Boolean).join(";") || null;
    try {
      msgs = store.codexTaskMessages(item.id);
      if (!msgs.length) return;
      latestMsg = msgs[msgs.length - 1] ?? null;
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      if (provider !== "ollama") {
        store.appendEvent({
          actor_ref: "completion_hook",
          actor_kind: "system",
          kind: "completion_hook_skipped",
          item_ref: item.id,
          project_ref: item.project_id,
          to: "llm_unavailable",
          used_refs: hookUsedRefs(),
          data_label: "meta",
          note: hookNote("llm_unavailable"),
        });
        return;
      }
      const digest = await summarizeCompletion(item, msgs, { provider });
      if (!digest.summary && !(digest.next_actions || []).length) {
        store.appendEvent({
          actor_ref: "completion_hook",
          actor_kind: "system",
          kind: "completion_hook_skipped",
          item_ref: item.id,
          project_ref: item.project_id,
          to: digest.reason || "empty_digest",
          used_refs: hookUsedRefs(),
          data_label: "meta",
          note: hookNote(digest.reason || "empty_digest"),
        });
        return;
      }
      if (clog?.id) store.updateCompletionLog(clog.id, { summary: digest.summary, knowledge: digest.knowledge });
      const proposal = store.createProposal({
        source: "completion_hook", kind: "completion_digest", target_ref: item.id,
        summary: digest.summary || `${item.title ?? item.id} 완료`,
        payload: {
          item_id: item.id,
          item_title: item.title ?? "",
          project_id: item.project_id ?? null,
          assignee_ref: item.assignee_ref ?? null,
          work_type: item.work_type ?? null,
          completion_criteria: item.completion_criteria ?? null,
          result: item.result ?? null,
          log_ref: item.log_ref ?? null,
          codex_thread_id: binding?.thread_id ?? null,
          codex_last_message: latestMsg ? { id: latestMsg.id ?? null, role: latestMsg.role ?? null, at: latestMsg.at ?? null } : null,
          summary: digest.summary,
          next_actions: digest.next_actions,
          knowledge: digest.knowledge,
        },
        used_refs: ["items", "codex_thread_message"], data_label: "real",
      });
      store.appendEvent({
        actor_ref: "completion_hook",
        actor_kind: "system",
        kind: "completion_digest",
        item_ref: item.id,
        project_ref: item.project_id,
        used_refs: ["ai_proposal", "completion_log", "codex_thread_message"],
        data_label: "real",
        note: hookNote("digest_created", proposal),
      });
    } catch (e) {
      store.appendEvent({
        actor_ref: "completion_hook",
        actor_kind: "system",
        kind: "completion_hook_failed",
        item_ref: item.id,
        project_ref: item.project_id,
        to: String(e?.message || e || "hook_error").slice(0, 200),
        used_refs: hookUsedRefs(),
        data_label: "meta",
        note: hookNote("hook_error"),
      });
    }
  })();
  return clog;
}

function codexTaskErrorPayload(item, error) {
  return codexTaskState(item, {
    ok: false,
    error: "codex_task_bridge_failed",
    detail: String(error?.message || error || "codex_error").slice(0, 2000),
  });
}

async function createCodexTaskThread({ item, actor, model, effort, serviceTier }) {
  if (item?.assignee_ref) item.assignee_memory = store.memoryForInjection(item.assignee_ref, 1800, [item.title, item.project_id, item.work_type].filter(Boolean).join(" "), item.project_id); // 담당자 메모리 주입(시작 시·이 일 맥락 관련도 우선·압축 바운드·과제 격리: 현재 과제+일반만)
  const title = store.codexThreadTitle(item);
  const result = await runCodexTaskTurn({
    mode: CODEX_TASK_BRIDGE_MODE,
    threadTitle: title,
    cwd: CODEX_TASK_BRIDGE_CWD,
    item,
    userMessage: "",
    initial: true,
    timeoutMs: CODEX_TASK_TIMEOUT_MS,
    model,
    effort,
    serviceTier,
    sandboxMode: store.codexFullAccess(item.id) ? "danger-full-access" : null, // 대화별 전체권한 토글
  });
  const up = store.upsertCodexTaskBinding({
    item_id: item.id,
    thread_id: result.threadId,
    thread_title: title,
    mode: result.mode,
  });
  if (up.error) return up;
  store.appendCodexTaskMessage({
    item_id: item.id,
    thread_id: result.threadId,
    role: "system",
    text: `ERP task thread opened: ${title}`,
    actor_ref: actor,
    mode: result.mode,
  });
  if (result.text) store.appendCodexTaskMessage({
    item_id: item.id,
    thread_id: result.threadId,
    role: "assistant",
    text: result.text,
    actor_ref: "codex",
    mode: result.mode,
  });
  store.appendEvent({
    actor_ref: actor, actor_kind: "human", kind: "codex_task_thread_open",
    item_ref: item.id, project_ref: item.project_id, to: result.threadId,
    used_refs: ["items", "codex_task_thread"], data_label: "meta"
  });
  return { ok: true, binding: up.binding, result };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const qp = Object.fromEntries(url.searchParams.entries());
  // 작업 행위자 = 로그인 세션 사용자(없으면 익명 'anon'). event_log·created_by 출처를 실제 사용자로 기록(BE-2).
  const actor = currentAccount(req)?.username ?? "anon";
  try {
    // F1/BE-1: 팀 모드(계정 1개 이상)에서는 도메인 쓰기에 로그인 필수 — 익명 우회 차단.
    // 계정 0개(단독 localhost 파일럿)는 현행 전체허용(하위호환). 로그인/부트스트랩(/api/auth/*)은 예외.
    if ((req.method === "POST" || req.method === "PUT") && path.startsWith("/api/")
        && !path.startsWith("/api/auth/") && store.accountCount() > 0 && !currentAccount(req)) {
      return send(res, 401, { error: "login_required" });
    }
    // 읽기도 미인증 차단(팀 모드) — '무조건 로그인해야 보임'. 랜딩에 필요한 비민감 메타데이터만 예외:
    // /api/me(정체성), /api/auth/*(로그인·가입), /api/health, /api/version, /api/lexicon·/api/modules(UI 라벨/구조).
    if (req.method === "GET" && path.startsWith("/api/")
        && !["/api/me", "/api/health", "/api/version", "/api/lexicon", "/api/modules"].includes(path)
        && !path.startsWith("/api/auth/")
        && store.accountCount() > 0 && !currentAccount(req)) {
      return send(res, 401, { error: "login_required" });
    }
    if (path === "/api/health") {
      // liveness 는 항상 공개. counts(데이터 규모)는 미인증(팀 모드)엔 숨김 — '무조건 로그인해야 보임' 강화.
      const seeCounts = store.accountCount() === 0 || !!currentAccount(req);
      return send(res, 200, seeCounts ? { ok: true, schema: "dev_erp.v1", counts: store.counts() } : { ok: true, schema: "dev_erp.v1" });
    }
    if (path === "/api/version") return send(res, 200, runtimeVersion());

    // ---------- P2b 팀: 계정·인증·관리자 ----------
    // 정체성 조회는 /api/me(클라이언트 계약). 여기서는 로그인/로그아웃/bootstrap/계정관리.
    // 첫 계정은 bootstrap 으로 관리자 생성(계정이 1개라도 있으면 차단).
    if (path === "/api/auth/login" && req.method === "POST") {
      const { username, password } = await readJson(req);
      const failKey = `${req.socket?.remoteAddress ?? "?"}|${String(username ?? "")}`;
      const waitSec = loginBlockedSec(failKey);
      if (waitSec) return send(res, 429, { error: "too_many_attempts", retry_after_sec: waitSec });
      const a = store.verifyLogin(username, password);
      if (!a) {
        noteLoginFail(failKey);
        store.appendEvent({ actor_ref: String(username ?? "unknown").slice(0, 80), actor_kind: "human", kind: "auth_login_failed", used_refs: ["auth"], data_label: "meta" });
        return send(res, 401, { error: "invalid_login" });
      }
      LOGIN_FAILS.delete(failKey);
      const token = store.createSession(a.id);
      store.appendEvent({ actor_ref: a.username, actor_kind: "human", kind: "auth_login", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      const tok = readCookie(req, SID);
      if (tok) store.deleteSession(tok);
      return send(res, 200, { ok: true }, "application/json", { "set-cookie": sessionCookie("", 0) });
    }
    if (path === "/api/auth/password" && req.method === "POST") {
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "login_required" });
      const { current_password, new_password } = await readJson(req);
      const r = store.changeAccountPassword(me.id, { current_password, new_password });
      if (r.error) return send(res, 400, r);
      store.deleteAccountSessions(me.id);
      const token = store.createSession(me.id);
      store.appendEvent({ actor_ref: me.username, actor_kind: "human", kind: "auth_password_change", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
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
    // 길드원 자가 가입(회원가입). 첫 계정은 길드마스터(bootstrap)여야 하므로 accountCount>0 필요.
    // 팀 운영 기본은 닫힘. localhost 파일럿에서만 --allow-self-register 로 명시 개방.
    if (path === "/api/auth/register" && req.method === "POST") {
      if (store.accountCount() === 0) return send(res, 409, { error: "needs_bootstrap" });
      if (!ALLOW_SELF_REGISTER) return send(res, 403, { error: "self_register_disabled" });
      const { username, password, email, display_name } = await readJson(req);
      if (!username || !password) return send(res, 400, { error: "missing_fields" });
      const r = store.createAccount({ username, password, email, display_name, roles: ["member"] });
      if (r.error) return send(res, 400, r);
      const token = store.createSession(r.id);
      store.appendEvent({ actor_ref: username, actor_kind: "human", kind: "account_register", used_refs: ["auth"], data_label: "meta" });
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
      if (id === admin.id && role === "member") return send(res, 400, { error: "cannot_change_own_role" });
      const r = store.updateAccount(id, { email, display_name, role });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/accounts/password" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, password } = await readJson(req);
      const r = store.setAccountPassword(id, password);
      if (r.error) return send(res, 400, r);
      store.deleteAccountSessions(id);
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "account_password_reset", item_ref: id, used_refs: ["auth"], data_label: "meta" });
      if (id === admin.id) {
        const token = store.createSession(id);
        return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
      }
      return send(res, 200, r);
    }
    if (path === "/api/accounts/mailbox" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const body = await readJson(req);
      const r = store.updateAccountMailbox(body.id, body);
      if (r.error) return send(res, 400, r);
      store.appendEvent({
        actor_ref: admin.username, actor_kind: "human", kind: "account_mailbox_update",
        to: `${r.mailbox.mailbox_provider}:${r.mailbox.mailbox_enabled ? "enabled" : "disabled"}`,
        used_refs: ["auth", "mailbox_metadata"], data_label: "meta"
      });
      return send(res, 200, r);
    }
    // 메일함 해제: provider=none·비활성 + 비번 env 파일 삭제(비활성 후 잔존하던 보안 공백 제거). 메일/할일은 보존.
    if (path === "/api/accounts/mailbox/disconnect" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const body = await readJson(req);
      const before = store.listAccounts().find((a) => a.id === body.id);
      if (!before) return send(res, 400, { error: "account_not_found" });
      const oldRef = before.mailbox_env_ref || mailboxEnvRelPath(body.id);
      const r = store.updateAccountMailbox(body.id, { provider: "none", enabled: false });
      if (r.error) return send(res, 400, r);
      let envDeleted = false;
      try { const repoRoot = resolve(HERE, "..", "..", ".."); envDeleted = !!deleteMailboxEnv(repoRoot, oldRef).deleted; } catch { /* env 정리 실패가 해제를 막지 않음 */ }
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "account_mailbox_disconnect", to: `none:env_deleted=${envDeleted}`, used_refs: ["auth", "mailbox_metadata", "mailbox_env"], data_label: "meta" });
      return send(res, 200, { ok: true, env_deleted: envDeleted, mailbox: r.mailbox });
    }
    // 메일 자격증명 등록: ERP에서 이메일+비번 입력 → env 파일에 기록(DB 아님) + 메일함 활성.
    // 비밀번호는 env 파일에만 들어가고 DB/이벤트/응답엔 남기지 않는다. 수신(fetch)은 별도 수집기 프로세스가 함(서버 외부접속 0).
    if (path === "/api/accounts/mailbox/credentials" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const body = await readJson(req);
      const acct = store.listAccounts().find((a) => a.id === body.id);
      if (!acct) return send(res, 400, { error: "account_not_found" });
      const provider = String(body.provider || "hiworks").trim().toLowerCase();
      if (provider !== "hiworks") return send(res, 400, { error: "mailbox_provider_unsupported_for_credentials" }); // POP 비번 흐름은 Hiworks
      const host = String(body.host || "").trim();
      const username = String(body.username || acct.email || "").trim();
      const password = String(body.password ?? "");
      if (!host || !username || !password) return send(res, 400, { error: "mailbox_credentials_incomplete" });
      const rel = mailboxEnvRelPath(acct.id); // 파일명은 계정 id 기반(ASCII·고유) — 한글 등 username 충돌 방지
      const repoRoot = resolve(HERE, "..", "..", "..");
      const w = writeMailboxEnv(repoRoot, rel, hiworksEnvUpdates({ host, username, password, port: body.port }));
      if (w.error) return send(res, 400, { error: w.error });
      const r = store.updateAccountMailbox(body.id, { provider: "hiworks", env_ref: rel, enabled: true });
      if (r.error) return send(res, 400, r);
      store.appendEvent({
        actor_ref: admin.username, actor_kind: "human", kind: "account_mailbox_credentials_set",
        to: `hiworks:${rel}`, used_refs: ["auth", "mailbox_env"], data_label: "meta"
      }); // 비밀번호는 로그/이벤트/DB에 남기지 않음 — env 파일에만
      return send(res, 200, { ok: true, env_ref: rel, mailbox: r.mailbox });
    }
    // 메일 연결 테스트(admin): 별도 수집기 프로세스를 dry-run 으로 띄워 접속·인증만 확인(메일 미저장).
    // 웹서버는 직접 외부접속 안 함 — 자식 프로세스(수집기)가 접속하고 결과만 받아 표시.
    if (path === "/api/accounts/mailbox/test" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id } = await readJson(req);
      const acct = store.listAccounts().find((a) => a.id === id);
      if (!acct || !acct.mailbox_env_ref) return send(res, 400, { error: "no_mailbox_env" });
      const repoRoot = resolve(HERE, "..", "..", "..");
      try {
        const { stdout } = await execFileP(
          process.platform === "win32" ? "python" : "python3",
          ["guild_hall/gateway/mail_fetch/cli.py", "--env-file", acct.mailbox_env_ref, "--dry-run", "--limit", "3", "--once", "--json"],
          { cwd: repoRoot, timeout: 25000, maxBuffer: 4 * 1024 * 1024 },
        );
        return send(res, 200, parseMailTestResult(stdout));
      } catch (e) {
        return send(res, 200, { ok: false, error: "test_run_error", message: String(e?.message || e).slice(0, 200) });
      }
    }
    // 메일 수집(수동 버튼 + 자동 인터벌 공용). 웹서버는 직접 egress 안 함 — 자식 수집기가 fetch 후 원장→core_mail ingest.
    if (path === "/api/mail/collect" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      if (isCollecting()) return send(res, 200, { ok: false, error: "already_collecting" });
      const repoRoot = resolve(HERE, "..", "..", "..");
      const r = await collectAllMailboxes(store, { repoRoot, appDir: HERE, dbRel: DB_IS_DEFAULT ? "data/dev-erp.db" : DB_PATH, log: console.log });
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "mail_collect_manual", used_refs: ["mail", "mailbox_env"], data_label: "meta" });
      return send(res, 200, r);
    }
    if (path === "/api/accounts/readiness" && req.method === "GET") {
      if (!requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      return send(res, 200, store.teamReadiness({
        target_members: intParam(qp.target_members ?? qp.target, 5, { min: 1, max: 50 }),
        today: /^\d{4}-\d{2}-\d{2}$/.test(String(qp.today ?? "")) ? String(qp.today) : todayKey(),
      }));
    }
    if (path === "/api/accounts/status" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, status } = await readJson(req);
      if (id === admin.id && status === "disabled") return send(res, 400, { error: "cannot_disable_self" });
      const r = store.setAccountStatus(id, status);
      return send(res, r.error ? 400 : 200, r);
    }
    // 계정 영구 삭제(admin): 계정/세션/역할/대시보드 제거 + 비번 env 파일 삭제. 메일·할일은 보존(전 담당 라벨로 남김).
    if (path === "/api/accounts/delete" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id } = await readJson(req);
      if (id === admin.id) return send(res, 400, { error: "cannot_delete_self" });
      const r = store.deleteAccount(id);
      if (r.error) return send(res, 400, r);
      const repoRoot = resolve(HERE, "..", "..", "..");
      let envDeleted = false;
      try { envDeleted = !!deleteMailboxEnv(repoRoot, r.mailbox_env_ref || mailboxEnvRelPath(id)).deleted; } catch { /* env 정리 실패가 계정 삭제를 막지 않음 */ }
      store.appendEvent({
        actor_ref: admin.username, actor_kind: "human", kind: "account_deleted",
        to: r.username, used_refs: ["auth"], data_label: "meta"
      });
      return send(res, 200, { ok: true, env_deleted: envDeleted, mail_kept: true });
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
      const scope = requestScope(req, qp);
      return send(res, 200, { today, week_end: weekEnd, freshness: lastIngestAt(), projects: store.summary(today, weekEnd, scope.all ? {} : scope) });
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
    if (path === "/api/projects" && req.method === "POST") {
      // F7: 앱에서 임시 과제 생성(정션 미연결). 팀 모드(계정 있음)에서는 관리자만.
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const result = store.createProject(await readJson(req));
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "project_create", project_ref: result.project.id, to: result.project.title, used_refs: ["projects"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/projects/update" && req.method === "POST") {
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const { id, title, health } = await readJson(req);
      const result = store.updateProject(id, { title, health });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "project_update", project_ref: result.project.id, to: result.project.title, used_refs: ["projects"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/projects/archive" && req.method === "POST") {
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const { id, archived } = await readJson(req);
      const result = store.archiveProject(id, archived !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: archived !== false ? "project_archive" : "project_unarchive", project_ref: result.id, to: result.class, used_refs: ["projects"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/throughput") return send(res, 200, store.throughput({ days: Number(qp.days) || 14, project: qp.project }));
    if (path === "/api/completions") {
      // 완료 로그/집계(할일 로그·#4 분석). 관리자=전체, 그 외=본인 것만(감시경계).
      const scope = requestScope(req, qp);
      const days = Number(qp.days) || 30;
      // 관리자=전체(assignee_any=null). 그외=본인 식별자 배열 IN 매칭(다른 스코프 경로와 동일한 scopedInClause, 빈 배열이면 1=0 fail-closed). 단일 [0] 매칭은 본인 누락+타인 누수 위험이라 폐기.
      const assignee_any = scope.all ? null : (scope.assignee_any || []);
      return send(res, 200, { stats: store.completionStats({ days, assignee_any }), log: store.completionLog({ days, assignee_any }) });
    }
    if (path === "/api/me/memory") {
      // 내 메모리 — 본인 것만 조회/편집. ref=표시명(assignee_ref 규약). 시작 시 그 담당자 메모리로 주입됨.
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "auth_required" });
      const ref = store.accountDisplayName(me) || me.username;
      if (req.method === "POST") {
        let body = ""; for await (const chunk of req) body += chunk;
        const { content } = JSON.parse(body || "{}");
        const r = store.setAssigneeMemory(ref, content);
        return send(res, r.error ? 400 : 200, r);
      }
      return send(res, 200, { ref, content: store.getAssigneeMemory(ref), items: store.listMemoryItems(ref) });
    }
    if (path === "/api/me/memory/item" && req.method === "POST") {
      // 내 누적 메모리 항목 — 본인 것만 추가/삭제(감시경계). add: {op:'add',type,text} / delete(보관): {op:'delete',id}.
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "auth_required" });
      const ref = store.accountDisplayName(me) || me.username;
      let body = ""; for await (const chunk of req) body += chunk;
      const { op, id, type, text, project_id } = JSON.parse(body || "{}");
      if (op === "delete") return send(res, 200, store.deleteMemoryItem(ref, id));
      if (op === "add") { const r = store.addMemoryItem(ref, { type, text, project_id }); return send(res, r.error ? 400 : 200, r); }
      return send(res, 400, { error: "bad_op" });
    }
    if (path === "/api/memory/append" && req.method === "POST") {
      // 완료 지식 → 담당자 메모리 추가. 관리자는 누구에게나, 팀원은 본인 메모리에만(남의 메모리 편집 금지).
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "auth_required" });
      let body = ""; for await (const chunk of req) body += chunk;
      const { ref, text, project_id } = JSON.parse(body || "{}");
      const mine = store.accountDisplayName(me) || me.username;
      if (!store.isAdmin(me.id) && ref !== mine) return send(res, 403, { error: "memory_forbidden" });
      const r = store.appendAssigneeMemory(ref, text, project_id);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/items/status" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, status, bottleneck_reason } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setItemStatus(id, status);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_status",
        item_ref: id, from: result.from, to: status, project_ref: result.project_id,
        bottleneck_reason: bottleneck_reason ?? null, used_refs: ["items"], data_label: "real"
      });
      const itemAfterStatus = store.itemById(id);
      if (status === "done" && result.from !== "done") {
        afterWorkCompleted({ actor, item: itemAfterStatus, from: result.from, to: status });
      } else if (status === "doing" && result.from !== "doing") {
        afterWorkStarted({ actor, item: itemAfterStatus, from: result.from, to: status });
      }
      return send(res, 200, result);
    }
    if (path === "/api/items/priority" && req.method === "POST") {
      // 우선순위(⭐) 지정/해제 — urgency 재사용(high=우선). 본인 접근 가능한 항목만.
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, urgency } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setItemUrgency(id, urgency);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "item_priority", item_ref: id, from: result.from, to: urgency, project_ref: result.project_id, used_refs: ["items"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/items/split-suggest" && req.method === "POST") {
      // S4: 로컬 LLM이 분해 '제안'만 — 자식 생성은 owner가 확인 후(/api/items). 본문 미전달, 외부 egress 없음.
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const item = store.itemById(id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const { types, typeToParty } = PARTY_MATCH; // 시작 시 캐시(검증 허용목록과 동일 소스 — 일관)
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      const sug = await suggestSplit(item, types, { provider });
      const sub_tasks = (sug.sub_tasks || []).map((s) => ({ ...s, party_ref: typeToParty[s.monster_type] ?? null }));
      store.appendEvent({
        actor_ref: actor, actor_kind: "ai", kind: "split_suggest",
        item_ref: id, project_ref: item.project_id, to: String(sub_tasks.length),
        used_refs: ["items", "llm"], data_label: "meta",
        note: `provider=${provider} should_split=${sug.should_split} n=${sub_tasks.length}`
      });
      return send(res, 200, { ...sug, sub_tasks });
    }
    if (path === "/api/items/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, assignee_ref } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
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
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
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
      const { id, reason } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.archiveItem(id);
      if (result.error) return send(res, 400, result);
      const rsn = String(reason ?? "").trim();
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_archive",
        item_ref: id, from: result.from, to: result.title, project_ref: result.project_id,
        note: rsn || null, used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/restore" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.restoreItem(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_restore",
        item_ref: id, to: result.title, project_ref: result.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/confirm" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      if (!canAccessItem(req, input.id)) return send(res, 403, { error: "item_forbidden" });
      if (!String(input.assignee_ref ?? "").trim()) {
        const item = store.db.prepare("SELECT assignee_ref,suggested_assignee_ref FROM core_item WHERE id=?").get(input.id);
        const me = currentAccount(req);
        input.assignee_ref = item?.assignee_ref || item?.suggested_assignee_ref || me?.display_name || me?.username || me?.email || null;
      }
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
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.promoteMail(mail_id, actor);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_promote",
        item_ref: result.item.id, from: mail_id, to: result.item.title,
        project_ref: result.item.project_id, used_refs: ["items", "mail"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/counts") {
      const assignee_any = viewIdentities(req, qp);
      return send(res, 200, store.itemCounts({ project: qp.project, assignee_any }));
    }
    if (path === "/api/items") {
      // 보기 대상(view=계정id|team)·mine=1 → 담당자 식별자 필터. 일반 팀원의 기본은 본인 범위.
      // 단, status=unclassified 는 팀 공용 분류 큐라 개인 담당자 필터를 걸지 않는다.
      // #8 미배정 전용뷰: unassigned=1 이면 담당자 스코프(view/mine) 미적용 — '주인 없는 일'은 팀 전체에서 본다.
      const unassigned = qp.unassigned === "1";
      const assignee_any = (qp.status === "unclassified" || unassigned) ? undefined : viewIdentities(req, qp);
      const opts = {
        project: qp.project, status: qp.status, q: qp.q,
        due_before: qp.due === "soon" ? todayKey() : undefined,
        due_before_exclusive: qp.due === "overdue" ? todayKey() : undefined,
        assignee_any, unassigned,
        limit: intParam(qp.limit, wantsPage(qp) ? 100 : 500, { min: 1, max: wantsPage(qp) ? 500 : 1000 }),
        offset: intParam(qp.offset, 0, { min: 0, max: 1_000_000 })
      };
      return send(res, 200, wantsPage(qp) ? store.itemsPage(opts) : store.items(opts));
    }
    if (path === "/api/codex-task/capabilities" && req.method === "GET") {
      return send(res, 200, codexTaskCapabilities());
    }
    // 대화별 전체권한(danger-full-access) 토글 — admin 전용. 켜면 그 대화의 Codex가 로컬 실행 가능(Outlook 등). ⚠ 메일내용 인젝션 위험.
    if (path === "/api/codex-task/full-access" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { item_id, on } = await readJson(req);
      if (!canAccessItem(req, item_id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setCodexFullAccess(item_id, !!on);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "codex_full_access_set", item_ref: item_id, to: on ? "on" : "off", used_refs: ["codex_thread_binding"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/codex-task/attachment" && req.method === "POST") {
      const item_id = qp.item_id || qp.id;
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const filename = safeAttachmentFilename(qp.filename || "image");
      const ext = extname(filename).toLowerCase();
      if (!CODEX_TASK_IMAGE_EXTS.has(ext)) return send(res, 400, { error: "unsupported_image_type" });
      try {
        const bytes = await readRawBody(req, CODEX_TASK_IMAGE_MAX);
        if (!bytes.length) return send(res, 400, { error: "empty_body" });
        const dir = codexTaskAttachmentDir(item.id);
        if (!dir) return send(res, 400, { error: "unsafe_attachment_dir" });
        const target = resolve(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}-${filename}`);
        if (!isInside(dir, target)) return send(res, 400, { error: "unsafe_attachment_path" });
        writeFileSync(target, bytes);
        store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "codex_task_image_attach",
          item_ref: item.id, project_ref: item.project_id, to: target,
          used_refs: ["items", "codex_task_thread", "localImage"], data_label: "meta"
        });
        return send(res, 200, {
          ok: true,
          attachment: { type: "localImage", path: target, name: filename, size: bytes.length, mime: req.headers["content-type"] || null },
        });
      } catch (error) {
        return send(res, error?.code === "too_large" ? 413 : 500, { error: error?.code || "attachment_failed" });
      }
    }
    if (path === "/api/codex-task/thread" && req.method === "GET") {
      const item_id = qp.item_id || qp.id;
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      return send(res, 200, codexTaskState(item));
    }
    if (path === "/api/codex-task/open" && req.method === "POST") {
      const { item_id, model, effort, service_tier } = await readJson(req);
      const serviceTier = normalizeCodexTaskServiceTier(service_tier);
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const existing = store.codexTaskBinding(item.id);
      if (existing) return send(res, 200, codexTaskState(item));
      try {
        const created = await createCodexTaskThread({ item, actor, model, effort, serviceTier });
        if (created.error) return send(res, 400, created);
        return send(res, 200, codexTaskState(item, { created: true }));
      } catch (error) {
        store.markCodexTaskError(item.id, error);
        store.appendCodexTaskMessage({
          item_id: item.id,
          role: "error",
          text: String(error?.message || error || "codex_error"),
          actor_ref: "server",
          mode: CODEX_TASK_BRIDGE_MODE,
        });
        return send(res, 502, codexTaskErrorPayload(item, error));
      }
    }
    if (path === "/api/codex-task/message" && req.method === "POST") {
      const { item_id, message, model, effort, service_tier, attachments } = await readJson(req);
      const text = String(message ?? "").trim();
      if (!text) return send(res, 400, { error: "message_required" });
      const serviceTier = normalizeCodexTaskServiceTier(service_tier);
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      if (item.assignee_ref) item.assignee_memory = store.memoryForInjection(item.assignee_ref, 1800, [item.title, item.project_id, item.work_type].filter(Boolean).join(" "), item.project_id); // 담당자 메모리 주입(매 턴·이 일 맥락 관련도 우선·압축 바운드·과제 격리: 현재 과제+일반만)
      const binding = store.codexTaskBinding(item.id);
      const skills = mentionedCodexSkills(text);
      const localImages = localImagesFromAttachments(attachments);
      store.appendCodexTaskMessage({
        item_id: item.id,
        thread_id: binding?.thread_id ?? null,
        role: "user",
        text,
        actor_ref: actor,
        mode: binding?.mode ?? CODEX_TASK_BRIDGE_MODE,
      });
      try {
        const result = await runCodexTaskTurn({
          mode: CODEX_TASK_BRIDGE_MODE,
          threadId: binding?.thread_id ?? null,
          threadTitle: store.codexThreadTitle(item),
          cwd: CODEX_TASK_BRIDGE_CWD,
          item,
          userMessage: text,
          initial: false,
          timeoutMs: CODEX_TASK_TIMEOUT_MS,
          model,
          effort,
          serviceTier,
          skills,
          localImages,
          sandboxMode: store.codexFullAccess(item.id) ? "danger-full-access" : null, // 대화별 전체권한 토글
        });
        const up = store.upsertCodexTaskBinding({
          item_id: item.id,
          thread_id: result.threadId,
          thread_title: binding?.thread_title || store.codexThreadTitle(item),
          mode: result.mode,
        });
        if (up.error) return send(res, 400, up);
        store.appendCodexTaskMessage({
          item_id: item.id,
          thread_id: result.threadId,
          role: "assistant",
          text: result.text || "Codex turn completed.",
          actor_ref: "codex",
          mode: result.mode,
        });
        store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "codex_task_message",
          item_ref: item.id, project_ref: item.project_id, to: result.threadId,
          used_refs: ["items", "codex_task_thread"], data_label: "meta"
        });
        return send(res, 200, codexTaskState(item));
      } catch (error) {
        store.markCodexTaskError(item.id, error);
        store.appendCodexTaskMessage({
          item_id: item.id,
          thread_id: binding?.thread_id ?? null,
          role: "error",
          text: String(error?.message || error || "codex_error"),
          actor_ref: "server",
          mode: binding?.mode ?? CODEX_TASK_BRIDGE_MODE,
        });
        return send(res, 502, codexTaskErrorPayload(item, error));
      }
    }
    if (path === "/api/mail" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const me = currentAccount(req);
      const mailbox = me ? (store.isAdmin(me.id) && input.mailbox ? input.mailbox : me.email || null) : input.mailbox;
      const result = store.createMail({ ...input, mailbox, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_register", to: result.mail.subject, project_ref: result.mail.project_id ?? null, used_refs: ["mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/detail" && req.method === "GET") {
      if (!canAccessMail(req, qp.id)) return send(res, 403, { error: "mail_forbidden" });
      const mail = store.mailDetail(qp.id);
      if (!mail) return send(res, 404, { error: "mail_not_found" });
      return send(res, 200, mail);
    }
    if (path === "/api/mail") {
      const opts = {
      project: qp.project, days: qp.days !== undefined ? Number(qp.days) : 90,
      q: qp.q, direction: qp.direction, label_id: qp.label_id,
      mailbox: viewMailbox(req, qp),
      limit: intParam(qp.limit, wantsPage(qp) ? 100 : 500, { min: 1, max: wantsPage(qp) ? 500 : 1000 }),
      offset: intParam(qp.offset, 0, { min: 0, max: 1_000_000 })
      };
      return send(res, 200, wantsPage(qp) ? store.mailPage(opts) : store.mail(opts));
    }
    if (path === "/api/mail/promoted") {
      // 메일 화면 '✓ 할 일' 판정 전용(승격 진실원). 미분류 격리·assignee 스코프 우회.
      return send(res, 200, { ids: store.promotedMailIds(qp.project ?? null) });
    }
    if (path === "/api/guide/templates") return send(res, 200, guideTemplates(qp.mode));
    if (path === "/api/doc/recipes") return send(res, 200, docRecipes(qp.mode));
    if (path === "/api/embeds" && req.method === "GET") return send(res, 200, store.listEmbeds({ project: qp.project ?? null }));
    // ERP 챗봇 — RAG: 매뉴얼 검색 → (provider 연결 시) 로컬 작은 모델이 '그 근거 안에서만' 표현.
    // 매뉴얼 밖 추론 금지. provider 없으면 검색 기반 사람형 폴백(끊기지 않음). 질문은 로그에 저장.
    // provider는 ERP_CHAT_PROVIDER 환경변수로 주입(기본 stub=외부0). 야간 매뉴얼 갱신은 별도 고급 LLM.
    if (path === "/api/chat" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      let parsed = {};
      try { parsed = JSON.parse(body || "{}"); }
      catch { return send(res, 400, { error: "invalid_json" }); }
      const { message, thread_id } = parsed;
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      let r;
      try {
        r = await answerFromManual({ store, question: message, thread_id, actor_ref: actor, provider });
      } catch (error) {
        console.error("[dev-erp] chat failed:", error?.stack ?? error);
        try { store.logChatQuery({ actor_ref: actor, thread_id, question: message, matched_faq_id: null }); } catch { /* best effort */ }
        r = {
          text: "챗봇 응답이 잠깐 실패했어요. 같은 질문을 한 번만 다시 보내고, 반복되면 새 대화로 다시 시작해 주세요.",
          matched: false,
          source: null,
          candidates: [],
          mode: "chat_error_fallback",
          external: false,
          provider,
          model: null,
          llm: false,
          handled_by_llm: false,
          handled_by_runtime: false,
          context_used: false,
        };
      }
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "chat_query", to: r.matched ? "matched" : "unanswered", used_refs: ["chat", "faq"], data_label: "meta", note: thread_id ? `thread=${thread_id}` : null });
      const thinking = Boolean(r.thinking ?? r.reasoning ?? false);
      return send(res, 200, {
        text: r.text,
        matched: r.matched,
        source: r.source,
        candidates: r.candidates || [],
        mode: r.mode,
        external: r.external,
        provider: r.provider,
        model: r.model,
        thinking,
        reasoning: thinking,
        llm: r.llm,
        handled_by_llm: r.handled_by_llm || false,
        handled_by_runtime: r.handled_by_runtime || false,
        context_used: r.context_used || false,
        pipeline: r.pipeline_public || null,
        chatbot_version: CHATBOT_VERSION,
        runtime: runtimeVersion().runtime
      });
    }
    if (path === "/api/faq" && req.method === "GET") return send(res, 200, store.faqs({ topic: qp.topic }));
    if (path === "/api/faq" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertFaq({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    // P-10 지식 카탈로그 (검색·등재·통합검색 — 추론 0·외부전송 0)
    if (path === "/api/knowledge" && req.method === "GET") return send(res, 200, store.knowledge({ topic: qp.topic, q: qp.q }));
    if (path === "/api/knowledge" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
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
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertCalculator({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/embeds" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertEmbed({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (!r.error) store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "embed_register", to: r.id, used_refs: ["embed_view"], data_label: "meta" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/calculators/example" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
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
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      return send(res, 200, store.verifyCalculator(JSON.parse(body || "{}").id));
    }
    if (path === "/api/calculators/activate" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
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
      const { stage_id, force, reason } = JSON.parse(body || "{}");
      // F8: 하드 게이트 강제통과는 SE 통제 우회 — 팀 모드(계정 있음)에서는 관리자만. 사유는 event_log에 기록.
      if (force && store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const result = store.clearStage(stage_id, { force: !!force });
      if (result.error) return send(res, result.error === "stage_not_found" ? 404 : 409, result);
      const rsn = String(reason ?? "").trim();
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "gate_clear", to: stage_id, project_ref: result.project_id, used_refs: ["gates"], data_label: "real", note: result.forced ? `forced(${result.mode})${rsn ? `: ${rsn}` : ""}` : result.mode });
      return send(res, 200, result);
    }
    if (path === "/api/settings/gate_mode" && req.method === "GET") return send(res, 200, { mode: store.gateMode() });
    if (path === "/api/settings/gate_mode" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      // F8: hard↔soft 게이트 모드 전환도 팀 모드에서는 관리자만(강제 게이트 취지 보호).
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const { mode } = JSON.parse(body || "{}");
      const r = store.setGateMode(mode);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "gate_mode_set", to: r.mode, used_refs: ["gates", "settings"], data_label: "real" });
      return send(res, 200, r);
    }
    // P-2 SE 스케줄러 + P-1 완결성 요구
    if (path === "/api/schedule/templates") return send(res, 200, store.scheduleTemplates());
    if (path === "/api/schedule/apply" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, template_key, anchorDates } = JSON.parse(body || "{}");
      const r = store.applyTemplate(project_id, template_key, { anchorDates: anchorDates || {} });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/schedule/anchor" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, anchor_stage_code, date } = JSON.parse(body || "{}");
      const r = store.setAnchor(project_id, anchor_stage_code, date);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/schedule/deliverable" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.upsertDeliverable(b.template_key, b.anchor_stage_code, b.deliverable_name, { offset_days: b.offset_days, default_artifact_type: b.default_artifact_type });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_edit", to: `${b.template_key}/${b.deliverable_name}=${b.offset_days}`, used_refs: ["se_stage_template"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/requirements" && req.method === "GET") return send(res, 200, store.artifactRequirements({ scope_kind: qp.scope_kind, scope_key: qp.scope_key }));
    if (path === "/api/requirements" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.setArtifactRequirement(JSON.parse(body || "{}"));
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/parts/completeness") { const r = store.boardCompleteness(qp.part); return send(res, r.error ? 404 : 200, r); }
    if (path === "/api/risk") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.riskAlerts({ project: qp.project ?? null, ...(scope.all ? {} : { assignee_any: scope.assignee_any }) }));
    }
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
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createProposal({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/approve" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.approveProposal(JSON.parse(body || "{}").id, { decided_by: actor });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/reject" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.rejectProposal(b.id, { decided_by: actor, reason: b.reason ?? null });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/recommenders/run" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      // 수동 트리거(자동 cron 아님). 추천은 createProposal pending 만 — 자동 도메인 쓰기 0.
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.runRecommenders({ scope: b.scope ?? "all", project: b.project ?? null }));
    }
    // P3 재고/BOM/부품 (내부 판정만·외부전송 0)
    if (path === "/api/parts" && req.method === "GET") return send(res, 200, store.parts({ type: qp.type, grp: qp.grp, project: qp.project, q: qp.q }));
    if (path === "/api/parts" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertPart({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "part_upsert", to: r.id, used_refs: ["parts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/parts/link" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { part_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkPartProject(part_id, project_id);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/bom" && req.method === "GET") return send(res, 200, store.bom(qp.parent ?? ""));
    if (path === "/api/bom" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { parent_part_id, child_part_id, qty, ref_des } = JSON.parse(body || "{}");
      const r = store.addBomEdge(parent_part_id, child_part_id, qty, ref_des);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/locations" && req.method === "GET") return send(res, 200, store.locations());
    if (path === "/api/locations" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertLocation({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/stock" && req.method === "GET") return send(res, 200, store.stock({ part: qp.part, location: qp.location }));
    if (path === "/api/stock" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
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
    if (path === "/api/contacts/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.deleteContact(JSON.parse(body || "{}").id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_delete", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts/update" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, name, org, role, email, phone } = JSON.parse(body || "{}");
      const r = store.updateContact(id, { name, org, role, email, phone });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_update", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createContact({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_create", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts/link" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
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
      if (!allowSharedWrite(req, res)) return;
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
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertParty({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    if (path === "/api/purchases" && req.method === "GET") return send(res, 200, store.purchases({ project: qp.project, party: qp.party, stage: qp.stage }));
    if (path === "/api/purchases/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.deletePurchase(JSON.parse(body || "{}").id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_delete", to: r.id, used_refs: ["purchases"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createPurchase({ ...JSON.parse(body || "{}"), created_by: actor, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_create", to: r.id, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/stage" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, stage } = JSON.parse(body || "{}");
      const r = store.setPurchaseStage(id, stage);
      if (r.error) return send(res, r.error === "purchase_not_found" ? 404 : 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_stage", item_ref: id, from: r.from, to: r.to, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/link" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { purchase_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkPurchaseProject(purchase_id, project_id);
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    if (path === "/api/worklog/draft") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.worklogDraft({ project: qp.project ?? null, days: qp.days ? Number(qp.days) : 7, ...(scope.all ? {} : { scope, assignee_any: scope.assignee_any, mailbox: scope.mailbox }) }));
    }
    if (path === "/api/report/draft") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.reportDraft({ project: qp.project ?? null, kind: qp.kind === "note" ? "note" : "report", ...(scope.all ? {} : { assignee_any: scope.assignee_any, mailbox: scope.mailbox }) }));
    }
    if (path === "/api/guide/summary") return send(res, 200, store.guideSummary());
    if (path === "/api/guide") return send(res, 200, store.guideState(qp.project ?? ""));
    if (path === "/api/guide/artifact" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, stage_code, name } = JSON.parse(body || "{}");
      const result = store.addGuideArtifact(project_id, stage_code, name);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "guide_artifact_add", item_ref: `${project_id}:${stage_code}`, to: name, project_ref: project_id, used_refs: ["guide", ".registry/skills/se_foldertree_generate"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/guide/step" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { artifact_id, step_key, on } = JSON.parse(body || "{}");
      const result = store.setGuideStep(artifact_id, step_key, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: on !== false ? "guide_step_done" : "guide_step_undo", item_ref: `guide:${artifact_id}`, to: step_key, project_ref: result.project_id, used_refs: ["guide"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_ids, project_id, make_items, assignee_ref, open, single_item } = JSON.parse(body || "{}");
      const requestedMailIds = Array.isArray(mail_ids) ? mail_ids : [];
      if (requestedMailIds.some((mail_id) => !canAccessMail(req, mail_id))) return send(res, 403, { error: "mail_forbidden" });
      const result = store.assignMails(mail_ids, project_id, { make_items: make_items === true, created_by: actor, assignee_ref: assignee_ref || null, open: open === true, single_item: single_item === true });
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
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { name, color } = JSON.parse(body || "{}");
      const result = store.createLabel(name, color);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_create", to: result.label.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/labels/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.deleteLabel(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_delete", to: result.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/labels/update" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, name, color } = JSON.parse(body || "{}");
      const result = store.updateLabel(id, { name, color });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_update", to: result.label.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/unassign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.unassignMail(mail_id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_unassign", item_ref: mail_id, from: result.from, to: result.to, used_refs: ["core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/delete" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.deleteMail(mail_id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_delete", item_ref: mail_id, used_refs: ["core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/update" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id, subject, counterpart, at, pointer_ref } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.updateMail(mail_id, { subject, counterpart, at, pointer_ref });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_update", item_ref: mail_id, used_refs: ["core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    // 메일 제외 규칙(개인메일·차단 발신자) — admin 전용. 발신자/제목/수신함 기준, 매칭 메일은 수집 시 저장 전 드롭 + 기존도 숨김.
    if (path === "/api/mail/exclude-rules" && req.method === "GET") {
      if (!allowSharedWrite(req, res)) return;
      return send(res, 200, store.mailExcludeRules());
    }
    if (path === "/api/mail/exclude-rules" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { field, pattern, match, note } = await readJson(req);
      const result = store.addMailExcludeRule({ field, pattern, match, note, created_by: actor });
      if (result.error) return send(res, 400, result);
      const applied = store.applyMailExcludeToExisting(); // '기존도 숨김' — 이미 들어온 매칭 메일 소급 hidden
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_rule_set", note: String(field ?? ""), used_refs: ["mail_exclude_rule"], data_label: "real" }); // 프라이버시: 패턴 값은 로그에 안 남김(필드명만)
      return send(res, 200, { ...result, hidden: applied.hidden });
    }
    if (path === "/api/mail/exclude-rules/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { id } = await readJson(req);
      const result = store.deleteMailExcludeRule(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_rule_delete", used_refs: ["mail_exclude_rule"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/label" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id, label_id, on } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
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
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setPersonSkill(b.person_id, b.capability_label, { source_ref: b.source_ref ?? null, weight: b.weight ?? 1 });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "person_skill_set", item_ref: b.person_id, to: b.capability_label, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/nudges") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.nudges({ person: qp.person, limit: qp.limit ? Number(qp.limit) : 5, ...(scope.all ? {} : { assignee_any: scope.assignee_any }) }));
    }
    if (path === "/api/workload") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.workload(new Date().toISOString().slice(0, 10), scope.all ? {} : { assignee_any: scope.assignee_any }));
    }
    if (path === "/api/meetings/open") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.meetingOpenRollup(scope.all ? {} : { assignee_any: scope.assignee_any }));
    }
    if (path === "/api/calendar.ics") {
      const scope = requestScope(req, qp);
      const ics = store.calendarIcs({ person: qp.person ?? null, ...(scope.all ? {} : { assignee_any: scope.assignee_any }) });
      return send(res, 200, ics, "text/calendar", { "content-disposition": `attachment; filename="dev-erp${qp.person ? `-${qp.person}` : ""}.ics"` });
    }
    if (path === "/api/search") return send(res, 200, crossSearch(store, qp.q, { assignee_any: viewIdentities(req, qp), mailbox: viewMailbox(req, qp) }));
    if (path === "/api/lexicon") return send(res, 200, { mode: qp.mode ?? "business", modes: Object.keys(LEXICON), labels: getLexicon(qp.mode) });
    if (path === "/api/modules") return send(res, 200, modulesFor(qp.mode));
    // canon 지식 저장소를 분야 그룹별로(메타만). 인증 필요(읽기 게이트 대상).
    if (path === "/api/knowledge/registry") return send(res, 200, { groups: groupedKnowledge(KNOW_DIR, qp.mode || "business") });
    if (path === "/api/knowledge/shell/contract" && req.method === "GET") return send(res, 200, scanKnowledgeShellContract(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/spaces" && req.method === "GET") return send(res, 200, scanKnowledgeSpaces(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/wiki/pages" && req.method === "GET") return send(res, 200, scanWikiPageRefs(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/rag/routes" && req.method === "GET") return send(res, 200, scanRagRoutes(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/rag/work-cards" && req.method === "GET") return send(res, 200, scanRagWorkCards(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/ledgers" && req.method === "GET") return send(res, 200, scanKnowledgeLedgers(KNOWLEDGE_SHELL));
    if (path === "/api/events/recent") return send(res, 200, store.recentEvents(qp.limit ? Number(qp.limit) : 30, qp.project ?? null, requestScope(req, qp)));
    if (path === "/api/events/audit") return send(res, 200, {
      // noise=0(기본, UI '조회·잡음 포함' 해제) → 잡음을 서버에서 제외해 limit 이 의미 이벤트에만 적용.
      // noise param 없으면(타 호출자) 종전대로 전체 포함(백워드 호환).
      events: store.queryEvents({ project: qp.project || null, kind: qp.kind || null, actor: qp.actor || null, since: qp.since || null, limit: qp.limit ? Number(qp.limit) : 300, excludeKinds: qp.noise === "0" ? AUDIT_NOISE_KINDS : null, scope: requestScope(req, qp) }),
      facets: store.eventFacets(requestScope(req, qp)),
    });
    if (path === "/api/events" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const event = JSON.parse(body || "{}");
      if (!event.kind) return send(res, 400, { error: "kind_required" });
      // 감사 무결성: 계정이 있는 팀 모드에선 actor 를 자기신고가 아니라 세션 주체로 강제(타인 명의 위조 차단).
      // 계정 0 파일럿 모드는 종전 동작(자기신고 허용) 보존.
      const evMe = currentAccount(req);
      const forcedActor = evMe ? { actor_ref: evMe.username, actor_kind: "human" } : {};
      store.appendEvent({ ...event, actor_kind: event.actor_kind ?? "human", data_label: event.data_label ?? "real", ...forcedActor });
      return send(res, 200, { ok: true });
    }
    // ---------- P2b: 계정·권한·계정별 레이아웃 ----------
    if (path === "/api/me") {
      // 클라이언트 정체성 계약. 익명이면 account_count 로 bootstrap 필요 여부 판단.
      const a = currentAccount(req);
      if (!a) return send(res, 200, { anonymous: true, account_count: store.accountCount(), allow_self_register: ALLOW_SELF_REGISTER });
      const prof = store.accountProfile(a);
      return send(res, 200, { account: prof, person_id: a.person_id, roles: prof.roles, perms: prof.perms, account_count: store.accountCount(), allow_self_register: ALLOW_SELF_REGISTER });
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
    if (path === "/api/requests/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.deleteRequest(JSON.parse(body || "{}").id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "request_delete", to: r.id, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/requests/update" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, title, requester, category } = JSON.parse(body || "{}");
      const r = store.updateRequest(id, { title, requester, category });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "request_update", to: r.id, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, r);
    }
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
    if (path === "/api/meetings/actions" && req.method === "GET") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.meetingActions(qp.meeting ?? "", scope.all ? {} : { assignee_any: scope.assignee_any }));
    }
    if (path === "/api/meetings/action" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { meeting_id, item_id } = JSON.parse(body || "{}");
      if (!canAccessItem(req, item_id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.linkActionItem(meeting_id, item_id);
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }

    if (path.startsWith("/api/")) return send(res, 404, { error: "not_found" });

    // 스킨 이미지는 공유 워크스페이스(OneDrive) → 로컬 fallback 순서로 찾는다.
    if (path.startsWith("/skins/")) {
      const rel = path.slice("/skins/".length);
      for (const root of SKIN_ROOTS) {
        if (serveFromRoot(res, root, rel)) return;
      }
      return send(res, 404, "not found", "text/plain");
    }

    // 정적 파일 (no-build 클라이언트)
    const file = path === "/" ? "index.html" : path.replace(/^\/+/, "");
    if (serveFromRoot(res, STATIC_ROOT, file)) return;
    return send(res, 404, "not found", "text/plain");
  } catch (error) {
    // BE-3: 내부 예외 메시지(SQLite 바인드·JSON 파서 등)를 클라이언트에 노출하지 않음 — 서버 로그에만 남기고 일반화 응답.
    console.error("[dev-erp] unhandled:", req.method, path, error?.stack ?? error);
    return send(res, 500, { error: "internal" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-erp] http://${HOST}:${PORT} (db: ${DB_PATH})`);
  if (HOST !== "127.0.0.1") {
    console.log("[dev-erp] 주의: 같은 네트워크에 열려 있음 - 계정/RBAC와 trusted LAN 전제");
  }
  // 챗봇 매뉴얼: tracked manual/manual_faq.json 을 startup 에 upsert(data_label="manual"). 멱등.
  // 챗봇(answerFromManual)이 core_faq 를 검색하므로, 이 파일이 '로컬 LLM 챗봇이 보고 답하는 매뉴얼'.
  try {
    const manualPath = join(HERE, "manual", "manual_faq.json");
    if (existsSync(manualPath)) {
      const entries = JSON.parse(readFileSync(manualPath, "utf-8"));
      let n = 0;
      for (const f of (Array.isArray(entries) ? entries : entries.faqs || [])) {
        if (f && f.question && f.answer) { store.upsertFaq({ ...f, data_label: "manual" }); n++; }
      }
      if (n) console.log(`[dev-erp] 챗봇 매뉴얼 FAQ ${n}건 적재(manual_faq.json)`);
    }
  } catch (e) { console.error("[dev-erp] 매뉴얼 FAQ 적재 오류:", e.message); }
  // 자동화(기본 자동 / 수동 폴백): '각자 메일=각자 일' 시작 시 1회 backfill. 팀 모드 아니면 no-op.
  try { const r = store.applyMailboxAutoAssign(); if (r.applied) console.log(`[dev-erp] 메일 자동배정(각자 메일=각자 일): 시작 backfill ${r.applied}건`); }
  catch (e) { console.error("[dev-erp] 메일 자동배정 backfill 오류:", e.message); }
  // autosync Phase 2: 할일_장부 → ERP 자동 import 폴링(결정적·LLM 무관). 동기 버튼 불필요.
  // 기본 OFF(테스트·:memory: 무영향). 켜기: 환경변수 DEV_ERP_AUTOSYNC=1 또는 --autosync. 간격 DEV_ERP_AUTOSYNC_MS(기본 10s).
  if (process.env.DEV_ERP_AUTOSYNC === "1" || args.includes("--autosync")) {
    const root = resolve(HERE, "..", "..", "..");
    // Phase 2: 할일_장부 → ERP 자동 import 폴링.
    startAutosyncPoll(store, { root, intervalMs: Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000, log: console.log });
    // 자동화: import 폴링과 같은 간격으로 '각자 메일=각자 일' 재적용(신규 import 분 자동 확정). 수동 재배정은 폴백.
    setInterval(() => { try { store.applyMailboxAutoAssign(); } catch (e) { console.error("[dev-erp] 메일 자동배정 오류:", e.message); } }, Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000);
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
  // 메일 자동 수집: 활성 메일함을 주기적으로 fetch → 원장 → core_mail ingest(수동 버튼과 같은 경로).
  // 기본 OFF(테스트·:memory: 무영향). 켜기: DEV_ERP_MAIL_COLLECT_SEC=<초>(예: 900=15분).
  const mailCollectSec = Number(process.env.DEV_ERP_MAIL_COLLECT_SEC) || 0;
  if (mailCollectSec > 0) {
    const repoRoot = resolve(HERE, "..", "..", "..");
    const collectDbRel = DB_IS_DEFAULT ? "data/dev-erp.db" : DB_PATH;
    setInterval(() => {
      collectAllMailboxes(store, { repoRoot, appDir: HERE, dbRel: collectDbRel, log: console.log })
        .catch((e) => console.error("[mail-collect] 자동수집 오류:", e.message));
    }, mailCollectSec * 1000);
    console.log(`[dev-erp] 메일 자동수집 ON: ${mailCollectSec}s 간격`);
  }
});
