import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { exactRefIdentityKey } from '../../../core/validators/identity.mjs';
import { assessAxSeRoleBoundProject } from '../evaluator/ax_se_project_role_bound_assessment.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PILOT_CODES,
  AxSeProjectContextPilotError,
  assessOwnerFrozenProjectContext,
} from '../evaluator/ax_se_project_context_pilot.mjs';

const ROLE_BOUND_FIXTURE_URL = new URL(
  '../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_role_bound_assessment_synthetic_v1.json',
  import.meta.url,
);
const ROLE_BOUND_FIXTURE = JSON.parse(readFileSync(ROLE_BOUND_FIXTURE_URL, 'utf8'));
const SUBJECT_URL = new URL('../evaluator/ax_se_project_context_pilot.mjs', import.meta.url);

const PACKET_SCHEMA = 'soulforge.ax_se_project_context_pilot_packet.v0';
const GRANT_SCHEMA = 'soulforge.ax_se_project_context_pilot_grant.v0';
const MANIFEST_SCHEMA = 'soulforge.ax_se_project_source_binding_manifest.v0';
const RESULT_SCHEMA = 'soulforge.ax_se_project_context_pilot_assessment.v0';
const GRANT_DOMAIN = 'soulforge.ax_se_project_context_pilot.grant.v0';
const MATERIAL_DOMAIN = 'soulforge.ax_se_project_context_pilot.material.v0';
const MANIFEST_DOMAIN = 'soulforge.ax_se_project_context_pilot.project_source_binding_manifest.v0';
const KNOWLEDGE_GRANT_DOMAIN = 'soulforge.project_knowledge_view.authority_grant.v0';

const clone = (value) => structuredClone(value);

function exactRef(seed) {
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
      row.forEach((child) => visit(child, `${path}[]`));
    } else if (row !== null && typeof row === 'object') {
      Object.entries(row).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
}

function fingerprint(domain, material) {
  return `sha256:${sha256Hex(`${domain}\0${canonicalise(material, arrayOrderRules(material))}`)}`;
}

function bindKnowledgeAuthorityGrant(draft) {
  const approved = clone(draft.approved_common_revision_refs).sort((left, right) => (
    compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right))
  ));
  const material = {
    schema_version: draft.schema_version,
    feature_state: draft.feature_state,
    authority_ceiling: draft.authority_ceiling,
    policy_ref: draft.policy_ref,
    project_binding_ref: draft.project_binding_ref,
    project_root_path: draft.project_root_path,
    common_root_path: draft.common_root_path,
    containment_root_path: draft.containment_root_path,
    approved_common_revision_refs: approved,
  };
  return {
    ...clone(draft),
    approved_common_revision_refs: approved,
    grant_ref: {
      ...clone(draft.grant_ref),
      content_id: fingerprint(KNOWLEDGE_GRANT_DOMAIN, material),
    },
  };
}

function bindManifest(draft) {
  const material = {
    schema_version: draft.schema_version,
    project_binding_ref: draft.project_binding_ref,
    project_material_revision_refs: draft.project_material_revision_refs,
  };
  return {
    ...clone(draft),
    manifest_ref: {
      ...clone(draft.manifest_ref),
      content_id: fingerprint(MANIFEST_DOMAIN, material),
    },
  };
}

function pilotMaterialFingerprint(packet) {
  return fingerprint(MATERIAL_DOMAIN, {
    knowledge_view_request: packet.knowledge_view_request,
    common_projection_bindings: packet.common_projection_bindings,
    project_source_binding_manifest: packet.project_source_binding_manifest,
    role_bound_packet: packet.role_bound_packet,
  });
}

function bindPilotGrant(draft) {
  const material = {
    schema_version: draft.schema_version,
    feature_state: draft.feature_state,
    authority_ceiling: draft.authority_ceiling,
    knowledge_view_authority_grant_ref: draft.knowledge_view_authority_grant_ref,
    project_binding_ref: draft.project_binding_ref,
    project_source_binding_manifest_ref: draft.project_source_binding_manifest_ref,
    pilot_material_fingerprint_sha256: draft.pilot_material_fingerprint_sha256,
    expected_role_roster_ref: draft.expected_role_roster_ref,
  };
  return {
    ...clone(draft),
    grant_ref: {
      ...clone(draft.grant_ref),
      content_id: fingerprint(GRANT_DOMAIN, material),
    },
  };
}

