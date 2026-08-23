/**
 * Derives self / child-direct / subtree usage from the meter's own ledger.
 *
 * The observation store expresses agent lineage as `parent_run_id` edges and rolls usage up over
 * them. The live meter ledger has no such tree: `by_node` collapses all 29,898 recorded turns onto
 * a single `local-node`, and `by_agent` treats every agent as an opaque key. What it does carry is
 * a path-shaped `actor.agent_id` — `root`, `/root/ax_board_recovery_worker`,
 * `/root/opus_ingest_vertical/...` — so the lineage is present but never read as one. A parent's
 * `by_agent` row therefore counts only its own turns, and nothing in the ledger answers "what did
 * this agent's subtree cost".
 *
 * This module reads that path and produces the three rollups the observation contract defines,
 * without inventing a parent for anything whose id does not state one.
 *
 * Boundaries: pure function over rows the caller supplies. It opens no file, reads no meter state
 * and no clock, and it never writes back.
 */

import { hold, isPlainObject } from './guard_primitives.mjs';

export const METER_LINEAGE_HOLD_CODES = Object.freeze({
  INVALID_ROWS: 'INVALID_ROWS',
  INVALID_ROW_SHAPE: 'INVALID_ROW_SHAPE',
  DUPLICATE_AGENT_KEY: 'DUPLICATE_AGENT_KEY',
  AGENT_PATH_CYCLE: 'AGENT_PATH_CYCLE',
});

const M = METER_LINEAGE_HOLD_CODES;

/** The numeric columns a `by_agent` row carries. Anything else on the row is ignored, not summed. */
export const LINEAGE_MEASURES = Object.freeze([
  'turns',
  'input_tokens',
  'cached_input_tokens',
  'output_tokens',
  'credits',
  'credit_unknown_turns',
  'model_invocations',
]);

const MAX_ROWS = 100_000;
const MAX_DEPTH = 64;

const emptyMeasures = () => Object.fromEntries(LINEAGE_MEASURES.map((name) => [name, 0]));

function addMeasures(target, row) {
  for (const name of LINEAGE_MEASURES) {
    const value = row[name];
    if (typeof value === 'number' && Number.isFinite(value)) target[name] += value;
  }
}

/**
 * The parent of a path-shaped agent id, or `null`.
 *
 * `/root/a/b` has parent `/root/a`, and `/root/a` has parent `root` — the bare first segment, which
 * is how the ledger spells the tree's root. An id that is not path-shaped has no parent: a bare
 * name like `Faraday` is a peer, not a child of anything, and guessing otherwise would invent
 * lineage from a naming coincidence.
 */
export function parentAgentKey(key) {
  if (typeof key !== 'string' || !key.startsWith('/')) return null;
  const segments = key.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  if (segments.length === 2) return segments[0];
  return `/${segments.slice(0, -1).join('/')}`;
}

/**
 * Projects `by_agent` rows into self, child-direct and subtree rollups.
 *
 * `self` is the agent's own row. `child_direct` sums only its immediate children — never a
 * grandchild, because a manager reading "my children cost this" must not silently absorb a
 * generation it did not dispatch. `subtree` sums the agent and everything below it.
 */
export function projectMeterLineage(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return hold(M.INVALID_ROWS);

  const selfByKey = new Map();
  for (const row of rows) {
    if (!isPlainObject(row) || typeof row.key !== 'string' || row.key.length === 0) {
      return hold(M.INVALID_ROW_SHAPE);
    }
    if (selfByKey.has(row.key)) return hold(M.DUPLICATE_AGENT_KEY);
    const measures = emptyMeasures();
    addMeasures(measures, row);
    selfByKey.set(row.key, measures);
  }

  // A parent named by a child but absent from the rows is still a real node in the tree; it simply
  // has no turns of its own. Materialising it with zeroes keeps a subtree total from vanishing
  // because the intermediate row was never emitted.
  for (const key of [...selfByKey.keys()]) {
    let parent = parentAgentKey(key);
    let guard = 0;
    while (parent !== null) {
      guard += 1;
      if (guard > MAX_DEPTH) return hold(M.AGENT_PATH_CYCLE, 'depth');
      if (!selfByKey.has(parent)) selfByKey.set(parent, emptyMeasures());
      parent = parentAgentKey(parent);
    }
  }

  const childrenOf = new Map();
  for (const key of selfByKey.keys()) {
    const parent = parentAgentKey(key);
    if (parent === null) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(key);
  }

  const subtreeCache = new Map();
  function subtreeOf(key, seen) {
    const cached = subtreeCache.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) return null;
    seen.add(key);
    const total = { ...selfByKey.get(key) };
    for (const child of childrenOf.get(key) ?? []) {
      const childTotal = subtreeOf(child, seen);
      if (childTotal === null) return null;
      for (const name of LINEAGE_MEASURES) total[name] += childTotal[name];
    }
    seen.delete(key);
    subtreeCache.set(key, total);
    return total;
  }

  const agents = [];
  for (const key of [...selfByKey.keys()].sort()) {
    const children = (childrenOf.get(key) ?? []).slice().sort();
    const childDirect = emptyMeasures();
    for (const child of children) {
      for (const name of LINEAGE_MEASURES) childDirect[name] += selfByKey.get(child)[name];
    }
    const subtree = subtreeOf(key, new Set());
    if (subtree === null) return hold(M.AGENT_PATH_CYCLE, 'cycle');
    agents.push({
      agent_key: key,
      parent_agent_key: parentAgentKey(key),
      depth: key.startsWith('/') ? key.split('/').filter(Boolean).length : 1,
      child_keys: children,
      self_usage: selfByKey.get(key),
      child_direct_usage: childDirect,
      subtree_usage: subtree,
    });
  }

  const rootKeys = agents.filter((agent) => agent.parent_agent_key === null).map((agent) => agent.agent_key);
  return {
    status: 'PROJECTED',
    agent_count: agents.length,
    // Rows the ledger never emitted but a child's path implies. A non-zero count means the ledger's
    // own `by_agent` list is missing intermediate agents.
    materialised_parent_count: agents.length - rows.length,
    root_keys: rootKeys,
    agents,
  };
}
