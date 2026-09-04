/**
 * Watchtower W2 — alert policy.
 *
 * A pure function between the judgement (`composeTopologyHealth`) and whatever
 * delivers a message. It reads the current snapshot, the prior alert ledger and
 * a clock, and returns the requests that should be sent plus the next ledger.
 * It performs no I/O, opens no channel and knows nothing about Buzz.
 *
 * Its subject is suppression, not transport. Watchtower judges on every sweep,
 * and a fault can last for days: sending on each judgement would ring hundreds
 * of times for one fault, the person would mute the channel, and W2 would end
 * up worse than W1. So the rules below are mostly about staying quiet.
 *
 *   1. Fire on transition, not on state. A node that is still down is not news.
 *   2. While it stays down, re-fire on a widening backoff, then daily. Do not
 *      forget the fault; do not keep shouting about it either.
 *   3. Fire on recovery, but only if the fault was actually reported. Otherwise
 *      the first message a person gets is "it is fixed" about something they
 *      were never told was broken.
 *   4. Never alert `unmonitored`. That is a declaration that no probe is bound,
 *      not a fault, and on the first run it would fire for every unbound node
 *      at once - the single fastest way to get the channel muted.
 *
 * The ledger holds only what these rules need. It is not a history and not an
 * incident record; both belong to owners that survive a state-root move.
 */

export const ALERT_LEDGER_SCHEMA = "soulforge.watchtower.alert_ledger.v1";
export const ALERT_REQUEST_SCHEMA = "soulforge.watchtower.alert_request.v1";

export const ALERT_EVENTS = Object.freeze([
  "node_down", "node_stale", "node_degraded", "node_recovered",
]);

// A fault is a state a person should hear about. `unmonitored` is deliberately
// absent (rule 4), and so is `ok`.
const FAULT_STATES = Object.freeze(["down", "stale", "degraded"]);

// Widening steps while a fault persists, then the last value repeats forever.
// The tail is a day: long enough not to nag, short enough that a fault cannot
// disappear from view entirely.
export const DEFAULT_BACKOFF_SECONDS = Object.freeze([3600, 14400, 86400]);

const EVENT_BY_STATE = Object.freeze({
  down: "node_down", stale: "node_stale", degraded: "node_degraded",
});

function isFault(state) { return FAULT_STATES.includes(state); }

function safeReasons(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(entry)).slice(0, 8)
    : [];
}

function backoffSecondsFor(notifyCount, steps) {
  const list = Array.isArray(steps) && steps.length > 0 ? steps : DEFAULT_BACKOFF_SECONDS;
  const index = Math.min(Math.max(notifyCount - 1, 0), list.length - 1);
  const value = list[index];
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_BACKOFF_SECONDS.at(-1);
}

export function createEmptyAlertLedger() {
  return { schema_version: ALERT_LEDGER_SCHEMA, nodes: {} };
}

function readLedgerNodes(ledger) {
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)) return {};
  if (ledger.schema_version !== ALERT_LEDGER_SCHEMA) return {};
  const nodes = ledger.nodes;
  return nodes !== null && typeof nodes === "object" && !Array.isArray(nodes) ? nodes : {};
}

/**
 * @param {object} input
 * @param {object} input.snapshot        composeTopologyHealth output
 * @param {object|null} input.ledger     prior ledger, or null on first run
 * @param {number} input.now             epoch ms
 * @param {string[]|null} input.eligible  node ids allowed to alert; null = all
 * @param {number[]} input.backoffSeconds
 * @returns {{requests: object[], ledger: object}}
 */
