/**
 * Hermes profile snapshot — the Sigil inventory.
 *
 * Hermes bot profiles live under `<hermes_home>/profiles/<name>/` and had no
 * Soulforge record of any kind. This module builds one. It is an
 * **inventory**, not a backup of a running agent, and the output says so:
 * `claim_ceiling: "inventory_v0"`.
 *
 * What is captured, by class:
 *  - instruction  `SOUL.md`                     bytes copied (this is the Sigil)
 *  - config       `config.yaml`, `profile.yaml` digest and size only
 *  - capability   `skills/`, `hooks/`, `plans/` names only
 *  - schedule     `cron/`                       names only
 *  - volume       `sessions/`, `memories/`,
 *                 `workspace(s)/`, `*.db`       counts and bytes only
 *  - secret       `.env`, `auth.json`,
 *                 `auth.lock`, credentials      existence and size only, NEVER
 *                                               opened and NEVER hashed
 *  - excluded     `logs/`, `cache/`             not walked at all
 *
 * The database rule is not a preference. The cutover audit found 45 of the
 * profiles' 159 SQLite files with a live write-ahead log held open by a
 * running `serve` process: a file copy of one is torn AND misses whatever is
 * still only in the WAL. So v0 copies no database byte at all. A future
 * generation that includes them must use `sqlite3` online backup or
 * `VACUUM INTO`, and must pass the destination as a SQL single-quoted literal
 * — `JSON.stringify`'s double quotes make SQLite read it as an identifier and
 * the statement dies with "no such column".
 *
 * Liveness is not guessed. `running_profiles` is supplied by the caller or the
 * field is `null` (unknown); this module enumerates no processes.
 */

import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const HERMES_PROFILE_SNAPSHOT_SCHEMA = "soulforge.backup_controller.hermes_profile_snapshot.v0";
export const HERMES_RUNTIME_PROFILE_SCHEMA = "soulforge.backup_controller.hermes_runtime_profile.v0";
export const HERMES_GENERATION_REF_NOTE_SCHEMA = "soulforge.backup_controller.hermes_backup_generation_ref.v0";
export const HERMES_SOURCE_REF = "source.hermes";

export const HERMES_INSTRUCTION_FILE = "SOUL.md";
export const HERMES_CONFIG_FILES = Object.freeze(["config.yaml", "profile.yaml"]);
export const HERMES_CAPABILITY_DIRS = Object.freeze(["skills", "hooks", "plans"]);
export const HERMES_SCHEDULE_DIRS = Object.freeze(["cron"]);
export const HERMES_VOLUME_DIRS = Object.freeze(["sessions", "memories", "workspace", "workspaces"]);
export const HERMES_SECRET_FILES = Object.freeze([".env", "auth.json", "auth.lock"]);
export const HERMES_EXCLUDED_DIRS = Object.freeze(["logs", "cache", ".cache", "node_modules"]);

export const HERMES_SNAPSHOT_GAPS = Object.freeze([
  "config_missing",
  "database_bytes_not_captured",
  "live_write_ahead_log_present",
  "memory_bytes_not_captured",
  "profile_count_bound_reached",
  "readback_unverified",
  "running_state_unknown",
  "secret_material_not_captured",
  "session_bytes_not_captured",
  "soul_missing",
  "workspace_bytes_not_captured",
]);

const STAMP = /^\d{8}T\d{6}Z$/u;
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SECRET_NAME = /(?:^|[.\-_])(?:env|secret|secrets|token|tokens|password|passwords|credential|credentials|api[_-]?key)(?:$|[.\-_])|^\.env|^auth\.(?:json|lock)$|\.(?:pem|p12|pfx|key)$/iu;
const DATABASE_NAME = /\.(?:db|sqlite|sqlite3)$/iu;
const DATABASE_SIDECAR = /\.(?:db|sqlite|sqlite3)-(?:wal|shm)$/iu;

const MAX_PROFILES = 512;
const MAX_SOUL_BYTES = 4 * 1024 * 1024;
const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
const MAX_NAME_ENTRIES = 4096;
const MAX_VOLUME_FILES = 200_000;
const MAX_VOLUME_DEPTH = 8;

export class HermesSnapshotError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "HermesSnapshotError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new HermesSnapshotError(code, message);
}

