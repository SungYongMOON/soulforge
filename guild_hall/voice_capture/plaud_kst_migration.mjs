import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { buildPlaudSessionId, parsePlaudProviderTimestamp } from "./plaud_ingest.mjs";

export const plaudKstMigrationSchemaVersion = "soulforge.plaud_kst_migration.v0";

const ACTIVE_TEXT_EXTENSIONS = new Set([".csv", ".json", ".jsonl", ".md", ".yaml", ".yml"]);
const EXCLUDED_DIRECTORY_NAMES = new Set(["audio", "chunks", "logs", "provider_export", "reports"]);
const EXCLUDED_PAYLOAD_NAMES = new Set(["summary.md", "suppressed_segments.jsonl", "transcript.jsonl", "transcript.txt"]);

export async function buildPlaudKstMigrationPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const workspaceRoot = path.join(repoRoot, "_workspaces", "system", "voice_capture");
  const sessionRoot = path.join(workspaceRoot, "sessions");
  const mappings = options.mappings ? options.mappings.map((item) => ({ ...item })) : [];

  if (!options.mappings) {
    for (const manifestPath of await findSessionManifests(sessionRoot)) {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (manifest.source !== "plaud_cli_import") continue;
      if (manifest.provider_timestamp?.normalized_timezone === "Asia/Seoul") continue;

      const providerRaw = String(manifest.recorded_at_local ?? "").replace(/\+09:00$/u, "");
      const providerTimestamp = parsePlaudProviderTimestamp(providerRaw);
      const start = providerTimestamp.date;
      const providerEndRaw = String(manifest.recorded_end_at_local ?? "").replace(/\+09:00$/u, "");
      const end = parsePlaudProviderTimestamp(providerEndRaw).date;
      const oldSessionId = manifest.session_id;
      const newSessionId = buildPlaudSessionId(start, manifest.provider_recording_id);
      const oldDate = path.basename(path.dirname(path.dirname(manifestPath)));
      const newDate = formatKstParts(start).date;
      const oldSessionRef = posix(path.relative(repoRoot, path.dirname(manifestPath)));
      const newSessionRef = `_workspaces/system/voice_capture/sessions/${newDate}/${newSessionId}`;
      const oldLibraryRef = `_workspaces/system/voice_capture/library/recordings/${oldDate}/${oldSessionId}`;
      const newLibraryRef = `_workspaces/system/voice_capture/library/recordings/${newDate}/${newSessionId}`;

      mappings.push({
        provider_recording_id: manifest.provider_recording_id,
        old_session_id: oldSessionId,
        new_session_id: newSessionId,
        old_session_ref: oldSessionRef,
        new_session_ref: newSessionRef,
        old_library_ref: oldLibraryRef,
        new_library_ref: newLibraryRef,
        provider_start_at_raw: providerRaw,
        old_recorded_at_local: manifest.recorded_at_local,
        new_recorded_at_local: formatKstParts(start).iso,
        old_recorded_end_at_local: manifest.recorded_end_at_local,
        new_recorded_end_at_local: formatKstParts(end).iso,
      });
    }
  }

  mappings.sort((left, right) => left.old_session_id.localeCompare(right.old_session_id));
  const actions = await prepareActions({ repoRoot, workspaceRoot, mappings });
  const plan = {
    schema_version: plaudKstMigrationSchemaVersion,
    applied: false,
    timezone: "Asia/Seoul",
    legacy_provider_time_basis: "UTC timestamp without an explicit offset",
    migration_count: mappings.length,
    content_change_count: actions.textChanges.length,
    path_rename_count: actions.pathRenames.length,
    mappings,
    actions,
  };
  Object.defineProperty(plan, "repoRoot", { value: repoRoot });
  return plan;
}

export async function applyPlaudKstMigration(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const plan = options.plan ?? await buildPlaudKstMigrationPlan({ repoRoot });
  const receiptPath = options.receiptRef ? resolveReceiptPath(repoRoot, options.receiptRef) : null;
  if (!options.apply) return describePlaudKstMigrationPlan(plan);
  if (plan.migration_count === 0) return { ...describePlaudKstMigrationPlan(plan), applied: true };

  for (const change of plan.actions.textChanges) {
    await fs.writeFile(change.path, change.after, "utf8");
  }
  for (const rename of plan.actions.pathRenames) {
    await fs.mkdir(path.dirname(rename.to), { recursive: true });
    await fs.rename(rename.from, rename.to);
  }
  await pruneEmptyDateDirectories(path.join(repoRoot, "_workspaces", "system", "voice_capture", "sessions"));
  await pruneEmptyDateDirectories(path.join(repoRoot, "_workspaces", "system", "voice_capture", "library", "recordings"));

  const result = {
    ...describePlaudKstMigrationPlan(plan),
    applied: true,
    applied_at: new Date().toISOString(),
  };
  if (receiptPath) {
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_ref = posix(path.relative(repoRoot, receiptPath));
  }
  return result;
}

function resolveReceiptPath(repoRoot, receiptRef) {
  if (path.isAbsolute(receiptRef)) throw new Error("PLAUD KST migration receipt must use a repo-relative _workmeta path");
  const receiptPath = path.resolve(repoRoot, receiptRef);
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  if (!isInside(workmetaRoot, receiptPath)) {
    throw new Error("PLAUD KST migration receipt must stay under _workmeta");
  }
  return receiptPath;
}

