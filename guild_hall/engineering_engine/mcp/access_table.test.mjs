import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCESS_TABLE_FIXTURE, NEXT_STEPS_FIXTURE, stageSyntheticProject,
} from '../fixtures/engine_mcp_synthetic_project.mjs';
import {
  ACCESS_ERROR_CODES, ACCESS_REASONS, DATA_CLASSES, DEFAULT_ACCESS_TABLE_V0, DEFAULT_DATA_CLASS,
  ROLES, decideToolAccess, redactFields, resolveAccessView, validateAccessTable, validatePrincipal,
} from './access_table.mjs';
import { createEngineContext } from './engine_context.mjs';
import { ENGINE_MCP_TOOLS, ENGINE_MCP_TOOLS_BY_NAME, TOOL_DESCRIPTORS } from './tools/index.mjs';

const ENGINE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENGINE_VERSION = readFileSync(join(ENGINE_ROOT, 'topology', 'ENGINE_VERSION'), 'utf8').trim();
const TABLE = validateAccessTable(ACCESS_TABLE_FIXTURE.access_table);
const toolNamed = (name) => ENGINE_MCP_TOOLS_BY_NAME.get(name);
const call = (name, args, context) => toolNamed(name).handler(args, context);

const viewFor = (role, projectCode = 'SYN-000', table = TABLE) => resolveAccessView({
  table, principal: role === null ? null : { principal_ref: `test_${role}`, role }, project_code: projectCode,
});

