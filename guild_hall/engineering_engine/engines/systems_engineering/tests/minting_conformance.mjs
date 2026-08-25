// D-P10-03 conformance — the serialised identifier minting boundary.
//
// Verification strength: author-written fixtures. The frozen Phase 1-0 oracle predates this
// decision and encodes no minting case, so these expectations were written by the same
// author as the implementation. Lane 1V owes a mutation-based lock over this file.

import {
  MINTED_FAMILIES, DERIVED_FAMILIES, CALLER_FAMILIES, MINTING_LANE, CODES,
  classifyIdentifierFamily, acquireMintingLane, assertMintingLaneHeld, mint,
  candidateHandle, isCandidateHandle, assertIsMintedIdentifier,
  assertParallelStageMayNotMint, evaluateMinterOutage,
} from '../../../core/validators/minting.mjs';
import { inspectIdentifierOpacity } from '../../../core/validators/identity.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

const SYNTHETIC_PROJECT_MARKER = ['P', '00', '-', '000'].join('');
const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
const rejects = (id, fn, expectedCode, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  const ok = err instanceof ContractError && (!expectedCode || err.code === expectedCode);
  record(id, ok, ok ? note : `expected ${expectedCode}, got ${err ? err.code : 'no error'}`);
};
const accepts = (id, fn, note = '') => {
  try { fn(); record(id, true, note); } catch (e) { record(id, false, `unexpected ${e.code ?? e.message}`); }
};

// A suite that cannot fail proves nothing. These five probes assert the helpers detect what
// they claim to.
{
  const probe = [];
  const rec = (ok) => probe.push(ok === true);
  const rej = (fn, code) => { let e = null; try { fn(); } catch (x) { e = x; } rec(e instanceof ContractError && (!code || e.code === code)); };
  const acc = (fn) => { try { fn(); rec(true); } catch { rec(false); } };
  rej(() => 1, 'ANY_CODE');
  rej(() => { throw new ContractError('OTHER', 'x'); }, 'WANTED');
  rej(() => { throw new ContractError('WANTED', 'x'); }, 'WANTED');
  rej(() => { throw new TypeError('x'); }, undefined);
  acc(() => { throw new ContractError('X', 'x'); });
  record('MINT/harness/self_test',
    probe[0] === false && probe[1] === false && probe[2] === true && probe[3] === false && probe[4] === false,
    'the reject and accept helpers detect what they claim to');
}

const V4 = 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const V7 = '0192f0a1-b2c3-7d4e-8f01-234567890abc';
const LANE = `${MINTING_LANE}:held`;
const emptyRegistry = () => new Set();

// ---------------------------------------------------------------- family split

record('MINT/families_are_disjoint',
  [...MINTED_FAMILIES, ...DERIVED_FAMILIES, ...CALLER_FAMILIES].length ===
  new Set([...MINTED_FAMILIES, ...DERIVED_FAMILIES, ...CALLER_FAMILIES]).size,
  'a family must not be minted and derived at once');
record('MINT/classify_minted', classifyIdentifierFamily('finding_id') === 'minted');
record('MINT/classify_derived', classifyIdentifierFamily('content_id') === 'derived');
record('MINT/classify_caller', classifyIdentifierFamily('request_id') === 'caller_supplied');
rejects('MINT/classify_unknown_family_rejected',
  () => classifyIdentifierFamily('gizmo_id'), CODES.FAMILY_UNKNOWN,
  'a new family needs a contract change');
rejects('MINT/derived_family_cannot_be_minted',
  () => mint({ family: 'content_id', value: V4, laneToken: LANE, registry: emptyRegistry(), derivation: 'random' }),
  CODES.FAMILY_NOT_MINTABLE, 'content_id is determined by the bytes');
rejects('MINT/caller_family_cannot_be_minted',
  () => mint({ family: 'request_id', value: V4, laneToken: LANE, registry: emptyRegistry(), derivation: 'random' }),
  CODES.FAMILY_NOT_MINTABLE);

// ---------------------------------------------------------------- serialisation

