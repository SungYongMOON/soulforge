// receipt-expiry-adapter.mjs — Team Ops Board read-only projection adapter and HTTP endpoint for standing internal receipts.
// Read-only, GET-only loopback, zero runtime or repair authority.

import { lstat, open, realpath } from "node:fs/promises";
import path, { resolve } from "node:path";
import {
  evaluateStandingReceiptProbes,
  evaluateReceiptObservation,
  getStandingRuntimeBlockingCatalog,
} from "../../../../../guild_hall/watchtower/internal_receipt_catalog.mjs";
import { validateWriterAuthorityRecord } from "../../../../../guild_hall/ingress/writer_authority.mjs";
import { validateActivationSidecar } from "../../../../../guild_hall/backup_controller/activation.mjs";
import { validatePlaudCutoverReceipt } from "../../../../../guild_hall/voice_capture/plaud_writer_cutover_receipt.mjs";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

export const RECEIPT_EXPIRY_PATH = "/receipt-expiry.snapshot.json";
export const RECEIPT_EXPIRY_PROJECTION_ENVELOPE_SCHEMA = "soulforge.team_ops_board.receipt_expiry_projection.v1";
export const RECEIPT_EXPIRY_BINDING_SCHEMA = "soulforge.team_ops_board.receipt_expiry_binding.v1";

const MAX_BYTES = 256 * 1024;
const MAX_WINDOW_SECONDS = 31 * 86_400; // 31 days max
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const STANDING_CONTRACT_CATALOG = Object.freeze(getStandingRuntimeBlockingCatalog());
const STANDING_CONTRACT_IDS = Object.freeze(STANDING_CONTRACT_CATALOG.map((c) => c.contract_id));
const STANDING_CONTRACT_COUNT = STANDING_CONTRACT_IDS.length;

function exactKeys(value, expected, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(code);
}

function defaultPathsEqual(pathA, pathB) {
  const normA = resolve(pathA);
  const normB = resolve(pathB);
  if (process.platform === "win32") {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

function deriveAggregateReason(evaluatedReceipts) {
  if (evaluatedReceipts.every((r) => r.status === "current")) {
    return null;
  }
  if (evaluatedReceipts.some((r) => r.status === "expired")) {
    return "standing_evidence_expired";
  }
  if (evaluatedReceipts.some((r) => r.status === "critical")) {
    return "standing_evidence_critical";
  }
  if (evaluatedReceipts.some((r) => r.status === "warning")) {
    return "standing_evidence_warning";
  }
  if (evaluatedReceipts.some((r) => r.status === "invalid")) {
    return "standing_evidence_invalid";
  }
  return "standing_evidence_missing";
}

function unavailable(reason = "receipt_expiry_pointer_or_evidence_missing", nowMs = Date.now()) {
  return {
    schema_version: RECEIPT_EXPIRY_PROJECTION_ENVELOPE_SCHEMA,
    observed_at: new Date(nowMs).toISOString(),
    status: "unavailable",
    reason,
    summary: {
      total: STANDING_CONTRACT_COUNT,
      current: 0,
      warning: 0,
      critical: 0,
      expired: 0,
      invalid: 0,
      unknown: STANDING_CONTRACT_COUNT,
      owner_action_required_count: STANDING_CONTRACT_COUNT,
    },
    receipts: STANDING_CONTRACT_IDS.map((contractId) => ({
      contract_id: contractId,
      schema_version: "unknown",
      status: "unknown",
      owner_action_required: true,
      diagnostic_code: reason,
      timestamp_iso: null,
      expires_in_seconds: null,
      renewal_governance: "none",
      next_action: null,
    })),
    authority_boundary: {
      read_only: true,
      runtime_authority: false,
      repair_authority: false,
    },
  };
}

export async function readStableFile(filePath, testHooks = {}) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("file_path_invalid");
  }
  if (typeof testHooks.readStableFileOverride === "function") {
    return testHooks.readStableFileOverride(filePath);
  }

  const beforeStat = await lstat(filePath);
  if (!beforeStat.isFile() || beforeStat.isSymbolicLink() || beforeStat.nlink !== 1 || beforeStat.size > MAX_BYTES) {
    throw new Error("file_stat_invalid_or_oversized");
  }

  let canonicalPath;
  try {
    canonicalPath = await realpath(filePath);
  } catch {
    throw new Error("file_realpath_failed");
  }

  const pathsEqual = typeof testHooks.pathsEqual === "function" ? testHooks.pathsEqual : defaultPathsEqual;
  if (!pathsEqual(canonicalPath, filePath)) {
    throw new Error("reparse_path_forbidden");
  }

  if (typeof testHooks.beforeOpen === "function") {
    await testHooks.beforeOpen(filePath);
  }

  let handle;
  try {
    handle = await open(filePath, "r");
    const openedStat = await handle.stat();

    if (
      !openedStat.isFile()
      || openedStat.nlink !== 1
      || String(openedStat.dev) !== String(beforeStat.dev)
      || String(openedStat.ino) !== String(beforeStat.ino)
      || openedStat.size !== beforeStat.size
      || openedStat.mtimeMs !== beforeStat.mtimeMs
    ) {
      throw new Error("file_identity_changed");
    }

    if (typeof testHooks.beforeRead === "function") {
      await testHooks.beforeRead(filePath);
    }

    const bytes = await handle.readFile();
    const afterHandleStat = await handle.stat();
    const afterPathStat = await lstat(filePath);

    if (
      !afterPathStat.isFile()
      || afterPathStat.isSymbolicLink()
      || afterPathStat.nlink !== 1
      || String(afterHandleStat.dev) !== String(openedStat.dev)
      || String(afterHandleStat.ino) !== String(openedStat.ino)
      || afterHandleStat.size !== openedStat.size
      || afterHandleStat.mtimeMs !== openedStat.mtimeMs
      || String(afterPathStat.dev) !== String(openedStat.dev)
      || String(afterPathStat.ino) !== String(openedStat.ino)
      || afterPathStat.size !== openedStat.size
      || afterPathStat.mtimeMs !== openedStat.mtimeMs
    ) {
      throw new Error("file_identity_changed");
    }

    return bytes.toString("utf8");
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => {});
    }
  }
}