function refreshPilotGrant(packet) {
  packet.pilot_grant.pilot_material_fingerprint_sha256 = pilotMaterialFingerprint(packet);
  packet.pilot_grant = bindPilotGrant(packet.pilot_grant);
  return clone(packet.pilot_grant.grant_ref);
}

function refreshManifestAndPilotGrant(packet) {
  packet.project_source_binding_manifest = bindManifest(packet.project_source_binding_manifest);
  packet.pilot_grant.project_source_binding_manifest_ref = clone(
    packet.project_source_binding_manifest.manifest_ref,
  );
  return refreshPilotGrant(packet);
}

function refreshKnowledgeGrantAndPilotGrant(packet) {
  packet.knowledge_view_authority_grant = bindKnowledgeAuthorityGrant(
    packet.knowledge_view_authority_grant,
  );
  packet.pilot_grant.knowledge_view_authority_grant_ref = clone(
    packet.knowledge_view_authority_grant.grant_ref,
  );
  return refreshPilotGrant(packet);
}

function replaceSelectedCommonRevision(packet, commonRef) {
  packet.knowledge_view_request.common_revision_refs = [clone(commonRef)];
  packet.knowledge_view_authority_grant.approved_common_revision_refs = [clone(commonRef)];
  packet.common_projection_bindings[0].common_revision_ref = clone(commonRef);
  return refreshKnowledgeGrantAndPilotGrant(packet);
}

function expectPilotCode(action, code, forbidden = []) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof AxSeProjectContextPilotError);
    assert.equal(error.code, code);
    const rendered = JSON.stringify({
      name: error.name,
      code: error.code,
      message: error.message,
      detail: error.detail,
    });
    for (const marker of forbidden) assert.equal(rendered.includes(marker), false);
    return true;
  });
}

async function loadSubjectWithDelegatedViewMutation(mutationSource) {
  const sharedUrl = new URL('../../../../shared/project_knowledge_view.mjs', import.meta.url);
  const delegatedModuleSource = `
    import {
      PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION as schemaVersion,
      selectProjectKnowledgeView as selectActualProjectKnowledgeView,
    } from ${JSON.stringify(sharedUrl.href)};
    export const PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION = schemaVersion;
    export function selectProjectKnowledgeView(request, authorityGrant, expectedGrantRef) {
      const view = structuredClone(selectActualProjectKnowledgeView(
        request,
        authorityGrant,
        expectedGrantRef,
      ));
      ${mutationSource}
      return view;
    }
  `;
  const delegatedModuleUrl = `data:text/javascript;base64,${Buffer.from(
    delegatedModuleSource,
  ).toString('base64')}`;
  const subjectSource = readFileSync(SUBJECT_URL, 'utf8')
    .replace(
      "from '../../../../shared/project_knowledge_view.mjs';",
      `from '${delegatedModuleUrl}';`,
    )
    .replace(/from '(\.\.?(?:\/[^']+)+)'/gu, (_match, specifier) => (
      `from '${new URL(specifier, SUBJECT_URL).href}'`
    ));
  return import(`data:text/javascript;base64,${Buffer.from(subjectSource).toString('base64')}`);
}

function expectDelegatedPilotCode(subject, state, forbidden = []) {
  assert.throws(
    () => subject.assessOwnerFrozenProjectContext(
      state.pilotPacket,
      state.expectedPilotGrantRef,
    ),
    (error) => {
      assert.ok(error instanceof subject.AxSeProjectContextPilotError);
      assert.equal(
        error.code,
        subject.AX_SE_PROJECT_CONTEXT_PILOT_CODES.KNOWLEDGE_VIEW_REFUSED,
      );
      const rendered = JSON.stringify({
        name: error.name,
        code: error.code,
        message: error.message,
        detail: error.detail,
      });
      for (const marker of forbidden) assert.equal(rendered.includes(marker), false);
      return true;
    },
  );
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function projectMaterialRefs(roleBoundPacket, commonRequirementRefs) {
  const refs = [clone(roleBoundPacket.context_packet.objective_ref)];
  for (const observation of roleBoundPacket.context_packet.observations) {
    refs.push(clone(observation.artifact_revision_ref), ...clone(observation.evidence_refs));
    for (const claim of observation.conflict_claims ?? []) {
      refs.push(clone(claim.source_revision_ref));
    }
  }
  for (const risk of roleBoundPacket.context_packet.risks) {
    refs.push(clone(risk.risk_ref), ...clone(risk.evidence_refs));
  }
  refs.push(...clone(roleBoundPacket.role_roster_packet.source_revision_refs));
  refs.push(clone(roleBoundPacket.policy_capability_vocabulary_ref));
  for (const stage of roleBoundPacket.policy.stages) {
    for (const requirement of stage.requirements) {
      if (!commonRequirementRefs.has(exactRefIdentityKey(requirement.requirement_ref))) {
        refs.push(clone(requirement.requirement_ref));
      }
    }
  }
  const unique = new Map(refs.map((ref) => [exactRefIdentityKey(ref), ref]));
  return [...unique.values()].sort((left, right) => (
    compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right))
  ));
}

