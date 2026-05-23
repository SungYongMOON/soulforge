import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeRepoPath } from "../shared/io.mjs";

export const CODEX_BRIDGE_SCHEMA_VERSION = "soulforge.codex_account_bridge.v0";

const DEFAULT_CODEX_COMMAND = "codex";
const DEFAULT_OUTPUT_REF = "guild_hall/state/tools/codex_bridge/last_response.md";

export function buildCodexExecArgs(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sandbox = options.sandbox ?? "read-only";
  const approval = options.approval ?? "never";
  const args = [
    "--ask-for-approval",
    approval,
    "exec",
    "--ephemeral",
    "--sandbox",
    sandbox,
    "--cd",
    repoRoot,
  ];

  if (options.model) {
    args.push("--model", String(options.model));
  }
  if (options.profile) {
    args.push("--profile", String(options.profile));
  }
  if (options.outputLastMessage) {
    args.push("--output-last-message", safeRepoRelativeOutput(options.outputLastMessage, repoRoot));
  }
  if (options.jsonEvents) {
    args.push("--json");
  }

  args.push("-");
  return args;
}

export function buildCodexBridgePrompt(options = {}) {
  const prompt = String(options.prompt ?? "").trim();
  if (!prompt) {
    throw new Error("codex bridge requires --prompt");
  }
  const mode = options.mode ?? "analysis";
  const context = options.context ? `\n\nContext:\n${String(options.context).trim()}` : "";
  return [
    "You are running as a bounded Soulforge Codex account bridge.",
    "Answer in Korean unless the user explicitly asks otherwise.",
    "Use only the prompt and repo-visible context available in this read-only Codex exec run.",
    "Do not claim source truth, owner approval, ontology acceptance, canon promotion, or completed implementation unless the prompt provides direct evidence.",
    "Do not request or expose secrets, tokens, cookies, session files, or credential contents.",
    `Bridge mode: ${mode}`,
    "",
    "User prompt:",
    prompt,
    context,
  ].join("\n");
}

export function getCodexBridgeStatus(options = {}) {
  const command = options.command ?? DEFAULT_CODEX_COMMAND;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const version = spawnSyncImpl(command, ["--version"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const login = spawnSyncImpl(command, ["login", "status"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  return {
    schema_version: CODEX_BRIDGE_SCHEMA_VERSION,
    command,
    command_available: version.status === 0,
    version: normalizeOutput(version.stdout),
    login_status: normalizeOutput(login.stdout || login.stderr),
    logged_in_with_chatgpt: /Logged in using ChatGPT/i.test(login.stdout || login.stderr || ""),
    boundary: bridgeBoundary(),
  };
}

export async function runCodexBridgeAsk(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const command = options.command ?? DEFAULT_CODEX_COMMAND;
  const outputRef = normalizeRepoPath(options.outputRef ?? DEFAULT_OUTPUT_REF);
  const outputPath = path.join(repoRoot, safeRepoRelativeOutput(outputRef, repoRoot));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const prompt = buildCodexBridgePrompt({
    prompt: options.prompt,
    context: options.context,
    mode: options.mode,
  });
  const args = buildCodexExecArgs({
    repoRoot,
    model: options.model,
    profile: options.profile,
    outputLastMessage: outputRef,
    sandbox: "read-only",
    approval: "never",
    jsonEvents: options.jsonEvents,
  });

  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    input: prompt,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  let responseText = "";
  try {
    responseText = await fs.readFile(outputPath, "utf8");
  } catch {
    responseText = normalizeOutput(result.stdout);
  }

  return {
    schema_version: CODEX_BRIDGE_SCHEMA_VERSION,
    kind: "codex_account_bridge_response",
    status: result.status === 0 ? "completed" : "failed",
    started_at_utc: startedAt,
    completed_at_utc: new Date().toISOString(),
    command_surface: "codex exec",
    login_surface: "ChatGPT login when available",
    output_ref: outputRef,
    boundary: bridgeBoundary(),
    process: {
      exit_status: result.status,
      stderr_summary: summarizeCodexStderr(result.stderr),
    },
    response: {
      text: responseText.trim(),
    },
  };
}

function bridgeBoundary() {
  return {
    uses_codex_cli: true,
    uses_existing_codex_login_when_available: true,
    no_api_key_required_by_bridge: true,
    auth_file_not_read_by_bridge: true,
    default_sandbox: "read-only",
    default_ephemeral_session: true,
    not_a_low_latency_model_api: true,
    not_source_truth: true,
    not_owner_approval: true,
    not_canon_or_ontology_mutation: true,
  };
}

function normalizeOutput(value) {
  return String(value ?? "").trim();
}

function summarizeCodexStderr(value) {
  const text = normalizeOutput(value);
  const lines = text.split(/\r?\n/).filter(Boolean);
  return {
    omitted_raw_stderr: Boolean(text),
    error: lines.find((line) => line.toLowerCase().startsWith("error:")) ?? "",
    warning_count: lines.filter((line) => /\bwarn\b/i.test(line)).length,
  };
}

function safeRepoRelativeOutput(value, repoRoot) {
  const raw = String(value ?? "");
  if (path.isAbsolute(raw)) {
    throw new Error("codex bridge output path must be repo-relative");
  }
  const normalized = normalizeRepoPath(path.normalize(raw));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("codex bridge output path must stay inside the repo");
  }
  const absolute = path.resolve(repoRoot, normalized);
  const relative = path.relative(repoRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error("codex bridge output path must stay inside the repo");
  }
  return normalized;
}
