import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ASSET_CLASS_LEDGER_HOLD_CODES as H,
  WHOLE_ESTATE_ASSET_CLASSES,
  appendAssetAcceptanceEvidence,
  appendAssetBackupEvidence,
  appendAssetRestoreEvidence,
  appendAssetRevisionRecord,
  createAssetClassRevisionLedger,
  projectAssetClassEvidenceRows,
  projectAssetRevisionIndex,
} from "../src/asset_class_revision_ledger.mjs";

const sha = (char) => `sha256:${char.repeat(64)}`;
const OWNERS = Object.freeze({
  logical: "owner.asset.logical",
  byte: "owner.asset.bytes",
  revision: "owner.asset.revision",
  acceptance: "owner.asset.acceptance",
  backup_restore: "owner.asset.backup_restore",
});

function revision(overrides = {}) {
  return {
    asset_class: "project_assets",
    asset_id: "asset.kvds.power-review",
    scope_kind: "project",
    scope_ref: "project.kvds",
    logical_asset_ref: "logical_asset.kvds.power-review",
    revision_ref: "artifact_revision.kvds.power-review.r1",
    revision_seq: 1,
    supersedes_revision_ref: null,
    content_digest: sha("a"),
    owner_refs: OWNERS,
    source_revision_ref: "source_revision.kvds.power-review.r1",
    custody_receipt_ref: "custody_receipt.kvds.power-review.r1",
    producer_ref: "agent.kvds.hw",
    created_at: "2026-08-31T00:00:00.000Z",
    observed_at: "2026-08-31T00:01:00.000Z",
    acceptance_state: "candidate",
    acceptance_ref: null,
    accepted_by_ref: null,
    backup_generation_ref: null,
    restore_test_ref: null,
    ...overrides,
  };
}

function acceptance(revisionIdentity, overrides = {}) {
  return {
    revision_identity: revisionIdentity,
    scope_kind: "project",
    scope_ref: "project.kvds",
    acceptance_state: "acceptance_evidence",
    acceptance_ref: "acceptance.kvds.power-review.r1",
    accepted_by_ref: OWNERS.acceptance,
    accepted_at: "2026-08-31T00:02:00.000Z",
    ...overrides,
  };
}

function backup(revisionIdentity, overrides = {}) {
  return {
    revision_identity: revisionIdentity,
    scope_kind: "project",
    scope_ref: "project.kvds",
    backup_generation_ref: "backup_generation.kvds.power-review.g1",
    backup_receipt_ref: "backup_receipt.kvds.power-review.g1",
    backup_owner_ref: OWNERS.backup_restore,
    content_digest: sha("a"),
    backed_up_at: "2026-08-31T00:03:00.000Z",
    ...overrides,
  };
}

function restore(revisionIdentity, overrides = {}) {
  return {
    revision_identity: revisionIdentity,
    scope_kind: "project",
    scope_ref: "project.kvds",
    backup_generation_ref: "backup_generation.kvds.power-review.g1",
    restore_test_ref: "restore_test.kvds.power-review.g1",
    restore_receipt_ref: "restore_receipt.kvds.power-review.g1",
    backup_owner_ref: OWNERS.backup_restore,
    readback_digest: sha("a"),
    restored_at: "2026-08-31T00:04:00.000Z",
    ...overrides,
  };
}

function appendRevision(ledger, overrides = {}) {
  return appendAssetRevisionRecord(ledger, revision(overrides));
}

test("projects all nine registered asset classes even before evidence exists", () => {
  const projected = projectAssetClassEvidenceRows(createAssetClassRevisionLedger(), {
    scope_kind: "organization", scope_ref: "organization.sonatech",
  });
  assert.equal(projected.status, "PROJECTED");
  assert.equal(projected.rows.length, 9);
  assert.deepEqual(projected.rows.map((row) => row.asset_class), WHOLE_ESTATE_ASSET_CLASSES);
  assert.ok(projected.rows.every((row) => row.row_key === `asset.${row.asset_class}`));
  assert.ok(projected.rows.every((row) => row.evidence_state === "no_evidence"));
});

