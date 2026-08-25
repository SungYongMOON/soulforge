import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EE_ROOT = join(HERE, '..', '..');

test('Legacy Compatibility: kernel validator re-exports match core validators', async () => {
  const kernelDir = join(EE_ROOT, 'kernel');
  const files = readdirSync(kernelDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../kernel/${f}`);
    const can = await import(`../validators/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `kernel/${f} export "${key}" matches core`);
    }
  }
});

test('Legacy Compatibility: assembly re-exports match core/runtime', async () => {
  const assemblyDir = join(EE_ROOT, 'assembly');
  const files = readdirSync(assemblyDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../assembly/${f}`);
    const can = await import(`../runtime/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `assembly/${f} export "${key}" matches core/runtime`);
    }
  }
});

test('Legacy Compatibility: stage_rules re-exports match engines/systems_engineering/rules', async () => {
  const stageRulesDir = join(EE_ROOT, 'stage_rules');
  const files = readdirSync(stageRulesDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../stage_rules/${f}`);
    const can = f === 'quality_readiness_rules.mjs'
      ? await import(`../../engines/quality_readiness/rules/${f}`)
      : await import(`../../engines/systems_engineering/rules/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `stage_rules/${f} export "${key}" matches domain`);
    }
  }
});

test('Legacy Compatibility: subjects re-exports match engines evaluator', async () => {
  const subjectsDir = join(EE_ROOT, 'subjects');
  const files = readdirSync(subjectsDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../subjects/${f}`);
    const can = f === 'quality_readiness.mjs'
      ? await import(`../../engines/quality_readiness/evaluator/${f}`)
      : await import(`../../engines/systems_engineering/evaluator/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `subjects/${f} export "${key}" matches evaluator`);
    }
  }
});

test('Legacy Compatibility: observation re-exports match engines/systems_engineering/observation', async () => {
  const obsDir = join(EE_ROOT, 'observation');
  const files = readdirSync(obsDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../observation/${f}`);
    const can = await import(`../../engines/systems_engineering/observation/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `observation/${f} export "${key}" matches SE`);
    }
  }
});

test('Legacy Compatibility: guidance re-exports match engines/systems_engineering/guidance', async () => {
  const guiDir = join(EE_ROOT, 'guidance');
  const files = readdirSync(guiDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../guidance/${f}`);
    const can = await import(`../../engines/systems_engineering/guidance/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `guidance/${f} export "${key}" matches SE`);
    }
  }
});

test('Legacy Compatibility: evaluation re-exports match engines/systems_engineering/evaluation', async () => {
  const evalDir = join(EE_ROOT, 'evaluation');
  const files = readdirSync(evalDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../evaluation/${f}`);
    const can = await import(`../../engines/systems_engineering/evaluation/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `evaluation/${f} export "${key}" matches SE`);
    }
  }
});

test('Legacy Compatibility: mcp re-exports match engines/systems_engineering/mcp', async () => {
  const mcpDir = join(EE_ROOT, 'mcp');
  const files = readdirSync(mcpDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../mcp/${f}`);
    const can = await import(`../../engines/systems_engineering/mcp/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `mcp/${f} export "${key}" matches SE`);
    }
  }
});

test('Legacy Compatibility: fixtures re-exports match engines/systems_engineering/fixtures', async () => {
  const fixDir = join(EE_ROOT, 'fixtures');
  const files = readdirSync(fixDir).filter(f => f.endsWith('.mjs'));
  for (const f of files) {
    const leg = await import(`../../fixtures/${f}`);
    const can = await import(`../../engines/systems_engineering/fixtures/${f}`);
    for (const key of Object.keys(can)) {
      assert.equal(leg[key], can[key], `fixtures/${f} export "${key}" matches SE`);
    }
  }
});
