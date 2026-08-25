import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import {
  REGISTRY_FIXTURE, stageSyntheticProject, stageSyntheticRegistry,
} from '../fixtures/engine_mcp_synthetic_project.mjs';
import {
  PROJECT_STATUSES, REGISTRY_ERROR_CODES, REGISTRY_OPTIONAL_ROW_KEYS, REGISTRY_REQUIRED_ROW_KEYS,
  loadProjectRegistry, registryOfOne, validateProjectRegistry,
} from '../mcp/project_registry.mjs';
import { createProjectContexts } from '../mcp/engine_contexts.mjs';
import { DEFAULT_ACCESS_TABLE_V0 } from '../mcp/access_table.mjs';

const ENGINE_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ENGINE_VERSION = readFileSync(join(ENGINE_ROOT, 'topology', 'ENGINE_VERSION'), 'utf8').trim();

const staging = (options = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_registry_'));
  return { root, staged: stageSyntheticRegistry(root, options) };
};

const refusal = (raw, root) => {
  try {
    validateProjectRegistry(raw, { repo_root: root });
  } catch (error) {
    return error;
  }
  return null;
};

const contexts = (root, staged, options = {}) => createProjectContexts({
  registry: validateProjectRegistry(staged.registry, { repo_root: root }),
  profiles: options.profiles,
  repo_root: root,
  engine_root: ENGINE_ROOT,
  engine_version: ENGINE_VERSION,
  write_enabled: false,
  access_table: DEFAULT_ACCESS_TABLE_V0,
  principal: { principal_ref: 'test_owner', role: 'owner' },
  shared: {},
  context_cache_max: options.context_cache_max,
});

test('the documented registry shape carries exactly the keys the validator requires', () => {
  const rows = REGISTRY_FIXTURE.registry.projects;
  const allowed = [...REGISTRY_REQUIRED_ROW_KEYS, ...REGISTRY_OPTIONAL_ROW_KEYS].sort();
  for (const row of rows) {
    for (const key of REGISTRY_REQUIRED_ROW_KEYS) assert.ok(Object.hasOwn(row, key), key);
    assert.deepEqual(Object.keys(row).filter((key) => !allowed.includes(key)), []);
  }
  assert.deepEqual(rows.map((row) => row.status).sort(), [...PROJECT_STATUSES].sort());
  assert.deepEqual(Object.keys(REGISTRY_FIXTURE.statuses).sort(), [...PROJECT_STATUSES].sort());
  assert.equal(REGISTRY_FIXTURE.registry.schema_version, 'soulforge.engine_project_registry.v0');
});

