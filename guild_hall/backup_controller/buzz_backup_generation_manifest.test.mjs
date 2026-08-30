import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUZZ_BACKUP_GENERATION_HOLD_CODES as C,
  BUZZ_BACKUP_GENERATION_PACKET_SCHEMA_VERSION,
  deriveBuzzBackupGenerationDigest,
  evaluateBuzzBackupGenerationManifest,
} from "./buzz_backup_generation_manifest.mjs";

function hex(seed) {
  return createHash("sha256").update(String(seed)).digest("hex");
}

function ref(seed, contentId = null) {
  const h = hex(seed);
  return {
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: contentId ?? `sha256:${h}`,
    content_hash_alg: "sha256",
  };
}

function validPacket() {
  const scope = ref("buzz-owner-only-pilot-scope");
  const postgresDigest = `sha256:${hex("postgres-snapshot")}`;
  const mediaDigest = `sha256:${hex("media-inventory")}`;
  const gitDigest = `sha256:${hex("git-revision")}`;
  const redisDigest = `sha256:${hex("redis-canonical-events")}`;
  const generationDigest = `sha256:${hex("buzz-generation")}`;
  const packet = {
    schema_version: BUZZ_BACKUP_GENERATION_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    generation: {
      generation_id: "buzz-generation-20260831-001",
      generation_ref: ref("buzz-generation-ref"),
      generated_at_utc: "2026-08-31T01:00:00.000Z",
      retention_policy_ref: ref("retention-policy"),
      rpo_policy_ref: ref("rpo-policy"),
      rto_policy_ref: ref("rto-policy"),
      encryption_policy_ref: ref("encryption-policy"),
      encryption_secret_ref: ref("protected-secret-ref"),
      secret_material_included: false,
    },
    scope_ref: scope,
    deployment: {
      scope_ref: scope,
      deployment_ref: ref("buzz-deployment"),
      app_ref: ref("buzz-app"),
      app_version_ref: ref("buzz-app-version"),
      schema_ref: ref("buzz-schema"),
      migration_ref: ref("buzz-migration"),
      config_ref: ref("buzz-config"),
    },
    owners: {
      logical_owner_ref: ref("logical-owner"),
      byte_owner_ref: ref("byte-owner"),
      revision_owner_ref: ref("revision-owner"),
      acceptance_owner_ref: ref("acceptance-owner"),
      backup_restore_owner_ref: ref("backup-restore-owner"),
    },
    postgres: {
      scope_ref: scope,
      logical_snapshot_ref: ref("postgres-ref", postgresDigest),
      snapshot_digest: postgresDigest,
      snapshot_record_count: 42,
      capture_state: "captured",
    },
    media: {
      scope_ref: scope,
      object_inventory_ref: ref("media-ref", mediaDigest),
      inventory_digest: mediaDigest,
      object_count: 3,
      capture_state: "captured",
      bytes_embedded: false,
    },
    git: {
      scope_ref: scope,
      data_ref: ref("git-data-ref"),
      revision_ref: ref("git-revision-ref", gitDigest),
      revision_digest: gitDigest,
      capture_state: "captured",
      raw_repository_embedded: false,
    },
    redis: {
      scope_ref: scope,
      subsets: [
        {
          subset_id: "cache.ephemeral",
          scope_ref: scope,
          classification: "ephemeral",
          proof_kind: "ephemeral_exclusion",
          proof_ref: ref("redis-ephemeral-proof"),
          backup_digest: null,
          backup_captured: false,
        },
        {
          subset_id: "events.canonical",
          scope_ref: scope,
          classification: "canonical",
          proof_kind: "backup_capture",
          proof_ref: ref("redis-canonical-proof", redisDigest),
          backup_digest: redisDigest,
          backup_captured: true,
        },
        {
          subset_id: "presence.rebuildable",
          scope_ref: scope,
          classification: "rebuildable",
          proof_kind: "deterministic_rebuild",
          proof_ref: ref("redis-rebuild-proof"),
          backup_digest: null,
          backup_captured: false,
        },
      ],
    },
    backup_capture: {
      scope_ref: scope,
      state: "captured",
      receipt_ref: ref("backup-capture-receipt"),
      generation_digest: generationDigest,
      captured_at_utc: "2026-08-31T01:05:00.000Z",
    },
    isolated_restore: {
      scope_ref: scope,
      state: "verified",
      receipt_ref: ref("isolated-restore-receipt"),
      source_generation_digest: generationDigest,
      restored_generation_digest: generationDigest,
      exact_readback: true,
      verified_at_utc: "2026-08-31T01:10:00.000Z",
    },
    audit_integrity: {
      scope_ref: scope,
      state: "verified",
      receipt_ref: ref("audit-receipt"),
      audit_log_ref: ref("audit-log"),
      expected_generation_digest: generationDigest,
      observed_generation_digest: generationDigest,
      verified_at_utc: "2026-08-31T01:11:00.000Z",
    },
    identity_recovery: {
      scope_ref: scope,
      state: "recovery_verified",
      public_identity_catalog_ref: ref("public-identity-catalog"),
      recovery_procedure_ref: ref("identity-recovery-procedure"),
      rotation_policy_ref: ref("identity-rotation-policy"),
      revocation_policy_ref: ref("identity-revocation-policy"),
      recovery_owner_ref: ref("identity-recovery-owner"),
      recovery_receipt_ref: ref("identity-recovery-receipt"),
      protected_secret_ref: ref("identity-protected-secret-ref"),
      private_material_included: false,
      verified_at_utc: "2026-08-31T01:12:00.000Z",
    },
    human_acceptance: {
      scope_ref: scope,
      state: "accepted",
      reviewer_ref: ref("human-reviewer"),
      decision_ref: ref("human-decision"),
      decided_at_utc: "2026-08-31T01:15:00.000Z",
      acceptance_scope: "backup_generation_only",
      task_result_acceptance: false,
      project_knowledge_acceptance: false,
    },
  };
  const boundGenerationDigest = deriveBuzzBackupGenerationDigest(packet);
  assert.match(boundGenerationDigest, /^sha256:[0-9a-f]{64}$/u);
  packet.backup_capture.generation_digest = boundGenerationDigest;
  packet.isolated_restore.source_generation_digest = boundGenerationDigest;
  packet.isolated_restore.restored_generation_digest = boundGenerationDigest;
  packet.audit_integrity.expected_generation_digest = boundGenerationDigest;
  packet.audit_integrity.observed_generation_digest = boundGenerationDigest;
  return packet;
}

