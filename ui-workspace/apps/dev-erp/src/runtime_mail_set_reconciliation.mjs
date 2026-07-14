import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const MAIL_SET_RECONCILIATION_SCHEMA = "dev_erp.mail_set_reconciliation.v1";
export const MAIL_SET_AUTHORITY_MODE = "runtime_db_authoritative_no_real_meta";

const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function inspectRegularFile(path, { maxBytes = 64 * 1024 * 1024 } = {}) {
  const lexical = resolve(path);
  const entry = lstatSync(lexical);
  const real = resolve(realpathSync(lexical));
  const same = process.platform === "win32"
    ? lexical.toLowerCase() === real.toLowerCase()
    : lexical === real;
  if (!entry.isFile() || entry.isSymbolicLink() || !same || entry.size < 1 || entry.size > maxBytes) {
    throw new Error("unsafe_regular_file");
  }
  if (Number.isSafeInteger(entry.nlink) && entry.nlink !== 1) throw new Error("unsafe_hardlink_count");
  return { path: lexical, bytes: entry.size };
}

function exactStringKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeMailIds(rows) {
  const ids = rows.map((row) => String(row?.id ?? "")).filter(Boolean).sort();
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_mail_id");
  return ids;
}

export function mailIdSetSha256(ids) {
  return sha256Bytes(Buffer.from(`${ids.join("\n")}\n`, "utf8"));
}

function inspectMeta(metaPath) {
  const file = inspectRegularFile(metaPath);
  const bytes = readFileSync(file.path);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("real_meta_json_invalid"); }
  if (!Array.isArray(value?.mail)) throw new Error("real_meta_mail_missing");
  const ids = normalizeMailIds(value.mail);
  return {
    path: file.path,
    bytes: file.bytes,
    sha256: sha256Bytes(bytes),
    ids,
    id_set_sha256: mailIdSetSha256(ids),
  };
}

function inspectDb(dbPath) {
  const file = inspectRegularFile(dbPath, { maxBytes: 4 * 1024 * 1024 * 1024 });
  const db = new DatabaseSync(file.path, { readOnly: true });
  try {
    const table = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='core_mail'").get()?.n ?? 0;
    if (table !== 1) throw new Error("core_mail_missing");
    const ids = normalizeMailIds(db.prepare("SELECT id FROM core_mail ORDER BY id").all());
    const schema = String(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value ?? "");
    if (!schema) throw new Error("schema_version_missing");
    return { path: file.path, schema, ids, id_set_sha256: mailIdSetSha256(ids) };
  } finally {
    db.close();
  }
}

function driftCounts(metaIds, dbIds) {
  const meta = new Set(metaIds);
  const db = new Set(dbIds);
  return {
    meta_only_count: metaIds.filter((id) => !db.has(id)).length,
    db_only_count: dbIds.filter((id) => !meta.has(id)).length,
  };
}

function writeJsonAtomic(path, value) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try {
    writeFileSync(temp, text, { encoding: "utf8", flag: "wx" });
    const fd = openSync(temp, "r+");
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, target);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export function planMailSetReconciliation({ metaPath, dbPath, sourceCommit }) {
  const commit = String(sourceCommit || "").trim().toLowerCase();
  if (!COMMIT_RE.test(commit)) throw new Error("source_commit_invalid");
  const meta = inspectMeta(metaPath);
  const db = inspectDb(dbPath);
  const drift = driftCounts(meta.ids, db.ids);
  return {
    sourceCommit: commit,
    meta,
    db,
    drift,
    public: {
      source_commit: commit,
      source_real_meta: {
        bytes: meta.bytes,
        sha256: meta.sha256,
        mail_id_count: meta.ids.length,
        mail_id_set_sha256: meta.id_set_sha256,
      },
      runtime_db: {
        schema_version: db.schema,
        mail_id_count: db.ids.length,
        mail_id_set_sha256: db.id_set_sha256,
      },
      drift,
    },
  };
}

