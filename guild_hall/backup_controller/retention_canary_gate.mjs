import { createHash } from "node:crypto";
import { types } from "node:util";

export const RETENTION_CANARY_GATE_PIN_SCHEMA_VERSION =
  "soulforge.backup_controller.retention_canary_gate_pin.v1";

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

export const HELD_PRODUCTION_CANARY_GATE_ADAPTER = Object.freeze({
  adapter_kind: "held_production_canary_gate_adapter",
  feature_state: "off",
  authority_state: "hold",
  adapter_ref: makePinnedRef("held_production_canary_gate_adapter_ref"),
  observeArchive() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production task archive observation is feature-OFF and forbidden"
    };
  },
  removeWorktree() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production Git worktree removal is feature-OFF and forbidden"
    };
  },
  restoreProbe() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production Git restore probe is feature-OFF and forbidden"
    };
  }
});

export function createSyntheticCanaryGateAdapter(options = {}) {
  let observeCalls = 0;
  let removeCalls = 0;
  let restoreCalls = 0;

  const failObserveWith = options.failObserveWith ?? null;
  const failRemoveWith = options.failRemoveWith ?? null;
  const failRestoreWith = options.failRestoreWith ?? null;
  const adapterRef = options.adapter_ref ?? makePinnedRef("synthetic_canary_gate_adapter_ref");

  return {
    adapter_kind: "synthetic_canary_gate",
    feature_state: "off",
    adapter_ref: adapterRef,
    observeArchive(candidateId) {
      observeCalls += 1;
      if (failObserveWith) {
        if (typeof failObserveWith === "string") return { success: false, error_code: failObserveWith };
        throw failObserveWith;
      }
      return { success: true, archive_verified: true, status: "archived" };
    },
    removeWorktree(candidateId) {
      removeCalls += 1;
      if (failRemoveWith) {
        if (typeof failRemoveWith === "string") return { success: false, error_code: failRemoveWith };
        throw failRemoveWith;
      }
      return { success: true, removal_count: 1 };
    },
    restoreProbe(candidateId) {
      restoreCalls += 1;
      if (failRestoreWith) {
        if (typeof failRestoreWith === "string") return { success: false, error_code: failRestoreWith };
        throw failRestoreWith;
      }
      return { success: true, probe_verified: true, probe_count: 1 };
    },
    getObserveCalls() { return observeCalls; },
    getRemoveCalls() { return removeCalls; },
    getRestoreCalls() { return restoreCalls; }
  };
}

export const HELD_PRODUCTION_REPLAY_STORE = Object.freeze({
  feature_state: "off",
  consumeReplay() {
    return {
      success: false,
      error_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      message: "Production replay store consumption is feature-OFF and forbidden"
    };
  }
});

export function createSyntheticReplayStoreAdapter(options = {}) {
  const consumedMap = options.consumedMap ?? new Map();
  let consumeCalls = 0;

  return {
    store_kind: "synthetic_replay_store",
    feature_state: "off",
    consumeReplay(packetId) {
      consumeCalls += 1;
      if (consumedMap.has(packetId)) {
        return { success: false, error_code: "CANARY_REPLAY_CONFLICT", consumed: false };
      }
      consumedMap.set(packetId, new Date().toISOString());
      return { success: true, consumed: true, packet_id: packetId };
    },
    getConsumeCalls() { return consumeCalls; },
    hasConsumed(packetId) { return consumedMap.has(packetId); }
  };
}

export const HELD_PRODUCTION_BINDING_STORE = Object.freeze({
  store_kind: "held_production_binding_store",
  feature_state: "off",
  resolveBinding() {
    return null;
  }
});

export function createSyntheticBindingStoreAdapter(options = {}) {
  const bindingsMap = options.bindingsMap ?? new Map();
  let resolveCalls = 0;

  return {
    store_kind: "synthetic_binding_store",
    feature_state: "off",
    resolveBinding(bindingHandle) {
      resolveCalls += 1;
      if (typeof bindingHandle !== "string" || !bindingsMap.has(bindingHandle)) {
        return null;
      }
      const rec = bindingsMap.get(bindingHandle);
      return rec ? JSON.parse(JSON.stringify(rec)) : null;
    },
    getResolveCalls() { return resolveCalls; }
  };
}
