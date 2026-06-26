#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  buildPlanPreview,
  buildSessionPlan,
  runCaptureSession,
  validateSessionDir,
} from "./voice_capture.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "plan") {
    const plan = buildSessionPlan(argsToOptions(args));
    process.stdout.write(`${JSON.stringify(buildPlanPreview(plan), null, 2)}\n`);
    return;
  }

  if (command === "run") {
    const result = await runCaptureSession(argsToOptions(args));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "validate-session") {
    const sessionDir = args["session-dir"];
    if (!sessionDir) {
      throw new Error("validate-session requires --session-dir <path>");
    }
    const result = await validateSessionDir(path.resolve(sessionDir));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  printUsageAndExit();
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function argsToOptions(args) {
  return {
    repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
    workspaceRoot: args["workspace-root"],
    sessionId: args["session-id"],
    label: args.label,
    chunkSeconds: args["chunk-seconds"],
    maxChunks: args["max-chunks"],
    untilStopped: Boolean(args["until-stopped"]),
    language: args.language,
    recordCmd: args["record-cmd"],
    asrCmd: args["asr-cmd"],
    termsPrompt: args["terms-prompt"],
    dryRun: Boolean(args["dry-run"]),
  };
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/voice_capture/cli.mjs plan [options]",
      "  node guild_hall/voice_capture/cli.mjs run --record-cmd <template> [--asr-cmd <template>] [options]",
      "  node guild_hall/voice_capture/cli.mjs validate-session --session-dir <path>",
      "",
      "Options:",
      "  --label <text>             Human label used in the session id",
      "  --workspace-root <path>    Default: _workspaces/system/voice_capture/sessions",
      "  --chunk-seconds <n>        Default: 120",
      "  --max-chunks <n>           Default: 1 unless --until-stopped is set",
      "  --until-stopped            Keep recording chunks until interrupted",
      "  --language <code>          Default: ko",
      "  --terms-prompt <text>      Domain terms passed to {terms_prompt}",
      "  --dry-run                  Print the plan without creating files or running commands",
      "",
      "Template placeholders:",
      "  {audio} {duration} {output_base} {transcript_json} {transcript_txt} {transcript_srt}",
      "  {language} {terms_prompt} {prompt_file} {session_dir} {session_id} {chunk_index}",
      "",
      "macOS example:",
      "  npm run guild-hall:voice-capture -- run --until-stopped --chunk-seconds 60 \\",
      "    --record-cmd 'ffmpeg -f avfoundation -i :0 -t {duration} -ar 16000 -ac 1 {audio}' \\",
      "    --asr-cmd 'whisper-cli -m /models/ggml-large-v3-turbo.bin -f {audio} -l {language} -otxt -osrt -oj -of {output_base}'",
    ].join("\n"),
  );
  process.stderr.write("\n");
  process.exit(1);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`voice-capture fatal: ${detail}\n`);
  process.exitCode = 2;
});
