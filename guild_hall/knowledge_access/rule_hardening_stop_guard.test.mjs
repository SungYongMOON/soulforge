import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateRuleHardeningStopGuard,
  hasRuleHardeningCloseout,
  looksLikeBoundedTaskCompletion,
} from "./rule_hardening_stop_guard.mjs";

const knowledgeAccessDir = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.join(knowledgeAccessDir, "rule_hardening_stop_guard.mjs");
const soulforgeCwd = path.join(path.sep, "tmp", "Soulforge");

test("rule hardening stop guard accepts closeout lines", () => {
  assert.equal(hasRuleHardeningCloseout("규칙 강화 체크:\n- 새 규칙 후보: 없음"), true);
  assert.equal(hasRuleHardeningCloseout("Rule hardening check:\n- none"), true);
  assert.equal(hasRuleHardeningCloseout("지식 트리거 확인: 없음"), false);
});

test("rule hardening stop guard detects bounded setup completion", () => {
  assert.equal(looksLikeBoundedTaskCompletion("Stop hook은 턴 종료 직전 문지기입니다."), false);
  assert.equal(looksLikeBoundedTaskCompletion("셋업 완료했습니다. 훅 검증도 통과했습니다."), true);
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
