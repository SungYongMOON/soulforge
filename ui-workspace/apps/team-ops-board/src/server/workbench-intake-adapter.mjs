import { randomBytes } from "node:crypto";
import { normalizeWorkBindingRequest, evaluateWorkBinding } from "../../../../../guild_hall/shared/work_binding.mjs";
import { isWorkbenchIntakeRecord } from "../core/workbench-intake-record.mjs";

const COLLECTION = "/api/workbench/requests";
const ITEM = /^\/api\/workbench\/requests\/(w_[a-f0-9]{32})$/u;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const ACTOR = /^(?:owner\.local|member\.[a-f0-9]{16})$/u;
const jsonResponse = (res, status, value) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(value));
};
const reject = (res, status, code) => jsonResponse(res, status, { status: "HOLD", hold_code: code, claim_created: false, execution_started: false });
const statusFor = code => {
  if (["AUTH_REQUIRED", "SCOPE_VIOLATION", "POLICY_SLOT_UNKNOWN", "TASK_BINDING_MISMATCH"].includes(code)) return 403;
  if (["IDEMPOTENCY_KEY_CONFLICT", "REQUEST_ID_CONFLICT", "EXISTING_RECORD_AMBIGUOUS", "REVISION_PARENT_UNAVAILABLE", "REVISION_SEQUENCE_CONFLICT", "REVISION_ALREADY_EXISTS"].includes(code)) return 409;
  if (["REQUEST_INVALID", "SECRET_FORBIDDEN", "LOCAL_PATH_FORBIDDEN", "INPUT_TOO_LARGE", "INPUT_TOO_DEEP"].includes(code)) return 400;
  return 503;
};

function publicStatus(record, binding, replayed = false) {
  return {
    status: "RECORDED", request_id: record.request_id, created_at: record.created_at,
    project_code: record.request.project_code, stage_code: record.request.stage_code,
    artifact_family_id: record.request.artifact_family_id, kind: record.request.kind,
    mapping_status: binding.status, hold_code: binding.hold_code, replayed,
    claim_created: false, execution_started: false, acceptance_authority: false,
  };
}

async function readJson(req, maxBytes) {
  const contentType = req.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
    || (req.headers["content-encoding"] !== undefined && req.headers["content-encoding"] !== "identity")) return { code: "CONTENT_TYPE_REQUIRED", status: 415 };
  const length = req.headers["content-length"];
  if (length !== undefined && (typeof length !== "string" || !/^\d{1,9}$/u.test(length))) return { code: "BODY_INVALID", status: 400 };
  if (length !== undefined && Number(length) > maxBytes) return { code: "BODY_TOO_LARGE", status: 413 };
  let total = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) return { code: "BODY_TOO_LARGE", status: 413 };
      chunks.push(bytes);
    }
    if (length !== undefined && Number(length) !== total) return { code: "BODY_INVALID", status: 400 };
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { value: JSON.parse(text) };
  } catch { return { code: "BODY_INVALID", status: 400 }; }
}

/**
 * Separate request handler, never registered into Vite/read-only pilot here. Session, CSRF and
 * current evidence providers are server-owned dependencies; request JSON cannot supply them.
 * This handler records metadata only. It neither reserves an execution claim nor calls a model.
 */