async function stage({ role = 'owner', write = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_access_'));
  const staged = stageSyntheticProject(root);
  const context = await createEngineContext({
    profile_path: staged.profile_path,
    repo_root: root,
    engine_root: ENGINE_ROOT,
    engine_version: ENGINE_VERSION,
    write_enabled: write,
    view: viewFor(role, staged.project_code),
    shared: {
      tools: TOOL_DESCRIPTORS,
      access_table: TABLE,
      protocol_version: '2025-06-18',
      server_name: 'test',
      registry_source: 'profile',
      registry_path: null,
      access_table_path: '_workmeta/system/engine/access_table.json',
      feature_env: 'SOULFORGE_ENGINE_MCP',
      write_env: 'SOULFORGE_ENGINE_MCP_WRITE',
    },
  });
  return { root, staged, context };
}

test('the documented access table validates and covers the roles the design names', () => {
  assert.equal(TABLE.schema_version, 'soulforge.engine_access_table.v0');
  assert.deepEqual(Object.keys(TABLE.roles).sort(), [...ROLES].sort());
  assert.deepEqual(Object.keys(ACCESS_TABLE_FIXTURE.data_classes).sort(), [...DATA_CLASSES].sort());
  assert.equal(ACCESS_TABLE_FIXTURE.default_data_class, DEFAULT_DATA_CLASS);
  assert.deepEqual(Object.keys(ACCESS_TABLE_FIXTURE.refusal_reasons).sort(),
    Object.values(ACCESS_REASONS).sort());
  // The built-in default and the documented table say the same thing about who holds ⓒ, and about
  // which tools each role may call: the fixture is the table a reader learns the model from.
  for (const role of ROLES) {
    assert.deepEqual(TABLE.roles[role].classes, DEFAULT_ACCESS_TABLE_V0.roles[role].classes,
      `${role} classes drifted from the built-in default`);
    assert.deepEqual([...TABLE.roles[role].tools].sort(),
      [...DEFAULT_ACCESS_TABLE_V0.roles[role].tools].sort(),
      `${role} tools drifted from the built-in default`);
  }
});

test('the file door is open to every team role, and the sweep is not', () => {
  const door = ['file_ticket', 'file_put', 'file_register', 'file_get', 'file_tickets_list'];
  for (const role of ['systems', 'hw', 'sw', 'quality']) {
    for (const tool of door) {
      assert.ok(DEFAULT_ACCESS_TABLE_V0.roles[role].tools.includes(tool),
        `${role} should be able to call ${tool} — 등록 = 저장 (9.1D)`);
    }
    // Housekeeping moves folders and is ⓒ; a team role is refused by the table as well as by the
    // class, so neither check is the only one standing.
    assert.equal(DEFAULT_ACCESS_TABLE_V0.roles[role].tools.includes('file_tickets_gc'), false);
    assert.equal(DEFAULT_ACCESS_TABLE_V0.roles[role].classes.includes('confidential_contract'),
      false);
  }
  for (const tool of [...door, 'file_tickets_gc']) {
    assert.equal(DEFAULT_ACCESS_TABLE_V0.roles.external.tools.includes(tool), false,
      'an outside party holds no part of the file door');
  }
});

test('an access table with an unknown role, class or key is refused', () => {
  const refusal = (raw) => {
    try {
      validateAccessTable(raw);
    } catch (error) {
      return error;
    }
    return null;
  };
  const base = ACCESS_TABLE_FIXTURE.access_table;
  assert.equal(refusal({ ...base, roles: { ...base.roles, chief: { tools: ['whoami'] } } })?.code,
    ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID);
  assert.equal(refusal({
    ...base, roles: { ...base.roles, hw: { tools: ['whoami'], classes: ['everything'] } },
  })?.code, ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID);
  assert.equal(refusal({ ...base, granted_by: 'someone' })?.code,
    ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID);
  assert.equal(refusal({ ...base, schema_version: 'soulforge.other.v0' })?.code,
    ACCESS_ERROR_CODES.ACCESS_TABLE_INVALID);
});

test('a principal is exactly a reference and a role, or it is refused', () => {
  assert.deepEqual(validatePrincipal({ principal_ref: 'pm_01', role: 'pm' }),
    { principal_ref: 'pm_01', role: 'pm' });
  for (const bad of [
    null, 'pm_01', { role: 'pm' }, { principal_ref: 'pm_01' },
    { principal_ref: 'pm_01', role: 'chief' },
    { principal_ref: 'pm_01', role: 'pm', ceiling: 'write' },
  ]) {
    assert.throws(() => validatePrincipal(bad),
      (error) => error.code === ACCESS_ERROR_CODES.PRINCIPAL_INVALID);
  }
});

test('a role the table does not declare is denied everything', () => {
  const sparse = validateAccessTable({
    schema_version: 'soulforge.engine_access_table.v0',
    roles: { owner: { tools: ['*'], classes: ['*'], capabilities: ['*'] } },
  });
  const view = viewFor('quality', 'SYN-000', sparse);
  assert.deepEqual(view.tools, []);
  assert.deepEqual(view.classes, []);
  for (const tool of ENGINE_MCP_TOOLS) {
    const decision = decideToolAccess({ view, tool, write_enabled: true });
    assert.equal(decision.allowed, false, `${tool.name} should be denied`);
    assert.equal(decision.reason, ACCESS_REASONS.PERMISSION_DENIED);
  }
});

test('without a principal only the public rule class answers, and the rest says why', () => {
  const view = viewFor(null);
  assert.equal(view.anonymous, true);
  assert.deepEqual(view.classes, ['public_rules']);
  for (const name of ['whoami', 'engine_status', 'rules_layers', 'rules_stage', 'rules_card',
    'rules_version']) {
    assert.equal(decideToolAccess({ view, tool: toolNamed(name), write_enabled: true }).allowed,
      true, `${name} should answer without a principal`);
  }
  for (const name of ['projects_list', 'observe_status', 'project_status', 'next_steps',
    'judge_result', 'access_table', 'observe_register', 'judge_run']) {
    const decision = decideToolAccess({ view, tool: toolNamed(name), write_enabled: true });
    assert.equal(decision.allowed, false, `${name} should need a principal`);
    assert.equal(decision.code, ACCESS_ERROR_CODES.PRINCIPAL_REQUIRED);
  }
});

test('the decision order is naming, then permission, then class, then the write switch', () => {
  const owner = viewFor('owner');
  const hw = viewFor('hw');
  const external = viewFor('external');

  // A discipline role may register a candidate but not confirm one (9.1F: 확정은 Owner·PM).
  assert.equal(decideToolAccess({
    view: hw, tool: toolNamed('observe_register'), write_enabled: true,
  }).allowed, true);
  // Owner decision 2026-08-19: 체계·품질 also walk and judge; hw and sw do not.
  for (const role of ['systems', 'quality']) {
    for (const name of ['judge_run', 'observe_scan']) {
      assert.equal(decideToolAccess({
        view: viewFor(role), tool: toolNamed(name), write_enabled: true,
      }).allowed, true, `${role} should be allowed ${name}`);
      // Still a write tool: the switch, not the table, is what is off by default.
      assert.equal(decideToolAccess({
        view: viewFor(role), tool: toolNamed(name), write_enabled: false,
      }).reason, ACCESS_REASONS.WRITE_DISABLED);
    }
    assert.equal(decideToolAccess({
      view: viewFor(role), tool: toolNamed('observe_confirm'), write_enabled: true,
    }).reason, ACCESS_REASONS.PERMISSION_DENIED);
    assert.equal(decideToolAccess({
      view: viewFor(role), tool: toolNamed('access_table'), write_enabled: true,
    }).reason, ACCESS_REASONS.PERMISSION_DENIED);
  }
  for (const role of ['hw', 'sw']) {
    assert.equal(decideToolAccess({
      view: viewFor(role), tool: toolNamed('judge_run'), write_enabled: true,
    }).reason, ACCESS_REASONS.PERMISSION_DENIED);
  }
  assert.equal(decideToolAccess({
    view: hw, tool: toolNamed('observe_confirm'), write_enabled: true,
  }).reason, ACCESS_REASONS.PERMISSION_DENIED);
  assert.equal(decideToolAccess({
    view: hw, tool: toolNamed('access_table'), write_enabled: true,
  }).reason, ACCESS_REASONS.PERMISSION_DENIED);
  assert.equal(decideToolAccess({
    view: external, tool: toolNamed('project_status'), write_enabled: true,
  }).reason, ACCESS_REASONS.PERMISSION_DENIED);

  // An Owner is allowed the tool and cleared for the class; what stops the call is the switch.
  assert.equal(decideToolAccess({
    view: owner, tool: toolNamed('judge_run'), write_enabled: false,
  }).reason, ACCESS_REASONS.WRITE_DISABLED);
  assert.equal(decideToolAccess({
    view: owner, tool: toolNamed('judge_run'), write_enabled: true,
  }).allowed, true);

  // A paused project reads; it does not write. A closed one does neither.
  assert.equal(decideToolAccess({
    view: owner, tool: toolNamed('project_status'), write_enabled: true, project_status: 'paused',
  }).allowed, true);
  assert.equal(decideToolAccess({
    view: owner, tool: toolNamed('judge_run'), write_enabled: true, project_status: 'paused',
  }).reason, ACCESS_REASONS.PERMISSION_DENIED);
  assert.equal(decideToolAccess({
    view: owner, tool: toolNamed('rules_stage'), write_enabled: true, project_status: 'closed',
  }).allowed, false);
});

test('a class a role cannot see refuses with CLASS_EXCEEDED rather than with PERMISSION_DENIED', () => {
  // A table that lets a role call the tool but not see what it returns is the case the two codes
  // exist to tell apart.
  const table = validateAccessTable({
    schema_version: 'soulforge.engine_access_table.v0',
    roles: { hw: { tools: ['observe_confirm'], classes: ['public_rules'], capabilities: [] } },
  });
  const decision = decideToolAccess({
    view: viewFor('hw', 'SYN-000', table), tool: toolNamed('observe_confirm'), write_enabled: true,
  });
  assert.equal(decision.reason, ACCESS_REASONS.CLASS_EXCEEDED);
  assert.equal(decision.detail.data_class, 'confidential_contract');
});

test('a project override replaces the role row for that project only', () => {
  const here = viewFor('hw', 'SYN-001');
  const elsewhere = viewFor('hw', 'SYN-000');
  assert.deepEqual([...here.tools], ['whoami', 'engine_status', 'rules_stage']);
  assert.equal(here.capabilities.length, 0);
  assert.ok(elsewhere.tools.includes('observe_register'));
  assert.equal(decideToolAccess({
    view: here, tool: toolNamed('observe_status'), write_enabled: true,
  }).reason, ACCESS_REASONS.PERMISSION_DENIED);
});

test('redaction blanks the named fields, including through arrays, and names what it hid', () => {
  const value = {
    keep: 1,
    observations_dir: '_workspaces/SYN-000/06_validation/observations',
    files: { auto: 'artifact_observations_auto.json', confirmed: null },
    stages: [{ stage_code: '030_SRR', launch: 'a', assessment: 'b' }, { stage_code: '090_PDR', launch: 'c' }],
  };
  const { value: hidden, redacted } = redactFields(value,
    ['observations_dir', 'files.auto', 'files.confirmed', 'stages[].launch', 'not.there']);
  assert.equal(hidden.keep, 1);
  assert.equal(hidden.observations_dir, null);
  assert.equal(hidden.files.auto, null);
  assert.deepEqual(hidden.stages.map((row) => row.launch), [null, null]);
  assert.equal(hidden.stages[0].assessment, 'b', 'only the named fields are hidden');
  assert.deepEqual([...redacted].sort(), ['files.auto', 'observations_dir', 'stages[].launch']);
  assert.equal(value.observations_dir, '_workspaces/SYN-000/06_validation/observations',
    'the original answer is not mutated');
});

test('next_steps hands a discipline role its own instructions and counts what it withheld', async () => {
  const owner = await stage({ role: 'owner' });
  const hw = await stage({ role: 'hw' });
  try {
    const args = { stage_code: '030_SRR', known_at: NEXT_STEPS_FIXTURE.known_at };
    const full = await call('next_steps', args, owner.context);
    assert.equal(full.structured.counts.instructions_withheld_by_role, 0);
    assert.equal(full.structured.role_filter.applied, false);
    assert.ok(full.structured.counts.instructions_visible > 0);

    const narrow = await call('next_steps', args, hw.context);
    assert.equal(narrow.structured.role_filter.role, 'hw');
    assert.deepEqual(narrow.structured.role_filter.capabilities,
      ['hw_engineering', 'mechanical_design']);
    assert.equal(
      narrow.structured.counts.instructions_visible
      + narrow.structured.counts.instructions_withheld_by_role,
      full.structured.counts.instructions,
    );
    // The synthetic stage is systems work, so a hardware role is told there is nothing here for
    // it rather than being shown somebody else's instruction sheet.
    assert.equal(narrow.structured.counts.instructions_visible, 0);
    assert.equal(narrow.structured.role_filter.applied, true);
    assert.equal(narrow.markdown.includes('이제 뭐 해야 하나'), true);
  } finally {
    rmSync(owner.root, { recursive: true, force: true });
    rmSync(hw.root, { recursive: true, force: true });
  }
});

test('whoami says who the caller is, what is allowed, and why the rest is not', async () => {
  const { root, context } = await stage({ role: 'hw' });
  try {
    const answer = await call('whoami', {}, context);
    assert.equal(answer.structured.role, 'hw');
    assert.equal(answer.structured.principal_ref, 'test_hw');
    assert.deepEqual(answer.structured.visible_classes, ['public_rules', 'team_judgment']);
    assert.ok(answer.structured.allowed_tools.includes('observe_status'));
    assert.ok(!answer.structured.allowed_tools.includes('access_table'));
    const refused = new Map(answer.structured.refused_tools.map((row) => [row.tool, row.reason]));
    // A tool this role holds but cannot use yet says so; one it does not hold at all says the
    // other thing, and the difference is what makes a refusal actionable.
    assert.equal(refused.get('observe_register'), ACCESS_REASONS.WRITE_DISABLED);
    assert.equal(refused.get('observe_confirm'), ACCESS_REASONS.PERMISSION_DENIED);
    assert.equal(refused.get('access_table'), ACCESS_REASONS.PERMISSION_DENIED);
    assert.equal(answer.structured.write_tools_enabled, false);
    assert.equal(answer.structured.project_scope.project_code, 'SYN-000');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('whoami without a principal reports the anonymous standing rather than refusing', async () => {
  const { root, context } = await stage({ role: null });
  try {
    const answer = await call('whoami', {}, context);
    assert.equal(answer.structured.anonymous, true);
    assert.equal(answer.structured.role, null);
    assert.deepEqual(answer.structured.visible_classes, ['public_rules']);
    assert.deepEqual(answer.structured.allowed_tools.sort(),
      ['engine_status', 'rules_card', 'rules_layers', 'rules_stage', 'rules_version', 'whoami']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('access_table shows the table and states that nothing here can change it', async () => {
  const { root, context } = await stage({ role: 'owner' });
  try {
    const answer = await call('access_table', {}, context);
    assert.equal(answer.structured.mutation.available, false);
    assert.equal(answer.structured.roles.length, ROLES.length);
    const hw = answer.structured.roles.find((row) => row.role === 'hw');
    assert.equal(hw.declared, true);
    assert.ok(hw.allowed_tools_here.includes('observe_register'));
    assert.ok(!hw.allowed_tools_here.includes('observe_confirm'));
    assert.equal(answer.structured.project_override_present, false);

    const one = await call('access_table', { role: 'external' }, context);
    assert.equal(one.structured.roles.length, 1);
    assert.deepEqual(one.structured.roles[0].classes, ['public_rules']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('engine_status folds the release manifest in beside the switches and the scope', async () => {
  const { root, context } = await stage({ role: 'owner' });
  try {
    const answer = await call('engine_status', {}, context);
    assert.equal(answer.structured.engine_version, ENGINE_VERSION);
    assert.equal(answer.structured.switches.feature_on, true);
    assert.equal(answer.structured.switches.write_enabled, false);
    assert.equal(answer.structured.protocol.version, '2025-06-18');
    assert.equal(answer.structured.project.project_code, 'SYN-000');
    assert.ok(answer.structured.release.rule_layers.length > 0);
    assert.equal(answer.structured.tools.total, ENGINE_MCP_TOOLS.length);
    assert.equal(answer.structured.access.table_source, 'file');
    assert.deepEqual(answer.structured.access.data_classes, [...DATA_CLASSES]);
    assert.equal(answer.structured.receipts_root.startsWith('_workmeta/'), true);
    // The same call is what `rules_version` would answer about the manifest, so the two cannot
    // disagree about which engine is running.
    const version = await call('rules_version', {}, context);
    assert.equal(version.structured.engine_release.engine_version,
      answer.structured.engine_version);
    assert.equal(answer.structured.release.generated_from_commit_12,
      version.structured.engine_release.git_commit.slice(0, 12));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('projects_list falls back to the one project a --profile start serves', async () => {
  const { root, context } = await stage({ role: 'pm' });
  try {
    const answer = await call('projects_list', {}, context);
    assert.equal(answer.structured.counts.total, 1);
    assert.equal(answer.structured.projects[0].project_code, 'SYN-000');
    assert.equal(answer.structured.projects[0].last_judge_run_at, null);
    assert.equal(answer.structured.default_project, 'SYN-000');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
