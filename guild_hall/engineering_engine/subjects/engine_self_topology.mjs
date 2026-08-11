// Subject adapter: the engine's own topology, judged by the engine.
//
// The engine core knows nothing about topologies. It compares an Expected State to an
// Observed State, and an adapter is what turns some domain into those two shapes. This is the
// first one, and its subject is deliberately the engine itself: real observed data, no project
// material, no security boundary, nobody's decision needed.
//
// A real project becomes another adapter, not a change to the core. That is the point of
// putting the first one here.
//
//   Expected  every declared module edge should carry traffic, and every declared surface
//             should report a passing run
//   Observed  the receipts and heartbeats an actual run produced
//
// The interesting decision is what an edge with no receipt means, and it is the same decision
// the whole kernel is built around. "Not traversed in this run" is a confirmed observation
// only when the observation itself is trustworthy. If a surface failed, or the observation
// file never got written, then we did not look properly and the honest answer is unknown —
// not absent. Getting this backwards would let a broken observation run manufacture findings
// that say connections are dead.
//
// The second decision is what the *presence* of a receipt means, and the answer is: nothing
// on its own. A receipt is judged before it is believed. `judgeEdge` decides whether it
// still proves traversal now, and only `proves_traversal` produces `present`. A receipt that
// is stale, failed or malformed leaves the edge unknown, and it also poisons the run's claim
// to have looked properly, so unobserved edges in the same run stop being reportable as
// confirmed absences. Reading "there is a key in the receipts object" as "present" is how a
// month-old run keeps a line green forever.
//
// The third decision is what the receipt *map* is, and it is an exact set rather than a bag
// of whatever keys happened to be written. Three separate things have to agree before any
// receipt is weighed at all:
//
//   the topology  declares which edges exist, so a receipt filed under any other key is
//                 evidence about something this subject does not judge
//   the run       declares, in its own summary, which edges it exercised, so the receipt map
//                 must be exactly that set, no more and no fewer
//   each receipt  names its own edge and its own run, so a record cannot be moved into a
//                 slot it was never about
//
// Any disagreement between the three is a fact about the observation rather than a detail:
// the run did not record what it says it recorded. Everything it failed to reach stays
// unknown, and a misfiled receipt proves nothing about the edge it was filed under. Counting
// keys was the previous rule, and "the object is not empty" is not an observation.

import { PRESENCE } from '../kernel/custody.mjs';
import { AXIS } from '../kernel/snapshot.mjs';
import { judgeEdge } from '../kernel/delivery_receipt.mjs';
import { ContractError } from '../kernel/errors.mjs';

export const CODES = Object.freeze({
  INPUT_INVALID: 'SUBJECT_INPUT_INVALID',
});

export const SUBJECT_ID = 'engine_self_topology';

// The topology is derived from the repository's own source, so the requirement it expresses
// is "the code as approved". Of the eight registered families that is the closest honest fit;
// it is a modelling choice, recorded here rather than left for a reader to reverse-engineer.
const REQUIREMENT_AUTHORITY = 'company_approved_procedure';

const refFor = (kind, id) => ({
  entity_id: `${kind}_${id.replace(/[^a-z0-9_]/gi, '_')}`,
  revision_id: `${kind}_${id.replace(/[^a-z0-9_]/gi, '_')}-r1`,
  content_id: `${kind}_${id.replace(/[^a-z0-9_]/gi, '_')}-c1`,
  content_hash_alg: 'sha256',
});

/** Deduplicates by revision_id and sorts by it, which is the order the kernel declares. */
const byRevisionId = (refs) => {
  const unique = new Map(refs.map((r) => [r.revision_id, r]));
  return [...unique.values()].sort((a, b) => (a.revision_id < b.revision_id ? -1 : a.revision_id > b.revision_id ? 1 : 0));
};

const sortedUnique = (values) => [...new Set(values)].sort();

/**
 * Reads the observation summary as a record of a run rather than as a hint.
 *
 * "An observation happened" is a claim the summary has to make explicitly and completely: it
 * has to name the run, say how many surfaces it declared and ran, and declare the exact edge
 * key set it produced receipts for. A summary that cannot say those things did not record an
 * observation, whatever else it contains, and nothing downstream may treat it as one.
 */