accepts('MINT/lane_acquired_when_free', () => acquireMintingLane({ held: false }), 'positive control');
accepts('MINT/lane_acquired_with_no_prior_state', () => acquireMintingLane(undefined));
rejects('MINT/lane_refuses_when_held',
  () => acquireMintingLane({ held: true, holder: 'p5' }), CODES.LANE_BUSY,
  'refused, not queued');
record('MINT/lane_token_shape', acquireMintingLane({ held: false }).token === LANE);
accepts('MINT/lane_assertion_passes_with_token', () => assertMintingLaneHeld(LANE));
rejects('MINT/mint_without_lane_rejected',
  () => mint({ family: 'finding_id', value: V4, registry: emptyRegistry(), derivation: 'random' }),
  CODES.LANE_NOT_HELD, 'no identifier outside the boundary');
rejects('MINT/mint_with_forged_lane_token_rejected',
  () => mint({ family: 'finding_id', value: V4, laneToken: 'identifier_minting:maybe', registry: emptyRegistry(), derivation: 'random' }),
  CODES.LANE_NOT_HELD);

// ---------------------------------------------------------------- value form

accepts('MINT/accepts_uuid_v4',
  () => mint({ family: 'snapshot_id', value: V4, laneToken: LANE, registry: emptyRegistry(), derivation: 'random' }),
  'positive control');
accepts('MINT/accepts_uuid_v7',
  () => mint({ family: 'snapshot_id', value: V7, laneToken: LANE, registry: emptyRegistry(), derivation: 'random' }),
  'the UUID that the opacity heuristic used to veto');
for (const [label, bad] of [
  ['version_1_embeds_a_mac_and_time', 'a3f1c2d4-5e6f-1a7b-8c9d-0e1f2a3b4c5d'],
  ['version_5_is_name_derived', 'a3f1c2d4-5e6f-5a7b-8c9d-0e1f2a3b4c5d'],
  ['non_rfc_variant_nibble', 'a3f1c2d4-5e6f-4a7b-0c9d-0e1f2a3b4c5d'],
  ['uppercase_is_a_second_spelling', 'A3F1C2D4-5E6F-4A7B-8C9D-0E1F2A3B4C5D'],
  ['truncated', 'a3f1c2d4-5e6f-4a7b-8c9d'],
  ['meaningful_prefix', 'finding-a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d'],
  ['not_a_string', 12345],
]) {
  rejects(`MINT/form/${label}`,
    () => mint({ family: 'finding_id', value: bad, laneToken: LANE, registry: emptyRegistry(), derivation: 'random' }),
    CODES.FORM_INVALID);
}
// The mint-level opacity check is defence in depth and is unreachable while the form gate
// is stricter. This asserts the ordering so the redundancy is deliberate, not accidental.
record('MINT/form_gate_fires_before_opacity_gate',
  inspectIdentifierOpacity(`finding-${SYNTHETIC_PROJECT_MARKER}-0007`).opaque === false &&
  (() => { try { mint({ family: 'finding_id', value: `finding-${SYNTHETIC_PROJECT_MARKER}-0007`, laneToken: LANE, registry: emptyRegistry(), derivation: 'random' }); return false; }
           catch (e) { return e.code === CODES.FORM_INVALID; } })(),
  'a meaning-bearing string is refused on form before opacity is consulted');

// ---------------------------------------------------------------- derivation

rejects('MINT/content_derived_value_rejected',
  () => mint({ family: 'finding_id', value: V4, laneToken: LANE, registry: emptyRegistry(), derivation: 'content_derived' }),
  CODES.DERIVATION_FORBIDDEN,
  'content-derived ids merge two observations of identical content');
rejects('MINT/undeclared_derivation_rejected',
  () => mint({ family: 'finding_id', value: V4, laneToken: LANE, registry: emptyRegistry() }),
  CODES.DERIVATION_FORBIDDEN, 'fail closed when the derivation is not stated');
rejects('MINT/derivation_label_checked_against_the_content_hash',
  () => mint({
    family: 'finding_id', value: V4, laneToken: LANE, registry: emptyRegistry(),
    derivation: 'random', contentHash: `${V4.replace(/-/g, '')}${'0'.repeat(32)}`.slice(0, 64),
  }),
  CODES.DERIVATION_FORBIDDEN, 'a dishonest label is caught by the value appearing in the hash');
