#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES,
  createCodexMessagePayloadStore,
} from "../src/codex_message_payload_store.mjs";

export const LEGACY_CODEX_OWNER_MAPPING_SCHEMA = "dev_erp.legacy_codex_owner_mapping.v1";
export const LEGACY_CODEX_MIGRATION_REPORT_SCHEMA = "dev_erp.legacy_codex_migration_report.v1";

const RECEIPT_TABLE = "codex_legacy_migration_receipt";
const MAX_MAPPING_BYTES = 1024 * 1024;
const OWNER_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORKSPACE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const PAYLOAD_REF_RE = /^cmp_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{32}$/;
const THREAD_REF_RE = /^dwr2\.[A-Za-z0-9][A-Za-z0-9_-]{0,31}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,10923}\.[A-Za-z0-9_-]{22}$/;
const REASON_CODE_RE = /^[a-z][a-z0-9_.-]{2,63}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MESSAGE_ROLES = new Set(["system", "user", "assistant", "error"]);
const TOP_LEVEL_KEYS = new Set(["schema", "owner_ref", "approved_at", "message_action", "bindings"]);
const BIND_KEYS = new Set([
  "action",
  "item_id",
  "project_id",
  "workspace_id",
  "workspace_revision",
  "workspace_root_fingerprint",
]);
const RETIRE_KEYS = new Set(["action", "item_id", "project_id", "reason_code"]);
const REQUIRED_TABLE_COLUMNS = Object.freeze({
  core_item: ["id", "project_id"],
  codex_thread_binding: [
    "item_id",
    "thread_id",
    "project_id",
    "workspace_id",
    "workspace_revision",
    "workspace_root_fingerprint",
  ],
  codex_thread_message: [
    "id",
    "item_id",
    "role",
    "text",
    "payload_ref",
    "payload_byte_length",
    "payload_sha256",
    "data_label",
  ],
});

const RECEIPT_DDL = `
CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE} (
  entity_kind TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  action TEXT NOT NULL,
  project_id TEXT NOT NULL,
  owner_ref TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  reason_code TEXT,
  decision_sha256 TEXT NOT NULL,
  data_label TEXT NOT NULL DEFAULT 'meta',
  PRIMARY KEY(entity_kind, entity_key, action)
);`;

class MigrationError extends Error {
  constructor(code) {
    super(code);
    this.name = "MigrationError";
    this.code = code;
  }
}

function fail(code) {
  throw new MigrationError(code);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys) {
  if (!isPlainObject(value)) fail("mapping_invalid");
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) fail("mapping_invalid");
  }
}

