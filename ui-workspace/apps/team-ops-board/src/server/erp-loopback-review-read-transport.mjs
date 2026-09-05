// Loopback read transport for the ERP "pending reviews" projection.
//
// One fixed request: GET <loopback ERP>/api/mcp/reviews/pending?days=&limit=
// with a bearer credential supplied by the caller at call time. The transport
// accepts only the exact ERP envelope, bounds the body, and returns sanitized
// aggregate rows: identifiers, project refs, submitter, timestamps, counts and
// item status. Submission summaries and item titles are validated and then
// discarded so raw work text never reaches the Board.
import { request as httpRequest } from "node:http";

export const ERP_REVIEWS_PENDING_PATH = "/api/mcp/reviews/pending";
export const ERP_REVIEW_DEFAULT_URL = `http://127.0.0.1:4300${ERP_REVIEWS_PENDING_PATH}`;
export const ERP_REVIEW_WINDOW_DAYS = 14;
export const ERP_REVIEW_ROW_LIMIT = 50;

const DEFAULT_MAX_RESPONSE_BYTES = 262_144;
const ENVELOPE_FIELDS = new Set(["days", "limit", "proposals", "work_sessions"]);
const PROPOSAL_FIELDS = new Set(["id", "kind", "status", "at", "source", "item_ref", "project_ref"]);
const WORK_SESSION_REQUIRED_FIELDS = new Set([
  "work_session_id",
  "item_id",
  "project_id",
  "username",
  "created_at",
  "summary",
  "artifact_count",
]);
// Present once the ERP carries the "제출됨·미수락" read fields; absent on older packs.
const WORK_SESSION_OPTIONAL_FIELDS = new Set(["item_status", "item_title"]);
const FIXED_TRANSPORT_CODES = new Set([
  "ERP_REVIEW_DISCONNECTED",
  "ERP_REVIEW_TIMEOUT",
  "ERP_REVIEW_UNAUTHORIZED",
  "ERP_REVIEW_ROUTE_DISABLED",
  "ERP_REVIEW_RATE_LIMITED",
  "ERP_REVIEW_RESPONSE_MALFORMED",
  "ERP_REVIEW_RESPONSE_OVERSIZE",
]);

function fixedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configurationError() {
  return fixedError("ERP_REVIEW_URL_INVALID", "erp review transport configuration invalid");
}

function malformed() {
  return fixedError("ERP_REVIEW_RESPONSE_MALFORMED", "erp review response malformed");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function isBoundedString(value, maximum = 200) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isBoundedText(value, maximum) {
  return typeof value === "string"
    && value.length <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function isTimestamp(value) {
  return isBoundedString(value, 64) && Number.isFinite(Date.parse(value));
}

function nullableLabel(value, maximum = 200) {
  return value === null || isBoundedString(value, maximum);
}

export function validateErpReviewUrl(value = ERP_REVIEW_DEFAULT_URL) {
  if (typeof value !== "string" || value.length === 0) throw configurationError();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw configurationError();
  }
  const port = Number(parsed.port);
  if (
    parsed.href !== value
    || value.includes("?")
    || value.includes("#")
    || parsed.protocol !== "http:"
    || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]")
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== ERP_REVIEWS_PENDING_PATH
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.port === ""
    || !Number.isSafeInteger(port)
    || port < 1_024
    || port > 65_535
  ) {
    throw configurationError();
  }
  return parsed;
}

// The Owner-facing link is the ERP web root on the same loopback origin with
// the fixed "검사 중" deep link. It carries no credential, id, or query data.
export function buildErpReviewLink(url = ERP_REVIEW_DEFAULT_URL) {
  const parsed = validateErpReviewUrl(url);
  return `${parsed.origin}/?view=mod:reviews`;
}

function validProposal(row) {
  return hasExactKeys(row, PROPOSAL_FIELDS)
    && isBoundedString(row.id)
    && isBoundedString(row.kind, 80)
    && row.status === "pending"
    && isTimestamp(row.at)
    && isBoundedString(row.source, 80)
    && nullableLabel(row.item_ref)
    && nullableLabel(row.project_ref, 80);
}

function validWorkSession(row) {
  if (!isPlainObject(row)) return false;
  const keys = Object.keys(row);
  if (!keys.every((key) => WORK_SESSION_REQUIRED_FIELDS.has(key) || WORK_SESSION_OPTIONAL_FIELDS.has(key))) return false;
  if (![...WORK_SESSION_REQUIRED_FIELDS].every((key) => keys.includes(key))) return false;
  const hasStatus = keys.includes("item_status");
  const hasTitle = keys.includes("item_title");
  return isBoundedString(row.work_session_id)
    && isBoundedString(row.item_id)
    && nullableLabel(row.project_id, 80)
    && nullableLabel(row.username, 120)
    && isTimestamp(row.created_at)
    && isBoundedText(row.summary, 500)
    && Number.isSafeInteger(row.artifact_count)
    && row.artifact_count >= 0
    && (!hasStatus || nullableLabel(row.item_status, 40))
    && (!hasTitle || isBoundedText(row.item_title, 200));
}

function sanitizeProposal(row) {
  return {
    proposal_id: row.id,
    kind: row.kind,
    at: row.at,
    source: row.source,
    item_ref: row.item_ref,
    project_ref: row.project_ref,
  };
}

function sanitizeWorkSession(row) {
  return {
    work_session_id: row.work_session_id,
    item_id: row.item_id,
    project_id: row.project_id,
    username: row.username,
    created_at: row.created_at,
    artifact_count: row.artifact_count,
    item_status: Object.hasOwn(row, "item_status") ? row.item_status : null,
  };
}

