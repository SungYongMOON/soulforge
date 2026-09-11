// Bounded read-only assembly through the existing accepted reader. No discovery.
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { createAcceptedContextReader } from './accepted_context_reader.mjs';
import { MEMORY_KINDS } from '../guards/accepted_context_typed_memory.mjs';
import { sameExactRef } from '../../../engineering_engine/kernel/identity.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { compareMemoryCandidates, compareRecallSources, orderMemoryCandidates, MEMORY_PROFILE } from '../../algorithms/memory/ranked_decision_v1.mjs';
import { assembleAcceptedEvidence } from '../../algorithms/assembly/bounded_pack_v1.mjs';

export const CONTEXT_PACK_POLICY = 'accepted-context-pack/1';
export const CONTEXT_PACK_LIMITS = Object.freeze({ max_characters: 12000, max_evidence: 12, max_paths: 6, max_source_reads: 2 });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const count = x => [...JSON.stringify(x)].length + 1; // CLI terminating newline
const keys = (v, list) => v && Object.getPrototypeOf(v) === Object.prototype
  && Object.keys(v).length === list.length && list.every(k => Object.hasOwn(v, k));

// Metrics may grow after assembly as enclosing guards finish their reads.
// Recheck the whole serialized response; a denied result never retains proof.
export function finalizeContextPackObservation(result, metrics, request, { suppress = false } = {}) {
  suppress=suppress || result?.status==='NOT_AVAILABLE';
  const effects={task_mutations:0,writer_calls:0,persistent_writes:0,external_sends:0,model_calls:0};
  let output=suppress || !result ? {status:'NOT_AVAILABLE',identity:null,accepted_generation_ref:null,
    facts:[],evidence:[],paths:[],gaps:['CONTEXT_UNAVAILABLE'],digest:null,effects} : {...result};
  output.metrics={...metrics,output_characters:0};
  const measure=()=>{for(let i=0;i<4;i++)output.metrics.output_characters=count(output);};
  measure();
  const requested=request?.budget?.max_characters;
  const limit=Number.isSafeInteger(requested) && requested>=1200
    ? Math.min(requested,CONTEXT_PACK_LIMITS.max_characters) : CONTEXT_PACK_LIMITS.max_characters;
  if(output.metrics.output_characters>limit) {
    output={status:suppress?'NOT_AVAILABLE':'HOLD',policy_revision:CONTEXT_PACK_POLICY,
      reason:suppress?'CONTEXT_UNAVAILABLE':'OUTPUT_BUDGET_INSUFFICIENT',digest:null,effects,
      metrics:output.metrics};
    measure();
  }
  return output;
}

