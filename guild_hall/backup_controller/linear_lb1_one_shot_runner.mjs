import { createHash } from "node:crypto";
import { types } from "node:util";

import {
  LINEAR_LB1_ZERO_EFFECTS,
  LinearLb1V2Error,
  buildImmutableLinearLb1BackupRunV2,
  checkLinearLb1RestoreV2,
  deserializeBackupRunV2,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import { evaluateLinearLb1OwnerGateV2, snapshotPlainData } from "./linear_lb1_owner_gate_v2.mjs";

export const LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.one_shot_runner_result.v2";

const RUNNER_BINDING_FIELDS = Object.freeze([
  "claimStore",
  "clock",
  "linearReaderAdapter",
  "storageAdapter",
]);

const REF_FIELDS = Object.freeze([
  "content_hash_alg",
  "content_id",
  "entity_id",
  "revision_id",
]);

const HASH = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function codepointCompare(a, b) {
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id)
    && UUID_V4.test(value.revision_id) && HASH.test(value.content_id)
    && value.content_hash_alg === "sha256";
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare).map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameRef(actual, expected) {
  return exactRef(actual) && exactRef(expected) && stableJson(actual) === stableJson(expected);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function makePublicRun(backupRun) {
  if (!backupRun) return null;
  return {
    schema_version: backupRun.schema_version,
    feature_state: backupRun.feature_state,
    run_key: backupRun.run_key,
    run_status: backupRun.run_status,
    manifest: backupRun.manifest,
    revision: backupRun.revision ? {
      revision_id: backupRun.revision.revision_id,
      collection_status: backupRun.revision.collection_status,
      snapshot_sha256: backupRun.revision.snapshot_sha256,
      manifest_sha256: backupRun.revision.manifest_sha256,
      revision_sha256: backupRun.revision.revision_sha256,
    } : null,
    effects: backupRun.effects,
  };
}

function validateStartClock(clock) {
  try {
    const nowIso = clock.nowIso();
    const nowMs = clock.nowMs();
    if (typeof nowIso !== "string"
        || !ISO_UTC.test(nowIso)
        || !Number.isSafeInteger(nowMs)
        || Date.parse(nowIso) !== nowMs
        || new Date(nowMs).toISOString() !== nowIso) {
      return null;
    }
    return { nowIso, nowMs };
  } catch {
    return null;
  }
}

function checkRuntimeLimit(clock, startMs, maxRuntimeMs) {
  try {
    const currentMs = clock.nowMs();
    if (!Number.isSafeInteger(currentMs)) {
      return { ok: false, reason: "CLOCK_INVALID" };
    }
    const elapsed = currentMs - startMs;
    if (!Number.isSafeInteger(elapsed) || elapsed < 0) {
      return { ok: false, reason: "CLOCK_INVALID" };
    }
    if (elapsed > maxRuntimeMs) {
      return { ok: false, reason: "MAX_RUNTIME_EXCEEDED" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "CLOCK_INVALID" };
  }
}

function bufferEquals(a, b) {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return bufA.length === bufB.length && bufA.equals(bufB);
}

export function createLinearLb1OneShotRunner(runtimeBinding) {
  if (!isPlainRecord(runtimeBinding) || !exactKeys(runtimeBinding, RUNNER_BINDING_FIELDS)) {
    throw new LinearLb1V2Error("linear_lb1_runner_binding_invalid");
  }
  const { claimStore, linearReaderAdapter, storageAdapter, clock } = runtimeBinding;
  if (!claimStore || typeof claimStore.consumeOnce !== "function" || !exactRef(claimStore.claim_store_ref)) {
    throw new LinearLb1V2Error("linear_lb1_runner_claim_store_invalid");
  }
  if (!linearReaderAdapter || typeof linearReaderAdapter.collectSnapshot !== "function" || !exactRef(linearReaderAdapter.adapter_ref)) {
    throw new LinearLb1V2Error("linear_lb1_runner_reader_adapter_invalid");
  }
  if (!storageAdapter || typeof storageAdapter.writeRevisionCreateOnly !== "function" || typeof storageAdapter.readRevision !== "function" || !exactRef(storageAdapter.adapter_ref)) {
    throw new LinearLb1V2Error("linear_lb1_runner_storage_adapter_invalid");
  }
  if (!clock || typeof clock.nowIso !== "function" || typeof clock.nowMs !== "function") {
    throw new LinearLb1V2Error("linear_lb1_runner_clock_invalid");
  }

  return {
    runner_kind: "linear_lb1_v2_one_shot_runner",
    feature_state: "off",
    async execute(closedRequest, trustedExpectedRequestPin) {
      const synthetic_effects = {
        claim_attempts: 0,
        provider_reads: 0,
        storage_writes: 0,
        storage_reads: 0,
        restore_checks: 0,
      };

      // B4. Snapshot closedRequest and trustedExpectedRequestPin once before gate/any await
      const closedRequestSnapshot = snapshotPlainData(closedRequest);
      const trustedPinSnapshot = snapshotPlainData(trustedExpectedRequestPin);

      // B3. Bounded clock read at runner start
      const startClock = validateStartClock(clock);
      if (startClock === null) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD",
          reason: "CLOCK_INVALID",
          claim_consumed: false,
          gate_result: null,
          claim_result: null,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }
      const { nowIso, nowMs } = startClock;
      const startMs = nowMs;

      // 1. Gate before effects (using frozen snapshot)
      const gateResult = evaluateLinearLb1OwnerGateV2(closedRequestSnapshot, trustedPinSnapshot);
      if (gateResult.gate.status !== "READY_FOR_ONE_SHOT") {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD",
          reason: "OWNER_GATE_BLOCKED",
          claim_consumed: false,
          gate_result: gateResult,
          claim_result: null,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 2. Execution time owner decision and pin expiry check at runner start (coherent instant nowIso)
      const decisionExpiresAt = closedRequestSnapshot.owner_decision?.expires_at_utc;
      const decisionApprovedAt = closedRequestSnapshot.owner_decision?.approved_at_utc;
      if (decisionExpiresAt && (nowIso >= decisionExpiresAt || (decisionApprovedAt && nowIso < decisionApprovedAt))) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD",
          reason: "OWNER_DECISION_EXPIRED",
          claim_consumed: false,
          gate_result: gateResult,
          claim_result: null,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      const pinExpiresAt = trustedPinSnapshot?.expires_at;
      const pinValidAt = trustedPinSnapshot?.valid_at;
      if (pinExpiresAt && (nowIso >= pinExpiresAt || (pinValidAt && nowIso < pinValidAt))) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD",
          reason: "TRUSTED_PIN_EXPIRED",
          claim_consumed: false,
          gate_result: gateResult,
          claim_result: null,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 3. Adapter descriptor exact pinned ref verification
      if (!sameRef(claimStore.claim_store_ref, closedRequestSnapshot.claim_store?.claim_store_ref)
          || !sameRef(linearReaderAdapter.adapter_ref, closedRequestSnapshot.adapters?.linear_reader_adapter_ref)
          || !sameRef(storageAdapter.adapter_ref, closedRequestSnapshot.adapters?.storage_adapter_ref)) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD",
          reason: "ADAPTER_REF_MISMATCH",
          claim_consumed: false,
          gate_result: gateResult,
          claim_result: null,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 4. Single-use token claim before any provider read
      synthetic_effects.claim_attempts += 1;
      const singleUseToken = closedRequestSnapshot.claim_store.single_use_token;
      let claimSuccess = false;
      try {
        const rawClaimResult = await claimStore.consumeOnce(singleUseToken, {
          packet_sha256: gateResult.receipt.packet_sha256,
        });
        if (rawClaimResult !== null && typeof rawClaimResult === "object" && !types.isProxy(rawClaimResult)) {
          const successDesc = Object.getOwnPropertyDescriptor(rawClaimResult, "success");
          if (successDesc && "value" in successDesc && successDesc.value === true) {
            claimSuccess = true;
          }
        }
      } catch {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "CLAIM_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: { success: false, code: "CLAIM_FAILED", claim_consumed: true },
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      const claimResult = {
        success: claimSuccess,
        code: claimSuccess ? "CLAIMED" : "CLAIM_FAILED",
        claim_consumed: true,
      };

      if (!claimSuccess) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "CLAIM_CONSUMED_OR_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // Beyond this point: claim is consumed. Every subsequent failure returns HOLD_CONSUMED with claim_consumed: true

      // 5. Check max_runtime_ms
      const runtimeCheck1 = checkRuntimeLimit(clock, startMs, closedRequestSnapshot.resource_limits.max_runtime_ms);
      if (!runtimeCheck1.ok) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: runtimeCheck1.reason,
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 6. One bounded synthetic read
      synthetic_effects.provider_reads += 1;
      let collection;
      try {
        collection = await linearReaderAdapter.collectSnapshot(closedRequestSnapshot.source);
      } catch {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "READ_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      const runtimeCheck2 = checkRuntimeLimit(clock, startMs, closedRequestSnapshot.resource_limits.max_runtime_ms);
      if (!runtimeCheck2.ok) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: runtimeCheck2.reason,
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 7. Canonical create-only synthetic generation and seal
      // Deterministic unique run key from trusted packet digest + writer epoch (from snapshot)
      const packetDigest = gateResult.receipt.packet_sha256.replace(/^sha256:/, "");
      const epoch = closedRequestSnapshot.writer_identity.epoch;
      const runKey = `linear-lb1-v2-run-${packetDigest}-e${epoch}`;

      let backupRun;
      try {
        backupRun = buildImmutableLinearLb1BackupRunV2({
          run_key: runKey,
          collection,
        });
      } catch {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "BACKUP_BUILD_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 8. Enforce max_issues against authoritative normalized manifest coverage count before serialize/write
      if (backupRun.manifest.coverage.counts.issues > closedRequestSnapshot.resource_limits.max_issues) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "MAX_ISSUES_EXCEEDED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      let sealedBytes;
      try {
        sealedBytes = serializeBackupRunV2(backupRun);
      } catch {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "BACKUP_BUILD_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 9. Enforce max_total_bytes before store
      if (sealedBytes.length > closedRequestSnapshot.resource_limits.max_total_bytes) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "MAX_TOTAL_BYTES_EXCEEDED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      const runtimeCheck3 = checkRuntimeLimit(clock, startMs, closedRequestSnapshot.resource_limits.max_runtime_ms);
      if (!runtimeCheck3.ok) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: runtimeCheck3.reason,
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: null,
          run: null,
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 10. Write revision create-only
      synthetic_effects.storage_writes += 1;
      let writeSuccess = false;
      let writeCode = "WRITE_FAILED";
      let bytesWritten = 0;
      try {
        const rawWriteResult = await storageAdapter.writeRevisionCreateOnly(runKey, sealedBytes, {
          manifest_sha256: backupRun.manifest.manifest_sha256,
        });
        if (rawWriteResult !== null && typeof rawWriteResult === "object" && !types.isProxy(rawWriteResult)) {
          const successDesc = Object.getOwnPropertyDescriptor(rawWriteResult, "success");
          if (successDesc && "value" in successDesc && successDesc.value === true) {
            writeSuccess = true;
            writeCode = "STORED";
          } else {
            const errorDesc = Object.getOwnPropertyDescriptor(rawWriteResult, "error");
            if (errorDesc && "value" in errorDesc && errorDesc.value === "COLLISION") {
              writeCode = "COLLISION";
            }
          }
          const bytesDesc = Object.getOwnPropertyDescriptor(rawWriteResult, "bytes_written");
          if (bytesDesc && "value" in bytesDesc && Number.isSafeInteger(bytesDesc.value) && bytesDesc.value >= 0) {
            bytesWritten = bytesDesc.value;
          }
        }
      } catch {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "STORAGE_WRITE_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: { success: false, code: "WRITE_FAILED", bytes_written: 0 },
          run: makePublicRun(backupRun),
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      const writeResult = {
        success: writeSuccess,
        code: writeCode,
        bytes_written: bytesWritten,
      };

      if (!writeSuccess) {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "STORAGE_WRITE_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: writeResult,
          run: makePublicRun(backupRun),
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 11. Stored byte readback, decode, byte equality and exact envelope identity proof
      synthetic_effects.storage_reads += 1;
      let decodedRun;
      try {
        const rawReadback = await storageAdapter.readRevision(runKey);
        if (rawReadback === null || typeof rawReadback !== "object" || types.isProxy(rawReadback)) {
          throw new Error("invalid_readback");
        }
        const bytesDesc = Object.getOwnPropertyDescriptor(rawReadback, "bytes");
        if (!bytesDesc || !("value" in bytesDesc)) {
          throw new Error("missing_bytes_descriptor");
        }
        const readBytes = bytesDesc.value;
        if (!Buffer.isBuffer(readBytes) && typeof readBytes !== "string") {
          throw new Error("invalid_bytes_type");
        }
        if (!bufferEquals(readBytes, sealedBytes)) {
          throw new Error("readback_bytes_mismatch");
        }

        decodedRun = deserializeBackupRunV2(readBytes);
        if (decodedRun.run_key !== backupRun.run_key
            || decodedRun.run_status !== backupRun.run_status
            || decodedRun.manifest.manifest_sha256 !== backupRun.manifest.manifest_sha256
            || decodedRun.manifest.schema_version !== backupRun.manifest.schema_version
            || decodedRun.manifest.snapshot_sha256 !== backupRun.manifest.snapshot_sha256) {
          throw new Error("readback_manifest_identity_mismatch");
        }
        if (backupRun.revision !== null) {
          if (decodedRun.revision === null
              || decodedRun.revision.revision_id !== backupRun.revision.revision_id
              || decodedRun.revision.revision_sha256 !== backupRun.revision.revision_sha256
              || decodedRun.revision.snapshot_sha256 !== backupRun.revision.snapshot_sha256
              || decodedRun.revision.manifest_sha256 !== backupRun.revision.manifest_sha256) {
            throw new Error("readback_revision_identity_mismatch");
          }
        } else if (decodedRun.revision !== null) {
          throw new Error("readback_revision_expected_null");
        }
      } catch {
        return deepFreeze({
          schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
          status: "HOLD_CONSUMED",
          reason: "STORAGE_READBACK_FAILED",
          claim_consumed: true,
          gate_result: gateResult,
          claim_result: claimResult,
          write_result: writeResult,
          run: makePublicRun(backupRun),
          restore_check: null,
          candidate_state: null,
          external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
          synthetic_effects: { ...synthetic_effects },
        });
      }

      // 12. Independent restore check
      synthetic_effects.restore_checks += 1;
      const decodedSnapshot = decodedRun.revision ? decodedRun.revision.snapshot : null;
      const restoreCheck = checkLinearLb1RestoreV2(backupRun, decodedSnapshot, {
        artifact_kinds: ["immutable_revision"],
      });

      // 13. Result status and candidate review state (public body-free run summary)
      const isComplete = backupRun.run_status === "complete" && restoreCheck.complete;
      const status = isComplete ? "RESTORE_REVIEW_CANDIDATE" : "HOLD_CONSUMED";
      const reason = isComplete ? "SUCCESS" : "RESTORE_CHECK_INCOMPLETE";

      const candidate_state = {
        claim_ceiling: "RESTORE_REVIEW_CANDIDATE",
        human_accepted: false,
        review_required: true,
        reviewer_ref: closedRequestSnapshot.restore_acceptance.human_reviewer_ref,
        run_key: runKey,
        manifest_sha256: backupRun.manifest.manifest_sha256,
        revision_id: backupRun.revision?.revision_id ?? null,
      };

      return deepFreeze({
        schema_version: LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
        status,
        reason,
        claim_consumed: true,
        gate_result: gateResult,
        claim_result: claimResult,
        write_result: writeResult,
        run: makePublicRun(backupRun),
        restore_check: restoreCheck,
        candidate_state,
        external_effects: { ...LINEAR_LB1_ZERO_EFFECTS },
        synthetic_effects: { ...synthetic_effects },
      });
    },
  };
}
