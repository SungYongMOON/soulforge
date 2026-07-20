#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  assertProjectHistoryShadowAdapterAuthorityCurrentV1,
  buildProjectHistoryReceiptAdapterGenerationV2,
  openProjectHistoryShadowAdapterAuthorityV1,
} from "../../../../guild_hall/shared/project_history_receipt_adapter_v2.mjs";
import {
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  assertProjectHistoryCopyBindingTarget,
  readProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
} from "./project_history_copy_binding.mjs";
import {
  adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection,
  projectCopiedErpHistory,
} from "./project_history_copy_projector.mjs";
import {
  verifyCopiedProjectHistoryProjection,
} from "./project_history_copy_verifier.mjs";

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

export class ProjectHistoryCopyOneShotError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProjectHistoryCopyOneShotError";
    this.code = code;
  }
}

function fail(code) {
  throw new ProjectHistoryCopyOneShotError(code);
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function stableStatEqual(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readPrivateRequest(requestPath) {
  if (typeof requestPath !== "string" || !path.isAbsolute(requestPath)) {
    fail("private_request_path_required");
  }
  const resolved = path.resolve(requestPath);
  let before;
  let after;
  let real;
  let bytes;
  try {
    before = lstatSync(resolved, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
        || before.size < 1n || before.size > BigInt(MAX_REQUEST_BYTES)) {
      fail("private_request_file_invalid");
    }
    bytes = readFileSync(resolved);
    after = lstatSync(resolved, { bigint: true });
    real = realpathSync.native(resolved);
  } catch (error) {
    if (error instanceof ProjectHistoryCopyOneShotError) throw error;
    fail("private_request_file_invalid");
  }
  if (!stableStatEqual(before, after)
      || bytes.length !== Number(after.size)
      || normalizedPath(real) !== normalizedPath(resolved)) {
    fail("private_request_file_changed");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, ""));
  } catch {
    fail("private_request_json_invalid");
  }
}

function safeSummary({
  mode,
  sourceGeneration,
  projectionGeneration,
  projectionAttestation,
  bindingDigest,
  projected = null,
  verified = null,
}) {
  const summary = {
    ok: true,
    mode,
    feature_state: "off",
    request_schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    source_generation_schema_version: sourceGeneration.schema_version,
    source_generation_digest: sourceGeneration.generation_digest,
    projection_generation_schema_version: projectionGeneration.schema_version,
    projection_generation_digest: projectionAttestation,
    binding_digest: bindingDigest,
    event_count: projectionGeneration.envelopes.length,
    coverage_count: projectionGeneration.coverage_receipts.length,
    raw_payload_copied: false,
    accepted_history: false,
  };
  if (projected !== null && verified !== null) {
    Object.assign(summary, {
      status: projected.status === "replayed" ? "verified_replay" : "verified_insert",
      artifact_manifest_digest: projected.artifact_manifest_digest,
      database_after_digest: projected.database_after_digest,
      query_only_verification: verified.query_only === true && verified.sqlite_total_changes === 0,
      db_csv_parity: verified.db_csv_parity,
      db_xlsx_input_parity: verified.db_xlsx_input_parity,
      db_xlsx_parity: verified.db_xlsx_parity,
      xlsx_readback: verified.xlsx_readback,
    });
  } else {
    summary.status = "dry_run_validated";
  }
  return Object.freeze(summary);
}