export function createMailSetReconciliation({
  metaPath,
  dbPath,
  sourceCommit,
  backupRoot,
  receiptPath,
  apply = false,
  now = new Date(),
} = {}) {
  const plan = planMailSetReconciliation({ metaPath, dbPath, sourceCommit });
  if (!apply) return { applied: false, ...plan.public };
  if (!isAbsolute(String(backupRoot || ""))) throw new Error("backup_root_absolute_required");
  if (!isAbsolute(String(receiptPath || ""))) throw new Error("receipt_path_absolute_required");

  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const runId = `${stamp}_${randomBytes(6).toString("hex")}`;
  const resolvedBackupRoot = resolve(backupRoot);
  mkdirSync(resolvedBackupRoot, { recursive: true });
  const runDir = join(resolvedBackupRoot, runId);
  mkdirSync(runDir, { recursive: false });
  const backupPath = join(runDir, "real_meta.json");
  copyFileSync(plan.meta.path, backupPath);
  const backup = inspectRegularFile(backupPath);
  const backupSha256 = sha256Bytes(readFileSync(backup.path));
  if (backup.bytes !== plan.meta.bytes || backupSha256 !== plan.meta.sha256) throw new Error("backup_verification_failed");

  const receipt = {
    schema: MAIL_SET_RECONCILIATION_SCHEMA,
    created_at: now.toISOString(),
    authority_mode: MAIL_SET_AUTHORITY_MODE,
    source_commit: plan.sourceCommit,
    source_real_meta: plan.public.source_real_meta,
    runtime_db: plan.public.runtime_db,
    drift: plan.drift,
    backup: {
      path: backup.path,
      bytes: backup.bytes,
      sha256: backupSha256,
    },
  };
  writeJsonAtomic(receiptPath, receipt);
  const verified = verifyMailSetReconciliation({ receiptPath, metaPath, dbPath, expectedCommit: plan.sourceCommit });
  if (!verified.ok) throw new Error(`receipt_self_verification_failed:${verified.error}`);
  return { applied: true, receipt_path: resolve(receiptPath), backup_path: backup.path, ...plan.public };
}

export function verifyMailSetReconciliation({ receiptPath, metaPath, dbPath, expectedCommit } = {}) {
  try {
    const commit = String(expectedCommit || "").trim().toLowerCase();
    if (!COMMIT_RE.test(commit)) throw new Error("expected_commit_invalid");
    const receiptFile = inspectRegularFile(receiptPath, { maxBytes: 64 * 1024 });
    const receipt = JSON.parse(readFileSync(receiptFile.path, "utf8"));
    const topKeys = ["authority_mode", "backup", "created_at", "drift", "runtime_db", "schema", "source_commit", "source_real_meta"];
    if (!exactStringKeys(receipt, topKeys)) throw new Error("receipt_shape_invalid");
    if (!exactStringKeys(receipt.source_real_meta, ["bytes", "mail_id_count", "mail_id_set_sha256", "sha256"])) throw new Error("source_shape_invalid");
    if (!exactStringKeys(receipt.runtime_db, ["mail_id_count", "mail_id_set_sha256", "schema_version"])) throw new Error("db_shape_invalid");
    if (!exactStringKeys(receipt.drift, ["db_only_count", "meta_only_count"])) throw new Error("drift_shape_invalid");
    if (!exactStringKeys(receipt.backup, ["bytes", "path", "sha256"])) throw new Error("backup_shape_invalid");
    if (receipt.schema !== MAIL_SET_RECONCILIATION_SCHEMA || receipt.authority_mode !== MAIL_SET_AUTHORITY_MODE) throw new Error("receipt_contract_invalid");
    if (receipt.source_commit !== commit) throw new Error("source_commit_mismatch");
    if (!Number.isFinite(Date.parse(receipt.created_at))) throw new Error("created_at_invalid");

    const meta = inspectMeta(metaPath);
    const db = inspectDb(dbPath);
    const drift = driftCounts(meta.ids, db.ids);
    const backup = inspectRegularFile(receipt.backup.path);
    const backupSha256 = sha256Bytes(readFileSync(backup.path));
    if (!SHA256_RE.test(receipt.source_real_meta.sha256) || !SHA256_RE.test(receipt.source_real_meta.mail_id_set_sha256)
        || !SHA256_RE.test(receipt.runtime_db.mail_id_set_sha256) || !SHA256_RE.test(receipt.backup.sha256)) {
      throw new Error("receipt_hash_invalid");
    }
    if (receipt.source_real_meta.bytes !== meta.bytes || receipt.source_real_meta.sha256 !== meta.sha256
        || receipt.source_real_meta.mail_id_count !== meta.ids.length || receipt.source_real_meta.mail_id_set_sha256 !== meta.id_set_sha256) {
      throw new Error("source_real_meta_mismatch");
    }
    if (receipt.runtime_db.schema_version !== db.schema || receipt.runtime_db.mail_id_count !== db.ids.length
        || receipt.runtime_db.mail_id_set_sha256 !== db.id_set_sha256) throw new Error("runtime_db_mismatch");
    if (receipt.drift.meta_only_count !== drift.meta_only_count || receipt.drift.db_only_count !== drift.db_only_count) {
      throw new Error("drift_count_mismatch");
    }
    if (receipt.backup.bytes !== backup.bytes || receipt.backup.sha256 !== backupSha256
        || backup.bytes !== meta.bytes || backupSha256 !== meta.sha256) throw new Error("backup_mismatch");
    return {
      ok: true,
      schema: receipt.schema,
      authority_mode: receipt.authority_mode,
      source_commit_match: true,
      backup_verified: true,
      source_mail_count: meta.ids.length,
      runtime_mail_count: db.ids.length,
      ...drift,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 160) };
  }
}
