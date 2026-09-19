#!/usr/bin/env node
// 살핌이 운영감시 — mail new-event / store mismatch notice.
//
// Deterministic, local, no model. It turns an existing Watchtower judgement into at most one
// person-facing line per decision, and prints nothing when there is nothing to say, so a
// Hermes `no_agent` cron job can deliver its stdout verbatim to the existing channel.
//
// Inputs are read, never written: the Watchtower topology snapshot (the judgement) and the
// ingress `store_mail_events.json` receipt (only its `new_event_store_check` state and
// `completed_at`, as resolution evidence). The only file written is this notice's ledger.
//
// - Fault: the Watchtower `store_mail_events` node carries the reason
//   `count_store_unchanged_new_event_count_<n>` — new events were reported while the event
//   store was unchanged since a valid previous observation. That is a mismatch signal, not a
//   cause and not a lost-mail count.
// - The fault is latched. A later run that reports no new events, or is `not_comparable`, is
//   not evidence of a fix and keeps it open. Only a later receipt with `store_changed` closes
//   it, and `store_changed` still means only that the store changed — not that every event
//   was stored or loaded downstream.
// - Suppression, re-notify backoff and "recovered only if reported" reuse the existing
//   Watchtower alert policy (`planAlerts`) and its ledger format.
//
// Output never carries paths, identities, digests or free text from inputs: only fixed
// sentences, the reported count and elapsed time.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { ALERT_LEDGER_SCHEMA, createEmptyAlertLedger, planAlerts } from "./alert_policy.mjs";

export const NOTICE_NODE_ID = "store_mail_events_new_event_check";
export const NOTICE_LABEL = "메일 신규 보고–저장소 관측";
export const MISMATCH_REASON = /^count_store_unchanged_new_event_count_(\d{1,9})$/u;
export const CONNECTION_TEST_TEXT = "[운영 연결 확인·시험] 메일 감시 결과의 살핌이 보고 경로가 연결됐습니다.";
const PREFIX = "[살핌이·운영감시]";
const SNAPSHOT_SCHEMA = /^soulforge\.watchtower\.topology_health\.v\d+$/u;
const STORE_SCHEMA = "soulforge.ingress.store_validity.v1";
const CHECK_STATES = new Set(["store_changed", "store_unchanged", "no_new_events_reported", "not_comparable"]);
// A snapshot older than this is not a current judgement; the notice then decides nothing.
export const SNAPSHOT_MAX_AGE_SECONDS = 1800;

const isoMs = (value) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);

// Returns { usable, mismatchCount } from the Watchtower snapshot, or usable=false.
export function readJudgement(snapshot, now) {
  if (!snapshot || typeof snapshot !== "object" || !SNAPSHOT_SCHEMA.test(String(snapshot.schema_version))) {
    return { usable: false, code: "snapshot_invalid" };
  }
  const observed = isoMs(snapshot.observed_at);
  if (observed === null || (now - observed) / 1000 > SNAPSHOT_MAX_AGE_SECONDS || observed - now > 300_000) {
    return { usable: false, code: "snapshot_not_current" };
  }
  const node = Array.isArray(snapshot.nodes) ? snapshot.nodes.find((item) => item?.id === "store_mail_events") : undefined;
  const reasons = Array.isArray(node?.health?.reasons) ? node.health.reasons : null;
  if (reasons === null) return { usable: false, code: "node_absent" };
  let mismatchCount = 0;
  for (const reason of reasons) {
    const match = typeof reason === "string" ? MISMATCH_REASON.exec(reason) : null;
    if (match) mismatchCount = Math.max(mismatchCount, Number(match[1]));
  }
  return { usable: true, mismatchCount };
}

// Returns the receipt's cross-check state and completion time, or null when unusable.
export function readResolutionEvidence(receipt) {
  if (!receipt || typeof receipt !== "object" || receipt.schema_version !== STORE_SCHEMA) return null;
  const completed = isoMs(receipt.completed_at);
  const state = receipt.new_event_store_check?.state;
  if (completed === null || !CHECK_STATES.has(state)) return null;
  return { state, completedAt: completed };
}

function readLatch(ledger) {
  const latch = ledger?.mail_new_event_latch;
  const lastChanged = isoMs(latch?.last_store_changed_at) === null ? null : latch.last_store_changed_at;
  if (latch && typeof latch === "object" && latch.open === true && isoMs(latch.opened_at) !== null) {
    return {
      open: true,
      opened_at: latch.opened_at,
      reported_new_events: Number.isSafeInteger(latch.reported_new_events) ? latch.reported_new_events : null,
      last_store_changed_at: lastChanged,
    };
  }
  // A ledger whose latch is missing or damaged but whose alert row shows a reported, still-open
  // fault stays open: silence or a "recovered" line must never come from lost state.
  const row = ledger?.nodes?.[NOTICE_NODE_ID];
  if (row?.last_state === "degraded" && Number.isSafeInteger(row.notify_count) && row.notify_count > 0
    && isoMs(row.since) !== null) {
    return { open: true, opened_at: row.since, reported_new_events: null, last_store_changed_at: lastChanged };
  }
  return { open: false, last_store_changed_at: lastChanged };
}

function elapsedText(fromMs, now) {
  const seconds = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}일째`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}시간째`;
  return `${Math.max(1, Math.floor(seconds / 60))}분째`;
}

