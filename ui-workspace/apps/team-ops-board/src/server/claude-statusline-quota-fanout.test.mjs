import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  buildOfficialProviderQuotaProjection,
  validateOfficialProviderQuotaSnapshot,
} from "../core/provider-quota-snapshot.mjs";
import {
  CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES,
  fanoutClaudeStatuslineQuotaJson,
  MAX_CLAUDE_STATUSLINE_STDIN_BYTES,
  runClaudeStatuslineQuotaFanoutCli,
} from "./claude-statusline-quota-fanout.mjs";
import {
  createProviderQuotaReceiptStore,
  PROVIDER_QUOTA_RECEIPT_FILE_NAME,
} from "./provider-quota-receipt-store.mjs";

const NOW_MS = Date.parse("2026-08-10T10:00:00.000Z");
const CANARY = "DO_NOT_RETAIN_STATUSLINE_CANARY";

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "provider-quota-fanout-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function receiptPathFor(directory) {
  return path.join(directory, PROVIDER_QUOTA_RECEIPT_FILE_NAME);
}

function envelope({ fiveHour = true, sevenDay = true, extra = {} } = {}) {
  const rateLimits = {
    ...(fiveHour ? {
      five_hour: {
        used_percentage: 24.5,
        resets_at: Math.floor((NOW_MS + (2 * 60 * 60 * 1_000)) / 1_000),
        session: CANARY,
      },
    } : {}),
    ...(sevenDay ? {
      seven_day: {
        used_percentage: 63,
        resets_at: Math.floor((NOW_MS + (3 * 24 * 60 * 60 * 1_000)) / 1_000),
        account: CANARY,
      },
    } : {}),
    ...extra,
  };
  return JSON.stringify({
    cwd: CANARY,
    session_id: CANARY,
    model: CANARY,
    account: CANARY,
    path: CANARY,
    transcript: CANARY,
    prompt: CANARY,
    headers: CANARY,
    rate_limits: rateLimits,
  });
}

async function* stdinText(text) {
  yield Buffer.from(text, "utf8");
}

async function* invalidUtf8Stdin() {
  yield Buffer.from([0xc3, 0x28]);
}

async function withCapturedOutput(run) {
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const stdout = [];
  const stderr = [];
  process.stdout.write = (chunk) => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };
  try {
    const value = await run();
    return { value, stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

test("status-line sidecar persists only two documented windows and remains silent", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    const exitCodes = [];
    const captured = await withCapturedOutput(() => runClaudeStatuslineQuotaFanoutCli({
      argv: ["--receipt-path", receiptPath],
      stdin: stdinText(envelope()),
      now: () => NOW_MS,
      setExitCode: (value) => exitCodes.push(value),
    }));

    assert.deepEqual(captured.value, { status: "written", exit_code: 0 });
    assert.deepEqual(exitCodes, [0]);
    assert.deepEqual(captured.stdout, []);
    assert.deepEqual(captured.stderr, []);
    assert.equal(JSON.stringify(captured.value).includes(CANARY), false);

    const rawReceipt = await readFile(receiptPath, "utf8");
    const receipt = JSON.parse(rawReceipt);
    assert.equal(rawReceipt.includes(CANARY), false);
    assert.equal(receipt.digest.includes(CANARY), false);
    assert.deepEqual(Object.keys(receipt).sort(), ["digest", "limits", "observed_at", "schema_version", "source_kind"]);
    assert.deepEqual(receipt.limits.map((limit) => limit.limit_id), ["claude_five_hour", "claude_weekly"]);
    assert.doesNotThrow(() => validateOfficialProviderQuotaSnapshot(receipt, { nowMs: NOW_MS }));
  });
});

test("missing rate limits or both documented windows absent is a no-write safe outcome", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    for (const input of [JSON.stringify({ cwd: CANARY }), JSON.stringify({ rate_limits: {} })]) {
      const exitCodes = [];
      const result = await runClaudeStatuslineQuotaFanoutCli({
        argv: ["--receipt-path", receiptPath],
        stdin: stdinText(input),
        now: () => NOW_MS,
        setExitCode: (value) => exitCodes.push(value),
      });
      assert.deepEqual(result, { status: "no_write", exit_code: 0 });
      assert.deepEqual(exitCodes, [0]);
    }
    await assert.rejects(readFile(receiptPath, "utf8"), { code: "ENOENT" });
  });
});

test("oversized or malformed UTF-8 stdin is a no-write HOLD", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    const result = await runClaudeStatuslineQuotaFanoutCli({
      argv: ["--receipt-path", receiptPath],
      stdin: invalidUtf8Stdin(),
      now: () => NOW_MS,
      setExitCode: () => {},
    });
    assert.deepEqual(result, {
      status: "hold",
      exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.hold,
    });
    await assert.rejects(readFile(receiptPath, "utf8"), { code: "ENOENT" });
  });
});

