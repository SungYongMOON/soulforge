import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generatePilotPacketFromStageRules,
  PilotPacketGeneratorError,
  PILOT_PACKET_GENERATOR_CODES,
  PILOT_PACKET_GENERATOR_SCHEMA_VERSION,
  PRESENCE_STATES_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN,
  AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA_PIN,
  AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA_PIN,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_PIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN_PIN,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN_PIN,
  AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN_PIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN_PIN,
} from '../rules/pilot_packet_generator.mjs';
import { compileStageRules, mintEnginePolicyRef } from '../rules/stage_rule_compiler.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { PRESENCE } from '../../../core/validators/custody.mjs';
import { exactRefIdentityKey } from '../../../core/validators/identity.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN,
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN,
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN,
  AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA,
  assessOwnerFrozenProjectContext,
} from '../evaluator/ax_se_project_context_pilot.mjs';
import {
  AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA,
} from '../evaluator/ax_se_project_role_bound_assessment.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
  buildAxSeAssessmentInput,
} from '../evaluator/ax_se_project_assessment.mjs';
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
} from '../../../../shared/project_knowledge_view.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
  COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
} from '../tools/ax_se_project_context_pilot_runner.mjs';

const MODULE_URL = new URL('../rules/pilot_packet_generator.mjs', import.meta.url);
const ROLE_BOUND_FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_role_bound_assessment_synthetic_v1.json',
  import.meta.url,
), 'utf8'));
const STAGE_RULE_FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/se_stage_rules/compiled_variant_synthetic_v0.json',
  import.meta.url,
), 'utf8'));
const STAGE_RULE_OVERLAY = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/se_stage_rules/stage_rule_overlay_synthetic_v0.json',
  import.meta.url,
), 'utf8'));

const UNIT_SEPARATOR = '\u001f';
const NUL = '\u0000';
const KNOWN_AT = '2026-08-18T00:00:00.000Z';
const OBS_VALID_AT = '2026-07-01T00:00:00.000Z';
const OBS_KNOWN_AT = '2026-08-01T00:00:00.000Z';
const SEED = 'synthetic_r3_generator_seed_01';
const POLICY_IDENTITY = Object.freeze({
  policy_id: 'synthetic_stage_rule_policy_01',
  revision_label: 'synthetic_compile_r1',
});

const clone = (value) => structuredClone(value);

