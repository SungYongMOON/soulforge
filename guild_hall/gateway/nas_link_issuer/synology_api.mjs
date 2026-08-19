// A minimal Synology DSM Web API client — the only part of Soulforge that talks to the NAS.
//
// Why it lives in the gateway and not in the engine (manual 12 §12.C, Owner 결정 2026-08-19): the
// engine makes **no network call at all**. `file_ticket` names a folder; turning that folder into
// something an outsider can open from a browser is a gateway job, and this file is where that job
// touches the wire. The engine reaches it only by spawning the CLI beside this module, so even the
// engine process stays network-free.
//
// Four rules shape everything below.
//
//   1. **HTTPS or nothing.** A DSM session id travels in these requests. `baseUrlFrom` refuses an
//      `http://` host rather than downgrading, and there is no flag that turns the refusal off.
//   2. **Secrets are boxed, never strings.** The password/token is wrapped in `Secret`, whose
//      `toString`, `toJSON` and node inspection all render `[redacted]`. That makes the ordinary
//      leak — `JSON.stringify(config)` in a log line, a thrown error carrying the request — a
//      structural impossibility rather than a review item. `redactSecrets` is the second belt.
//   3. **Nothing sensitive goes in a URL.** Every call is a POST with a form body, including
//      login, because query strings end up in proxy logs and DSM's own access log.
//   4. **Capability, not assumption.** Which sharing features this DSM exposes is discovered from
//      `SYNO.API.Info` and nothing else. If the file-request API is not on the box, the caller is
//      told so and falls back; the client never pretends a feature exists.
//
// What this does NOT handle, on purpose: **OTP / two-factor login.** DSM's `SYNO.API.Auth` takes an
// `otp_code`, but a one-time code cannot be put in an `.env` file and an unattended issuer cannot be
// prompted for one. The dedicated account must therefore be excluded from 2FA or use an application
// password (manual 12 §12.C, 전산팀 요청 2번). A DSM answer that asks for a code is mapped to
// `SYNOLOGY_OTP_REQUIRED` so the operator reads the actual cause instead of "login failed".

import { inspect } from 'node:util';

export const NAS_LINK_ISSUER_SCHEMA_VERSION = 'soulforge.nas_link_issuer.v0';

export const REDACTED = '[redacted]';

/** The env prefix manual 12 §12.C fixed. A project profile may state a different one. */
export const DEFAULT_ENV_PREFIX = 'SOULFORGE_NAS';

/**
 * The env key suffixes, as names. This module reads `process.env` values but never prints one, and
 * every diagnostic below reports key *names* only (AGENTS.md 안전·저장 경계).
 */
export const NAS_ENV_SUFFIXES = Object.freeze({
  host: 'HOST',
  port: 'PORT',
  user: 'USER',
  password: 'PASSWORD',
  token: 'TOKEN',
  share: 'SHARE',
  unc: 'UNC',
  mock: 'MOCK',
});

export const SYNOLOGY_ERROR_CODES = Object.freeze({
  CONFIG_INCOMPLETE: 'NAS_CONFIG_INCOMPLETE',
  CONFIG_INVALID: 'NAS_CONFIG_INVALID',
  HTTPS_REQUIRED: 'NAS_HTTPS_REQUIRED',
  TRANSPORT_MISSING: 'NAS_TRANSPORT_MISSING',
  TRANSPORT_FAILED: 'NAS_TRANSPORT_FAILED',
  RESPONSE_NOT_JSON: 'NAS_RESPONSE_NOT_JSON',
  DSM_REFUSED: 'NAS_DSM_REFUSED',
  OTP_REQUIRED: 'SYNOLOGY_OTP_REQUIRED',
  CAPABILITY_MISSING: 'NAS_CAPABILITY_MISSING',
  NOT_LOGGED_IN: 'NAS_NOT_LOGGED_IN',
});

export class SynologyApiError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'SynologyApiError';
    this.code = code;
    this.detail = detail;
  }

  toJSON() {
    return { error_code: this.code, message: this.message, detail: this.detail };
  }
}

