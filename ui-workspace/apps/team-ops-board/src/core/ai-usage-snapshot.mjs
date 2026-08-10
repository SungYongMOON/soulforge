export const AI_USAGE_BOARD_SNAPSHOT_SCHEMA = "soulforge.ai_usage_board_snapshot.v1";

const HOOK_STATUSES = new Set(["ok", "disabled", "hold", "deferred", "unknown"]);
const COVERAGE_STATUSES = new Set(["unmeasured", "partial", "complete"]);
const FORBIDDEN_KEY = /(session|path|raw|private|secret|credential|cookie|prompt|reasoning|argument|output|body)/i;
const PUBLIC_ROLE_LABELS = new Map([
  ["ceo", "CEO"],
  ["system_manager", "SYSTEM_manager"],
  ["system manager", "SYSTEM_manager"],
  ["manager", "manager"],
  ["responsibility_owner", "responsibility_owner"],
  ["responsibility owner", "responsibility_owner"],
  ["owner", "owner"],
  ["executor", "executor"],
  ["execution", "execution"],
  ["reviewer", "reviewer"],
  ["review", "review"],
  ["unassigned", "unassigned"]
]);
const PUBLIC_EFFORT_LABELS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra"
]);
const PUBLIC_MODEL = /^gpt-\d+(?:\.\d+)*(?:-(?:sol|terra|codex|mini|pro|thinking|spark))*$/iu;

const ROOT_KEYS = new Set([
  "schema_version",
  "generated_at",
  "health",
  "coverage",
  "totals",
  "roles",
  "model_effort",
  "activity"
]);
const HEALTH_KEYS = new Set(["hook_status", "pending_event_count"]);
const COVERAGE_KEYS = new Set([
  "status",
  "measured_turns",
  "total_turns",
  "unassigned_turns",
  "rate_unknown_turns",
  "issue_count"
]);
const TOTAL_KEYS = new Set(["turns", "total_tokens", "credits", "credit_unknown_turns"]);
const ROLE_KEYS = new Set(["role", "turns", "total_tokens", "credits", "credit_unknown_turns"]);
const MODEL_EFFORT_KEYS = new Set([
  "model",
  "reasoning_effort",
  "turns",
  "total_tokens",
  "credits",
  "credit_unknown_turns"
]);
const ACTIVITY_KEYS = new Set([
  "execution_turns",
  "coordination_turns",
  "review_turns",
  "fan_out_turns",
  "retry_count",
  "timeout_count"
]);
const DECIMAL_RECONCILIATION_TOLERANCE = 1e-9;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenKey);
  }
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([key, child]) =>
      (key !== "reasoning_effort" && FORBIDDEN_KEY.test(key)) || hasForbiddenKey(child)
  );
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function nonNegativeNumberOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? value
    : undefined;
}

function publicText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeRole(value) {
  return PUBLIC_ROLE_LABELS.get(publicText(value).toLowerCase()) ?? "unassigned";
}

function safeModel(value) {
  const label = publicText(value).toLowerCase();
  return PUBLIC_MODEL.test(label) ? label : "UNKNOWN";
}

function safeEffort(value) {
  const label = publicText(value).toLowerCase();
  return PUBLIC_EFFORT_LABELS.has(label) ? label : "UNKNOWN";
}

function safeGeneratedAt(value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length > 40 || !/^[0-9T:+.-]+Z?$/.test(value)) {
    return undefined;
  }
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function parseMeasuredRow(value, allowed, labels) {
  if (!hasOnlyKeys(value, allowed)) {
    return null;
  }

  const turns = nonNegativeInteger(value.turns);
  const totalTokens = nonNegativeInteger(value.total_tokens);
  const credits = nonNegativeNumberOrNull(value.credits);
  const creditUnknownTurns = nonNegativeInteger(value.credit_unknown_turns);
  if (turns === null || totalTokens === null || credits === undefined || creditUnknownTurns === null) {
    return null;
  }
  if (creditUnknownTurns > turns) {
    return null;
  }

  return {
    ...labels(value),
    turns,
    total_tokens: totalTokens,
    credits,
    credit_unknown_turns: creditUnknownTurns
  };
}