function policyRequirementRefs(roleBoundPacket) {
  return roleBoundPacket.policy.stages.flatMap(
    (stage) => stage.requirements.map((requirement) => clone(requirement.requirement_ref)),
  );
}

function sortCommonBindings(bindings) {
  bindings.sort((left, right) => compareCodePoints(
    `${exactRefIdentityKey(left.common_revision_ref)}\0${exactRefIdentityKey(left.policy_requirement_ref)}`,
    `${exactRefIdentityKey(right.common_revision_ref)}\0${exactRefIdentityKey(right.policy_requirement_ref)}`,
  ));
}

function reclassifyProjectManifest(packet) {
  const commonRequirementRefs = new Set(
    packet.common_projection_bindings.map((row) => exactRefIdentityKey(row.policy_requirement_ref)),
  );
  packet.project_source_binding_manifest.project_material_revision_refs = projectMaterialRefs(
    packet.role_bound_packet,
    commonRequirementRefs,
  );
  return refreshManifestAndPilotGrant(packet);
}

function fixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'soulforge-ax-se-pilot-'));
  const containmentRoot = join(tempRoot, 'workspace');
  const projectRoot = join(containmentRoot, 'project');
  const commonRoot = join(containmentRoot, 'common');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  const roleBoundPacket = clone(ROLE_BOUND_FIXTURE.packet);
  const expectedRoleRosterRef = clone(ROLE_BOUND_FIXTURE.expected_role_roster_ref);
  const projectRef = clone(roleBoundPacket.expected_project_binding_ref);
  const policyRef = clone(roleBoundPacket.policy.policy_ref);
  const commonRef = exactRef(901);
  const commonRequirementRef = clone(
    roleBoundPacket.policy.stages[0].requirements[1].requirement_ref,
  );
  const knowledgeViewRequest = {
    schema_version: 'soulforge.project_knowledge_view_request.v0',
    feature_state: 'off',
    project_binding_refs: [clone(projectRef)],
    common_revision_refs: [clone(commonRef)],
  };
  const knowledgeViewAuthorityGrant = bindKnowledgeAuthorityGrant({
    schema_version: 'soulforge.project_knowledge_view_authority_grant.v0',
    feature_state: 'off',
    authority_ceiling: 'synthetic_validation_only',
    grant_ref: exactRef(902),
    policy_ref: clone(policyRef),
    project_binding_ref: clone(projectRef),
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: [clone(commonRef)],
  });
  const commonProjectionBindings = [{
    common_revision_ref: clone(commonRef),
    policy_requirement_ref: clone(commonRequirementRef),
  }];
  const commonRequirementKeys = new Set([exactRefIdentityKey(commonRequirementRef)]);
  const manifest = bindManifest({
    schema_version: MANIFEST_SCHEMA,
    manifest_ref: exactRef(903),
    project_binding_ref: clone(projectRef),
    project_material_revision_refs: projectMaterialRefs(
      roleBoundPacket,
      commonRequirementKeys,
    ),
  });
  const packetDraft = {
    schema_version: PACKET_SCHEMA,
    feature_state: 'off',
    knowledge_view_request: knowledgeViewRequest,
    knowledge_view_authority_grant: knowledgeViewAuthorityGrant,
    common_projection_bindings: commonProjectionBindings,
    project_source_binding_manifest: manifest,
    role_bound_packet: roleBoundPacket,
  };
  const pilotGrant = bindPilotGrant({
    schema_version: GRANT_SCHEMA,
    feature_state: 'off',
    authority_ceiling: 'owner_frozen_manual_zero_write',
    grant_ref: exactRef(904),
    knowledge_view_authority_grant_ref: clone(knowledgeViewAuthorityGrant.grant_ref),
    project_binding_ref: clone(projectRef),
    project_source_binding_manifest_ref: clone(manifest.manifest_ref),
    pilot_material_fingerprint_sha256: pilotMaterialFingerprint(packetDraft),
    expected_role_roster_ref: clone(expectedRoleRosterRef),
  });
  const pilotPacket = {
    ...packetDraft,
    pilot_grant: pilotGrant,
  };
  return {
    pilotPacket,
    expectedPilotGrantRef: clone(pilotGrant.grant_ref),
    paths: { tempRoot, containmentRoot, projectRoot, commonRoot },
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

test('an Owner-frozen one-project packet composes the unchanged role-bound assessment with zero authority', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  const before = JSON.stringify(state.pilotPacket);
  const expectedRoleBound = assessAxSeRoleBoundProject(
    clone(state.pilotPacket.role_bound_packet),
    clone(state.pilotPacket.pilot_grant.expected_role_roster_ref),
  );

  const result = assessOwnerFrozenProjectContext(
    state.pilotPacket,
    state.expectedPilotGrantRef,
  );

  assert.equal(result.schema_version, RESULT_SCHEMA);
  assert.equal(result.feature_state, 'off');
  assert.equal(result.mode, 'owner_frozen_manual_zero_write');
  assert.equal(result.claim_ceiling, 'observed');
  assert.equal(result.knowledge_view.common_revision_count, 1);
  assert.equal(result.knowledge_view.common_projection_binding_count, 1);
  assert.equal(result.project_source_binding.project_material_revision_count, 12);
  assert.equal(result.project_source_binding.manifest_binding_verified, true);
  assert.equal(result.current_stage_code, '030_SRR');
  assert.deepEqual(
    result.role_bound_assessment.next_mission_candidates.map((row) => row.mission_kind),
    ['disposition_open_risk', 'close_confirmed_gap'],
  );
  assert.deepEqual(result.role_bound_assessment, expectedRoleBound);
  assert.equal(JSON.stringify(state.pilotPacket), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.role_bound_assessment), true);
  assert.equal(result.authority.candidate_only, true);
  assert.equal(
    Object.entries(result.authority)
      .filter(([key]) => key !== 'candidate_only')
      .every(([, value]) => value === false),
    true,
  );
  assert.equal(Object.values(result.gates).every((value) => value === false), true);
  assert.equal(Object.values(result.effects).every((value) => value === 0), true);
  assert.doesNotMatch(
    JSON.stringify(result),
    /(?:local_path|commitment|admission_fingerprint|project_root_path|common_root_path|containment_root_path)/u,
  );
});

