import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION,
  LINEAR_LB1_V2_DIMENSIONS,
  LINEAR_LB1_ZERO_EFFECTS,
  LinearLb1V2Error,
  collectFeatureOffLinearLb1V2Fixture,
  createFailedFeatureOffLinearLb1V2Collection,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import {
  LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
  createLinearLb1OneShotRunner,
} from "./linear_lb1_one_shot_runner.mjs";
import {
  LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
  evaluateLinearLb1OwnerGateV2,
} from "./linear_lb1_owner_gate_v2.mjs";
import {
  HELD_LINEAR_LB1_RUNTIME_ADAPTERS,
  HELD_LINEAR_LB1_RUNTIME_CLAIM_ADAPTER,
  HELD_LINEAR_LB1_RUNTIME_READER_ADAPTER,
  HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER,
  LINEAR_LB1_RUNTIME_ADAPTERS_SCHEMA_VERSION,
  LinearLb1RuntimeAdapterError,
  createLinearLb1RuntimeAdapters,
  createLinearLb1RuntimeClaimAdapter,
  createLinearLb1RuntimeReaderAdapter,
  createLinearLb1RuntimeStorageAdapter,
} from "./linear_lb1_runtime_adapters.mjs";
import {
  makeCompleteLinearLb1V2Fixture,
} from "./linear_lb1_v2_fixture.mjs";

function hexSeed(seed) {
  return createHash("sha256").update(String(seed)).digest("hex");
}

function ref(seed, contentId) {
  const h = hexSeed(seed);
  const actualContentId = contentId ?? `sha256:${h}`;
  return {
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: actualContentId,
    content_hash_alg: "sha256",
  };
}

const CLAIM_REF = ref("claim_store_runtime_01");
const READER_REF = ref("linear_reader_runtime_01");
const STORAGE_REF = ref("storage_adapter_runtime_01");
const WORKSPACE_REF = ref("workspace_runtime_01");
const CREDENTIAL_REF = ref("credential_runtime_01");
const TARGET_REF = ref("target_runtime_01");
const AUTHORITY_REF = ref("storage_authority_runtime_01");
const REVIEWER_REF = ref("human_reviewer_runtime_01");

function makeTestClock(nowIso = "2026-08-20T00:30:00.000Z") {
  let currentMs = Date.parse(nowIso);
  return {
    nowIso() {
      return new Date(currentMs).toISOString();
    },
    nowMs() {
      return currentMs;
    },
    advance(ms) {
      currentMs += ms;
    },
  };
}

function makeClosedRequest(token = "single-use-token-runtime-001", targetId = "target-revision-runtime-001") {
  return {
    schema_version: LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    owner_decision: {
      state: "approved",
      decision_ref: ref("decision_runtime_01"),
      approved_at_utc: "2026-08-20T00:00:00.000Z",
      expires_at_utc: "2026-08-21T00:00:00.000Z",
    },
    writer_identity: {
      writer_id: "soulforge-main-node-01",
      hostname: "soulforge-hpp-host",
      platform: "win32",
      epoch: 1,
    },
    source: {
      provider: "linear",
      scope_mode: "entire_workspace",
      workspace_ref: WORKSPACE_REF,
      team_ids: [],
      project_ids: [],
      credential_ref: CREDENTIAL_REF,
      credential_scope: "read_only",
      dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
    },
    target: {
      kind: "google_drive_folder",
      target_ref: ref(targetId),
      display_label: "Soulforge Linear LB1 v2 Backup Target",
      storage_write_authority_ref: AUTHORITY_REF,
      create_only: true,
      overwrite_allowed: false,
      public_share_allowed: false,
    },
    claim_store: {
      claim_store_ref: CLAIM_REF,
      single_use_token: token,
    },
    adapters: {
      linear_reader_adapter_ref: READER_REF,
      storage_adapter_ref: STORAGE_REF,
    },
    artifact_layout: {
      snapshot_schema_version: "soulforge.backup_controller.linear_lb1.snapshot.v2",
      manifest_schema_version: "soulforge.backup_controller.linear_lb1.manifest.v2",
      revision_schema_version: "soulforge.backup_controller.linear_lb1.revision.v2",
      layout_kind: "canonical_sealed_envelope_v2",
    },
    resource_limits: {
      max_issues: 10000,
      max_total_bytes: 104857600,
      max_runtime_ms: 600000,
    },
    retention: {
      daily_generations: 30,
      monthly_generations: 12,
      rpo_hours: 24,
    },
    failure_policy: {
      partial_result: "HOLD",
      retry_policy: "fresh_owner_gate_required",
      target_cleanup_allowed: false,
      source_mutation_allowed: false,
    },
    restore_acceptance: {
      human_reviewer_ref: REVIEWER_REF,
      required_dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
      restore_check_required: true,
      tabular_only_accepted: false,
    },
    one_shot: {
      run_limit: 1,
      writer_kind: "append_only_revision",
      linear_mutation: false,
      webhook_registration: false,
      scheduler_activation: false,
    },
  };
}

function trustedPinFor(packet) {
  const preview = evaluateLinearLb1OwnerGateV2(packet, null);
  const packetSha256 = preview.receipt.packet_sha256;
  return {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("gate_ref_runtime_01", packetSha256),
    expected_packet_sha256: packetSha256,
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T00:15:00.000Z",
    expires_at: "2026-08-21T00:00:00.000Z",
  };
}

// Synthetic Atomic Claim Client
function createSyntheticAtomicClaimClient() {
  const store = new Map();
  return {
    durable: true,
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    async getRevocationState(tokenDigest) {
      return { state: "active", token_digest: tokenDigest };
    },
    async atomicClaim(tokenDigest, record) {
      await Promise.resolve();
      if (store.has(tokenDigest)) {
        return {
          success: false,
          code: "ALREADY_CONSUMED",
          existing_claim: store.get(tokenDigest),
        };
      }
      store.set(tokenDigest, { ...record });
      return {
        success: true,
        code: "CLAIMED",
        existing_claim: null,
      };
    },
  };
}

