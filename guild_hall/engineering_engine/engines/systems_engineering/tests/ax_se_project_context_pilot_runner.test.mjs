import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  appendFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { exactRefIdentityKey } from '../../../core/validators/identity.mjs';
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
} from '../../../../shared/project_knowledge_view.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN,
  AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN,
  AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_RESULT_SCHEMA,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN,
  AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA,
  assessOwnerFrozenProjectContext,
} from '../evaluator/ax_se_project_context_pilot.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
  AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_RECEIPT_SCHEMA,
  CLI_CODES,
  COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
  MAX_PACKET_BYTES,
  MAX_PACKET_LOCATOR_CHARS,
  TEST_ONLY_READ_HOOK,
  isDirectInvocation,
  runAxSeProjectContextPilotCli,
} from '../tools/ax_se_project_context_pilot_runner.mjs';

const ROLE_BOUND_FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/'
    + 'ax_se_project_role_bound_assessment_synthetic_v1.json',
  import.meta.url,
), 'utf8'));

const TEMP_FILE_ROOTS = new Set();
after(() => {
  for (const root of TEMP_FILE_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exposes the zero-write project-context pilot command seam', () => {
  assert.equal(typeof runAxSeProjectContextPilotCli, 'function');
});

function invoke(argv, io = {}) {
  let stdout = '';
  let stderr = '';
  const result = runAxSeProjectContextPilotCli(argv, {
    stdoutWrite(value) { stdout += value; },
    stderrWrite(value) { stderr += value; },
    ...io,
  });
  return { ...result, stdout, stderr };
}

function oneJsonLine(text) {
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.slice(0, -1).includes('\n'), false);
  return JSON.parse(text);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = '') => {
    if (Array.isArray(node)) {
      rules[path] = 'insertion_ordered';
      node.forEach((child) => visit(child, `${path}[]`));
    } else if (node !== null && typeof node === 'object') {
      Object.entries(node).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
}

const canonicalBytes = (value) => Buffer.from(
  `${canonicalise(value, insertionOrderRules(value))}\n`,
  'utf8',
);

function exactRef(seed) {
  const token = String(seed).padStart(12, '0');
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${String(seed).padStart(64, '0')}`,
    content_hash_alg: 'sha256',
  };
}

function canonicalFingerprint(domain, material) {
  return `sha256:${createHash('sha256')
    .update(`${domain}\0`, 'utf8')
    .update(canonicalise(material, insertionOrderRules(material)), 'utf8')
    .digest('hex')}`;
}

function bindAuthorityGrant(grantDraft) {
  const approved = [...grantDraft.approved_common_revision_refs].sort((left, right) => (
    compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right))
  ));
  const material = {
    schema_version: grantDraft.schema_version,
    feature_state: grantDraft.feature_state,
    authority_ceiling: grantDraft.authority_ceiling,
    policy_ref: grantDraft.policy_ref,
    project_binding_ref: grantDraft.project_binding_ref,
    project_root_path: grantDraft.project_root_path,
    common_root_path: grantDraft.common_root_path,
    containment_root_path: grantDraft.containment_root_path,
    approved_common_revision_refs: approved,
  };
  return {
    ...grantDraft,
    grant_ref: {
      ...grantDraft.grant_ref,
      content_id: canonicalFingerprint(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN, material),
    },
  };
}

function launchFixture({
  projectRef = exactRef(1),
  policyRef = exactRef(3),
  commonRef = exactRef(4),
  policyRequirementRef = exactRef(5),
} = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ax-se-context-pilot-launch-'));
  const containmentRoot = join(tempRoot, 'workspace');
  const projectRoot = join(containmentRoot, 'project');
  const commonRoot = join(containmentRoot, 'common');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });
  const request = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    feature_state: 'off',
    project_binding_refs: [projectRef],
    common_revision_refs: [commonRef],
  };
  const authorityGrant = bindAuthorityGrant({
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: 'off',
    authority_ceiling: 'synthetic_validation_only',
    grant_ref: exactRef(2),
    policy_ref: policyRef,
    project_binding_ref: projectRef,
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: [commonRef],
  });
  const commonBindings = [{
    common_revision_ref: commonRef,
    policy_requirement_ref: policyRequirementRef,
  }];
  const launch = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA,
    feature_state: 'off',
    mode: 'owner_frozen_manual_zero_write',
    pilot_policy_revision: AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
    knowledge_view_request: request,
    knowledge_view_authority_grant: authorityGrant,
    expected_knowledge_view_authority_grant_ref: authorityGrant.grant_ref,
    expected_project_binding_ref: projectRef,
    expected_pilot_grant_ref: exactRef(6),
    expected_project_source_binding_manifest_ref: exactRef(7),
    expected_role_roster_ref: exactRef(8),
    expected_common_projection_bindings_fingerprint_sha256: canonicalFingerprint(
      COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
      commonBindings,
    ),
    pilot_packet_relative_locator: 'inputs/pilot.json',
    pilot_packet_sha256: 'b'.repeat(64),
  };
  return {
    launch,
    commonBindings,
    projectRef,
    projectRoot,
    commonRoot,
    containmentRoot,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function collectProjectMaterialRefs(rolePacket, commonRequirementRef) {
  const refs = [rolePacket.context_packet.objective_ref];
  for (const observation of rolePacket.context_packet.observations) {
    refs.push(observation.artifact_revision_ref, ...observation.evidence_refs);
    for (const claim of observation.conflict_claims ?? []) refs.push(claim.source_revision_ref);
  }
  for (const risk of rolePacket.context_packet.risks) {
    refs.push(risk.risk_ref, ...risk.evidence_refs);
  }
  refs.push(
    ...rolePacket.role_roster_packet.source_revision_refs,
    rolePacket.policy_capability_vocabulary_ref,
  );
  for (const stage of rolePacket.policy.stages) {
    for (const requirement of stage.requirements) {
      if (exactRefIdentityKey(requirement.requirement_ref)
          !== exactRefIdentityKey(commonRequirementRef)) {
        refs.push(requirement.requirement_ref);
      }
    }
  }
  const unique = new Map(refs.map((ref) => [exactRefIdentityKey(ref), ref]));
  return [...unique.values()].sort((left, right) => compareCodePoints(
    exactRefIdentityKey(left),
    exactRefIdentityKey(right),
  ));
}

function pilotFixture() {
  const roleBoundPacket = structuredClone(ROLE_BOUND_FIXTURE.packet);
  const projectRef = roleBoundPacket.expected_project_binding_ref;
  const policyRef = roleBoundPacket.policy.policy_ref;
  const commonRef = exactRef(40);
  const policyRequirementRef = roleBoundPacket.policy.stages[0].requirements[0].requirement_ref;
  const state = launchFixture({ projectRef, policyRef, commonRef, policyRequirementRef });
  const projectMaterialRevisionRefs = collectProjectMaterialRefs(
    roleBoundPacket,
    policyRequirementRef,
  );
  const manifest = {
    schema_version: AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_SCHEMA,
    manifest_ref: exactRef(70),
    project_binding_ref: projectRef,
    project_material_revision_refs: projectMaterialRevisionRefs,
  };
  manifest.manifest_ref = {
    ...manifest.manifest_ref,
    content_id: canonicalFingerprint(AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN, {
      schema_version: manifest.schema_version,
      project_binding_ref: manifest.project_binding_ref,
      project_material_revision_refs: manifest.project_material_revision_refs,
    }),
  };
  const packet = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA,
    feature_state: 'off',
    knowledge_view_request: state.launch.knowledge_view_request,
    knowledge_view_authority_grant: state.launch.knowledge_view_authority_grant,
    common_projection_bindings: state.commonBindings,
    project_source_binding_manifest: manifest,
    pilot_grant: null,
    role_bound_packet: roleBoundPacket,
  };
  const pilotMaterialFingerprint = canonicalFingerprint(
    AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN,
    {
      knowledge_view_request: packet.knowledge_view_request,
      common_projection_bindings: packet.common_projection_bindings,
      project_source_binding_manifest: packet.project_source_binding_manifest,
      role_bound_packet: packet.role_bound_packet,
    },
  );
  const pilotGrant = {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_GRANT_SCHEMA,
    feature_state: 'off',
    authority_ceiling: 'owner_frozen_manual_zero_write',
    grant_ref: exactRef(60),
    knowledge_view_authority_grant_ref:
      state.launch.expected_knowledge_view_authority_grant_ref,
    project_binding_ref: projectRef,
    project_source_binding_manifest_ref: manifest.manifest_ref,
    pilot_material_fingerprint_sha256: pilotMaterialFingerprint,
    expected_role_roster_ref: ROLE_BOUND_FIXTURE.expected_role_roster_ref,
  };
  pilotGrant.grant_ref = {
    ...pilotGrant.grant_ref,
    content_id: canonicalFingerprint(AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN, {
      schema_version: pilotGrant.schema_version,
      feature_state: pilotGrant.feature_state,
      authority_ceiling: pilotGrant.authority_ceiling,
      knowledge_view_authority_grant_ref: pilotGrant.knowledge_view_authority_grant_ref,
      project_binding_ref: pilotGrant.project_binding_ref,
      project_source_binding_manifest_ref: pilotGrant.project_source_binding_manifest_ref,
      pilot_material_fingerprint_sha256: pilotGrant.pilot_material_fingerprint_sha256,
      expected_role_roster_ref: pilotGrant.expected_role_roster_ref,
    }),
  };
  packet.pilot_grant = pilotGrant;

  const packetBytes = canonicalBytes(packet);
  const inputRoot = join(state.projectRoot, 'inputs');
  mkdirSync(inputRoot);
  const packetPath = join(inputRoot, 'pilot.json');
  writeFileSync(packetPath, packetBytes);
  state.launch.expected_pilot_grant_ref = pilotGrant.grant_ref;
  state.launch.expected_project_source_binding_manifest_ref = manifest.manifest_ref;
  state.launch.expected_role_roster_ref = pilotGrant.expected_role_roster_ref;
  state.launch.expected_common_projection_bindings_fingerprint_sha256 = canonicalFingerprint(
    COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
    packet.common_projection_bindings,
  );
  state.launch.pilot_packet_sha256 = sha256(packetBytes);
  return {
    ...state,
    packet,
    packetBytes,
    packetPath,
  };
}

function rebindPilotFixture(state, mutate) {
  const packet = JSON.parse(state.packetBytes.toString('utf8'));
  mutate(packet);
  const commonRequirementRef = packet.common_projection_bindings[0].policy_requirement_ref;
  packet.project_source_binding_manifest.project_material_revision_refs =
    collectProjectMaterialRefs(packet.role_bound_packet, commonRequirementRef);
  packet.project_source_binding_manifest.manifest_ref.content_id = canonicalFingerprint(
    AX_SE_PROJECT_SOURCE_BINDING_MANIFEST_HASH_DOMAIN,
    {
      schema_version: packet.project_source_binding_manifest.schema_version,
      project_binding_ref: packet.project_source_binding_manifest.project_binding_ref,
      project_material_revision_refs:
        packet.project_source_binding_manifest.project_material_revision_refs,
    },
  );
  packet.pilot_grant.project_source_binding_manifest_ref =
    packet.project_source_binding_manifest.manifest_ref;
  packet.pilot_grant.pilot_material_fingerprint_sha256 = canonicalFingerprint(
    AX_SE_PROJECT_CONTEXT_PILOT_MATERIAL_HASH_DOMAIN,
    {
      knowledge_view_request: packet.knowledge_view_request,
      common_projection_bindings: packet.common_projection_bindings,
      project_source_binding_manifest: packet.project_source_binding_manifest,
      role_bound_packet: packet.role_bound_packet,
    },
  );
  packet.pilot_grant.grant_ref.content_id = canonicalFingerprint(
    AX_SE_PROJECT_CONTEXT_PILOT_GRANT_HASH_DOMAIN,
    {
      schema_version: packet.pilot_grant.schema_version,
      feature_state: packet.pilot_grant.feature_state,
      authority_ceiling: packet.pilot_grant.authority_ceiling,
      knowledge_view_authority_grant_ref:
        packet.pilot_grant.knowledge_view_authority_grant_ref,
      project_binding_ref: packet.pilot_grant.project_binding_ref,
      project_source_binding_manifest_ref:
        packet.pilot_grant.project_source_binding_manifest_ref,
      pilot_material_fingerprint_sha256:
        packet.pilot_grant.pilot_material_fingerprint_sha256,
      expected_role_roster_ref: packet.pilot_grant.expected_role_roster_ref,
    },
  );
  const packetBytes = canonicalBytes(packet);
  writeFileSync(state.packetPath, packetBytes);
  state.packet = packet;
  state.packetBytes = packetBytes;
  state.launch.expected_pilot_grant_ref = packet.pilot_grant.grant_ref;
  state.launch.expected_project_source_binding_manifest_ref =
    packet.project_source_binding_manifest.manifest_ref;
  state.launch.expected_role_roster_ref = packet.pilot_grant.expected_role_roster_ref;
  state.launch.expected_common_projection_bindings_fingerprint_sha256 = canonicalFingerprint(
    COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
    packet.common_projection_bindings,
  );
  state.launch.pilot_packet_sha256 = sha256(packetBytes);
}

function invokeLaunch(launch, io = {}) {
  const bytes = canonicalBytes(launch);
  const file = tempFile(bytes);
  return {
    ...invoke(['--launch', file.path, '--launch-sha256', sha256(bytes)], io),
    file,
    bytes,
  };
}

function tempFile(bytes, name = 'launch.json') {
  const root = mkdtempSync(join(tmpdir(), 'ax-se-context-pilot-runner-'));
  TEMP_FILE_ROOTS.add(root);
  const path = join(root, name);
  writeFileSync(path, bytes);
  return { root, path, bytes };
}

test('accepts exactly two closed flag/value pairs and refuses every other argv shape', () => {
  const validShape = [
    '--launch', ['C:', 'synthetic', 'launch.json'].join(String.fromCharCode(92)),
    '--launch-sha256', 'a'.repeat(64),
  ];
  const refused = [
    [],
    validShape.slice(0, -2),
    [...validShape, '--extra', 'value'],
    validShape.with(0, '--unknown'),
    validShape.with(1, '--looks-like-a-flag'),
    validShape.with(2, '--launch'),
    validShape.with(3, 'A'.repeat(64)),
  ];
  for (const argv of refused) {
    const run = invoke(argv);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    const receipt = oneJsonLine(run.stderr);
    assert.equal(
      receipt.schema_version,
      AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_RECEIPT_SCHEMA,
    );
    assert.equal(receipt.result, 'HOLD');
    assert.equal(receipt.blocker_code, CLI_CODES.ARGUMENTS_INVALID);
    assert.equal(receipt.stage, 'arguments');
  }
});

test('verifies the raw launch pin before UTF-8 decoding or JSON parsing', () => {
  const marker = 'launch-payload-must-not-echo';
  const bytes = Buffer.from(`not-json-${marker}`, 'utf8');
  const { path } = tempFile(bytes);
  const suppliedPin = '0'.repeat(64);
  const run = invoke([
    '--launch', path,
    '--launch-sha256', suppliedPin,
  ]);

  assert.equal(run.exitCode, 2);
  assert.equal(run.stdout, '');
  const receipt = oneJsonLine(run.stderr);
  assert.equal(receipt.blocker_code, CLI_CODES.LAUNCH_HASH_MISMATCH);
  assert.equal(receipt.stage, 'launch_binding');
  assert.deepEqual(receipt.launch, {
    pin_verified: false,
    sha256: null,
    byte_count: null,
  });
  for (const secret of [path, marker, sha256(bytes), suppliedPin]) {
    assert.equal(run.stderr.includes(secret), false);
  }
});

test('refuses undecodable, unparsable, noncanonical, and duplicate-key launch bytes', () => {
  const cases = [
    [Buffer.from([0xc3, 0x28]), CLI_CODES.LAUNCH_NOT_UTF8, 'launch_decode'],
    [Buffer.from('{"not":', 'utf8'), CLI_CODES.LAUNCH_NOT_JSON, 'launch_parse'],
    [Buffer.from('{ "schema_version":"x"}\n', 'utf8'),
      CLI_CODES.LAUNCH_NOT_CANONICAL, 'launch_canonical'],
    [Buffer.from('{"schema_version":"x","schema_version":"y"}\n', 'utf8'),
      CLI_CODES.LAUNCH_NOT_CANONICAL, 'launch_canonical'],
  ];
  for (const [bytes, blockerCode, stage] of cases) {
    const { path } = tempFile(bytes);
    const pin = sha256(bytes);
    const run = invoke(['--launch', path, '--launch-sha256', pin]);
    const receipt = oneJsonLine(run.stderr);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, blockerCode);
    assert.equal(receipt.stage, stage);
    assert.deepEqual(receipt.launch, {
      pin_verified: true,
      sha256: pin,
      byte_count: bytes.length,
    });
    assert.equal(run.stderr.includes(path), false);
  }
});

test('admits only the closed launch v0 contract and stops invalid grants before packet access', () => {
  const state = launchFixture();
  try {
    for (const mutate of [
      (launch) => { delete launch.expected_role_roster_ref; },
      (launch) => { launch.extra = true; },
      (launch) => { launch.feature_state = 'on'; },
      (launch) => { launch.pilot_policy_revision = 'floating'; },
      (launch) => { launch.expected_common_projection_bindings_fingerprint_sha256 = '0'.repeat(64); },
    ]) {
      const launch = structuredClone(state.launch);
      mutate(launch);
      const run = invokeLaunch(launch);
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2);
      assert.equal(run.stdout, '');
      assert.equal(receipt.blocker_code, CLI_CODES.LAUNCH_CONTRACT_REFUSED);
      assert.equal(receipt.stage, 'launch_contract');
    }

    const marker = 'untrusted-root-must-not-be-probed';
    const drifted = structuredClone(state.launch);
    drifted.knowledge_view_authority_grant.project_root_path = join(
      state.containmentRoot,
      marker,
    );
    let packetOpenAttempts = 0;
    const run = invokeLaunch(drifted, {
      [TEST_ONLY_READ_HOOK](phase) {
        if (phase === 'before_packet_open') packetOpenAttempts += 1;
      },
    });
    const receipt = oneJsonLine(run.stderr);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, CLI_CODES.KNOWLEDGE_VIEW_REFUSED);
    assert.equal(receipt.stage, 'knowledge_view');
    assert.equal(packetOpenAttempts, 0);
    assert.equal(run.stderr.includes(marker), false);
    assert.equal(run.stderr.includes(state.projectRoot), false);
  } finally {
    state.cleanup();
  }
});

test('refuses traversal, absolute, ADS, device, control, empty, and overlong packet locators', () => {
  const state = launchFixture();
  let packetOpenAttempts = 0;
  const io = {
    [TEST_ONLY_READ_HOOK](phase) {
      if (phase === 'before_packet_open') packetOpenAttempts += 1;
    },
  };
  const slash = String.fromCharCode(92);
  const locators = [
    '../foreign.json',
    '/absolute/pilot.json',
    ['C:', 'absolute', 'pilot.json'].join('/'),
    `C:${slash}absolute${slash}pilot.json`,
    `folder${slash}pilot.json`,
    'inputs/pilot.json:alternate',
    'CON',
    `${slash}${slash}server${slash}share${slash}pilot.json`,
    'inputs//pilot.json',
    'inputs/./pilot.json',
    `inputs/${String.fromCharCode(1)}pilot.json`,
    '',
    'x'.repeat(MAX_PACKET_LOCATOR_CHARS + 1),
  ];
  try {
    for (const locator of locators) {
      const launch = structuredClone(state.launch);
      launch.pilot_packet_relative_locator = locator;
      const bytes = canonicalBytes(launch);
      const file = tempFile(bytes);
      const run = invoke(
        ['--launch', file.path, '--launch-sha256', sha256(bytes)],
        io,
      );
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2, locator);
      assert.equal(run.stdout, '', locator);
      assert.equal(receipt.blocker_code, CLI_CODES.PACKET_UNREADABLE, locator);
      assert.equal(receipt.stage, 'packet_locator', locator);
    }
    assert.equal(packetOpenAttempts, 0);
  } finally {
    state.cleanup();
  }
});

test('binds the admitted project root and packet file before checking the raw packet pin', () => {
  const state = launchFixture();
  const marker = 'packet-content-must-not-echo';
  const bytes = Buffer.from(`not-json-${marker}`, 'utf8');
  const inputRoot = join(state.projectRoot, 'inputs');
  mkdirSync(inputRoot);
  writeFileSync(join(inputRoot, 'pilot.json'), bytes);
  const suppliedPin = '0'.repeat(64);
  state.launch.pilot_packet_sha256 = suppliedPin;
  try {
    const run = invokeLaunch(state.launch);
    const receipt = oneJsonLine(run.stderr);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, CLI_CODES.PACKET_HASH_MISMATCH);
    assert.equal(receipt.stage, 'packet_binding');
    assert.deepEqual(receipt.admission, {
      root_binding_verified: true,
      packet_file_binding_verified: true,
    });
    assert.deepEqual(receipt.packet, {
      pin_verified: false,
      sha256: null,
      byte_count: null,
    });
    for (const sensitive of [state.projectRoot, marker, sha256(bytes), suppliedPin]) {
      assert.equal(run.stderr.includes(sensitive), false);
    }
  } finally {
    state.cleanup();
  }
});

test('refuses directory, hardlink, symlink, junction ancestor, and oversized packet files', (t) => {
  const state = launchFixture();
  const inputRoot = join(state.projectRoot, 'inputs');
  mkdirSync(inputRoot);
  const ordinaryBytes = Buffer.from('{}\n', 'utf8');
  const cases = [];

  const directoryPath = join(inputRoot, 'directory');
  mkdirSync(directoryPath);
  cases.push(['inputs/directory', ordinaryBytes, CLI_CODES.PACKET_UNREADABLE]);

  const hardSource = join(inputRoot, 'hard-source.json');
  const hardTarget = join(inputRoot, 'hard-target.json');
  writeFileSync(hardSource, ordinaryBytes);
  linkSync(hardSource, hardTarget);
  cases.push(['inputs/hard-target.json', ordinaryBytes, CLI_CODES.PACKET_UNREADABLE]);

  const symlinkTarget = join(inputRoot, 'symlink-target.json');
  const symlinkPath = join(inputRoot, 'symlink.json');
  writeFileSync(symlinkTarget, ordinaryBytes);
  try {
    symlinkSync(symlinkTarget, symlinkPath, 'file');
    cases.push(['inputs/symlink.json', ordinaryBytes, CLI_CODES.PACKET_UNREADABLE]);
  } catch (error) {
    t.diagnostic(`file symlink unavailable: ${error?.code ?? 'unknown'}`);
  }

  const realAncestor = join(state.projectRoot, 'real-ancestor');
  const linkedAncestor = join(state.projectRoot, 'linked-ancestor');
  mkdirSync(realAncestor);
  writeFileSync(join(realAncestor, 'pilot.json'), ordinaryBytes);
  try {
    symlinkSync(realAncestor, linkedAncestor, process.platform === 'win32' ? 'junction' : 'dir');
    cases.push(['linked-ancestor/pilot.json', ordinaryBytes, CLI_CODES.PACKET_UNREADABLE]);
  } catch (error) {
    t.diagnostic(`directory link unavailable: ${error?.code ?? 'unknown'}`);
  }

  const oversized = Buffer.alloc(MAX_PACKET_BYTES + 1, 0x20);
  writeFileSync(join(inputRoot, 'oversized.json'), oversized);
  cases.push(['inputs/oversized.json', oversized, CLI_CODES.PACKET_TOO_LARGE]);

  try {
    for (const [locator, bytes, blockerCode] of cases) {
      const launch = structuredClone(state.launch);
      launch.pilot_packet_relative_locator = locator;
      launch.pilot_packet_sha256 = sha256(bytes);
      const run = invokeLaunch(launch);
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2, locator);
      assert.equal(run.stdout, '', locator);
      assert.equal(receipt.blocker_code, blockerCode, locator);
      assert.equal(receipt.stage, 'packet_read', locator);
      assert.equal(receipt.packet.pin_verified, false, locator);
      assert.equal(run.stderr.includes(state.projectRoot), false, locator);
    }
  } finally {
    state.cleanup();
  }
});

test('POSIX child readers refuse special and final-link launch and packet names without blocking', {
  timeout: 10000,
}, (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX FIFO behavior is covered here by the static safe-open contract');
    return;
  }
  const runnerPath = fileURLToPath(new URL(
    '../tools/ax_se_project_context_pilot_runner.mjs',
    import.meta.url,
  ));
  const launchSpecialRoot = mkdtempSync(join(tmpdir(), 'ax-se-context-pilot-special-'));
  TEMP_FILE_ROOTS.add(launchSpecialRoot);
  const launchFifo = join(launchSpecialRoot, 'launch.fifo');
  const launchLink = join(launchSpecialRoot, 'launch-link.json');
  const mkLaunchFifo = spawnSync('mkfifo', [launchFifo], { encoding: 'utf8' });
  assert.equal(mkLaunchFifo.error, undefined);
  assert.equal(mkLaunchFifo.status, 0, mkLaunchFifo.stderr);
  symlinkSync(launchFifo, launchLink, 'file');

  for (const launchPath of [launchFifo, launchLink]) {
    const child = spawnSync(process.execPath, [
      runnerPath,
      '--launch', launchPath,
      '--launch-sha256', '0'.repeat(64),
    ], { encoding: 'utf8', timeout: 1500 });
    assert.equal(child.error, undefined, launchPath);
    assert.equal(child.signal, null, launchPath);
    assert.equal(child.status, 2, launchPath);
    const receipt = oneJsonLine(child.stderr);
    assert.equal(receipt.blocker_code, CLI_CODES.LAUNCH_UNREADABLE, launchPath);
    assert.equal(receipt.stage, 'launch_read', launchPath);
  }

  const state = launchFixture();
  try {
    const inputRoot = join(state.projectRoot, 'inputs');
    mkdirSync(inputRoot);
    const packetFifo = join(inputRoot, 'pilot.fifo');
    const packetLink = join(inputRoot, 'pilot-link.json');
    const mkPacketFifo = spawnSync('mkfifo', [packetFifo], { encoding: 'utf8' });
    assert.equal(mkPacketFifo.error, undefined);
    assert.equal(mkPacketFifo.status, 0, mkPacketFifo.stderr);
    symlinkSync(packetFifo, packetLink, 'file');

    for (const locator of ['inputs/pilot.fifo', 'inputs/pilot-link.json']) {
      const launch = structuredClone(state.launch);
      launch.pilot_packet_relative_locator = locator;
      const launchBytes = canonicalBytes(launch);
      const launchFile = tempFile(launchBytes);
      const child = spawnSync(process.execPath, [
        runnerPath,
        '--launch', launchFile.path,
        '--launch-sha256', sha256(launchBytes),
      ], { encoding: 'utf8', timeout: 1500 });
      assert.equal(child.error, undefined, locator);
      assert.equal(child.signal, null, locator);
      assert.equal(child.status, 2, locator);
      const receipt = oneJsonLine(child.stderr);
      assert.equal(receipt.blocker_code, CLI_CODES.PACKET_UNREADABLE, locator);
      assert.equal(receipt.stage, 'packet_read', locator);
    }
  } finally {
    state.cleanup();
  }
});

test('foreign sibling existence is not probed or reflected in the refusal receipt', () => {
  const state = launchFixture();
  const foreignRoot = join(state.containmentRoot, 'foreign');
  mkdirSync(foreignRoot);
  writeFileSync(join(foreignRoot, 'exists.json'), Buffer.from('{}\n', 'utf8'));
  let packetOpenAttempts = 0;
  const io = {
    [TEST_ONLY_READ_HOOK](phase) {
      if (phase === 'before_packet_open') packetOpenAttempts += 1;
    },
  };
  try {
    const receipts = [];
    for (const locator of ['../foreign/exists.json', '../foreign/missing.json']) {
      const launch = structuredClone(state.launch);
      launch.pilot_packet_relative_locator = locator;
      const bytes = canonicalBytes(launch);
      const file = tempFile(bytes);
      const run = invoke(
        ['--launch', file.path, '--launch-sha256', sha256(bytes)],
        io,
      );
      receipts.push(oneJsonLine(run.stderr));
    }
    assert.equal(packetOpenAttempts, 0);
    for (const receipt of receipts) {
      assert.equal(receipt.blocker_code, CLI_CODES.PACKET_UNREADABLE);
      assert.equal(receipt.stage, 'packet_locator');
    }
  } finally {
    state.cleanup();
  }
});

test('root replacement, packet growth, and packet replacement hooks are refused without retry', () => {
  const scenarios = [
    {
      phase: 'after_root_snapshot',
      expectedCode: CLI_CODES.ROOT_BINDING_REFUSED,
      mutate(state) {
        renameSync(state.projectRoot, `${state.projectRoot}-held`);
        mkdirSync(state.projectRoot);
      },
    },
    {
      phase: 'after_packet_open',
      expectedCode: CLI_CODES.PACKET_UNREADABLE,
      mutate(state, packetPath) { appendFileSync(packetPath, 'x'); },
    },
    {
      phase: 'after_packet_open',
      expectedCode: CLI_CODES.PACKET_UNREADABLE,
      mutate(state, packetPath) {
        renameSync(packetPath, `${packetPath}.held`);
        writeFileSync(packetPath, Buffer.from('{"replacement":true}\n', 'utf8'));
      },
    },
  ];

  for (const scenario of scenarios) {
    const state = launchFixture();
    const inputRoot = join(state.projectRoot, 'inputs');
    mkdirSync(inputRoot);
    const packetPath = join(inputRoot, 'pilot.json');
    const packetBytes = Buffer.from('{}\n', 'utf8');
    writeFileSync(packetPath, packetBytes);
    state.launch.pilot_packet_sha256 = sha256(packetBytes);
    let hookCalls = 0;
    const io = {
      [TEST_ONLY_READ_HOOK](phase) {
        if (phase === scenario.phase) {
          hookCalls += 1;
          scenario.mutate(state, packetPath);
        }
      },
    };
    try {
      const launchBytes = canonicalBytes(state.launch);
      const file = tempFile(launchBytes);
      const run = invoke(
        ['--launch', file.path, '--launch-sha256', sha256(launchBytes)],
        io,
      );
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2);
      assert.equal(run.stdout, '');
      assert.equal(receipt.blocker_code, scenario.expectedCode);
      assert.equal(hookCalls, 1);
    } finally {
      state.cleanup();
    }
  }
});

test('oversized packet preflight cannot outrun a concurrent root replacement', () => {
  const state = launchFixture();
  const inputRoot = join(state.projectRoot, 'inputs');
  mkdirSync(inputRoot);
  const packetBytes = Buffer.alloc(MAX_PACKET_BYTES + 1, 0x20);
  writeFileSync(join(inputRoot, 'pilot.json'), packetBytes);
  state.launch.pilot_packet_sha256 = sha256(packetBytes);
  let hookCalls = 0;
  const io = {
    [TEST_ONLY_READ_HOOK](phase) {
      if (phase === 'after_packet_preflight') {
        hookCalls += 1;
        renameSync(state.projectRoot, `${state.projectRoot}-held`);
        mkdirSync(state.projectRoot);
      }
    },
  };
  try {
    const run = invokeLaunch(state.launch, io);
    const receipt = oneJsonLine(run.stderr);
    assert.equal(hookCalls, 1);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, CLI_CODES.ROOT_BINDING_REFUSED);
    assert.equal(receipt.stage, 'root_binding');
    assert.equal(receipt.admission.root_binding_verified, false);
  } finally {
    state.cleanup();
  }
});

test('requires exact UTF-8 canonical packet bytes and refuses duplicate-key ambiguity', () => {
  const cases = [
    [Buffer.from([0xc3, 0x28]), CLI_CODES.PACKET_NOT_UTF8, 'packet_decode'],
    [Buffer.from('{"not":', 'utf8'), CLI_CODES.PACKET_NOT_JSON, 'packet_parse'],
    [Buffer.from('{ "schema_version":"x"}\n', 'utf8'),
      CLI_CODES.PACKET_NOT_CANONICAL, 'packet_canonical'],
    [Buffer.from('{"schema_version":"x","schema_version":"y"}\n', 'utf8'),
      CLI_CODES.PACKET_NOT_CANONICAL, 'packet_canonical'],
  ];
  for (const [packetBytes, blockerCode, stage] of cases) {
    const state = launchFixture();
    const inputRoot = join(state.projectRoot, 'inputs');
    mkdirSync(inputRoot);
    writeFileSync(join(inputRoot, 'pilot.json'), packetBytes);
    state.launch.pilot_packet_sha256 = sha256(packetBytes);
    try {
      const run = invokeLaunch(state.launch);
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2);
      assert.equal(run.stdout, '');
      assert.equal(receipt.blocker_code, blockerCode);
      assert.equal(receipt.stage, stage);
      assert.deepEqual(receipt.packet, {
        pin_verified: true,
        sha256: sha256(packetBytes),
        byte_count: packetBytes.length,
      });
      assert.deepEqual(receipt.admission, {
        root_binding_verified: true,
        packet_file_binding_verified: true,
      });
    } finally {
      state.cleanup();
    }
  }
});

test('valid frozen project context emits one canonical assessment and one payload-free receipt', () => {
  const state = pilotFixture();
  try {
    const expected = assessOwnerFrozenProjectContext(
      JSON.parse(state.packetBytes.toString('utf8')),
      structuredClone(state.launch.expected_pilot_grant_ref),
    );
    const expectedOutput = canonicalBytes(expected).toString('utf8');
    const run = invokeLaunch(state.launch);

    assert.equal(expected.role_bound_assessment.assessment_state, 'HOLD');
    assert.equal(run.exitCode, 0);
    assert.equal(run.stdout, expectedOutput);
    assert.equal(run.stdout.slice(0, -1).includes('\n'), false);
    assert.equal(JSON.parse(run.stdout).schema_version, AX_SE_PROJECT_CONTEXT_PILOT_RESULT_SCHEMA);
    const receipt = oneJsonLine(run.stderr);
    assert.equal(receipt.result, 'PASS');
    assert.equal(receipt.blocker_code, null);
    assert.equal(receipt.stage, 'completed');
    assert.deepEqual(receipt.launch, {
      pin_verified: true,
      sha256: sha256(canonicalBytes(state.launch)),
      byte_count: canonicalBytes(state.launch).length,
    });
    assert.deepEqual(receipt.packet, {
      pin_verified: true,
      sha256: sha256(state.packetBytes),
      byte_count: state.packetBytes.length,
    });
    assert.deepEqual(receipt.admission, {
      root_binding_verified: true,
      packet_file_binding_verified: true,
    });
    assert.deepEqual(receipt.assessment, {
      completed: true,
      assessment_state: expected.role_bound_assessment.assessment_state,
      assessment_handle: expected.role_bound_assessment.assessment_handle,
      prepared_output_sha256: sha256(Buffer.from(expectedOutput, 'utf8')),
      prepared_output_byte_count: Buffer.byteLength(expectedOutput, 'utf8'),
      stdout_state: 'submitted',
    });
    assert.deepEqual(receipt.candidate_disposition, {
      candidate_only: true,
      mission_candidate_count:
        expected.role_bound_assessment.next_mission_candidates.length,
    });
    assert.equal(
      receipt.fingerprints.common_projection_bindings_sha256,
      state.launch.expected_common_projection_bindings_fingerprint_sha256,
    );
    for (const value of Object.values(receipt.fingerprints)) {
      assert.match(value, /^sha256:[0-9a-f]{64}$/u);
    }
    for (const sensitive of [
      state.projectRoot,
      state.commonRoot,
      state.containmentRoot,
      state.launch.expected_pilot_grant_ref.entity_id,
      state.launch.expected_role_roster_ref.entity_id,
    ]) {
      assert.equal(run.stderr.includes(sensitive), false);
    }
  } finally {
    state.cleanup();
  }
});

test('a domain UNKNOWN remains a successful completed command', () => {
  const state = pilotFixture();
  try {
    rebindPilotFixture(state, (packet) => {
      packet.role_bound_packet.context_packet.observations =
        packet.role_bound_packet.context_packet.observations.filter(
          (row) => row.requirement_id !== 'srr_review_actions_closed',
        );
    });
    const expected = assessOwnerFrozenProjectContext(
      JSON.parse(state.packetBytes.toString('utf8')),
      structuredClone(state.launch.expected_pilot_grant_ref),
    );
    assert.equal(expected.role_bound_assessment.assessment_state, 'UNKNOWN');
    const run = invokeLaunch(state.launch);
    const receipt = oneJsonLine(run.stderr);
    assert.equal(run.exitCode, 0);
    assert.equal(JSON.parse(run.stdout).role_bound_assessment.assessment_state, 'UNKNOWN');
    assert.equal(receipt.result, 'PASS');
    assert.equal(receipt.assessment.assessment_state, 'UNKNOWN');
  } finally {
    state.cleanup();
  }
});

test('refuses every external grant, project, manifest, roster, common, request, and grant mismatch', () => {
  const launchCases = [
    [
      (state) => { state.launch.expected_knowledge_view_authority_grant_ref = exactRef(91); },
      CLI_CODES.KNOWLEDGE_VIEW_REFUSED,
      'knowledge_view',
    ],
    [
      (state) => { state.launch.expected_project_binding_ref = exactRef(92); },
      CLI_CODES.PROJECT_BINDING_REFUSED,
      'project_binding',
    ],
    [
      (state) => { state.launch.expected_pilot_grant_ref = exactRef(93); },
      CLI_CODES.PILOT_GRANT_BINDING_REFUSED,
      'pilot_grant_binding',
    ],
    [
      (state) => { state.launch.expected_project_source_binding_manifest_ref = exactRef(94); },
      CLI_CODES.MANIFEST_BINDING_REFUSED,
      'manifest_binding',
    ],
    [
      (state) => { state.launch.expected_role_roster_ref = exactRef(95); },
      CLI_CODES.ROSTER_BINDING_REFUSED,
      'roster_binding',
    ],
    [
      (state) => {
        state.launch.expected_common_projection_bindings_fingerprint_sha256 =
          `sha256:${'9'.repeat(64)}`;
      },
      CLI_CODES.COMMON_BINDING_REFUSED,
      'common_binding',
    ],
  ];
  for (const [mutate, blockerCode, stage] of launchCases) {
    const state = pilotFixture();
    try {
      mutate(state);
      const run = invokeLaunch(state.launch);
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2);
      assert.equal(run.stdout, '');
      assert.equal(receipt.blocker_code, blockerCode);
      assert.equal(receipt.stage, stage);
    } finally {
      state.cleanup();
    }
  }

  const packetCases = [
    [
      (packet) => { packet.knowledge_view_request.feature_state = 'packet-only-drift'; },
      CLI_CODES.PACKET_CONTRACT_REFUSED,
      'packet_contract',
    ],
    [
      (packet) => { packet.knowledge_view_authority_grant.feature_state = 'packet-only-drift'; },
      CLI_CODES.PACKET_CONTRACT_REFUSED,
      'packet_contract',
    ],
    [
      (packet) => { packet.pilot_grant.grant_ref = exactRef(96); },
      CLI_CODES.PILOT_GRANT_BINDING_REFUSED,
      'pilot_grant_binding',
    ],
    [
      (packet) => { packet.project_source_binding_manifest.manifest_ref = exactRef(97); },
      CLI_CODES.MANIFEST_BINDING_REFUSED,
      'manifest_binding',
    ],
    [
      (packet) => { packet.pilot_grant.expected_role_roster_ref = exactRef(98); },
      CLI_CODES.ROSTER_BINDING_REFUSED,
      'roster_binding',
    ],
    [
      (packet) => { packet.common_projection_bindings[0].common_revision_ref = exactRef(99); },
      CLI_CODES.COMMON_BINDING_REFUSED,
      'common_binding',
    ],
  ];
  for (const [mutate, blockerCode, stage] of packetCases) {
    const state = pilotFixture();
    try {
      const packet = JSON.parse(state.packetBytes.toString('utf8'));
      mutate(packet);
      const packetBytes = canonicalBytes(packet);
      writeFileSync(state.packetPath, packetBytes);
      state.launch.pilot_packet_sha256 = sha256(packetBytes);
      const run = invokeLaunch(state.launch);
      const receipt = oneJsonLine(run.stderr);
      assert.equal(run.exitCode, 2);
      assert.equal(run.stdout, '');
      assert.equal(receipt.blocker_code, blockerCode);
      assert.equal(receipt.stage, stage);
    } finally {
      state.cleanup();
    }
  }
});

test('stdout and stderr failures are contained, emitted once, and never retried', () => {
  const state = pilotFixture();
  const marker = 'stream-failure-must-not-echo';
  try {
    let stdoutCalls = 0;
    const stdoutFailure = invokeLaunch(state.launch, {
      stdoutWrite() {
        stdoutCalls += 1;
        throw new Error(marker);
      },
    });
    assert.equal(stdoutCalls, 1);
    assert.equal(stdoutFailure.exitCode, 2);
    assert.equal(stdoutFailure.stdout, '');
    const receipt = oneJsonLine(stdoutFailure.stderr);
    assert.equal(receipt.blocker_code, CLI_CODES.STDOUT_FAILED);
    assert.equal(receipt.stage, 'stdout');
    assert.equal(receipt.assessment.stdout_state, 'partial_unknown');
    assert.equal(stdoutFailure.stderr.includes(marker), false);

    let stderrCalls = 0;
    const stderrFailure = invokeLaunch(state.launch, {
      stdoutWrite() {},
      stderrWrite() {
        stderrCalls += 1;
        throw new Error(marker);
      },
    });
    assert.equal(stderrCalls, 1);
    assert.equal(stderrFailure.exitCode, 2);
    assert.equal(stderrFailure.receiptSubmissionState, 'failed');
    assert.equal(stderrFailure.stderr, '');
  } finally {
    state.cleanup();
  }
});

test('a real child process preserves one stdout line and one receipt line', () => {
  const state = pilotFixture();
  const runnerPath = fileURLToPath(new URL(
    '../tools/ax_se_project_context_pilot_runner.mjs',
    import.meta.url,
  ));
  try {
    const launchBytes = canonicalBytes(state.launch);
    const launchFile = tempFile(launchBytes);
    const child = spawnSync(process.execPath, [
      runnerPath,
      '--launch', launchFile.path,
      '--launch-sha256', sha256(launchBytes),
    ], { encoding: 'utf8', windowsHide: true });
    assert.equal(child.error, undefined);
    assert.equal(child.signal, null);
    assert.equal(child.status, 0);
    assert.equal(JSON.parse(child.stdout).schema_version, AX_SE_PROJECT_CONTEXT_PILOT_RESULT_SCHEMA);
    assert.equal(child.stdout.slice(0, -1).includes('\n'), false);
    const receipt = oneJsonLine(child.stderr);
    assert.equal(receipt.result, 'PASS');
    assert.equal(child.stderr.includes(state.projectRoot), false);
    assert.equal(child.stderr.includes(launchFile.path), false);
  } finally {
    state.cleanup();
  }
});

test('a real child contains an asynchronously broken stderr pipe and keeps HOLD exit', {
  timeout: 5000,
}, async () => {
  const runnerPath = fileURLToPath(new URL(
    '../tools/ax_se_project_context_pilot_runner.mjs',
    import.meta.url,
  ));
  const child = spawn(process.execPath, [runnerPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.destroy();

  const [exitCode, signal] = await once(child, 'close');
  assert.equal(signal, null);
  assert.equal(exitCode, 2);
  assert.equal(stdout, '');
});

test('a real child reports partial unknown after an asynchronously broken stdout pipe', {
  timeout: 5000,
}, async () => {
  const state = pilotFixture();
  const runnerPath = fileURLToPath(new URL(
    '../tools/ax_se_project_context_pilot_runner.mjs',
    import.meta.url,
  ));
  try {
    const launchBytes = canonicalBytes(state.launch);
    const launchFile = tempFile(launchBytes);
    const child = spawn(process.execPath, [
      runnerPath,
      '--launch', launchFile.path,
      '--launch-sha256', sha256(launchBytes),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.destroy();

    const [exitCode, signal] = await once(child, 'close');
    assert.equal(signal, null);
    assert.equal(exitCode, 2);
    const receipt = oneJsonLine(stderr);
    assert.equal(receipt.blocker_code, CLI_CODES.STDOUT_FAILED);
    assert.equal(receipt.stage, 'stdout');
    assert.equal(receipt.assessment.stdout_state, 'partial_unknown');
  } finally {
    state.cleanup();
  }
});

test('the runner has one closed read-only in-process subject call and no legacy execution lane', () => {
  const runnerUrl = new URL('../tools/ax_se_project_context_pilot_runner.mjs', import.meta.url);
  const runnerPath = fileURLToPath(runnerUrl);
  const source = readFileSync(runnerUrl, 'utf8');
  const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gmu)]
    .map((match) => match[1]);
  for (const specifier of specifiers) {
    assert.doesNotMatch(specifier, /(?:child_process|http|https|net|dgram|tls|worker_threads)/u);
    assert.doesNotMatch(specifier, /(?:model|rag|wiki|erp|task_?driver)/iu);
    assert.notEqual(specifier.endsWith('ax_se_project_assessment_runner.mjs'), true);
    assert.notEqual(specifier.endsWith('ax_se_project_role_bound_assessment_runner.mjs'), true);
  }
  assert.equal([...source.matchAll(/\bassessOwnerFrozenProjectContext\s*\(/gu)].length, 1);
  assert.doesNotMatch(source, /\bimport\s*\(/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /\bspawn(?:Sync)?\s*\(/u);
  assert.equal(source.includes('process.env'), false);

  const fsImport = source.match(/^import\s*\{([^}]*)\}\s*from\s+'node:fs';/mu);
  assert.notEqual(fsImport, null);
  assert.deepEqual(
    fsImport[1].split(',').map((name) => name.trim()).filter(Boolean).sort(),
    ['closeSync', 'constants', 'fstatSync', 'lstatSync', 'openSync', 'readSync', 'realpathSync'],
  );
  assert.equal(source.includes('constants.O_NOFOLLOW'), true);
  assert.equal(source.includes('constants.O_NONBLOCK'), true);
  assert.equal(
    [...source.matchAll(/openSync\((?:packetPath|path), SAFE_READ_OPEN_FLAGS\)/gu)].length,
    2,
  );
  for (const [start, end] of [
    ['function readBoundedProjectPacket', 'function readBoundedNamedFile'],
    ['function readBoundedNamedFile', 'function snapshotArgv'],
  ]) {
    const reader = source.slice(source.indexOf(start), source.indexOf(end));
    assert.notEqual(reader.indexOf('preflightBoundedNamedFile'), -1, start);
    assert.equal(
      reader.indexOf('preflightBoundedNamedFile') < reader.indexOf('openSync'),
      true,
      start,
    );
  }
  for (const token of [
    'writeFileSync', 'writeSync', 'appendFileSync', 'createWriteStream', 'mkdirSync',
    'rmSync', 'unlinkSync', 'renameSync', 'copyFileSync', 'linkSync', 'symlinkSync',
    'truncateSync', 'chmodSync', 'chownSync', 'utimesSync', 'node:fs/promises',
    'fs.promises', '--out', '--receipt-out', '--packet',
  ]) {
    assert.equal(source.includes(token), false, token);
  }
  assert.equal(isDirectInvocation(runnerPath, runnerUrl.href), true);
  assert.equal(isDirectInvocation(`${runnerPath}.bak`, runnerUrl.href), false);
});
