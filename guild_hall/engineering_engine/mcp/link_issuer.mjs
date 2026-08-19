// The one seam between the engine door and the link issuer beside it (manual 12 §12.C).
//
// The engine makes no network call. That is not a style preference: it is what makes `judge_run`
// and every read tool reproducible and what keeps a hung NAS from becoming a hung engine. So when a
// project profile names a `link_issuer`, this module **spawns** the gateway command as a child
// process, reads one JSON object off its stdout, and attaches three fields to the ticket. The
// engine process never opens a socket, never holds a credential, and never imports the client.
//
// Everything that can be decided without spawning is a pure function here — which env keys the
// prefix implies, whether this machine carries them, what the NAS-side folder for a ticket is
// called, and the exact argument vector. That is what a test can assert byte for byte, and it is
// also what makes the refusals honest: "no issuer in the profile" and "issuer configured but this
// machine has no keys" are different notes, and an operator needs to be told which one it is.
//
// A failure here never fails the ticket. The folder is already made and the ticket is the record of
// the hand-over; losing the link means somebody sends a folder path the old way, while refusing the
// ticket would leave an orphan folder and no ledger row at all.

import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { LINK_ISSUER_ENV_SUFFIXES } from './project_profile.mjs';

export const LINK_ISSUER_SCHEMA_VERSION = 'soulforge.engine_mcp_ticket_link.v0';

/** Where the issuer lives, relative to the engine root: a sibling under the same guild hall. */
export const LINK_ISSUER_RELATIVE_PATH = Object.freeze([
  '..', 'gateway', 'nas_link_issuer', 'tools', 'nas_issue_link.mjs',
]);

/** The three link shapes §12.C allows. Restated so the door validates what it attaches. */
export const TICKET_LINK_KINDS = Object.freeze(['file_request', 'sharing_edit', 'sharing_view']);

/**
 * Why a ticket carries no link. Every one of these is a normal state, not an error — which is why
 * they are notes on a successful ticket rather than refusals.
 */
export const LINK_NOTES = Object.freeze({
  NOT_CONFIGURED: 'link_issuer_not_configured',
  ENV_MISSING: 'link_issuer_env_missing',
  REFUSED: 'link_issuer_refused',
  UNREADABLE: 'link_issuer_unreadable',
});

/** A ticket with no link, in the shape a ticket with one has. */
export const NO_LINK = Object.freeze({
  link_url: null,
  link_kind: null,
  link_expires_at: null,
  dsm_link_id: null,
  link_note: LINK_NOTES.NOT_CONFIGURED,
});

/** How long the door waits for the child before giving up and issuing the ticket without a link. */
export const LINK_ISSUER_TIMEOUT_MS = 30_000;

/** The env key names one prefix implies. Names only — no value is read here. */
export function linkIssuerEnvNames(prefix) {
  const names = {};
  for (const suffix of LINK_ISSUER_ENV_SUFFIXES) names[suffix.toLowerCase()] = `${prefix}_${suffix}`;
  return Object.freeze(names);
}

/**
 * Whether this machine can issue a link at all, and why not when it cannot.
 *
 * A mock fixture key is enough on its own: the whole point of `--mock` is a machine that has no
 * credentials, and a demo that cannot run without them is not a demo.
 */
export function linkIssuerReadiness(issuer, env = {}) {
  if (issuer === null || issuer === undefined) {
    return Object.freeze({ ready: false, note: LINK_NOTES.NOT_CONFIGURED, mock: false, missing_keys: [] });
  }
  const names = linkIssuerEnvNames(issuer.env_prefix);
  const has = (name) => typeof env[name] === 'string' && env[name].length > 0;
  if (has(names.mock)) {
    return Object.freeze({ ready: true, note: null, mock: true, missing_keys: [] });
  }
  const missing = ['host', 'user', 'share'].filter((field) => !has(names[field]))
    .map((field) => names[field]);
  if (!has(names.password) && !has(names.token)) missing.push(`${names.password} | ${names.token}`);
  return Object.freeze({
    ready: missing.length === 0,
    note: missing.length === 0 ? null : LINK_NOTES.ENV_MISSING,
    mock: false,
    missing_keys: Object.freeze(missing),
  });
}

/**
 * The NAS-side folder a ticket maps to: `tickets|outbox / <person> / <ticket>`.
 *
 * Deliberately *not* the project-relative path of the local ticket folder. Until a project profile
 * can name the NAS itself as its intake folder (§12.C 만들 것), the share and the project folder
 * tree are two different places, and pretending the local path exists on the NAS would create a
 * folder nobody can find. Mirroring the ticket instead keeps the mapping derivable from the ticket
 * alone, in both directions.
 */
