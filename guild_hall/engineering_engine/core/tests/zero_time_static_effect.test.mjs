import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIR = path.resolve(HERE, '..');
const ENGINE_DIR = path.resolve(CORE_DIR, '..');

const FORBIDDEN_DYNAMIC_TOKENS = [
  'Date.now',
  'new Date()',
  'new Date(',
  'Math.random',
  'process.hrtime',
  'performance.now',
];

const FORBIDDEN_SIDE_EFFECT_MODULES = [
  'node:fs',
  'node:net',
  'node:http',
  'node:https',
  'node:child_process',
  'fetch(',
  'XMLHttpRequest',
];

export const CORE_DIRECTORIES_TO_SCAN = [
  'interfaces',
  'validators',
  'runtime',
  'rule_assembly',
  'evaluation_runtime',
];

export const SEAM_FILES_TO_SCAN = [
  path.join(ENGINE_DIR, 'engines', 'systems_engineering', 'compiler', 'se_compiler_adapter.mjs'),
  path.join(ENGINE_DIR, 'engines', 'systems_engineering', 'evaluator', 'se_evaluator_adapter.mjs'),
  path.join(ENGINE_DIR, 'engines', 'quality_readiness', 'compiler', 'quality_readiness_compiler_adapter.mjs'),
  path.join(ENGINE_DIR, 'engines', 'quality_readiness', 'evaluator', 'quality_readiness_evaluator_adapter.mjs'),
];

function scanFiles(dir, forbiddenTokens) {
  const violations = [];
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return violations; }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'tools' && entry.name !== 'fixtures' && entry.name !== 'schemas' && entry.name !== 'scratch') {
        violations.push(...scanFiles(fullPath, forbiddenTokens));
      }
    } else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') && !entry.name.includes('.test.')) {
      const source = readFileSync(fullPath, 'utf8');
      for (const token of forbiddenTokens) {
        if (source.includes(token)) {
          violations.push({ file: fullPath, token });
        }
      }
    }
  }
  return violations;
}

function scanSeamFiles(seamPaths, forbiddenTokens) {
  const violations = [];
  for (const filePath of seamPaths) {
    if (existsSync(filePath)) {
      const source = readFileSync(filePath, 'utf8');
      for (const token of forbiddenTokens) {
        if (source.includes(token)) {
          violations.push({ file: filePath, token });
        }
      }
    }
  }
  return violations;
}

test('Static Effect Analysis: all Core subdirectories are explicitly classified', () => {
  const entries = readdirSync(CORE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const knownIgnored = new Set(['tests', 'tools', 'fixtures', 'schemas', 'scratch']);
  const scanned = new Set(CORE_DIRECTORIES_TO_SCAN);

  for (const name of entries) {
    assert.equal(
      scanned.has(name) || knownIgnored.has(name),
      true,
      `Core subdirectory "${name}" is neither scanned nor explicitly ignored`
    );
  }
  for (const name of CORE_DIRECTORIES_TO_SCAN) {
    assert.equal(entries.includes(name), true, `Declared scan directory "${name}" does not exist in core/`);
  }
  for (const seamPath of SEAM_FILES_TO_SCAN) {
    assert.equal(existsSync(seamPath), true, `Seam file "${seamPath}" does not exist`);
  }
});

test('Static Effect Analysis: Core interfaces, validators, runtime and domain seam files contain zero current-time calls', () => {
  const dynamicViolations = [];
  for (const dir of CORE_DIRECTORIES_TO_SCAN) {
    dynamicViolations.push(...scanFiles(path.join(CORE_DIR, dir), FORBIDDEN_DYNAMIC_TOKENS));
  }
  dynamicViolations.push(...scanSeamFiles(SEAM_FILES_TO_SCAN, FORBIDDEN_DYNAMIC_TOKENS));
  assert.deepEqual(dynamicViolations, [], 'Core surfaces and domain seams must not call Date.now() or new Date()');
});

test('Static Effect Analysis: Core interfaces, validators, runtime and domain seam files contain zero IO/network/process side-effects', () => {
  const ioViolations = [];
  for (const dir of CORE_DIRECTORIES_TO_SCAN) {
    ioViolations.push(...scanFiles(path.join(CORE_DIR, dir), FORBIDDEN_SIDE_EFFECT_MODULES));
  }
  ioViolations.push(...scanSeamFiles(SEAM_FILES_TO_SCAN, FORBIDDEN_SIDE_EFFECT_MODULES));
  assert.deepEqual(ioViolations, [], 'Core surfaces and domain seams must not import side-effecting runtime modules');
});
