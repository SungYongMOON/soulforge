import { makeUniformNotAvailable } from './accepted_context_query.mjs';

export function createAcceptedContextHttpController({ runtime = null, currentAccount, allowedOrigin } = {}) {
  return async function acceptedContextHttp(req, res, url) {
    if (!url.pathname.startsWith('/api/context/accepted/')) return false;
    function send(value) {
      res.statusCode = value.status === 'ok' ? 200 : 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify(value));
      return true;
    }
    try {
      const origin = new URL(allowedOrigin);
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
      if (!runtime || !local || req.headers.host !== origin.host
        || req.headers['sec-fetch-site'] !== 'same-origin'
        || (req.headers.origin && req.headers.origin !== origin.origin)) return send(makeUniformNotAvailable());
      const account = currentAccount(req);
      const actor = runtime.actorForAccount(account);
      if (!account?.id || !actor) return send(makeUniformNotAvailable());
      let result;
      if (url.pathname === '/api/context/accepted/catalogue' && req.method === 'GET' && !url.search) {
        result = await runtime.catalogue(account);
      } else if (url.pathname === '/api/context/accepted/query' && req.method === 'POST' && !url.search
        && req.headers.origin === origin.origin && req.headers['content-type'] === 'application/json') {
        const chunks = []; let size = 0;
        for await (const bytes of req) {
          size += bytes.length;
          if (size > 8192) return send(makeUniformNotAvailable());
          chunks.push(bytes);
        }
        result = await runtime.query(account, JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } else return send(makeUniformNotAvailable());
      const latest = currentAccount(req);
      if (latest?.id !== account.id || runtime.actorForAccount(latest) !== actor) return send(makeUniformNotAvailable());
      return send(result.status === 'ok' ? result : makeUniformNotAvailable());
    } catch { return send(makeUniformNotAvailable()); }
  };
}
