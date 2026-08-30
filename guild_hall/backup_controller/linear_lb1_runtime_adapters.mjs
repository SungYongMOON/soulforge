import { createHash } from "node:crypto";
import { types } from "node:util";

import {
  LINEAR_LB1_V2_DIMENSIONS,
  LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION,
  LinearLb1V2Error,
  collectFeatureOffLinearLb1V2Fixture,
  createFailedFeatureOffLinearLb1V2Collection,
} from "./linear_lb1_v2.mjs";
import { snapshotPlainData } from "./linear_lb1_owner_gate_v2.mjs";

export const LINEAR_LB1_RUNTIME_ADAPTERS_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.runtime_adapters.v2";

export class LinearLb1RuntimeAdapterError extends LinearLb1V2Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1RuntimeAdapterError";
  }
}

const REF_FIELDS = Object.freeze(["content_hash_alg", "content_id", "entity_id", "revision_id"]);
const SOURCE_FIELDS = Object.freeze([
  "provider", "scope_mode", "workspace_ref", "team_ids", "project_ids",
  "credential_ref", "credential_scope", "dimensions",
]);
const RESOURCE_LIMIT_FIELDS = Object.freeze(["max_issues", "max_total_bytes", "max_runtime_ms"]);
const WRITER_FIELDS = Object.freeze(["writer_id", "hostname", "platform", "epoch"]);
const HASH_REF = /^sha256:[0-9a-f]{64}$/u;
const HASH_HEX = /^[a-f0-9]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const LOCAL_PATH = /(?:^|[\s"'])(?:[A-Za-z]:[\\/]|file:\/\/\/|\/(?:home|Users)\/|\\\\)/u;
const URL = /(?:https?|file):\/\//iu;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const SYNTHETIC_DOMAIN = "synthetic";
const ALLOWED_ERROR_CODES = new Set([
  "provider_error", "provider_timeout", "provider_unavailable", "provider_rate_limited",
  "provider_page_invalid", "provider_page_shape_invalid", "read_failed", "resource_limit_exceeded",
]);
const READER_METHODS = new Set(["fetchSnapshot", "readSnapshot", "collectSnapshot", "paginateIssues"]);
const STORAGE_METHODS = new Set(["writeRevisionCreateOnly", "readRevision", "hasRevision"]);
const CLAIM_METHODS = new Set(["atomicClaim", "getRevocationState"]);
const READER_METADATA = new Set(["effect_domain", "synthetic_effects_attested", "mutation_allowed", "linear_write_allowed", "write_allowed"]);
const STORAGE_METADATA = new Set([
  "effect_domain", "synthetic_effects_attested", "target_ref", "storage_write_authority_ref",
  "overwrite_allowed", "delete_allowed", "public_share_allowed",
]);
const CLAIM_METADATA = new Set(["effect_domain", "synthetic_effects_attested", "durable"]);
const DANGEROUS_CAPABILITY = /delete|remove|unlink|trash|share|move|copy|rename|permission|transport|request|fetch|http|network|socket|send|publish|write|create|update|mutate|post|put|patch|archive|destroy|save|set|execute|insert|upsert/iu;

function codepointCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function frozenPlainClone(value) {
  const copy = snapshotPlainData(value);
  return copy === null ? null : deepFreeze(copy);
}

function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }

function makePinnedRef(seed) {
  const h = sha256(String(seed));
  return Object.freeze({
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: `sha256:${h}`,
    content_hash_alg: "sha256",
  });
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) return false;
  }
  actual.sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id)
    && UUID_V4.test(value.revision_id) && HASH_REF.test(value.content_id)
    && value.content_hash_alg === "sha256";
}

function sameRef(actual, expected) {
  return exactRef(actual) && exactRef(expected) && stableJson(actual) === stableJson(expected);
}

function safeString(value) {
  return typeof value === "string" && value.length <= 4096 && value.normalize("NFC") === value
    && !CONTROL.test(value) && !LOCAL_PATH.test(value) && !URL.test(value) && !SECRET.test(value);
}

function strictIso(value) {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isSafeInteger(Date.parse(value));
}

function readPinnedClock(clock) {
  try {
    const nowIso = clock.nowIso();
    const nowMs = clock.nowMs();
    return strictIso(nowIso) && Number.isSafeInteger(nowMs) && Date.parse(nowIso) === nowMs
      ? { nowIso, nowMs } : null;
  } catch {
    return null;
  }
}

function withinBudget(clock, startMs, maxRuntimeMs) {
  try {
    const nowMs = clock.nowMs();
    const elapsed = nowMs - startMs;
    return Number.isSafeInteger(nowMs) && Number.isSafeInteger(elapsed)
      && elapsed >= 0 && elapsed <= maxRuntimeMs;
  } catch {
    return false;
  }
}

function sanitizeErrorCode(raw) {
  if (typeof raw !== "string" || !safeString(raw)) return "provider_error";
  const candidate = raw.toLowerCase();
  return ALLOWED_ERROR_CODES.has(candidate) ? candidate : "provider_error";
}

function failedCollection(code) {
  return createFailedFeatureOffLinearLb1V2Collection({ errors: [{ code: sanitizeErrorCode(code) }] });
}

