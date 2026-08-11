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

/**
 * Decides whether an absence of evidence may be reported as a confirmed absence.
 *
 * Fail-closed: anything that makes the observation itself doubtful downgrades every
 * unobserved item to unknown. A partial run must not be read as proof that the parts it did
 * not reach are dead.
 */
export function observationTrustworthiness({ observationRecorded, failingSurfaces, surfacesRun, surfacesDeclared, unusableReceipts = 0 }) {
  const reasons = [];
  if (observationRecorded !== true) reasons.push('observation_not_recorded');
  if ((failingSurfaces ?? []).length > 0) reasons.push('a_surface_failed');
  if (!Number.isInteger(surfacesRun) || surfacesRun <= 0) reasons.push('no_surface_ran');
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
  };
}

/**
 * Judges one edge receipt before anything is believed about it.
 *
 * Returns the presence state the receipt supports and whether it was usable at all. A
 * malformed or future-dated receipt makes `judgeEdge` throw; that is caught here and
 * reported as unusable rather than allowed to abort the pass, because one bad receipt is a
 * fact about the observation, not a reason to produce no judgement.
 */
export function judgeReceipt({ edgeKey, receipt, window, now }) {
  if (receipt === undefined || receipt === null) {
    return { received: false, usable: false, proves_traversal: false, state: 'unreceipted' };
  }
  let verdict = null;
  try {
    verdict = judgeEdge({ edgeKey, receipt, window, now });
  } catch (e) {
    return { received: true, usable: false, proves_traversal: false, state: 'invalid', reason: e?.code ?? 'receipt_rejected' };
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
  const verdicts = new Map();
  for (const edge of topology.module_edges) {
    const key = `${edge.from}>${edge.to}`;
    verdicts.set(key, judgeReceipt({ edgeKey: key, receipt: receipts[key], window, now }));
  }
  const unusableReceipts = [...verdicts.values()].filter((v) => v.received && !v.usable).length;

  const trust = observationTrustworthiness({
    observationRecorded: Object.keys(receipts).length > 0,
    failingSurfaces: observation.surfaces?.failing ?? [],
    surfacesRun: observation.surfaces?.run,
    surfacesDeclared: observation.surfaces?.declared,
    unusableReceipts,
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
    // just cannot say it holds now.
    const presence = verdict.proves_traversal
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
