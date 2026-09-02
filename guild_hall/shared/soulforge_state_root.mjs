// soulforge_state_root.mjs — optional owner-root / state-root override for the
// operations cluster (Workspace Board runtime on 4192 and its companions, the
// AI usage meter CLI and hook, the Codex retention refresh).
//
// Two environment variables are read together:
//
//   SOULFORGE_OWNER_ROOT  absolute path to a checkout-like root; its
//                         `guild_hall/state` subtree becomes the state root and
//                         the root itself stays the owner root for non-state
//                         surfaces (for example `_workmeta` overlays).
//   SOULFORGE_STATE_ROOT  absolute path that replaces `<owner root>/guild_hall/state`
//                         directly. When both are set the finer STATE_ROOT wins
//                         for every state path; OWNER_ROOT still names the owner root.
//
// Precedence at each consumer stays: explicit flag or file-specific env
// (`--state-root`, `--registry`, `TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY`,
// `SOULFORGE_AI_USAGE_METER_STATE_ROOT`, ...) > SOULFORGE_STATE_ROOT >
// SOULFORGE_OWNER_ROOT > the consumer's git-derived or module-relative default.
//
// Fail closed: a variable that is set but empty, relative, missing, or not a
// directory throws `SoulforgeRootOverrideError` (code
// `soulforge_root_override_invalid`) so the caller refuses to start instead of
// silently falling back to the default root. Values are trimmed before
// validation (a Scheduled Task or shell can leave surrounding whitespace on an
// environment value), and on Windows a rooted-but-driveless spelling such as
// `\state` is refused (`drive_or_unc_required`) because it silently binds to
// the current drive of whichever process reads it. The error names the
// variable and the reason; it never echoes the configured path value. When
// neither variable is set, `readSoulforgeRootOverride` returns null and every
// caller keeps its existing default byte-for-byte.
//
// This resolver proves existence and type only. The configured directories
// must be real directories: downstream writers (the Codex retention refresh,
// the recovery companion, the lane emitters) re-check their roots through
// realpath/reparse seams and refuse a junction, symlink, or `subst` alias.

import { statSync } from "node:fs";
import { isAbsolute, join, parse, resolve } from "node:path";

export const SOULFORGE_OWNER_ROOT_ENV = "SOULFORGE_OWNER_ROOT";
export const SOULFORGE_STATE_ROOT_ENV = "SOULFORGE_STATE_ROOT";
export const SOULFORGE_STATE_ROOT_SEGMENTS = Object.freeze(["guild_hall", "state"]);
export const SOULFORGE_ROOT_OVERRIDE_INVALID = "soulforge_root_override_invalid";

export class SoulforgeRootOverrideError extends Error {
  constructor(variable, reason) {
    super(`${variable} is set but is not an existing absolute directory (${reason}); refusing to fall back to the default root`);
    this.name = "SoulforgeRootOverrideError";
    this.code = SOULFORGE_ROOT_OVERRIDE_INVALID;
    this.variable = variable;
    this.reason = reason;
  }
}

function isSet(value) {
  return value !== undefined && value !== null;
}

function hasControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

// Windows: `X:\` (or `X:/`) drive roots and `\\server\share` (or `//server/share`)
// UNC roots. A bare `\` root is rooted only relative to the current drive.
const WINDOWS_DRIVE_OR_UNC_ROOT = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/u;

function validateOverride(variable, raw, stat, platform) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new SoulforgeRootOverrideError(variable, "empty");
  }
  const value = raw.trim();
  if (hasControlCharacter(value)) {
    throw new SoulforgeRootOverrideError(variable, "control_character");
  }
  if (!isAbsolute(value)) {
    throw new SoulforgeRootOverrideError(variable, "relative");
  }
  if (platform === "win32" && !WINDOWS_DRIVE_OR_UNC_ROOT.test(parse(value).root)) {
    throw new SoulforgeRootOverrideError(variable, "drive_or_unc_required");
  }
  const normalized = resolve(value);
  let info;
  try {
    info = stat(normalized);
  } catch {
    throw new SoulforgeRootOverrideError(variable, "missing");
  }
  if (!info.isDirectory()) {
    throw new SoulforgeRootOverrideError(variable, "not_directory");
  }
  return normalized;
}

// Returns null when neither variable is set. Otherwise returns
// `{ source, ownerRoot, stateRoot }` where `source` is "state_root" or
// "owner_root", `ownerRoot` is the validated SOULFORGE_OWNER_ROOT or null, and
// `stateRoot` is the validated SOULFORGE_STATE_ROOT or `<ownerRoot>/guild_hall/state`.
// Both variables are validated whenever they are set, so a broken one fails
// closed even if the other is fine.
export function readSoulforgeRootOverride(env = process.env, { stat = statSync, platform = process.platform } = {}) {
  const rawOwner = env?.[SOULFORGE_OWNER_ROOT_ENV];
  const rawState = env?.[SOULFORGE_STATE_ROOT_ENV];
  if (!isSet(rawOwner) && !isSet(rawState)) return null;
  const ownerRoot = isSet(rawOwner) ? validateOverride(SOULFORGE_OWNER_ROOT_ENV, rawOwner, stat, platform) : null;
  if (isSet(rawState)) {
    return {
      source: "state_root",
      ownerRoot,
      stateRoot: validateOverride(SOULFORGE_STATE_ROOT_ENV, rawState, stat, platform),
    };
  }
  return {
    source: "owner_root",
    ownerRoot,
    stateRoot: join(ownerRoot, ...SOULFORGE_STATE_ROOT_SEGMENTS),
  };
}

// State root with the override applied, or `fallback` (a string, or a function
// evaluated only when no override is set) otherwise.
export function resolveSoulforgeStateRoot(env = process.env, fallback, options = {}) {
  const override = readSoulforgeRootOverride(env, options);
  if (override !== null) return override.stateRoot;
  return typeof fallback === "function" ? fallback() : fallback;
}
