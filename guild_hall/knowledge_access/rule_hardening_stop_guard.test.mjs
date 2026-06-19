import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildConversationContextMetadata,
  extractRuleHardeningCandidates,
  evaluateRuleHardeningStopGuard,
  hasRuleHardeningCloseout,
  looksLikeBoundedTaskCompletion,
  recordRuleHardeningCandidates,
} from "./rule_hardening_stop_guard.mjs";

const knowledgeAccessDir = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.join(knowledgeAccessDir, "rule_hardening_stop_guard.mjs");
const soulforgeCwd = path.join(path.sep, "tmp", "Soulforge");

test("rule hardening stop guard accepts closeout lines", () => {
  assert.equal(hasRuleHardeningCloseout("규칙 강화 체크:\n- 새 규칙 후보: 없음"), true);
  assert.equal(hasRuleHardeningCloseout("Rule hardening check:\n- none"), true);
  assert.equal(hasRuleHardeningCloseout("지식 트리거 확인: 없음"), false);
});

test("rule hardening candidate extraction ignores no-op closeout", () => {
  assert.deepEqual(extractRuleHardeningCandidates("규칙 강화 체크:\n- 새 규칙 후보: 없음"), []);
  assert.deepEqual(
    extractRuleHardeningCandidates(
      "규칙 강화 체크:\n- 새 규칙 후보: P26-014 신규 발송 키워드는 [기0탐] 사용\n- 다음부터 자동 적용: 팀 참조는 배포목록 검색",
    ),
    [
      "새 규칙 후보: P26-014 신규 발송 키워드는 [기0탐] 사용",
      "다음부터 자동 적용: 팀 참조는 배포목록 검색",
    ],
  );
});

test("rule hardening stop guard detects bounded setup completion", () => {
  assert.equal(looksLikeBoundedTaskCompletion("Stop hook은 턴 종료 직전 문지기입니다."), false);
  assert.equal(looksLikeBoundedTaskCompletion("셋업 완료했습니다. 훅 검증도 통과했습니다."), true);
});

test("rule hardening context metadata keeps findability without raw transcript", () => {
  const metadata = buildConversationContextMetadata({
    cwd: soulforgeCwd,
    thread_id: "thread_123",
    hook_run_id: "stop:0:test",
    last_assistant_message:
      "P26-014 메일 제목 키워드 규칙을 반영했습니다.\n\n규칙 강화 체크:\n- 새 규칙 후보: P26-014 신규 발송 키워드는 [기0탐] 사용",
  });

  assert.equal(metadata.thread_id, "thread_123");
  assert.equal(metadata.run_id, "stop:0:test");
  assert.deepEqual(metadata.project_codes, ["P26-014"]);
  assert.match(metadata.task_hint, /메일 제목 키워드/);
  assert.equal(typeof metadata.final_message_hash, "string");
  assert.equal(metadata.final_message_hash.length, 64);
});

test("rule hardening stop guard blocks bounded Soulforge completion without closeout", () => {
  const result = evaluateRuleHardeningStopGuard({
    cwd: soulforgeCwd,
    hook_event_name: "Stop",
    last_assistant_message: "셋업 완료했습니다. 훅 검증도 통과했습니다.",
  });

  assert.equal(result.shouldBlock, true);
  assert.equal(result.decision, "block");
  assert.match(result.reason, /규칙 강화 체크:/);
});

test("rule hardening stop guard continues ordinary chat and completed reports with closeout", () => {
  assert.equal(
    evaluateRuleHardeningStopGuard({
      cwd: soulforgeCwd,
      hook_event_name: "Stop",
      last_assistant_message: "Stop hook은 턴 종료 직전 문지기입니다.",
    }).shouldBlock,
    false,
  );
  assert.equal(
    evaluateRuleHardeningStopGuard({
      cwd: soulforgeCwd,
      hook_event_name: "Stop",
      last_assistant_message: "셋업 완료했습니다. 훅 검증도 통과했습니다.\n\n규칙 강화 체크:\n- 새 규칙 후보: 없음",
    }).shouldBlock,
    false,
  );
});

test("rule hardening stop guard records closeout candidates to a jsonl ledger", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "rule-hardening-ledger-"));
  try {
    const result = recordRuleHardeningCandidates(
      {
        cwd: soulforgeCwd,
        thread_id: "thread_abc",
        hook_event_name: "Stop",
        last_assistant_message:
          "P26-014 전송 완료했습니다.\n\n규칙 강화 체크:\n- 새 규칙 후보: P26-014 신규 발송 키워드는 [기0탐] 사용\n- 다음부터 자동 적용: 팀 참조는 실제 Outlook 배포목록 사용",
      },
      {
        ledgerRoot: tmp,
        now: new Date("2026-06-18T13:58:48.000Z"),
      },
    );

    assert.equal(result.recorded, true);
    const ledgerText = readFileSync(result.ledgerPath, "utf8");
    const entry = JSON.parse(ledgerText.trim());
    assert.equal(entry.schema_version, "soulforge.rule_hardening_candidate.v1");
    assert.equal(entry.candidate_count, 2);
    assert.match(entry.candidates[0], /\[기0탐\]/);
    assert.equal(entry.conversation_context.thread_id, "thread_abc");
    assert.deepEqual(entry.conversation_context.project_codes, ["P26-014"]);
    assert.match(entry.conversation_context.task_hint, /전송 완료/);

    const duplicate = recordRuleHardeningCandidates(
      {
        cwd: soulforgeCwd,
        hook_event_name: "Stop",
        last_assistant_message:
          "P26-014 전송 완료했습니다.\n\n규칙 강화 체크:\n- 새 규칙 후보: P26-014 신규 발송 키워드는 [기0탐] 사용\n- 다음부터 자동 적용: 팀 참조는 실제 Outlook 배포목록 사용",
      },
      {
        ledgerRoot: tmp,
        now: new Date("2026-06-18T14:00:00.000Z"),
      },
    );
    assert.equal(duplicate.recorded, false);
    assert.equal(duplicate.reason, "duplicate");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("rule hardening stop guard ignores non-Soulforge cwd", () => {
  const result = evaluateRuleHardeningStopGuard({
    cwd: path.join(path.sep, "tmp", "OtherRepo"),
    hook_event_name: "Stop",
    last_assistant_message: "셋업 완료했습니다. 훅 검증도 통과했습니다.",
  });

  assert.equal(result.shouldBlock, false);
});

test("rule hardening stop guard CLI outputs compact block JSON", () => {
  const result = spawnSync(
    process.execPath,
    [guardPath],
    {
      encoding: "utf8",
      input: JSON.stringify({
        cwd: soulforgeCwd,
        hook_event_name: "Stop",
        last_assistant_message: "셋업 완료했습니다. 훅 검증도 통과했습니다.",
      }),
    },
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /conversation-rule-hardening/);
});

test("rule hardening stop guard CLI stays silent on continue", () => {
  const result = spawnSync(
    process.execPath,
    [guardPath],
    {
      encoding: "utf8",
      input: JSON.stringify({
        cwd: soulforgeCwd,
        hook_event_name: "Stop",
        last_assistant_message: "설명만 했습니다.",
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
