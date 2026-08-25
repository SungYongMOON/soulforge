#!/usr/bin/env node
// Lane 1D acceptance — request admission, idempotency, CAS, lane exclusion, cache identity.
//
// VERIFICATION STRENGTH NOTICE
// The Phase 1-0 frozen oracle contains no 1D cases, so these expectations were written by
// the same author as the implementation. Lane 1V owes an independent locked fixture set.
//
// Read only. Writes nothing.

import {
  admitRequest, resolveIdempotency, recordIdempotency, acquireLane, releaseLane,
  cacheKey, assertCacheEntryServesRequest, assertEvidenceWithinKnownAt, classifyConcurrency,
  OPERATIONS, CEILINGS, REQUIRED_REQUEST_FIELDS, OPEN_AT_RUNTIME, digest,
} from '../../../core/validators/mcp_contract.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

const results = [];
const record = (id, ok, note) => results.push({ id, ok, note });
const expectThrow = (id, fn, note, code = null) => {
  let e = null;
  try { fn(); } catch (err) { e = err; }
  const ok = e instanceof ContractError && (code === null || e.code === code);
  record(id, ok, `${note}${e ? (code && e.code !== code ? ` — got ${e.code}` : '') : ' — NOTHING THROWN'}`);
};
const expectOk = (id, fn, note) => {
  try { fn(); record(id, true, note); } catch (err) { record(id, false, `${note} — threw ${err.code ?? err.message}`); }
};

const T = (d) => `2026-0${d}-01T00:00:00.000Z`;

const current = {
  project_binding_ref: 'binding-alpha',
  accepted_context_generation: 4,
  engine_binding_revision: 'eng-r3',
  module_binding_revision: 'mod-r2',
  fingerprint: 'a'.repeat(64),
};

const baseRequest = {
  request_id: 'req-0001',
  idempotency_key: 'idem-0001',
  caller_identity: 'human-a',
  caller_role: 'registered_reviewer',
  caller_authority_ceiling: 'write',
  project_binding_ref: 'binding-alpha',
  accepted_context_generation: 4,
  engine_binding_revision: 'eng-r3',
  module_binding_revision: 'mod-r2',
  operation: 'read_snapshot',
  requested_ceiling: 'read',
  known_at_boundary: T(5),
  payload: { query: 'snapshot' },
};
const req = (o) => ({ ...baseRequest, ...o });

// ---------------------------------------------------------------- admission

expectOk('1D/ADMIT/valid_read', () => admitRequest(baseRequest, current), 'a fully declared read is admitted');
record('1D/ADMIT/fields_declared', REQUIRED_REQUEST_FIELDS.length === 12, `${REQUIRED_REQUEST_FIELDS.length} required envelope fields`);
record('1D/ADMIT/ceilings_ordered', CEILINGS.join(',') === 'read,candidate,write', 'ceilings are ordered weakest to strongest');

for (const f of ['request_id', 'idempotency_key', 'caller_authority_ceiling', 'accepted_context_generation', 'known_at_boundary', 'operation']) {
  expectThrow(`1D/ADMIT/missing_${f}`, () => {
    const r = req({}); delete r[f]; admitRequest(r, current);
  }, `a missing "${f}" is refused`, 'MCP_REQUEST_FIELD_MISSING');
}
expectThrow('1D/ADMIT/unknown_operation', () => admitRequest(req({ operation: 'delete_everything' }), current),
  'an unknown operation is refused', 'MCP_UNKNOWN_OPERATION');
expectThrow('1D/ADMIT/stale_generation', () => admitRequest(req({ accepted_context_generation: 3 }), current),
  'a request built against an older generation is refused rather than upgraded', 'MCP_STALE_GENERATION');
expectThrow('1D/ADMIT/newer_generation', () => admitRequest(req({ accepted_context_generation: 5 }), current),
  'a generation ahead of the server is also refused', 'MCP_STALE_GENERATION');
expectThrow('1D/ADMIT/project_mismatch', () => admitRequest(req({ project_binding_ref: 'binding-beta' }), current),
  'another project binding is refused', 'MCP_PROJECT_MISMATCH');
expectThrow('1D/ADMIT/engine_binding_changed', () => admitRequest(req({ engine_binding_revision: 'eng-r4' }), current),
  'a changed engine binding is refused', 'MCP_BINDING_CHANGED');
expectThrow('1D/ADMIT/module_binding_changed', () => admitRequest(req({ module_binding_revision: 'mod-r9' }), current),
  'a changed module binding is refused', 'MCP_BINDING_CHANGED');
expectThrow('1D/ADMIT/non_instant_known_at', () => admitRequest(req({ known_at_boundary: '2026-02-30T00:00:00.000Z' }), current),
  'a non existent known_at boundary is refused');

// authority
expectThrow('1D/AUTH/ceiling_below_operation',
  () => admitRequest(req({ operation: 'compute_candidate_finding', requested_ceiling: 'read' }), current),
  'requesting below the operation ceiling is refused', 'MCP_AUTHORITY_INSUFFICIENT');