const fail = (code, message, detail = {}) => {
  throw new SynologyApiError(code, message, detail);
};

/**
 * A value that must never reach a log, a receipt or a result.
 *
 * The private field is the point: there is no property to enumerate, so spreading, `JSON.stringify`
 * and `util.inspect` all see the redacted forms below. `reveal()` is the single deliberate exit and
 * it is called in exactly one place (the login body).
 */
export class Secret {
  #value;

  constructor(value) {
    this.#value = typeof value === 'string' ? value : String(value ?? '');
  }

  get length() {
    return this.#value.length;
  }

  reveal() {
    return this.#value;
  }

  toString() {
    return REDACTED;
  }

  toJSON() {
    return REDACTED;
  }

  [inspect.custom]() {
    return REDACTED;
  }
}

/** Every occurrence of every known secret, replaced. The belt that backs the `Secret` braces. */
export function redactSecrets(text, secrets = []) {
  let out = typeof text === 'string' ? text : String(text ?? '');
  for (const secret of secrets) {
    const raw = secret instanceof Secret ? secret.reveal() : String(secret ?? '');
    if (raw.length < 1) continue;
    out = out.split(raw).join(REDACTED);
  }
  return out;
}

/** The env key names this prefix implies — names only, so this is safe to print. */
export function envKeyNames(prefix = DEFAULT_ENV_PREFIX) {
  assertEnvPrefix(prefix);
  const out = {};
  for (const [field, suffix] of Object.entries(NAS_ENV_SUFFIXES)) out[field] = `${prefix}_${suffix}`;
  return Object.freeze(out);
}

const ENV_PREFIX = /^[A-Z][A-Z0-9_]{2,31}$/u;

export function assertEnvPrefix(prefix) {
  if (typeof prefix !== 'string' || !ENV_PREFIX.test(prefix)) {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID,
      'an env prefix is upper-case letters, digits and underscores', { field: 'env_prefix' });
  }
  return prefix;
}

/** Which of the required keys this process actually has. Names only — no value is read out. */
export function nasEnvPresence(env, prefix = DEFAULT_ENV_PREFIX) {
  const keys = envKeyNames(prefix);
  const has = (name) => typeof env?.[name] === 'string' && env[name].length > 0;
  const required = ['host', 'user', 'share'];
  const missing = required.filter((field) => !has(keys[field])).map((field) => keys[field]);
  const secretKind = has(keys.password) ? 'password' : (has(keys.token) ? 'token' : null);
  if (secretKind === null) missing.push(`${keys.password} | ${keys.token}`);
  return Object.freeze({
    env_prefix: prefix,
    required_keys: Object.freeze(required.map((field) => keys[field])),
    missing_keys: Object.freeze(missing),
    secret_kind: secretKind,
    complete: missing.length === 0,
    mock_key_set: has(keys.mock),
  });
}

/**
 * A hostname with no scheme, or an `https://` one. An `http://` host is refused rather than
 * upgraded: silently rewriting it would hide a misconfiguration that matters.
 */
export function baseUrlFrom({ host, port }) {
  if (typeof host !== 'string' || host.trim().length === 0) {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID, 'the NAS host is empty', { field: 'host' });
  }
  const trimmed = host.trim();
  if (/^http:\/\//iu.test(trimmed)) {
    fail(SYNOLOGY_ERROR_CODES.HTTPS_REQUIRED,
      'this issuer speaks https only — a DSM session id is not sent over http', { field: 'host' });
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(trimmed) && !/^https:\/\//iu.test(trimmed)) {
    fail(SYNOLOGY_ERROR_CODES.HTTPS_REQUIRED, 'only an https host is accepted', { field: 'host' });
  }
  let url;
  try {
    url = new URL(/^https:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID, 'the NAS host is not a host name', { field: 'host' });
  }
  if (url.protocol !== 'https:') {
    fail(SYNOLOGY_ERROR_CODES.HTTPS_REQUIRED, 'only an https host is accepted', { field: 'host' });
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== ''
    || url.password !== '') {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID,
      'the NAS host is a host, not a URL with a path or credentials', { field: 'host' });
  }
  if (port !== undefined && port !== null && String(port).length > 0) {
    const number = Number(port);
    if (!Number.isSafeInteger(number) || number < 1 || number > 65535) {
      fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID, 'the NAS port is not a port', { field: 'port' });
    }
    url.port = String(number);
  }
  return `${url.protocol}//${url.host}`;
}

