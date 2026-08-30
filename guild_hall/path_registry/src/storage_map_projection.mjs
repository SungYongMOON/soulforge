// 4192 Storage & Backup Map projection — plan 17, leaf R3.
//
// A read-only, registry-driven BACKUP-READINESS OVERLAY: every row of the
// R1 registry snapshot produces exactly one map row (a self-selected subset
// cannot satisfy coverage), bound to the exact snapshot digest. The 4192
// federated topology (RED-02 pinned artifact) already owns Slack, mail,
// PLAUD/voice, collector, custody-store node identity and health truth —
// this projection NEVER mints a topology node, card, or competing health
// state. Rows resolve to existing stable node IDs via
// `topology_node_refs`/`registry_record_ref`/`owner_pointer` and add only
// backup-generation, coverage, freshness, restore-test, path-drift, and
// HOLD detail; rows carry no display label, node kind, or edge data, so a
// consumer cannot build a duplicate source card from them. Missing evidence
// renders `unknown` or `hold`, never green; state precedence is
// `hold > unavailable > stale > degraded > unknown > healthy`;
// `not_applicable` rows are excluded from expected coverage only by their
// explicit registry record. No writer fields, raw bodies, credentials, or
// absolute paths. This module files nothing and executes nothing.

import { PATH_REGISTRY_SCHEMA } from "./path_registry_core.mjs";
import { PANEL_STATES } from "../../watch_panel_contract/src/watch_panel_contract.mjs";

export const STORAGE_MAP_SCHEMA = "soulforge.watch_storage_map.v0";