// Synthetic Create-Only Storage Client
function createSyntheticCreateOnlyStorageClient(targetRef = TARGET_REF, authorityRef = AUTHORITY_REF) {
  const store = new Map();
  return {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    target_ref: targetRef,
    storage_write_authority_ref: authorityRef,
    overwrite_allowed: false,
    delete_allowed: false,
    public_share_allowed: false,
    async writeRevisionCreateOnly(runKey, bytes, meta = {}) {
      if (store.has(runKey)) {
        return {
          success: false,
          code: "COLLISION",
          run_key: runKey,
          bytes_written: 0,
          target_ref: meta.target_ref,
          storage_write_authority_ref: meta.storage_write_authority_ref,
        };
      }
      const record = {
        bytes: Buffer.from(bytes),
        manifest_sha256: meta.manifest_sha256,
      };
      store.set(runKey, record);
      return {
        success: true,
        code: "STORED",
        run_key: runKey,
        bytes_written: record.bytes.length,
        target_ref: meta.target_ref,
        storage_write_authority_ref: meta.storage_write_authority_ref,
      };
    },
    async readRevision(runKey, binding) {
      if (!store.has(runKey)) {
        return null;
      }
      const record = store.get(runKey);
      return {
        run_key: runKey,
        bytes: Buffer.from(record.bytes),
        manifest_sha256: record.manifest_sha256,
        target_ref: binding.target_ref,
        storage_write_authority_ref: binding.storage_write_authority_ref,
      };
    },
    async hasRevision(runKey) {
      return store.has(runKey);
    },
  };
}

// Synthetic Read-Only Linear Client
function createSyntheticReadOnlyLinearClient(fixture = null) {
  const baseFixture = fixture ?? makeCompleteLinearLb1V2Fixture();
  return {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    mutation_allowed: false,
    linear_write_allowed: false,
    async fetchSnapshot(sourceScope) {
      const copy = JSON.parse(JSON.stringify(baseFixture));
      copy.source_scope.workspace_id = sourceScope.workspace_ref.entity_id;
      copy.source_scope.scope_mode = sourceScope.scope_mode;
      copy.source_scope.team_ids = [...sourceScope.team_ids];
      copy.source_scope.project_ids = [...sourceScope.project_ids];
      return copy;
    },
  };
}

const BOUNDED = async (promise) => promise;

function makeReaderConfig(linearClient, overrides = {}) {
  const request = makeClosedRequest();
  return {
    linearClient,
    adapter_ref: READER_REF,
    scope: request.source,
    resource_limits: request.resource_limits,
    clock: makeTestClock(),
    boundedPromise: BOUNDED,
    synthetic_only: true,
    ...overrides,
  };
}

function makeStorageConfig(storageClient, overrides = {}) {
  return {
    storageClient,
    adapter_ref: STORAGE_REF,
    target_ref: TARGET_REF,
    storage_write_authority_ref: AUTHORITY_REF,
    clock: makeTestClock(),
    boundedPromise: BOUNDED,
    synthetic_only: true,
    ...overrides,
  };
}

function makeClaimConfig(claimClient, overrides = {}) {
  return {
    claimClient,
    claim_store_ref: CLAIM_REF,
    writer_identity: {
      writer_id: "node-01",
      hostname: "synthetic-host-01",
      platform: "win32",
      epoch: 1,
    },
    claim_expires_at: "2026-08-21T00:00:00.000Z",
    clock: makeTestClock(),
    boundedPromise: BOUNDED,
    synthetic_only: true,
    ...overrides,
  };
}

function makeRuntimeConfig(overrides = {}) {
  const request = makeClosedRequest();
  const targetRef = overrides.storage_target_ref ?? TARGET_REF;
  return {
    linearClient: createSyntheticReadOnlyLinearClient(),
    storageClient: createSyntheticCreateOnlyStorageClient(targetRef, AUTHORITY_REF),
    claimClient: createSyntheticAtomicClaimClient(),
    clock: makeTestClock(),
    boundedPromise: BOUNDED,
    synthetic_only: true,
    linear_reader_adapter_ref: READER_REF,
    storage_adapter_ref: STORAGE_REF,
    claim_store_ref: CLAIM_REF,
    workspace_ref: WORKSPACE_REF,
    credential_ref: CREDENTIAL_REF,
    storage_target_ref: targetRef,
    storage_write_authority_ref: AUTHORITY_REF,
    writer_identity: request.writer_identity,
    claim_expires_at: request.owner_decision.expires_at_utc,
    scope: request.source,
    resource_limits: request.resource_limits,
    ...overrides,
  };
}

test("HELD_LINEAR_LB1_RUNTIME_ADAPTERS default export is OFF and throws on invocation", () => {
  assert.equal(HELD_LINEAR_LB1_RUNTIME_ADAPTERS.feature_state, "off");
  assert.equal(HELD_LINEAR_LB1_RUNTIME_ADAPTERS.authority_state, "hold");

  assert.throws(() => HELD_LINEAR_LB1_RUNTIME_ADAPTERS.claimStore.consumeOnce("tok-001"), (err) => {
    return err instanceof LinearLb1RuntimeAdapterError && err.code === "linear_lb1_runtime_claim_hold";
  });
  assert.throws(() => HELD_LINEAR_LB1_RUNTIME_ADAPTERS.linearReaderAdapter.collectSnapshot(), (err) => {
    return err instanceof LinearLb1RuntimeAdapterError && err.code === "linear_lb1_runtime_reader_hold";
  });
  assert.throws(() => HELD_LINEAR_LB1_RUNTIME_ADAPTERS.storageAdapter.writeRevisionCreateOnly("key", Buffer.from("data")), (err) => {
    return err instanceof LinearLb1RuntimeAdapterError && err.code === "linear_lb1_runtime_storage_hold";
  });
  assert.throws(() => HELD_LINEAR_LB1_RUNTIME_ADAPTERS.storageAdapter.readRevision("key"), (err) => {
    return err instanceof LinearLb1RuntimeAdapterError && err.code === "linear_lb1_runtime_storage_hold";
  });
  assert.throws(() => HELD_LINEAR_LB1_RUNTIME_ADAPTERS.storageAdapter.hasRevision("key"), /linear_lb1_runtime_storage_hold/);

  assert.equal("getEffects" in HELD_LINEAR_LB1_RUNTIME_READER_ADAPTER, false);
  assert.equal("getEffects" in HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER, false);
  assert.equal("getEffects" in HELD_LINEAR_LB1_RUNTIME_CLAIM_ADAPTER, false);
});

