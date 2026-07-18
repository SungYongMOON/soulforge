#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { collectWorkspaceProjectNames } from "./runtime_corrections.mjs";
import { openStore, SCHEMA_VERSION, Store } from "../src/store.mjs";
import {
  buildSnapshot,
  compareSnapshotFreshness,
  defaultSnapshotPath,
  validateSnapshot,
} from "../../../../guild_hall/snapshot/producer.mjs";
import {
  CODEX_WORKSPACE_REGISTRY_SCHEMA,
  parseWorkspaceRegistry,
} from "../src/codex_workspace_registry.mjs";
import { CODEX_TASK_BRIDGE_VERSION } from "../src/codex_bridge.mjs";
import { CODEX_DEDICATED_WORKER_VERSION } from "../src/codex_dedicated_worker.mjs";
import { codexWorkerReleaseBindingRevision } from "../src/codex_dedicated_worker_client.mjs";
import { inspectCodexPayloadOwner } from "../src/codex_payload_owner.mjs";
import { verifyMailSetReconciliation } from "../src/runtime_mail_set_reconciliation.mjs";
import { CODEX_PAYLOAD_BACKUP_SCHEMA } from "./codex_payload_backup.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(APP, "..", "..", "..");
const SCHEMA = "dev_erp.runtime_release_audit.v1";
const RELEASE_SKINS = [
  "main.png",
  ...Array.from({ length: 11 }, (_, i) => `dungeons/_p${i + 1}.png`),
];

const PROJECT_HEALTHS = ["ok", "watch", "risk", "stopped"];
const PROJECT_CLASSES = ["active", "inbox", "internal", "archive"];
const DATA_LABELS = ["real", "synthetic", "meta"];
const CODEX_WORKSPACE_REGISTRY_FILE = "codex-workspaces.runtime.json";
const CODEX_WORKSPACE_PROBE_TIMEOUT_MS = 5000;
const CODEX_THREAD_REF_RE = /^dwr2\.[A-Za-z0-9][A-Za-z0-9_-]{0,31}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,10923}\.[A-Za-z0-9_-]{22}$/;
const CODEX_WORKSPACE_PROBE_CONCURRENCY = 8;
const CODEX_WORKSPACE_PROBE_SCRIPT = "const{statSync}=require('node:fs');let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{s+=c;if(s.length>8192)process.exit(3)});process.stdin.on('end',()=>{try{const p=JSON.parse(s);process.exit(p&&typeof p.root==='string'&&statSync(p.root).isDirectory()?0:2)}catch{process.exit(2)}})";
const CODEX_PAYLOAD_BACKUP_NAMESPACE = "03_codex_payload_backups";
const CODEX_PAYLOAD_RESTORE_NAMESPACE = "04_codex_payload_restore_tests";
const CODEX_PAYLOAD_GENERATION_RE = /^cpb_[A-Za-z0-9_-]{8,96}$/;
const CODEX_PAYLOAD_SHA256_RE = /^[a-f0-9]{64}$/;
const CODEX_PAYLOAD_MANIFEST_MAX_BYTES = 64 * 1024 * 1024;
const CODEX_PAYLOAD_MAX_RECORDS = 100_000;
const CODEX_PAYLOAD_MESSAGE_FIELDS = new Set([
  "item_id", "payload_ref", "role", "byte_length", "sha256", "envelope_bytes", "envelope_sha256",
]);
const CODEX_PAYLOAD_MESSAGE_ROLES = new Set(["user", "assistant", "error", "system"]);
const CODEX_WORKER_IDENTITY_SHA256_RE = /^[a-f0-9]{64}$/;
export const CODEX_SHARE_BOUNDARY_RECEIPT_SCHEMA = "dev_erp.codex_share_boundary_receipt.v2";
const CODEX_SHARE_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CODEX_SHARE_RECEIPT_FIELDS = new Set([
  "schema", "registry_revision", "trust_domain_id", "worker_identity_sha256",
  "worker_release", "bridge_release", "permission_probe_source", "verified_at",
  "mutation_control", "server_share_target_nonoverlap", "ntfs_ads_clear", "workspaces",
]);
const CODEX_SHARE_RECEIPT_ROW_FIELDS = new Set([
  "workspace_id", "root_kind", "read_probe", "approved_write_probe",
  "sibling_read_deny", "parent_enumeration_deny", "outside_read_deny",
  "outside_write_deny", "junction_deny", "hardlink_deny",
]);

function cleanObject(value) {
  const out = {};
  for (const [k, v] of Object.entries(value ?? {})) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function add(result, level, code, message, details = {}) {
  const issue = cleanObject({ level, code, message, ...details });
  if (level === "blocker") result.blockers.push(issue);
  else if (level === "warning") result.warnings.push(issue);
  else result.info.push(issue);
  return issue;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function exactFields(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every((key) => fields.has(key));
}

export function validateCodexShareBoundaryReceipt(receipt, {
  registryRevision,
  trustDomainId,
  expectedWorkerIdentityHash,
  uncRows = [],
  now = Date.now(),
} = {}) {
  const fail = (error) => ({ ok: false, error });
  if (!exactFields(receipt, CODEX_SHARE_RECEIPT_FIELDS)
      || receipt.schema !== CODEX_SHARE_BOUNDARY_RECEIPT_SCHEMA) return fail("receipt_schema_invalid");
  if (!/^[a-f0-9]{64}$/.test(String(registryRevision || ""))
      || receipt.registry_revision !== registryRevision
      || receipt.trust_domain_id !== trustDomainId
      || !CODEX_WORKER_IDENTITY_SHA256_RE.test(String(expectedWorkerIdentityHash || ""))
      || receipt.worker_identity_sha256 !== expectedWorkerIdentityHash
      || receipt.worker_release !== CODEX_DEDICATED_WORKER_VERSION.release
      || receipt.bridge_release !== CODEX_TASK_BRIDGE_VERSION.release
      || receipt.permission_probe_source !== "codex_sandbox_turn_projection_probe_v4") {
    return fail("receipt_binding_mismatch");
  }
  const verifiedAt = Date.parse(String(receipt.verified_at || ""));
  if (!Number.isFinite(verifiedAt) || verifiedAt > now + 5 * 60 * 1000
      || now - verifiedAt > CODEX_SHARE_RECEIPT_MAX_AGE_MS) return fail("receipt_stale");
  if (!new Set(["acl_turn_lock", "immutable_projection"]).has(receipt.mutation_control)
      || receipt.server_share_target_nonoverlap !== true
      || receipt.ntfs_ads_clear !== true
      || !Array.isArray(receipt.workspaces)
      || receipt.workspaces.length !== uncRows.length) return fail("receipt_boundary_unproven");
  const expected = new Map(uncRows.map((row) => [row.workspace_id, row]));
  const seen = new Set();
  for (const row of receipt.workspaces) {
    if (!exactFields(row, CODEX_SHARE_RECEIPT_ROW_FIELDS)
        || seen.has(row.workspace_id)
        || !expected.has(row.workspace_id)
        || row.root_kind !== "unc") return fail("receipt_workspace_mismatch");
    seen.add(row.workspace_id);
    const configured = expected.get(row.workspace_id);
    const writeExpected = Array.isArray(configured.allowed_write_prefixes)
      && configured.allowed_write_prefixes.length > 0;
    if (row.read_probe !== true
        || row.approved_write_probe !== (writeExpected ? "pass" : "not_applicable")
        || row.sibling_read_deny !== true
        || row.parent_enumeration_deny !== true
        || row.outside_read_deny !== true
        || row.outside_write_deny !== true
        || row.junction_deny !== true
        || row.hardlink_deny !== true) return fail("receipt_workspace_unproven");
  }
  return seen.size === expected.size ? { ok: true, workspace_count: seen.size } : fail("receipt_workspace_mismatch");
}

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function safeStat(path) {
  try {
    return existsSync(path) ? statSync(path) : null;
  } catch {
    return null;
  }
}

function safeExec(command, args, { cwd } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err).slice(0, 300) };
  }
}

function safeCount(db, sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    return Number(row?.n ?? row?.c ?? 0);
  } catch {
    return null;
  }
}

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table);
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().some((row) => row.name === column);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableIds(db, table, column = "id") {
  if (!tableExists(db, table)) return [];
  return db.prepare(`SELECT ${quoteIdent(column)} AS id FROM ${quoteIdent(table)} ORDER BY ${quoteIdent(column)}`).all()
    .map((row) => String(row.id));
}

function setDiff(left, right) {
  const b = new Set(right);
  return left.filter((x) => !b.has(x));
}

function normalizeComparable(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function codeOnlyTitle(title, id) {
  const v = String(title ?? "").trim();
  return !v || v === id;
}

function collectShape(db) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((row) => row.name);
  const columns = {};
  for (const table of tables) {
    columns[table] = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((row) => row.name);
  }
  const indexes = db.prepare(
    "SELECT name,tbl_name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name"
  ).all().map((row) => ({ name: row.name, table: row.tbl_name }));
  return { tables, columns, indexes };
}

function expectedShape() {
  const store = openStore(":memory:");
  try {
    return collectShape(store.db);
  } finally {
    store.db.close();
  }
}

function defaultNasRoot() {
  const candidate = process.env.DEV_ERP_NAS_ROOT;
  return candidate && existsSync(candidate) ? candidate : null;
}

function isExactCodexWorkerLoopbackUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { return false; }
  return url.protocol === "http:"
    && url.hostname === "127.0.0.1"
    && !!url.port
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
    && (url.pathname === "/" || url.pathname === "");
}

function checkCodexWorkerBoundaryConfiguration(result, {
  requireLive = false,
  coreOnlyRelease = false,
  codexWorkerUrl = null,
  codexWorkerExpectedIdentityHash = null,
  codexWorkerExpectedRuntimeIdentityHash = null,
  codexWorkerAttestationPublicKeyFile = null,
  codexWorkerExpectedAttestationKeyId = null,
} = {}) {
  const configuredUrl = String(codexWorkerUrl || process.env.DEV_ERP_CODEX_WORKER_URL || "").trim();
  const expectedIdentity = String(
    codexWorkerExpectedIdentityHash
      || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH
      || "",
  ).trim().toLowerCase();
  const urlConfigured = configuredUrl.length > 0;
  const loopbackUrlValid = urlConfigured && isExactCodexWorkerLoopbackUrl(configuredUrl);
  const expectedIdentityConfigured = CODEX_WORKER_IDENTITY_SHA256_RE.test(expectedIdentity);
  const expectedRuntimeIdentity = String(
    codexWorkerExpectedRuntimeIdentityHash
      || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256
      || "",
  ).trim().toLowerCase();
  const expectedRuntimeIdentityConfigured = CODEX_WORKER_IDENTITY_SHA256_RE.test(expectedRuntimeIdentity);
  const publicKeyFile = String(
    codexWorkerAttestationPublicKeyFile
      || process.env.DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE
      || "",
  ).trim();
  const expectedAttestationKeyId = String(
    codexWorkerExpectedAttestationKeyId
      || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID
      || "",
  ).trim().toLowerCase();
  const expectedAttestationKeyConfigured = CODEX_WORKER_IDENTITY_SHA256_RE.test(expectedAttestationKeyId);
  let attestationPublicKeyReady = false;
  let attestationPublicKeyMatch = false;
  try {
    if (!isAbsolute(publicKeyFile)) throw new Error("not_absolute");
    const lexical = resolve(publicKeyFile);
    const entry = lstatSync(lexical);
    const real = realpathSync(lexical);
    const same = process.platform === "win32"
      ? lexical.toLowerCase() === resolve(real).toLowerCase()
      : lexical === resolve(real);
    if (!entry.isFile() || entry.isSymbolicLink() || !same || entry.size < 1 || entry.size > 16 * 1024
        || (Number.isSafeInteger(entry.nlink) && entry.nlink !== 1)) throw new Error("unsafe_key_file");
    const key = createPublicKey(readFileSync(real));
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
    const keyId = createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
    attestationPublicKeyReady = true;
    attestationPublicKeyMatch = expectedAttestationKeyConfigured && keyId === expectedAttestationKeyId;
  } catch {}

  result.checks.codex_worker_boundary = {
    checked: true,
    release_mode: coreOnlyRelease ? "core_only" : "dedicated_worker",
    worker_url_configured: urlConfigured,
    loopback_url_valid: loopbackUrlValid,
    expected_identity_sha256_configured: expectedIdentityConfigured,
    expected_runtime_identity_sha256_configured: expectedRuntimeIdentityConfigured,
    attestation_public_key_ready: attestationPublicKeyReady,
    expected_attestation_key_sha256_configured: expectedAttestationKeyConfigured,
    attestation_public_key_match: attestationPublicKeyMatch,
    expected_release: CODEX_DEDICATED_WORKER_VERSION.release,
  };

  if (coreOnlyRelease) {
    const configured = urlConfigured || expectedIdentityConfigured || expectedRuntimeIdentityConfigured
      || publicKeyFile.length > 0 || expectedAttestationKeyConfigured;
    result.checks.codex_worker_boundary.worker_disabled_configuration = !configured;
    if (configured) {
      add(result, "blocker", "core_only_worker_configuration_present", "Core-only release requires every dedicated-worker endpoint, identity, and attestation binding to remain unconfigured");
    }
    return;
  }

  if (!urlConfigured) {
    if (requireLive) add(result, "blocker", "codex_worker_url_missing", "Dedicated Codex worker URL is not configured");
  } else if (!loopbackUrlValid) {
    add(result, requireLive ? "blocker" : "warning", "codex_worker_url_not_loopback", "Dedicated Codex worker URL must be an exact http://127.0.0.1:<port> endpoint");
  }
  if (!expectedIdentityConfigured && requireLive) {
    add(result, "blocker", "codex_worker_expected_identity_missing", "A valid expected worker identity SHA-256 is required for live release attestation");
  }
  if (!expectedRuntimeIdentityConfigured && requireLive) {
    add(result, "blocker", "codex_worker_expected_runtime_identity_missing", "An owner-approved Codex runtime identity SHA-256 is required for live release attestation");
  }
  if (!attestationPublicKeyReady && requireLive) {
    add(result, "blocker", "codex_worker_attestation_public_key_unready", "A safe Ed25519 worker attestation public key file is required for live release attestation");
  }
  if (!expectedAttestationKeyConfigured && requireLive) {
    add(result, "blocker", "codex_worker_expected_attestation_key_missing", "The approved worker attestation public-key SHA-256 is required for live release attestation");
  } else if (attestationPublicKeyReady && !attestationPublicKeyMatch && requireLive) {
    add(result, "blocker", "codex_worker_attestation_public_key_mismatch", "The configured worker attestation public key does not match the approved SHA-256");
  }
}

