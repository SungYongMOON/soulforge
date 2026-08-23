/**
 * Seam D - Evidence and Receipts, including the delivery edge.
 *
 * This seam owns everything a run claims to have produced and everything that claims to have been
 * handed over: the receipt, the exact consumer a delivery names, the edge between two runs, and the
 * projection that reports what actually reached a consumer and on whose evidence.
 *
 * Receipt and edge stay in one seam on purpose. They are one contract read from two ends - the edge
 * is only as good as the receipt it cites, and the receipt's delivery target is only meaningful
 * because the edge must land on it. Splitting them would put half of a single rule in each of two
 * files and invite an edge that trusts a receipt no one re-checked.
 */

import {
  guardEntry,
  hold,
  isPlainObject,
  isSafeId,
  isUtcMs,
  unknownKeyIn,
} from './guard_primitives.mjs';

import { findRunRecord } from './run_observation.mjs';

import {
  ENTRY_CODES,
  EVIDENCE_REF_KINDS,
  OBSERVATION_HOLD_CODES,
  REF_FIELDS,
  append,
  guardRefList,
  normalizeRefs,
  recordsOf,
  stateOf,
} from './observation_internals.mjs';

const H = OBSERVATION_HOLD_CODES;

// v2: a delivery receipt now carries the exact consumer it was produced for. That is a change to
// the stored shape, so it gets its own version rather than being folded into v1 as an optional
// extra field. A reader holding the v1 contract must be told the shape moved, not handed a record
// that looks like v1 and is not.
export const RESULT_RECEIPT_SCHEMA = 'soulforge.agent_observation.result_receipt.v2';
export const DELIVERY_EDGE_SCHEMA = 'soulforge.agent_observation.delivery_edge.v1';

// Receipt kinds and evidence ref kinds are the same vocabulary, held once in the internals module
// so the two names cannot drift apart as two independent lists.
export const RECEIPT_KINDS = EVIDENCE_REF_KINDS;
export const PRODUCER_EVIDENCE_KINDS = Object.freeze(['producer_observed', 'structural_only']);
export const DELIVERY_EDGE_KINDS = Object.freeze(['delivery', 'structural']);

const RECEIPT_FIELDS = Object.freeze(['receipt_id', 'run_id', 'agent_id', 'receipt_kind', 'producer_evidence_kind', 'delivery_target', 'refs', 'observed_at']);
const DELIVERY_TARGET_FIELDS = Object.freeze(['target_run_id', 'target_agent_id', 'target_work_unit_id']);
const DELIVERY_EDGE_FIELDS = Object.freeze(['edge_id', 'producer_run_id', 'producer_agent_id', 'consumer_run_id', 'consumer_agent_id', 'edge_kind', 'receipt_id', 'observed_at']);

export const RECEIPT_RECORD_KEYS = Object.freeze(['schema_version', ...RECEIPT_FIELDS]);
export const DELIVERY_EDGE_RECORD_KEYS = Object.freeze(['schema_version', ...DELIVERY_EDGE_FIELDS]);
export const EVIDENCE_NESTED_KEYS = Object.freeze([...REF_FIELDS, ...DELIVERY_TARGET_FIELDS]);

/**
 * Checks the exact consumer a delivery receipt was produced for against the runs actually observed.
 *
 * A receipt used to record only that a run produced these refs. Any same-project run could then be
 * named as the consumer of that hand-over, because every other check - the project firewall, both
 * agent-to-run checks, the receipt-to-producer-run check - passes for an unrelated bystander. None
 * of them knows who the producer meant to hand the work to. The producer does, so it says so here,
 * and the claim is verified rather than stored as an assertion: the target run must be observed, sit
 * in the producer's own project, belong to the named agent, and carry the named work unit.
 *
 * This stays a producer-observed targeted hand-over. It is the producer naming its intended
 * consumer, not the consumer acknowledging receipt, and nothing here observes the consumer's side.
 */