function cleanExactString(value, pattern, max = 128) {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > max || !pattern.test(value)) {
    fail("mapping_invalid");
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decisionHash(mapping, entry) {
  return sha256(canonicalJson({
    schema: mapping.schema,
    owner_ref: mapping.owner_ref,
    approved_at: mapping.approved_at,
    binding: entry,
  }));
}

export function validateLegacyCodexOwnerMapping(value) {
  assertExactKeys(value, TOP_LEVEL_KEYS);
  if (value.schema !== LEGACY_CODEX_OWNER_MAPPING_SCHEMA || value.message_action !== "migrate") {
    fail("mapping_invalid");
  }
  const ownerRef = cleanExactString(value.owner_ref, OWNER_REF_RE);
  if (
    typeof value.approved_at !== "string"
    || !ISO_INSTANT_RE.test(value.approved_at)
    || !Number.isFinite(Date.parse(value.approved_at))
  ) {
    fail("mapping_invalid");
  }
  if (!Array.isArray(value.bindings) || value.bindings.length > 10_000) fail("mapping_invalid");

  const entries = [];
  const byItem = new Map();
  for (const raw of value.bindings) {
    if (!isPlainObject(raw) || !["bind", "retire"].includes(raw.action)) fail("mapping_invalid");
    assertExactKeys(raw, raw.action === "bind" ? BIND_KEYS : RETIRE_KEYS);
    const entry = {
      action: raw.action,
      item_id: cleanExactString(raw.item_id, ITEM_ID_RE),
      project_id: cleanExactString(raw.project_id, PROJECT_ID_RE, 64),
    };
    if (raw.action === "bind") {
      entry.workspace_id = cleanExactString(raw.workspace_id, WORKSPACE_ID_RE, 64);
      entry.workspace_revision = cleanExactString(raw.workspace_revision, HASH_RE, 64);
      entry.workspace_root_fingerprint = cleanExactString(raw.workspace_root_fingerprint, HASH_RE, 64);
    } else {
      entry.reason_code = cleanExactString(raw.reason_code, REASON_CODE_RE, 64);
    }
    if (byItem.has(entry.item_id)) fail("mapping_duplicate_item");
    entries.push(Object.freeze(entry));
    byItem.set(entry.item_id, entry);
  }
  const normalized = Object.freeze({
    schema: value.schema,
    owner_ref: ownerRef,
    approved_at: value.approved_at,
    message_action: "migrate",
    bindings: Object.freeze(entries),
  });
  return Object.freeze({ mapping: normalized, byItem });
}

function emptyPreflightCounts() {
  return {
    total_messages: 0,
    legacy_messages: 0,
    complete_messages: 0,
    partial_messages: 0,
    total_bindings: 0,
    legacy_bindings: 0,
    complete_bindings: 0,
    mapping_bind: 0,
    mapping_retire: 0,
    mapping_already_applied: 0,
    unmapped_legacy_bindings: 0,
  };
}

function emptyAppliedCounts() {
  return {
    migrated_messages: 0,
    bound_bindings: 0,
    retired_bindings: 0,
  };
}

function uniqueCodes(codes) {
  return [...new Set(codes)].sort();
}

function publicPreflight(status, counts, codes) {
  return Object.freeze({
    status,
    counts: Object.freeze({ ...counts }),
    codes: Object.freeze(uniqueCodes(codes)),
  });
}

function report({ mode, status, preflight, appliedCounts = emptyAppliedCounts(), codes = [], verification = null }) {
  const value = {
    schema: LEGACY_CODEX_MIGRATION_REPORT_SCHEMA,
    mode,
    status,
    preflight,
    applied_counts: Object.freeze({ ...appliedCounts }),
    codes: Object.freeze(uniqueCodes(codes)),
  };
  if (verification) value.verification = verification;
  return Object.freeze(value);
}

function safeFailure(mode, code, preflight = null, appliedCounts = emptyAppliedCounts()) {
  return report({
    mode,
    status: "failed",
    preflight: preflight ?? publicPreflight("failed", emptyPreflightCounts(), [code]),
    appliedCounts,
    codes: [code],
  });
}

async function pinDatabaseFile(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath) || dbPath.includes("\0")) fail("db_path_invalid");
  let link;
  let actual;
  let actualStat;
  try {
    link = await lstat(dbPath);
    if (!link.isFile() || link.isSymbolicLink() || Number(link.nlink) !== 1) fail("db_path_invalid");
    actual = await realpath(dbPath);
    actualStat = await stat(actual);
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    fail("db_open_failed");
  }
  if (!actualStat.isFile() || Number(actualStat.nlink) !== 1) fail("db_path_invalid");
  return Object.freeze({
    actual,
    dev: Number.isSafeInteger(actualStat.dev) ? actualStat.dev : null,
    ino: Number.isSafeInteger(actualStat.ino) ? actualStat.ino : null,
  });
}

async function validatePinnedDatabase(identity) {
  try {
    const current = await stat(identity.actual);
    if (!current.isFile() || Number(current.nlink) !== 1) fail("db_target_changed");
    if (identity.dev !== null && Number.isSafeInteger(current.dev) && identity.dev !== current.dev) fail("db_target_changed");
    if (identity.ino !== null && Number.isSafeInteger(current.ino) && identity.ino !== current.ino) fail("db_target_changed");
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    fail("db_target_changed");
  }
}

