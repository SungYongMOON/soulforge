/**
 * Agent Observation - the public surface over four module seams.
 *
 * The observed record families used to live in this one file. They are four contracts, not one:
 *
 * - `agent_registry.mjs`    durable agent identity, project binding, provider crosswalk
 * - `run_observation.mjs`   observed runs, their authority and times, and the run graph
 * - `usage_ledger.mjs`      direct usage attribution and the self/child/subtree rollup
 * - `delivery_evidence.mjs` receipts, the consumer a delivery names, and the delivery edge
 *
 * Each seam owns its own guards, its own record shape and its own refusals, and they share exactly
 * one store handle through the private `observation_internals.mjs`. That handle stays encapsulated:
 * the maps are held in a WeakMap keyed by the handle, so no consumer - including this file - can
 * reach a ledger to clear, splice or rewrite it.
 *
 * This module stays the import path every existing caller already uses, and adds the two surfaces
 * that are genuinely cross-family: the record key allowlist, which only exists as the union of what
 * the four seams allow, and the store-wide privacy audit and count projection, which must cover all
 * families or it is not a store-wide claim. Both are written against the seams' public interfaces
 * rather than the shared state, so this file cannot become a fifth ledger.
 */

import {
  findLocalPath,
  findSecret,
  findUnknownKeyDeep,
  hold,
} from './guard_primitives.mjs';

import {
  OBSERVATION_HOLD_CODES,
  REF_FIELDS,
  createObservationStore,
} from './observation_internals.mjs';

import {
  AGENT_NESTED_KEYS,
  AGENT_RECORD_KEYS,
  listAgents,
} from './agent_registry.mjs';
import {
  RUN_RECORD_KEYS,
  listRuns,
} from './run_observation.mjs';
import {
  USAGE_NESTED_KEYS,
  USAGE_RECORD_KEYS,
  listUsageEvents,
} from './usage_ledger.mjs';
import {
  DELIVERY_EDGE_RECORD_KEYS,
  EVIDENCE_NESTED_KEYS,
  RECEIPT_RECORD_KEYS,
  listDeliveryEdges,
  listReceipts,
} from './delivery_evidence.mjs';

export { OBSERVATION_HOLD_CODES, createObservationStore };

export {
  AGENT_KINDS,
  AGENT_RECORD_SCHEMA,
  FUNCTIONAL_ROLES,
  listAgents,
  registerAgent,
} from './agent_registry.mjs';

export {
  RUN_AUTHORITIES,
  RUN_LIFECYCLES,
  RUN_RECORD_SCHEMA,
  RUN_RESULT_STATES,
  listRuns,
  observeRun,
} from './run_observation.mjs';

export {
  COST_BASES,
  COST_BASES_REQUIRING_EVIDENCE,
  USAGE_EVENT_SCHEMA,
  listUsageEvents,
  projectUsageRollup,
  recordDirectUsage,
} from './usage_ledger.mjs';

export {
  DELIVERY_EDGE_KINDS,
  DELIVERY_EDGE_SCHEMA,
  PRODUCER_EVIDENCE_KINDS,
  RECEIPT_KINDS,
  RESULT_RECEIPT_SCHEMA,
  listDeliveryEdges,
  listReceipts,
  projectDeliveryEdges,
  recordDeliveryEdge,
  recordResultReceipt,
} from './delivery_evidence.mjs';

/** The union of what each seam allows at the top level of its own record. */
export const RECORD_KEY_ALLOWLIST = Object.freeze({
  agent: AGENT_RECORD_KEYS,
  run: RUN_RECORD_KEYS,
  usage: USAGE_RECORD_KEYS,
  receipt: RECEIPT_RECORD_KEYS,
  deliveryEdge: DELIVERY_EDGE_RECORD_KEYS,
});

// Every key that may legally appear below the top level of a stored record, contributed by the seam
// that owns the nested shape.
const NESTED_RECORD_KEYS = Object.freeze([
  ...AGENT_NESTED_KEYS, ...USAGE_NESTED_KEYS, ...EVIDENCE_NESTED_KEYS, ...REF_FIELDS,
]);

// Exported as a pure function over records so the audit itself can be exercised against a
// deliberately bad record. A guard that can only ever see clean input proves nothing.
export function auditRecordPrivacy(records, allowedKeys) {
  if (!Array.isArray(records) || !Array.isArray(allowedKeys)) {
    return hold(OBSERVATION_HOLD_CODES.INVALID_FIELD_VALUE, 'audit_input');
  }
  // Nested keys count too: a raw field hidden inside a ref entry or a token block is still a raw
  // field stored. The allowlist is the record's own keys plus every legal nested key.
  const allowed = new Set([...allowedKeys, ...NESTED_RECORD_KEYS]);
  const counters = { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 };
  for (const record of records) {
    // A value too deep to scan is counted as a finding on every axis rather than passed as clean.
    const unknownKey = findUnknownKeyDeep(record, allowed);
    const secret = findSecret(record);
    const localPath = findLocalPath(record);
    if (unknownKey !== null) counters.raw_fields_stored += 1;
    if (secret !== null) counters.secret_fields_stored += 1;
    if (localPath !== null) counters.local_path_fields_stored += 1;
  }
  return counters;
}

function mergeCounters(target, source) {
  for (const key of Object.keys(source)) target[key] += source[key];
  return target;
}

export function projectStoreCounts(store) {
  const privacy = { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 };
  // One list drives the audits, the counts and the report of which families were audited. All-zero
  // counters are true whether or not a family is on this list, so dropping one used to be
  // invisible; naming the covered families from the same source makes the omission observable
  // without letting a second, driftable declaration exist.
  const COVERAGE = [
    ['agents', listAgents, RECORD_KEY_ALLOWLIST.agent],
    ['runs', listRuns, RECORD_KEY_ALLOWLIST.run],
    ['usage', listUsageEvents, RECORD_KEY_ALLOWLIST.usage],
    ['receipts', listReceipts, RECORD_KEY_ALLOWLIST.receipt],
    ['delivery_edges', listDeliveryEdges, RECORD_KEY_ALLOWLIST.deliveryEdge],
  ];
  const auditedFamilies = [];
  const sizes = [];
  for (const [family, list, allowlist] of COVERAGE) {
    // Each seam answers `null` for a handle it does not recognize, which must read as a hold and
    // never as an empty family.
    const records = list(store);
    if (records === null) return hold(OBSERVATION_HOLD_CODES.UNKNOWN_STORE);
    const audit = auditRecordPrivacy(records, allowlist);
    // A HOLD-shaped audit must surface as a HOLD, never be summed into the counters as NaN.
    if (audit.status === 'HOLD') return audit;
    mergeCounters(privacy, audit);
    auditedFamilies.push(family);
    sizes.push(records.length);
  }

  return {
    status: 'PROJECTED',
    agents: sizes[0],
    runs: sizes[1],
    usage_events: sizes[2],
    receipts: sizes[3],
    delivery_edges: sizes[4],
    privacy,
    privacy_audited_families: auditedFamilies,
    // A declared boundary, not a measurement. What actually proves it is the absence of any
    // effectful import or global call, which the validator checks against the module source.
    declared_effect_boundary: {
      erp_world_tree_writes: 0,
      board_enrollment_writes: 0,
      result_gate_writes: 0,
      file_writes: 0,
      external_calls: 0,
    },
  };
}