export function renderNotice(request, latch, now) {
  if (request.event === "node_recovered") {
    return [
      `${PREFIX} 메일 신규 보고–저장소 관측 불일치가 해소됐습니다.`,
      "- 근거: 이후 실행에서 메일 event 저장소 변화가 관측됐습니다.",
      "- 저장소 변화는 보고된 메일이 모두 저장됐거나 core_mail에 적재됐다는 뜻이 아닙니다.",
    ].join("\n");
  }
  const count = latch.reported_new_events;
  const lines = [
    request.repeat_index === 0
      ? `${PREFIX} 메일 신규 보고와 저장소 관측이 맞지 않습니다.`
      : `${PREFIX} 메일 신규 보고–저장소 관측 불일치가 아직 해소되지 않았습니다 (${elapsedText(Date.parse(latch.opened_at), now)}).`,
    `- 수집 실행이 보고한 신규 메일: ${count === null ? "알 수 없음" : `${count}건`}`,
    "- 같은 저장소의 이전 관측 이후 메일 event 파일 변화: 없음",
    "- 출처: Watchtower '메일 event 원장' 판정. 원인·누락 건수는 확정하지 않았습니다.",
    "- 이후 실행에서 저장소 변화가 관측되기 전까지 미해결로 유지합니다.",
  ];
  return lines.join("\n");
}

// Pure decision: returns { text | null, ledger | null }. A null ledger means "do not write":
// an unusable snapshot decides nothing and leaves the stored state as it was.
export function decideNotice({ snapshot, receipt, ledger, now }) {
  const judgement = readJudgement(snapshot, now);
  if (!judgement.usable) return { text: null, ledger: null, decision: judgement.code };
  const prior = ledger?.schema_version === ALERT_LEDGER_SCHEMA ? ledger : createEmptyAlertLedger();
  let latch = readLatch(prior);
  const evidence = readResolutionEvidence(receipt);
  // Remember the newest store change seen, so a later no-new-events run overwriting the receipt
  // between ticks cannot hide the resolution evidence.
  let lastChanged = latch.last_store_changed_at;
  if (evidence?.state === "store_changed" && (lastChanged === null || evidence.completedAt > Date.parse(lastChanged))) {
    lastChanged = new Date(evidence.completedAt).toISOString();
  }
  if (judgement.mismatchCount > 0) {
    // Anchor the fault to when it was observed, not to this tick: the mismatching receipt's
    // completion when the receipt still shows it, else the snapshot that judged it.
    const anchor = evidence?.state === "store_unchanged"
      ? new Date(evidence.completedAt).toISOString()
      : new Date(Date.parse(snapshot.observed_at)).toISOString();
    latch = latch.open
      ? { ...latch, reported_new_events: judgement.mismatchCount }
      : { open: true, opened_at: anchor, reported_new_events: judgement.mismatchCount };
  } else if (latch.open && lastChanged !== null && Date.parse(lastChanged) > Date.parse(latch.opened_at)) {
    latch = { open: false };
  }
  latch = { ...latch, last_store_changed_at: lastChanged };
  const node = {
    id: NOTICE_NODE_ID,
    label: NOTICE_LABEL,
    health: { state: latch.open ? "degraded" : "ok", reasons: latch.open ? ["store_unchanged_with_new_events"] : [], age_seconds: null },
  };
  const plan = planAlerts({ snapshot: { nodes: [node] }, ledger: prior, now });
  const nextLedger = {
    ...plan.ledger,
    mail_new_event_latch: latch.open ? latch : { open: false, last_store_changed_at: latch.last_store_changed_at },
  };
  const request = plan.requests[0];
  return {
    text: request ? renderNotice(request, latch, now) : null,
    ledger: nextLedger,
    decision: request ? request.event : (latch.open ? "suppressed_open" : "quiet"),
  };
}

async function readJsonOrNull(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

// Absent ledger = first run. A ledger that exists but cannot be read is a failure: resetting it
// would silently forget an open fault.
async function readLedger(path) {
  let text;
  try { text = await readFile(path, "utf8"); } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw Object.assign(new Error("ledger_unreadable"), { code: "ledger_unreadable" });
  }
  let value;
  try { value = JSON.parse(text); } catch { throw Object.assign(new Error("ledger_invalid"), { code: "ledger_invalid" }); }
  if (value?.schema_version !== ALERT_LEDGER_SCHEMA) throw Object.assign(new Error("ledger_invalid"), { code: "ledger_invalid" });
  return value;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv, { now = Date.now(), stdout = process.stdout } = {}) {
  if (argv.includes("--connection-test")) {
    stdout.write(`${CONNECTION_TEST_TEXT}\n`);
    return 0;
  }
  const snapshotPath = option(argv, "--snapshot");
  const receiptPath = option(argv, "--receipt");
  const ledgerPath = option(argv, "--ledger");
  if (!snapshotPath || !receiptPath || !ledgerPath) {
    process.stderr.write("mail_new_event_notice: --snapshot, --receipt and --ledger are required\n");
    return 1;
  }
  const result = decideNotice({
    snapshot: await readJsonOrNull(snapshotPath),
    receipt: await readJsonOrNull(receiptPath),
    ledger: await readLedger(ledgerPath),
    now,
  });
  // The ledger is saved before the line is handed to the channel: a lost delivery is re-sent
  // by the existing backoff, while a saved-after-send crash would send the same line twice.
  if (result.ledger !== null) await writeJsonAtomic(ledgerPath, result.ledger);
  if (result.text) stdout.write(`${result.text}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    // Exit 3 marks a ledger that must be looked at; the shim reports only the exit code.
    process.stderr.write("mail_new_event_notice: failed\n");
    process.exitCode = String(error?.code).startsWith("ledger_") ? 3 : 1;
  });
}
