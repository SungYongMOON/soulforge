// Lane 1V — mutation lock over the Phase 1 kernel.
//
// Six lanes report several hundred passing checks. That number is worth nothing unless the
// checks fail when the code is wrong, and a suite written by the implementer is exactly the
// kind that can pass while testing very little. This harness breaks one guard at a time in a
// throwaway copy of the kernel and requires the relevant suite to go red.
//
// What this is: an adversarial check against my own implementation. Mutation testing is
// useful even when self-authored, because the mutation is hostile to the code regardless of
// who wrote the expectations.
//
// What this is NOT: independent semantic verification. If a rule is wrong in the same way in
// both the implementation and the fixtures, every mutation of it still gets killed and the
// shared misunderstanding survives. That limit is declared in
// contracts/lane_1v_verification_lock_v0.md and is not closed by this file.
//
// Three outcomes per mutation:
//   killed          - the suite failed. The guard is covered.
//   survived        - the suite still passed. A hole, reported explicitly.
//   catalogue_error - the find string was absent or ambiguous. A bug in this file, and
//                     reported as loudly as a survivor, because a catalogue that matches
//                     nothing would otherwise report a clean sweep while testing nothing.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SCRATCH_ROOT = arg('--scratch');
const ORACLE = arg('--oracle');

if (!SCRATCH_ROOT) {
  console.error('usage: node tests/lane_1v_mutation_lock.mjs --scratch <dir> [--oracle <path>]');
  process.exit(2);
}

const SUITES = {
  kernel: { file: 'kernel_conformance.mjs', args: ORACLE ? ['--oracle', ORACLE] : null },
  lane_1a: { file: 'lane_1a_conformance.mjs', args: [] },
  lane_1b: { file: 'lane_1b_conformance.mjs', args: [] },
  lane_1c: { file: 'lane_1c_conformance.mjs', args: [] },
  lane_1d: { file: 'lane_1d_conformance.mjs', args: [] },
  lane_1e: { file: 'lane_1e_conformance.mjs', args: [] },
  minting: { file: 'minting_conformance.mjs', args: [] },
  runtime_observation: { file: 'runtime_observation_conformance.mjs', args: [] },
  end_to_end: { file: 'end_to_end_engine_run.mjs', args: [] },
  output_contract: { file: 'output_contract_conformance.mjs', args: ['--scratch', SCRATCH_ROOT] },
};

