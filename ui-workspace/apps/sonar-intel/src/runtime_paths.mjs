// Runtime working data is explicit and disjoint from source/installed payload.
import { closeSync, existsSync, lstatSync, openSync, readdirSync, realpathSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAYLOAD_ROOT = path.resolve(APP_ROOT, "../../..");
const overlaps = (a, b) => [path.relative(a, b), path.relative(b, a)].some((rel) => rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel)));

export function cliFlag(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name.replaceAll("-", "_")}_required`);
  return args[index + 1];
}

export function externalDirectory(value, { required = false } = {}) {
  if (typeof value !== "string" || !value.trim()) throw new Error("data_directory_required");
  if (!path.isAbsolute(value)) throw new Error("data_directory_must_be_absolute");
  const absolute = path.resolve(value);
  if (absolute.split(/[\\/]/).some((part) => ["_workmeta", "_workspaces"].includes(part.toLowerCase()))) throw new Error("canonical_data_directory_forbidden");
  if (overlaps(absolute, PAYLOAD_ROOT)) throw new Error("runtime_data_overlap");
  // Reject links in the ancestry (including a missing leaf below a junction).
  let current = absolute;
  while (true) {
    if (existsSync(current)) {
      if (lstatSync(current).isSymbolicLink()) throw new Error("data_directory_link_forbidden");
      if (!lstatSync(current).isDirectory()) throw new Error("data_directory_not_directory");
      if (overlaps(realpathSync(current), realpathSync(PAYLOAD_ROOT)) && current === absolute) throw new Error("runtime_data_overlap");
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (required && !existsSync(absolute)) throw new Error("data_directory_missing");
  if (existsSync(absolute)) {
    // Known writers use direct children only; never follow a substituted file.
    for (const name of readdirSync(absolute)) {
      const info = lstatSync(path.join(absolute, name));
      if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) throw new Error("data_file_link_forbidden");
    }
  }
  return absolute;
}

export function resolveDataDirectory(args = [], env = process.env, options = {}) {
  return externalDirectory(cliFlag(args, "data-dir", env.SONAR_INTEL_DATA_DIR), options);
}

// Shared by CORE writers, analysis and backup. No stale-lock takeover.
export function acquireDataLease(dataDir) {
  const lockPath = path.join(externalDirectory(dataDir, { required: true }), "data-operation.lock");
  let fd;
  try { fd = openSync(lockPath, "wx"); }
  catch { throw new Error("data_directory_busy"); }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(fd);
    unlinkSync(lockPath);
  };
}
