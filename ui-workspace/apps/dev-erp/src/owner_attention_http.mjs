import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const BASE = '/api/owner-attention';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ASSETS = new Map([
  ['/owner-attention.html', ['text/html; charset=utf-8', new URL('../static/owner-attention.html', import.meta.url)]],
  ['/owner-attention/page.mjs', ['text/javascript; charset=utf-8', new URL('./owner_attention_page.mjs', import.meta.url)]],
  ['/owner-attention/owner_attention_load.mjs', ['text/javascript; charset=utf-8', new URL('./owner_attention_load.mjs', import.meta.url)]],
  ['/owner-attention/style.css', ['text/css; charset=utf-8', new URL('../static/owner-attention.css', import.meta.url)]],
]);
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function body(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] || '')
    || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) throw Object.assign(new Error(), { status: 415 });
  let count = 0; const chunks = [];
  for await (const chunk of req) { count += chunk.length; if (count > 2048) throw Object.assign(new Error(), { status: 413 }); chunks.push(chunk); }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw Object.assign(new Error(), { status: 400 }); }
}

/** Existing cookie authentication, current project ACL and session-bound CSRF.
 * No anonymous single-user fallback. All dependencies are server-owned. */
export function createOwnerAttentionHttpController({ service = null, allowedOrigin, currentAccount, sessionKey,
  canAccessProject, ownerAccountId, now = () => Date.now(), syntheticPreview = false } = {}) {
  if (![currentAccount, sessionKey, canAccessProject].every(v => typeof v === 'function')) throw new TypeError('server_auth_required');
  let origin = null;
  try { const u = new URL(allowedOrigin); if (/^https?:$/u.test(u.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) origin = u; } catch {}
  const csrf = new Map();
  function principal(req) {
    const account = currentAccount(req), session = sessionKey(req);
    if (!account?.id || !session) throw Object.assign(new Error(), { status: 401, attentionCode: 'LOGIN_REQUIRED' });
    if (!ownerAccountId || account.id !== ownerAccountId) throw Object.assign(new Error(), { status: 403, attentionCode: 'OWNER_ACCESS_REQUIRED' });
    return { accountId: account.id, session, hash: createHash('sha256').update(JSON.stringify([account.id, session])).digest('hex') };
  }
  function token(p) {
    for (const [key, value] of csrf) if (value.until <= now()) csrf.delete(key);
    if (!csrf.has(p.hash)) { if (csrf.size >= 128) throw new Error('session_limit'); csrf.set(p.hash, { value: randomBytes(32).toString('hex'), until: now() + 12 * 3600000 }); }
    return csrf.get(p.hash).value;
  }
  return async function ownerAttentionHttp(req, res, url) {
    const asset = ASSETS.get(url.pathname);
    if (!asset && !url.pathname.startsWith(BASE)) return false;
    const fail = (status, code) => send(res, status, { status: 'unavailable', error: code });
    if (!origin || !LOOPBACK.has(req.socket?.remoteAddress) || req.headers.host !== origin.host
      || (req.headers.origin && req.headers.origin !== origin.origin)
      || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) { fail(403, 'LOCAL_ORIGIN_REQUIRED'); return true; }
    if (url.search || req.url !== url.pathname) { fail(404, 'ROUTE_NOT_FOUND'); return true; }
    const mutation = url.pathname === `${BASE}/actions`;
    if (!asset && url.pathname !== BASE && !mutation) { fail(404, 'ROUTE_NOT_FOUND'); return true; }
    if (req.method !== (mutation ? 'POST' : 'GET')) { res.setHeader('Allow', mutation ? 'POST' : 'GET'); fail(405, 'METHOD_NOT_ALLOWED'); return true; }
    try {
      // The empty HTML shell is usable without a session, so a login link can
      // be shown. No request data is embedded in public assets.
      if (asset) {
        let bytes = await readFile(asset[1], 'utf8');
        if (syntheticPreview && url.pathname === '/owner-attention.html') bytes = bytes.replace('<body>', '<body><aside class="synthetic-banner">합성 체험 화면 · 실제 회사 질문과 실제 Buzz에는 연결되지 않았습니다.</aside>');
        send(res, 200, bytes, asset[0]); return true;
      }
      if (req.headers['sec-fetch-site'] !== 'same-origin') { fail(403, 'SAME_ORIGIN_REQUIRED'); return true; }
      const p = principal(req);
      if (!service) { fail(503, 'ATTENTION_NOT_CONFIGURED'); return true; }
      const access = { accountId: p.accountId,
        checkSession: () => { try { return principal(req).hash === p.hash; } catch { return false; } },
        canAccessProject: project => canAccessProject(req, project) };
      if (mutation) {
        const given = req.headers['x-csrf-token'], entry = csrf.get(p.hash);
        if (req.headers.origin !== origin.origin || !entry || entry.until <= now() || typeof given !== 'string'
          || !/^[a-f0-9]{64}$/u.test(given) || !timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(entry.value, 'hex'))) { fail(403, 'CSRF_REQUIRED'); return true; }
        const input = await body(req);
        if (!access.checkSession()) { fail(401, 'LOGIN_REQUIRED'); return true; }
        send(res, 200, service.act(access, input));
      } else {
        const result = service.snapshot(access);
        if (!access.checkSession()) { fail(401, 'LOGIN_REQUIRED'); return true; }
        send(res, 200, { ...result, csrf_token: token(p) });
      }
    } catch (error) { fail(error.status ?? 503, error.attentionCode ?? 'ATTENTION_UNAVAILABLE'); }
    return true;
  };
}