export function createWorkbenchIntakeHandler({
  store, enabled = false, readOnlyPilot = true, allowedOrigin, verifySession, verifyCsrf,
  currentEvidenceProvider, requestIdFactory = () => `w_${randomBytes(16).toString("hex")}`,
  now = () => new Date().toISOString(), maxBodyBytes = 16384,
} = {}) {
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 256 || maxBodyBytes > 65536) throw new TypeError("Bounded intake body size required");
  let allowedHost = null;
  try { allowedHost = new URL(allowedOrigin).host; } catch { /* Invalid configuration remains unavailable. */ }
  const configured = typeof allowedOrigin === "string" && /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/u.test(allowedOrigin)
    && allowedHost !== null
    && typeof verifySession === "function" && typeof verifyCsrf === "function"
    && typeof currentEvidenceProvider === "function" && typeof store?.record === "function" && typeof store?.read === "function";

  return async (req, res) => {
    const path = typeof req.url === "string" ? req.url : "";
    const match = ITEM.exec(path);
    if (path !== COLLECTION && match === null) return reject(res, 404, "ROUTE_NOT_FOUND");
    const isPost = path === COLLECTION && req.method === "POST";
    const isGet = match !== null && req.method === "GET";
    if (!isPost && !isGet) { res.setHeader("Allow", path === COLLECTION ? "POST" : "GET"); return reject(res, 405, "METHOD_NOT_ALLOWED"); }
    if (isPost && (enabled !== true || readOnlyPilot !== false)) return reject(res, 405, "INTAKE_DISABLED");
    if (!configured) return reject(res, 503, "SERVER_BINDING_UNAVAILABLE");
    const origin = req.headers?.origin;
    const fetchSite = req.headers?.["sec-fetch-site"];
    const fetchAllowed = fetchSite === undefined || fetchSite === "same-origin";
    // Same-origin fetch GET omits Origin. Host and fetch metadata are required
    // for that browser form; explicit Origin never overrides a foreign Host.
    const originAllowed = isPost ? origin === allowedOrigin
      : origin === allowedOrigin || (origin === undefined && fetchSite === "same-origin");
    if (!LOOPBACK.has(req.socket?.remoteAddress) || req.headers?.host !== allowedHost
      || !fetchAllowed || !originAllowed) return reject(res, 403, "ORIGIN_OR_LOOPBACK_REQUIRED");
    let session;
    try { session = await verifySession(req); } catch { return reject(res, 403, "AUTH_REQUIRED"); }
    if (typeof session?.requester !== "string" || !ACTOR.test(session.requester)) return reject(res, 403, "AUTH_REQUIRED");
    if (isPost) {
      try { if (await verifyCsrf({ request: req, session }) !== true) return reject(res, 403, "CSRF_REQUIRED"); }
      catch { return reject(res, 403, "CSRF_REQUIRED"); }
      const body = await readJson(req, maxBodyBytes);
      if (body.code) return reject(res, body.status, body.code);
      const normalized = normalizeWorkBindingRequest(body.value);
      if (normalized.status !== "NORMALIZED") return reject(res, 400, normalized.hold_code);
      if (normalized.request.requester !== session.requester) return reject(res, 403, "AUTH_REQUIRED");
      try {
        const evidence = await currentEvidenceProvider({ request: normalized.request, session, operation: "record" });
        const binding = evaluateWorkBinding(normalized.request, evidence);
        if (binding.status === "HOLD") return reject(res, statusFor(binding.hold_code), binding.hold_code);
        const result = await store.record(normalized.request, { trusted_evidence: evidence, request_id: requestIdFactory(), created_at: now() });
        if (result.status !== "RECORDED" || result.persisted !== true) return reject(res, statusFor(result.hold_code), result.hold_code ?? "STORE_UNAVAILABLE");
        if (!isWorkbenchIntakeRecord(result.record)) return reject(res, 503, "STORE_RECORD_INVALID");
        return jsonResponse(res, result.replayed ? 200 : 201, publicStatus(result.record, binding, result.replayed));
      } catch { return reject(res, 503, "CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE"); }
    }
    try {
      const result = await store.read(match[1]);
      if (result.status === "NOT_FOUND") return reject(res, 404, "REQUEST_NOT_FOUND");
      if (result.status !== "FOUND" || !isWorkbenchIntakeRecord(result.record)) return reject(res, 503, "STORE_RECORD_UNAVAILABLE");
      if (result.record.request.requester !== session.requester) return reject(res, 404, "REQUEST_NOT_FOUND");
      const evidence = await currentEvidenceProvider({ request: result.record.request, session, operation: "read" });
      const binding = evaluateWorkBinding(result.record.request, evidence);
      if (binding.status === "HOLD") {
        if (statusFor(binding.hold_code) === 403) return reject(res, 404, "REQUEST_NOT_FOUND");
        return reject(res, 503, "CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE");
      }
      return jsonResponse(res, 200, publicStatus(result.record, binding));
    } catch { return reject(res, 503, "CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE"); }
  };
}