test('delegated Knowledge View authority refs must be exact, bound, and never echoed', async (t) => {
  const cases = [
    {
      marker: 'delegated-wrong-authority-marker',
      mutation: `view.authority_grant_ref = {
        ...view.authority_grant_ref,
        entity_id: 'delegated-wrong-authority-marker',
      };`,
    },
    {
      marker: 'delegated-extra-ref-marker',
      mutation: `view.authority_grant_ref = {
        ...view.authority_grant_ref,
        delegated_nested_marker: 'delegated-extra-ref-marker',
      };`,
    },
  ];

  for (const entry of cases) {
    const subject = await loadSubjectWithDelegatedViewMutation(entry.mutation);
    const state = fixture();
    t.after(state.cleanup);
    expectDelegatedPilotCode(subject, state, [entry.marker]);
  }
});

test('delegated project, policy, and common refs must keep the exact reference shape', async (t) => {
  const cases = [
    {
      marker: 'delegated-project-ref-marker',
      mutation: `view.project_binding_ref = {
        ...view.project_binding_ref,
        delegated_nested_marker: 'delegated-project-ref-marker',
      };`,
    },
    {
      marker: 'delegated-policy-ref-marker',
      mutation: `view.policy_ref = {
        ...view.policy_ref,
        delegated_nested_marker: 'delegated-policy-ref-marker',
      };`,
    },
    {
      marker: 'delegated-common-ref-marker',
      mutation: `view.common_revision_refs[0] = {
        ...view.common_revision_refs[0],
        delegated_nested_marker: 'delegated-common-ref-marker',
      };`,
    },
    {
      marker: 'delegated-common-array-marker',
      mutation: `view.common_revision_refs = {
        0: view.common_revision_refs[0],
        length: 1,
        delegated_array_marker: 'delegated-common-array-marker',
      };`,
    },
  ];

  for (const entry of cases) {
    const subject = await loadSubjectWithDelegatedViewMutation(entry.mutation);
    const state = fixture();
    t.after(state.cleanup);
    expectDelegatedPilotCode(subject, state, [entry.marker]);
  }
});

