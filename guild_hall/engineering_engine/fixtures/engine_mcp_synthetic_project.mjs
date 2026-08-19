// Stages a synthetic project — or a synthetic registry of several — so the MCP door can be driven
// end to end.
//
// The data is entirely the public fixtures — the ordering/guidance fixture supplies the rules and
// the assessment, the profile fixture supplies the observation run, the access-table fixture
// supplies the permissions — and this module only writes them into the shape a profile names: a
// `_workspaces` project plane, a `_workmeta` metadata plane, and one profile file pointing at
// both. Nothing here invents a rule, a count or a judgement, and no real project material is
// touched.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { engineStageCodeForGate } from '../observation/artifact_observation_candidates.mjs';

const EXAMPLES = '../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));

export const NEXT_STEPS_FIXTURE = load('next_steps_synthetic_v0.json');
export const PROFILE_FIXTURE = load('project_profile_synthetic_v0.json');
export const REGISTRY_FIXTURE = load('project_registry_synthetic_v0.json');
export const ACCESS_TABLE_FIXTURE = load('access_table_synthetic_v0.json');

export const SYNTHETIC_PROJECT_CODE = 'SYN-000';
export const SYNTHETIC_SECOND_PROJECT_CODE = 'SYN-001';
export const SYNTHETIC_RUN_ID = 'synthetic_run_01';
export const SYNTHETIC_STAGE = '030_SRR';

/**
 * The folder-tree shape the file door registers into, staged from the same compiled variant.
 *
 * Gate folder number = gate code, task folder number = task id, and the task folder's name is the
 * task's name — that is the agreement `resolveTaskFolder` checks before it moves anything, so the
 * fixture has to build it out of the variant rather than out of hand-written strings. One task
 * folder is deliberately staged under the *wrong* name so a test can watch the refusal.
 */
export const SYNTHETIC_REGISTER_TOKEN = 'ssrs';
export const SYNTHETIC_MISMATCHED_TOKEN = 'semp';
export const SYNTHETIC_MISMATCHED_FOLDER_NAME = 'A folder generated from an older rule revision';

// An artifact only a project overlay carries, of the shape a slot that used to be a spec row and
// moved into the overlay takes. The folder for it exists on disk because an older rule revision
// generated it; the overlay is the only thing that can still say which folder that is.
export const SYNTHETIC_OVERLAY_TOKEN = 'prime_synthetic_review_pack';
export const SYNTHETIC_OVERLAY_TASK_ID = 3099;
export const SYNTHETIC_OVERLAY_FOLDER_NAME = 'Synthetic overlay review pack';
// A second one that names no folder at all, so a test can watch the door refuse it.
export const SYNTHETIC_OVERLAY_UNPLACED_TOKEN = 'prime_synthetic_unplaced_item';
export const OUT_FOLDER = '03_Out';

/** Where the door's three folders sit inside a project. Kept away from the gate folders. */
export const DOOR_RELATIVE = Object.freeze({
  intake: ['020_MGMT', '022_INBOX', 'tickets'],
  outbox: ['020_MGMT', '022_INBOX', 'outbox'],
  trash: ['020_MGMT', '_trash'],
  confidential: ['000_REF', 'contract'],
});

/**
 * The env prefix a staged link issuer states (12장 §12.C).
 *
 * A prefix is a set of key *names*, so this constant is public-safe by construction: nothing about
 * a host, an account or a credential is expressible here.
 */
export const LINK_ISSUER_ENV_PREFIX = 'SOULFORGE_NAS';

/** The mock DSM fixtures the gateway issuer ships, so a door test can replay one without a NAS. */
export const NAS_MOCK_FIXTURES = Object.freeze({
  file_request: '../../gateway/nas_link_issuer/fixtures/dsm_mock_file_request_v0.json',
  sharing_fallback: '../../gateway/nas_link_issuer/fixtures/dsm_mock_sharing_fallback_v0.json',
});

export const nasMockFixturePath = (key) =>
  fileURLToPath(new URL(NAS_MOCK_FIXTURES[key], import.meta.url));

/** Where the private registry and access table live by convention, inside the staged root. */
export const REGISTRY_RELATIVE_PATH = ['_workmeta', 'system', 'engine', 'project_registry.json'];
export const ACCESS_TABLE_RELATIVE_PATH = ['_workmeta', 'system', 'engine', 'access_table.json'];

const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Writes the synthetic project under `root` and returns the paths a caller needs.
 *
 * @param root an empty directory that plays the part of a repository root
 * @param options `{ project_code }` — a second code stages a second, independent project
 */
