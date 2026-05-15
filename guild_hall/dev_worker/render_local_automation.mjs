#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const specPath = path.join(repoRoot, "guild_hall", "dev_worker", "automations", "soulforge-dev-worker.spec.json");

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