test("revision record binds identity, scope, five owners, source/custody and candidate boundary", () => {
  const ledger = createAssetClassRevisionLedger();
  const appended = appendRevision(ledger);
  assert.equal(appended.status, "APPENDED");
  assert.match(appended.event.revision_identity, /^asset_revision:/u);
  const projected = projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  });
  assert.equal(projected.row_count, 1);
  const [row] = projected.rows;
  assert.deepEqual(row.owner_refs, OWNERS);
  assert.equal(row.source_revision_ref, "source_revision.kvds.power-review.r1");
  assert.equal(row.custody_receipt_ref, "custody_receipt.kvds.power-review.r1");
  assert.equal(row.acceptance_state, "candidate");
  assert.equal(row.authority_boundary.acceptance_granted, false);
  assert.equal(row.authority_boundary.byte_authority_created, false);
});

test("exact replay is NO_OP while a divergent record at the natural identity is conflict", () => {
  const ledger = createAssetClassRevisionLedger();
  const first = appendRevision(ledger);
  assert.equal(appendRevision(ledger).status, "NO_OP");
  assert.equal(appendRevision(ledger, { content_digest: sha("b") }).hold_code, H.REVISION_CONFLICT);
  assert.equal(projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).row_count, 1);
  assert.equal(first.append_seq, 1);
});

test("revisions supersede the exact head monotonically and projections keep the lineage", () => {
  const ledger = createAssetClassRevisionLedger();
  appendRevision(ledger);
  assert.equal(appendRevision(ledger, {
    revision_ref: "artifact_revision.kvds.power-review.r2",
    revision_seq: 2,
    supersedes_revision_ref: "artifact_revision.kvds.power-review.r1",
    content_digest: sha("b"),
    source_revision_ref: "source_revision.kvds.power-review.r2",
    custody_receipt_ref: "custody_receipt.kvds.power-review.r2",
    created_at: "2026-08-31T01:00:00.000Z",
    observed_at: "2026-08-31T01:01:00.000Z",
  }).status, "APPENDED");
  assert.equal(appendRevision(ledger, {
    revision_ref: "artifact_revision.kvds.power-review.parallel",
    revision_seq: 3,
    supersedes_revision_ref: "artifact_revision.kvds.power-review.r1",
    content_digest: sha("c"),
    source_revision_ref: "source_revision.kvds.power-review.parallel",
    custody_receipt_ref: "custody_receipt.kvds.power-review.parallel",
    created_at: "2026-08-31T02:00:00.000Z",
    observed_at: "2026-08-31T02:01:00.000Z",
  }).hold_code, H.SUPERSESSION_REQUIRED);
  const rows = projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].is_head, false);
  assert.equal(rows[0].superseded_by_revision_ref, rows[1].revision_ref);
  assert.equal(rows[1].is_head, true);
});

test("missing, stale, backwards-time and non-monotonic revisions fail closed", () => {
  assert.equal(appendRevision(createAssetClassRevisionLedger(), {
    revision_seq: 2,
    revision_ref: "artifact_revision.kvds.power-review.r2",
    supersedes_revision_ref: "artifact_revision.kvds.power-review.r1",
  }).hold_code, H.SUPERSESSION_REQUIRED);
  const ledger = createAssetClassRevisionLedger();
  appendRevision(ledger);
  const shared = {
    revision_ref: "artifact_revision.kvds.power-review.r2",
    supersedes_revision_ref: "artifact_revision.kvds.power-review.r1",
    source_revision_ref: "source_revision.kvds.power-review.r2",
    custody_receipt_ref: "custody_receipt.kvds.power-review.r2",
  };
  assert.equal(appendRevision(ledger, { ...shared, revision_seq: 1 }).hold_code, H.NON_MONOTONIC_REVISION);
  assert.equal(appendRevision(ledger, {
    ...shared, revision_seq: 2,
    created_at: "2026-08-30T23:00:00.000Z",
    observed_at: "2026-08-30T23:01:00.000Z",
  }).hold_code, H.REVISION_TIME_REGRESSION);
});

