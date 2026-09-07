import { createHash } from 'node:crypto';

const EVENT = new Set(['owner_attention/request', 'owner_attention/responded', 'owner_attention/withdrawn', 'owner_attention/response']);
const CORRELATION = /^oa1:([a-z0-9][a-z0-9_-]{0,63}):([1-9][0-9]{0,5}):(none|[1-9][0-9]{9})$/u;
const REF = /^[a-z][a-z0-9-]{1,39}:[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
export const attentionHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function attentionFail(code, status = 503) {
  throw Object.assign(new Error(code), { attentionCode: code, status });
}
const text = (value, max, required = false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())
    || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value)) attentionFail('ATTENTION_SOURCE_INVALID');
  return value;
};
function list(value, { refs = false, required = false } = {}) {
  let values;
  try { values = JSON.parse(value); } catch { attentionFail('ATTENTION_SOURCE_INVALID'); }
  if (!Array.isArray(values) || values.length > 20 || (required && !values.length)) attentionFail('ATTENTION_SOURCE_INVALID');
  return values.map(v => { text(v, refs ? 240 : 1000, true); if (refs && !REF.test(v)) attentionFail('ATTENTION_REFS_INVALID'); return v; });
}

/** A read-only projection of explicitly typed ERP submissions. It never scans
 * working folders, raw conversations, old metadata or inferred task states. */