export function resolveAuditPaths(options = {}) {
  const sourceRoot = resolve(options.sourceRoot ?? options.root ?? REPO);
  const runtimeRoot = resolve(options.runtimeRoot ?? sourceRoot);
  const appRoot = resolve(options.appRoot ?? join(runtimeRoot, "ui-workspace", "apps", "dev-erp"));
  const dbPath = resolve(options.dbPath ?? join(appRoot, "data", "dev-erp.db"));
  const metaPath = resolve(options.metaPath ?? join(appRoot, "data", "real_meta.json"));
  const mailSetReconciliationPath = resolve(
    options.mailSetReconciliationPath ?? join(dirname(metaPath), "real_meta.mail-set-reconciliation.json"),
  );
  const workspacesDir = resolve(options.workspacesDir ?? join(sourceRoot, "_workspaces"));
  const snapshotPath = resolve(options.snapshotPath ?? defaultSnapshotPath(sourceRoot));
  const nasRoot = options.nasRoot === false
    ? null
    : (options.nasRoot ? resolve(options.nasRoot) : defaultNasRoot());
  const skinRoots = (options.skinRoots?.length ? options.skinRoots : [
    join(runtimeRoot, "_workspaces", "system", "dev-erp", "skins"),
    join(appRoot, "static", "skins"),
  ]).map((p) => resolve(p));
  return { sourceRoot, runtimeRoot, appRoot, dbPath, metaPath, mailSetReconciliationPath, workspacesDir, snapshotPath, nasRoot, skinRoots };
}

export async function evaluateSnapshotReadiness({ repoRoot = REPO, snapshotPath } = {}) {
  const root = resolve(repoRoot);
  const storedPath = resolve(snapshotPath ?? defaultSnapshotPath(root));
  const base = {
    checked: true,
    snapshot_path: storedPath,
    structural: { status: "not_checked", stored_ok: false, current_ok: false, errors: [] },
    freshness: { status: "not_checked", errors: [], changed_source_ids: [] },
  };

  if (!existsSync(storedPath)) {
    return { ...base, ok: false, code: "snapshot_missing", structural: { ...base.structural, status: "missing" } };
  }

  let storedSnapshot;
  try {
    storedSnapshot = readJson(storedPath);
  } catch {
    return { ...base, ok: false, code: "snapshot_unreadable", structural: { ...base.structural, status: "unreadable" } };
  }

  const storedValidation = validateSnapshot(storedSnapshot);
  if (!storedValidation.ok) {
    return {
      ...base,
      ok: false,
      code: "snapshot_structural_invalid",
      structural: {
        status: "fail",
        stored_ok: false,
        current_ok: false,
        errors: storedValidation.errors.slice(0, 20),
      },
    };
  }

  let currentSnapshot;
  try {
    currentSnapshot = await buildSnapshot({ repoRoot: root });
  } catch (error) {
    return {
      ...base,
      ok: false,
      code: "snapshot_current_build_failed",
      structural: {
        status: "fail",
        stored_ok: true,
        current_ok: false,
        errors: [String(error?.message ?? error).slice(0, 200)],
      },
    };
  }

  const currentValidation = validateSnapshot(currentSnapshot);
  if (!currentValidation.ok) {
    return {
      ...base,
      ok: false,
      code: "snapshot_current_structural_invalid",
      structural: {
        status: "fail",
        stored_ok: true,
        current_ok: false,
        errors: currentValidation.errors.slice(0, 20),
      },
    };
  }

  const freshness = compareSnapshotFreshness(storedSnapshot, currentSnapshot);
  return {
    ...base,
    ok: freshness.ok,
    code: freshness.ok ? null : "snapshot_stale",
    structural: { status: "pass", stored_ok: true, current_ok: true, errors: [] },
    freshness: {
      status: freshness.status,
      errors: freshness.errors.slice(0, 20),
      changed_source_ids: freshness.changed_sources.map((source) => source.id),
    },
  };
}

async function checkOperationalSnapshotReadiness(result, paths) {
  const readiness = await evaluateSnapshotReadiness({
    repoRoot: paths.sourceRoot,
    snapshotPath: paths.snapshotPath,
  });
  result.checks.snapshot_readiness = readiness;
  if (readiness.ok) return;

  const messages = {
    snapshot_missing: "Stored Soulforge snapshot is missing from the operational source root",
    snapshot_unreadable: "Stored Soulforge snapshot is unreadable",
    snapshot_structural_invalid: "Stored Soulforge snapshot failed structural validation",
    snapshot_current_build_failed: "Current Soulforge snapshot could not be built for readiness comparison",
    snapshot_current_structural_invalid: "Current Soulforge snapshot failed structural validation",
    snapshot_stale: "Stored Soulforge snapshot is stale against current source observations",
  };
  add(result, "blocker", readiness.code ?? "snapshot_readiness_failed", messages[readiness.code] ?? "Soulforge snapshot readiness failed", {
    structural_status: readiness.structural.status,
    freshness_status: readiness.freshness.status,
    structural_error_count: readiness.structural.errors.length,
    freshness_error_count: readiness.freshness.errors.length,
    changed_source_ids: readiness.freshness.changed_source_ids,
  });
}

function safeWorkspaceErrorCode(value, fallback = "workspace_registry_invalid") {
  const raw = typeof value === "string" ? value : String(value?.code ?? "");
  return /^[a-z][a-z0-9_:-]{0,79}$/i.test(raw) ? raw : fallback;
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  };
  const workerCount = Math.min(values.length, Math.max(1, limit));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return output;
}

function probeWorkspaceDirectoryInChild({ root }, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    let timer = null;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(available);
    };
    try {
      child = spawn(process.execPath, ["-e", CODEX_WORKSPACE_PROBE_SCRIPT], {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch {
      resolve(false);
      return;
    }
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(false);
    }, timeoutMs);
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
    try { child.stdin.end(JSON.stringify({ root })); }
    catch {
      try { child.kill(); } catch {}
      finish(false);
    }
  });
}

async function checkCodexWorkspaceRegistry(result, paths, {
  required = false,
  probe = undefined,
  probeTimeoutMs = CODEX_WORKSPACE_PROBE_TIMEOUT_MS,
  registryPath: configuredRegistryPath = null,
  trustDomainId = null,
  shareBoundaryReceiptPath = null,
  expectedWorkerIdentityHash = null,
} = {}) {
  const timeoutMs = Math.max(100, Math.min(10_000, Math.floor(Number(probeTimeoutMs) || CODEX_WORKSPACE_PROBE_TIMEOUT_MS)));
  const check = {
    checked: Boolean(required),
    required: Boolean(required),
    configured: false,
    expected_schema: CODEX_WORKSPACE_REGISTRY_SCHEMA,
    configured_workspace_count: 0,
    enabled_workspace_count: 0,
    contract_validation: "not_checked",
    probe: {
      timeout_ms: timeoutMs,
      concurrency: CODEX_WORKSPACE_PROBE_CONCURRENCY,
      available: 0,
      unavailable: 0,
      workspaces: [],
    },
  };
  result.checks.codex_workspace_registry = check;
  if (!required) return;

  const registryPath = resolve(configuredRegistryPath || join(paths.appRoot, "data", CODEX_WORKSPACE_REGISTRY_FILE));
  if (!existsSync(registryPath)) {
    add(result, "blocker", "codex_workspace_registry_missing", "Runtime-local Codex workspace registry is missing");
    return;
  }

  let text;
  try {
    text = readFileSync(registryPath, "utf8");
  } catch {
    add(result, "blocker", "codex_workspace_registry_invalid", "Runtime-local Codex workspace registry is unreadable", {
      error_code: "registry_read_failed",
    });
    return;
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch {
    add(result, "blocker", "codex_workspace_registry_invalid", "Runtime-local Codex workspace registry is invalid", {
      error_code: "invalid_json",
    });
    return;
  }

  let registry;
  try {
    registry = parseWorkspaceRegistry(document);
  } catch (error) {
    add(result, "blocker", "codex_workspace_registry_invalid", "Runtime-local Codex workspace registry failed its v1 contract", {
      error_code: safeWorkspaceErrorCode(error),
    });
    return;
  }

  const publicDescriptor = registry.publicDescriptor();
  check.configured = true;
  check.configured_workspace_count = document.workspaces.length;
  check.enabled_workspace_count = publicDescriptor.workspaces.length;
  const enabledRows = document.workspaces.filter((entry) => entry.enabled !== false);
  const uncRows = enabledRows.filter((entry) => entry.root_kind === "unc");
  check.static_write_policy = {
    workspace_count: enabledRows.filter((entry) => Array.isArray(entry.allowed_write_prefixes)
      && entry.allowed_write_prefixes.length > 0).length,
    allowed_prefix_count: enabledRows.reduce((sum, entry) => (
      sum + (Array.isArray(entry.allowed_write_prefixes) ? entry.allowed_write_prefixes.length : 0)
    ), 0),
  };
  check.mapping_revision = publicDescriptor.mapping_revision;
  check.contract_validation = "pass";
  check.trust_domain_configured = !!String(trustDomainId || "").trim();
  check.trust_domain_match = !trustDomainId || registry.trustDomainId === String(trustDomainId).trim();
  if (required && !trustDomainId) {
    add(result, "blocker", "codex_trust_domain_missing", "A production Codex trust domain must be explicitly configured");
  } else if (!check.trust_domain_match) {
    add(result, "blocker", "codex_trust_domain_mismatch", "The checked workspace registry does not match the configured Codex trust domain");
  }
  if (!publicDescriptor.workspaces.length) {
    add(result, "blocker", "codex_workspace_registry_empty", "Runtime-local Codex workspace registry has no enabled workspaces");
    return;
  }

  check.share_boundary_receipt = {
    required: uncRows.length > 0,
    status: uncRows.length > 0 ? "missing" : "not_required",
    workspace_count: 0,
  };
  if (uncRows.length > 0) {
    const configuredReceiptPath = String(shareBoundaryReceiptPath || "").trim();
    if (!configuredReceiptPath) {
      add(result, "blocker", "codex_share_boundary_receipt_missing", "UNC workspaces require a fresh owner-approved metadata-only share boundary receipt");
    } else {
      try {
        if (!isAbsolute(configuredReceiptPath)) throw new Error("receipt_path_invalid");
        const lexical = resolve(configuredReceiptPath);
        const entry = lstatSync(lexical);
        const real = realpathSync(lexical);
        const same = process.platform === "win32"
          ? lexical.toLowerCase() === resolve(real).toLowerCase()
          : lexical === resolve(real);
        if (!entry.isFile() || entry.isSymbolicLink() || !same || entry.size < 1 || entry.size > 64 * 1024
            || (Number.isSafeInteger(entry.nlink) && entry.nlink !== 1)) throw new Error("receipt_file_invalid");
        const receipt = JSON.parse(readFileSync(real, "utf8"));
        const validation = validateCodexShareBoundaryReceipt(receipt, {
          registryRevision: publicDescriptor.mapping_revision,
          trustDomainId: registry.trustDomainId,
          expectedWorkerIdentityHash,
          uncRows,
        });
        if (!validation.ok) throw new Error(validation.error);
        check.share_boundary_receipt = {
          required: true,
          status: "pass",
          workspace_count: validation.workspace_count,
        };
      } catch (error) {
        check.share_boundary_receipt.status = "invalid";
        const knownReceiptErrors = new Set([
          "receipt_path_invalid", "receipt_file_invalid", "receipt_schema_invalid",
          "receipt_binding_mismatch", "receipt_stale", "receipt_boundary_unproven",
          "receipt_workspace_mismatch", "receipt_workspace_unproven",
        ]);
        add(result, "blocker", "codex_share_boundary_receipt_invalid", "UNC share boundary receipt is missing a current registry/worker/ACL/probe binding", {
          error_code: knownReceiptErrors.has(error?.message) ? error.message : "receipt_invalid",
        });
      }
    }
  }

  const probeOptions = {
    timeoutMs,
    probe: typeof probe === "function"
      ? probe
      : (payload) => probeWorkspaceDirectoryInChild(payload, timeoutMs),
  };
  const probes = await mapWithConcurrency(
    publicDescriptor.workspaces,
    CODEX_WORKSPACE_PROBE_CONCURRENCY,
    async (workspace) => {
      const outcome = await registry.probe(workspace.workspace_id, probeOptions);
      return outcome.ok
        ? { workspace_id: workspace.workspace_id, status: "available" }
        : {
            workspace_id: workspace.workspace_id,
            status: "blocked",
            error_code: safeWorkspaceErrorCode(outcome.error, "workspace_unavailable"),
          };
    },
  );
  check.probe.workspaces = probes;
  check.probe.available = probes.filter((entry) => entry.status === "available").length;
  const failures = probes.filter((entry) => entry.status !== "available");
  check.probe.unavailable = failures.length;
  if (failures.length) {
    add(result, "blocker", "codex_workspace_unavailable", "One or more enabled Codex workspaces are unavailable", {
      count: failures.length,
      workspaces: failures,
    });
  }

  if (existsSync(paths.dbPath)) {
    const db = new DatabaseSync(paths.dbPath, { readOnly: true });
    try {
      const projects = tableExists(db, "core_project") ? new Set(tableIds(db, "core_project")) : new Set();
      const activeAccounts = tableExists(db, "core_account")
        ? new Set(db.prepare("SELECT id FROM core_account WHERE status='active'").all().map((row) => String(row.id)))
        : new Set();
      const roles = tableExists(db, "rbac_role") ? new Set(tableIds(db, "rbac_role")) : new Set();
      const accountRoles = tableExists(db, "rbac_account_role")
        ? db.prepare("SELECT account_id,role_id FROM rbac_account_role").all()
        : [];
      const itemProjects = tableExists(db, "core_item")
        ? new Set(db.prepare("SELECT DISTINCT project_id FROM core_item").all().map((row) => String(row.project_id)))
        : new Set();
      const referenceIssues = [];
      for (const row of document.workspaces.filter((entry) => entry.enabled !== false)) {
        const missingProjects = row.allowed_project_ids.filter((id) => !projects.has(String(id)));
        const missingAccounts = (row.allowed_account_ids || []).filter((id) => !activeAccounts.has(String(id)));
        const missingRoles = (row.allowed_roles || []).filter((id) => !roles.has(String(id)));
        const projectHasItem = row.allowed_project_ids.some((id) => itemProjects.has(String(id)));
        const unrestrictedPrincipal = !row.allowed_account_ids && !row.allowed_roles;
        const accountEligible = (row.allowed_account_ids || []).some((id) => activeAccounts.has(String(id)));
        const roleEligible = accountRoles.some((binding) => activeAccounts.has(String(binding.account_id))
          && (row.allowed_roles || []).includes(String(binding.role_id)));
        if (missingProjects.length || missingAccounts.length || missingRoles.length || !projectHasItem
            || (!unrestrictedPrincipal && !accountEligible && !roleEligible)) {
          referenceIssues.push({
            workspace_id: row.workspace_id,
            missing_project_count: missingProjects.length,
            missing_account_count: missingAccounts.length,
            missing_role_count: missingRoles.length,
            project_item_eligible: projectHasItem,
            principal_eligible: unrestrictedPrincipal || accountEligible || roleEligible,
          });
        }
      }
      check.db_reference_validation = referenceIssues.length ? "fail" : "pass";
      if (referenceIssues.length) {
        add(result, "blocker", "codex_workspace_registry_db_mismatch", "Workspace allowlists do not resolve to usable live DB projects, items, or principals", { workspaces: referenceIssues });
      }
      const activeGrantIssues = [];
      if (tableExists(db, "codex_workspace_write_grant")) {
        const now = new Date().toISOString();
        const activeGrants = db.prepare(
          `SELECT id,workspace_id,relative_prefix
           FROM codex_workspace_write_grant
           WHERE approved_at<=? AND expires_at>? AND revoked_at IS NULL`,
        ).all(now, now);
        for (const grant of activeGrants) {
          let decision;
          try { decision = registry.checkWritePrefixes(grant.workspace_id, [grant.relative_prefix]); }
          catch { decision = { ok: false, error: "workspace_write_prefix_invalid" }; }
          if (!decision.ok) {
            activeGrantIssues.push({
              grant_id: String(grant.id),
              workspace_id: String(grant.workspace_id),
              error_code: safeWorkspaceErrorCode(decision.error, "workspace_write_prefix_forbidden"),
            });
          }
        }
        check.active_write_grants = {
          count: activeGrants.length,
          outside_static_policy_count: activeGrantIssues.length,
        };
      }
      if (activeGrantIssues.length) {
        add(result, "blocker", "codex_active_write_grant_outside_static_policy", "One or more active ERP write grants exceed the owner-approved registry write boundary", {
          grants: activeGrantIssues,
        });
      }
    } finally {
      db.close();
    }
  }
}

function checkGit(result, root, id, { skipGit = false, required = false, strict = false, expectedCommit = null } = {}) {
  if (skipGit) return;
  if (!existsSync(join(root, ".git"))) {
    add(result, required || strict ? "blocker" : "warning", `${id}_git_missing`, `${id} is not a git checkout`, { root });
    return;
  }
  const status = safeExec("git", ["status", "--short", "--branch"], { cwd: root });
  if (!status.ok) {
    add(result, required || strict ? "blocker" : "warning", `${id}_git_status_failed`, `${id} git status failed`, { root });
    return;
  }
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  const dirty = lines.filter((line) => !line.startsWith("##"));
  const head = safeExec("git", ["rev-parse", "HEAD"], { cwd: root });
  const divergence = safeExec("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"], { cwd: root });
  result.checks.git[id] = {
    root,
    head: head.ok ? head.stdout.trim() : null,
    status: lines[0] ?? "",
    dirty_count: dirty.length,
    origin_main_divergence: divergence.ok ? divergence.stdout.trim() : null,
  };
  if (!head.ok) {
    add(result, required || strict ? "blocker" : "warning", `${id}_git_head_failed`, `${id} commit could not be verified`);
  }
  if (!divergence.ok) {
    add(result, strict ? "blocker" : "warning", `${id}_git_origin_main_check_failed`, `${id} origin/main divergence could not be verified`);
  }
  if (dirty.length) add(result, required || strict ? "blocker" : "warning", `${id}_git_dirty`, `${id} checkout is dirty`, { root, dirty_count: dirty.length });
  if (divergence.ok && divergence.stdout.trim() !== "0\t0") {
    add(result, strict ? "blocker" : "warning", `${id}_git_not_at_origin_main`, `${id} differs from origin/main`, { divergence: divergence.stdout.trim() });
  }
  const expected = String(expectedCommit || "").trim().toLowerCase();
  if (expected && (!/^[a-f0-9]{40}$/.test(expected) || !head.ok || head.stdout.trim().toLowerCase() !== expected)) {
    add(result, required || strict ? "blocker" : "warning", `${id}_git_expected_commit_mismatch`, `${id} does not match the approved release commit`);
  }
}

