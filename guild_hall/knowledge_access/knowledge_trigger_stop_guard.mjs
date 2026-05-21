#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const KNOWLEDGE_TRIGGER_CLOSEOUT_RE =
  /^\s*(?:Knowledge trigger check:\s*(?:no_trigger|metadata_only_record|sourcebound_review_candidate|owner_decision_needed)\b|지식 트리거 확인:\s*(?:없음|메타데이터\s*기록|소스\s*기반\s*검토\s*후보|(?:책임자|오너)\s*판단\s*필요)(?=\s|$|[.,。]))/im;

const COMPLETION_MARKERS = [
  /(?:구현|수정|변경|적용|패치|검증|테스트|작업|반영|추가|보강).{0,16}(?:완료|했습니다|했습니다\.|통과|pass)/u,
  /(?:완료했습니다|적용했습니다|수정했습니다|구현했습니다|검증했습니다|통과했습니다)/u,
  /\b(?:implemented|updated|patched|changed|verified|validated|completed|done|passed)\b/i,
];

const BOUNDED_WORK_EVIDENCE = [
  /(?:npm run|git diff|git status|apply_patch|subagent|서브에이전트|검증|테스트|파일|패치|변경|구현|수정|적용)/iu,
  /\b(?:validation|test|tests|diff|status|modified|changed files?|implementation|patch|subagent)\b/i,
  /\[[^\]]+\]\([^)]*Soulforge\/[^)]*\)/u,
];

const BLOCK_REASON =
  "마지막 답변이 Soulforge bounded 작업 완료 보고처럼 보이지만 `지식 트리거 확인:` closeout line이 없습니다. 다음 한 줄만 출력하세요: `지식 트리거 확인: 없음`. 재사용 가능한 지식 신호가 없다면 파일을 만들지 마세요.";

export function hasKnowledgeTriggerCloseout(message) {
  return KNOWLEDGE_TRIGGER_CLOSEOUT_RE.test(String(message ?? ""));
}

export function isSoulforgeCwd(cwd) {
  const normalized = String(cwd ?? "").replaceAll("\\", "/");
  return normalized === "Soulforge" || normalized.endsWith("/Soulforge") || normalized.includes("/Soulforge/");
}

export function looksLikeBoundedTaskCompletion(message) {
  const text = String(message ?? "");
  if (!text.trim()) {
    return false;
  }
  return COMPLETION_MARKERS.some((pattern) => pattern.test(text))
    && BOUNDED_WORK_EVIDENCE.some((pattern) => pattern.test(text));
}

export function extractFinalAssistantMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  for (const key of ["last_assistant_message", "final_message", "assistant_message"]) {
    if (typeof payload[key] === "string") {
      return payload[key];
    }
  }

  return "";
}

export function evaluateKnowledgeTriggerStopGuard(payload) {
  const cwd = payload?.cwd ?? process.cwd();
  const message = extractFinalAssistantMessage(payload);

  if (!isSoulforgeCwd(cwd) || hasKnowledgeTriggerCloseout(message) || !looksLikeBoundedTaskCompletion(message)) {
    return {
      decision: "continue",
      shouldBlock: false,
    };
  }

  return {
    decision: "block",
    shouldBlock: true,
    reason: BLOCK_REASON,
  };
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const raw = readStdin().trim();
  if (!raw) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const result = evaluateKnowledgeTriggerStopGuard(payload);
  if (result.shouldBlock) {
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: result.reason })}\n`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
