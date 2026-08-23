/**
 * Board view model for the Agent Observation evidence.
 *
 * `guild_hall/agent_observation` produces several projections — store counts with a privacy audit,
 * delivery edges, Board health, and the meter lineage rollups — and until now nothing displayed any
 * of them. This turns those projections into rows a Board panel can render.
 *
 * It is a pure view-model builder in the shape the other topology views use: it takes projections
 * the caller already obtained, returns a plain object, and never fetches, writes, or reads a clock.
 *
 * Two display rules it will not bend:
 *   - A hold is shown as a hold. A projection that failed is never rendered as an empty-but-healthy
 *     panel, because "nothing to show" and "we could not look" mean opposite things to a reader.
 *   - Structural adjacency is never drawn as delivery. The observation contract keeps those two
 *     counts apart precisely so a screen cannot merge them back together.
 *
 * A projection is input, not truth: the caller obtained it, so this module cannot assume the
 * producer's guards ran. Everything below therefore fails closed — an unreadable value becomes a
 * hold or a null, never a zero, and never producer-controlled text copied onto the screen.
 */

const UNAVAILABLE_LABEL = "관찰 증거 없음";
const UNKNOWN_ENUM_LABEL = "알 수 없는 상태 · 표시 보류";
const DEFAULT_LINEAGE_LIMIT = 10;

const HOLD_LABELS = Object.freeze({
  UNKNOWN_STORE: "관찰 store를 알 수 없음 · 표시 보류",
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: "허용되지 않은 필드 · 표시 보류",
  HOSTILE_INPUT_REFUSED: "입력 거부됨 · 표시 보류",
  INPUT_TOO_LARGE: "입력이 한도를 넘음 · 표시 보류",
});

const HEALTH_LABELS = Object.freeze({
  available: "가용",
  missing: "근거 없음",
  invalid: "불일치",
  disabled: "비활성",
});

const COVERAGE_LABELS = Object.freeze({
  exact: "정확 바인딩",
  hold: "보류",
});

/** Every record family the store audits. A family missing here would be displayed as unaudited. */
const AUDITED_FAMILY_LABELS = Object.freeze({
  agents: "에이전트",
  runs: "실행",
  usage: "사용량",
  receipts: "영수증",
  delivery_edges: "전달 간선",
});

// Local mirrors of the observation owner's guard primitives: the owner module imports `node:crypto`,
// which a Board bundle cannot, so only the shapes this view reads are re-stated here.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/u;
// Charset-checked, not local-path-checked: `/root/…` is a legitimate meter key and a POSIX root at once.
const SAFE_LINEAGE_KEY = /^\/?[A-Za-z0-9][A-Za-z0-9_.\-/]{0,199}$/u;
const LOCAL_PATH_VALUE = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|(?:^|[^A-Za-z0-9])\/(?:Users|home|mnt|opt|srv|var|etc|tmp|root|Volumes|Applications)\/|(?:^|[^A-Za-z0-9])(?:_workmeta|_workspaces|private-state)\/|guild_hall\/state\//iu;
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]/iu;
/** Ref kinds share the receipt vocabulary; a kind outside it is a ref this view cannot label. */
const REF_KINDS = new Set(["result", "delivery", "artifact", "approval", "validation", "recovery"]);
const HEALTH_EVIDENCE_KEYS = Object.freeze(["run_count", "agent_count", "runs_claiming_result",
  "runs_claiming_result_with_evidence", "exactly_bound_run_count", "unbound_run_count"]);