function guardDeliveryTarget(store, target, producerRun, observedAt) {
  if (target === null || target === undefined) return hold(H.DELIVERY_TARGET_REQUIRED);
  if (!isPlainObject(target)) return hold(H.INVALID_FIELD_VALUE, 'delivery_target');
  const extra = unknownKeyIn(target, DELIVERY_TARGET_FIELDS);
  if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
  for (const key of DELIVERY_TARGET_FIELDS) {
    if (!isSafeId(target[key])) return hold(H.INVALID_FIELD_VALUE, `delivery_target.${key}`);
  }

  if (target.target_run_id === producerRun.run_id) return hold(H.SELF_DELIVERY_FORBIDDEN, 'delivery_target');
  const targetRun = findRunRecord(store, target.target_run_id);
  if (targetRun === undefined) return hold(H.UNKNOWN_RUN, 'delivery_target');
  // The same firewall the run and edge contracts enforce, closed one step earlier: at the receipt,
  // before any edge exists that could carry the hand-over across a project boundary.
  if (targetRun.project_id !== producerRun.project_id) return hold(H.PROJECT_BINDING_MISMATCH, 'delivery_target');
  if (targetRun.agent_id !== target.target_agent_id) return hold(H.AGENT_RUN_MISMATCH, 'delivery_target');
  if (targetRun.work_unit_id !== target.target_work_unit_id) return hold(H.DELIVERY_TARGET_WORK_UNIT_MISMATCH);
  // A hand-over cannot have been delivered to a run that did not exist when it was observed. Every
  // other bound here is about the producer's own run, so a receipt naming a consumer that starts
  // later passes them all and records a delivery to a future consumer. The bound is inclusive, like
  // the receipt's own `receipt_before_run_start` rule and both edge bounds.
  if (observedAt < targetRun.started_at) return hold(H.DELIVERY_TARGET_TEMPORAL_INVERSION);
  return null;
}

export function recordResultReceipt(store, rawInput) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guarded = guardEntry(rawInput, RECEIPT_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;

  if (!isSafeId(input.receipt_id)) return hold(H.INVALID_FIELD_VALUE, 'receipt_id');
  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  const run = findRunRecord(store, input.run_id);
  if (run === undefined) return hold(H.UNKNOWN_RUN);
  if (input.agent_id !== run.agent_id) return hold(H.AGENT_RUN_MISMATCH);
  if (!RECEIPT_KINDS.includes(input.receipt_kind)) return hold(H.INVALID_FIELD_VALUE, 'receipt_kind');
  if (!PRODUCER_EVIDENCE_KINDS.includes(input.producer_evidence_kind)) return hold(H.INVALID_FIELD_VALUE, 'producer_evidence_kind');
  if (input.receipt_kind === 'delivery' && input.producer_evidence_kind === 'structural_only') return hold(H.STRUCTURAL_EDGE_NOT_DELIVERY);
  if (!isUtcMs(input.observed_at)) return hold(H.INVALID_FIELD_VALUE, 'observed_at');
  if (input.observed_at < run.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'receipt_before_run_start');

  const refGuard = guardRefList(input.refs, EVIDENCE_REF_KINDS, { allowEmpty: false });
  if (refGuard !== null) return refGuard;

  // Only a delivery names a consumer. A result, artifact, approval, validation or recovery receipt
  // is a single-ended statement about its own run, so carrying a target here would assert a
  // hand-over that this receipt kind does not claim.
  let deliveryTarget = null;
  if (input.receipt_kind === 'delivery') {
    const targetGuard = guardDeliveryTarget(store, input.delivery_target, run, input.observed_at);
    if (targetGuard !== null) return targetGuard;
    deliveryTarget = {
      target_run_id: input.delivery_target.target_run_id,
      target_agent_id: input.delivery_target.target_agent_id,
      target_work_unit_id: input.delivery_target.target_work_unit_id,
    };
  } else if (input.delivery_target !== null && input.delivery_target !== undefined) {
    return hold(H.DELIVERY_TARGET_FORBIDDEN);
  }

  const record = {
    schema_version: RESULT_RECEIPT_SCHEMA,
    receipt_id: input.receipt_id,
    run_id: input.run_id,
    agent_id: input.agent_id,
    receipt_kind: input.receipt_kind,
    producer_evidence_kind: input.producer_evidence_kind,
    delivery_target: deliveryTarget,
    refs: normalizeRefs(input.refs),
    observed_at: input.observed_at,
  };

  const written = append(state.receipts, input.receipt_id, record, H.RESULT_RECEIPT_CONFLICT);
  if (written.status === 'HOLD') return written;
  return { status: written.status === 'NO_OP' ? 'NO_OP' : 'RECORDED', receipt_id: input.receipt_id, record: written.record };
}

