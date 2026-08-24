export const CANDIDATE_EXECUTION_RECEIPT_SCHEMA =
  "soulforge.candidate_execution.receipt.v1";

const CANDIDATE_SCHEMA = "soulforge.candidate_execution.candidate_packet.v1";
const TASK_SCHEMA = "soulforge.candidate_execution.task_packet.v1";
const ASSIGNMENT_SCHEMA = "soulforge.assignment_policy.assignment_packet.v1";
const DECOMPOSITION_SCHEMA = "soulforge.candidate_execution.decomposition_packet.v1";
const DECOMPOSITION_RECEIPT_SCHEMA = "soulforge.candidate_execution.decomposition_receipt.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]/iu;
const LOCAL_PATH_VALUE = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|(?:^|[^A-Za-z0-9])\/(?:Users|home|mnt|opt|srv|var|etc|tmp|root|Volumes|Applications)\/|(?:^|[^A-Za-z0-9])(?:_workmeta|_workspaces|private-state)\/|guild_hall\/state\//iu;
const FORBIDDEN_KEY = /(^|_)(raw|prompt|message|body|payload|secret|token|password|path|cwd|transcript|reasoning|tool_io)(_|$)/iu;
const MAX_DEPTH = 12;
const MAX_LIST = 64;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshot(value, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (value.length > MAX_LIST) return null;
    const copy = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || descriptor.get || descriptor.set) return null;
      const child = snapshot(descriptor.value, depth + 1);
      if (child === null && descriptor.value !== null) return null;
      copy.push(child);
    }
    return copy;
  }
  if (!isPlainObject(value)) return null;
  const copy = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) return null;
    const child = snapshot(descriptor.value, depth + 1);
    if (child === null && descriptor.value !== null) return null;
    Object.defineProperty(copy, key, {
      value: child,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function metadataViolation(value, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  if (typeof value === "string") return SECRET_VALUE.test(value) || LOCAL_PATH_VALUE.test(value);
  if (Array.isArray(value)) return value.some((entry) => metadataViolation(entry, depth + 1));
  if (!isPlainObject(value)) return value !== null && typeof value === "object";
  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_KEY.test(key) || metadataViolation(child, depth + 1)
  ));
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function onlyKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).every((key) => keys.includes(key));
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value)
    && !SECRET_VALUE.test(value) && !LOCAL_PATH_VALUE.test(value);
}

function isTaskRef(value) {
  return exactKeys(value, ["provider", "task_id"])
    && isSafeId(value.provider) && isSafeId(value.task_id);
}

function sameTaskRef(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id;
}

