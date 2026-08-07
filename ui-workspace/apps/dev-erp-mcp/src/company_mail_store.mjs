import { createReadStream, lstatSync, realpathSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { createInterface } from "node:readline";

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 5000,
  maxRows: 250000,
  maxLineBytes: 4 * 1024 * 1024,
});

function codedError(code) {
  return Object.assign(new Error(code), { code });
}

function requiredText(value, code, maxLength = 512) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw codedError(code);
  return text;
}

function normalizeRoot(value) {
  const supplied = requiredText(value, "company_mail_event_root_required", 4096);
  if (!isAbsolute(supplied)) throw codedError("company_mail_event_root_absolute_required");
  const absolute = resolve(supplied);
  let info;
  try {
    info = lstatSync(absolute);
  } catch {
    throw codedError("company_mail_event_root_unavailable");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw codedError("company_mail_event_root_invalid");
  return realpathSync.native(absolute);
}

async function jsonlFiles(root, maxFiles) {
  const pending = [root];
  const output = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) output.push(fullPath);
      if (output.length > maxFiles) throw codedError("company_mail_file_limit_exceeded");
    }
  }
  return output.sort();
}

function safeAddress(value) {
  if (!value || typeof value !== "object") return null;
  const name = typeof value.name === "string" ? value.name.slice(0, 300) : "";
  const address = typeof value.address === "string" ? value.address.slice(0, 320) : "";
  if (!name && !address) return null;
  return { name, address };
}

function safeAddresses(values) {
  return Array.isArray(values) ? values.map(safeAddress).filter(Boolean).slice(0, 200) : [];
}

function safeAttachments(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 200).map((item) => ({
    type: typeof item?.type === "string" ? item.type.slice(0, 80) : "attachment",
    name: typeof item?.name === "string" ? item.name.slice(0, 500) : null,
    mime: typeof item?.mime === "string" ? item.mime.slice(0, 200) : null,
    size: Number.isSafeInteger(item?.size) && item.size >= 0 ? item.size : null,
  }));
}

function safeMailbox(value) {
  if (!value || typeof value !== "object") return null;
  return {
    email: typeof value.email === "string" ? value.email.slice(0, 320) : null,
    display_name: typeof value.display_name === "string" ? value.display_name.slice(0, 300) : null,
    provider: typeof value.provider === "string" ? value.provider.slice(0, 100) : null,
  };
}

function text(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function decodeEntity(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  if (Object.hasOwn(named, value)) return named[value];
  const numeric = value.startsWith("#x") || value.startsWith("#X")
    ? Number.parseInt(value.slice(2), 16)
    : value.startsWith("#") ? Number.parseInt(value.slice(1), 10) : Number.NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0 || numeric > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(numeric);
  } catch {
    return " ";
  }
}

