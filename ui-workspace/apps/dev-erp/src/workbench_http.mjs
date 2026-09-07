import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { createWorkbenchIntakeHandler } from '../../team-ops-board/src/server/workbench-intake-adapter.mjs';
import { createWorkbenchIntakeStore } from '../../team-ops-board/src/server/workbench-intake-store.mjs';
import { isWorkbenchIntakeRecord } from '../../team-ops-board/src/core/workbench-intake-record.mjs';
import { requesterForAccount } from './workbench_current_sources.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const EXECUTION_ROUTE = /^\/api\/workbench\/requests\/(w_[a-f0-9]{32})\/(execution(?:\/cancel)?|candidate)$/u;
const REVISION_ROUTE = /^\/api\/workbench\/requests\/(w_[a-f0-9]{32})\/revision$/u;
const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};
const reject = (res, status, hold_code) => send(res, status, {
  status: 'HOLD', hold_code, claim_created: false, execution_started: false,
});

async function emptyJson(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] ?? '')
    || (req.headers['content-encoding'] !== undefined && req.headers['content-encoding'] !== 'identity')) return [415, 'CONTENT_TYPE_REQUIRED'];
  const length = req.headers['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^\d{1,9}$/u.test(length))) return [400, 'BODY_INVALID'];
  if (Number(length) > 256) return [413, 'BODY_TOO_LARGE'];
  let total = 0; const chunks = [];
  try {
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk); total += bytes.length;
      if (total > 256) return [413, 'BODY_TOO_LARGE'];
      chunks.push(bytes);
    }
    if (length !== undefined && Number(length) !== total) return [400, 'BODY_INVALID'];
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return null;
  } catch { /* Only an empty JSON object is accepted. */ }
  return [400, 'BODY_INVALID'];
}