// Local canonical serializer, for the same reason the Buzz indexer keeps one:
// `backup_controller` modules stay self-contained.
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("canonical_number_invalid", "Only safe integers can be hashed");
    return String(value);
  }
  if (typeof value === "string") {
    if (value.normalize("NFC") !== value) fail("canonical_string_invalid", "Strings must already be NFC");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return fail("canonical_value_invalid", "Unsupported canonical value");
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex")}`;
}

export function stampFor(date) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d+Z$/u, "Z");
}

// A `soulforge.source_lane_index.v0` ref admits no uppercase; the stamp keeps
// its usual path form and the ref carries it lowercased.
export function generationRefFor(stamp) {
  return `backup.hermes.profiles.${stamp.toLowerCase()}`;
}

export function profileRefFor(profile) {
  return `hermes.profile.${profile.toLowerCase()}`;
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function canonicalExistingDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", `${label} must be an absolute path`);
  }
  const stat = await lstatOrNull(value);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail("directory_required", `${label} must be an existing normal directory`);
  }
  const canonical = await realpath(value);
  if (path.resolve(canonical).toLowerCase() !== path.resolve(value).toLowerCase()) {
    fail("canonical_path_required", `${label} must not resolve through an alias`);
  }
  return canonical;
}

function pathsOverlap(left, right) {
  const normalize = (value) => (
    process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value)
  );
  const within = (parent, candidate) => {
    const relative = path.relative(normalize(parent), normalize(candidate));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  return within(left, right) || within(right, left);
}

async function hashFileBounded(target, maximumBytes) {
  const stat = await lstatOrNull(target);
  if (stat === null || !stat.isFile() || stat.isSymbolicLink()) return null;
  if (stat.size > maximumBytes) {
    return { present: true, sha256: null, bytes: stat.size, over_bound: true };
  }
  const bytes = await readFile(target);
  return {
    present: true,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    bytes: bytes.length,
    over_bound: false,
  };
}

// Names only. Nothing under a capability or schedule directory is opened.
async function listNames(root) {
  const stat = await lstatOrNull(root);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) return null;
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .slice(0, MAX_NAME_ENTRIES)
    .filter((entry) => !SECRET_NAME.test(entry.name))
    .map((entry) => `${entry.name.normalize("NFC")}${entry.isDirectory() ? "/" : ""}`)
    .sort();
}

// Counts and bytes only. `lstat` gives the size without opening the file, so a
// volume walk never reads a session, a memory, or a workspace document.
async function measureVolume(root) {
  const stat = await lstatOrNull(root);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) return null;
  let fileCount = 0;
  let totalBytes = 0;
  let secretNamed = 0;
  let bounded = false;
  async function visit(directory, depth) {
    if (depth > MAX_VOLUME_DEPTH || fileCount >= MAX_VOLUME_FILES) {
      bounded = true;
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (fileCount >= MAX_VOLUME_FILES) {
        bounded = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (HERMES_EXCLUDED_DIRS.includes(entry.name.toLowerCase())) continue;
        await visit(path.join(directory, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SECRET_NAME.test(entry.name)) {
        secretNamed += 1;
        continue;
      }
      const entryStat = await lstatOrNull(path.join(directory, entry.name));
      if (entryStat === null || !entryStat.isFile()) continue;
      fileCount += 1;
      totalBytes += entryStat.size;
    }
  }
  await visit(root, 0);
  return { present: true, file_count: fileCount, total_bytes: totalBytes, secret_named_skipped: secretNamed, bounded };
}

async function measureDatabases(profileRoot) {
  const entries = await readdir(profileRoot, { withFileTypes: true });
  const databases = [];
  let liveWal = false;
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const isDatabase = DATABASE_NAME.test(entry.name);
    const isSidecar = DATABASE_SIDECAR.test(entry.name);
    if (!isDatabase && !isSidecar) continue;
    const stat = await lstatOrNull(path.join(profileRoot, entry.name));
    if (stat === null || !stat.isFile()) continue;
    if (isSidecar && /-wal$/iu.test(entry.name) && stat.size > 0) liveWal = true;
    databases.push({
      name: entry.name.normalize("NFC"),
      bytes: stat.size,
      // The whole point of the class: bytes are measured, never copied.
      bytes_captured: false,
      kind: isSidecar ? "sidecar" : "database",
    });
  }
  databases.sort((left, right) => left.name.localeCompare(right.name));
  return {
    file_count: databases.length,
    total_bytes: databases.reduce((total, entry) => total + entry.bytes, 0),
    live_write_ahead_log_present: liveWal,
    files: databases,
  };
}

