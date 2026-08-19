// "지금 판단해줘" — compile, generate the packet, and run the zero-write judgement once per stage.
//
// Every step here already exists: `compileStageRules`, `generatePilotPacketFromStageRules`, and
// the pilot runner invoked exactly the way 07장 §7.3 states — a launch file plus its sha, passed as
// an absolute path. The tool adds no judgement of its own; what it adds is the file plumbing, and
// each write is create-only so a run can never quietly replace an earlier one.
//
// Where things land: the packet and the compiled policy go to the project plane (the runner
// resolves the packet locator against the project root, so they cannot live anywhere else), the
// launch and the assessment stdout go to the metadata plane under the profile's runs root.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join, relative, sep } from 'node:path';

import { canonicalise } from '../../kernel/canonical.mjs';
import { generatePilotPacketFromStageRules } from '../../stage_rules/pilot_packet_generator.mjs';
import {
  AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
} from '../../tools/ax_se_project_context_pilot_runner.mjs';
import {
  ENGINE_MCP_ERROR_CODES, assertInstant, assertNewRunId, mcpFail,
} from '../engine_context.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'judge_run';
export const title_ko = '판단 실행';
export const description_ko = '단계별로 규칙을 컴파일하고 packet을 만들어 엔진을 1회 돌린다(엔진 쓰기 0). 영수증은 실행 폴더에 create-only로 남는다.';
export const write = true;
// ⓑ, not ⓒ: a judgement run is team work (Owner 2026-08-19 opened it to 체계·품질). What is ⓒ is
// *where* it wrote — those fields are named below and blanked for a role without that class.
export const data_class = 'team_judgment';
// Create-only: the same revision_label twice refuses instead of writing a second run.
export const idempotent = true;
export const confidential_fields = Object.freeze([
  'summary', 'stages[].compile_dir', 'stages[].launch', 'stages[].assessment',
]);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    stage_codes: {
      type: 'array', minItems: 1, maxItems: 16, items: { type: 'string' },
      description: '판단할 엔진 단계 코드 목록',
    },
    known_at: { type: 'string', description: '판단 기준 시각(UTC ISO-8601). 이 층은 시계를 읽지 않는다.' },
    revision_label: {
      type: 'string',
      description: '이 실행의 이름(소문자·숫자·밑줄). 실행 폴더 이름이자 정책 revision label이 된다.',
    },
  },
  required: ['stage_codes', 'known_at', 'revision_label'],
  additionalProperties: false,
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The array-order rules the pilot runner applies when it re-canonicalises a packet.
 *
 * This mirrors a helper the runner keeps private. It is safe to mirror because the result is
 * checked rather than trusted: the generator computes `pilot_packet_sha256` over the bytes it
 * expects, and this tool refuses to write a packet whose bytes hash to anything else.
 */
