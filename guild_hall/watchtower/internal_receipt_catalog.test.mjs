import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INTERNAL_RECEIPT_CONTRACT_CATALOG,
  RECEIPT_CLASSIFICATIONS,
  RECEIPT_HEALTH_STATUSES,
  RECEIPT_RENEWAL_GOVERNANCE,
  classifyReceiptContract,
  evaluateReceiptObservation,
  evaluateStandingReceiptProbes,
  getReceiptContractCatalog,
  getStandingRuntimeBlockingCatalog,
} from "./internal_receipt_catalog.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = Date.parse("2026-08-21T12:00:00.000Z");

const DEFAULT_TEST_WINDOWS = Object.freeze({
  voice_plaud_writer_cutover_receipt: {
    warning_window_seconds: 604_800, // 7 days
    critical_window_seconds: 172_800, // 48 hours
  },
  backup_controller_activation: {
    warning_window_seconds: 604_800,
    critical_window_seconds: 172_800,
  },
});

test("catalog exact count 14, all 4 classification categories present, and exact standing set of 3", () => {
  const catalog = getReceiptContractCatalog();
  assert.equal(catalog.length, 14, "Catalog must contain exactly 14 contracts");

  const categories = new Set(catalog.map((entry) => entry.classification));
  const expectedCategories = Object.values(RECEIPT_CLASSIFICATIONS);
  assert.equal(expectedCategories.length, 4);
  for (const cat of expectedCategories) {
    assert.equal(categories.has(cat), true, `Category ${cat} must be represented in catalog`);
  }

  const standing = getStandingRuntimeBlockingCatalog();
  assert.equal(standing.length, 3, "Standing runtime-blocking catalog must have exactly 3 contracts");
  assert.deepEqual(
    standing.map((entry) => entry.contract_id).sort(),
    ["backup_controller_activation", "ingress_writer_authority", "voice_plaud_writer_cutover_receipt"],
  );
});

test("every catalog entry source_ref exists on disk and contains claimed schema_version", () => {
  const catalog = getReceiptContractCatalog();
  for (const entry of catalog) {
    const fullPath = path.join(REPO_ROOT, entry.source_ref);
    assert.equal(fs.existsSync(fullPath), true, `source_ref file must exist: ${entry.source_ref}`);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.equal(
      content.includes(entry.schema_version),
      true,
      `File ${entry.source_ref} must contain schema_version ${entry.schema_version}`,
    );
  }
});

test("deep immutability of catalog and exports", () => {
  const catalog = getReceiptContractCatalog();
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog[0]), true);

  assert.throws(() => {
    // @ts-ignore
    catalog[0].classification = "hacked";
  }, TypeError);
});

test("arbitrary descriptor object injection is rejected", () => {
  const fakeDescriptor = {
    contract_id: "fake_contract",
    schema_version: "soulforge.fake.v1",
    classification: RECEIPT_CLASSIFICATIONS.SAME_AUTHORITY_LOCAL_AUTO_RENEW,
    standing_runtime_blocking: true,
  };

  // @ts-ignore
  const result = evaluateReceiptObservation(fakeDescriptor, {
    schema_version: "soulforge.fake.v1",
    expires_at: new Date(NOW + 100000).toISOString(),
  }, { now: NOW });

  assert.equal(result.status, RECEIPT_HEALTH_STATUSES.INVALID);
  assert.equal(result.diagnostic_code, "descriptor_object_injection_rejected");
  assert.equal(result.renewal_governance, RECEIPT_RENEWAL_GOVERNANCE.NONE);
});

test("strict UTC ISO timestamp validation and binding-owned windows", () => {
  const writerAuth = "ingress_writer_authority";

  // Non-strict ISO string (e.g. permissive Date string) must be rejected
  const badIsoObs = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    expires_at: "2026-08-21 12:00:00", // missing T and Z
  };
  const evalBadIso = evaluateReceiptObservation(writerAuth, badIsoObs, { now: NOW });
  assert.equal(evalBadIso.status, RECEIPT_HEALTH_STATUSES.INVALID);
  assert.equal(evalBadIso.diagnostic_code, "receipt_timestamp_not_strict_iso");

  // Valid strict ISO instant
  const validIsoObs = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    expires_at: new Date(NOW + 10 * 86_400 * 1000).toISOString(),
  };
  const evalValidIso = evaluateReceiptObservation(writerAuth, validIsoObs, { now: NOW });
  assert.equal(evalValidIso.status, RECEIPT_HEALTH_STATUSES.CURRENT);
  assert.equal(evalValidIso.renewal_governance, RECEIPT_RENEWAL_GOVERNANCE.SAME_AUTHORITY_LOCAL_POLICY);

  // Missing window for standing contract without canonical default (e.g., PLAUD) returns unknown
  const plaudId = "voice_plaud_writer_cutover_receipt";
  const plaudObs = {
    schema_version: "soulforge.voice.plaud_writer_cutover_receipt.v1",
    valid_until: new Date(NOW + 3 * 86_400 * 1000).toISOString(),
  };
  const evalPlaudNoWindow = evaluateReceiptObservation(plaudId, plaudObs, { now: NOW });
  assert.equal(evalPlaudNoWindow.status, RECEIPT_HEALTH_STATUSES.UNKNOWN);
  assert.equal(evalPlaudNoWindow.diagnostic_code, "warning_window_unconfigured");

  // Providing binding windows evaluates correctly
  const evalPlaudWithWindow = evaluateReceiptObservation(plaudId, plaudObs, {
    now: NOW,
    windows: DEFAULT_TEST_WINDOWS,
  });
  assert.equal(evalPlaudWithWindow.status, RECEIPT_HEALTH_STATUSES.WARNING);
  assert.equal(evalPlaudWithWindow.owner_action_required, true);
});