test("createLinearLb1RuntimeAdapters validates config and rejects invalid or unexpected properties", () => {
  assert.throws(() => createLinearLb1RuntimeAdapters(null), /config_invalid/);
  assert.throws(() => createLinearLb1RuntimeAdapters("invalid"), /config_invalid/);

  assert.throws(() => createLinearLb1RuntimeAdapters(makeRuntimeConfig({ forbidden_extra_key: "danger" })), /unexpected_key/);
  assert.throws(() => createLinearLb1RuntimeAdapters(makeRuntimeConfig({ linear_reader_adapter_ref: { invalid: "ref" } })), /reader_ref_invalid/);
  assert.throws(() => createLinearLb1RuntimeAdapters(makeRuntimeConfig({ storage_adapter_ref: { invalid: "ref" } })), /storage_ref_invalid/);
  assert.throws(() => createLinearLb1RuntimeAdapters(makeRuntimeConfig({ claim_store_ref: { invalid: "ref" } })), /claim_ref_invalid/);
  assert.throws(() => createLinearLb1RuntimeAdapters(makeRuntimeConfig({ clock: null })), /clock_invalid/);
  assert.throws(() => createLinearLb1RuntimeAdapters(makeRuntimeConfig({ workspace_ref: CREDENTIAL_REF })), /binding_drift/);

  const validAdapters = createLinearLb1RuntimeAdapters(makeRuntimeConfig());

  const keys = Object.keys(validAdapters).sort();
  assert.deepEqual(keys, ["claimStore", "clock", "linearReaderAdapter", "storageAdapter"]);
});

test("Reader adapter rejects clients exposing mutation capabilities (create/update/delete/mutate/write/etc)", () => {
  const mutationMethodNames = [
    "createIssue", "updateIssue", "deleteIssue", "mutate", "write", "post",
    "patch", "put", "remove", "destroy", "insert", "upsert", "set", "save", "archive",
  ];

  for (const methodName of mutationMethodNames) {
    const dangerousClient = {
      effect_domain: "synthetic",
      synthetic_effects_attested: true,
      [methodName]: async () => {},
      async fetchSnapshot() { return makeCompleteLinearLb1V2Fixture(); },
    };

    assert.throws(() => {
      createLinearLb1RuntimeReaderAdapter(makeReaderConfig(dangerousClient));
    }, (err) => {
      return err instanceof LinearLb1RuntimeAdapterError && err.code.includes("mutation_forbidden");
    }, `Client exposing ${methodName} must be rejected`);
  }

  // Client with mutation_allowed flag
  assert.throws(() => {
    createLinearLb1RuntimeReaderAdapter(makeReaderConfig({
      effect_domain: "synthetic",
      synthetic_effects_attested: true,
      mutation_allowed: true,
      async fetchSnapshot() { return makeCompleteLinearLb1V2Fixture(); },
    }));
  }, /capability_forbidden/);

  // Client with prototype-chain mutation method
  class PrototypeMutatorClient {
    effect_domain = "synthetic";
    synthetic_effects_attested = true;
    deleteRecord() {}
    async fetchSnapshot() { return makeCompleteLinearLb1V2Fixture(); }
  }
  assert.throws(() => {
    createLinearLb1RuntimeReaderAdapter(makeReaderConfig(new PrototypeMutatorClient()));
  }, /mutation_forbidden/);
});

test("Reader adapter binds workspace/read-only scope and denies scope drift or foreign enumeration", async () => {
  const request = makeClosedRequest();
  const allowlistScope = {
    ...request.source,
    scope_mode: "allowlist",
    team_ids: ["synthetic-team-001"],
    project_ids: ["synthetic-project-001"],
  };
  const reader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(
    createSyntheticReadOnlyLinearClient(), { scope: allowlistScope },
  ));
  const scopeEscapeResult = await reader.collectSnapshot({ ...allowlistScope, team_ids: ["synthetic-team-999"] });
  assert.equal(scopeEscapeResult.collection_status, "failed");
  const scopeModeMismatchResult = await reader.collectSnapshot({ ...allowlistScope, scope_mode: "entire_workspace", team_ids: [], project_ids: [] });
  assert.equal(scopeModeMismatchResult.collection_status, "failed");

  const foreignFixture = makeCompleteLinearLb1V2Fixture();
  foreignFixture.issues.push({ ...foreignFixture.issues[0], issue_id: "foreign-issue-001", human_id: "FOR-999", team_id: "foreign-team-999" });
  foreignFixture.cutoff.total_issues = foreignFixture.issues.length;
  const foreignReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(
    createSyntheticReadOnlyLinearClient(foreignFixture), { scope: allowlistScope },
  ));
  const foreignResult = await foreignReader.collectSnapshot(allowlistScope);
  assert.equal(foreignResult.collection_status, "failed");
});

