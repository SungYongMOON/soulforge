#!/usr/bin/env node
// Slice 1 acceptance: the kernel must reproduce every verdict of the frozen Phase 1-0
// synthetic oracle for the families it implements.
//
// The oracle is not authored here. It is the artifact that survived seven independent
// verification rounds, so using it as the acceptance criterion means the kernel is being
// judged against something that was already adversarially reviewed rather than against
// expectations written by the same hand as the implementation.
//
// Read only. Writes nothing. Run from anywhere; the oracle path is explicit.
//
//   node tests/kernel_conformance.mjs --oracle <path to phase_1_0_synthetic_oracle.json>

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalise, inspectInstant, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { classifyRef, inspectIdentifierOpacity, isPlaceholder, PLACEHOLDERS } from '../../../core/validators/identity.mjs';
import { deterministicReplayFingerprint, projectFingerprintInput, splitProvenance } from '../../../core/validators/fingerprint.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { TIME_PRECISION, OPEN_OWNER_DECISIONS, ARRAY_ORDER_RULES } from '../../../core/validators/contract_config.mjs';
import {
  AUTHORITY_FAMILIES, APPLICABILITY, APPLICABILITY_COMPONENTS,
  resolveApplicability, resolveAuthority, forbidRankArithmetic, SCOPE, assertSearchScope,
} from '../../../core/validators/authority.mjs';
import {
  CANON_CLAIM_CEILING, EVIDENCE_CLAIM_CEILING, convertBetweenAxes,
  SNAPSHOT_CLAIM_CEILING_AXIS, readSnapshotClaimCeiling, assertExplicitFieldName,
  assertCanonCeiling, assertEvidenceCeiling,
} from '../../../core/validators/ceilings.mjs';
import { foldCurrentView, routeDisposition, assertChainStep } from '../../../core/validators/finding.mjs';
import { evaluate, classifyLegacyMaterial, advisoryFieldsAbsent, VERDICT, BASELINE_PHASE } from '../../../core/validators/execution_mode.mjs';
import { NON_CAPABILITIES } from '../../../core/validators/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const oraclePath = args[args.indexOf('--oracle') + 1];
if (args.indexOf('--oracle') === -1 || !oraclePath || !existsSync(oraclePath)) {
  console.error('usage: node tests/kernel_conformance.mjs --oracle <path to phase_1_0_synthetic_oracle.json>');
  process.exit(2);
}
const oracle = JSON.parse(readFileSync(oraclePath, 'utf8'));

const SYNTHETIC_PROJECT_MARKER = ['P', '00', '-', '000'].join('');
const results = [];
const record = (id, ok, note) => results.push({ id, ok, note });
const rejects = (id, fn, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  record(id, err instanceof ContractError, err ? note : 'expected a ContractError, got none');
};
const accepts = (id, fn, note = '') => {
  try { fn(); record(id, true, note); } catch (e) { record(id, false, `unexpected ${e.code ?? e.message}`); }
};

// ---------------------------------------------------------------- canonical serialisation

for (const c of oracle.serialization_equivalence) {
  let ok;
  try {
    const rules = c.array_rules || {};
    ok = (canonicalise(c.a, rules) === canonicalise(c.b, rules)) === (c.expect === 'same');
  } catch (e) { ok = false; }
  record(`SER/${c.id}`, ok, c.reason);
}

for (const c of oracle.serialization_rejects) {
  let value = c.value;
  if (c.codepoint_keys) {
    value = {};
    c.codepoint_keys.forEach((cps, i) => { value[String.fromCodePoint(...cps)] = i; });
    record(`SER/${c.id}/fixture_meaningful`, Object.keys(value).length === c.codepoint_keys.length,
      'fixture builds distinct pre-normalisation keys');
  }
  if (c.build_sorted_array) {
    const b = c.build_sorted_array;
    const raw = b.codepoint_values.map((cps) => String.fromCodePoint(...cps));
    record(`SER/${c.id}/fixture_meaningful`, new Set(raw).size === raw.length, 'fixture builds distinct values');
    value = { [b.path]: raw.map((v) => ({ [b.key]: v })) };
  }
  let threw = null;
  try { canonicalise(value, c.array_rules || {}); } catch (e) { threw = e; }
  if (c.expect_accept === true) record(`SER/${c.id}`, threw === null, `must be accepted: ${c.reason}`);
  else record(`SER/${c.id}`, threw instanceof ContractError, `must be rejected: ${c.reason}`);
}

