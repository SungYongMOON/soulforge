import { readFile } from "node:fs/promises";
import {
  planRetentionCanaryInternal,
  executeRetentionCanaryProductionInternal
} from "./lifecycle_retention_canary_internal.mjs";
import { ALLOWED_MAIN_REFS } from "./git_worktree_canary_adapter.mjs";

const DESTRUCTIVE_OPTIONS = Object.freeze(new Set([
  "--apply", "--delete", "--remove", "--prune", "--force", "--branch-delete"
]));

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

function forbiddenOption(arg) {
  return [...DESTRUCTIVE_OPTIONS].some((opt) => arg === opt || arg.startsWith(`${opt}=`));
}

export function parseCanaryCliArgs(argv = []) {
  const parsed = {
    command: null,
    reportPath: null,
    approvalPath: null,
    preservationReceiptPath: null,
    archiveObservationPath: null,
    targetCommitSha: null,
    approvedMainSha: null,
    approvedMainRef: null,
    expectedDigest: null,
    help: false,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (forbiddenOption(arg)) {
      throw new Error("CANARY_CLI_DESTRUCTIVE_OPTION_FORBIDDEN");
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "prepare" || arg === "plan" || arg === "inspect" || arg === "verify") {
      parsed.command = arg;
      continue;
    }
    if (
      arg === "--report" || arg === "--approval" || arg === "--preservation-receipt"
      || arg === "--preservation" || arg === "--archive-observation" || arg === "--archive"
      || arg === "--target-commit-sha" || arg === "--approved-main-sha" || arg === "--approved-main-ref"
      || arg === "--expected-digest"
    ) {
      if (index + 1 >= argv.length) {
        throw new Error("CANARY_CLI_MISSING_OPTION_VALUE");
      }
      const val = argv[index + 1];
      if (typeof val === "string" && val.startsWith("-")) {
        throw new Error("CANARY_CLI_OPTION_VALUE_FORBIDDEN_DASH");
      }
      if (arg === "--report") parsed.reportPath = val;
      else if (arg === "--approval") parsed.approvalPath = val;
      else if (arg === "--preservation-receipt" || arg === "--preservation") parsed.preservationReceiptPath = val;
      else if (arg === "--archive-observation" || arg === "--archive") parsed.archiveObservationPath = val;
      else if (arg === "--target-commit-sha") parsed.targetCommitSha = val;
      else if (arg === "--approved-main-sha") parsed.approvedMainSha = val;
      else if (arg === "--approved-main-ref") parsed.approvedMainRef = val;
      else if (arg === "--expected-digest") parsed.expectedDigest = val;
      index += 1;
      continue;
    }
    throw new Error("CANARY_CLI_INVALID_ARGUMENTS");
  }

  return parsed;
}

export async function runCanaryCli(argv = []) {
  let parsed;
  try {
    parsed = parseCanaryCliArgs(argv);
  } catch (err) {
    return { exitCode: 2, error: err.message, stdout: "", stderr: `Error: ${err.message}` };
  }

  if (parsed.help || !parsed.command) {
    return { exitCode: 0, stdout: "Usage: node lifecycle_retention_canary_cli.mjs <prepare|inspect> --report <path> --approval <path> --preservation-receipt <path>", stderr: "" };
  }

  if (parsed.targetCommitSha && !COMMIT_SHA_PATTERN.test(parsed.targetCommitSha)) {
    return { exitCode: 1, error: "COMMIT_SHA_INVALID", stdout: "", stderr: "Error: COMMIT_SHA_INVALID" };
  }
  if (parsed.approvedMainSha && !COMMIT_SHA_PATTERN.test(parsed.approvedMainSha)) {
    return { exitCode: 1, error: "MAIN_SHA_INVALID", stdout: "", stderr: "Error: MAIN_SHA_INVALID" };
  }
  if (parsed.approvedMainRef && (!ALLOWED_MAIN_REFS.has(parsed.approvedMainRef) || parsed.approvedMainRef.startsWith("-"))) {
    return { exitCode: 1, error: "MAIN_REF_INVALID", stdout: "", stderr: "Error: MAIN_REF_INVALID" };
  }

  let reportText, approvalText, preservationText;
  try {
    reportText = await readFile(parsed.reportPath, "utf8");
    approvalText = await readFile(parsed.approvalPath, "utf8");
    preservationText = await readFile(parsed.preservationReceiptPath, "utf8");
  } catch {
    return { exitCode: 1, error: "INPUT_FILE_READ_FAILED", stdout: "", stderr: "Error: INPUT_FILE_READ_FAILED" };
  }

  let report, approval, preservationReceipt;
  try {
    report = JSON.parse(reportText);
    approval = JSON.parse(approvalText);
    preservationReceipt = JSON.parse(preservationText);
  } catch {
    return { exitCode: 1, error: "JSON_PARSE_FAILED", stdout: "", stderr: "Error: JSON_PARSE_FAILED" };
  }

  if (parsed.expectedDigest) {
    const reportDigest = approval?.report_digest || report?.digest;
    if (reportDigest !== parsed.expectedDigest) {
      return { exitCode: 3, error: "EXPECTED_DIGEST_MISMATCH", stdout: "", stderr: "Error: EXPECTED_DIGEST_MISMATCH" };
    }
  }

  if (parsed.command === "prepare" || parsed.command === "plan") {
    const planRes = planRetentionCanaryInternal(report, approval, preservationReceipt, {
      target_commit_sha: parsed.targetCommitSha,
      approved_main_sha: parsed.approvedMainSha,
      approved_main_ref: parsed.approvedMainRef
    });
    return {
      exitCode: planRes.status === "PLAN_READY" ? 0 : 1,
      result: planRes,
      stdout: parsed.json ? JSON.stringify(planRes, null, 2) : `Canary Plan Status: ${planRes.status} (${planRes.reason_code})`,
      stderr: ""
    };
  } else if (parsed.command === "inspect" || parsed.command === "verify") {
    let archiveObs = null;
    if (parsed.archiveObservationPath) {
      try {
        archiveObs = JSON.parse(await readFile(parsed.archiveObservationPath, "utf8"));
      } catch {
        return { exitCode: 1, error: "ARCHIVE_OBSERVATION_READ_FAILED", stdout: "", stderr: "Error: ARCHIVE_OBSERVATION_READ_FAILED" };
      }
    }
    const execRes = executeRetentionCanaryProductionInternal(report, approval, preservationReceipt, archiveObs);
    return {
      exitCode: execRes.status === "CANARY_VERIFIED" ? 0 : 1,
      result: execRes,
      stdout: parsed.json ? JSON.stringify(execRes, null, 2) : `Canary Inspection Status: ${execRes.status} (${execRes.reason_code})`,
      stderr: ""
    };
  }

  return { exitCode: 1, error: "COMMAND_UNRECOGNIZED", stdout: "", stderr: "Error: COMMAND_UNRECOGNIZED" };
}

export async function main(argv = process.argv.slice(2)) {
  const cliRes = await runCanaryCli(argv);
  if (cliRes.stderr) {
    console.error(cliRes.stderr);
  } else if (cliRes.stdout) {
    console.log(cliRes.stdout);
  }
  process.exit(cliRes.exitCode);
}

if (process.argv[1] && process.argv[1].endsWith("lifecycle_retention_canary_cli.mjs")) {
  main();
}
