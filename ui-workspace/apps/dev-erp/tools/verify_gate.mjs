#!/usr/bin/env node
// B1 검증 게이트 (하네스): 페이즈/슬라이스 종료 체크를 한 방에.
// 사용: node tools/verify_gate.mjs [--level 0|1|2|3] [--packet <path>] [--skip-tests]
// 원칙(연속성 제약): 표준 Node/CLI 만. 기계 검증은 여기서, 브라우저 검증은
// docs/BROWSER_QA_PROCEDURE.md 절차 문서로 (누구든 — Codex/사람 — 수행 가능).
// 계약 매핑: AGENT_EXECUTION_CONTRACT_V0 post-development review gate Level 0~3.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url))); // dev-erp 루트

// --- 개별 체크: 전부 순수 함수(ctx 주입) — 게이트 자신을 테스트 가능하게 ---
export function checkNodeVersion(versionString = process.versions.node) {
  const [maj, min] = versionString.split(".").map(Number);
  const ok = maj > 22 || (maj === 22 && min >= 5);
  return { id: "node_version", ok, note: `node ${versionString} (need >=22.5, node:sqlite)` };
}

export function checkLocalhostDefault(serverSource) {
  const ok = /flag\(\s*["']host["']\s*,\s*["']127\.0\.0\.1["']\s*\)/.test(serverSource);
  return { id: "localhost_default", ok, note: "server 기본 bind 127.0.0.1" };
}

export function checkZeroDependency(sources) {
  // import 는 node: 빌트인 또는 상대경로만 (Codex 연속성: 설치 의존 0)
  const bad = [];
  for (const [file, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith("node:") && !spec.startsWith("./") && !spec.startsWith("../")) {
        bad.push(`${file}: ${spec}`);
      }
    }
  }
  return { id: "zero_dependency", ok: bad.length === 0, note: bad.join("; ") || "node:/상대경로 import 만" };
}

export function checkNoServerEgress(sources) {
  // 서버 측 코드에 외부 호출 부재 (외부 전송 0 가드 — LLM 레인 예외는 P4 어댑터 한 곳에서만 별도 관리)
  const bad = [];
  for (const [file, src] of Object.entries(sources)) {
    const noComments = src.replace(/\/\/[^\n]*/g, "");
    if (/\bfetch\s*\(|https?\.request\s*\(|net\.connect\s*\(/.test(noComments)) bad.push(file);
  }
  return { id: "no_server_egress", ok: bad.length === 0, note: bad.join("; ") || "서버 코드 외부 호출 0" };
}

export function checkNoRawMailColumns(storeSource) {
  const ddl = storeSource.match(/CREATE TABLE IF NOT EXISTS core_mail \(([\s\S]*?)\);/);
  if (!ddl) return { id: "no_raw_mail_columns", ok: false, note: "core_mail DDL 미발견" };
  const ok = !/\b(body|content|raw|attachment)\b/i.test(ddl[1]);
  return { id: "no_raw_mail_columns", ok, note: "메일 원문/첨부 컬럼 부재 (메타 전용)" };
}

export function checkDataIgnored(trackedDataFiles, gitignoreContent) {
  const ignored = /(^|\n)\s*data\/?\s*(\n|$)/.test(gitignoreContent) || gitignoreContent.includes("data/");
  const ok = trackedDataFiles.length === 0 && ignored;
  return {
    id: "db_gitignored", ok,
    note: ok ? "data/ 미추적 + gitignore 등재" : `추적된 data 파일 ${trackedDataFiles.length}건 / gitignore=${ignored}`
  };
}

export function checkChecklistDoc(checklistJsonText) {
  try {
    const d = JSON.parse(checklistJsonText);
    const items = Array.isArray(d.items) ? d.items : [];
    const badItem = items.find((i) => !i.id || !i.status || !i.title);
    const ok = items.length > 0 && !badItem;
    return { id: "checklist_valid", ok, note: ok ? `items ${items.length}, run_notes ${(d.run_notes ?? []).length}` : "items 필드 결손" };
  } catch (e) {
    return { id: "checklist_valid", ok: false, note: `JSON parse 실패: ${e.message}` };
  }
}

export function checkDocsPresent(fileExists) {
  const required = ["docs/DESIGN.md", "docs/BROWSER_QA_PROCEDURE.md", "docs/checklist_phase1.json"];
  const missing = required.filter((f) => !fileExists(f));
  return { id: "docs_present", ok: missing.length === 0, note: missing.join("; ") || "필수 문서 존재" };
}

export function checkTests(runner) {
  try {
    const out = runner();
    const fail = /# fail (\d+)/.exec(out);
    const pass = /# pass (\d+)/.exec(out);
    const ok = fail && Number(fail[1]) === 0 && pass && Number(pass[1]) > 0;
    return { id: "node_test", ok, note: ok ? `pass ${pass[1]} / fail 0` : `테스트 실패 (${fail ? fail[1] : "?"})` };
  } catch (e) {
    return { id: "node_test", ok: false, note: `실행 실패: ${String(e.message).slice(0, 120)}` };
  }
}

export function checkPacket(packetPath, fileExists, read) {
  if (!packetPath) return { id: "packet", ok: false, note: "--packet 경로 필요 (Level>=1)" };
  if (!fileExists(packetPath)) return { id: "packet", ok: false, note: `미존재: ${packetPath}` };
  const t = read(packetPath);
  const ok = /task_id:/.test(t) && /status:/.test(t) && /owner_approval:/.test(t);
  return { id: "packet", ok, note: ok ? packetPath : "필수 키(task_id/status/owner_approval) 결손" };
}

// 계약 Level 매핑: 기계 체크 + 사람/에이전트 확인 항목
export const LEVEL_CONFIRMS = {
  0: ["changed files 목록", "git status 확인", "validate 명령 실행 또는 미실행 사유"],
  1: ["allowed write paths 준수", "secret/raw 부재", "source support", "output state 기록"],
  2: ["Level 1 전부", "기존 패턴/대안/효과 비교", "accept/revise/hold/reject 결정 기록"],
  3: ["fresh B executor", "별도 V verifier", "acceptance contract", "redacted verdict", "stop condition"]
};

export function runGate({ level = 1, packet = null, skipTests = false, root = APP } = {}) {
  const read = (p) => readFileSync(join(root, p), "utf-8");
  const exists = (p) => existsSync(join(root, p));
  const serverSrc = read("server.mjs");
  const storeSrc = read("src/store.mjs");
  const srcFiles = { "server.mjs": serverSrc, "src/store.mjs": storeSrc };
  for (const f of ["src/guide.mjs", "src/lexicon.mjs", "src/adapter.mjs", "src/search.mjs", "src/modules.mjs", "src/fixture.mjs"]) {
    if (exists(f)) srcFiles[f] = read(f);
  }
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "data"], { cwd: root, encoding: "utf-8" }).split("\n").filter(Boolean);
  } catch { /* git 부재 환경: 보수적으로 빈 배열 + gitignore 검사로 커버 */ }

  const checks = [
    checkNodeVersion(),
    checkLocalhostDefault(serverSrc),
    checkZeroDependency(srcFiles),
    checkNoServerEgress(srcFiles),
    checkNoRawMailColumns(storeSrc),
    checkDataIgnored(tracked, exists(".gitignore") ? read(".gitignore") : ""),
    checkChecklistDoc(read("docs/checklist_phase1.json")),
    checkDocsPresent(exists)
  ];
  if (!skipTests) {
    checks.push(checkTests(() =>
      execFileSync(process.execPath, ["--test"], { cwd: root, encoding: "utf-8", env: { ...process.env, NODE_NO_WARNINGS: "1" } })
    ));
  }
  if (level >= 1) checks.push(checkPacket(packet, (p) => existsSync(p), (p) => readFileSync(p, "utf-8")));
  // B6: Level>=2 는 독립 inspector 증거 요구 (도구 비종속 — 보고 파일 존재로 판정)
  if (level >= 2) checks.push(checkInspectorEvidence(packet, (p) => existsSync(p) ? readFileSync(p, "utf-8") : null));
  return { checks, ok: checks.every((c) => c.ok), confirms: LEVEL_CONFIRMS[level] ?? [] };
}

// B6 (run21): inspector 증거 — packet 안 inspector verdict 또는 동반 보고 파일
export function checkInspectorEvidence(packetPath, readOrNull) {
  if (!packetPath) return { id: "inspector_evidence", ok: false, note: "Level>=2: packet 경로 필요" };
  const t = readOrNull(packetPath);
  if (!t) return { id: "inspector_evidence", ok: false, note: "packet 미존재" };
  const inline = /inspector_verdict:\s*(accept|revise|hold|reject)/.test(t);
  const reportRef = /inspector_report:\s*\S+/.test(t);
  return {
    id: "inspector_evidence", ok: inline || reportRef,
    note: inline ? "packet 내 inspector_verdict" : reportRef ? "inspector_report 참조" : "독립 inspector 증거 없음 (INSPECTOR_PROTOCOL.md 참조)"
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const level = Number(flag("level", "1"));
  const result = runGate({ level, packet: flag("packet", null), skipTests: args.includes("--skip-tests") });
  console.log(`[verify_gate] Level ${level} — ${result.ok ? "PASS" : "FAIL"}`);
  for (const c of result.checks) console.log(` ${c.ok ? "✓" : "✗"} ${c.id}: ${c.note}`);
  console.log(`[verify_gate] 사람/에이전트 확인 항목 (Level ${level}):`);
  for (const c of result.confirms) console.log(` □ ${c}`);
  if (level >= 1) console.log(" □ 브라우저 검증: docs/BROWSER_QA_PROCEDURE.md 절차 수행 (또는 미수행 사유 기록)");
  process.exit(result.ok ? 0 : 1);
}
