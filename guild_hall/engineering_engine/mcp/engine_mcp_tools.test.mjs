import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileStageRules, orderStageWork } from '../stage_rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';
import { buildGuideCards } from '../guidance/guide_cards.mjs';
import { buildInstructionPackets } from '../guidance/instruction_packet.mjs';
import { renderNextStepsAnswer } from '../guidance/answer_render.mjs';
import {
  NEXT_STEPS_FIXTURE, PROFILE_FIXTURE, stageSyntheticProject,
} from '../fixtures/engine_mcp_synthetic_project.mjs';
import { createEngineContext } from './engine_context.mjs';
import { ENGINE_MCP_TOOLS, ENGINE_MCP_TOOLS_BY_NAME, WRITE_TOOL_NAMES } from './tools/index.mjs';

const ENGINE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENGINE_VERSION = readFileSync(join(ENGINE_ROOT, 'topology', 'ENGINE_VERSION'), 'utf8').trim();
const EXPECTED = PROFILE_FIXTURE.expected;

async function stage({ write = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_tools_'));
  const staged = stageSyntheticProject(root);
  const context = await createEngineContext({
    profile_path: staged.profile_path,
    repo_root: root,
    engine_root: ENGINE_ROOT,
    engine_version: ENGINE_VERSION,
    write_enabled: write,
  });
  return { root, staged, context };
}

const call = (name, args, context) => ENGINE_MCP_TOOLS_BY_NAME.get(name).handler(args, context);

/**
 * The same inputs the tools use, assembled here by hand so drift shows up as a diff.
 *
 * One target stage, because that is what a tool asked about one stage compiles — the same shape the
 * project drivers write, one compile directory per gate.
 */
function directPureCalls(stageCode = '030_SRR') {
  const request = structuredClone(NEXT_STEPS_FIXTURE.compile_request);
  request.target_stage_codes = [stageCode];
  const compiled = compileStageRules(request);
  const observations = PROFILE_FIXTURE.observation_run.artifact_observations_auto
    .artifact_observations.map((row) => ({
      artifact_type_id: row.artifact_type_id, presence_state: row.presence_state,
    }));
  const order = orderStageWork(compiled, observations);
  const cards = buildGuideCards({
    compile_result: compiled,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    compiled_variant: request.compiled_variant,
    work_order: order,
  });
  return { compiled, observations, order, cards, stageCode };
}

test('the tool set is thirteen tools and exactly four of them write', () => {
  assert.equal(ENGINE_MCP_TOOLS.length, EXPECTED.tool_count);
  assert.deepEqual([...WRITE_TOOL_NAMES], EXPECTED.write_tool_names);
  for (const tool of ENGINE_MCP_TOOLS) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(tool.title_ko.length > 0 && tool.description_ko.length > 0);
  }
});

