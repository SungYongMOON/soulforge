// Read-only consumer. Providers are explicitly bound by the caller, never discovered.
import { isDeepStrictEqual, types } from 'node:util';
import { sameExactRef, exactRefIdentityKey } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { computeProjectContextExportedSourceRevisionSetDigest } from '../../../../guild_hall/engineering_engine/kernel/project_context_generation_candidate.mjs';
import { createAcceptedContextQuery, makeUniformNotAvailable } from './accepted_context_query.mjs';

// Reject accessors/proxies before cloning; provider IO must end before the final
// synchronous observations, so no await can outlive the last authorization check.
function detached(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') throw new Error('unavailable');
    return value;
  }
  if (types.isProxy(value) || seen.has(value)) throw new Error('unavailable');
  seen.add(value);
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [detached(k, seen), detached(v, seen)]));
  if (value instanceof Set) return new Set([...value].map(v => detached(v, seen)));
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) throw new Error('unavailable');
  const out = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !d?.enumerable || !Object.hasOwn(d, 'value') || key === '__proto__') throw new Error('unavailable');
    out[key] = detached(d.value, seen);
  }
  seen.delete(value);
  return out;
}

function exactKeys(value, fields) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k));
}

function verifyCurrent(binding, request, state, bundle) {
  const { pointer, source } = state;
  const { manifest, receipt } = bundle;
  if (!sameExactRef(request.project_ref, binding.project_ref)
    || !sameExactRef(pointer.project_ref, binding.project_ref)
    || !sameExactRef(pointer.generation_ref, request.accepted_generation_ref)
    || pointer.cas_fingerprint !== manifest.cas_fingerprint_sha256
    || pointer.writer_epoch !== manifest.writer_witness.writer_epoch
    || pointer.project_context_ref !== manifest.project_context.project_context_ref
    || !Number.isSafeInteger(pointer.generation_number) || pointer.generation_number < 1
    || !sameExactRef(receipt.accepted_generation_ref, pointer.generation_ref)
    || !exactKeys(source, ['project_ref', 'producer_binding_ref', 'producer_refs', 'source_revision_refs'])
    || !sameExactRef(source.project_ref, binding.project_ref)
    || !sameExactRef(source.producer_binding_ref, binding.producer_binding_ref)
    || !isDeepStrictEqual(source.producer_refs, manifest.producer_refs)
    || !Array.isArray(source.source_revision_refs) || source.source_revision_refs.length === 0
    || source.source_revision_refs.some(row => !exactKeys(row, ['scope', 'source_revision_ref'])
      || !['project', 'common'].includes(row.scope) || !exactRefIdentityKey(row.source_revision_ref))) return false;
  // The producer must expose the complete explicit revision set, including
  // retained predecessors. Availability counts/timestamps are never revisions.
  return computeProjectContextExportedSourceRevisionSetDigest(source.source_revision_refs)
    === manifest.project_context.exported_source_revision_set_digest_sha256;
}

export function createAcceptedContextReader({ enabled = false, binding, providers } = {}) {
  const bound = binding ? detached(binding) : null;
  const configured = enabled === true && exactKeys(bound, ['project_ref', 'producer_binding_ref'])
    && exactRefIdentityKey(bound.project_ref) && exactRefIdentityKey(bound.producer_binding_ref)
    && ['currentPointer', 'currentSourceRevisions', 'currentAclPolicy', 'readAcceptedGeneration']
      .every(name => typeof providers?.[name] === 'function');
  const observe = request => detached({
    pointer: providers.currentPointer(detached(bound.project_ref)),
    source: providers.currentSourceRevisions(detached(bound.project_ref), detached(bound.producer_binding_ref)),
    acl: providers.currentAclPolicy(request.actor_ref, detached(bound.project_ref)),
  });
  return Object.freeze({
    async query(request) {
      if (!configured) return makeUniformNotAvailable();
      try {
        const safe = detached(request);
        if (!sameExactRef(safe.project_ref, bound.project_ref)) return makeUniformNotAvailable();
        const before = observe(safe);
        // Validate request and fresh ACL before provider IO, without revealing
        // whether an accepted object exists to unauthorized callers.
        const gate = createAcceptedContextQuery({ aclPolicy: before.acl, readModel: {
          getCurrentPointer() { return null; },
        } });
        const admission = await gate.query(safe);
        if (admission.status === 'HOLD') return makeUniformNotAvailable();
        const grant = before.acl.actors.get(safe.actor_ref);
        if (!grant || before.acl.revoked_actors.has(safe.actor_ref)
          || before.acl.revoked_generations.has(exactRefIdentityKey(safe.accepted_generation_ref))
          || !grant.allowed_projects.has(exactRefIdentityKey(safe.project_ref))
          || !grant.allowed_scopes.has(safe.scope) || !grant.allowed_purposes.has(safe.purpose)) return makeUniformNotAvailable();
        if (!isDeepStrictEqual(before, observe(safe))) return makeUniformNotAvailable();
        const bundle = detached(await providers.readAcceptedGeneration(detached(safe.project_ref), detached(safe.accepted_generation_ref)));
        if (!exactKeys(bundle, ['manifest', 'receipt'])) return makeUniformNotAvailable();
        const after = observe(safe);
        if (!isDeepStrictEqual(before, after) || !verifyCurrent(bound, safe, after, bundle)) return makeUniformNotAvailable();
        const result = await createAcceptedContextQuery({ aclPolicy: after.acl, readModel: {
          getCurrentPointer: () => after.pointer, getProjectRef: () => bound.project_ref,
          getGeneration: () => bundle.manifest, getReceipt: () => bundle.receipt,
        } }).query(safe);
        if (result.status !== 'ok') return makeUniformNotAvailable();
        const final = observe(safe);
        if (!isDeepStrictEqual(after, final) || !verifyCurrent(bound, safe, final, bundle)) return makeUniformNotAvailable();
        return result;
      } catch { return makeUniformNotAvailable(); }
    },
  });
}