test("caller-supplied invalid window bounds fail closed as INVALID status", () => {
  const writerAuth = "ingress_writer_authority";
  const validIsoObs = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    expires_at: new Date(NOW + 10 * 86_400 * 1000).toISOString(),
  };

  // Malformed window bounds (warning <= critical) must return INVALID, never CURRENT
  const malformedEval = evaluateReceiptObservation(writerAuth, validIsoObs, {
    now: NOW,
    windows: {
      ingress_writer_authority: { warning_window_seconds: 100, critical_window_seconds: 200 },
    },
  });
  assert.equal(malformedEval.status, RECEIPT_HEALTH_STATUSES.INVALID);
  assert.equal(malformedEval.diagnostic_code, "receipt_window_bounds_invalid");
  assert.equal(malformedEval.owner_action_required, true);
});

test("expired PLAUD cutover incident has no execution authority and renewal_governance is owner_revalidation_required", () => {
  const plaudId = "voice_plaud_writer_cutover_receipt";
  const expiredPlaudObs = {
    schema_version: "soulforge.voice.plaud_writer_cutover_receipt.v1",
    valid_until: new Date(NOW - 3600 * 1000).toISOString(), // 1 hr ago
  };

  const evalExpired = evaluateReceiptObservation(plaudId, expiredPlaudObs, {
    now: NOW,
    windows: DEFAULT_TEST_WINDOWS,
  });
  assert.equal(evalExpired.status, RECEIPT_HEALTH_STATUSES.EXPIRED);
  assert.equal(evalExpired.owner_action_required, true);
  assert.equal(evalExpired.renewal_governance, RECEIPT_RENEWAL_GOVERNANCE.OWNER_REVALIDATION_REQUIRED);
  assert.equal(evalExpired.diagnostic_code, "receipt_expired");
  assert.ok(evalExpired.next_action.includes("fresh PLAUD cutover receipt"));
});

test("evaluateReceiptObservation rejects path leaks and privacy violations while allowing URL schemes", () => {
  const writerAuth = "ingress_writer_authority";

  // Real local path leaks are rejected
  const leakedWinPath = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    expires_at: new Date(NOW + 86_400 * 1000).toISOString(),
    local_path: ["C:", "Users", "user", "secret.json"].join("\\"),
  };
  assert.equal(evaluateReceiptObservation(writerAuth, leakedWinPath, { now: NOW }).status, RECEIPT_HEALTH_STATUSES.INVALID);

  const leakedUnixPath = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    expires_at: new Date(NOW + 86_400 * 1000).toISOString(),
    local_path: ["", "Users", "user", "secret.json"].join("/"),
  };
  assert.equal(evaluateReceiptObservation(writerAuth, leakedUnixPath, { now: NOW }).status, RECEIPT_HEALTH_STATUSES.INVALID);

  // URL schemes like https:// and http:// are allowed
  const urlObs = {
    schema_version: "soulforge.ingress.writer_authority.v1",
    expires_at: new Date(NOW + 10 * 86_400 * 1000).toISOString(),
    endpoint: "https://example.com/api/receipt",
  };
  assert.equal(evaluateReceiptObservation(writerAuth, urlObs, { now: NOW }).status, RECEIPT_HEALTH_STATUSES.CURRENT);
});

test("evaluateStandingReceiptProbes aggregates all standing runtime-blocking receipts", () => {
  const probes = {
    ingress_writer_authority: {
      schema_version: "soulforge.ingress.writer_authority.v1",
      expires_at: new Date(NOW + 10 * 86_400 * 1000).toISOString(),
    },
    voice_plaud_writer_cutover_receipt: {
      schema_version: "soulforge.voice.plaud_writer_cutover_receipt.v1",
      valid_until: new Date(NOW - 3600 * 1000).toISOString(),
    },
    backup_controller_activation: null,
  };

  const projection = evaluateStandingReceiptProbes(probes, {
    now: NOW,
    windows: DEFAULT_TEST_WINDOWS,
  });
  assert.equal(projection.schema_version, "soulforge.watchtower.receipt_health_projection.v1");
  assert.equal(projection.summary.total, 3); // 3 standing contracts
  assert.equal(projection.summary.current, 1);
  assert.equal(projection.summary.expired, 1);
  assert.equal(projection.summary.unknown, 1);
  assert.equal(projection.summary.owner_action_required_count, 2);
});