function inspectClient(client, kind, allowedMethods, allowedMetadata) {
  if (client === null || typeof client !== "object" || types.isProxy(client)) {
    throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_client_invalid`);
  }
  const metadata = Object.create(null);
  const methods = new Map();
  let current = client;
  while (current !== null && current !== Object.prototype) {
    if (types.isProxy(current)) {
      throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_capability_forbidden`);
    }
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key !== "string")) {
      throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_capability_forbidden`);
    }
    for (const key of keys) {
      if (key === "constructor" && current !== client) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
        throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_capability_forbidden`);
      }
      if (allowedMethods.has(key)) {
        if (typeof descriptor.value !== "function") throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_capability_forbidden`);
        if (methods.has(key)) throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_capability_forbidden`);
        methods.set(key, descriptor.value);
        continue;
      }
      if (current === client && allowedMetadata.has(key)) {
        if (typeof descriptor.value === "function" || descriptor.value === null) {
          throw new LinearLb1RuntimeAdapterError(`linear_lb1_${kind}_capability_forbidden`);
        }
        metadata[key] = descriptor.value;
        continue;
      }
      const code = DANGEROUS_CAPABILITY.test(key)
        ? `linear_lb1_${kind}_mutation_forbidden`
        : `linear_lb1_${kind}_capability_forbidden`;
      throw new LinearLb1RuntimeAdapterError(code);
    }
    current = Object.getPrototypeOf(current);
  }
  return { metadata, methods };
}

function getBoundMethod(client, capturedMethods, allowedNames) {
  for (const name of allowedNames) {
    const method = capturedMethods.get(name);
    if (method) {
      return { name, invoke: (...args) => method.call(client, ...args) };
    }
  }
  return null;
}

function assertSyntheticArm(config) {
  if (config.synthetic_only !== true) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_synthetic_only_required");
  if (typeof config.boundedPromise !== "function") throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_bounded_promise_required");
}

async function boundedCall(boundedPromise, call, clock, maxRuntimeMs) {
  return boundedPromise(Promise.resolve().then(call), Object.freeze({ clock, max_runtime_ms: maxRuntimeMs }));
}

function validateSourceScope(value) {
  const copy = snapshotPlainData(value);
  if (!copy || !exactKeys(copy, SOURCE_FIELDS) || copy.provider !== "linear"
      || (copy.scope_mode !== "entire_workspace" && copy.scope_mode !== "allowlist")
      || !exactRef(copy.workspace_ref) || !exactRef(copy.credential_ref)
      || copy.credential_scope !== "read_only" || !Array.isArray(copy.team_ids)
      || !Array.isArray(copy.project_ids) || !Array.isArray(copy.dimensions)
      || !copy.team_ids.every((id) => typeof id === "string" && SAFE_ID.test(id))
      || !copy.project_ids.every((id) => typeof id === "string" && SAFE_ID.test(id))
      || new Set(copy.team_ids).size !== copy.team_ids.length
      || new Set(copy.project_ids).size !== copy.project_ids.length
      || copy.dimensions.length !== LINEAR_LB1_V2_DIMENSIONS.length
      || !copy.dimensions.every((dimension, index) => dimension === LINEAR_LB1_V2_DIMENSIONS[index])) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_reader_scope_invalid");
  }
  if ((copy.scope_mode === "entire_workspace" && (copy.team_ids.length !== 0 || copy.project_ids.length !== 0))
      || (copy.scope_mode === "allowlist" && copy.team_ids.length === 0 && copy.project_ids.length === 0)) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_reader_scope_invalid");
  }
  return deepFreeze(copy);
}

function sameSourceScope(actual, expected) {
  return actual !== null && stableJson(actual) === stableJson(expected);
}

function validateResourceLimits(value) {
  const copy = snapshotPlainData(value);
  if (!copy || !exactKeys(copy, RESOURCE_LIMIT_FIELDS)
      || !Number.isSafeInteger(copy.max_issues) || copy.max_issues < 1 || copy.max_issues > 100000
      || !Number.isSafeInteger(copy.max_total_bytes) || copy.max_total_bytes < 1 || copy.max_total_bytes > 1073741824
      || !Number.isSafeInteger(copy.max_runtime_ms) || copy.max_runtime_ms < 1000 || copy.max_runtime_ms > 3600000) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_resource_limits_invalid");
  }
  return Object.freeze(copy);
}