function isRevisionRef(value, taskRef) {
  return exactKeys(value, ["provider", "task_id", "revision_id", "content_sha256"])
    && value.provider === taskRef.provider && value.task_id === taskRef.task_id
    && isSafeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function isSnapshotRef(value) {
  return exactKeys(value, ["revision_id", "content_sha256"])
    && isSafeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function isIdList(value, { allowEmpty = false } = {}) {
  return Array.isArray(value) && value.length <= MAX_LIST
    && (allowEmpty || value.length > 0) && value.every(isSafeId)
    && new Set(value).size === value.length;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  ).join(",")}}`;
}

function hold(code) {
  return deepFreeze({ status: "HOLD", hold_code: code });
}

function claimOf(taskPacket) {
  return {
    task_ref: structuredClone(taskPacket.task_ref),
    work_brief_revision_ref: structuredClone(taskPacket.work_brief_revision_ref),
    action_ref: taskPacket.action_ref,
  };
}

function claimKey(taskPacket) {
  return stableStringify(claimOf(taskPacket));
}

function assignmentIdentityOf(assignment) {
  return {
    schema_version: assignment.schema_version,
    validation_state: assignment.validation_state,
    assignment_state: assignment.assignment_state,
    policy_mode: assignment.policy_mode,
    policy_revision_ref: structuredClone(assignment.policy_revision_ref),
    responsible_role_ref: assignment.responsible_role_ref,
    performer_binding: structuredClone(assignment.performer_binding),
  };
}

function custodyFingerprint(task, assignment, lineage) {
  return stableStringify({
    task_packet: {
      schema_version: task.schema_version,
      validation_state: task.validation_state,
      task_class: task.task_class,
      task_status: task.task_status,
      ...claimOf(task),
      parent_task_ref: structuredClone(task.parent_task_ref),
      authority_ref: task.authority_ref,
      coverage_refs: [...task.coverage_refs].sort(),
    },
    assignment_identity: assignmentIdentityOf(assignment),
    lineage,
  });
}

function taskIdentity(taskPacket) {
  return `${taskPacket.task_ref.provider}:${taskPacket.task_ref.task_id}`;
}

function validCandidate(value) {
  return exactKeys(value, [
    "schema_version", "validation_state", "selection_state", "candidate_ref",
    "label_prefilter_passed", "task_ref", "work_brief_revision_ref", "action_ref",
    "authority_ref",
  ]) && value.schema_version === CANDIDATE_SCHEMA
    && value.validation_state === "prevalidated" && value.selection_state === "candidate"
    && value.label_prefilter_passed === true && isSafeId(value.candidate_ref)
    && isTaskRef(value.task_ref) && isRevisionRef(value.work_brief_revision_ref, value.task_ref)
    && isSafeId(value.action_ref) && isSafeId(value.authority_ref);
}

function validTask(value) {
  return exactKeys(value, [
    "schema_version", "validation_state", "task_class", "task_status", "task_ref",
    "parent_task_ref", "work_brief_revision_ref", "action_ref", "authority_ref",
    "coverage_refs",
  ]) && value.schema_version === TASK_SCHEMA
    && value.validation_state === "prevalidated" && value.task_class === "official"
    && value.task_status === "Todo" && isTaskRef(value.task_ref)
    && (value.parent_task_ref === null || isTaskRef(value.parent_task_ref))
    && (value.parent_task_ref === null || !sameTaskRef(value.parent_task_ref, value.task_ref))
    && isRevisionRef(value.work_brief_revision_ref, value.task_ref)
    && isSafeId(value.action_ref) && isSafeId(value.authority_ref)
    && isIdList(value.coverage_refs);
}

function validAssignment(value) {
  if (!exactKeys(value, [
    "schema_version", "validation_state", "assignment_state", "policy_mode",
    "policy_revision_ref", "task_ref", "work_brief_revision_ref", "action_ref",
    "authority_ref", "responsible_role_ref", "performer_binding",
  ]) || value.schema_version !== ASSIGNMENT_SCHEMA
    || value.validation_state !== "prevalidated" || value.assignment_state !== "assigned"
    || value.policy_mode !== "responsible_ceo_triage"
    || !isSnapshotRef(value.policy_revision_ref) || !isTaskRef(value.task_ref)
    || !isRevisionRef(value.work_brief_revision_ref, value.task_ref)
    || !isSafeId(value.action_ref) || !isSafeId(value.authority_ref)
    || !isSafeId(value.responsible_role_ref)) return false;
  const binding = value.performer_binding;
  return exactKeys(binding, [
    "actor_ref", "performing_agent_id", "bot_ref", "executor_ref",
    "capability_snapshot_ref",
  ]) && isSafeId(binding.actor_ref) && isSafeId(binding.performing_agent_id)
    && isSafeId(binding.bot_ref) && isSafeId(binding.executor_ref)
    && isSnapshotRef(binding.capability_snapshot_ref);
}

function sameRevisionRef(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id
    && left?.revision_id === right?.revision_id
    && left?.content_sha256 === right?.content_sha256;
}

function exactBasis(candidate, task, assignment) {
  return sameTaskRef(candidate.task_ref, task.task_ref)
    && sameTaskRef(assignment.task_ref, task.task_ref)
    && sameRevisionRef(candidate.work_brief_revision_ref, task.work_brief_revision_ref)
    && sameRevisionRef(assignment.work_brief_revision_ref, task.work_brief_revision_ref)
    && candidate.action_ref === task.action_ref && assignment.action_ref === task.action_ref
    && candidate.authority_ref === task.authority_ref
    && assignment.authority_ref === task.authority_ref;
}

function normalizeOutcome(rawOutcome) {
  const value = snapshot(rawOutcome);
  const keys = ["status", "reason_code", "result_ref", "artifact_refs", "evidence_refs"];
  if (!value || metadataViolation(value) || !exactKeys(value, keys)
    || !["succeeded", "failed", "waiting", "hold"].includes(value.status)
    || !isIdList(value.artifact_refs, { allowEmpty: true })
    || !isIdList(value.evidence_refs, { allowEmpty: true })) return null;
  if (value.status === "succeeded") {
    if (value.reason_code !== null || !isSafeId(value.result_ref)) return null;
  } else if (!REASON_CODE.test(value.reason_code ?? "") || value.result_ref !== null) {
    return null;
  }
  return value;
}

function publicRun(run) {
  return deepFreeze({
    run_id: run.run_id,
    attempt_no: run.attempt_no,
    fencing_epoch: run.fencing_epoch,
    status: run.status,
    claim: structuredClone(run.claim),
    attribution: structuredClone(run.attribution),
  });
}

export function createCandidateExecutionCoordinator({ executors, feature_enabled = false } = {}) {
  if (!(executors instanceof Map)) {
    throw new TypeError("candidate_execution_executors_map_required");
  }
  const featureEnabled = feature_enabled === true;

  const claims = new Map();
  const runs = new Map();
  const receipts = new Map();
  const activeSlots = new Map();
  const agentEpochs = new Map();
  const idempotencyKeys = new Map();
  const coverageOwners = new Map();
  const childCustodies = new Map();
  const decomposedParents = new Set();
  const decompositionsByRef = new Map();
  const decompositionsByParent = new Map();
  let runSequence = 0;
  let receiptSequence = 0;

  function nextRunId() {
    runSequence += 1;
    return `candidate-run-${String(runSequence).padStart(6, "0")}`;
  }

  function nextReceiptId(prefix = "candidate-receipt") {
    receiptSequence += 1;
    return `${prefix}-${String(receiptSequence).padStart(6, "0")}`;
  }

  function attributionOf(assignment) {
    return {
      responsible_role_ref: assignment.responsible_role_ref,
      actor_ref: assignment.performer_binding.actor_ref,
      performing_agent_id: assignment.performer_binding.performing_agent_id,
      bot_ref: assignment.performer_binding.bot_ref,
      executor_ref: assignment.performer_binding.executor_ref,
    };
  }

  function makeExecutionReceipt(run, outcomeValue) {
    return deepFreeze({
      schema_version: CANDIDATE_EXECUTION_RECEIPT_SCHEMA,
      receipt_id: nextReceiptId(),
      receipt_kind: "execution",
      run_id: run.run_id,
      attempt_no: run.attempt_no,
      fencing_epoch: run.fencing_epoch,
      claim: structuredClone(run.claim),
      authority_ref: run.authority_ref,
      assignment_policy_revision_ref: structuredClone(run.assignment_policy_revision_ref),
      attribution: structuredClone(run.attribution),
      outcome: outcomeValue.status,
      reason_code: outcomeValue.reason_code,
      result_ref: outcomeValue.result_ref,
      artifact_refs: [...outcomeValue.artifact_refs],
      evidence_refs: [...outcomeValue.evidence_refs],
      official_task_done: false,
      official_task_mutated: false,
      external_effects: {
        linear_writes: 0,
        network_calls: 0,
        filesystem_writes: 0,
        shell_commands: 0,
      },
    });
  }

  function settle(run, fencingEpoch, outcomeValue) {
    const slot = activeSlots.get(run.attribution.performing_agent_id);
    if (!slot || slot.run_id !== run.run_id || slot.fencing_epoch !== fencingEpoch
      || run.status !== "running") return hold("RUN_FENCED_OUT");
    const receipt = makeExecutionReceipt(run, outcomeValue);
    run.status = outcomeValue.status;
    run.receipt_id = receipt.receipt_id;
    receipts.set(receipt.receipt_id, receipt);
    const claimRecord = claims.get(run.claim_key);
    claimRecord.latest_run_id = run.run_id;
    claimRecord.latest_receipt_id = receipt.receipt_id;
    activeSlots.delete(run.attribution.performing_agent_id);
    return deepFreeze({
      status: outcomeValue.status,
      replayed: false,
      agent_run: publicRun(run),
      execution_receipt: receipt,
    });
  }

  function childCustodyHold(task, assignment, key) {
    const custody = childCustodies.get(key);
    if (custody === undefined) return hold("UNKNOWN_ANCESTRY");
    return custody.fingerprint === custodyFingerprint(task, assignment, custody.lineage)
      ? null : hold("CUSTODY_FINGERPRINT_MISMATCH");
  }

  function reserveCoverage(task, assignment, key) {
    const owners = task.coverage_refs.map((coverageRef) => coverageOwners.get(coverageRef));
    if (task.parent_task_ref !== null) {
      const custodyHold = childCustodyHold(task, assignment, key);
      if (custodyHold) return custodyHold;
      if (!owners.every((owner) => owner?.claim_key === key)) {
        return hold("COVERAGE_CUSTODY_CONFLICT");
      }
      return null;
    }
    if (owners.some((owner) => owner !== undefined && owner.claim_key !== key)) {
      return hold("COVERAGE_CUSTODY_CONFLICT");
    }
    for (const coverageRef of task.coverage_refs) {
      if (!coverageOwners.has(coverageRef)) {
        coverageOwners.set(coverageRef, { claim_key: key, task_id: task.task_ref.task_id });
      }
    }
    return null;
  }

  async function dispatch(rawInput) {
    if (!featureEnabled) return hold("FEATURE_OFF");
    const input = snapshot(rawInput);
    if (!input || metadataViolation(input)) return hold("PACKET_METADATA_ONLY_REQUIRED");
    const dispatchKeys = [
      "candidate_packet", "task_packet", "assignment_packet", "idempotency_key",
      "successor_of_receipt_id",
    ];
    if (!onlyKeys(input, dispatchKeys)) return hold("PACKET_METADATA_ONLY_REQUIRED");
    if (!["candidate_packet", "task_packet", "assignment_packet", "idempotency_key"]
      .every((key) => Object.hasOwn(input, key))) return hold("PACKET_SET_INCOMPLETE");
    if (input.assignment_packet?.status === "HOLD") return hold("ASSIGNMENT_NOT_READY");
    if (!validCandidate(input.candidate_packet)) return hold("CANDIDATE_PACKET_INVALID");
    if (!validTask(input.task_packet)) return hold("TASK_PACKET_INVALID");
    if (!validAssignment(input.assignment_packet)) return hold("ASSIGNMENT_PACKET_INVALID");
    if (!isSafeId(input.idempotency_key)) return hold("IDEMPOTENCY_KEY_INVALID");
    const successorReceiptId = input.successor_of_receipt_id ?? null;
    if (successorReceiptId !== null && !isSafeId(successorReceiptId)) {
      return hold("SUCCESSOR_RECEIPT_INVALID");
    }
    if (!exactBasis(input.candidate_packet, input.task_packet, input.assignment_packet)) {
      return hold("EXECUTION_BASIS_MISMATCH");
    }

    const key = claimKey(input.task_packet);
    const boundClaim = idempotencyKeys.get(input.idempotency_key);
    if (boundClaim !== undefined && boundClaim !== key) return hold("IDEMPOTENCY_KEY_CONFLICT");
    const packetFingerprint = stableStringify({
      candidate_packet: input.candidate_packet,
      task_packet: input.task_packet,
      assignment_packet: input.assignment_packet,
    });
    let claimRecord = claims.get(key);
    if (claimRecord !== undefined) {
      if (claimRecord.packet_fingerprint !== packetFingerprint) return hold("CLAIM_REPLAY_CONFLICT");
      const latestReceipt = claimRecord.latest_receipt_id === null
        ? null : receipts.get(claimRecord.latest_receipt_id);
      if (successorReceiptId === null) {
        idempotencyKeys.set(input.idempotency_key, key);
        const latestRun = runs.get(claimRecord.latest_run_id);
        return deepFreeze({
          status: "NO_OP",
          replayed: true,
          agent_run: latestRun ? publicRun(latestRun) : null,
          execution_receipt: latestReceipt ?? null,
        });
      }
      if (!latestReceipt || latestReceipt.receipt_id !== successorReceiptId) {
        return hold("SUCCESSOR_RECEIPT_MISMATCH");
      }
      if (!["waiting", "hold"].includes(latestReceipt.outcome)) {
        return hold("SUCCESSOR_NOT_ALLOWED");
      }
    } else if (successorReceiptId !== null) {
      return hold("SUCCESSOR_RECEIPT_MISMATCH");
    }

    if (decomposedParents.has(key)) return hold("PARENT_COVERAGE_DECOMPOSED");
    const binding = input.assignment_packet.performer_binding;
    const executor = executors.get(binding.executor_ref);
    if (typeof executor?.execute !== "function") return hold("EXECUTOR_UNAVAILABLE");
    if (activeSlots.has(binding.performing_agent_id)) {
      return hold("PERFORMING_AGENT_SLOT_BUSY");
    }
    const coverageHold = reserveCoverage(input.task_packet, input.assignment_packet, key);
    if (coverageHold) return coverageHold;

    if (claimRecord === undefined) {
      claimRecord = {
        packet_fingerprint: packetFingerprint,
        latest_run_id: null,
        latest_receipt_id: null,
        attempt_count: 0,
      };
      claims.set(key, claimRecord);
    }
    idempotencyKeys.set(input.idempotency_key, key);
    claimRecord.attempt_count += 1;
    const epoch = (agentEpochs.get(binding.performing_agent_id) ?? 0) + 1;
    agentEpochs.set(binding.performing_agent_id, epoch);
    const run = {
      run_id: nextRunId(),
      claim_key: key,
      claim: claimOf(input.task_packet),
      authority_ref: input.task_packet.authority_ref,
      assignment_policy_revision_ref: structuredClone(input.assignment_packet.policy_revision_ref),
      attribution: attributionOf(input.assignment_packet),
      attempt_no: claimRecord.attempt_count,
      fencing_epoch: epoch,
      status: "running",
      receipt_id: null,
    };
    runs.set(run.run_id, run);
    claimRecord.latest_run_id = run.run_id;
    activeSlots.set(binding.performing_agent_id, {
      run_id: run.run_id,
      fencing_epoch: epoch,
    });

    const executorInput = deepFreeze({
      operation_id: run.run_id,
      fencing_epoch: epoch,
      attempt_no: run.attempt_no,
      claim: structuredClone(run.claim),
      task_packet: structuredClone(input.task_packet),
      assignment_packet: structuredClone(input.assignment_packet),
    });
    let rawOutcome;
    try {
      rawOutcome = await executor.execute(executorInput);
    } catch {
      return settle(run, epoch, {
        status: "hold",
        reason_code: "ADAPTER_CRASHED",
        result_ref: null,
        artifact_refs: [],
        evidence_refs: [],
      });
    }
    const normalized = normalizeOutcome(rawOutcome);
    return settle(run, epoch, normalized ?? {
      status: "hold",
      reason_code: "EXECUTOR_OUTCOME_INVALID",
      result_ref: null,
      artifact_refs: [],
      evidence_refs: [],
    });
  }

  function holdRun(rawInput) {
    if (!featureEnabled) return hold("FEATURE_OFF");
    const input = snapshot(rawInput);
    if (!input || metadataViolation(input)) return hold("PACKET_METADATA_ONLY_REQUIRED");
    if (!exactKeys(input, ["run_id", "fencing_epoch", "reason_code", "evidence_refs"])
      || !isSafeId(input.run_id) || !Number.isSafeInteger(input.fencing_epoch)
      || input.fencing_epoch < 1 || !REASON_CODE.test(input.reason_code)
      || !isIdList(input.evidence_refs, { allowEmpty: true })) return hold("HOLD_PACKET_INVALID");
    const run = runs.get(input.run_id);
    if (!run) return hold("UNKNOWN_RUN");
    return settle(run, input.fencing_epoch, {
      status: "hold",
      reason_code: input.reason_code,
      result_ref: null,
      artifact_refs: [],
      evidence_refs: input.evidence_refs,
    });
  }

  async function recordDecomposition(rawInput) {
    if (!featureEnabled) return hold("FEATURE_OFF");
    const input = snapshot(rawInput);
    if (!input || metadataViolation(input)) return hold("PACKET_METADATA_ONLY_REQUIRED");
    if (!exactKeys(input, [
      "schema_version", "validation_state", "decomposition_ref", "parent_task_packet",
      "assignment_packet", "children_task_packets",
    ]) || input.schema_version !== DECOMPOSITION_SCHEMA
      || input.validation_state !== "prevalidated" || !isSafeId(input.decomposition_ref)
      || !validTask(input.parent_task_packet) || !validAssignment(input.assignment_packet)
      || !Array.isArray(input.children_task_packets)
      || input.children_task_packets.length === 0
      || input.children_task_packets.length > MAX_LIST
      || !input.children_task_packets.every(validTask)) return hold("DECOMPOSITION_PACKET_INVALID");
    const parent = input.parent_task_packet;
    if (!sameTaskRef(input.assignment_packet.task_ref, parent.task_ref)
      || !sameRevisionRef(input.assignment_packet.work_brief_revision_ref,
        parent.work_brief_revision_ref)
      || input.assignment_packet.action_ref !== parent.action_ref
      || input.assignment_packet.authority_ref !== parent.authority_ref) {
      return hold("EXECUTION_BASIS_MISMATCH");
    }
    const parentKey = claimKey(parent);
    if (claims.has(parentKey)) return hold("PARENT_ALREADY_EXECUTED");

    const material = stableStringify(input);
    const byRef = decompositionsByRef.get(input.decomposition_ref);
    if (byRef !== undefined) {
      return byRef.material === material
        ? deepFreeze({ status: "NO_OP", decomposition_receipt: byRef.receipt })
        : hold("DECOMPOSITION_RECEIPT_CONFLICT");
    }
    const priorParent = decompositionsByParent.get(parentKey);
    if (priorParent !== undefined) {
      return priorParent.material === material
        ? deepFreeze({ status: "NO_OP", decomposition_receipt: priorParent.receipt })
        : hold("DECOMPOSITION_RECEIPT_CONFLICT");
    }

    const parentCustody = parent.parent_task_ref === null
      ? null : childCustodies.get(parentKey);
    if (parent.parent_task_ref !== null) {
      const custodyHold = childCustodyHold(parent, input.assignment_packet, parentKey);
      if (custodyHold) return custodyHold;
    }

    const childKeys = new Set();
    const childTaskIds = new Set();
    const assignedCoverage = new Set();
    for (const child of input.children_task_packets) {
      const childKey = claimKey(child);
      if (!sameTaskRef(child.parent_task_ref, parent.task_ref)) return hold("CHILD_PARENT_MISMATCH");
      if (child.authority_ref !== parent.authority_ref) return hold("CHILD_AUTHORITY_MISMATCH");
      if (childKeys.has(childKey) || childTaskIds.has(taskIdentity(child))) {
        return hold("DUPLICATE_CHILD_CLAIM");
      }
      childKeys.add(childKey);
      childTaskIds.add(taskIdentity(child));
      for (const coverageRef of child.coverage_refs) {
        if (assignedCoverage.has(coverageRef)) return hold("SIBLING_COVERAGE_OVERLAP");
        assignedCoverage.add(coverageRef);
      }
    }
    if (assignedCoverage.size !== parent.coverage_refs.length
      || parent.coverage_refs.some((coverageRef) => !assignedCoverage.has(coverageRef))) {
      return hold("DECOMPOSITION_COVERAGE_NOT_EXACT");
    }

    const currentOwners = parent.coverage_refs.map((coverageRef) => coverageOwners.get(coverageRef));
    if (parent.parent_task_ref === null) {
      if (currentOwners.some((owner) => owner !== undefined && owner.claim_key !== parentKey)) {
        return hold("COVERAGE_CUSTODY_CONFLICT");
      }
    } else if (!currentOwners.every((owner) => owner?.claim_key === parentKey)) {
      return hold("COVERAGE_CUSTODY_CONFLICT");
    }

    const decompositionReceiptId = `decomposition-receipt-${String(receiptSequence + 1)
      .padStart(6, "0")}`;
    const childLineage = deepFreeze({
      decomposition_ref: input.decomposition_ref,
      decomposition_receipt_id: decompositionReceiptId,
      parent_claim: claimOf(parent),
      parent_custody_fingerprint: parentCustody?.fingerprint ?? null,
    });
    const childCustodyRows = input.children_task_packets.map((child) => ({
      childKey: claimKey(child),
      fingerprint: custodyFingerprint(child, input.assignment_packet, childLineage),
      lineage: childLineage,
    }));
    for (const custody of childCustodyRows) {
      const existingCustody = childCustodies.get(custody.childKey);
      if (existingCustody !== undefined && existingCustody.fingerprint !== custody.fingerprint) {
        return hold("CUSTODY_FINGERPRINT_MISMATCH");
      }
    }
    const receiptId = nextReceiptId("decomposition-receipt");
    for (let index = 0; index < input.children_task_packets.length; index += 1) {
      const child = input.children_task_packets[index];
      const custody = childCustodyRows[index];
      childCustodies.set(custody.childKey, {
        fingerprint: custody.fingerprint,
        lineage: custody.lineage,
      });
      for (const coverageRef of child.coverage_refs) {
        coverageOwners.set(coverageRef, {
          claim_key: custody.childKey,
          task_id: child.task_ref.task_id,
        });
      }
    }
    decomposedParents.add(parentKey);
    const receipt = deepFreeze({
      schema_version: DECOMPOSITION_RECEIPT_SCHEMA,
      receipt_id: receiptId,
      receipt_kind: "decomposition",
      decomposition_ref: input.decomposition_ref,
      parent_claim: claimOf(parent),
      child_claims: input.children_task_packets.map((child) => ({
        ...claimOf(child),
        coverage_refs: [...child.coverage_refs],
      })),
      authority_ref: parent.authority_ref,
      attribution: attributionOf(input.assignment_packet),
      official_task_done: false,
      official_task_mutated: false,
      external_effects: {
        linear_writes: 0,
        network_calls: 0,
        filesystem_writes: 0,
        shell_commands: 0,
      },
    });
    const entry = { material, receipt };
    decompositionsByRef.set(input.decomposition_ref, entry);
    decompositionsByParent.set(parentKey, entry);
    return deepFreeze({ status: "RECORDED", decomposition_receipt: receipt });
  }

  function inspect() {
    const runRows = [...runs.values()].map(publicRun)
      .sort((left, right) => left.run_id.localeCompare(right.run_id));
    const receiptRows = [...receipts.values()]
      .sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
    const decompositionRows = [...decompositionsByRef.values()].map((entry) => entry.receipt)
      .sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
    const slotRows = [...activeSlots.entries()].map(([performingAgentId, slot]) => ({
      performing_agent_id: performingAgentId,
      run_id: slot.run_id,
      fencing_epoch: slot.fencing_epoch,
    })).sort((left, right) => left.performing_agent_id.localeCompare(right.performing_agent_id));
    const custodyRows = [...coverageOwners.entries()].map(([coverageRef, owner]) => ({
      coverage_ref: coverageRef,
      task_id: owner.task_id,
    })).sort((left, right) => left.coverage_ref.localeCompare(right.coverage_ref));
    return deepFreeze({
      feature_enabled: featureEnabled,
      agent_runs: runRows,
      execution_receipts: receiptRows,
      decomposition_receipts: decompositionRows,
      active_slots: slotRows,
      coverage_custody: custodyRows,
      external_effects: {
        linear_writes: 0,
        network_calls: 0,
        filesystem_writes: 0,
        shell_commands: 0,
      },
      official_task_done_count: 0,
    });
  }

  return Object.freeze({ dispatch, recordDecomposition, holdRun, inspect });
}