test("Reader adapter handles pagination, page limits, and detects infinite pagination loops / cycles", async () => {
  const baseFixture = makeCompleteLinearLb1V2Fixture();
  const scope = makeClosedRequest().source;

  // 1. Successful multi-page pagination
  let pageCallCount = 0;
  const paginatedClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    async paginateIssues({ cursor }) {
      pageCallCount += 1;
      if (!cursor) {
        return {
          catalog: {
            teams: baseFixture.teams,
            projects: baseFixture.projects,
            assignees: baseFixture.assignees,
            statuses: baseFixture.statuses,
          },
          issues: [baseFixture.issues[0]],
          next_cursor: "page-2-cursor",
          has_more: true,
        };
      }
      return {
        catalog: null,
        issues: [baseFixture.issues[1]],
        next_cursor: null,
        has_more: false,
      };
    },
  };

  const paginatedReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(paginatedClient));
  const collection = await paginatedReader.collectSnapshot(scope);
  assert.equal(collection.collection_status, "complete", JSON.stringify(collection.errors));
  assert.equal(collection.snapshot.issues.length, 2);
  assert.equal(pageCallCount, 2);

  // 2. Loop detection on repeating cursor
  const loopingClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    async paginateIssues({ cursor }) {
      return {
        catalog: {
          teams: baseFixture.teams,
          projects: baseFixture.projects,
          assignees: baseFixture.assignees,
          statuses: baseFixture.statuses,
        },
        issues: [baseFixture.issues[0]],
        next_cursor: "infinite-loop-cursor",
        has_more: true,
      };
    },
  };

  const loopingReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(loopingClient));
  const loopResult = await loopingReader.collectSnapshot(scope);
  assert.equal(loopResult.collection_status, "failed");

  // 3. Page limit exceeded enforcement
  let pagesCount = 0;
  const endlessPagesClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    async paginateIssues() {
      pagesCount += 1;
      return {
        catalog: {
          teams: baseFixture.teams,
          projects: baseFixture.projects,
          assignees: baseFixture.assignees,
          statuses: baseFixture.statuses,
        },
        issues: [],
        next_cursor: `cursor-${pagesCount}`,
        has_more: true,
      };
    },
  };

  const pageLimitReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(endlessPagesClient, {
    resource_limits: { ...makeClosedRequest().resource_limits, max_issues: 3 },
  }));
  const pageLimitResult = await pageLimitReader.collectSnapshot(scope);
  assert.equal(pageLimitResult.collection_status, "failed");
});

test("Reader adapter sanitizes partial and provider errors without leaking raw errors, tokens, or paths", async () => {
  const failingClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    async fetchSnapshot() {
      const err = new Error("HTTP 401 Unauthorized Bearer token=sk-secret-token-12345 at file:///C:/private/keys");
      err.code = "AUTH_SECRET_TOKEN_ERROR";
      throw err;
    },
  };

  const reader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(failingClient));

  const result = await reader.collectSnapshot(makeClosedRequest().source);
  assert.equal(result.collection_status, "failed");
  assert.equal(result.declared_missing_dimensions.length, LINEAR_LB1_V2_DIMENSIONS.length);
  for (const err of result.errors) {
    assert.match(err.code, /^[a-z][a-z0-9_-]{2,63}$/);
    assert.doesNotMatch(err.code, /secret|token|password|bearer|path|private/);
  }
});

test("Storage adapter enforces create-only, detects collisions, and rejects unsafe capabilities", async () => {
  const storageClient = createSyntheticCreateOnlyStorageClient();
  const storage = createLinearLb1RuntimeStorageAdapter(makeStorageConfig(storageClient));

  const runKey = "linear-lb1-v2-run-test-key-001";
  const testBytes = Buffer.from("sealed-backup-test-data");

  // 1. Initial create succeeds
  const manifestSha256 = hexSeed("storage-test-manifest");
  const firstWrite = await storage.writeRevisionCreateOnly(runKey, testBytes, { manifest_sha256: manifestSha256 });
  assert.equal(firstWrite.success, true);
  assert.equal(firstWrite.bytes_written, testBytes.length);

  // 2. Collision on duplicate runKey
  const duplicateWrite = await storage.writeRevisionCreateOnly(runKey, testBytes, { manifest_sha256: manifestSha256 });
  assert.equal(duplicateWrite.success, false);
  assert.equal(duplicateWrite.error, "COLLISION");

  // 3. Exact-byte readback
  const readback = await storage.readRevision(runKey);
  assert.ok(readback.bytes.equals(testBytes));
  assert.equal(readback.manifest_sha256, manifestSha256);

  // 4. Missing key read throws
  await assert.rejects(async () => {
    await storage.readRevision("non-existent-key");
  }, /linear_lb1_v2_storage_revision_not_found/);

  // 5. Invalid runKey format (e.g. path traversal)
  await assert.rejects(async () => {
    await storage.writeRevisionCreateOnly("../danger/path", testBytes);
  }, /linear_lb1_v2_storage_run_key_invalid/);

  // 6. Storage client exposing unsafe delete or overwrite capability is rejected
  const unsafeClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    target_ref: TARGET_REF,
    storage_write_authority_ref: AUTHORITY_REF,
    overwrite_allowed: true,
    async writeRevisionCreateOnly() {},
    async readRevision() {},
  };
  assert.throws(() => {
    createLinearLb1RuntimeStorageAdapter(makeStorageConfig(unsafeClient));
  }, /linear_lb1_storage_unsafe_capabilities/);

  const deleteClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    target_ref: TARGET_REF,
    storage_write_authority_ref: AUTHORITY_REF,
    overwrite_allowed: false,
    delete_allowed: false,
    public_share_allowed: false,
    async deleteRevision() {},
    async writeRevisionCreateOnly() {},
    async readRevision() {},
  };
  assert.throws(() => {
    createLinearLb1RuntimeStorageAdapter(makeStorageConfig(deleteClient));
  }, /mutation_forbidden/);
});

test("Claim adapter requires durable atomic primitive and handles two-actor atomic races", async () => {
  const atomicClient = createSyntheticAtomicClaimClient();
  const claimAdapter = createLinearLb1RuntimeClaimAdapter(makeClaimConfig(atomicClient));

  const token = "single-use-race-token-001";

  // Concurrent two-actor claim race
  const [res1, res2] = await Promise.all([
    claimAdapter.consumeOnce(token, { packet_sha256: `sha256:${hexSeed("packet-race")}` }),
    claimAdapter.consumeOnce(token, { packet_sha256: `sha256:${hexSeed("packet-race")}` }),
  ]);

  const successes = [res1, res2].filter((r) => r.success === true);
  const failures = [res1, res2].filter((r) => r.success === false);

  assert.equal(successes.length, 1, "Exactly one actor must win atomic claim");
  assert.equal(failures.length, 1, "Exactly one actor must fail atomic claim");
  assert.equal(failures[0].error, "ALREADY_CONSUMED");
});