// Each entry disables or weakens exactly one guard. `find` must occur exactly once in its
// file. `suite` names the suite expected to notice.
const CATALOGUE = [
  // ---- canonical
  { id: 'canonical/precision_widened', file: 'canonical.mjs', suite: 'kernel',
    find: 'if (!Number.isInteger(digits) || frac.length !== digits) {',
    replace: 'if (!Number.isInteger(digits) || frac.length < digits) {' },
  { id: 'canonical/codepoint_order_disabled', file: 'canonical.mjs', suite: 'kernel',
    find: '    if (d !== 0) return d;', replace: '    if (false) return d;' },

  // ---- identity
  { id: 'identity/floating_ref_accepted', file: 'identity.mjs', suite: 'kernel',
    find: "if (!Object.hasOwn(ref, 'revision_id')) return RESOLUTION.FLOATING;",
    replace: "if (false && !Object.hasOwn(ref, 'revision_id')) return RESOLUTION.FLOATING;" },
  { id: 'identity/hash_algorithm_unchecked', file: 'identity.mjs', suite: 'kernel',
    find: 'if (ref.content_hash_alg !== CANONICAL.hashAlgorithm) return RESOLUTION.MALFORMED;',
    replace: 'if (false) return RESOLUTION.MALFORMED;' },

  // ---- fingerprint
  { id: 'fingerprint/missing_input_key_allowed', file: 'fingerprint.mjs', suite: 'kernel',
    find: '  if (missing.length) {', replace: '  if (false && missing.length) {' },

  // ---- authority
  { id: 'authority/false_component_treated_as_yes', file: 'authority.mjs', suite: 'kernel',
    find: 'if (v !== true) allYes = false;', replace: 'if (v !== true) allYes = true;' },

  // ---- ceilings
  { id: 'ceilings/evidence_enum_unchecked', file: 'ceilings.mjs', suite: 'lane_1a',
    find: '  if (!isEvidenceCeiling(v)) {', replace: '  if (false) {' },
  { id: 'ceilings/canon_axis_allowed_in_snapshot', file: 'ceilings.mjs', suite: 'lane_1a',
    find: "  if (snapshot && Object.hasOwn(snapshot, 'canon_claim_ceiling')) {",
    replace: '  if (false) {' },
  { id: 'ceilings/canon_enum_unchecked', file: 'ceilings.mjs', suite: 'kernel',
    find: '  if (!isCanonCeiling(v)) {', replace: '  if (false) {' },

  // ---- finding
  { id: 'finding/disposition_routing_inverted', file: 'finding.mjs', suite: 'kernel',
    find: 'if (changesAcceptedState !== true) {', replace: 'if (changesAcceptedState === true) {' },

  // ---- execution_mode
  { id: 'execution_mode/ai_without_authorisation_allowed', file: 'execution_mode.mjs', suite: 'kernel',
    find: "if (op.execution_mode === 'ai_assisted' && op.owner_ai_authorisation !== true) {",
    replace: "if (op.execution_mode === 'ai_assisted' && op.owner_ai_authorisation === true) {" },
  { id: 'execution_mode/baseline_mode_unenforced', file: 'execution_mode.mjs', suite: 'kernel',
    find: '    if (inBaseline && op.execution_mode !== BASELINE_EXECUTION_MODE) {',
    replace: '    if (false && op.execution_mode !== BASELINE_EXECUTION_MODE) {' },

  // ---- graph (1C)
  { id: 'graph/unresolvable_ref_accepted', file: 'graph.mjs', suite: 'lane_1c',
    find: 'if (classifyRef(ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {',
    replace: 'if (false) {' },
  { id: 'graph/required_edge_attributes_skipped', file: 'graph.mjs', suite: 'lane_1c',
    find: '    if (!Object.hasOwn(edge, attr)) {', replace: '    if (false) {' },

  // ---- capsule (1C)
  { id: 'capsule/hop_ceiling_raised', file: 'capsule.mjs', suite: 'lane_1c',
    find: 'export const MAX_HOPS_CEILING = 2;', replace: 'export const MAX_HOPS_CEILING = 5;' },
  { id: 'capsule/selector_fields_optional', file: 'capsule.mjs', suite: 'lane_1c',
    find: 'if (!Object.hasOwn(selector, f)) throw new ContractError(CODES.SELECTOR_FIELD_MISSING, `selector field "${f}" is missing`);',
    replace: 'if (false) throw new ContractError(CODES.SELECTOR_FIELD_MISSING, `selector field "${f}" is missing`);' },

  // ---- mcp_contract (1D)
  { id: 'mcp/project_mismatch_allowed', file: 'mcp_contract.mjs', suite: 'lane_1d',
    find: 'if (request.project_binding_ref !== current.project_binding_ref) {',
    replace: 'if (false) {' },
  { id: 'mcp/required_request_fields_skipped', file: 'mcp_contract.mjs', suite: 'lane_1d',
    find: '    if (!Object.hasOwn(request, f)) {', replace: '    if (false) {' },

  // ---- minting (D-P10-03)
  { id: 'minting/non_mintable_family_allowed', file: 'minting.mjs', suite: 'minting',
    find: "if (kind !== 'minted') {", replace: "if (kind === 'minted') {" },
  { id: 'minting/collision_guard_removed', file: 'minting.mjs', suite: 'minting',
    find: '  if (registry.has(value)) {', replace: '  if (false && registry.has(value)) {' },
  { id: 'minting/parallel_stage_may_mint', file: 'minting.mjs', suite: 'minting',
    find: '  if (parallelStages.includes(stage)) {', replace: '  if (false) {' },

  // ---- module_binding (1E)
  { id: 'module_binding/semver_widened', file: 'module_binding.mjs', suite: 'lane_1e',
    find: 'const SEMVER_EXACT = /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/;',
    replace: 'const SEMVER_EXACT = /^.+$/;' },
  { id: 'module_binding/required_manifest_fields_skipped', file: 'module_binding.mjs', suite: 'lane_1e',
    find: '    if (!Object.hasOwn(manifest, f)) {', replace: '    if (false) {' },
  { id: 'module_binding/hot_swap_allowed', file: 'module_binding.mjs', suite: 'lane_1e',
    find: '  if (runInProgress === true) {', replace: '  if (false) {' },

  // ---- custody (1B)
  { id: 'custody/any_mode_accepted', file: 'custody.mjs', suite: 'lane_1b',
    find: '  if (mode !== CUSTODY_MODE) {', replace: '  if (false) {' },
  { id: 'custody/required_inventory_fields_skipped', file: 'custody.mjs', suite: 'lane_1b',
    find: '  for (const f of REQUIRED_INVENTORY_FIELDS) {', replace: '  for (const f of []) {' },
  { id: 'custody/unretained_span_tolerated', file: 'custody.mjs', suite: 'lane_1b',
    find: '  if (unretained.length) {', replace: '  if (false && unretained.length) {' },

  // ---- lineage (1B)
  { id: 'lineage/provenance_laundering_allowed', file: 'lineage.mjs', suite: 'lane_1b',
    find: '  if (claimedAiDerived !== undefined && claimedAiDerived !== derived) {',
    replace: '  if (false) {' },
  { id: 'lineage/authority_escalation_allowed', file: 'lineage.mjs', suite: 'lane_1b',
    find: '  if (ci < si) {', replace: '  if (false) {' },

  // ---- snapshot (1A)
  { id: 'snapshot/fingerprint_not_verified', file: 'snapshot.mjs', suite: 'lane_1a',
    find: '  if (recomputed !== snapshot.deterministic_replay_fingerprint) {',
    replace: '  if (false) {' },
  { id: 'snapshot/missing_from_unknown_allowed', file: 'snapshot.mjs', suite: 'lane_1a',
    find: '  if (gapType === GAP_TYPE.MISSING && presenceState !== PRESENCE.ABSENCE_CONFIRMED) {',
    replace: '  if (false) {' },
  { id: 'snapshot/both_axes_on_one_element_allowed', file: 'snapshot.mjs', suite: 'lane_1a',
    find: '  if (hasRequirement && hasArtifact) {', replace: '  if (false) {' },
  { id: 'snapshot/finding_may_cite_nothing', file: 'snapshot.mjs', suite: 'lane_1a',
    find: '  if (!hasSpans && !hasAbsenceRecord) {', replace: '  if (false) {' },

  // ---- heartbeat
  { id: 'heartbeat/unknown_surface_allowed', file: 'heartbeat.mjs', suite: 'runtime_observation',
    find: '  if (!HEARTBEAT_SURFACES.includes(surfaceId)) {', replace: '  if (false) {' },
  { id: 'heartbeat/recent_failure_reported_as_fresh', file: 'heartbeat.mjs', suite: 'runtime_observation',
    find: "  if (heartbeat.outcome === 'failed') {", replace: '  if (false) {' },
  { id: 'heartbeat/future_observation_accepted', file: 'heartbeat.mjs', suite: 'runtime_observation',
    find: '  if (observedMs > now) {', replace: '  if (false) {' },

  // ---- delivery_receipt
  { id: 'receipt/undeclared_edge_tolerated', file: 'delivery_receipt.mjs', suite: 'runtime_observation',
    find: '  if (coverage.observed_not_declared.length > 0) {', replace: '  if (false) {' },
  { id: 'receipt/stale_receipt_still_proves_traversal', file: 'delivery_receipt.mjs', suite: 'runtime_observation',
    find: '  if (ageSeconds <= window.period_seconds + window.grace_seconds) {',
    replace: '  if (ageSeconds <= window.period_seconds + window.grace_seconds || true) {' },
  { id: 'receipt/unlabelled_method_accepted', file: 'delivery_receipt.mjs', suite: 'runtime_observation',
    find: '  if (!OBSERVATION_METHODS.includes(receipt.observation_method)) {', replace: '  if (false) {' },

  // ---- output binding: fail-closed resolution
  { id: 'binding/broken_pointer_resolves_to_a_guess', area: 'tools', file: 'output_binding.mjs', suite: 'output_contract',
    find: "    return { root: null, source: 'pointer_unreadable', pointer_path: pointer };",
    replace: "    return { root: resolve(join(repoRoot, DEFAULT_OUTPUT_ROOT_RELATIVE)), source: 'pointer_unreadable', pointer_path: pointer };" },
  { id: 'binding/schema_unchecked', area: 'tools', file: 'output_binding.mjs', suite: 'output_contract',
    find: "  if (parsed === null || typeof parsed !== 'object' || parsed.schema_version !== POINTER_SCHEMA) {",
    replace: '  if (false) {' },
  { id: 'binding/relative_root_resolved_against_cwd', area: 'tools', file: 'output_binding.mjs', suite: 'output_contract',
    find: '  const root = isAbsolute(parsed.output_root) ? parsed.output_root : resolve(join(repoRoot, parsed.output_root));',
    replace: '  const root = resolve(parsed.output_root);' },

  // ---- subject adapter: the unknown-vs-missing decision
  { id: 'subject/unknown_downgraded_to_missing', area: 'subjects', file: 'engine_self_topology.mjs', suite: 'end_to_end',
    find: '    absence_reportable: reasons.length === 0,', replace: '    absence_reportable: true,' },
  { id: 'subject/failed_surface_ignored', area: 'subjects', file: 'engine_self_topology.mjs', suite: 'end_to_end',
    find: "  if ((failingSurfaces ?? []).length > 0) reasons.push('a_surface_failed');",
    replace: "  if (false) reasons.push('a_surface_failed');" },

  // ---- assembly
  { id: 'assembly/satisfied_reported_as_finding', area: 'assembly', file: 'engine_pass.mjs', suite: 'end_to_end',
    find: '    if (gap.gap_type === GAP_TYPE.SATISFIED) continue;', replace: '    if (false) continue;' },
  { id: 'assembly/unknown_claims_observed_artifact', area: 'assembly', file: 'engine_pass.mjs', suite: 'end_to_end',
    find: "      evidence_claim_ceiling: gap.gap_type === GAP_TYPE.UNKNOWN ? 'unknown' : 'observed_artifact',",
    replace: "      evidence_claim_ceiling: 'observed_artifact'," },
  { id: 'assembly/context_request_for_everything', area: 'assembly', file: 'engine_pass.mjs', suite: 'end_to_end',
    find: '  if (unknownFindings.length > 0) {', replace: '  if (findings.length > 0) {' },

  // ---- pipeline (1A)
  { id: 'pipeline/engine_may_accept', file: 'pipeline.mjs', suite: 'lane_1a',
    find: "  if (principal?.kind === 'engine' || principal?.kind === 'agent') {",
    replace: '  if (false) {' },
  { id: 'pipeline/generation_may_skip', file: 'pipeline.mjs', suite: 'lane_1a',
    find: '  if (toGeneration !== fromGeneration + 1) {', replace: '  if (false) {' },
  { id: 'pipeline/boundary_conflation_allowed', file: 'pipeline.mjs', suite: 'lane_1a',
    find: '  if (effects.does_not.includes(impliedEffect)) {', replace: '  if (false) {' },
  { id: 'pipeline/candidate_may_be_written', file: 'pipeline.mjs', suite: 'lane_1a',
    find: '  if (taskIntent?.candidate_only === true) {', replace: '  if (false) {' },
];