async function prepareActions({ repoRoot, workspaceRoot, mappings }) {
  const activeRoots = [
    workspaceRoot,
    path.join(repoRoot, "_workmeta", "P00-000_INBOX", "reports", "voice_source_events"),
    path.join(repoRoot, "_workmeta", "P00-000_INBOX", "project_context"),
  ];
  const replacements = buildReplacements(mappings);
  const textChanges = [];
  const pathRenames = [];

  for (const root of activeRoots) {
    for (const filePath of await findActiveTextFiles(root)) {
      const before = await fs.readFile(filePath, "utf8");
      let after = applyReplacements(before, replacements);
      const mapping = mappings.find((item) => posix(filePath).endsWith(`${item.old_session_ref}/session_manifest.json`));
      if (mapping) {
        const manifest = JSON.parse(after);
        manifest.provider_timestamp = {
          start_at_raw: mapping.provider_start_at_raw,
          basis: "plaud_cli_utc_without_offset",
          normalized_timezone: "Asia/Seoul",
          raw_precision: "seconds_reconstructed_from_legacy_manifest",
          migration_evidence: "legacy PLAUD CLI clock audited against provider metadata before KST correction",
        };
        after = `${JSON.stringify(manifest, null, 2)}\n`;
      }
      if (after !== before) textChanges.push({ path: filePath, before, after });
    }
  }

  const explicitSources = new Set();
  for (const mapping of mappings) {
    addRename(path.join(repoRoot, mapping.old_session_ref), path.join(repoRoot, mapping.new_session_ref));
    const oldLibraryPath = path.join(repoRoot, mapping.old_library_ref);
    if (existsSync(oldLibraryPath)) addRename(oldLibraryPath, path.join(repoRoot, mapping.new_library_ref));
  }
  for (const root of activeRoots) {
    for (const entryPath of await walkPaths(root)) {
      if (explicitSources.has(entryPath)) continue;
      const renamed = applyReplacements(path.basename(entryPath), replacements);
      if (renamed !== path.basename(entryPath)) addRename(entryPath, path.join(path.dirname(entryPath), renamed));
    }
  }

  const nested = pathRenames.find((candidate) => pathRenames.some((other) => candidate !== other && isInside(other.from, candidate.from)));
  if (nested) throw new Error(`nested PLAUD migration rename is not supported: ${nested.from}`);
  for (const rename of pathRenames) {
    if (existsSync(rename.to)) throw new Error(`PLAUD KST migration target already exists: ${rename.to}`);
  }
  return { textChanges, pathRenames };

  function addRename(from, to) {
    if (from === to || !existsSync(from) || explicitSources.has(from)) return;
    explicitSources.add(from);
    pathRenames.push({ from, to });
  }
}

function buildReplacements(mappings) {
  const replacements = new Map();
  for (const item of mappings) {
    replacements.set(item.old_session_ref, item.new_session_ref);
    replacements.set(item.old_library_ref, item.new_library_ref);
    replacements.set(item.old_session_id, item.new_session_id);
    replacements.set(item.old_recorded_at_local, item.new_recorded_at_local);
    replacements.set(item.old_recorded_end_at_local, item.new_recorded_end_at_local);
  }
  return [...replacements].filter(([from, to]) => from && to && from !== to).sort((left, right) => right[0].length - left[0].length);
}

function applyReplacements(value, replacements) {
  let result = value;
  for (const [from, to] of replacements) result = result.split(from).join(to);
  return result;
}

async function findSessionManifests(root) {
  return (await walkPaths(root)).filter((value) => path.basename(value) === "session_manifest.json");
}

async function findActiveTextFiles(root) {
  return (await walkPaths(root)).filter((value) => {
    if (!ACTIVE_TEXT_EXTENSIONS.has(path.extname(value).toLowerCase())) return false;
    const parts = path.relative(root, value).split(path.sep);
    if (parts.some((part) => EXCLUDED_DIRECTORY_NAMES.has(part))) return false;
    if (EXCLUDED_PAYLOAD_NAMES.has(path.basename(value))) return false;
    return true;
  });
}

async function walkPaths(root) {
  if (!existsSync(root)) return [];
  const found = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      found.push(entryPath);
      if (entry.isDirectory()) await visit(entryPath);
    }
  }
  await visit(root);
  return found;
}

async function pruneEmptyDateDirectories(root) {
  if (!existsSync(root)) return;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(root, entry.name);
    if ((await fs.readdir(entryPath)).length === 0) await fs.rmdir(entryPath);
  }
}

function formatKstParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const datePart = `${parts.year}-${parts.month}-${parts.day}`;
  return { date: datePart, iso: `${datePart}T${parts.hour}:${parts.minute}:${parts.second}+09:00` };
}

export function describePlaudKstMigrationPlan(plan) {
  const { actions, ...summary } = plan;
  return {
    ...summary,
    actions: {
      text_changes: actions.textChanges.map((change) => posix(path.relative(plan.repoRoot, change.path))),
      path_renames: actions.pathRenames.map((rename) => ({
        from: posix(path.relative(plan.repoRoot, rename.from)),
        to: posix(path.relative(plan.repoRoot, rename.to)),
      })),
    },
  };
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function posix(value) {
  return value.split(path.sep).join("/");
}
