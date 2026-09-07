// Server-owned selection of explicitly delegated Linear issues. Collection
// evidence proves a current observation, never execution or notification authority.
import { sha256Canonical } from '../shared/project_history_envelope.mjs';

const REF = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const KINDS = new Set(['bug', 'feature', 'improvement']);
const DELEGATION_FIELDS = ['delegation_ref', 'authority_revision', 'issue_id', 'scope_ref', 'kind',
  'status', 'selection_authority', 'valid_from', 'valid_until'];
const safe = (value, pattern) => typeof value === 'string' && pattern.test(value);
const exact = (value, fields) => value !== null && typeof value === 'object'
  && [null, Object.prototype].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === fields.length
  && fields.every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = () => { throw new Error('FEEDBACK_LINEAR_UNAVAILABLE'); };
const held = () => ({ status: 'HOLD', snapshot_ref: 'feedback.linear.unavailable', items: [] });

/** listDelegations/currentDelegation are trusted server ports, not provider fields.
 * A delegation's selection_authority is exactly internal_feedback_source; it
 * grants source selection only. reader is createLinearReadEvidenceReader-compatible.
 * currentDelegation(delegation_ref) must return the exact current delegation or null.
 * Delegations and snapshots are bounded to 256; no scanning or persistence occurs.
 * The metadata reader supplies the full normalized issue hash, including provider
 * updated_at/status. Collection polling receipts do not reopen work; provider
 * edits conservatively do. This is not a meaning-only hash or an echo detector.
 */
export function createLinearFeedbackSource({ reader, listDelegations, currentDelegation, now = Date.now } = {}) {
  if (![reader?.resolve, listDelegations, currentDelegation, now].every(fn => typeof fn === 'function')) {
    throw new TypeError('feedback_linear_ports_required');
  }
  let cached = new Map();
  let pending = Promise.resolve();
  function serial(fn) {
    const result = pending.then(fn);
    pending = result.catch(() => {});
    return result;
  }
  function validateDelegation(value) {
    const at = now();
    if (!Number.isFinite(at) || !exact(value, DELEGATION_FIELDS)
      || ![value.delegation_ref, value.authority_revision, value.scope_ref].every(v => safe(v, REF))
      || !safe(value.issue_id, UUID) || !KINDS.has(value.kind) || value.status !== 'CURRENT'
      || value.selection_authority !== 'internal_feedback_source' || !iso(value.valid_from) || !iso(value.valid_until)
      || Date.parse(value.valid_from) > at || Date.parse(value.valid_until) <= at
      || Date.parse(value.valid_from) >= Date.parse(value.valid_until)) fail();
    return Object.freeze({ ...value });
  }
  async function recheck(delegation) {
    const value = validateDelegation(await currentDelegation(delegation.delegation_ref));
    if (sha256Canonical(value) !== sha256Canonical(delegation)) fail();
  }
  async function observe(delegation) {
    await recheck(delegation);
    const value = await reader.resolve({ issueId: delegation.issue_id });
    await recheck(delegation);
    if (value?.status !== 'CURRENT' || value.execution_authority !== false || value.issue_id !== delegation.issue_id
      || value.project_scope_ref !== delegation.scope_ref || !safe(value.issue_content_sha256, SHA)
      || value.linear_task?.state !== 'current' || value.linear_task?.task_ref?.provider !== 'linear'
      || !safe(value.linear_task?.task_ref?.task_id, REF)) fail();
    const semantic = sha256Canonical({ issue_id: delegation.issue_id, issue_content_sha256: value.issue_content_sha256,
      scope_ref: delegation.scope_ref, kind: delegation.kind, delegation_ref: delegation.delegation_ref,
      authority_revision: delegation.authority_revision }).slice(7);
    return Object.freeze({ source_ref: `linear.issue:${delegation.issue_id}`, semantic_sha256: semantic,
      source_revision: `linear.issue.revision:${value.issue_content_sha256.slice(7)}`,
      scope_ref: delegation.scope_ref, kind: delegation.kind });
  }
  return Object.freeze({
    execution_authority: false,
    snapshot() {
      return serial(async () => {
        cached = new Map();
        try {
          const supplied = await listDelegations();
          if (!Array.isArray(supplied) || supplied.length > 256) fail();
          const delegations = supplied.map(validateDelegation);
          const issueIds = new Set(), delegationRefs = new Set();
          for (const delegation of delegations) {
            if (issueIds.has(delegation.issue_id) || delegationRefs.has(delegation.delegation_ref)) fail();
            issueIds.add(delegation.issue_id); delegationRefs.add(delegation.delegation_ref);
          }
          const next = new Map();
          for (const delegation of delegations) {
            const item = await observe(delegation);
            next.set(item.source_ref, { item, delegation });
          }
          // Later issue IO may revoke an earlier member of this observation set.
          for (const delegation of delegations) await recheck(delegation);
          const items = [...next.values()].map(value => value.item).sort((a, b) => a.source_ref.localeCompare(b.source_ref));
          cached = next;
          return { status: 'CURRENT', snapshot_ref: `feedback.linear.snapshot:${sha256Canonical(items).slice(7)}`,
            items: Object.freeze(items) };
        } catch { cached = new Map(); return held(); }
      });
    },
    current(sourceRef, semanticSha256) {
      return serial(async () => {
        if (!safe(sourceRef, REF) || !safe(semanticSha256, HASH)) return false;
        const prior = cached.get(sourceRef);
        if (!prior || prior.item.semantic_sha256 !== semanticSha256) return false;
        try {
          const item = await observe(prior.delegation);
          if (item.semantic_sha256 !== semanticSha256) fail();
          return true;
        } catch { cached = new Map(); return false; }
      });
    },
  });
}