const SHARE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;

/**
 * The runtime configuration, read from `process.env` and nowhere else.
 *
 * The secret comes back boxed. The returned object is safe to `JSON.stringify` into a diagnostic:
 * the only sensitive field renders as `[redacted]`.
 */
export function readNasConfig(env, prefix = DEFAULT_ENV_PREFIX) {
  const keys = envKeyNames(prefix);
  const presence = nasEnvPresence(env, prefix);
  if (!presence.complete) {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INCOMPLETE,
      'this machine does not carry the NAS keys the issuer needs',
      { env_prefix: prefix, missing_keys: [...presence.missing_keys] });
  }
  const share = String(env[keys.share]).trim();
  if (!SHARE_NAME.test(share)) {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID, 'the share name is not a share name',
      { field: keys.share });
  }
  const user = String(env[keys.user]).trim();
  if (user.length === 0 || user.length > 64 || /[\s"']/u.test(user)) {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID, 'the account name is not an account name',
      { field: keys.user });
  }
  const secretKind = presence.secret_kind;
  return Object.freeze({
    env_prefix: prefix,
    base_url: baseUrlFrom({ host: env[keys.host], port: env[keys.port] }),
    user,
    share,
    // The UNC path is operational metadata for the operator (manual 12 §12.C: unattended access is
    // UNC + dedicated account, never a drive letter). This module never opens it.
    unc: typeof env[keys.unc] === 'string' && env[keys.unc].length > 0 ? env[keys.unc] : null,
    secret_kind: secretKind,
    secret: new Secret(env[secretKind === 'token' ? keys.token : keys.password]),
  });
}

// ---------------------------------------------------------------- capabilities

export const API_INFO = 'SYNO.API.Info';
export const AUTH_API = 'SYNO.API.Auth';
export const CREATE_FOLDER_API = 'SYNO.FileStation.CreateFolder';
export const LIST_API = 'SYNO.FileStation.List';
export const SHARING_API = 'SYNO.FileStation.Sharing';

/**
 * The names a DSM 7 box may expose the file-request feature under.
 *
 * Synology has never published this one, so the client probes rather than assumes: if `SYNO.API.Info`
 * lists one of these, the feature has its own API; if it does not but the sharing API is at version 3
 * or newer, the same feature is reachable as a parameter on `SYNO.FileStation.Sharing` create; and if
 * neither holds, the caller falls back to an editable link on a dedicated empty folder (§12.C).
 */
export const FILE_REQUEST_API_NAMES = Object.freeze([
  'SYNO.FileStation.Sharing.Request',
  'SYNO.FileStation.FileRequest',
]);

/** The sharing API version at which the request parameter is worth probing. */
export const SHARING_REQUEST_MIN_VERSION = 3;

export const FILE_REQUEST_KINDS = Object.freeze(['file_request_api', 'sharing_request_param']);

const entryOf = (data, api) => {
  const raw = data?.[api];
  if (raw === null || typeof raw !== 'object') return null;
  const max = Number(raw.maxVersion ?? raw.max_version ?? 0);
  const min = Number(raw.minVersion ?? raw.min_version ?? 1);
  return Object.freeze({
    api,
    path: typeof raw.path === 'string' && raw.path.length > 0 ? raw.path : 'entry.cgi',
    min_version: Number.isSafeInteger(min) ? min : 1,
    max_version: Number.isSafeInteger(max) ? max : 1,
  });
};

const capability = (entry, version = null) => Object.freeze({
  available: entry !== null,
  api: entry?.api ?? null,
  path: entry?.path ?? null,
  version: entry === null ? null : (version ?? entry.max_version),
});