export function readObservationRecord(observation) {
  const reasons = [];
  if (observation === null || typeof observation !== 'object' || Array.isArray(observation)) {
    return { recorded: false, reasons: ['observation_summary_absent'], run_id: null, declared_exercised_edge_keys: null };
  }
  if (typeof observation.run_id !== 'string' || observation.run_id.length === 0) reasons.push('observation_names_no_run');
  const surfaces = observation.surfaces;
  if (surfaces === null || typeof surfaces !== 'object' || Array.isArray(surfaces)) reasons.push('observation_declares_no_surfaces');
  else {
    if (!Number.isInteger(surfaces.declared) || surfaces.declared < 0) reasons.push('surface_declared_count_absent');
    if (!Number.isInteger(surfaces.run) || surfaces.run < 0) reasons.push('surface_run_count_absent');
    if (!Array.isArray(surfaces.failing)) reasons.push('surface_failure_list_absent');
  }
  // The run's own statement of which edges it produced receipts for. Without it the receipt
  // map is unfalsifiable: any key set at all would look like the one the run produced.
  const declared = observation.edges?.exercised_edge_keys;
  if (!Array.isArray(declared) || declared.some((k) => typeof k !== 'string' || k.length === 0)) {
    reasons.push('observation_declares_no_exercised_edge_key_set');
  }
  return {
    recorded: reasons.length === 0,
    reasons,
    run_id: typeof observation.run_id === 'string' && observation.run_id.length > 0 ? observation.run_id : null,
    declared_exercised_edge_keys: Array.isArray(declared) ? sortedUnique(declared.filter((k) => typeof k === 'string')) : null,
  };
}

/**
 * Compares the receipt map's key set against the two sets allowed to define it.
 *
 * Both directions matter. A key the topology never declared is a receipt about something this
 * subject does not judge; a key the run never claimed to have exercised is a receipt the run
 * cannot account for; and an edge the run says it exercised but filed no receipt for is a
 * receipt that went missing. All three mean the map and the run disagree.
 */
export function classifyReceiptKeySet({ declaredEdgeKeys, receiptKeys, declaredExercisedKeys }) {
  const declared = new Set(declaredEdgeKeys);
  const keys = sortedUnique(receiptKeys);
  const undeclaredByTopology = keys.filter((k) => !declared.has(k));
  const exercised = Array.isArray(declaredExercisedKeys) ? new Set(declaredExercisedKeys) : null;
  const unclaimedByTheRun = exercised === null ? [] : keys.filter((k) => !exercised.has(k));
  const claimedButUnreceipted = exercised === null ? [] : [...exercised].filter((k) => !keys.includes(k)).sort();
  return {
    // Exact means exact: the same members in both directions, and every member declared by
    // the code. An undeclared set is never exact, because there is nothing to be exact about.
    exact: exercised !== null
      && undeclaredByTopology.length === 0
      && unclaimedByTheRun.length === 0
      && claimedButUnreceipted.length === 0,
    receipt_key_count: keys.length,
    undeclared_by_topology: undeclaredByTopology,
    unclaimed_by_the_run: unclaimedByTheRun,
    claimed_but_unreceipted: claimedButUnreceipted,
  };
}

/**
 * Decides whether an absence of evidence may be reported as a confirmed absence.
 *
 * Fail-closed: anything that makes the observation itself doubtful downgrades every
 * unobserved item to unknown. A partial run must not be read as proof that the parts it did
 * not reach are dead.
 */
