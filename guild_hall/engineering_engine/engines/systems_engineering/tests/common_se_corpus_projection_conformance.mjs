#!/usr/bin/env node
// Common-SE projection adapter conformance. Read-only: loads a public synthetic fixture and
// writes no file, network surface, source body, RAG/Wiki state, or NotebookLM state.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildStatesFromCommonSeProjection, CODES, SELECTOR_SCOPE, SUBJECT_ID,
} from '../evaluator/common_se_corpus_projection.mjs';
import { runEnginePass, classifyReplay, CODES as ENGINE_PASS_CODES } from '../../../core/runtime/engine_pass.mjs';
import { GAP_TYPE } from '../../../core/validators/snapshot.mjs';
import { PRESENCE } from '../../../core/validators/custody.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../../../docs/architecture/workspace/examples/se_core_eval/common_se_projection.synthetic.json');
const manifestPath = resolve(here, '../../../../../docs/architecture/workspace/examples/se_core_eval/SE_CORE_EVAL_V1.corpus_manifest.template.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const publicManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const clone = (value) => structuredClone(value);
const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
const reject = (id, fn, code) => {
  let error = null;
  try { fn(); } catch (caught) { error = caught; }
  record(id, error instanceof ContractError && error.code === code,
    error ? `observed ${error.code}` : 'nothing was refused');
  return error;
};

const selectorFor = (projection = fixture, overrides = {}) => ({
  project_binding_ref: projection.project_binding_ref,
  scope: SELECTOR_SCOPE,
  accepted_context_generation: 0,
  valid_at: '2026-08-12T00:00:00.000Z',
  known_at: '2026-08-12T00:00:00.000Z',
  acl_filter_revision: 'synthetic-acl-r1',
  source_family_filter: ['acquisition_authority_manual'],
  seed_refs: projection.nodes.filter((node) => node.node_type === 'rule').map((node) => node.ref),
  traversal: { max_hops: 1, allowlisted_edge_types: ['requires'] },
  ranking: {
    method: 'deterministic',
    keys: ['authority_rank', 'applicability', 'revision_recency', 'ref_lexicographic'],
  },
  budgets: { top_k: 10, max_nodes: 10, max_edges: 10, max_sources: 10, max_evidence_chars: 1000 },
  graph_projection_revision: projection.projection_revision,
  ...overrides,
});

const observationFor = (elementId, presenceState, digestCharacter = '1') => ({
  element_id: `obs_${elementId}`,
  axis: 'observed',
  artifact_revision_ref: {
    entity_id: `synthetic-observation-${elementId}`,
    revision_id: `synthetic-observation-${elementId}-r1`,
    content_id: `sha256:${digestCharacter.repeat(64)}`,
    content_hash_alg: 'sha256',
  },
  presence_state: presenceState,
  valid_at: '2026-08-12T00:00:00.000Z',
  known_at: '2026-08-12T00:00:00.000Z',
  project_binding_ref: fixture.project_binding_ref,
});

const build = ({
  projection = fixture, selector = selectorFor(projection), observations = [], aclCheck = () => true,
  expectedProjectBindingRef = projection.project_binding_ref,
} = {}) => buildStatesFromCommonSeProjection({
  projection, selector, observedStateElements: observations, aclCheck, expectedProjectBindingRef,
});

// Re-pin a deliberately changed synthetic projection so a negative test reaches the rule it
// means to exercise instead of correctly stopping at the earlier stale-hash guard.
const repin = (projection) => {
  let error = null;
  try { build({ projection, selector: selectorFor(projection) }); } catch (caught) { error = caught; }
  if (!(error instanceof ContractError) || error.code !== CODES.PROJECTION_PIN_INVALID
      || !/^[0-9a-f]{64}$/.test(error.detail?.expected_sha256 ?? '')) return projection;
  projection.projection_sha256 = error.detail.expected_sha256;
  return projection;
};

const uuidSource = () => {
  let n = 0;
  return () => {
    n += 1;
    return `a3f1c2d4-5e6f-4a7b-8c9d-${n.toString(16).padStart(12, '0')}`;
  };
};

const pass = (states, observationRunId = 'common-se-synthetic-run-1', overrides = {}) => runEnginePass({
  states,
  subjectId: SUBJECT_ID,
  projectBindingRef: fixture.project_binding_ref,
  generation: 0,
  topologyDigest: states.projection_sha256,
  observationRunId,
  takenAt: '2026-08-12T00:00:00.000Z',
  validAt: '2026-08-12T00:00:00.000Z',
  mintValue: uuidSource(),
  ...overrides,
});

// Harness self-test: a missing throw and a wrong code both fail the helper.
{
  const before = results.length;
  reject('HARNESS/expected_throw', () => { throw new ContractError('EXPECTED', 'probe'); }, 'EXPECTED');
  const positive = results.pop();
  reject('HARNESS/missing_throw_probe', () => {}, 'EXPECTED');
  const missing = results.pop();
  reject('HARNESS/wrong_code_probe', () => { throw new ContractError('OTHER', 'probe'); }, 'EXPECTED');
  const wrong = results.pop();
  record('HARNESS/self_test', results.length === before && positive.ok && !missing.ok && !wrong.ok,
    'the rejection helper distinguishes pass, no throw, and wrong code');
}

// Positive selection and state shape.
{
  const states = build();
  record('ADAPTER/positive/two_expected', states.expected.length === 2);
  record('ADAPTER/positive/no_fabricated_observations', states.observed.length === 0);
  record('ADAPTER/positive/existing_states_shape', Array.isArray(states.canonical_accepted_input_set.source_revision_refs)
    && Array.isArray(states.canonical_accepted_input_set.artifact_revision_refs));
  record('ADAPTER/positive/pins_carried', states.manifest_sha256 === fixture.manifest_sha256
    && states.projection_sha256 === fixture.projection_sha256);
  record('ADAPTER/positive/generation_carried', states.accepted_context_generation === 0);
  record('ADAPTER/positive/immutable_output', Object.isFrozen(states)
    && Object.isFrozen(states.expected) && Object.isFrozen(states.canonical_accepted_input_set));
  record('ADAPTER/positive/no_model_or_provider_fields', !JSON.stringify(states).match(/notebook|rag|wiki|learned_model|source_text/iu));
}

// The assembled Engine binds the state-declared identity tuple to the caller. Common-SE
// provenance cannot be relabelled as another subject or stripped of its capsule marker.
{
  const states = build();
  const exact = pass(states);
  record('ENGINE_BINDING/positive/exact_state_and_caller_tuple',
    /^[0-9a-f]{64}$/.test(exact.snapshot.replay_relevant_provenance.state_elements_fingerprint));
  reject('ENGINE_BINDING/subject_state_mismatch', () => pass({ ...states, subject_id: 'other-subject' }),
    ENGINE_PASS_CODES.STATE_SUBJECT_MISMATCH);
  reject('ENGINE_BINDING/caller_cannot_relabel_common_se', () => pass(states, 'common-se-synthetic-run-1', {
    subjectId: 'other-subject',
  }), ENGINE_PASS_CODES.STATE_SUBJECT_MISMATCH);
  const noSubject = { ...states }; delete noSubject.subject_id;
  reject('ENGINE_BINDING/common_se_subject_cannot_be_removed', () => pass(noSubject),
    ENGINE_PASS_CODES.STATE_SUBJECT_MISMATCH);
  reject('ENGINE_BINDING/state_binding_mismatch', () => pass({ ...states, project_binding_ref: 'synthetic-other' }),
    ENGINE_PASS_CODES.STATE_PROJECT_BINDING_MISMATCH);
  reject('ENGINE_BINDING/caller_binding_mismatch', () => pass(states, 'common-se-synthetic-run-1', {
    projectBindingRef: 'synthetic-other',
  }), ENGINE_PASS_CODES.STATE_PROJECT_BINDING_MISMATCH);
  reject('ENGINE_BINDING/generation_mismatch', () => pass(states, 'common-se-synthetic-run-1', { generation: 1 }),
    ENGINE_PASS_CODES.STATE_GENERATION_MISMATCH);
  const noCapsule = { ...states }; delete noCapsule.context_capsule_fingerprint;
  reject('ENGINE_BINDING/common_se_capsule_cannot_be_removed', () => pass(noCapsule),
    ENGINE_PASS_CODES.CONTEXT_CAPSULE_FINGERPRINT_INVALID);
}

// The Engine takes one descriptor snapshot of states. A Proxy get trap cannot show the
// fingerprint one expected-state value and the emitted snapshot another value later.
{
  const states = build();
  const alteredExpected = clone(states.expected);
  alteredExpected[0].known_at = '2026-08-13T00:00:00.000Z';
  let getCalls = 0;
  const getTrapProxy = new Proxy({ ...states }, {
    get(target, property, receiver) {
      if (property === 'expected') {
        getCalls += 1;
        return getCalls <= 2 ? Reflect.get(target, property, receiver) : alteredExpected;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const baseline = pass(states);
  const attacked = pass(getTrapProxy);
  record('ENGINE_STATE_SNAPSHOT/proxy_get_toctou_is_not_invoked', getCalls === 0);
  record('ENGINE_STATE_SNAPSHOT/proxy_get_toctou_keeps_fingerprint_and_snapshot_together',
    attacked.fingerprint === baseline.fingerprint
    && attacked.snapshot.expected_state_elements[0].known_at
      === baseline.snapshot.expected_state_elements[0].known_at);

  const descriptorProxy = new Proxy({ ...states }, {
    getOwnPropertyDescriptor(target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      return property === 'expected' ? { ...descriptor, value: alteredExpected } : descriptor;
    },
  });
  const descriptorSnapshot = pass(descriptorProxy);
  record('ENGINE_STATE_SNAPSHOT/descriptor_value_is_hashed_and_emitted_consistently',
    descriptorSnapshot.fingerprint !== baseline.fingerprint
    && descriptorSnapshot.snapshot.expected_state_elements[0].known_at === '2026-08-13T00:00:00.000Z');
}
{
  const calls = [];
  build({ aclCheck: (ref, hop) => { calls.push({ entity_id: ref.entity_id, hop }); return true; } });
  record('ADAPTER/positive/acl_checked_at_seed_and_hop', calls.some((call) => call.hop === 0)
    && calls.some((call) => call.hop === 1));
}
{
  const dapa = publicManifest.sources.find((source) => source.source_key === 'dapa_weapon_system_test_eval_guidebook');
  const optionalDod = publicManifest.sources.find((source) => source.source_key === 'dod_engineering_of_defense_systems_guidebook_change2');
  record('MANIFEST/dapa_local_materialization_unknown', dapa?.local_materialization?.state === 'UNKNOWN'
    && dapa?.engine_eligibility?.state === 'HOLD'
    && dapa?.notebooklm_eligibility?.included === false);
  record('MANIFEST/optional_dod_row_preserved', optionalDod?.engine_eligibility?.state === 'HOLD'
    && optionalDod?.local_materialization?.state === 'not_materialized');
}

// An isolated seed changes no selected expected state. It still changes the complete capsule
// fingerprint, and the assembly must bind that fingerprint into the replay tuple.
{
  const isolated = fixture.nodes.find((node) => node.ref.entity_id === 'se-rule-isolated-evaluation-control').ref;
  const allSeeds = selectorFor();
  const withoutIsolated = selectorFor(fixture, {
    seed_refs: allSeeds.seed_refs.filter((ref) => ref.entity_id !== isolated.entity_id),
  });
  const baselineStates = build({ selector: withoutIsolated });
  const isolatedStates = build({ selector: allSeeds });
  record('CAPSULE/isolated_seed_keeps_selected_states', JSON.stringify(baselineStates.expected) === JSON.stringify(isolatedStates.expected));
  record('CAPSULE/isolated_seed_changes_capsule_fingerprint', baselineStates.context_capsule_fingerprint !== isolatedStates.context_capsule_fingerprint);
  record('CAPSULE/fingerprint_is_lowercase_sha256', /^[0-9a-f]{64}$/.test(isolatedStates.context_capsule_fingerprint));
  record('REPLAY/isolated_seed_changes_engine_fingerprint', pass(baselineStates).fingerprint !== pass(isolatedStates).fingerprint);

  const aclV2States = build({ selector: selectorFor(fixture, { acl_filter_revision: 'synthetic-acl-r2' }) });
  record('CAPSULE/acl_revision_changes_capsule_fingerprint', isolatedStates.context_capsule_fingerprint !== aclV2States.context_capsule_fingerprint);
  record('REPLAY/acl_revision_changes_engine_fingerprint', pass(isolatedStates).fingerprint !== pass(aclV2States).fingerprint);

  const deniedIsolatedStates = build({ aclCheck: (ref) => ref.entity_id !== isolated.entity_id });
  record('CAPSULE/isolated_acl_decision_keeps_selected_states', JSON.stringify(isolatedStates.expected) === JSON.stringify(deniedIsolatedStates.expected));
  record('CAPSULE/isolated_acl_decision_changes_fingerprint', isolatedStates.context_capsule_fingerprint !== deniedIsolatedStates.context_capsule_fingerprint);
  record('REPLAY/isolated_acl_decision_changes_engine_fingerprint', pass(isolatedStates).fingerprint !== pass(deniedIsolatedStates).fingerprint);
}

// The kernel, not the adapter, owns UNKNOWN/MISSING semantics.
{
  const noObservations = pass(build());
  record('SEMANTICS/no_observation_is_unknown', noObservations.gap_counts[GAP_TYPE.UNKNOWN] === 2
    && (noObservations.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0);

  const first = fixture.nodes.find((node) => node.node_type === 'expected_state_element').state_element.element_id;
  const explicitAbsence = pass(build({ observations: [observationFor(first, PRESENCE.ABSENCE_CONFIRMED)] }));
  record('SEMANTICS/only_explicit_absence_is_missing', explicitAbsence.gap_counts[GAP_TYPE.MISSING] === 1
    && explicitAbsence.gap_counts[GAP_TYPE.UNKNOWN] === 1);

  const explicitUnknown = pass(build({ observations: [observationFor(first, PRESENCE.UNKNOWN)] }));
  record('SEMANTICS/explicit_unknown_stays_unknown', explicitUnknown.gap_counts[GAP_TYPE.UNKNOWN] === 2
    && (explicitUnknown.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0);

  const explicitPresent = pass(build({ observations: [observationFor(first, PRESENCE.PRESENT)] }));
  record('SEMANTICS/present_satisfies_only_observed_item', explicitPresent.gap_counts[GAP_TYPE.SATISFIED] === 1
    && explicitPresent.gap_counts[GAP_TYPE.UNKNOWN] === 1);
  record('SEMANTICS/no_writes_no_llm', explicitPresent.erp_writes === 0 && explicitPresent.learned_model_invocations === 0);
}

// An artifact ref identifies bytes; it does not encode how those bytes were observed. The
// replay tuple therefore also binds the complete expected/observed state semantics.
{
  const expectedIds = fixture.nodes
    .filter((node) => node.node_type === 'expected_state_element')
    .map((node) => node.state_element.element_id);
  const present = build({ observations: [observationFor(expectedIds[0], PRESENCE.PRESENT)] });
  const absent = build({ observations: [observationFor(expectedIds[0], PRESENCE.ABSENCE_CONFIRMED)] });
  const presentPass = pass(present);
  const absentPass = pass(absent);
  record('REPLAY/observation_semantics_change_with_same_artifact_ref',
    JSON.stringify(present.canonical_accepted_input_set) === JSON.stringify(absent.canonical_accepted_input_set)
    && present.context_capsule_fingerprint === absent.context_capsule_fingerprint
    && presentPass.fingerprint !== absentPass.fingerprint);
  record('REPLAY/observation_semantics_change_materialises_new_snapshot',
    classifyReplay({ prior: presentPass, next: absentPass }).action === 'materialise_new_snapshot');

  const complete = build({ observations: expectedIds.map((id) => observationFor(id, PRESENCE.PRESENT)) });
  const reordered = { ...complete, expected: [...complete.expected].reverse(), observed: [...complete.observed].reverse() };
  record('REPLAY/state_element_reordering_is_inert', pass(complete).fingerprint === pass(reordered).fingerprint);
}

// Ordering is not meaning. Reordering the projection and selector produces the same pins,
// selected elements, canonical input set, and capsule fingerprint.
{
  const reordered = clone(fixture);
  reordered.nodes.reverse();
  reordered.edges.reverse();
  const baseline = build();
  const next = build({ projection: reordered, selector: selectorFor(reordered, {
    seed_refs: reordered.nodes.filter((node) => node.node_type === 'rule').map((node) => node.ref).reverse(),
  }) });
  record('DETERMINISM/reordering_stable', baseline.projection_sha256 === next.projection_sha256
    && JSON.stringify(baseline.expected) === JSON.stringify(next.expected)
    && JSON.stringify(baseline.canonical_accepted_input_set) === JSON.stringify(next.canonical_accepted_input_set)
    && baseline.context_capsule_fingerprint === next.context_capsule_fingerprint);
}

// Printable separators inside identifiers cannot collapse distinct sort tuples. The first
// case targets the projection node order; the second targets selected-ref and ACL trace order.
{
  const collision = clone(fixture);
  const rules = collision.nodes.filter((node) => node.node_type === 'rule');
  const sharedDigest = 'b'.repeat(64);
  const replacements = [
    { entity_id: 'c', revision_id: 'a|b' },
    { entity_id: 'b|c', revision_id: 'a' },
  ];
  for (let index = 0; index < 2; index += 1) {
    const rule = rules[index];
    const edge = collision.edges.find((candidate) => candidate.from_ref.entity_id === rule.ref.entity_id);
    rule.ref = {
      ...rule.ref,
      ...replacements[index],
      content_id: `sha256:${sharedDigest}`,
    };
    rule.content_sha256 = sharedDigest;
    edge.from_ref = clone(rule.ref);
    edge.evidence_ref = clone(rule.ref);
  }
  repin(collision);
  const reversed = clone(collision); reversed.nodes.reverse(); reversed.edges.reverse();
  const baseline = build({ projection: collision, selector: selectorFor(collision) });
  const next = build({ projection: reversed, selector: selectorFor(reversed) });
  record('DETERMINISM/node_tuple_separator_collision_is_inert',
    baseline.projection_sha256 === next.projection_sha256
    && baseline.context_capsule_fingerprint === next.context_capsule_fingerprint);
}
{
  const collision = clone(fixture);
  const expectedNodes = collision.nodes.filter((node) => node.node_type === 'expected_state_element');
  const edge0 = collision.edges[0];
  const edge1 = collision.edges[1];
  edge0.edge_id = 'edge|tail';
  edge1.edge_id = 'edge';
  expectedNodes[0].ref.revision_id = 'rev';
  expectedNodes[0].state_element.requirement_ref.revision_id = 'rev';
  edge0.to_ref.revision_id = 'rev';
  expectedNodes[1].ref.revision_id = 'tail|rev';
  expectedNodes[1].state_element.requirement_ref.revision_id = 'tail|rev';
  edge1.to_ref.revision_id = 'tail|rev';
  repin(collision);
  const reversed = clone(collision); reversed.nodes.reverse(); reversed.edges.reverse();
  const baseline = build({ projection: collision, selector: selectorFor(collision) });
  const next = build({ projection: reversed, selector: selectorFor(reversed) });
  record('DETERMINISM/selection_and_acl_tuple_separator_collision_is_inert',
    baseline.context_capsule_fingerprint === next.context_capsule_fingerprint
    && JSON.stringify(baseline.expected) === JSON.stringify(next.expected));
}

// A legitimate revision change must be re-pinned and then changes both projection identity
// and the Engine replay fingerprint. The adapter reports the canonical expected digest when
// an old pin is presented, which lets this test construct a consistent positive control.
{
  const revised = clone(fixture);
  revised.projection_revision = 'common-se-projection-synthetic-r2';
  revised.projection_ref.revision_id = revised.projection_revision;
  const firstAttempt = reject('PINS/revision_with_old_hash_refused',
    () => build({ projection: revised, selector: selectorFor(revised) }), CODES.PROJECTION_PIN_INVALID);
  const nextDigest = firstAttempt?.detail?.expected_sha256;
  revised.projection_sha256 = nextDigest;
  const baselineStates = build();
  const revisedStates = build({ projection: revised, selector: selectorFor(revised) });
  const baselinePass = pass(baselineStates, 'common-se-synthetic-run-1');
  const revisedPass = pass(revisedStates, 'common-se-synthetic-run-1');
  record('PINS/revision_and_hash_change_fingerprint', /^[0-9a-f]{64}$/.test(nextDigest ?? '')
    && revisedStates.projection_sha256 !== baselineStates.projection_sha256
    && revisedPass.fingerprint !== baselinePass.fingerprint);
}
{
  const changedRef = clone(fixture);
  changedRef.projection_ref.entity_id = 'common-se-projection-synthetic-reissued';
  changedRef.projection_ref.content_id = `sha256:${'7'.repeat(64)}`;
  repin(changedRef);
  const baseline = build();
  const changed = build({ projection: changedRef, selector: selectorFor(changedRef) });
  record('PINS/full_projection_ref_is_hashed', changed.projection_sha256 !== baseline.projection_sha256
    && pass(changed).fingerprint !== pass(baseline).fingerprint);
}
{
  const changedEdgeSemantic = clone(fixture);
  changedEdgeSemantic.edges[0].review_state = 'independently_reviewed_synthetic_fixture';
  repin(changedEdgeSemantic);
  const baseline = build();
  const changed = build({ projection: changedEdgeSemantic, selector: selectorFor(changedEdgeSemantic) });
  record('PINS/all_accepted_edge_semantics_are_hashed', changed.projection_sha256 !== baseline.projection_sha256
    && pass(changed).fingerprint !== pass(baseline).fingerprint);
}

// Binding and pin failures.
reject('REFUSE/binding/no_expected_binding', () => build({ expectedProjectBindingRef: '' }), CODES.PROJECT_BINDING_REQUIRED);
reject('REFUSE/binding/wrong_expected_binding', () => build({ expectedProjectBindingRef: 'synthetic-other' }), CODES.PROJECT_BINDING_MISMATCH);
{
  const p = clone(fixture); delete p.manifest_ref.revision_id;
  reject('REFUSE/ref/floating_manifest', () => build({ projection: p, selector: selectorFor(p) }), CODES.MANIFEST_PIN_INVALID);
}
{
  const p = clone(fixture); p.manifest_sha256 = '8'.repeat(64);
  reject('REFUSE/ref/manifest_digest_mismatch', () => build({ projection: p, selector: selectorFor(p) }), CODES.REF_DIGEST_INVALID);
}
{
  const p = clone(fixture); p.nodes[0].content_sha256 = '9'.repeat(64); repin(p);
  reject('REFUSE/ref/node_digest_mismatch', () => build({ projection: p, selector: selectorFor(p) }), CODES.REF_DIGEST_INVALID);
}
{
  const p = clone(fixture); p.projection_sha256 = '9'.repeat(64);
  reject('REFUSE/ref/projection_digest_mismatch', () => build({ projection: p, selector: selectorFor(p) }), CODES.PROJECTION_PIN_INVALID);
}

// Strict plain-own-JSON and closed-schema counterexamples from the independent review.
{
  const p = clone(fixture); p.unexpected = true;
  reject('REFUSE/schema/projection_extra_field', () => build({ projection: p, selector: selectorFor(p) }), CODES.SCHEMA_CLOSED);
}
{
  const p = clone(fixture); p.manifest_ref.unexpected = true;
  reject('REFUSE/schema/ref_extra_field', () => build({ projection: p, selector: selectorFor(p) }), CODES.MANIFEST_PIN_INVALID);
}
{
  const p = clone(fixture); p.nodes[0].unexpected = true; repin(p);
  reject('REFUSE/schema/node_extra_field', () => build({ projection: p, selector: selectorFor(p) }), CODES.NODE_INVALID);
}
{
  const marker = 'nested-private-field-marker-123456';
  const p = clone(fixture); p.nodes[0][marker] = 1;
  const error = reject('REFUSE/schema/nested_extra_field_no_hash_oracle_echo',
    () => build({ projection: p, selector: selectorFor(p) }), CODES.NODE_INVALID);
  record('REFUSE/schema/nested_extra_field_not_echoed',
    !JSON.stringify({ message: error?.message, detail: error?.detail, stack: error?.stack }).includes(marker));
}
{
  const p = clone(fixture); p.edges[0].unexpected = true; repin(p);
  reject('REFUSE/schema/edge_extra_field', () => build({ projection: p, selector: selectorFor(p) }), CODES.EDGE_INVALID);
}
{
  const selector = selectorFor(); selector.unexpected = true;
  reject('REFUSE/schema/selector_extra_field', () => build({ selector }), CODES.SELECTOR_UNBOUNDED);
}
{
  const selector = selectorFor(); selector.traversal.unexpected = true;
  reject('REFUSE/schema/traversal_extra_field', () => build({ selector }), CODES.SELECTOR_UNBOUNDED);
}
{
  const first = fixture.nodes.find((node) => node.node_type === 'expected_state_element').state_element.element_id;
  const observation = observationFor(first, PRESENCE.PRESENT); observation.unexpected = true;
  reject('REFUSE/schema/observation_extra_field', () => build({ observations: [observation] }), CODES.OBSERVATION_INVALID);
}
{
  const p = clone(fixture); Object.setPrototypeOf(p, { inherited: true });
  reject('REFUSE/json/custom_prototype', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); p.nodes[0].ref = new Date('2026-08-12T00:00:00.000Z');
  reject('REFUSE/json/date_host_object', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); p.loop = p;
  reject('REFUSE/json/cycle', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); p.nodes[1].ref = p.nodes[0].ref;
  reject('REFUSE/json/aliased_object', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); p.project_binding_ref = `synthetic-se-core-e\u0301val-v1`;
  reject('REFUSE/json/non_nfc_string', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); p.project_binding_ref = 'x'.repeat(513);
  reject('REFUSE/json/oversized_string', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); Object.defineProperty(p, 'hidden', { value: true, enumerable: false });
  reject('REFUSE/json/hidden_field', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  const p = clone(fixture); Object.defineProperty(p, Symbol('hidden'), { value: true, enumerable: true });
  reject('REFUSE/json/symbol_field', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
}
{
  let getterInvocations = 0;
  const p = clone(fixture);
  Object.defineProperty(p, 'schema_version', { enumerable: true, configurable: true, get() { getterInvocations += 1; return fixture.schema_version; } });
  const error = reject('REFUSE/json/accessor_without_invocation', () => build({ projection: p, selector: selectorFor(p) }), CODES.JSON_SHAPE_INVALID);
  record('REFUSE/json/accessor_was_not_invoked', getterInvocations === 0 && error instanceof ContractError);
}
{
  const target = clone(fixture);
  const alteredNodes = clone(fixture.nodes);
  alteredNodes.find((node) => node.node_type === 'expected_state_element').state_element.known_at = '2026-08-13T00:00:00.000Z';
  let getCalls = 0;
  const projectionProxy = new Proxy(target, {
    get(object, property, receiver) {
      if (property === 'nodes') {
        getCalls += 1;
        return getCalls <= 5 ? Reflect.get(object, property, receiver) : alteredNodes;
      }
      return Reflect.get(object, property, receiver);
    },
  });
  const states = build({
    projection: projectionProxy,
    selector: selectorFor(fixture),
    expectedProjectBindingRef: fixture.project_binding_ref,
  });
  record('JSON/proxy_get_toctou_uses_one_descriptor_snapshot', getCalls === 0
    && states.expected.every((element) => element.known_at === '2026-08-12T00:00:00.000Z'));
}
{
  const target = clone(fixture);
  const alteredNodes = clone(fixture.nodes);
  alteredNodes.find((node) => node.node_type === 'expected_state_element').state_element.known_at = '2026-08-13T00:00:00.000Z';
  const projectionProxy = new Proxy(target, {
    getOwnPropertyDescriptor(object, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(object, property);
      return property === 'nodes' ? { ...descriptor, value: alteredNodes } : descriptor;
    },
  });
  reject('REFUSE/json/proxy_descriptor_change_requires_new_hash', () => build({
    projection: projectionProxy,
    selector: selectorFor(fixture),
    expectedProjectBindingRef: fixture.project_binding_ref,
  }), CODES.PROJECTION_PIN_INVALID);
}
{
  const selector = selectorFor(); selector.seed_refs = new Array(1);
  reject('REFUSE/json/sparse_array', () => build({ selector }), CODES.JSON_SHAPE_INVALID);
}
{
  const marker = 'reviewer-secret-marker-123456';
  const p = clone(fixture); p.project_binding_ref = `Bearer ${marker}`;
  const error = reject('REFUSE/security/embedded_token', () => build({ projection: p, selector: selectorFor(p) }), CODES.FORBIDDEN_PAYLOAD);
  record('REFUSE/security/error_does_not_echo_token', !JSON.stringify({ message: error?.message, detail: error?.detail, stack: error?.stack }).includes(marker));
}
{
  const marker = 'reviewer-private-marker';
  const p = clone(fixture); p.project_binding_ref = `_workspaces/${marker}/source.pdf`;
  const error = reject('REFUSE/security/embedded_private_path', () => build({ projection: p, selector: selectorFor(p) }), CODES.FORBIDDEN_PAYLOAD);
  record('REFUSE/security/error_does_not_echo_path', !JSON.stringify({ message: error?.message, detail: error?.detail, stack: error?.stack }).includes(marker));
}

// Payload and private-location guards execute before graph selection.
{
  const p = clone(fixture); p.nodes[0].source_text = 'synthetic source body';
  reject('REFUSE/payload/source_text', () => build({ projection: p, selector: selectorFor(p) }), CODES.FORBIDDEN_PAYLOAD);
}
{
  const p = clone(fixture); p.nodes[0].locator = ['C:', 'private', 'source.pdf'].join('\\');
  reject('REFUSE/payload/absolute_private_path', () => build({ projection: p, selector: selectorFor(p) }), CODES.FORBIDDEN_PAYLOAD);
}
{
  const p = clone(fixture); p.nodes[0].answer = 'provider output';
  reject('REFUSE/payload/provider_answer', () => build({ projection: p, selector: selectorFor(p) }), CODES.FORBIDDEN_PAYLOAD);
}

// Graph and authority failures.
{
  const p = clone(fixture); p.authority_ceiling = 'general_se_guidance'; repin(p);
  reject('REFUSE/authority/ceiling_breach', () => build({ projection: p, selector: selectorFor(p) }), CODES.AUTHORITY_CEILING_BREACH);
}
{
  const p = clone(fixture);
  const edge = p.edges[0];
  const rule = p.nodes.find((node) => node.ref.entity_id === edge.from_ref.entity_id);
  rule.authority_family = 'general_se_guidance';
  edge.authority_family = 'general_se_guidance';
  repin(p);
  reject('REFUSE/authority/expected_outranks_rule_evidence_edge', () => build({
    projection: p,
    selector: selectorFor(p, { source_family_filter: ['acquisition_authority_manual', 'general_se_guidance'] }),
  }), CODES.AUTHORITY_CEILING_BREACH);
}
{
  const p = clone(fixture); p.edges[0].edge_type = 'summarised_in'; repin(p);
  reject('REFUSE/graph/non_requires_edge', () => build({ projection: p, selector: selectorFor(p) }), CODES.EDGE_INVALID);
}
{
  const p = clone(fixture); p.edges[0].applicability = false; repin(p);
  reject('REFUSE/graph/inapplicable_edge', () => build({ projection: p, selector: selectorFor(p) }), CODES.EDGE_INVALID);
}
{
  const p = clone(fixture);
  p.edges[0].evidence_ref = clone(p.nodes.find((node) => node.node_type === 'expected_state_element').ref);
  repin(p);
  reject('REFUSE/graph/evidence_not_rule_ref', () => build({ projection: p, selector: selectorFor(p) }), CODES.EDGE_INVALID);
}

// Selector boundaries and ACL.
reject('REFUSE/selector/whole_corpus', () => build({ selector: selectorFor(fixture, { scope: 'whole_corpus' }) }), CODES.SELECTOR_UNBOUNDED);
reject('REFUSE/selector/two_hops', () => build({ selector: selectorFor(fixture, {
  traversal: { max_hops: 2, allowlisted_edge_types: ['requires'] },
}) }), CODES.SELECTOR_UNBOUNDED);
reject('REFUSE/selector/oversized_budget', () => build({ selector: selectorFor(fixture, {
  budgets: { top_k: 51, max_nodes: 51, max_edges: 10, max_sources: 10, max_evidence_chars: 1000 },
}) }), CODES.SELECTOR_UNBOUNDED);
reject('REFUSE/selector/max_edges_enforced_on_actual_slice', () => build({ selector: selectorFor(fixture, {
  budgets: { top_k: 10, max_nodes: 10, max_edges: 1, max_sources: 10, max_evidence_chars: 1000 },
}) }), CODES.SELECTOR_UNBOUNDED);
{
  const states = build({ selector: selectorFor(fixture, {
    budgets: { top_k: 10, max_nodes: 10, max_edges: 2, max_sources: 10, max_evidence_chars: 1000 },
  }) });
  record('SELECTOR/max_edges_positive_control_two_edges', states.expected.length === 2);
}
{
  const oneRule = fixture.nodes.find((node) => node.node_type === 'rule'
    && fixture.edges.some((edge) => edge.from_ref.entity_id === node.ref.entity_id)).ref;
  const states = build({ selector: selectorFor(fixture, {
    seed_refs: [oneRule],
    budgets: { top_k: 10, max_nodes: 10, max_edges: 1, max_sources: 10, max_evidence_chars: 1000 },
  }) });
  record('SELECTOR/max_edges_positive_control_one_edge', states.expected.length === 1);
}
reject('REFUSE/selector/wrong_projection_revision', () => build({ selector: selectorFor(fixture, {
  graph_projection_revision: 'floating-latest',
}) }), CODES.PROJECTION_PIN_INVALID);
reject('REFUSE/selector/authority_not_allowlisted', () => build({ selector: selectorFor(fixture, {
  source_family_filter: ['general_se_guidance'],
}) }), CODES.SELECTOR_UNBOUNDED);
{
  const isolated = fixture.nodes.find((node) => node.ref.entity_id === 'se-rule-isolated-evaluation-control').ref;
  reject('REFUSE/selector/isolated_seed_authority_not_allowlisted', () => build({ selector: selectorFor(fixture, {
    seed_refs: [isolated], source_family_filter: ['general_se_guidance'],
  }) }), CODES.SELECTOR_UNBOUNDED);
}
reject('REFUSE/selector/acl_revision_empty', () => build({ selector: selectorFor(fixture, {
  acl_filter_revision: '',
}) }), CODES.SELECTOR_UNBOUNDED);
reject('REFUSE/acl/missing', () => build({ aclCheck: null }), CODES.INPUT_INVALID);
reject('REFUSE/acl/non_boolean', () => build({ aclCheck: () => 'allow' }), CODES.INPUT_INVALID);
{
  const marker = 'acl-private-marker-123456';
  const error = reject('REFUSE/acl/thrown_error_wrapped', () => build({ aclCheck: () => { throw new Error(marker); } }), CODES.INPUT_INVALID);
  record('REFUSE/acl/thrown_error_not_echoed', !JSON.stringify({ message: error?.message, detail: error?.detail, stack: error?.stack }).includes(marker));
}
{
  const deniedRule = fixture.nodes.find((node) => node.node_type === 'rule').ref.entity_id;
  const states = build({ aclCheck: (ref) => ref.entity_id !== deniedRule });
  record('ACL/denied_seed_does_not_reach_expected', states.expected.length === 1
    && states.selection.excluded_count === 1
    && !JSON.stringify(states).includes(deniedRule));
}
{
  let result;
  const error = reject('REFUSE/acl/all_denied_is_explicit_empty_selection', () => {
    result = pass(build({ aclCheck: () => false }));
  }, CODES.SELECTION_EMPTY);
  record('REFUSE/acl/all_denied_emits_no_false_snapshot_or_findings',
    error instanceof ContractError && result === undefined);
  const detail = error?.detail;
  const serialized = JSON.stringify({ message: error?.message, detail });
  const fixtureIdentifiers = fixture.nodes.flatMap((node) => [node.ref.entity_id, node.ref.revision_id]);
  record('REFUSE/acl/all_denied_preserves_safe_aggregate_provenance',
    detail?.included_count === 0
    && detail?.excluded_count === 3
    && detail?.acl_denied_count === 3
    && Array.isArray(detail?.excluded_reasons)
    && detail.excluded_reasons.some((entry) => entry.reason === 'acl_denied_at_seed'
      && entry.hop === 0 && entry.count === 3));
  record('REFUSE/acl/all_denied_detail_echoes_no_ref_or_entity',
    fixtureIdentifiers.every((identifier) => !serialized.includes(identifier)));
}

// Explicit observations cannot cross a binding or name an unselected element.
reject('REFUSE/observations/not_supplied', () => buildStatesFromCommonSeProjection({
  projection: fixture, selector: selectorFor(), aclCheck: () => true,
  expectedProjectBindingRef: fixture.project_binding_ref,
}), CODES.INPUT_INVALID);
{
  const first = fixture.nodes.find((node) => node.node_type === 'expected_state_element').state_element.element_id;
  const observation = observationFor(first, PRESENCE.PRESENT); observation.project_binding_ref = 'synthetic-other';
  reject('REFUSE/observations/wrong_binding', () => build({ observations: [observation] }), CODES.OBSERVATION_INVALID);
}
{
  const observation = observationFor('not-selected', PRESENCE.PRESENT);
  reject('REFUSE/observations/not_selected', () => build({ observations: [observation] }), CODES.OBSERVATION_INVALID);
}
{
  const first = fixture.nodes.find((node) => node.node_type === 'expected_state_element').state_element.element_id;
  const observation = observationFor(first, PRESENCE.PRESENT); observation.artifact_revision_ref.content_id = 'floating';
  reject('REFUSE/observations/no_exact_digest', () => build({ observations: [observation] }), CODES.REF_DIGEST_INVALID);
}
{
  const first = fixture.nodes.find((node) => node.node_type === 'expected_state_element').state_element.element_id;
  const observation = observationFor(first, PRESENCE.PRESENT); observation.known_at = new Date('2026-08-12T00:00:00.000Z');
  reject('REFUSE/observations/date_host_object', () => build({ observations: [observation] }), CODES.JSON_SHAPE_INVALID);
}

const failed = results.filter((result) => !result.ok);
const receipt = {
  schema_version: 'soulforge.common_se_corpus_projection_conformance.v0',
  fixture_kind: 'public_safe_synthetic_only',
  tests: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  wrote_file: null,
  network_calls: 0,
  learned_model_invocations: 0,
  failures: failed,
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
