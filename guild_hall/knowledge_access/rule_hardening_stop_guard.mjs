#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

export function extractRuleHardeningCloseoutBlock(message) {
  const text = String(message ?? "");
  const match = RULE_HARDENING_CLOSEOUT_RE.exec(text);
  if (!match) {
    return "";
  }
  return text.slice(match.index).trim().slice(0, 4000);
}

function sanitizeCandidateLine(line) {
  return String(line ?? "")
    .replace(/^[\s\-*]+/, "")
    .replace(/\b[A-Za-z]:[\\/][^\s)]+/g, "<local_path>")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function extractRuleHardeningCandidates(message) {
  const block = extractRuleHardeningCloseoutBlock(message);
  if (!block) {
    return [];
  }

  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map(sanitizeCandidateLine)
    .filter((line) => line && !/(?:새\s*규칙\s*후보\s*:\s*없음|new rule candidates?\s*:\s*none|no new candidates?|없음)$/i.test(line));
}

function sha256(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function firstPresent(payload, keys) {
  for (const key of keys) {
    if (typeof payload?.[key] === "string" && payload[key].trim()) {
      return payload[key].trim();
    }
  }
  return null;
}

function extractProjectCodes(text) {
  return [...new Set(String(text ?? "").match(/\bP\d{2}-\d{3}(?:_INBOX)?\b/g) ?? [])].slice(0, 20);
}

function extractTaskHint(message) {
  const text = String(message ?? "");
  const block = extractRuleHardeningCloseoutBlock(text);
  const beforeCloseout = block ? text.slice(0, text.lastIndexOf(block)).trim() : text.trim();
  const lines = beforeCloseout
    .split(/\r?\n/)
    .map((line) => sanitizeCandidateLine(line))
    .filter(Boolean)
    .filter((line) => !/^[-*]\s+/.test(line));
  return (lines.at(-1) ?? lines[0] ?? "").slice(0, 300) || null;
}

export function buildConversationContextMetadata(payload) {
  const message = extractFinalAssistantMessage(payload);
  return {
    thread_id: firstPresent(payload, ["thread_id", "threadId", "conversation_id", "conversationId"]),
    run_id: firstPresent(payload, ["run_id", "runId", "hook_run_id", "hookRunId"]),
    session_id: firstPresent(payload, ["session_id", "sessionId"]),
    cwd: payload?.cwd ?? process.cwd(),
    project_codes: extractProjectCodes(message),
    task_hint: extractTaskHint(message),
    final_message_hash: sha256(message),
  };
}

function soulforgeRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function monthPathParts(now) {
  const year = String(now.getFullYear());
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { year, month };
}

export function buildRuleHardeningLedgerEntry(payload, candidates, now = new Date()) {
  const closeoutBlock = extractRuleHardeningCloseoutBlock(extractFinalAssistantMessage(payload));
  const closeoutHash = sha256(closeoutBlock);
  const context = buildConversationContextMetadata(payload);
  return {
    schema_version: "soulforge.rule_hardening_candidate.v1",
    entry_id: `rule_hardening:${now.toISOString()}:${closeoutHash.slice(0, 12)}`,
    occurred_at: now.toISOString(),
    source: "codex_stop_hook",
    status: "candidate_recorded",
    cwd: context.cwd,
    hook_event_name: payload?.hook_event_name ?? "Stop",
    conversation_context: context,
    closeout_hash: closeoutHash,
    candidate_count: candidates.length,
    candidates,
    boundary:
      "Derived only from the final rule-hardening closeout block; no raw transcript, mail body, raw source payload, attachment payload, or secret is stored.",
  };
}

export function recordRuleHardeningCandidates(payload, options = {}) {
  const cwd = payload?.cwd ?? process.cwd();
  const message = extractFinalAssistantMessage(payload);
  if (!isSoulforgeCwd(cwd) || !hasRuleHardeningCloseout(message)) {
    return { recorded: false, reason: "not_applicable" };
  }

  const candidates = extractRuleHardeningCandidates(message);
  if (candidates.length === 0) {
    return { recorded: false, reason: "no_candidates" };
  }

  const root = options.soulforgeRoot ?? soulforgeRootFromScript();
  const privateStateRoot = path.join(root, "private-state");
  if (!existsSync(privateStateRoot) && !options.ledgerRoot) {
    return { recorded: false, reason: "private_state_missing" };
  }

  const now = options.now ?? new Date();
  const entry = buildRuleHardeningLedgerEntry(payload, candidates, now);
  const ledgerRoot =
    options.ledgerRoot ??
    path.join(privateStateRoot, "guild_hall", "state", "operations", "soulforge_activity", "rule_hardening_candidates");
  const { year, month } = monthPathParts(now);
  const ledgerDir = path.join(ledgerRoot, year);
  const ledgerPath = path.join(ledgerDir, `${month}.jsonl`);

  if (existsSync(ledgerPath) && readFileSync(ledgerPath, "utf8").includes(`"closeout_hash":"${entry.closeout_hash}"`)) {
    return { recorded: false, reason: "duplicate", ledgerPath, entry };
  }

  mkdirSync(ledgerDir, { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
  return { recorded: true, ledgerPath, entry };
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
    return;
  }

  try {
    recordRuleHardeningCandidates(payload);
  } catch {
    // Stop hooks should not block a completed turn because candidate recording failed.
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
