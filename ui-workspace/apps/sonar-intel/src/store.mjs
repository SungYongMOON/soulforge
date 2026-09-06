// CORE DB for 소나 인텔 (SONAR_INTEL_MASTER_PLAN_V1.md §4). Single source of truth
// for collected entities. Every entity gets a stable id and a nullable
// `erpMapping` column reserved for future ERP linkage (never populated here —
// dev-erp integration happens through export/ snapshots, not DB merge).
//
// Backend selection: this repo's Node runs `node:sqlite` without any
// experimental flag (checked at build time — see README "구현 메모"), so that is
// the primary backend. If a future Node runtime in CI or on a contributor
// machine does NOT expose `node:sqlite` (older Node 22.x had it behind
// --experimental-sqlite), this module falls back automatically to an
// append-only JSONL store that implements the exact same interface. Callers
// never need to know which backend is active; `store.backendName` reports it
// for diagnostics/receipts.
//
// LLM calls in this module: zero.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The app's own root (this file lives at <app>/src/store.mjs), not the caller's
// process.cwd() — server.mjs, tools/collect_once.mjs and every test import this
// module from different working directories, and the default store location
// must not silently move (or fragment into several data/ folders) depending on
// where the process happened to be launched from.
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Namespaced stable id: sha256(naturalKey) truncated, prefixed by namespace. */
export function computeStableId(namespace, naturalKey) {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("computeStableId: namespace must be a non-empty string");
  }
  if (naturalKey === undefined || naturalKey === null || naturalKey === "") {
    throw new Error("computeStableId: naturalKey must be a non-empty value");
  }
  const digest = createHash("sha256").update(String(naturalKey)).digest("hex").slice(0, 24);
  return `${namespace}_${digest}`;
}

