// Metadata-only mail grouping helpers for team mailbox duplicate suppression.
// Message-ID exact matching is primary; subject/sender/time fingerprint is only
// a legacy fallback when Message-ID is absent.
import { createHash } from "node:crypto";

import { isOutboundMail, threadKeyForMail } from "./mail_thread_key.mjs";

const SUBJECT_PREFIX_RE = /^(\s*(?:re|fw|fwd|답장|전달|회신)[:\s\]]*)+/iu;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function digest(value, length = 16) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, length);
}

export function normalizeSubject(subject) {
  let value = String(subject ?? "").normalize("NFC").trim().toLowerCase();
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(SUBJECT_PREFIX_RE, "").trim();
  }
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeSender(sender) {
  return String(sender ?? "").normalize("NFKC").trim().toLowerCase();
}

function normalizeRecipientRole(role) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "to" || value === "cc") return value;
  return "";
}

export function timeBucketUtc(isoLike, minutes = 10) {
  const raw = String(isoLike ?? "").trim();
  if (!DATE_RE.test(raw)) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const bucketMs = Math.max(1, Number(minutes) || 10) * 60 * 1000;
  return String(Math.floor(date.getTime() / bucketMs));
}

export function mailGroupKey(row, { bucketMinutes = 10 } = {}) {
  const messageId = String(row?.provider_message_id ?? row?.message_id ?? row?.["메일메시지ID"] ?? "").trim();
  const thread = threadKeyForMail({
    thread: row?.thread ?? row?.["스레드"] ?? "",
    subject: row?.subject ?? row?.["제목"] ?? "",
    from: row?.from ?? row?.["발신자"] ?? "",
  });
  if (messageId) return `mid:${digest(messageId)}`;

  const subject = normalizeSubject(row?.subject ?? row?.["제목"] ?? "");
  const sender = normalizeSender(row?.from ?? row?.["발신자"] ?? "");
  const bucket = timeBucketUtc(row?.received_at ?? row?.["메일수신시각"] ?? row?.at ?? "", bucketMinutes);
  if (!subject || !sender || !bucket) return "";
  const fp = `mg:${digest(`${subject}|${sender}|${bucket}`)}`;
  return thread ? `${fp}:thread:${digest(thread)}` : fp;
}

export function pickRepresentative(rows = []) {
  const candidates = [...rows].filter(Boolean);
  candidates.sort((a, b) => {
    const roleA = normalizeRecipientRole(a.recipient_role ?? a["수신역할"]) === "to" ? 0 : 1;
    const roleB = normalizeRecipientRole(b.recipient_role ?? b["수신역할"]) === "to" ? 0 : 1;
    if (roleA !== roleB) return roleA - roleB;
    const at = String(a.received_at ?? a["메일수신시각"] ?? "");
    const bt = String(b.received_at ?? b["메일수신시각"] ?? "");
    if (at !== bt) return at.localeCompare(bt);
    const am = String(a.mailbox ?? a["메일함"] ?? "");
    const bm = String(b.mailbox ?? b["메일함"] ?? "");
    if (am !== bm) return am.localeCompare(bm);
    return String(a.history_key ?? a["이력키"] ?? "").localeCompare(String(b.history_key ?? b["이력키"] ?? ""));
  });
  return candidates[0] ?? null;
}

export function groupMailCopies(rows = [], { bucketMinutes = 10 } = {}) {
  const groups = new Map();
  const singles = [];
  for (const row of rows) {
    if (!row || isOutboundMail(row)) {
      singles.push(row);
      continue;
    }
    const key = mailGroupKey(row, { bucketMinutes });
    if (!key) {
      singles.push(row);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicateGroups = [];
  for (const [group_key, groupRows] of groups) {
    if (groupRows.length < 2) {
      singles.push(...groupRows);
      continue;
    }
    const representative = pickRepresentative(groupRows);
    const copies = groupRows.filter((row) => row !== representative);
    duplicateGroups.push({
      group_key,
      representative,
      copies,
      rows: groupRows,
      copy_count: groupRows.length,
    });
  }

  return { singles, duplicateGroups };
}