export function validateErpReviewEnvelope(value) {
  if (
    !hasExactKeys(value, ENVELOPE_FIELDS)
    || !Number.isSafeInteger(value.days) || value.days < 1 || value.days > 30
    || !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > ERP_REVIEW_ROW_LIMIT
    || !Array.isArray(value.proposals) || value.proposals.length > ERP_REVIEW_ROW_LIMIT
    || !Array.isArray(value.work_sessions) || value.work_sessions.length > ERP_REVIEW_ROW_LIMIT
    || !value.proposals.every(validProposal)
    || !value.work_sessions.every(validWorkSession)
  ) {
    throw malformed();
  }
  return {
    days: value.days,
    limit: value.limit,
    proposals: value.proposals.map(sanitizeProposal),
    work_sessions: value.work_sessions.map(sanitizeWorkSession),
  };
}

function headerValue(headers, name) {
  const value = headers?.[name];
  return typeof value === "string" ? value : null;
}

async function readBoundedBody(body, maximum) {
  if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const bytes = Buffer.from(body);
    if (bytes.byteLength > maximum) throw fixedError("ERP_REVIEW_RESPONSE_OVERSIZE", "erp review response oversized");
    return bytes;
  }
  if (body === null || body === undefined || typeof body[Symbol.asyncIterator] !== "function") throw malformed();
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of body) {
      if (!(typeof chunk === "string" || Buffer.isBuffer(chunk) || chunk instanceof Uint8Array)) throw malformed();
      const bytes = Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maximum) throw fixedError("ERP_REVIEW_RESPONSE_OVERSIZE", "erp review response oversized");
      chunks.push(bytes);
    }
  } catch (error) {
    // Bail out of a still-open upstream connection immediately on any bound
    // violation instead of leaving it to the async-iterator protocol's own
    // cleanup; the ERP response stream is not ours to keep alive once we know
    // we will not read the rest of it.
    if (typeof body.destroy === "function" && body.destroyed !== true) {
      try { body.destroy(); } catch { /* best effort */ }
    }
    throw error;
  }
  return Buffer.concat(chunks, total);
}

function defaultHttpGet(options) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(options, (response) => resolve({
      statusCode: response.statusCode,
      headers: response.headers,
      body: response,
    }));
    request.once("error", reject);
    request.end();
  });
}

function statusError(statusCode) {
  if (statusCode === 401 || statusCode === 403) return fixedError("ERP_REVIEW_UNAUTHORIZED", "erp review read unauthorized");
  if (statusCode === 404) return fixedError("ERP_REVIEW_ROUTE_DISABLED", "erp review route disabled");
  if (statusCode === 429) return fixedError("ERP_REVIEW_RATE_LIMITED", "erp review read rate limited");
  return malformed();
}

export function createErpLoopbackReviewReadTransport({
  url = ERP_REVIEW_DEFAULT_URL,
  httpGet = defaultHttpGet,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  timeoutMs = 2_000,
  days = ERP_REVIEW_WINDOW_DAYS,
  limit = ERP_REVIEW_ROW_LIMIT,
} = {}) {
  const parsed = validateErpReviewUrl(url);
  if (typeof httpGet !== "function") throw configurationError();
  const maximum = Number.isSafeInteger(maxResponseBytes) && maxResponseBytes > 0 && maxResponseBytes <= 1_048_576
    ? maxResponseBytes
    : DEFAULT_MAX_RESPONSE_BYTES;
  const timeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000 ? timeoutMs : 2_000;
  const windowDays = Number.isSafeInteger(days) && days >= 1 && days <= 30 ? days : ERP_REVIEW_WINDOW_DAYS;
  const rowLimit = Number.isSafeInteger(limit) && limit >= 1 && limit <= ERP_REVIEW_ROW_LIMIT ? limit : ERP_REVIEW_ROW_LIMIT;
  const requestPath = `${ERP_REVIEWS_PENDING_PATH}?days=${windowDays}&limit=${rowLimit}`;

  return Object.freeze({
    link: `${parsed.origin}/?view=mod:reviews`,
    windowDays,
    async read(token) {
      if (typeof token !== "string" || token.length === 0) throw fixedError("ERP_REVIEW_UNAUTHORIZED", "erp review read unauthorized");
      const controller = new AbortController();
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(fixedError("ERP_REVIEW_TIMEOUT", "erp review read timeout"));
        }, timeout);
      });
      const readOperation = (async () => {
        let response;
        try {
          response = await httpGet({
            method: "GET",
            protocol: "http:",
            hostname: parsed.hostname === "[::1]" ? "::1" : parsed.hostname,
            port: Number(parsed.port),
            path: requestPath,
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
        } catch {
          throw fixedError("ERP_REVIEW_DISCONNECTED", "erp review disconnected");
        }
        if (response?.statusCode !== 200) throw statusError(response?.statusCode);
        if (
          !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(headerValue(response.headers, "content-type") ?? "")
          || headerValue(response.headers, "cache-control") !== "no-store"
        ) {
          throw malformed();
        }
        const bytes = await readBoundedBody(response.body, maximum);
        let envelope;
        try {
          envelope = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw malformed();
        }
        return validateErpReviewEnvelope(envelope);
      })();
      try {
        return await Promise.race([readOperation, timeoutPromise]);
      } catch (error) {
        if (FIXED_TRANSPORT_CODES.has(error?.code)) throw error;
        throw malformed();
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
