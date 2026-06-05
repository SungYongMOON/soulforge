#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const specPath = path.join(repoRoot, "guild_hall", "dev_worker", "automations", "soulforge-dev-worker.spec.json");
const CHECK_FIELDS = ["id", "prompt", "cwds", "execution_environment"];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
      continue;
    }
    args[key] = "true";
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return path.resolve(value);
}

function tomlString(value) {
  return JSON.stringify(value);
}

function promptHash(value) {
  if (typeof value !== "string") {
    return null;
  }
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function renderPrompt(template, replacements) {
  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

function resolveOutputPath(args, spec) {
  if (args.output) {
    return path.resolve(args.output);
  }
  if (args.install === "true") {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    return path.join(codexHome, "automations", spec.id, "automation.toml");
  }
  return null;
}

function stripTomlComment(value) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function splitTomlArrayItems(value) {
  const items = [];
  let start = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ",") {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  const finalItem = value.slice(start).trim();
  if (finalItem) {
    items.push(finalItem);
  }
  return items;
}

function parseTomlValue(value) {
  const trimmed = stripTomlComment(value).trim();
  if (trimmed.startsWith('"')) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'")) {
      throw new Error("Invalid TOML value");
    }
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[")) {
    if (!trimmed.endsWith("]")) {
      throw new Error("Invalid TOML array");
    }
    const body = trimmed.slice(1, -1).trim();
    if (!body) {
      return [];
    }
    return splitTomlArrayItems(body).map((item) => parseTomlValue(item));
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
    return Number(trimmed);
  }
  throw new Error("Invalid TOML value");
}

function parseAutomationToml(toml) {
  const parsed = {};
  for (const line of toml.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!CHECK_FIELDS.includes(key)) {
      continue;
    }
    parsed[key] = parseTomlValue(trimmed.slice(separatorIndex + 1));
  }
  return parsed;
}

function compareAutomation({ automationFile, spec, expectedPrompt, localRoot, executionEnvironment }) {
  if (!fs.existsSync(automationFile)) {
    return {
      status: "missing",
      checked: CHECK_FIELDS,
      mismatches: ["automation_file"],
      prompt_sha256: {
        expected: promptHash(expectedPrompt),
        actual: null,
      },
    };
  }

  let parsed;
  try {
    parsed = parseAutomationToml(fs.readFileSync(automationFile, "utf8"));
  } catch {
    return {
      status: "invalid",
      checked: CHECK_FIELDS,
      mismatches: ["automation_toml"],
      prompt_sha256: {
        expected: promptHash(expectedPrompt),
        actual: null,
      },
    };
  }

  const mismatches = [];
  if (parsed.id !== spec.id) {
    mismatches.push("id");
  }
  if (parsed.prompt !== expectedPrompt) {
    mismatches.push("prompt");
  }
  if (!Array.isArray(parsed.cwds) || parsed.cwds.length !== 1 || parsed.cwds[0] !== localRoot) {
    mismatches.push("cwds");
  }
  if (parsed.execution_environment !== executionEnvironment) {
    mismatches.push("execution_environment");
  }

  return {
    status: mismatches.length > 0 ? "stale" : "current",
    checked: CHECK_FIELDS,
    mismatches,
    prompt_sha256: {
      expected: promptHash(expectedPrompt),
      actual: promptHash(parsed.prompt),
    },
  };
}

function formatCheckText(result) {
  if (result.status === "current") {
    return `current: ${result.checked.join(",")}\n`;
  }
  const promptHashText = result.mismatches.includes("prompt")
    ? ` expected_prompt_sha256=${result.prompt_sha256.expected} actual_prompt_sha256=${result.prompt_sha256.actual ?? "missing"}`
    : "";
  return `${result.status}: ${result.mismatches.join(",")}${promptHashText}\n`;
}

function writeCheckResult(result, args) {
  if (args.json === "true") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatCheckText(result));
  }
  process.exitCode = result.status === "current" ? 0 : 1;
}

function renderToml(spec, prompt, args) {
  const now = Date.now();
  const localRoot = requireArg(args, "local-root");
  const status = args.status || spec.default_status;
  const rrule = args.rrule || spec.default_rrule;
  const executionEnvironment = args["execution-environment"] || spec.default_execution_environment;

  return `${[
    "version = 1",
    `id = ${tomlString(spec.id)}`,
    `name = ${tomlString(spec.name)}`,
    `prompt = ${tomlString(prompt)}`,
    `status = ${tomlString(status)}`,
    `rrule = ${tomlString(rrule)}`,
    `execution_environment = ${tomlString(executionEnvironment)}`,
    `model = ${tomlString(spec.model)}`,
    `reasoning_effort = ${tomlString(spec.reasoning_effort)}`,
    `cwds = [${tomlString(localRoot)}]`,
    `created_at = ${now}`,
    `updated_at = ${now}`,
  ].join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const promptTemplatePath = path.join(repoRoot, spec.prompt_template);
  const promptTemplate = fs.readFileSync(promptTemplatePath, "utf8").trim();

  const localRoot = requireArg(args, "local-root");
  const workmetaRoot = args["workmeta-root"] ? path.resolve(args["workmeta-root"]) : path.join(localRoot, "_workmeta");
  const privateStateRoot = args["private-state-root"]
    ? path.resolve(args["private-state-root"])
    : path.join(localRoot, "private-state");
  const activityRoot = args["activity-root"]
    ? path.resolve(args["activity-root"])
    : path.join(localRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const outputPath = resolveOutputPath(args, spec);

  const prompt = renderPrompt(promptTemplate, {
    LOCAL_SOULFORGE_ROOT: localRoot,
    LOCAL_ACTIVITY_ROOT: activityRoot,
    LOCAL_WORKMETA_ROOT: workmetaRoot,
    LOCAL_PRIVATE_STATE_ROOT: privateStateRoot,
  });

  if (args.check === "true") {
    const automationFile = requireArg(args, "automation-file");
    writeCheckResult(
      compareAutomation({
        automationFile,
        spec,
        expectedPrompt: prompt,
        localRoot,
        executionEnvironment: args["execution-environment"] || spec.default_execution_environment,
      }),
      args,
    );
    return;
  }

  const toml = renderToml(spec, prompt, args);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, toml, "utf8");
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  process.stdout.write(toml);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