/** Content fingerprint used to distinguish a real change from a re-fetch of the same item. */
export function contentFingerprint(record) {
  const stable = {
    title: record.title ?? null,
    url: record.url ?? null,
    summary: record.summary ?? null,
    publishedAt: record.publishedAt ?? null,
    keywordsMatched: [...(record.keywordsMatched ?? [])].sort(),
    meta: record.meta ?? null,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

const REQUIRED_FIELDS = ["id", "type", "source"];

function assertValidRecord(record) {
  for (const field of REQUIRED_FIELDS) {
    if (!record || !record[field]) {
      throw new Error(`store.upsertItem: record.${field} is required`);
    }
  }
}

function normalizeInputRecord(record) {
  const now = new Date().toISOString();
  return {
    id: record.id,
    type: record.type,
    source: record.source,
    title: record.title ?? null,
    url: record.url ?? null,
    summary: record.summary ?? null,
    publishedAt: record.publishedAt ?? null,
    fetchedAt: record.fetchedAt ?? now,
    keywordsMatched: record.keywordsMatched ?? [],
    meta: record.meta ?? null,
    erpMapping: null,
  };
}

/**
 * The same entity is often re-fetched under a different keyword query (e.g. one
 * article matches both "SVP" and "hydrophone" searches). Every other field
 * takes the freshest fetch's value, but `keywordsMatched` is a running union —
 * without this, a later upsert would silently drop an earlier keyword match
 * instead of recording that the item matched both.
 */
function buildEffectiveRecord(existing, normalized) {
  if (!existing) return normalized;
  const merged = new Set([...(existing.keywordsMatched ?? []), ...(normalized.keywordsMatched ?? [])]);
  return { ...normalized, keywordsMatched: [...merged] };
}

async function detectSqliteModule() {
  try {
    const mod = await import("node:sqlite");
    if (mod && typeof mod.DatabaseSync === "function") {
      return mod;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.dataDir] directory holding the store file(s). Defaults to `<app>/data`.
 * @param {"auto"|"sqlite"|"jsonl"} [options.backend] force a backend; "auto" (default) tries
 *   sqlite first and falls back to JSONL.
 * @param {string} [options.dbFileName] sqlite filename. Default "intel.db".
 * @param {string} [options.jsonlFileName] JSONL filename. Default "intel.jsonl".
 */
export async function openStore(options = {}) {
  const dataDir = options.dataDir ?? path.join(APP_ROOT, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const requestedBackend = options.backend ?? "auto";
  let sqliteModule = null;
  if (requestedBackend !== "jsonl") {
    sqliteModule = await detectSqliteModule();
    if (requestedBackend === "sqlite" && !sqliteModule) {
      throw new Error("openStore: backend 'sqlite' was requested but node:sqlite is unavailable in this runtime");
    }
  }

  if (sqliteModule) {
    return openSqliteStore(sqliteModule, dataDir, options.dbFileName ?? "intel.db");
  }
  return openJsonlStore(dataDir, options.jsonlFileName ?? "intel.jsonl");
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

function openSqliteStore(sqliteModule, dataDir, dbFileName) {
  const { DatabaseSync } = sqliteModule;
  const dbPath = path.join(dataDir, dbFileName);
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT,
      url TEXT,
      summary TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      keywords_matched TEXT NOT NULL,
      meta TEXT,
      erp_mapping TEXT,
      content_fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_type_source ON items(type, source);
    CREATE INDEX IF NOT EXISTS idx_items_fetched_at ON items(fetched_at);
  `);

  const selectByIdStmt = db.prepare("SELECT * FROM items WHERE id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO items (id, type, source, title, url, summary, published_at, fetched_at,
      keywords_matched, meta, erp_mapping, content_fingerprint, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE items SET type=?, source=?, title=?, url=?, summary=?, published_at=?, fetched_at=?,
      keywords_matched=?, meta=?, content_fingerprint=?, updated_at=?
    WHERE id = ?
  `);

  function rowToRecord(row) {
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      source: row.source,
      title: row.title,
      url: row.url,
      summary: row.summary,
      publishedAt: row.published_at,
      fetchedAt: row.fetched_at,
      keywordsMatched: JSON.parse(row.keywords_matched ?? "[]"),
      meta: row.meta ? JSON.parse(row.meta) : null,
      erpMapping: row.erp_mapping ? JSON.parse(row.erp_mapping) : null,
      contentFingerprint: row.content_fingerprint,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function getItem(id) {
    return rowToRecord(selectByIdStmt.get(id));
  }

  function upsertItem(inputRecord) {
    assertValidRecord(inputRecord);
    const normalized = normalizeInputRecord(inputRecord);
    const existing = getItem(normalized.id);
    const record = buildEffectiveRecord(existing, normalized);
    const fp = contentFingerprint(record);
    const nowIso = new Date().toISOString();

    if (!existing) {
      insertStmt.run(
        record.id,
        record.type,
        record.source,
        record.title,
        record.url,
        record.summary,
        record.publishedAt,
        record.fetchedAt,
        JSON.stringify(record.keywordsMatched),
        record.meta ? JSON.stringify(record.meta) : null,
        null,
        fp,
        nowIso,
        nowIso,
      );
      return { id: record.id, status: "inserted" };
    }

    if (existing.contentFingerprint === fp) {
      return { id: record.id, status: "duplicate" };
    }

    updateStmt.run(
      record.type,
      record.source,
      record.title,
      record.url,
      record.summary,
      record.publishedAt,
      record.fetchedAt,
      JSON.stringify(record.keywordsMatched),
      record.meta ? JSON.stringify(record.meta) : null,
      fp,
      nowIso,
      record.id,
    );
    return { id: record.id, status: "updated" };
  }

  function listItems({ type, source, limit = 50, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    if (type) {
      clauses.push("type = ?");
      params.push(type);
    }
    if (source) {
      clauses.push("source = ?");
      params.push(source);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const stmt = db.prepare(`SELECT * FROM items ${where} ORDER BY fetched_at DESC LIMIT ? OFFSET ?`);
    const rows = stmt.all(...params, limit, offset);
    return rows.map(rowToRecord);
  }

  function countItems({ type, source } = {}) {
    const clauses = [];
    const params = [];
    if (type) {
      clauses.push("type = ?");
      params.push(type);
    }
    if (source) {
      clauses.push("source = ?");
      params.push(source);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const stmt = db.prepare(`SELECT COUNT(*) AS n FROM items ${where}`);
    return stmt.get(...params).n;
  }

  function summarize() {
    const rows = db.prepare(`
      SELECT type, source, COUNT(*) AS n, MAX(fetched_at) AS last_fetched_at
      FROM items GROUP BY type, source ORDER BY type, source
    `).all();
    return rows.map((r) => ({ type: r.type, source: r.source, count: r.n, lastFetchedAt: r.last_fetched_at }));
  }

  function allItems() {
    return db.prepare("SELECT * FROM items ORDER BY fetched_at ASC").all().map(rowToRecord);
  }

  function close() {
    db.close();
  }

  return {
    backendName: "sqlite",
    dataDir,
    path: dbPath,
    upsertItem,
    getItem,
    listItems,
    countItems,
    summarize,
    allItems,
    close,
  };
}

// ---------------------------------------------------------------------------
// JSONL fallback backend (append-only log; latest line per id wins)
// ---------------------------------------------------------------------------

function openJsonlStore(dataDir, jsonlFileName) {
  const filePath = path.join(dataDir, jsonlFileName);
  /** @type {Map<string, object>} */
  const index = new Map();

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        if (record && record.id) {
          index.set(record.id, record);
        }
      } catch {
        // A truncated final line (e.g. process killed mid-write) is skipped, not fatal.
      }
    }
  }

  function appendLine(record) {
    appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  function getItem(id) {
    return index.get(id) ?? null;
  }

  function upsertItem(inputRecord) {
    assertValidRecord(inputRecord);
    const normalized = normalizeInputRecord(inputRecord);
    const existing = index.get(normalized.id);
    const record = buildEffectiveRecord(existing, normalized);
    const fp = contentFingerprint(record);
    const nowIso = new Date().toISOString();

    if (!existing) {
      const stored = { ...record, contentFingerprint: fp, createdAt: nowIso, updatedAt: nowIso };
      index.set(record.id, stored);
      appendLine(stored);
      return { id: record.id, status: "inserted" };
    }

    if (existing.contentFingerprint === fp) {
      return { id: record.id, status: "duplicate" };
    }

    const stored = { ...record, contentFingerprint: fp, createdAt: existing.createdAt, updatedAt: nowIso };
    index.set(record.id, stored);
    appendLine(stored);
    return { id: record.id, status: "updated" };
  }

  function listItems({ type, source, limit = 50, offset = 0 } = {}) {
    let values = [...index.values()];
    if (type) values = values.filter((r) => r.type === type);
    if (source) values = values.filter((r) => r.source === source);
    values.sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : a.fetchedAt > b.fetchedAt ? -1 : 0));
    return values.slice(offset, offset + limit);
  }

  function countItems({ type, source } = {}) {
    let values = [...index.values()];
    if (type) values = values.filter((r) => r.type === type);
    if (source) values = values.filter((r) => r.source === source);
    return values.length;
  }

  function summarize() {
    const groups = new Map();
    for (const record of index.values()) {
      const key = `${record.type}::${record.source}`;
      const entry = groups.get(key) ?? { type: record.type, source: record.source, count: 0, lastFetchedAt: null };
      entry.count += 1;
      if (!entry.lastFetchedAt || record.fetchedAt > entry.lastFetchedAt) {
        entry.lastFetchedAt = record.fetchedAt;
      }
      groups.set(key, entry);
    }
    return [...groups.values()].sort((a, b) => (a.type + a.source).localeCompare(b.type + b.source));
  }

  function allItems() {
    return [...index.values()].sort((a, b) => (a.fetchedAt < b.fetchedAt ? -1 : a.fetchedAt > b.fetchedAt ? 1 : 0));
  }

  function close() {
    // Synchronous appendFileSync means there is nothing buffered to flush.
  }

  return {
    backendName: "jsonl",
    dataDir,
    path: filePath,
    upsertItem,
    getItem,
    listItems,
    countItems,
    summarize,
    allItems,
    close,
  };
}
