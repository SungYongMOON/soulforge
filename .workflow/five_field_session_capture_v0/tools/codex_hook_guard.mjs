#!/usr/bin/env node
// codex_hook_guard.mjs - Codex lifecycle hook adapter for five-field capture.
// Standard Node only. Reads hook metadata from stdin; never reads transcripts,
// secrets, raw source documents, or command output bodies.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = resolve(HERE, "..", "..", "..");
const CAPTURE = join(HERE, "five_field_capture.mjs");
const PENDING_DIR = join(tmpdir(), "codex-five-field");

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

function readStdinJson() {
  try {
    const text = readFileSync(0, "utf8").replace(/^\uFEFF/, "");
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function sanitizeRef(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120);
}

function outputJson(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sessionRef(input, args) {
  return sanitizeRef(
    args["session-ref"] ??
    process.env.CODEX_HOOK_SESSION_REF ??
    input.session_id ??
    input.sessionId ??
    input.thread_id ??
    input.threadId ??
    input.conversation_id ??
    input.conversationId,
  );
}

function turnRef(input) {
  return sanitizeRef(input.turn_id ?? input.turnId ?? "");
}

function pendingPath(ref) {
  return join(PENDING_DIR, encodeURIComponent(ref));
}

function blockedPath(ref) {
  return join(PENDING_DIR, encodeURIComponent(ref) + ".blocked");
}

function repoRoot(args) {
  return resolve(args["repo-root"] ?? process.env.SOULFORGE_ROOT ?? DEFAULT_REPO);
}

function normalizePath(value) {
  return resolve(String(value ?? ".")).toLowerCase();
}

function isInsideSoulforge(input, root) {
  const cwd = normalizePath(input.cwd ?? process.cwd());
  const base = normalizePath(root);
  return cwd === base || cwd.startsWith(base + "\\") || cwd.startsWith(base + "/");
}

function commandText(input) {
  const candidates = [
    input.tool_input?.command,
    input.toolInput?.command,
    input.input?.tool_input?.command,
    input.input?.command,
    input.params?.tool_input?.command,
    input.params?.command,
    input.command,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

function commandHasGitCommit(command) {
  for (const segment of String(command ?? "").split(/[\r\n;&|]+/)) {
    const tokens = shellTokens(segment);
    for (let i = 0; i < tokens.length; i++) {
      if (!/^(?:.*[\\/])?git(?:\.exe)?$/i.test(tokens[i])) continue;
      for (let j = i + 1; j < tokens.length; j++) {
        const token = tokens[j];
        if (token === "--") continue;
        if (isGitOptionWithValue(token) && j + 1 < tokens.length) { j++; continue; }
        if (isInlineGitOptionWithValue(token) || token.startsWith("-")) continue;
        if (token === "commit") return true;
        break;
      }
    }
  }
  return false;
}

function shellTokens(segment) {
  return (segment.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) ?? [])
    .map((token) => token.replace(/^(['"])(.*)\1$/, "$2"));
}

function isGitOptionWithValue(token) {
  return ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(token);
}

function isInlineGitOptionWithValue(token) {
  return /^-c\S+/.test(token) ||
    /^--(?:git-dir|work-tree|namespace)=/.test(token);
}

function headCommit(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0) return null;
  return String(result.stdout ?? "").trim().slice(0, 64) || null;
}

function markPending(ref, input, root) {
  mkdirSync(PENDING_DIR, { recursive: true });
  const current = existsSync(pendingPath(ref))
    ? safeJson(readFileSync(pendingPath(ref), "utf8"))
    : {};
  const commits = Array.isArray(current.commits) ? current.commits : [];
  const commit = headCommit(root);
  const pointer = commit ? `git:${commit}` : "git:HEAD";
  if (!commits.includes(pointer)) commits.push(pointer);
  writeFileSync(pendingPath(ref), JSON.stringify({
    session_ref: ref,
    turn_ref: turnRef(input),
    cwd: input.cwd ?? null,
    marked_at: new Date().toISOString(),
    commits: commits.slice(-12),
  }), "utf8");
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

function checkRecorded(ref, root) {
  return spawnSync(process.execPath, [CAPTURE, "--check", "--session-ref", ref, "--repo-root", root], {
    encoding: "utf8",
    timeout: 15000,
  });
}

function reminder(ref) {
  return `5필드 기록 후 종료하세요. 이 세션에서 git commit 이 있었지만 _workmeta 레저에 session_ref=${ref} 기록이 없습니다.\n` +
    `node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs --project <과제코드|system> --session-ref ${ref} --worker <도구_모델> --request-kind <행위/출처 슬러그> --json '{"input_refs":[...],"judgment":"...","output":"...","verification":"...","stop_conditions":[...]}'\n` +
    `원문/secret 복사 금지, commit/path 포인터만 남기면 됩니다.`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mark ? "--mark" : args.guard ? "--guard" : args._[0] ?? process.argv[2];
  const input = readStdinJson();
  const ref = sessionRef(input, args);
  if (!ref) process.exit(0);

  const root = repoRoot(args);
  if (!isInsideSoulforge(input, root)) process.exit(0);

  if (mode === "--mark") {
    if (!commandHasGitCommit(commandText(input))) process.exit(0);
    try { markPending(ref, input, root); } catch { /* quiet: hook must not add noise */ }
    process.exit(0);
  }

  if (mode === "--guard") {
    if (!existsSync(pendingPath(ref))) process.exit(0);
    const check = checkRecorded(ref, root);
    if (check.status === 0) {
      try {
        rmSync(pendingPath(ref), { force: true });
        rmSync(blockedPath(ref), { force: true });
      } catch { /* noop */ }
      process.exit(0);
    }

    if (input.stop_hook_active || existsSync(blockedPath(ref))) {
      try {
        rmSync(pendingPath(ref), { force: true });
        rmSync(blockedPath(ref), { force: true });
      } catch { /* noop */ }
      outputJson({ systemMessage: `5필드 기록 없이 종료됩니다. 소급 대상: session_ref=${ref}` });
      process.exit(0);
    }

    try { writeFileSync(blockedPath(ref), new Date().toISOString(), "utf8"); } catch { /* noop */ }
    outputJson({
      decision: "block",
      reason: reminder(ref),
    });
    process.exit(0);
  }

  process.exit(0);
}

main();