// ---------------------------------------------------------------- scratch workspace

const workspace = join(SCRATCH_ROOT, 'lane_1v_mutation_lock');
const created = [];
const runSuite = (root, suiteName) => {
  const suite = SUITES[suiteName];
  const extra = suite.args ?? [];
  const r = spawnSync(process.execPath, [join(root, 'tests', suite.file), ...extra], { encoding: 'utf8' });
  return { status: r.status, stderr: (r.stderr ?? '').slice(0, 400) };
};

try {
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  created.push(workspace);
  // Every area the engine holds code in, or a mutation there would silently have nothing to
  // break and the catalogue would report a clean sweep over a partial copy.
  for (const area of ['kernel', 'assembly', 'subjects', 'tools', 'tests']) {
    cpSync(join(ENGINE, area), join(workspace, area), { recursive: true });
  }

  // The pristine copy must pass. If it does not, this harness is measuring its own setup
  // rather than the mutations, and every "killed" verdict below would be meaningless.
  const baseline = {};
  const baselineFailures = [];
  for (const name of Object.keys(SUITES)) {
    if (name === 'kernel' && !ORACLE) { baseline[name] = 'skipped_no_oracle'; continue; }
    const r = runSuite(workspace, name);
    baseline[name] = r.status === 0 ? 'pass' : 'FAIL';
    if (r.status !== 0) baselineFailures.push({ suite: name, status: r.status, stderr: r.stderr });
  }
  if (baselineFailures.length) {
    console.log(JSON.stringify({
      slice: 'lane_1v_mutation_lock',
      result: 'FAIL',
      reason: 'the unmutated copy does not pass, so no mutation verdict would be meaningful',
      baseline, baselineFailures,
    }, null, 2));
    process.exit(1);
  }

  // ---------------------------------------------------------------- mutate

  const pristine = new Map();
  const readPristine = (area, file) => {
    const key = `${area}/${file}`;
    if (!pristine.has(key)) pristine.set(key, readFileSync(join(workspace, area, file), 'utf8'));
    return pristine.get(key);
  };

  const outcomes = [];
  for (const m of CATALOGUE) {
    const path = join(workspace, m.area ?? 'kernel', m.file);
    if (!existsSync(path)) {
      outcomes.push({ ...m, outcome: 'catalogue_error', detail: 'kernel file does not exist' });
      continue;
    }
    const original = readPristine(m.area ?? 'kernel', m.file);
    const occurrences = original.split(m.find).length - 1;
    if (occurrences !== 1) {
      outcomes.push({ id: m.id, file: m.file, suite: m.suite, outcome: 'catalogue_error',
        detail: `find string occurs ${occurrences} times, expected exactly 1`, find: m.find });
      continue;
    }
    writeFileSync(path, original.replace(m.find, m.replace), 'utf8');
    const r = runSuite(workspace, m.suite);
    writeFileSync(path, original, 'utf8');   // restore before the next mutation

    if (r.status === null) {
      outcomes.push({ id: m.id, file: m.file, suite: m.suite, outcome: 'catalogue_error',
        detail: 'the suite did not run', stderr: r.stderr });
    } else if (r.status !== 0) {
      outcomes.push({ id: m.id, file: m.file, suite: m.suite, outcome: 'killed' });
    } else {
      outcomes.push({ id: m.id, file: m.file, suite: m.suite, outcome: 'survived',
        detail: 'the suite still passed with this guard disabled', find: m.find, replace: m.replace });
    }
  }

  const killed = outcomes.filter((o) => o.outcome === 'killed');
  const survived = outcomes.filter((o) => o.outcome === 'survived');
  const catalogueErrors = outcomes.filter((o) => o.outcome === 'catalogue_error');

  for (const s of survived) console.error(`SURVIVED  ${s.id}  (${s.file} -> ${s.suite})  ${s.detail}`);
  for (const c of catalogueErrors) console.error(`CATALOGUE ${c.id}  (${c.file})  ${c.detail}`);

  const modulesCovered = [...new Set(CATALOGUE.map((m) => m.file.replace('.mjs', '')))].sort();
  const areasCovered = [...new Set(CATALOGUE.map((m) => m.area ?? 'kernel'))].sort();

  console.log(JSON.stringify({
    slice: 'lane_1v_mutation_lock',
    result: survived.length === 0 && catalogueErrors.length === 0 ? 'PASS' : 'FAIL',
    baseline,
    mutation_count: CATALOGUE.length,
    killed_count: killed.length,
    survived_count: survived.length,
    catalogue_error_count: catalogueErrors.length,
    survived, catalogue_errors: catalogueErrors,
    modules_covered: modulesCovered,
    modules_covered_count: modulesCovered.length,
    areas_covered: areasCovered,
    verification_strength: 'self_authored_mutation_lock',
    semantic_independence: 'UNMET',
    semantic_independence_note:
      'a rule wrong in the same way in both the implementation and the fixtures survives every mutation of it',
    writes_performed_outside_scratch: 0,
  }, null, 2));

  process.exit(survived.length === 0 && catalogueErrors.length === 0 ? 0 : 1);
} finally {
  // Only the directories this run created.
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
}
