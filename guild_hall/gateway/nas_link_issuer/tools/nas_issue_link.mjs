#!/usr/bin/env node
// The link issuer as a command — the only entry point anything else uses.
//
//   node guild_hall/gateway/nas_link_issuer/tools/nas_issue_link.mjs \
//     --ticket <id> --folder <rel-under-share> --purpose upload|download --expires <iso> \
//     [--password-from-env NAME] [--env-prefix SOULFORGE_NAS] \
//     [--expiry-format datetime|date] [--file-request-param type|request] \
//     [--dry-run] [--mock <fixture.json>]
//
// It is a command rather than a library call because of who calls it. The engine's `file_ticket`
// spawns this as a child process, which is what keeps the engine process itself network-free
// (manual 12 §12.C: 엔진은 네트워크를 부르지 않는다). A child that dies takes no engine state with it.
//
// Contract with that caller, and with a person:
//
//   * **stdout is JSON and nothing else.** One object, no logging, no progress line. A refusal goes
//     to stderr as JSON and the exit code says which kind it was.
//   * **no secret leaves this process.** The password/token is read from the environment into a
//     `Secret`, handed to the login body, and never printed — not in the result, not in an error,
//     not in a stack. `--password-from-env` names an env key; it never takes a value on the command
//     line, because a command line is visible in the process table.
//   * **`--dry-run` makes no call at all**, and `--mock` replays a fixture instead of the network.
//     Between them the whole path is demonstrable before a credential exists.

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createMockFetch } from '../mock_transport.mjs';
import { issueLink, planLinkIssue } from '../issue_link.mjs';
import {
  DEFAULT_ENV_PREFIX, NAS_LINK_ISSUER_SCHEMA_VERSION, SYNOLOGY_ERROR_CODES, Secret,
  assertEnvPrefix, createSynologyClient, envKeyNames, nasEnvPresence, readNasConfig, redactSecrets,
} from '../synology_api.mjs';

export const CLI_SCHEMA_VERSION = 'soulforge.nas_issue_link_cli.v0';

export const EXIT = Object.freeze({
  OK: 0,
  USAGE: 64,
  CONFIG: 3,
  DSM: 4,
  MOCK: 5,
});

const FLAGS = Object.freeze([
  'ticket', 'folder', 'purpose', 'expires', 'password-from-env', 'env-prefix',
  'expiry-format', 'file-request-param', 'mock',
]);
const SWITCHES = Object.freeze(['dry-run', 'help']);

export function parseArgs(argv) {
  const out = { _unknown: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      out._unknown.push(token);
      continue;
    }
    const name = token.slice(2);
    if (SWITCHES.includes(name)) {
      out[name] = true;
      continue;
    }
    if (!FLAGS.includes(name)) {
      out._unknown.push(token);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      out._unknown.push(token);
      continue;
    }
    out[name] = value;
    index += 1;
  }
  return out;
}

const USAGE = Object.freeze({
  usage: 'node guild_hall/gateway/nas_link_issuer/tools/nas_issue_link.mjs --ticket <id> --folder <rel> --purpose upload|download --expires <iso> [--password-from-env NAME] [--env-prefix NAME] [--expiry-format datetime|date] [--file-request-param type|request] [--dry-run] [--mock <fixture.json>]',
  notes: [
    '--folder is a pointer under the share, never an absolute path.',
    '--password-from-env names an env key; a password is never passed on the command line.',
    '--dry-run makes no network call; --mock replays a canned DSM fixture.',
    'stdout carries one JSON object and nothing else.',
  ],
});

/**
 * Runs one issuance and returns `{ exit_code, stdout, stderr }` instead of writing them.
 *
 * Structured this way so a test can drive the whole command in-process and assert on the bytes,
 * and so the same code path serves the spawned child.
 */
