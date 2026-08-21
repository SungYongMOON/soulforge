import { createHash } from "node:crypto";
import { types } from "node:util";

export const RETENTION_PRESERVATION_GATE_PIN_SCHEMA_VERSION =
  "soulforge.backup_controller.retention_preservation_gate_pin.v1";

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hexSeed(seed) {
  return createHash("sha256").update(String(seed)).digest("hex");
}

function makePinnedRef(seed) {
  const h = hexSeed(seed);
  return Object.freeze({
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: `sha256:${h}`,
    content_hash_alg: "sha256"
  });
}

export const HELD_PRODUCTION_PRESERVATION_ADAPTER = Object.freeze({
  adapter_kind: "held_production_preservation_adapter",
  feature_state: "off",
  authority_state: "hold",
  adapter_ref: makePinnedRef("held_production_preservation_adapter_ref"),
  readSourceObjects() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production source reading is feature-OFF and forbidden"
    };
  },
  writePreservation() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production preservation execution is feature-OFF and forbidden"
    };
  },
  readPreservation() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production preservation readback is feature-OFF and forbidden"
    };
  }
});

export function createSyntheticPreservationSourceReaderAdapter(options = {}) {
  let readCalls = 0;
  const failReadWith = options.failReadWith ?? null;
  const objectsOverride = options.objects ?? null;
  const isAsync = options.async === true;
  const adapterRef = options.adapter_ref ?? makePinnedRef("synthetic_preservation_source_reader_adapter_ref");

  return {
    adapter_kind: "synthetic_preservation_source_reader",
    feature_state: "off",
    adapter_ref: adapterRef,
    readSourceObjects(candidateId, expectedCount = 1) {
      readCalls += 1;
      const doRead = () => {
        if (failReadWith) {
          if (typeof failReadWith === "string") {
            return { success: false, error_code: failReadWith };
          }
          throw failReadWith;
        }

        if (objectsOverride) {
          for (const obj of objectsOverride) {
            if (!obj || !Buffer.isBuffer(obj.bytes)) {
              return { success: false, error_code: "SOURCE_OBJECT_INVALID" };
            }
          }
          return {
            success: true,
            candidate_id: candidateId,
            objects: objectsOverride.map((obj) => ({
              kind: obj.kind ?? "git_object_pack",
              bytes: Buffer.from(obj.bytes)
            }))
          };
        }

        const count = Number.isSafeInteger(expectedCount) && expectedCount > 0 ? expectedCount : 1;
        const objects = [];
        for (let i = 0; i < count; i += 1) {
          const content = `synthetic_source_object_${candidateId}_idx_${i}`;
          objects.push({
            kind: "git_object_pack",
            bytes: Buffer.from(content, "utf8")
          });
        }
        return {
          success: true,
          candidate_id: candidateId,
          objects
        };
      };

      if (isAsync) {
        if (failReadWith && typeof failReadWith !== "string") {
          return Promise.reject(failReadWith);
        }
        return Promise.resolve().then(doRead);
      }
      return doRead();
    },
    getReadCalls() {
      return readCalls;
    }
  };
}

export function createSyntheticPreservationWriterAdapter(options = {}) {
  const store = options.store ?? new Map();
  let writeCalls = 0;
  const failWriteWith = options.failWriteWith ?? null;
  const partialWrite = options.partialWrite === true;
  const corruptWrite = options.corruptWrite === true;
  const isAsync = options.async === true;
  const adapterRef = options.adapter_ref ?? makePinnedRef("synthetic_preservation_writer_adapter_ref");

  return {
    adapter_kind: "synthetic_preservation_writer",
    feature_state: "off",
    adapter_ref: adapterRef,
    writePreservation(manifest, payloadObjects = []) {
      writeCalls += 1;
      const doWrite = () => {
        if (failWriteWith) {
          if (typeof failWriteWith === "string") {
            return { success: false, error_code: failWriteWith };
          }
          throw failWriteWith;
        }
        if (!isPlainRecord(manifest) || typeof manifest.manifest_id !== "string") {
          return { success: false, error_code: "INVALID_MANIFEST" };
        }
        if (store.has(manifest.manifest_id) && options.allowReplay !== true) {
          return { success: false, error_code: "PRESERVATION_REPLAY_CONFLICT" };
        }

        const objectsToStore = corruptWrite
          ? payloadObjects.map((obj) => {
              const corruptBuf = Buffer.alloc(obj.byte_count, 0x78);
              return { ...obj, bytes: corruptBuf };
            })
          : (partialWrite ? payloadObjects.slice(0, Math.max(0, payloadObjects.length - 1)) : payloadObjects);

        const record = {
          manifest: JSON.parse(JSON.stringify(manifest)),
          objects: objectsToStore.map((obj) => ({
            object_id: obj.object_id,
            kind: obj.kind,
            digest: obj.digest,
            byte_count: obj.byte_count,
            bytes: Buffer.isBuffer(obj.bytes) ? Buffer.from(obj.bytes) : Buffer.from(String(obj.bytes ?? ""))
          })),
          written_at: new Date().toISOString()
        };

        store.set(manifest.manifest_id, record);
        return {
          success: true,
          manifest_id: manifest.manifest_id,
          written_objects: record.objects.length
        };
      };

      if (isAsync) {
        if (failWriteWith && typeof failWriteWith !== "string") {
          return Promise.reject(failWriteWith);
        }
        return Promise.resolve().then(doWrite);
      }
      return doWrite();
    },
    getWriteCalls() {
      return writeCalls;
    },
    getStore() {
      return store;
    }
  };
}

export function createSyntheticPreservationReaderAdapter(options = {}) {
  const store = options.store ?? new Map();
  let readCalls = 0;
  const failReadWith = options.failReadWith ?? null;
  const isAsync = options.async === true;
  const adapterRef = options.adapter_ref ?? makePinnedRef("synthetic_preservation_reader_adapter_ref");

  return {
    adapter_kind: "synthetic_preservation_reader",
    feature_state: "off",
    adapter_ref: adapterRef,
    readPreservation(manifestId) {
      readCalls += 1;
      const doRead = () => {
        if (failReadWith) {
          if (typeof failReadWith === "string") {
            return { success: false, error_code: failReadWith };
          }
          throw failReadWith;
        }
        if (typeof manifestId !== "string" || !store.has(manifestId)) {
          return { success: false, error_code: "MANIFEST_NOT_FOUND" };
        }
        const record = store.get(manifestId);
        return {
          success: true,
          manifest: JSON.parse(JSON.stringify(record.manifest)),
          objects: record.objects.map((obj) => ({
            object_id: obj.object_id,
            kind: obj.kind,
            digest: obj.digest,
            byte_count: obj.byte_count,
            bytes: Buffer.from(obj.bytes)
          }))
        };
      };

      if (isAsync) {
        if (failReadWith && typeof failReadWith !== "string") {
          return Promise.reject(failReadWith);
        }
        return Promise.resolve().then(doRead);
      }
      return doRead();
    },
    getReadCalls() {
      return readCalls;
    }
  };
}
