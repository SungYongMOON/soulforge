// The command, driven the way the engine's door drives it.
//
// Most of this runs `run()` in-process so the bytes can be asserted; one test spawns the real
// child, because "the engine spawns this" is the whole reason the module is a command at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { EXIT, parseArgs, run } from '../tools/nas_issue_link.mjs';

const CLI_PATH = fileURLToPath(new URL('../tools/nas_issue_link.mjs', import.meta.url));
const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

const SECRET = 'synthetic-secret-value-0000';
const LINK_PASSWORD = 'synthetic-link-password-1111';

const ENV = Object.freeze({
  SOULFORGE_NAS_HOST: 'nas.invalid',
  SOULFORGE_NAS_PORT: '5001',
  SOULFORGE_NAS_USER: 'mock_account',
  SOULFORGE_NAS_PASSWORD: SECRET,
  SOULFORGE_NAS_SHARE: 'soulforge_intake',
  SOULFORGE_NAS_UNC: '\\\\nas.invalid\\soulforge_intake',
});

const ARGS = Object.freeze([
  '--ticket', 'up_20260819t050000z_abcdef',
  '--folder', 'tickets/mock_person/up_20260819t050000z_abcdef',
  '--purpose', 'upload',
  '--expires', '2026-08-22T05:00:00.000Z',
]);

const withMock = (name, extra = []) => [...ARGS, '--mock', fixturePath(name), ...extra];

// ---------------------------------------------------------------- arguments

test('the parser takes only the flags this command declares', () => {
  const args = parseArgs([...ARGS, '--dry-run']);
  assert.equal(args.ticket, 'up_20260819t050000z_abcdef');
  assert.equal(args.purpose, 'upload');
  assert.equal(args['dry-run'], true);
  assert.deepEqual(args._unknown, []);
  assert.deepEqual(parseArgs(['--nope', 'x'])._unknown, ['--nope', 'x']);
  assert.deepEqual(parseArgs(['--ticket'])._unknown, ['--ticket']);
});

test('a missing required argument is a usage refusal on stderr, with stdout empty', async () => {
  const result = await run(['--purpose', 'upload'], ENV);
  assert.equal(result.exit_code, EXIT.USAGE);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.equal(error.error_code, 'NAS_LINK_CLI_ARGUMENT_MISSING');
  assert.equal(error.detail.field, '--ticket');
});

test('an argument this command does not take is refused rather than ignored', async () => {
  const result = await run([...ARGS, '--password', 'literal'], ENV);
  assert.equal(result.exit_code, EXIT.USAGE);
  assert.equal(JSON.parse(result.stderr).error_code, 'NAS_LINK_CLI_ARGUMENT_UNKNOWN');
});

test('an env prefix that is not one is a refusal, not an unhandled throw', async () => {
  const result = await run([...ARGS, '--env-prefix', 'lower_case', '--dry-run'], ENV);
  assert.equal(result.exit_code, EXIT.USAGE);
  assert.equal(JSON.parse(result.stderr).detail.field, '--env-prefix');
});

// ---------------------------------------------------------------- dry run

test('a dry run makes no call and prints the plan', async () => {
  const result = await run([...ARGS, '--dry-run'], ENV);
  assert.equal(result.exit_code, EXIT.OK);
  assert.equal(result.stderr, '');
  const out = JSON.parse(result.stdout);
  assert.equal(out.mode, 'dry_run');
  assert.equal(out.calls_made, 0);
  assert.equal(out.env_keys_present, true);
  assert.equal(out.plan.folder_path,
    '/soulforge_intake/tickets/mock_person/up_20260819t050000z_abcdef');
  assert.equal(out.plan.capabilities_known, false);
  assert.equal(out.plan.dsm_date_expired, '2026-08-22 05:00:00');
  assert.equal(result.stdout.includes(SECRET), false);
});

test('a dry run works on a machine with no keys at all', async () => {
  const result = await run([...ARGS, '--dry-run'], {});
  assert.equal(result.exit_code, EXIT.OK);
  assert.equal(JSON.parse(result.stdout).env_keys_present, false);
});

// ---------------------------------------------------------------- mock replay

test('a mock replay issues the file-request link and prints JSON only', async () => {
  const result = await run(withMock('dsm_mock_file_request_v0.json'), ENV);
  assert.equal(result.exit_code, EXIT.OK);
  assert.equal(result.stderr, '');
  const out = JSON.parse(result.stdout);
  assert.equal(out.mode, 'mock');
  assert.equal(out.mock_fixture_id, 'dsm_mock_file_request_v0');
  assert.equal(out.config_source, 'environment');
  assert.equal(out.link_kind, 'file_request');
  assert.equal(out.link_url, 'https://nas.invalid:5001/sharing/mockfilerequest01');
  assert.equal(out.expires_at, '2026-08-22T05:00:00.000Z');
  assert.equal(out.dsm_link_id, 'mockfilerequest01');
});

