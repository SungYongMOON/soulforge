/**
 * Private shared state and helpers for the four Agent Observation seams.
 *
 * This module is internal to this owner. It is not a public surface and nothing outside
 * `guild_hall/agent_observation/` should import it: `agent_observation.mjs` is the public barrel.
 *
 * What lives here is exactly what the seams cannot each own without becoming two of something. The
 * store handle and the state it hides must exist once, or an append-only ledger would have two
 * copies to disagree about. The hold vocabulary must be one table, or the same refusal would carry
 * two names depending on which seam a caller reached. The append and ref helpers must be one
 * implementation, or a digest rule could drift between families.
 *
 * What deliberately does not live here is any per-family decision. The registry's crosswalk, the
 * run graph's parentage, the ledger's content key and the receipt's delivery target belong to their
 * seams. This module holds no knowledge of what an agent, a run, a usage event or a receipt is.
 */

import {
  deepFreeze,
  digestOf,
  hold,
  isPlainObject,
  isSafeRef,
  unknownKeyIn,
} from './guard_primitives.mjs';

export const OBSERVATION_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'ACCESSOR_PROPERTY_FORBIDDEN',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNKNOWN_STORE: 'UNKNOWN_STORE',
  UNKNOWN_PROJECT: 'UNKNOWN_PROJECT',
  UNKNOWN_AGENT: 'UNKNOWN_AGENT',
  UNKNOWN_RUN: 'UNKNOWN_RUN',
  UNKNOWN_PARENT_RUN: 'UNKNOWN_PARENT_RUN',
  PROJECT_BINDING_MISMATCH: 'PROJECT_BINDING_MISMATCH',
  PARENT_PROJECT_MISMATCH: 'PARENT_PROJECT_MISMATCH',
  AGENT_MEMORY_NOT_AUTHORITY_REQUIRED: 'AGENT_MEMORY_NOT_AUTHORITY_REQUIRED',
  PROVIDER_IDENTITY_SLOT_CONFLICT: 'PROVIDER_IDENTITY_SLOT_CONFLICT',
  PROVIDER_IDENTITY_CROSSWALK_CONFLICT: 'PROVIDER_IDENTITY_CROSSWALK_CONFLICT',
  AGENT_RECORD_CONFLICT: 'AGENT_RECORD_CONFLICT',
  RUN_RECORD_CONFLICT: 'RUN_RECORD_CONFLICT',
  USAGE_EVENT_CONFLICT: 'USAGE_EVENT_CONFLICT',
  USAGE_CONTENT_DUPLICATE: 'USAGE_CONTENT_DUPLICATE',
  RESULT_RECEIPT_CONFLICT: 'RESULT_RECEIPT_CONFLICT',
  DELIVERY_EDGE_CONFLICT: 'DELIVERY_EDGE_CONFLICT',
  UNKNOWN_RECEIPT: 'UNKNOWN_RECEIPT',
  RECEIPT_RUN_MISMATCH: 'RECEIPT_RUN_MISMATCH',
  SELF_DELIVERY_FORBIDDEN: 'SELF_DELIVERY_FORBIDDEN',
  EDGE_RECEIPT_NOT_DELIVERY: 'EDGE_RECEIPT_NOT_DELIVERY',
  RECEIPT_ALREADY_EVIDENCED: 'RECEIPT_ALREADY_EVIDENCED',
  DELIVERY_TARGET_REQUIRED: 'DELIVERY_TARGET_REQUIRED',
  DELIVERY_TARGET_FORBIDDEN: 'DELIVERY_TARGET_FORBIDDEN',
  DELIVERY_TARGET_WORK_UNIT_MISMATCH: 'DELIVERY_TARGET_WORK_UNIT_MISMATCH',
  DELIVERY_TARGET_MISMATCH: 'DELIVERY_TARGET_MISMATCH',
  DELIVERY_TARGET_TEMPORAL_INVERSION: 'DELIVERY_TARGET_TEMPORAL_INVERSION',
  STRUCTURAL_EDGE_CARRIES_NO_RECEIPT: 'STRUCTURAL_EDGE_CARRIES_NO_RECEIPT',
  AGENT_RUN_MISMATCH: 'AGENT_RUN_MISMATCH',
  RUN_MODEL_MISMATCH: 'RUN_MODEL_MISMATCH',
  CHILD_USAGE_MERGE_FORBIDDEN: 'CHILD_USAGE_MERGE_FORBIDDEN',
  TOKEN_PARTITION_INVALID: 'TOKEN_PARTITION_INVALID',
  COST_EVIDENCE_REQUIRED: 'COST_EVIDENCE_REQUIRED',
  TEMPORAL_ORDER_INVALID: 'TEMPORAL_ORDER_INVALID',
  RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE: 'RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE',
  STRUCTURAL_EDGE_NOT_DELIVERY: 'STRUCTURAL_EDGE_NOT_DELIVERY',
});
const H = OBSERVATION_HOLD_CODES;