test('a delegated Knowledge View cannot echo an arbitrary scope fingerprint', async (t) => {
  const marker = 'delegated-fingerprint-echo-marker';
  const subject = await loadSubjectWithDelegatedViewMutation(
    `view.knowledge_scope_fingerprint_sha256 = '${marker}';`,
  );
  const state = fixture();
  t.after(state.cleanup);

  expectDelegatedPilotCode(subject, state, [marker]);
});

test('a wrong external pilot grant is refused before missing roots can be probed and is never echoed', () => {
  const state = fixture();
  const wrongExpected = clone(state.expectedPilotGrantRef);
  wrongExpected.entity_id = 'foreign-pilot-grant-echo-marker';
  state.cleanup();

  expectPilotCode(
    () => assessOwnerFrozenProjectContext(state.pilotPacket, wrongExpected),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
    [
      'foreign-pilot-grant-echo-marker',
      state.paths.projectRoot,
      state.paths.commonRoot,
      state.paths.containmentRoot,
    ],
  );
});

test('pilot grant content and frozen material tampering fail before missing roots are probed', () => {
  const grantState = fixture();
  grantState.pilotPacket.pilot_grant.grant_ref.content_id = `sha256:${'f'.repeat(64)}`;
  const tamperedGrantPin = clone(grantState.pilotPacket.pilot_grant.grant_ref);
  grantState.cleanup();
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(grantState.pilotPacket, tamperedGrantPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
    [grantState.paths.projectRoot],
  );

  const materialState = fixture();
  materialState.pilotPacket.role_bound_packet.context_packet.risks[0].severity = 'critical';
  materialState.cleanup();
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(
      materialState.pilotPacket,
      materialState.expectedPilotGrantRef,
    ),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
    [materialState.paths.projectRoot],
  );
});

