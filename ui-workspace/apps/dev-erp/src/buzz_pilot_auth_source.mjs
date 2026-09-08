import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const unavailable = () => { throw Object.assign(new Error('Buzz authentication source unavailable'),
  { status: 503, code: 'BUZZ_PILOT_AUTH_SOURCE_UNAVAILABLE' }); };
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Read one existing Owner's current session/role/project metadata. This port
 * issues no account or token and never calls the writable application's store.
 * The request cookie is a bound lookup input and an internal opaque session
 * digest input; its value is never returned, logged or persisted by this port.
 */
export function openBuzzPilotAuthSource({ dbPath, sourcePort, expectedOwnerId, projectId, now = Date.now } = {}) {
  let db;
  try {
    if (typeof dbPath !== 'string' || !isAbsolute(dbPath) || normalize(dbPath) !== dbPath
      || !/^[1-9][0-9]{0,4}$/u.test(String(sourcePort)) || Number(sourcePort) > 65535
      || !ID.test(expectedOwnerId ?? '') || !ID.test(projectId ?? '') || typeof now !== 'function') unavailable();
    const initial = lstatSync(dbPath);
    if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1 || !samePath(realpathSync(dbPath), dbPath)) unavailable();
    const originalIdentity = identity(initial);
    db = new DatabaseSync(dbPath, { readOnly: true, enableExtensions: false });
    db.exec('PRAGMA query_only = ON');
    const lookup = db.prepare(`SELECT a.id AS account_id, s.created_at, s.expires_at
      FROM auth_session s JOIN core_account a ON a.id = s.account_id
      WHERE s.token = ? AND a.id = ? AND a.status = 'active'
        AND EXISTS (SELECT 1 FROM rbac_account_role r WHERE r.account_id = a.id AND r.role_id = 'admin')
        AND EXISTS (SELECT 1 FROM core_project p WHERE p.id = ?)`);
    const cookieName = `dev_erp_sid_${sourcePort}`;
    let closed = false;
    function cookie(req) {
      const raw = req?.headers?.cookie;
      if (typeof raw !== 'string' || raw.length > 16384) return null;
      const values = raw.split(';').map(part => part.trim()).filter(part => part.slice(0, part.indexOf('=')) === cookieName);
      if (values.length !== 1) return null;
      try {
        const token = decodeURIComponent(values[0].slice(cookieName.length + 1));
        return token && token.length <= 4096 && !/[\x00-\x20\x7f]/u.test(token) ? token : null;
      } catch { return null; }
    }
    function current(req) {
      try {
        if (closed) unavailable();
        const stat = lstatSync(dbPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || identity(stat) !== originalIdentity
          || !samePath(realpathSync(dbPath), dbPath)) unavailable();
        const token = cookie(req);
        if (!token) return null;
        const row = lookup.get(token, expectedOwnerId, projectId);
        if (!row) return null;
        const time = now(), expiry = Date.parse(row.expires_at), created = Date.parse(row.created_at);
        if (!Number.isFinite(time) || !Number.isFinite(expiry) || !Number.isFinite(created) || expiry <= time
          || new Date(expiry).toISOString() !== row.expires_at || new Date(created).toISOString() !== row.created_at) return null;
        return { account_id: row.account_id, session_key: createHash('sha256').update(token).digest('hex') };
      } catch { return unavailable(); }
    }
    return Object.freeze({
      currentAccount(req) { const row = current(req); return row ? { id: row.account_id } : null; },
      // Every call reauthenticates the exact session. This opaque digest stays
      // inside the HTTP controller and is never included in its response.
      sessionKey(req) { return current(req)?.session_key ?? null; },
      canAccessProject(req, requestedProject) { return requestedProject === projectId && current(req) !== null; },
      close() { if (!closed) { closed = true; db.close(); } },
    });
  } catch { try { db?.close(); } catch { /* No fallback source. */ } return unavailable(); }
}