test('two replays of the same fixture print the same bytes', async () => {
  const once = await run(withMock('dsm_mock_file_request_v0.json'), ENV);
  const twice = await run(withMock('dsm_mock_file_request_v0.json'), ENV);
  assert.equal(once.stdout, twice.stdout);
  assert.equal(once.exit_code, twice.exit_code);
});

test('a fixture may carry a synthetic environment so a demo needs no credential', async () => {
  const result = await run(withMock('dsm_mock_sharing_fallback_v0.json'), {});
  assert.equal(result.exit_code, EXIT.OK);
  const out = JSON.parse(result.stdout);
  assert.equal(out.config_source, 'mock_fixture');
  assert.equal(out.link_kind, 'sharing_edit');
  assert.equal(out.fallback_reason, 'file_request_capability_absent');
  assert.deepEqual(out.notes, ['sharing_edit_permission_unverified']);
});

test('the real environment wins over a fixture environment', async () => {
  const result = await run(withMock('dsm_mock_file_request_v0.json'), ENV);
  assert.equal(JSON.parse(result.stdout).config_source, 'environment');
});

// ---------------------------------------------------------------- secrets

test('no environment value reaches stdout or stderr, on success or on refusal', async () => {
  const ok = await run(withMock('dsm_mock_file_request_v0.json'), ENV);
  const withPassword = await run(
    withMock('dsm_mock_file_request_v0.json', ['--password-from-env', 'LINK_PW']),
    { ...ENV, LINK_PW: LINK_PASSWORD });
  const refused = await run(withMock('dsm_mock_file_request_v0.json'),
    { ...ENV, SOULFORGE_NAS_HOST: 'http://nas.invalid' });

  for (const result of [ok, withPassword, refused]) {
    for (const stream of [result.stdout, result.stderr]) {
      assert.equal(stream.includes(SECRET), false);
      assert.equal(stream.includes(LINK_PASSWORD), false);
      // The fixture's placeholder secret is an env value too, and is held to the same rule.
      assert.equal(stream.includes('mock-password-not-a-credential'), false);
    }
  }
  assert.equal(JSON.parse(withPassword.stdout).password_set, true);
});

test('a password is taken from a named env key and never from the command line', async () => {
  const missing = await run(
    withMock('dsm_mock_file_request_v0.json', ['--password-from-env', 'NOT_SET_ANYWHERE']), ENV);
  assert.equal(missing.exit_code, EXIT.CONFIG);
  const error = JSON.parse(missing.stderr);
  assert.equal(error.error_code, 'NAS_LINK_PASSWORD_ENV_EMPTY');
  assert.equal(error.detail.env_key, 'NOT_SET_ANYWHERE');
});

// ---------------------------------------------------------------- refusals

test('an http host is refused before any call is attempted', async () => {
  const result = await run(withMock('dsm_mock_file_request_v0.json'),
    { ...ENV, SOULFORGE_NAS_HOST: 'http://nas.invalid' });
  assert.equal(result.exit_code, EXIT.CONFIG);
  assert.equal(JSON.parse(result.stderr).error_code, 'NAS_HTTPS_REQUIRED');
});

test('a machine without the keys and without a fixture environment is told which names are missing', async () => {
  const result = await run(ARGS, {});
  assert.equal(result.exit_code, EXIT.CONFIG);
  const error = JSON.parse(result.stderr);
  assert.equal(error.error_code, 'NAS_CONFIG_INCOMPLETE');
  assert.ok(error.detail.missing_keys.includes('SOULFORGE_NAS_HOST'));
});

test('an unreadable or malformed fixture is its own exit code', async () => {
  const missing = await run([...ARGS, '--mock', fixturePath('there_is_no_such_fixture.json')], ENV);
  assert.equal(missing.exit_code, EXIT.MOCK);
  assert.equal(JSON.parse(missing.stderr).schema_version, 'soulforge.nas_issue_link_cli.v0');
});

test('a folder pointer that climbs is refused with the argument code', async () => {
  const result = await run([
    '--ticket', 'up_20260819t050000z_abcdef',
    '--folder', 'tickets/../../etc',
    '--purpose', 'upload',
    '--expires', '2026-08-22T05:00:00.000Z',
    '--dry-run',
  ], ENV);
  assert.equal(result.exit_code, EXIT.USAGE);
  assert.equal(JSON.parse(result.stderr).error_code, 'NAS_LINK_FOLDER_REF_INVALID');
});

// ---------------------------------------------------------------- as a child process

test('spawned as a child, the command prints one JSON object on stdout and exits zero', () => {
  const child = spawnSync(process.execPath,
    [CLI_PATH, ...withMock('dsm_mock_request_param_refused_v0.json')], {
      encoding: 'utf8',
      env: { ...ENV, PATH: process.env.PATH ?? '' },
    });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const out = JSON.parse(child.stdout);
  assert.equal(out.link_kind, 'sharing_edit');
  assert.equal(out.fallback_reason, 'file_request_refused');
  assert.equal(child.stdout.includes(SECRET), false);
});