test("impossible UTC calendar dates are rejected for every event type", () => {
  const invalidRevisionLedger = createAssetClassRevisionLedger();
  assert.equal(appendRevision(invalidRevisionLedger, {
    created_at: "2026-02-30T00:00:00.000Z",
    observed_at: "2026-03-01T00:00:00.000Z",
  }).hold_code, H.FIELD_INVALID);
  assert.equal(appendRevision(invalidRevisionLedger, {
    created_at: "2026-02-28T00:00:00.000Z",
    observed_at: "2026-02-30T00:00:00.000Z",
  }).hold_code, H.FIELD_INVALID);

  const ledger = createAssetClassRevisionLedger();
  const record = appendRevision(ledger).event;
  assert.equal(appendAssetAcceptanceEvidence(ledger, acceptance(record.revision_identity, {
    accepted_at: "2026-02-30T00:02:00.000Z",
  })).hold_code, H.FIELD_INVALID);
  assert.equal(appendAssetBackupEvidence(ledger, backup(record.revision_identity, {
    backed_up_at: "2026-04-31T00:03:00.000Z",
  })).hold_code, H.FIELD_INVALID);
  assert.equal(appendAssetBackupEvidence(ledger, backup(record.revision_identity)).status, "APPENDED");
  assert.equal(appendAssetRestoreEvidence(ledger, restore(record.revision_identity, {
    restored_at: "2026-02-29T00:04:00.000Z",
  })).hold_code, H.FIELD_INVALID);

  const leapLedger = createAssetClassRevisionLedger();
  assert.equal(appendRevision(leapLedger, {
    created_at: "2028-02-29T00:00:00.1Z",
    observed_at: "2028-02-29T00:00:00.100Z",
  }).status, "APPENDED", "valid leap day and normalized fractional UTC compare equally");
});

test("acceptance evidence is separate, exact-owner, and cannot be self-promoted", () => {
  const ledger = createAssetClassRevisionLedger();
  const record = appendRevision(ledger).event;
  assert.equal(appendAssetAcceptanceEvidence(ledger, acceptance(record.revision_identity, {
    accepted_by_ref: "agent.kvds.hw",
  })).hold_code, H.ACCEPTANCE_OWNER_MISMATCH);

  const selfOwned = createAssetClassRevisionLedger();
  const selfRecord = appendRevision(selfOwned, {
    producer_ref: OWNERS.acceptance,
  }).event;
  assert.equal(appendAssetAcceptanceEvidence(selfOwned,
    acceptance(selfRecord.revision_identity)).hold_code, H.ACCEPTANCE_SELF_PROMOTION);

  const accepted = appendAssetAcceptanceEvidence(ledger, acceptance(record.revision_identity));
  assert.equal(accepted.status, "APPENDED");
  assert.equal(appendAssetAcceptanceEvidence(ledger, acceptance(record.revision_identity)).status, "NO_OP");
  const [projected] = projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).rows;
  assert.equal(projected.acceptance_state, "acceptance_evidence_present");
  assert.equal(projected.authority_boundary.acceptance_granted, false);
});

