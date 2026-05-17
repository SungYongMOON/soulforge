import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateKnowledgeTriggerStopGuard,
  hasKnowledgeTriggerCloseout,
  looksLikeBoundedTaskCompletion,
} from "./knowledge_trigger_stop_guard.mjs";

const knowledgeAccessDir = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.join(knowledgeAccessDir, "knowledge_trigger_stop_guard.mjs");
const soulforgeCwd = path.join(path.sep, "tmp", "Soulforge");

test("knowledge trigger stop guard accepts valid closeout lines", () => {
  assert.equal(hasKnowledgeTriggerCloseout("Knowledge trigger check: no_trigger"), true);
  assert.equal(hasKnowledgeTriggerCloseout("Knowledge trigger check: metadata_only_record"), true);
  assert.equal(hasKnowledgeTriggerCloseout("Knowledge trigger check: sourcebound_review_candidate"), true);
  assert.equal(hasKnowledgeTriggerCloseout("Knowledge trigger check: owner_decision_needed"), true);
  assert.equal(hasKnowledgeTriggerCloseout("지식 트리거 확인: 없음"), true);
  assert.equal(hasKnowledgeTriggerCloseout("지식 트리거 확인: 메타데이터 기록"), true);
  assert.equal(hasKnowledgeTriggerCloseout("지식 트리거 확인: 소스 기반 검토 후보"), true);
  assert.equal(hasKnowledgeTriggerCloseout("지식 트리거 확인: 오너 판단 필요"), true);
  assert.equal(hasKnowledgeTriggerCloseout("Knowledge trigger check: validated_private"), false);
  assert.equal(hasKnowledgeTriggerCloseout("지식 트리거 확인: 검증된 비공개"), false);
});

test("knowledge trigger stop guard only treats completion-like reports as bounded task end", () => {
  assert.equal(looksLikeBoundedTaskCompletion("쉽게 설명하면 Stop hook은 문지기입니다."), false);
  assert.equal(
    looksLikeBoundedTaskCompletion("구현 완료했습니다. `npm run validate:knowledge-access` 통과했습니다."),
    true,
  );
});

test("knowledge trigger stop guard blocks bounded Soulforge completion without closeout line", () => {
  const result = evaluateKnowledgeTriggerStopGuard({
    cwd: soulforgeCwd,
    hook_event_name: "Stop",
    last_assistant_message: "구현 완료했습니다. `npm run validate` 통과했습니다.",
  });

  assert.equal(result.shouldBlock, true);
  assert.equal(result.decision, "block");
  assert.match(result.reason, /지식 트리거 확인:/);
});

test("knowledge trigger stop guard continues ordinary chat and completed reports with closeout", () => {
  assert.equal(
    evaluateKnowledgeTriggerStopGuard({
      cwd: soulforgeCwd,
      hook_event_name: "Stop",
      last_assistant_message: "Stop hook은 턴 종료 직전 문지기입니다.",
    }).shouldBlock,
    false,
  );
  assert.equal(
    evaluateKnowledgeTriggerStopGuard({
      cwd: soulforgeCwd,
      hook_event_name: "Stop",
      last_assistant_message:
        "구현 완료했습니다. `npm run validate` 통과했습니다.\n\n지식 트리거 확인: 없음",
    }).shouldBlock,
    false,
  );
});

test("knowledge trigger stop guard ignores non-Soulforge cwd to avoid global context pollution", () => {
  const result = evaluateKnowledgeTriggerStopGuard({
    cwd: path.join(path.sep, "tmp", "OtherRepo"),
    hook_event_name: "Stop",
    last_assistant_message: "구현 완료했습니다. `npm run validate` 통과했습니다.",
  });

  assert.equal(result.shouldBlock, false);
});

test("knowledge trigger stop guard CLI outputs compact block JSON without echoing message", () => {
  const privatePath = path.join(path.sep, "Users", "example", "private", "note.md");
  const result = spawnSync(
    process.execPath,
    [guardPath],
    {
      encoding: "utf8",
      input: JSON.stringify({
        cwd: soulforgeCwd,
        hook_event_name: "Stop",
        last_assistant_message: `구현 완료했습니다. ${privatePath} 관련 검증도 통과했습니다.`,
      }),
    },
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.decision, "block");
  assert.equal(result.stdout.includes(privatePath), false);
});

test("knowledge trigger stop guard CLI stays silent on continue", () => {
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
