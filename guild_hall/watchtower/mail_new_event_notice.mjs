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

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

// ---------------------------------------------------------------------------------------------
// Periodic report (살핌이 정기 보고). Sent on every scheduled run, normal or not, so silence can
// never be mistaken for health. Scope is the mail new-event/store check only.

export const REPORT_PREFIX = "[살핌이 정기 보고]";
const UNOBSERVABLE_TEXT = Object.freeze({
  snapshot_invalid: "Watchtower 판정을 읽지 못했습니다",
  snapshot_not_current: "Watchtower 판정이 30분 넘게 갱신되지 않았습니다",
  node_absent: "Watchtower 판정에 메일 event 원장 항목이 없습니다",
  receipt_unreadable: "메일 저장소 대조 기록을 읽지 못했습니다",
  receipt_without_check: "메일 저장소 대조 기록이 아직 생성되지 않았습니다",
});
const NOT_COMPARABLE_TEXT = Object.freeze({
  mail_disabled: "메일 수집이 꺼져 있음",
  mail_result_unavailable: "이번 수집 결과를 쓸 수 없음",
  store_validation_failed: "저장소 검증 실패",
  no_valid_prior_observation: "비교할 이전 관측 없음",
  prior_scope_unrecorded: "이전 관측의 비교 범위 기록 없음",
  comparison_scope_mismatch: "이전 관측과 비교 범위가 다름",
});
// Run receipt file names start with their UTC time: 20260919T114945022Z_<node>_<seq>.json
const RUN_RECEIPT_NAME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z_[A-Za-z0-9_.-]+\.json$/u;

export function runReceiptTime(name) {
  const m = RUN_RECEIPT_NAME.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) : null;
}

// Counts only: runs, failed runs, reported new mail events. Nothing else is read out.
export function summarizeRuns(receipts) {
  let runs = 0; let failed = 0; let newEvents = 0; let unknown = 0;
  for (const receipt of receipts) {
    runs += 1;
    if (receipt?.status !== "ok") failed += 1;
    const mail = receipt?.mail;
    if (["ok", "partial"].includes(mail?.status) && mail?.write_count_known === true && Number.isSafeInteger(mail?.total_new_events)) {
      newEvents += mail.total_new_events;
    } else {
      unknown += 1;
    }
  }
  return { runs, failed, newEvents, unknown };
}

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
const kst = (ms) => {
  const part = Object.fromEntries(KST.formatToParts(new Date(ms)).map((item) => [item.type, item.value]));
  return `${part.month}-${part.day} ${part.hour === "24" ? "00" : part.hour}:${part.minute}`;
};