function snapshotClientData(root, maxArrayItems = 500) {
  const seen = new WeakSet();
  let values = 0;
  function walk(value, depth) {
    values += 1;
    if (values > Math.min(200000, Math.max(20000, maxArrayItems * 80)) || depth > 24) throw new Error("snapshot_limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 4096 || value.normalize("NFC") !== value) throw new Error("snapshot_string");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw new Error("snapshot_number");
      return value;
    }
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) throw new Error("snapshot_shape");
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > maxArrayItems) throw new Error("snapshot_array");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key, index) => index < value.length ? key !== String(index) : key !== "length")) {
        throw new Error("snapshot_array_shape");
      }
      return value.map((entry) => walk(entry, depth + 1));
    }
    if (!isPlainRecord(value)) throw new Error("snapshot_record");
    const keys = Reflect.ownKeys(value);
    if (keys.length > 64 || keys.some((key) => typeof key !== "string")) throw new Error("snapshot_keys");
    const output = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
        throw new Error("snapshot_descriptor");
      }
      Object.defineProperty(output, key, { value: walk(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return output;
  }
  try {
    return walk(root, 0);
  } catch {
    return null;
  }
}

function sanitizeErrors(rawErrors) {
  if (!Array.isArray(rawErrors)) return [{ code: "provider_error" }];
  const codes = new Set();
  for (const item of rawErrors) {
    const copy = snapshotPlainData(item);
    if (!copy || !exactKeys(copy, ["code"])) codes.add("provider_error");
    else codes.add(sanitizeErrorCode(copy.code));
  }
  return [...codes].sort(codepointCompare).map((code) => ({ code }));
}

function validateDeclaredMissingDimensions(value) {
  if (!Array.isArray(value) || value.length > LINEAR_LB1_V2_DIMENSIONS.length) return null;
  const known = new Set(LINEAR_LB1_V2_DIMENSIONS);
  const seen = new Set();
  for (const dimension of value) {
    if (typeof dimension !== "string" || !SAFE_ID.test(dimension) || !safeString(dimension)
        || !known.has(dimension) || seen.has(dimension)) return null;
    seen.add(dimension);
  }
  return [...value];
}

function snapshotClientCollection(raw, maxArrayItems) {
  const copy = snapshotClientData(raw, maxArrayItems);
  if (!copy) return { failed: "provider_error" };
  if (exactKeys(copy, ["schema_version", "snapshot_id", "collected_at", "source_scope", "teams", "projects", "assignees", "statuses", "labels", "cutoff", "issues"])) {
    return { snapshot: copy, status: "complete", missingDimensions: [], errors: [] };
  }
  if (exactKeys(copy, ["snapshot", "collection_status", "declared_missing_dimensions", "errors"])
      && (copy.collection_status === "complete" || copy.collection_status === "partial" || copy.collection_status === "failed")) {
    if (copy.collection_status === "failed") return { failed: sanitizeErrors(copy.errors)[0].code };
    const missingDimensions = validateDeclaredMissingDimensions(copy.declared_missing_dimensions);
    if (missingDimensions === null) return { failed: "provider_error" };
    return {
      snapshot: copy.snapshot,
      status: copy.collection_status,
      missingDimensions,
      errors: sanitizeErrors(copy.errors),
    };
  }
  return { failed: "provider_error" };
}

function scopeContainsSnapshot(snapshot, scope) {
  if (!isPlainRecord(snapshot) || !isPlainRecord(snapshot.source_scope)
      || snapshot.source_scope.workspace_id !== scope.workspace_ref.entity_id
      || snapshot.source_scope.scope_mode !== scope.scope_mode
      || !Array.isArray(snapshot.source_scope.team_ids) || !Array.isArray(snapshot.source_scope.project_ids)
      || stableJson(snapshot.source_scope.team_ids) !== stableJson(scope.team_ids)
      || stableJson(snapshot.source_scope.project_ids) !== stableJson(scope.project_ids)) return false;
  if (scope.scope_mode !== "allowlist") return true;
  const teams = new Set(scope.team_ids);
  const projects = new Set(scope.project_ids);
  if (!Array.isArray(snapshot.teams) || !Array.isArray(snapshot.projects) || !Array.isArray(snapshot.issues)) return false;
  return snapshot.teams.every((team) => isPlainRecord(team) && teams.has(team.team_id))
    && snapshot.projects.every((project) => isPlainRecord(project) && teams.has(project.team_id) && projects.has(project.project_id))
    && snapshot.issues.every((issue) => isPlainRecord(issue) && teams.has(issue.team_id)
      && (issue.project_id === null || projects.has(issue.project_id)));
}

function readerEffects(calls, invocations) {
  return Object.freeze({
    adapter_kind: "linear_runtime_reader",
    feature_state: "bound_not_activated",
    authority_state: "synthetic_only",
    effect_domain: SYNTHETIC_DOMAIN,
    external_effect_evidence: "synthetic_attested_only",
    adapter_invocation_counts: Object.freeze({ collect_snapshot: invocations }),
    client_call_counts: Object.freeze({ read_calls: calls }),
  });
}

export const HELD_LINEAR_LB1_RUNTIME_READER_ADAPTER = Object.freeze({
  adapter_kind: "linear_runtime_reader", feature_state: "off", authority_state: "hold",
  adapter_ref: makePinnedRef("held_linear_lb1_runtime_reader_ref"),
  collectSnapshot() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_reader_hold"); },
});

export const HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER = Object.freeze({
  adapter_kind: "linear_runtime_backup_storage", feature_state: "off", authority_state: "hold",
  adapter_ref: makePinnedRef("held_linear_lb1_runtime_storage_ref"),
  overwrite_allowed: false, delete_allowed: false, public_share_allowed: false,
  writeRevisionCreateOnly() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_storage_hold"); },
  readRevision() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_storage_hold"); },
  hasRevision() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_storage_hold"); },
});

export const HELD_LINEAR_LB1_RUNTIME_CLAIM_ADAPTER = Object.freeze({
  adapter_kind: "linear_runtime_claim_store", feature_state: "off", authority_state: "hold",
  claim_store_ref: makePinnedRef("held_linear_lb1_runtime_claim_store_ref"),
  consumeOnce() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_claim_hold"); },
});

export const HELD_LINEAR_LB1_RUNTIME_ADAPTERS = Object.freeze({
  adapters_kind: "linear_lb1_runtime_adapters", feature_state: "off", authority_state: "hold",
  claimStore: HELD_LINEAR_LB1_RUNTIME_CLAIM_ADAPTER,
  linearReaderAdapter: HELD_LINEAR_LB1_RUNTIME_READER_ADAPTER,
  storageAdapter: HELD_LINEAR_LB1_RUNTIME_STORAGE_ADAPTER,
  clock: Object.freeze({
    nowIso() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_hold"); },
    nowMs() { throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_hold"); },
  }),
});

export function createLinearLb1RuntimeReaderAdapter(config = {}) {
  if (!isPlainRecord(config)) throw new LinearLb1RuntimeAdapterError("linear_lb1_reader_config_invalid");
  assertSyntheticArm(config);
  const adapterRef = config.adapter_ref ?? config.linear_reader_adapter_ref;
  if (!exactRef(adapterRef)) throw new LinearLb1RuntimeAdapterError("linear_lb1_reader_adapter_ref_invalid");
  if (!config.clock || typeof config.clock.nowIso !== "function" || typeof config.clock.nowMs !== "function") {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_invalid");
  }
  const scope = validateSourceScope(config.scope);
  const resourceLimits = validateResourceLimits(config.resource_limits);
  const clientCapabilities = inspectClient(config.linearClient, "reader", READER_METHODS, READER_METADATA);
  const { metadata } = clientCapabilities;
  if (metadata.effect_domain !== SYNTHETIC_DOMAIN || metadata.synthetic_effects_attested !== true
      || (metadata.mutation_allowed !== undefined && metadata.mutation_allowed !== false)
      || (metadata.linear_write_allowed !== undefined && metadata.linear_write_allowed !== false)
      || (metadata.write_allowed !== undefined && metadata.write_allowed !== false)) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_reader_capability_forbidden");
  }
  const method = getBoundMethod(config.linearClient, clientCapabilities.methods, ["fetchSnapshot", "readSnapshot", "collectSnapshot", "paginateIssues"]);
  if (!method) throw new LinearLb1RuntimeAdapterError("linear_lb1_reader_no_read_method");
  let calls = 0;
  let invocations = 0;

  return Object.freeze({
    adapter_kind: "linear_runtime_reader", feature_state: "bound_not_activated", authority_state: "synthetic_only",
    adapter_ref: Object.freeze({ ...adapterRef }),
    async collectSnapshot(sourceScope) {
      invocations += 1;
      const requestScope = snapshotPlainData(sourceScope);
      if (!sameSourceScope(requestScope, scope)) return failedCollection("read_failed");
      const start = readPinnedClock(config.clock);
      if (!start) return failedCollection("read_failed");
      let clientResult;
      try {
        if (method.name === "paginateIssues") {
          const pages = [];
          let cursor = null;
          const seen = new Set();
          while (true) {
            if (!withinBudget(config.clock, start.nowMs, resourceLimits.max_runtime_ms)) return failedCollection("provider_timeout");
            if (pages.length >= resourceLimits.max_issues) return failedCollection("provider_page_invalid");
            calls += 1;
            const clientScope = frozenPlainClone(scope);
            if (!clientScope) return failedCollection("read_failed");
            const rawPage = await boundedCall(config.boundedPromise,
              () => method.invoke(Object.freeze({ cursor, scope: clientScope })), config.clock, resourceLimits.max_runtime_ms);
            const page = snapshotClientData(rawPage, resourceLimits.max_issues);
            if (!page || !exactKeys(page, ["catalog", "has_more", "issues", "next_cursor"])
                || !Array.isArray(page.issues) || typeof page.has_more !== "boolean"
                || !(page.next_cursor === null || (typeof page.next_cursor === "string" && SAFE_ID.test(page.next_cursor)))) {
              return failedCollection("provider_page_shape_invalid");
            }
            pages.push(page);
            const issueCount = pages.reduce((count, item) => count + item.issues.length, 0);
            if (issueCount > resourceLimits.max_issues) return failedCollection("provider_page_invalid");
            if (!page.has_more) break;
            if (page.next_cursor === null || seen.has(page.next_cursor)) return failedCollection("provider_page_invalid");
            seen.add(page.next_cursor);
            cursor = page.next_cursor;
          }
          const catalog = pages.find((page) => page.catalog !== null)?.catalog;
          if (!catalog || !exactKeys(catalog, ["assignees", "labels", "projects", "statuses", "teams"])) return failedCollection("provider_page_shape_invalid");
          const now = readPinnedClock(config.clock);
          if (!now || !withinBudget(config.clock, start.nowMs, resourceLimits.max_runtime_ms)) return failedCollection("provider_timeout");
          const issues = pages.flatMap((page) => page.issues);
          clientResult = {
            schema_version: LINEAR_LB1_V2_SNAPSHOT_SCHEMA_VERSION,
            snapshot_id: `runtime-snapshot-${sha256(stableJson({ scope, issues, pages: pages.length })).slice(0, 48)}`,
            collected_at: now.nowIso,
            source_scope: {
              kind: "public_synthetic_fixture", workspace_id: scope.workspace_ref.entity_id,
              scope_mode: scope.scope_mode, team_ids: [...scope.team_ids], project_ids: [...scope.project_ids],
            },
            teams: catalog.teams, projects: catalog.projects, assignees: catalog.assignees, statuses: catalog.statuses, labels: catalog.labels,
            cutoff: { cutoff_at: now.nowIso, page_count: pages.length, total_issues: issues.length, pagination_complete: true },
            issues,
          };
        } else {
          calls += 1;
          const clientScope = frozenPlainClone(scope);
          if (!clientScope) return failedCollection("read_failed");
          clientResult = await boundedCall(config.boundedPromise,
            () => method.invoke(clientScope, resourceLimits), config.clock, resourceLimits.max_runtime_ms);
        }
      } catch {
        return failedCollection("provider_error");
      }
      if (!withinBudget(config.clock, start.nowMs, resourceLimits.max_runtime_ms)) return failedCollection("provider_timeout");
      const collection = snapshotClientCollection(clientResult, resourceLimits.max_issues);
      if (collection.failed) return failedCollection(collection.failed);
      if (!scopeContainsSnapshot(collection.snapshot, scope)) return failedCollection("read_failed");
      if (collection.snapshot.issues.length > resourceLimits.max_issues
          || Buffer.byteLength(stableJson(collection.snapshot), "utf8") > resourceLimits.max_total_bytes) return failedCollection("read_failed");
      try {
        return collectFeatureOffLinearLb1V2Fixture(collection.snapshot, {
          status: collection.status, missing_dimensions: collection.missingDimensions, errors: collection.errors,
        });
      } catch {
        return failedCollection("provider_error");
      }
    },
    getCallCount() { return calls; },
    getEffects() { return readerEffects(calls, invocations); },
  });
}

function storageEffects(writeCalls, readCalls, existsCalls, writeInvocations, readInvocations, existsInvocations) {
  return Object.freeze({
    adapter_kind: "linear_runtime_backup_storage",
    feature_state: "bound_not_activated",
    authority_state: "synthetic_only",
    effect_domain: SYNTHETIC_DOMAIN, external_effect_evidence: "synthetic_attested_only",
    adapter_invocation_counts: Object.freeze({
      write_revision_create_only: writeInvocations,
      read_revision: readInvocations,
      has_revision: existsInvocations,
    }),
    client_call_counts: Object.freeze({ write_calls: writeCalls, read_calls: readCalls, exists_calls: existsCalls }),
  });
}

function validRunKey(runKey) { return typeof runKey === "string" && SAFE_ID.test(runKey) && safeString(runKey); }

function snapshotStorageWriteResult(value, targetRef, authorityRef, runKey) {
  const copy = snapshotPlainData(value);
  if (!copy || !exactKeys(copy, ["bytes_written", "code", "run_key", "storage_write_authority_ref", "success", "target_ref"])
      || typeof copy.success !== "boolean" || !Number.isSafeInteger(copy.bytes_written) || copy.bytes_written < 0
      || !validRunKey(copy.run_key) || copy.run_key !== runKey || !sameRef(copy.target_ref, targetRef)
      || !sameRef(copy.storage_write_authority_ref, authorityRef)
      || (copy.success === true && copy.code !== "STORED")
      || (copy.success === false && copy.code !== "COLLISION" && copy.code !== "WRITE_FAILED")) return null;
  return copy;
}

function snapshotStorageReadResult(value, targetRef, authorityRef, runKey) {
  if (!isPlainRecord(value) || !exactKeys(value, ["bytes", "manifest_sha256", "run_key", "storage_write_authority_ref", "target_ref"])) return null;
  const descriptors = Object.fromEntries(Object.keys(value).map((key) => [key, Object.getOwnPropertyDescriptor(value, key)]));
  if (Object.values(descriptors).some((descriptor) => !descriptor || !("value" in descriptor) || descriptor.get || descriptor.set)) return null;
  const bytes = descriptors.bytes.value;
  if (!Buffer.isBuffer(bytes) || !validRunKey(descriptors.run_key.value) || descriptors.run_key.value !== runKey
      || typeof descriptors.manifest_sha256.value !== "string" || !HASH_HEX.test(descriptors.manifest_sha256.value)
      || !sameRef(descriptors.target_ref.value, targetRef)
      || !sameRef(descriptors.storage_write_authority_ref.value, authorityRef)) return null;
  return Object.freeze({ bytes: Buffer.from(bytes), manifest_sha256: descriptors.manifest_sha256.value });
}

export function createLinearLb1RuntimeStorageAdapter(config = {}) {
  if (!isPlainRecord(config)) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_config_invalid");
  assertSyntheticArm(config);
  const adapterRef = config.adapter_ref ?? config.storage_adapter_ref;
  if (!exactRef(adapterRef)) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_adapter_ref_invalid");
  if (!exactRef(config.target_ref) || !exactRef(config.storage_write_authority_ref)) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_binding_invalid");
  }
  const targetRef = frozenPlainClone(config.target_ref);
  const authorityRef = frozenPlainClone(config.storage_write_authority_ref);
  if (!targetRef || !authorityRef) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_binding_invalid");
  if (!config.clock || typeof config.clock.nowIso !== "function" || typeof config.clock.nowMs !== "function") {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_invalid");
  }
  const clientCapabilities = inspectClient(config.storageClient, "storage", STORAGE_METHODS, STORAGE_METADATA);
  const { metadata } = clientCapabilities;
  const clientTargetRef = snapshotPlainData(metadata.target_ref);
  const clientAuthorityRef = snapshotPlainData(metadata.storage_write_authority_ref);
  if (metadata.effect_domain !== SYNTHETIC_DOMAIN || metadata.synthetic_effects_attested !== true
      || !sameRef(clientTargetRef, targetRef)
      || !sameRef(clientAuthorityRef, authorityRef)
      || metadata.overwrite_allowed !== false || metadata.delete_allowed !== false || metadata.public_share_allowed !== false) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_unsafe_capabilities");
  }
  const writeMethod = getBoundMethod(config.storageClient, clientCapabilities.methods, ["writeRevisionCreateOnly"]);
  const readMethod = getBoundMethod(config.storageClient, clientCapabilities.methods, ["readRevision"]);
  if (!writeMethod || !readMethod) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_no_required_method");
  const existsMethod = getBoundMethod(config.storageClient, clientCapabilities.methods, ["hasRevision"]);
  let writeCalls = 0;
  let readCalls = 0;
  let existsCalls = 0;
  let writeInvocations = 0;
  let readInvocations = 0;
  let existsInvocations = 0;
  return Object.freeze({
    adapter_kind: "linear_runtime_backup_storage", feature_state: "bound_not_activated", authority_state: "synthetic_only",
    adapter_ref: Object.freeze({ ...adapterRef }), overwrite_allowed: false, delete_allowed: false, public_share_allowed: false,
    async writeRevisionCreateOnly(runKey, bytes, meta = {}) {
      writeInvocations += 1;
      if (!validRunKey(runKey)) throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_run_key_invalid");
      if (!Buffer.isBuffer(bytes)) throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_bytes_invalid");
      const metaCopy = snapshotPlainData(meta);
      if (!metaCopy || !exactKeys(metaCopy, ["manifest_sha256"]) || !HASH_HEX.test(metaCopy.manifest_sha256)) {
        throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_manifest_invalid");
      }
      const now = readPinnedClock(config.clock);
      if (!now) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_invalid");
      writeCalls += 1;
      let result;
      try {
        const clientTargetRef = frozenPlainClone(targetRef);
        const clientAuthorityRef = frozenPlainClone(authorityRef);
        if (!clientTargetRef || !clientAuthorityRef) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_binding_invalid");
        result = await boundedCall(config.boundedPromise, () => writeMethod.invoke(runKey, Buffer.from(bytes), Object.freeze({
          manifest_sha256: metaCopy.manifest_sha256, target_ref: clientTargetRef,
          storage_write_authority_ref: clientAuthorityRef,
        })), config.clock, 3600000);
      } catch {
        return Object.freeze({ success: false, error: "WRITE_FAILED", bytes_written: 0 });
      }
      if (!withinBudget(config.clock, now.nowMs, 3600000)) return Object.freeze({ success: false, error: "WRITE_FAILED", bytes_written: 0 });
      const safeResult = snapshotStorageWriteResult(result, targetRef, authorityRef, runKey);
      if (!safeResult) return Object.freeze({ success: false, error: "WRITE_FAILED", bytes_written: 0 });
      return safeResult.success === true
        ? Object.freeze({ success: true, bytes_written: safeResult.bytes_written })
        : Object.freeze({ success: false, error: safeResult.code === "COLLISION" ? "COLLISION" : "WRITE_FAILED", bytes_written: 0 });
    },
    async readRevision(runKey) {
      readInvocations += 1;
      if (!validRunKey(runKey)) throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_run_key_invalid");
      const now = readPinnedClock(config.clock);
      if (!now) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_invalid");
      readCalls += 1;
      let result;
      try {
        const clientTargetRef = frozenPlainClone(targetRef);
        const clientAuthorityRef = frozenPlainClone(authorityRef);
        if (!clientTargetRef || !clientAuthorityRef) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_binding_invalid");
        result = await boundedCall(config.boundedPromise,
          () => readMethod.invoke(runKey, Object.freeze({ target_ref: clientTargetRef, storage_write_authority_ref: clientAuthorityRef })), config.clock, 3600000);
      } catch {
        throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_read_failed");
      }
      if (!withinBudget(config.clock, now.nowMs, 3600000)) throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_read_failed");
      const safeResult = snapshotStorageReadResult(result, targetRef, authorityRef, runKey);
      if (!safeResult) throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_revision_not_found");
      return safeResult;
    },
    async hasRevision(runKey) {
      existsInvocations += 1;
      if (!validRunKey(runKey)) throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_run_key_invalid");
      if (!existsMethod) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_no_exists_method");
      existsCalls += 1;
      try {
        const clientTargetRef = frozenPlainClone(targetRef);
        const clientAuthorityRef = frozenPlainClone(authorityRef);
        if (!clientTargetRef || !clientAuthorityRef) throw new LinearLb1RuntimeAdapterError("linear_lb1_storage_binding_invalid");
        const result = await boundedCall(config.boundedPromise,
          () => existsMethod.invoke(runKey, Object.freeze({ target_ref: clientTargetRef, storage_write_authority_ref: clientAuthorityRef })), config.clock, 3600000);
        if (typeof result !== "boolean") throw new Error("invalid_exists_result");
        return result;
      } catch {
        throw new LinearLb1RuntimeAdapterError("linear_lb1_v2_storage_exists_failed");
      }
    },
    getWriteCalls() { return writeCalls; },
    getReadCalls() { return readCalls; },
    getEffects() { return storageEffects(writeCalls, readCalls, existsCalls, writeInvocations, readInvocations, existsInvocations); },
  });
}