// ---------------------------------------------------------------- fingerprint

const base = oracle.fingerprint_base;
let baseFingerprint = null;
try { baseFingerprint = deterministicReplayFingerprint(base); record('FP/base_computable', true, 'base tuple fingerprints'); }
catch (e) { record('FP/base_computable', false, e.message); }

for (const m of oracle.fingerprint_mutations) {
  let ok;
  try {
    const mutated = JSON.parse(JSON.stringify(base));
    if (m.layer === 'root') mutated[m.field] = m.new_value; else mutated[m.layer][m.field] = m.new_value;
    ok = (deterministicReplayFingerprint(mutated) === baseFingerprint) === (m.expect === 'same');
  } catch (e) { ok = false; }
  record(`FP/${m.id}`, ok, `${m.layer}.${m.field} expect ${m.expect}`);
}

{
  const sv = oracle.serialization_version_case;
  let ok;
  try {
    ok = (deterministicReplayFingerprint(base, { version: sv.alternate_version }) === baseFingerprint) === (sv.expect === 'same');
  } catch (e) { ok = false; }
  record(`FP/${sv.id}`, ok, sv.reason);
}

for (const c of oracle.fingerprint_reject_cases || []) {
  let threw = null;
  try { deterministicReplayFingerprint(c.tuple); } catch (e) { threw = e; }
  record(`FP/${c.id}`, threw instanceof ContractError, `must be rejected: ${c.reason}`);
}

// ---------------------------------------------------------------- refs

for (const c of oracle.ref_resolution_cases) {
  const got = classifyRef(c.ref, { bytesAvailable: c.bytes_available === true, absenceConfirmed: c.absence_confirmed === true });
  record(`REF/${c.id}`, got === c.expect, `got ${got} expect ${c.expect}`);
}

// ---------------------------------------------------------------- kernel-side invariants
// Properties the oracle does not encode but the contract requires of the implementation.