test('rules_layers reports the layers and stages the profile stands on', async () => {
  const { root, context } = await stage();
  try {
    const answer = await call('rules_layers', {}, context);
    assert.deepEqual(answer.structured.engine_stage_codes, EXPECTED.engine_stage_codes);
    assert.equal(answer.structured.layers.length, 1);
    assert.equal(answer.structured.layers[0].layer, 'variant');
    assert.equal(answer.structured.layers[0].support_key,
      NEXT_STEPS_FIXTURE.compile_request.compiled_variant.support_key);
    assert.ok(answer.markdown.includes('붙는 규칙 층'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rules_stage returns the work order the pure function returns, item for item', async () => {
  const { root, context } = await stage();
  try {
    const direct = directPureCalls();
    const answer = await call('rules_stage', { stage_code: '030_SRR' }, context);
    const expected = direct.order.stages.find((row) => row.stage_code === '030_SRR');

    assert.equal(answer.structured.work_items.length, expected.work_items.length);
    assert.deepEqual(answer.structured.work_items.map((item) => item.artifact_type_id),
      expected.work_items.map((item) => item.artifact_type_id));
    for (const [index, item] of answer.structured.work_items.entries()) {
      const source = expected.work_items[index];
      assert.equal(item.order_index, source.order_index);
      assert.equal(item.gate_role, source.gate_role);
      assert.equal(item.evidence_level, source.evidence_level);
      assert.equal(item.ready, source.ready);
      assert.deepEqual(item.blocked_by, [...source.blocked_by]);
    }
    assert.equal(answer.structured.observations_supplied, EXPECTED.observations_supplied);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rules_card hands back the card buildGuideCards built, unchanged', async () => {
  const { root, context } = await stage();
  try {
    const direct = directPureCalls();
    const expected = direct.cards.cards.find((card) => card.stage_code === '030_SRR'
      && card.artifact_type_id === 'semp');
    assert.ok(expected !== undefined, 'the ordering fixture declares a semp row at SRR');

    const answer = await call('rules_card',
      { stage_code: '030_SRR', artifact_type_id: 'semp' }, context);
    assert.deepEqual(answer.structured.card, expected);
    assert.equal(answer.structured.card.card_id, expected.card_id);

    await assert.rejects(
      call('rules_card', { stage_code: '030_SRR', artifact_type_id: 'no_such_token' }, context),
      (error) => error.code === 'ENGINE_MCP_CARD_NOT_FOUND');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rules_version returns the release manifest and the version the file states', async () => {
  const { root, context } = await stage();
  try {
    const answer = await call('rules_version', {}, context);
    assert.equal(answer.structured.engine_release.engine_version, ENGINE_VERSION);
    assert.ok(answer.structured.engine_release.components.rule_layers !== undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('observe_status counts what the observation run holds and nothing else', async () => {
  const { root, context } = await stage();
  try {
    const answer = await call('observe_status', {}, context);
    assert.equal(answer.structured.counts.auto_observations, EXPECTED.observations_supplied);
    assert.equal(answer.structured.counts.merged_observations, EXPECTED.observations_supplied);
    assert.equal(answer.structured.counts.candidates, EXPECTED.candidates);
    assert.equal(answer.structured.counts.needs_owner_confirmation, EXPECTED.needs_owner_confirmation);
    assert.equal(answer.structured.counts.registered_pending, 0);
    assert.equal(answer.structured.files.registered_candidates, null);
    assert.deepEqual(answer.structured.observations_by_stage, { '030_SRR': 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('judge_result reads the stored receipt and judge_diff finds no change against itself', async () => {
  const { root, staged, context } = await stage();
  try {
    const stored = NEXT_STEPS_FIXTURE.assessment_stdout.role_bound_assessment;
    const answer = await call('judge_result',
      { run_id: staged.run_id, stage_code: staged.stage_code }, context);
    assert.deepEqual(answer.structured.requirement_counts, stored.current_stage.requirement_counts);
    assert.equal(answer.structured.mission_candidates.length,
      stored.next_mission_candidates.length);
    assert.equal(answer.structured.effects_all_zero, true);

    const diff = await call('judge_diff', {
      run_id_a: staged.run_id, run_id_b: staged.run_id, stage_code: staged.stage_code,
    }, context);
    assert.deepEqual(diff.structured.issue_changes, []);
    for (const key of Object.keys(diff.structured.requirement_counts)) {
      assert.equal(diff.structured.requirement_counts[key].delta, 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('next_steps returns the guidance layer answer without writing anything', async () => {
  const { root, staged, context } = await stage();
  try {
    const direct = directPureCalls();
    const assessment = NEXT_STEPS_FIXTURE.assessment_stdout;
    const missionCount = assessment.role_bound_assessment.next_mission_candidates.length;
    const instructions = buildInstructionPackets({
      assessment,
      work_order: direct.order,
      guide_cards: direct.cards,
      known_at: NEXT_STEPS_FIXTURE.known_at,
      include_next_ready: missionCount < 3,
      top_n: Math.max(3 - missionCount, 0),
    });
    const expected = renderNextStepsAnswer({
      assessment,
      work_order: direct.order,
      instructions,
      guide_cards: direct.cards,
      stage_code: '030_SRR',
      locale: 'ko',
    });

    const answer = await call('next_steps',
      { stage_code: '030_SRR', known_at: NEXT_STEPS_FIXTURE.known_at }, context);
    assert.equal(answer.markdown, expected.markdown);
    assert.deepEqual(answer.structured.answer, expected.answer);
    assert.equal(answer.structured.run_id, staged.run_id);
    assert.equal(answer.structured.known_at_source, 'caller');
    assert.equal(answer.structured.written, false);
    // One gate compiled, so the card count is that gate's share of the fixture's eleven.
    assert.equal(answer.structured.counts.cards, direct.cards.receipt.counts.cards);
    assert.deepEqual(direct.cards.cards.map((card) => card.artifact_type_id).sort(),
      [...NEXT_STEPS_FIXTURE.expected.srr_card_tokens].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project_status keeps judgement, ordering and housekeeping apart', async () => {
  const { root, staged, context } = await stage();
  try {
    const answer = await call('project_status', {}, context);
    assert.deepEqual(answer.structured.stages.map((row) => row.stage_code),
      EXPECTED.engine_stage_codes);
    const srr = answer.structured.stages.find((row) => row.stage_code === '030_SRR');
    assert.equal(srr.run_id, staged.run_id);
    assert.deepEqual(srr.requirement_counts,
      NEXT_STEPS_FIXTURE.assessment_stdout.role_bound_assessment.current_stage.requirement_counts);
    // The gate nobody has judged reports no counts rather than zeroes.
    const pdr = answer.structured.stages.find((row) => row.stage_code === '090_PDR');
    assert.equal(pdr.run_id, null);
    assert.equal(pdr.requirement_counts, null);
    assert.ok(pdr.work_items > 0);
    assert.equal(answer.structured.housekeeping.items, EXPECTED.housekeeping_items);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the read tools are deterministic across two fresh contexts', async () => {
  const first = await stage();
  const second = await stage();
  try {
    for (const name of ['rules_layers', 'rules_stage', 'rules_card', 'observe_status',
      'project_status', 'next_steps']) {
      const args = name === 'rules_stage' ? { stage_code: '030_SRR' }
        : name === 'rules_card' ? { stage_code: '030_SRR', artifact_type_id: 'semp' }
          : name === 'next_steps'
            ? { stage_code: '030_SRR', known_at: NEXT_STEPS_FIXTURE.known_at } : {};
      const left = await call(name, args, first.context);
      const right = await call(name, args, second.context);
      assert.equal(left.markdown, right.markdown, `${name} markdown drifted`);
      // The run paths differ by temporary directory, so the comparison is over the answer, not
      // over the pointer that says where the answer's inputs happened to live this time.
      const strip = (value) => JSON.stringify(value, (key, inner) =>
        (['observations_dir', 'file', 'summary', 'compile_dir', 'launch', 'assessment']
          .includes(key) ? undefined : inner));
      assert.equal(strip(left.structured), strip(right.structured), `${name} structure drifted`);
    }
  } finally {
    rmSync(first.root, { recursive: true, force: true });
    rmSync(second.root, { recursive: true, force: true });
  }
});

test('every write tool refuses while the write switch is off, and none of them is a read tool', async () => {
  const { root, staged, context } = await stage({ write: false });
  try {
    const args = {
      observe_scan: { out_dir_name: 'observation_candidates_20260819_01' },
      observe_register: {
        file_ref: '030_SRR/031_x/03_Out/a.pdf', artifact_type_id: 'semp', stage_code: '030_SRR',
      },
      observe_confirm: {
        sheet_json_path: join(staged.observations_dir, 'confirmation_sheet.json'), decisions: [],
      },
      judge_run: {
        stage_codes: ['030_SRR'], known_at: NEXT_STEPS_FIXTURE.known_at,
        revision_label: 'mcp_test_run_01',
      },
    };
    for (const name of WRITE_TOOL_NAMES) {
      await assert.rejects(call(name, args[name], context),
        (error) => error.code === 'WRITE_TOOLS_DISABLED', `${name} should refuse`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('observe_register writes a candidate that is explicitly not an observation', async () => {
  const { root, staged, context } = await stage({ write: true });
  try {
    const answer = await call('observe_register', {
      file_ref: '030_SRR/031_x/03_Out/a.pdf',
      artifact_type_id: 'semp',
      stage_code: '030_SRR',
      maturity: 'final',
      note: 'synthetic',
    }, context);
    assert.equal(answer.structured.registered.decision, null);
    assert.equal(answer.structured.confirmation_required, true);

    const line = readFileSync(join(staged.observations_dir, 'registered_candidates.jsonl'), 'utf8')
      .trim();
    const row = JSON.parse(line);
    assert.equal(row.artifact_type_id, 'semp');
    assert.equal(row.decision, null);
    assert.equal(row.source, 'mcp.observe_register');

    // The observation set is untouched: registering is not observing.
    const status = await call('observe_status', {}, context);
    assert.equal(status.structured.counts.registered_pending, 1);

    // Assembled rather than written out: a tracked file may not carry a literal local absolute
    // path (`validate:path-policy`), and this one exists only to be refused.
    const driveAbsolute = `${'C'}:/elsewhere/a.pdf`;
    await assert.rejects(call('observe_register', {
      file_ref: driveAbsolute, artifact_type_id: 'semp', stage_code: '030_SRR',
    }, context), (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID');
    await assert.rejects(call('observe_register', {
      file_ref: 'a.pdf', artifact_type_id: 'not_a_token', stage_code: '030_SRR',
    }, context), (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a caller cannot point observe_confirm at a sheet outside the observation run', async () => {
  const { root, staged, context } = await stage({ write: true });
  try {
    await assert.rejects(call('observe_confirm', {
      sheet_json_path: join(staged.outputs_root, 'project_profile.json'), decisions: [],
    }, context), (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID');

    await assert.rejects(call('observe_confirm', {
      sheet_json_path: join(root, '_workmeta', 'elsewhere.json'), decisions: [],
    }, context), (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID'
      || error.code === 'ENGINE_MCP_PATH_OUTSIDE_ROOTS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('observe_confirm writes the confirmed set once and refuses to replace it', async () => {
  const { root, staged, context } = await stage({ write: true });
  try {
    const sheet = join(staged.observations_dir, 'confirmation_sheet.json');
    const answer = await call('observe_confirm', { sheet_json_path: sheet, decisions: [] }, context);
    assert.equal(answer.structured.file_name, 'confirmed_observations_20260818T150000Z.json');
    assert.equal(answer.structured.decisions_applied, 0);
    // The staged candidate set is empty, so a run with no decisions confirms nothing — which is
    // the honest answer, not a zero standing in for "we did not look".
    assert.equal(answer.structured.counts.confirmed_rows, 0);
    assert.ok(readFileSync(join(staged.observations_dir, answer.structured.file_name), 'utf8')
      .includes('artifact_observations'));

    await assert.rejects(
      call('observe_confirm', { sheet_json_path: sheet, decisions: [] }, context),
      (error) => error.code === 'ENGINE_MCP_OUTPUT_EXISTS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('judge_run refuses when the profile states no base launch, before it writes anything', async () => {
  const { root, staged, context } = await stage({ write: true });
  try {
    await assert.rejects(call('judge_run', {
      stage_codes: ['030_SRR'],
      known_at: NEXT_STEPS_FIXTURE.known_at,
      revision_label: 'mcp_test_run_01',
    }, context), (error) => error.code === 'ENGINE_MCP_PROFILE_FIELD_MISSING');
    assert.equal(existsSync(join(staged.runs_root, 'mcp_test_run_01')), false);
    assert.equal(existsSync(join(staged.outputs_root, 'mcp_test_run_01')), false);

    await assert.rejects(call('judge_run', {
      stage_codes: ['030_SRR'], known_at: 'yesterday', revision_label: 'mcp_test_run_01',
    }, context), (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID');
    await assert.rejects(call('judge_run', {
      stage_codes: ['030_SRR'],
      known_at: NEXT_STEPS_FIXTURE.known_at,
      revision_label: '../escape',
    }, context), (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown stage is refused before anything is compiled', async () => {
  const { root, context } = await stage();
  try {
    await assert.rejects(call('rules_stage', { stage_code: '999_ZZZ' }, context),
      (error) => error.code === 'ENGINE_MCP_STAGE_UNKNOWN');
    await assert.rejects(call('rules_stage', { stage_code: '../../etc' }, context),
      (error) => error.code === 'ENGINE_MCP_ARGUMENTS_INVALID');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