function validateWriterIdentity(value) {
  const copy = snapshotPlainData(value);
  if (!copy || !exactKeys(copy, WRITER_FIELDS) || typeof copy.writer_id !== "string" || !SAFE_ID.test(copy.writer_id)
      || typeof copy.hostname !== "string" || !SAFE_ID.test(copy.hostname)
      || (copy.platform !== "win32" && copy.platform !== "darwin" && copy.platform !== "linux")
      || !Number.isSafeInteger(copy.epoch) || copy.epoch < 1) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_writer_identity_invalid");
  }
  return Object.freeze(copy);
}

function claimEffects(calls, revocationCalls, invocations) {
  return Object.freeze({
    adapter_kind: "linear_runtime_claim_store",
    feature_state: "bound_not_activated",
    authority_state: "synthetic_only",
    effect_domain: SYNTHETIC_DOMAIN, external_effect_evidence: "synthetic_attested_only",
    adapter_invocation_counts: Object.freeze({ consume_once: invocations }),
    client_call_counts: Object.freeze({ claim_calls: calls, revocation_calls: revocationCalls }),
  });
}

function snapshotRevocationResult(value, tokenDigest) {
  const copy = snapshotPlainData(value);
  return copy && exactKeys(copy, ["state", "token_digest"]) && copy.token_digest === tokenDigest
    && (copy.state === "active" || copy.state === "revoked") ? copy : null;
}