// A count larger than this is not a store count; it is a number that would render as noise.
const MAX_COUNT = 1_000_000_000;

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isPlainObject = (value) => isRecord(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isText = (value, pattern) => typeof value === "string" && pattern.test(value)
  && !LOCAL_PATH_VALUE.test(value) && !SECRET_VALUE.test(value);
const isSafeId = (value) => isText(value, SAFE_ID);
const isSafeRef = (value) => isText(value, SAFE_REF);
// `/root/…` is the meter's own key space, not a filesystem path, so exactly that leading segment is
// exempted by name. The remainder of the key still gets the whole-path refusal every other string on
// this screen gets, which keeps known home, mount, and system-root path shapes — including one
// hidden below the meter root — from being displayable as an agent key.
const METER_ROOT_PREFIX = /^\/root(?=\/|$)/u;
const isSafeLineageKey = (value) => typeof value === "string"
  && SAFE_LINEAGE_KEY.test(value) && !SECRET_VALUE.test(value)
  && !LOCAL_PATH_VALUE.test(value.replace(METER_ROOT_PREFIX, ""));
/** Unknown, not zero: zero would claim the store held nothing, which is a different fact. */
const safeCount = (value) => (Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : null);

const MAX_SCAN_DEPTH = 10;
const MAX_SCAN_ITEMS = 4096;
const HOSTILE_INPUT = Symbol("soulforge.agent_observation_view.hostile_input");
const TOO_LARGE = Symbol("soulforge.agent_observation_view.too_large");

/**
 * One read of every own property, through its descriptor, into a fresh plain structure. A getter or
 * a Proxy trap could otherwise show a guard one value and the row builder another, and a hostile or
 * revoked Proxy throws from reads the panel would perform while rendering.
 */
function snapshotValue(value, depth) {
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_SCAN_DEPTH) return HOSTILE_INPUT;
  const isList = Array.isArray(value);
  if (!isList && !isPlainObject(value)) return HOSTILE_INPUT;
  // A list's `length` is a settable number: bounded before the walk, not after it.
  if (isList && value.length > MAX_SCAN_ITEMS) return TOO_LARGE;
  const names = isList ? [...value.keys()].map(String) : Object.getOwnPropertyNames(value);
  if (names.length > MAX_SCAN_ITEMS) return TOO_LARGE;
  const copy = isList ? [] : {};
  for (const name of names) {
    // An accessor, or the hole a sparse list leaves, is not a value the producer emitted.
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || descriptor.get || descriptor.set) return HOSTILE_INPUT;
    const item = snapshotValue(descriptor.value, depth + 1);
    if (item === HOSTILE_INPUT || item === TOO_LARGE) return item;
    // Assignment would invoke the inherited setter for `__proto__` and drop the key before any
    // check ran, turning a refusal into a pass.
    Object.defineProperty(copy, name, { value: item, writable: true, enumerable: true, configurable: true });
  }
  return copy;
}

/** Returns a plain snapshot, or the hold that refusing to read it is. A hostile or revoked Proxy
 * throws from the reads above, and letting that escape would turn a refusal into a crash. */
function guardProjection(value) {
  let taken;
  try { taken = snapshotValue(value, 0); } catch { taken = HOSTILE_INPUT; }
  if (taken === TOO_LARGE) return { status: "HOLD", hold_code: "INPUT_TOO_LARGE" };
  if (taken === HOSTILE_INPUT) return { status: "HOLD", hold_code: "HOSTILE_INPUT_REFUSED" };
  return taken;
}

export function lookupObservationHoldLabel(holdCode) {
  if (typeof holdCode !== "string" || holdCode.length === 0) return UNAVAILABLE_LABEL;
  // A hold code is producer-controlled text, so it obeys the same closed-vocabulary rule as every
  // other producer-supplied enum here: labelled if this view has a label, held otherwise. Echoing
  // an unrecognised code would put producer text on the screen under the guise of a refusal.
  return Object.hasOwn(HOLD_LABELS, holdCode) ? HOLD_LABELS[holdCode] : UNKNOWN_ENUM_LABEL;
}

const isProjected = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && value.status === "PROJECTED";

const holdOf = (value) => (value !== null && typeof value === "object" && value.status === "HOLD"
  ? lookupObservationHoldLabel(value.hold_code)
  : UNAVAILABLE_LABEL);

/**
 * The privacy panel. The counters are only meaningful alongside the list of families they covered:
 * three zeroes read the same whether every family was audited or none were.
 */
function buildPrivacyPanel(counts) {
  if (!isProjected(counts)) {
    return { available: false, reason: holdOf(counts), families: [], totals: null, clean: false };
  }
  const claimed = Array.isArray(counts.privacy_audited_families) ? counts.privacy_audited_families : [];
  // Only a family this view has a label for; an unrecognised name would be producer text on screen.
  const audited = claimed.filter((family) => Object.hasOwn(AUDITED_FAMILY_LABELS, family));
  const privacy = isRecord(counts.privacy) ? counts.privacy : {};
  const totals = {
    raw_fields_stored: safeCount(privacy.raw_fields_stored ?? 0),
    secret_fields_stored: safeCount(privacy.secret_fields_stored ?? 0),
    local_path_fields_stored: safeCount(privacy.local_path_fields_stored ?? 0),
  };
  const expected = Object.keys(AUDITED_FAMILY_LABELS);
  const missing = expected.filter((family) => !audited.includes(family));
  return {
    available: true,
    reason: null,
    families: audited.map((family) => ({ key: family, label: AUDITED_FAMILY_LABELS[family] })),
    // A family the store knows about but did not audit is the one thing these counters cannot show,
    // so the view says it outright rather than letting three zeroes imply full coverage.
    unaudited_families: missing.map((family) => ({ key: family, label: AUDITED_FAMILY_LABELS[family] })),
    totals,
    clean: missing.length === 0
      && totals.raw_fields_stored === 0
      && totals.secret_fields_stored === 0
      && totals.local_path_fields_stored === 0,
  };
}