function trustedDigest(packet) {
  return evaluateBuzzBackupGenerationManifest(packet).receipt.packet_sha256;
}

test("exact ref-bound Buzz backup proof accepts only the backup generation", () => {
  const packet = validPacket();
  const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
  assert.equal(result.status, "ACCEPTED_BACKUP_GENERATION", JSON.stringify(result));
  assert.deepEqual(result.blocker_codes, []);
  assert.equal(result.receipt.backup_capture_state, "captured");
  assert.equal(result.receipt.isolated_restore_readback_state, "verified");
  assert.equal(result.receipt.audit_integrity_state, "verified");
  assert.equal(result.receipt.identity_recovery_state, "verified");
  assert.equal(result.receipt.human_acceptance_state, "accepted");
  assert.equal(result.receipt.bound_generation_digest, packet.backup_capture.generation_digest);
  assert.equal(result.receipt.authority.backup_generation_accepted, true);
  assert.equal(result.receipt.authority.task_result_acceptance, false);
  assert.equal(result.receipt.authority.official_task_completion, false);
  assert.equal(result.receipt.authority.project_artifact_acceptance, false);
  assert.equal(result.receipt.authority.project_knowledge_acceptance, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.receipt.authority), true);
});

test("the pure contract requires an independently supplied exact packet pin", () => {
  const packet = validPacket();
  const preview = evaluateBuzzBackupGenerationManifest(packet);
  assert.equal(preview.status, "HOLD");
  assert.ok(preview.blocker_codes.includes(C.TRUSTED_PIN_REQUIRED));

  const wrong = evaluateBuzzBackupGenerationManifest(packet, `sha256:${"00".repeat(32)}`);
  assert.equal(wrong.status, "HOLD");
  assert.ok(wrong.blocker_codes.includes(C.TRUSTED_PIN_MISMATCH));
  assert.equal(wrong.receipt.authority.backup_generation_accepted, false);

  const hostile = evaluateBuzzBackupGenerationManifest(packet, Symbol("pin"));
  assert.equal(hostile.status, "HOLD");
  assert.ok(hostile.blocker_codes.includes(C.TRUSTED_PIN_MISMATCH));
});

test("technical backup evidence remains HOLD until separate human acceptance", () => {
  const packet = validPacket();
  packet.human_acceptance.state = "pending";
  packet.human_acceptance.decision_ref = null;
  packet.human_acceptance.decided_at_utc = null;
  const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
  assert.equal(result.status, "HOLD");
  assert.ok(result.blocker_codes.includes(C.HUMAN_ACCEPTANCE_REQUIRED));
  assert.equal(result.receipt.backup_capture_state, "captured");
  assert.equal(result.receipt.isolated_restore_readback_state, "verified");
  assert.equal(result.receipt.authority.backup_generation_accepted, false);
  assert.equal(result.receipt.authority.task_result_acceptance, false);
});

test("a rejected human review is not converted into backup acceptance", () => {
  const packet = validPacket();
  packet.human_acceptance.state = "rejected";
  const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
  assert.equal(result.status, "HOLD");
  assert.ok(result.blocker_codes.includes(C.HUMAN_ACCEPTANCE_REJECTED));
  assert.equal(result.receipt.human_acceptance_state, "rejected");
});