function checkDbAndSchema(result, paths) {
  const { dbPath } = paths;
  result.checks.db = { path: dbPath, exists: existsSync(dbPath) };
  if (!existsSync(dbPath)) {
    add(result, "blocker", "db_missing", "Runtime DB file is missing", { dbPath });
    return null;
  }

  const dbStat = safeStat(dbPath);
  const walStat = safeStat(`${dbPath}-wal`);
  result.checks.db.bytes = dbStat?.size ?? null;
  result.checks.db.mtime_ms = dbStat?.mtimeMs ?? null;
  result.checks.db.wal_bytes = walStat?.size ?? 0;
  if (walStat?.size) {
    add(result, "warning", "db_wal_present", "SQLite WAL file exists; backups must use SQLite backup/VACUUM, not raw DB copy", { wal_bytes: walStat.size });
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check ?? null;
    const fkRows = db.prepare("PRAGMA foreign_key_check").all();
    result.checks.db.integrity_check = integrity;
    result.checks.db.foreign_key_violations = fkRows.length;
    if (integrity !== "ok") add(result, "blocker", "db_integrity_failed", "SQLite integrity_check failed", { integrity });
    if (fkRows.length) add(result, "blocker", "db_foreign_key_violations", "SQLite foreign_key_check reports violations", { count: fkRows.length });

    const schemaVersion = tableExists(db, "meta")
      ? db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value
      : null;
    result.checks.db.schema_version = schemaVersion;
    if (schemaVersion !== SCHEMA_VERSION) {
      add(result, "blocker", "db_schema_version_mismatch", "DB schema_version is not the expected dev-ERP schema", { actual: schemaVersion, expected: SCHEMA_VERSION });
    }

    const expected = expectedShape();
    const actual = collectShape(db);
    const missingTables = setDiff(expected.tables, actual.tables);
    const missingColumns = [];
    for (const table of expected.tables) {
      if (!actual.columns[table]) continue;
      for (const column of expected.columns[table]) {
        if (!actual.columns[table].includes(column)) missingColumns.push({ table, column });
      }
    }
    const actualIndexNames = new Set(actual.indexes.map((idx) => idx.name));
    const missingIndexes = expected.indexes.filter((idx) => !actualIndexNames.has(idx.name));
    result.checks.schema = {
      missing_tables: missingTables,
      missing_columns: missingColumns,
      missing_indexes: missingIndexes,
    };
    if (missingTables.length || missingColumns.length || missingIndexes.length) {
      add(result, "blocker", "db_schema_shape_drift", "Live DB schema is missing tables, columns, or indexes from current code", {
        missing_tables: missingTables.length,
        missing_columns: missingColumns.length,
        missing_indexes: missingIndexes.length,
      });
    }

    const counts = {};
    for (const table of [
      "core_project",
      "core_item",
      "core_mail",
      "core_artifact",
      "core_deliverable",
      "core_knowledge",
      "core_account",
      "auth_session",
      "rbac_role",
      "rbac_account_role",
      "rbac_permission",
      "event_log",
    ]) counts[table] = safeCount(db, `SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`);
    result.checks.db.counts = counts;

    checkDbInvariants(result, db);
    checkAccountsAndTeam(result, db);
    return db;
  } catch (err) {
    add(result, "blocker", "db_audit_failed", "DB audit failed", { error: String(err.message ?? err).slice(0, 200) });
    db.close();
    return null;
  }
}

function checkDbInvariants(result, db) {
  const invalids = {
    project_health: safeCount(db, `SELECT COUNT(*) AS n FROM core_project WHERE health NOT IN (${PROJECT_HEALTHS.map(() => "?").join(",")})`, PROJECT_HEALTHS),
    project_class: safeCount(db, `SELECT COUNT(*) AS n FROM core_project WHERE class NOT IN (${PROJECT_CLASSES.map(() => "?").join(",")})`, PROJECT_CLASSES),
    project_data_label: safeCount(db, `SELECT COUNT(*) AS n FROM core_project WHERE data_label NOT IN (${DATA_LABELS.map(() => "?").join(",")})`, DATA_LABELS),
    item_status: safeCount(db, `SELECT COUNT(*) AS n FROM core_item WHERE status NOT IN (${Store.ITEM_STATUSES.map(() => "?").join(",")})`, Store.ITEM_STATUSES),
    item_data_label: safeCount(db, `SELECT COUNT(*) AS n FROM core_item WHERE data_label NOT IN (${DATA_LABELS.map(() => "?").join(",")})`, DATA_LABELS),
    mail_direction: safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE direction NOT IN ('in','out')"),
    mail_data_label: safeCount(db, `SELECT COUNT(*) AS n FROM core_mail WHERE data_label NOT IN (${DATA_LABELS.map(() => "?").join(",")})`, DATA_LABELS),
    account_status: tableExists(db, "core_account") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_account WHERE status NOT IN ('active','disabled')") : null,
    mailbox_provider: tableExists(db, "core_account") ? safeCount(db, `SELECT COUNT(*) AS n FROM core_account WHERE mailbox_provider NOT IN (${Store.MAILBOX_PROVIDERS.map(() => "?").join(",")})`, Store.MAILBOX_PROVIDERS) : null,
    mailbox_status: tableExists(db, "core_account") ? safeCount(db, `SELECT COUNT(*) AS n FROM core_account WHERE mailbox_status NOT IN (${Store.MAILBOX_STATUSES.map(() => "?").join(",")})`, Store.MAILBOX_STATUSES) : null,
  };
  result.checks.invariants = invalids;
  for (const [code, count] of Object.entries(invalids)) {
    if (count > 0) add(result, "blocker", `invalid_${code}`, `Invalid DB invariant values found: ${code}`, { count });
  }

  const synthetic = {
    projects: safeCount(db, "SELECT COUNT(*) AS n FROM core_project WHERE data_label='synthetic'"),
    items: safeCount(db, "SELECT COUNT(*) AS n FROM core_item WHERE data_label='synthetic'"),
    mail: safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE data_label='synthetic'"),
    artifacts: safeCount(db, "SELECT COUNT(*) AS n FROM core_artifact WHERE data_label='synthetic'"),
  };
  result.checks.synthetic = synthetic;
  if (synthetic.projects > 0 || synthetic.mail > 0) {
    add(result, "blocker", "synthetic_release_data_present", "Synthetic/demo project or mail rows remain in the release DB", synthetic);
  } else if (synthetic.items > 0 || synthetic.artifacts > 0) {
    add(result, "warning", "synthetic_secondary_data_present", "Synthetic item/artifact rows remain in the release DB", synthetic);
  }

  const conflicts = tableExists(db, "core_item") && columnExists(db, "core_item", "sync_state")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM core_item WHERE sync_state='conflict'")
    : null;
  if (conflicts > 0) add(result, "warning", "task_sync_conflicts", "Task ledger sync conflicts exist", { count: conflicts });

  const unsafePointers = [
    tableExists(db, "core_mail") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE pointer_ref IS NOT NULL AND (instr(pointer_ref, char(10))>0 OR instr(pointer_ref, char(13))>0 OR instr(pointer_ref, char(0))>0)") : 0,
    tableExists(db, "core_artifact") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_artifact WHERE pointer IS NOT NULL AND (instr(pointer, char(10))>0 OR instr(pointer, char(13))>0 OR instr(pointer, char(0))>0)") : 0,
    tableExists(db, "core_deliverable") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_deliverable WHERE (out_pointer IS NOT NULL AND (instr(out_pointer, char(10))>0 OR instr(out_pointer, char(13))>0 OR instr(out_pointer, char(0))>0)) OR (in_pointer IS NOT NULL AND (instr(in_pointer, char(10))>0 OR instr(in_pointer, char(13))>0 OR instr(in_pointer, char(0))>0))") : 0,
  ].reduce((a, b) => a + (b ?? 0), 0);
  result.checks.pointer_health = { unsafe_pointer_count: unsafePointers };
  if (unsafePointers > 0) add(result, "blocker", "unsafe_pointer_refs", "Pointer refs contain control characters", { count: unsafePointers });

  const codexBindings = tableExists(db, "codex_thread_binding") ? (() => {
    const rows = db.prepare(
      "SELECT thread_id,workspace_id,workspace_revision,workspace_root_fingerprint FROM codex_thread_binding",
    ).all();
    return {
      total: rows.length,
      legacy_or_partial: rows.filter((row) => (
        !CODEX_THREAD_REF_RE.test(String(row.thread_id || ""))
        || !row.workspace_id || !row.workspace_revision || !row.workspace_root_fingerprint
      )).length,
    };
  })() : { total: 0, legacy_or_partial: 0 };
  const legacyCodexMessages = tableExists(db, "codex_thread_message") && columnExists(db, "codex_thread_message", "payload_ref")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM codex_thread_message WHERE payload_ref IS NULL OR payload_ref='' OR text<>payload_ref")
    : null;
  const activeCodexAudits = tableExists(db, "codex_turn_audit")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM codex_turn_audit WHERE outcome='started'")
    : null;
  result.checks.codex_runtime_data = {
    binding_count: codexBindings.total,
    legacy_or_partial_binding_count: codexBindings.legacy_or_partial,
    legacy_inline_message_count: legacyCodexMessages,
    unfinished_audit_count: activeCodexAudits,
  };
  if (codexBindings.legacy_or_partial > 0) {
    add(result, "blocker", "codex_legacy_bindings_unmigrated", "Codex bindings without a complete workspace proof require an owner-approved mapping migration", { count: codexBindings.legacy_or_partial });
  }
  if (legacyCodexMessages > 0) {
    add(result, "blocker", "codex_inline_message_payloads_present", "Codex message bodies still exist inline in the ERP DB; migrate or retire them before release", { count: legacyCodexMessages });
  }
  if (activeCodexAudits > 0) {
    add(result, "blocker", "codex_unfinished_audits_present", "Codex turn audits remain in started state", { count: activeCodexAudits });
  }
}