export function createAcceptedContextPack({ enabled = false, binding, providers, sourceReadback, measureSourceReads, memoryProfile = MEMORY_PROFILE } = {}) {
  return Object.freeze({ async query(input) {
    const started = performance.now();
    let request; let sourceReads = 0; let readerCalls = 0;
    let observation = null;
    const observe = () => structuredClone({ pointer: providers.currentPointer(binding.project_ref),
      source: providers.currentSourceRevisions(binding.project_ref, binding.producer_binding_ref),
      acl: providers.currentAclPolicy(request.actor_ref, binding.project_ref) });
    const exclusions = new Map();
    const exclude = reason => exclusions.set(reason, (exclusions.get(reason) || 0) + 1);
    let budget = CONTEXT_PACK_LIMITS;
    const countedProviders = { ...providers, async readSourceRevision(row) {
      if (sourceReads >= budget.max_source_reads) throw new Error('source budget');
      sourceReads++;
      return providers.readSourceRevision(row);
    } };
    const pack = { status: 'HOLD', policy_revision: CONTEXT_PACK_POLICY, identity: null,
      accepted_generation_ref: null, facts: [], evidence: [], paths: [], conflicts: [],
      coverage: { status: 'UNKNOWN', missing_kinds: [], accepted_corpus_complete: false },
      freshness: 'UNKNOWN', gaps: [], excluded: [], retained_history: [], query_digests: [],
      effects: { task_mutations: 0, writer_calls: 0, persistent_writes: 0, external_sends: 0, model_calls: 0 } };
    function suppress() {
      pack.status = 'NOT_AVAILABLE'; pack.identity = null; pack.accepted_generation_ref = null;
      pack.facts = []; pack.evidence = []; pack.paths = []; pack.conflicts = []; pack.retained_history = [];
      pack.query_digests = []; pack.coverage = { status: 'UNKNOWN', missing_kinds: [], accepted_corpus_complete: false };
      delete pack.document_retrieval;
      delete pack.document_generations;
      pack.freshness = 'UNKNOWN'; pack.gaps = ['CONTEXT_UNAVAILABLE']; exclusions.clear();
    }
    function finish() {
      if (observation) {
        try { if (!isDeepStrictEqual(observation, observe())) suppress(); } catch { suppress(); }
      }
      pack.excluded = [...exclusions].sort((a,b) => compare(a[0],b[0])).map(([reason, count]) => ({ reason, count }));
      pack.gaps = [...new Set(pack.gaps)].sort(compare);
      // Variable IO/time observations are intentionally outside the semantic digest.
      pack.digest = sha256Canonical({ request: request || null, result: pack });
      pack.metrics = { source_reads: sourceReads, reader_calls: readerCalls, tokens: 'UNKNOWN',
        ...(measureSourceReads ? measureSourceReads() : {}), elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
        output_characters: 0 };
      const measure = () => { for (let i = 0; i < 4; i++) pack.metrics.output_characters = count(pack); };
      measure();
      if (pack.metrics.output_characters > budget.max_characters) {
        // Mandatory conflicts/coverage cannot silently disappear. Suppress the
        // answer as a whole when its proof will not fit; retain explicit counts.
        const insufficient = { status: 'HOLD', policy_revision: CONTEXT_PACK_POLICY,
          reason: 'OUTPUT_BUDGET_INSUFFICIENT', withheld: { facts: pack.facts.length, evidence: pack.evidence.length,
            conflicts: pack.conflicts.length, paths: pack.paths.length }, gaps: [...new Set([...pack.gaps, 'REQUIRED_PROOF_WITHHELD'])],
          coverage: { status: 'INSUFFICIENT', missing_kinds: pack.coverage.missing_kinds },
          effects: pack.effects, metrics: pack.metrics };
        insufficient.gaps = insufficient.gaps.slice(0, 6);
        const { metrics: _metrics, ...semantic } = insufficient;
        insufficient.digest = sha256Canonical({ request, result: semantic });
        for (let i = 0; i < 4; i++) insufficient.metrics.output_characters = count(insufficient);
        return insufficient;
      }
      return pack;
    }
    try {
      request = structuredClone(input);
      const fields = ['actor_ref', 'project_ref', 'accepted_generation_ref', 'scope', 'as_of', 'valid_at', 'known_at',
        'purpose', 'task_ref', 'memory_purpose', 'requested_kinds', 'memory_mode', 'budget'];
      if (Object.hasOwn(request || {}, 'query_text')) fields.push('query_text');
      if (!enabled || !keys(request, fields) || !sameExactRef(request.project_ref, binding?.project_ref)
        || Object.hasOwn(request,'query_text') && (typeof providers.retrieveDocuments !== 'function'
          || typeof request.query_text !== 'string' || !request.query_text.trim() || [...request.query_text].length>2000)
        || !/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/u.test(request.task_ref || '')
        || !['work', 'procedure_review'].includes(request.memory_purpose) || !['recall', 'off'].includes(request.memory_mode)
        || !Array.isArray(request.requested_kinds) || !request.requested_kinds.length
        || new Set(request.requested_kinds).size !== request.requested_kinds.length
        || request.requested_kinds.some(k => !MEMORY_KINDS.includes(k))
        || !keys(request.budget, Object.keys(CONTEXT_PACK_LIMITS))
        || Object.entries(CONTEXT_PACK_LIMITS).some(([key, cap]) => !Number.isSafeInteger(request.budget[key])
          || request.budget[key] < (key === 'max_characters' ? 1200 : 0) || request.budget[key] > cap)) {
        request = null; pack.gaps.push('INPUT_OR_BINDING_UNAVAILABLE'); return finish();
      }
      budget = request.budget;
      observation = observe();
      const base = Object.fromEntries(['actor_ref', 'project_ref', 'accepted_generation_ref', 'scope', 'as_of', 'valid_at', 'known_at', 'purpose'].map(k => [k, request[k]]));
      const query = { ...base, budget: { max_units: 100 }, cursor: null };
      const metadataReader = createAcceptedContextReader({ enabled, binding, providers: countedProviders, contextPack: true });
      readerCalls++;
      const meta = await metadataReader.query(query);
      if (meta.status !== 'ok') { pack.status = 'NOT_AVAILABLE'; pack.gaps.push('CONTEXT_UNAVAILABLE'); return finish(); }
      pack.identity = { project_ref: meta.project_ref, task_ref: request.task_ref, task_identity_verified: false };
      pack.accepted_generation_ref = meta.accepted_generation_ref;
      pack.query_digests.push(meta.query_digest);
      const cutoff = meta.context_state.bitemporal_cutoff;
      if (request.valid_at < cutoff.valid_at || request.known_at < cutoff.known_at) {
        pack.gaps.push('HISTORICAL_ACCEPTED_QUERY_UNSUPPORTED'); return finish();
      }
      pack.freshness = request.valid_at > cutoff.valid_at || request.known_at > cutoff.known_at ? 'STALE_OR_UNCONFIRMED' : 'ACCEPTED_AT_REQUESTED_CUTOFF';
      if (pack.freshness === 'STALE_OR_UNCONFIRMED') pack.gaps.push('FRESHNESS_UNCONFIRMED');
      pack.coverage = { status: 'INSUFFICIENT', accepted_corpus_complete: meta.context_state.coverage.coverage_complete,
        missing_kinds: [...request.requested_kinds], cutoff };
      if (meta.cursor) pack.gaps.push('METADATA_PAGE_LIMIT');
      pack.retained_history = meta.context_state.excluded_history.slice(0, budget.max_evidence);
      if (meta.context_state.excluded_history.length > budget.max_evidence) pack.gaps.push('HISTORY_BUDGET_LIMIT');
      for (const _ of meta.context_state.excluded_history) exclude('SUPERSEDED_OR_WITHDRAWN');
      if (request.memory_mode === 'off') {
        pack.status = 'REQUEST_ONLY'; pack.gaps.push('RECALL_EXPLICITLY_DISABLED');
        pack.coverage.status = 'NOT_QUERIED_FOR_TASK'; return finish();
      }
      if (!sourceReadback?.enabled || !Array.isArray(sourceReadback.bindings)) { pack.gaps.push('SOURCE_BINDING_REQUIRED'); return finish(); }
      if (!budget.max_source_reads) { pack.gaps.push('SOURCE_READ_BUDGET'); return finish(); }
      const retrieval = providers.retrieveDocuments ? await providers.retrieveDocuments(request.query_text || request.task_ref) : null;
      if (retrieval) pack.document_retrieval = { ...retrieval.receipt, index_digest: retrieval.index_digest };
      // Only exactly bound source spans are candidates for body IO. The reader
      // still validates their entire authority/generation/revision tuple.
      const eligible = meta.hits.filter(h => sourceReadback.bindings.some(b => b.source_span_ref === h.source_span_ref))
        .sort((a, b) => compareRecallSources(a, b, retrieval));
      const selected = eligible.slice(0, budget.max_source_reads);
      for (let i = selected.length; i < eligible.length; i++) exclude('SOURCE_READ_BUDGET');
      if (eligible.length > selected.length) pack.gaps.push('UNREAD_SOURCES_MAY_CONTAIN_CONFLICTS');
      if (meta.hits.length > eligible.length) pack.gaps.push('UNTYPED_OR_UNBOUND_SOURCE_COVERAGE');
      const selectedSpans = new Set(selected.map(h => h.source_span_ref));
      const reader = createAcceptedContextReader({ enabled, binding, providers: countedProviders, contextPack: true,
        sourceReadback: { enabled: true, max_reads: budget.max_source_reads,
          bindings: sourceReadback.bindings.filter(b => selectedSpans.has(b.source_span_ref)) } });
      readerCalls++;
      const result = await reader.query(query);
      if (result.status !== 'ok' || result.query_digest !== meta.query_digest) {
        suppress(); return finish();
      }
      pack.query_digests.push(result.source_readback_digest);
      const candidates = [];
      for (const hit of selected) {
        const proof = result.source_readback.sources.find(s => s.source_span_ref === hit.source_span_ref);
        const typed = result.typed_memory.find(s => s.source_span_ref === hit.source_span_ref);
        if (proof?.status !== 'VERIFIED' || typed?.status !== 'VERIFIED') {
          pack.gaps.push(proof?.status !== 'VERIFIED' ? proof?.status || 'SOURCE_UNAVAILABLE' : 'TYPED_EVIDENCE_INVALID'); continue;
        }
        for (const record of typed.records) {
          if (record.task_ref !== request.task_ref) { exclude('OTHER_TASK'); continue; }
          pack.identity.task_identity_verified = true;
          if (record.state !== 'active') { exclude('WITHDRAWN_OR_RESOLVED'); continue; }
          if (!record.purposes.includes(request.memory_purpose)) { exclude('PURPOSE_NOT_APPLICABLE'); continue; }
          if (!request.requested_kinds.includes(record.kind)) { exclude('KIND_NOT_REQUESTED'); continue; }
          candidates.push({ record, hit, proof, documentProof: typed.document_proofs?.find(p=>p.record_id===record.id) });
        }
      }
      candidates.sort(compareMemoryCandidates);
      const ids = new Set();
      for (const c of candidates) {
        if (ids.has(c.record.id)) { pack.gaps.push('AMBIGUOUS_TYPED_ID'); return finish(); }
        ids.add(c.record.id);
      }
      for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i].record; const b = candidates[j].record;
        if ((a.kind === b.kind && a.subject === b.subject && a.key === b.key && a.value !== b.value)
          || a.relations.some(r => r.kind === 'conflicts_with' && r.target === b.id)
          || b.relations.some(r => r.kind === 'conflicts_with' && r.target === a.id)) {
          pack.conflicts.push({ left: a.id, right: b.id, state: 'UNRESOLVED' });
        }
      }
      // Conflict sides receive proof before ordinary ranked items.
      const conflictIds = new Set(pack.conflicts.flatMap(c => [c.left, c.right]));
      const ordered = orderMemoryCandidates(candidates, memoryProfile);
      if (ordered.length !== candidates.length || new Set(ordered).size !== candidates.length
        || ordered.some(candidate => !candidates.includes(candidate))) throw new Error('invalid strategy permutation');
      const rank = new Map(ordered.map((candidate, index) => [candidate, index]));
      candidates.sort((a,b) => Number(conflictIds.has(b.record.id)) - Number(conflictIds.has(a.record.id))
        || rank.get(a) - rank.get(b));
      const picked = candidates.slice(0, Math.max(0, budget.max_evidence - pack.retained_history.length));
      for (let i = picked.length; i < candidates.length; i++) exclude('EVIDENCE_BUDGET');
      if (picked.length < candidates.length) pack.gaps.push('EVIDENCE_BUDGET');
      const pickedIds = new Set(picked.map(c => c.record.id));
      if ([...conflictIds].some(id => !pickedIds.has(id))) pack.gaps.push('CONFLICT_PROOF_BUDGET_INSUFFICIENT');
      const useStates = new Map(picked.map(({ record }) => [record.id,
        conflictIds.has(record.id) ? 'DISPUTED' : pack.freshness === 'STALE_OR_UNCONFIRMED' ? 'CURRENTNESS_UNCONFIRMED' : 'ACCEPTED_AT_CUTOFF']));
      Object.assign(pack, assembleAcceptedEvidence(picked, request.memory_purpose, useStates));
      for (const { record } of picked) {
        const { relations } = record;
        for (const relation of relations) {
          if (pack.paths.length >= budget.max_paths) { exclude('PATH_BUDGET'); pack.gaps.push('PATH_BUDGET'); continue; }
          const historyTarget = pack.retained_history.some(h => h.source_span_ref === relation.target);
          pack.paths.push({ from: record.id, ...relation, target_status: pickedIds.has(relation.target)
            ? 'IN_PACK' : historyTarget && relation.kind === 'corrects' ? 'EXCLUDED_HISTORY' : 'UNCONFIRMED' });
          if (!pickedIds.has(relation.target) && !historyTarget) pack.gaps.push('RELATION_TARGET_UNCONFIRMED');
        }
      }
      pack.coverage.missing_kinds = request.requested_kinds.filter(k => !pack.facts.some(f => f.kind === k));
      if (pack.coverage.missing_kinds.length) pack.gaps.push('REQUESTED_INFORMATION_MISSING');
      if (!pack.identity.task_identity_verified) pack.gaps.push('TASK_IDENTITY_UNCONFIRMED');
      if (pack.conflicts.length) pack.gaps.push('UNRESOLVED_CONFLICT');
      pack.coverage.status = pack.gaps.length ? 'INSUFFICIENT' : 'BOUNDED_REQUEST_COVERED';
      pack.status = pack.gaps.includes('CONFLICT_PROOF_BUDGET_INSUFFICIENT') ? 'HOLD' : pack.gaps.length ? 'PARTIAL' : 'OK';
      return finish();
    } catch {
      suppress();
      return finish();
    }
  } });
}