test("Claim adapter distinguishes exact replay from conflict, stale epoch, and expiry", async () => {
  const atomicClient = createSyntheticAtomicClaimClient();
  const claimAdapter = createLinearLb1RuntimeClaimAdapter(makeClaimConfig(atomicClient));

  const token = "single-use-replay-token-001";

  // 1. Initial claim
  const exactPacket = `sha256:${hexSeed("exact-packet")}`;
  const conflictingPacket = `sha256:${hexSeed("conflicting-packet")}`;
  const first = await claimAdapter.consumeOnce(token, { packet_sha256: exactPacket });
  assert.equal(first.success, true);

  // 2. Exact same replay with matching digest and identity
  const replay = await claimAdapter.consumeOnce(token, { packet_sha256: exactPacket });
  assert.equal(replay.success, false);
  assert.equal(replay.error, "ALREADY_CONSUMED");

  // 3. Conflict replay with different packet digest
  const conflict = await claimAdapter.consumeOnce(token, { packet_sha256: conflictingPacket });
  assert.equal(conflict.success, false);
  assert.equal(conflict.error, "CLAIM_CONFLICT");

  // 4. Expired token
  const expiredAdapter = createLinearLb1RuntimeClaimAdapter(makeClaimConfig(createSyntheticAtomicClaimClient(), {
    claim_expires_at: "2026-08-20T00:00:00.000Z",
  }));
  const expired = await expiredAdapter.consumeOnce("single-use-expired-token-001", { packet_sha256: exactPacket });
  assert.equal(expired.success, false);
  assert.equal(expired.error, "CLAIM_EXPIRED");

  // 5. Revoked token
  // 5. Non-durable and no-atomic clients are rejected at construction.
  assert.throws(() => {
    createLinearLb1RuntimeClaimAdapter(makeClaimConfig({
      effect_domain: "synthetic", synthetic_effects_attested: true, durable: false,
      async atomicClaim() {}, async getRevocationState() {},
    }));
  }, /claim_client_not_durable/);

  assert.throws(() => {
    createLinearLb1RuntimeClaimAdapter(makeClaimConfig({
      effect_domain: "synthetic", synthetic_effects_attested: true, durable: true,
      async getRevocationState() {},
    }));
  }, /claim_client_not_atomic/);
});

test("End-to-end integration: runner bound with runtime adapters executes one-shot to RESTORE_REVIEW_CANDIDATE", async () => {
  const token = "single-use-e2e-token-001";
  const request = makeClosedRequest(token, "target-e2e-001");
  const trustedPin = trustedPinFor(request);
  const runtimeAdapters = createLinearLb1RuntimeAdapters(makeRuntimeConfig({
    linearClient: createSyntheticReadOnlyLinearClient(),
    storageClient: createSyntheticCreateOnlyStorageClient(request.target.target_ref, AUTHORITY_REF),
    claimClient: createSyntheticAtomicClaimClient(),
    clock: makeTestClock("2026-08-20T00:30:00.000Z"),
    storage_target_ref: request.target.target_ref,
    writer_identity: request.writer_identity,
    claim_expires_at: request.owner_decision.expires_at_utc,
    scope: request.source,
    resource_limits: request.resource_limits,
  }));

  const runner = createLinearLb1OneShotRunner(runtimeAdapters);
  const result = await runner.execute(request, trustedPin);

  assert.equal(result.schema_version, LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION);
  assert.equal(result.status, "RESTORE_REVIEW_CANDIDATE", JSON.stringify({ reason: result.reason, write: result.write_result }));
  assert.equal(result.reason, "SUCCESS");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.claim_result.success, true);
  assert.equal(result.write_result.success, true);
  assert.equal(result.write_result.code, "STORED");
  assert.equal(result.restore_check.complete, true);
  assert.equal(result.candidate_state.claim_ceiling, "RESTORE_REVIEW_CANDIDATE");
  assert.equal(result.candidate_state.human_accepted, false);
  assert.equal(result.candidate_state.review_required, true);

  // Zero is emitted only because all three bound adapters attest synthetic-only evidence.
  assert.deepEqual(result.external_effects, LINEAR_LB1_ZERO_EFFECTS);
  assert.equal(result.external_effects_evidence_state, "ATTESTED_SYNTHETIC_ZERO");
  assert.equal(result.external_effects_evidence_reason, "ATTESTED_SYNTHETIC_ONLY");
  assert.equal(result.synthetic_effects.claim_attempts, 1);
  assert.equal(result.synthetic_effects.provider_reads, 1);
  assert.equal(result.synthetic_effects.storage_writes, 1);
  assert.equal(result.synthetic_effects.storage_reads, 1);
  assert.equal(result.synthetic_effects.restore_checks, 1);
  assert.deepEqual(runtimeAdapters.linearReaderAdapter.getEffects(), {
    adapter_kind: "linear_runtime_reader",
    feature_state: "bound_not_activated",
    authority_state: "synthetic_only",
    effect_domain: "synthetic",
    external_effect_evidence: "synthetic_attested_only",
    adapter_invocation_counts: { collect_snapshot: 1 },
    client_call_counts: { read_calls: 1 },
  });
  assert.deepEqual(runtimeAdapters.storageAdapter.getEffects(), {
    adapter_kind: "linear_runtime_backup_storage",
    feature_state: "bound_not_activated",
    authority_state: "synthetic_only",
    effect_domain: "synthetic",
    external_effect_evidence: "synthetic_attested_only",
    adapter_invocation_counts: { write_revision_create_only: 1, read_revision: 1, has_revision: 0 },
    client_call_counts: { write_calls: 1, read_calls: 1, exists_calls: 0 },
  });
  assert.deepEqual(runtimeAdapters.claimStore.getEffects(), {
    adapter_kind: "linear_runtime_claim_store",
    feature_state: "bound_not_activated",
    authority_state: "synthetic_only",
    effect_domain: "synthetic",
    external_effect_evidence: "synthetic_attested_only",
    adapter_invocation_counts: { consume_once: 1 },
    client_call_counts: { claim_calls: 1, revocation_calls: 1 },
  });

  // Second execution with the same single-use token fails closed at claim step
  const secondResult = await runner.execute(request, trustedPin);
  assert.equal(secondResult.status, "HOLD_CONSUMED");
  assert.equal(secondResult.reason, "CLAIM_CONSUMED_OR_FAILED");
  assert.equal(secondResult.claim_consumed, true);
  assert.equal(secondResult.synthetic_effects.provider_reads, 0, "No provider read on replayed claim");
});

