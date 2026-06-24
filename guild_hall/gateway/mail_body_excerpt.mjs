// guild_hall/gateway/mail_body_excerpt.mjs — 메일 본문 발췌(미리보기) resolver.
//   본문은 런타임 이벤트 싱크(guild_hall/state/gateway/mailbox/**, gitignored)에만 있다.
//   _workmeta 원장(메일_이력.csv)·후보 큐 JSON 에는 본문이 들어가지 않는다(test_mail_candidate_queue 불변식).
//   여기서 뽑은 발췌는 core_mail.body_preview(런타임 DB)에만 착지하며, 원문 전체·첨부는 저장하지 않는다.
//   의존성 0: node:fs/path + 무의존 shared/io.mjs 만 쓴다(scan_mail_ledger 의 zero-dependency·도구 비종속 유지 —
//   본문 router(yaml 의존)를 끌어오지 않으려고 mail_candidate.mjs 와 분리).
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathExists, readJson, relativeToRepo } from "../shared/io.mjs";

const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlToText(html) {
  const raw = String(html ?? "");
  if (!raw) return "";
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ") // 스크립트/스타일 블록 통째 제거
    .replace(/<[^>]+>/g, " ") // 남은 태그 제거
    .replace(/&#(\d+);/g, (_, code) => { try { return String.fromCodePoint(Number(code)); } catch { return " "; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => { try { return String.fromCodePoint(parseInt(code, 16)); } catch { return " "; } })
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

function resolveRepoPath(repoRoot, value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("missing path value");
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(repoRoot, raw);
}

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertMailEventSinkFile(repoRoot, eventFile) {
  const mailboxRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mailbox");
  if (!isPathInside(mailboxRoot, eventFile)) {
    throw new Error(`source event file must stay under ${relativeToRepo(repoRoot, mailboxRoot)}`);
  }
}

export function assertMailCandidateQueueFile(repoRoot, candidateFile) {
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
  if (!isPathInside(queueRoot, candidateFile)) {
    throw new Error(`candidate file must stay under ${relativeToRepo(repoRoot, queueRoot)}`);
  }
}

// 이벤트 레코드 → 발췌(미리보기). text/plain 우선, 없으면 html→text. 공백 정리 후 maxChars 컷.
export function mailBodyExcerptFromRecord(record, { maxChars = 2000 } = {}) {
  const fromText = String(record?.body_text ?? "").trim();
  const text = fromText || htmlToText(record?.body_html);
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, Math.max(1, maxChars)) || null;
}

// 한 이벤트 싱크 JSONL → Map(event_id → 발췌). 싱크(mailbox) 경로 밖 읽기는 거부한다.
export async function loadMailBodyExcerptIndex({ repoRoot, eventFile, maxChars = 2000 }) {
  const index = new Map();
  const resolved = resolveRepoPath(repoRoot, eventFile);
  assertMailEventSinkFile(repoRoot, resolved);
  if (!(await pathExists(resolved))) {
    return index;
  }
  const raw = await fs.readFile(resolved, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const eventId = String(row?.event_id ?? "").trim();
    if (!eventId || index.has(eventId)) {
      continue;
    }
    const excerpt = mailBodyExcerptFromRecord(row, { maxChars });
    if (excerpt) {
      index.set(eventId, excerpt);
    }
  }
  return index;
}

// 후보 큐 포인터(파일링패킷참조) → 본문 발췌. 후보 JSON 의 source_event(event_file·event_id)로 싱크를 찾는다.
//   cache: Map(event_file 절대경로 → index Map) — 같은 월 JSONL 재읽기 방지(배치 스캔용).
//   본문 미수집(후보/싱크 부재 등)은 정상 경로라 throw 하지 않고 null 을 돌려준다.
export async function readMailBodyPreview({ repoRoot, candidateRef, cache = null, maxChars = 2000 }) {
  const ref = String(candidateRef ?? "").trim();
  if (!ref) {
    return null;
  }
  try {
    const candidateFile = resolveRepoPath(repoRoot, ref);
    assertMailCandidateQueueFile(repoRoot, candidateFile);
    if (!(await pathExists(candidateFile))) {
      return null;
    }
    const candidate = await readJson(candidateFile);
    const sourceEvent = candidate?.source_event ?? {};
    const eventFile = String(sourceEvent.event_file ?? "").trim();
    const eventId = String(sourceEvent.event_id ?? "").trim();
    if (!eventFile || !eventId) {
      return null;
    }
    const eventKey = resolveRepoPath(repoRoot, eventFile);
    let index = cache?.get(eventKey);
    if (!index) {
      index = await loadMailBodyExcerptIndex({ repoRoot, eventFile, maxChars });
      cache?.set(eventKey, index);
    }
    return index.get(eventId) ?? null;
  } catch {
    return null;
  }
}
