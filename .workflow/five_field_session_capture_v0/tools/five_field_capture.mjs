#!/usr/bin/env node
// five_field_capture.mjs — 세션/작업 종료 시 자동화 자산 5필드를 _workmeta 레저에 착지시키는 도구 비종속 CLI.
// 계약: _workmeta/system/dev_worker_candidate_queue/request_to_automation_ladder_v0.yaml (S1/S2, 개발 세션 레인)
//   입력=input_refs[] · 판단=judgment · 출력=output · 검증=verification · 중단조건=stop_conditions[]
//   집계키=request_kind ("review/mail" 형태) — ERP completion_log 와 같은 스키마 계열(soulforge.five_field_capture.v0)
// 원칙: 원문 미복사(포인터/요약만, 크기 가드), append-only JSONL, 중복 id 멱등, 표준 Node 만 사용(도구 비종속).
// 사용:
//   기록: node five_field_capture.mjs --project P26-014 --session-ref codex_20260704a --worker codex_gpt-5.3 --json '{...}'
//         (또는 --json - 로 stdin에서 JSON 읽기)
//   검사: node five_field_capture.mjs --check --session-ref codex_20260704a   (기록 없으면 exit 2 — 하네스 훅 guard 용)
import { readFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const SCHEMA = "soulforge.five_field_capture.v0";
const SLUG_RE = /^[a-z0-9][a-z0-9_\-./]{1,79}$/;
const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_\-]{1,39}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/;
const CAPS = { input_ref: 300, input_refs: 12, judgment: 2000, output: 2000, verification: 600, stop_condition: 300, stop_conditions: 5, total: 12000 };

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

function findRepoRoot(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.SOULFORGE_ROOT) return resolve(process.env.SOULFORGE_ROOT);
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "_workmeta"))) return dir;
    const up = resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  return null;
}

function fail(msg, code = 1) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  process.exit(code);
}

function clampStr(v, max) { const s = String(v ?? "").trim(); return s.slice(0, max); }

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fullRecordDigest(record) {
  return `sha256:${createHash("sha256").update(canonicalize(record)).digest("hex")}`;
}

function strictUtc(value, label) {
  const text = String(value ?? "").trim();
  const parsed = new Date(text);
  if (!text.endsWith("Z") || !Number.isFinite(parsed.getTime())) fail(`${label}_invalid`);
  return parsed.toISOString();
}