test("restore and audit must independently read back the same generation digest", () => {
  for (const mutate of [
    (packet) => { packet.isolated_restore.restored_generation_digest = `sha256:${"11".repeat(32)}`; },
    (packet) => { packet.isolated_restore.exact_readback = false; },
    (packet) => { packet.audit_integrity.observed_generation_digest = `sha256:${"22".repeat(32)}`; },
    (packet) => { packet.audit_integrity.state = "unknown"; },
  ]) {
    const packet = validPacket();
    mutate(packet);
    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    assert.equal(result.receipt.authority.backup_generation_accepted, false);
  }
});

test("capture, restore, audit, identity proof, and human decision follow causal time order", () => {
  const mutations = [
    (packet) => { packet.backup_capture.captured_at_utc = "2026-08-31T00:59:00.000Z"; },
    (packet) => { packet.isolated_restore.verified_at_utc = "2026-08-31T01:04:00.000Z"; },
    (packet) => { packet.audit_integrity.verified_at_utc = "2026-08-31T01:04:00.000Z"; },
    (packet) => { packet.identity_recovery.verified_at_utc = "2026-08-31T00:59:00.000Z"; },
    (packet) => { packet.human_acceptance.decided_at_utc = "2026-08-31T01:09:00.000Z"; },
  ];
  for (const mutate of mutations) {
    const packet = validPacket();
    mutate(packet);
    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    assert.equal(result.receipt.authority.backup_generation_accepted, false);
  }
});

test("Postgres, media, and Git digests are bound to their exact revision refs", () => {
  for (const field of ["postgres", "media", "git"]) {
    const packet = validPacket();
    if (field === "postgres") packet.postgres.snapshot_digest = `sha256:${"31".repeat(32)}`;
    if (field === "media") packet.media.inventory_digest = `sha256:${"32".repeat(32)}`;
    if (field === "git") packet.git.revision_digest = `sha256:${"33".repeat(32)}`;
    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    const expected = {
      postgres: C.POSTGRES_CAPTURE_INVALID,
      media: C.MEDIA_CAPTURE_INVALID,
      git: C.GIT_CAPTURE_INVALID,
    }[field];
    assert.ok(result.blocker_codes.includes(expected));
  }
});

test("the generation digest binds every store component plus scope, deployment, and generation refs", () => {
  const mutations = [
    (packet) => { packet.postgres.snapshot_record_count += 1; },
    (packet) => { packet.media.object_count += 1; },
    (packet) => { packet.git.data_ref = ref("replacement-git-data-ref"); },
    (packet) => { packet.redis.subsets[2].proof_ref = ref("replacement-redis-rebuild-proof"); },
    (packet) => { packet.deployment.app_version_ref = ref("replacement-app-version-ref"); },
    (packet) => { packet.generation.generation_ref = ref("replacement-generation-ref"); },
  ];
  for (const mutate of mutations) {
    const packet = validPacket();
    const originalDigest = packet.backup_capture.generation_digest;
    mutate(packet);
    const recomputedDigest = deriveBuzzBackupGenerationDigest(packet);
    assert.match(recomputedDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.notEqual(recomputedDigest, originalDigest);

    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    assert.ok(result.blocker_codes.includes(C.BACKUP_CAPTURE_INVALID));
    assert.ok(result.blocker_codes.includes(C.ISOLATED_RESTORE_INVALID));
    assert.ok(result.blocker_codes.includes(C.AUDIT_INTEGRITY_INVALID));
    assert.equal(result.receipt.bound_generation_digest, recomputedDigest);
    assert.equal(result.receipt.authority.backup_generation_accepted, false);
  }
});

test("every Redis subset needs classification-specific backup or rebuild evidence", () => {
  const mutations = [
    (subsets) => { subsets[1].backup_captured = false; },
    (subsets) => { subsets[2].backup_digest = `sha256:${"44".repeat(32)}`; },
    (subsets) => { subsets[0].proof_kind = "backup_capture"; },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    const packet = validPacket();
    mutations[index](packet.redis.subsets);
    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    assert.ok(result.blocker_codes.includes(C.REDIS_CLASSIFICATION_INVALID), JSON.stringify(result));
  }

  const reordered = validPacket();
  reordered.redis.subsets.reverse();
  const result = evaluateBuzzBackupGenerationManifest(reordered, trustedDigest(reordered));
  assert.equal(result.status, "HOLD");
  assert.ok(result.blocker_codes.includes(C.REDIS_CLASSIFICATION_INVALID));
});

test("cross-scope component data is rejected", () => {
  const packet = validPacket();
  packet.media.scope_ref = ref("foreign-project-scope");
  const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
  assert.equal(result.status, "HOLD");
  assert.ok(result.blocker_codes.includes(C.CROSS_SCOPE_DATA));
  assert.ok(result.blocker_codes.includes(C.MEDIA_CAPTURE_INVALID));
});

test("raw message or media bytes, local paths, and secret material fail closed without reflection", () => {
  const cases = [
    (packet) => { packet.media.media_bytes = "private-media-body"; },
    (packet) => { packet.deployment.config_ref.content_id = ["C:", "protected", "buzz", "config.json"].join("/"); },
    (packet) => { packet.identity_recovery.protected_secret_ref.content_id = "Bearer definitely-secret-token"; },
    (packet) => { packet.identity_recovery.private_key = "-----BEGIN PRIVATE KEY-----"; },
  ];
  for (const mutate of cases) {
    const packet = validPacket();
    mutate(packet);
    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    assert.ok(result.blocker_codes.includes(C.RAW_OR_SECRET_FORBIDDEN));
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("private-media-body"), false);
    assert.equal(serialized.includes("definitely-secret-token"), false);
    assert.equal(serialized.includes("PRIVATE KEY"), false);
    assert.equal(serialized.includes(["C:", "protected"].join("/")), false);
  }
});

