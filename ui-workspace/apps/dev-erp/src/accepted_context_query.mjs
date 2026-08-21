// dev-ERP Accepted Context Query foundation.
// Read-only, generation-pinned, ACL-aware, uniform existence, no-fallback.

import { types } from 'node:util';
import { compareCodePoints } from '../../../../guild_hall/engineering_engine/kernel/canonical.mjs';
import { exactRefIdentityKey, sameExactRef } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { sha256Canonical } from '../../../../guild_hall/shared/project_history_envelope.mjs';
import {
  PROJECT_CONTEXT_ACCEPTED_GENERATION_SCHEMA,
  PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA,
  verifyAcceptedGenerationManifest,
} from '../../../../guild_hall/engineering_engine/kernel/project_context_acceptance_gate.mjs';
import { canonicalInstantEpoch } from '../../../../guild_hall/engineering_engine/kernel/project_context_generation_candidate.mjs';

export const ACCEPTED_CONTEXT_QUERY_RESULT_SCHEMA = 'soulforge.dev_erp_accepted_context_query_result.v1';

export const ACCEPTED_CONTEXT_QUERY_CODES = Object.freeze({
  INPUT_INVALID: 'P5_QUERY_INPUT_INVALID',
  NOT_AVAILABLE: 'P5_QUERY_NOT_AVAILABLE',
  GENERATION_STALE_OR_UNACCEPTED: 'P5_QUERY_GENERATION_STALE_OR_UNACCEPTED',
  GENERATION_INTEGRITY_FAILED: 'P5_QUERY_GENERATION_INTEGRITY_FAILED',
  CURSOR_GENERATION_MISMATCH: 'P5_QUERY_CURSOR_GENERATION_MISMATCH',
  INVALID_CURSOR: 'P5_QUERY_INVALID_CURSOR',
  SCOPE_INVALID: 'P5_QUERY_SCOPE_INVALID',
  AUTH_DENIED: 'P5_QUERY_AUTH_DENIED',
  RAW_PAYLOAD_FORBIDDEN: 'P5_QUERY_RAW_PAYLOAD_FORBIDDEN',
});

const C = ACCEPTED_CONTEXT_QUERY_CODES;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}$/u;
const SECRET = /(?:^|[:._-])(?:token|secret|credential|password|passwd|cookie|bearer)(?:[:._=-]|$)/iu;
const CREDENTIAL = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const FORBIDDEN = /(?:^|_)(?:body|payload|raw|text|query|explanation|private_path|absolute_path|source_path|secret|credential|password|cookie|token)(?:_|$)/u;

const QUERY_REQUEST_FIELDS = [
  'actor_ref', 'project_ref', 'accepted_generation_ref', 'scope', 'as_of', 'purpose', 'budget', 'cursor',
];
const BUDGET_FIELDS = ['max_units'];
const ACL_POLICY_FIELDS = ['actors', 'revoked_actors', 'revoked_generations'];
const ACL_GRANT_FIELDS = [
  'grant_revision_ref', 'allowed_projects', 'allowed_scopes', 'allowed_purposes',
  'field_allowed', 'chunk_allowed', 'locator_allowed',
];
const CURSOR_FIELDS = ['generation_ref', 'scope', 'as_of', 'purpose', 'actor_ref', 'grant_revision_ref', 'offset'];
const RECEIPT_FIELDS = [
  'schema_version', 'kind', 'status', 'accepted_generation_ref', 'prior_generation_ref',
  'manifest_digest_sha256', 'receipt_digest_sha256', 'blocker_codes', 'claim_ceiling',
];
const MEMBER_FIELDS = [
  'source_span_ref', 'source_revision_ref', 'source_lane', 'scope', 'context_event_ref', 'context_unit_ref',
  'context_branch_ref', 'membership_state', 'correction_state', 'review_requirement', 'reviewer_state', 'supersession', 'valid_at', 'known_at', 'acceptance_state',
];

function keys(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === fields.length && fields.every(function (field) { return Object.hasOwn(value, field); });
}