function syntheticRef(seed) {
  const token = String(seed).padStart(12, '0');
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${String(seed).padStart(64, '0')}`,
    content_hash_alg: 'sha256',
  };
}

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === 'object') {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

const canon = (value) => canonicalise(value, arrayOrderRules(value));
const nulFingerprint = (domain, value) => `sha256:${sha256Hex(`${domain}${NUL}${canon(value)}`)}`;
const sortRefs = (refs) => [...refs].sort((left, right) => compareCodePoints(
  exactRefIdentityKey(left), exactRefIdentityKey(right),
));

// ---------------------------------------------------------------- synthetic base packet
//
// Built the way the engine's own pilot test builds one, from the public-synthetic role-bound
// fixture, so the "previously validated packet" this generator templates from is a packet the
// subject really does accept. No private packet content is reproduced here.

function bindKnowledgeAuthorityGrant(draft) {
  const approved = sortRefs(clone(draft.approved_common_revision_refs));
  return {
    ...clone(draft),
    approved_common_revision_refs: approved,
    grant_ref: {
      ...clone(draft.grant_ref),
      content_id: nulFingerprint(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN, {
        schema_version: draft.schema_version,
        feature_state: draft.feature_state,
        authority_ceiling: draft.authority_ceiling,
        policy_ref: draft.policy_ref,
        project_binding_ref: draft.project_binding_ref,
        project_root_path: draft.project_root_path,
        common_root_path: draft.common_root_path,
        containment_root_path: draft.containment_root_path,
        approved_common_revision_refs: approved,
      }),
    },
  };
}

function bindManifest(draft) {
  return {
    ...clone(draft),
    manifest_ref: {
      ...clone(draft.manifest_ref),
      content_id: nulFingerprint(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN, {
        schema_version: draft.schema_version,
        project_binding_ref: draft.project_binding_ref,
        project_material_revision_refs: draft.project_material_revision_refs,
      }),
    },
  };
}

function bindPilotGrant(draft) {
  return {
    ...clone(draft),
    grant_ref: {
      ...clone(draft.grant_ref),
      content_id: nulFingerprint(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN, {
        schema_version: draft.schema_version,
        feature_state: draft.feature_state,
        authority_ceiling: draft.authority_ceiling,
        knowledge_view_authority_grant_ref: draft.knowledge_view_authority_grant_ref,
        project_binding_ref: draft.project_binding_ref,
        project_source_binding_manifest_ref: draft.project_source_binding_manifest_ref,
        pilot_material_fingerprint_sha256: draft.pilot_material_fingerprint_sha256,
        expected_role_roster_ref: draft.expected_role_roster_ref,
      }),
    },
  };
}

function projectMaterialRefs(rolePacket, commonRequirementKeys) {
  const refs = [clone(rolePacket.context_packet.objective_ref)];
  for (const observation of rolePacket.context_packet.observations) {
    refs.push(clone(observation.artifact_revision_ref), ...clone(observation.evidence_refs));
    for (const claim of observation.conflict_claims ?? []) {
      refs.push(clone(claim.source_revision_ref));
    }
  }
  for (const risk of rolePacket.context_packet.risks) {
    refs.push(clone(risk.risk_ref), ...clone(risk.evidence_refs));
  }
  refs.push(...clone(rolePacket.role_roster_packet.source_revision_refs));
  refs.push(clone(rolePacket.policy_capability_vocabulary_ref));
  for (const stage of rolePacket.policy.stages) {
    for (const requirement of stage.requirements) {
      if (!commonRequirementKeys.has(exactRefIdentityKey(requirement.requirement_ref))) {
        refs.push(clone(requirement.requirement_ref));
      }
    }
  }
  return sortRefs([...new Map(refs.map((ref) => [exactRefIdentityKey(ref), ref])).values()]);
}

function basePilotFixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'soulforge-r3-generator-'));
  const containmentRoot = join(tempRoot, 'workspace');
  const projectRoot = join(containmentRoot, 'project');
  const commonRoot = join(containmentRoot, 'common');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  const roleBoundPacket = clone(ROLE_BOUND_FIXTURE.packet);
  // The generated packet carries a policy compiled for other stages, and a risk filed against a
  // stage that policy does not declare would be refused for a reason the generator did not cause.
  roleBoundPacket.context_packet.risks = [];
  const projectRef = clone(roleBoundPacket.expected_project_binding_ref);
  const policyRef = clone(roleBoundPacket.policy.policy_ref);
  const commonRef = syntheticRef(901);
  const commonRequirementRef = clone(
    roleBoundPacket.policy.stages[0].requirements[1].requirement_ref,
  );
  const knowledgeViewAuthorityGrant = bindKnowledgeAuthorityGrant({
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: 'off',
    authority_ceiling: 'synthetic_validation_only',
    grant_ref: syntheticRef(902),
    policy_ref: clone(policyRef),
    project_binding_ref: clone(projectRef),
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: [clone(commonRef)],
  });
  const manifest = bindManifest({
    schema_version: AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA,
    manifest_ref: syntheticRef(903),
    project_binding_ref: clone(projectRef),
    project_material_revision_refs: projectMaterialRefs(
      roleBoundPacket, new Set([exactRefIdentityKey(commonRequirementRef)]),
    ),
  });
  const packetDraft = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA,
    feature_state: 'off',
    knowledge_view_request: {
      schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
      feature_state: 'off',
      project_binding_refs: [clone(projectRef)],
      common_revision_refs: [clone(commonRef)],
    },
    knowledge_view_authority_grant: knowledgeViewAuthorityGrant,
    common_projection_bindings: [{
      common_revision_ref: clone(commonRef),
      policy_requirement_ref: clone(commonRequirementRef),
    }],
    project_source_binding_manifest: manifest,
    role_bound_packet: roleBoundPacket,
  };
  const pilotGrant = bindPilotGrant({
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA,
    feature_state: 'off',
    authority_ceiling: 'owner_frozen_manual_zero_write',
    grant_ref: syntheticRef(904),
    knowledge_view_authority_grant_ref: clone(knowledgeViewAuthorityGrant.grant_ref),
    project_binding_ref: clone(projectRef),
    project_source_binding_manifest_ref: clone(manifest.manifest_ref),
    pilot_material_fingerprint_sha256: nulFingerprint(
      AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN, {
        knowledge_view_request: packetDraft.knowledge_view_request,
        common_projection_bindings: packetDraft.common_projection_bindings,
        project_source_binding_manifest: packetDraft.project_source_binding_manifest,
        role_bound_packet: packetDraft.role_bound_packet,
      },
    ),
    expected_role_roster_ref: clone(ROLE_BOUND_FIXTURE.expected_role_roster_ref),
  });
  return {
    basePacket: { ...packetDraft, pilot_grant: pilotGrant },
    expectedPilotGrantRef: clone(pilotGrant.grant_ref),
    paths: { tempRoot, containmentRoot, projectRoot, commonRoot },
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------- compiled stage rules

function compiled() {
  const request = clone(STAGE_RULE_FIXTURE.request);
  request.overlay = clone(STAGE_RULE_OVERLAY.overlay);
  // The pilot subject demands an immutably named revision on every ref that reaches its
  // manifest. `rev_1` is not one of the forms it accepts, so this synthetic project binding
  // names its document revisions in a form that is.
  for (const row of request.project_binding.document_refs) row.requirement_ref.revision_id = 'rev1';
  return compileStageRules(request);
}

function observation(id, key, presenceState, seed, extra = {}) {
  return {
    observation_id: id,
    ...key,
    presence_state: presenceState,
    observation_attempt_ref: `observation:synthetic:${id}`,
    artifact_revision_ref: syntheticRef(seed),
    evidence_refs: [syntheticRef(seed + 1)],
    valid_at: OBS_VALID_AT,
    known_at: OBS_KNOWN_AT,
    ...extra,
  };
}

function observations() {
  return [
    observation('obs_srs', { artifact_type_id: 'srs' }, PRESENCE.PRESENT, 1100),
    observation('obs_icd', { artifact_type_id: 'icd' }, PRESENCE.ABSENCE_CONFIRMED, 1110),
    observation('obs_dbdd', { artifact_type_id: 'dbdd' }, PRESENCE.PRESENT, 1120),
    observation('obs_pci', { alias: 'synthetic_slot_07_product_baseline' }, PRESENCE.PRESENT, 1130),
    // A requirement nobody could observe: the engine reads an unmade observation as unknown, and
    // an unmade observation is the one kind allowed to cite nothing.
    { ...observation('obs_minutes', { artifact_type_id: 'review_minutes_cdr' }, PRESENCE.UNKNOWN, 1140), evidence_refs: [] },
    // `sdd` is carried by the compiled table as context only, so it owns no engine requirement.
    observation('obs_sdd_context_only', { artifact_type_id: 'sdd' }, PRESENCE.PRESENT, 1150),
  ];
}

function generatorRequest(overrides = {}) {
  const state = overrides.state ?? basePilotFixture();
  const rules = overrides.compiled ?? compiled();
  return {
    state,
    rules,
    request: {
      base_packet: clone(overrides.basePacket ?? state.basePacket),
      engine_stage_policy_material: clone(rules.engine_stage_policy_material),
      mapping_table: clone(overrides.mappingTable ?? rules.mapping_table),
      artifact_observations: clone(overrides.observations ?? observations()),
      policy_identity: clone(POLICY_IDENTITY),
      packet_identity_seed: SEED,
      known_at: KNOWN_AT,
      ...(overrides.omitCommonBindingRequirementId === true
        ? {}
        : { common_binding_requirement_id: overrides.commonBindingRequirementId ?? '120_CDR_review_minutes_cdr' }),
    },
  };
}

const throwsWith = (code) => (error) => {
  assert.ok(error instanceof PilotPacketGeneratorError, `expected a generator error, got ${error}`);
  assert.equal(error.code, code);
  return true;
};

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

// ---------------------------------------------------------------- 1. determinism

test('two generations of one request agree byte for byte', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);

  const first = generatePilotPacketFromStageRules(clone(request));
  const second = generatePilotPacketFromStageRules(clone(request));

  assert.deepEqual(second.receipt.input_digests, first.receipt.input_digests);
  assert.deepEqual(second.receipt.output_digests, first.receipt.output_digests);
  assert.equal(canon(second.pilot_packet), canon(first.pilot_packet));
  assert.equal(second.launch_material.pilot_packet_sha256, first.launch_material.pilot_packet_sha256);
  assert.deepEqual(second.launch_material, first.launch_material);

  // Reordering the observations carries no meaning; reordering the mapping table carries none
  // either, since both are read into keyed indexes.
  const shuffled = clone(request);
  shuffled.artifact_observations.reverse();
  shuffled.mapping_table.reverse();
  const reordered = generatePilotPacketFromStageRules(shuffled);
  assert.equal(canon(reordered.pilot_packet), canon(first.pilot_packet));

  // A different seed is a different packet, and says so in every identity it owns.
  const reseeded = generatePilotPacketFromStageRules({ ...clone(request), packet_identity_seed: 'synthetic_other_seed' });
  assert.notEqual(reseeded.pilot_packet.pilot_grant.grant_ref.entity_id,
    first.pilot_packet.pilot_grant.grant_ref.entity_id);
  assert.notEqual(reseeded.launch_material.pilot_packet_sha256,
    first.launch_material.pilot_packet_sha256);
});

// ---------------------------------------------------------------- 2. the engine's policy digest

test('the minted policy ref is the one the engine recomputes over the compiled material', (t) => {
  const { state, rules, request } = generatorRequest();
  t.after(state.cleanup);
  const result = generatePilotPacketFromStageRules(clone(request));
  const policy = result.pilot_packet.role_bound_packet.policy;

  const minted = mintEnginePolicyRef(clone(rules.engine_stage_policy_material), {
    entity_id: policy.policy_ref.entity_id,
    revision_id: policy.policy_ref.revision_id,
  });
  assert.equal(policy.policy_ref.content_id, minted.content_id);
  assert.deepEqual(policy.stages, rules.engine_stage_policy_material.stages);

  // `validatePolicy` is not exported; `buildAxSeAssessmentInput` runs it, digest rule included.
  const input = buildAxSeAssessmentInput({
    contextPacket: clone(result.pilot_packet.role_bound_packet.context_packet),
    expectedProjectBindingRef: clone(result.pilot_packet.pilot_grant.project_binding_ref),
    policy: clone(policy),
    roles: [],
  });
  assert.equal(input.policy.policy_ref.content_id, policy.policy_ref.content_id);
  assert.equal(input.snapshot.observations.length, result.receipt.counts.observations_emitted);

  // The policy identity is the caller's declared label, not the seed: the same rules compiled
  // under the same label keep the same identifiers even when the packet around them changes.
  const other = generatePilotPacketFromStageRules({ ...clone(request), packet_identity_seed: 'synthetic_other_seed' });
  assert.deepEqual(other.pilot_packet.role_bound_packet.policy.policy_ref, policy.policy_ref);
  const relabelled = generatePilotPacketFromStageRules({
    ...clone(request),
    policy_identity: { policy_id: POLICY_IDENTITY.policy_id, revision_label: 'synthetic_compile_r2' },
  });
  assert.equal(relabelled.pilot_packet.role_bound_packet.policy.policy_ref.entity_id,
    policy.policy_ref.entity_id);
  assert.notEqual(relabelled.pilot_packet.role_bound_packet.policy.policy_ref.revision_id,
    policy.policy_ref.revision_id);
});

// ---------------------------------------------------------------- 3. observation mapping

test('observations reach their requirement through the standard token and through the project alias', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);
  const result = generatePilotPacketFromStageRules(clone(request));
  const emitted = result.pilot_packet.role_bound_packet.context_packet.observations;

  // Requirement identity, sorted, one row each. The artifact names the observer used are gone.
  assert.deepEqual(emitted.map((row) => row.requirement_id), [
    '090_PDR_icd', '090_PDR_srs', '120_CDR_dbdd', '120_CDR_pci', '120_CDR_review_minutes_cdr',
  ]);

  const byRequirement = new Map(emitted.map((row) => [row.requirement_id, row]));
  assert.equal(byRequirement.get('090_PDR_srs').presence_state, PRESENCE.PRESENT);
  assert.equal(byRequirement.get('090_PDR_icd').presence_state, PRESENCE.ABSENCE_CONFIRMED);
  // The alias is the project's own slot name; the emitted observation names only the requirement.
  assert.equal(byRequirement.get('120_CDR_pci').presence_state, PRESENCE.PRESENT);
  assert.equal(Object.hasOwn(byRequirement.get('120_CDR_pci'), 'alias'), false);
  assert.equal(Object.hasOwn(byRequirement.get('120_CDR_pci'), 'artifact_type_id'), false);
  assert.equal(Object.hasOwn(byRequirement.get('120_CDR_pci'), 'observation_id'), false);
  assert.deepEqual(Object.keys(byRequirement.get('120_CDR_pci')).sort(compareCodePoints), [
    'artifact_revision_ref', 'evidence_refs', 'known_at', 'observation_attempt_ref',
    'presence_state', 'requirement_id', 'valid_at',
  ]);
  assert.deepEqual(byRequirement.get('120_CDR_review_minutes_cdr').evidence_refs, []);

  assert.deepEqual(result.receipt.counts, {
    requirements: 10,
    observations_emitted: 5,
    unbound_observations: 1,
    present: 3,
    absence_confirmed: 1,
    unknown: 1,
  });
});

// ---------------------------------------------------------------- 4. unbound observations

test('an artifact the compiled policy does not require is reported, never guessed into a neighbour', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);
  const result = generatePilotPacketFromStageRules(clone(request));

  assert.deepEqual(result.receipt.unbound_observations, [{
    observation_id: 'obs_sdd_context_only',
    artifact_type_id: 'sdd',
    reason_code: 'no_engine_requirement_for_artifact',
  }]);
  const emitted = result.pilot_packet.role_bound_packet.context_packet.observations;
  assert.equal(emitted.some((row) => row.requirement_id.endsWith('_sdd')), false);
  // Nothing about the dropped observation reaches the packet, including its refs.
  const rendered = JSON.stringify(result.pilot_packet);
  assert.equal(rendered.includes(syntheticRef(1150).content_id), false);
  assert.equal(rendered.includes('obs_sdd_context_only'), false);

  // An observation naming neither a standard token nor a project alias is a caller mistake.
  const nameless = generatorRequest({ state, observations: [{ ...observation('obs_nameless', {}, PRESENCE.PRESENT, 1200) }] });
  assert.throws(() => generatePilotPacketFromStageRules(nameless.request),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.OBSERVATION_INVALID));

  // Two observations of one requirement is a contradiction this layer may not resolve.
  const duplicated = generatorRequest({
    state,
    observations: [
      observation('obs_a', { artifact_type_id: 'srs' }, PRESENCE.PRESENT, 1210),
      observation('obs_b', { artifact_type_id: 'srs' }, PRESENCE.ABSENCE_CONFIRMED, 1220),
    ],
  });
  assert.throws(() => generatePilotPacketFromStageRules(duplicated.request),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.OBSERVATION_INVALID));

  // A claim of presence or of confirmed absence has to cite something.
  const unevidenced = generatorRequest({
    state,
    observations: [{ ...observation('obs_bare', { artifact_type_id: 'srs' }, PRESENCE.PRESENT, 1230), evidence_refs: [] }],
  });
  assert.throws(() => generatePilotPacketFromStageRules(unevidenced.request),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.OBSERVATION_INVALID));

  // A mapping table that answers one artifact name with two requirements is refused rather than
  // resolved in favour of whichever row came last.
  const rules = compiled();
  const ambiguous = clone(rules.mapping_table);
  ambiguous.push({ ...clone(ambiguous.find((row) => row.artifact_type_id === 'srs')), engine_requirement_id: '120_CDR_dbdd' });
  const ambiguousRequest = generatorRequest({ state, compiled: rules, mappingTable: ambiguous });
  assert.throws(() => generatePilotPacketFromStageRules(ambiguousRequest.request),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.MAPPING_TABLE_INVALID));
});

// ---------------------------------------------------------------- 5. common projection re-pointing

test('a common projection is carried when its requirement survives and re-pointed only when named', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);

  // The base packet binds a requirement of its own policy, which the recompile replaced.
  const result = generatePilotPacketFromStageRules(clone(request));
  assert.equal(result.receipt.common_binding.repointed_to_requested_requirement, true);
  assert.equal(result.receipt.common_binding.rows, 1);
  const requested = result.pilot_packet.role_bound_packet.policy.stages
    .flatMap((stage) => stage.requirements)
    .find((row) => row.requirement_id === '120_CDR_review_minutes_cdr');
  assert.deepEqual(result.pilot_packet.common_projection_bindings[0].policy_requirement_ref,
    requested.requirement_ref);
  assert.deepEqual(result.pilot_packet.common_projection_bindings[0].common_revision_ref,
    request.base_packet.common_projection_bindings[0].common_revision_ref);

  // Regenerating from the packet just produced: the binding still names a requirement of the
  // compiled policy, so it stands unchanged and no fallback is consulted.
  const again = generatePilotPacketFromStageRules({
    ...clone(request),
    base_packet: clone(result.pilot_packet),
    packet_identity_seed: 'synthetic_r3_generator_seed_02',
  });
  assert.deepEqual(again.pilot_packet.common_projection_bindings,
    result.pilot_packet.common_projection_bindings);
  assert.equal(again.receipt.common_binding.repointed_to_requested_requirement, false);
  assert.equal(again.receipt.common_binding.carried_from_base, 1);

  // With nothing named, dropping or guessing the projection are both refusals.
  const unnamed = generatorRequest({ state, omitCommonBindingRequirementId: true });
  assert.throws(() => generatePilotPacketFromStageRules(unnamed.request),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.COMMON_BINDING_UNRESOLVED));

  // A named requirement the compiled policy does not declare is a refusal, not a fall-through.
  const wrong = generatorRequest({ state, commonBindingRequirementId: '120_CDR_not_a_requirement' });
  assert.throws(() => generatePilotPacketFromStageRules(wrong.request),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.COMMON_BINDING_UNRESOLVED));
});

// ---------------------------------------------------------------- 6. the subject accepts the packet

test('the subject accepts the generated packet and judges the compiled stage', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);

  // The template really is a packet the subject already accepts.
  const baseResult = assessOwnerFrozenProjectContext(clone(state.basePacket), clone(state.expectedPilotGrantRef));
  assert.equal(baseResult.current_stage_code, '030_SRR');

  const result = generatePilotPacketFromStageRules(clone(request));
  const assessment = assessOwnerFrozenProjectContext(
    clone(result.pilot_packet),
    clone(result.pilot_packet.pilot_grant.grant_ref),
  );

  assert.equal(assessment.schema_version, 'soulforge.ax_se_project_context_pilot_assessment.v0');
  assert.equal(assessment.current_stage_code, '090_PDR');
  assert.equal(assessment.project_source_binding.manifest_binding_verified, true);
  assert.equal(assessment.project_source_binding.project_material_revision_count,
    result.pilot_packet.project_source_binding_manifest.project_material_revision_refs.length);
  assert.equal(assessment.knowledge_view.common_projection_binding_count, 1);
  assert.deepEqual(assessment.pilot_grant_ref, result.launch_material.expected_pilot_grant_ref);
  assert.equal(assessment.knowledge_view.common_projection_bindings_fingerprint_sha256,
    result.launch_material.expected_common_projection_bindings_fingerprint_sha256);
  assert.equal(Object.values(assessment.effects).every((value) => value === 0), true);

  // The stage the engine reports on is the compiled one, judged against the compiled
  // requirements rather than against the base packet's hand-written slots.
  const counts = assessment.role_bound_assessment.current_stage.requirement_counts;
  assert.equal(counts.satisfied + counts.missing + counts.unknown + counts.not_applicable
    + counts.conflict, 4);
});

// ---------------------------------------------------------------- 7. the manifest partition

test('the manifest is the exact project-plane union, minus what the common projection covers', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);
  const result = generatePilotPacketFromStageRules(clone(request));
  const manifest = result.pilot_packet.project_source_binding_manifest;

  const boundRequirementKeys = new Set(result.pilot_packet.common_projection_bindings
    .map((row) => exactRefIdentityKey(row.policy_requirement_ref)));
  const expected = projectMaterialRefs(result.pilot_packet.role_bound_packet, boundRequirementKeys);
  assert.deepEqual(manifest.project_material_revision_refs, expected);

  // Sorted, unique, and strictly by the exact-ref identity key.
  const keys = manifest.project_material_revision_refs.map(exactRefIdentityKey);
  assert.deepEqual(keys, [...keys].sort(compareCodePoints));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.every((key) => key.includes(UNIT_SEPARATOR)), true);

  // The common projection covers `synthetic_requirement_document_b`, which carries both `pci`
  // and `review_minutes_cdr`, so that document belongs to the Knowledge View side of the line.
  const covered = result.pilot_packet.role_bound_packet.policy.stages
    .flatMap((stage) => stage.requirements)
    .find((row) => row.requirement_id === '120_CDR_pci').requirement_ref;
  assert.equal(boundRequirementKeys.has(exactRefIdentityKey(covered)), true);
  assert.equal(keys.includes(exactRefIdentityKey(covered)), false);

  // The manifest ref is the subject's own digest over the manifest body.
  assert.equal(manifest.manifest_ref.content_id, nulFingerprint(
    AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN, {
      schema_version: manifest.schema_version,
      project_binding_ref: manifest.project_binding_ref,
      project_material_revision_refs: manifest.project_material_revision_refs,
    },
  ));
});

// ---------------------------------------------------------------- 8. the launch material

test('the launch material carries the packet sha of the exact bytes the caller writes', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);
  const result = generatePilotPacketFromStageRules(clone(request));
  const launch = result.launch_material;

  const bytes = Buffer.from(`${canon(result.pilot_packet)}\n`, 'utf8');
  assert.equal(launch.pilot_packet_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.match(launch.pilot_packet_sha256, /^[0-9a-f]{64}$/u);

  assert.deepEqual(launch.expected_pilot_grant_ref, result.pilot_packet.pilot_grant.grant_ref);
  assert.deepEqual(launch.expected_project_source_binding_manifest_ref,
    result.pilot_packet.project_source_binding_manifest.manifest_ref);
  assert.deepEqual(launch.expected_role_roster_ref,
    result.pilot_packet.pilot_grant.expected_role_roster_ref);
  assert.deepEqual(launch.expected_project_binding_ref,
    result.pilot_packet.pilot_grant.project_binding_ref);
  assert.deepEqual(launch.expected_knowledge_view_authority_grant_ref,
    result.pilot_packet.knowledge_view_authority_grant.grant_ref);
  assert.equal(launch.expected_common_projection_bindings_fingerprint_sha256,
    nulFingerprint(COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
      result.pilot_packet.common_projection_bindings));

  // The whole launch the caller assembles canonicalises, which is what the runner re-checks.
  const assembled = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA,
    feature_state: 'off',
    mode: 'owner_frozen_manual_zero_write',
    pilot_policy_revision: AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
    knowledge_view_request: clone(result.pilot_packet.knowledge_view_request),
    knowledge_view_authority_grant: clone(result.pilot_packet.knowledge_view_authority_grant),
    ...clone(launch),
    pilot_packet_relative_locator: 'synthetic/06_validation/synthetic_run/pilot_packet.json',
  };
  assert.equal(typeof canon(assembled), 'string');

  // The Knowledge View grant names the compiled policy, so it is a new revision of the same
  // Owner decision rather than the same revision with different bytes.
  const grant = result.pilot_packet.knowledge_view_authority_grant;
  assert.deepEqual(grant.policy_ref, result.pilot_packet.role_bound_packet.policy.policy_ref);
  assert.equal(grant.grant_ref.entity_id,
    state.basePacket.knowledge_view_authority_grant.grant_ref.entity_id);
  assert.notEqual(grant.grant_ref.revision_id,
    state.basePacket.knowledge_view_authority_grant.grant_ref.revision_id);
  assert.equal(grant.project_root_path, state.paths.projectRoot);
  assert.equal(grant.grant_ref.content_id, nulFingerprint(
    PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN, {
      schema_version: grant.schema_version,
      feature_state: grant.feature_state,
      authority_ceiling: grant.authority_ceiling,
      policy_ref: grant.policy_ref,
      project_binding_ref: grant.project_binding_ref,
      project_root_path: grant.project_root_path,
      common_root_path: grant.common_root_path,
      containment_root_path: grant.containment_root_path,
      approved_common_revision_refs: grant.approved_common_revision_refs,
    },
  ));
});

// ---------------------------------------------------------------- 9. immutability

test('the result is deeply frozen and the request graph is not touched', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);
  const before = JSON.stringify(request);

  const result = generatePilotPacketFromStageRules(request);

  assert.equal(JSON.stringify(request), before);
  assertDeepFrozen(result);
  assert.throws(() => { result.receipt.counts.requirements = 99; }, TypeError);
  assert.throws(() => { result.pilot_packet.role_bound_packet.context_packet.observations.push({}); }, TypeError);

  // Mutating the caller's own graph afterwards cannot reach the emitted packet.
  request.artifact_observations[0].presence_state = PRESENCE.UNKNOWN;
  assert.equal(result.pilot_packet.role_bound_packet.context_packet.observations
    .find((row) => row.requirement_id === '090_PDR_srs').presence_state, PRESENCE.PRESENT);
});

// ---------------------------------------------------------------- 10. the receipt

test('the receipt reports what was produced, what was dropped, and no effect at all', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);
  const result = generatePilotPacketFromStageRules(clone(request));
  const receipt = result.receipt;

  assert.equal(receipt.schema_version, PILOT_PACKET_GENERATOR_SCHEMA_VERSION);
  assert.equal(receipt.deterministic, true);
  assert.equal(receipt.claim_ceiling, 'observed');
  assert.deepEqual(receipt.effects, {
    erp_writes: 0, filesystem_writes: 0, model_calls: 0, network_calls: 0, clock_reads: 0,
  });
  assert.deepEqual(Object.keys(receipt.input_digests).sort(compareCodePoints), [
    'artifact_observations', 'base_packet', 'common_binding_requirement_id',
    'engine_stage_policy_material', 'known_at', 'mapping_table', 'packet_identity_seed',
    'policy_identity',
  ]);
  for (const digest of Object.values(receipt.input_digests)) assert.match(digest, /^[0-9a-f]{64}$/u);
  for (const digest of Object.values(receipt.output_digests)) assert.match(digest, /^[0-9a-f]{64}$/u);

  // The preflight this module can honestly claim is the set of digest and partition rules it
  // reproduces; the subject's own verdict is the caller's to obtain, for the reason recorded.
  assert.equal(receipt.preflight.subject_assessment_performed, false);
  assert.equal(receipt.preflight.deferred_reason, 'subject_import_graph_is_not_pure');
  assert.ok(receipt.preflight.self_verified.includes('policy_ref_engine_digest_rule'));

  // No private locator, root path, or caller text reaches the receipt.
  const rendered = JSON.stringify(receipt);
  for (const forbidden of [state.paths.tempRoot, state.paths.projectRoot, state.paths.commonRoot,
    state.paths.containmentRoot]) {
    assert.equal(rendered.includes(forbidden), false);
  }
});

// ---------------------------------------------------------------- 11. input hardening

test('a base packet, policy material, or instant that does not hold up is refused, never repaired', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);

  const wrongSchema = clone(request);
  wrongSchema.base_packet.schema_version = 'soulforge.something_else.v0';
  assert.throws(() => generatePilotPacketFromStageRules(wrongSchema),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.BASE_PACKET_INVALID));

  const extraField = clone(request);
  extraField.base_packet.unexpected_field = 'synthetic';
  assert.throws(() => generatePilotPacketFromStageRules(extraField),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.BASE_PACKET_INVALID));

  const floatingRevision = clone(request);
  floatingRevision.engine_stage_policy_material.stages[0].requirements[0].requirement_ref
    .revision_id = 'latest';
  assert.throws(() => generatePilotPacketFromStageRules(floatingRevision),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.POLICY_MATERIAL_INVALID));

  // The request's instant is what the packet claims to know as of; nothing in it may be newer.
  const stale = clone(request);
  stale.known_at = '2026-05-01T00:00:00.000Z';
  assert.throws(() => generatePilotPacketFromStageRules(stale),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.POLICY_MATERIAL_INVALID));

  const knownBeforeValid = clone(request);
  knownBeforeValid.artifact_observations[0].valid_at = '2026-06-02T00:00:00.000Z';
  knownBeforeValid.artifact_observations[0].known_at = '2026-06-01T00:00:00.000Z';
  assert.throws(() => generatePilotPacketFromStageRules(knownBeforeValid),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.OBSERVATION_INVALID));

  const observedAfterTheRequest = clone(request);
  observedAfterTheRequest.artifact_observations[0].known_at = '2026-09-01T00:00:00.000Z';
  assert.throws(() => generatePilotPacketFromStageRules(observedAfterTheRequest),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.OBSERVATION_INVALID));

  // An artifact seen before the contract revision behind its rule was restated is ordinary, not
  // a refusal: the two instants answer different questions.
  const observedBeforeTheRequirement = clone(request);
  observedBeforeTheRequirement.artifact_observations[0].valid_at = '2026-05-01T00:00:00.000Z';
  observedBeforeTheRequirement.artifact_observations[0].known_at = '2026-05-02T00:00:00.000Z';
  assert.equal(generatePilotPacketFromStageRules(observedBeforeTheRequirement)
    .receipt.counts.observations_emitted, 5);

  const missingKey = clone(request);
  delete missingKey.policy_identity;
  assert.throws(() => generatePilotPacketFromStageRules(missingKey),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID));

  const unknownKey = { ...clone(request), unexpected_request_field: 'synthetic' };
  assert.throws(() => generatePilotPacketFromStageRules(unknownKey),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID));

  // A refusal names the field and nothing else.
  try {
    generatePilotPacketFromStageRules(floatingRevision);
    assert.fail('expected a refusal');
  } catch (error) {
    const rendered = JSON.stringify({ message: error.message, detail: error.detail });
    assert.equal(rendered.includes('latest'), false);
    assert.equal(rendered.includes(state.paths.projectRoot), false);
  }
});

test('a Proxy, an accessor, a cycle, or a custom prototype in the request fails closed', (t) => {
  const { state, request } = generatorRequest();
  t.after(state.cleanup);

  const withAccessor = clone(request);
  let getterCalls = 0;
  Object.defineProperty(withAccessor.base_packet, 'pilot_grant', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'accessor-generator-echo-marker';
    },
  });
  assert.throws(() => generatePilotPacketFromStageRules(withAccessor),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID));
  assert.equal(getterCalls, 0);

  const cyclic = clone(request);
  cyclic.base_packet.role_bound_packet.context_packet.self =
    cyclic.base_packet.role_bound_packet.context_packet;
  assert.throws(() => generatePilotPacketFromStageRules(cyclic),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID));

  const prototyped = clone(request);
  Object.setPrototypeOf(prototyped.base_packet.project_source_binding_manifest, { custom: true });
  assert.throws(() => generatePilotPacketFromStageRules(prototyped),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID));

  const sparse = clone(request);
  sparse.artifact_observations = new Array(2);
  sparse.artifact_observations[0] = clone(request.artifact_observations[0]);
  assert.throws(() => generatePilotPacketFromStageRules(sparse),
    throwsWith(PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID));

  const secretShaped = clone(request);
  secretShaped.policy_identity.revision_label = 'api_key=generator-secret-echo-marker';
  try {
    generatePilotPacketFromStageRules(secretShaped);
    assert.fail('expected a refusal');
  } catch (error) {
    assert.equal(error.code, PILOT_PACKET_GENERATOR_CODES.REQUEST_INVALID);
    assert.equal(JSON.stringify({ message: error.message, detail: error.detail })
      .includes('generator-secret-echo-marker'), false);
  }
});

// ---------------------------------------------------------------- 12. the pins

test('every restated schema version, hash domain, and custody token matches its owner', () => {
  assert.equal(AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN, AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA);
  assert.equal(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN, AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA);
  assert.equal(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN, AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA);
  assert.equal(AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA_PIN, AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA);
  assert.equal(AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA_PIN, AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA);
  assert.equal(PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_PIN, PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION);
  assert.equal(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_PIN,
    PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION);
  assert.equal(AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA_PIN, AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA);

  assert.equal(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN_PIN, AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN);
  assert.equal(AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN_PIN, AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN);
  assert.equal(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN_PIN,
    AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN);
  assert.equal(AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN_PIN,
    AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN);
  assert.equal(AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN_PIN,
    COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN);
  assert.equal(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN_PIN,
    PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN);

  assert.deepEqual([...PRESENCE_STATES_PIN].sort(compareCodePoints),
    Object.values(PRESENCE).sort(compareCodePoints));
});

// ---------------------------------------------------------------- 13. static effect pin

test('the module and everything it imports read no file, clock, network, or model', () => {
  const FORBIDDEN_TOKENS = [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:dns', 'node:child_process',
    // `node:util` is deliberately absent from this list and present in the allowlist check
    // below instead: the compiler explains in prose why it does not import it, and a text scan
    // cannot tell that sentence from a specifier. The bare-import allowlist can.
    'node:worker_threads', 'node:process', 'node:os', 'node:readline',
    'Date.now', 'new Date', 'Math.random', 'process.env', 'process.argv',
    'process.hrtime', 'performance.now', 'fetch(', 'XMLHttpRequest', 'require(',
  ];
  const ALLOWED_BARE_SPECIFIERS = new Set(['node:crypto']);

  const seen = new Map();
  const walk = (url) => {
    const href = url.href;
    if (seen.has(href)) return;
    const source = readFileSync(url, 'utf8');
    seen.set(href, source);
    for (const match of source.matchAll(/\bfrom\s+'([^']+)'/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) walk(new URL(specifier, url));
      else assert.ok(ALLOWED_BARE_SPECIFIERS.has(specifier), `unexpected bare import "${specifier}" in ${href}`);
    }
  };
  walk(MODULE_URL);

  assert.ok(seen.size >= 5, 'the import graph should include the compiler and the kernel modules');
  for (const [href, source] of seen) {
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(source.includes(token), false, `${href} must not contain "${token}"`);
    }
  }

  const entry = seen.get(MODULE_URL.href);
  assert.equal(entry.includes('import.meta.main'), false);
  assert.equal(entry.includes('process.'), false);
  // No CLI, and no write of any kind.
  assert.doesNotMatch(entry, /(?:writeFile|appendFile|mkdir|unlink|rename)\s*\(/u);
});
