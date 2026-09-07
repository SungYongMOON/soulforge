import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWorkbenchIntakeHandler } from '../../team-ops-board/src/server/workbench-intake-adapter.mjs';
import { createWorkbenchIntakeStore } from '../../team-ops-board/src/server/workbench-intake-store.mjs';
import { requesterForAccount } from './workbench_current_sources.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
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

/** Same-origin, authenticated intake only. No executor, model, scheduler or task writer. */
export function createWorkbenchHttpController({ enabled = false, allowedOrigin, intakeRoot, sources,
  currentAccount, sessionKey, accountIds, canAccessProject, now = () => Date.now() } = {}) {
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
  return async function handleWorkbench(req, res, url) {
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
          send(res, 200, { status: 'HOLD', enabled: false, hold_code: 'INTAKE_DISABLED', entries: [], holds: [], claim_created: false, execution_started: false });
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
        send(res, 200, { ...catalogue, enabled: true, csrf_token: csrfFor(session), claim_created: false, execution_started: false });
      } catch (error) { reject(res, 503, error.workbenchCode ?? 'CURRENT_SOURCE_UNAVAILABLE'); }
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
      verifyCsrf: async ({ request, session }) => {
        const entry = sessions.get(session.sessionHash);
        const token = request.headers['x-csrf-token'];
        return !!entry && entry.expiresAt > now() && typeof token === 'string' && /^[a-f0-9]{64}$/u.test(token)
          && timingSafeEqual(Buffer.from(entry.token, 'hex'), Buffer.from(token, 'hex'));
      },
      currentEvidenceProvider: ({ request, session }) => session.provideEvidence(request),
    });
    await boundIntake(req, res);
    return true;
  };
}
