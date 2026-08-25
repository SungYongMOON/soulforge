import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ARTIFACT_OBSERVATION_ERROR_CODES,
  ArtifactObservationBuildError,
  buildArtifactObservationsFromConfirmed,
} from '../observation/artifact_observations_from_confirmed.mjs';
import { buildArtifactObservationCandidates } from '../observation/artifact_observation_candidates.mjs';
import { applyConfirmationSheet } from '../observation/observation_confirmation_sheet.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../rules/artifact_vocabulary.mjs';
import { compileStageRules } from '../rules/stage_rule_compiler.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN_PIN,
  AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN_PIN,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN_PIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_PIN,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_PIN,
  generatePilotPacketFromStageRules,
} from '../rules/pilot_packet_generator.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { exactRefIdentityKey } from '../../../core/validators/identity.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

const OBSERVATION_FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json',
  import.meta.url,
), 'utf8'));
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

const NUL = '\u0000';
const KNOWN_AT = '2026-08-18T00:00:00.000Z';
const clone = (value) => structuredClone(value);

// The observation modules only ever see the request's `known_at`, so the fixture and this suite
// speak as of the same instant.
const observationRequest = () => ({ ...clone(OBSERVATION_FIXTURE.request), vocabulary: ARTIFACT_VOCABULARY_V0 });

function confirmedFromFixture(extraDecisions = []) {
  const candidates = buildArtifactObservationCandidates(observationRequest()).candidates;
  const decisions = extraDecisions.map(({ endsWith, ...rest }) => {
    const row = candidates.find((candidate) => candidate.file_ref.endsWith(endsWith));
    assert.ok(row !== undefined, `no candidate ends with ${endsWith}`);
    return { candidate_id: row.candidate_id, ...rest };
  });
  return applyConfirmationSheet(candidates, decisions);
}

// ---------------------------------------------------------------- 1. shape and determinism