function hash(value) { return typeof value === 'string' && HASH.test(value); }
function token(value) {
  return typeof value === 'string' && TOKEN.test(value) && value.normalize('NFC') === value
    && !/^[A-Za-z]:/u.test(value) && !JWT.test(value) && !SECRET.test(value) && !CREDENTIAL.test(value);
}

function ref(value) {
  if (!keys(value, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'])
      || !token(value.entity_id) || !token(value.revision_id) || !hash(value.content_id)
      || value.content_hash_alg !== 'sha256') return null;
  return exactRefIdentityKey(value) === null ? null : {
    entity_id: value.entity_id, revision_id: value.revision_id,
    content_id: value.content_id, content_hash_alg: value.content_hash_alg,
  };
}

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = clone(v);
  }
  return out;
}

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function instant(value) { return canonicalInstantEpoch(value) !== null; }
function epoch(value) { return canonicalInstantEpoch(value); }

function exactReferenceKey(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('\u001f');
  return parts.length === 4 && ref({
    entity_id: parts[0], revision_id: parts[1], content_id: parts[2], content_hash_alg: parts[3],
  }) !== null;
}

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function strictSet(value, predicate) {
  if (!(value instanceof Set)) return false;
  for (const entry of value) if (!predicate(entry)) return false;
  return true;
}

function parseAclGrant(value) {
  if (!isPlain(value) || !keys(value, ACL_GRANT_FIELDS) || !ref(value.grant_revision_ref)
      || !strictSet(value.allowed_projects, exactReferenceKey)
      || !strictSet(value.allowed_scopes, function (entry) { return entry === 'project' || entry === 'common'; })
      || !strictSet(value.allowed_purposes, token)
      || value.field_allowed !== true || value.chunk_allowed !== true || value.locator_allowed !== true) return null;
  return freeze({
    grant_revision_ref: clone(value.grant_revision_ref),
    allowed_projects: new Set(value.allowed_projects), allowed_scopes: new Set(value.allowed_scopes),
    allowed_purposes: new Set(value.allowed_purposes), field_allowed: true, chunk_allowed: true, locator_allowed: true,
  });
}

function parseAclPolicy(value) {
  if (!isPlain(value) || !keys(value, ACL_POLICY_FIELDS) || !(value.actors instanceof Map)
      || !strictSet(value.revoked_actors, token) || !strictSet(value.revoked_generations, exactReferenceKey)) return null;
  const actors = new Map();
  for (const [actor, grantValue] of value.actors) {
    if (!token(actor) || actors.has(actor)) return null;
    const grant = parseAclGrant(grantValue);
    if (!grant) return null;
    actors.set(actor, grant);
  }
  return { actors: actors, revoked_actors: new Set(value.revoked_actors), revoked_generations: new Set(value.revoked_generations) };
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (typeof value !== 'string' || value.length < 4 || value.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(value)
      || value.length % 4 === 1) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) return null;
    const parsed = snapshot(JSON.parse(decoded.toString('utf8')));
    if (!parsed || !keys(parsed, CURSOR_FIELDS) || !ref(parsed.generation_ref)
        || (parsed.scope !== 'project' && parsed.scope !== 'common') || !instant(parsed.as_of)
        || !token(parsed.purpose) || !token(parsed.actor_ref) || !ref(parsed.grant_revision_ref)
        || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) return null;
    return parsed;
  } catch { return null; }
}

function validateMembership(member) {
  return keys(member, MEMBER_FIELDS) && token(member.source_span_ref) && ref(member.source_revision_ref)
    && token(member.source_lane) && token(member.context_event_ref) && token(member.context_unit_ref)
    && token(member.context_branch_ref) && ['active', 'superseded', 'retracted'].includes(member.membership_state)
    && ['original', 'corrected', 'retracted'].includes(member.correction_state)
    && ['project', 'common'].includes(member.scope) && (member.scope === 'common' ? member.source_lane === 'common' : member.source_lane !== 'common')
    && ['not_required', 'required'].includes(member.review_requirement)
    && ['not_required', 'reviewed'].includes(member.reviewer_state)
    && keys(member.supersession, ['state', 'predecessor_source_span_refs']) && ['root', 'resolved_successor', 'superseded', 'retracted'].includes(member.supersession.state)
    && Array.isArray(member.supersession.predecessor_source_span_refs)
    && ['accepted_current', 'excluded_historical'].includes(member.acceptance_state)
    && instant(member.valid_at) && instant(member.known_at) && epoch(member.valid_at) <= epoch(member.known_at);
}