function snapshotClaimRecord(value) {
  const copy = snapshotPlainData(value);
  return copy && exactKeys(copy, ["consumed_at", "epoch", "packet_sha256", "token_digest", "writer_id"])
    && strictIso(copy.consumed_at) && Number.isSafeInteger(copy.epoch) && copy.epoch >= 1
    && typeof copy.writer_id === "string" && SAFE_ID.test(copy.writer_id)
    && HASH_REF.test(copy.packet_sha256) && HASH_REF.test(copy.token_digest) ? copy : null;
}

function snapshotClaimResult(value) {
  const copy = snapshotPlainData(value);
  if (!copy || !exactKeys(copy, ["code", "existing_claim", "success"])
      || typeof copy.success !== "boolean" || (copy.success === true && copy.code !== "CLAIMED")
      || (copy.success === false && copy.code !== "ALREADY_CONSUMED" && copy.code !== "CLAIM_FAILED")) return null;
  if (copy.success === true && copy.existing_claim !== null) return null;
  if (copy.success === false && copy.code === "ALREADY_CONSUMED" && !snapshotClaimRecord(copy.existing_claim)) return null;
  if (copy.success === false && copy.code === "CLAIM_FAILED" && copy.existing_claim !== null) return null;
  return copy;
}

export function createLinearLb1RuntimeClaimAdapter(config = {}) {
  if (!isPlainRecord(config)) throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_config_invalid");
  assertSyntheticArm(config);
  if (!exactRef(config.claim_store_ref)) throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_store_ref_invalid");
  if (!config.clock || typeof config.clock.nowIso !== "function" || typeof config.clock.nowMs !== "function") {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_invalid");
  }
  if (!strictIso(config.claim_expires_at)) throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_expiry_invalid");
  const writerIdentity = validateWriterIdentity(config.writer_identity);
  const clientCapabilities = inspectClient(config.claimClient, "claim", CLAIM_METHODS, CLAIM_METADATA);
  const { metadata } = clientCapabilities;
  if (metadata.effect_domain !== SYNTHETIC_DOMAIN || metadata.synthetic_effects_attested !== true || metadata.durable !== true) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_client_not_durable");
  }
  const claimMethod = getBoundMethod(config.claimClient, clientCapabilities.methods, ["atomicClaim"]);
  const revocationMethod = getBoundMethod(config.claimClient, clientCapabilities.methods, ["getRevocationState"]);
  if (!claimMethod) throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_client_not_atomic");
  if (!revocationMethod) throw new LinearLb1RuntimeAdapterError("linear_lb1_claim_revocation_evidence_missing");
  let calls = 0;
  let revocationCalls = 0;
  let invocations = 0;
  return Object.freeze({
    adapter_kind: "linear_runtime_claim_store", feature_state: "bound_not_activated", authority_state: "synthetic_only",
    claim_store_ref: Object.freeze({ ...config.claim_store_ref }),
    async consumeOnce(singleUseToken, metadataInput = {}) {
      invocations += 1;
      const tokenRef = snapshotPlainData(singleUseToken);
      const legacySyntheticToken = typeof singleUseToken === "string" && SAFE_ID.test(singleUseToken)
        && singleUseToken.length >= 8 && safeString(singleUseToken);
      if (!exactRef(tokenRef) && !legacySyntheticToken) return Object.freeze({ success: false, error: "INVALID_TOKEN" });
      const metadataCopy = snapshotPlainData(metadataInput);
      if (!metadataCopy || !exactKeys(metadataCopy, ["packet_sha256"]) || !HASH_REF.test(metadataCopy.packet_sha256)) {
        return Object.freeze({ success: false, error: "CLAIM_METADATA_INVALID" });
      }
      const now = readPinnedClock(config.clock);
      const expiresAt = Date.parse(config.claim_expires_at);
      if (!now || now.nowMs >= expiresAt) return Object.freeze({ success: false, error: "CLAIM_EXPIRED" });
      const tokenDigest = exactRef(tokenRef) ? tokenRef.content_id : `sha256:${sha256(singleUseToken)}`;
      revocationCalls += 1;
      let revocation;
      try {
        revocation = snapshotRevocationResult(await boundedCall(config.boundedPromise,
          () => revocationMethod.invoke(tokenDigest), config.clock, 3600000), tokenDigest);
      } catch {
        return Object.freeze({ success: false, error: "CLAIM_REVOCATION_HOLD", token_digest: tokenDigest });
      }
      if (!revocation) return Object.freeze({ success: false, error: "CLAIM_REVOCATION_HOLD", token_digest: tokenDigest });
      if (revocation.state === "revoked") return Object.freeze({ success: false, error: "CLAIM_REVOKED", token_digest: tokenDigest });
      const claimRecord = Object.freeze({
        token_digest: tokenDigest, packet_sha256: metadataCopy.packet_sha256,
        writer_id: writerIdentity.writer_id, epoch: writerIdentity.epoch, consumed_at: now.nowIso,
      });
      calls += 1;
      let rawResult;
      try {
        rawResult = await boundedCall(config.boundedPromise,
          () => claimMethod.invoke(tokenDigest, claimRecord), config.clock, 3600000);
      } catch {
        return Object.freeze({ success: false, error: "CLAIM_FAILED", token_digest: tokenDigest });
      }
      const result = snapshotClaimResult(rawResult);
      if (!result) return Object.freeze({ success: false, error: "CLAIM_FAILED", token_digest: tokenDigest });
      if (result.success === true) return Object.freeze({ success: true, token_digest: tokenDigest, consumed_at: now.nowIso });
      if (result.code !== "ALREADY_CONSUMED") return Object.freeze({ success: false, error: "CLAIM_FAILED", token_digest: tokenDigest });
      const existing = snapshotClaimRecord(result.existing_claim);
      if (existing.token_digest !== tokenDigest) return Object.freeze({ success: false, error: "CLAIM_CONFLICT", token_digest: tokenDigest });
      if (existing.writer_id === writerIdentity.writer_id && existing.epoch > writerIdentity.epoch) {
        return Object.freeze({ success: false, error: "STALE_EPOCH", token_digest: tokenDigest });
      }
      if (existing.writer_id === writerIdentity.writer_id && existing.epoch === writerIdentity.epoch
          && existing.packet_sha256 === metadataCopy.packet_sha256) {
        return Object.freeze({ success: false, error: "ALREADY_CONSUMED", token_digest: tokenDigest });
      }
      return Object.freeze({ success: false, error: "CLAIM_CONFLICT", token_digest: tokenDigest });
    },
    getCallCount() { return calls; },
    getEffects() { return claimEffects(calls, revocationCalls, invocations); },
  });
}