accepts('MINT/unrelated_content_hash_is_fine',
  () => mint({ family: 'finding_id', value: V4, laneToken: LANE, registry: emptyRegistry(), derivation: 'random', contentHash: 'f'.repeat(64) }),
  'positive control');

// ---------------------------------------------------------------- collision

{
  const registry = new Set([V4]);
  rejects('MINT/collision_is_rejected',
    () => mint({ family: 'finding_id', value: V4, laneToken: LANE, registry, derivation: 'random' }),
    CODES.COLLISION, 'no retry, no suffix');
  accepts('MINT/a_fresh_value_still_mints',
    () => mint({ family: 'finding_id', value: V7, laneToken: LANE, registry, derivation: 'random' }),
    'positive control: the registry does not block everything');
  const out = mint({ family: 'finding_id', value: V7, laneToken: LANE, registry, derivation: 'random' });
  record('MINT/result_states_no_reuse_and_no_retry', out.reused === false && out.retried === false);
}
rejects('MINT/mint_without_a_registry_rejected',
  () => mint({ family: 'finding_id', value: V4, laneToken: LANE, derivation: 'random' }),
  CODES.COLLISION, 'no duplicate check means no no-reuse guarantee');

// ---------------------------------------------------------------- candidate handles

{
  const h = candidateHandle('9'.repeat(64));
  record('MINT/handle_is_recognisable', isCandidateHandle(h) === true && h.startsWith('cand-'));
  record('MINT/uuid_is_not_a_handle', isCandidateHandle(V4) === false);
  rejects('MINT/handle_requires_a_digest', () => candidateHandle('short'), CODES.FORM_INVALID);
  rejects('MINT/handle_is_not_citable_as_an_identifier',
    () => assertIsMintedIdentifier(h, 'finding_id'), CODES.HANDLE_NOT_AN_IDENTIFIER,
    'the parallel stage output cannot be cited');
  accepts('MINT/minted_identifier_is_citable', () => assertIsMintedIdentifier(V7, 'finding_id'), 'positive control');
  rejects('MINT/arbitrary_string_is_not_an_identifier',
    () => assertIsMintedIdentifier('finding-7', 'finding_id'), CODES.IDENTIFIER_REQUIRED);
}

// The design consequence of a single serialised minter: parallel work may not mint.
for (const stage of ['compute_candidate_finding', 'compute_context_request_candidate', 'read_capsule']) {
  rejects(`MINT/parallel_stage_may_not_mint/${stage}`,
    () => assertParallelStageMayNotMint(stage), CODES.LANE_NOT_HELD);
}
accepts('MINT/serialised_stage_may_mint', () => assertParallelStageMayNotMint('p5_accept_context'), 'positive control');

// ---------------------------------------------------------------- outage policy

record('MINT/outage_permits_reads',
  evaluateMinterOutage({ minterAvailable: false, operation: 'read_snapshot' }).permitted === true &&
  evaluateMinterOutage({ minterAvailable: false, operation: 'read_snapshot' }).degraded === true,
  'the accepted trade-off, stated as behaviour');
record('MINT/outage_permits_replay_verification',
  evaluateMinterOutage({ minterAvailable: false, operation: 'replay_verification' }).permitted === true,
  'a replay mints nothing');
rejects('MINT/outage_refuses_writes',
  () => evaluateMinterOutage({ minterAvailable: false, operation: 'p8_write_task' }), CODES.MINTER_UNAVAILABLE);
rejects('MINT/outage_refuses_acceptance',
  () => evaluateMinterOutage({ minterAvailable: false, operation: 'p5_accept_context' }), CODES.MINTER_UNAVAILABLE);
record('MINT/available_minter_permits_everything',
  evaluateMinterOutage({ minterAvailable: true, operation: 'p8_write_task' }).permitted === true, 'positive control');

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'd_p10_03_identifier_minting_boundary',
  owner_decision: 'D-P10-03 closed: one serialised boundary, opaque values, collision rejected',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
