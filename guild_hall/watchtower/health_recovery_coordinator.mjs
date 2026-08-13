const MODES = new Set(["observe", "safe-repair"]);
const SAFE_ACTIONS = new Set([
  "restart_owned_task",
  "revalidate_state",
  "refresh_projection",
  "bounded_retry",
]);
const FORBIDDEN_ACTION =
  /(credential|password|secret|token|cookie|login|account|permission|delete|purge|mark[_-]?processed|acknowledge|route|external|send|upload)/i;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_.-]{0,127}$/u;

const DIMENSION_VALUES = {
  liveness: new Set(["alive", "stopped", "unknown"]),
  connection: new Set(["connected", "failed", "not_applicable", "unknown"]),
  outcome: new Set(["ok", "idle", "partial", "failed", "unknown"]),
  backlog: new Set(["clear", "held", "growing", "unknown"]),
};

function safeIdentifier(value, fallback = "unknown") {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    return fallback;
  }
  return value;
}

function safeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function dimensionStatus(node, name) {
  const raw = node?.[name];
  const status = typeof raw === "object" && raw !== null ? raw.status : raw;
  return DIMENSION_VALUES[name].has(status) ? status : "unknown";
}

function diagnosis(dimensions) {
  if (dimensions.liveness === "stopped") return "process_stopped";
  if (dimensions.connection === "failed") return "connection_failed";
  if (dimensions.outcome === "failed") return "processing_failed";
  if (dimensions.backlog === "growing") return "backlog_growing";
  if (dimensions.backlog === "held") return "backlog_held";
  if (dimensions.outcome === "partial") return "partial_processing";
  if (Object.values(dimensions).includes("unknown")) return "no_independent_evidence";
  if (dimensions.outcome === "idle" && dimensions.backlog === "clear") return "healthy_idle";
  return "healthy";
}

function actionFor(node) {
  const requested = typeof node?.repair === "object" && node.repair !== null
    ? node.repair.action
    : node?.repairAction;
  return safeIdentifier(requested, "none");
}

function isAllowlisted(allowlist, action, nodeId) {
  if (typeof allowlist === "function") return allowlist({ action, nodeId }) === true;
  if (allowlist instanceof Set) return allowlist.has(action) || allowlist.has(`${nodeId}:${action}`);
  if (Array.isArray(allowlist)) return allowlist.includes(action) || allowlist.includes(`${nodeId}:${action}`);
  return false;
}

function callable(dependency, action) {
  if (typeof dependency === "function") return dependency;
  if (dependency && typeof dependency[action] === "function") return dependency[action];
  return null;
}

function succeeded(result) {
  if (result === true) return true;
  return Boolean(result && typeof result === "object" && result.ok === true);
}

function baseReceipt(node) {
  const nodeId = safeIdentifier(node?.nodeId ?? node?.id);
  const owner = safeIdentifier(node?.owner);
  const escalation = safeIdentifier(node?.escalationOwner, owner);
  const dimensions = {
    liveness: dimensionStatus(node, "liveness"),
    connection: dimensionStatus(node, "connection"),
    outcome: dimensionStatus(node, "outcome"),
    backlog: dimensionStatus(node, "backlog"),
  };
  return {
    node_id: nodeId,
    owner,
    reason: diagnosis(dimensions),
    last_check: safeTimestamp(node?.lastCheck),
    next_check: safeTimestamp(node?.nextCheck),
    dimensions,
    repairability: "not_needed",
    repair_action: "none",
    attempt: "not_attempted",
    verification: "not_run",
    escalation,
  };
}

async function reconcileNode(mode, node, deps) {
  const subjectValid = typeof (node?.nodeId ?? node?.id) === "string"
    && SAFE_IDENTIFIER.test(node.nodeId ?? node.id);
  const receipt = baseReceipt(node);
  if (!subjectValid) receipt.reason = "invalid_subject";
  if (receipt.reason === "healthy" || receipt.reason === "healthy_idle") return receipt;

  const action = actionFor(node);
  receipt.repair_action = action;
  if (action === "none") {
    receipt.repairability = "not_declared";
    return receipt;
  }
  if (FORBIDDEN_ACTION.test(action) || !SAFE_ACTIONS.has(action)) {
    receipt.repair_action = "forbidden";
    receipt.repairability = "forbidden";
    receipt.attempt = "denied";
    return receipt;
  }
  if (mode === "observe") {
    receipt.repairability = "observe_only";
    return receipt;
  }
  if (!subjectValid) {
    receipt.repairability = "not_available";
    receipt.attempt = "denied";
    return receipt;
  }
  if (!isAllowlisted(deps.allowlist, action, receipt.node_id)) {
    receipt.repairability = "not_allowlisted";
    receipt.attempt = "denied";
    return receipt;
  }

  const executor = callable(deps.executor, action);
  const verifier = callable(deps.verifier, action);
  if (!executor || !verifier || executor === verifier) {
    receipt.repairability = "not_available";
    receipt.attempt = "denied";
    return receipt;
  }
  receipt.repairability = "allowlisted";

  const request = Object.freeze({ action, nodeId: receipt.node_id });
  try {
    receipt.verification = succeeded(await verifier(request)) ? "passed" : "failed";
  } catch {
    receipt.verification = "failed";
  }
  if (receipt.verification !== "passed") {
    receipt.attempt = "denied";
    return receipt;
  }
  try {
    const execution = await executor(request);
    receipt.attempt = succeeded(execution) ? "succeeded" : "failed";
  } catch {
    receipt.attempt = "failed";
  }
  if (receipt.attempt !== "succeeded") return receipt;

  try {
    receipt.verification = succeeded(await verifier(request)) ? "passed" : "failed";
  } catch {
    receipt.verification = "failed";
  }
  return receipt;
}

/**
 * Reconcile sanitized node observations. No repair runs unless mode is
 * safe-repair and the action is both intrinsically safe and explicitly
 * allowlisted. Executors and verifiers receive only action and stable node ID.
 */
export async function reconcile(input = {}, deps = {}) {
  const mode = input.mode ?? "observe";
  if (!MODES.has(mode)) throw new TypeError("invalid_reconcile_mode");
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new TypeError("invalid_reconcile_nodes");
  }
  const nodes = input.nodes;
  const receipts = [];
  for (const node of nodes) receipts.push(await reconcileNode(mode, node, deps));
  return {
    mode,
    status: receipts.some((receipt) => !["healthy", "healthy_idle"].includes(receipt.reason))
      ? "attention"
      : "healthy",
    receipts,
  };
}

export class HealthRecoveryCoordinator {
  constructor(deps = {}) {
    this.deps = deps;
  }

  reconcile(input = {}) {
    return reconcile(input, this.deps);
  }
}
