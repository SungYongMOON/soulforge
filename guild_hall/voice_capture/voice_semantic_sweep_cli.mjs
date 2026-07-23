#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { runVoiceSemanticSweep } from "./voice_semantic_sweep.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

const voiceRoot = argument("--voice-root");
if (!voiceRoot) {
  console.error("usage: voice_semantic_sweep_cli.mjs --voice-root <path> [--apply] [--max-sessions <n>]");
  process.exit(2);
}

try {
  const result = await runVoiceSemanticSweep({
    repo_root: argument("--repo-root") ? path.resolve(argument("--repo-root")) : process.cwd(),
    voice_root: path.resolve(voiceRoot),
    apply: process.argv.includes("--apply"),
    max_sessions: Number(argument("--max-sessions") ?? 20),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed_session_count > 0) process.exitCode = 1;
} catch {
  console.error("voice_semantic_sweep_failed");
  process.exit(1);
}