test("backup and restore are separate evidence and restore requires an exact backup digest chain", () => {
  const ledger = createAssetClassRevisionLedger();
  const record = appendRevision(ledger).event;
  assert.equal(appendAssetRestoreEvidence(ledger, restore(record.revision_identity)).hold_code,
    H.RESTORE_WITHOUT_BACKUP);
  assert.equal(appendAssetBackupEvidence(ledger, backup(record.revision_identity, {
    content_digest: sha("b"),
  })).hold_code, H.BACKUP_DIGEST_MISMATCH);
  assert.equal(appendAssetBackupEvidence(ledger, backup(record.revision_identity)).status, "APPENDED");
  let [projected] = projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).rows;
  assert.equal(projected.backup_state, "evidence_present");
  assert.equal(projected.restore_state, "no_evidence");
  assert.equal(appendAssetRestoreEvidence(ledger, restore(record.revision_identity, {
    readback_digest: sha("b"),
  })).hold_code, H.RESTORE_DIGEST_MISMATCH);
  assert.equal(appendAssetRestoreEvidence(ledger, restore(record.revision_identity)).status, "APPENDED");
  [projected] = projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).rows;
  assert.equal(projected.restore_state, "evidence_present");
  assert.equal(projected.authority_boundary.backup_or_restore_performed, false);
});

test("R3-ready class rows distinguish no evidence, partial and complete evidence", () => {
  const ledger = createAssetClassRevisionLedger();
  const record = appendRevision(ledger).event;
  let rows = projectAssetClassEvidenceRows(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).rows;
  assert.equal(rows.find((row) => row.asset_class === "project_assets").evidence_state, "partial");
  appendAssetAcceptanceEvidence(ledger, acceptance(record.revision_identity));
  appendAssetBackupEvidence(ledger, backup(record.revision_identity));
  appendAssetRestoreEvidence(ledger, restore(record.revision_identity));
  rows = projectAssetClassEvidenceRows(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).rows;
  const projectAssets = rows.find((row) => row.asset_class === "project_assets");
  assert.equal(projectAssets.evidence_state, "evidence_complete");
  assert.equal(projectAssets.asset_count, 1);
  assert.equal(projectAssets.revision_count, 1);
  assert.equal(projectAssets.authority_boundary.acceptance_granted, false);
});

test("scope projections and evidence lookup isolate project and organization records", () => {
  const ledger = createAssetClassRevisionLedger();
  const projectRecord = appendRevision(ledger).event;
  appendRevision(ledger, {
    asset_class: "knowledge",
    asset_id: "asset.org.engineering-rule",
    scope_kind: "organization",
    scope_ref: "organization.sonatech",
    logical_asset_ref: "logical_asset.org.engineering-rule",
    revision_ref: "knowledge_revision.org.engineering-rule.r1",
    source_revision_ref: "source_revision.org.engineering-rule.r1",
    custody_receipt_ref: "custody_receipt.org.engineering-rule.r1",
  });
  assert.equal(projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  }).row_count, 1);
  assert.equal(projectAssetRevisionIndex(ledger, {
    scope_kind: "organization", scope_ref: "organization.sonatech",
  }).row_count, 1);
  const foreign = appendAssetAcceptanceEvidence(ledger, acceptance(projectRecord.revision_identity, {
    scope_ref: "project.msh",
  }));
  const absent = appendAssetAcceptanceEvidence(ledger, acceptance("asset_revision:absent", {
    scope_ref: "project.msh",
  }));
  assert.deepEqual(foreign, absent);
  assert.equal(foreign.hold_code, H.REVISION_UNAVAILABLE);
});

test("all nine asset classes accept refs-only first revisions and remain byte-authority neutral", () => {
  const ledger = createAssetClassRevisionLedger();
  for (const [index, assetClass] of WHOLE_ESTATE_ASSET_CLASSES.entries()) {
    assert.equal(appendRevision(ledger, {
      asset_class: assetClass,
      asset_id: `asset.org.${assetClass}`,
      scope_kind: "organization",
      scope_ref: "organization.sonatech",
      logical_asset_ref: `logical_asset.org.${assetClass}`,
      revision_ref: `asset_revision_ref.org.${assetClass}.r1`,
      content_digest: sha(String((index + 1) % 10)),
      source_revision_ref: `source_revision.org.${assetClass}.r1`,
      custody_receipt_ref: `custody_receipt.org.${assetClass}.r1`,
    }).status, "APPENDED", assetClass);
  }
  const rows = projectAssetClassEvidenceRows(ledger, {
    scope_kind: "organization", scope_ref: "organization.sonatech",
  }).rows;
  assert.ok(rows.every((row) => row.asset_count === 1));
  assert.ok(rows.every((row) => row.authority_boundary.byte_authority_created === false));
});