expectThrow('1D/AUTH/caller_ceiling_exceeded',
  () => admitRequest(req({ operation: 'compute_candidate_finding', requested_ceiling: 'candidate', caller_authority_ceiling: 'read' }), current),
  'a caller cannot request above their own ceiling', 'MCP_AUTHORITY_INSUFFICIENT');
expectOk('1D/AUTH/candidate_within_ceiling',
  () => admitRequest(req({ operation: 'compute_candidate_finding', requested_ceiling: 'candidate', caller_authority_ceiling: 'write' }), current),
  'a candidate request within the caller ceiling is admitted');
expectThrow('1D/AUTH/invalid_ceiling_value',
  () => admitRequest(req({ requested_ceiling: 'superuser' }), current), 'an unknown ceiling value is refused', 'MCP_AUTHORITY_INSUFFICIENT');

// ---------------------------------------------------------------- compare and set

const writeReq = (o) => req({
  operation: 'p5_accept_context', requested_ceiling: 'write',
  expected_prior_fingerprint: current.fingerprint, ...o,
});

expectOk('1D/CAS/matching_fingerprint', () => admitRequest(writeReq(), current), 'a write with the current fingerprint is admitted');
expectThrow('1D/CAS/missing_fingerprint', () => {
  const r = writeReq(); delete r.expected_prior_fingerprint; admitRequest(r, current);
}, 'a state-advancing operation must declare the fingerprint it believes is current', 'MCP_CAS_FINGERPRINT_REQUIRED');
expectThrow('1D/CAS/mismatched_fingerprint', () => admitRequest(writeReq({ expected_prior_fingerprint: 'b'.repeat(64) }), current),
  'a moved-underneath write is refused rather than applied on top', 'MCP_CAS_FINGERPRINT_MISMATCH');
for (const op of ['advance_generation', 'promote_binding', 'p8_write_task']) {
  expectThrow(`1D/CAS/required_for_${op}`, () => {
    const r = writeReq({ operation: op }); delete r.expected_prior_fingerprint; admitRequest(r, current);
  }, `${op} requires a CAS fingerprint`, 'MCP_CAS_FINGERPRINT_REQUIRED');
}
expectOk('1D/CAS/reads_do_not_require_it', () => admitRequest(baseRequest, current), 'reads need no CAS fingerprint');

// ---------------------------------------------------------------- idempotency

{
  const store = new Map();
  const first = resolveIdempotency(store, baseRequest);
  record('1D/IDEM/first_use', first.outcome === 'first_use', 'an unseen key is first use');
  recordIdempotency(store, baseRequest, { snapshot_id: 'snap-1' });

  const replay = resolveIdempotency(store, baseRequest);
  record('1D/IDEM/same_payload_replays', replay.outcome === 'replay' && replay.response.snapshot_id === 'snap-1',
    'the same key with the same payload replays the recorded response without re-executing');

  expectThrow('1D/IDEM/different_payload_conflicts',
    () => resolveIdempotency(store, req({ payload: { query: 'something else' } })),
    'the same key with a different payload is a caller bug and is refused', 'MCP_IDEMPOTENCY_PAYLOAD_CONFLICT');

  expectThrow('1D/IDEM/different_operation_conflicts',
    () => resolveIdempotency(store, req({ operation: 'read_finding_view' })),
    'the same key reused for a different operation is refused', 'MCP_IDEMPOTENCY_OPERATION_CONFLICT');

  expectThrow('1D/IDEM/empty_key', () => resolveIdempotency(store, req({ idempotency_key: '' })),
    'an empty idempotency key is refused');

  record('1D/IDEM/payload_digest_stable', digest({ a: 1, b: 2 }) === digest({ b: 2, a: 1 }),
    'the payload digest is order independent, so key order does not fake a conflict');
}

// ---------------------------------------------------------------- serialised lanes

{
  const lanes = new Map();
  const p5 = OPERATIONS.p5_accept_context.lane;
  const p8 = OPERATIONS.p8_write_task.lane;

  expectOk('1D/LANE/first_holder', () => acquireLane(lanes, p5, 'writer-1'), 'the first writer acquires the lane');
  expectThrow('1D/LANE/second_holder_refused', () => acquireLane(lanes, p5, 'writer-2'),
    'a second attempt on the same lane is refused, not silently queued', 'MCP_SERIALISED_LANE_BUSY');
  expectOk('1D/LANE/same_holder_reentrant', () => acquireLane(lanes, p5, 'writer-1'), 'the holder may re-enter its own lane');
  expectOk('1D/LANE/different_lane_free', () => acquireLane(lanes, p8, 'writer-2'),
    'a different serialised lane is not blocked by an unrelated one');
  releaseLane(lanes, p5, 'writer-1');
  expectOk('1D/LANE/released_then_acquirable', () => acquireLane(lanes, p5, 'writer-2'), 'a released lane can be acquired');
  expectOk('1D/LANE/parallel_needs_no_lane', () => acquireLane(lanes, null, 'reader-1'), 'a parallel operation needs no lane');
}
{
  const c = classifyConcurrency(['read_snapshot', 'compute_candidate_finding', 'p5_accept_context', 'p8_write_task']);
  record('1D/LANE/parallel_classified', c.parallel.length === 2, 'reads and candidate computation are parallel');
  record('1D/LANE/serialised_classified', c.serialised_lanes.length === 2, 'each state-advancing operation has its own lane');
  record('1D/LANE/distinct_lanes_no_conflict', c.conflicts.length === 0, 'P5 and P8 are separate lanes and do not conflict');
  const dup = classifyConcurrency(['p5_accept_context', 'p5_accept_context']);
  record('1D/LANE/same_lane_conflict_detected', dup.conflicts.includes('p5_acceptance'),
    'two attempts at the same lane are reported as a conflict');
  record('1D/LANE/four_serialised_boundaries',
    new Set(Object.values(OPERATIONS).filter((s) => s.concurrency === 'serialised').map((s) => s.lane)).size === 4,
    'P5 acceptance, generation advance, binding promotion, and P8 write are four separate boundaries');
}