export function validateReceiptExpiryBinding(binding) {
  exactKeys(binding, ["schema_version", "enabled", "contracts"], "receipt_expiry_binding_shape_invalid");

  if (binding.schema_version !== RECEIPT_EXPIRY_BINDING_SCHEMA) {
    throw new Error("receipt_expiry_binding_schema_invalid");
  }
  if (typeof binding.enabled !== "boolean") {
    throw new Error("receipt_expiry_binding_enabled_invalid");
  }

  exactKeys(binding.contracts, STANDING_CONTRACT_IDS, "receipt_expiry_binding_contracts_invalid");

  const validatedContracts = {};

  for (const contractId of STANDING_CONTRACT_IDS) {
    const entry = binding.contracts[contractId];

    if (contractId === "voice_plaud_writer_cutover_receipt") {
      exactKeys(
        entry,
        ["evidence_path", "warning_window_seconds", "critical_window_seconds", "expected_target_node_id", "expected_profile_sha256"],
        "receipt_expiry_plaud_contract_entry_invalid",
      );
      if (typeof entry.expected_target_node_id !== "string" || !SAFE_ID.test(entry.expected_target_node_id)) {
        throw new Error("receipt_expiry_plaud_expected_target_node_id_invalid");
      }
      if (typeof entry.expected_profile_sha256 !== "string" || !SHA256.test(entry.expected_profile_sha256)) {
        throw new Error("receipt_expiry_plaud_expected_profile_sha256_invalid");
      }
    } else {
      exactKeys(entry, ["evidence_path", "warning_window_seconds", "critical_window_seconds"], "receipt_expiry_contract_entry_invalid");
    }

    if (typeof entry.evidence_path !== "string" || !path.isAbsolute(entry.evidence_path)) {
      throw new Error("receipt_expiry_evidence_path_invalid");
    }

    const warning = entry.warning_window_seconds;
    const critical = entry.critical_window_seconds;

    if (!Number.isSafeInteger(warning) || !Number.isSafeInteger(critical)) {
      throw new Error("receipt_expiry_window_not_integer");
    }
    if (critical <= 0 || warning <= critical || warning > MAX_WINDOW_SECONDS) {
      throw new Error("receipt_expiry_window_out_of_bounds");
    }

    validatedContracts[contractId] = {
      evidence_path: entry.evidence_path,
      warning_window_seconds: warning,
      critical_window_seconds: critical,
      expected_target_node_id: entry.expected_target_node_id || null,
      expected_profile_sha256: entry.expected_profile_sha256 || null,
    };
  }

  return {
    schema_version: binding.schema_version,
    enabled: binding.enabled,
    contracts: validatedContracts,
  };
}