function htmlToPlainText(value, maxLength = 60000) {
  if (typeof value !== "string" || !value) return "";
  return value
    .slice(0, maxLength * 4)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([A-Za-z]+|#[0-9]+|#x[0-9A-Fa-f]+);/g, (_match, entity) => decodeEntity(entity))
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function plainBody(event, maxLength = 60000) {
  const plain = typeof event?.body_text === "string" ? event.body_text.trim().slice(0, maxLength) : "";
  return plain || htmlToPlainText(event?.body_html, maxLength);
}

function epoch(value) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function preview(value, maxLength = 500) {
  return text(value, maxLength * 3).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function eventSummary(event) {
  const attachments = safeAttachments(event.attachments);
  return {
    id: text(event.event_id, 160),
    source: text(event.source, 80),
    subject: text(event.subject, 1000),
    from: safeAddresses(event.from),
    to: safeAddresses(event.to),
    cc: safeAddresses(event.cc),
    received_at: text(event.received_at, 80) || null,
    ingested_at: text(event.ingested_at, 80) || null,
    ingest_status: text(event.ingest_status, 80) || null,
    has_body: Boolean(plainBody(event, 1)),
    attachment_count: attachments.length,
    preview: preview(plainBody(event, 1500)),
  };
}

function searchableText(event) {
  const addresses = [...safeAddresses(event.from), ...safeAddresses(event.to), ...safeAddresses(event.cc)]
    .flatMap((item) => [item.name, item.address]);
  return [event.subject, plainBody(event), ...addresses].filter((value) => typeof value === "string").join("\n").toLocaleLowerCase();
}

function parseBoundary(value, code) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = epoch(value);
  if (!Number.isFinite(parsed)) throw codedError(code);
  return parsed;
}

export class CompanyMailEventStore {
  constructor({ eventRoot, mailboxId, limits = {} } = {}) {
    this.eventRoot = normalizeRoot(eventRoot);
    this.mailboxId = requiredText(mailboxId, "company_mail_mailbox_id_required", 240);
    this.limits = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
  }

  async loadScopedEvents() {
    const files = await jsonlFiles(this.eventRoot, this.limits.maxFiles);
    const events = [];
    let rows = 0;
    for (const file of files) {
      const fileInfo = await stat(file);
      if (!fileInfo.isFile()) continue;
      const input = createReadStream(file, { encoding: "utf8" });
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          rows += 1;
          if (rows > this.limits.maxRows) throw codedError("company_mail_row_limit_exceeded");
          if (Buffer.byteLength(line, "utf8") > this.limits.maxLineBytes) throw codedError("company_mail_line_limit_exceeded");
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            throw codedError("company_mail_json_invalid");
          }
          if (event?.metadata?.mailbox?.id !== this.mailboxId) continue;
          if (typeof event.event_id !== "string" || !event.event_id) throw codedError("company_mail_event_id_invalid");
          events.push(event);
        }
      } finally {
        lines.close();
        input.destroy();
      }
    }
    return { events };
  }

  async status() {
    const { events } = await this.loadScopedEvents();
    const dates = events.map((event) => epoch(event.received_at)).filter(Number.isFinite).sort((a, b) => a - b);
    const ids = new Set();
    let duplicateEventIds = 0;
    let bodyMissing = 0;
    let attachmentCount = 0;
    for (const event of events) {
      if (ids.has(event.event_id)) duplicateEventIds += 1;
      ids.add(event.event_id);
      if (!plainBody(event, 1)) bodyMissing += 1;
      attachmentCount += safeAttachments(event.attachments).length;
    }
    return {
      mailbox: safeMailbox(events[0]?.metadata?.mailbox),
      event_count: events.length,
      first_received_at: dates.length ? new Date(dates[0]).toISOString() : null,
      latest_received_at: dates.length ? new Date(dates.at(-1)).toISOString() : null,
      readable_body_present_count: events.length - bodyMissing,
      readable_body_missing_count: bodyMissing,
      attachment_descriptor_count: attachmentCount,
      duplicate_event_id_count: duplicateEventIds,
      scope: "configured_mailbox_only",
      mutation_capability: false,
    };
  }

  async search({ query, after, before, from, to, limit = 20 } = {}) {
    const { events } = await this.loadScopedEvents();
    const queryText = typeof query === "string" ? query.trim().toLocaleLowerCase() : "";
    const fromText = typeof from === "string" ? from.trim().toLocaleLowerCase() : "";
    const toText = typeof to === "string" ? to.trim().toLocaleLowerCase() : "";
    const afterTime = parseBoundary(after, "company_mail_after_invalid");
    const beforeTime = parseBoundary(before, "company_mail_before_invalid");
    if (afterTime !== null && beforeTime !== null && afterTime > beforeTime) throw codedError("company_mail_date_range_invalid");
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const matched = events.filter((event) => {
      const received = epoch(event.received_at);
      if (afterTime !== null && (!Number.isFinite(received) || received < afterTime)) return false;
      if (beforeTime !== null && (!Number.isFinite(received) || received > beforeTime)) return false;
      if (queryText && !searchableText(event).includes(queryText)) return false;
      if (fromText && !safeAddresses(event.from).some((item) => `${item.name}\n${item.address}`.toLocaleLowerCase().includes(fromText))) return false;
      if (toText && !safeAddresses(event.to).some((item) => `${item.name}\n${item.address}`.toLocaleLowerCase().includes(toText))) return false;
      return true;
    });
    matched.sort((left, right) => (epoch(right.received_at) || 0) - (epoch(left.received_at) || 0) || String(right.event_id).localeCompare(String(left.event_id)));
    return {
      results: matched.slice(0, boundedLimit).map(eventSummary),
      returned_count: Math.min(matched.length, boundedLimit),
      matched_count: matched.length,
      scope: "configured_mailbox_only",
    };
  }

  async read({ eventId, maxChars = 12000 } = {}) {
    const id = requiredText(eventId, "company_mail_event_id_required", 160);
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw codedError("company_mail_event_id_invalid");
    const { events } = await this.loadScopedEvents();
    const event = events.find((item) => item.event_id === id);
    if (!event) throw codedError("company_mail_event_not_found");
    const attachments = safeAttachments(event.attachments);
    const fullBody = plainBody(event);
    const body = text(fullBody, Math.max(1000, Math.min(20000, Number(maxChars) || 12000)));
    return {
      ...eventSummary(event),
      provider_message_id: text(event.provider_message_id, 1000) || null,
      body_text: body,
      body_truncated: fullBody.length > body.length,
      attachments,
      content_trust: "untrusted_external_mail",
      scope: "configured_mailbox_only",
    };
  }
}
