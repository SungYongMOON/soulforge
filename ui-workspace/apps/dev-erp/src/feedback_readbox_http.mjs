import { createHash } from 'node:crypto';
import { feedbackReadboxScript, renderFeedbackReadboxView } from './feedback_readbox_view.mjs';

const BASE = '/api/workbench/feedback-readbox';
const PAGE = '/workbench/feedback-readbox';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const REF = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const DELIVERY = new Set(['NOT_OBSERVED', 'PREPARED', 'DELIVERY_UNKNOWN', 'ACKNOWLEDGED']);
const fail = (status, code) => { throw Object.assign(new Error(code), { readboxStatus: status, readboxCode: code }); };
const validRef = value => typeof value === 'string' && REF.test(value);
function metadata(item) {
  if (!item || !validRef(item.ref) || !HASH.test(item.sha256) || !['result', 'manager_notice'].includes(item.kind)) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
  const output = { ref: item.ref, sha256: item.sha256 };
  for (const key of ['kind', 'event_key', 'state', 'run_ref', 'reason']) {
    if (item[key] === null) output[key] = null;
    else if (item[key] !== undefined) {
      if (!validRef(item[key])) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
      output[key] = item[key];
    }
  }
  if (typeof item.observed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/u.test(item.observed_at)) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
  output.observed_at = item.observed_at;
  output.review = item.review == null ? null : {
    status: validRef(item.review.status) ? item.review.status : 'UNKNOWN',
    ref: validRef(item.review.ref) ? item.review.ref : null,
  };
  if (!Array.isArray(item.evidence_refs) || item.evidence_refs.length > 100) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
  output.evidence_refs = item.evidence_refs.map(pin => {
    if (typeof pin === 'string' && validRef(pin)) return pin;
    if (!pin || !validRef(pin.ref) || !HASH.test(pin.sha256)) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
    return { ref: pin.ref, sha256: pin.sha256 };
  });
  output.local_recorded = item.local_recorded === true;
  if (!DELIVERY.has(item.buzz_delivery)) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
  output.buzz_delivery = item.buzz_delivery;
  output.human_acceptance = 'UNKNOWN';
  output.official_done = false;
  output.owner_decision_required = false;
  return output;
}
function send(res, status, value, html = false) {
  res.statusCode = status;
  res.setHeader('Content-Type', html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', html
    ? `default-src 'none'; connect-src 'self'; script-src 'sha256-${createHash('sha256').update(feedbackReadboxScript).digest('base64')}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
    : "sandbox; default-src 'none'");
  res.end(html ? value : JSON.stringify(value));
}

/** Read-only adapter. The service owns evidence pinning and manager binding. */
export function createFeedbackReadboxHttpController({ service = null, enabled = service !== null, allowedOrigin,
  currentAccount, sessionKey, canAccessProject } = {}) {
  if (![currentAccount, sessionKey, canAccessProject].every(value => typeof value === 'function')) throw new TypeError('server_auth_required');
  let origin;
  try {
    const candidate = new URL(allowedOrigin);
    if (candidate.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(candidate.hostname)
      && !candidate.username && !candidate.password && candidate.pathname === '/' && !candidate.search && !candidate.hash) origin = candidate;
  } catch { /* An unbound reader stays unavailable. */ }
  async function principal(req) {
    const account = await currentAccount(req), session = await sessionKey(req);
    if (!account?.id || !session) fail(401, 'AUTH_REQUIRED');
    return { accountId: account.id, hash: createHash('sha256').update(JSON.stringify([account.id, session])).digest('hex') };
  }
  return async function feedbackReadboxHttp(req, res, url) {
    if (url.pathname !== PAGE && url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); fail(405, 'METHOD_NOT_ALLOWED'); }
      const page = url.pathname === PAGE;
      if (!origin || !LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== origin.host
        || (page ? !['same-origin', 'none'].includes(req.headers['sec-fetch-site']) : req.headers['sec-fetch-site'] !== 'same-origin')
        || (req.headers.origin !== undefined && req.headers.origin !== origin.origin)) fail(403, 'ORIGIN_OR_LOOPBACK_REQUIRED');
      if (req.url !== `${url.pathname}${url.search}` || ![PAGE, BASE, `${BASE}/evidence`].includes(url.pathname)) fail(404, 'ROUTE_NOT_FOUND');
      const keys = [...url.searchParams.keys()], evidence = url.pathname === `${BASE}/evidence`;
      let query;
      if (evidence) {
        const ref = url.searchParams.get('ref'), sha256 = url.searchParams.get('sha256');
        if (keys.length !== 2 || new Set(keys).size !== keys.length || !keys.every(key => ['ref', 'sha256'].includes(key))
          || !validRef(ref) || !HASH.test(sha256)) fail(400, 'INVALID_QUERY');
        query = { ref, sha256 };
      } else {
        const limit = url.searchParams.get('limit');
        if ((page && url.search) || keys.some(key => key !== 'limit') || keys.length > 1
          || (limit !== null && (!/^[1-9][0-9]{0,2}$/u.test(limit) || Number(limit) > 100))) fail(400, 'INVALID_QUERY');
        query = { limit: limit === null ? 50 : Number(limit) };
      }
      if (!enabled) fail(404, 'FEEDBACK_READBOX_DISABLED');
      const p = await principal(req);
      if (!service) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
      const projects = new Set();
      const access = { accountId: p.accountId,
        checkSession: async () => { try { return (await principal(req)).hash === p.hash; } catch { return false; } },
        canAccessProject: project => { projects.add(project); return canAccessProject(req, project); } };
      const result = evidence ? await service.detail(query, access) : await service.snapshot(query, access);
      if (!validRef(result?.project_id)) fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
      projects.add(result.project_id);
      if (!await access.checkSession()) fail(401, 'AUTH_REQUIRED');
      for (const project of projects) if (await canAccessProject(req, project) !== true) fail(403, 'FEEDBACK_READBOX_ACCESS_REQUIRED');
      if (!await access.checkSession()) fail(401, 'AUTH_REQUIRED');
      if (page) send(res, 200, renderFeedbackReadboxView(), true);
      else if (evidence) {
        if (result.ref !== query.ref || result.sha256 !== query.sha256) fail(409, 'FEEDBACK_READBOX_PIN_CHANGED');
        send(res, 200, { project_id: result.project_id, ...metadata(result) });
      }
      else {
        if (result.state !== 'CURRENT' || !Array.isArray(result.items) || result.items.length > query.limit
          || typeof result.has_more !== 'boolean') fail(503, 'FEEDBACK_READBOX_UNAVAILABLE');
        send(res, 200, { state: 'CURRENT', project_id: result.project_id, items: result.items.map(metadata), has_more: result.has_more });
      }
    } catch (error) {
      const known = { FEEDBACK_READBOX_ACCESS_REQUIRED: 403, FEEDBACK_READBOX_AUTH_REQUIRED: 401,
        FEEDBACK_READBOX_RECORD_NOT_FOUND: 404, FEEDBACK_READBOX_PIN_CHANGED: 409 };
      const code = error.readboxCode ?? (Object.hasOwn(known, error.feedbackCode) ? error.feedbackCode : 'FEEDBACK_READBOX_UNAVAILABLE');
      send(res, error.readboxStatus ?? known[code] ?? 503, { hold_code: code });
    }
    return true;
  };
}