test("raw, path, secret, accessor, unknown class and hostile input are fixed redacted HOLDs", () => {
  const ledger = createAssetClassRevisionLedger();
  assert.equal(appendAssetRevisionRecord(ledger, { ...revision(), raw_bytes: "body" }).hold_code,
    H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  const localPath = ["C:", "Users", "person", "file.bin"].join("/");
  assert.equal(appendRevision(ledger, { source_revision_ref: localPath }).hold_code,
    H.LOCAL_PATH_VALUE_FORBIDDEN);
  const secret = ["Bearer", "not-a-real-secret-value"].join(" ");
  assert.equal(appendRevision(ledger, { custody_receipt_ref: secret }).hold_code,
    H.SECRET_VALUE_FORBIDDEN);
  assert.equal(appendRevision(ledger, { asset_class: "unregistered_class" }).hold_code,
    H.ASSET_CLASS_INVALID);
  const accessor = revision();
  Object.defineProperty(accessor, "asset_id", {
    enumerable: true, get() { throw new Error("must not run"); },
  });
  assert.equal(appendAssetRevisionRecord(ledger, accessor).hold_code,
    H.ACCESSOR_PROPERTY_FORBIDDEN);
  const hostile = new Proxy({}, { ownKeys() { throw new Error("hostile"); } });
  assert.equal(appendAssetRevisionRecord(ledger, hostile).hold_code, H.HOSTILE_INPUT_REFUSED);
});

test("ledger state is WeakMap-private and all consumer projections are deeply frozen", () => {
  const ledger = createAssetClassRevisionLedger();
  appendRevision(ledger);
  assert.deepEqual(Object.keys(ledger), ["kind"]);
  const projected = projectAssetRevisionIndex(ledger, {
    scope_kind: "project", scope_ref: "project.kvds",
  });
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.rows), true);
  assert.equal(Object.isFrozen(projected.rows[0]), true);
  assert.equal(Object.isFrozen(projected.rows[0].owner_refs), true);
  assert.throws(() => { projected.rows[0].asset_id = "tampered"; }, TypeError);
  assert.equal(projectAssetRevisionIndex(Object.freeze({ kind: ledger.kind }), {
    scope_kind: "project", scope_ref: "project.kvds",
  }).hold_code, H.UNKNOWN_LEDGER);
});

test("module has no filesystem, provider, process, clock or authority mutation surface", () => {
  const source = readFileSync(new URL("../src/asset_class_revision_ledger.mjs", import.meta.url), "utf8");
  assert.equal(source.includes(String.fromCharCode(0)), false);
  for (const forbidden of [
    "node:fs", "node:net", "node:http", "node:https", "node:child_process",
    "node:dgram", "node:worker_threads", "node:cluster", "node:v8", "node:vm",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  for (const pattern of [
    /\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u,
    /new\s+Function\s*\(/u, /\bprocess\./u, /\bglobalThis\./u,
    /\bDate\.now\s*\(/u, /new\s+Date\s*\(/u, /\bMath\.random\s*\(/u,
  ]) assert.equal(pattern.test(source), false, String(pattern));
  for (const forbiddenCall of [
    "writeFile(", "mkdir(", "rename(", "unlink(", "acceptRevision(",
    "performBackup(", "performRestore(", "task_complete(",
  ]) assert.equal(source.includes(forbiddenCall), false, forbiddenCall);
});
