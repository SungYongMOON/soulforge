import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

export const ALLOWLISTED_SPECS = Object.freeze({
  "soulforge-night-watch-pipeline": "guild_hall/night_watch/automations/soulforge-night-watch-pipeline.spec.json",
  "soulforge-lifecycle-retention-report": "guild_hall/night_watch/automations/soulforge-lifecycle-retention-report.spec.json"
});

export function resolveSpecPath(specName = "soulforge-night-watch-pipeline", repoRootPath = repoRoot) {
  const normName = String(specName ?? "soulforge-night-watch-pipeline").trim().replace(/\.spec\.json$/u, "");
  if (!Object.hasOwn(ALLOWLISTED_SPECS, normName)) {
    throw new Error(`Unknown or forbidden spec selector: ${specName}`);
  }
  return path.join(repoRootPath, ALLOWLISTED_SPECS[normName]);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
      continue;
    }
    args[key] = "true";
  }
  return args;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return path.resolve(value);
}

function buildPrompt(template, replacements) {
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

function renderToml(spec, prompt, args, outputPath) {
  const now = Date.now();
  const cwdRoot = requireArg(args, "local-root");
  const status = args.status || spec.default_status;
  const rrule = args.rrule || spec.default_rrule;
  const executionEnvironment =
    args["execution-environment"] || spec.default_execution_environment;

  const lines = [
    "version = 1",
    `id = ${tomlString(spec.id)}`,
    `name = ${tomlString(spec.name)}`,
    `prompt = ${tomlString(prompt)}`,
    `status = ${tomlString(status)}`,
    `rrule = ${tomlString(rrule)}`,
    `execution_environment = ${tomlString(executionEnvironment)}`,
    `model = ${tomlString(spec.model)}`,
    `reasoning_effort = ${tomlString(spec.reasoning_effort)}`,
    `cwds = [${tomlString(cwdRoot)}]`,
    `created_at = ${now}`,
    `updated_at = ${now}`
  ];

  if (outputPath) {
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const selectedSpecName = args.spec || "soulforge-night-watch-pipeline";
  const specPath = resolveSpecPath(selectedSpecName, repoRoot);

  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const promptTemplatePath = path.join(repoRoot, spec.prompt_template);
  const promptTemplate = fs.readFileSync(promptTemplatePath, "utf8").trim();

  const localRoot = requireArg(args, "local-root");
  const workmetaRoot = requireArg(args, "workmeta-root");
  const privateStateRoot = requireArg(args, "private-state-root");
  const activityRoot = path.join(localRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const outputPath = resolveOutputPath(args, spec);

  const prompt = buildPrompt(promptTemplate, {
    LOCAL_SOULFORGE_ROOT: localRoot,
    LOCAL_ACTIVITY_ROOT: activityRoot,
    LOCAL_WORKMETA_ROOT: workmetaRoot,
    LOCAL_PRIVATE_STATE_ROOT: privateStateRoot
  });

  const toml = renderToml(spec, prompt, args, outputPath);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, toml, "utf8");
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  process.stdout.write(toml);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