/** Authenticated intake with an independently opted-in, server-owned synthetic executor. */
export function createWorkbenchHttpController({ enabled = false, allowedOrigin, intakeRoot, sources,
  executionService = null, currentAccount, sessionKey, accountIds, canAccessProject, now = () => Date.now() } = {}) {
  if (![currentAccount, sessionKey, accountIds, canAccessProject].every(value => typeof value === 'function')) {
    throw new TypeError('Server-owned session, account inventory and project access required');
  }
  let store = null;
  try { if (intakeRoot) store = createWorkbenchIntakeStore({ root: intakeRoot }); } catch { /* Unavailable, never fall back. */ }
  let host = null;
  try { host = new URL(allowedOrigin).host; } catch { /* Fail closed. */ }
  const configured = sources && store && typeof allowedOrigin === 'string'
    && /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/u.test(allowedOrigin);
  const sessions = new Map();
  const identities = new Map();
  async function verifySession(req) {
    const account = await currentAccount(req);
    const key = await sessionKey(req);
    if (!account || typeof account.id !== 'string' || typeof key !== 'string' || !key || !sources) return null;
    const requester = requesterForAccount(sources.realmId, account.id);
    const ids = await accountIds();
    if (!Array.isArray(ids) || ids.length > 10000 || !ids.includes(account.id)) return null;
    const matching = ids.filter(value => requesterForAccount(sources.realmId, value) === requester);
    if (matching.length !== 1 || (identities.has(requester) && identities.get(requester) !== account.id)) return null;
    identities.set(requester, account.id);
    const sessionHash = createHash('sha256').update(JSON.stringify(['workbench.csrf.v1', sources.realmId, account.id, key])).digest('hex');
    return { requester, accountId: account.id, sessionHash };
  }
  function csrfFor(session) {
    const time = now();
    for (const [key, value] of sessions) if (value.expiresAt <= time) sessions.delete(key);
    let entry = sessions.get(session.sessionHash);
    if (!entry) {
      if (sessions.size >= 256) throw new Error('Session limit');
      entry = { token: randomBytes(32).toString('hex'), expiresAt: time + 12 * 3600 * 1000 };
      sessions.set(session.sessionHash, entry);
    }
    return entry.token;
  }
  function verifyCsrf({ request, session }) {
    const entry = sessions.get(session.sessionHash);
    const token = request.headers['x-csrf-token'];
    return !!entry && entry.expiresAt > now() && typeof token === 'string' && /^[a-f0-9]{64}$/u.test(token)
      && timingSafeEqual(Buffer.from(entry.token, 'hex'), Buffer.from(token, 'hex'));
  }
  const executionEnabled = enabled === true && !!configured && executionService?.enabled === true;
  const handleWorkbench = async function (req, res, url) {
    if (!url.pathname.startsWith('/api/workbench/')) return false;
    if (url.search || req.url !== url.pathname) { reject(res, 404, 'ROUTE_NOT_FOUND'); return true; }
    if (url.pathname === '/api/workbench/catalogue') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); reject(res, 405, 'METHOD_NOT_ALLOWED'); return true; }
      if (!LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== host
        || (req.headers.origin !== undefined && req.headers.origin !== allowedOrigin)
        || req.headers['sec-fetch-site'] !== 'same-origin') { reject(res, 403, 'ORIGIN_OR_LOOPBACK_REQUIRED'); return true; }
      try {
        if (!enabled) {
          if (!await currentAccount(req)) { reject(res, 403, 'AUTH_REQUIRED'); return true; }
          send(res, 200, { status: 'HOLD', enabled: false, synthetic_execution_enabled: false, hold_code: 'INTAKE_DISABLED', entries: [], holds: [], claim_created: false, execution_started: false });
          return true;
        }
        if (!configured) { reject(res, 503, 'SERVER_BINDING_UNAVAILABLE'); return true; }
        const session = await verifySession(req);
        if (!session) { reject(res, 403, 'AUTH_REQUIRED'); return true; }
        const storage = await store.read(`w_${'0'.repeat(32)}`);
        if (!['FOUND', 'NOT_FOUND'].includes(storage.status)) { reject(res, 503, 'INTAKE_STORE_UNAVAILABLE'); return true; }
        const catalogue = await sources.catalogue({ requester: session.requester,
          canAccessProject: project => canAccessProject(req, project) });
        const rechecked = await verifySession(req);
        if (!rechecked || rechecked.sessionHash !== session.sessionHash) { reject(res, 403, 'AUTH_REQUIRED'); return true; }
        // Recheck access after all source IO, including a revocation during the read.
        for (const row of catalogue.entries) if (await canAccessProject(req, row.request.project_code) !== true) {
          reject(res, 403, 'SCOPE_VIOLATION'); return true;
        }
        send(res, 200, { ...catalogue, enabled: true,
          execution_enabled: executionEnabled, execution_mode: executionEnabled ? executionService.mode ?? 'synthetic_fixed' : null,
          synthetic_execution_enabled: executionEnabled && executionService.mode !== 'native_chat',
          native_execution_enabled: executionEnabled && executionService.mode === 'native_chat',
          csrf_token: csrfFor(session), claim_created: false, execution_started: false });
      } catch (error) { reject(res, 503, error.workbenchCode ?? 'CURRENT_SOURCE_UNAVAILABLE'); }
      return true;
    }
    const executionRoute = EXECUTION_ROUTE.exec(url.pathname);
    if (executionRoute) {
      const [, requestId, operation] = executionRoute;
      const methods = operation === 'execution' ? ['GET', 'POST'] : [operation === 'candidate' ? 'GET' : 'POST'];
      if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); reject(res, 405, 'METHOD_NOT_ALLOWED'); return true; }
      if (!executionEnabled) { reject(res, 405, 'SYNTHETIC_EXECUTION_DISABLED'); return true; }
      if (!LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== host
        || req.headers['sec-fetch-site'] !== 'same-origin'
        || (req.method === 'POST' ? req.headers.origin !== allowedOrigin
          : req.headers.origin !== undefined && req.headers.origin !== allowedOrigin)) {
        reject(res, 403, 'ORIGIN_OR_LOOPBACK_REQUIRED'); return true;
      }
      try {
        const session = await verifySession(req);
        if (!session) { reject(res, 403, 'AUTH_REQUIRED'); return true; }
        if (req.method === 'POST') {
          if (!verifyCsrf({ request: req, session })) { reject(res, 403, 'CSRF_REQUIRED'); return true; }
          const invalid = await emptyJson(req);
          if (invalid) { reject(res, ...invalid); return true; }
        }
        const checkedProjects = new Set();
        const access = { requester: session.requester, canAccessProject: project => {
          checkedProjects.add(project); return canAccessProject(req, project);
        },
          checkSession: async () => (await verifySession(req))?.sessionHash === session.sessionHash };
        const recheck = async () => {
          if (!await access.checkSession()) throw Object.assign(new Error('Current session required'), { workbenchCode: 'AUTH_REQUIRED' });
          for (const project of checkedProjects) if (await canAccessProject(req, project) !== true) {
            throw Object.assign(new Error('Current project access required'), { workbenchCode: 'REQUEST_NOT_FOUND' });
          }
        };
        if (operation === 'candidate') {
          const candidate = await executionService.candidate(requestId, access);
          await recheck();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="synthetic-${requestId}.txt"`);
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(candidate.bytes);
        } else {
          const result = await (operation === 'execution/cancel' ? executionService.cancel(requestId, access)
            : req.method === 'POST' ? executionService.start(requestId, access) : executionService.status(requestId, access));
          await recheck();
          send(res, req.method === 'POST' && operation === 'execution' && !result.replayed ? 202 : 200, result);
        }
      } catch (error) {
        const code = error.workbenchCode ?? 'EXECUTION_UNAVAILABLE';
        const status = ['REQUEST_NOT_FOUND', 'EXECUTION_NOT_FOUND', 'CANDIDATE_NOT_AVAILABLE'].includes(code) ? 404
          : ['AUTH_REQUIRED', 'SCOPE_VIOLATION'].includes(code) ? 403
            : ['RUN_STILL_ACTIVE', 'EXECUTION_REPLAY_CONFLICT'].includes(code) ? 409 : 503;
        reject(res, status, code);
      }
      return true;
    }
    // Use an operation-local handler so authorization closures cannot cross concurrent users.
    // Never trust account roles as authority epochs.
    const boundIntake = createWorkbenchIntakeHandler({
      store, enabled, readOnlyPilot: !enabled, allowedOrigin,
      verifySession: async request => {
        const session = await verifySession(request);
        if (!session) return null;
        return { ...session, provideEvidence: async bound => {
          const evidence = await sources.evidence({ request: bound, requester: session.requester,
            canAccessProject: project => canAccessProject(req, project) });
          const rechecked = await verifySession(req);
          if (!rechecked || rechecked.sessionHash !== session.sessionHash
            || await canAccessProject(req, bound.project_code) !== true) throw new Error('Current access unavailable');
          return evidence;
        } };
      },
      verifyCsrf,
      currentEvidenceProvider: ({ request, session }) => session.provideEvidence(request),
    });
    const revisionRoute = REVISION_ROUTE.exec(url.pathname);
    if (revisionRoute) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); reject(res, 405, 'METHOD_NOT_ALLOWED'); return true; }
      if (!enabled) { reject(res, 405, 'INTAKE_DISABLED'); return true; }
      if (!configured) { reject(res, 503, 'SERVER_BINDING_UNAVAILABLE'); return true; }
      if (!LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== host
        || req.headers.origin !== allowedOrigin || req.headers['sec-fetch-site'] !== 'same-origin') {
        reject(res, 403, 'ORIGIN_OR_LOOPBACK_REQUIRED'); return true;
      }
      try {
        const session = await verifySession(req);
        if (!session) { reject(res, 403, 'AUTH_REQUIRED'); return true; }
        if (!verifyCsrf({ request: req, session })) { reject(res, 403, 'CSRF_REQUIRED'); return true; }
        const invalid = await emptyJson(req);
        if (invalid) { reject(res, ...invalid); return true; }
        const prior = await store.read(revisionRoute[1]);
        if (prior.status !== 'FOUND' || !isWorkbenchIntakeRecord(prior.record)
          || prior.record.request.requester !== session.requester
          || await canAccessProject(req, prior.record.request.project_code) !== true) {
          reject(res, 404, 'REQUEST_NOT_FOUND'); return true;
        }
        const prefix = /^wb\.[a-f0-9]{64}\./u.exec(prior.record.request.idempotency_key)?.[0];
        if (!prefix) { reject(res, 503, 'CATALOGUE_SELECTION_CHANGED'); return true; }
        // One deterministic successor per parent: duplicate clicks and network retries
        // resolve through the existing intake replay/lineage checks without another row.
        const nonce = createHash('sha256').update(JSON.stringify(['workbench.revision.v1', prior.record.request_id])).digest('hex').slice(0, 32);
        const body = Buffer.from(JSON.stringify({ ...prior.record.request, idempotency_key: `${prefix}${nonce}`,
          revision_of: prior.record.request_id, revision_no: prior.record.request.revision_no + 1 }));
        const derived = Object.assign(Readable.from([body]), { url: '/api/workbench/requests', method: 'POST', socket: req.socket,
          headers: { ...req.headers, 'content-length': String(body.length) } });
        await boundIntake(derived, res);
      } catch { reject(res, 503, 'CURRENT_EVIDENCE_OR_STORE_UNAVAILABLE'); }
      return true;
    }
    await boundIntake(req, res);
    return true;
  };
  handleWorkbench.close = async () => { sessions.clear(); await executionService?.close(); };
  return handleWorkbench;
}