test('an observation carries exactly the fields the generator declares, and nothing else', () => {
  const applied = confirmedFromFixture();
  const { artifact_observations: observations } = buildArtifactObservationsFromConfirmed({
    confirmed: applied.confirmed,
    inventory: OBSERVATION_FIXTURE.request.inventory,
    known_at: KNOWN_AT,
  });
  assert.equal(observations.length, OBSERVATION_FIXTURE.expected.confirmed_run.artifact_observations);
  for (const row of observations) {
    assert.deepEqual(Object.keys(row).sort(compareCodePoints), [
      'artifact_revision_ref', 'artifact_type_id', 'evidence_refs', 'known_at',
      'observation_attempt_ref', 'observation_id', 'presence_state', 'valid_at',
    ]);
    assert.equal(row.presence_state, 'present');
    assert.match(row.observation_id, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u);
    assert.match(row.observation_attempt_ref, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u);
    assert.match(row.artifact_revision_ref.content_id, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(row.artifact_revision_ref.content_hash_alg, 'sha256');
    for (const ref of [row.artifact_revision_ref, ...row.evidence_refs]) {
      assert.match(ref.entity_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
      assert.match(ref.revision_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
    }
    assert.ok(row.evidence_refs.length >= 1);
    assert.equal(row.known_at, KNOWN_AT);
    assert.ok(compareCodePoints(row.valid_at, row.known_at) <= 0);
  }
});

test('no file path or file name travels into an observation', () => {
  const applied = confirmedFromFixture();
  const built = buildArtifactObservationsFromConfirmed({
    confirmed: applied.confirmed,
    inventory: OBSERVATION_FIXTURE.request.inventory,
    known_at: KNOWN_AT,
  });
  const rendered = JSON.stringify(built.artifact_observations);
  for (const row of OBSERVATION_FIXTURE.request.inventory) {
    assert.equal(rendered.includes(row.name), false, row.name);
  }
});

test('two runs over one confirmed set reach byte-identical observations', () => {
  const applied = confirmedFromFixture();
  const request = {
    confirmed: applied.confirmed,
    inventory: OBSERVATION_FIXTURE.request.inventory,
    known_at: KNOWN_AT,
  };
  const first = buildArtifactObservationsFromConfirmed(request);
  const second = buildArtifactObservationsFromConfirmed({
    ...request, confirmed: [...applied.confirmed].reverse(),
  });
  assert.equal(JSON.stringify(second.artifact_observations),
    JSON.stringify(first.artifact_observations));
  assert.equal(second.receipt.output_digests.artifact_observations,
    first.receipt.output_digests.artifact_observations);
  for (const value of Object.values(first.receipt.effects)) assert.equal(value, 0);
});

// ---------------------------------------------------------------- 2. one observation per pair

test('several confirmed files for one pair leave one observation and a superseded record', () => {
  const applied = confirmedFromFixture([
    { endsWith: 'synthetic_icd_draft.docx', decision: 'confirm' },
  ]);
  const expected = OBSERVATION_FIXTURE.expected.owner_confirmed_run;
  assert.equal(applied.confirmed.length, expected.confirmed);

  const built = buildArtifactObservationsFromConfirmed({
    confirmed: applied.confirmed,
    inventory: OBSERVATION_FIXTURE.request.inventory,
    known_at: KNOWN_AT,
  });
  assert.equal(built.artifact_observations.length, expected.artifact_observations);
  assert.equal(built.receipt.counts.superseded_pairs, expected.superseded_pairs);
  assert.equal(built.receipt.counts.superseded_files, expected.superseded_files);

  const record = built.superseded.find((row) => row.artifact_type_id === 'icd');
  assert.ok(record !== undefined, 'the confirmed ICD draft should fall behind the issued one');
  assert.equal(record.chosen.maturity, 'final');
  assert.equal(record.superseded_refs[0].maturity, 'preliminary');
  // The winner is the one the observation actually cites.
  const icd = built.artifact_observations.find((row) => row.artifact_type_id === 'icd');
  const winner = OBSERVATION_FIXTURE.request.inventory.find(
    (row) => row.file_ref === record.chosen.file_ref,
  );
  assert.equal(icd.artifact_revision_ref.content_id, `sha256:${winner.sha256}`);
});

test('the newest file wins when two carry the same maturity', () => {
  const inventory = [
    {
      file_ref: '120_CDR/12001_pci/03_Out/older.pdf',
      name: 'older.pdf',
      ext: 'pdf',
      bytes: 10,
      sha256: 'a'.repeat(64),
      mtime_iso: '2026-01-01T00:00:00.000Z',
    },
    {
      file_ref: '120_CDR/12001_pci/03_Out/newer.pdf',
      name: 'newer.pdf',
      ext: 'pdf',
      bytes: 10,
      sha256: 'b'.repeat(64),
      mtime_iso: '2026-02-01T00:00:00.000Z',
    },
  ];
  const confirmed = inventory.map((row) => ({
    candidate_id: row.sha256.slice(0, 8),
    file_ref: row.file_ref,
    stage_code: '120_CDR',
    artifact_type_id: 'pci',
    maturity: 'final',
  }));
  const built = buildArtifactObservationsFromConfirmed({ confirmed, inventory, known_at: KNOWN_AT });
  assert.equal(built.artifact_observations.length, 1);
  assert.equal(built.artifact_observations[0].artifact_revision_ref.content_id, `sha256:${'b'.repeat(64)}`);
  assert.equal(built.superseded[0].superseded_refs[0].file_ref, '120_CDR/12001_pci/03_Out/older.pdf');
});

test('a file dated after the instant the request speaks as of is read as of that instant', () => {
  const inventory = [{
    file_ref: '120_CDR/12001_pci/03_Out/from_the_future.pdf',
    name: 'from_the_future.pdf',
    ext: 'pdf',
    bytes: 10,
    sha256: 'c'.repeat(64),
    mtime_iso: '2099-01-01T00:00:00.000Z',
  }];
  const built = buildArtifactObservationsFromConfirmed({
    confirmed: [{
      candidate_id: 'future', file_ref: inventory[0].file_ref, stage_code: '120_CDR',
      artifact_type_id: 'pci', maturity: null,
    }],
    inventory,
    known_at: KNOWN_AT,
  });
  assert.equal(built.artifact_observations[0].valid_at, KNOWN_AT);
});

test('a stage filter keeps only the stages the caller compiled', () => {
  const applied = confirmedFromFixture();
  const built = buildArtifactObservationsFromConfirmed({
    confirmed: applied.confirmed,
    inventory: OBSERVATION_FIXTURE.request.inventory,
    known_at: KNOWN_AT,
    target_stage_codes: ['090_PDR'],
  });
  assert.equal(built.artifact_observations.length, 0);
});

test('a confirmed row the inventory does not carry is refused', () => {
  assert.throws(() => buildArtifactObservationsFromConfirmed({
    confirmed: [{
      candidate_id: 'x', file_ref: 'nowhere/at/all.pdf', stage_code: '120_CDR',
      artifact_type_id: 'pci', maturity: null,
    }],
    inventory: [],
    known_at: KNOWN_AT,
  }), (error) => {
    assert.ok(error instanceof ArtifactObservationBuildError);
    assert.equal(error.code, ARTIFACT_OBSERVATION_ERROR_CODES.CONFIRMED_INVALID);
    return true;
  });
});

// ---------------------------------------------------------------- 3. the generator accepts them
//
// The base packet below is built the way the generator's own test builds one, from the same
// public-synthetic role-bound fixture, so "the generator accepts these observations" is checked
// against the real seam rather than against a restatement of it.

const arrayOrderRules = (value) => {
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
};
const canon = (value) => canonicalise(value, arrayOrderRules(value));
const nulFingerprint = (domain, value) => `sha256:${sha256Hex(`${domain}${NUL}${canon(value)}`)}`;
const sortRefs = (refs) => [...refs].sort((left, right) => compareCodePoints(
  exactRefIdentityKey(left), exactRefIdentityKey(right),
));
const syntheticRef = (seed) => {
  const token = String(seed).padStart(12, '0');
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${String(seed).padStart(64, '0')}`,
    content_hash_alg: 'sha256',
  };
};

function projectMaterialRefs(rolePacket, commonRequirementKeys) {
  const refs = [clone(rolePacket.context_packet.objective_ref)];
  for (const observation of rolePacket.context_packet.observations) {
    refs.push(clone(observation.artifact_revision_ref), ...clone(observation.evidence_refs));
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
  const tempRoot = mkdtempSync(join(tmpdir(), 'soulforge-observation-'));
  const containmentRoot = join(tempRoot, 'workspace');
  const projectRoot = join(containmentRoot, 'project');
  const commonRoot = join(containmentRoot, 'common');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  const roleBoundPacket = clone(ROLE_BOUND_FIXTURE.packet);
  roleBoundPacket.context_packet.risks = [];
  const projectRef = clone(roleBoundPacket.expected_project_binding_ref);
  const policyRef = clone(roleBoundPacket.policy.policy_ref);
  const commonRef = syntheticRef(901);
  const commonRequirementRef = clone(roleBoundPacket.policy.stages[0].requirements[1].requirement_ref);

  const grantDraft = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_PIN,
    feature_state: 'off',
    authority_ceiling: 'synthetic_validation_only',
    grant_ref: syntheticRef(902),
    policy_ref: clone(policyRef),
    project_binding_ref: clone(projectRef),
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: sortRefs([clone(commonRef)]),
  };
  const knowledgeViewAuthorityGrant = {
    ...grantDraft,
    grant_ref: {
      ...grantDraft.grant_ref,
      content_id: nulFingerprint(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN_PIN, {
        schema_version: grantDraft.schema_version,
        feature_state: grantDraft.feature_state,
        authority_ceiling: grantDraft.authority_ceiling,
        policy_ref: grantDraft.policy_ref,
        project_binding_ref: grantDraft.project_binding_ref,
        project_root_path: grantDraft.project_root_path,
        common_root_path: grantDraft.common_root_path,
        containment_root_path: grantDraft.containment_root_path,
        approved_common_revision_refs: grantDraft.approved_common_revision_refs,
      }),
    },
  };
  const manifestDraft = {
    schema_version: AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA_PIN,
    manifest_ref: syntheticRef(903),
    project_binding_ref: clone(projectRef),
    project_material_revision_refs: projectMaterialRefs(
      roleBoundPacket, new Set([exactRefIdentityKey(commonRequirementRef)]),
    ),
  };
  const manifest = {
    ...manifestDraft,
    manifest_ref: {
      ...manifestDraft.manifest_ref,
      content_id: nulFingerprint(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN_PIN, {
        schema_version: manifestDraft.schema_version,
        project_binding_ref: manifestDraft.project_binding_ref,
        project_material_revision_refs: manifestDraft.project_material_revision_refs,
      }),
    },
  };
  const packetDraft = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA_PIN,
    feature_state: 'off',
    knowledge_view_request: {
      schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_PIN,
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
  const pilotGrantDraft = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA_PIN,
    feature_state: 'off',
    authority_ceiling: 'owner_frozen_manual_zero_write',
    grant_ref: syntheticRef(904),
    knowledge_view_authority_grant_ref: clone(knowledgeViewAuthorityGrant.grant_ref),
    project_binding_ref: clone(projectRef),
    project_source_binding_manifest_ref: clone(manifest.manifest_ref),
    pilot_material_fingerprint_sha256: nulFingerprint(
      AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN_PIN, {
        knowledge_view_request: packetDraft.knowledge_view_request,
        common_projection_bindings: packetDraft.common_projection_bindings,
        project_source_binding_manifest: packetDraft.project_source_binding_manifest,
        role_bound_packet: packetDraft.role_bound_packet,
      },
    ),
    expected_role_roster_ref: clone(ROLE_BOUND_FIXTURE.expected_role_roster_ref),
  };
  const pilotGrant = {
    ...pilotGrantDraft,
    grant_ref: {
      ...pilotGrantDraft.grant_ref,
      content_id: nulFingerprint(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN_PIN, {
        schema_version: pilotGrantDraft.schema_version,
        feature_state: pilotGrantDraft.feature_state,
        authority_ceiling: pilotGrantDraft.authority_ceiling,
        knowledge_view_authority_grant_ref: pilotGrantDraft.knowledge_view_authority_grant_ref,
        project_binding_ref: pilotGrantDraft.project_binding_ref,
        project_source_binding_manifest_ref: pilotGrantDraft.project_source_binding_manifest_ref,
        pilot_material_fingerprint_sha256: pilotGrantDraft.pilot_material_fingerprint_sha256,
        expected_role_roster_ref: pilotGrantDraft.expected_role_roster_ref,
      }),
    },
  };
  return {
    basePacket: { ...packetDraft, pilot_grant: pilotGrant },
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function compiledStageRules() {
  const request = clone(STAGE_RULE_FIXTURE.request);
  request.overlay = clone(STAGE_RULE_OVERLAY.overlay);
  for (const row of request.project_binding.document_refs) row.requirement_ref.revision_id = 'rev1';
  return compileStageRules(request);
}

/** An inventory of `03_Out` files whose task numbers are the compiled fixture's own. */
function stageRuleInventory() {
  const rows = [
    ['090_PDR', '9001_synthetic_srs', 'synthetic_srs_final.pdf', '2026-07-01T00:00:00.000Z'],
    ['090_PDR', '9004_synthetic_icd', 'synthetic_icd_final.pdf', '2026-07-02T00:00:00.000Z'],
    ['120_CDR', '12001_synthetic_pci', 'synthetic_pci_final.pdf', '2026-07-03T00:00:00.000Z'],
    ['120_CDR', '12004_synthetic_minutes', 'synthetic_cdr_minutes_final.pdf', '2026-07-04T00:00:00.000Z'],
  ];
  return rows.map(([gate, task, name, mtime], index) => ({
    file_ref: `${gate}/${task}/03_Out/${name}`,
    name,
    ext: 'pdf',
    bytes: 1000 + index,
    sha256: sha256Hex(`synthetic-observation-acceptance-${index}`),
    mtime_iso: mtime,
    gate_hint: gate,
    task_folder_hint: task,
  }));
}

test('the generator accepts the observations this module produces', () => {
  const state = basePilotFixture();
  try {
    const rules = compiledStageRules();
    const inventory = stageRuleInventory();
    const candidateResult = buildArtifactObservationCandidates({
      inventory,
      compiled_variants: [clone(STAGE_RULE_FIXTURE.request.compiled_variant)],
      overlay_aliases: clone(STAGE_RULE_OVERLAY.overlay.ops)
        .filter((op) => op.op === 'alias')
        .map((op) => ({ stage_code: op.stage_code, artifact_type_id: op.artifact_type_id, alias: op.alias })),
      vocabulary: ARTIFACT_VOCABULARY_V0,
      known_at: KNOWN_AT,
      rules: { auto_confirm_03_out: true },
    });
    assert.equal(candidateResult.candidates.length, inventory.length);

    // The compiled fixture's task rows carry no short term (`HDD`, `ICD`), so the only thing that
    // can name these files' artifacts is the standard token itself. Three of the four carry it;
    // the review minutes do not, because nobody writes `review_minutes_cdr` in a file name.
    const ownCue = new Map(candidateResult.candidates.map(
      (row) => [row.artifact_type_id, row.own_name_cue],
    ));
    assert.deepEqual([...ownCue.entries()].sort(), [
      ['icd', true], ['pci', true], ['review_minutes_cdr', false], ['srs', true],
    ]);
    // Confirmed by an Owner decision so that the acceptance under test is the generator's, not
    // the auto-confirmation rule's.
    const applied = applyConfirmationSheet(candidateResult.candidates,
      candidateResult.candidates.map((row) => ({ candidate_id: row.candidate_id, decision: 'confirm' })));
    assert.equal(applied.confirmed.length, inventory.length);
    const built = buildArtifactObservationsFromConfirmed({
      confirmed: applied.confirmed, inventory, known_at: KNOWN_AT,
    });
    assert.equal(built.artifact_observations.length, inventory.length);

    const generated = generatePilotPacketFromStageRules({
      base_packet: clone(state.basePacket),
      engine_stage_policy_material: clone(rules.engine_stage_policy_material),
      mapping_table: clone(rules.mapping_table),
      artifact_observations: clone(built.artifact_observations),
      policy_identity: { policy_id: 'synthetic_stage_rule_policy_01', revision_label: 'synthetic_compile_r1' },
      packet_identity_seed: 'synthetic_observation_acceptance_seed_01',
      known_at: KNOWN_AT,
      common_binding_requirement_id: '120_CDR_review_minutes_cdr',
    });

    // Every observation bound to a requirement: nothing was left unbound, and nothing was guessed.
    assert.deepEqual(generated.receipt.unbound_observations ?? [], []);
    const bound = generated.pilot_packet.role_bound_packet.context_packet.observations;
    assert.equal(bound.length, inventory.length);
    for (const row of bound) {
      assert.equal(row.presence_state, 'present');
      assert.ok(row.evidence_refs.length >= 1);
    }
    const requirementIds = bound.map((row) => row.requirement_id).sort(compareCodePoints);
    assert.deepEqual(requirementIds, [
      '090_PDR_icd', '090_PDR_srs', '120_CDR_pci', '120_CDR_review_minutes_cdr',
    ]);
  } finally {
    state.cleanup();
  }
});
