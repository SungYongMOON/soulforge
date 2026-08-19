// The DSM client, driven entirely against canned answers.
//
// No test here reaches a network: every client is built with the mock transport, and the two tests
// that matter most are the ones about what *cannot* happen — an http endpoint, and a secret in an
// output string.

import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';

import { createMockFetch } from '../mock_transport.mjs';
import {
  DEFAULT_ENV_PREFIX, FILE_REQUEST_API_NAMES, REDACTED, SYNOLOGY_ERROR_CODES, Secret,
  SynologyApiError, baseUrlFrom, createSynologyClient, discoverCapabilities, dsmErrorMeaning,
  envKeyNames, nasEnvPresence, normaliseLink, readNasConfig, redactSecrets,
} from '../synology_api.mjs';

const SECRET = 'synthetic-secret-value-0000';

const ENV = Object.freeze({
  SOULFORGE_NAS_HOST: 'nas.invalid',
  SOULFORGE_NAS_PORT: '5001',
  SOULFORGE_NAS_USER: 'mock_account',
  SOULFORGE_NAS_PASSWORD: SECRET,
  SOULFORGE_NAS_SHARE: 'soulforge_intake',
  SOULFORGE_NAS_UNC: '\\\\nas.invalid\\soulforge_intake',
});

const API_INFO_DATA = Object.freeze({
  'SYNO.API.Auth': { path: 'auth.cgi', minVersion: 1, maxVersion: 6 },
  'SYNO.FileStation.CreateFolder': { path: 'entry.cgi', minVersion: 1, maxVersion: 2 },
  'SYNO.FileStation.List': { path: 'entry.cgi', minVersion: 1, maxVersion: 2 },
  'SYNO.FileStation.Sharing': { path: 'entry.cgi', minVersion: 1, maxVersion: 3 },
});

const fixture = (responses) => ({
  fixture_id: 'inline',
  schema_version: 'soulforge.nas_link_issuer_mock_dsm.v0',
  responses: [
    { api: 'SYNO.API.Info', method: 'query', repeat: true, body: { success: true, data: API_INFO_DATA } },
    ...responses,
  ],
});

const clientWith = (responses, env = ENV) => createSynologyClient({
  config: readNasConfig(env, DEFAULT_ENV_PREFIX),
  fetch: createMockFetch(fixture(responses)),
});

const refusalOf = async (run) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail('this should have been refused');
  return null;
};

// ---------------------------------------------------------------- env, names only

test('the env presence report names keys and never carries a value', () => {
  const presence = nasEnvPresence(ENV);
  assert.equal(presence.complete, true);
  assert.equal(presence.secret_kind, 'password');
  assert.deepEqual([...presence.missing_keys], []);
  assert.ok(!JSON.stringify(presence).includes(SECRET));
  assert.deepEqual([...presence.required_keys],
    ['SOULFORGE_NAS_HOST', 'SOULFORGE_NAS_USER', 'SOULFORGE_NAS_SHARE']);
});

test('a machine without the keys is told which names are missing, not what they should hold', () => {
  const presence = nasEnvPresence({ SOULFORGE_NAS_HOST: 'nas.invalid' });
  assert.equal(presence.complete, false);
  assert.equal(presence.secret_kind, null);
  assert.deepEqual([...presence.missing_keys], [
    'SOULFORGE_NAS_USER', 'SOULFORGE_NAS_SHARE',
    'SOULFORGE_NAS_PASSWORD | SOULFORGE_NAS_TOKEN',
  ]);
  const error = (() => {
    try {
      readNasConfig({ SOULFORGE_NAS_HOST: 'nas.invalid' });
    } catch (caught) {
      return caught;
    }
    return null;
  })();
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.CONFIG_INCOMPLETE);
});

test('a token stands in for a password and the key names say which one was used', () => {
  const presence = nasEnvPresence({
    SOULFORGE_NAS_HOST: 'nas.invalid',
    SOULFORGE_NAS_USER: 'mock_account',
    SOULFORGE_NAS_SHARE: 'soulforge_intake',
    SOULFORGE_NAS_TOKEN: SECRET,
  });
  assert.equal(presence.secret_kind, 'token');
  assert.equal(presence.complete, true);
  assert.equal(envKeyNames('SOULFORGE_NAS').token, 'SOULFORGE_NAS_TOKEN');
});

// ---------------------------------------------------------------- https only

test('an http host is refused rather than upgraded', () => {
  const error = (() => {
    try {
      baseUrlFrom({ host: 'http://nas.invalid', port: '5000' });
    } catch (caught) {
      return caught;
    }
    return null;
  })();
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.HTTPS_REQUIRED);
});

