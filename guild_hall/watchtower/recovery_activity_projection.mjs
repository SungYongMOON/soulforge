/**
 * recovery_activity_projection.mjs — self-repair history to activity ledger.
 *
 * `recovery_history.json` is a 200-entry rolling buffer. It answers "what is
 * happening now" and cannot answer "what happened": on 2026-09-04 those 200
 * entries covered two hours, and the 2026-09-02 events that started the
 * incident had already been pushed out. Self-repair therefore judged for two
 * days and left no durable trace of any of it.
 *
 * The durable ledger already exists - `guild_hall/activity` owns the
 * append-only `<state root>/operations/soulforge_activity/events/**` store, and
 * `soulforge.activity.event.v1` already carries scope/action/result/summary,
 * which is the shape a repair record needs. So this module creates no store and
 * no schema. It projects one into the other.
 *
 * The projection is not one row per judgement. That ledger held seventeen rows
 * for the whole of September; pouring 200 identical judgements into it would
 * destroy the surface it is meant to preserve. Repeats are collapsed the same
 * way alerts are: an *episode* is a run of consecutive judgements with the same
 * (node, diagnostic, outcome), and an episode produces at most two rows - one
 * when it opens, one when it closes carrying how long it lasted and how many
 * judgements it took. Two hundred judgements become one row while it runs.
 *
 * Pure. It reads entries and a watermark and returns event inputs; the caller
 * appends them through `appendActivityEvent`.
 */

export const RECOVERY_ACTIVITY_SCOPE = "recovery";
export const RECOVERY_ACTIVITY_WATERMARK_SCHEMA = "soulforge.watchtower.recovery_activity_watermark.v1";

const SAFE_ID = /^[a-z][a-z0-9_.-]{0,63}$/u;

function safeId(value, fallback) {
  return typeof value === "string" && SAFE_ID.test(value) ? value : fallback;
}

// The tuple that defines an episode. A change in any part is a new episode,
// because it is a different thing happening - a node whose diagnosis changes
// has a different fault even if it never looked healthy in between.
function episodeKey(entry) {
  return [
    safeId(entry?.node_id, "unknown_node"),
    safeId(entry?.diagnostic_code, "unknown_diagnostic"),
    safeId(entry?.outcome_code, "unknown_outcome"),
  ].join("|");
}

function parseAt(value) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEmptyRecoveryActivityWatermark() {
  return { schema_version: RECOVERY_ACTIVITY_WATERMARK_SCHEMA, last_at: null, open: {} };
}

function readWatermark(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return createEmptyRecoveryActivityWatermark();
  if (value.schema_version !== RECOVERY_ACTIVITY_WATERMARK_SCHEMA) return createEmptyRecoveryActivityWatermark();
  const open = value.open !== null && typeof value.open === "object" && !Array.isArray(value.open) ? value.open : {};
  return {
    schema_version: RECOVERY_ACTIVITY_WATERMARK_SCHEMA,
    last_at: typeof value.last_at === "string" ? value.last_at : null,
    open,
  };
}

// `denied` and `owner_action_required` are the coordinator saying a person is
// needed. Those close as `hold` rather than `ok`, so a reader can count how
// often self-repair had to give up without reading summaries.
function resultFor(entry) {
  const outcome = safeId(entry?.outcome_code, "");
  const attempt = safeId(entry?.attempt, "");
  if (outcome === "owner_action_required" || attempt === "denied") return "hold";
  if (outcome === "no_action_needed") return "ok";
  return safeId(entry?.verification, "") === "passed" ? "ok" : "recorded";
}

/**
 * @param {object} input
 * @param {object[]} input.entries   recovery_history entries, oldest first
 * @param {object|null} input.watermark
 * @param {number} input.now
 * @returns {{events: object[], watermark: object}} `events` are
 *   `appendActivityEvent` inputs; the caller writes them.
 */
export function projectRecoveryActivity({ entries = [], watermark = null, now = Date.now() } = {}) {
  const state = readWatermark(watermark);
  const lastAt = parseAt(state.last_at);
  const events = [];

  // Only entries after the watermark are considered, so re-reading the same
  // rolling buffer cannot duplicate rows.
  const fresh = entries
    .filter((entry) => {
      const at = parseAt(entry?.at);
      return at !== null && (lastAt === null || at > lastAt);
    })
    .sort((left, right) => parseAt(left.at) - parseAt(right.at));

  const open = { ...state.open };
  const seenThisRun = new Set();
  let newestAt = state.last_at;

  for (const entry of fresh) {
    const nodeId = safeId(entry?.node_id, "unknown_node");
    const key = episodeKey(entry);
    seenThisRun.add(nodeId);
    newestAt = entry.at;

    const current = open[nodeId] ?? null;
    if (current !== null && current.key === key) {
      open[nodeId] = { ...current, count: current.count + 1, last_at: entry.at };
      continue;                                   // 같은 episode - 행을 늘리지 않는다
    }

    if (current !== null) events.push(closeEvent(nodeId, current, entry.at));

    open[nodeId] = { key, count: 1, opened_at: entry.at, last_at: entry.at };
    events.push({
      scope: RECOVERY_ACTIVITY_SCOPE,
      action: safeId(entry?.action, "none"),
      result: resultFor(entry),
      summary: `${nodeId}: ${safeId(entry?.diagnostic_code, "unknown_diagnostic")}`
        + ` / ${safeId(entry?.outcome_code, "unknown_outcome")}`
        + ` (attempt=${safeId(entry?.attempt, "unknown")}, verification=${safeId(entry?.verification, "unknown")})`,
      // Held open so a reader sees an unresolved repair without scanning: the
      // ledger's own carry-forward is what `latest_context` surfaces.
      carry_forward: resultFor(entry) === "hold",
      next_action: resultFor(entry) === "hold" ? "owner review required" : null,
    });
  }

  return { events, watermark: { schema_version: RECOVERY_ACTIVITY_WATERMARK_SCHEMA, last_at: newestAt, open } };
}

function closeEvent(nodeId, episode, endedAt) {
  const opened = parseAt(episode.opened_at);
  const ended = parseAt(endedAt);
  const seconds = opened !== null && ended !== null ? Math.max(0, Math.round((ended - opened) / 1000)) : null;
  const [, diagnostic, outcome] = episode.key.split("|");
  return {
    scope: RECOVERY_ACTIVITY_SCOPE,
    action: "episode_closed",
    result: "recorded",
    summary: `${nodeId}: ${diagnostic} / ${outcome} 종료`
      + ` (판정 ${episode.count}회${seconds === null ? "" : `, ${seconds}초`})`,
    carry_forward: false,
  };
}

/**
 * Closes episodes for nodes the coordinator stopped reporting. Called with the
 * node ids present in the latest cycle: an episode whose node vanished is over,
 * and leaving it open would keep a resolved fault carried forward forever.
 */
export function closeMissingEpisodes({ watermark = null, presentNodeIds = [], now = Date.now() } = {}) {
  const state = readWatermark(watermark);
  const present = new Set(presentNodeIds);
  const events = [];
  const open = {};
  for (const [nodeId, episode] of Object.entries(state.open)) {
    if (present.has(nodeId)) { open[nodeId] = episode; continue; }
    events.push(closeEvent(nodeId, episode, new Date(now).toISOString()));
  }
  return { events, watermark: { ...state, open } };
}