function checkAccountsAndTeam(result, db) {
  if (!tableExists(db, "core_account")) return;
  const accountCount = safeCount(db, "SELECT COUNT(*) AS n FROM core_account");
  const activeAccounts = safeCount(db, "SELECT COUNT(*) AS n FROM core_account WHERE status='active'");
  const activeAdmins = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account a JOIN rbac_account_role r ON r.account_id=a.id AND r.role_id='admin' WHERE a.status='active'"
  );
  const activeMembers = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account a WHERE a.status='active' AND NOT EXISTS (SELECT 1 FROM rbac_account_role r WHERE r.account_id=a.id AND r.role_id='admin')"
  );
  const expiredSessions = tableExists(db, "auth_session")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM auth_session WHERE expires_at < datetime('now')")
    : 0;
  const configuredMailboxes = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account WHERE status='active' AND mailbox_enabled=1 AND mailbox_provider<>'none' AND mailbox_env_ref IS NOT NULL AND mailbox_env_ref<>''"
  );
  const fetchSeen = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account WHERE status='active' AND mailbox_enabled=1 AND mailbox_last_fetch_at IS NOT NULL"
  );
  const secretLikeEnvRef = safeCount(
    db,
    "SELECT COUNT(*) AS n FROM core_account WHERE lower(coalesce(mailbox_env_ref,'')) LIKE '%password%' OR lower(coalesce(mailbox_env_ref,'')) LIKE '%token%' OR lower(coalesce(mailbox_env_ref,'')) LIKE '%secret%' OR lower(coalesce(mailbox_env_ref,'')) LIKE '%credential%'"
  );
  const mailRows = tableExists(db, "core_mail") ? safeCount(db, "SELECT COUNT(*) AS n FROM core_mail") : 0;
  const blankMailboxRows = tableExists(db, "core_mail") && columnExists(db, "core_mail", "mailbox")
    ? safeCount(db, "SELECT COUNT(*) AS n FROM core_mail WHERE mailbox IS NULL OR mailbox=''")
    : null;
  result.checks.accounts = {
    account_count: accountCount,
    active_accounts: activeAccounts,
    active_admins: activeAdmins,
    active_members: activeMembers,
    expired_sessions: expiredSessions,
    configured_mailboxes: configuredMailboxes,
    mailbox_fetch_seen: fetchSeen,
    secret_like_env_ref_count: secretLikeEnvRef,
    blank_mailbox_rows: blankMailboxRows,
  };
  if (accountCount === 0) add(result, "blocker", "auth_anonymous_mode", "No accounts exist; server will run in anonymous compatibility mode");
  if (accountCount > 0 && activeAdmins === 0) add(result, "blocker", "active_admin_missing", "No active admin account exists");
  if (expiredSessions > 0) add(result, "warning", "expired_sessions_present", "Expired auth sessions are still present", { count: expiredSessions });
  if (secretLikeEnvRef > 0) add(result, "warning", "mailbox_env_ref_secret_like", "Mailbox env refs contain secret-like words; verify they are metadata paths only", { count: secretLikeEnvRef });
  if (activeMembers > 0 && configuredMailboxes < activeMembers) {
    add(result, "warning", "member_mailboxes_not_fully_configured", "Some active members do not have mailbox metadata configured", { expected: activeMembers, actual: configuredMailboxes });
  }
  if (configuredMailboxes > 0 && fetchSeen < configuredMailboxes) {
    add(result, "warning", "mailbox_fetch_not_observed", "Configured mailboxes exist but not all have observed fetch timestamps", { expected: configuredMailboxes, actual: fetchSeen });
  }
  if (activeMembers > 0 && mailRows > 0 && blankMailboxRows === mailRows) {
    add(result, "warning", "mailbox_attribution_missing", "All mail rows have blank mailbox attribution while team members exist", { mail_rows: mailRows });
  }
}

function checkRealMeta(result, paths, db, {
  coreOnlyRelease = false,
  expectedCommit = null,
} = {}) {
  const { metaPath, dbPath } = paths;
  const releaseTestPath = join(dirname(metaPath), "real_meta.release-test.json");
  result.checks.real_meta = { path: metaPath, exists: existsSync(metaPath) };
  if (!existsSync(metaPath)) {
    add(
      result,
      "blocker",
      existsSync(releaseTestPath) ? "real_meta_missing_release_test_only" : "real_meta_missing",
      "data/real_meta.json is missing for the runtime DB",
      { metaPath, release_test_exists: existsSync(releaseTestPath) }
    );
    return;
  }

  let meta;
  try {
    meta = readJson(metaPath);
  } catch (err) {
    add(result, "blocker", "real_meta_json_invalid", "real_meta.json is not valid JSON", { error: String(err.message ?? err).slice(0, 160) });
    return;
  }

  const stat = safeStat(metaPath);
  result.checks.real_meta.bytes = stat?.size ?? null;
  result.checks.real_meta.mtime_ms = stat?.mtimeMs ?? null;
  result.checks.real_meta.sha256 = sha256File(metaPath);
  result.checks.real_meta.counts = {
    projects: Array.isArray(meta.projects) ? meta.projects.length : null,
    items: Array.isArray(meta.items) ? meta.items.length : null,
    mail: Array.isArray(meta.mail) ? meta.mail.length : null,
    artifacts: Array.isArray(meta.artifacts) ? meta.artifacts.length : null,
  };
  if (!Array.isArray(meta.projects)) add(result, "blocker", "real_meta_projects_missing", "real_meta.projects must be an array");
  if (!Array.isArray(meta.mail)) add(result, "warning", "real_meta_mail_missing", "real_meta.mail is not an array");
  if (!db) return;

  try {
    const ingested = tableExists(db, "meta")
      ? db.prepare("SELECT value FROM meta WHERE key='real_ingest_mtime'").get()?.value
      : null;
    result.checks.real_meta.db_real_ingest_mtime = ingested ?? null;
    if (stat?.mtimeMs && ingested !== undefined && ingested !== null) {
      const delta = Math.abs(Number(ingested) - Number(stat.mtimeMs));
      if (!Number.isFinite(delta) || delta > 1) {
        add(result, "warning", "real_meta_ingest_mtime_stale", "DB real_ingest_mtime differs from real_meta.json mtime", { db_value: ingested, file_mtime_ms: stat.mtimeMs });
      }
    } else {
      add(result, "warning", "real_meta_ingest_marker_missing", "DB has no real_ingest_mtime marker");
    }

    const metaProjectIds = (meta.projects ?? []).map((p) => String(p?.id ?? "")).filter(Boolean).sort();
    const dbProjectIds = tableIds(db, "core_project");
    const metaOnlyProjects = setDiff(metaProjectIds, dbProjectIds);
    const dbOnlyProjects = setDiff(dbProjectIds, metaProjectIds);
    const metaMailIds = (meta.mail ?? []).map((m) => String(m?.id ?? "")).filter(Boolean).sort();
    const dbMailIds = tableIds(db, "core_mail");
    const metaOnlyMail = setDiff(metaMailIds, dbMailIds);
    const dbOnlyMail = setDiff(dbMailIds, metaMailIds);
    result.checks.real_meta.project_id_diff = { meta_only: metaOnlyProjects.length, db_only: dbOnlyProjects.length };
    result.checks.real_meta.mail_id_diff = { meta_only: metaOnlyMail.length, db_only: dbOnlyMail.length };
    if (metaOnlyProjects.length || dbOnlyProjects.length) {
      add(result, "blocker", "project_set_drift", "DB and real_meta project id sets differ", {
        meta_only: metaOnlyProjects.slice(0, 10),
        db_only: dbOnlyProjects.slice(0, 10),
        meta_only_count: metaOnlyProjects.length,
        db_only_count: dbOnlyProjects.length,
      });
    }
    if (metaOnlyMail.length || dbOnlyMail.length) {
      if (coreOnlyRelease) {
        const verification = verifyMailSetReconciliation({
          receiptPath: paths.mailSetReconciliationPath,
          metaPath: paths.metaPath,
          dbPath: paths.dbPath,
          expectedCommit,
        });
        result.checks.real_meta.mail_set_reconciliation = verification;
        if (!verification.ok) {
          add(result, "blocker", "mail_set_reconciliation_missing_or_invalid", "Core-only release requires a current hash/count-only mail-set reconciliation bound to the runtime DB, real_meta backup, and exact source commit", {
            error: verification.error,
            meta_only_count: metaOnlyMail.length,
            db_only_count: dbOnlyMail.length,
          });
        } else {
          add(result, "info", "mail_set_drift_reconciled_core_only", "Core-only release accepts the runtime DB as mail-set authority through the verified metadata-only reconciliation receipt", {
            meta_only_count: metaOnlyMail.length,
            db_only_count: dbOnlyMail.length,
          });
        }
      } else {
        add(result, "blocker", "mail_set_drift", "DB and real_meta mail id sets differ", {
          meta_only_count: metaOnlyMail.length,
          db_only_count: dbOnlyMail.length,
        });
      }
    }

    const metaProjects = new Map((meta.projects ?? []).filter((p) => p?.id).map((p) => [String(p.id), p]));
    const commonProjectRows = db.prepare("SELECT id,title,health,class,stage_current,start_year,provisional,source_ref FROM core_project").all()
      .filter((row) => metaProjects.has(row.id));
    const fieldMismatches = [];
    for (const row of commonProjectRows) {
      const p = metaProjects.get(row.id);
      for (const field of ["title", "health", "class", "stage_current", "start_year", "provisional", "source_ref"]) {
        if (p[field] === undefined) continue;
        if (normalizeComparable(p[field]) !== normalizeComparable(row[field])) fieldMismatches.push({ id: row.id, field });
      }
    }
    result.checks.real_meta.project_field_mismatches = fieldMismatches.length;
    if (fieldMismatches.length) {
      add(result, "warning", "project_field_drift", "DB project fields differ from real_meta.json", {
        count: fieldMismatches.length,
        examples: fieldMismatches.slice(0, 10),
      });
    }

    const knownProjectIds = new Set(dbProjectIds);
    const dbMailOrphans = tableExists(db, "core_mail")
      ? db.prepare("SELECT id,project_id FROM core_mail WHERE project_id IS NOT NULL AND project_id<>''").all()
        .filter((row) => !knownProjectIds.has(row.project_id))
      : [];
    const metaProjectSet = new Set(metaProjectIds);
    const metaMailOrphans = (meta.mail ?? [])
      .filter((m) => m?.project_id && !metaProjectSet.has(String(m.project_id)));
    result.checks.real_meta.mail_project_orphans = { db: dbMailOrphans.length, meta: metaMailOrphans.length };
    if (dbMailOrphans.length || metaMailOrphans.length) {
      add(result, "blocker", "mail_project_orphans", "Mail rows reference projects absent from their project set", {
        db_count: dbMailOrphans.length,
        meta_count: metaMailOrphans.length,
      });
    }
  } catch (err) {
    add(result, "blocker", "real_meta_compare_failed", "Failed to compare real_meta with DB", { dbPath, error: String(err.message ?? err).slice(0, 160) });
  }
}