export function stageSyntheticProject(root, options = {}) {
  const projectCode = options.project_code ?? SYNTHETIC_PROJECT_CODE;
  const project = join(root, '_workspaces', projectCode);
  const outputs = join(project, '06_validation');
  const rules = join(outputs, 'rules');
  const observations = join(outputs, 'observations');
  const runsRoot = join(root, '_workmeta', projectCode, 'runs');
  const receipts = join(runsRoot, 'mcp_receipts');
  const runReceipts = join(runsRoot, SYNTHETIC_RUN_ID, 'receipts');
  for (const directory of [rules, observations, receipts, runReceipts]) {
    mkdirSync(directory, { recursive: true });
  }

  const request = NEXT_STEPS_FIXTURE.compile_request;
  const compiledVariant = join(rules, 'compiled_variant.json');
  const basePacket = join(rules, 'base_packet.json');
  writeFileSync(compiledVariant, asJson(request.compiled_variant));
  writeFileSync(basePacket, asJson({
    note: 'synthetic placeholder: the read tools never open this, and judge_run is a write tool',
  }));

  const observationRun = PROFILE_FIXTURE.observation_run;
  writeFileSync(join(observations, 'artifact_observations_auto.json'),
    asJson(observationRun.artifact_observations_auto));
  writeFileSync(join(observations, 'receipt.json'), asJson(observationRun.receipt));
  writeFileSync(join(observations, 'candidates.json'), asJson({
    known_at: observationRun.known_at, candidates: [], unmatched: [], ambiguous: [],
  }));
  writeFileSync(join(observations, 'inventory.json'), asJson({
    known_at: observationRun.known_at, rows: [],
  }));
  writeFileSync(join(observations, 'confirmation_sheet.json'), asJson({
    known_at: observationRun.known_at, rows: [], counts: { decidable_task_folders: 0 },
  }));

  writeFileSync(join(runReceipts, `assessment_stdout_${SYNTHETIC_STAGE}.json`),
    asJson(NEXT_STEPS_FIXTURE.assessment_stdout));

  // ---- the folder tree a registration moves into, plus the door's own three folders

  const gateFolders = new Map();
  for (const gate of request.compiled_variant.gates ?? []) {
    const gateFolder = engineStageCodeForGate(gate.code) ?? `${String(gate.code).padStart(3, '0')}_gate`;
    gateFolders.set(gate.code, gateFolder);
    for (const task of gate.tasks ?? []) {
      if (typeof task.artifact_type_id !== 'string' || task.is_fixed === true) continue;
      if (Object.hasOwn(task, 'node_kind') && task.node_kind !== 'artifact') continue;
      const folderName = task.artifact_type_id === SYNTHETIC_MISMATCHED_TOKEN
        ? `${task.id}_${SYNTHETIC_MISMATCHED_FOLDER_NAME}`
        : `${task.id}_${task.name}`;
      mkdirSync(join(project, gateFolder, folderName, OUT_FOLDER), { recursive: true });
    }
  }
  // A project overlay, staged only when a test asks for one. It adds two rules the standard table
  // does not carry: one that says which folder it lives in, and one that says nothing — which is
  // the ordinary case and the one the door has to refuse.
  const overlayPaths = [];
  if (options.overlay_add === true) {
    const srrGate = gateFolders.get(30) ?? '030_SRR';
    mkdirSync(join(project, srrGate,
      `${SYNTHETIC_OVERLAY_TASK_ID}_${SYNTHETIC_OVERLAY_FOLDER_NAME}`, OUT_FOLDER), { recursive: true });
    const sourceRef = {
      entity_id: 'synthetic_project_request_letter',
      revision_id: 'rev_1',
      content_id: `sha256:${'b'.repeat(64)}`,
      content_hash_alg: 'sha256',
    };
    const overlayPath = join(rules, 'project_overlay.json');
    writeFileSync(overlayPath, asJson({
      schema_version: 'soulforge.se_stage_rule_overlay.v0',
      extends: {
        support_key: request.compiled_variant.support_key,
        spec_sha256: request.compiled_variant.spec_sha256,
      },
      ops: [
        {
          op: 'add',
          stage_code: SYNTHETIC_STAGE,
          artifact_type_id: SYNTHETIC_OVERLAY_TOKEN,
          label: 'Synthetic overlay review pack',
          evidence_level: 'prime_contract',
          source_ref: sourceRef,
          basis: 'synthetic_project_request',
          task_id: SYNTHETIC_OVERLAY_TASK_ID,
          // Written the way a person copies it off disk, prefix included: the resolver drops the
          // redundant number before comparing names, and checks the number on its own.
          folder_name: `${SYNTHETIC_OVERLAY_TASK_ID}_${SYNTHETIC_OVERLAY_FOLDER_NAME}`,
        },
        {
          op: 'add',
          stage_code: SYNTHETIC_STAGE,
          artifact_type_id: SYNTHETIC_OVERLAY_UNPLACED_TOKEN,
          label: 'Synthetic overlay item nobody placed',
          evidence_level: 'prime_contract',
          source_ref: sourceRef,
          basis: 'synthetic_project_request',
        },
      ],
    }));
    overlayPaths.push(overlayPath);
  }

  const doorDirectory = (parts) => join(project, ...parts);
  for (const parts of Object.values(DOOR_RELATIVE)) {
    mkdirSync(doorDirectory(parts), { recursive: true });
  }

  const profile = {
    schema_version: 'soulforge.engine_project_profile.v0',
    project_code: projectCode,
    business_type: PROFILE_FIXTURE.profile.business_type,
    prime: PROFILE_FIXTURE.profile.prime,
    quality_grade: PROFILE_FIXTURE.profile.quality_grade,
    compiled_variant: compiledVariant,
    overlays: overlayPaths,
    overlay_conditions: [],
    project_binding: request.project_binding,
    base_packet: basePacket,
    base_launch: null,
    alias_patterns: null,
    project_root: project,
    outputs_root: outputs,
    observations_dir: observations,
    receipts_dir: receipts,
    runs_root: runsRoot,
    known_at_policy: 'caller_supplied',
  };
  // A project that has not opened a file door is the older, still-valid shape, so the fixture can
  // stage both and a test can watch the door refuse rather than only watch it work.
  if (options.file_door !== false) {
    profile.intake_dir = doorDirectory(DOOR_RELATIVE.intake);
    profile.outbox_dir = doorDirectory(DOOR_RELATIVE.outbox);
    profile.trash_dir = doorDirectory(DOOR_RELATIVE.trash);
    profile.confidential_dirs = [doorDirectory(DOOR_RELATIVE.confidential)];
    profile.ticket_policy = options.ticket_policy ?? {
      upload_ttl_hours: 72, download_ttl_hours: 24, cleanup_after_days: 30,
    };
    // The link issuer beside the door (12장 §12.C). Names only — the fixture states a kind and an
    // env prefix, exactly as a real profile does, and no host, account or secret exists here at all.
    if (options.link_issuer === true) {
      profile.link_issuer = { kind: 'synology', env_prefix: LINK_ISSUER_ENV_PREFIX };
    } else if (options.link_issuer !== undefined && options.link_issuer !== false) {
      profile.link_issuer = options.link_issuer;
    }
  }
  const profilePath = join(outputs, 'project_profile.json');
  writeFileSync(profilePath, asJson(profile));

  return {
    root,
    profile,
    profile_path: profilePath,
    project_code: projectCode,
    project_root: project,
    outputs_root: outputs,
    observations_dir: observations,
    receipts_dir: receipts,
    runs_root: runsRoot,
    run_id: SYNTHETIC_RUN_ID,
    stage_code: SYNTHETIC_STAGE,
    compiled_variant: compiledVariant,
    known_at: NEXT_STEPS_FIXTURE.known_at,
    gate_folders: gateFolders,
    intake_dir: doorDirectory(DOOR_RELATIVE.intake),
    outbox_dir: doorDirectory(DOOR_RELATIVE.outbox),
    trash_dir: doorDirectory(DOOR_RELATIVE.trash),
    confidential_dir: doorDirectory(DOOR_RELATIVE.confidential),
  };
}

