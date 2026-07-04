// 지식 서가 현황(2026-07-04 owner 승인): "무엇이 / 언제 쌓였고 / 얼마나 쓰였는지"를
// 계층(공통 체계공학·도메인·과제별)으로 집계해 ERP 화면에 처음으로 연결한다.
// 원칙: 집계·목록은 metadata-only(knowledge shell 계약 유지). 예외 1개 — 위키 .md 본문 열람은
// owner 가 2026-07-04 승인(로그인 팀 한정, readWikiPage 로만, 스캔 응답에는 여전히 본문 없음).
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

export const KNOWLEDGE_OVERVIEW_SCHEMA = "dev_erp.knowledge_overview.v1";
export const WIKI_BODY_EXCEPTION = Object.freeze({
  enabled: true,
  approved: "2026-07-04 owner",
  scope: "wiki_markdown_pages_only",
  auth: "login_required",
  note: "위키는 정제 파생본 — 원문(HWP/PDF/메일)·chunk·raw 는 계속 차단",
});

// knowledge_shell.mjs 와 같은 차단 규약(chunk/raw/body/secret 이름 + 원문 확장자).
const BLOCKED_NAME_RE = /(^\.|(^|[._-])(secret|token|credential|cookie|session|password|passwd|private[-_]?key|body|bodies|raw|chunk|chunks|attachment|attachments|mail[-_]?body|notebooklm[-_]?answer|answer[-_]?text)([._-]|$)|\.(pem|key|pfx|p12)$)/i;
const WIKI_BODY_MAX = 512 * 1024;
const SAFE_SEG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/;

