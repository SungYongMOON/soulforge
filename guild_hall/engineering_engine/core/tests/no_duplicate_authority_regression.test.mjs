import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateNoDuplicateAuthority } from '../../tools/validate_no_duplicate_authority.mjs';

test('No Duplicate Authority: current tree has 0 violations', () => {
  const violations = validateNoDuplicateAuthority();
  assert.equal(violations.length, 0, `Expected 0 violations, found: ${JSON.stringify(violations, null, 2)}`);
});

test('No Duplicate Authority: rejects duplicate fixture JSON/SHA payloads (RED/GREEN)', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'no_dup_fixture_test_'));
  try {
    const fixturesDir = path.join(tempDir, 'fixtures');
    mkdirSync(fixturesDir, { recursive: true });

    // Add an illegal duplicate raw fixture JSON file
    writeFileSync(path.join(fixturesDir, 'phase_2_oracle_spec.json'), '{"spec": 1}', 'utf8');

    const violations = validateNoDuplicateAuthority(tempDir);
    assert.equal(violations.length >= 1, true, 'Must flag DUPLICATE_FIXTURE_PAYLOAD violation');
    assert.equal(violations.some((v) => v.reason === 'DUPLICATE_FIXTURE_PAYLOAD'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('No Duplicate Authority: rejects non-wrapper implementation in flat directories (RED/GREEN)', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'no_dup_impl_test_'));
  try {
    const kernelDir = path.join(tempDir, 'kernel');
    mkdirSync(kernelDir, { recursive: true });

    // Add an illegal implementation function in a flat legacy directory
    writeFileSync(path.join(kernelDir, 'authority.mjs'), 'export function resolveAuthority() { return 1; }', 'utf8');

    const violations = validateNoDuplicateAuthority(tempDir);
    assert.equal(violations.length >= 1, true, 'Must flag DUPLICATE_IMPLEMENTATION_AUTHORITY violation');
    assert.equal(violations.some((v) => v.reason === 'DUPLICATE_IMPLEMENTATION_AUTHORITY'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('No Duplicate Authority: rejects duplicate shared root tool inside domain package (RED/GREEN)', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'no_dup_tool_test_'));
  try {
    const seToolsDir = path.join(tempDir, 'engines', 'systems_engineering', 'tools');
    mkdirSync(seToolsDir, { recursive: true });

    // Add a duplicate shared tool inside SE domain tools
    writeFileSync(path.join(seToolsDir, 'emit_manifest.mjs'), '// duplicate tool', 'utf8');

    const violations = validateNoDuplicateAuthority(tempDir);
    assert.equal(violations.some((v) => v.reason === 'DUPLICATE_SHARED_ROOT_TOOL'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('No Duplicate Authority: rejects wrong-domain tool inside domain package (RED/GREEN)', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'no_dup_wrong_domain_test_'));
  try {
    const seToolsDir = path.join(tempDir, 'engines', 'systems_engineering', 'tools');
    mkdirSync(seToolsDir, { recursive: true });

    // Add a wrong-domain tool inside SE domain tools
    writeFileSync(path.join(seToolsDir, 'quality_readiness_runner.mjs'), '// wrong domain', 'utf8');

    const violations = validateNoDuplicateAuthority(tempDir);
    assert.equal(violations.some((v) => v.reason === 'WRONG_DOMAIN_TOOL'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('No Duplicate Authority: rejects test files outside domain package tests/ subtree (RED/GREEN)', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'no_dup_displaced_test_'));
  try {
    const seRulesDir = path.join(tempDir, 'engines', 'systems_engineering', 'rules');
    mkdirSync(seRulesDir, { recursive: true });

    // Add an illegal test file outside tests/ (e.g. inside rules/)
    writeFileSync(path.join(seRulesDir, 'stage_rule_compiler.test.mjs'), '// displaced test', 'utf8');

    const violations = validateNoDuplicateAuthority(tempDir);
    assert.equal(violations.some((v) => v.reason === 'DISPLACED_TEST_AUTHORITY'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
