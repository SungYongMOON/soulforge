import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWorldCoverageReader } from '../../team-ops-board/src/server/forge-world-coverage-adapter.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const FORGE_WORLD_ASSETS = Object.freeze({
  '/forge-world.html': ['text/html; charset=utf-8', new URL('../../team-ops-board/forge-world.html', import.meta.url)],
  '/forge-world/assets/page.mjs': ['text/javascript; charset=utf-8', new URL('../../team-ops-board/src/forge-world-page.mjs', import.meta.url)],
  '/forge-world/assets/style.css': ['text/css; charset=utf-8', new URL('../../team-ops-board/src/forge-world.css', import.meta.url)],
});
const API = '/api/forge-world/coverage';
const PROJECTS = ['SOULFORGE', 'P26-014'];
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

// Shares the existing world renderer and coverage owner; this is only a host
// adapter. The two representative plots are not a complete project inventory.
export function createForgeWorldHttpController({ allowedOrigin, stateRoot,
  currentAccount, sessionKey, canAccessProject, readerFactory = createWorldCoverageReader } = {}) {
  if (![currentAccount, sessionKey, canAccessProject, readerFactory].every(value => typeof value === 'function')) throw new TypeError('server_auth_required');
  const origin = typeof allowedOrigin === 'string' && /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/u.test(allowedOrigin) ? new URL(allowedOrigin) : null;
  return async function forgeWorldHttp(req, res, url) {
    const asset = Object.hasOwn(FORGE_WORLD_ASSETS, url.pathname) ? FORGE_WORLD_ASSETS[url.pathname] : null;
    if (!asset && url.pathname !== API) return false;
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); send(res, 405, {error: 'read_only'}); return true; }
    if (!origin || !LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== origin.host
      || (req.headers.origin && req.headers.origin !== origin.origin)
      || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) { send(res, 403, {error: 'local_origin_required'}); return true; }
    if (url.search) { send(res, 400, {error: 'query_not_supported'}); return true; }
    try {
      if (asset) {
        let body = await readFile(fileURLToPath(asset[1]), 'utf8');
        if (Buffer.byteLength(body) > 512 * 1024) throw new Error('asset_too_large');
        if (url.pathname === '/forge-world.html') body = body
          .replace('<body>', '<body data-world-host="world-tree">')
          .replace('/src/forge-world.css', '/forge-world/assets/style.css')
          .replace('/src/forge-world-page.mjs', '/forge-world/assets/page.mjs')
          .replace('<a href="/">운영 현황</a>', '<a href="/">자료·검토</a>');
        send(res, 200, body, asset[0]); return true;
      }
      const account = await currentAccount(req), session = await sessionKey(req);
      if (!account?.id || !session) { send(res, 401, {error: 'login_required'}); return true; }
      if (!stateRoot) { send(res, 503, {error: 'coverage_source_unconfigured'}); return true; }
      const allowed = [];
      for (const project of PROJECTS) if (await canAccessProject(req, project) === true) allowed.push(project);
      const reader = readerFactory({stateRoot, projectCodes: allowed});
      const snapshot = await reader.readSnapshot();
      const current = await currentAccount(req);
      if (current?.id !== account.id || await sessionKey(req) !== session) { send(res, 401, {error: 'login_required'}); return true; }
      for (const project of allowed) if (await canAccessProject(req, project) !== true) { send(res, 403, {error: 'project_access_changed'}); return true; }
      // No arbitrary reader output or foreign project may cross this adapter.
      if (!snapshot || snapshot.schema_version !== 'soulforge.forge_world.projects.v1'
        || !Array.isArray(snapshot.projects) || snapshot.projects.length !== allowed.length
        || snapshot.projects.some((project, i) => project.project_code !== allowed[i])) throw new Error('reader_scope_mismatch');
      send(res, 200, snapshot);
    } catch { send(res, 503, {error: 'coverage_unavailable'}); }
    return true;
  };
}