test('a bare host becomes an https base url with the stated port', () => {
  assert.equal(baseUrlFrom({ host: 'nas.invalid', port: '5001' }), 'https://nas.invalid:5001');
  assert.equal(baseUrlFrom({ host: 'https://nas.invalid' }), 'https://nas.invalid');
});

test('a host that is really a url with a path or credentials is refused', () => {
  for (const host of ['https://nas.invalid/webapi', 'https://user:pw@nas.invalid', 'ftp://nas.invalid']) {
    const error = (() => {
      try {
        baseUrlFrom({ host });
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    assert.ok(error instanceof SynologyApiError, `${host} should have been refused`);
  }
});

// ---------------------------------------------------------------- secrets

test('a Secret renders redacted in every direction a value normally leaks', () => {
  const secret = new Secret(SECRET);
  assert.equal(String(secret), REDACTED);
  assert.equal(JSON.stringify({ passwd: secret }), `{"passwd":"${REDACTED}"}`);
  assert.equal(inspect(secret), REDACTED);
  assert.equal(inspect({ passwd: secret }).includes(SECRET), false);
  assert.equal(secret.reveal(), SECRET);
});

test('the config object can be serialised into a diagnostic without leaking the secret', () => {
  const config = readNasConfig(ENV);
  const serialised = JSON.stringify(config);
  assert.equal(serialised.includes(SECRET), false);
  assert.ok(serialised.includes(REDACTED));
  assert.equal(config.secret.reveal(), SECRET);
});

test('redactSecrets removes every occurrence, including inside a longer string', () => {
  const text = `login failed for ${SECRET} using ${SECRET}`;
  const scrubbed = redactSecrets(text, [new Secret(SECRET)]);
  assert.equal(scrubbed.includes(SECRET), false);
  assert.equal(scrubbed, `login failed for ${REDACTED} using ${REDACTED}`);
});

// ---------------------------------------------------------------- capabilities

test('a dedicated file-request API wins over the sharing parameter probe', () => {
  for (const name of FILE_REQUEST_API_NAMES) {
    const caps = discoverCapabilities({
      ...API_INFO_DATA,
      [name]: { path: 'entry.cgi', minVersion: 1, maxVersion: 1 },
    });
    assert.equal(caps.file_request.available, true);
    assert.equal(caps.file_request.kind, 'file_request_api');
    assert.equal(caps.file_request.api, name);
  }
});

test('a sharing API at version 3 is probed with a parameter instead', () => {
  const caps = discoverCapabilities(API_INFO_DATA);
  assert.equal(caps.file_request.kind, 'sharing_request_param');
  assert.equal(caps.file_request.api, 'SYNO.FileStation.Sharing');
  assert.equal(caps.sharing.version, 3);
});

test('an older sharing API means no file request is reachable at all', () => {
  const caps = discoverCapabilities({
    ...API_INFO_DATA,
    'SYNO.FileStation.Sharing': { path: 'entry.cgi', minVersion: 1, maxVersion: 2 },
  });
  assert.equal(caps.file_request.available, false);
  assert.equal(caps.file_request.kind, null);
  assert.equal(caps.sharing.available, true);
});

test('an empty api info is not a capability', () => {
  const caps = discoverCapabilities(null);
  assert.equal(caps.api_count, 0);
  assert.equal(caps.auth.available, false);
  assert.equal(caps.create_folder.available, false);
  assert.equal(caps.file_request.available, false);
});

// ---------------------------------------------------------------- session

test('api info, login and logout make exactly the calls they say they make', async () => {
  const client = clientWith([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
    { api: 'SYNO.API.Auth', method: 'logout', body: { success: true } },
  ]);
  assert.equal(client.logged_in(), false);
  await client.login();
  assert.equal(client.logged_in(), true);
  assert.equal(await client.logout(), true);
  assert.equal(client.logged_in(), false);
  assert.deepEqual(client.calls().map((row) => `${row.api}/${row.method}`), [
    'SYNO.API.Info/query', 'SYNO.API.Auth/login', 'SYNO.API.Auth/logout',
  ]);
});

test('a call before login is refused by the client rather than sent unauthenticated', async () => {
  const client = clientWith([]);
  const error = await refusalOf(() => client.createFolder('/soulforge_intake/tickets', 'up_1'));
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.NOT_LOGGED_IN);
});

test('a DSM answer asking for a one-time code is named, not reported as a bad password', async () => {
  const client = clientWith([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: false, error: { code: 403 } } },
  ]);
  const error = await refusalOf(() => client.login());
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.OTP_REQUIRED);
  assert.equal(error.detail.dsm_error_code, 403);
  assert.match(error.message, /application password|2FA/u);
  assert.equal(JSON.stringify(error).includes(SECRET), false);
});

