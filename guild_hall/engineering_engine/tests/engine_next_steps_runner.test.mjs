import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { compileStageRules } from '../stage_rules/stage_rule_compiler.mjs';

const EXAMPLES = '../../../docs/architecture/workspace/examples/se_stage_rules/';
const load = (name) => JSON.parse(readFileSync(new URL(`${EXAMPLES}${name}`, import.meta.url), 'utf8'));
const FIXTURE = load('next_steps_synthetic_v0.json');
const RUNNER = fileURLToPath(new URL('../tools/engine_next_steps_runner.mjs', import.meta.url));

const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function stage() {
  const base = mkdtempSync(join(tmpdir(), 'engine_next_steps_'));
  const compileDir = join(base, 'compile');
  mkdirSync(compileDir, { recursive: true });
  const compiled = compileStageRules(structuredClone(FIXTURE.compile_request));
  writeFileSync(join(compileDir, 'mapping_table.json'), asJson(compiled.mapping_table));
  writeFileSync(join(compileDir, 'needs_stage_declarations.json'), asJson(compiled.needs_stage_declarations));
  const paths = {
    base,
    compileDir,
    assessment: join(base, 'assessment.json'),
    variant: join(base, 'compiled_variant.json'),
    observations: join(base, 'observations.json'),
    catalog: join(base, 'source_catalog.json'),
    context: join(base, 'context_fill.json'),
    out: join(base, 'out'),
  };
  writeFileSync(paths.assessment, asJson(FIXTURE.assessment_stdout));
  writeFileSync(paths.variant, asJson(FIXTURE.compile_request.compiled_variant));
  writeFileSync(paths.observations, asJson({ artifact_observations: FIXTURE.observations }));
  writeFileSync(paths.catalog, asJson(FIXTURE.source_catalog));
  writeFileSync(paths.context, asJson(FIXTURE.context_fill));
  return paths;
}

const argsFor = (paths, extra = []) => [
  RUNNER,
  '--compile-dir', paths.compileDir,
  '--assessment', paths.assessment,
  '--stage', '030_SRR',
  '--out', paths.out,
  '--compiled-variant', paths.variant,
  '--observations', paths.observations,
  '--source-catalog', paths.catalog,
  '--context-fill', paths.context,
  '--known-at', FIXTURE.known_at,
  ...extra,
];

const run = (args) => spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

test('the runner writes the five answer files and refuses to overwrite them', () => {
  const paths = stage();
  try {
    const first = run(argsFor(paths));
    assert.equal(first.status, 0, first.stderr);
    const printed = JSON.parse(first.stdout);
    assert.equal(printed.status, 'WRITTEN');
    assert.equal(printed.counts.cards, FIXTURE.expected.card_counts.cards);
    assert.deepEqual(printed.counts.requirement_counts,
      FIXTURE.assessment_stdout.role_bound_assessment.current_stage.requirement_counts);

    assert.deepEqual(readdirSync(paths.out).sort(),
      ['guide_cards.json', 'instructions.json', 'next_steps.json', 'next_steps.md', 'receipt.json']);
    const receipt = JSON.parse(readFileSync(join(paths.out, 'receipt.json'), 'utf8'));
    assert.equal(receipt.authority.judgment_changed, false);
    assert.equal(receipt.authority.observation_written, false);
    assert.equal(receipt.effects.erp_writes, 0);
    assert.equal(receipt.effects.model_calls, 0);
    assert.equal(receipt.effects.network_calls, 0);
    assert.equal(receipt.inputs.observations_supplied, FIXTURE.observations.length);

    const markdown = readFileSync(join(paths.out, 'next_steps.md'), 'utf8');
    assert.ok(markdown.startsWith('# 이제 뭐 해야 하나'));
    assert.ok(markdown.includes('## 2. 부족'));

    // An answer is a record of what the engine said at a moment. A second run over the same
    // directory refuses rather than replacing it.
    const second = run(argsFor(paths));
    assert.equal(second.status, 65);
    assert.equal(JSON.parse(second.stderr).code, 'NEXT_STEPS_OUTPUT_EXISTS');
  } finally {
    rmSync(paths.base, { recursive: true, force: true });
  }
});

test('the runner fills the requested count from ready-but-unobserved work only when the engine emitted fewer', () => {
  const paths = stage();
  try {
    const bounded = run(argsFor(paths, ['--top', '3']));
    assert.equal(bounded.status, 0, bounded.stderr);
    const printed = JSON.parse(bounded.stdout);
    // The synthetic assessment already emits three mission candidates, so nothing is filled in.
    assert.equal(printed.next_steps.length, 3);
    assert.deepEqual([...new Set(printed.next_steps.map((step) => step.kind))], ['mission_candidate']);

    const wider = run(argsFor({ ...paths, out: join(paths.base, 'out_wide') }, ['--top', '5']));
    assert.equal(wider.status, 0, wider.stderr);
    const widened = JSON.parse(wider.stdout);
    assert.equal(widened.next_steps.length, 4);
    assert.equal(widened.next_steps.at(-1).kind, 'next_ready');
  } finally {
    rmSync(paths.base, { recursive: true, force: true });
  }
});

test('the runner refuses a missing flag and refuses to read a clock of its own', () => {
  const paths = stage();
  try {
    const missing = run([RUNNER, '--compile-dir', paths.compileDir, '--assessment', paths.assessment]);
    assert.equal(missing.status, 65);
    assert.equal(JSON.parse(missing.stderr).code, 'NEXT_STEPS_ARGUMENT_MISSING');

    const noKnownAt = run([
      RUNNER, '--compile-dir', paths.compileDir, '--assessment', paths.assessment,
      '--stage', '030_SRR', '--out', join(paths.base, 'out_no_known_at'),
    ]);
    assert.equal(noKnownAt.status, 65);
    assert.equal(JSON.parse(noKnownAt.stderr).code, 'NEXT_STEPS_KNOWN_AT_MISSING');
  } finally {
    rmSync(paths.base, { recursive: true, force: true });
  }
});