export async function runProjectHistoryCopyOneShot({
  request,
  authorityPath,
  authorityDigest,
  bindingPath,
  bindingDigest,
  pilotCopy = false,
  beforeProjectionAuthorityRecheck = null,
} = {}) {
  if (pilotCopy !== false && pilotCopy !== true) fail("pilot_copy_flag_invalid");
  if (typeof authorityPath !== "string" || authorityPath.length === 0) fail("authority_path_required");
  if (typeof authorityDigest !== "string" || authorityDigest.length === 0) fail("authority_digest_required");
  if (typeof bindingPath !== "string" || bindingPath.length === 0) fail("binding_path_required");
  if (typeof bindingDigest !== "string" || bindingDigest.length === 0) fail("binding_digest_required");
  if (beforeProjectionAuthorityRecheck !== null
      && typeof beforeProjectionAuthorityRecheck !== "function") {
    fail("authority_recheck_hook_invalid");
  }

  const authoritySnapshot = openProjectHistoryShadowAdapterAuthorityV1({
    authorityPath,
    authorityDigest,
    request,
  });
  const sourceGeneration = await buildProjectHistoryReceiptAdapterGenerationV2(request, {
    authoritySnapshot,
  });
  const projectionGeneration = adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection(
    sourceGeneration,
  );
  const projectionAttestation = sha256Canonical(projectionGeneration);
  const binding = readProjectHistoryCopyBinding(path.resolve(bindingPath), {
    expectedDigest: bindingDigest,
  });
  const artifactPaths = resolveProjectHistoryCopyArtifactPaths(binding, {
    projectId: projectionGeneration.project_ref.entity_id,
    generationId: projectionGeneration.generation_id,
  });
  assertProjectHistoryCopyBindingTarget(binding, {
    bindingDigest,
    dbPath: binding.database_path,
    projectId: projectionGeneration.project_ref.entity_id,
    generationId: projectionGeneration.generation_id,
    artifactPaths,
    requireDatabaseHash: true,
  });

  if (beforeProjectionAuthorityRecheck !== null) await beforeProjectionAuthorityRecheck();
  assertProjectHistoryShadowAdapterAuthorityCurrentV1(authoritySnapshot, request);

  if (!pilotCopy) {
    return safeSummary({
      mode: "dry_run",
      sourceGeneration,
      projectionGeneration,
      projectionAttestation,
      bindingDigest: binding.binding_digest,
    });
  }

  const projected = projectCopiedErpHistory({
    ...artifactPaths,
    dbPath: binding.database_path,
    generation: projectionGeneration,
    bindingPath: path.resolve(bindingPath),
    bindingDigest,
    authoritySnapshot,
    pilotCopy: true,
    attestation: projectionAttestation,
  });
  const verified = verifyCopiedProjectHistoryProjection({
    ...artifactPaths,
    dbPath: binding.database_path,
    generationId: projectionGeneration.generation_id,
    artifactManifestDigest: projected.artifact_manifest_digest,
    bindingPath: path.resolve(bindingPath),
    bindingDigest,
    pilotCopy: true,
    attestation: projectionAttestation,
  });
  if (verified.ok !== true
      || verified.query_only !== true
      || verified.sqlite_total_changes !== 0
      || verified.db_csv_parity !== true
      || verified.db_xlsx_input_parity !== true
      || verified.db_xlsx_parity !== true
      || verified.raw_payload_copied !== false
      || verified.accepted_history !== false) {
    fail("one_shot_verification_failed");
  }
  return safeSummary({
    mode: "pilot_copy",
    sourceGeneration,
    projectionGeneration,
    projectionAttestation,
    bindingDigest: binding.binding_digest,
    projected,
    verified,
  });
}

function parseArgs(argv) {
  const options = {};
  const values = new Map([
    ["--request", "requestPath"],
    ["--authority", "authorityPath"],
    ["--authority-digest", "authorityDigest"],
    ["--binding", "bindingPath"],
    ["--binding-digest", "bindingDigest"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") options.help = true;
    else if (token === "--pilot-copy") {
      if (options.pilotCopy === true) fail("duplicate_argument");
      options.pilotCopy = true;
    } else if (values.has(token)) {
      const key = values.get(token);
      if (options[key] !== undefined) fail("duplicate_argument");
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail("argument_value_missing");
      options[key] = value;
      index += 1;
    } else {
      fail("unknown_argument");
    }
  }
  return options;
}

function helpText() {
  return [
    "Bounded receipt-adapter-v2 to feature-OFF copied Project History one-shot.",
    "",
    "Usage:",
    "  node tools/project_history_copy_one_shot.mjs --request <absolute-private-request.json> \\",
    "    --authority <absolute-private-authority.json> --authority-digest <sha256:...> \\",
    "    --binding <absolute-private-binding.json> --binding-digest <sha256:...> [--pilot-copy]",
    "",
    "Without --pilot-copy, the command validates the strict v2 generation, v1 adapter, binding, and exact target only.",
    "With --pilot-copy, it projects the copied DB and CSV/XLSX artifacts, reads the workbook back, and runs the query-only verifier.",
    "Stdout contains only bounded status, counts, and digests; private paths and receipt locators are never printed.",
  ].join("\n");
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
    } else {
      for (const key of ["requestPath", "authorityPath", "authorityDigest", "bindingPath", "bindingDigest"]) {
        if (typeof options[key] !== "string" || options[key].length === 0) fail("argument_required");
      }
      const request = readPrivateRequest(options.requestPath);
      const result = await runProjectHistoryCopyOneShot({
        request,
        authorityPath: path.resolve(options.authorityPath),
        authorityDigest: options.authorityDigest,
        bindingPath: options.bindingPath,
        bindingDigest: options.bindingDigest,
        pilotCopy: options.pilotCopy === true,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "project_history_copy_one_shot_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  }
}