export function planAlerts({
  snapshot,
  ledger = null,
  now = Date.now(),
  eligible = null,
  backoffSeconds = DEFAULT_BACKOFF_SECONDS,
} = {}) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const prior = readLedgerNodes(ledger);
  const allow = Array.isArray(eligible) ? new Set(eligible) : null;
  const nowIso = new Date(now).toISOString();

  const requests = [];
  const nextNodes = {};

  for (const node of nodes) {
    const id = node?.id;
    if (typeof id !== "string" || id.length === 0) continue;
    const state = node?.health?.state;
    if (typeof state !== "string") continue;

    const was = prior[id] ?? null;
    const wasState = typeof was?.last_state === "string" ? was.last_state : null;
    const changed = wasState !== state;
    // `since` marks when the node entered its current state, so a fault that
    // persists across a restart keeps its real age rather than resetting.
    const since = changed || typeof was?.since !== "string" ? nowIso : was.since;

    // Carried only while the state is unchanged: a node that recovers and
    // breaks again is a new fault and starts its backoff over.
    let notifiedAt = changed ? null : (typeof was?.last_notified_at === "string" ? was.last_notified_at : null);
    let notifyCount = changed ? 0 : (Number.isSafeInteger(was?.notify_count) ? was.notify_count : 0);

    const permitted = allow === null || allow.has(id);
    let emit = null;

    if (isFault(state) && permitted) {
      if (notifyCount === 0) {
        emit = EVENT_BY_STATE[state];                       // rule 1
      } else {
        const due = Date.parse(notifiedAt ?? "");
        const waited = Number.isFinite(due) ? (now - due) / 1000 : Infinity;
        if (waited >= backoffSecondsFor(notifyCount, backoffSeconds)) {
          emit = EVENT_BY_STATE[state];                     // rule 2
        }
      }
    } else if (state === "ok" && changed && isFault(wasState) && permitted
      && Number.isSafeInteger(was?.notify_count) && was.notify_count > 0) {
      emit = "node_recovered";                              // rule 3
    }
    // `unmonitored` reaches neither branch. Rule 4 is the absence of a case.

    if (emit !== null) {
      const ageSeconds = Number.isSafeInteger(node?.health?.age_seconds) ? node.health.age_seconds : null;
      requests.push({
        schema_version: ALERT_REQUEST_SCHEMA,
        node_id: id,
        label: typeof node.label === "string" ? node.label : id,
        event: emit,
        state,
        previous_state: wasState,
        age_seconds: ageSeconds,
        since,
        repeat_index: emit === "node_recovered" ? 0 : notifyCount,
        reasons: safeReasons(node?.health?.reasons),
        observed_at: nowIso,
      });
      if (emit === "node_recovered") { notifiedAt = null; notifyCount = 0; }
      else { notifiedAt = nowIso; notifyCount += 1; }
    }

    nextNodes[id] = {
      last_state: state,
      since,
      last_notified_at: notifiedAt,
      notify_count: notifyCount,
    };
  }

  // Nodes absent from the snapshot are dropped rather than carried: the
  // topology is the authority on what exists, and a stale row would let a
  // deleted node fire later.
  return {
    requests,
    ledger: { schema_version: ALERT_LEDGER_SCHEMA, nodes: nextNodes },
  };
}

/**
 * The person-facing line. Channel-neutral: no path, no secret, no internal
 * code - those stay in the request's `reasons` for the delivery receipt.
 */
export function renderAlertText(request) {
  const label = typeof request?.label === "string" ? request.label : request?.node_id;
  if (request?.event === "node_recovered") return `${label}가 정상으로 돌아왔습니다.`;
  const age = Number.isSafeInteger(request?.age_seconds) ? request.age_seconds : null;
  const howLong = age === null ? null
    : age >= 86400 ? `${Math.floor(age / 86400)}일째`
      : age >= 3600 ? `${Math.floor(age / 3600)}시간째`
        : `${Math.max(1, Math.floor(age / 60))}분째`;
  const head = request?.event === "node_degraded"
    ? `${label}가 정상이 아닙니다.`
    : howLong === null ? `${label}의 응답이 없습니다.` : `${label}가 ${howLong} 응답이 없습니다.`;
  return `${head}\n예약작업이 살아 있는지 확인해 주세요.`;
}
