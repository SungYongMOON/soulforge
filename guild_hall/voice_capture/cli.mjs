#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  buildMacosCommandTemplates,
  buildPlanPreview,
  buildPreflightReport,
  buildSessionPlan,
  buildSessionStatus,
  loadVoiceCaptureProfile,
  profileToSessionOptions,
  runCaptureSession,
  validateSessionDir,
  writeVoiceCaptureLaunchdPlist,
  writeVoiceCaptureProfile,
  writeRecordingLibraryEntry,
  writeWorkmetaDraft,
} from "./voice_capture.mjs";
import {
  acknowledgeDelivery,
  deliveryExitCode,
  getDeliveryStatus,
  prepareDeliveryReceipt,
} from "./delivery_receipt.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "init-config") {
    const result = await writeVoiceCaptureProfile(argsToProfileOptions(args));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "macos-commands") {
    const result = buildMacosCommandTemplates({
      modelPath: args["model-path"],
      inputDevice: args["input-device"],
      recorder: args.recorder,
      asrBinary: args["asr-binary"],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "preflight") {
    const { options, profile } = await loadProfileAndSessionOptions(args);
    const report = buildPreflightReport({
      ...options,
      modelPath: args["model-path"] ?? profile?.model_path,
      skipToolCheck: flagValue(args, "skip-tool-check") ?? false,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ready) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "plan") {
    const { options } = await loadProfileAndSessionOptions(args);
    const plan = buildSessionPlan(options);
    process.stdout.write(`${JSON.stringify(buildPlanPreview(plan), null, 2)}\n`);
    return;
  }

  if (command === "run") {
    const { options } = await loadProfileAndSessionOptions(args);
    const result = await runCaptureSession(options);
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

  if (command === "status") {
    const sessionDir = args["session-dir"];
    if (!sessionDir) {
      throw new Error("status requires --session-dir <path>");
    }
    const result = await buildSessionStatus(path.resolve(sessionDir));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "render-launchd") {
    const result = await writeVoiceCaptureLaunchdPlist({
      repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
      configPath: args.config,
      outputDir: args["output-dir"],
      label: args.label,
      shellPath: args["shell-path"],
      logRoot: args["log-root"],
      keepAlive: flagValue(args, "keep-alive") ?? true,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "write-workmeta-draft") {
    const sessionDir = args["session-dir"];
    if (!sessionDir) {
      throw new Error("write-workmeta-draft requires --session-dir <path>");
    }
    const result = await writeWorkmetaDraft({
      repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
      workmetaRoot: args["workmeta-root"],
      projectCode: args["project-code"],
      sessionDir,
      apply: flagValue(args, "apply") ?? false,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "register-library") {
    const sessionDir = args["session-dir"];
    if (!sessionDir) {
      throw new Error("register-library requires --session-dir <path>");
    }
    const result = await writeRecordingLibraryEntry({
      repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
      libraryRoot: args["library-root"],
      sessionDir,
      recordingId: args["recording-id"],
      projectCode: args["project-code"],
      routeStatus: args["route-status"],
      meetingType: args["meeting-type"],
      meetingLabelKo: args["meeting-label-ko"],
      apply: flagValue(args, "apply") ?? false,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "prepare-delivery") {
    const result = await prepareDeliveryReceipt({
      repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
      sessionDir: args["session-dir"],
      recordingId: args["recording-id"],
      stage: args.stage,
      producerNode: args["producer-node"],
      apply: flagValue(args, "apply") ?? false,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = deliveryExitCode(result);
    return;
  }

  if (command === "ack-delivery") {
    const result = await acknowledgeDelivery({
      repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
      sessionId: args["session-id"],
      consumerNode: args["consumer-node"],
      apply: flagValue(args, "apply") ?? false,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = deliveryExitCode(result);
    return;
  }

  if (command === "delivery-status") {
    const result = await getDeliveryStatus({
      repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
      sessionId: args["session-id"],
      consumerNode: args["consumer-node"],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = deliveryExitCode(result);
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
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      flags[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
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

async function loadProfileAndSessionOptions(args) {
  const repoRoot = args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd();
  const cliOptions = argsToOptions(args, repoRoot);
  if (!args.config) {
    return {
      options: cliOptions,
      profile: null,
    };
  }
  const loaded = await loadVoiceCaptureProfile(args.config, { repoRoot });
  return {
    options: profileToSessionOptions(loaded.profile, cliOptions),
    profile: loaded.profile,
  };
}

function argsToOptions(args) {
  return {
    repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
    workspaceRoot: args["workspace-root"],
    sessionId: args["session-id"],
    label: args.label,
    chunkSeconds: args["chunk-seconds"],
    maxChunks: args["max-chunks"],
    untilStopped: flagValue(args, "until-stopped"),
    language: args.language,
    recordCmd: args["record-cmd"],
    asrCmd: args["asr-cmd"],
    termsPrompt: args["terms-prompt"],
    dryRun: flagValue(args, "dry-run"),
  };
}

function argsToProfileOptions(args) {
  return {
    repoRoot: args["repo-root"] ? path.resolve(args["repo-root"]) : process.cwd(),
    configPath: args.config,
    force: flagValue(args, "force") ?? false,
    profileName: args["profile-name"],
    label: args.label,
    workspaceRoot: args["workspace-root"],
    chunkSeconds: args["chunk-seconds"],
    untilStopped: flagValue(args, "until-stopped"),
    maxChunks: args["max-chunks"],
    language: args.language,
    termsPrompt: args["terms-prompt"],
    modelPath: args["model-path"],
    inputDevice: args["input-device"],
    recorder: args.recorder,
    asrBinary: args["asr-binary"],
  };
}

function flagValue(args, key) {
  if (!(key in args)) {
    return undefined;
  }
  if (args[key] === true) {
    return true;
  }
  return !["0", "false", "no", "off"].includes(String(args[key]).toLowerCase());
}

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage:",
      "  node guild_hall/voice_capture/cli.mjs init-config [--config <path>] [--model-path <path>] [--force]",
      "  node guild_hall/voice_capture/cli.mjs preflight [--config <path>]",
      "  node guild_hall/voice_capture/cli.mjs plan [options]",
      "  node guild_hall/voice_capture/cli.mjs run --config <path>",
      "  node guild_hall/voice_capture/cli.mjs run --record-cmd <template> [--asr-cmd <template>] [options]",
      "  node guild_hall/voice_capture/cli.mjs status --session-dir <path>",
      "  node guild_hall/voice_capture/cli.mjs validate-session --session-dir <path>",
      "  node guild_hall/voice_capture/cli.mjs render-launchd --config <path>",
      "  node guild_hall/voice_capture/cli.mjs write-workmeta-draft --session-dir <path> [--apply]",
      "  node guild_hall/voice_capture/cli.mjs register-library --session-dir <path> [--project-code <code>] [--apply]",
      "  node guild_hall/voice_capture/cli.mjs prepare-delivery --session-dir <path> --stage <plaud_import_ready|local_asr_ready> --producer-node <safe-id> [--apply] [--json]",
      "  node guild_hall/voice_capture/cli.mjs ack-delivery --session-id <id> --consumer-node <safe-id> [--apply] [--json]",
      "  node guild_hall/voice_capture/cli.mjs delivery-status --session-id <id> --consumer-node <safe-id> [--json]",
      "",
      "Options:",
      "  --config <path>           JSON profile under _workspaces/system/voice_capture/config",
      "  --label <text>             Human label used in the session id",
      "  --workspace-root <path>    Default: _workspaces/system/voice_capture/sessions",
      "  --chunk-seconds <n>        Default: 120",
      "  --max-chunks <n>           Default: 1 unless --until-stopped is set",
      "  --until-stopped            Keep recording chunks until interrupted",
      "  --language <code>          Default: ko",
      "  --terms-prompt <text>      Domain terms passed to {terms_prompt}",
      "  --dry-run                  Print the plan without creating files or running commands",
      "  --apply                    Write delivery receipt or acknowledgement; delivery commands otherwise dry-run",
      "  --json                     Explicit JSON output (delivery commands always emit JSON)",
      "",
      "Template placeholders:",
      "  {audio} {duration} {output_base} {transcript_json} {transcript_txt} {transcript_srt}",
      "  {language} {terms_prompt} {prompt_file} {session_dir} {session_id} {chunk_index}",
      "",
      "macOS example:",
      "  npm run guild-hall:voice-capture -- init-config --model-path /models/ggml-large-v3-turbo.bin",
      "  npm run guild-hall:voice-capture -- preflight --config _workspaces/system/voice_capture/config/voice_capture.profile.json",
      "  npm run guild-hall:voice-capture -- run --config _workspaces/system/voice_capture/config/voice_capture.profile.json",
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