// ---------------------------------------------------------------- cache identity

{
  const q = { kind: 'snapshot' };
  const k = cacheKey({ ...current, operation: 'read_snapshot', query: q });
  record('1D/CACHE/stable', cacheKey({ ...current, operation: 'read_snapshot', query: q }) === k, 'the same inputs give the same key');
  record('1D/CACHE/project_changes_key',
    cacheKey({ ...current, project_binding_ref: 'binding-beta', operation: 'read_snapshot', query: q }) !== k,
    'another project binding produces a different key, so isolation is structural');
  record('1D/CACHE/generation_changes_key',
    cacheKey({ ...current, accepted_context_generation: 5, operation: 'read_snapshot', query: q }) !== k,
    'another generation produces a different key');
  record('1D/CACHE/module_binding_changes_key',
    cacheKey({ ...current, module_binding_revision: 'mod-r3', operation: 'read_snapshot', query: q }) !== k,
    'another module binding produces a different key');
  record('1D/CACHE/operation_changes_key',
    cacheKey({ ...current, operation: 'read_finding_view', query: q }) !== k, 'another operation produces a different key');
  record('1D/CACHE/query_changes_key',
    cacheKey({ ...current, operation: 'read_snapshot', query: { kind: 'other' } }) !== k, 'another query produces a different key');
  record('1D/CACHE/hex64', /^[0-9a-f]{64}$/.test(k), 'the cache key is a sha256 hex digest');

  expectThrow('1D/CACHE/cross_project_entry_refused',
    () => assertCacheEntryServesRequest({ project_binding_ref: 'binding-beta', accepted_context_generation: 4 }, baseRequest),
    'an entry from another project must never serve this request', 'MCP_CACHE_CROSS_PROJECT');
  expectThrow('1D/CACHE/stale_generation_entry_refused',
    () => assertCacheEntryServesRequest({ project_binding_ref: 'binding-alpha', accepted_context_generation: 3 }, baseRequest),
    'an entry from another generation must not serve this request', 'MCP_STALE_GENERATION');
  expectOk('1D/CACHE/matching_entry_serves',
    () => assertCacheEntryServesRequest({ project_binding_ref: 'binding-alpha', accepted_context_generation: 4 }, baseRequest),
    'a matching entry serves the request');
}

// ---------------------------------------------------------------- known_at boundary

expectOk('1D/KNOWN_AT/within_boundary',
  () => assertEvidenceWithinKnownAt([{ ref: 'e1', known_at: T(4) }], T(5)), 'evidence at or before the boundary is allowed');
expectThrow('1D/KNOWN_AT/newer_evidence_refused',
  () => assertEvidenceWithinKnownAt([{ ref: 'e1', known_at: T(6) }], T(5)),
  'evidence newer than the declared boundary is refused', 'MCP_EVIDENCE_NEWER_THAN_KNOWN_AT');
expectThrow('1D/KNOWN_AT/non_instant_evidence_refused',
  () => assertEvidenceWithinKnownAt([{ ref: 'e1', known_at: '2026-13-01T00:00:00.000Z' }], T(5)),
  'evidence with a non canonical instant is refused');
expectOk('1D/KNOWN_AT/empty_evidence_ok',
  () => assertEvidenceWithinKnownAt([], T(5)), 'no evidence trivially satisfies the boundary');

record('1D/OPEN/runtime_items_declared', OPEN_AT_RUNTIME.length === 3 && OPEN_AT_RUNTIME.includes('retry_and_timeout_policy'),
  'wire schema, lock mechanism, and retry policy are declared as still open');

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  lane: '1D_mcp_request_receipt_cas_idempotency',
  defines: ['request_envelope_admission', 'authority_ceiling_check', 'compare_and_set_on_state_advance',
    'idempotency_key_payload_binding', 'serialised_lane_exclusion', 'cache_identity_with_structural_project_isolation',
    'known_at_evidence_boundary'],
  verification_strength: 'author_written_fixtures',
  verification_caveat: 'the Phase 1-0 frozen oracle has no 1D cases; lane 1V owes an independent locked fixture set',
  still_open_at_runtime: OPEN_AT_RUNTIME,
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