/**
 * Each ref keeps the producer that supplied it. A pooled list would say a consumer received these
 * artifacts without saying from whom. A ref this view cannot vouch for is dropped and declared,
 * because a silently shortened list reads as evidence that never existed.
 */
const isEvidenceRef = (ref) => isRecord(ref)
  && isSafeId(ref.producer_agent_id) && REF_KINDS.has(ref.ref_kind) && isSafeRef(ref.ref_value);

function buildEvidence(refs) {
  if (!Array.isArray(refs)) return { rows: [], withheld: refs !== undefined && refs !== null };
  const rows = refs.filter(isEvidenceRef).map((ref) => ({
    producer_agent_id: ref.producer_agent_id,
    ref_label: `${ref.ref_kind}:${ref.ref_value}`,
  }));
  return { rows, withheld: rows.length !== refs.length };
}

function buildConsumerRow(consumer) {
  // A row this view cannot identify safely is not rendered at all: the identifiers are the row.
  if (!isRecord(consumer) || !isSafeId(consumer.consumer_run_id) || !isSafeId(consumer.consumer_agent_id)) return null;
  const deliveryCount = safeCount(consumer.delivery_count ?? 0);
  const structuralCount = safeCount(consumer.structural_count ?? 0);
  const evidence = buildEvidence(consumer.producer_evidence_refs);
  return {
    consumer_run_id: consumer.consumer_run_id,
    consumer_agent_id: consumer.consumer_agent_id,
    delivery_count: deliveryCount,
    structural_count: structuralCount,
    evidence: evidence.rows,
    evidence_withheld: evidence.withheld,
    // Adjacency with no delivery is worth showing as its own state rather than as a zero. An
    // unreadable count is neither, so it never claims adjacency.
    adjacent_only: deliveryCount === 0 && structuralCount !== null && structuralCount > 0,
  };
}

/** The delivery panel. Structural and delivery counts stay in separate columns, never summed. */
function buildDeliveryPanel(edges) {
  if (!isProjected(edges)) {
    return { available: false, reason: holdOf(edges), consumers: [], delivery_count: 0, structural_count: 0 };
  }
  const consumers = [];
  let withheldConsumerCount = 0;
  for (const consumer of Array.isArray(edges.consumers) ? edges.consumers : []) {
    const row = buildConsumerRow(consumer);
    if (row === null) withheldConsumerCount += 1;
    else consumers.push(row);
  }
  return {
    available: true,
    reason: null,
    delivery_count: safeCount(edges.delivery_edge_count ?? 0),
    structural_count: safeCount(edges.structural_edge_count ?? 0),
    consumers,
    // A consumer this view refused to render is named as a refusal, not as an absent consumer.
    withheld_consumer_count: withheldConsumerCount,
  };
}

/** The Board health panel, in the Board's own closed vocabulary. */
function buildHealthPanel(health) {
  if (!isProjected(health)) {
    return { available: false, reason: holdOf(health), result_gate: null, binding_coverage: null, evidence: null };
  }
  const scope = isRecord(health.scope) ? health.scope : {};
  return {
    available: true,
    reason: null,
    result_gate: closedVocabulary(scope.result_gate_health, HEALTH_LABELS),
    binding_coverage: closedVocabulary(scope.binding_coverage, COVERAGE_LABELS),
    evidence: buildHealthEvidence(health.evidence),
  };
}

/** A value outside the closed set is held. Echoing it would put producer text on the screen. */
function closedVocabulary(value, labels) {
  return typeof value === "string" && Object.hasOwn(labels, value)
    ? { value, label: labels[value] }
    : { value: null, label: UNKNOWN_ENUM_LABEL };
}

/** The counts the two verdicts were computed from — only those, and only as counts. */
function buildHealthEvidence(evidence) {
  if (!isRecord(evidence)) return null;
  const counts = {};
  for (const key of HEALTH_EVIDENCE_KEYS) {
    if (Object.hasOwn(evidence, key)) counts[key] = safeCount(evidence[key]);
  }
  return counts;
}

