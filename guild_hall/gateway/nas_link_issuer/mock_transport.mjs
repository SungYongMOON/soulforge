// A canned DSM, for tests and for showing somebody the flow without a NAS.
//
// The issuer has to be reviewable and demonstrable before any credential exists (manual 12 §12.C:
// "모의(mock) DSM 응답으로 시험, 실계정은 `.env`로만"). This module replays a fixture in place of
// `fetch`, so every branch — file-request API, request parameter, fallback, refusal — is exercised
// with no network stack and no account.
//
// Two properties it has to hold:
//
//   * **it is a stand-in, not a stub.** A request it has no answer for is an error naming the
//     api/method, never a silent success. A fixture that drifts from the code fails loudly.
//   * **it never touches the network.** `createMockFetch` closes over the fixture only. A test can
//     assert that by handing the client this transport and checking that `globalThis.fetch` was
//     never reachable — there is nothing here that could call it.
//
// The request body is parsed for matching but is not stored: a login body carries the password, and
// a recorder that kept request bodies would be a credential log.

export const MOCK_FIXTURE_SCHEMA_VERSION = 'soulforge.nas_link_issuer_mock_dsm.v0';

export const MOCK_ERROR_CODES = Object.freeze({
  FIXTURE_INVALID: 'NAS_MOCK_FIXTURE_INVALID',
  NO_RESPONSE: 'NAS_MOCK_NO_RESPONSE',
});

export class MockTransportError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'MockTransportError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new MockTransportError(code, message, detail);
};

/**
 * Checks the shape a fixture has to have before anything replays it.
 *
 * @param raw the parsed fixture JSON
 * @returns a frozen fixture with its rows in order
 */
export function validateMockFixture(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(MOCK_ERROR_CODES.FIXTURE_INVALID, 'a mock fixture is a JSON object', {});
  }
  if (raw.schema_version !== MOCK_FIXTURE_SCHEMA_VERSION) {
    fail(MOCK_ERROR_CODES.FIXTURE_INVALID, 'unexpected mock fixture schema_version',
      { expected: MOCK_FIXTURE_SCHEMA_VERSION });
  }
  if (!Array.isArray(raw.responses) || raw.responses.length === 0 || raw.responses.length > 64) {
    fail(MOCK_ERROR_CODES.FIXTURE_INVALID, 'a mock fixture carries between one and 64 responses', {});
  }
  const responses = raw.responses.map((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(MOCK_ERROR_CODES.FIXTURE_INVALID, 'a mock response is an object', { index });
    }
    if (typeof row.api !== 'string' || typeof row.method !== 'string') {
      fail(MOCK_ERROR_CODES.FIXTURE_INVALID, 'a mock response names an api and a method', { index });
    }
    if (row.body === null || typeof row.body !== 'object') {
      fail(MOCK_ERROR_CODES.FIXTURE_INVALID, 'a mock response carries a JSON body', { index });
    }
    return Object.freeze({
      api: row.api,
      method: row.method,
      // `repeat: true` is how the api-info answer stays available to every capability lookup.
      repeat: row.repeat === true,
      http_status: Number.isSafeInteger(row.http_status) ? row.http_status : 200,
      body: row.body,
    });
  });
  return Object.freeze({
    fixture_id: typeof raw.fixture_id === 'string' ? raw.fixture_id : 'unnamed',
    schema_version: MOCK_FIXTURE_SCHEMA_VERSION,
    note: typeof raw.note === 'string' ? raw.note : '',
    env: raw.env === null || typeof raw.env !== 'object' || Array.isArray(raw.env)
      ? null : Object.freeze({ ...raw.env }),
    responses: Object.freeze(responses),
  });
}

/**
 * A `fetch` that answers from the fixture.
 *
 * Rows are matched in order by api and method and consumed once, unless the row said `repeat`.
 * The order is what makes a replay deterministic: the same fixture and the same arguments produce
 * the same sequence of answers on every run and on every machine.
 */
export function createMockFetch(fixture) {
  const validated = validateMockFixture(fixture);
  const used = new Set();
  const seen = [];

  const transport = async (url, init = {}) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      fail(MOCK_ERROR_CODES.NO_RESPONSE, 'the mock transport only answers https calls', {});
    }
    const params = new URLSearchParams(String(init.body ?? ''));
    const api = params.get('api') ?? '';
    const method = params.get('method') ?? '';
    seen.push({ api, method, version: params.get('version') ?? null });
    let match = null;
    for (let index = 0; index < validated.responses.length; index += 1) {
      const row = validated.responses[index];
      if (row.api !== api || row.method !== method) continue;
      if (used.has(index) && !row.repeat) continue;
      used.add(index);
      match = row;
      break;
    }
    if (match === null) {
      fail(MOCK_ERROR_CODES.NO_RESPONSE, 'this mock fixture has no answer for that call',
        { api, method, fixture_id: validated.fixture_id });
    }
    const text = JSON.stringify(match.body);
    return {
      ok: match.http_status >= 200 && match.http_status < 300,
      status: match.http_status,
      text: async () => text,
    };
  };

  transport.fixture_id = validated.fixture_id;
  transport.env = validated.env;
  /** api/method/version only — a request body may carry a password and is never recorded. */
  transport.seen = () => seen.map((row) => ({ ...row }));
  return transport;
}