test("one documented window persists partial evidence while Fable remains absent and held", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    const result = await runClaudeStatuslineQuotaFanoutCli({
      argv: ["--receipt-path", receiptPath],
      stdin: stdinText(envelope({
        sevenDay: false,
        extra: {
          fable: {
            used_percentage: 1,
            resets_at: Math.floor((NOW_MS + (24 * 60 * 60 * 1_000)) / 1_000),
            token: CANARY,
          },
        },
      })),
      now: () => NOW_MS,
      setExitCode: () => {},
    });
    assert.deepEqual(result, { status: "written", exit_code: 0 });

    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.deepEqual(receipt.limits.map((limit) => limit.limit_id), ["claude_five_hour"]);
    assert.equal(JSON.stringify(receipt).includes("fable"), false);
    assert.equal(JSON.stringify(receipt).includes(CANARY), false);
    const projection = buildOfficialProviderQuotaProjection({
      snapshot: receipt,
      sourceAvailable: true,
      nowMs: NOW_MS,
    });
    assert.deepEqual(projection, {
      schema_version: "soulforge.team_ops_board_provider_quota_projection.v1",
      capture_status: "hold",
      freshness: "unknown",
      snapshot: receipt,
    });
  });
});

test("weekly-only documented evidence also persists as partial UNKNOWN/HOLD", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    const result = await runClaudeStatuslineQuotaFanoutCli({
      argv: ["--receipt-path", receiptPath],
      stdin: stdinText(envelope({ fiveHour: false })),
      now: () => NOW_MS,
      setExitCode: () => {},
    });
    assert.deepEqual(result, { status: "written", exit_code: 0 });

    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.deepEqual(receipt.limits.map((limit) => limit.limit_id), ["claude_weekly"]);
    const projection = buildOfficialProviderQuotaProjection({
      snapshot: receipt,
      sourceAvailable: true,
      nowMs: NOW_MS,
    });
    assert.equal(projection.capture_status, "hold");
    assert.equal(projection.freshness, "unknown");
    assert.equal(JSON.stringify(projection).includes(CANARY), false);
  });
});

test("malformed, future, and oversized input retain prior accepted evidence", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    const store = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS, nonce: () => "fanoutnonce" });
    assert.deepEqual(await fanoutClaudeStatuslineQuotaJson(envelope(), { store, now: () => NOW_MS }), {
      status: "written",
      exit_code: 0,
    });
    const prior = await readFile(receiptPath, "utf8");

    const malformed = JSON.stringify({ rate_limits: { five_hour: { used_percentage: "bad", resets_at: 1 } } });
    const futureReset = JSON.stringify({ rate_limits: { five_hour: {
      used_percentage: 30,
      resets_at: Math.floor((NOW_MS + (8 * 60 * 60 * 1_000)) / 1_000),
    } } });
    const oversized = `${envelope()}${" ".repeat(MAX_CLAUDE_STATUSLINE_STDIN_BYTES)}`;
    for (const input of [malformed, futureReset, oversized]) {
      const result = await fanoutClaudeStatuslineQuotaJson(input, { store, now: () => NOW_MS });
      assert.deepEqual(result, {
        status: "hold",
        exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.hold,
      });
      assert.equal(await readFile(receiptPath, "utf8"), prior);
      assert.equal(JSON.stringify(result).includes(CANARY), false);
    }
  });
});

test("invalid invocation and a busy receipt remain silent bounded failures", async () => {
  await withTempDirectory(async (directory) => {
    const receiptPath = receiptPathFor(directory);
    const invalid = await withCapturedOutput(() => runClaudeStatuslineQuotaFanoutCli({
      argv: ["--receipt-path", path.join(directory, "unexpected.json")],
      stdin: stdinText(envelope()),
      now: () => NOW_MS,
      setExitCode: () => {},
    }));
    assert.deepEqual(invalid.value, {
      status: "invalid_invocation",
      exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.invalid_invocation,
    });
    assert.deepEqual(invalid.stdout, []);
    assert.deepEqual(invalid.stderr, []);

    const store = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS, nonce: () => "fanoutnonce" });
    await fanoutClaudeStatuslineQuotaJson(envelope(), { store, now: () => NOW_MS });
    const prior = await readFile(receiptPath, "utf8");
    await writeFile(`${receiptPath}.lock`, "owned elsewhere", "utf8");
    try {
      const busy = await fanoutClaudeStatuslineQuotaJson(envelope(), { store, now: () => NOW_MS });
      assert.deepEqual(busy, {
        status: "hold",
        exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.hold,
      });
      assert.equal(await readFile(receiptPath, "utf8"), prior);
      assert.equal(JSON.stringify(busy).includes(CANARY), false);
    } finally {
      await rm(`${receiptPath}.lock`, { force: true });
    }
  });
});

test("sidecar has no provider transport, account, configuration, process, or output authority", async () => {
  const source = await readFile(new URL("./claude-statusline-quota-fanout.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    "node:child_process",
    "node:http",
    "node:https",
    "node:net",
    "node:fs",
    "process.env",
    "fetch(",
    "exec(",
    "spawn(",
    "orca",
    "account-list",
    "console.",
    "stdout",
    "stderr",
    "ai-usage",
    "fable",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, forbidden);
  }
  assert.match(source, /process\.argv/u);
  assert.match(source, /process\.stdin/u);
  assert.match(source, /process\.exitCode/u);
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/u);
  assert.match(source, /path\.resolve\(process\.argv\[1\]\)/u);
  assert.doesNotMatch(source, /path\.basename\(process\.argv\[1\]\) ===/u);
});
