import { promises as fs } from "node:fs";
import path from "node:path";

const MANIFEST_DIRNAME = "_index";
const MANIFEST_FILENAME = "monster_index.json";
const MANIFEST_VERSION = "soulforge.gateway.monster_index.v1";

export function createMonsterIndex() {
  return {
    byId: new Map(),
    byDedupeKey: new Map(),
  };
}

export function normalizeDedupeKey(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

export function registerMonsterInIndex(index, monster, location) {
  const record = {
    monster_id: monster.monster_id,
    inbox_id: location.inbox_id,
    inbox_dir: location.inbox_dir,
    updated_at: monster.updated_at ?? null,
  };

  index.byId.set(monster.monster_id, record);

  const dedupeKey = normalizeDedupeKey(monster.dedupe_key);
  if (!dedupeKey) {
    return;
  }

  const existing = index.byDedupeKey.get(dedupeKey);
  if (!existing || compareTimestamps(record.updated_at, existing.updated_at) >= 0) {
    index.byDedupeKey.set(dedupeKey, record);
  }
}

export async function loadMonsterIndex(rootPath) {
  if (!(await pathExists(rootPath))) {
    return createMonsterIndex();
  }

  const inboxIds = await listInboxIds(rootPath);
  const manifest = await readManifest(rootPath);

  if (manifest && (await manifestMatchesFilesystem(manifest, rootPath, inboxIds))) {
    return buildIndexFromManifest(manifest, rootPath);
  }

  return rebuildMonsterIndex(rootPath, inboxIds);
}

export async function syncMonsterIndexInbox(rootPath, inboxId, monsters) {
  await fs.mkdir(rootPath, { recursive: true });
  const manifestPath = path.join(rootPath, MANIFEST_DIRNAME, MANIFEST_FILENAME);
  const monstersFile = path.join(rootPath, inboxId, "monsters.json");
  const manifest = (await readManifest(rootPath)) ?? createEmptyManifest();
  const remainingEntries = manifest.entries.filter((entry) => entry.inbox_id !== inboxId);

  if (!(await pathExists(monstersFile))) {
    delete manifest.inboxes[inboxId];
    manifest.entries = remainingEntries;
    manifest.generated_at = new Date().toISOString();
    await writeManifest(manifestPath, manifest);
    return;
  }

  const stat = await fs.stat(monstersFile);
  const nextEntries = normalizeMonsterArray(monsters).map((monster) => toManifestEntry(monster, inboxId));

  manifest.inboxes[inboxId] = {
    monsters_file_mtime_ms: Math.trunc(stat.mtimeMs),
    monster_count: nextEntries.length,
  };
  manifest.entries = [...remainingEntries, ...nextEntries].sort(compareManifestEntries);
  manifest.generated_at = new Date().toISOString();

  await writeManifest(manifestPath, manifest);
}

async function rebuildMonsterIndex(rootPath, inboxIds) {
  const index = createMonsterIndex();
  const manifest = createEmptyManifest();

  for (const inboxId of inboxIds) {
    const inboxDir = path.join(rootPath, inboxId);
    const monstersFile = path.join(inboxDir, "monsters.json");
    if (!(await pathExists(monstersFile))) {
      continue;
    }

    const monsterDocument = await readJson(monstersFile);
    const monsters = normalizeMonsterArray(monsterDocument.monsters);
    const stat = await fs.stat(monstersFile);
    manifest.inboxes[inboxId] = {
      monsters_file_mtime_ms: Math.trunc(stat.mtimeMs),
      monster_count: monsters.length,
    };

    for (const monster of monsters) {
      const manifestEntry = toManifestEntry(monster, inboxId);
      manifest.entries.push(manifestEntry);
      registerMonsterInIndex(index, monster, { inbox_id: inboxId, inbox_dir: inboxDir });
    }
  }

  manifest.entries.sort(compareManifestEntries);
  manifest.generated_at = new Date().toISOString();
  await writeManifest(path.join(rootPath, MANIFEST_DIRNAME, MANIFEST_FILENAME), manifest);
  return index;
}

async function manifestMatchesFilesystem(manifest, rootPath, inboxIds) {
  if (manifest.version !== MANIFEST_VERSION) {
    return false;
  }

  const manifestInboxIds = Object.keys(manifest.inboxes ?? {}).sort();
  if (manifestInboxIds.length !== inboxIds.length) {
    return false;
  }

  for (let index = 0; index < inboxIds.length; index += 1) {
    if (inboxIds[index] !== manifestInboxIds[index]) {
      return false;
    }
  }

  for (const inboxId of inboxIds) {
    const monstersFile = path.join(rootPath, inboxId, "monsters.json");
    if (!(await pathExists(monstersFile))) {
      return false;
    }

    const stat = await fs.stat(monstersFile);
    const expected = manifest.inboxes[inboxId]?.monsters_file_mtime_ms;
    if (Math.trunc(stat.mtimeMs) !== expected) {
      return false;
    }
  }

  return true;
}

function buildIndexFromManifest(manifest, rootPath) {
  const index = createMonsterIndex();

  for (const entry of manifest.entries ?? []) {
    registerMonsterInIndex(
      index,
      {
        monster_id: entry.monster_id,
        dedupe_key: entry.dedupe_key,
        updated_at: entry.updated_at,
      },
      {
        inbox_id: entry.inbox_id,
        inbox_dir: path.join(rootPath, entry.inbox_id),
      },
    );
  }

  return index;
}

function createEmptyManifest() {
  return {
    version: MANIFEST_VERSION,
    generated_at: null,
    inboxes: {},
    entries: [],
  };
}

function toManifestEntry(monster, inboxId) {
  return {
    inbox_id: inboxId,
    monster_id: monster.monster_id,
    dedupe_key: normalizeDedupeKey(monster.dedupe_key),
    updated_at: monster.updated_at ?? null,
  };
}

function compareManifestEntries(left, right) {
  return `${left.inbox_id}:${left.monster_id}`.localeCompare(`${right.inbox_id}:${right.monster_id}`);
}

async function listInboxIds(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== MANIFEST_DIRNAME)
    .map((entry) => entry.name)
    .sort();
}

async function readManifest(rootPath) {
  const manifestPath = path.join(rootPath, MANIFEST_DIRNAME, MANIFEST_FILENAME);
  if (!(await pathExists(manifestPath))) {
    return null;
  }

  try {
    return await readJson(manifestPath);
  } catch {
    return null;
  }
}

async function writeManifest(manifestPath, manifest) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function normalizeMonsterArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function compareTimestamps(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return leftTime - rightTime;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