test('a wrong credential is a DSM refusal that does not echo the credential', async () => {
  const client = clientWith([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: false, error: { code: 400 } } },
  ]);
  const error = await refusalOf(() => client.login());
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.DSM_REFUSED);
  assert.equal(error.detail.dsm_error_meaning, dsmErrorMeaning(400));
  assert.equal(JSON.stringify(error.toJSON()).includes(SECRET), false);
});

// ---------------------------------------------------------------- folders and links

test('creating a folder twice is created once and existed once', async () => {
  const client = clientWith([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
    { api: 'SYNO.FileStation.CreateFolder', method: 'create', body: { success: true, data: {} } },
    { api: 'SYNO.FileStation.CreateFolder', method: 'create', body: { success: false, error: { code: 1100 } } },
    {
      api: 'SYNO.FileStation.List',
      method: 'getinfo',
      body: { success: true, data: { files: [{ path: '/soulforge_intake/tickets/up_1', isdir: true }] } },
    },
  ]);
  await client.login();
  assert.deepEqual(await client.createFolder('/soulforge_intake/tickets', 'up_1'),
    { created: true, existed: false });
  assert.deepEqual(await client.createFolder('/soulforge_intake/tickets', 'up_1'),
    { created: false, existed: true });
});

test('a create refusal that is not "already there" stays a refusal', async () => {
  const client = clientWith([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
    { api: 'SYNO.FileStation.CreateFolder', method: 'create', body: { success: false, error: { code: 402 } } },
  ]);
  await client.login();
  const error = await refusalOf(() => client.createFolder('/soulforge_intake/tickets', 'up_1'));
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.DSM_REFUSED);
  assert.equal(error.detail.dsm_error_code, 402);
});

test('a folder DSM says is missing after an "already there" answer is still a refusal', async () => {
  const client = clientWith([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
    { api: 'SYNO.FileStation.CreateFolder', method: 'create', body: { success: false, error: { code: 414 } } },
    { api: 'SYNO.FileStation.List', method: 'getinfo', body: { success: true, data: { files: [] } } },
  ]);
  await client.login();
  const error = await refusalOf(() => client.createFolder('/soulforge_intake/tickets', 'up_1'));
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.DSM_REFUSED);
});

test('a sharing answer without an https url is not accepted as a link', () => {
  for (const data of [{}, { links: [] }, { links: [{ id: '1', url: 'http://nas.invalid/x' }] }]) {
    const error = (() => {
      try {
        normaliseLink(data);
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    assert.equal(error.code, SYNOLOGY_ERROR_CODES.DSM_REFUSED);
  }
  assert.deepEqual(normaliseLink({ links: [{ id: 42, url: 'https://nas.invalid/sharing/x' }] }),
    { link_url: 'https://nas.invalid/sharing/x', dsm_link_id: '42' });
});

test('a missing capability is a named refusal, not a call to an API the box lacks', async () => {
  const client = createSynologyClient({
    config: readNasConfig(ENV),
    fetch: createMockFetch({
      fixture_id: 'inline',
      schema_version: 'soulforge.nas_link_issuer_mock_dsm.v0',
      responses: [
        {
          api: 'SYNO.API.Info',
          method: 'query',
          repeat: true,
          body: { success: true, data: { 'SYNO.API.Auth': { path: 'auth.cgi', maxVersion: 6 } } },
        },
        { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
      ],
    }),
  });
  await client.login();
  const folder = await refusalOf(() => client.createFolder('/soulforge_intake', 'up_1'));
  assert.equal(folder.code, SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING);
  const sharing = await refusalOf(() => client.createSharingLink({ path: '/soulforge_intake/up_1' }));
  assert.equal(sharing.code, SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING);
  const request = await refusalOf(() => client.createFileRequestLink({ path: '/soulforge_intake/up_1' }));
  assert.equal(request.code, SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING);
});

test('the mock transport records api and method only — never a request body', async () => {
  const transport = createMockFetch(fixture([
    { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
  ]));
  const client = createSynologyClient({ config: readNasConfig(ENV), fetch: transport });
  await client.login();
  const seen = JSON.stringify(transport.seen());
  assert.equal(seen.includes(SECRET), false);
  assert.equal(seen.includes('mock_account'), false);
});

test('a call the fixture has no answer for is an error naming the call, not a generic failure', async () => {
  const client = clientWith([]);
  const error = await refusalOf(() => client.login());
  assert.equal(error.code, 'NAS_MOCK_NO_RESPONSE');
  assert.equal(error.detail.api, 'SYNO.API.Auth');
  assert.equal(error.detail.method, 'login');
});