test("boolean all-green claims cannot replace exact receipts, refs, digests, and counts", () => {
  const packet = validPacket();
  packet.backup_capture = {
    all_green: true,
    backup_captured: true,
    restore_verified: true,
    audit_verified: true,
  };
  const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
  assert.equal(result.status, "HOLD");
  assert.ok(result.blocker_codes.includes(C.BACKUP_CAPTURE_INVALID));
  assert.ok(result.blocker_codes.includes(C.ISOLATED_RESTORE_INVALID));
  assert.ok(result.blocker_codes.includes(C.AUDIT_INTEGRITY_INVALID));
});

test("missing app, schema, migration, config, owner, retention, RPO, RTO, or identity refs remain HOLD", () => {
  const mutations = [
    (packet) => { packet.deployment.app_ref = null; },
    (packet) => { packet.deployment.schema_ref = null; },
    (packet) => { packet.deployment.migration_ref = null; },
    (packet) => { packet.deployment.config_ref = null; },
    (packet) => { packet.owners.backup_restore_owner_ref = null; },
    (packet) => { packet.generation.retention_policy_ref = null; },
    (packet) => { packet.generation.rpo_policy_ref = null; },
    (packet) => { packet.generation.rto_policy_ref = null; },
    (packet) => { packet.identity_recovery.recovery_owner_ref = null; },
  ];
  for (const mutate of mutations) {
    const packet = validPacket();
    mutate(packet);
    const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
    assert.equal(result.status, "HOLD");
    assert.equal(result.receipt.authority.backup_generation_accepted, false);
  }
});

test("proxy, getter, cycle, caller mutation, and malformed trusted pins fail safely", () => {
  const proxy = new Proxy(validPacket(), {});
  assert.ok(evaluateBuzzBackupGenerationManifest(proxy).blocker_codes.includes(C.INPUT_INVALID));

  const getter = validPacket();
  Object.defineProperty(getter, "feature_state", { enumerable: true, get() { throw new Error("do not call"); } });
  assert.ok(evaluateBuzzBackupGenerationManifest(getter).blocker_codes.includes(C.INPUT_INVALID));

  const cycle = validPacket();
  cycle.loop = cycle;
  assert.ok(evaluateBuzzBackupGenerationManifest(cycle).blocker_codes.includes(C.INPUT_INVALID));

  const packet = validPacket();
  const result = evaluateBuzzBackupGenerationManifest(packet, trustedDigest(packet));
  packet.generation.generation_id = "mutated";
  assert.equal(result.receipt.generation_id, "buzz-generation-20260831-001");

  const malformed = evaluateBuzzBackupGenerationManifest(validPacket(), "sha256:not-a-pin");
  assert.ok(malformed.blocker_codes.includes(C.TRUSTED_PIN_MISMATCH));
});

test("the implementation has no filesystem, database, network, process, or clock execution surface", async () => {
  const source = await readFile(new URL("./buzz_backup_generation_manifest.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    /node:fs/u, /node:net/u, /node:http/u, /node:https/u, /node:child_process/u,
    /process\./u, /Date\.(?:now|parse)/u, /new\s+Date/u, /fetch\s*\(/u,
  ]) assert.equal(forbidden.test(source), false, `forbidden surface: ${forbidden}`);

  const result = evaluateBuzzBackupGenerationManifest(validPacket(), trustedDigest(validPacket()));
  assert.deepEqual(result.receipt.effects, {
    filesystem_reads: 0,
    filesystem_writes: 0,
    database_calls: 0,
    network_calls: 0,
    process_calls: 0,
    clock_reads: 0,
  });
});