/**
 * Stages several synthetic projects and the private registry that names them.
 *
 * @param root an empty directory that plays the part of a repository root
 * @param options `{ project_codes, statuses, default_project, access_table }`
 */
export function stageSyntheticRegistry(root, options = {}) {
  const codes = options.project_codes
    ?? [SYNTHETIC_PROJECT_CODE, SYNTHETIC_SECOND_PROJECT_CODE];
  const statuses = options.statuses ?? {};
  const staged = codes.map((code) => stageSyntheticProject(root, { project_code: code }));

  const registry = {
    schema_version: 'soulforge.engine_project_registry.v0',
    projects: staged.map((row, index) => ({
      project_code: row.project_code,
      profile: row.profile_path,
      display_label: `합성 과제 ${index}`,
      status: statuses[row.project_code] ?? 'active',
      added_at: '2026-08-19T00:00:00.000Z',
    })),
    default_project: options.default_project ?? codes[0],
  };
  const registryPath = join(root, ...REGISTRY_RELATIVE_PATH);
  mkdirSync(join(root, ...REGISTRY_RELATIVE_PATH.slice(0, -1)), { recursive: true });
  writeFileSync(registryPath, asJson(registry));

  const accessTablePath = join(root, ...ACCESS_TABLE_RELATIVE_PATH);
  const accessTable = options.access_table ?? ACCESS_TABLE_FIXTURE.access_table;
  writeFileSync(accessTablePath, asJson(accessTable));

  return {
    root,
    staged,
    by_code: new Map(staged.map((row) => [row.project_code, row])),
    registry,
    registry_path: registryPath,
    access_table: accessTable,
    access_table_path: accessTablePath,
  };
}
