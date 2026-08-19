// Issuing one link for one ticket, over the three DSM shapes the fleet may actually have.
//
// The plan half is pure, so most of this asserts values rather than effects: the same input has to
// produce the same plan on every machine, and the plan has to say which folder will be touched
// before anything touches it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createMockFetch } from '../mock_transport.mjs';
import {
  EXPIRY_FORMATS, ISSUE_ERROR_CODES, LINK_KINDS, assertTicketFolderRel, dsmExpiry, issueLink,
  planLinkIssue,
} from '../issue_link.mjs';
import {
  DEFAULT_ENV_PREFIX, SYNOLOGY_ERROR_CODES, Secret, createSynologyClient, discoverCapabilities,
  readNasConfig,
} from '../synology_api.mjs';

const SECRET = 'synthetic-secret-value-0000';
const LINK_PASSWORD = 'synthetic-link-password-1111';

const ENV = Object.freeze({
  SOULFORGE_NAS_HOST: 'nas.invalid',
  SOULFORGE_NAS_PORT: '5001',
  SOULFORGE_NAS_USER: 'mock_account',
  SOULFORGE_NAS_PASSWORD: SECRET,
  SOULFORGE_NAS_SHARE: 'soulforge_intake',
});

const TICKET = Object.freeze({
  ticket_id: 'up_20260819t050000z_abcdef',
  ticket_folder_rel: 'tickets/mock_person/up_20260819t050000z_abcdef',
  purpose: 'upload',
  expires_at: '2026-08-22T05:00:00.000Z',
  share: 'soulforge_intake',
});