function buildLineageRow(agent) {
  if (!isRecord(agent) || !isSafeLineageKey(agent.agent_key)) return null;
  const selfTurns = safeCount(agent.self_usage?.turns ?? 0);
  const childDirectTurns = safeCount(agent.child_direct_usage?.turns ?? 0);
  const subtreeTurns = safeCount(agent.subtree_usage?.turns ?? 0);
  // An unreadable rollup cannot be ranked against rows that can be, so the row is dropped.
  if (selfTurns === null || childDirectTurns === null || subtreeTurns === null) return null;
  return {
    agent_key: agent.agent_key,
    depth: safeCount(agent.depth),
    child_count: Array.isArray(agent.child_keys) ? agent.child_keys.length : null,
    self_turns: selfTurns,
    child_direct_turns: childDirectTurns,
    subtree_turns: subtreeTurns,
    // Present only when a grandchild exists, which is the case the three rollups exist to tell
    // apart at all.
    has_descendants_beyond_children: subtreeTurns !== selfTurns + childDirectTurns,
  };
}

/**
 * The lineage panel: the agents whose subtree cost more than their own row.
 *
 * A parent whose subtree equals its self usage has no descendants worth a row here, and listing
 * every leaf would bury the handful of agents that actually dispatched work.
 */
function buildLineagePanel(lineage, { limit = DEFAULT_LINEAGE_LIMIT } = {}) {
  if (!isProjected(lineage)) {
    return { available: false, reason: holdOf(lineage), agents: [], agent_count: 0 };
  }
  const rows = (Array.isArray(lineage.agents) ? lineage.agents : [])
    .map(buildLineageRow)
    .filter((row) => row !== null);
  const dispatchers = rows
    .filter((row) => row.subtree_turns > row.self_turns)
    .sort((left, right) => (right.subtree_turns - left.subtree_turns)
      || left.agent_key.localeCompare(right.agent_key, "en"));
  return {
    available: true,
    reason: null,
    agent_count: safeCount(lineage.agent_count ?? rows.length),
    // Parents the ledger never emitted a row for. A non-zero count means the source list was
    // incomplete, which is worth surfacing rather than silently repairing.
    materialised_parent_count: safeCount(lineage.materialised_parent_count ?? 0),
    truncated: dispatchers.length > limit,
    agents: dispatchers.slice(0, limit),
  };
}

/**
 * Builds the whole Agent Observation panel set.
 *
 * Every projection is optional: a caller that has not obtained one gets that panel marked
 * unavailable rather than an empty panel that reads as healthy.
 */
export function buildAgentObservationViewModel({
  storeCounts = null,
  deliveryEdges = null,
  boardHealth = null,
  meterLineage = null,
  lineageLimit = DEFAULT_LINEAGE_LIMIT,
} = {}) {
  const counts = guardProjection(storeCounts);
  // An unusable limit is a caller mistake, not an instruction to cut the list somewhere arbitrary.
  const limit = Number.isSafeInteger(lineageLimit) && lineageLimit > 0 && lineageLimit <= MAX_COUNT
    ? lineageLimit
    : DEFAULT_LINEAGE_LIMIT;
  const privacy = buildPrivacyPanel(counts);
  const delivery = buildDeliveryPanel(guardProjection(deliveryEdges));
  const health = buildHealthPanel(guardProjection(boardHealth));
  const lineage = buildLineagePanel(guardProjection(meterLineage), { limit });
  const panels = [privacy, delivery, health, lineage];

  return {
    schema_version: "soulforge.team_ops_board.agent_observation_view.v1",
    available: panels.some((panel) => panel.available),
    // Named so a reader can tell "all four panels are blank because nothing is wired" from "one
    // projection failed".
    unavailable_panel_count: panels.filter((panel) => !panel.available).length,
    counts: isProjected(counts)
      ? {
        agents: safeCount(counts.agents ?? 0),
        runs: safeCount(counts.runs ?? 0),
        usage_events: safeCount(counts.usage_events ?? 0),
        receipts: safeCount(counts.receipts ?? 0),
        delivery_edges: safeCount(counts.delivery_edges ?? 0),
      }
      : null,
    privacy,
    delivery,
    health,
    lineage,
    authority_boundary: {
      read_only: true,
      writes_observation_store: false,
      writes_result_gate: false,
    },
  };
}