test('the project-source manifest self-hash and the transitively pinned manifest ref are exact', (t) => {
  const selfHashState = fixture();
  t.after(selfHashState.cleanup);
  selfHashState.pilotPacket.project_source_binding_manifest.manifest_ref.content_id =
    `sha256:${'e'.repeat(64)}`;
  selfHashState.pilotPacket.pilot_grant.project_source_binding_manifest_ref = clone(
    selfHashState.pilotPacket.project_source_binding_manifest.manifest_ref,
  );
  const selfHashPin = refreshPilotGrant(selfHashState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(selfHashState.pilotPacket, selfHashPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );

  const refState = fixture();
  t.after(refState.cleanup);
  refState.pilotPacket.pilot_grant.project_source_binding_manifest_ref = exactRef(991);
  const refPin = refreshPilotGrant(refState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(refState.pilotPacket, refPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
  );
});

test('the project-source manifest refuses both extra and missing project material refs', (t) => {
  const extraState = fixture();
  t.after(extraState.cleanup);
  extraState.pilotPacket.project_source_binding_manifest.project_material_revision_refs.push(
    exactRef(992),
  );
  extraState.pilotPacket.project_source_binding_manifest.project_material_revision_refs.sort(
    (left, right) => compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right)),
  );
  const extraPin = refreshManifestAndPilotGrant(extraState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(extraState.pilotPacket, extraPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );

  const missingState = fixture();
  t.after(missingState.cleanup);
  missingState.pilotPacket.project_source_binding_manifest.project_material_revision_refs.pop();
  const missingPin = refreshManifestAndPilotGrant(missingState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(missingState.pilotPacket, missingPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );
});

test('common projection bindings refuse missing, extra, and duplicate rows', (t) => {
  const missingState = fixture();
  t.after(missingState.cleanup);
  missingState.pilotPacket.common_projection_bindings = [];
  const missingPin = refreshPilotGrant(missingState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(missingState.pilotPacket, missingPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );

  const extraState = fixture();
  t.after(extraState.cleanup);
  extraState.pilotPacket.common_projection_bindings.push({
    common_revision_ref: exactRef(993),
    policy_requirement_ref: policyRequirementRefs(extraState.pilotPacket.role_bound_packet)[2],
  });
  sortCommonBindings(extraState.pilotPacket.common_projection_bindings);
  const extraPin = refreshPilotGrant(extraState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(extraState.pilotPacket, extraPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );

  const duplicateState = fixture();
  t.after(duplicateState.cleanup);
  duplicateState.pilotPacket.common_projection_bindings.push(clone(
    duplicateState.pilotPacket.common_projection_bindings[0],
  ));
  sortCommonBindings(duplicateState.pilotPacket.common_projection_bindings);
  const duplicatePin = refreshPilotGrant(duplicateState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(duplicateState.pilotPacket, duplicatePin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );
});

test('a common projection must name an exact policy requirement ref', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  state.pilotPacket.common_projection_bindings[0].policy_requirement_ref = exactRef(994);
  const pin = refreshPilotGrant(state.pilotPacket);

  expectPilotCode(
    () => assessOwnerFrozenProjectContext(state.pilotPacket, pin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );
});

test('common projection bindings are one-to-one and refuse conflicting remaps', (t) => {
  const oneCommonState = fixture();
  t.after(oneCommonState.cleanup);
  const requirements = policyRequirementRefs(oneCommonState.pilotPacket.role_bound_packet);
  oneCommonState.pilotPacket.common_projection_bindings.push({
    common_revision_ref: clone(
      oneCommonState.pilotPacket.common_projection_bindings[0].common_revision_ref,
    ),
    policy_requirement_ref: clone(requirements[2]),
  });
  sortCommonBindings(oneCommonState.pilotPacket.common_projection_bindings);
  const oneCommonPin = reclassifyProjectManifest(oneCommonState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(oneCommonState.pilotPacket, oneCommonPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );

  const oneRequirementState = fixture();
  t.after(oneRequirementState.cleanup);
  const additionalCommon = exactRef(995);
  oneRequirementState.pilotPacket.knowledge_view_request.common_revision_refs.push(
    clone(additionalCommon),
  );
  oneRequirementState.pilotPacket.knowledge_view_request.common_revision_refs.sort(
    (left, right) => compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right)),
  );
  oneRequirementState.pilotPacket.knowledge_view_authority_grant
    .approved_common_revision_refs.push(clone(additionalCommon));
  oneRequirementState.pilotPacket.knowledge_view_authority_grant
    .approved_common_revision_refs.sort(
      (left, right) => compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right)),
    );
  oneRequirementState.pilotPacket.common_projection_bindings.push({
    common_revision_ref: clone(additionalCommon),
    policy_requirement_ref: clone(
      oneRequirementState.pilotPacket.common_projection_bindings[0].policy_requirement_ref,
    ),
  });
  sortCommonBindings(oneRequirementState.pilotPacket.common_projection_bindings);
  const oneRequirementPin = refreshKnowledgeGrantAndPilotGrant(
    oneRequirementState.pilotPacket,
  );
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(oneRequirementState.pilotPacket, oneRequirementPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
  );
});

test('project material and selected common revisions refuse exact, logical, and entity overlap', (t) => {
  const baseline = fixture();
  const projectMaterialRef = clone(
    baseline.pilotPacket.role_bound_packet.context_packet.objective_ref,
  );
  baseline.cleanup();
  const cases = [
    projectMaterialRef,
    {
      ...clone(projectMaterialRef),
      content_id: `sha256:${'d'.repeat(64)}`,
    },
    {
      ...clone(projectMaterialRef),
      revision_id: 'synthetic-objective-common-conflict-r2',
      content_id: `sha256:${'c'.repeat(64)}`,
    },
  ];

  for (const commonRef of cases) {
    const state = fixture();
    t.after(state.cleanup);
    const pin = replaceSelectedCommonRevision(state.pilotPacket, commonRef);
    expectPilotCode(
      () => assessOwnerFrozenProjectContext(state.pilotPacket, pin),
      AX_SE_PROJECT_CONTEXT_PILOT_CODES.SOURCE_BINDING_REFUSED,
    );
  }
});

test('project binding equality is exact across context, roster, and source manifest', (t) => {
  const cases = [
    {
      mutate(packet) {
        packet.role_bound_packet.context_packet.project_binding_ref = exactRef(996);
      },
      rebind: refreshPilotGrant,
    },
    {
      mutate(packet) {
        packet.role_bound_packet.role_roster_packet.project_binding_ref = exactRef(997);
      },
      rebind: refreshPilotGrant,
    },
    {
      mutate(packet) {
        packet.project_source_binding_manifest.project_binding_ref = exactRef(998);
      },
      rebind: refreshManifestAndPilotGrant,
    },
  ];

  for (const entry of cases) {
    const state = fixture();
    t.after(state.cleanup);
    entry.mutate(state.pilotPacket);
    const pin = entry.rebind(state.pilotPacket);
    expectPilotCode(
      () => assessOwnerFrozenProjectContext(state.pilotPacket, pin),
      AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED,
    );
  }
});

test('policy equality is exact across the Knowledge View grant, context, and role policy', (t) => {
  const contextState = fixture();
  t.after(contextState.cleanup);
  contextState.pilotPacket.role_bound_packet.context_packet.policy_ref = exactRef(999);
  const contextPin = refreshPilotGrant(contextState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(contextState.pilotPacket, contextPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED,
  );

  const viewState = fixture();
  t.after(viewState.cleanup);
  viewState.pilotPacket.knowledge_view_authority_grant.policy_ref = exactRef(1000);
  const viewPin = refreshKnowledgeGrantAndPilotGrant(viewState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(viewState.pilotPacket, viewPin),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.MATERIAL_REFUSED,
  );
});

test('a Proxy is refused before any trap can inspect the pilot packet', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  let trapCalls = 0;
  const proxy = new Proxy(state.pilotPacket, {
    get(target, key, receiver) {
      trapCalls += 1;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      trapCalls += 1;
      return Reflect.ownKeys(target);
    },
  });

  expectPilotCode(
    () => assessOwnerFrozenProjectContext(proxy, state.expectedPilotGrantRef),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED,
  );
  assert.equal(trapCalls, 0);
});

test('accessors are refused without invocation or value echo', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  let getterCalls = 0;
  Object.defineProperty(state.pilotPacket.pilot_grant, 'grant_ref', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'accessor-pilot-echo-marker';
    },
  });

  expectPilotCode(
    () => assessOwnerFrozenProjectContext(
      state.pilotPacket,
      state.expectedPilotGrantRef,
    ),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED,
    ['accessor-pilot-echo-marker'],
  );
  assert.equal(getterCalls, 0);
});