function verifyReceipt(receipt, manifest) {
  if (!isPlain(receipt) || !keys(receipt, RECEIPT_FIELDS)
      || receipt.schema_version !== PROJECT_CONTEXT_ACCEPTED_GENERATION_RECEIPT_SCHEMA
      || receipt.kind !== 'project_context_accepted_generation_receipt' || receipt.status !== 'accepted'
      || !sameExactRef(receipt.accepted_generation_ref, manifest.accepted_generation_ref)
      || !sameExactRef(receipt.prior_generation_ref, manifest.prior_generation_ref)
      || receipt.manifest_digest_sha256 !== manifest.manifest_digest_sha256
      || !hash(receipt.receipt_digest_sha256) || !Array.isArray(receipt.blocker_codes)
      || receipt.blocker_codes.length !== 0 || receipt.claim_ceiling !== 'observed') return false;
  const material = clone(receipt);
  delete material.receipt_digest_sha256;
  try { return sha256Canonical(material) === receipt.receipt_digest_sha256; } catch { return false; }
}

function snapshot(root) {
  const seen = new WeakSet();
  let count = 0;
  const walk = function (value, depth, path) {
    count += 1;
    if (count > 1200000 || depth > 40) throw new Error('unsafe');
    if (value === null) return null;
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > 4096 || value.normalize('NFC') !== value
          || /[\u0000-\u001f\u007f]/u.test(value) || /[\\/]/u.test(value)
          || JWT.test(value) || SECRET.test(value) || CREDENTIAL.test(value)) throw new Error('unsafe');
      return value;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value !== 'object' || types.isProxy(value) || seen.has(value)) throw new Error('unsafe');
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 4096) throw new Error('unsafe');
      const desc = Object.getOwnPropertyDescriptors(value);
      const out = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = desc[String(index)];
        if (!item || !Object.hasOwn(item, 'value') || item.enumerable !== true) throw new Error('unsafe');
        out.push(walk(item.value, depth + 1, path + '[]'));
      }
      return out;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('unsafe');
    const desc = Object.getOwnPropertyDescriptors(value);
    const list = Reflect.ownKeys(desc);
    if (list.length > 64 || list.some(function (key) { return typeof key !== 'string'; })) throw new Error('unsafe');
    const out = {};
    list.sort(compareCodePoints).forEach(function (key) {
      const item = desc[key];
      if (FORBIDDEN.test(key) || !item || !Object.hasOwn(item, 'value') || item.enumerable !== true) throw new Error('unsafe');
      out[key] = walk(item.value, depth + 1, path ? path + '.' + key : key);
    });
    return out;
  };
  try { return walk(root, 0, ''); } catch { return null; }
}

function emptyBoundaries() {
  return {
    metadata_only: true,
    raw_payload_copied: false,
    source_body_loaded: false,
    task_mutated: false,
    generation_advanced: false,
    implicit_fallback_used: false,
    writes_performed: false,
    mcp_called: false,
  };
}

function emptyAuthority() {
  return {
    accepted_history: false,
    knowledge_acceptance: false,
    owner_approval: false,
    ontology_acceptance: false,
    canon_mutation: false,
    registry_mutation: false,
    graph_mutation: false,
    rag_ingestion: false,
    task_mutation: false,
    feature_activation: false,
  };
}

function emptyEffects() {
  return {
    persistent_writes: 0,
    model_calls: 0,
    network_calls: 0,
    erp_writes: 0,
    taskdriver_activations: 0,
    writer_calls: 0,
  };
}

