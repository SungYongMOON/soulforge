import { randomBytes } from 'node:crypto';
import { attentionFail, attentionHash } from './owner_attention_source.mjs';

const OPEN = new Set(['awaiting', 'response_unverified']);
const DDL = `
CREATE TABLE IF NOT EXISTS owner_attention_view (
 request_key TEXT PRIMARY KEY, owner_account_id TEXT NOT NULL, source_sha256 TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0, seen_at TEXT, snooze_until TEXT
);
CREATE TABLE IF NOT EXISTS owner_attention_outbox (
 event_id TEXT PRIMARY KEY, request_key TEXT NOT NULL, owner_account_id TEXT NOT NULL,
 source_sha256 TEXT NOT NULL, event_kind TEXT NOT NULL, created_at TEXT NOT NULL,
 status TEXT NOT NULL, available_at TEXT NOT NULL, attempt_id TEXT, lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, route_sha256 TEXT, receipt_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_owner_attention_outbox_owner ON owner_attention_outbox(owner_account_id,status,created_at);
`;
const iso = n => new Date(n).toISOString();
const safeId = v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);

/** No new workspace or canonical store: only reversible view preferences and
 * metadata-only delivery receipts in the existing, already opened ERP DB. */
export function createOwnerAttentionService({ store, source, now = () => Date.now(),
  resolveBuzzLink = () => null, resolveNotificationRoute = () => null, adapter = null } = {}) {
  if (!store?.db || !source?.read) throw new TypeError('erp_store_and_source_required');
  const db = store.db;
  db.exec(DDL);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  function rows(access) {
    source.currentOwner(access.accountId);
    if (access.checkSession() !== true) attentionFail('OWNER_ACCESS_REQUIRED', 403);
    return source.read(access.accountId).filter(row => access.canAccessProject(row.project_id) === true);
  }
  function recheck(access, items) {
    source.currentOwner(access.accountId);
    if (access.checkSession() !== true) attentionFail('OWNER_ACCESS_REQUIRED', 403);
    for (const row of items) if (access.canAccessProject(row.project_id) !== true) attentionFail('PROJECT_ACCESS_CHANGED', 403);
  }
  function view(row) {
    const state = db.prepare('SELECT * FROM owner_attention_view WHERE request_key=?').get(row.request_key);
    if (state && (state.source_sha256 !== row.source_sha256 || state.owner_account_id !== row.owner_account_id)) attentionFail('ATTENTION_VIEW_SOURCE_CONFLICT');
    const snoozed = !!state?.snooze_until && Date.parse(state.snooze_until) > now();
    let link = null;
    const resolved = resolveBuzzLink({ source_ref: row.source_ref, source_sha256: row.source_sha256,
      sender_account_id: row.sender_account_id, owner_account_id: row.owner_account_id, item_id: row.item_id });
    // Only a server-owned exact resolver may supply a link. A URL in bot prose
    // or a guessed name/id is never used as a route. Only web links, no scripts.
    if (resolved?.source_ref === row.source_ref && resolved.source_sha256 === row.source_sha256
      && resolved.owner_account_id === row.owner_account_id && resolved.sender_account_id === row.sender_account_id
      && resolved.item_id === row.item_id && resolved.active === true
      && Number.isFinite(Date.parse(resolved.expires_at)) && Date.parse(resolved.expires_at) > now()) {
      try {
        const url = new URL(resolved.url);
        if (!url.username && !url.password && (url.protocol === 'https:'
          || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) link = url.href;
      } catch { /* Missing or invalid routes remain visibly unavailable. */ }
    }
    return { ...row, view_version: state?.version ?? 0, seen_at: state?.seen_at ?? null,
      snooze_until: state?.snooze_until ?? null, snoozed: OPEN.has(row.source_state) && snoozed,
      overdue: OPEN.has(row.source_state) && !!row.due_at && Date.parse(row.due_at) <= now(),
      buzz_url: link, buzz_link_state: link ? 'available' : 'unavailable' };
  }
  function sync(access) {
    const current = rows(access), keys = new Set(current.filter(row => OPEN.has(row.source_state)).map(row => row.request_key));
    // Stale/revoked work is not a sendable notification. An in-flight delivery
    // can only become unknown, never be silently replayed after lease expiry.
    const outbox = db.prepare('SELECT * FROM owner_attention_outbox WHERE owner_account_id=?').all(access.accountId);
    for (const event of outbox) {
      if (event.status === 'sending' && Date.parse(event.lease_until) <= now()) {
        db.prepare("UPDATE owner_attention_outbox SET status='delivery_unknown' WHERE event_id=? AND status='sending'").run(event.event_id);
      } else if (!keys.has(event.request_key) && event.status === 'pending') {
        db.prepare("UPDATE owner_attention_outbox SET status='cancelled' WHERE event_id=? AND status='pending'").run(event.event_id);
      }
    }
    for (const row of current) {
      const state = view(row);
      if (!OPEN.has(row.source_state) || state.snoozed) continue;
      const enqueue = (kind, suffix = '') => {
        const id = attentionHash([row.request_key, row.source_sha256, kind, suffix]);
        db.prepare(`INSERT OR IGNORE INTO owner_attention_outbox
          (event_id,request_key,owner_account_id,source_sha256,event_kind,created_at,status,available_at)
          VALUES(?,?,?,?,?,?,'pending',?)`).run(id, row.request_key, access.accountId, row.source_sha256, kind, iso(now()), iso(now()));
      };
      if (!state.seen_at) enqueue('new_request');
      if (row.due_at && Date.parse(row.due_at) <= now() + 3600000) enqueue('due_soon');
      if (state.snooze_until && Date.parse(state.snooze_until) <= now()) enqueue('snooze_expired', state.snooze_until);
    }
    recheck(access, current);
    return current.map(view).sort((a, b) => Number(OPEN.has(b.source_state)) - Number(OPEN.has(a.source_state))
      || Number(a.snoozed) - Number(b.snoozed) || Number(b.overdue) - Number(a.overdue)
      || (a.due_at ?? 'z').localeCompare(b.due_at ?? 'z') || a.created_at.localeCompare(b.created_at));
  }
  function snapshot(access) {
    return transaction(() => {
      const items = sync(access);
      const allowedKeys = new Set(items.map(row => row.request_key));
      let configured = false;
      try { routeFor(access); configured = true; } catch { /* Route not ready or revoked. */ }
      const counts = {};
      for (const event of db.prepare('SELECT request_key,status FROM owner_attention_outbox WHERE owner_account_id=?').all(access.accountId)) {
        if (allowedKeys.has(event.request_key)) counts[event.status] = (counts[event.status] ?? 0) + 1;
      }
      return { status: 'available', observed_at: iso(now()), items,
        notification: { capability: configured ? 'configured' : 'unavailable',
          counts },
        acceptance_changed: false, official_done_changed: false };
    });
  }
  function act(access, input) {
    if (!input || Object.keys(input).some(k => !['request_key', 'source_sha256', 'view_version', 'action', 'minutes'].includes(k))
      || !safeId(input.request_key) || !safeId(input.source_sha256) || !Number.isSafeInteger(input.view_version)
      || !['seen', 'snooze', 'unsnooze'].includes(input.action)
      || (input.action === 'snooze' ? ![30, 120, 1440].includes(input.minutes) : input.minutes !== undefined)) attentionFail('ATTENTION_ACTION_INVALID', 400);
    return transaction(() => {
      const row = rows(access).find(r => r.request_key === input.request_key);
      if (!row) attentionFail('ATTENTION_REQUEST_NOT_FOUND', 404);
      if (row.source_sha256 !== input.source_sha256 || !OPEN.has(row.source_state)) attentionFail('ATTENTION_REQUEST_CHANGED', 409);
      const current = view(row);
      if (input.view_version !== current.view_version) attentionFail('ATTENTION_VIEW_CHANGED', 409);
      const until = input.action === 'snooze' ? iso(now() + input.minutes * 60000) : input.action === 'unsnooze' ? null : current.snooze_until;
      const seen = current.seen_at ?? iso(now());
      recheck(access, [row]);
      db.prepare(`INSERT INTO owner_attention_view(request_key,owner_account_id,source_sha256,version,seen_at,snooze_until)
        VALUES(?,?,?,?,?,?) ON CONFLICT(request_key) DO UPDATE SET version=excluded.version,seen_at=excluded.seen_at,snooze_until=excluded.snooze_until`)
        .run(row.request_key, access.accountId, row.source_sha256, current.view_version + 1, seen, until);
      // Seeing or snoozing consumes the pending initial ping, not the request.
      db.prepare("UPDATE owner_attention_outbox SET status='cancelled' WHERE request_key=? AND status='pending' AND (event_kind='new_request' OR ?='snooze')").run(row.request_key, input.action);
      return { status: 'recorded', item: view(row), acceptance_changed: false, official_done_changed: false };
    });
  }
  function routeFor(access) {
    const route = resolveNotificationRoute(access.accountId);
    if (!adapter || !route || route.owner_account_id !== access.accountId || route.purpose !== 'owner_attention'
      || route.active !== true || !safeId(route.binding_sha256) || typeof route.destination_ref !== 'string'
      || !/^[A-Za-z][A-Za-z0-9:._-]{1,199}$/u.test(route.destination_ref)
      || !Number.isFinite(Date.parse(route.expires_at)) || Date.parse(route.expires_at) <= now()) attentionFail('NOTIFICATION_ROUTE_UNAVAILABLE');
    return route;
  }
  async function dispatch(access) {
    let claim;
    claim = transaction(() => {
      const current = sync(access), route = routeFor(access);
      // One short aggregate message at most per minute, including uncertain
      // attempts. Polling without a new event never manufactures another ping.
      const recent = db.prepare("SELECT lease_until FROM owner_attention_outbox WHERE owner_account_id=? AND attempt_id IS NOT NULL ORDER BY lease_until DESC LIMIT 1").get(access.accountId);
      if (recent && Date.parse(recent.lease_until) > now()) return null;
      const available = new Map(current.filter(r => OPEN.has(r.source_state) && !r.snoozed).map(r => [r.request_key, r]));
      const events = db.prepare("SELECT * FROM owner_attention_outbox WHERE owner_account_id=? AND status='pending' AND available_at<=? ORDER BY created_at,event_id LIMIT 100").all(access.accountId, iso(now()))
        .filter(e => available.has(e.request_key) && available.get(e.request_key).source_sha256 === e.source_sha256).slice(0, 20);
      if (!events.length) return null;
      const attemptId = `oa_send_${randomBytes(16).toString('hex')}`;
      for (const e of events) db.prepare("UPDATE owner_attention_outbox SET status='sending',attempt_id=?,attempts=attempts+1,lease_until=?,route_sha256=? WHERE event_id=? AND status='pending'")
        .run(attemptId, iso(now() + 60000), route.binding_sha256, e.event_id);
      return { events, route, attemptId, items: events.map(e => available.get(e.request_key)) };
    });
    if (!claim) return { status: 'idle', sent: false };
    const authorize = () => {
      const route = routeFor(access);
      if (attentionHash(route) !== attentionHash(claim.route)) attentionFail('NOTIFICATION_ROUTE_CHANGED');
      const current = new Map(rows(access).map(row => [row.request_key, view(row)]));
      for (const item of claim.items) {
        const row = current.get(item.request_key);
        if (!row || !OPEN.has(row.source_state) || row.snoozed || row.source_sha256 !== item.source_sha256) attentionFail('NOTIFICATION_SOURCE_CHANGED');
      }
      recheck(access, claim.items);
      return true;
    };
    let result;
    try {
      authorize();
      const payload = { attempt_id: claim.attemptId, owner_account_id: access.accountId,
        destination_ref: claim.route.destination_ref, binding_sha256: claim.route.binding_sha256,
        purpose: 'owner_attention', request_count: new Set(claim.items.map(r => r.request_key)).size,
        // No source prose or message body crosses this adapter. A bound notifier
        // renders a fixed count + inbox link for the exact Owner destination.
        events: claim.events.map(e => ({ event_id: e.event_id, event_kind: e.event_kind,
          request_key: e.request_key, source_sha256: e.source_sha256 })) };
      result = await adapter.send(payload, { authorize });
      authorize();
    } catch { result = { status: 'delivery_unknown' }; }
    return transaction(() => {
      let status = 'delivery_unknown';
      const receipt = typeof result?.receipt_ref === 'string' && /^[a-z][a-z0-9-]{1,39}:[A-Za-z0-9._:-]{1,199}$/u.test(result.receipt_ref) ? result.receipt_ref : null;
      if (result?.status === 'delivered' && result.attempt_id === claim.attemptId && receipt) status = 'delivered';
      else if (result?.status === 'not_sent' && result.attempt_id === claim.attemptId && receipt) status = 'pending';
      for (const e of claim.events) {
        const next = status === 'pending' && e.attempts >= 2 ? 'held' : status;
        const updated = db.prepare("UPDATE owner_attention_outbox SET status=?,available_at=?,receipt_ref=? WHERE event_id=? AND attempt_id=? AND status='sending'")
          .run(next, iso(now() + 60000), receipt, e.event_id, claim.attemptId);
        // A lease recovery or newer fence wins over a late adapter reply.
        if (Number(updated.changes) !== 1) status = 'delivery_unknown';
      }
      return { status, attempt_id: claim.attemptId, sent: status === 'delivered' };
    });
  }
  return { snapshot, act, dispatch };
}

/** Bounded JSON adapter; redirects and uncertain HTTP outcomes never auto-retry.
 * Production routing must supply an exact Owner-only capability binding. */
export function createOwnerAttentionLoopbackAdapter({ endpoint, binding, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password
    || url.search || url.hash || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new TypeError('exact_loopback_endpoint_required');
  if (!binding || !safeId(binding.binding_sha256) || !binding.owner_account_id || !binding.destination_ref
    || binding.purpose !== 'owner_attention') throw new TypeError('exact_owner_notification_binding_required');
  const pinned = structuredClone(binding);
  return { async send(payload, { authorize }) {
    if (['owner_account_id','destination_ref','binding_sha256','purpose'].some(key => payload[key] !== pinned[key])) attentionFail('NOTIFICATION_ADAPTER_BINDING_CHANGED');
    authorize();
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok || !/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') || '')) return { status: 'delivery_unknown' };
    const reader = response.body.getReader(); let length = 0; const chunks = [];
    try {
      for (;;) { const chunk = await reader.read(); if (chunk.done) break;
        length += chunk.value.length; if (length > 4096) { await reader.cancel(); return { status: 'delivery_unknown' }; } chunks.push(chunk.value); }
      const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      return result;
    } finally { reader.releaseLock(); }
  } };
}