test("regression: bound runtime adapters require explicit synthetic-only arming and expose a non-activated state", () => {
  const request = makeClosedRequest();
  assert.throws(() => createLinearLb1RuntimeReaderAdapter({
    linearClient: createSyntheticReadOnlyLinearClient(),
    adapter_ref: READER_REF,
    scope: request.source,
    resource_limits: request.resource_limits,
    clock: makeTestClock(),
  }), /synthetic_only_required/);
});

test("regression: hostile unexpected keys use one constant error code", () => {
  let error = null;
  try {
    createLinearLb1RuntimeAdapters(makeRuntimeConfig({ "x-secret-token-file:///C:/owner": true }));
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof LinearLb1RuntimeAdapterError);
  assert.equal(error.code, "linear_lb1_runtime_adapters_unexpected_key");
  assert.doesNotMatch(error.message, /secret|token|file:\/\//iu);
});

test("regression: claim results never expose a raw single-use token", async () => {
  const claimAdapter = createLinearLb1RuntimeClaimAdapter(makeClaimConfig(createSyntheticAtomicClaimClient()));
  const token = "single-use-token-no-echo-001";
  const result = await claimAdapter.consumeOnce(token, {
    packet_sha256: `sha256:${hexSeed("claim-no-echo")}`,
  });
  assert.equal(result.success, true);
  assert.equal("token" in result, false);
  assert.equal(result.token_digest, `sha256:${hexSeed(token)}`);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
});

test("regression: create-only storage trusts the atomic collision result and never pre-checks", async () => {
  let hasRevisionCalls = 0;
  const storageClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    target_ref: TARGET_REF,
    storage_write_authority_ref: AUTHORITY_REF,
    overwrite_allowed: false,
    delete_allowed: false,
    public_share_allowed: false,
    async hasRevision() { hasRevisionCalls += 1; return false; },
    async writeRevisionCreateOnly(runKey, bytes, meta) {
      return {
        success: false,
        code: "COLLISION",
        run_key: runKey,
        bytes_written: 0,
        target_ref: meta.target_ref,
        storage_write_authority_ref: meta.storage_write_authority_ref,
      };
    },
    async readRevision() { return null; },
  };
  const storage = createLinearLb1RuntimeStorageAdapter(makeStorageConfig(storageClient));
  const result = await storage.writeRevisionCreateOnly(
    "linear-lb1-v2-collision-001",
    Buffer.from("sealed"),
    { manifest_sha256: hexSeed("manifest-collision") },
  );
  assert.equal(hasRevisionCalls, 0);
  assert.deepEqual(result, { success: false, error: "COLLISION", bytes_written: 0 });
});

test("regression: bound adapter states, kinds, and counters are exact synthetic evidence", async () => {
  const reader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(createSyntheticReadOnlyLinearClient()));
  const storage = createLinearLb1RuntimeStorageAdapter(makeStorageConfig(createSyntheticCreateOnlyStorageClient()));
  const claim = createLinearLb1RuntimeClaimAdapter(makeClaimConfig(createSyntheticAtomicClaimClient()));
  assert.equal(reader.feature_state, "bound_not_activated");
  assert.equal(reader.authority_state, "synthetic_only");
  assert.equal(storage.adapter_kind, HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER.adapter_kind);
  assert.equal(storage.feature_state, "bound_not_activated");
  assert.equal(claim.adapter_kind, "linear_runtime_claim_store");
  await reader.collectSnapshot(makeClosedRequest().source);
  assert.deepEqual(reader.getEffects(), {
    adapter_kind: "linear_runtime_reader", feature_state: "bound_not_activated", authority_state: "synthetic_only",
    effect_domain: "synthetic", external_effect_evidence: "synthetic_attested_only", adapter_invocation_counts: { collect_snapshot: 1 }, client_call_counts: { read_calls: 1 },
  });
  assert.deepEqual(storage.getEffects(), {
    adapter_kind: "linear_runtime_backup_storage", feature_state: "bound_not_activated", authority_state: "synthetic_only",
    effect_domain: "synthetic", external_effect_evidence: "synthetic_attested_only", adapter_invocation_counts: { write_revision_create_only: 0, read_revision: 0, has_revision: 0 }, client_call_counts: { write_calls: 0, read_calls: 0, exists_calls: 0 },
  });
  assert.deepEqual(claim.getEffects(), {
    adapter_kind: "linear_runtime_claim_store", feature_state: "bound_not_activated", authority_state: "synthetic_only",
    effect_domain: "synthetic", external_effect_evidence: "synthetic_attested_only", adapter_invocation_counts: { consume_once: 0 }, client_call_counts: { claim_calls: 0, revocation_calls: 0 },
  });
});

test("regression: injected clock disagreement, throw, backward movement, and exhausted budget fail closed", async () => {
  const source = makeClosedRequest().source;
  const disagreeingClock = { nowIso: () => "2026-08-20T00:30:00.000Z", nowMs: () => Date.parse("2026-08-20T00:30:00.000Z") + 1 };
  const disagreeingReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(createSyntheticReadOnlyLinearClient(), { clock: disagreeingClock }));
  assert.equal((await disagreeingReader.collectSnapshot(source)).collection_status, "failed");
  const throwingClock = { nowIso() { throw new Error("clock private failure"); }, nowMs: () => 0 };
  const throwingReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(createSyntheticReadOnlyLinearClient(), { clock: throwingClock }));
  assert.equal((await throwingReader.collectSnapshot(source)).collection_status, "failed");

  const advancingClock = makeTestClock();
  const timeoutClient = {
    effect_domain: "synthetic", synthetic_effects_attested: true,
    async fetchSnapshot(requestScope) {
      advancingClock.advance(1001);
      return createSyntheticReadOnlyLinearClient().fetchSnapshot(requestScope);
    },
  };
  const timeoutReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(timeoutClient, {
    clock: advancingClock,
    resource_limits: { ...makeClosedRequest().resource_limits, max_runtime_ms: 1000 },
  }));
  const timeoutResult = await timeoutReader.collectSnapshot(source);
  assert.deepEqual(timeoutResult.errors, [{ code: "provider_timeout" }]);

  const backwardClock = makeTestClock();
  const backwardClient = {
    effect_domain: "synthetic", synthetic_effects_attested: true,
    async fetchSnapshot(requestScope) {
      backwardClock.advance(-1);
      return createSyntheticReadOnlyLinearClient().fetchSnapshot(requestScope);
    },
  };
  const backwardReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(backwardClient, { clock: backwardClock }));
  assert.deepEqual((await backwardReader.collectSnapshot(source)).errors, [{ code: "provider_timeout" }]);
});