export function observationTrustworthiness({
  observationRecorded, failingSurfaces, surfacesRun, surfacesDeclared, unusableReceipts = 0,
  receiptKeySetExact, edgeReceiptsRecorded,
}) {
  const reasons = [];
  if (observationRecorded !== true) reasons.push('observation_not_recorded');
  if ((failingSurfaces ?? []).length > 0) reasons.push('a_surface_failed');
  if (!Number.isInteger(surfacesRun) || surfacesRun <= 0) reasons.push('no_surface_ran');
  // The receipt map has to be the set the run says it produced. A map holding an extra key, a
  // foreign key or a missing one is not the run's record of itself, so nothing in it can
  // settle what the run did or did not reach.
  if (receiptKeySetExact !== true) reasons.push('receipt_key_set_does_not_match_the_observation');
  // A run that recorded no edge receipt at all demonstrated nothing about its own ability to
  // record one, so its silence is not evidence of absence.
  if (edgeReceiptsRecorded !== true) reasons.push('no_edge_receipt_was_recorded');
  // A receipt that could not be believed is evidence that this run did not observe cleanly.
  // Without this, one stale receipt would leave every *other* unobserved edge still eligible
  // to be reported as a confirmed absence on the strength of a run we already know was bad.
  if (Number.isInteger(unusableReceipts) && unusableReceipts > 0) reasons.push('a_receipt_could_not_be_believed');
  return {
    // Only a clean, complete observation lets non-traversal be stated as fact.
    absence_reportable: reasons.length === 0,
    reasons,
    // Reported so a reader can see how much of the graph the run could speak for at all.
    surfaces_run: surfacesRun ?? 0,
    surfaces_declared: surfacesDeclared ?? 0,
    unusable_receipts: unusableReceipts ?? 0,
    receipt_key_set_exact: receiptKeySetExact === true,
  };
}

/**
 * Judges one edge receipt before anything is believed about it.
 *
 * Returns the presence state the receipt supports and whether it was usable at all. A
 * malformed or future-dated receipt makes `judgeEdge` throw; that is caught here and
 * reported as unusable rather than allowed to abort the pass, because one bad receipt is a
 * fact about the observation, not a reason to produce no judgement.
 *
 * Two checks come before the freshness question, because they decide whether this record is
 * about this edge at all. A receipt whose own `edge_key` is not the slot it sits in is
 * evidence about a different connection, and a receipt from another run is evidence about a
 * different observation. Either one filed here proves nothing here, however fresh it is.
 */
export function judgeReceipt({ edgeKey, receipt, window, now, expectedRunId = null }) {
  if (receipt === undefined || receipt === null) {
    return { received: false, usable: false, proves_traversal: false, state: 'unreceipted' };
  }
  if (typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { received: true, usable: false, proves_traversal: false, state: 'invalid', reason: 'receipt_is_not_an_object' };
  }
  if (receipt.edge_key !== edgeKey) {
    return {
      received: true, usable: false, proves_traversal: false, state: 'misfiled',
      reason: 'receipt_names_a_different_edge_than_the_slot_it_was_filed_in',
    };
  }
  let verdict = null;
  try {
    verdict = judgeEdge({ edgeKey, receipt, window, now });
  } catch (e) {
    return { received: true, usable: false, proves_traversal: false, state: 'invalid', reason: e?.code ?? 'receipt_rejected' };
  }
  if (expectedRunId !== null && receipt.run_id !== expectedRunId) {
    return {
      received: true, usable: false, proves_traversal: false, state: 'foreign_run',
      reason: 'receipt_belongs_to_a_different_observation_run',
    };
  }
  return {
    received: true,
    // "Usable" means it currently proves what it claims. A stale receipt is a valid record
    // of a past traversal and an unusable basis for a present claim.
    usable: verdict.proves_traversal === true,
    proves_traversal: verdict.proves_traversal === true,
    state: verdict.state,
    age_seconds: verdict.age_seconds,
    reason: verdict.reason,
  };
}

/**
 * Builds the two state axes from a topology and one observation summary.
 *
 * Every declared edge produces exactly one expected element. Observed elements are produced
 * for every declared edge too — an edge nobody traversed still got looked at, and its
 * observation carries whichever presence state the trustworthiness rule allows.
 */