async function pinPayloadRoot(payloadRoot) {
  if (
    typeof payloadRoot !== "string"
    || !isAbsolute(payloadRoot)
    || payloadRoot.includes("\0")
    || resolve(payloadRoot) === parse(resolve(payloadRoot)).root
  ) {
    fail("payload_owner_root_invalid");
  }
  try {
    const link = await lstat(payloadRoot);
    if (!link.isDirectory() || link.isSymbolicLink()) fail("payload_owner_root_invalid");
    const actual = await realpath(payloadRoot);
    const actualStat = await stat(actual);
    if (!actualStat.isDirectory()) fail("payload_owner_root_invalid");
    return Object.freeze({
      actual,
      dev: Number.isSafeInteger(actualStat.dev) ? actualStat.dev : null,
      ino: Number.isSafeInteger(actualStat.ino) ? actualStat.ino : null,
    });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    fail("payload_owner_root_invalid");
  }
}

async function validatePinnedPayloadRoot(identity) {
  try {
    const current = await stat(identity.actual);
    if (!current.isDirectory()) fail("payload_owner_root_changed");
    if (identity.dev !== null && Number.isSafeInteger(current.dev) && identity.dev !== current.dev) {
      fail("payload_owner_root_changed");
    }
    if (identity.ino !== null && Number.isSafeInteger(current.ino) && identity.ino !== current.ino) {
      fail("payload_owner_root_changed");
    }
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    fail("payload_owner_root_changed");
  }
}