function checkWorkspaceProjects(result, paths, db) {
  const names = collectWorkspaceProjectNames(paths.workspacesDir);
  const ids = Object.keys(names).sort();
  result.checks.workspace_projects = { path: paths.workspacesDir, count: ids.length };
  if (!ids.length) {
    add(result, "warning", "workspace_project_names_missing", "No Pxx-xxx workspace project names were found", { workspacesDir: paths.workspacesDir });
    return;
  }
  if (!db || !tableExists(db, "core_project")) return;
  const rows = db.prepare(`SELECT id,title,class FROM core_project WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  const titleCandidates = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row && row.title !== names[id] && codeOnlyTitle(row.title, id)) {
      titleCandidates.push({ id, target: names[id] });
    }
  }
  result.checks.workspace_projects.db_missing = missing.length;
  result.checks.workspace_projects.title_correction_candidates = titleCandidates.length;
  if (missing.length) add(result, "warning", "workspace_projects_missing_in_db", "Workspace project folders exist but DB has no matching project rows", { count: missing.length, examples: missing.slice(0, 10) });
  if (titleCandidates.length) add(result, "warning", "project_name_correction_candidates", "DB has code-only project titles that can be corrected from workspace names", { count: titleCandidates.length, examples: titleCandidates.slice(0, 10) });
}

function checkStaticAssets(result, paths) {
  const indexPath = join(paths.appRoot, "static", "index.html");
  const stylePath = join(paths.appRoot, "static", "style.css");
  result.checks.assets = {
    style_css_exists: existsSync(stylePath),
    index_html_exists: existsSync(indexPath),
    skin_roots: [],
  };
  if (!existsSync(stylePath)) add(result, "blocker", "style_css_missing", "static/style.css is missing");
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, "utf8");
    if (!html.includes('/style.css')) add(result, "warning", "index_style_ref_unexpected", "index.html does not reference /style.css");
    if (html.includes('/styles.css')) add(result, "warning", "index_styles_plural_ref", "index.html references /styles.css, but app uses /style.css");
  }

  for (const root of paths.skinRoots) {
    const info = { path: root, exists: existsSync(root), present: 0, missing: [] };
    if (info.exists) {
      for (const rel of RELEASE_SKINS) {
        const p = join(root, ...rel.split("/"));
        if (existsSync(p)) info.present += 1;
        else info.missing.push(rel);
      }
      const mainPath = join(root, "main.png");
      if (existsSync(mainPath)) info.main_png = { bytes: statSync(mainPath).size, sha256: sha256File(mainPath) };
    }
    result.checks.assets.skin_roots.push(info);
  }
  const selected = result.checks.assets.skin_roots.find((root) => root.exists);
  if (!selected) {
    add(result, "warning", "skin_root_missing", "No runtime skin root exists; fantasy UI will use SVG fallbacks only");
  } else if (selected.missing.length) {
    add(result, "warning", "skin_manifest_incomplete", "Selected runtime skin root is missing expected fantasy PNG assets", {
      root: selected.path,
      missing_count: selected.missing.length,
      examples: selected.missing.slice(0, 10),
    });
  }
}

function listDirNames(path) {
  try {
    return existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  } catch {
    return [];
  }
}

function payloadEvidenceFail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function comparablePath(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function plainDirectoryWithin(root, candidate, code) {
  let rootReal;
  let candidateReal;
  let stat;
  try {
    rootReal = realpathSync(root);
    stat = lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) payloadEvidenceFail(code);
    candidateReal = realpathSync(candidate);
  } catch (error) {
    if (error?.code === code) throw error;
    payloadEvidenceFail(code);
  }
  const rootKey = comparablePath(rootReal);
  const candidateKey = comparablePath(candidateReal);
  if (candidateKey !== rootKey && !candidateKey.startsWith(`${rootKey}${sep}`)) payloadEvidenceFail(code);
  return { path: candidateReal, stat };
}

function readPlainBoundedFile(path, maxBytes, code) {
  let before;
  let bytes;
  let after;
  try {
    before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) payloadEvidenceFail(code);
    bytes = readFileSync(path);
    after = lstatSync(path);
  } catch (error) {
    if (error?.code === code) throw error;
    payloadEvidenceFail(code);
  }
  if (
    bytes.length !== before.size
    || after.size !== before.size
    || after.mtimeMs !== before.mtimeMs
    || after.isSymbolicLink()
  ) payloadEvidenceFail(code);
  return { bytes, stat: after };
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function buildPayloadPointerEvidence(rows, { manifestRows = false } = {}) {
  const seen = new Set();
  const normalized = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) payloadEvidenceFail("message_pointer_shape_invalid");
    if (manifestRows && !hasExactKeys(row, CODEX_PAYLOAD_MESSAGE_FIELDS)) {
      payloadEvidenceFail("message_pointer_shape_invalid");
    }
    const pointer = {
      item_id: String(row.item_id ?? ""),
      payload_ref: String(row.payload_ref ?? ""),
      role: String(row.role ?? ""),
      byte_length: Number(row.byte_length),
      sha256: String(row.sha256 ?? ""),
    };
    if (!pointer.item_id || pointer.item_id.length > 128
        || !pointer.payload_ref || pointer.payload_ref.length > 256
        || !CODEX_PAYLOAD_MESSAGE_ROLES.has(pointer.role)
        || !Number.isSafeInteger(pointer.byte_length) || pointer.byte_length < 1
        || !CODEX_PAYLOAD_SHA256_RE.test(pointer.sha256)
        || seen.has(pointer.payload_ref)) {
      payloadEvidenceFail("message_pointer_invalid");
    }
    seen.add(pointer.payload_ref);
    return pointer;
  }).sort((left, right) => (
    left.payload_ref.localeCompare(right.payload_ref)
    || left.item_id.localeCompare(right.item_id)
    || left.role.localeCompare(right.role)
  ));
  return {
    count: normalized.length,
    sha256: createHash("sha256").update(`${normalized.map((row) => JSON.stringify(row)).join("\n")}\n`).digest("hex"),
  };
}

function readLivePayloadPointerEvidence(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    if (!tableExists(db, "codex_thread_message")) payloadEvidenceFail("live_pointer_table_missing");
    const rows = db.prepare(`
      SELECT item_id, payload_ref, role,
             payload_byte_length AS byte_length,
             payload_sha256 AS sha256
      FROM codex_thread_message
      WHERE payload_ref IS NOT NULL AND payload_ref<>''
      ORDER BY payload_ref, id
    `).all();
    return buildPayloadPointerEvidence(rows);
  } finally {
    db.close();
  }
}

function validatePayloadEvidenceManifest(manifest, generationId) {
  const topKeys = new Set(["schema", "generation_id", "created_at", "database", "messages", "attachments", "totals"]);
  const databaseKeys = new Set(["bytes", "sha256", "quick_check"]);
  const totalsKeys = new Set(["message_count", "message_bytes", "attachment_count", "attachment_bytes", "generation_payload_bytes"]);
  if (!hasExactKeys(manifest, topKeys)) payloadEvidenceFail("manifest_shape_invalid");
  if (manifest.schema !== CODEX_PAYLOAD_BACKUP_SCHEMA || manifest.generation_id !== generationId) {
    payloadEvidenceFail("manifest_identity_invalid");
  }
  const createdAt = new Date(manifest.created_at);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== manifest.created_at) {
    payloadEvidenceFail("manifest_time_invalid");
  }
  if (
    !hasExactKeys(manifest.database, databaseKeys)
    || !Number.isSafeInteger(manifest.database.bytes)
    || manifest.database.bytes < 1
    || !CODEX_PAYLOAD_SHA256_RE.test(String(manifest.database.sha256 ?? ""))
    || manifest.database.quick_check !== "ok"
  ) payloadEvidenceFail("manifest_database_invalid");
  if (
    !Array.isArray(manifest.messages)
    || !Array.isArray(manifest.attachments)
    || manifest.messages.length > CODEX_PAYLOAD_MAX_RECORDS
    || manifest.attachments.length > CODEX_PAYLOAD_MAX_RECORDS
  ) payloadEvidenceFail("manifest_inventory_invalid");
  const pointerEvidence = buildPayloadPointerEvidence(manifest.messages, { manifestRows: true });
  let attachmentCount = 0;
  for (const group of manifest.attachments) {
    if (!group || typeof group !== "object" || Array.isArray(group) || !Array.isArray(group.files)) {
      payloadEvidenceFail("manifest_inventory_invalid");
    }
    attachmentCount += group.files.length;
    if (!Number.isSafeInteger(attachmentCount) || attachmentCount > CODEX_PAYLOAD_MAX_RECORDS) {
      payloadEvidenceFail("manifest_inventory_invalid");
    }
  }
  if (!hasExactKeys(manifest.totals, totalsKeys)) payloadEvidenceFail("manifest_totals_invalid");
  for (const value of Object.values(manifest.totals)) {
    if (!safeNonNegativeInteger(value)) payloadEvidenceFail("manifest_totals_invalid");
  }
  if (
    manifest.totals.message_count !== manifest.messages.length
    || manifest.totals.attachment_count !== attachmentCount
    || manifest.totals.generation_payload_bytes < manifest.database.bytes
    || manifest.totals.generation_payload_bytes > 64 * 1024 * 1024 * 1024
    || manifest.totals.message_bytes > manifest.totals.generation_payload_bytes
    || manifest.totals.attachment_bytes > manifest.totals.generation_payload_bytes
  ) payloadEvidenceFail("manifest_totals_invalid");
  return { createdAt, pointerEvidence };
}

function readLatestCommittedPayloadGeneration(backupNamespace) {
  const namespace = plainDirectoryWithin(dirname(backupNamespace), backupNamespace, "backup_namespace_invalid");
  const candidates = [];
  let generationCount = 0;
  for (const entry of readdirSync(namespace.path, { withFileTypes: true })) {
    if (!CODEX_PAYLOAD_GENERATION_RE.test(entry.name)) continue;
    generationCount += 1;
    const generation = plainDirectoryWithin(namespace.path, join(namespace.path, entry.name), "generation_directory_invalid");
    let markerStat;
    try {
      markerStat = lstatSync(join(generation.path, "COMMITTED"));
    } catch {
      continue;
    }
    candidates.push({ generation_id: entry.name, path: generation.path, marker_mtime_ms: markerStat.mtimeMs });
  }
  if (!candidates.length) payloadEvidenceFail("committed_generation_missing");
  candidates.sort((left, right) => (
    right.marker_mtime_ms - left.marker_mtime_ms
    || right.generation_id.localeCompare(left.generation_id)
  ));
  const latest = candidates[0];
  const manifestFile = readPlainBoundedFile(
    join(latest.path, "generation-manifest.v1.json"),
    CODEX_PAYLOAD_MANIFEST_MAX_BYTES,
    "manifest_file_invalid",
  );
  const manifestSha256 = createHash("sha256").update(manifestFile.bytes).digest("hex");
  const commitFile = readPlainBoundedFile(join(latest.path, "COMMITTED"), 65, "commit_marker_invalid");
  if (commitFile.bytes.toString("ascii") !== `${manifestSha256}\n`) payloadEvidenceFail("commit_marker_unbound");
  let manifest;
  try {
    manifest = JSON.parse(manifestFile.bytes.toString("utf8"));
  } catch {
    payloadEvidenceFail("manifest_json_invalid");
  }
  const validated = validatePayloadEvidenceManifest(manifest, latest.generation_id);
  return {
    generation_count: generationCount,
    committed_generation_count: candidates.length,
    generation_id: latest.generation_id,
    manifest_sha256: manifestSha256,
    created_at: manifest.created_at,
    committed_mtime_ms: commitFile.stat.mtimeMs,
    database: {
      bytes: manifest.database.bytes,
      sha256: manifest.database.sha256,
      quick_check: manifest.database.quick_check,
    },
    pointer_evidence: validated.pointerEvidence,
    totals: { ...manifest.totals },
  };
}

function verifyPayloadRestoreMarker(restoreNamespace, generationId, manifestSha256) {
  const namespace = plainDirectoryWithin(dirname(restoreNamespace), restoreNamespace, "restore_namespace_invalid");
  const generation = plainDirectoryWithin(
    namespace.path,
    join(namespace.path, generationId),
    "restore_generation_invalid",
  );
  const marker = readPlainBoundedFile(join(generation.path, "RESTORE_VERIFIED"), 65, "restore_marker_invalid");
  if (marker.bytes.toString("ascii") !== `${manifestSha256}\n`) payloadEvidenceFail("restore_marker_unbound");
  return true;
}

function checkCodexPayloadBackupEvidence(result, paths, { requireNas = false } = {}) {
  const backupNamespace = join(paths.nasRoot, CODEX_PAYLOAD_BACKUP_NAMESPACE);
  const restoreNamespace = join(paths.nasRoot, CODEX_PAYLOAD_RESTORE_NAMESPACE);
  const level = requireNas ? "blocker" : "warning";
  const check = {
    schema: CODEX_PAYLOAD_BACKUP_SCHEMA,
    backup_namespace: CODEX_PAYLOAD_BACKUP_NAMESPACE,
    restore_namespace: CODEX_PAYLOAD_RESTORE_NAMESPACE,
    backup_namespace_available: existsSync(backupNamespace),
    restore_namespace_available: existsSync(restoreNamespace),
    latest: null,
  };
  result.checks.nas_backup.codex_payload = check;
  if (!check.backup_namespace_available) {
    add(result, level, "codex_payload_backup_namespace_missing", "Coherent Codex payload backup namespace is missing");
  }
  if (!check.restore_namespace_available) {
    add(result, level, "codex_payload_restore_namespace_missing", "Codex payload restore-verification namespace is missing");
  }
  if (!check.backup_namespace_available) return;

  let latest;
  try {
    latest = readLatestCommittedPayloadGeneration(backupNamespace);
  } catch (error) {
    add(result, level, "codex_payload_backup_latest_invalid", "Latest committed Codex payload backup generation is missing or invalid", {
      error_code: String(error?.code || "generation_evidence_invalid"),
    });
    return;
  }
  check.generation_count = latest.generation_count;
  check.committed_generation_count = latest.committed_generation_count;
  check.latest = {
    generation_id: latest.generation_id,
    manifest_sha256: latest.manifest_sha256,
    created_at: latest.created_at,
    committed_mtime_ms: latest.committed_mtime_ms,
    database: latest.database,
    pointer_count: latest.pointer_evidence.count,
    live_pointer_count: null,
    live_pointer_match: false,
    totals: latest.totals,
    restore_verified: false,
  };

  const dbStat = safeStat(paths.dbPath);
  const walStat = safeStat(`${paths.dbPath}-wal`);
  const liveMtimeMs = Math.max(dbStat?.mtimeMs ?? 0, walStat?.mtimeMs ?? 0);
  const generationMtimeStale = latest.committed_mtime_ms + 1000 < liveMtimeMs;
  try {
    const livePointerEvidence = readLivePayloadPointerEvidence(paths.dbPath);
    check.latest.live_pointer_count = livePointerEvidence.count;
    check.latest.live_pointer_match = livePointerEvidence.count === latest.pointer_evidence.count
      && livePointerEvidence.sha256 === latest.pointer_evidence.sha256;
  } catch (error) {
    add(result, level, "codex_payload_live_pointer_evidence_invalid", "Live Codex payload pointers could not be compared with the coherent generation", {
      error_code: String(error?.code || "live_pointer_evidence_invalid"),
    });
  }

  if (check.restore_namespace_available) {
    try {
      check.latest.restore_verified = verifyPayloadRestoreMarker(
        restoreNamespace,
        latest.generation_id,
        latest.manifest_sha256,
      );
    } catch (error) {
      add(result, level, "codex_payload_restore_verification_invalid", "Latest coherent Codex payload backup lacks a matching restore-verification marker", {
        generation_id: latest.generation_id,
        manifest_sha256: latest.manifest_sha256,
        error_code: String(error?.code || "restore_evidence_invalid"),
      });
    }
  }

  if (generationMtimeStale) {
    const latestDbBackup = result.checks.nas_backup.latest;
    const logicallyCurrent = check.latest.restore_verified
      && check.latest.live_pointer_match
      && latest.totals.attachment_count === 0
      && latestDbBackup?.fresh === true
      && latestDbBackup?.manifest_valid === true
      && result.checks.nas_backup.valid_restore_report_count > 0;
    if (logicallyCurrent) {
      add(result, "info", "codex_payload_backup_generation_logically_current", "The stopped-service coherent generation remains current because live message pointers are unchanged, attachments are empty, and a newer live DB backup is hash-bound and restore-tested", {
        pointer_count: latest.pointer_evidence.count,
      });
    } else {
      add(result, level, "codex_payload_backup_generation_stale", "Latest coherent Codex payload backup is older than the live DB/WAL state", {
        backup_mtime_ms: latest.committed_mtime_ms,
        live_mtime_ms: liveMtimeMs,
      });
    }
  }
}

function checkNasBackup(result, paths, { skipNas = false, requireNas = false } = {}) {
  if (skipNas) return;
  const nasRoot = paths.nasRoot;
  result.checks.nas_backup = { root: nasRoot, configured: !!nasRoot };
  if (!nasRoot) {
    add(result, requireNas ? "blocker" : "warning", "nas_root_not_configured", "NAS root was not provided and default NAS path was not found");
    return;
  }
  if (!existsSync(nasRoot)) {
    add(result, "blocker", "nas_root_missing", "NAS root does not exist", { nasRoot });
    return;
  }
  const namespaces = [
    "DB_BACKUP",
    "01_db_backups",
    "RESTORE_TEST",
    "02_restore_tests",
    "RELEASE",
    "03_release_snapshots",
    CODEX_PAYLOAD_BACKUP_NAMESPACE,
    CODEX_PAYLOAD_RESTORE_NAMESPACE,
  ]
    .filter((name) => existsSync(join(nasRoot, name)));
  result.checks.nas_backup.namespaces = namespaces;
  const legacyNamespaces = namespaces.filter((name) => ["DB_BACKUP", "RESTORE_TEST"].includes(name));
  if (legacyNamespaces.length) {
    add(result, requireNas ? "blocker" : "warning", "nas_backup_namespace_drift", "Legacy NAS backup namespace is present; use canonical 01_db_backups/02_restore_tests", { namespaces, legacy_namespaces: legacyNamespaces });
  }

  const latestCandidates = [
    join(nasRoot, "01_db_backups", "latest", "runtime_live", "dev-erp.db"),
  ].filter((p) => existsSync(p));
  result.checks.nas_backup.latest_candidates = latestCandidates;
  const dbStat = safeStat(paths.dbPath);
  const walStat = safeStat(`${paths.dbPath}-wal`);
  const liveMtimeMs = Math.max(dbStat?.mtimeMs ?? 0, walStat?.mtimeMs ?? 0);
  if (!latestCandidates.length) {
    add(result, "blocker", "nas_latest_db_backup_missing", "No latest NAS runtime DB backup was found", { nasRoot });
  } else if (dbStat) {
    const latest = latestCandidates
      .map((p) => ({ path: p, stat: statSync(p) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    result.checks.nas_backup.latest = {
      bytes: latest.stat.size,
      mtime_ms: latest.stat.mtimeMs,
      live_mtime_ms: liveMtimeMs,
      db_mtime_ms: dbStat?.mtimeMs ?? null,
      wal_mtime_ms: walStat?.mtimeMs ?? null,
      fresh: latest.stat.mtimeMs + 1000 >= liveMtimeMs,
    };
    if (latest.stat.mtimeMs + 1000 < liveMtimeMs) {
      add(result, "blocker", "nas_latest_db_backup_stale", "Latest NAS DB backup is older than the live DB/WAL state", {
        latest_backup: latest.path,
        backup_mtime_ms: latest.stat.mtimeMs,
        live_mtime_ms: liveMtimeMs,
        db_mtime_ms: dbStat?.mtimeMs ?? null,
        wal_mtime_ms: walStat?.mtimeMs ?? null,
      });
    }
    const latestSha256 = sha256File(latest.path);
    const latestManifestPath = join(dirname(latest.path), `${basename(latest.path, ".db")}.manifest.json`);
    let manifest = null;
    try { manifest = existsSync(latestManifestPath) ? readJson(latestManifestPath) : null; } catch { manifest = null; }
    const manifestValid = !!manifest
      && manifest.schema === "dev_erp.runtime_ops.v1"
      && manifest.kind === "runtime_db_backup_manifest"
      && manifest.quick_check === "ok"
      && manifest.sha256 === latestSha256
      && Number(manifest.backup_bytes) === latest.stat.size
      && resolve(String(manifest.latestPath || "")) === resolve(latest.path);
    result.checks.nas_backup.latest.manifest_valid = manifestValid;
    result.checks.nas_backup.latest.sha256 = latestSha256;
    if (!manifestValid) {
      add(result, "blocker", "nas_latest_backup_manifest_invalid", "Latest NAS DB backup lacks a valid hash-bound runtime_ops manifest");
    }

    const restoreRoot = join(nasRoot, "02_restore_tests");
    const restoreReports = listDirNames(restoreRoot)
      .map((name) => join(restoreRoot, name, "restore_test.json"))
      .filter((path) => existsSync(path));
    const validRestoreReports = [];
    for (const reportPath of restoreReports) {
      try {
        const report = readJson(reportPath);
        if (report.schema === "dev_erp.runtime_ops.v1"
            && report.kind === "restore_test"
            && report.ok === true
            && report.quick_check === "ok"
            && report.schema_version === SCHEMA_VERSION
            && report.sha256 === latestSha256
            && resolve(String(report.backupPath || "")) === resolve(latest.path)) {
          validRestoreReports.push(report);
        }
      } catch { /* invalid reports are counted below without exposing paths */ }
    }
    result.checks.nas_backup.restore_report_count = restoreReports.length;
    result.checks.nas_backup.valid_restore_report_count = validRestoreReports.length;
    if (!validRestoreReports.length) {
      add(result, requireNas ? "blocker" : "warning", "restore_test_invalid_or_unbound", "No successful restore-test report is hash-bound to the latest NAS DB backup");
    }
  }

  const restoreDirs = [join(nasRoot, "02_restore_tests")].filter((p) => existsSync(p));
  const restoreEntries = restoreDirs.flatMap((p) => listDirNames(p));
  result.checks.nas_backup.restore_test_entries = restoreEntries.length;
  if (!restoreEntries.length) add(result, requireNas ? "blocker" : "warning", "restore_test_missing", "No NAS restore-test entry was found");
  checkCodexPayloadBackupEvidence(result, paths, { requireNas });
}

async function checkLiveServer(result, {
  live = false,
  requireLive = false,
  coreOnlyRelease = false,
  port = 4300,
  allowLanHttp = false,
  expectedCommit = null,
  codexWorkerUrl = null,
  codexWorkerExpectedIdentityHash = null,
  codexWorkerExpectedRuntimeIdentityHash = null,
  codexWorkerExpectedAttestationKeyId = null,
} = {}) {
  const expectedWorkerReleaseBinding = codexWorkerReleaseBindingRevision({
    workerUrl: codexWorkerUrl || process.env.DEV_ERP_CODEX_WORKER_URL,
    expectedWorkerIdentityHash: codexWorkerExpectedIdentityHash || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH,
    expectedRuntimeIdentityHash: codexWorkerExpectedRuntimeIdentityHash || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256,
    expectedAttestationKeyId: codexWorkerExpectedAttestationKeyId || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID,
  });
  result.checks.live_server = { checked: Boolean(live || requireLive), port };
  if (live || requireLive) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 1500);
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
      clearTimeout(timeout);
      const body = await response.json();
      result.checks.live_server.health = {
        response_ok: response.ok,
        service_ok: body?.ok === true,
        schema_present: typeof body?.schema === "string" && body.schema.length > 0,
      };
      if (!body.ok) add(result, "blocker", "live_health_not_ok", "Live /api/health did not return ok=true");
      const attestation = body?.attestation;
      const workerReleaseMatch = attestation?.codex_worker_release === CODEX_DEDICATED_WORKER_VERSION.release;
      const workerReady = attestation?.codex_worker_ready === true;
      const workerAttestationVerified = attestation?.codex_worker_attestation_verified === true;
      const workerAttestationKeyMatch = attestation?.codex_worker_attestation_key_match === true;
      const workerSourceCommitMatch = attestation?.codex_worker_source_commit_match === true;
      const workerSourceTreeClean = attestation?.codex_worker_source_tree_clean === true;
      const workerIdentityMatch = attestation?.codex_worker_identity_match === true;
      const workerProcessSeparate = attestation?.codex_worker_process_separate === true;
      const workerIdentitySeparate = attestation?.codex_worker_identity_separate === true;
      const workerRegistryRevisionMatch = attestation?.codex_worker_registry_revision_match === true;
      const workerRootIsolationReady = attestation?.codex_worker_root_isolation_ready === true;
      const workerProjectionRootReady = attestation?.codex_worker_projection_root_ready === true;
      const workerDeniedReadRootsReady = attestation?.codex_worker_denied_read_roots_ready === true;
      const workerPayloadDenyBindingMatch = attestation?.codex_worker_payload_deny_binding_match === true;
      const workerForbiddenRootsReady = attestation?.codex_worker_forbidden_roots_ready === true;
      const workerPermissionProfileMatch = attestation?.codex_worker_permission_profile_match === true;
      const workerFilesystemBoundaryProven = attestation?.codex_worker_filesystem_boundary_proven === true;
      const workerCommandIdentityMatch = attestation?.codex_worker_command_identity_match === true;
      const workerReleaseBindingMatch = !!expectedWorkerReleaseBinding
        && attestation?.codex_worker_release_binding_revision === expectedWorkerReleaseBinding;
      const workerBridgeModeMatch = attestation?.codex_worker_bridge_mode === "app-server";
      result.checks.live_server.attestation = attestation ? {
        present: true,
        source_commit_match: !!expectedCommit && attestation.source_commit === expectedCommit,
        bridge_match: attestation.codex_bridge === CODEX_TASK_BRIDGE_VERSION.release,
        registry_revision_match: !!result.checks.codex_workspace_registry?.mapping_revision
          && attestation.codex_workspace_registry_revision === result.checks.codex_workspace_registry.mapping_revision,
        dedicated_home_configured: attestation.codex_dedicated_home_configured === true,
        dedicated_profile_safe: attestation.codex_dedicated_profile_safe === true,
        trust_domain_configured: attestation.codex_trust_domain_configured === true,
        payload_owner_configured: attestation.codex_payload_owner_configured === true,
        payload_roots_safe: attestation.codex_payload_roots_safe === true,
        payload_owner_revision_match: !!result.checks.codex_payload_owner?.owner_revision
          && attestation.codex_payload_owner_revision === result.checks.codex_payload_owner.owner_revision,
        execution_boundary: attestation.codex_execution_boundary || null,
        worker_configured: attestation.codex_worker_configured === true,
        worker_ready: workerReady,
        worker_release_match: workerReleaseMatch,
        worker_attestation_verified: workerAttestationVerified,
        worker_attestation_key_match: workerAttestationKeyMatch,
        worker_source_commit_match: workerSourceCommitMatch,
        worker_source_tree_clean: workerSourceTreeClean,
        worker_identity_match: workerIdentityMatch,
        worker_process_separate: workerProcessSeparate,
        worker_identity_separate: workerIdentitySeparate,
        worker_registry_revision_match: workerRegistryRevisionMatch,
        worker_root_isolation_ready: workerRootIsolationReady,
        worker_projection_root_ready: workerProjectionRootReady,
        worker_denied_read_roots_ready: workerDeniedReadRootsReady,
        worker_payload_deny_binding_match: workerPayloadDenyBindingMatch,
        worker_forbidden_roots_ready: workerForbiddenRootsReady,
        worker_permission_profile_match: workerPermissionProfileMatch,
        worker_filesystem_boundary_proven: workerFilesystemBoundaryProven,
        worker_command_identity_match: workerCommandIdentityMatch,
        worker_release_binding_match: workerReleaseBindingMatch,
        worker_bridge_mode_match: workerBridgeModeMatch,
      } : { present: false };
      if (requireLive && !attestation) add(result, "blocker", "live_runtime_attestation_missing", "Live ERP health does not identify the running release and Codex boundary");
      if (requireLive && expectedCommit && attestation?.source_commit !== expectedCommit) add(result, "blocker", "live_runtime_commit_mismatch", "Live ERP process does not match the approved release commit");
      if (requireLive && attestation?.codex_bridge !== CODEX_TASK_BRIDGE_VERSION.release) add(result, "blocker", "live_codex_bridge_mismatch", "Live ERP process reports a different Codex bridge release");
      if (requireLive && result.checks.codex_workspace_registry?.mapping_revision
          && attestation?.codex_workspace_registry_revision !== result.checks.codex_workspace_registry.mapping_revision) {
        add(result, "blocker", "live_codex_registry_mismatch", "Live ERP process is not using the workspace registry checked by this audit");
      }
      if (requireLive && !coreOnlyRelease && (attestation?.codex_dedicated_home_configured !== true || attestation?.codex_dedicated_profile_safe !== true)) {
        add(result, "blocker", "live_codex_profile_unattested", "Live ERP process does not attest a safe dedicated Codex profile");
      }
      if (requireLive && !coreOnlyRelease && attestation?.codex_trust_domain_configured !== true) {
        add(result, "blocker", "live_codex_trust_domain_unattested", "Live ERP process does not attest a configured Codex trust domain");
      }
      if (requireLive && (attestation?.codex_payload_owner_configured !== true
          || attestation?.codex_payload_roots_safe !== true
          || !result.checks.codex_payload_owner?.owner_revision
          || attestation?.codex_payload_owner_revision !== result.checks.codex_payload_owner.owner_revision)) {
        add(result, "blocker", "live_codex_payload_owner_mismatch", "Live ERP process is not using the Soulforge-owned payload roots checked by this audit");
      }
      if (requireLive && !coreOnlyRelease && attestation?.codex_execution_boundary !== "dedicated_worker") {
        add(result, "blocker", "codex_worker_process_isolation_missing", "Production Codex must run behind a separately privileged worker identity; in-process spawning is not a filesystem confidentiality boundary");
      }
      if (requireLive && !coreOnlyRelease && !workerReady) {
        add(result, "blocker", "live_codex_worker_not_ready", "Live ERP health does not attest a ready dedicated Codex worker");
      }
      if (requireLive && !coreOnlyRelease && !workerReleaseMatch) {
        add(result, "blocker", "live_codex_worker_release_mismatch", "Live ERP health reports a different dedicated Codex worker release");
      }
      if (requireLive && !coreOnlyRelease && !workerAttestationVerified) {
        add(result, "blocker", "live_codex_worker_attestation_unverified", "Live ERP health does not confirm a nonce-bound Ed25519 worker attestation");
      }
      if (requireLive && !coreOnlyRelease && !workerAttestationKeyMatch) {
        add(result, "blocker", "live_codex_worker_attestation_key_mismatch", "Live ERP health does not confirm the approved worker attestation public key");
      }
      if (requireLive && !coreOnlyRelease && !workerSourceCommitMatch) {
        add(result, "blocker", "live_codex_worker_source_commit_mismatch", "Live worker source commit does not match the running ERP release commit");
      }
      if (requireLive && !coreOnlyRelease && !workerSourceTreeClean) {
        add(result, "blocker", "live_codex_worker_source_tree_dirty", "Live worker attestation reports an uncommitted source tree");
      }
      if (requireLive && !coreOnlyRelease && !workerIdentityMatch) {
        add(result, "blocker", "live_codex_worker_identity_mismatch", "Live ERP health does not attest the owner-approved worker Windows identity");
      }
      if (requireLive && !coreOnlyRelease && !workerProcessSeparate) {
        add(result, "blocker", "live_codex_worker_process_not_separate", "Live ERP health does not attest a worker process separate from the ERP process");
      }
      if (requireLive && !coreOnlyRelease && !workerIdentitySeparate) {
        add(result, "blocker", "live_codex_worker_identity_not_separate", "Live ERP and Codex worker must run under different operating-system identities");
      }
      if (requireLive && !coreOnlyRelease && !workerRegistryRevisionMatch) {
        add(result, "blocker", "live_codex_worker_registry_revision_mismatch", "Live ERP health does not attest the workspace registry revision checked by the ERP process");
      }
      if (requireLive && !coreOnlyRelease && !workerRootIsolationReady) {
        add(result, "blocker", "live_codex_worker_root_isolation_unready", "Live worker does not attest realpath isolation across enabled workspace roots");
      }
      if (requireLive && !coreOnlyRelease && !workerProjectionRootReady) {
        add(result, "blocker", "live_codex_worker_projection_root_unready", "Live worker does not attest its disposable selected-file projection boundary");
      }
      if (requireLive && !coreOnlyRelease && !workerDeniedReadRootsReady) {
        add(result, "blocker", "live_codex_worker_denied_read_roots_unready", "Live worker does not attest the revision-bound denied-read roots");
      }
      if (requireLive && !coreOnlyRelease && !workerPayloadDenyBindingMatch) {
        add(result, "blocker", "live_codex_worker_payload_deny_binding_mismatch", "Live worker deny binding does not match the ERP canonical attachment and message payload roots");
      }
      if (requireLive && !coreOnlyRelease && !workerForbiddenRootsReady) {
        add(result, "blocker", "live_codex_worker_forbidden_roots_unready", "Live worker does not attest the protected service-root overlap boundary");
      }
      if (requireLive && !coreOnlyRelease && !workerPermissionProfileMatch) {
        add(result, "blocker", "live_codex_worker_permission_profile_mismatch", "Live worker does not attest the release-matched selected-file projection permission profile");
      }
      if (requireLive && !coreOnlyRelease && !workerFilesystemBoundaryProven) {
        add(result, "blocker", "live_codex_worker_filesystem_boundary_unproven", "Live worker did not pass the harmless outside-root read/write denial probe");
      }
      if (requireLive && !coreOnlyRelease && !workerCommandIdentityMatch) {
        add(result, "blocker", "live_codex_worker_command_identity_mismatch", "Live worker does not match the owner-approved Codex runtime identity");
      }
      if (requireLive && !coreOnlyRelease && !workerReleaseBindingMatch) {
        add(result, "blocker", "live_codex_worker_release_binding_mismatch", "Live ERP worker URL and approved identity fingerprints do not match this audit invocation");
      }
      if (requireLive && !coreOnlyRelease && !workerBridgeModeMatch) {
        add(result, "blocker", "live_codex_worker_bridge_mode_invalid", "Production dedicated Codex worker must use app-server bridge mode");
      }
      if (requireLive && coreOnlyRelease) {
        if (attestation?.codex_execution_boundary !== "worker_unattested"
            || attestation?.codex_worker_configured !== false
            || attestation?.codex_worker_ready !== false) {
          add(result, "blocker", "live_core_only_worker_not_disabled", "Core-only release requires the live ERP to remain in fail-closed worker mode with no configured or ready dedicated worker");
        }
      }
    } catch {
      add(result, requireLive ? "blocker" : "warning", "live_health_unreachable", "Live /api/health is unreachable on localhost", { port });
    }
  }

  const netstat = safeExec("netstat", ["-ano", "-p", "tcp"]);
  if (netstat.ok) {
    const listeners = netstat.stdout.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes(`:${port}`) && /\bLISTENING\b/i.test(line))
      .map((line) => line.split(/\s+/)[1] ?? line);
    result.checks.live_server.listeners = listeners;
    const broad = listeners.filter((addr) => addr.startsWith("0.0.0.0:") || addr.startsWith("[::]:") || addr.startsWith(":::"));
    if (broad.length && !allowLanHttp) {
      add(result, requireLive ? "blocker" : "warning", "lan_http_exposure_observed", "Server appears to listen on a broad LAN address; pass --allow-lan-http only for owner-approved LAN pilot", { listeners: broad });
    }
  }
}

function checkCodexRuntimeIsolation(result, {
  requireLive = false,
  codexHome = null,
  codexTrustDomain = null,
  codexTurnProjectionRoot = null,
} = {}) {
  const configuredValue = String(codexHome || process.env.DEV_ERP_CODEX_HOME || "").trim();
  const projectionValue = String(codexTurnProjectionRoot || process.env.DEV_ERP_CODEX_TURN_PROJECTION_ROOT || "").trim();
  let directoryAvailable = false;
  if (configuredValue) {
    try { directoryAvailable = statSync(resolve(configuredValue)).isDirectory(); }
    catch { directoryAvailable = false; }
  }
  let projectionDirectoryAvailable = false;
  if (projectionValue && isAbsolute(projectionValue)) {
    try { projectionDirectoryAvailable = statSync(resolve(projectionValue)).isDirectory(); }
    catch { projectionDirectoryAvailable = false; }
  }
  result.checks.codex_runtime_isolation = {
    dedicated_home_configured: !!configuredValue,
    dedicated_home_directory_available: directoryAvailable,
    turn_projection_root_configured: !!projectionValue && isAbsolute(projectionValue),
    turn_projection_root_directory_available: projectionDirectoryAvailable,
    trust_domain_configured: !!String(codexTrustDomain || process.env.DEV_ERP_CODEX_TRUST_DOMAIN || "").trim(),
    forbidden_extension_surfaces_absent: directoryAvailable
      ? !["hooks.json", "plugins", "marketplaces"].some((name) => existsSync(join(resolve(configuredValue), name)))
      : false,
  };
  if (!configuredValue) {
    add(result, requireLive ? "blocker" : "warning", "codex_dedicated_home_missing", "DEV_ERP_CODEX_HOME is not explicitly configured for the ERP execution account");
  } else if (!directoryAvailable) {
    add(result, requireLive ? "blocker" : "warning", "codex_dedicated_home_unavailable", "The configured ERP Codex home directory is unavailable");
  }
  if (!projectionValue) {
    add(result, requireLive ? "blocker" : "warning", "codex_turn_projection_root_missing", "DEV_ERP_CODEX_TURN_PROJECTION_ROOT is not explicitly configured for the dedicated worker");
  } else if (!isAbsolute(projectionValue)) {
    add(result, requireLive ? "blocker" : "warning", "codex_turn_projection_root_invalid", "DEV_ERP_CODEX_TURN_PROJECTION_ROOT must be absolute");
  } else if (!projectionDirectoryAvailable) {
    add(result, requireLive ? "blocker" : "warning", "codex_turn_projection_root_unavailable", "The configured disposable turn-projection root is unavailable");
  }
  if (directoryAvailable && !result.checks.codex_runtime_isolation.forbidden_extension_surfaces_absent) {
    add(result, requireLive ? "blocker" : "warning", "codex_dedicated_profile_extensions_present", "Dedicated ERP Codex home contains hooks, plugins, or marketplace surfaces");
  }
  if (requireLive && !result.checks.codex_runtime_isolation.trust_domain_configured) {
    add(result, "blocker", "codex_trust_domain_missing", "DEV_ERP_CODEX_TRUST_DOMAIN is not explicitly configured");
  }
}

function checkCodexPayloadOwner(result, paths, { requireLive = false } = {}) {
  const workspaceOwnerRoot = resolve(paths.workspacesDir, "system");
  const ownerBase = resolve(paths.workspacesDir, "system", "dev-erp");
  const roots = [
    resolve(process.env.DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT || join(ownerBase, "codex-task-attachments")),
    resolve(process.env.DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT || join(ownerBase, "codex-message-payloads")),
  ];
  const owner = inspectCodexPayloadOwner({
    backendRoot: dirname(paths.workspacesDir),
    workspaceOwnerRoot,
    ownerBase,
    roots,
    configured: true,
  });
  result.checks.codex_payload_owner = {
    checked: true,
    configured_root_count: roots.length,
    available_root_count: roots.filter((root) => existsSync(root)).length,
    roots_safe: owner.roots_safe,
    owner_revision: owner.revision,
  };
  if (!owner.roots_safe) {
    add(result, requireLive ? "blocker" : "warning", "codex_payload_owner_unready", "Codex attachment and message payload roots must be service-owned directories under the approved Soulforge workspace owner");
  }
}

function recommendedCommands(paths) {
  return [
    `npm.cmd run dev-erp:audit-runtime -- --source-root ${paths.sourceRoot} --runtime-root ${paths.runtimeRoot} --workspaces ${paths.workspacesDir} --nas-root ${paths.nasRoot ?? "<nas-root>"} --expected-commit <approved-40-char-sha> --codex-trust-domain <trust-domain-id> --codex-worker-url http://127.0.0.1:<worker-port> --codex-worker-expected-identity-sha256 <expected-worker-identity-sha256> --codex-worker-expected-runtime-identity-sha256 <approved-codex-runtime-sha256> --codex-worker-attestation-public-key <erp-public-key-file> --codex-worker-expected-attestation-key-sha256 <approved-public-key-sha256> --require-live`,
    `npm.cmd run dev-erp:correct-runtime -- --dry-run --workspaces ${paths.workspacesDir} --db ${paths.dbPath} --meta ${paths.metaPath}`,
    "npm.cmd run guild-hall:snapshot:check-fresh",
    "npm.cmd run guild-hall:workspace-junction:audit -- --json",
    "npm.cmd run guild-hall:workspace-system:inventory -- --json",
    `npm.cmd run dev-erp:team-preflight -- --db ${paths.dbPath}`,
    `npm.cmd run dev-erp:backup-codex-payloads -- --db ${paths.dbPath} --attachment-root ${join(paths.workspacesDir, "system", "dev-erp", "codex-task-attachments")} --message-root ${join(paths.workspacesDir, "system", "dev-erp", "codex-message-payloads")} --backup-root ${join(paths.nasRoot ?? "<nas-root>", CODEX_PAYLOAD_BACKUP_NAMESPACE)}`,
    `npm.cmd run dev-erp:restore-verify-codex-payloads -- --backup-root ${join(paths.nasRoot ?? "<nas-root>", CODEX_PAYLOAD_BACKUP_NAMESPACE)} --generation-id <cpb-generation-id> --restore-root ${join(paths.nasRoot ?? "<nas-root>", CODEX_PAYLOAD_RESTORE_NAMESPACE)}`,
    "codex login status  # run as the ERP Windows execution account; never copy auth files or tokens",
    "ERP UI smoke: sign in, open one authorized synthetic item, verify its capabilities list, then use a discovered gpt-5.6* model for one read-only turn; record only model/turn status",
  ];
}

