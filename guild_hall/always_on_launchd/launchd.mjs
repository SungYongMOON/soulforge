import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const ALWAYS_ON_LAUNCHD_VERSION = "soulforge.always_on_launchd.v1";

const JOB_SPECS = [
  {
    id: "gateway.mail-fetch",
    label: "ai.soulforge.gateway.mail-fetch",
    kind: "interval",
    intervalSec: 300,
    command: "npm run guild-hall:gateway:fetch -- --once --json",
  },
  {
    id: "gateway.mail-healthcheck",
    label: "ai.soulforge.gateway.mail-healthcheck",
    kind: "interval",
    intervalSec: 300,
    command: "npm run guild-hall:gateway:fetch:healthcheck -- --json",
  },
  {
    id: "private-state.sync",
    label: "ai.soulforge.private-state-sync",
    kind: "interval",
    intervalSec: 600,
    command: "npm run guild-hall:private-state:sync -- --json",
  },
  {
    id: "town-crier",
    label: "ai.soulforge.town-crier",
    kind: "interval",
    intervalSec: 60,
    command: "npm run guild-hall:town-crier:run -- --limit 20",
  },
  {
    id: "healer-light",
    label: "ai.soulforge.healer.light",
    kind: "interval",
    intervalSec: 1800,
    command: "npm run guild-hall:healer:run -- --skip-validate --notify-on-failure --json",
  },
  {
    id: "healer-full",
    label: "ai.soulforge.healer.full",
    kind: "calendar",
    hour: 3,
    minute: 30,
    command: "npm run guild-hall:healer:run -- --notify-on-failure --json",
  },
];

export function defaultLaunchAgentsDir() {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

export function defaultRenderedDir(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "always_on_launchd");
}

export function defaultLogRoot() {
  return path.join(os.homedir(), "Library", "Logs", "Soulforge");
}

export function buildLaunchdDefinitions(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const shellPath = options.shellPath ?? "/bin/zsh";
  const logRoot = path.resolve(options.logRoot ?? defaultLogRoot());

  return JOB_SPECS.map((spec) => {
    const stdoutPath = path.join(logRoot, `${spec.label}.out.log`);
    const stderrPath = path.join(logRoot, `${spec.label}.err.log`);
    const script = `cd ${shellQuote(repoRoot)} && ${spec.command}`;
    return {
      ...spec,
      repoRoot,
      logRoot,
      stdoutPath,
      stderrPath,
      plistName: `${spec.label}.plist`,
      programArguments: [shellPath, "-lc", script],
    };
  });
}

export function renderPlist(definition) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    xmlKey("Label", xmlString(definition.label)),
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...definition.programArguments.map((arg) => `    <string>${xmlEscape(arg)}</string>`),
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
  ];

  if (definition.kind === "interval") {
    lines.push(xmlKey("StartInterval", xmlInteger(definition.intervalSec)));
  } else {
    lines.push("  <key>StartCalendarInterval</key>");
    lines.push("  <dict>");
    lines.push(xmlKey("Hour", xmlInteger(definition.hour), 4));
    lines.push(xmlKey("Minute", xmlInteger(definition.minute), 4));
    lines.push("  </dict>");
  }

  lines.push(xmlKey("StandardOutPath", xmlString(definition.stdoutPath)));
  lines.push(xmlKey("StandardErrorPath", xmlString(definition.stderrPath)));
  lines.push(xmlKey("ProcessType", xmlString("Background")));
  lines.push("</dict>");
  lines.push("</plist>");
  return `${lines.join("\n")}\n`;
}

export function renderLaunchdFiles(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = path.resolve(options.outputDir ?? defaultRenderedDir(repoRoot));
  const definitions = buildLaunchdDefinitions({ repoRoot, shellPath: options.shellPath, logRoot: options.logRoot });
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(definitions[0]?.logRoot ?? defaultLogRoot(), { recursive: true });

  const files = definitions.map((definition) => {
    const filePath = path.join(outputDir, definition.plistName);
    writeFileSync(filePath, renderPlist(definition), "utf8");
    return {
      label: definition.label,
      path: filePath,
      kind: definition.kind,
    };
  });

  return {
    schema_version: ALWAYS_ON_LAUNCHD_VERSION,
    repo_root: repoRoot,
    output_dir: outputDir,
    files,
  };
}

export function installLaunchdFiles(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = path.resolve(options.outputDir ?? defaultRenderedDir(repoRoot));
  const installDir = path.resolve(options.installDir ?? defaultLaunchAgentsDir());
  const rendered = renderLaunchdFiles({ repoRoot, outputDir, shellPath: options.shellPath, logRoot: options.logRoot });

  mkdirSync(installDir, { recursive: true });
  for (const file of rendered.files) {
    const target = path.join(installDir, path.basename(file.path));
    copyFileSync(file.path, target);
  }

  return {
    ...rendered,
    install_dir: installDir,
    installed: rendered.files.map((file) => path.join(installDir, path.basename(file.path))),
  };
}

export function verifyLaunchdInstall(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const installDir = path.resolve(options.installDir ?? defaultLaunchAgentsDir());
  const definitions = buildLaunchdDefinitions({ repoRoot, shellPath: options.shellPath, logRoot: options.logRoot });
  const launchctlCheck = options.checkLaunchctl === true ? readLaunchctlState() : null;

  const files = definitions.map((definition) => {
    const target = path.join(installDir, definition.plistName);
    return {
      label: definition.label,
      path: target,
      exists: existsSync(target),
      loaded: launchctlCheck ? launchctlCheck.loadedLabels.includes(definition.label) : null,
    };
  });

  return {
    schema_version: ALWAYS_ON_LAUNCHD_VERSION,
    repo_root: repoRoot,
    install_dir: installDir,
    files,
    launchctl_checked: Boolean(launchctlCheck),
  };
}

function readLaunchctlState() {
  const result = spawnSync("launchctl", ["list"], {
    encoding: "utf8",
    shell: false,
  });

  const stdout = result.stdout ?? "";
  const loadedLabels = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes("ai.soulforge"))
    .map((line) => line.split(/\s+/u).pop())
    .filter(Boolean);

  return {
    ok: result.status === 0,
    loadedLabels,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`;
}

function xmlKey(name, value, indent = 2) {
  const pad = " ".repeat(indent);
  return `${pad}<key>${xmlEscape(name)}</key>\n${pad}${value}`;
}

function xmlString(value) {
  return `<string>${xmlEscape(value)}</string>`;
}

function xmlInteger(value) {
  return `<integer>${String(value)}</integer>`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

export function listRenderedPlists(outputDir) {
  return readdirSync(outputDir).filter((name) => name.endsWith(".plist")).sort();
}
