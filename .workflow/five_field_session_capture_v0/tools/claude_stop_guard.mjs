#!/usr/bin/env node
// claude_stop_guard.mjs — Claude Code 훅 어댑터(표준 Node만 사용).
// 설계: Stop 훅은 매 턴 끝마다 발화하므로 무조건 차단하면 일상 대화가 막힌다.
// 2단 센서: (1) --mark: PostToolUse(git commit)에서 "이 세션은 bounded 작업을 했다" 센티널 기록
//           (2) --guard: Stop에서 센티널이 있고 5필드 기록이 없을 때만 1회 차단(decision:block)
//               → 모델이 five_field_capture.mjs 로 기록하면 다음 stop은 통과. stop_hook_active
//               재차단 루프 방지: 두 번째부터는 경고(systemMessage)만 내고 통과.
// stdin: Claude Code 훅 JSON({session_id, stop_hook_active, ...}). stdout: 훅 JSON 출력.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const CAPTURE = join(HERE, "five_field_capture.mjs");
const PENDING_DIR = join(tmpdir(), "claude-five-field");

function readStdinJson() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}
function sanitize(s) { return String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80); }
function out(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

const mode = process.argv[2];
const input = readStdinJson();
const sid = sanitize(input.session_id);
if (!sid) process.exit(0); // 세션 식별 불가 — 조용히 통과(훅이 대화를 방해하면 안 됨)
const pending = join(PENDING_DIR, sid);

if (mode === "--mark") {
  // bounded 작업 신호(git commit) 감지 → 센티널. 체인 명령(cd x && git commit)도 잡도록
  // prefix 매칭 대신 명령 내용 검사. 실패해도 무해(베스트에포트).
  const cmd = String(input.tool_input?.command ?? "");
  if (!/\bgit\b[^\n;|&]*\bcommit\b/.test(cmd)) process.exit(0);
  try { mkdirSync(PENDING_DIR, { recursive: true }); writeFileSync(pending, new Date().toISOString()); } catch { /* noop */ }
  process.exit(0);
}

if (mode === "--guard") {
  if (!existsSync(pending)) process.exit(0); // bounded 작업 없던 세션/턴 — 조용히 통과
  const check = spawnSync(process.execPath, [CAPTURE, "--check", "--session-ref", sid, "--repo-root", REPO], { encoding: "utf8", timeout: 15000 });
  if (check.status === 0) { // 기록 있음 — 센티널 회수 후 통과
    try { rmSync(pending, { force: true }); } catch { /* noop */ }
    process.exit(0);
  }
  if (input.stop_hook_active) { // 이미 한 번 차단했음 — 무한 루프 방지: 경고만 내고 통과(레저에는 미기록 흔적이 남지 않으므로 소급은 주간 스캔 몫)
    try { rmSync(pending, { force: true }); } catch { /* noop */ }
    out({ systemMessage: "⚠ 5필드 기록 없이 종료 — 이 세션의 자동화 자산이 유실됐습니다(소급 대상). .workflow/five_field_session_capture_v0 참고." });
    process.exit(0);
  }
  out({
    decision: "block",
    reason: `이 세션에서 커밋(bounded 작업)이 있었지만 자동화 자산 5필드 기록이 없습니다. 종료 전에 기록하세요:\n` +
      `node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs --project <과제코드|system> --session-ref ${sid} --worker <도구_모델> --request-kind <행위/출처 슬러그> --json '{"input_refs":[...],"judgment":"...","output":"...","verification":"...","stop_conditions":[...]}'\n` +
      `(원문 복사 금지 — 포인터만. 기록 후 종료가 자동으로 허용됩니다.)`,
  });
  process.exit(0);
}

process.exit(0);
