import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import {
  createClaudeStatusLineQuotaSnapshot,
} from "../core/provider-quota-snapshot.mjs";
import {
  createProviderQuotaReceiptStore,
  PROVIDER_QUOTA_RECEIPT_FILE_NAME,
} from "./provider-quota-receipt-store.mjs";

export const MAX_CLAUDE_STATUSLINE_STDIN_BYTES = 64 * 1_024;
export const CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES = Object.freeze({
  ok: 0,
  hold: 1,
  invalid_invocation: 64,
});
export const CLAUDE_STATUSLINE_QUOTA_FANOUT_STATUSES = Object.freeze([
  "written",
  "already_current",
  "retained_newer",
  "no_write",
  "hold",
  "invalid_invocation",
]);

const RESULTS = Object.freeze({
  written: Object.freeze({ status: "written", exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.ok }),
  already_current: Object.freeze({ status: "already_current", exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.ok }),
  retained_newer: Object.freeze({ status: "retained_newer", exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.ok }),
  no_write: Object.freeze({ status: "no_write", exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.ok }),
  hold: Object.freeze({ status: "hold", exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.hold }),
  invalid_invocation: Object.freeze({
    status: "invalid_invocation",
    exit_code: CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.invalid_invocation,
  }),
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copiedDocumentedWindow(value) {
  if (value === null || value === undefined) return value;
  if (!isRecord(value)) return Object.freeze({});
  const { used_percentage: usedPercentage, resets_at: resetsAt } = value;
  return Object.freeze({
    used_percentage: usedPercentage,
    resets_at: resetsAt,
  });
}

// The parsed envelope is deliberately reduced before it reaches the snapshot
// contract. This function never returns the surrounding input object.
function extractDocumentedRateLimits(inputText) {
  if (typeof inputText !== "string"
    || Buffer.byteLength(inputText, "utf8") > MAX_CLAUDE_STATUSLINE_STDIN_BYTES) {
    return { state: "invalid" };
  }

  let envelope;
  try {
    envelope = JSON.parse(inputText);
  } catch {
    return { state: "invalid" };
  }
  if (!isRecord(envelope)) return { state: "invalid" };

  let rateLimits = envelope.rate_limits;
  envelope = null;
  if (rateLimits === null || rateLimits === undefined) return { state: "no_write" };
  if (!isRecord(rateLimits)) return { state: "invalid" };

  const fiveHour = copiedDocumentedWindow(rateLimits.five_hour);
  const sevenDay = copiedDocumentedWindow(rateLimits.seven_day);
  rateLimits = null;
  if ((fiveHour === null || fiveHour === undefined)
    && (sevenDay === null || sevenDay === undefined)) {
    return { state: "no_write" };
  }
  return {
    state: "observed",
    status_line_input: Object.freeze({
      rate_limits: Object.freeze({
        five_hour: fiveHour,
        seven_day: sevenDay,
      }),
    }),
  };
}

function referenceNowMs(now) {
  try {
    const value = typeof now === "function" ? now() : now;
    return Number.isFinite(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

function observedAtFrom(referenceMs) {
  try {
    const observedAt = new Date(referenceMs).toISOString();
    return Number.isFinite(Date.parse(observedAt)) ? observedAt : null;
  } catch {
    return null;
  }
}

function resultForWriteState(value) {
  return value === "written"
    ? RESULTS.written
    : value === "already_current"
      ? RESULTS.already_current
      : value === "retained_newer"
        ? RESULTS.retained_newer
        : RESULTS.hold;
}

// This function is deliberately transport-free: callers provide the bounded
// input text and an already selected receipt store. It returns a fixed machine
// status only, never a snapshot, digest, path, or caught error.
export async function fanoutClaudeStatuslineQuotaJson(inputText, {
  store,
  now = Date.now,
} = {}) {
  const extracted = extractDocumentedRateLimits(inputText);
  if (extracted.state === "no_write") return RESULTS.no_write;
  if (extracted.state !== "observed"
    || store === null
    || typeof store !== "object"
    || typeof store.persistAcceptedSnapshot !== "function") {
    return RESULTS.hold;
  }

  const referenceMs = referenceNowMs(now);
  const observedAt = referenceMs === null ? null : observedAtFrom(referenceMs);
  if (observedAt === null) return RESULTS.hold;

  let snapshot;
  try {
    snapshot = createClaudeStatusLineQuotaSnapshot(extracted.status_line_input, {
      observedAt,
      nowMs: referenceMs,
    });
  } catch {
    return RESULTS.hold;
  }
  if (snapshot === null) return RESULTS.no_write;

  try {
    const persisted = await store.persistAcceptedSnapshot(snapshot);
    return resultForWriteState(persisted?.write_state);
  } catch {
    return RESULTS.hold;
  }
}

function receiptPathFromArgv(argv) {
  if (!Array.isArray(argv)
    || argv.length !== 2
    || argv[0] !== "--receipt-path"
    || typeof argv[1] !== "string"
    || argv[1].trim() !== argv[1]
    || !path.isAbsolute(argv[1])
    || path.basename(argv[1]) !== PROVIDER_QUOTA_RECEIPT_FILE_NAME) {
    return null;
  }
  return argv[1];
}

async function readBoundedStdin(stdin) {
  if (stdin === null || stdin === undefined || typeof stdin[Symbol.asyncIterator] !== "function") {
    return null;
  }
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      if (bytes.length > MAX_CLAUDE_STATUSLINE_STDIN_BYTES - length) return null;
      chunks.push(bytes);
      length += bytes.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

function settleExitCode(result, setExitCode) {
  try {
    if (typeof setExitCode === "function") setExitCode(result.exit_code);
  } catch {
    // The entrypoint is intentionally silent even when its exit-code sink fails.
  }
  return result;
}

// The executable boundary accepts only an explicit absolute receipt path and
// stdin. It does not infer a working directory or load a local setting.
export async function runClaudeStatuslineQuotaFanoutCli({
  argv,
  stdin,
  createStore = createProviderQuotaReceiptStore,
  now = Date.now,
  setExitCode,
} = {}) {
  const receiptPath = receiptPathFromArgv(argv);
  if (receiptPath === null) return settleExitCode(RESULTS.invalid_invocation, setExitCode);

  const inputText = await readBoundedStdin(stdin);
  if (inputText === null) return settleExitCode(RESULTS.hold, setExitCode);

  let store;
  try {
    store = typeof createStore === "function" ? createStore({ receiptPath, now }) : null;
  } catch {
    store = null;
  }
  const result = await fanoutClaudeStatuslineQuotaJson(inputText, { store, now });
  return settleExitCode(result, setExitCode);
}

function isDirectInvocation() {
  try {
    return typeof process.argv?.[1] === "string"
      && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  void runClaudeStatuslineQuotaFanoutCli({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    setExitCode: (value) => {
      process.exitCode = value;
    },
  }).catch(() => {
    process.exitCode = CLAUDE_STATUSLINE_QUOTA_FANOUT_EXIT_CODES.hold;
  });
}