{
  const src = readFileSync(join(HERE, '..', 'kernel', 'canonical.mjs'), 'utf8');
  record('KERNEL/no_host_formatter_dependence', !src.includes('toISO' + 'String'),
    'calendar validation must not delegate to the host formatter whose width is fixed');
}
{
  const digits = TIME_PRECISION.fractionalDigits;
  const mk = (n) => `2026-01-02T03:04:05.${'0'.repeat(n)}Z`;
  record('KERNEL/precision_accepts_declared_width', inspectInstant(mk(digits)).valid === true, `${digits} digits`);
  record('KERNEL/precision_rejects_wider', inspectInstant(mk(digits + 1)).valid === false, `${digits + 1} digits`);
  record('KERNEL/precision_rejects_narrower', digits <= 1 || inspectInstant(mk(digits - 1)).valid === false, `${digits - 1} digits`);
  // D-P10-07 closed. The assertion flips: the width is now settled and the kernel must say
  // so, because a settled parameter left labelled provisional is just as misleading.
  record('KERNEL/precision_is_settled', TIME_PRECISION.isSettled === true && TIME_PRECISION.state === 'settled_by_D-P10-07',
    'D-P10-07 fixed the width at three digits');
  record('KERNEL/precision_width_matches_the_decision', digits === 3, 'the decided width is three');
}
{
  record('KERNEL/leap_day_accepted', inspectInstant(`2024-02-29T00:00:00.${'0'.repeat(TIME_PRECISION.fractionalDigits)}Z`).valid === true, 'real leap day');
  record('KERNEL/non_leap_day_rejected', inspectInstant(`2026-02-29T00:00:00.${'0'.repeat(TIME_PRECISION.fractionalDigits)}Z`).valid === false, 'non existent leap day');
}
{
  // PC-01: content equality must not be readable as subject equality
  const a = { entity_id: 'e-1', revision_id: 'e-1-r1', content_id: 'c-shared', content_hash_alg: 'sha256' };
  const b = { entity_id: 'e-2', revision_id: 'e-2-r1', content_id: 'c-shared', content_hash_alg: 'sha256' };
  record('KERNEL/shared_content_is_not_same_entity', classifyRef(a, { bytesAvailable: true }) === 'ref_resolvable' && a.entity_id !== b.entity_id,
    'two subjects may legitimately share bytes');
}
{
  record('KERNEL/placeholder_recognised', isPlaceholder(PLACEHOLDERS.PENDING_ENGINE_OWNER) === true, 'open-decision token');
  record('KERNEL/identifier_opacity_rejects_project_shape', inspectIdentifierOpacity(`src-${SYNTHETIC_PROJECT_MARKER}-r1`).opaque === false,
    'a project-code shape must not be embeddable in an identifier');
  record('KERNEL/identifier_opacity_accepts_opaque', inspectIdentifierOpacity('src-0001-r3').opaque === true, 'ordinary opaque id');
  // Regression: this exact UUIDv7 matched project_code_shape across a dash boundary
  // ("f01-234") and was rejected. Minting would have failed intermittently.
  record('KERNEL/identifier_opacity_accepts_uuid_that_looks_like_a_project_code',
    inspectIdentifierOpacity('0192f0a1-b2c3-7d4e-8f01-234567890abc').opaque === true,
    'a canonical UUID layout cannot encode meaning, so the heuristic must not veto it');
  record('KERNEL/identifier_opacity_still_rejects_hand_assembled_project_code',
    inspectIdentifierOpacity(`finding-${SYNTHETIC_PROJECT_MARKER}-0007`).opaque === false,
    'the fast path must not have disabled the heuristic for non-UUID strings');
}
{
  // PC-07: unclassified provenance fields default to replay relevant, the safe-loud side
  const split = splitProvenance({ engine_run_id: 'r1', engine_version: '0.0.1', some_new_field: 'x' });
  record('KERNEL/run_observational_excluded', Object.hasOwn(split.runObservational, 'engine_run_id') && !Object.hasOwn(split.replayRelevant, 'engine_run_id'),
    'engine_run_id is run observational only');
  record('KERNEL/unclassified_defaults_to_replay_relevant', split.defaultedToReplayRelevant.includes('some_new_field'),
    'an unknown field is treated as content affecting');
}
{
  let threw = null;
  try { projectFingerprintInput({}); } catch (e) { threw = e; }
  record('KERNEL/empty_tuple_rejected', threw instanceof ContractError, 'an empty tuple must not yield a fingerprint');
}
{
  record('KERNEL/array_rules_declared_for_frozen_base',
    Object.keys(ARRAY_ORDER_RULES).length > 0 && canonicalise(base.canonical_accepted_input_set, ARRAY_ORDER_RULES, 'canonical_accepted_input_set').length > 0,
    'the frozen base serialises under the declared array rules');
}

// ---------------------------------------------------------------- authority (PC-04)

for (const c of oracle.authority_precedence_cases) {
  let ok;
  try {
    const r = resolveAuthority(c.candidates);
    ok = r.winner === c.expect_winner && r.conflict === c.expect_conflict_recorded;
  } catch (e) { ok = false; }
  record(`AUTH/${c.id}`, ok, c.reason);
}
for (const c of oracle.authority_reject_cases || []) {
  let threw = null;
  try { resolveAuthority(c.candidates); } catch (e) { threw = e; }
  record(`AUTH/${c.id}`, threw instanceof ContractError, `must be rejected: ${c.reason}`);
}

// ---------------------------------------------------------------- disposition (PC-08)

for (const c of oracle.disposition_fold_cases) {
  let views = [], ok = false;
  try {
    views = c.event_orderings.map((events) => canonicalise(foldCurrentView(c.baseline, events), { '': 'sorted_by:finding_id' }));
    const allSame = views.every((v) => v === views[0]);
    const matches = views[0] === canonicalise(c.expect_view, { '': 'sorted_by:finding_id' });
    record(`FOLD/${c.id}/order_independent`, allSame, 'shuffled orderings fold identically');
    ok = allSame && matches;
  } catch (e) { record(`FOLD/${c.id}/order_independent`, false, e.message); }
  record(`FOLD/${c.id}/expected_view`, ok, c.reason);
}
for (const c of oracle.disposition_reject_cases || []) {
  let threw = null;
  try { foldCurrentView(c.baseline, c.events); } catch (e) { threw = e; }
  record(`FOLD/${c.id}`, threw instanceof ContractError, `must be rejected: ${c.reason}`);
}

// ---------------------------------------------------------------- no-LLM baseline (PC-09)

