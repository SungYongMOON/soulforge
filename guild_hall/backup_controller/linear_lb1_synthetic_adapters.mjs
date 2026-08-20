import { createHash } from "node:crypto";
import {
  HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER,
  HELD_LINEAR_LB1_V2_STORAGE_ADAPTER,
  LinearLb1V2Error,
  collectFeatureOffLinearLb1V2Fixture,
  createFailedFeatureOffLinearLb1V2Collection,
} from "./linear_lb1_v2.mjs";
import { makeCompleteLinearLb1V2Fixture } from "./linear_lb1_v2_fixture.mjs";

export {
  HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER,
  HELD_LINEAR_LB1_V2_STORAGE_ADAPTER,
};

function hexSeed(seed) {
  return createHash("sha256").update(String(seed)).digest("hex");
}

function makePinnedRef(seed) {
  const h = hexSeed(seed);
  return Object.freeze({
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: `sha256:${h}`,
    content_hash_alg: "sha256",
  });
}

export const HELD_LINEAR_LB1_V2_CLAIM_ADAPTER = Object.freeze({
  adapter_kind: "claim_store",
  feature_state: "off",
  authority_state: "hold",
  claim_store_ref: makePinnedRef("held_linear_lb1_v2_claim_store_ref"),
  consumeOnce() {
    throw new LinearLb1V2Error("linear_lb1_v2_claim_hold");
  },
});

export function createInMemoryClaimStore(options = {}) {
  const consumed = new Map();
  let callCount = 0;
  const isAsync = options.async === true;
  const claimStoreRef = options.claim_store_ref ?? makePinnedRef("default_in_memory_claim_store_ref");

  return {
    adapter_kind: "in_memory_claim_store",
    feature_state: "off",
    claim_store_ref: claimStoreRef,
    consumeOnce(token, metadata = {}) {
      callCount += 1;
      const doConsume = () => {
        if (typeof token !== "string" || !token) {
          return { success: false, error: "INVALID_TOKEN", token };
        }
        if (consumed.has(token)) {
          return {
            success: false,
            error: "ALREADY_CONSUMED",
            token,
            first_consumed_at: consumed.get(token).consumed_at,
          };
        }
        const record = {
          token,
          consumed_at: new Date().toISOString(),
          metadata: { ...metadata },
        };
        consumed.set(token, record);
        return { success: true, token, consumed_at: record.consumed_at };
      };

      if (options.failWith) {
        if (isAsync) return Promise.reject(options.failWith);
        throw options.failWith;
      }

      if (isAsync) {
        return Promise.resolve().then(doConsume);
      }
      return doConsume();
    },
    isConsumed(token) {
      return consumed.has(token);
    },
    getCallCount() {
      return callCount;
    },
  };
}

export function createSyntheticLinearReaderAdapter(options = {}) {
  let callCount = 0;
  const fixture = options.fixture ?? null;
  const failWith = options.failWith ?? null;
  const status = options.status ?? "complete";
  const missingDimensions = options.missingDimensions ?? [];
  const errors = options.errors ?? [];
  const isAsync = options.async === true;
  const adapterRef = options.adapter_ref ?? makePinnedRef("default_synthetic_linear_reader_ref");

  return {
    adapter_kind: "synthetic_linear_reader",
    feature_state: "off",
    adapter_ref: adapterRef,
    collectSnapshot(sourceScope) {
      callCount += 1;
      const doCollect = () => {
        if (failWith) {
          if (typeof failWith === "string") {
            throw new LinearLb1V2Error(failWith);
          }
          throw failWith;
        }
        if (status === "failed") {
          return createFailedFeatureOffLinearLb1V2Collection({ errors });
        }
        const baseFixture = fixture ? JSON.parse(JSON.stringify(fixture)) : makeCompleteLinearLb1V2Fixture();
        return collectFeatureOffLinearLb1V2Fixture(baseFixture, {
          status,
          missing_dimensions: missingDimensions,
          errors,
        });
      };

      if (isAsync) {
        if (failWith) return Promise.reject(typeof failWith === "string" ? new LinearLb1V2Error(failWith) : failWith);
        return Promise.resolve().then(doCollect);
      }
      return doCollect();
    },
    getCallCount() {
      return callCount;
    },
  };
}

export function createInMemoryStorageAdapter(options = {}) {
  const store = new Map();
  let writeCalls = 0;
  let readCalls = 0;
  const isAsync = options.async === true;
  const adapterRef = options.adapter_ref ?? makePinnedRef("default_in_memory_storage_adapter_ref");

  return {
    adapter_kind: "in_memory_backup_storage",
    feature_state: "off",
    adapter_ref: adapterRef,
    writeRevisionCreateOnly(runKey, bytes, meta = {}) {
      writeCalls += 1;
      const doWrite = () => {
        if (options.failWriteWith) {
          if (typeof options.failWriteWith === "string") {
            throw new LinearLb1V2Error(options.failWriteWith);
          }
          throw options.failWriteWith;
        }
        if (typeof runKey !== "string" || !runKey) {
          throw new LinearLb1V2Error("linear_lb1_v2_storage_run_key_invalid");
        }
        if (store.has(runKey)) {
          return {
            success: false,
            error: "COLLISION",
            run_key: runKey,
            message: "Target revision already exists and overwrite is forbidden",
          };
        }
        const record = {
          bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
          manifest_sha256: meta.manifest_sha256 ?? null,
          written_at: new Date().toISOString(),
        };
        store.set(runKey, record);
        return {
          success: true,
          run_key: runKey,
          bytes_written: record.bytes.length,
        };
      };

      if (isAsync) {
        if (options.failWriteWith) {
          return Promise.reject(
            typeof options.failWriteWith === "string" ? new LinearLb1V2Error(options.failWriteWith) : options.failWriteWith,
          );
        }
        return Promise.resolve().then(doWrite);
      }
      return doWrite();
    },
    readRevision(runKey) {
      readCalls += 1;
      const doRead = () => {
        if (options.failReadWith) {
          if (typeof options.failReadWith === "string") {
            throw new LinearLb1V2Error(options.failReadWith);
          }
          throw options.failReadWith;
        }
        if (!store.has(runKey)) {
          throw new LinearLb1V2Error("linear_lb1_v2_storage_revision_not_found");
        }
        return {
          run_key: runKey,
          bytes: store.get(runKey).bytes,
          manifest_sha256: store.get(runKey).manifest_sha256,
        };
      };

      if (isAsync) {
        if (options.failReadWith) {
          return Promise.reject(
            typeof options.failReadWith === "string" ? new LinearLb1V2Error(options.failReadWith) : options.failReadWith,
          );
        }
        return Promise.resolve().then(doRead);
      }
      return doRead();
    },
    hasRevision(runKey) {
      return store.has(runKey);
    },
    getWriteCalls() {
      return writeCalls;
    },
    getReadCalls() {
      return readCalls;
    },
    overwrite_allowed: false,
    delete_allowed: false,
    public_share_allowed: false,
  };
}