/**
 * What this DSM can do, read from one `SYNO.API.Info` answer.
 *
 * Pure: hand it the `data` block and it returns the same frozen shape every time, which is what
 * lets the mock fixtures decide the branch a test exercises.
 */
export function discoverCapabilities(data) {
  const info = data === null || typeof data !== 'object' ? {} : data;
  const sharingEntry = entryOf(info, SHARING_API);
  let fileRequest = Object.freeze({ available: false, kind: null, api: null, path: null, version: null });
  for (const name of FILE_REQUEST_API_NAMES) {
    const entry = entryOf(info, name);
    if (entry === null) continue;
    fileRequest = Object.freeze({ ...capability(entry), kind: 'file_request_api' });
    break;
  }
  if (!fileRequest.available && sharingEntry !== null
    && sharingEntry.max_version >= SHARING_REQUEST_MIN_VERSION) {
    fileRequest = Object.freeze({ ...capability(sharingEntry), kind: 'sharing_request_param' });
  }
  return Object.freeze({
    api_count: Object.keys(info).length,
    auth: capability(entryOf(info, AUTH_API)),
    create_folder: capability(entryOf(info, CREATE_FOLDER_API)),
    list: capability(entryOf(info, LIST_API)),
    sharing: capability(sharingEntry),
    file_request: fileRequest,
  });
}

// ---------------------------------------------------------------- DSM errors

/**
 * The DSM error codes worth naming. Everything else is reported as its number — inventing a
 * message for a code we have not seen would put a guess in an operator's hands.
 */
export const DSM_ERROR_MEANINGS = Object.freeze({
  100: 'unknown error',
  101: 'no parameter of API, method or version',
  102: 'the requested API does not exist',
  103: 'the requested method does not exist',
  104: 'the requested version does not support this functionality',
  105: 'the logged-in session does not have permission',
  106: 'session timeout',
  107: 'session interrupted by a duplicate login',
  400: 'no such account or the credential is wrong',
  401: 'the account is disabled',
  402: 'permission denied',
  403: 'a one-time password is required',
  404: 'the one-time password was rejected',
  406: 'enforce to authenticate with two-factor authentication',
  407: 'this IP address is blocked',
  408: 'no such file or folder',
  414: 'operation not permitted',
  1100: 'failed to create the folder',
  1101: 'the number of folders to the parent folder would exceed the system limit',
  2000: 'sharing link control API error',
  2001: 'the sharing link does not exist',
});

/** DSM answers that mean "the account cannot log in unattended because 2FA is in the way". */
export const OTP_ERROR_CODES = Object.freeze([403, 404, 406]);

/** DSM answers `CreateFolder` gives when the folder is already there. */
export const FOLDER_EXISTS_ERROR_CODES = Object.freeze([414, 1100]);

export function dsmErrorMeaning(code) {
  return DSM_ERROR_MEANINGS[code] ?? 'an error this client has no name for';
}

// ---------------------------------------------------------------- the client

const formBody = (params) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, value instanceof Secret ? value.reveal() : String(value));
  }
  return body;
};

/**
 * One DSM session.
 *
 * @param options `{ config, fetch, path_prefix }` — `fetch` is injected so the mock transport can
 * replay canned answers without a network stack, and so a test can prove no request was made.
 */