for (const c of oracle.no_llm_cases) {
  const { verdict } = evaluate(c);
  record(`NOLLM/${c.id}`, verdict === c.expect, `got ${verdict} expect ${c.expect}${c.reason ? ` — ${c.reason}` : ''}`);
}

// ---------------------------------------------------------------- kernel-side: PC-05, PC-08, PC-09

{
  // PC-05: the two axes must not convert, and the legacy snapshot field is the evidence axis
  let threw = null;
  try { convertBetweenAxes(); } catch (e) { threw = e; }
  record('KERNEL/axes_never_convert', threw instanceof ContractError, 'no mapping exists between the two ceiling axes');
  record('KERNEL/canon_enum_bound', CANON_CLAIM_CEILING.join(',') === 'observed,source_supported,validated_private,canon_candidate,canon_entry,rejected_or_blocked',
    'canon axis is bound to the execution contract enum');
  record('KERNEL/evidence_enum_size', EVIDENCE_CLAIM_CEILING.length === 7, 'evidence axis has the approved seven values');
  record('KERNEL/snapshot_field_is_evidence_axis', SNAPSHOT_CLAIM_CEILING_AXIS === 'evidence' && readSnapshotClaimCeiling({ claim_ceiling: 'source_sufficient' }) === 'source_sufficient',
    'D-P10-01: the preserved snapshot field carries evidence axis values');
  let bare = null;
  try { assertExplicitFieldName('claim_ceiling'); } catch (e) { bare = e; }
  record('KERNEL/bare_field_name_refused', bare instanceof ContractError, 'new contracts must name the axis explicitly');
}
{
  // PC-08: a state-changing disposition may not reach P6 in the current generation
  let direct = null;
  try { routeDisposition({ changesAcceptedState: true, targetGate: 'p6_taskintent_candidate' }); } catch (e) { direct = e; }
  record('KERNEL/direct_p6_refused', direct instanceof ContractError, 'accepted-state change cannot reach P6 directly');
  const next = routeDisposition({ changesAcceptedState: true, targetGate: 'p5_registered_human_acceptance' });
  record('KERNEL/state_change_is_next_generation_only', next.generation_effect === 'next_generation_only' && next.existing_snapshot_mutation === 'forbidden',
    'it returns through P5 into a new generation');
  const same = routeDisposition({ changesAcceptedState: false });
  record('KERNEL/triage_stays_in_generation', same.snapshot_fingerprint_changes === false && same.may_reach_p6 === true,
    'triage-only disposition does not disturb the fingerprint');
  let skipped = null;
  try { assertChainStep('candidate', 'append_only_authoritative_event'); } catch (e) { skipped = e; }
  record('KERNEL/chain_cannot_be_skipped', skipped instanceof ContractError, 'the disposition chain has no shortcut');
}
{
  // PC-04: rank is a precedence relation, and applicability needs all five components
  let arith = null;
  try { forbidRankArithmetic('sum'); } catch (e) { arith = e; }
  record('KERNEL/rank_arithmetic_refused', arith instanceof ContractError, 'rank is not a score');
  record('KERNEL/authority_order_preserved', AUTHORITY_FAMILIES.map((f) => f.rank).join(',') === '1,2,3,4,5,6,7,8', 'eight tiers in order');
  record('KERNEL/applicability_needs_all_components',
    resolveApplicability({ project_binding: true, jurisdiction: true, time_window: true, document_revision: true }) === APPLICABILITY.UNKNOWN,
    'a missing component yields unknown, not false');
  record('KERNEL/applicability_all_yes', resolveApplicability(Object.fromEntries(APPLICABILITY_COMPONENTS.map((k) => [k, true]))) === APPLICABILITY.YES,
    'all five resolved yields applicable');
  record('KERNEL/cross_project_search_refused', assertSearchScope({ scope: SCOPE.PROJECT, projectRef: 'a', selectedProjectRef: 'b' }) === false,
    'a project scope may not reach another project');
}
{
  // PC-09: deterministic processing does not launder AI-derived provenance
  const unknownProvenance = classifyLegacyMaterial({ aiDerived: false, provenanceKnown: false, humanSourceBoundReview: false });
  record('KERNEL/unknown_provenance_isolated', unknownProvenance.active_eligible === false && unknownProvenance.state === 'legacy_nonreproducible',
    'unclear provenance is isolated, not neutral');
  const reviewed = classifyLegacyMaterial({ aiDerived: true, provenanceKnown: true, humanSourceBoundReview: true });
  record('KERNEL/reviewed_still_needs_a_gate', reviewed.active_eligible === false && reviewed.state === 'reviewed_candidate',
    'review alone does not activate material');
  record('KERNEL/advisory_absent_under_deterministic', advisoryFieldsAbsent({ engine_id: 'e' }) === true, 'no advisory fields in the baseline record');
}
{
  record('KERNEL/non_capabilities_declared', NON_CAPABILITIES.length >= 5 && NON_CAPABILITIES.some((s) => s.includes('learned model')),
    'the kernel states what it will not do');
}
// ---------------------------------------------------------------- gaps found by lane 1V
// Both of these guards were live in the implementation but untested: the mutation lock
// disabled each one and every suite still passed. The frozen oracle does not encode them
// either, which is why they are asserted here as kernel-side invariants.
{
  const allYes = Object.fromEntries(APPLICABILITY_COMPONENTS.map((c) => [c, true]));
  record('KERNEL/applicability_all_true_is_yes', resolveApplicability(allYes) === APPLICABILITY.YES, 'positive control');
  // A single false component means the source does not apply. Returning YES here would let
  // an inapplicable source govern, which is the whole point of resolving applicability.
  record('KERNEL/applicability_one_false_component_is_no',
    resolveApplicability({ ...allYes, [APPLICABILITY_COMPONENTS[1]]: false }) === APPLICABILITY.NO,
    'one false component must not resolve to yes');
  record('KERNEL/applicability_one_unknown_component_is_unknown',
    resolveApplicability({ ...allYes, [APPLICABILITY_COMPONENTS[1]]: APPLICABILITY.UNKNOWN }) === APPLICABILITY.UNKNOWN,
    'unknown dominates, and is not read as no');
}
{
  // Both axis validators, each with a positive control and a value borrowed from the other
  // axis. The canon validator was live but unexercised until lane 1V disabled it.
  for (const v of CANON_CLAIM_CEILING) {
    accepts(`KERNEL/canon_ceiling_accepts/${v}`, () => assertCanonCeiling(v));
  }
  rejects('KERNEL/canon_ceiling_rejects_unknown', () => assertCanonCeiling('nearly_canon'));
  rejects('KERNEL/canon_ceiling_rejects_evidence_value', () => assertCanonCeiling('source_referenced'),
    'the two axes do not share values');
  rejects('KERNEL/evidence_ceiling_rejects_canon_value', () => assertEvidenceCeiling('canon_entry'));
  rejects('KERNEL/evidence_ceiling_rejects_unknown_value', () => assertEvidenceCeiling('probably_fine'));
}
{
  // The baseline guard has to be tested with owner authorisation already granted, otherwise
  // the ai_assisted guard fires first and this one is never exercised. That overlap is
  // exactly how it stayed untested through six lanes.
  const authorisedAi = {
    phase: BASELINE_PHASE, execution_mode: 'ai_assisted', owner_ai_authorisation: true,
    retrieval_method: 'lexical',
  };
  const v = evaluate(authorisedAi);
  record('KERNEL/baseline_refuses_ai_even_when_authorised',
    v.verdict === VERDICT.REJECT && String(v.reason).includes('baseline'),
    `Phase 1-4 is deterministic_only regardless of authorisation; got ${v.verdict}: ${v.reason}`);
  record('KERNEL/baseline_accepts_deterministic_only',
    evaluate({ phase: BASELINE_PHASE, execution_mode: 'deterministic_only', retrieval_method: 'lexical' }).verdict === VERDICT.ACCEPT,
    'positive control');
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'phase_1_deterministic_kernel_contract_surface',
  contract_families: ['PC-01', 'PC-02', 'PC-03', 'PC-04', 'PC-05', 'PC-06_partial', 'PC-07', 'PC-08', 'PC-09', 'PC-11'],
  contract_families_not_yet_implemented: ['PC-06_snapshot_envelope', 'PC-10_field_owner_crosswalk'],
  oracle_ref: oraclePath.split(/[\\/]/).pop(),
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: passed.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  base_fingerprint: baseFingerprint,
  time_precision: TIME_PRECISION,
  open_owner_decisions: OPEN_OWNER_DECISIONS.map((d) => d.id),
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