const norm = (p) => String(p || "").replaceAll("\\", "/").replace(/^\/+/, "");
function lexInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function safeDirents(abs) {
  try { return readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")); }
  catch { return []; }
}
function fileInfo(abs) {
  try { const s = lstatSync(abs); return s.isSymbolicLink() ? null : s; } catch { return null; }
}

// 하위 트리 파일 수 + 최신 mtime (bounded — 서가 카드용 요약).
// 적대검토 반영: 깊이 캡으로 비어있지 않은 하위폴더를 생략하면 truncated=true(조용한 누락 방지).
function countTree(abs, { maxDepth = 6, maxEntries = 20000 } = {}) {
  let files = 0; let latest = 0; let scanned = 0; let truncated = false;
  const visit = (dir, depth) => {
    for (const e of safeDirents(dir)) {
      if (scanned >= maxEntries) { truncated = true; return; }
      scanned += 1;
      if (BLOCKED_NAME_RE.test(e.name)) continue;
      const p = join(dir, e.name);
      const info = fileInfo(p);
      if (!info) continue;
      if (info.isDirectory()) {
        if (depth + 1 < maxDepth) visit(p, depth + 1);
        else if (safeDirents(p).length) truncated = true; // 더 깊은 곳에 내용이 있으나 캡에 걸림
        continue;
      }
      if (info.isFile()) { files += 1; if (info.mtimeMs > latest) latest = Math.trunc(info.mtimeMs); }
    }
  };
  if (existsSync(abs)) visit(abs, 0);
  return { file_count: files, latest_mtime_ms: latest || null, truncated };
}

function readJsonlEvents(dir, { maxFiles = 24, maxRows = 2000 } = {}) {
  // events/<YYYY> 또는 events/ 아래 *.jsonl 을 평탄하게 읽는다(원장은 소형 — 수십 행 규모).
  const rows = [];
  const walk = (d, depth) => {
    for (const e of safeDirents(d)) {
      if (rows.length >= maxRows) return;
      const p = join(d, e.name);
      const info = fileInfo(p);
      if (!info) continue;
      if (info.isDirectory() && depth < 2) { walk(p, depth + 1); continue; }
      if (!info.isFile() || extname(e.name).toLowerCase() !== ".jsonl") continue;
      try {
        for (const line of readFileSync(p, "utf-8").split("\n")) {
          const t = line.trim();
          if (!t) continue;
          try { rows.push(JSON.parse(t)); } catch { /* 손상 행 무시 */ }
          if (rows.length >= maxRows) return;
        }
      } catch { /* 읽기 실패 무시 */ }
    }
  };
  if (existsSync(dir)) walk(dir, 0);
  return rows;
}

// 장서목록 ledger(yaml)에서 total_entries 만 라인 파싱(zero-dep, knowledge_registry 방식)
function bookshelfTotal(projMetaDir) {
  const dir = join(projMetaDir, "reports", "source_research");
  for (const e of safeDirents(dir)) {
    if (!/source_ledger\.ya?ml$/i.test(e.name)) continue;
    try {
      const m = readFileSync(join(dir, e.name), "utf-8").match(/total_entries:\s*(\d+)/);
      if (m) return Number(m[1]);
    } catch { /* skip */ }
  }
  return null;
}

function projectWikiPages(root, code) {
  // 과제 위키 정위치: _workspaces/<code>/reference_payloads/knowledge_extract/<batch>/wiki/*.md
  const base = join(root, "_workspaces", code, "reference_payloads", "knowledge_extract");
  const pages = [];
  for (const batch of safeDirents(base)) {
    const wikiDir = join(base, batch.name, "wiki");
    for (const f of safeDirents(wikiDir)) {
      if (extname(f.name).toLowerCase() !== ".md" || BLOCKED_NAME_RE.test(f.name)) continue;
      const info = fileInfo(join(wikiDir, f.name));
      if (!info?.isFile()) continue;
      pages.push({
        ref: norm(relative(root, join(wikiDir, f.name))),
        title: basename(f.name, ".md").replace(/^\d+_/, ""),
        project: code, batch: batch.name,
        size_bytes: info.size, mtime_ms: Math.trunc(info.mtimeMs),
      });
    }
  }
  return pages;
}

// 위키 스캔에서 내려가지 않을 대형 비-위키 디렉터리(적대검토: 이 워크가 요청당 22,843 lstat →
// 위키 3페이지. source_cards 1,286·rag 인덱스 1,298 을 전부 뒤진 게 원인). 이 이름은 wiki 를 담지 않는다.
const WIKI_SKIP_DIRS = new Set(["source_cards", "indexes_local", "source_text_indexes", "chunks", "derived_text", "manifests", "docling_json"]);

function knowledgeWikiPages(root) {
  // 공통/도메인 위키: _workspaces/knowledge/**/wiki/**/*.md (대형 비-위키 디렉터리는 가지치기)
  const base = join(root, "_workspaces", "knowledge");
  const pages = [];
  let scanned = 0;
  const visit = (dir, depth) => {
    for (const e of safeDirents(dir)) {
      if (pages.length >= 200 || scanned >= 6000) return;
      scanned += 1;
      const p = join(dir, e.name);
      const info = fileInfo(p);
      if (!info) continue;
      if (info.isDirectory()) {
        if (depth < 4 && !BLOCKED_NAME_RE.test(e.name) && !WIKI_SKIP_DIRS.has(e.name)) visit(p, depth + 1);
        continue;
      }
      if (!info.isFile() || extname(e.name).toLowerCase() !== ".md" || BLOCKED_NAME_RE.test(e.name)) continue;
      if (!/[\\/]wiki[\\/]/.test(p)) continue;
      pages.push({
        ref: norm(relative(root, p)),
        title: basename(e.name, ".md").replace(/^\d+_/, ""),
        project: null, batch: null,
        size_bytes: info.size, mtime_ms: Math.trunc(info.mtimeMs),
      });
    }
  };
  visit(base, 0);
  return pages;
}

const PROJECT_CODE_RE = /^(P\d{2}-\d{3}|LIG_Q|LIG_SAS)/i;
function isProjectDir(name) {
  return SAFE_SEG_RE.test(name) && name !== "system" && name !== "knowledge" && PROJECT_CODE_RE.test(name);
}
// 과제 열거는 _workmeta(수집이력·후보가 사는 dev 전용 nested repo)와 _workspaces(공유 정션 —
// 과제 위키가 사는 곳) 합집합. 적대검토 반영: 운영본은 _workmeta 에 INBOX 만 있어도 공유 정션의
// 과제 위키가 화면에 뜨도록.
function listProjectCodes(root) {
  const set = new Set();
  for (const e of safeDirents(join(root, "_workmeta"))) if (e.isDirectory() && isProjectDir(e.name)) set.add(e.name);
  for (const e of safeDirents(join(root, "_workspaces"))) {
    if (e.isDirectory() && isProjectDir(e.name) &&
      existsSync(join(root, "_workspaces", e.name, "reference_payloads", "knowledge_extract"))) set.add(e.name);
  }
  return [...set].sort();
}

// 서버측 TTL 캐시(적대검토: 동기 풀스캔이 요청당 이벤트 루프 ~2s 블로킹 + 탭 전환마다 재스캔).
// 지식 서가는 분 단위로 바뀌므로 60초 memo 로 반복 스캔을 제거. 루트별 캐시.
const OVERVIEW_TTL_MS = 60_000;
const _overviewCache = new Map();
export function buildKnowledgeOverview(root, { fresh = false, now = Date.now() } = {}) {
  const R = resolve(root);
  const cached = _overviewCache.get(R);
  if (!fresh && cached && (now - cached.at) < OVERVIEW_TTL_MS) return cached.value;
  const value = computeKnowledgeOverview(R);
  _overviewCache.set(R, { at: now, value });
  return value;
}

function computeKnowledgeOverview(R) {
  const wsKnow = join(R, "_workspaces", "knowledge");

  // ① 계층 서가: 공통(common/*) · 도메인(domain/*) · 과제(projects 는 아래 per-project 로)
  const shelfGroup = (rel) => safeDirents(join(wsKnow, rel))
    .filter((e) => e.isDirectory() && !BLOCKED_NAME_RE.test(e.name))
    .map((e) => ({ key: e.name, ...countTree(join(wsKnow, rel, e.name)) }));
  const shelves = {
    common: shelfGroup("common"),
    domain: shelfGroup("domain"),
  };

  // ② 자산 총량(빠른 카운트 — 재귀 없음)
  const assets = {
    source_cards: safeDirents(join(wsKnow, "source_cards")).filter((e) => e.isFile()).length,
    source_text_indexes: safeDirents(join(wsKnow, "rag", "indexes_local", "source_text_indexes")).filter((e) => e.isDirectory()).length,
  };

  // ③ 과제별: 수집 영수증(언제) + 후보 장부 + 장서 + 위키
  const projects = [];
  for (const code of listProjectCodes(R)) {
    const meta = join(R, "_workmeta", code);
    const receipts = readJsonlEvents(join(meta, "knowledge_ingest_receipts", "events"));
    const candidates = readJsonlEvents(join(meta, "knowledge_rag_candidate_ledger", "events"));
    const wiki = projectWikiPages(R, code);
    const entry = {
      project: code,
      bookshelf_total: bookshelfTotal(meta),
      ingest_receipts: receipts.length,
      last_ingest_at: receipts.map((r) => r.created_at).filter(Boolean).sort().at(-1) ?? null,
      candidates: candidates.length,
      last_candidate_at: candidates.map((r) => r.created_at ?? r.timestamp_utc).filter(Boolean).sort().at(-1) ?? null,
      wiki_pages: wiki.length,
    };
    if (entry.bookshelf_total || entry.ingest_receipts || entry.candidates || entry.wiki_pages) projects.push(entry);
  }

  // ④ 사용 기록(얼마나): knowledge_access 이벤트 원장 rollup — 실데이터가 적으면 적다고 그대로 드러낸다.
  const accessRows = [
    ...readJsonlEvents(join(R, "_workmeta", "system", "reports", "knowledge_access", "events")),
    ...listProjectCodes(R).flatMap((code) => readJsonlEvents(join(R, "_workmeta", code, "reports", "knowledge_access", "events"))),
  ];
  const byType = {};
  const byRef = {};
  let lastAccess = null;
  for (const r of accessRows) {
    const t = r.access_type ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
    const ref = r?.target?.knowledge_ref;
    if (ref) byRef[ref] = (byRef[ref] ?? 0) + 1;
    const at = r.timestamp_utc ?? null;
    if (at && (!lastAccess || at > lastAccess)) lastAccess = at;
  }
  const usage = {
    total_events: accessRows.length,
    by_access_type: byType,
    top_refs: Object.entries(byRef).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ref, n]) => ({ ref, n })),
    last_access_at: lastAccess,
    auto_capture_wired: false, // 정직: 응답 경로 자동 기록은 아직 미배선 — 수동 CLI 기록만 존재
  };

  // ⑤ 위키 페이지 목록(본문은 별도 readWikiPage 로만)
  const wiki_pages = [...knowledgeWikiPages(R), ...projects.flatMap((p) => projectWikiPages(R, p.project))]
    .sort((a, b) => (b.mtime_ms ?? 0) - (a.mtime_ms ?? 0)).slice(0, 200);

  // 서가 카드 중 하나라도 깊이/엔트리 캡에 걸렸으면 UI 가 '≈'(근사치)로 표기하도록 신호.
  const shelves_truncated = [...shelves.common, ...shelves.domain].some((s) => s.truncated);

  return {
    schema: KNOWLEDGE_OVERVIEW_SCHEMA,
    content_policy: "metadata_only",
    wiki_body_exception: WIKI_BODY_EXCEPTION,
    shelves, assets, projects, usage, wiki_pages, shelves_truncated,
  };
}

