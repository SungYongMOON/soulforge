// tools/mail_thread_key.mjs — metadata-only mail thread helpers shared by intake tools.
// Fallback keys hash subject/sender-domain metadata so protected mail text is not stored as the key.
import { createHash } from "node:crypto";

export const REPLY_PREFIX_RE = /^(\s*(?:re|fw|fwd|\uB2F5\uC7A5|\uC804\uB2EC|\uD68C\uC2E0)[:\s\]]+)+/iu;
const LEGACY_REPLY_PREFIX_RE = /^(\s*(?:re|fw|fwd|\uB2F5\uC7A5|\uC804\uB2EC|\uD68C\uC2E0)[:\s\]]*)+/iu;

function digestThreadKey(normalizedSubject, domain) {
  if (!normalizedSubject || !domain) return "";
  const digest = createHash("sha256").update(`${normalizedSubject}|${domain}`).digest("hex").slice(0, 16);
  return `thread-fallback:${digest}`;
}

function normalizeThreadSubjectWith(subject, prefixRe) {
  let value = String(subject ?? "").normalize("NFC").trim().toLowerCase();
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(prefixRe, "").trim();
  }
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeThreadSubject(subject) {
  return normalizeThreadSubjectWith(subject, REPLY_PREFIX_RE);
}

export function senderDomain(sender) {
  const raw = String(sender ?? "").trim().toLowerCase();
  const email = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/iu.exec(raw);
  if (email) return email[1];
  const direct = raw.includes("@") ? raw.split("@").pop() : "";
  return direct && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(direct) ? direct : "";
}

export function fallbackThreadKey({ subject = "", from = "" } = {}) {
  const normalizedSubject = normalizeThreadSubject(subject);
  const domain = senderDomain(from);
  return digestThreadKey(normalizedSubject, domain);
}

export function legacyFallbackThreadKey({ subject = "", from = "" } = {}) {
  const normalizedSubject = normalizeThreadSubjectWith(subject, LEGACY_REPLY_PREFIX_RE);
  const domain = senderDomain(from);
  return digestThreadKey(normalizedSubject, domain);
}

export function threadKeyForMail({ thread = "", subject = "", from = "" } = {}) {
  const direct = String(thread ?? "").trim();
  return direct || fallbackThreadKey({ subject, from });
}

export function threadKeyAliasesForMail({ thread = "", subject = "", from = "" } = {}) {
  const direct = String(thread ?? "").trim();
  if (direct) return [direct];
  return [...new Set([fallbackThreadKey({ subject, from }), legacyFallbackThreadKey({ subject, from })].filter(Boolean))];
}

export function mailHistoryKeyFromTaskKey(taskKey, knownMailKeys = null) {
  const match = /^mailtask:(.+)$/.exec(String(taskKey ?? "").trim());
  if (!match) return "";
  const raw = match[1];
  const known = knownMailKeys instanceof Set ? knownMailKeys : null;
  if (known?.has(raw)) return raw;
  const splitBase = raw.replace(/:\d+$/, "");
  if (known?.has(splitBase)) return splitBase;
  return splitBase;
}

export function mailHistoryKeyFromMailRef(mailRef) {
  const match = /^mailcsv:(.+)$/.exec(String(mailRef ?? "").trim());
  return match ? match[1] : "";
}

export function isOutboundMail({ event_type = "", eventType = "", mailbox = "" } = {}) {
  const text = `${event_type || eventType} ${mailbox}`.toLowerCase();
  return /(^|[_\s-])(sent|outbound|outgoing|outbox)([_\s-]|$)|발신|보낸/iu.test(text);
}