export async function runRuntimeReleaseAudit(options = {}) {
  const paths = resolveAuditPaths(options);
  const coreOnlyRelease = options.coreOnlyRelease === true;
  const result = {
    schema_version: SCHEMA,
    release_mode: coreOnlyRelease ? "core_only" : "dedicated_worker",
    generated_at: new Date().toISOString(),
    ok: false,
    paths,
    checks: { git: {} },
    blockers: [],
    warnings: [],
    info: [],
    recommended_commands: recommendedCommands(paths),
  };

  if (options.requireLive && options.skipGit) {
    add(result, "blocker", "release_skip_git_forbidden", "--require-live cannot skip source/runtime Git checks");
  }
  if (options.requireLive && options.skipNas) {
    add(result, "blocker", "release_skip_nas_forbidden", "--require-live cannot skip NAS backup and restore evidence checks");
  }
  if (options.requireLive && !String(options.expectedCommit || "").trim()) {
    add(result, "blocker", "release_expected_commit_missing", "--require-live requires --expected-commit with the approved 40-character release SHA");
  }
  if (coreOnlyRelease && !options.requireLive) {
    add(result, "blocker", "core_only_release_requires_live_gate", "--core-only-release is valid only together with --require-live");
  }
  checkCodexWorkerBoundaryConfiguration(result, { ...options, coreOnlyRelease });
  const skipGit = Boolean(options.skipGit && !options.requireLive);
  const skipNas = Boolean(options.skipNas && !options.requireLive);
  checkGit(result, paths.sourceRoot, "source", { skipGit, strict: options.requireLive, expectedCommit: options.expectedCommit });
  if (paths.runtimeRoot !== paths.sourceRoot) checkGit(result, paths.runtimeRoot, "runtime", { skipGit, required: true, strict: options.requireLive, expectedCommit: options.expectedCommit });
  if (options.snapshotFreshness === true || options.requireLive) {
    await checkOperationalSnapshotReadiness(result, paths);
  } else {
    result.checks.snapshot_readiness = {
      checked: false,
      structural: { status: "not_checked" },
      freshness: { status: "not_checked" },
    };
  }
  await checkCodexWorkspaceRegistry(result, paths, {
    required: options.requireLive && !coreOnlyRelease,
    probe: options.workspaceProbe,
    probeTimeoutMs: options.workspaceProbeTimeoutMs,
    registryPath: options.workspaceRegistryPath || process.env.DEV_ERP_CODEX_WORKSPACE_REGISTRY,
    trustDomainId: options.codexTrustDomain || process.env.DEV_ERP_CODEX_TRUST_DOMAIN,
    shareBoundaryReceiptPath: options.codexShareBoundaryReceiptPath
      || process.env.DEV_ERP_CODEX_SHARE_BOUNDARY_RECEIPT,
    expectedWorkerIdentityHash: options.codexWorkerExpectedIdentityHash
      || process.env.DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH,
  });
  checkCodexRuntimeIsolation(result, { ...options, requireLive: options.requireLive && !coreOnlyRelease });
  checkCodexPayloadOwner(result, paths, options);

  const db = checkDbAndSchema(result, paths);
  try {
    checkRealMeta(result, paths, db, { coreOnlyRelease, expectedCommit: options.expectedCommit });
    checkWorkspaceProjects(result, paths, db);
    checkStaticAssets(result, paths);
    checkNasBackup(result, paths, { skipNas, requireNas: options.requireLive });
    await checkLiveServer(result, { ...options, coreOnlyRelease });
  } finally {
    db?.close();
  }

  const targetMembers = Number(options.targetMembers ?? 0);
  if (targetMembers > 0) {
    const activeMembers = result.checks.accounts?.active_members ?? 0;
    if (activeMembers < targetMembers) {
      add(result, "blocker", "target_members_short", "Active non-admin member count is below the release target", { expected: targetMembers, actual: activeMembers });
    }
  }

  result.ok = result.blockers.length === 0;
  return result;
}