const RUNTIME_ADAPTER_CONFIG_FIELDS = Object.freeze([
  "boundedPromise", "claimClient", "claim_expires_at", "claim_store_ref", "clock", "credential_ref",
  "linearClient", "linear_reader_adapter_ref", "resource_limits", "scope", "storageClient",
  "storage_adapter_ref", "storage_target_ref", "storage_write_authority_ref", "synthetic_only",
  "workspace_ref", "writer_identity",
]);

export function createLinearLb1RuntimeAdapters(config) {
  if (!isPlainRecord(config)) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_adapters_config_invalid");
  if (!Object.keys(config).every((key) => RUNTIME_ADAPTER_CONFIG_FIELDS.includes(key))) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_adapters_unexpected_key");
  }
  assertSyntheticArm(config);
  const scope = validateSourceScope(config.scope);
  if (!sameRef(config.workspace_ref, scope.workspace_ref) || !sameRef(config.credential_ref, scope.credential_ref)) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_reader_binding_drift");
  }
  if (!exactRef(config.linear_reader_adapter_ref)) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_reader_ref_invalid");
  if (!exactRef(config.storage_adapter_ref)) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_storage_ref_invalid");
  if (!exactRef(config.claim_store_ref)) throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_claim_ref_invalid");
  if (!exactRef(config.storage_target_ref) || !exactRef(config.storage_write_authority_ref)) {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_storage_binding_invalid");
  }
  if (!config.clock || typeof config.clock.nowIso !== "function" || typeof config.clock.nowMs !== "function") {
    throw new LinearLb1RuntimeAdapterError("linear_lb1_runtime_clock_invalid");
  }
  const resourceLimits = validateResourceLimits(config.resource_limits);
  const linearReaderAdapter = createLinearLb1RuntimeReaderAdapter({
    linearClient: config.linearClient, adapter_ref: config.linear_reader_adapter_ref, scope,
    resource_limits: resourceLimits, clock: config.clock, boundedPromise: config.boundedPromise, synthetic_only: true,
  });
  const storageAdapter = createLinearLb1RuntimeStorageAdapter({
    storageClient: config.storageClient, adapter_ref: config.storage_adapter_ref,
    target_ref: config.storage_target_ref, storage_write_authority_ref: config.storage_write_authority_ref,
    clock: config.clock, boundedPromise: config.boundedPromise, synthetic_only: true,
  });
  const claimStore = createLinearLb1RuntimeClaimAdapter({
    claimClient: config.claimClient, claim_store_ref: config.claim_store_ref, writer_identity: config.writer_identity,
    claim_expires_at: config.claim_expires_at, clock: config.clock,
    boundedPromise: config.boundedPromise, synthetic_only: true,
  });
  return Object.freeze({ claimStore, clock: config.clock, linearReaderAdapter, storageAdapter });
}