export async function readReceiptExpiryProjection(options = {}) {
  const nowMs = typeof options.now === "function" ? options.now() : (Number.isFinite(options.now) ? options.now : Date.now());
  const testHooks = options.testHooks || {};

  // Resolve binding path: prefer options.bindingPath, options.pointerPath, or fallback to ownerRoot location
  let bindingPath = options.bindingPath || options.pointerPath || null;
  if (!bindingPath && options.ownerRoot && typeof options.ownerRoot === "string") {
    bindingPath = path.join(
      options.ownerRoot,
      "guild_hall",
      "state",
      "operations",
      "team_ops_board",
      "receipt_expiry_binding.v1.json",
    );
  }

  if (!bindingPath) {
    return unavailable("receipt_expiry_binding_unconfigured", nowMs);
  }

  let rawBindingContent;
  try {
    rawBindingContent = await readStableFile(bindingPath, testHooks);
  } catch (err) {
    return unavailable("receipt_expiry_binding_file_unreadable", nowMs);
  }

  let parsedBinding;
  try {
    parsedBinding = JSON.parse(rawBindingContent);
  } catch {
    return unavailable("receipt_expiry_binding_json_invalid", nowMs);
  }

  let validatedBinding;
  try {
    validatedBinding = validateReceiptExpiryBinding(parsedBinding);
  } catch (err) {
    return unavailable(err.message || "receipt_expiry_binding_validation_failed", nowMs);
  }

  if (!validatedBinding.enabled) {
    return unavailable("receipt_expiry_disabled_by_binding", nowMs);
  }

  const evaluatedReceipts = [];
  const windowsConfig = {};

  const summary = {
    total: STANDING_CONTRACT_COUNT,
    current: 0,
    warning: 0,
    critical: 0,
    expired: 0,
    invalid: 0,
    unknown: 0,
    owner_action_required_count: 0,
  };

  for (const contractId of STANDING_CONTRACT_IDS) {
    const contractSpec = validatedBinding.contracts[contractId];
    windowsConfig[contractId] = {
      warning_window_seconds: contractSpec.warning_window_seconds,
      critical_window_seconds: contractSpec.critical_window_seconds,
    };

    let projectedObservation = null;

    try {
      const rawContent = await readStableFile(contractSpec.evidence_path, testHooks);
      try {
        const parsed = JSON.parse(rawContent);
        if (contractId === "ingress_writer_authority") {
          const record = validateWriterAuthorityRecord(parsed);
          projectedObservation = {
            evidence_state: "valid",
            schema_version: record.schema_version,
            expires_at: record.expires_at,
          };
        } else if (contractId === "voice_plaud_writer_cutover_receipt") {
          const validated = validatePlaudCutoverReceipt(parsed, {
            allowExpired: true,
            now: nowMs,
            targetNodeId: contractSpec.expected_target_node_id,
            profileSha256: contractSpec.expected_profile_sha256,
          });
          projectedObservation = {
            evidence_state: "valid",
            schema_version: validated.schema_version,
            valid_until: validated.valid_until,
          };
        } else if (contractId === "backup_controller_activation") {
          const validated = validateActivationSidecar(parsed);
          projectedObservation = {
            evidence_state: "valid",
            schema_version: validated.schema_version,
            expires_at: validated.expires_at,
          };
        }
      } catch {
        projectedObservation = {
          evidence_state: "invalid",
          diagnostic_code: "receipt_evidence_invalid",
        };
      }
    } catch {
      // Evidence file read failed (missing or unreadable)
      projectedObservation = null;
    }

    const evaluated = evaluateReceiptObservation(contractId, projectedObservation, {
      now: nowMs,
      windows: windowsConfig,
    });

    evaluatedReceipts.push(evaluated);

    if (Object.hasOwn(summary, evaluated.status)) {
      summary[evaluated.status] += 1;
    }
    if (evaluated.owner_action_required) {
      summary.owner_action_required_count += 1;
    }
  }

  const allCurrent = evaluatedReceipts.every((r) => r.status === "current");
  const aggregateReason = deriveAggregateReason(evaluatedReceipts);

  return {
    schema_version: RECEIPT_EXPIRY_PROJECTION_ENVELOPE_SCHEMA,
    observed_at: new Date(nowMs).toISOString(),
    status: allCurrent ? "ready" : "partial",
    reason: aggregateReason,
    summary,
    receipts: evaluatedReceipts,
    authority_boundary: {
      read_only: true,
      runtime_authority: false,
      repair_authority: false,
    },
  };
}

export function createReceiptExpiryServerAdapter(options = {}) {
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }

      if (url.pathname !== RECEIPT_EXPIRY_PATH) {
        next();
        return;
      }

      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }

      if (!isDirectLoopbackRequest(request)) {
        response.statusCode = 403;
        response.end();
        return;
      }

      void readReceiptExpiryProjection(options).then((projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      }, () => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(unavailable("projection_read_error")));
      });
    });
  };

  return {
    name: "soulforge-receipt-expiry-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