export function buildStates({ topology, receipts, observation, validAt, knownAt, window, now }) {
  if (!topology || !Array.isArray(topology.module_edges)) {
    throw new ContractError(CODES.INPUT_INVALID, 'topology with module_edges is required');
  }
  if (receipts === null || typeof receipts !== 'object' || Array.isArray(receipts)) {
    throw new ContractError(CODES.INPUT_INVALID, 'the receipt set is the evidence and is required');
  }
  if (!observation || !observation.surfaces) {
    throw new ContractError(CODES.INPUT_INVALID, 'observation metadata is required to weigh the evidence');
  }
  // Without a declared window there is no rule for deciding whether a receipt still proves
  // anything, and "no rule" would in practice mean "always fresh". Refused rather than
  // defaulted.
  if (!Number.isSafeInteger(window?.period_seconds) || window.period_seconds <= 0
      || !Number.isSafeInteger(window?.grace_seconds) || window.grace_seconds < 0) {
    throw new ContractError(CODES.INPUT_INVALID,
      'a freshness window must be declared before receipts can be weighed');
  }
  if (!Number.isFinite(now)) {
    throw new ContractError(CODES.INPUT_INVALID,
      'the observation instant must be supplied; this adapter does not read a clock');
  }

  // The receipts are the evidence. The summary is a report about them, so it is used only to
  // decide how much the evidence can be trusted, never as the evidence itself. Each receipt
  // is judged first: holding a key is not the same as holding proof.
  const declaredEdgeKeys = topology.module_edges.map((edge) => `${edge.from}>${edge.to}`);
  const record = readObservationRecord(observation);
  const keySet = classifyReceiptKeySet({
    declaredEdgeKeys,
    receiptKeys: Object.keys(receipts),
    declaredExercisedKeys: record.declared_exercised_edge_keys,
  });

  const verdicts = new Map();
  for (const key of declaredEdgeKeys) {
    verdicts.set(key, judgeReceipt({ edgeKey: key, receipt: receipts[key], window, now, expectedRunId: record.run_id }));
  }
  // A receipt filed under a key the topology never declared is unbelievable by construction:
  // there is no edge for it to be about. It is counted with the rest so it cannot be ignored.
  const unusableReceipts = [...verdicts.values()].filter((v) => v.received && !v.usable).length
    + keySet.undeclared_by_topology.length;

  const trust = observationTrustworthiness({
    observationRecorded: record.recorded,
    failingSurfaces: observation.surfaces?.failing ?? [],
    surfacesRun: observation.surfaces?.run,
    surfacesDeclared: observation.surfaces?.declared,
    unusableReceipts,
    receiptKeySetExact: keySet.exact,
    edgeReceiptsRecorded: keySet.receipt_key_count > 0,
  });

  const expected = [];
  const observed = [];
  const pairs = [];

  for (const edge of topology.module_edges) {
    const key = `${edge.from}>${edge.to}`;
    const elementId = `edge_${edge.from}__${edge.to}`;
    expected.push({
      element_id: elementId,
      axis: AXIS.EXPECTED,
      requirement_ref: refFor('req', key),
      authority_family: REQUIREMENT_AUTHORITY,
      applicability: true,
      valid_at: validAt,
      known_at: knownAt,
    });

    const verdict = verdicts.get(key);
    // Three cases, and only the first is a positive observation. A receipt that arrived but
    // could not be believed is unknown, never absent: something did happen on that edge, we
    // just cannot say it holds now. And a receipt speaks for its edge only when the map it
    // arrived in is the one the run says it produced.
    const presence = (verdict.proves_traversal && keySet.exact)
      ? PRESENCE.PRESENT
      : verdict.received
        ? PRESENCE.UNKNOWN
        : trust.absence_reportable ? PRESENCE.ABSENCE_CONFIRMED : PRESENCE.UNKNOWN;

    observed.push({
      element_id: `obs_${elementId}`,
      axis: AXIS.OBSERVED,
      artifact_revision_ref: refFor('obs', key),
      presence_state: presence,
      valid_at: validAt,
      known_at: knownAt,
    });
    pairs.push({ elementId, edgeKey: key, traversed: verdict.proves_traversal, receipt_state: verdict.state });
  }

  return {
    subject_id: SUBJECT_ID,
    expected,
    observed,
    pairs,
    trust,
    observation_record: record,
    receipt_key_set: keySet,
    receipt_verdicts: Object.fromEntries([...verdicts.entries()].map(([k, v]) => [k, v.state])),
    // Carried into the snapshot's accepted input set so the fingerprint covers what was judged.
    //
    // These are full refs, not revision id strings. The kernel declares this path as
    // `sorted_by:revision_id`, which means the elements are objects that carry that field —
    // it rejected a list of bare strings, correctly. A ref is a subject, a state of it, and
    // the bytes; flattening it to one string would drop the distinction the kernel exists to
    // keep.
    canonical_accepted_input_set: {
      source_revision_refs: byRevisionId(topology.module_edges.map((e) => refFor('req', `${e.from}>${e.to}`))),
      artifact_revision_refs: byRevisionId(topology.module_edges.map((e) => refFor('obs', `${e.from}>${e.to}`))),
    },
  };
}