function resolveProjectCode(root, requestedProject) {
  // Exact legacy alias only: "SYSTEM" resolves to the canonical "system"
  // ledger directory. No other case-insensitive project matching is applied.
  // The case-alias scan below runs against this resolved candidate (not the
  // raw requested value), so a pre-existing case-variant directory for the
  // resolved candidate — e.g. "_workmeta/SYSTEM" with no canonical
  // "_workmeta/system" yet — still HOLDs instead of silently writing into
  // (or alongside) the wrong-case directory.
  const resolved = requestedProject === "SYSTEM" ? "system" : requestedProject;
  let dirs = [];
  try {
    dirs = readdirSync(join(root, "_workmeta"), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
  } catch { /* no _workmeta yet */ }
  if (dirs.some((d) => d !== resolved && d.toLowerCase() === resolved.toLowerCase())) {
    fail("project_directory_case_mismatch");
  }
  return resolved;
}

function normalizeRecord(root, raw, args, existing = null) {
  const requestedProject = clampStr(args.project ?? raw.project_code ?? "system", 40);
  if (!PROJECT_RE.test(requestedProject)) fail("invalid_project_code");
  const project = resolveProjectCode(root, requestedProject);
  const requestKind = String(raw.request_kind ?? args["request-kind"] ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(requestKind)) fail("invalid_request_kind_slug (예: review/mail, doc_update/manual)");
  const inputRefs = (Array.isArray(raw.input_refs) ? raw.input_refs : [])
    .map((s) => clampStr(s, CAPS.input_ref)).filter(Boolean).slice(0, CAPS.input_refs);
  const stopConditions = (Array.isArray(raw.stop_conditions) ? raw.stop_conditions : [])
    .map((s) => clampStr(s, CAPS.stop_condition)).filter(Boolean).slice(0, CAPS.stop_conditions);
  const explicitOccurredAt = args["occurred-at"] ?? raw.occurred_at;
  const explicitRecordedAt = args["recorded-at"] ?? raw.recorded_at ?? raw.at;
  const recordedAt = strictUtc(
    explicitRecordedAt ?? existing?.recorded_at ?? existing?.at ?? new Date().toISOString(),
    "recorded_at",
  );
  const occurredAt = strictUtc(
    explicitOccurredAt ?? existing?.occurred_at ?? existing?.at ?? recordedAt,
    "occurred_at",
  );
  const rec = {
    schema_version: SCHEMA,
    id: "", // 아래에서 결정(내용 해시 — 재실행 멱등)
    at: recordedAt,
    occurred_at: occurredAt,
    recorded_at: recordedAt,
    worker: clampStr(args.worker ?? raw.worker ?? "", 80) || fail("worker_required (예: codex_gpt-5.3, claude_fable-5)"),
    session_ref: clampStr(args["session-ref"] ?? raw.session_ref ?? "", 120) || fail("session_ref_required"),
    project_code: project,
    request_kind: requestKind,
    input_refs: inputRefs,                              // 입력: 무엇을 보고 시작했나(포인터만)
    judgment: clampStr(raw.judgment, CAPS.judgment),    // 판단: 어떤 기준으로 분류/결정했나
    output: clampStr(raw.output, CAPS.output),          // 출력: 무엇을 만들었나(경로/커밋 ref 권장)
    verification: clampStr(raw.verification, CAPS.verification), // 검증: 성공/실패를 어떻게 확인했나
    stop_conditions: stopConditions,                    // 중단조건: 다음부터 자동으로 하면 안 되는 경우
    needs_backfill: !(raw.judgment && raw.output) ? 1 : 0,
    data_label: clampStr(args["data-label"] ?? raw.data_label ?? "ai_draft", 40),
  };
  rec.id = rec.session_ref + ":" + createHash("sha1")
    .update([rec.project_code, rec.request_kind, rec.judgment, rec.output, rec.verification].join("\u0000"))
    .digest("hex").slice(0, 12);
  const explicitId = clampStr(args.id ?? raw.id, 200);
  if (explicitId) {
    if (!ID_RE.test(explicitId)) fail("invalid_record_id");
    rec.id = explicitId;
  }
  const serialized = JSON.stringify(rec);
  if (serialized.length > CAPS.total) fail("record_too_large_raw_body_suspected (원문을 붙이지 말고 포인터만)");
  return rec;
}

function ledgerPath(root, project) {
  return join(root, "_workmeta", project, "reports", "procedure_capture", "five_field_log.jsonl");
}

function checkSession(root, sessionRef) {
  const base = join(root, "_workmeta");
  let dirs = [];
  try { dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* no _workmeta */ }
  for (const d of dirs) {
    const p = ledgerPath(root, d);
    if (!existsSync(p)) continue;
    try {
      const hit = readFileSync(p, "utf8").split("\n").some((line) => line.includes(`"session_ref":${JSON.stringify(sessionRef)}`));
      if (hit) return { ok: true, found: true, project: d };
    } catch { /* skip unreadable */ }
  }
  return { ok: true, found: false };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = findRepoRoot(args["repo-root"]);
  if (!root) fail("repo_root_not_found (_workmeta 가 보이는 위치에서 실행하거나 --repo-root/SOULFORGE_ROOT 지정)");

  if (args.check) {
    const sessionRef = String(args["session-ref"] ?? "").trim();
    if (!sessionRef) fail("session_ref_required");
    const r = checkSession(root, sessionRef);
    process.stdout.write(JSON.stringify(r) + "\n");
    process.exit(r.found ? 0 : 2); // 하네스 훅 guard: 기록 없으면 비정상 종료 → 경고 표면화
  }

  let rawText = args.json === "-" || args.json === true ? readFileSync(0, "utf8") : String(args.json ?? "");
  rawText = rawText.replace(/^\uFEFF/, "");
  if (!rawText.trim()) fail("json_required (--json '<record>' 또는 --json - 로 stdin)");
  let raw;
  try { raw = JSON.parse(rawText); } catch (e) { fail("json_parse_error: " + String(e?.message ?? e).slice(0, 120)); }

  let rec = normalizeRecord(root, raw, args);
  const p = ledgerPath(root, rec.project_code);
  mkdirSync(join(p, ".."), { recursive: true });
  if (existsSync(p)) {
    const matches = readFileSync(p, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { fail("ledger_json_invalid"); }
    }).filter((record) => record?.id === rec.id);
    if (matches.length > 1) {
      const existingDigests = new Set(matches.map(fullRecordDigest));
      if (existingDigests.size > 1) fail("duplicate_ledger_identity_conflict_hold");
    }
    if (matches.length >= 1) {
      const existing = matches[0];
      rec = normalizeRecord(root, raw, args, existing);
      let candidateForDigest = rec;
      const callerSuppliedClocks = args["occurred-at"] !== undefined
        || args["recorded-at"] !== undefined
        || raw.occurred_at !== undefined
        || raw.recorded_at !== undefined
        || raw.at !== undefined;
      if (
        !callerSuppliedClocks
        && !Object.hasOwn(existing, "occurred_at")
        && !Object.hasOwn(existing, "recorded_at")
      ) {
        candidateForDigest = { ...rec };
        delete candidateForDigest.occurred_at;
        delete candidateForDigest.recorded_at;
      }
      const existingDigest = fullRecordDigest(matches[0]);
      const candidateDigest = fullRecordDigest(candidateForDigest);
      if (existingDigest !== candidateDigest) fail("same_identity_different_digest_hold");
      process.stdout.write(JSON.stringify({
        ok: true,
        skipped: "duplicate",
        id: rec.id,
        ledger: p,
        record_digest: candidateDigest,
      }) + "\n");
      return;
    }
  }
  appendFileSync(p, JSON.stringify(rec) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    ok: true,
    id: rec.id,
    ledger: p,
    needs_backfill: rec.needs_backfill,
    record_digest: fullRecordDigest(rec),
  }) + "\n");
}

main();