/** The entry-guard's findings mapped onto this owner's hold vocabulary, once for every seam. */
export const ENTRY_CODES = Object.freeze({
  unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: H.SECRET_VALUE_FORBIDDEN,
  localPath: H.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
  tooLarge: H.INPUT_TOO_LARGE,
  hostileInput: H.HOSTILE_INPUT_REFUSED,
  accessor: H.ACCESSOR_PROPERTY_FORBIDDEN,
});

export const MAX_TOKENS = 1_000_000_000;
export const MAX_LIST = 64;

/** The evidence ref shape is carried by three families, so its keys are shared rather than copied. */
export const REF_FIELDS = Object.freeze(['ref_kind', 'ref_value']);

// Runs, usage events and receipts all cite evidence, and they must cite it from one vocabulary. Two
// exported lists - one for refs, one for receipt kinds - drifted apart the moment either was
// extended, so the list is held here once and the receipt seam names it publicly.
export const EVIDENCE_REF_KINDS = Object.freeze(['result', 'delivery', 'artifact', 'approval', 'validation', 'recovery']);

// Store state lives outside the handle so an append-only ledger cannot be cleared, spliced, or
// rewritten by a consumer that happens to hold the store object. The seams reach it through
// `stateOf`, which is why this WeakMap exists exactly once in this owner.
const STATE = new WeakMap();

export const stateOf = (store) => STATE.get(store);

export function createObservationStore() {
  const store = Object.freeze({ kind: 'soulforge.agent_observation.store.v1' });
  STATE.set(store, {
    agents: new Map(),
    runs: new Map(),
    usage: new Map(),
    receipts: new Map(),
    deliveryEdges: new Map(),
    providerCrosswalk: new Map(),
    usageContentIndex: new Map(),
  });
  return store;
}

export function append(map, key, record, conflictCode) {
  const digest = digestOf(record);
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing.digest === digest
      ? { status: 'NO_OP', record: existing.record }
      : hold(conflictCode);
  }
  const frozen = deepFreeze(record);
  map.set(key, { record: frozen, digest });
  return { status: 'NEW', record: frozen };
}

export function guardRefList(list, allowedKinds, { allowEmpty }) {
  if (!Array.isArray(list) || list.length > MAX_LIST) return hold(H.INVALID_FIELD_VALUE, 'ref_list');
  if (!allowEmpty && list.length === 0) return hold(H.INVALID_FIELD_VALUE, 'ref_list_empty');
  for (const entry of list) {
    if (!isPlainObject(entry)) return hold(H.INVALID_FIELD_VALUE, 'ref_entry');
    const extra = unknownKeyIn(entry, REF_FIELDS);
    if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
    if (!allowedKinds.includes(entry.ref_kind)) return hold(H.INVALID_FIELD_VALUE, 'ref_kind');
    if (!isSafeRef(entry.ref_value)) return hold(H.INVALID_FIELD_VALUE, 'ref_value');
  }
  return null;
}

export const normalizeRefs = (list) => list.map((ref) => ({ ref_kind: ref.ref_kind, ref_value: ref.ref_value }));

// Returns null - not an empty array - for an unrecognized handle, so an unknown store can never
// read as "this store holds nothing".
export const recordsOf = (store, mapName) => {
  const state = stateOf(store);
  return state === undefined ? null : [...state[mapName].values()].map((entry) => entry.record);
};
