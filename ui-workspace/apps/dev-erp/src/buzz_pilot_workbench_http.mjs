import { createHash } from 'node:crypto';

const BASE = '/api/workbench/buzz-pilot';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ROLES = new Set(['instruction', 'original_message', 'question', 'answer', 'tool_input', 'tool_output', 'final_response']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
function headers(res, type = 'application/json; charset=utf-8') {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
}
function send(res, status, value) {
  res.statusCode = status; headers(res); res.end(JSON.stringify(value));
}

/** One bound Buzz job, read through the existing account/session/project ports.
 * The producer's authorize callback owns the exact current Owner decision.
 * No issue, append, model or tool operation is exposed by this controller. */
export function createBuzzPilotWorkbenchHttpController({ service = null, enabled = service !== null, allowedOrigin,
  currentAccount, sessionKey, canAccessProject, authSourcePort = null } = {}) {
  if (![currentAccount, sessionKey, canAccessProject].every(value => typeof value === 'function')) throw new TypeError('server_auth_required');
  let origin;
  try {
    const candidate = new URL(allowedOrigin);
    if (candidate.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(candidate.hostname)
      && !candidate.username && !candidate.password && candidate.pathname === '/' && !candidate.search && !candidate.hash) origin = candidate;
  } catch { /* Missing exact loopback binding stays unavailable. */ }
  let loginUrl = null;
  if (origin && /^[1-9][0-9]{0,4}$/u.test(String(authSourcePort)) && Number(authSourcePort) <= 65535) {
    const source = new URL(origin.origin); source.port = String(authSourcePort);
    loginUrl = source.href;
  }
  async function principal(req) {
    const account = await currentAccount(req), session = await sessionKey(req);
    if (!account?.id || !session) fail(401, 'AUTH_REQUIRED');
    return { accountId: account.id, hash: createHash('sha256').update(JSON.stringify([account.id, session])).digest('hex') };
  }
  return async function buzzPilotWorkbenchHttp(req, res, url) {
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); fail(405, 'METHOD_NOT_ALLOWED'); }
      if (!origin || !LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== origin.host
        || req.headers['sec-fetch-site'] !== 'same-origin'
        || (req.headers.origin !== undefined && req.headers.origin !== origin.origin)) fail(403, 'ORIGIN_OR_LOOPBACK_REQUIRED');
      if (req.url !== `${url.pathname}${url.search}` || ![BASE, `${BASE}/evidence`].includes(url.pathname)) fail(404, 'ROUTE_NOT_FOUND');
      let query;
      if (url.pathname === BASE) {
        if (url.search) fail(400, 'INVALID_QUERY');
      } else {
        const keys = [...url.searchParams.keys()];
        const role = url.searchParams.get('role'), observationId = url.searchParams.get('observation_id');
        if (keys.some(key => !['role', 'observation_id'].includes(key)) || new Set(keys).size !== keys.length
          || !ROLES.has(role) || (observationId !== null && !ID.test(observationId))
          || (role !== 'instruction' && observationId === null)) fail(400, 'INVALID_QUERY');
        query = { role, ...(observationId === null ? {} : { observation_id: observationId }) };
      }
      if (!enabled) fail(404, 'BUZZ_PILOT_DISABLED');
      const p = await principal(req);
      if (!service) fail(503, 'BUZZ_PILOT_UNAVAILABLE');
      const checkedProjects = new Set();
      const access = { accountId: p.accountId,
        checkSession: async () => { try { return (await principal(req)).hash === p.hash; } catch { return false; } },
        canAccessProject: project => { checkedProjects.add(project); return canAccessProject(req, project); } };
      const result = query ? await service.readEvidence(query, access) : await service.snapshot(access);
      if (!await access.checkSession()) fail(401, 'AUTH_REQUIRED');
      for (const project of checkedProjects) if (await canAccessProject(req, project) !== true) fail(403, 'BUZZ_PILOT_ACCESS_REQUIRED');
      if (!query) {
        // Session recovery identifiers belong to the trusted local observer.
        // Owner-facing status needs the job state and evidence, not that seam.
        const { recovery_metadata: ignoredRecovery, ...view } = result;
        send(res, 200, view);
      }
      else {
        if (!Buffer.isBuffer(result.bytes) || result.bytes.length > 65536
          || result.bytes.length !== result.size || !['text/plain', 'application/json'].includes(result.mediaType)) fail(503, 'BUZZ_PILOT_UNAVAILABLE');
        res.statusCode = 200; headers(res, `${result.mediaType}; charset=utf-8`);
        res.setHeader('Content-Disposition', `attachment; filename="buzz-${query.role}.${result.mediaType === 'application/json' ? 'json' : 'txt'}"`);
        res.end(result.bytes);
      }
    } catch (error) {
      const status = error.status ?? (error.code === 'buzz_pilot_not_authorized' ? 403
        : ['buzz_pilot_job_missing', 'buzz_pilot_evidence_missing'].includes(error.code) ? 404 : 503);
      const code = error.status ? error.code : status === 403 ? 'BUZZ_PILOT_ACCESS_REQUIRED'
        : status === 404 ? 'BUZZ_PILOT_RECORD_NOT_FOUND' : 'BUZZ_PILOT_UNAVAILABLE';
      send(res, status, { hold_code: code,
        ...(status === 401 && code === 'AUTH_REQUIRED' && service && loginUrl ? { login_url: loginUrl } : {}) });
    }
    return true;
  };
}