export function createOwnerAttentionSource({ store, ownerAccountId, enabled = false, maxRows = 10000,
  verifyBuzzResponse = () => null, now = () => Date.now() } = {}) {
  if (!store?.db) throw new TypeError('erp_store_required');
  const db = store.db;
  function currentOwner(accountId) {
    if (!enabled || typeof ownerAccountId !== 'string' || !ownerAccountId) attentionFail('ATTENTION_NOT_CONFIGURED');
    const owner = db.prepare('SELECT id,status FROM core_account WHERE id=?').get(ownerAccountId);
    if (!owner || owner.status !== 'active' || accountId !== owner.id) attentionFail('OWNER_ACCESS_REQUIRED', 403);
    return owner;
  }
  function read(accountId) {
    currentOwner(accountId);
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='erp_mcp_work_session'").get()) attentionFail('WORK_SESSION_SOURCE_UNAVAILABLE');
    const rows = db.prepare(`SELECT w.*, i.project_id, i.title AS item_title, i.assignee_ref,
      a.status AS sender_status, a.username, a.display_name, a.email, a.person_id
      FROM erp_mcp_work_session w LEFT JOIN core_item i ON i.id=w.item_id
      LEFT JOIN core_account a ON a.id=w.account_id
      WHERE substr(w.request_kind,1,16)='owner_attention/' ORDER BY w.rowid LIMIT ?`).all(maxRows + 1);
    if (rows.length > maxRows) attentionFail('ATTENTION_SOURCE_LIMIT');
    const groups = new Map();
    for (const row of rows) {
      if (!EVENT.has(row.request_kind)) attentionFail('ATTENTION_EVENT_UNSUPPORTED');
      let payload;
      try {
        payload = { item_id: row.item_id, client_session_ref: row.client_session_ref,
          summary: row.summary, knowledge: row.knowledge, outputs: JSON.parse(row.outputs_json),
          verification: row.verification, next_actions: JSON.parse(row.next_actions_json),
          stop_conditions: JSON.parse(row.stop_conditions_json), request_kind: row.request_kind,
          artifact_ids: JSON.parse(row.artifact_ids_json) };
      } catch { attentionFail('ATTENTION_SOURCE_INVALID'); }
      if (attentionHash(payload) !== row.payload_sha256) attentionFail('ATTENTION_SOURCE_DIGEST_MISMATCH');
      if (row.request_kind === 'owner_attention/response') continue; // Resolved below from the exact Owner account.
      // A revoked/inactive sender cannot keep a question or a notification live.
      if (row.sender_status !== 'active' || !row.project_id) continue;
      const sender = { id: row.account_id, username: row.username, email: row.email, person_id: row.person_id };
      if (!store.isAdmin(sender.id) && !store.accountIdentities(sender).includes(String(row.assignee_ref || ''))) continue;
      const match = CORRELATION.exec(row.client_session_ref || '');
      if (!match || !/^[a-f0-9]{64}$/u.test(row.payload_sha256 || '')) attentionFail('ATTENTION_CORRELATION_INVALID');
      const [, correlation, versionText, dueText] = match;
      const revision = Number(versionText);
      const groupKey = attentionHash([ownerAccountId, row.account_id, row.item_id, correlation]);
      const group = groups.get(groupKey) ?? { last: 0, versions: new Map() };
      groups.set(groupKey, group);
      const refs = list(row.outputs_json, { refs: true });
      if (row.request_kind === 'owner_attention/request') {
        if (group.versions.has(revision)) {
          if (group.versions.get(revision).source_sha256 !== row.payload_sha256) attentionFail('ATTENTION_REVISION_CONFLICT');
          continue; // Same immutable payload under another transport key is not a new ask.
        }
        if (revision !== group.last + 1) attentionFail('ATTENTION_REVISION_GAP');
        const before = group.versions.get(group.last);
        if (before) before.source_state = 'superseded';
        const item = {
          request_key: attentionHash([groupKey, revision]), correlation_ref: groupKey, revision,
          source_ref: `work-session:${row.id}`, source_sha256: row.payload_sha256,
          sender_account_id: row.account_id, sender_label: text(row.display_name || row.username, 200, true),
          owner_account_id: ownerAccountId, project_id: row.project_id, item_id: row.item_id,
          item_title: text(row.item_title, 1000, true), question: text(row.summary, 2000, true),
          judgment: text(row.knowledge, 2000), verification: text(row.verification, 2000),
          next_actions: list(row.next_actions_json, { required: true }),
          blocked_work: list(row.stop_conditions_json, { required: true }), refs,
          created_at: row.created_at, due_at: dueText === 'none' ? null : new Date(Number(dueText) * 1000).toISOString(),
          source_state: 'awaiting', closure_ref: null,
        };
        if (!Number.isFinite(Date.parse(item.created_at))) attentionFail('ATTENTION_SOURCE_INVALID');
        group.versions.set(revision, item); group.last = revision;
      } else {
        const item = group.versions.get(revision);
        if (!item || revision !== group.last || !['awaiting', 'response_unverified'].includes(item.source_state)
          || !refs.includes(`owner-request:${item.source_ref.slice('work-session:'.length)}`)
          || (dueText === 'none' ? null : new Date(Number(dueText) * 1000).toISOString()) !== item.due_at) attentionFail('ATTENTION_CLOSURE_CONFLICT');
        if (row.request_kind === 'owner_attention/responded' && !refs.some(ref => ref.startsWith('owner-response:'))) attentionFail('ATTENTION_RESPONSE_REF_REQUIRED');
        item.source_state = row.request_kind.endsWith('/responded') ? 'response_unverified' : 'withdrawn';
        item.closure_ref = item.source_state === 'withdrawn' ? `work-session:${row.id}` : null;
        if (item.source_state === 'response_unverified') item.reported_response_ref = refs.find(ref => ref.startsWith('owner-response:'));
      }
    }
    for (const group of groups.values()) {
      const item = group.versions.get(group.last);
      if (!['awaiting', 'response_unverified'].includes(item?.source_state)) continue;
      const originalId = item.source_ref.slice('work-session:'.length);
      // A bot's response ref alone cannot close an ask. The exact Owner must
      // have published a scoped response, or a separately trusted Buzz reader
      // must attest the same source revision and Owner response receipt.
      const responses = rows.filter(row => row.account_id === ownerAccountId && row.sender_status === 'active'
        && row.request_kind === 'owner_attention/response' && row.item_id === item.item_id
        && row.client_session_ref === rows.find(original => original.id === originalId)?.client_session_ref);
      for (const response of responses) if (list(response.outputs_json, { refs: true }).includes(`owner-request:${originalId}`)
        && text(response.summary, 2000, true) && /^[a-f0-9]{64}$/u.test(response.payload_sha256)) {
        item.source_state = 'responded'; item.closure_ref = `work-session:${response.id}`;
      }
      if (item.source_state !== 'responded' && item.reported_response_ref) {
        const proof = verifyBuzzResponse({ ...item });
        if (proof?.verified === true && proof.active === true && Number.isFinite(Date.parse(proof.expires_at))
          && Date.parse(proof.expires_at) > now() && proof.owner_account_id === ownerAccountId
          && proof.source_ref === item.source_ref && proof.source_sha256 === item.source_sha256
          && proof.response_ref === item.reported_response_ref && REF.test(proof.receipt_ref || '')) {
          item.source_state = 'responded'; item.closure_ref = proof.receipt_ref;
        }
      }
    }
    currentOwner(accountId);
    return [...groups.values()].flatMap(group => [...group.versions.values()]);
  }
  return { read, currentOwner, ownerAccountId };
}
