import { createHash } from 'node:crypto';
import { validateBuzzPilotBinding } from './buzz_pilot_job.mjs';
import { attentionFail, attentionHash } from './owner_attention_source.mjs';
import { safeOwnerAttentionBuzzUrl } from './owner_attention_buzz_link.mjs';

const iso = value => new Date(value).toISOString();
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const check = (value, code, status = 503) => { if (!value) attentionFail(code, status); };
const same = (a, b) => attentionHash(a) === attentionHash(b);
const fence = view => [view.source_sha256, view.question_ref, view.sequence, view.state, view.capture_health];

/** A view-preference writer, never a native event writer or notification sender.
 * The trusted reader owns current native authorization and protected evidence.
 * Only immutable identity hashes and reversible preferences enter the ERP DB. */
export function createBuzzPilotOwnerAttentionService({ store, pilotReader, binding,
  legacyService = null, now = Date.now } = {}) {
  check(store?.db && typeof pilotReader?.snapshot === 'function'
    && typeof pilotReader?.readEvidence === 'function', 'BUZZ_ATTENTION_PORTS_REQUIRED');
  const bound = validateBuzzPilotBinding(binding);
  const bindingSha = sha(JSON.stringify(Object.fromEntries(Object.keys(bound).sort().map(key => [key, bound[key]]))));
  const db = store.db;
  // Same existing preference table; no new source, canonical schema or outbox.
  db.exec(`CREATE TABLE IF NOT EXISTS owner_attention_view (
    request_key TEXT PRIMARY KEY, owner_account_id TEXT NOT NULL, source_sha256 TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0, seen_at TEXT, snooze_until TEXT
  )`);

  async function authorize(access) {
    check(access?.accountId === bound.owner_account_id && await access?.checkSession?.() === true,
      'OWNER_ACCESS_REQUIRED', 403);
    check(await access?.canAccessProject?.(bound.project_id) === true, 'PROJECT_ACCESS_CHANGED', 403);
  }
  function validate(view) {
    check(view?.job_id === bound.job_id && view.project_id === bound.project_id
      && view.profile_ref === bound.profile_ref && view.source_sha256 === bindingSha
      && view.source_ref === `bp-source:${bindingSha.slice(7)}`
      && view.issued_at === bound.issued_at && view.expires_at === bound.expires_at,
    'BUZZ_ATTENTION_BINDING_CHANGED');
    check(Array.isArray(view.event_refs) && Array.isArray(view.evidence_refs), 'BUZZ_ATTENTION_SOURCE_INVALID');
    return view;
  }
  async function current(access) {
    await authorize(access);
    return validate(await pilotReader.snapshot(access));
  }
  function preference(row) {
    const state = db.prepare('SELECT * FROM owner_attention_view WHERE request_key=?').get(row.request_key);
    check(!state || state.owner_account_id === bound.owner_account_id && state.source_sha256 === row.source_sha256,
      'ATTENTION_VIEW_SOURCE_CONFLICT');
    return { ...row, view_version: state?.version ?? 0, seen_at: state?.seen_at ?? null,
      snooze_until: state?.snooze_until ?? null,
      snoozed: row.source_state === 'awaiting' && !!state?.snooze_until && Date.parse(state.snooze_until) > now(),
      overdue: false };
  }
  async function native(access) {
    const view = await current(access);
    if (!view.question_ref) return { view, item: null };
    const registrations = view.event_refs.filter(event => event.event_type === 'question_registered'
      && event.evidence_refs?.some(pin => pin.role === 'question' && pin.ref === view.question_ref));
    check(registrations.length === 1, 'BUZZ_ATTENTION_QUESTION_CONFLICT');
    const event = registrations[0], pin = event.evidence_refs.find(pin => pin.role === 'question');
    check(pin?.ref === view.question_ref && view.evidence_refs.some(value => same(value, pin)), 'BUZZ_ATTENTION_EVIDENCE_CONFLICT');
    const evidence = await pilotReader.readEvidence({ role: 'question', observation_id: event.observation_id }, access);
    check(Buffer.isBuffer(evidence.bytes) && evidence.bytes.length <= 65536 && evidence.bytes.length === pin.size
      && evidence.size === pin.size && evidence.mediaType === 'text/plain' && pin.mediaType === 'text/plain'
      && evidence.ref === pin.ref && evidence.sha256 === pin.sha256 && sha(evidence.bytes) === pin.sha256,
    'BUZZ_ATTENTION_EVIDENCE_CONFLICT');
    let question;
    try { question = new TextDecoder('utf-8', { fatal: true }).decode(evidence.bytes); }
    catch { attentionFail('BUZZ_ATTENTION_EVIDENCE_CONFLICT'); }
    const latest = await current(access);
    check(same(fence(view), fence(latest)), 'ATTENTION_REQUEST_CHANGED', 409);
    const terminal = ['failed', 'cancelled', 'delivered', 'final_delivery_failed', 'final_delivery_unknown'].includes(view.recorded_state);
    const expired = now() >= Date.parse(bound.expires_at);
    // Execution expiry cannot revoke a recorded terminal history. Reading that
    // history still requires the reader's current Owner/session/project access.
    const uncertain = !terminal && (expired || ['capture_incomplete', 'capture_syncing', 'capture_unconfirmed', 'expired'].includes(view.state));
    const waiting = !uncertain && view.state === 'waiting_owner' && view.owner_action_required === true;
    if (waiting) check(view.expected_responder?.account_id === bound.owner_account_id
      && view.expected_responder?.pubkey === bound.expected_owner_pubkey, 'BUZZ_ATTENTION_RESPONDER_CHANGED');
    const answer = view.event_refs.find(value => value.event_type === 'answer_received'
      && value.evidence_refs?.some(value => value.role === 'answer' && value.ref === view.answer_ref));
    const sourceState = uncertain ? 'unconfirmed' : waiting ? 'awaiting'
      : answer ? 'responded' : terminal ? 'withdrawn' : 'unconfirmed';
    const delivery = view.event_refs.find(value => value.event_type === 'question_delivery');
    const delivered = !!delivery && !!view.wait_started_at;
    const url = safeOwnerAttentionBuzzUrl(view.buzz_url);
    // A model-provided URL cannot widen the fixed channel/message route.
    const trustedUrl = url && (url === `buzz://channel/${bound.chat_id}`
      || new RegExp(`^buzz://message\\?channel=${bound.chat_id}&id=[a-f0-9]{64}$`, 'u').test(url)) ? url : null;
    const identity = ['buzz_pilot_question:v1', bindingSha, bound.owner_account_id,
      bound.job_id, bound.project_id, pin.ref, pin.sha256, event.ref, event.digest];
    const item = preference({ request_key: attentionHash(['buzz_pilot_owner_attention:v1', ...identity]),
      source_kind: 'buzz_pilot', correlation_ref: view.source_ref, revision: 1,
      source_ref: pin.ref, source_sha256: attentionHash(identity),
      sender_account_id: bound.expected_bot_pubkey, sender_label: 'Buzz 파일럿 봇',
      owner_account_id: bound.owner_account_id, project_id: bound.project_id, item_id: bound.job_id,
      item_title: 'Buzz 질문', question, judgment: '', verification: 'native 질문 관측 근거',
      next_actions: [sourceState === 'awaiting' ? 'Buzz에서 이 질문에 답변해 주세요.'
        : sourceState === 'unconfirmed' ? '운영담당이 Buzz 전달·관측 상태를 확인해야 합니다.'
          : sourceState === 'responded' ? '답변이 기록되었습니다. 추가 답변 요청은 없습니다.'
            : '요청 종료가 기록되었습니다. 추가 답변 요청은 없습니다.'],
      blocked_work: [sourceState === 'awaiting' ? '이 질문의 답변을 기다리는 작업'
        : sourceState === 'unconfirmed' ? '업무의 답변 대기 여부는 아직 확인되지 않았습니다.'
          : '이 질문에 대한 답변 대기는 종료되었습니다.'],
      refs: [view.source_ref, event.ref, pin.ref], question_ref: pin.ref,
      created_at: view.wait_started_at ?? view.issued_at, due_at: null,
      wait_started_at: view.wait_started_at, wait_elapsed_ms: view.wait_elapsed_ms,
      source_state: sourceState, native_state: view.state, owner_action_required: waiting,
      closure_ref: sourceState === 'responded' ? view.answer_ref
        : sourceState === 'withdrawn' ? view.event_refs.at(-1)?.ref ?? null : null,
      buzz_url: trustedUrl, buzz_link_state: trustedUrl ? 'available' : 'unavailable',
      native_delivery_confirmed: delivered, notification_source: 'buzz_pilot_question_delivery' });
    return { view, item };
  }
  async function snapshot(access) {
    const result = await native(access);
    const legacy = legacyService ? await legacyService.snapshot(access) : null;
    const latest = await current(access);
    check(same(fence(result.view), fence(latest)), 'ATTENTION_REQUEST_CHANGED', 409);
    const items = [...(legacy?.items ?? []), ...(result.item ? [result.item] : [])];
    check(new Set(items.map(row => row.request_key)).size === items.length, 'ATTENTION_REQUEST_KEY_CONFLICT');
    return { status: 'available', observed_at: iso(now()), items,
      notification: { ...(legacy?.notification ?? { capability: 'unavailable', counts: {} }),
        native_delivery: { confirmed_request_count: result.item?.native_delivery_confirmed ? 1 : 0,
          source: 'buzz_pilot_question_delivery' } },
      native_source_state: latest.state, operations_attention: latest.operations_attention === true,
      acceptance_changed: false, official_done_changed: false };
  }
  async function act(access, input) {
    check(input && Object.keys(input).every(key => ['request_key', 'source_sha256', 'view_version', 'action', 'minutes'].includes(key))
      && id(input.request_key) && id(input.source_sha256) && Number.isSafeInteger(input.view_version)
      && ['seen', 'snooze', 'unsnooze'].includes(input.action)
      && (input.action === 'snooze' ? [30, 120, 1440].includes(input.minutes) : input.minutes === undefined),
    'ATTENTION_ACTION_INVALID', 400);
    const { item } = await native(access);
    if (!item || item.request_key !== input.request_key) {
      if (legacyService) return legacyService.act(access, input);
      attentionFail('ATTENTION_REQUEST_NOT_FOUND', 404);
    }
    check(item.source_sha256 === input.source_sha256 && item.source_state === 'awaiting', 'ATTENTION_REQUEST_CHANGED', 409);
    // No awaits inside the preference transaction; concurrent callers use CAS.
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = preference(item);
      check(current.view_version === input.view_version, 'ATTENTION_VIEW_CHANGED', 409);
      const until = input.action === 'snooze' ? iso(now() + input.minutes * 60000)
        : input.action === 'unsnooze' ? null : current.snooze_until;
      db.prepare(`INSERT INTO owner_attention_view(request_key,owner_account_id,source_sha256,version,seen_at,snooze_until)
        VALUES(?,?,?,?,?,?) ON CONFLICT(request_key) DO UPDATE SET version=excluded.version,seen_at=excluded.seen_at,snooze_until=excluded.snooze_until`)
        .run(item.request_key, bound.owner_account_id, item.source_sha256, current.view_version + 1, current.seen_at ?? iso(now()), until);
      const result = preference(item); db.exec('COMMIT');
      return { status: 'recorded', item: result, acceptance_changed: false, official_done_changed: false };
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  // Native delivery already occurred. This port only preserves a separately
  // configured legacy notifier; it never sends a second native-question ping.
  async function dispatch(access) {
    await native(access);
    return legacyService ? legacyService.dispatch(access) : { status: 'idle', sent: false };
  }
  return { snapshot, act, dispatch };
}