test('aliases, cycles, custom prototypes, sparse arrays, and oversized arrays fail closed', (t) => {
  const cases = [
    (packet) => {
      packet.project_source_binding_manifest.project_binding_ref =
        packet.pilot_grant.project_binding_ref;
    },
    (packet) => {
      packet.role_bound_packet.context_packet.self = packet.role_bound_packet.context_packet;
    },
    (packet) => {
      Object.setPrototypeOf(packet.project_source_binding_manifest, { custom: true });
    },
    (packet) => {
      const sparse = new Array(2);
      sparse[0] = clone(packet.common_projection_bindings[0]);
      packet.common_projection_bindings = sparse;
    },
    (packet) => {
      packet.knowledge_view_request.common_revision_refs = Array.from(
        { length: 513 },
        (_, index) => exactRef(2000 + index),
      );
    },
  ];

  for (const mutate of cases) {
    const state = fixture();
    t.after(state.cleanup);
    mutate(state.pilotPacket);
    expectPilotCode(
      () => assessOwnerFrozenProjectContext(
        state.pilotPacket,
        state.expectedPilotGrantRef,
      ),
      AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED,
    );
  }
});

test('secret-shaped input is refused without echo', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  state.pilotPacket.role_bound_packet.role_roster_packet
    .role_roster_identity.entity_id = 'api_key=pilot-secret-echo-marker';

  expectPilotCode(
    () => assessOwnerFrozenProjectContext(
      state.pilotPacket,
      state.expectedPilotGrantRef,
    ),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.INPUT_REFUSED,
    ['pilot-secret-echo-marker'],
  );
});

test('pilot-owned exact refs refuse locator-shaped identifiers and non-immutable revisions', (t) => {
  const pathState = fixture();
  t.after(pathState.cleanup);
  const pathMarker = ['Z:', 'synthetic', 'pilot-grant-marker'].join(String.fromCharCode(92));
  pathState.pilotPacket.pilot_grant.grant_ref.entity_id = pathMarker;
  const pathExpected = refreshPilotGrant(pathState.pilotPacket);
  expectPilotCode(
    () => assessOwnerFrozenProjectContext(pathState.pilotPacket, pathExpected),
    AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
    [pathMarker],
  );

  for (const locatorMarker of [
    ['C', 'opaque-marker'].join(':'),
    ['http', 'opaque.example'].join(':'),
  ]) {
    const locatorState = fixture();
    t.after(locatorState.cleanup);
    locatorState.pilotPacket.pilot_grant.grant_ref.entity_id = locatorMarker;
    const locatorExpected = refreshPilotGrant(locatorState.pilotPacket);
    expectPilotCode(
      () => assessOwnerFrozenProjectContext(locatorState.pilotPacket, locatorExpected),
      AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
      [locatorMarker],
    );
  }

  for (const revisionMarker of ['latest', 'main', '1.2.x']) {
    const revisionState = fixture();
    t.after(revisionState.cleanup);
    revisionState.pilotPacket.project_source_binding_manifest.manifest_ref.revision_id =
      revisionMarker;
    const revisionExpected = refreshManifestAndPilotGrant(revisionState.pilotPacket);
    expectPilotCode(
      () => assessOwnerFrozenProjectContext(revisionState.pilotPacket, revisionExpected),
      AX_SE_PROJECT_CONTEXT_PILOT_CODES.GRANT_REFUSED,
      [revisionMarker],
    );
  }
});