function openDatabase(path, { readOnly }) {
  try {
    const db = new DatabaseSync(path, { readOnly });
    db.exec("PRAGMA busy_timeout=5000");
    return db;
  } catch {
    fail("db_open_failed");
  }
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function validateSchema(db) {
  for (const [table, columns] of Object.entries(REQUIRED_TABLE_COLUMNS)) {
    if (!tableExists(db, table)) fail("db_schema_invalid");
    const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    if (columns.some((column) => !present.has(column))) fail("db_schema_invalid");
  }
}

function isCompleteMessage(row) {
  return (
    PAYLOAD_REF_RE.test(String(row.payload_ref ?? ""))
    && row.text === row.payload_ref
    && Number.isSafeInteger(row.payload_byte_length)
    && row.payload_byte_length >= 1
    && row.payload_byte_length <= 16 * 1024 * 1024
    && HASH_RE.test(String(row.payload_sha256 ?? ""))
  );
}

function isPureLegacyMessage(row) {
  const noRef = row.payload_ref === null || row.payload_ref === "";
  return (
    noRef
    && row.payload_byte_length === null
    && row.payload_sha256 === null
    && ITEM_ID_RE.test(String(row.item_id ?? ""))
    && PROJECT_ID_RE.test(String(row.item_project_id ?? ""))
    && MESSAGE_ROLES.has(row.role)
    && typeof row.text === "string"
    && Buffer.byteLength(row.text, "utf8") >= 1
    && Buffer.byteLength(row.text, "utf8") <= DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES
  );
}

function isCompleteBinding(row) {
  return (
    PROJECT_ID_RE.test(String(row.item_project_id ?? ""))
    && row.project_id === row.item_project_id
    && THREAD_REF_RE.test(String(row.thread_id ?? ""))
    && WORKSPACE_ID_RE.test(String(row.workspace_id ?? ""))
    && HASH_RE.test(String(row.workspace_revision ?? ""))
    && HASH_RE.test(String(row.workspace_root_fingerprint ?? ""))
  );
}

function fieldMissing(value) {
  return value === null || value === "";
}

function bindingCanAcceptMapping(row, entry) {
  if (!THREAD_REF_RE.test(String(row.thread_id ?? ""))) return false;
  if (row.item_project_id !== entry.project_id) return false;
  for (const key of ["project_id", "workspace_id", "workspace_revision", "workspace_root_fingerprint"]) {
    if (!fieldMissing(row[key]) && row[key] !== entry[key]) return false;
  }
  return true;
}

function bindingExactlyMatches(row, entry) {
  return (
    entry.action === "bind"
    && row.item_project_id === entry.project_id
    && row.project_id === entry.project_id
    && row.workspace_id === entry.workspace_id
    && row.workspace_revision === entry.workspace_revision
    && row.workspace_root_fingerprint === entry.workspace_root_fingerprint
  );
}

function readBindingReceipts(db) {
  if (!tableExists(db, RECEIPT_TABLE)) return new Map();
  const columns = new Set(db.prepare(`PRAGMA table_info(${RECEIPT_TABLE})`).all().map((row) => row.name));
  const required = [
    "entity_kind",
    "entity_key",
    "action",
    "project_id",
    "owner_ref",
    "approved_at",
    "applied_at",
    "reason_code",
    "decision_sha256",
    "data_label",
  ];
  if (required.some((column) => !columns.has(column))) fail("receipt_schema_invalid");
  const rows = db.prepare(
    `SELECT entity_key, action, project_id, decision_sha256 FROM ${RECEIPT_TABLE}
     WHERE entity_kind='binding'`,
  ).all();
  const receipts = new Map();
  for (const row of rows) {
    if (!receipts.has(row.entity_key)) receipts.set(row.entity_key, new Map());
    receipts.get(row.entity_key).set(row.action, row);
  }
  return receipts;
}

function inspectDatabase(db, validatedMapping) {
  validateSchema(db);
  const { mapping, byItem } = validatedMapping;
  const counts = emptyPreflightCounts();
  const codes = [];
  const messagePlan = [];
  const bindingPlan = [];

  const messages = db.prepare(
    `SELECT m.id,m.item_id,m.role,m.text,m.payload_ref,m.payload_byte_length,m.payload_sha256,
            i.project_id AS item_project_id
       FROM codex_thread_message m
       LEFT JOIN core_item i ON i.id=m.item_id
       ORDER BY m.id`,
  ).all();
  counts.total_messages = messages.length;
  for (const row of messages) {
    if (isCompleteMessage(row)) {
      counts.complete_messages += 1;
    } else if (isPureLegacyMessage(row)) {
      counts.legacy_messages += 1;
      messagePlan.push(row);
    } else {
      counts.partial_messages += 1;
    }
  }
  if (counts.partial_messages) codes.push("legacy_message_partial_state");

  const bindings = db.prepare(
    `SELECT b.item_id,b.thread_id,b.project_id,b.workspace_id,b.workspace_revision,b.workspace_root_fingerprint,
            i.project_id AS item_project_id
       FROM codex_thread_binding b
       LEFT JOIN core_item i ON i.id=b.item_id
       ORDER BY b.item_id`,
  ).all();
  counts.total_bindings = bindings.length;
  const rowByItem = new Map(bindings.map((row) => [row.item_id, row]));
  const bindingReceipts = readBindingReceipts(db);

  for (const entry of mapping.bindings) {
    if (entry.action === "bind") counts.mapping_bind += 1;
    else counts.mapping_retire += 1;
    const row = rowByItem.get(entry.item_id);
    if (!row) {
      const receipt = bindingReceipts.get(entry.item_id)?.get("retire");
      if (
        entry.action === "retire"
        && receipt?.project_id === entry.project_id
        && receipt?.decision_sha256 === decisionHash(mapping, entry)
      ) {
        counts.mapping_already_applied += 1;
      } else {
        codes.push("mapping_target_missing");
      }
      continue;
    }
    if (!isCompleteBinding(row) && bindingReceipts.get(entry.item_id)?.has(entry.action)) {
      codes.push("binding_receipt_state_conflict");
      continue;
    }
    if (isCompleteBinding(row)) {
      if (bindingExactlyMatches(row, entry)) counts.mapping_already_applied += 1;
      else codes.push("mapping_target_not_legacy");
      continue;
    }
    if (entry.project_id !== row.item_project_id) {
      codes.push("mapping_project_mismatch");
      continue;
    }
    if (entry.action === "bind" && !bindingCanAcceptMapping(row, entry)) {
      codes.push("mapping_binding_conflict");
      continue;
    }
    bindingPlan.push({ row, entry, decision_sha256: decisionHash(mapping, entry) });
  }

  for (const row of bindings) {
    if (isCompleteBinding(row)) {
      counts.complete_bindings += 1;
      continue;
    }
    counts.legacy_bindings += 1;
    if (!byItem.has(row.item_id)) counts.unmapped_legacy_bindings += 1;
  }
  if (counts.unmapped_legacy_bindings) codes.push("legacy_binding_unmapped");

  return {
    preflight: publicPreflight(codes.length ? "blocked" : "ready", counts, codes),
    messagePlan,
    bindingPlan,
  };
}

async function inspectInputs({ dbPath, payloadRoot, mapping }) {
  const validatedMapping = validateLegacyCodexOwnerMapping(mapping);
  const databaseIdentity = await pinDatabaseFile(dbPath);
  const payloadRootIdentity = await pinPayloadRoot(payloadRoot);
  let db;
  try {
    db = openDatabase(databaseIdentity.actual, { readOnly: true });
    const inspection = inspectDatabase(db, validatedMapping);
    return { ...inspection, validatedMapping, databaseIdentity, payloadRootIdentity };
  } finally {
    try { db?.close(); } catch { /* never surface path-bearing SQLite close errors */ }
  }
}

function sameLegacyMessage(left, right) {
  return (
    left.id === right.id
    && left.item_id === right.item_id
    && left.role === right.role
    && left.text === right.text
    && (left.payload_ref === null || left.payload_ref === "")
    && left.payload_byte_length === null
    && left.payload_sha256 === null
  );
}

function rollbackQuietly(db) {
  try { db.exec("ROLLBACK"); } catch { /* do not surface implementation details */ }
}

async function migrateMessages({ db, rows, payloadStore, appliedCounts }) {
  for (const planned of rows) {
    const before = db.prepare(
      `SELECT id,item_id,role,text,payload_ref,payload_byte_length,payload_sha256
         FROM codex_thread_message WHERE id=?`,
    ).get(planned.id);
    if (!before || !sameLegacyMessage(before, planned)) fail("message_changed_after_preflight");

    let metadata;
    try {
      metadata = await payloadStore.writeMessagePayload({
        itemId: before.item_id,
        role: before.role,
        text: before.text,
      });
      const resolvedPayload = await payloadStore.resolveAuthorizedMessagePayload({
        itemId: before.item_id,
        payloadRef: metadata.payload_ref,
      });
      if (
        !resolvedPayload.ok
        || resolvedPayload.payload.text !== before.text
        || resolvedPayload.payload.role !== before.role
        || resolvedPayload.payload.byte_length !== metadata.byte_length
        || resolvedPayload.payload.sha256 !== metadata.sha256
      ) {
        fail("payload_verification_failed");
      }
    } catch (error) {
      if (error instanceof MigrationError) throw error;
      fail("payload_write_failed");
    }

    try {
      const current = db.prepare(
        `SELECT id,item_id,role,text,payload_ref,payload_byte_length,payload_sha256
           FROM codex_thread_message WHERE id=?`,
      ).get(before.id);
      if (!current || !sameLegacyMessage(current, before)) fail("message_changed_before_update");
      const updated = db.prepare(
        `UPDATE codex_thread_message
            SET text=?,payload_ref=?,payload_byte_length=?,payload_sha256=?,data_label='meta'
          WHERE id=? AND text=? AND (payload_ref IS NULL OR payload_ref='')
            AND payload_byte_length IS NULL AND payload_sha256 IS NULL`,
      ).run(
        metadata.payload_ref,
        metadata.payload_ref,
        metadata.byte_length,
        metadata.sha256,
        before.id,
        before.text,
      );
      if (updated.changes !== 1) fail("message_changed_before_update");
      appliedCounts.migrated_messages += 1;
    } catch (error) {
      if (error instanceof MigrationError) throw error;
      fail("message_database_update_failed");
    }
  }
}

function applyBindingPlan({ db, validatedMapping, appliedCounts, now }) {
  const { mapping } = validatedMapping;
  try {
    const currentInspection = inspectDatabase(db, validatedMapping);
    if (currentInspection.preflight.status !== "ready" || currentInspection.messagePlan.length !== 0) {
      fail("binding_changed_after_preflight");
    }

    for (const planned of currentInspection.bindingPlan) {
      const { entry } = planned;
      if (entry.action === "bind") {
        const changed = db.prepare(
          `UPDATE codex_thread_binding
              SET project_id=?,workspace_id=?,workspace_revision=?,workspace_root_fingerprint=?
            WHERE item_id=?`,
        ).run(
          entry.project_id,
          entry.workspace_id,
          entry.workspace_revision,
          entry.workspace_root_fingerprint,
          entry.item_id,
        );
        if (changed.changes !== 1) fail("binding_changed_after_preflight");
        appliedCounts.bound_bindings += 1;
      } else {
        const changed = db.prepare("DELETE FROM codex_thread_binding WHERE item_id=?").run(entry.item_id);
        if (changed.changes !== 1) fail("binding_changed_after_preflight");
        appliedCounts.retired_bindings += 1;
      }
      db.prepare(
        `INSERT INTO ${RECEIPT_TABLE}(
           entity_kind,entity_key,action,project_id,owner_ref,approved_at,applied_at,reason_code,decision_sha256,data_label
         ) VALUES('binding',?,?,?,?,?,?,?,?,'meta')`,
      ).run(
        entry.item_id,
        entry.action,
        entry.project_id,
        mapping.owner_ref,
        mapping.approved_at,
        now,
        entry.action === "retire" ? entry.reason_code : null,
        planned.decision_sha256,
      );
    }
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    fail("binding_database_update_failed");
  }
}

export async function preflightLegacyCodexMigration(options = {}) {
  const mode = "dry_run";
  try {
    const inspection = await inspectInputs(options);
    return report({
      mode,
      status: inspection.preflight.status,
      preflight: inspection.preflight,
      codes: inspection.preflight.codes,
    });
  } catch (error) {
    return safeFailure(mode, error instanceof MigrationError ? error.code : "preflight_failed");
  }
}

export async function runLegacyCodexMigration({
  dbPath,
  payloadRoot,
  mapping,
  apply = false,
  now = () => new Date().toISOString(),
  payloadStoreFactory = createCodexMessagePayloadStore,
} = {}) {
  if (!apply) return preflightLegacyCodexMigration({ dbPath, payloadRoot, mapping });
  const mode = "apply";
  let inspection;
  const appliedCounts = emptyAppliedCounts();
  try {
    inspection = await inspectInputs({ dbPath, payloadRoot, mapping });
    if (inspection.preflight.status !== "ready") {
      return report({
        mode,
        status: "blocked",
        preflight: inspection.preflight,
        appliedCounts,
        codes: inspection.preflight.codes,
      });
    }
    if (typeof now !== "function" || typeof payloadStoreFactory !== "function") fail("migration_dependency_invalid");
    const appliedAt = now();
    if (typeof appliedAt !== "string" || !ISO_INSTANT_RE.test(appliedAt) || !Number.isFinite(Date.parse(appliedAt))) {
      fail("migration_clock_invalid");
    }
    await validatePinnedDatabase(inspection.databaseIdentity);
    await validatePinnedPayloadRoot(inspection.payloadRootIdentity);

    let db;
    try {
      db = openDatabase(inspection.databaseIdentity.actual, { readOnly: false });
      await validatePinnedDatabase(inspection.databaseIdentity);
      validateSchema(db);
      const payloadStore = await payloadStoreFactory({ root: inspection.payloadRootIdentity.actual });
      try {
        db.exec("BEGIN IMMEDIATE");
        db.exec(RECEIPT_DDL);
        await migrateMessages({ db, rows: inspection.messagePlan, payloadStore, appliedCounts });
        applyBindingPlan({
          db,
          validatedMapping: inspection.validatedMapping,
          appliedCounts,
          now: appliedAt,
        });
        db.exec("COMMIT");
      } catch (error) {
        rollbackQuietly(db);
        appliedCounts.migrated_messages = 0;
        appliedCounts.bound_bindings = 0;
        appliedCounts.retired_bindings = 0;
        throw error;
      }
    } finally {
      try { db?.close(); } catch { /* never surface path-bearing SQLite close errors */ }
    }

    const verificationInspection = await inspectInputs({ dbPath, payloadRoot, mapping });
    const verification = publicPreflight(
      verificationInspection.preflight.status === "ready" ? "passed" : "failed",
      verificationInspection.preflight.counts,
      verificationInspection.preflight.codes,
    );
    if (verification.status !== "passed" || verification.counts.legacy_messages !== 0 || verification.counts.legacy_bindings !== 0) {
      fail("post_apply_verification_failed");
    }
    return report({
      mode,
      status: "applied",
      preflight: inspection.preflight,
      appliedCounts,
      verification,
    });
  } catch (error) {
    return safeFailure(
      mode,
      error instanceof MigrationError ? error.code : "migration_failed",
      inspection?.preflight,
      appliedCounts,
    );
  }
}

export function parseLegacyCodexMigrationArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--db", "--payload-root", "--mapping"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("cli_argument_invalid");
      if (arg === "--db") options.dbPath = resolve(value);
      else if (arg === "--payload-root") options.payloadRoot = resolve(value);
      else options.mappingPath = resolve(value);
      index += 1;
    } else {
      fail("cli_argument_invalid");
    }
  }
  if (!options.help && (!options.dbPath || !options.payloadRoot || !options.mappingPath)) fail("cli_argument_invalid");
  return options;
}

