import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  runCodexRetentionAutomation,
  DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG
} from "./codex_retention_automation.mjs";
import { defaultRepoRoot } from "./lifecycle_retention.mjs";

const DESTRUCTIVE_OPTIONS = Object.freeze(new Set([
  "--apply", "--delete", "--archive", "--remove", "--prune", "--branch-delete"
]));
const FORBIDDEN_SUBCOMMANDS = Object.freeze(new Set([
  "approve", "apply", "verify", "delete", "archive", "remove", "prune"
]));

function cliUsage() {
  return [
    "Usage: node .workflow/codex_thread_manager_v0/codex_retention_automation_cli.mjs [options]",
    "  --local-root <path>         repository root (read-only)",
    "  --activity-root <path>      approved activity root directory",
    "  --catalog-file <path>       catalog file path (schema v1)",
    "  --expected-digest <sha256>  prior/expected envelope digest (returns exit code 3 on mismatch)",
    "  --json                      output report envelope as JSON",
    "  --help                      show this help"
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    localRoot: null,
    activityRoot: null,
    catalogFile: null,
    expectedDigest: null,
    json: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token.startsWith("--")) {
      const flagName = token.split("=")[0];
      if (DESTRUCTIVE_OPTIONS.has(flagName)) {
        throw new Error("forbidden_destructive_option");
      }
    } else if (FORBIDDEN_SUBCOMMANDS.has(token.toLowerCase())) {
      throw new Error("forbidden_destructive_option");
    }

    if (token === "--json") {
      args.json = true;
    } else if (token === "--local-root" || token === "--repo-root") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error("missing_local_root_value");
      args.localRoot = val;
      i += 1;
    } else if (token.startsWith("--local-root=") || token.startsWith("--repo-root=")) {
      args.localRoot = token.split("=")[1];
    } else if (token === "--activity-root") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error("missing_activity_root_value");
      args.activityRoot = val;
      i += 1;
    } else if (token.startsWith("--activity-root=")) {
      args.activityRoot = token.split("=")[1];
    } else if (token === "--catalog-file") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error("missing_catalog_file_value");
      args.catalogFile = val;
      i += 1;
    } else if (token.startsWith("--catalog-file=")) {
      args.catalogFile = token.split("=")[1];
    } else if (token === "--expected-digest" || token === "--prior-digest") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error("missing_expected_digest_value");
      args.expectedDigest = val;
      i += 1;
    } else if (token.startsWith("--expected-digest=") || token.startsWith("--prior-digest=")) {
      args.expectedDigest = token.split("=")[1];
    } else {
      throw new Error("unknown_argument");
    }
  }

  return args;
}

export async function cliMain(argv = process.argv.slice(2)) {
  let parsedArgs;
  try {
    parsedArgs = parseArgs(argv);
  } catch (err) {
    const code = err.message || "argument_error";
    process.stderr.write(`${code}\n`);
    process.exitCode = 2;
    return;
  }

  if (parsedArgs.help) {
    process.stdout.write(`${cliUsage()}\n`);
    process.exitCode = 0;
    return;
  }

  const repoRoot = parsedArgs.localRoot ? resolve(parsedArgs.localRoot) : defaultRepoRoot();
  const activityRoot = parsedArgs.activityRoot
    ? resolve(parsedArgs.activityRoot)
    : resolve(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  let catalog = DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG;
  if (parsedArgs.catalogFile) {
    try {
      const raw = await readFile(resolve(parsedArgs.catalogFile), "utf8");
      catalog = JSON.parse(raw);
    } catch {
      process.stderr.write("catalog_file_invalid\n");
      process.exitCode = 2;
      return;
    }
  }

  try {
    const result = await runCodexRetentionAutomation({
      repoRoot,
      activityRoot,
      catalog,
      expectedDigest: parsedArgs.expectedDigest
    });

    if (parsedArgs.json) {
      process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    } else {
      process.stdout.write(
        `Codex retention report completed [${result.report.status}]\n` +
        `  Report: ${result.report_path}\n` +
        `  Bound Candidates: ${result.report.summary.bound_candidate_count}\n` +
        `  Inventory Gaps: ${result.report.summary.inventory_gap_count}\n` +
        `  Destructive Actions: ${result.report.summary.destructive_action_count}\n` +
        `  Digest: ${result.report.digest}\n`
      );
    }
    process.exitCode = 0;
  } catch (err) {
    const msg = err.message || "execution_failed";
    if (msg.includes("digest_mismatch")) {
      process.stderr.write("digest_mismatch\n");
      process.exitCode = 3;
    } else if (msg.includes("catalog_file_invalid")) {
      process.stderr.write("catalog_file_invalid\n");
      process.exitCode = 2;
    } else if (msg.includes("activity_append_failed")) {
      process.stderr.write("activity_append_failed\n");
      process.exitCode = 1;
    } else {
      const safeCode = msg.match(/^[a-z0-9_]{1,64}$/u) ? msg : "execution_failed";
      process.stderr.write(`${safeCode}\n`);
      process.exitCode = 1;
    }
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  void cliMain();
}