test('the caller packet stays immutable and the complete result graph is deeply frozen', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  const before = clone(state.pilotPacket);

  const result = assessOwnerFrozenProjectContext(
    state.pilotPacket,
    state.expectedPilotGrantRef,
  );

  assert.deepEqual(state.pilotPacket, before);
  assertDeepFrozen(result);
  assert.throws(() => {
    result.status = 'mutated';
  }, TypeError);
});

test('the result omits local paths, local commitments, secrets, and source-body claims', (t) => {
  const state = fixture();
  t.after(state.cleanup);
  const result = assessOwnerFrozenProjectContext(
    state.pilotPacket,
    state.expectedPilotGrantRef,
  );
  const rendered = JSON.stringify(result);

  for (const forbidden of [
    state.paths.tempRoot,
    state.paths.containmentRoot,
    state.paths.projectRoot,
    state.paths.commonRoot,
    'project_root_local_path_commitment_sha256',
    'common_root_commitment',
    'local_admission_fingerprint_sha256',
    'pilot-secret-echo-marker',
  ]) assert.equal(rendered.includes(forbidden), false);
  assert.equal(result.knowledge_view.body_loaded, false);
  assert.equal(result.knowledge_view.retrieval_performed, false);
  assert.equal(result.knowledge_view.enumeration_performed, false);
  assert.equal(result.knowledge_view.foreign_lookup_performed, false);
  assert.equal(result.project_source_binding.source_bodies_opened, false);
  assert.equal(result.project_source_binding.source_content_membership_verified, false);
  assert.equal(result.project_source_binding.source_truth_validated, false);
  assert.equal(result.project_source_binding.freshness_validated, false);
  assert.equal(result.project_source_binding.terminal_provenance_validated, false);
  assert.equal(result.authority.candidate_only, true);
  assert.equal(
    Object.entries(result.authority)
      .filter(([key]) => key !== 'candidate_only')
      .every(([, value]) => value === false),
    true,
  );
  assert.equal(Object.values(result.gates).every((value) => value === false), true);
  assert.equal(Object.values(result.effects).every((value) => value === 0), true);
});

test('the pure composition has no execution adapter and preserves predecessor subject and runner bytes', () => {
  const source = readFileSync(SUBJECT_URL, 'utf8');
  assert.match(
    source,
    /PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION,[\s\S]*selectProjectKnowledgeView,[\s\S]*from '\.\.\/\.\.\/\.\.\/\.\.\/shared\/project_knowledge_view\.mjs';/u,
  );
  assert.match(
    source,
    /assessAxSeRoleBoundProject,[\s\S]*from '\.\/ax_se_project_role_bound_assessment\.mjs';/u,
  );
  assert.doesNotMatch(source, /from ['"]node:(?:fs|http|https|net|tls|child_process)/u);
  assert.doesNotMatch(source, /(?:writeFile|appendFile|mkdir|unlink|rename|fetch)\s*\(/u);

  const digest = (url) => createHash('sha256').update(readFileSync(url)).digest('hex');
  assert.equal(
    digest(new URL('../evaluator/ax_se_project_role_bound_assessment.mjs', import.meta.url)),
    '481c3482b79b49607aa676906c005c28df4fa078c1e1004d15e4ba31f5183b10',
  );
  assert.equal(
    digest(new URL('../tools/ax_se_project_role_bound_assessment_runner.mjs', import.meta.url)),
    'e6ffd56f95b1835286a84a5642f83b934e60e5cfa86cb1d32fe051f3926b84fd',
  );
  assert.equal(
    digest(new URL('../../../../shared/project_knowledge_view.mjs', import.meta.url)),
    '33f47c53dfa6903d3ba026f69da0fabc551a50e9dee92fc50f30b41d8abe0011',
  );
  assert.equal(
    digest(new URL('../../../../shared/knowledge_root_resolver.mjs', import.meta.url)),
    'ce043c6e00b5e0fa9fd5e9b0d39494592a95a3bd2dbd5289756869f49eab6806',
  );
});
