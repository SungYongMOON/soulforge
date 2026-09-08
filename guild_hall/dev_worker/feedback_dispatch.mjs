// Independent delivery ledger: local evidence, native ACK and human acceptance
// remain different facts. An attempted send is never automatically retried.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveRoute, validateCatalog, validateBindings } from '../codex_work_directory/directory.mjs';
import { openFeedbackReadbox, readboxHash as hash, readboxPin } from './feedback_readbox.mjs';
import { readRuntimeJson, runtimeOrdinary, runtimeInside, runtimeRef as ref, runtimeCheck as check } from './feedback_runtime_io.mjs';

const PURPOSE = 'manager_feedback_notice';
const active = signal => check(!signal?.aborted, 'FEEDBACK_DISPATCH_TICK_BUDGET');
export async function openFeedbackDispatch(options) {
  const readOnly = options.readOnly === true;
  const readbox = await openFeedbackReadbox(options), { config, deployment } = readbox;
  const delivery = config.delivery;
  check(delivery && readboxPin(delivery.policy) && delivery.route_current?.sha256 === null, 'FEEDBACK_DISPATCH_CONFIG_INVALID');
  await runtimeOrdinary(delivery.state_root, true);
  const roots = [deployment.controlRoot, deployment.evidenceRoot, delivery.state_root];
  check(roots.every((a, i) => roots.slice(i + 1).every(b => !runtimeInside(a, b) && !runtimeInside(b, a))), 'FEEDBACK_DISPATCH_ROOT_OVERLAP');
  for (const descriptor of [delivery.policy, delivery.route_current, config.runtime_deployment, config.access_current, { path: options.configPath }])
    check(!runtimeInside(delivery.state_root, descriptor.path), 'FEEDBACK_DISPATCH_AUTHORITY_WRITABLE');
  const file = path.join(delivery.state_root, 'feedback-dispatch.sqlite');
  if (!readOnly) {
    await readbox.authorizeService();
    try { const handle = await fs.open(file, 'wx', 0o600); await handle.close(); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  await runtimeOrdinary(file);
  const db = new DatabaseSync(file, { readOnly });
  db.exec('PRAGMA busy_timeout=1000');
  if (!readOnly) db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS feedback_dispatch_binding(id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS feedback_dispatch(dispatch_ref TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,
      notice_ref TEXT NOT NULL,notice_sha256 TEXT NOT NULL,envelope_sha256 TEXT NOT NULL,envelope_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PREPARED','DELIVERY_UNKNOWN','ACKNOWLEDGED')),message_id TEXT,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS feedback_dispatch_locator(dispatch_ref TEXT PRIMARY KEY,locator TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS feedback_dispatch_scan(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,
      cursor TEXT,pending_json TEXT NOT NULL);
    INSERT OR IGNORE INTO feedback_dispatch_scan VALUES(1,0,NULL,'[]');`);
  const scope = hash({ project: config.project_id, runtime: config.runtime_deployment, service: config.dispatch_service_ref });
  if (!readOnly) db.prepare('INSERT OR IGNORE INTO feedback_dispatch_binding VALUES(1,?)').run(scope);
  try { check(db.prepare('SELECT digest FROM feedback_dispatch_binding WHERE id=1').get().digest === scope, 'FEEDBACK_DISPATCH_SCOPE_MISMATCH'); }
  catch (e) { db.close(); throw e; }
  function row(reference) { return db.prepare('SELECT * FROM feedback_dispatch WHERE dispatch_ref=?').get(reference); }
  async function currentAuthority() {
    await readbox.authorizeService();
    const policy = await readRuntimeJson(delivery.policy), current = await readRuntimeJson(delivery.route_current), now = Date.now();
    check(policy.version === 1 && policy.approved === true && policy.project_ref === config.project_id
      && policy.purpose === PURPOSE && policy.service_ref === config.dispatch_service_ref
      && [policy.manager_route_id, policy.profile_ref, policy.bot_chat_id, policy.sender_ref].every(ref)
      && Date.parse(policy.issued_at) <= now && Date.parse(policy.expires_at) > now, 'FEEDBACK_DISPATCH_AUTHORITY_REQUIRED');
    check(current.active === true && current.project_ref === config.project_id && current.policy_sha256 === delivery.policy.sha256
      && Date.parse(current.observed_at) <= now && now - Date.parse(current.observed_at) <= 300000
      && Date.parse(current.expires_at) > now && readboxPin(current.catalog) && readboxPin(current.bindings), 'FEEDBACK_DISPATCH_CURRENT_REQUIRED');
    for (const pin of [current.catalog, current.bindings]) check(roots.every(root => !runtimeInside(root, pin.path)), 'FEEDBACK_DISPATCH_AUTHORITY_WRITABLE');
    const catalog = await readRuntimeJson(current.catalog), bindings = await readRuntimeJson(current.bindings);
    check((await validateCatalog(catalog)).valid && (await validateBindings(bindings, catalog)).valid, 'FEEDBACK_DISPATCH_ROUTE_INVALID');
    const resolved = resolveRoute({ catalog, bindings, route_id: policy.manager_route_id });
    const runtime = resolved.runtime_binding;
    check(resolved.state === 'EXACT' && resolved.route?.route_id === policy.manager_route_id
      && resolved.route.project_code === deployment.linear.expectedBinding.project_code
      && runtime?.binding_state === 'active' && runtime.bridge_state === 'active' && resolved.execution_ready === true
      && runtime.durable_coordination_binding.resource_identifier === policy.bot_chat_id
      && runtime.runtime_agent.resource_identifier === policy.profile_ref
      && Date.parse(runtime.verified_at_kst) <= now && now - Date.parse(runtime.verified_at_kst) <= 300000,
    'FEEDBACK_DISPATCH_ROUTE_REQUIRED');
    // The directory supplies identity only; this approved current purpose policy
    // supplies permission. A model/issue cannot select any of these fields.
    const route_sha256 = hash({ catalog: current.catalog.sha256, bindings: current.bindings.sha256, policy: delivery.policy.sha256 });
    return { policy, route_sha256, expires_at: new Date(Math.min(Date.parse(policy.expires_at), Date.parse(current.expires_at))).toISOString() };
  }
  async function authority() {
    let timer;
    try { return await Promise.race([currentAuthority(), new Promise((_, reject) => { timer = setTimeout(() =>
      reject(Object.assign(new Error('FEEDBACK_DISPATCH_AUTHORITY_TIMEOUT'), { feedbackCode: 'FEEDBACK_DISPATCH_AUTHORITY_TIMEOUT' })), 5000); })]); }
    finally { clearTimeout(timer); }
  }
  function publicRow(value) { return { dispatch_ref: value.dispatch_ref, event_key: value.event_key,
    notice_ref: value.notice_ref, notice_sha256: value.notice_sha256, envelope_sha256: value.envelope_sha256,
    state: value.state, message_id: value.message_id, human_acceptance: 'UNKNOWN', official_done: false }; }
  async function prepare(pin, signal) {
    active(signal);
    check(!readOnly, 'FEEDBACK_DISPATCH_READ_ONLY');
    const item = await readbox.serviceDetail(pin), auth = await authority();
    active(signal);
    check(item.state !== 'running', 'FEEDBACK_DISPATCH_NON_ACTIONABLE');
    const dispatch_ref = `feedback.dispatch.${hash([config.project_id, item.event_key]).slice(0, 32)}`;
    db.prepare('INSERT INTO feedback_dispatch_locator VALUES(?,?) ON CONFLICT(dispatch_ref) DO UPDATE SET locator=excluded.locator')
      .run(dispatch_ref, item.locator);
    const old = db.prepare('SELECT * FROM feedback_dispatch WHERE event_key=?').get(item.event_key);
    if (old) {
      const prior = JSON.parse(old.envelope_json);
      if (old.state !== 'PREPARED' || prior.route_sha256 === auth.route_sha256 && Date.parse(prior.expires_at) > Date.now()) return publicRow(old);
    }
    const envelope = { version: 1, dispatch_ref, project_ref: config.project_id, event_key: item.event_key,
      notice_ref: item.ref, notice_sha256: item.sha256, state: item.state, manager_route_id: auth.policy.manager_route_id,
      route_sha256: auth.route_sha256, profile_ref: auth.policy.profile_ref, bot_chat_id: auth.policy.bot_chat_id,
      sender_ref: auth.policy.sender_ref, purpose: PURPOSE, issued_at: new Date().toISOString(), expires_at: auth.expires_at,
      text: `Feedback ${item.state}; project=${config.project_id}; evidence=${item.ref}; sha256=${item.sha256}; review=${item.review.status}; local_recorded=true; human_acceptance=UNKNOWN; official_done=false` };
    const fresh = await readbox.serviceDetail(pin), reauth = await authority();
    active(signal);
    check(fresh.event_key === item.event_key && hash(reauth) === hash(auth), 'FEEDBACK_DISPATCH_CURRENT_CHANGED');
    const at = new Date().toISOString();
    if (old) db.prepare(`UPDATE feedback_dispatch SET notice_sha256=?,envelope_sha256=?,envelope_json=?,updated_at=?
      WHERE dispatch_ref=? AND state='PREPARED' AND envelope_sha256=?`)
      .run(item.sha256, hash(envelope), JSON.stringify(envelope), at, dispatch_ref, old.envelope_sha256);
    else db.prepare("INSERT OR IGNORE INTO feedback_dispatch VALUES(?,?,?,?,?,?,'PREPARED',NULL,?,?)")
      .run(dispatch_ref, item.event_key, item.ref, item.sha256, hash(envelope), JSON.stringify(envelope), at, at);
    return publicRow(row(dispatch_ref));
  }
  async function authorize(reference, digest, nativeOnly = false) {
    check(ref(reference) && /^[a-f0-9]{64}$/u.test(digest), 'FEEDBACK_DISPATCH_REQUEST_INVALID');
    const saved = row(reference);
    check(saved && saved.envelope_sha256 === digest, 'FEEDBACK_DISPATCH_NOT_FOUND');
    if (nativeOnly) check(saved.state === 'DELIVERY_UNKNOWN', 'FEEDBACK_DISPATCH_ATTEMPT_NOT_CONSUMED');
    const envelope = JSON.parse(saved.envelope_json), auth = await authority();
    check(hash(envelope) === digest && envelope.dispatch_ref === reference && envelope.project_ref === config.project_id
      && envelope.route_sha256 === auth.route_sha256 && envelope.manager_route_id === auth.policy.manager_route_id
      && envelope.bot_chat_id === auth.policy.bot_chat_id && envelope.profile_ref === auth.policy.profile_ref
      && envelope.sender_ref === auth.policy.sender_ref && envelope.purpose === PURPOSE
      && Date.parse(envelope.expires_at) > Date.now(), 'FEEDBACK_DISPATCH_ENVELOPE_STALE');
    const locator = db.prepare('SELECT locator FROM feedback_dispatch_locator WHERE dispatch_ref=?').get(reference)?.locator;
    const item = await readbox.serviceDetail({ ref: saved.notice_ref, sha256: saved.notice_sha256, ...(locator ? { locator } : {}) });
    check(item.event_key === envelope.event_key && item.state === envelope.state, 'FEEDBACK_DISPATCH_EVENT_CHANGED');
    await authority();
    return { status: 'AUTHORIZED', envelope };
  }
  async function native(reference, receiptOnly = false, signal) {
    active(signal);
    check(!readOnly, 'FEEDBACK_DISPATCH_READ_ONLY');
    const saved = row(reference);
    check(saved, 'FEEDBACK_DISPATCH_NOT_FOUND');
    if (receiptOnly) {
      const stored = JSON.parse(saved.envelope_json);
      check(hash(stored) === saved.envelope_sha256 && stored.dispatch_ref === reference && stored.project_ref === config.project_id,
        'FEEDBACK_DISPATCH_ENVELOPE_STALE');
      await authority();
    } else await authorize(reference, saved.envelope_sha256);
    active(signal);
    if (saved.state === 'ACKNOWLEDGED' || !receiptOnly && saved.state !== 'PREPARED') return publicRow(saved);
    const endpoint = new URL(delivery.native_origin);
    check(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && endpoint.port
      && !endpoint.username && !endpoint.password && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash,
    'FEEDBACK_DISPATCH_NATIVE_BINDING_INVALID');
    if (!receiptOnly) {
      const changed = db.prepare("UPDATE feedback_dispatch SET state='DELIVERY_UNKNOWN',updated_at=? WHERE dispatch_ref=? AND state='PREPARED' AND envelope_sha256=?")
        .run(new Date().toISOString(), reference, saved.envelope_sha256);
      if (!changed.changes) return publicRow(row(reference));
    }
    // Durable UNKNOWN precedes the network call. No retry, including process
    // restart, response timeout, malformed ACK, or explicit native rejection.
    try {
      const response = await fetch(new URL(receiptOnly ? '/receipt' : '/send', endpoint), { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dispatch_ref: reference, envelope_sha256: saved.envelope_sha256 }),
        signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
      check(response.ok, 'FEEDBACK_DISPATCH_NATIVE_RESPONSE');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break;
        size += next.value.length; check(size <= 4096, 'FEEDBACK_DISPATCH_NATIVE_RESPONSE'); chunks.push(next.value);
      } } finally { await reader.cancel(); }
      const bytes = Buffer.concat(chunks).toString('utf8');
      const value = JSON.parse(bytes);
      if (value.dispatch_ref === reference && value.envelope_sha256 === saved.envelope_sha256 && value.status === 'ACKNOWLEDGED'
        && typeof value.message_id === 'string' && value.message_id.trim().length > 0 && value.message_id.length <= 512) {
        await authority();
        active(signal);
        db.prepare("UPDATE feedback_dispatch SET state='ACKNOWLEDGED',message_id=?,updated_at=? WHERE dispatch_ref=? AND state='DELIVERY_UNKNOWN'")
          .run(value.message_id, new Date().toISOString(), reference);
      }
    } catch { /* Only exact native receipt readback may resolve unknown. */ }
    active(signal);
    return publicRow(row(reference));
  }
  async function snapshot(query, access) {
    const value = await readbox.snapshot(query, access);
    for (const item of value.items) item.buzz_delivery = db.prepare('SELECT state FROM feedback_dispatch WHERE event_key=?').get(item.event_key)?.state ?? 'NOT_OBSERVED';
    return value;
  }
  async function detail(query, access) {
    const item = await readbox.detail(query, access);
    item.buzz_delivery = db.prepare('SELECT state FROM feedback_dispatch WHERE event_key=?').get(item.event_key)?.state ?? 'NOT_OBSERVED';
    return item;
  }
  let inFlight = null;
  async function tick(signal) {
    check(!readOnly, 'FEEDBACK_DISPATCH_READ_ONLY');
    await readbox.authorizeService();
    active(signal);
    const results = [];
    let scan = db.prepare('SELECT * FROM feedback_dispatch_scan WHERE id=1').get();
    check(scan && scan.pending_json.length <= 50000, 'FEEDBACK_DISPATCH_SCAN_INVALID');
    let pending = JSON.parse(scan.pending_json);
    check(Array.isArray(pending) && pending.length <= 20 && pending.every(item => ref(item.ref) && /^[a-f0-9]{64}$/u.test(item.sha256)
      && /^[rn]:[1-9][0-9]{0,15}$/u.test(item.locator) && ref(item.event_key)), 'FEEDBACK_DISPATCH_SCAN_INVALID');
    const advance = (cursor, items) => {
      active(signal);
      const updated = db.prepare('UPDATE feedback_dispatch_scan SET revision=revision+1,cursor=?,pending_json=? WHERE id=1 AND revision=?')
        .run(cursor, JSON.stringify(items), scan.revision);
      if (!updated.changes) return false;
      scan = { ...scan, revision: scan.revision + 1, cursor }; return true;
    };
    if (!pending.length) {
      const view = await readbox.serviceSnapshot({ limit: 20, cursor: scan.cursor });
      pending = view.items.filter(item => item.state !== 'running' && !['DELIVERY_UNKNOWN', 'ACKNOWLEDGED'].includes(
        db.prepare('SELECT state FROM feedback_dispatch WHERE event_key=?').get(item.event_key)?.state))
        .map(({ ref, sha256, locator, event_key }) => ({ ref, sha256, locator, event_key }));
      await readbox.authorizeService();
      if (!advance(view.next_cursor, pending)) return results;
    }
    // One durable bounded page, at most three attempts per tick. The remainder
    // survives restart. A completed sweep starts again from a fresh high-water
    // mark so old rows changing state behind the cursor are discovered again.
    for (let count = 0; pending.length && count < 3; count++) {
      active(signal);
      const item = pending[0];
      const consumed = db.prepare('SELECT state FROM feedback_dispatch WHERE event_key=?').get(item.event_key)?.state;
      if (!['DELIVERY_UNKNOWN', 'ACKNOWLEDGED'].includes(consumed)) {
        try { const prepared = await prepare(item, signal);
          results.push(prepared.state === 'PREPARED' ? await native(prepared.dispatch_ref, false, signal) : prepared);
        } catch { active(signal); results.push({ event_key: item.event_key, state: 'HELD', code: 'CURRENT_AUTHORITY_OR_SOURCE_UNAVAILABLE' }); }
      }
      await readbox.authorizeService();
      pending = pending.slice(1);
      if (!advance(scan.cursor, pending)) break;
    }
    return results;
  }
  async function boundedTick() {
    const controller = new AbortController(); let timer;
    try { return await Promise.race([tick(controller.signal), new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(Object.assign(new Error('FEEDBACK_DISPATCH_TICK_BUDGET'), { feedbackCode: 'FEEDBACK_DISPATCH_TICK_BUDGET' }));
    }, 60000); })]); } finally { clearTimeout(timer); }
  }
  return { prepare, authorize, authorizeNative: (reference, digest) => authorize(reference, digest, true),
    send: reference => native(reference), reconcile: reference => native(reference, true), snapshot, detail,
    tick() { if (!inFlight) inFlight = boundedTick().finally(() => { inFlight = null; }); return inFlight; }, close() { db.close(); } };
}