// Existence and size, from `lstat`. These files are never opened and never
// hashed — a digest of a credential is still a fact about a credential.
async function inspectSecretFiles(profileRoot) {
  const records = [];
  for (const name of HERMES_SECRET_FILES) {
    const stat = await lstatOrNull(path.join(profileRoot, name));
    records.push({
      name,
      present: stat !== null && stat.isFile() && !stat.isSymbolicLink(),
      bytes: stat !== null && stat.isFile() ? stat.size : null,
      captured: false,
      digested: false,
    });
  }
  return records;
}

export async function inspectHermesProfile({ profile_root: profileRoot, profile, gaps }) {
  const soulPath = path.join(profileRoot, HERMES_INSTRUCTION_FILE);
  const soul = await hashFileBounded(soulPath, MAX_SOUL_BYTES);
  if (soul === null) gaps.add("soul_missing");

  const config = {};
  for (const name of HERMES_CONFIG_FILES) {
    const measured = await hashFileBounded(path.join(profileRoot, name), MAX_CONFIG_BYTES);
    config[name.replace(/\./gu, "_")] = measured ?? { present: false, sha256: null, bytes: null, over_bound: false };
    if (measured === null) gaps.add("config_missing");
  }

  const capability = {};
  for (const name of HERMES_CAPABILITY_DIRS) capability[name] = await listNames(path.join(profileRoot, name));
  const schedule = {};
  for (const name of HERMES_SCHEDULE_DIRS) schedule[name] = await listNames(path.join(profileRoot, name));

  const volume = {};
  for (const name of HERMES_VOLUME_DIRS) {
    const measured = await measureVolume(path.join(profileRoot, name));
    volume[name] = measured ?? { present: false, file_count: 0, total_bytes: 0, secret_named_skipped: 0, bounded: false };
  }
  if (volume.sessions.present) gaps.add("session_bytes_not_captured");
  if (volume.memories.present) gaps.add("memory_bytes_not_captured");
  if (volume.workspace.present || volume.workspaces.present) gaps.add("workspace_bytes_not_captured");

  const databases = await measureDatabases(profileRoot);
  if (databases.file_count > 0) gaps.add("database_bytes_not_captured");
  if (databases.live_write_ahead_log_present) gaps.add("live_write_ahead_log_present");

  const secrets = await inspectSecretFiles(profileRoot);
  if (secrets.some((entry) => entry.present)) gaps.add("secret_material_not_captured");

  return {
    profile,
    profile_ref: profileRefFor(profile),
    instruction: soul === null
      ? { present: false, sha256: null, bytes: null, over_bound: false }
      : soul,
    config,
    capability,
    schedule,
    volume,
    databases,
    secrets,
  };
}