// 위키 본문 열람(owner 승인 예외). 허용 범위: (a) _workspaces/knowledge/**/wiki/** (b) _workspaces/<과제>/reference_payloads/knowledge_extract/**/wiki/**
export function readWikiPage(root, refRaw) {
  const R = resolve(root);
  const ref = norm(refRaw);
  if (!ref || ref.includes("..")) return { error: "wiki_ref_unsafe" };
  const abs = resolve(R, ref);
  if (!lexInside(R, abs)) return { error: "wiki_ref_unsafe" };
  const parts = ref.split("/");
  const inKnowledge = parts[0] === "_workspaces" && parts[1] === "knowledge" && parts.includes("wiki");
  const inProject = parts[0] === "_workspaces" && SAFE_SEG_RE.test(parts[1] ?? "") &&
    parts[2] === "reference_payloads" && parts[3] === "knowledge_extract" && parts.includes("wiki");
  if (!inKnowledge && !inProject) return { error: "wiki_ref_outside_allowlist" };
  if (extname(abs).toLowerCase() !== ".md" || BLOCKED_NAME_RE.test(basename(abs))) return { error: "wiki_ref_blocked" };
  // 정션 방어(Windows junction 은 심링크 가드를 통과): 실경로가 _workspaces 정션 대상 밖으로
  // 새면 거부. _workspaces 자체가 OneDrive 정션이므로 containment 기준은 그 실경로다.
  try {
    const realFile = realpathSync.native(abs);
    const realWs = realpathSync.native(join(R, "_workspaces"));
    if (!lexInside(realWs, realFile)) return { error: "wiki_ref_escapes_workspace" };
  } catch { return { error: "wiki_page_not_found" }; }
  const info = fileInfo(abs);
  if (!info?.isFile()) return { error: "wiki_page_not_found" };
  if (info.size > WIKI_BODY_MAX) return { error: "wiki_page_too_large" };
  let body;
  try { body = readFileSync(abs, "utf-8"); } catch { return { error: "wiki_page_unreadable" }; }
  return {
    ref, title: basename(abs, ".md").replace(/^\d+_/, ""),
    size_bytes: info.size, mtime_ms: Math.trunc(info.mtimeMs),
    body, body_included: true, exception: WIKI_BODY_EXCEPTION,
  };
}
