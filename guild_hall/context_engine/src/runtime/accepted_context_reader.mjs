// Read-only consumer. Providers are explicitly bound by the caller, never discovered.
import { isDeepStrictEqual, types } from 'node:util';
import { createHash } from 'node:crypto';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { computeProjectContextExportedSourceRevisionSetDigest } from '../../../engineering_engine/kernel/project_context_generation_candidate.mjs';
import { createAcceptedContextQuery, makeUniformNotAvailable } from '../guards/accepted_context_query.mjs';
import { readTypedMemory } from '../guards/accepted_context_typed_memory.mjs';

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

export function createAcceptedContextReader({ enabled = false, binding, providers, sourceReadback, contextPack = false } = {}) {
  const bound = binding ? detached(binding) : null;
  // Opt-in exact locator bindings belong to the caller's trusted source adapter.
  // Neither source discovery nor labels can supply these bindings.
  const readback = sourceReadback ? detached(sourceReadback) : null;
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
        const typed = [];
        let evidence = null;
        if (readback?.enabled === true) {
          if (!exactKeys(readback, ['enabled', 'max_reads', 'bindings'])
            || !Number.isSafeInteger(readback.max_reads) || readback.max_reads < 1 || readback.max_reads > 2
            || !Array.isArray(readback.bindings) || readback.bindings.length > 100
            || typeof providers.readSourceRevision !== 'function') return makeUniformNotAvailable();
          evidence = [];
          let reads = 0; let bodyLoaded = false;
          for (const hit of result.hits) {
            const expected = { actor_ref: safe.actor_ref, purpose: safe.purpose,
              scope: safe.scope, source_lane: hit.source_lane,
              project_ref: safe.project_ref, accepted_generation_ref: safe.accepted_generation_ref,
              grant_revision_ref: grant.grant_revision_ref, source_revision_ref: hit.source_revision_ref,
              source_span_ref: hit.source_span_ref, context_unit_ref: hit.context_unit_ref,
              context_event_ref: hit.context_event_ref, context_branch_ref: hit.context_branch_ref,
              valid_at: hit.valid_at, known_at: hit.known_at };
            const matches = readback.bindings.filter(row => row.source_span_ref === hit.source_span_ref);
            let status = 'BINDING_UNAVAILABLE'; let locator = null;
            if (matches.length === 1) {
              const row = matches[0];
              const { locator: location, ...identity } = row;
              if (isDeepStrictEqual(identity, expected) && typeof location === 'string'
                && (/^paragraph:[1-9][0-9]{0,5}$/u.test(location)
                  || contextPack && typeof providers.retrieveDocuments === 'function' && location === 'document:1')) {
                locator = location;
                status = 'BUDGET_EXCEEDED';
                if (reads < readback.max_reads) {
                  // Recheck fresh authority immediately before every body read.
                  if (!isDeepStrictEqual(after, observe(safe))) return makeUniformNotAvailable();
                  reads += 1;
                  status = 'SOURCE_UNAVAILABLE';
                  try {
                    const loaded = detached(await providers.readSourceRevision(detached(row)));
                    if (typeof loaded?.body === 'string' || typeof loaded?.body_base64 === 'string') bodyLoaded = true;
                    if (location === 'document:1' && exactKeys(loaded, ['binding','body_base64','records_json','document_proofs'])
                      && isDeepStrictEqual(loaded.binding,row) && typeof loaded.body_base64 === 'string'
                      && loaded.body_base64.length <= 180000 && typeof loaded.records_json === 'string'
                      && Array.isArray(loaded.document_proofs)) {
                      const bytes=Buffer.from(loaded.body_base64,'base64');
                      status=bytes.toString('base64')!==loaded.body_base64 || bytes.length>131072
                        || 'sha256:'+createHash('sha256').update(bytes).digest('hex')!==hit.source_revision_ref.content_id
                        ? 'REVISION_MISMATCH':'VERIFIED';
                      if(status==='VERIFIED') {
                        const memory=readTypedMemory(loaded.records_json,safe.project_ref,hit,safe.scope);
                        if(memory.status==='VERIFIED' && memory.records.every(r=>loaded.document_proofs.filter(p=>p.record_id===r.id).length===1))
                          typed.push({source_span_ref:hit.source_span_ref,...memory,document_proofs:loaded.document_proofs});
                      }
                    }
                    if (exactKeys(loaded, ['binding', 'body']) && isDeepStrictEqual(loaded.binding, row)
                      && typeof loaded.body === 'string' && Buffer.byteLength(loaded.body, 'utf8') <= 131072) {
                      const digest = 'sha256:' + createHash('sha256').update(loaded.body, 'utf8').digest('hex');
                      const paragraph = Number(location.slice('paragraph:'.length));
                      status = digest !== hit.source_revision_ref.content_id ? 'REVISION_MISMATCH'
                        : !loaded.body.split(/\r?\n\s*\r?\n/u)[paragraph - 1]?.trim() ? 'LOCATOR_UNAVAILABLE' : 'VERIFIED';
                      if (contextPack && status === 'VERIFIED') typed.push({ source_span_ref: hit.source_span_ref,
                        ...readTypedMemory(loaded.body.split(/\r?\n\s*\r?\n/u)[paragraph - 1], safe.project_ref, hit, safe.scope) });
                    }
                  } catch { /* Missing/deleted source is never verified from its hash alone. */ }
                }
              }
            }
            evidence.push(Object.freeze({ source_span_ref: hit.source_span_ref, locator, status }));
          }
          evidence = Object.freeze({ sources: Object.freeze(evidence), source_reads: reads, source_body_loaded: bodyLoaded,
            complete: evidence.length > 0 && evidence.every(item => item.status === 'VERIFIED') });
        }
        const final = observe(safe);
        if (!isDeepStrictEqual(after, final) || !verifyCurrent(bound, safe, final, bundle)) return makeUniformNotAvailable();
        const details = contextPack ? { context_state: {
          bitemporal_cutoff: bundle.manifest.bitemporal_cutoff,
          coverage: bundle.manifest.coverage_gap_receipt,
          excluded_history: bundle.manifest.project_context.memberships.filter(m => m.scope === safe.scope
            && m.acceptance_state !== 'accepted_current').map(m => ({ source_span_ref: m.source_span_ref,
            source_revision_ref: m.source_revision_ref, correction_state: m.correction_state, supersession: m.supersession })),
        }, typed_memory: typed } : {};
        if (!evidence) return Object.freeze({ ...result, ...details });
        // Default readback returns metadata only. Explicit contextPack mode also
        // returns the bounded typed assertions, never the complete source body.
        return Object.freeze({ ...result, ...details, source_readback: evidence,
          source_readback_digest: sha256Canonical({ query_digest: result.query_digest, evidence }),
          boundaries: Object.freeze({ ...result.boundaries, source_body_loaded: evidence.source_body_loaded,
            ...(contextPack && typed.some(t => t.records.length) ? { metadata_only: false, raw_payload_copied: true } : {}) }) });
      } catch { return makeUniformNotAvailable(); }
    },
  });
}
