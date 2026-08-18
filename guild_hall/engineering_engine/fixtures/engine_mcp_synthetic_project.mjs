// Stages a synthetic project on disk so the MCP door can be driven end to end.
//
// The data is entirely the two public fixtures — the ordering/guidance fixture supplies the rules
// and the assessment, the profile fixture supplies the observation run — and this module only
// writes them into the shape a profile names: a `_workspaces` project plane, a `_workmeta`
// metadata plane, and one profile file pointing at both. Nothing here invents a rule, a count or a
// judgement, and no real project material is touched.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const EXAMPLES = '../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));

export const NEXT_STEPS_FIXTURE = load('next_steps_synthetic_v0.json');
export const PROFILE_FIXTURE = load('project_profile_synthetic_v0.json');

export const SYNTHETIC_PROJECT_CODE = 'SYN-000';
export const SYNTHETIC_RUN_ID = 'synthetic_run_01';
export const SYNTHETIC_STAGE = '030_SRR';

const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Writes the synthetic project under `root` and returns the paths a caller needs.
 *
 * @param root an empty directory that plays the part of a repository root
 */
export function stageSyntheticProject(root) {
  const project = join(root, '_workspaces', SYNTHETIC_PROJECT_CODE);
  const outputs = join(project, '06_validation');
  const rules = join(outputs, 'rules');
  const observations = join(outputs, 'observations');
  const runsRoot = join(root, '_workmeta', SYNTHETIC_PROJECT_CODE, 'runs');
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

  const profile = {
    schema_version: 'soulforge.engine_project_profile.v0',
    project_code: SYNTHETIC_PROJECT_CODE,
    business_type: PROFILE_FIXTURE.profile.business_type,
    prime: PROFILE_FIXTURE.profile.prime,
    quality_grade: PROFILE_FIXTURE.profile.quality_grade,
    compiled_variant: compiledVariant,
    overlays: [],
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
  const profilePath = join(outputs, 'project_profile.json');
  writeFileSync(profilePath, asJson(profile));

  return {
    root,
    profile,
    profile_path: profilePath,
    project_root: project,
    outputs_root: outputs,
    observations_dir: observations,
    receipts_dir: receipts,
    runs_root: runsRoot,
    run_id: SYNTHETIC_RUN_ID,
    stage_code: SYNTHETIC_STAGE,
    compiled_variant: compiledVariant,
    known_at: NEXT_STEPS_FIXTURE.known_at,
  };
}