function sumRows(rows) {
  return rows.reduce(
    (sum, row) => ({
      turns: sum.turns + row.turns,
      total_tokens: sum.total_tokens + row.total_tokens,
      credits: sum.credits === null || row.credits === null ? null : sum.credits + row.credits,
      credit_unknown_turns: sum.credit_unknown_turns + row.credit_unknown_turns
    }),
    { turns: 0, total_tokens: 0, credits: 0, credit_unknown_turns: 0 }
  );
}

function creditsMatch(left, right) {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) <= DECIMAL_RECONCILIATION_TOLERANCE;
}

export function createUnmeasuredAiUsageSnapshot() {
  return {
    schema_version: AI_USAGE_BOARD_SNAPSHOT_SCHEMA,
    generated_at: null,
    health: { hook_status: "unknown", pending_event_count: 0 },
    coverage: {
      status: "unmeasured",
      measured_turns: 0,
      total_turns: 0,
      unassigned_turns: 0,
      rate_unknown_turns: 0,
      issue_count: 0
    },
    totals: { turns: 0, total_tokens: 0, credits: null, credit_unknown_turns: 0 },
    roles: [],
    model_effort: [],
    activity: {
      execution_turns: 0,
      coordination_turns: 0,
      review_turns: 0,
      fan_out_turns: 0,
      retry_count: 0,
      timeout_count: 0
    }
  };
}

export function reconcileAiUsageSnapshot(snapshot) {
  const roleTotals = sumRows(snapshot.roles);
  const modelEffortTotals = sumRows(snapshot.model_effort);
  const turnsAndTokensMatch =
    roleTotals.turns === snapshot.totals.turns &&
    modelEffortTotals.turns === snapshot.totals.turns &&
    roleTotals.total_tokens === snapshot.totals.total_tokens &&
    modelEffortTotals.total_tokens === snapshot.totals.total_tokens;
  const roleCreditsMatch = creditsMatch(roleTotals.credits, snapshot.totals.credits);
  const modelEffortCreditsMatch = creditsMatch(
    modelEffortTotals.credits,
    snapshot.totals.credits
  );
  const roleCreditUnknownTurnsMatch =
    roleTotals.credit_unknown_turns === snapshot.totals.credit_unknown_turns;
  const modelEffortCreditUnknownTurnsMatch =
    modelEffortTotals.credit_unknown_turns === snapshot.totals.credit_unknown_turns;

  return {
    ok:
      turnsAndTokensMatch &&
      roleCreditsMatch &&
      modelEffortCreditsMatch &&
      roleCreditUnknownTurnsMatch &&
      modelEffortCreditUnknownTurnsMatch,
    role_totals: roleTotals,
    model_effort_totals: modelEffortTotals,
    known_credits_reconcile: roleCreditsMatch && modelEffortCreditsMatch,
    credit_unknown_turns_reconcile:
      roleCreditUnknownTurnsMatch && modelEffortCreditUnknownTurnsMatch
  };
}

function invalidResult() {
  return {
    state: "invalid",
    snapshot: createUnmeasuredAiUsageSnapshot(),
    reconciliation: null
  };
}