function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = '') => {
    if (Array.isArray(node)) {
      rules[path] = 'insertion_ordered';
      for (const child of node) visit(child, `${path}[]`);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

const canonicalBytes = (value) =>
  Buffer.from(`${canonicalise(value, insertionOrderRules(value))}\n`, 'utf8');

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  if (!Array.isArray(args.stage_codes) || args.stage_codes.length === 0) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID, 'stage_codes must be a non-empty array', {});
  }
  const knownAt = assertInstant(args.known_at);
  // The run id names a folder other folders live under, so it is the short pattern (<=24)
  // rather than the general safe-name one.
  const runId = assertNewRunId(args.revision_label, 'revision_label');
  const stageCodes = [];
  for (const code of args.stage_codes) stageCodes.push(await ctx.assertKnownStage(code));

  const basePacket = await ctx.loadBasePacket();
  const baseLaunch = await ctx.loadBaseLaunch();
  const observations = await ctx.loadObservations();
  const runnerPath = join(ctx.engine_root, 'tools', 'ax_se_project_context_pilot_runner.mjs');

  const stages = [];
  for (const stageCode of stageCodes) {
    const compiled = await ctx.compile([stageCode]);
    const requirements = compiled.engine_stage_policy_material.stages[0].requirements;
    // The common projection binding has to name a requirement this policy actually carries. The
    // review record of the gate is the one every gate has; failing that, the first requirement.
    const commonBinding = requirements.find((row) =>
      row.requirement_id.includes('review_minutes'))?.requirement_id
      ?? requirements[0].requirement_id;

    const generated = generatePilotPacketFromStageRules({
      base_packet: structuredClone(basePacket),
      engine_stage_policy_material: structuredClone(compiled.engine_stage_policy_material),
      mapping_table: structuredClone(compiled.mapping_table),
      artifact_observations: structuredClone(observations.rows),
      policy_identity: {
        policy_id: compiled.expected_artifact_policy.policy_identity.policy_id,
        revision_label: `${runId}_${stageCode}`,
      },
      packet_identity_seed: `${ctx.profile.project_code}_${runId}_${stageCode}`,
      known_at: knownAt,
      common_binding_requirement_id: commonBinding,
    });

    const compileDir = join(ctx.profile.outputs_root, runId, stageCode);
    const packetPath = join(compileDir, 'pilot_packet.json');
    const packetBytes = canonicalBytes(generated.pilot_packet);
    if (sha256(packetBytes) !== generated.launch_material.pilot_packet_sha256) {
      mcpFail(ENGINE_MCP_ERROR_CODES.RUNNER_REFUSED,
        'the canonical packet bytes do not match the digest the generator computed',
        { stage_code: stageCode });
    }
    const locator = relative(ctx.profile.project_root, packetPath).split(sep).join('/');
    if (locator.startsWith('..')) {
      mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
        'the packet must live under the project root the runner binds', {});
    }

    const launch = {
      schema_version: AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA,
      feature_state: baseLaunch.feature_state,
      mode: baseLaunch.mode,
      pilot_policy_revision: AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION,
      knowledge_view_request: structuredClone(generated.pilot_packet.knowledge_view_request),
      knowledge_view_authority_grant:
        structuredClone(generated.pilot_packet.knowledge_view_authority_grant),
      expected_knowledge_view_authority_grant_ref:
        structuredClone(generated.launch_material.expected_knowledge_view_authority_grant_ref),
      expected_project_binding_ref:
        structuredClone(generated.launch_material.expected_project_binding_ref),
      expected_pilot_grant_ref: structuredClone(generated.launch_material.expected_pilot_grant_ref),
      expected_project_source_binding_manifest_ref:
        structuredClone(generated.launch_material.expected_project_source_binding_manifest_ref),
      expected_role_roster_ref: structuredClone(generated.launch_material.expected_role_roster_ref),
      expected_common_projection_bindings_fingerprint_sha256:
        generated.launch_material.expected_common_projection_bindings_fingerprint_sha256,
      pilot_packet_relative_locator: locator,
      pilot_packet_sha256: generated.launch_material.pilot_packet_sha256,
    };
    const launchBytes = canonicalBytes(launch);
    const launchPath = join(ctx.profile.runs_root, runId, 'launches', `${stageCode}.launch.json`);

    // Every target is labelled, because the path budget refuses by field name rather than by
    // printing the path a refusal is about (경로는 답에 싣지 않는다).
    await ctx.writeCreateOnly(join(compileDir, 'expected_artifact_policy.json'),
      asJson(compiled.expected_artifact_policy), { field: 'expected_artifact_policy' });
    await ctx.writeCreateOnly(join(compileDir, 'engine_stage_policy_material.json'),
      asJson(compiled.engine_stage_policy_material), { field: 'engine_stage_policy_material' });
    await ctx.writeCreateOnly(join(compileDir, 'mapping_table.json'),
      asJson(compiled.mapping_table), { field: 'mapping_table' });
    await ctx.writeCreateOnly(join(compileDir, 'needs_stage_declarations.json'),
      asJson(compiled.needs_stage_declarations), { field: 'needs_stage_declarations' });
    await ctx.writeCreateOnly(join(compileDir, 'compiler_receipt.json'),
      asJson(compiled.receipt), { field: 'compiler_receipt' });
    await ctx.writeCreateOnly(packetPath, packetBytes.toString('utf8'),
      { field: 'pilot_packet' });
    await ctx.writeCreateOnly(launchPath, launchBytes.toString('utf8'), { field: 'launch' });

    const run = await spawnRunner([
      runnerPath, '--launch', launchPath, '--launch-sha256', sha256(launchBytes),
    ]);
    const receiptPath = join(ctx.profile.runs_root, runId, 'receipts',
      `assessment_stdout_${stageCode}.json`);
    await ctx.writeCreateOnly(receiptPath, run.stdout, { field: 'assessment_stdout' });

    let parsed = null;
    try {
      parsed = JSON.parse(run.stdout);
    } catch {
      parsed = null;
    }
    const bound = parsed?.role_bound_assessment ?? null;
    stages.push({
      stage_code: stageCode,
      exit_code: run.status,
      status: parsed?.status ?? null,
      assessment_state: bound?.assessment_state ?? null,
      requirement_counts: bound?.current_stage?.requirement_counts ?? null,
      mission_candidates: (bound?.next_mission_candidates ?? []).map((row) => ({
        rank: row.rank, subject_id: row.subject_id, mission_kind: row.mission_kind,
        required_capability: row.role_decision?.required_capability ?? null,
      })),
      engine_requirements: compiled.mapping_table
        .filter((row) => row.stage_code === stageCode && row.engine_requirement_id !== null).length,
      unbound_observations: generated.receipt.unbound_observations?.length ?? 0,
      effects_all_zero: parsed === null ? null
        : Object.values(parsed.effects ?? {}).every((value) => value === 0 || value === false),
      compile_dir: ctx.pointer(compileDir),
      launch: ctx.pointer(launchPath),
      assessment: ctx.pointer(receiptPath),
      stderr_head: run.status === 0 ? null : run.stderr.slice(0, 300),
    });
  }

  const summaryPath = join(ctx.profile.runs_root, runId, 'receipts', 'mcp_run_summary.json');
  const summary = {
    schema_version: 'soulforge.engine_mcp_judge_run_summary.v0',
    run_id: runId,
    known_at: knownAt,
    engine_version: ctx.engine_version,
    project_code: ctx.profile.project_code,
    observations_supplied: observations.rows.length,
    observation_sources: observations.sources,
    stages: stages.map(({ stderr_head, ...row }) => row),
  };
  await ctx.writeCreateOnly(summaryPath, asJson(summary), { field: 'run_summary' });

  const structured = {
    run_id: runId,
    known_at: knownAt,
    summary: ctx.pointer(summaryPath),
    observations_supplied: observations.rows.length,
    stages,
  };

  const markdown = lines(
    `# 판단 실행 ${runId}`,
    table(['단계', '요구', '충족', '결손', '불명', '상태', 'effect 0'],
      stages.map((row) => [
        row.stage_code, row.engine_requirements,
        row.requirement_counts?.satisfied, row.requirement_counts?.missing,
        row.requirement_counts?.unknown, row.assessment_state, row.effects_all_zero,
      ])),
    heading('영수증'),
    table(['단계', '영수증'], stages.map((row) => [row.stage_code, row.assessment])),
    FOOTER,
  );

  return { markdown, structured };
}

function spawnRunner(flags) {
  return new Promise((settle, reject) => {
    const child = spawn(process.execPath, flags, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => settle({ status, stdout, stderr }));
  });
}
