#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");

export const POLICY_DOC_RELATIVE_PATH = "docs/architecture/foundation/AI_OUTPUT_FORMAT_POLICY_V0.md";
export const schemaVersion = "soulforge.ai_output_format_policy.validate.v0";

export const REQUIRED_POLICY_TERMS = [
  {
    id: "source_of_truth",
    label: "source_of_truth or source-of-truth",
    pattern: /\b(?:source_of_truth|source-of-truth)\b/iu,
  },
  {
    id: "human_review_artifact",
    label: "human_review_artifact or human-review artifact",
    pattern: /\b(?:human_review_artifact|human-review\s+artifact)\b/iu,
  },
  {
    id: "markdown",
    label: "markdown",
    pattern: /\bmarkdown\b/iu,
  },
  {
    id: "html",
    label: "html",
    pattern: /\bhtml\b/iu,
  },
  {
    id: "export",
    label: "export",
    pattern: /\bexport(?:s|ed|ing)?\b/iu,
  },
  {
    id: "secrets_private_boundary",
    label: "secrets/private boundary",
    pattern: /\bsecrets?\s*\/\s*private\s+boundary\b/iu,
  },
];

export async function validatePolicyDoc({ root = defaultRepoRoot, policyPath = POLICY_DOC_RELATIVE_PATH } = {}) {
  const policyAbsolutePath = path.resolve(root, policyPath);
  const errors = [];
  let content = "";

  try {
    content = await fs.readFile(policyAbsolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      errors.push({
        id: "policy_doc_missing",
        path: policyPath,
        detail: `Required policy document is missing: ${policyPath}`,
      });
      return buildReport({ policyPath, missingTerms: REQUIRED_POLICY_TERMS, errors });
    }
    throw error;
  }

  const missingTerms = REQUIRED_POLICY_TERMS.filter((term) => !term.pattern.test(content));

  if (missingTerms.length > 0) {
    errors.push({
      id: "missing_required_policy_terms",
      path: policyPath,
      missing_terms: missingTerms.map((term) => term.label),
      detail: "Policy document is missing one or more required AI output format policy terms.",
    });
  }

  return buildReport({ policyPath, missingTerms, errors });
}

function buildReport({ policyPath, missingTerms, errors }) {
  return {
    schema_version: schemaVersion,
    ok: errors.length === 0,
    policy_path: policyPath,
    required_terms: REQUIRED_POLICY_TERMS.map((term) => term.label),
    missing_terms: missingTerms.map((term) => term.label),
    errors,
  };
}

export function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--json") {
      flags.json = true;
      continue;
    }

    if (token === "--help") {
      flags.help = true;
      continue;
    }

    if (token === "--root") {
      flags.root = argv[index + 1];
      index += 1;
      continue;
    }

    if (token.startsWith("--root=")) {
      flags.root = token.slice("--root=".length);
      continue;
    }

    if (token === "--policy-path") {
      flags.policyPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token.startsWith("--policy-path=")) {
      flags.policyPath = token.slice("--policy-path=".length);
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  return flags;
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const args = parseArgs(argv);

  if (args.help) {
    stdout.write(
      [
        "Usage: node guild_hall/validate/ai_output_format_policy.mjs [--json] [--root <path>] [--policy-path <path>]",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const report = await validatePolicyDoc({
    root: args.root ?? defaultRepoRoot,
    policyPath: args.policyPath ?? POLICY_DOC_RELATIVE_PATH,
  });

  if (args.json) {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report, stdout);
  }

  return report.ok ? 0 : 1;
}

function printHuman(report, stdout) {
  const lines = [
    "Soulforge AI Output Format Policy Validate",
    `ok: ${report.ok ? "yes" : "no"}`,
    `policy_path: ${report.policy_path}`,
    `required_terms: ${report.required_terms.length}`,
    `missing_terms: ${report.missing_terms.length}`,
    `errors: ${report.errors.length}`,
  ];

  if (report.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of report.errors) {
      lines.push(`- ${error.id}: ${error.detail}`);
      for (const term of error.missing_terms ?? []) {
        lines.push(`  - ${term}`);
      }
    }
  }

  stdout.write(`${lines.join("\n")}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