export function normalizeAiUsageSnapshot(input) {
  if (input === null || input === undefined) {
    return {
      state: "unmeasured",
      snapshot: createUnmeasuredAiUsageSnapshot(),
      reconciliation: null
    };
  }
  if (!isRecord(input) || hasForbiddenKey(input) || !hasOnlyKeys(input, ROOT_KEYS)) {
    return invalidResult();
  }
  if (
    input.schema_version !== AI_USAGE_BOARD_SNAPSHOT_SCHEMA ||
    !hasOnlyKeys(input.health, HEALTH_KEYS) ||
    !hasOnlyKeys(input.coverage, COVERAGE_KEYS) ||
    !hasOnlyKeys(input.totals, TOTAL_KEYS) ||
    !hasOnlyKeys(input.activity, ACTIVITY_KEYS) ||
    !Array.isArray(input.roles) ||
    !Array.isArray(input.model_effort)
  ) {
    return invalidResult();
  }

  const generatedAt = safeGeneratedAt(input.generated_at);
  const pendingEventCount = nonNegativeInteger(input.health.pending_event_count);
  const measuredTurns = nonNegativeInteger(input.coverage.measured_turns);
  const coverageTotalTurns = nonNegativeInteger(input.coverage.total_turns);
  const unassignedTurns = nonNegativeInteger(input.coverage.unassigned_turns);
  const rateUnknownTurns = nonNegativeInteger(input.coverage.rate_unknown_turns);
  const coverageIssueCount = nonNegativeInteger(input.coverage.issue_count);
  const turns = nonNegativeInteger(input.totals.turns);
  const totalTokens = nonNegativeInteger(input.totals.total_tokens);
  const credits = nonNegativeNumberOrNull(input.totals.credits);
  const creditUnknownTurns = nonNegativeInteger(input.totals.credit_unknown_turns);
  const activity = Object.fromEntries(
    [...ACTIVITY_KEYS].map((key) => [key, nonNegativeInteger(input.activity[key])])
  );

  if (
    generatedAt === undefined ||
    !HOOK_STATUSES.has(input.health.hook_status) ||
    !COVERAGE_STATUSES.has(input.coverage.status) ||
    [
      pendingEventCount,
      measuredTurns,
      coverageTotalTurns,
      unassignedTurns,
      rateUnknownTurns,
      coverageIssueCount,
      turns,
      totalTokens,
      creditUnknownTurns,
      credits,
      ...Object.values(activity)
    ].some((value) => value === null || value === undefined) ||
    measuredTurns > coverageTotalTurns ||
    unassignedTurns > measuredTurns ||
    rateUnknownTurns > measuredTurns ||
    rateUnknownTurns !== creditUnknownTurns ||
    creditUnknownTurns > turns
  ) {
    return invalidResult();
  }

  if (
    measuredTurns !== turns ||
    (input.coverage.status === "complete" && (
      measuredTurns !== coverageTotalTurns || coverageIssueCount !== 0
    )) ||
    activity.execution_turns + activity.coordination_turns + activity.review_turns !== turns ||
    activity.fan_out_turns > turns
  ) {
    return invalidResult();
  }

  const roles = input.roles.map((row) =>
    parseMeasuredRow(row, ROLE_KEYS, (entry) => ({ role: safeRole(entry.role) }))
  );
  const modelEffort = input.model_effort.map((row) =>
    parseMeasuredRow(row, MODEL_EFFORT_KEYS, (entry) => ({
      model: safeModel(entry.model),
      reasoning_effort: safeEffort(entry.reasoning_effort)
    }))
  );
  if (roles.some((row) => row === null) || modelEffort.some((row) => row === null)) {
    return invalidResult();
  }
  // Coverage is the count of turns missing any critical attribution dimension;
  // a sanitized unassigned role is therefore a lower bound, not an exact partition.
  const sanitizedRoleUnassignedTurns = roles.reduce(
    (sum, row) => sum + (row.role === "unassigned" ? row.turns : 0),
    0
  );
  if (sanitizedRoleUnassignedTurns > unassignedTurns || unassignedTurns > turns) {
    return invalidResult();
  }

  const snapshot = {
    schema_version: AI_USAGE_BOARD_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    health: { hook_status: input.health.hook_status, pending_event_count: pendingEventCount },
    coverage: {
      status: input.coverage.status,
      measured_turns: measuredTurns,
      total_turns: coverageTotalTurns,
      unassigned_turns: unassignedTurns,
      rate_unknown_turns: rateUnknownTurns,
      issue_count: coverageIssueCount
    },
    totals: { turns, total_tokens: totalTokens, credits, credit_unknown_turns: creditUnknownTurns },
    roles,
    model_effort: modelEffort,
    activity
  };
  const reconciliation = reconcileAiUsageSnapshot(snapshot);
  return reconciliation.ok
    ? { state: "ready", snapshot, reconciliation }
    : invalidResult();
}