export async function buildHermesProfileSnapshot({
  hermes_home: hermesHome,
  stamp,
  running_profiles: runningProfiles = null,
  now = () => new Date(),
}) {
  if (typeof stamp !== "string" || !STAMP.test(stamp)) {
    fail("stamp_invalid", "Expected a YYYYMMDDTHHMMSSZ stamp");
  }
  if (runningProfiles !== null
    && (!Array.isArray(runningProfiles) || runningProfiles.some((entry) => typeof entry !== "string"))) {
    fail("running_profiles_invalid", "running_profiles must be null or a list of profile names");
  }
  const home = await canonicalExistingDirectory(hermesHome, "hermes_home");
  const profilesRoot = await canonicalExistingDirectory(path.join(home, "profiles"), "hermes_home/profiles");
  const gaps = new Set();
  if (runningProfiles === null) gaps.add("running_state_unknown");
  const running = runningProfiles === null ? null : new Set(runningProfiles);

  const entries = (await readdir(profilesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && PROFILE_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (entries.length > MAX_PROFILES) gaps.add("profile_count_bound_reached");

  const profiles = [];
  for (const profile of entries.slice(0, MAX_PROFILES)) {
    const inspected = await inspectHermesProfile({
      profile_root: path.join(profilesRoot, profile),
      profile: profile.normalize("NFC"),
      gaps,
    });
    profiles.push({
      ...inspected,
      running: running === null ? null : running.has(profile),
    });
  }

  const inventory = profiles.map((profile) => ({
    profile: profile.profile,
    soul_sha256: profile.instruction.sha256,
    config_sha256: profile.config.config_yaml.sha256,
    profile_sha256: profile.config.profile_yaml.sha256,
    skills: profile.capability.skills ?? [],
  }));

  return {
    schema_version: HERMES_PROFILE_SNAPSHOT_SCHEMA,
    // Structure, not a restorable agent. Nothing may promote this to backup
    // evidence on its own.
    claim_ceiling: "inventory_v0",
    source_ref: HERMES_SOURCE_REF,
    generation_ref: generationRefFor(stamp),
    stamp,
    captured_at: now().toISOString(),
    profile_count: profiles.length,
    profiles,
    payload: {
      kind: "instruction_only",
      file_count: profiles.filter((profile) => profile.instruction.present).length,
      total_bytes: profiles.reduce(
        (total, profile) => total + (profile.instruction.bytes ?? 0), 0,
      ),
      readback_verified_count: 0,
    },
    excluded: {
      databases: "measured_never_copied_live_write_ahead_logs",
      sessions_memories_workspaces: "counted_and_sized_never_copied",
      secrets: "named_and_sized_never_opened_never_hashed",
      logs_and_cache: "not_walked",
    },
    content_digest: canonicalDigest(inventory),
    coverage_gaps: [...gaps].sort(),
  };
}

// Agent Mark seed. It is a seed, not a mark: nothing here has been accepted by
// a human, and the record says so.
export function buildRuntimeProfileRecords(snapshot) {
  return snapshot.profiles.map((profile) => ({
    schema_version: HERMES_RUNTIME_PROFILE_SCHEMA,
    claim_ceiling: "inventory_v0",
    profile_ref: profile.profile_ref,
    profile: profile.profile,
    generation_ref: snapshot.generation_ref,
    captured_at: snapshot.captured_at,
    soul_sha256: profile.instruction.sha256,
    config_sha256: profile.config.config_yaml.sha256,
    skills: profile.capability.skills ?? [],
    running: profile.running,
    agent_mark_state: "seed_not_accepted",
  }));
}

// Hermes has no capture lane, so there is no collection generation to point a
// `backup_generation_pointer` at. This note records the reference without
// claiming a lane record; the real record is emitted only when a caller can
// supply the generation it covers.
export function buildGenerationRefNote(snapshot) {
  return {
    schema_version: HERMES_GENERATION_REF_NOTE_SCHEMA,
    claim_ceiling: "inventory_v0",
    source_ref: HERMES_SOURCE_REF,
    generation_ref: snapshot.generation_ref,
    stamp: snapshot.stamp,
    captured_at: snapshot.captured_at,
    content_digest: snapshot.content_digest,
    profile_count: snapshot.profile_count,
    lane_record_withheld: "backup_generation_pointer",
    lane_record_withheld_reason: "no_hermes_capture_generation_exists",
    human_acceptance_state: "pending",
  };
}

async function writeCreateOnlyJson(target, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeCreateOnlyBytes(target, bytes);
  return { path: target, bytes: bytes.length };
}

async function writeCreateOnlyBytes(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  if (await lstatOrNull(target) !== null) {
    fail("output_exists", "Snapshot outputs are create-only and this stamp already exists");
  }
  const temporary = `${target}.tmp-${process.pid}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}

// Isolated readback: the published payload is copied out to a temporary
// directory and re-hashed there, so the check reads what was actually written
// rather than the buffer that wrote it.
async function verifyPayloadReadback(payloadPaths) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "soulforge-hermes-readback-"));
  try {
    const results = [];
    for (const entry of payloadPaths) {
      const copy = path.join(scratch, `${entry.profile}.SOUL.md`);
      await copyFile(entry.path, copy);
      const bytes = await readFile(copy);
      results.push({
        profile: entry.profile,
        verified: `sha256:${createHash("sha256").update(bytes).digest("hex")}` === entry.sha256,
      });
    }
    return results;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function runHermesProfileSnapshot({
  hermes_home: hermesHome,
  data_root: dataRoot,
  generation_seq: generationSeq = null,
  running_profiles: runningProfiles = null,
  apply = false,
  stamp = null,
  now = () => new Date(),
}) {
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) {
    fail("absolute_path_required", "data_root must be an absolute path");
  }
  if (pathsOverlap(hermesHome, dataRoot)) {
    fail("roots_overlap", "The Hermes home and the snapshot data root must be disjoint");
  }
  const effectiveStamp = stamp ?? stampFor(now());
  const snapshot = await buildHermesProfileSnapshot({
    hermes_home: hermesHome, stamp: effectiveStamp, running_profiles: runningProfiles, now,
  });

  const generationRoot = path.join(dataRoot, "60_BACKUP_GENERATIONS", "hermes", `hermes-profiles-${effectiveStamp}`);
  const targets = {
    generation: path.join(generationRoot, "generation.json"),
    payload_root: path.join(generationRoot, "payload"),
    catalog: path.join(dataRoot, "10_SOURCE_CAPTURE_CATALOG", "hermes", "backup-generation-refs", `${effectiveStamp}.json`),
    workforce_root: path.join(dataRoot, "50_AI_WORKFORCE_INDEX", "runtime-profiles"),
  };

  const withheld = [];
  let pointer = null;
  if (generationSeq === null) {
    withheld.push("backup_generation_pointer_withheld_no_collection_generation");
  } else if (!Number.isSafeInteger(generationSeq) || generationSeq < 1) {
    fail("generation_seq_invalid", "A backup pointer needs a positive collection generation");
  } else {
    pointer = {
      record_kind: "backup_generation_pointer",
      source_ref: HERMES_SOURCE_REF,
      generation_seq: generationSeq,
      backup_generation_ref: snapshot.generation_ref,
      content_digest: snapshot.content_digest,
      backed_up_at: snapshot.captured_at,
    };
  }

  const runtimeProfiles = buildRuntimeProfileRecords(snapshot);

  if (!apply) {
    return {
      mode: "plan",
      written: false,
      stamp: effectiveStamp,
      generation_ref: snapshot.generation_ref,
      content_digest: snapshot.content_digest,
      profile_count: snapshot.profile_count,
      payload_file_count: snapshot.payload.file_count,
      payload_total_bytes: snapshot.payload.total_bytes,
      readback_verified_count: 0,
      coverage_gaps: snapshot.coverage_gaps,
      withheld,
      would_write: [
        targets.generation,
        `${targets.payload_root}/<profile>/${HERMES_INSTRUCTION_FILE}`,
        targets.catalog,
        `${targets.workforce_root}/<profile>.json`,
      ],
      snapshot,
      runtime_profiles: runtimeProfiles,
      backup_generation_pointer: pointer,
    };
  }

  const home = await realpath(hermesHome);
  const payloadPaths = [];
  const writtenPaths = [];
  for (const profile of snapshot.profiles) {
    if (!profile.instruction.present || profile.instruction.sha256 === null) continue;
    const source = path.join(home, "profiles", profile.profile, HERMES_INSTRUCTION_FILE);
    const target = path.join(targets.payload_root, profile.profile, HERMES_INSTRUCTION_FILE);
    await writeCreateOnlyBytes(target, await readFile(source));
    payloadPaths.push({ profile: profile.profile, path: target, sha256: profile.instruction.sha256 });
    writtenPaths.push(target);
  }

  const readback = await verifyPayloadReadback(payloadPaths);
  const verifiedCount = readback.filter((entry) => entry.verified).length;
  const publishedSnapshot = {
    ...snapshot,
    payload: { ...snapshot.payload, readback_verified_count: verifiedCount },
    coverage_gaps: verifiedCount === payloadPaths.length
      ? snapshot.coverage_gaps
      : [...new Set([...snapshot.coverage_gaps, "readback_unverified"])].sort(),
  };

  writtenPaths.push((await writeCreateOnlyJson(targets.generation, publishedSnapshot)).path);
  writtenPaths.push((await writeCreateOnlyJson(
    targets.catalog,
    pointer === null ? buildGenerationRefNote(publishedSnapshot) : pointer,
  )).path);
  for (const record of buildRuntimeProfileRecords(publishedSnapshot)) {
    writtenPaths.push((await writeCreateOnlyJson(
      path.join(targets.workforce_root, `${record.profile}.json`), record,
    )).path);
  }

  return {
    mode: "apply",
    written: true,
    stamp: effectiveStamp,
    generation_ref: publishedSnapshot.generation_ref,
    content_digest: publishedSnapshot.content_digest,
    profile_count: publishedSnapshot.profile_count,
    payload_file_count: publishedSnapshot.payload.file_count,
    payload_total_bytes: publishedSnapshot.payload.total_bytes,
    readback_verified_count: verifiedCount,
    coverage_gaps: publishedSnapshot.coverage_gaps,
    withheld,
    written_paths: writtenPaths,
    snapshot: publishedSnapshot,
    runtime_profiles: buildRuntimeProfileRecords(publishedSnapshot),
    backup_generation_pointer: pointer,
  };
}