function parseCli(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
  };
  const list = (name) => {
    const values = [];
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) values.push(argv[i + 1]);
    }
    return values;
  };
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    json: argv.includes("--json"),
    root: value("root", undefined),
    sourceRoot: value("source-root", undefined),
    runtimeRoot: value("runtime-root", undefined),
    appRoot: value("app", undefined),
    dbPath: value("db", undefined),
    metaPath: value("meta", undefined),
    mailSetReconciliationPath: value("mail-set-reconciliation", undefined),
    workspacesDir: value("workspaces", undefined),
    snapshotPath: value("snapshot", undefined),
    nasRoot: argv.includes("--no-nas") ? false : value("nas-root", undefined),
    skinRoots: list("skin-root"),
    skipGit: argv.includes("--skip-git"),
    skipNas: argv.includes("--skip-nas") || argv.includes("--no-nas"),
    live: argv.includes("--live"),
    requireLive: argv.includes("--require-live"),
    coreOnlyRelease: argv.includes("--core-only-release"),
    codexHome: value("codex-home", undefined),
    codexWorkerUrl: value("codex-worker-url", undefined),
    codexWorkerExpectedIdentityHash: value("codex-worker-expected-identity-sha256", undefined),
    codexWorkerExpectedRuntimeIdentityHash: value("codex-worker-expected-runtime-identity-sha256", undefined),
    codexWorkerAttestationPublicKeyFile: value("codex-worker-attestation-public-key", undefined),
    codexWorkerExpectedAttestationKeyId: value("codex-worker-expected-attestation-key-sha256", undefined),
    expectedCommit: value("expected-commit", undefined),
    codexTrustDomain: value("codex-trust-domain", undefined),
    workspaceRegistryPath: value("workspace-registry", undefined),
    codexShareBoundaryReceiptPath: value("codex-share-boundary-receipt", undefined),
    snapshotFreshness: argv.includes("--snapshot-freshness"),
    allowLanHttp: argv.includes("--allow-lan-http"),
    port: Number(value("port", "4300")),
    targetMembers: Number(value("target-members", "0")),
  };
}

