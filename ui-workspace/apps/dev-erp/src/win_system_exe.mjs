// Windows system-executable pinning — PATH is not a trusted resolver.
//
// The attack surface is PATH planting: a binary named git/where/taskkill/
// cmd/python placed ahead on PATH would run with the server's authority
// (the original incident: Git Bash's PATH-shadowed whoami broke the worker
// identity probe, fixed by pinning %SystemRoot%\System32\whoami.exe).
// This module centralizes that discipline for the remaining sites:
//
//   system32Exe(name): absolute %SystemRoot%\System32\<name>, or null when
//     no absolute SystemRoot/windir exists — callers fail closed or fall
//     back to safer IN-PROCESS behavior, never to a PATH lookup.
//
//   resolveGitExecutable() / resolvePythonExecutable(): binaries with no
//     fixed install location. The ladder is (1) the env pin
//     (DEV_ERP_GIT_EXE / DEV_ERP_PYTHON) — the strong, provisioned form;
//     the pin must be an ABSOLUTE path to an existing FILE, and an invalid
//     pin is a config error surfaced to the caller, never silently
//     bypassed — then (2) on win32 a lookup through the PINNED System32
//     where.exe, run with its cwd pinned to System32 so the SERVER's cwd
//     (repo/app dir, writable at lower privilege) is never searched, and
//     only absolute .exe hits count; else (3) a bare name on posix only.
//     The where lookup is the same trust class as PATH — a planted binary
//     ahead on PATH still wins it — but it is one observable choke point,
//     libuv's searcher and the caller-cwd semantics are gone, and
//     provisioned deployments can pin exactly. Installed packs never reach
//     the git RUNG of source identity (the pack-manifest ladder), so git
//     resolution matters mainly for dev checkouts, where PATH git is the
//     developer's own git.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export function system32Exe(name, env = process.env) {
  const systemRoot = env.SystemRoot || env.windir;
  if (typeof systemRoot !== "string" || systemRoot.trim().length === 0 || !isAbsolute(systemRoot)) {
    return null;
  }
  return join(systemRoot, "System32", name);
}

function isAbsoluteFile(candidate) {
  if (!isAbsolute(candidate) || !existsSync(candidate)) return false;
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function defaultRunWhere(whereExe, name) {
  const found = spawnSync(whereExe, [name], {
    encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
    // where.exe searches its own cwd FIRST (before PATH): pin the cwd to
    // System32 so the server's cwd — a repo/app directory writable at
    // lower privilege than admin-protected PATH dirs — is never searched.
    cwd: dirname(whereExe),
  });
  if (found.error || found.status !== 0) return [];
  return String(found.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

// One where-lookup per (name) per process for the default env/runner: the
// resolution is boot-time configuration, not per-call state.
const whereCache = new Map();

function resolveViaWhere(name, env, runWhere) {
  const whereExe = system32Exe("where.exe", env);
  if (whereExe === null) return null;
  const cacheable = env === process.env && runWhere === defaultRunWhere;
  if (cacheable && whereCache.has(name)) return whereCache.get(name);
  // Only absolute .exe hits count: a .cmd/.bat shim cannot be execFile'd
  // without a shell, and a relative line would reintroduce cwd semantics.
  const first = runWhere(whereExe, name).find((line) => isAbsolute(line) && /\.exe$/i.test(line)) ?? null;
  if (cacheable) whereCache.set(name, first);
  return first;
}

function resolvePinnedExecutable({ pinValue, invalidReason, unresolvedReason, whereName, posixCommand, env, platform, runWhere }) {
  const pin = String(pinValue || "").trim();
  if (pin.length > 0) {
    if (!isAbsoluteFile(pin)) return { command: null, reason: invalidReason };
    return { command: pin, source: "env_pin" };
  }
  if (platform !== "win32") return { command: posixCommand, source: "path" };
  const found = resolveViaWhere(whereName, env, runWhere);
  if (found === null) return { command: null, reason: unresolvedReason };
  return { command: found, source: "where" };
}

export function resolveGitExecutable({ env = process.env, platform = process.platform, runWhere = defaultRunWhere } = {}) {
  return resolvePinnedExecutable({
    pinValue: env.DEV_ERP_GIT_EXE, invalidReason: "git_pin_invalid", unresolvedReason: "git_unresolved",
    whereName: "git.exe", posixCommand: "git", env, platform, runWhere,
  });
}

export function resolvePythonExecutable({ env = process.env, platform = process.platform, runWhere = defaultRunWhere } = {}) {
  return resolvePinnedExecutable({
    pinValue: env.DEV_ERP_PYTHON, invalidReason: "python_pin_invalid", unresolvedReason: "python_unresolved",
    whereName: "python.exe", posixCommand: "python3", env, platform, runWhere,
  });
}
