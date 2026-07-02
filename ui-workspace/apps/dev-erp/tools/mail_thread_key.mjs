// tools/mail_thread_key.mjs — metadata-only mail thread helpers shared by intake tools.
// Fallback keys hash subject/sender-domain metadata so protected mail text is not stored as the key.
import { createHash } from "node:crypto";

const REPLY_PREFIX_RE = /^(\s*(re|fw|fwd|\uB2F5\uC7A5|\uC804\uB2EC|\uD68C\uC2E0)[:\s\]]*)+/iu;

export function normalizeThreadSubject(subject) {
  return String(subject ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(REPLY_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
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
  if (!normalizedSubject || !domain) return "";
  const digest = createHash("sha256").update(`${normalizedSubject}|${domain}`).digest("hex").slice(0, 16);
  return `thread-fallback:${digest}`;
}

export function threadKeyForMail({ thread = "", subject = "", from = "" } = {}) {
  const direct = String(thread ?? "").trim();
  return direct || fallbackThreadKey({ subject, from });
}

export function isOutboundMail({ event_type = "", eventType = "", mailbox = "" } = {}) {
  const text = `${event_type || eventType} ${mailbox}`.toLowerCase();
  return /(^|[_\s-])(sent|outbound|outgoing|outbox)([_\s-]|$)|발신|보낸/iu.test(text);
}
