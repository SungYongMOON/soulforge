#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const RULE_HARDENING_CLOSEOUT_RE = /^\s*(?:규칙\s*강화\s*체크:|Rule hardening check:)/im;

const COMPLETION_MARKERS = [
  /(?:구현|수정|변경|적용|패치|검증|테스트|작업|반영|추가|보강|설정|셋업|전송|작성).{0,16}(?:완료|했습니다|통과|pass)/u,
  /(?:완료했습니다|적용했습니다|수정했습니다|구현했습니다|검증했습니다|통과했습니다|설정했습니다|셋업했습니다)/u,
  /\b(?:implemented|updated|patched|changed|verified|validated|completed|done|passed|configured|set up)\b/i,
];

const BOUNDED_WORK_EVIDENCE = [
  /(?:npm run|git diff|git status|apply_patch|subagent|서브에이전트|검증|테스트|파일|패치|변경|구현|수정|적용|설정|셋업|훅|hook|스킬|skill)/iu,
  /\b(?:validation|test|tests|diff|status|modified|changed files?|implementation|patch|subagent|hook|skill)\b/i,
  /\[[^\]]+\]\([^)]*Soulforge\/[^)]*\)/u,
];

const BLOCK_REASON =
  "마지막 답변이 Soulforge bounded 작업 완료 보고처럼 보이지만 `규칙 강화 체크:` closeout line이 없습니다. conversation-rule-hardening을 실행해 최종 답변에 `규칙 강화 체크:` 블록을 추가하세요. 새 규칙 후보가 없으면 `- 새 규칙 후보: 없음`으로 닫으세요.";

export function hasRuleHardeningCloseout(message) {
  return RULE_HARDENING_CLOSEOUT_RE.test(String(message ?? ""));
}

export function isSoulforgeCwd(cwd) {
  const normalized = String(cwd ?? "").replaceAll("\\", "/").toLowerCase();
  return normalized === "soulforge" || normalized.endsWith("/soulforge") || normalized.includes("/soulforge/");
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

export function evaluateRuleHardeningStopGuard(payload) {
  const cwd = payload?.cwd ?? process.cwd();
  const message = extractFinalAssistantMessage(payload);

  if (!isSoulforgeCwd(cwd) || hasRuleHardeningCloseout(message) || !looksLikeBoundedTaskCompletion(message)) {
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

  const result = evaluateRuleHardeningStopGuard(payload);
  if (result.shouldBlock) {
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: result.reason })}\n`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