function intervalText(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) return null;
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes}분`;
}

// Pure: returns { text, ledger }. `job` is this report's own Hermes job record (schedule, previous
// delivery outcome); `runs` are the ingress run receipts completed since the previous report.
export function buildPeriodicReport({ snapshot, receipt, ledger, now, runs = null, job = null }) {
  const prior = ledger?.schema_version === ALERT_LEDGER_SCHEMA ? ledger : createEmptyAlertLedger();
  const lastReportAt = isoMs(prior.last_report_generated_at);
  const decided = decideNotice({ snapshot, receipt, ledger: prior, now });
  const next = decided.ledger ?? prior;
  const latch = readLatch(next);

  const unobservable = [];
  if (decided.ledger === null) unobservable.push(UNOBSERVABLE_TEXT[decided.decision] ?? "Watchtower 판정을 확인하지 못했습니다");
  const evidenceRaw = receipt?.new_event_store_check;
  let checkLine = null;
  if (!receipt || typeof receipt !== "object") unobservable.push(UNOBSERVABLE_TEXT.receipt_unreadable);
  else if (!evidenceRaw) unobservable.push(UNOBSERVABLE_TEXT.receipt_without_check);
  else if (evidenceRaw.state === "not_comparable") {
    unobservable.push(`이번 저장소 대조를 판단할 근거가 없습니다 (${NOT_COMPARABLE_TEXT[evidenceRaw.reason_code] ?? "사유 미상"})`);
  } else if (evidenceRaw.state === "store_changed") checkLine = "최근 수집에서 신규 메일 보고와 함께 저장소 변화가 관측됐습니다 (전량 저장을 뜻하지는 않음)";
  else if (evidenceRaw.state === "no_new_events_reported") checkLine = "최근 수집에서 신규 메일 보고가 없었습니다";

  const isOpen = latch.open === true;
  const status = isOpen ? "이상" : unobservable.length > 0 ? "확인 불가" : "정상";
  const lines = [`${REPORT_PREFIX} ${kst(now)} (KST)`, "- 확인 범위: 메일 수집의 신규 보고–저장소 관측 대조만 (Soulforge 전체 상태가 아님)"];
  lines.push(`- 결과: ${status}`);
  if (isOpen) {
    const openedAt = Date.parse(latch.opened_at);
    const count = latch.reported_new_events === null ? "알 수 없음" : `${latch.reported_new_events}건`;
    if (lastReportAt === null || openedAt > lastReportAt) {
      lines.push(`- 새로 발견한 이상: 신규 메일 보고(${count})가 있었는데 같은 저장소의 이전 관측 이후 변화가 없음. 원인·누락 건수는 확정하지 않음`);
    } else {
      lines.push(`- 계속 남아 있는 미해결: 신규 보고–저장소 불일치 (${elapsedText(openedAt, now)}). 이후 저장소 변화가 관측되기 전까지 유지`);
    }
  } else if (checkLine && status === "정상") {
    lines.push(`- ${checkLine}`);
  }
  for (const item of unobservable) lines.push(`- 확인 불가: ${item}`);
  if (runs === null) {
    lines.push("- 지난 보고 이후 구간: 수집 실행 기록을 읽지 못해 확인 불가");
  } else if (lastReportAt === null) {
    lines.push("- 지난 보고 이후 구간: 직전 보고 기록이 없어 이번 시점만 확인");
  } else {
    const s = summarizeRuns(runs);
    const unknown = s.unknown > 0 ? `, 결과를 알 수 없는 실행 ${s.unknown}회` : "";
    const failed = s.failed > 0 ? `, 실패 ${s.failed}회` : "";
    lines.push(`- 지난 보고 이후 구간: 수집 실행 ${s.runs}회${failed}, 신규 메일 보고 ${s.newEvents}건${unknown}. 실행별 저장소 대조 기록은 남지 않아 사이 구간의 불일치는 확인 불가`);
  }
  if (job && typeof job.last_delivery_error === "string" && job.last_delivery_error.length > 0) {
    lines.push("- 직전 보고: 전달 실패 기록이 있습니다");
  }
  const minutes = job?.schedule?.kind === "interval" ? job.schedule.minutes : null;
  const every = intervalText(minutes);
  lines.push(every
    ? `- 다음 정기 보고: ${kst(now + minutes * 60_000)} 무렵 (간격 ${every})`
    : "- 다음 정기 보고: 예약 설정을 읽지 못함");
  return {
    text: lines.join("\n"),
    ledger: { ...next, last_report_generated_at: new Date(now).toISOString() },
    status,
  };
}

async function readRunsSince(dir, sinceMs, nowMs) {
  let names;
  try { names = await readdir(dir); } catch { return null; }
  const picked = names
    .map((name) => ({ name, at: runReceiptTime(name) }))
    .filter((item) => item.at !== null && item.at > sinceMs && item.at <= nowMs)
    .sort((a, b) => a.at - b.at)
    .slice(-2000);
  const receipts = [];
  for (const item of picked) receipts.push(await readJsonOrNull(join(dir, item.name)));
  return receipts;
}

async function readJob(jobsFile, jobName) {
  const jobs = await readJsonOrNull(jobsFile);
  const list = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  return list.find((item) => item?.name === jobName) ?? null;
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
  if (argv.includes("--report")) {
    const ledger = await readLedger(ledgerPath);
    const lastReportAt = isoMs(ledger?.last_report_generated_at);
    const runsDir = option(argv, "--runs-dir");
    const jobsFile = option(argv, "--jobs-file");
    const jobName = option(argv, "--job-name");
    const report = buildPeriodicReport({
      snapshot: await readJsonOrNull(snapshotPath),
      receipt: await readJsonOrNull(receiptPath),
      ledger,
      now,
      runs: runsDir && lastReportAt !== null ? await readRunsSince(runsDir, lastReportAt, now) : (runsDir ? [] : null),
      job: jobsFile && jobName ? await readJob(jobsFile, jobName) : null,
    });
    // Recorded as generated, not delivered: delivery outcome is Hermes' own job record, which the
    // next report reads back. A report is never suppressed by an earlier one.
    await writeJsonAtomic(ledgerPath, report.ledger);
    stdout.write(`${report.text}\n`);
    return 0;
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