/**
 * Records one delivery edge between two observed runs.
 *
 * A result receipt is single-ended: it says a run produced these refs, and nothing about who
 * received them. So the Functional Agent to Spreadsheet Craftsman handoff existed only as a fixture
 * pairing two ids, never as an observed fact. This makes the edge itself a record, with both ends
 * named and the producer's evidence carried across.
 *
 * The distinction that matters: a `structural` edge says two runs are adjacent in a graph, and a
 * `delivery` edge says something was actually handed over. The second requires a delivery receipt
 * on the producer's own run whose evidence is `producer_observed`. A structural edge may not name a
 * receipt at all, because adjacency is not evidence of anything having been produced.
 */
export function recordDeliveryEdge(store, rawInput) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guarded = guardEntry(rawInput, DELIVERY_EDGE_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;

  if (!isSafeId(input.edge_id)) return hold(H.INVALID_FIELD_VALUE, 'edge_id');
  if (!DELIVERY_EDGE_KINDS.includes(input.edge_kind)) return hold(H.INVALID_FIELD_VALUE, 'edge_kind');
  if (!isUtcMs(input.observed_at)) return hold(H.INVALID_FIELD_VALUE, 'observed_at');

  for (const key of ['producer_run_id', 'producer_agent_id', 'consumer_run_id', 'consumer_agent_id']) {
    if (!isSafeId(input[key])) return hold(H.INVALID_FIELD_VALUE, key);
  }
  if (input.producer_run_id === input.consumer_run_id) return hold(H.SELF_DELIVERY_FORBIDDEN);

  const producerRun = findRunRecord(store, input.producer_run_id);
  if (producerRun === undefined) return hold(H.UNKNOWN_RUN, 'producer_run_id');
  const consumerRun = findRunRecord(store, input.consumer_run_id);
  if (consumerRun === undefined) return hold(H.UNKNOWN_RUN, 'consumer_run_id');
  if (input.producer_agent_id !== producerRun.agent_id) return hold(H.AGENT_RUN_MISMATCH, 'producer');
  if (input.consumer_agent_id !== consumerRun.agent_id) return hold(H.AGENT_RUN_MISMATCH, 'consumer');

  // An edge across projects would carry one project's work into another's subtree, which is the
  // same firewall the run and capsule contracts enforce.
  if (producerRun.project_id !== consumerRun.project_id) return hold(H.PROJECT_BINDING_MISMATCH, 'edge');

  if (input.edge_kind === 'structural') {
    if (input.receipt_id !== null) return hold(H.STRUCTURAL_EDGE_CARRIES_NO_RECEIPT);
  } else {
    if (!isSafeId(input.receipt_id)) return hold(H.INVALID_FIELD_VALUE, 'receipt_id');
    const receipt = state.receipts.get(input.receipt_id);
    if (receipt === undefined) return hold(H.UNKNOWN_RECEIPT);
    // The receipt has to belong to the producer's own run. A receipt from some other run would let
    // an edge borrow evidence it did not produce. Checking the run alone is sufficient and is the
    // load-bearing line: `recordResultReceipt` already pins a receipt's agent to its run's agent,
    // and the producer agent is pinned to the producer run above, so a matching run implies a
    // matching agent. A second agent comparison here would be unreachable, and an unreachable guard
    // is worse than none: it reads as protection while no input can ever exercise it.
    if (receipt.record.run_id !== input.producer_run_id) return hold(H.RECEIPT_RUN_MISMATCH);
    // Likewise the evidence kind needs no check here. `recordResultReceipt` refuses a `delivery`
    // receipt carrying `structural_only` at write time, so a stored delivery receipt is always
    // `producer_observed` and requiring the kind below is the whole test.
    if (receipt.record.receipt_kind !== 'delivery') return hold(H.EDGE_RECEIPT_NOT_DELIVERY);
    // The receipt names the exact consumer it was produced for, so the edge must land on that run
    // and no other. Without this the producer's own statement of intent is discarded and any
    // same-project run can be recorded as having received the hand-over.
    //
    // The run comparison is the whole check. Re-comparing the consumer agent or work unit here
    // would be unreachable: `guardDeliveryTarget` pinned both to the target run at write time, runs
    // never move once written, and the edge already pins its consumer agent to its consumer run. An
    // unreachable guard reads as protection that no input can exercise.
    if (receipt.record.delivery_target.target_run_id !== input.consumer_run_id) return hold(H.DELIVERY_TARGET_MISMATCH);
    if (input.observed_at < receipt.record.observed_at) return hold(H.TEMPORAL_ORDER_INVALID, 'edge_before_receipt');

    // One receipt evidences one hand-over. Letting two edges cite the same receipt would double
    // both the delivery count and the evidence refs for a consumer, which is the same silent
    // doubling the usage ledger keeps a content index to prevent.
    for (const existing of state.deliveryEdges.values()) {
      if (existing.record.receipt_id === input.receipt_id && existing.record.edge_id !== input.edge_id) {
        return hold(H.RECEIPT_ALREADY_EVIDENCED);
      }
    }
  }

  if (input.observed_at < producerRun.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'edge_before_producer_start');
  if (input.observed_at < consumerRun.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'edge_before_consumer_start');

  const record = {
    schema_version: DELIVERY_EDGE_SCHEMA,
    edge_id: input.edge_id,
    producer_run_id: input.producer_run_id,
    producer_agent_id: input.producer_agent_id,
    consumer_run_id: input.consumer_run_id,
    consumer_agent_id: input.consumer_agent_id,
    edge_kind: input.edge_kind,
    receipt_id: input.receipt_id,
    observed_at: input.observed_at,
  };

  const written = append(state.deliveryEdges, input.edge_id, record, H.DELIVERY_EDGE_CONFLICT);
  if (written.status === 'HOLD') return written;
  return { status: written.status === 'NO_OP' ? 'NO_OP' : 'RECORDED', edge_id: input.edge_id, record: written.record };
}

