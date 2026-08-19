// "폴더 한번 훑어봐" — one observation walk, run by the existing runner.
//
// The tool spawns `tools/artifact_observation_inventory_runner.mjs` with the flags the profile
// already states. It cannot be handed a project root or a spec file: the only thing a caller
// chooses is the name of the output folder, and that folder is created beside the observation run
// the profile names, under `_workspaces`. The runner refuses to overwrite an existing run, so this
// tool inherits that refusal rather than restating it.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

import { ENGINE_MCP_ERROR_CODES, assertInstant, assertSafeName, mcpFail } from '../engine_context.mjs';
import { isPathUnder } from '../project_profile.mjs';
import { FOOTER, heading, lines, table } from '../render.mjs';

export const name = 'observe_scan';
export const title_ko = '눈 돌리기 (폴더 훑기)';
export const description_ko = '과제 폴더를 한 번 걸어 산출물 후보·확인표·자동 확정 관측·청소 알림을 새 실행 폴더에 만든다. 확정은 사람이 한다.';
export const write = true;
export const data_class = 'confidential_contract';
// Every walk makes a new run folder, so calling it twice is two runs, not one.
export const idempotent = false;
export const confidential_fields = Object.freeze(['out_dir']);

export const inputSchema = Object.freeze({
  type: 'object',
  properties: {
    out_dir_name: {
      type: 'string',
      description: '새 실행 폴더 이름(소문자·숫자·밑줄, 예: observation_candidates_20260819_01)',
    },
    known_at: { type: 'string', description: '이 훑기의 기준 시각(UTC ISO-8601). 생략하면 러너가 자기 시계를 쓴다.' },
  },
  required: ['out_dir_name'],
  additionalProperties: false,
});

export async function handler(args, ctx) {
  ctx.requireWrite(name);
  const outName = assertSafeName(args.out_dir_name, 'out_dir_name');
  const knownAt = args.known_at === undefined ? null : assertInstant(args.known_at);
  const outDir = join(dirname(ctx.profile.observations_dir), outName);
  // `assertSafeName` already forbids a separator, but the containment is what actually matters, so
  // it is asserted rather than inferred from the name rule.
  if (!isPathUnder(outDir, ctx.profile.outputs_root)) {
    mcpFail(ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID,
      'a walk writes under the project output root and nowhere else', {});
  }

  const runnerPath = join(ctx.engine_root, 'tools', 'artifact_observation_inventory_runner.mjs');
  const flags = [
    runnerPath,
    '--project-root', ctx.profile.project_root,
    '--out', outDir,
    '--compiled-variant', ctx.profile.compiled_variant,
  ];
  for (const overlay of ctx.profile.overlays) flags.push('--overlay', overlay);
  if (ctx.profile.alias_patterns !== null) flags.push('--alias-patterns', ctx.profile.alias_patterns);
  if (knownAt !== null) flags.push('--known-at', knownAt);

  const run = await spawnRunner(flags);
  if (run.status !== 0) {
    mcpFail(ENGINE_MCP_ERROR_CODES.RUNNER_REFUSED, 'the observation runner refused this walk',
      { exit_code: run.status, stderr_head: run.stderr.slice(0, 400) });
  }
  let counts;
  try {
    counts = JSON.parse(run.stdout);
  } catch {
    mcpFail(ENGINE_MCP_ERROR_CODES.RUNNER_REFUSED, 'the observation runner printed no JSON', {});
  }

  const structured = {
    out_dir: ctx.pointer(outDir),
    out_dir_name: outName,
    known_at: knownAt,
    counts,
    note: '자동 확정 3조건을 통과한 것만 관측이 된다. 나머지는 확인표에서 사람이 정한다(D37).',
  };

  const markdown = lines(
    `# 훑기 완료 — ${outName}`,
    table(['걸음', '후보', '자동 확정', '보류(이름 단서 없음)', '확인 대기', '관측', '청소 항목'], [[
      counts.files_inventoried, counts.candidates, counts.auto_confirmed,
      counts.auto_confirm_withheld_no_own_cue, counts.needs_owner_confirmation,
      counts.artifact_observations, counts.housekeeping_items,
    ]]),
    heading('어디에'),
    structured.out_dir,
    structured.note,
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