export function linkIssuerFolderRel({ purpose, principal_ref: principalRef, ticket_id: ticketId }) {
  const root = purpose === 'download' ? 'outbox' : 'tickets';
  return `${root}/${principalRef}/${ticketId}`;
}

/** The exact argument vector, so a test can assert it without spawning anything. */
export function linkIssuerArgs({
  cli_path: cliPath, ticket_id: ticketId, folder_rel: folderRel, purpose, expires_at: expiresAt,
  mock_path: mockPath = null,
}) {
  const args = [cliPath, '--ticket', ticketId, '--folder', folderRel,
    '--purpose', purpose, '--expires', expiresAt];
  if (mockPath !== null) args.push('--mock', mockPath);
  return args;
}

/**
 * The child's environment: the issuer's own keys and the little Windows and POSIX need to start
 * node. Not a copy of the whole environment — a child that inherits everything inherits every other
 * credential this process happens to hold.
 */
export function linkIssuerChildEnv(env, prefix) {
  const names = Object.values(linkIssuerEnvNames(prefix));
  const out = {};
  for (const name of [...names, 'PATH', 'PATHEXT', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'HOME']) {
    if (typeof env[name] === 'string') out[name] = env[name];
  }
  return out;
}

/** The issuer command for one engine checkout. */
export const linkIssuerPath = (engineRoot) => join(engineRoot, ...LINK_ISSUER_RELATIVE_PATH);

/**
 * Spawns the issuer once and returns what to attach to the ticket.
 *
 * @param options `{ issuer, env, engine_root, ticket_id, principal_ref, purpose, expires_at, spawn }`
 * @returns `{ link_url, link_kind, link_expires_at, dsm_link_id, link_note }` — always this shape,
 *   with `link_url: null` and a note whenever no link was issued.
 */
export async function issueTicketLink(options = {}) {
  const issuer = options.issuer ?? null;
  const env = options.env ?? {};
  const readiness = linkIssuerReadiness(issuer, env);
  if (!readiness.ready) {
    return Object.freeze({ ...NO_LINK, link_note: readiness.note });
  }

  const names = linkIssuerEnvNames(issuer.env_prefix);
  const args = linkIssuerArgs({
    cli_path: linkIssuerPath(options.engine_root),
    ticket_id: options.ticket_id,
    folder_rel: linkIssuerFolderRel(options),
    purpose: options.purpose,
    expires_at: options.expires_at,
    mock_path: readiness.mock ? env[names.mock] : null,
  });

  let run;
  try {
    run = await (options.spawn ?? spawnIssuer)(args, linkIssuerChildEnv(env, issuer.env_prefix));
  } catch {
    return Object.freeze({ ...NO_LINK, link_note: LINK_NOTES.REFUSED });
  }
  if (run.status !== 0) {
    return Object.freeze({ ...NO_LINK, link_note: LINK_NOTES.REFUSED });
  }
  let payload;
  try {
    payload = JSON.parse(run.stdout);
  } catch {
    return Object.freeze({ ...NO_LINK, link_note: LINK_NOTES.UNREADABLE });
  }
  // The door checks the shape rather than trusting it: the child is a separate program and a
  // ticket that records a link nobody can open is worse than a ticket that records none.
  if (typeof payload?.link_url !== 'string' || !payload.link_url.startsWith('https://')
    || !TICKET_LINK_KINDS.includes(payload?.link_kind)) {
    return Object.freeze({ ...NO_LINK, link_note: LINK_NOTES.UNREADABLE });
  }
  return Object.freeze({
    link_url: payload.link_url,
    link_kind: payload.link_kind,
    link_expires_at: typeof payload.expires_at === 'string' ? payload.expires_at : null,
    dsm_link_id: typeof payload.dsm_link_id === 'string' ? payload.dsm_link_id : null,
    link_note: null,
  });
}

/** stdout and stderr are captured, never inherited: the door owns its own stdio (it is a server). */
function spawnIssuer(args, childEnv) {
  return new Promise((settle, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
      timeout: LINK_ISSUER_TIMEOUT_MS,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    // stderr is read so the pipe cannot fill and stall the child, and then dropped: the door's own
    // receipts carry the note, and a child's diagnostic is not engine material.
    child.on('close', (status) => settle({ status, stdout, stderr: stderr.slice(0, 200) }));
  });
}