export function createSynologyClient(options = {}) {
  const config = options.config;
  if (config === null || typeof config !== 'object' || typeof config.base_url !== 'string') {
    fail(SYNOLOGY_ERROR_CODES.CONFIG_INVALID, 'a client needs a validated NAS config', {});
  }
  const transport = options.fetch ?? globalThis.fetch;
  if (typeof transport !== 'function') {
    fail(SYNOLOGY_ERROR_CODES.TRANSPORT_MISSING, 'no fetch implementation is available', {});
  }
  const prefix = options.path_prefix ?? '/webapi';
  const secrets = [config.secret];
  const scrub = (text) => redactSecrets(text, secrets);

  let sid = null;
  let capabilities = null;
  const calls = [];

  const endpoint = (path) => {
    const url = `${config.base_url}${prefix}/${path}`;
    if (!url.startsWith('https://')) {
      fail(SYNOLOGY_ERROR_CODES.HTTPS_REQUIRED, 'refusing to call a non-https endpoint', {});
    }
    return url;
  };

  /**
   * One DSM call. POST with a form body, always: a session id or an account name in a query string
   * is a session id or an account name in somebody's access log.
   */
  async function call(api, method, params = {}, { path = 'entry.cgi', version = 1, authed = true } = {}) {
    if (authed && sid === null) {
      fail(SYNOLOGY_ERROR_CODES.NOT_LOGGED_IN, 'this call needs a session', { api, method });
    }
    const body = formBody({ ...params, api, version, method, _sid: authed ? sid : undefined });
    calls.push({ api, method, version });
    let response;
    try {
      response = await transport(endpoint(path), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (error) {
      // An injected transport that already declares a `NAS_*` code has said something specific
      // (the mock replay is the case that exists today). Wrapping it would turn "this fixture has
      // no answer for that call" into "the request failed", which is the wrong thing to debug.
      if (typeof error?.code === 'string' && error.code.startsWith('NAS_')) throw error;
      fail(SYNOLOGY_ERROR_CODES.TRANSPORT_FAILED, scrub(error?.message ?? 'the request failed'),
        { api, method });
    }
    const text = await response.text();
    if (response.ok !== true) {
      fail(SYNOLOGY_ERROR_CODES.TRANSPORT_FAILED, 'the NAS answered with an http error',
        { api, method, http_status: response.status ?? null });
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      fail(SYNOLOGY_ERROR_CODES.RESPONSE_NOT_JSON, 'the NAS answered with something that is not JSON',
        { api, method });
    }
    if (payload?.success !== true) {
      const code = Number(payload?.error?.code ?? 0);
      const otp = OTP_ERROR_CODES.includes(code);
      fail(otp ? SYNOLOGY_ERROR_CODES.OTP_REQUIRED : SYNOLOGY_ERROR_CODES.DSM_REFUSED,
        otp
          ? 'this account needs a one-time code, which an unattended issuer cannot supply — use an application password or exclude the account from 2FA'
          : 'the NAS refused this call',
        { api, method, dsm_error_code: code, dsm_error_meaning: dsmErrorMeaning(code) });
    }
    return payload.data ?? {};
  }

  const client = {
    config,
    /** api/method/version of every call made, for a test or a receipt. No parameters, no secrets. */
    calls: () => calls.map((row) => ({ ...row })),
    logged_in: () => sid !== null,

    async apiInfo() {
      const data = await call(API_INFO, 'query', { query: 'all' },
        { path: 'query.cgi', version: 1, authed: false });
      capabilities = discoverCapabilities(data);
      return capabilities;
    },

    async capabilities() {
      if (capabilities === null) await client.apiInfo();
      return capabilities;
    },

    async login() {
      const caps = await client.capabilities();
      const data = await call(AUTH_API, 'login', {
        account: config.user,
        passwd: config.secret,
        session: 'FileStation',
        format: 'sid',
      }, {
        path: caps.auth.path ?? 'auth.cgi',
        version: Math.min(caps.auth.version ?? 3, 6),
        authed: false,
      });
      if (typeof data?.sid !== 'string' || data.sid.length === 0) {
        fail(SYNOLOGY_ERROR_CODES.DSM_REFUSED, 'the NAS returned no session id',
          { api: AUTH_API, method: 'login' });
      }
      sid = data.sid;
      return true;
    },

    async logout() {
      if (sid === null) return false;
      const caps = await client.capabilities();
      try {
        await call(AUTH_API, 'logout', { session: 'FileStation' },
          { path: caps.auth.path ?? 'auth.cgi', version: Math.min(caps.auth.version ?? 3, 6) });
      } finally {
        sid = null;
      }
      return true;
    },

    /**
     * Create-only, and idempotent by verification rather than by hope: when DSM refuses with one of
     * the "already there" codes the folder is looked up, and only an actual folder turns the refusal
     * into `existed: true`. A refusal for any other reason stays a refusal.
     */
    async createFolder(parentPath, name) {
      const caps = await client.capabilities();
      if (!caps.create_folder.available) {
        fail(SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING, 'this DSM exposes no CreateFolder API',
          { api: CREATE_FOLDER_API });
      }
      try {
        await call(CREATE_FOLDER_API, 'create', {
          folder_path: parentPath, name, force_parent: 'true',
        }, { path: caps.create_folder.path, version: Math.min(caps.create_folder.version ?? 2, 2) });
        return { created: true, existed: false };
      } catch (error) {
        const code = Number(error?.detail?.dsm_error_code ?? 0);
        if (error?.code !== SYNOLOGY_ERROR_CODES.DSM_REFUSED
          || !FOLDER_EXISTS_ERROR_CODES.includes(code)) throw error;
        const existing = await client.getInfo(`${parentPath}/${name}`);
        if (existing?.isdir !== true) throw error;
        return { created: false, existed: true };
      }
    },

    async getInfo(path) {
      const caps = await client.capabilities();
      if (!caps.list.available) return null;
      let data;
      try {
        data = await call(LIST_API, 'getinfo', { path: JSON.stringify([path]), additional: '[]' },
          { path: caps.list.path, version: Math.min(caps.list.version ?? 2, 2) });
      } catch (error) {
        if (error?.code === SYNOLOGY_ERROR_CODES.DSM_REFUSED) return null;
        throw error;
      }
      const files = Array.isArray(data?.files) ? data.files : [];
      return files.length === 0 ? null : files[0];
    },

    /**
     * A sharing link. `extra` carries the file-request probe when the caller asked for one; the
     * password is passed boxed and only unboxed inside the form body.
     */
    async createSharingLink({ path, date_expired = null, password = null, extra = {} }) {
      const caps = await client.capabilities();
      if (!caps.sharing.available) {
        fail(SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING, 'this DSM exposes no Sharing API',
          { api: SHARING_API });
      }
      const data = await call(SHARING_API, 'create', {
        path,
        date_expired: date_expired ?? undefined,
        password: password ?? undefined,
        ...extra,
      }, { path: caps.sharing.path, version: Math.min(caps.sharing.version ?? 3, 3) });
      return normaliseLink(data);
    },

    /** The dedicated file-request API, when `SYNO.API.Info` said the box has one. */
    async createFileRequestLink({ path, date_expired = null, password = null, extra = {} }) {
      const caps = await client.capabilities();
      if (caps.file_request.kind !== 'file_request_api') {
        fail(SYNOLOGY_ERROR_CODES.CAPABILITY_MISSING, 'this DSM exposes no file-request API',
          { probed: [...FILE_REQUEST_API_NAMES] });
      }
      const data = await call(caps.file_request.api, 'create', {
        path,
        date_expired: date_expired ?? undefined,
        password: password ?? undefined,
        ...extra,
      }, { path: caps.file_request.path, version: Math.min(caps.file_request.version ?? 1, 3) });
      return normaliseLink(data);
    },
  };

  return client;
}

/**
 * DSM answers a sharing create with a `links` array whose rows carry `url` and `id`. Different
 * versions have used `qrcode`, `link_owner` and other columns; only the two that matter are read.
 */
export function normaliseLink(data) {
  const rows = Array.isArray(data?.links) ? data.links : [];
  const row = rows.length > 0 ? rows[0] : data;
  const url = typeof row?.url === 'string' ? row.url : null;
  if (url === null || !/^https:\/\//iu.test(url)) {
    fail(SYNOLOGY_ERROR_CODES.DSM_REFUSED,
      'the NAS returned no https link for this request', { field: 'url' });
  }
  return Object.freeze({
    link_url: url,
    dsm_link_id: typeof row?.id === 'string' || typeof row?.id === 'number' ? String(row.id) : null,
  });
}