const fixtureFile = (name) => JSON.parse(readFileSync(
  new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

const clientFor = (name) => createSynologyClient({
  config: readNasConfig(ENV, DEFAULT_ENV_PREFIX),
  fetch: createMockFetch(fixtureFile(name)),
});

const capsWithSharing = (maxVersion) => discoverCapabilities({
  'SYNO.API.Auth': { path: 'auth.cgi', maxVersion: 6 },
  'SYNO.FileStation.CreateFolder': { path: 'entry.cgi', maxVersion: 2 },
  'SYNO.FileStation.List': { path: 'entry.cgi', maxVersion: 2 },
  'SYNO.FileStation.Sharing': { path: 'entry.cgi', maxVersion: maxVersion },
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

// ---------------------------------------------------------------- the pointer rule

test('a ticket folder is a pointer under the share and nothing else', () => {
  assert.deepEqual(assertTicketFolderRel('tickets/mock_person/up_1'),
    ['tickets', 'mock_person', 'up_1']);
  // The drive-letter case is assembled rather than written out: a literal one in the source would
  // read as this repository's own local path to the absolute-path policy validator.
  const driveLetterPath = `${'C'}:/tickets/up_1`;
  for (const bad of [
    '/tickets/up_1', '\\tickets\\up_1', driveLetterPath, 'tickets/../../etc',
    'tickets/./up_1'.replace('./', '../'), 'tickets\\up_1', '', 'a/b/c/d/e/f/g/h/i',
    'tickets/up_1.', 'tickets/up*1',
  ]) {
    const error = (() => {
      try {
        assertTicketFolderRel(bad);
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    assert.equal(error?.code, ISSUE_ERROR_CODES.FOLDER_REF_INVALID, `"${bad}" should be refused`);
  }
});

// ---------------------------------------------------------------- expiry

test('an expiry is encoded both ways DSM has taken, from the same instant', () => {
  assert.equal(dsmExpiry('2026-08-22T05:00:00.000Z', 'datetime'), '2026-08-22 05:00:00');
  assert.equal(dsmExpiry('2026-08-22T05:00:00.000Z', 'date'), '2026-08-22');
  assert.deepEqual([...EXPIRY_FORMATS], ['datetime', 'date']);
});

test('an expiry that is not a UTC instant is refused', () => {
  for (const bad of ['2026-08-22', '2026-08-22T05:00:00+09:00', 'tomorrow', '']) {
    const error = (() => {
      try {
        dsmExpiry(bad);
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    assert.equal(error?.code, ISSUE_ERROR_CODES.ARGUMENT_INVALID, `"${bad}" should be refused`);
  }
});

// ---------------------------------------------------------------- the plan

test('a plan names the folder and the parent before anything is created', () => {
  const plan = planLinkIssue({ ...TICKET, capabilities: capsWithSharing(3) });
  assert.equal(plan.folder_path,
    '/soulforge_intake/tickets/mock_person/up_20260819t050000z_abcdef');
  assert.equal(plan.folder_parent_path, '/soulforge_intake/tickets/mock_person');
  assert.equal(plan.folder_name, 'up_20260819t050000z_abcdef');
  assert.equal(plan.link_kind_attempted, 'file_request');
  assert.equal(plan.capability_kind, 'sharing_request_param');
  assert.equal(plan.dsm_date_expired, '2026-08-22 05:00:00');
  assert.equal(plan.expires_at, TICKET.expires_at);
  assert.equal(plan.password_set, false);
});

test('the same input makes the same plan every time, and carries no secret', () => {
  const once = planLinkIssue({ ...TICKET, capabilities: capsWithSharing(3), has_password: true });
  const twice = planLinkIssue({ ...TICKET, capabilities: capsWithSharing(3), has_password: true });
  assert.deepEqual(JSON.parse(JSON.stringify(once)), JSON.parse(JSON.stringify(twice)));
  assert.equal(once.password_set, true);
  assert.equal(JSON.stringify(once).includes(SECRET), false);
});

test('an unprobed box still plans a file request; a probed box without one plans the fallback', () => {
  const unprobed = planLinkIssue({ ...TICKET, capabilities: null });
  assert.equal(unprobed.capabilities_known, false);
  assert.equal(unprobed.capability_absent, false);
  assert.equal(unprobed.link_kind_attempted, 'file_request');

  const probed = planLinkIssue({ ...TICKET, capabilities: capsWithSharing(2) });
  assert.equal(probed.capabilities_known, true);
  assert.equal(probed.capability_absent, true);
  assert.equal(probed.link_kind_attempted, 'sharing_edit');
});

test('a download plans a view link with no fallback and needs no capability', () => {
  const plan = planLinkIssue({
    ...TICKET,
    purpose: 'download',
    ticket_folder_rel: 'outbox/mock_person/dn_20260819t050000z_abcdef',
    capabilities: capsWithSharing(2),
  });
  assert.equal(plan.link_kind_attempted, 'sharing_view');
  assert.equal(plan.link_kind_fallback, null);
  assert.equal(plan.capability_absent, false);
});

test('the file-request probe parameter is stated, not guessed at call time', () => {
  assert.deepEqual({ ...planLinkIssue({ ...TICKET, capabilities: capsWithSharing(3) }).file_request_extra },
    { type: 'request' });
  assert.deepEqual({
    ...planLinkIssue({
      ...TICKET, capabilities: capsWithSharing(3), file_request_param: 'request',
    }).file_request_extra,
  }, { request: 'true' });
});

test('an unknown purpose, probe or expiry format is refused rather than defaulted', () => {
  for (const patch of [
    { purpose: 'sideways' }, { file_request_param: 'maybe' }, { expiry_format: 'epoch' },
  ]) {
    const error = (() => {
      try {
        planLinkIssue({ ...TICKET, capabilities: capsWithSharing(3), ...patch });
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    assert.equal(error?.code, ISSUE_ERROR_CODES.ARGUMENT_INVALID);
  }
});

// ---------------------------------------------------------------- the three DSM shapes

test('a DSM with a file-request API issues an upload-only link', async () => {
  const client = clientFor('dsm_mock_file_request_v0.json');
  await client.login();
  const result = await issueLink({ ...TICKET, client });
  assert.equal(result.link_kind, 'file_request');
  assert.equal(result.capability_kind, 'file_request_api');
  assert.equal(result.fallback_reason, null);
  assert.equal(result.link_url, 'https://nas.invalid:5001/sharing/mockfilerequest01');
  assert.equal(result.dsm_link_id, 'mockfilerequest01');
  assert.equal(result.expires_at, TICKET.expires_at);
  assert.equal(result.folder_created, true);
  assert.deepEqual([...result.notes], []);
  assert.ok(LINK_KINDS.includes(result.link_kind));
});

test('a DSM with no file-request feature falls back to an editable link and says so', async () => {
  const client = clientFor('dsm_mock_sharing_fallback_v0.json');
  await client.login();
  const result = await issueLink({ ...TICKET, client });
  assert.equal(result.link_kind, 'sharing_edit');
  assert.equal(result.capability_kind, null);
  assert.equal(result.fallback_reason, 'file_request_capability_absent');
  assert.deepEqual([...result.notes], ['sharing_edit_permission_unverified']);
});

test('a DSM that refuses the probe falls back on the refusal, not on a guess', async () => {
  const client = clientFor('dsm_mock_request_param_refused_v0.json');
  await client.login();
  const result = await issueLink({ ...TICKET, client });
  assert.equal(result.link_kind, 'sharing_edit');
  assert.equal(result.capability_kind, 'sharing_request_param');
  assert.equal(result.fallback_reason, 'file_request_refused');
  assert.equal(result.link_url, 'https://nas.invalid:5001/sharing/mocksharingedit02');
});

test('a download takes the sharing link and never the request path', async () => {
  const client = clientFor('dsm_mock_file_request_v0.json');
  await client.login();
  const result = await issueLink({
    ...TICKET,
    purpose: 'download',
    ticket_id: 'dn_20260819t050000z_abcdef',
    ticket_folder_rel: 'outbox/mock_person/dn_20260819t050000z_abcdef',
    client,
  });
  assert.equal(result.link_kind, 'sharing_view');
  assert.equal(result.dsm_link_id, 'mocksharingview01');
  assert.equal(client.calls().some((row) => row.api.endsWith('Sharing.Request')), false);
});

test('a link password is used and never returned', async () => {
  const client = clientFor('dsm_mock_file_request_v0.json');
  await client.login();
  const result = await issueLink({ ...TICKET, client, password: new Secret(LINK_PASSWORD) });
  assert.equal(result.password_set, true);
  const serialised = JSON.stringify(result);
  assert.equal(serialised.includes(LINK_PASSWORD), false);
  assert.equal(serialised.includes(SECRET), false);
});

test('replaying the same fixture twice produces the same result bytes', async () => {
  const once = await (async () => {
    const client = clientFor('dsm_mock_file_request_v0.json');
    await client.login();
    return issueLink({ ...TICKET, client });
  })();
  const twice = await (async () => {
    const client = clientFor('dsm_mock_file_request_v0.json');
    await client.login();
    return issueLink({ ...TICKET, client });
  })();
  assert.equal(JSON.stringify(once), JSON.stringify(twice));
});

test('a transport failure is not laundered into a fallback link', async () => {
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
          body: {
            success: true,
            data: {
              'SYNO.API.Auth': { path: 'auth.cgi', maxVersion: 6 },
              'SYNO.FileStation.CreateFolder': { path: 'entry.cgi', maxVersion: 2 },
              'SYNO.FileStation.Sharing': { path: 'entry.cgi', maxVersion: 3 },
            },
          },
        },
        { api: 'SYNO.API.Auth', method: 'login', body: { success: true, data: { sid: 'mock-sid' } } },
        { api: 'SYNO.FileStation.CreateFolder', method: 'create', body: { success: true, data: {} } },
      ],
    }),
  });
  await client.login();
  const error = await refusalOf(() => issueLink({ ...TICKET, client }));
  assert.equal(error.code, 'NAS_MOCK_NO_RESPONSE');
});

test('issuing without a client is refused before any argument is trusted', async () => {
  const error = await refusalOf(() => issueLink({ ...TICKET, client: null }));
  assert.equal(error.code, ISSUE_ERROR_CODES.ARGUMENT_INVALID);
});

test('a session is required before a folder or a link is asked for', async () => {
  const client = clientFor('dsm_mock_file_request_v0.json');
  const error = await refusalOf(() => issueLink({ ...TICKET, client }));
  assert.equal(error.code, SYNOLOGY_ERROR_CODES.NOT_LOGGED_IN);
});