function printHelp() {
  console.log(`Usage:
  node tools/runtime_release_audit.mjs [--json]
  node tools/runtime_release_audit.mjs --source-root <source> --runtime-root <runtime> --workspaces <source>\\_workspaces --nas-root <nas-root> --expected-commit <sha> --codex-trust-domain <id> --codex-worker-url http://127.0.0.1:<port> --codex-worker-expected-identity-sha256 <sha256> --codex-worker-expected-runtime-identity-sha256 <sha256> --codex-worker-attestation-public-key <file> --codex-worker-expected-attestation-key-sha256 <sha256> --require-live

Purpose:
  Read-only release gate for the company-PC dev-ERP runtime. It checks the
  runtime DB, real_meta sync, schema drift, accounts/RBAC readiness, WAL and
  NAS DB backup posture, the latest coherent Codex payload generation and its
  matching restore-verification marker, stored snapshot readiness, runtime-local
  Codex workspace readiness, static assets/skins, source/runtime git state, and
  live local health. It does not read raw project files, mail bodies, payload
  bodies, or secret env values, and it never writes to the DB.

Common options:
  --runtime-root <path>   Runtime checkout root. Defaults to the current repo.
  --source-root <path>    Development/source checkout root for _workspaces.
  --db <path>             Runtime SQLite DB path.
  --meta <path>           Runtime data/real_meta.json path.
  --mail-set-reconciliation <path>
                          Hash/count-only receipt binding real_meta backup and
                          the runtime DB mail-ID authority for core-only release.
  --workspaces <path>     Approved _workspaces root for project labels.
  --codex-home <path>     Dedicated ERP execution-account Codex home (path is not reported).
  --codex-trust-domain <id> One OS/ACL read-authority domain for every registered workspace.
  --codex-worker-url <url> Dedicated worker endpoint; exact http://127.0.0.1:<port> only.
                          Defaults to DEV_ERP_CODEX_WORKER_URL.
  --codex-worker-expected-identity-sha256 <sha256>
                           Expected worker Windows identity proof. Defaults to
                           DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH. The value
                           is checked but never included in audit output.
  --codex-worker-expected-runtime-identity-sha256 <sha256>
                           Owner-approved aggregate Codex runtime identity. Defaults to
                           DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256 and is never reported.
  --codex-worker-attestation-public-key <path>
                          ERP-side Ed25519 public key file used to verify worker nonces.
  --codex-worker-expected-attestation-key-sha256 <sha256>
                          Approved public-key fingerprint; checked but never reported.
  --workspace-registry <path> Exact runtime registry path used by the service.
  --codex-share-boundary-receipt <path> Metadata-only UNC/ACL/probe receipt; required for enabled UNC roots.
  --expected-commit <sha> Approved 40-character release commit; mandatory for --require-live.
  --snapshot <path>       Stored Soulforge snapshot path. Defaults under source root.
  --nas-root <path>       NAS backup root. Use --no-nas only for non-release audits.
  --target-members <n>    Block unless at least n active non-admin users exist.
  --live                  Check http://127.0.0.1:<port>/api/health.
  --require-live          First-release gate: live health, NAS evidence, clean git,
                          fresh snapshot, exact approved commit, dedicated worker identity/home,
                          an available same-trust-domain v1 Codex workspace registry,
                          a fresh hash-bound coherent payload backup/restore generation,
                          and no unapproved broad LAN listener are blockers. It rejects
                          --skip-git, --skip-nas, and --no-nas.
  --core-only-release     Owner-approved release mode that keeps the dedicated
                          Codex worker unconfigured and fail-closed. Requires
                          --require-live and retains Git, snapshot, DB/schema,
                          payload-owner, NAS backup/restore, mail reconciliation,
                          and live-health blockers.
  --skip-git/--skip-nas   Non-release fixture/diagnostic use only.
  --snapshot-freshness    Check structural and freshness readiness without requiring live health.
  --allow-lan-http        Treat broad 0.0.0.0 LAN listening as owner-approved.
`);
}

function printHuman(result) {
  console.log(`[dev-erp runtime release audit] ${result.ok ? "OK" : "BLOCKED"}`);
  console.log(`  db: ${result.paths.dbPath}`);
  console.log(`  meta: ${result.paths.metaPath}`);
  console.log(`  workspaces: ${result.paths.workspacesDir}`);
  const snapshot = result.checks.snapshot_readiness;
  if (snapshot?.checked) {
    console.log(`  snapshot: structural=${snapshot.structural.status}, freshness=${snapshot.freshness.status}`);
  }
  const workspaces = result.checks.codex_workspace_registry;
  if (workspaces?.checked) {
    console.log(`  codex workspaces: configured=${workspaces.configured}, available=${workspaces.probe.available}/${workspaces.enabled_workspace_count}`);
  }
  const isolation = result.checks.codex_runtime_isolation;
  if (isolation) console.log(`  codex isolation: configured=${isolation.dedicated_home_configured}, available=${isolation.dedicated_home_directory_available}`);
  const worker = result.checks.codex_worker_boundary;
  if (worker) console.log(`  codex worker: url_loopback=${worker.loopback_url_valid}, expected_identity=${worker.expected_identity_sha256_configured}, expected_runtime=${worker.expected_runtime_identity_sha256_configured}, signed_key=${worker.attestation_public_key_match}`);
  if (result.paths.nasRoot) console.log(`  nas: ${result.paths.nasRoot}`);
  console.log(`  blockers: ${result.blockers.length}, warnings: ${result.warnings.length}`);
  for (const issue of result.blockers) console.log(`  BLOCKER ${issue.code}: ${issue.message}`);
  for (const issue of result.warnings) console.log(`  warning ${issue.code}: ${issue.message}`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await runRuntimeReleaseAudit(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (!result.ok) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[dev-erp runtime release audit] error: ${err.message}`);
    process.exitCode = 1;
  });
}