function emptyResult(status, blockerCodes) {
  return freeze({
    schema_version: ACCEPTED_CONTEXT_QUERY_RESULT_SCHEMA,
    kind: 'accepted_context_query_result',
    status: status,
    scope: null,
    actor_ref: null,
    project_ref: null,
    accepted_generation_ref: null,
    generation_cas_fingerprint: null,
    query_digest: null,
    claim_ceiling: 'observed',
    hits: [],
    cursor: null,
    total_hits: 0,
    page_hits: 0,
    boundaries: emptyBoundaries(),
    authority: emptyAuthority(),
    effects: emptyEffects(),
    blocker_codes: blockerCodes,
  });
}

function makeUniformNotAvailable() { return emptyResult('NOT_AVAILABLE', [C.NOT_AVAILABLE]); }
function makeHold(blockerCodes) { return emptyResult('HOLD', blockerCodes.slice().sort(compareCodePoints)); }

export function createAcceptedContextQuery({ store, readModel, aclPolicy } = {}) {
  if ((store && readModel) || (!store && !readModel)) throw new Error('Exactly one read source is required');
  const source = store || readModel;
  const policy = parseAclPolicy(aclPolicy);
  if (!source || typeof source !== 'object' || !policy) {
    throw new Error('Valid source and complete exact ACL policy are required');
  }

  return {
    async query(request) {
      const safe = snapshot(request);
      if (!safe || typeof safe !== 'object' || !keys(safe, QUERY_REQUEST_FIELDS)) {
        return makeHold([C.INPUT_INVALID]);
      }

      const actorToken = typeof safe.actor_ref === 'string' && token(safe.actor_ref) ? safe.actor_ref : null;
      const projectBinding = ref(safe.project_ref);
      const targetGenerationRef = ref(safe.accepted_generation_ref);
      const scope = safe.scope;
      const asOf = safe.as_of;
      const purpose = safe.purpose;
      const budget = safe.budget;
      const maxUnits = budget && keys(budget, BUDGET_FIELDS) ? budget.max_units : null;

      if (!actorToken || !projectBinding || !targetGenerationRef
          || (scope !== 'project' && scope !== 'common')
          || !instant(asOf) || !token(purpose)
          || !Number.isSafeInteger(maxUnits) || maxUnits < 1 || maxUnits > 100) {
        return makeHold([C.INPUT_INVALID]);
      }

      const cursor = safe.cursor === null ? null : decodeCursor(safe.cursor);
      if (safe.cursor !== null && !cursor) {
        return makeHold([C.INVALID_CURSOR]);
      }

      const projectKey = exactRefIdentityKey(projectBinding);
      const generationKey = exactRefIdentityKey(targetGenerationRef);
      const grant = policy.actors.get(actorToken);
      if (!grant || policy.revoked_actors.has(actorToken) || policy.revoked_generations.has(generationKey)
          || !grant.allowed_projects.has(projectKey) || !grant.allowed_scopes.has(scope)
          || !grant.allowed_purposes.has(purpose) || grant.field_allowed !== true
          || grant.chunk_allowed !== true || grant.locator_allowed !== true) {
        return makeUniformNotAvailable();
      }
      if (cursor && (!sameExactRef(cursor.generation_ref, targetGenerationRef) || cursor.scope !== scope
          || cursor.as_of !== asOf || cursor.purpose !== purpose || cursor.actor_ref !== actorToken
          || !sameExactRef(cursor.grant_revision_ref, grant.grant_revision_ref))) {
        return makeHold([C.CURSOR_GENERATION_MISMATCH]);
      }

      let pointer; let manifest; let receipt;
      try {
        pointer = source.getCurrentPointer ? snapshot(source.getCurrentPointer()) : null;
        if (!pointer || !sameExactRef(pointer.generation_ref, targetGenerationRef)) return makeUniformNotAvailable();
        manifest = source.getGeneration ? snapshot(source.getGeneration(targetGenerationRef)) : null;
        receipt = source.getReceipt ? snapshot(source.getReceipt(targetGenerationRef)) : null;
      } catch { return makeUniformNotAvailable(); }
      if (!manifest || !receipt || !verifyAcceptedGenerationManifest(manifest, manifest.manifest_digest_sha256)
          || !verifyReceipt(receipt, manifest)) {
        return makeUniformNotAvailable();
      }

      if (!sameExactRef(manifest.project_binding_ref, projectBinding)) {
        return makeUniformNotAvailable();
      }
      if (source.getProjectRef && !sameExactRef(source.getProjectRef(), projectBinding)) {
        return makeUniformNotAvailable();
      }

      const memberships = Array.isArray(manifest.project_context && manifest.project_context.memberships)
        ? manifest.project_context.memberships
        : [];
      if (!Array.isArray(manifest.project_context && manifest.project_context.memberships)
          || memberships.some(function (member) { return !validateMembership(member); })) {
        return makeHold([C.GENERATION_INTEGRITY_FAILED]);
      }
      const asOfEpoch = epoch(asOf);

      const filtered = memberships.filter(function (member) {
        if (member.scope !== scope) return false;
        if (member.acceptance_state !== 'accepted_current' || member.membership_state !== 'active') return false;
        if (member.correction_state !== 'original' && member.supersession.state !== 'resolved_successor') return false;
        if (epoch(member.valid_at) > asOfEpoch || epoch(member.known_at) > asOfEpoch) return false;
        return true;
      });

      // Deterministic sort
      filtered.sort(function (left, right) {
        const leftKey = left.source_span_ref + '\0' + left.context_unit_ref + '\0' + left.context_event_ref;
        const rightKey = right.source_span_ref + '\0' + right.context_unit_ref + '\0' + right.context_event_ref;
        return compareCodePoints(leftKey, rightKey);
      });

      const offset = cursor ? cursor.offset : 0;
      if (offset >= filtered.length && cursor) return makeHold([C.INVALID_CURSOR]);

      const sliced = filtered.slice(offset, offset + maxUnits);
      const nextOffset = offset + maxUnits;
      const nextCursor = nextOffset < filtered.length ? encodeCursor({
        generation_ref: targetGenerationRef, scope: scope, as_of: asOf, purpose: purpose,
        actor_ref: actorToken, grant_revision_ref: grant.grant_revision_ref, offset: nextOffset,
      }) : null;

      const hits = sliced.map(function (item) {
        return {
          source_span_ref: item.source_span_ref,
          source_revision_ref: clone(item.source_revision_ref),
          source_lane: item.source_lane,
          context_event_ref: item.context_event_ref,
          context_unit_ref: item.context_unit_ref,
          context_branch_ref: item.context_branch_ref,
          membership_state: item.membership_state,
          correction_state: item.correction_state,
          claim_ceiling: 'observed',
          valid_at: item.valid_at,
          known_at: item.known_at,
        };
      });

      const queryDigest = sha256Canonical({
        domain: 'soulforge.dev_erp_accepted_context_query.v1',
        project_ref: projectBinding,
        accepted_generation_ref: targetGenerationRef,
        scope: scope,
        as_of: asOf,
        purpose: purpose,
        grant_revision_ref: grant.grant_revision_ref,
        hits: hits,
      });

      return freeze({
        schema_version: ACCEPTED_CONTEXT_QUERY_RESULT_SCHEMA,
        kind: 'accepted_context_query_result',
        status: 'ok',
        scope: scope,
        actor_ref: actorToken,
        project_ref: clone(projectBinding),
        accepted_generation_ref: clone(targetGenerationRef),
        generation_cas_fingerprint: manifest.cas_fingerprint_sha256,
        query_digest: queryDigest,
        claim_ceiling: 'observed',
        hits: hits,
        cursor: nextCursor,
        total_hits: filtered.length,
        page_hits: hits.length,
        boundaries: emptyBoundaries(),
        authority: emptyAuthority(),
        effects: emptyEffects(),
        blocker_codes: [],
      });
    },
  };
}