/**
 * Reports, per consumer run, which deliveries actually reached it and on whose evidence.
 *
 * Structural edges are counted separately and never folded into the delivery count, so a consumer
 * that is merely adjacent to a producer can never be read as one that received something.
 *
 * Each evidence ref names the producer that supplied it. A flat pooled list would say a consumer
 * received these artifacts without saying from whom, which is not attribution.
 */
export function projectDeliveryEdges(store) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);

  const byConsumer = new Map();
  let structural = 0;
  let delivered = 0;
  for (const entry of state.deliveryEdges.values()) {
    const edge = entry.record;
    const row = byConsumer.get(edge.consumer_run_id) ?? {
      consumer_run_id: edge.consumer_run_id,
      consumer_agent_id: edge.consumer_agent_id,
      delivery_count: 0,
      structural_count: 0,
      producer_evidence_refs: [],
    };
    if (edge.edge_kind === 'delivery') {
      row.delivery_count += 1;
      delivered += 1;
      const receipt = state.receipts.get(edge.receipt_id);
      if (receipt !== undefined) {
        for (const ref of receipt.record.refs) {
          row.producer_evidence_refs.push({
            producer_run_id: edge.producer_run_id,
            producer_agent_id: edge.producer_agent_id,
            ref_kind: ref.ref_kind,
            ref_value: ref.ref_value,
          });
        }
      }
    } else {
      row.structural_count += 1;
      structural += 1;
    }
    byConsumer.set(edge.consumer_run_id, row);
  }

  return {
    status: 'PROJECTED',
    edge_count: state.deliveryEdges.size,
    delivery_edge_count: delivered,
    structural_edge_count: structural,
    consumers: [...byConsumer.values()],
  };
}

export const listReceipts = (store) => recordsOf(store, 'receipts');
export const listDeliveryEdges = (store) => recordsOf(store, 'deliveryEdges');