export const STORAGE_MAP_ROW_KINDS = Object.freeze(["root", "source", "asset_class"]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const EVIDENCE_KEYS = Object.freeze([
  "binding_state", "latest_capture_ref", "backup_generation_ref",
  "freshness_state", "retention_policy_ref", "rpo_policy_ref",
  "restore_test_ref", "human_acceptance_state", "evidence_at",
]);

const BINDING_STATES = Object.freeze(["bound", "unbound", "unavailable"]);
const FRESHNESS_STATES = Object.freeze(["fresh", "stale"]);
const ACCEPTANCE_STATES = Object.freeze(["accepted", "pending"]);

// Watch shows aggregates and safe pointers; these can never enter a row or
// an evidence record (mirrors the plan-08 panel contract).
const FORBIDDEN_EVIDENCE_KEYS = Object.freeze([
  "raw_message", "message_body", "transcript", "memory", "prompt",
  "hidden_reasoning", "secret", "token_value", "password", "cookie",
  "write_policy", "sole_writer_ref", "authorized_writer_refs",
]);

function hold(holdCode, detail) {
  return Object.freeze({
    status: "hold",
    hold_code: holdCode,
    ...(detail === undefined ? {} : { detail }),
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function absolutePathLeak(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function validateEvidence(record, id) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { error: hold("evidence_invalid", id) };
  }
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_EVIDENCE_KEYS.includes(key)) {
      return { error: hold("evidence_forbidden_field", `${id}:${key}`) };
    }
    if (!EVIDENCE_KEYS.includes(key)) {
      return { error: hold("evidence_unknown_field", `${id}:${key}`) };
    }
    if (absolutePathLeak(record[key])) {
      return { error: hold("evidence_absolute_path", `${id}:${key}`) };
    }
  }
  if (typeof record.evidence_at !== "string" || !ISO.test(record.evidence_at)) {
    return { error: hold("evidence_clock_invalid", id) };
  }
  if (!BINDING_STATES.includes(record.binding_state)) {
    return { error: hold("evidence_invalid", `${id}:binding_state`) };
  }
  if (!FRESHNESS_STATES.includes(record.freshness_state)) {
    return { error: hold("evidence_invalid", `${id}:freshness_state`) };
  }
  if (record.human_acceptance_state !== undefined
      && !ACCEPTANCE_STATES.includes(record.human_acceptance_state)) {
    return { error: hold("evidence_invalid", `${id}:human_acceptance_state`) };
  }
  return { evidence: record };
}

function rowKindFor(registryRowKind) {
  if (registryRowKind === "source") return "source";
  if (registryRowKind === "asset_class") return "asset_class";
  return "root";
}

function watchStateFor(record, evidence) {
  if (record.current_state === "held" || record.current_state === "unknown"
      || record.current_state === "deprecated") {
    return { watch_state: "hold", hold_code: "record_held" };
  }
  if (evidence === undefined) {
    return { watch_state: "unknown", hold_code: null };
  }
  if (evidence.binding_state === "unavailable") {
    return { watch_state: "unavailable", hold_code: null };
  }
  if (evidence.freshness_state === "stale") {
    return { watch_state: "stale", hold_code: null };
  }
  const complete = evidence.binding_state === "bound"
    && typeof evidence.latest_capture_ref === "string"
    && typeof evidence.backup_generation_ref === "string"
    && typeof evidence.retention_policy_ref === "string"
    && typeof evidence.rpo_policy_ref === "string"
    && typeof evidence.restore_test_ref === "string"
    && evidence.human_acceptance_state === "accepted";
  return { watch_state: complete ? "healthy" : "degraded", hold_code: null };
}

const STATE_PRECEDENCE = Object.freeze(["hold", "unavailable", "stale", "degraded", "unknown", "healthy"]);

export function aggregateStorageMapState(states) {
  for (const state of states) {
    if (!STATE_PRECEDENCE.includes(state)) return "hold";
  }
  for (const state of STATE_PRECEDENCE) {
    if (states.includes(state)) return state;
  }
  return "unknown";
}

export function buildStorageMap({ registry_snapshot, evidence = {}, unclassified_count = 0 } = {}) {
  if (registry_snapshot === null || typeof registry_snapshot !== "object"
      || registry_snapshot.schema !== PATH_REGISTRY_SCHEMA
      || typeof registry_snapshot.snapshot_digest !== "string"
      || !Array.isArray(registry_snapshot.rows)) {
    return hold("snapshot_invalid");
  }
  if (!Number.isInteger(unclassified_count) || unclassified_count < 0) {
    return hold("unclassified_count_invalid");
  }
  const known = new Set(registry_snapshot.rows.map((row) => row.logical_path_id));
  for (const id of Object.keys(evidence)) {
    // Registry-driven coverage: evidence can qualify registered rows, never
    // add rows the registry does not know.
    if (!known.has(id)) return hold("evidence_unregistered", id);
  }

  const rows = [];
  const aggregateInputs = [];
  let expected = 0;
  for (const record of registry_snapshot.rows) {
    const applicable = record.applicability !== "not_applicable";
    let rowEvidence;
    if (evidence[record.logical_path_id] !== undefined) {
      const outcome = validateEvidence(evidence[record.logical_path_id], record.logical_path_id);
      if (outcome.error) return outcome.error;
      rowEvidence = outcome.evidence;
    }
    const state = applicable
      ? watchStateFor(record, rowEvidence)
      : { watch_state: "unknown", hold_code: null };
    if (applicable) {
      expected += 1;
      aggregateInputs.push(state.watch_state);
    }
    if (!PANEL_STATES.includes(state.watch_state)) {
      return hold("state_outside_panel_enum", state.watch_state);
    }
    rows.push({
      row_key: `storage_map:${record.logical_path_id}`,
      row_kind: rowKindFor(record.row_kind),
      logical_id: record.logical_path_id,
      physical_root_class: record.physical_root_class,
      registry_snapshot_ref: registry_snapshot.snapshot_digest,
      registry_snapshot_digest: registry_snapshot.snapshot_digest,
      registry_record_ref: record.logical_path_id,
      topology_node_refs: [...(record.topology_node_refs ?? [])],
      binding_state: rowEvidence?.binding_state ?? "unknown",
      latest_capture_ref: rowEvidence?.latest_capture_ref ?? null,
      backup_generation_ref: rowEvidence?.backup_generation_ref ?? null,
      coverage_state: rowEvidence === undefined ? "missing_evidence" : "covered",
      coverage_registered: known.size,
      coverage_expected: 0, // finalized below once expected is complete
      unclassified_count,
      path_drift_state: unclassified_count > 0 ? "drift" : "none_observed",
      freshness_state: rowEvidence?.freshness_state ?? "unknown",
      retention_policy_state: rowEvidence?.retention_policy_ref ? "present" : "unknown",
      rpo_policy_state: rowEvidence?.rpo_policy_ref ? "present" : "unknown",
      restore_test_ref: rowEvidence?.restore_test_ref ?? null,
      human_acceptance_state: rowEvidence?.human_acceptance_state ?? "unknown",
      migration_state: record.current_state,
      applicability_state: applicable ? "applicable" : "not_applicable",
      watch_state: state.watch_state,
      evidence_at: rowEvidence?.evidence_at ?? null,
      owner_pointer: record.owner_refs.logical,
      hold_code: state.hold_code,
    });
  }
  for (const row of rows) row.coverage_expected = expected;

  if (unclassified_count > 0) aggregateInputs.push("hold");
  const aggregate = aggregateStorageMapState(aggregateInputs);
  return deepFreeze({
    status: "projected",
    schema: STORAGE_MAP_SCHEMA,
    projection_kind: "backup_readiness_overlay",
    registry_snapshot_digest: registry_snapshot.snapshot_digest,
    rows,
    summary: {
      coverage_registered: known.size,
      coverage_expected: expected,
      unclassified_count,
      aggregate_state: aggregate,
      ...(unclassified_count > 0 ? { hold_code: "unclassified_paths" } : {}),
    },
  });
}