export async function run(argv, env = process.env) {
  const args = parseArgs(argv);
  if (args.help === true) {
    return { exit_code: EXIT.USAGE, stdout: '', stderr: json({ ...USAGE }) };
  }
  if (args._unknown.length > 0) {
    return refusal(EXIT.USAGE, 'NAS_LINK_CLI_ARGUMENT_UNKNOWN',
      'this command does not take that argument', { ...USAGE });
  }
  for (const required of ['ticket', 'folder', 'purpose', 'expires']) {
    if (typeof args[required] !== 'string') {
      return refusal(EXIT.USAGE, 'NAS_LINK_CLI_ARGUMENT_MISSING',
        'a required argument is missing', { field: `--${required}`, ...USAGE });
    }
  }

  const prefix = args['env-prefix'] ?? DEFAULT_ENV_PREFIX;
  try {
    assertEnvPrefix(prefix);
  } catch (error) {
    return refusal(EXIT.USAGE, error?.code ?? 'NAS_LINK_CLI_ARGUMENT_UNKNOWN',
      error?.message ?? 'that env prefix is not one', { field: '--env-prefix' });
  }
  const planInput = {
    ticket_id: args.ticket,
    ticket_folder_rel: args.folder,
    purpose: args.purpose,
    expires_at: args.expires,
    expiry_format: args['expiry-format'] ?? 'datetime',
    file_request_param: args['file-request-param'] ?? 'type',
  };

  let mock = null;
  if (typeof args.mock === 'string') {
    try {
      mock = createMockFetch(JSON.parse(await readFile(args.mock, 'utf8')));
    } catch (error) {
      return refusal(EXIT.MOCK, error?.code ?? 'NAS_MOCK_FIXTURE_UNREADABLE',
        'this mock fixture could not be used', { detail: error?.detail ?? null });
    }
  }

  // The fixture may carry a synthetic environment so a demo needs no credential at all. Real keys
  // always win: a machine that has them is the machine this is meant to run on.
  const presence = nasEnvPresence(env, prefix);
  const effectiveEnv = presence.complete || mock?.env == null
    ? env : { ...mock.env, ...stripEmpty(env) };
  const configSource = presence.complete ? 'environment'
    : (mock?.env == null ? 'environment' : 'mock_fixture');

  const keys = envKeyNames(prefix);
  let password = null;
  if (typeof args['password-from-env'] === 'string') {
    const name = args['password-from-env'];
    const value = effectiveEnv[name];
    if (typeof value !== 'string' || value.length === 0) {
      return refusal(EXIT.CONFIG, 'NAS_LINK_PASSWORD_ENV_EMPTY',
        'the named environment key carries nothing', { env_key: name });
    }
    password = new Secret(value);
  }

  if (args['dry-run'] === true) {
    let plan;
    try {
      plan = planLinkIssue({
        ...planInput, share: shareOf(effectiveEnv, keys), capabilities: null,
        has_password: password !== null,
      });
    } catch (error) {
      return refusal(EXIT.USAGE, error?.code ?? 'NAS_LINK_PLAN_REFUSED',
        error?.message ?? 'this ticket cannot be planned', error?.detail ?? {});
    }
    return {
      exit_code: EXIT.OK,
      stdout: json({
        schema_version: CLI_SCHEMA_VERSION,
        mode: 'dry_run',
        issuer_schema_version: NAS_LINK_ISSUER_SCHEMA_VERSION,
        config_source: configSource,
        env_prefix: prefix,
        env_keys_present: presence.complete,
        calls_made: 0,
        plan,
      }),
      stderr: '',
    };
  }

  let config;
  try {
    config = readNasConfig(effectiveEnv, prefix);
  } catch (error) {
    return refusal(EXIT.CONFIG, error?.code ?? SYNOLOGY_ERROR_CODES.CONFIG_INVALID,
      error?.message ?? 'the NAS configuration is not usable', error?.detail ?? {});
  }

  const secrets = [config.secret, password].filter((value) => value !== null);
  const client = createSynologyClient({ config, fetch: mock ?? undefined });

  try {
    await client.login();
    const result = await issueLink({
      ...planInput, client, share: config.share, password,
    });
    return {
      exit_code: EXIT.OK,
      stdout: json({
        schema_version: CLI_SCHEMA_VERSION,
        mode: mock === null ? 'live' : 'mock',
        mock_fixture_id: mock?.fixture_id ?? null,
        config_source: configSource,
        env_prefix: prefix,
        ...result,
      }),
      stderr: '',
    };
  } catch (error) {
    return refusal(exitFor(error), error?.code ?? 'NAS_LINK_FAILED',
      redactSecrets(error?.message ?? 'the link could not be issued', secrets),
      redactDetail(error?.detail ?? {}, secrets));
  } finally {
    // A session left open on the NAS is a session somebody has to notice. Logging out is best
    // effort: it must never turn a successful issuance into a failure.
    try {
      await client.logout();
    } catch { /* the session expires on its own */ }
  }
}

const stripEmpty = (env) => Object.fromEntries(Object.entries(env)
  .filter(([, value]) => typeof value === 'string' && value.length > 0));

const shareOf = (env, keys) => (typeof env[keys.share] === 'string' && env[keys.share].length > 0
  ? env[keys.share] : 'soulforge_intake');

const exitFor = (error) => {
  if (error?.code === SYNOLOGY_ERROR_CODES.CONFIG_INCOMPLETE
    || error?.code === SYNOLOGY_ERROR_CODES.CONFIG_INVALID
    || error?.code === SYNOLOGY_ERROR_CODES.HTTPS_REQUIRED) return EXIT.CONFIG;
  if (error?.code === 'NAS_MOCK_NO_RESPONSE' || error?.code === 'NAS_MOCK_FIXTURE_INVALID') {
    return EXIT.MOCK;
  }
  if (String(error?.code ?? '').startsWith('NAS_LINK_')) return EXIT.USAGE;
  return EXIT.DSM;
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const refusal = (exitCode, code, message, detail = {}) => ({
  exit_code: exitCode,
  stdout: '',
  stderr: json({ schema_version: CLI_SCHEMA_VERSION, error_code: code, message, detail }),
});

/** A detail block is machine material, so it is scrubbed the same way a message is. */
function redactDetail(detail, secrets) {
  try {
    return JSON.parse(redactSecrets(JSON.stringify(detail ?? {}), secrets));
  } catch {
    return {};
  }
}

/** Same test the engine runners use: a Windows drive letter differs in case between the two. */
export function isDirectInvocation(entryPath, moduleUrl) {
  if (typeof entryPath !== 'string' || entryPath.length === 0
    || typeof moduleUrl !== 'string' || moduleUrl.length === 0) return false;
  try {
    const entryUrl = pathToFileURL(entryPath).href;
    if (process.platform !== 'win32') return entryUrl === moduleUrl;
    const normaliseDrive = (value) => value.replace(/^file:\/\/\/[A-Za-z]:/u,
      (prefix) => prefix.toLowerCase());
    return normaliseDrive(entryUrl) === normaliseDrive(moduleUrl);
  } catch {
    return false;
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  const result = await run(process.argv.slice(2));
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exitCode = result.exit_code;
}