test("regression: hostile client return graphs and resource-size overflow are sanitized without raw echoes", async () => {
  const source = makeClosedRequest().source;
  const makeHostileClient = (produce) => ({
    effect_domain: "synthetic", synthetic_effects_attested: true,
    async fetchSnapshot(requestScope) { return produce(requestScope); },
  });
  const makeSnapshot = async (requestScope) => createSyntheticReadOnlyLinearClient().fetchSnapshot(requestScope);
  const getterReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(makeHostileClient((scope) => {
    const value = makeCompleteLinearLb1V2Fixture();
    value.source_scope.workspace_id = scope.workspace_ref.entity_id;
    Object.defineProperty(value, "issues", { enumerable: true, get() { throw new Error("file:///C:/secret"); } });
    return value;
  })));
  assert.deepEqual((await getterReader.collectSnapshot(source)).errors, [{ code: "provider_error" }]);
  const proxyReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(makeHostileClient(async (scope) => new Proxy(await makeSnapshot(scope), {}))));
  assert.deepEqual((await proxyReader.collectSnapshot(source)).errors, [{ code: "provider_error" }]);
  const cyclicReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(makeHostileClient(async (scope) => {
    const value = await makeSnapshot(scope); value.self = value; return value;
  })));
  assert.deepEqual((await cyclicReader.collectSnapshot(source)).errors, [{ code: "provider_error" }]);
  const oversizedReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(makeHostileClient(async (scope) => {
    const value = await makeSnapshot(scope); value.issues = Array.from({ length: 501 }, () => JSON.parse(JSON.stringify(value.issues[0]))); value.cutoff.total_issues = 501; return value;
  }), { resource_limits: { ...makeClosedRequest().resource_limits, max_issues: 1000 } }));
  assert.deepEqual((await oversizedReader.collectSnapshot(source)).errors, [{ code: "resource_limit_exceeded" }]);
  const nonNfcReader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(makeHostileClient(async (scope) => {
    const value = await makeSnapshot(scope); value.snapshot_id = "e\u0301"; return value;
  })));
  assert.deepEqual((await nonNfcReader.collectSnapshot(source)).errors, [{ code: "provider_error" }]);
});

test("regression: declared missing dimensions, response drift, and prototype proxies fail closed", async () => {
  const source = makeClosedRequest().source;
  const partialClient = {
    effect_domain: "synthetic", synthetic_effects_attested: true,
    async fetchSnapshot(scope) {
      return {
        snapshot: await createSyntheticReadOnlyLinearClient().fetchSnapshot(scope),
        collection_status: "partial",
        declared_missing_dimensions: ["issue", "issue", "unknown_dimension"],
        errors: [],
      };
    },
  };
  assert.equal((await createLinearLb1RuntimeReaderAdapter(makeReaderConfig(partialClient)).collectSnapshot(source)).collection_status, "failed");
  const validPartialClient = {
    effect_domain: "synthetic", synthetic_effects_attested: true,
    async fetchSnapshot(scope) {
      return {
        snapshot: await createSyntheticReadOnlyLinearClient().fetchSnapshot(scope),
        collection_status: "partial",
        declared_missing_dimensions: ["comments"],
        errors: [{ code: "provider_timeout" }],
      };
    },
  };
  const validPartial = await createLinearLb1RuntimeReaderAdapter(makeReaderConfig(validPartialClient)).collectSnapshot(source);
  assert.equal(validPartial.collection_status, "partial");
  assert.deepEqual(validPartial.declared_missing_dimensions, ["comments"]);
  const prototypeProxy = new Proxy({}, {});
  const prototypeClient = Object.create(prototypeProxy);
  Object.assign(prototypeClient, { effect_domain: "synthetic", synthetic_effects_attested: true, async fetchSnapshot() {} });
  assert.throws(() => createLinearLb1RuntimeReaderAdapter(makeReaderConfig(prototypeClient)), LinearLb1RuntimeAdapterError);

  const boundTarget = ref("target-drift-bound");
  const storageClient = createSyntheticCreateOnlyStorageClient(boundTarget, AUTHORITY_REF);
  storageClient.writeRevisionCreateOnly = async (runKey, bytes, meta) => ({
    success: true, code: "STORED", run_key: "drifted-run-key", bytes_written: bytes.length,
    target_ref: TARGET_REF, storage_write_authority_ref: meta.storage_write_authority_ref,
  });
  const storage = createLinearLb1RuntimeStorageAdapter(makeStorageConfig(storageClient, { target_ref: boundTarget }));
  assert.deepEqual(await storage.writeRevisionCreateOnly("linear-lb1-v2-drift-001", Buffer.from("x"), { manifest_sha256: hexSeed("drift") }), {
    success: false, error: "WRITE_FAILED", bytes_written: 0,
  });
  assert.throws(() => HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER.hasRevision("key"), LinearLb1V2Error);
});