async function readMappingFile(mappingPath) {
  let handle;
  try {
    const before = await lstat(mappingPath);
    if (!before.isFile() || before.isSymbolicLink() || Number(before.nlink) !== 1 || before.size < 2 || before.size > MAX_MAPPING_BYTES) {
      fail("mapping_file_invalid");
    }
    handle = await open(mappingPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (
      !opened.isFile()
      || Number(opened.nlink) !== 1
      || opened.size !== before.size
      || (Number.isSafeInteger(before.dev) && Number.isSafeInteger(opened.dev) && before.dev !== opened.dev)
      || (Number.isSafeInteger(before.ino) && Number.isSafeInteger(opened.ino) && before.ino !== opened.ino)
    ) {
      fail("mapping_file_changed");
    }
    const bytes = await handle.readFile();
    const after = await lstat(mappingPath);
    if (
      bytes.length !== opened.size
      || bytes.length > MAX_MAPPING_BYTES
      || Number(after.nlink) !== 1
      || after.size !== opened.size
      || (Number.isSafeInteger(opened.dev) && Number.isSafeInteger(after.dev) && opened.dev !== after.dev)
      || (Number.isSafeInteger(opened.ino) && Number.isSafeInteger(after.ino) && opened.ino !== after.ino)
    ) {
      fail("mapping_file_changed");
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    fail("mapping_file_invalid");
  } finally {
    try { await handle?.close(); } catch { /* never surface path-bearing filesystem errors */ }
  }
}

function printHelp() {
  process.stdout.write(
    "Usage: node tools/legacy_codex_migration.mjs --db <sqlite-file> --payload-root <owner-directory> --mapping <owner-mapping.json> [--apply]\n"
    + "Default mode is a read-only preflight. --apply performs only the exact approved mapping.\n",
  );
}

async function main(argv) {
  let options;
  try {
    options = parseLegacyCodexMigrationArgs(argv);
    if (options.help) {
      printHelp();
      return 0;
    }
    const mapping = await readMappingFile(options.mappingPath);
    const result = await runLegacyCodexMigration({
      dbPath: options.dbPath,
      payloadRoot: options.payloadRoot,
      mapping,
      apply: options.apply,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === "ready" || result.status === "applied") return 0;
    return result.status === "blocked" ? 2 : 1;
  } catch (error) {
    const result = safeFailure("dry_run", error instanceof MigrationError ? error.code : "cli_failed");
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