test('a staged registry validates, and its profiles load and match their rows', async () => {
  const { root, staged } = staging();
  try {
    const registry = validateProjectRegistry(staged.registry, { repo_root: root });
    assert.equal(registry.projects.length, 2);
    assert.equal(registry.default_project, 'SYN-000');

    const loaded = await loadProjectRegistry({
      registry_path: staged.registry_path, repo_root: root,
    });
    assert.deepEqual([...loaded.profiles.keys()], ['SYN-000', 'SYN-001']);
    assert.equal(loaded.profiles.get('SYN-001').project_code, 'SYN-001');
    // The two projects share nothing: separate observation runs, separate metadata folders.
    assert.notEqual(loaded.profiles.get('SYN-000').runs_root,
      loaded.profiles.get('SYN-001').runs_root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a registry of one is what --profile means, and it is its own default', () => {
  const { root, staged } = staging({ project_codes: ['SYN-000'] });
  try {
    const single = validateProjectRegistry(registryOfOne({
      project_code: 'SYN-000', profile_path: staged.staged[0].profile_path,
    }), { repo_root: root });
    assert.equal(single.projects.length, 1);
    assert.equal(single.default_project, 'SYN-000');
    assert.equal(single.projects[0].status, 'active');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('duplicate codes, unknown statuses, stray keys and loose paths are all refused', () => {
  const { root, staged } = staging();
  try {
    const base = staged.registry;
    const duplicate = refusal({
      ...base, projects: [base.projects[0], { ...base.projects[1], project_code: 'SYN-000' }],
    }, root);
    assert.equal(duplicate?.code, REGISTRY_ERROR_CODES.REGISTRY_DUPLICATE_PROJECT);

    const status = refusal({
      ...base, projects: [{ ...base.projects[0], status: 'archived' }],
    }, root);
    assert.equal(status?.code, REGISTRY_ERROR_CODES.REGISTRY_INVALID);

    const stray = refusal({
      ...base, projects: [{ ...base.projects[0], owner: 'someone' }],
    }, root);
    assert.deepEqual(stray?.detail.unknown, ['owner']);

    const relative = refusal({
      ...base, projects: [{ ...base.projects[0], profile: 'profiles/one.json' }],
    }, root);
    assert.equal(relative?.code, 'ENGINE_MCP_PROFILE_PATH_RELATIVE');

    const outside = refusal({
      ...base, projects: [{ ...base.projects[0], profile: join(root, 'elsewhere.json') }],
    }, root);
    assert.equal(outside?.code, REGISTRY_ERROR_CODES.REGISTRY_INVALID);

    const unknownDefault = refusal({ ...base, default_project: 'SYN-404' }, root);
    assert.equal(unknownDefault?.code, REGISTRY_ERROR_CODES.REGISTRY_INVALID);

    const version = refusal({ ...base, schema_version: 'soulforge.something_else.v1' }, root);
    assert.equal(version?.code, REGISTRY_ERROR_CODES.REGISTRY_INVALID);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a registry whose row disagrees with its profile does not half-open', async () => {
  const { root, staged } = staging();
  try {
    const wrong = {
      ...staged.registry,
      projects: [{ ...staged.registry.projects[0], project_code: 'SYN-009' }],
      default_project: 'SYN-009',
    };
    const path = join(root, 'wrong_registry.json');
    writeFileSync(path, `${JSON.stringify(wrong, null, 2)}\n`);
    await assert.rejects(loadProjectRegistry({ registry_path: path, repo_root: root }),
      (error) => error.code === REGISTRY_ERROR_CODES.REGISTRY_PROFILE_REFUSED);

    const missing = {
      ...staged.registry,
      projects: [{
        ...staged.registry.projects[0],
        profile: join(root, '_workspaces', 'SYN-000', 'no_such_profile.json'),
      }],
    };
    const missingPath = join(root, 'missing_registry.json');
    writeFileSync(missingPath, `${JSON.stringify(missing, null, 2)}\n`);
    await assert.rejects(loadProjectRegistry({ registry_path: missingPath, repo_root: root }),
      (error) => error.code === REGISTRY_ERROR_CODES.REGISTRY_PROFILE_REFUSED);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a call is routed to the project it names, and to the default when it names none', async () => {
  const { root, staged } = staging();
  try {
    const loaded = await loadProjectRegistry({
      registry_path: staged.registry_path, repo_root: root,
    });
    const api = contexts(root, staged, { profiles: loaded.profiles });

    assert.equal(api.resolveProjectCode(undefined), 'SYN-000');
    assert.equal(api.resolveProjectCode('SYN-001'), 'SYN-001');
    assert.throws(() => api.resolveProjectCode('SYN-404'),
      (error) => error.code === REGISTRY_ERROR_CODES.PROJECT_UNKNOWN);

    const first = await api.get('SYN-000');
    const second = await api.get('SYN-001');
    assert.equal(first.profile.project_code, 'SYN-000');
    assert.equal(second.profile.project_code, 'SYN-001');
    // Two contexts, two observation sets, no shared cache between them.
    assert.notEqual(first, second);
    assert.equal(await api.get('SYN-000'), first, 'a held context is reused, not rebuilt');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the context cache is capped, and the project asked about last survives', async () => {
  const { root, staged } = staging({ project_codes: ['SYN-000', 'SYN-001', 'SYN-002'] });
  try {
    const loaded = await loadProjectRegistry({
      registry_path: staged.registry_path, repo_root: root,
    });
    const api = contexts(root, staged, { profiles: loaded.profiles, context_cache_max: 2 });

    await api.get('SYN-000');
    await api.get('SYN-001');
    assert.deepEqual(api.stats().codes, ['SYN-000', 'SYN-001']);
    await api.get('SYN-002');
    assert.equal(api.stats().held, 2);
    assert.deepEqual(api.stats().codes, ['SYN-001', 'SYN-002']);
    // Evicted, then asked for again: rebuilt from the same profile, same answer.
    const rebuilt = await api.get('SYN-000');
    assert.equal(rebuilt.profile.project_code, 'SYN-000');
    assert.equal(api.stats().held, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a paused project reads and a closed one does not, as the registry states', async () => {
  const { root, staged } = staging({
    project_codes: ['SYN-000', 'SYN-001', 'SYN-002'],
    statuses: { 'SYN-001': 'paused', 'SYN-002': 'closed' },
  });
  try {
    const loaded = await loadProjectRegistry({
      registry_path: staged.registry_path, repo_root: root,
    });
    const api = contexts(root, staged, { profiles: loaded.profiles });
    assert.equal(api.statusOf('SYN-000'), 'active');
    assert.equal(api.statusOf('SYN-001'), 'paused');
    assert.equal(api.statusOf('SYN-002'), 'closed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a listing answers from the registry and the profiles, without a run walk', async () => {
  const { root, staged } = staging();
  try {
    const loaded = await loadProjectRegistry({
      registry_path: staged.registry_path, repo_root: root,
    });
    const api = contexts(root, staged, { profiles: loaded.profiles });
    const rows = await api.listProjects();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.project_code), ['SYN-000', 'SYN-001']);
    assert.equal(rows[0].is_default, true);
    assert.equal(rows[0].business_type, loaded.profiles.get('SYN-000').business_type);
    // No run index yet, so the honest answer is null rather than a walk of every run folder.
    assert.equal(rows[0].last_judge_run_at, null);
    assert.equal(rows[0].profile.startsWith('_workspaces/'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a project staged on its own still validates as a project of one', () => {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_registry_one_'));
  try {
    const staged = stageSyntheticProject(root);
    const registry = validateProjectRegistry(registryOfOne({
      project_code: staged.project_code, profile_path: staged.profile_path,
    }), { repo_root: root });
    assert.equal(registry.projects[0].profile, staged.profile_path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