test("regression: claim revocation evidence and stale epochs use closed outcomes", async () => {
  const token = "single-use-revocation-test-001";
  const packet = `sha256:${hexSeed("revocation-packet")}`;
  const revokedClient = createSyntheticAtomicClaimClient();
  revokedClient.getRevocationState = async (tokenDigest) => ({ state: "revoked", token_digest: tokenDigest });
  assert.equal((await createLinearLb1RuntimeClaimAdapter(makeClaimConfig(revokedClient)).consumeOnce(token, { packet_sha256: packet })).error, "CLAIM_REVOKED");
  const malformedClient = createSyntheticAtomicClaimClient();
  malformedClient.getRevocationState = async () => ({ state: "active", token_digest: "sha256:bad" });
  assert.equal((await createLinearLb1RuntimeClaimAdapter(makeClaimConfig(malformedClient)).consumeOnce(token, { packet_sha256: packet })).error, "CLAIM_REVOCATION_HOLD");
  const throwingClient = createSyntheticAtomicClaimClient();
  throwingClient.getRevocationState = async () => { throw new LinearLb1V2Error("secret_client_error"); };
  assert.equal((await createLinearLb1RuntimeClaimAdapter(makeClaimConfig(throwingClient)).consumeOnce(token, { packet_sha256: packet })).error, "CLAIM_REVOCATION_HOLD");
  const staleClient = createSyntheticAtomicClaimClient();
  staleClient.atomicClaim = async (tokenDigest, record) => ({
    success: false,
    code: "ALREADY_CONSUMED",
    existing_claim: { ...record, epoch: record.epoch + 1 },
  });
  assert.equal((await createLinearLb1RuntimeClaimAdapter(makeClaimConfig(staleClient)).consumeOnce(token, { packet_sha256: packet })).error, "STALE_EPOCH");
});

test("regression: storage clients cannot mutate or echo an owner-bound target ref", async () => {
  const ownerTargetRef = ref("storage-owner-target-mutation");
  const ownerAuthorityRef = ref("storage-owner-authority-mutation");
  const originalTarget = JSON.parse(JSON.stringify(ownerTargetRef));
  const storageClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    target_ref: ownerTargetRef,
    storage_write_authority_ref: ownerAuthorityRef,
    overwrite_allowed: false,
    delete_allowed: false,
    public_share_allowed: false,
    async writeRevisionCreateOnly(runKey, bytes, meta) {
      meta.target_ref.entity_id = "mutated-target-ref";
      return {
        success: true,
        code: "STORED",
        run_key: runKey,
        bytes_written: bytes.length,
        target_ref: meta.target_ref,
        storage_write_authority_ref: meta.storage_write_authority_ref,
      };
    },
    async readRevision() { return null; },
  };
  const storage = createLinearLb1RuntimeStorageAdapter(makeStorageConfig(storageClient, {
    target_ref: ownerTargetRef,
    storage_write_authority_ref: ownerAuthorityRef,
  }));
  assert.deepEqual(await storage.writeRevisionCreateOnly("linear-lb1-v2-target-mutation-001", Buffer.from("x"), {
    manifest_sha256: hexSeed("target-mutation"),
  }), { success: false, error: "WRITE_FAILED", bytes_written: 0 });
  assert.deepEqual(ownerTargetRef, originalTarget);
});

test("regression: reader clients cannot widen a bound allowlist or retain mutable scope aliases", async () => {
  const request = makeClosedRequest();
  const ownerScope = {
    ...request.source,
    scope_mode: "allowlist",
    team_ids: ["synthetic-team-001"],
    project_ids: ["synthetic-project-001"],
  };
  const originalScope = JSON.parse(JSON.stringify(ownerScope));
  let attack = true;
  let secondScope = null;
  const wideningClient = {
    effect_domain: "synthetic",
    synthetic_effects_attested: true,
    async fetchSnapshot(scope) {
      if (attack) {
        scope.team_ids.push("foreign-team-999");
        const snapshot = await createSyntheticReadOnlyLinearClient().fetchSnapshot(scope);
        snapshot.teams.push({ ...snapshot.teams[0], team_id: "foreign-team-999", key: "FOR", name: "Foreign" });
        snapshot.issues.push({ ...snapshot.issues[0], issue_id: "foreign-issue-999", human_id: "FOR-999", team_id: "foreign-team-999" });
        snapshot.cutoff.total_issues = snapshot.issues.length;
        return snapshot;
      }
      secondScope = JSON.parse(JSON.stringify(scope));
      return createSyntheticReadOnlyLinearClient().fetchSnapshot(scope);
    },
  };
  const reader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(wideningClient, { scope: ownerScope }));
  const first = await reader.collectSnapshot(ownerScope);
  assert.equal(first.collection_status, "failed");
  assert.deepEqual(ownerScope, originalScope);
  attack = false;
  const second = await reader.collectSnapshot(ownerScope);
  assert.equal(second.collection_status, "complete");
  assert.deepEqual(secondScope.team_ids, originalScope.team_ids);
  assert.deepEqual(secondScope.project_ids, originalScope.project_ids);
});

test("regression: adapter invocation counters increment before local validation and remain distinct from client calls", async () => {
  const reader = createLinearLb1RuntimeReaderAdapter(makeReaderConfig(createSyntheticReadOnlyLinearClient()));
  const storage = createLinearLb1RuntimeStorageAdapter(makeStorageConfig(createSyntheticCreateOnlyStorageClient()));
  const claim = createLinearLb1RuntimeClaimAdapter(makeClaimConfig(createSyntheticAtomicClaimClient()));
  await reader.collectSnapshot({ invalid: true });
  await assert.rejects(() => storage.writeRevisionCreateOnly("../invalid", Buffer.from("x"), { manifest_sha256: hexSeed("invalid") }));
  await claim.consumeOnce("bad", { packet_sha256: `sha256:${hexSeed("invalid-claim")}` });
  assert.deepEqual(reader.getEffects().adapter_invocation_counts, { collect_snapshot: 1 });
  assert.deepEqual(reader.getEffects().client_call_counts, { read_calls: 0 });
  assert.deepEqual(storage.getEffects().adapter_invocation_counts, {
    write_revision_create_only: 1,
    read_revision: 0,
    has_revision: 0,
  });
  assert.deepEqual(storage.getEffects().client_call_counts, { write_calls: 0, read_calls: 0, exists_calls: 0 });
  assert.deepEqual(claim.getEffects().adapter_invocation_counts, { consume_once: 1 });
  assert.deepEqual(claim.getEffects().client_call_counts, { claim_calls: 0, revocation_calls: 0 });
  assert.equal("getEffects" in HELD_LINEAR_LB1_RUNTIME_READER_ADAPTER, false);
  assert.equal("getEffects" in HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER, false);
  assert.equal("getEffects" in HELD_LINEAR_LB1_RUNTIME_CLAIM_ADAPTER, false);
});
