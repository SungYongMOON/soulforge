import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import {
  ENGINE_PROJECT_PROFILE_SCHEMA_VERSION, PROFILE_ERROR_CODES, PROFILE_OPTIONAL_KEYS,
  PROFILE_REQUIRED_KEYS, profileRoots, repoPointer, validateProjectProfile,
} from './project_profile.mjs';
import { PROFILE_FIXTURE, stageSyntheticProject } from '../fixtures/engine_mcp_synthetic_project.mjs';

const stage = () => {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_profile_'));
  return { root, staged: stageSyntheticProject(root) };
};

const refusal = (raw, root) => {
  try {
    validateProjectProfile(raw, { repo_root: root });
  } catch (error) {
    return error;
  }
  return null;
};

test('the documented profile shape carries exactly the keys the validator requires', () => {
  assert.deepEqual(Object.keys(PROFILE_FIXTURE.profile).sort(), [...PROFILE_REQUIRED_KEYS].sort());
  assert.equal(PROFILE_FIXTURE.profile.schema_version, ENGINE_PROJECT_PROFILE_SCHEMA_VERSION);
  assert.equal(PROFILE_FIXTURE.profile.known_at_policy, 'caller_supplied');
});

test('a staged profile validates and resolves its paths under the declared roots', () => {
  const { root, staged } = stage();
  try {
    const profile = validateProjectProfile(staged.profile, { repo_root: root });
    const roots = profileRoots(root);
    assert.equal(profile.project_code, 'SYN-000');
    assert.equal(profile.known_at_policy, 'caller_supplied');
    assert.ok(profile.observations_dir.startsWith(roots.project));
    assert.ok(profile.runs_root.startsWith(roots.metadata));
    // A binding stated inline stays inline; the path half is null rather than invented.
    assert.equal(profile.project_binding, null);
    assert.ok(profile.project_binding_inline !== null);
    assert.equal(repoPointer(root, profile.observations_dir),
      '_workspaces/SYN-000/06_validation/observations');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a relative path is refused, and so is one that climbs out of itself', () => {
  const { root, staged } = stage();
  try {
    const relative = refusal({ ...staged.profile, compiled_variant: 'rules/compiled_variant.json' }, root);
    assert.equal(relative?.code, PROFILE_ERROR_CODES.PROFILE_PATH_RELATIVE);

    const climbing = refusal({
      ...staged.profile,
      compiled_variant: `${staged.observations_dir}${sep}..${sep}..${sep}..${sep}elsewhere.json`,
    }, root);
    assert.equal(climbing?.code, PROFILE_ERROR_CODES.PROFILE_PATH_RELATIVE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a path outside _workspaces/_workmeta/rule assets is refused', () => {
  const { root, staged } = stage();
  try {
    const outside = refusal({ ...staged.profile, base_packet: join(root, 'elsewhere', 'packet.json') }, root);
    assert.equal(outside?.code, PROFILE_ERROR_CODES.PROFILE_PATH_OUTSIDE_ROOTS);
    assert.equal(outside.detail.field, 'base_packet');

    // Receipts are metadata: a receipts directory in the project plane is the wrong plane, not a
    // matter of taste.
    const wrongPlane = refusal({ ...staged.profile, receipts_dir: staged.observations_dir }, root);
    assert.equal(wrongPlane?.code, PROFILE_ERROR_CODES.PROFILE_PATH_OUTSIDE_ROOTS);
    assert.equal(wrongPlane.detail.field, 'receipts_dir');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown key, a missing key and a foreign known_at policy are all refused', () => {
  const { root, staged } = stage();
  try {
    const extra = refusal({ ...staged.profile, project_root_2: staged.project_root }, root);
    assert.equal(extra?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.deepEqual(extra.detail.unknown, ['project_root_2']);

    const { base_launch: _dropped, ...missing } = staged.profile;
    const without = refusal(missing, root);
    assert.equal(without?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.deepEqual(without.detail.missing, ['base_launch']);

    const clock = refusal({ ...staged.profile, known_at_policy: 'server_clock' }, root);
    assert.equal(clock?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.equal(clock.detail.field, 'known_at_policy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('receipts and runs have to sit under the project\'s own metadata folder', () => {
  const { root, staged } = stage();
  try {
    // Somewhere under `_workmeta` was never enough: two projects could name the same folder and
    // their receipt lines would interleave with nothing to separate them afterwards (부록 B 2번).
    const neighbour = join(root, '_workmeta', 'SYN-OTHER', 'runs');
    const receipts = refusal({ ...staged.profile, receipts_dir: neighbour }, root);
    assert.equal(receipts?.code, PROFILE_ERROR_CODES.PROFILE_PLANE_MISMATCH);
    assert.equal(receipts.detail.field, 'receipts_dir');
    assert.equal(receipts.detail.expected_under, '_workmeta/SYN-000');

    const runs = refusal({
      ...staged.profile,
      receipts_dir: join(root, '_workmeta', 'SYN-000', 'runs', 'mcp_receipts'),
      runs_root: join(root, '_workmeta', 'shared_runs'),
    }, root);
    assert.equal(runs?.code, PROFILE_ERROR_CODES.PROFILE_PLANE_MISMATCH);
    assert.equal(runs.detail.field, 'runs_root');

    // And the staged profile, which does it right, still passes.
    const ok = validateProjectProfile(staged.profile, { repo_root: root });
    assert.equal(repoPointer(root, ok.runs_root), '_workmeta/SYN-000/runs');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the observation run has to sit inside the project output root', () => {
  const { root, staged } = stage();
  try {
    const elsewhere = refusal({
      ...staged.profile,
      observations_dir: join(root, '_workspaces', 'SYN-000', 'other_observations'),
    }, root);
    assert.equal(elsewhere?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.match(elsewhere.message, /outputs_root/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the file door (문 앞 칸)

test('the documented file-door block carries exactly the optional keys the validator allows', () => {
  const documented = Object.keys(PROFILE_FIXTURE.file_door_profile)
    .filter((key) => key !== 'note').sort();
  assert.deepEqual(documented, [...PROFILE_OPTIONAL_KEYS].sort());
});

test('a profile without a door is valid and simply has no door', () => {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_profile_'));
  try {
    const staged = stageSyntheticProject(root, { file_door: false });
    const profile = validateProjectProfile(staged.profile, { repo_root: root });
    assert.equal(profile.file_door_enabled, false);
    assert.equal(profile.intake_dir, null);
    assert.equal(profile.ticket_policy, null);
    assert.deepEqual([...profile.confidential_dirs], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a door is stated whole, inside the project, and as three separate places', () => {
  const { root, staged } = stage();
  try {
    const profile = validateProjectProfile(staged.profile, { repo_root: root });
    assert.equal(profile.file_door_enabled, true);
    assert.equal(profile.ticket_policy.cleanup_after_days, 30);
    assert.equal(profile.confidential_dirs.length, 1);
    assert.ok(profile.intake_dir.startsWith(profile.project_root));

    const half = { ...staged.profile };
    delete half.trash_dir;
    const missing = refusal(half, root);
    assert.equal(missing?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.deepEqual(missing.detail.missing, ['trash_dir']);

    // Outside the project, inside a confidential folder, and the project root itself: three ways a
    // door would hand somebody more than the folder they were promised.
    const outside = refusal({
      ...staged.profile,
      intake_dir: join(root, '_workspaces', 'SYN-999', 'tickets'),
    }, root);
    assert.equal(outside?.code, PROFILE_ERROR_CODES.PROFILE_PATH_OUTSIDE_ROOTS);

    const inConfidential = refusal({
      ...staged.profile,
      intake_dir: join(staged.confidential_dir, 'tickets'),
    }, root);
    assert.equal(inConfidential?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.match(inConfidential.message, /confidential/u);

    const wholeProject = refusal({ ...staged.profile, outbox_dir: staged.project_root }, root);
    assert.equal(wholeProject?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);

    const nested = refusal({
      ...staged.profile,
      trash_dir: join(staged.intake_dir, '_trash'),
    }, root);
    assert.equal(nested?.code, PROFILE_ERROR_CODES.PROFILE_INVALID);
    assert.match(nested.message, /three separate places/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
