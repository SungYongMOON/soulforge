// Bastion action gate — pure in-memory core (program plan 09).
//
// Bastion is the ONLY seam that may execute an approved restart, isolation,
// restore, or rollback. This module pins the validation gate and the receipt
// contract: exact target/policy, a separate human approval record, expiry,
// maintenance-lease condition, and — for restore/rollback — an exact backup
// generation whose isolated-restore proof is caller-asserted. Execution goes
// through a caller-injected executor PORT; only synthetic adapters exist in
// this repository, so no real process, service, or store can be touched.
//
// A receipt reports what the executor DID. It never fabricates health: no
// receipt field can flip a Watch panel to healthy — Watch panels only change
// through fresh evidence under the watch_panel_contract freshness rules.

export const BASTION_ACTION_SCHEMA = "soulforge.bastion_action_gate.v0";

export const REFUSALS = Object.freeze({
  EXPIRED: "refused_request_expired",
  APPROVAL_MISSING: "refused_approval_missing",
  APPROVAL_MISMATCH: "refused_approval_mismatch",
  POLICY_MISMATCH: "refused_policy_mismatch",
  TARGET_MISMATCH: "refused_target_mismatch",
  LEASE_MISSING: "refused_maintenance_lease_missing",
  BACKUP_GENERATION_MISSING: "refused_backup_generation_missing",
  RESTORE_PROOF_MISSING: "refused_isolated_restore_proof_missing",
  ACTION_KIND_INVALID: "refused_action_kind_invalid",
  EXECUTOR_FAILURE: "failed_executor_failure",
});

const ACTION_KINDS = Object.freeze(["restart", "isolate", "restore", "rollback"]);
const RECOVERY_KINDS = Object.freeze(["restore", "rollback"]);

const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value)) fail("ref_invalid", field);
  return value;
}

function assertClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("clock_invalid", field);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export function createBastionActionGate({ executor } = {}) {
  if (!executor || typeof executor.execute !== "function") fail("executor_port_required");
  const receipts = new Map(); // request_id -> receipt (terminal, idempotent)

  function refuse(request, code) {
    const receipt = deepFreeze({
      schema: BASTION_ACTION_SCHEMA,
      receipt_ref: `bastion.refusal:${request.request_id}`,
      request_id: request.request_id,
      action_kind: request.action_kind,
      target_ref: request.target_ref,
      outcome: "refused",
      refusal_code: code,
    });
    receipts.set(request.request_id, receipt);
    return receipt;
  }

  return Object.freeze({
    schema: BASTION_ACTION_SCHEMA,

    // Validate one filed Watch request against the separately supplied
    // authority context, then execute through the port or refuse.
    // The receipt is terminal per request_id; replay returns it verbatim.
    async validateAndExecute(request, context) {
      const requestId = assertRef(request?.request_id, "request_id");
      if (receipts.has(requestId)) {
        return deepFreeze({ replay: true, ...receipts.get(requestId) });
      }
      assertRef(request.target_ref, "target_ref");
      assertRef(request.policy_ref, "policy_ref");
      assertClock(request.expires_at, "expires_at");
      const now = assertClock(context?.now, "context.now");

      if (!ACTION_KINDS.includes(request.action_kind)) return refuse(request, REFUSALS.ACTION_KIND_INVALID);
      if (Date.parse(now) >= Date.parse(request.expires_at)) return refuse(request, REFUSALS.EXPIRED);

      const approval = context.approval ?? null;
      if (!approval) return refuse(request, REFUSALS.APPROVAL_MISSING);
      assertRef(approval.approval_ref, "approval.approval_ref");
      assertRef(approval.authority_ref, "approval.authority_ref");
      if (approval.request_id !== requestId) return refuse(request, REFUSALS.APPROVAL_MISMATCH);

      const policy = context.policy ?? null;
      if (!policy || policy.policy_ref !== request.policy_ref) return refuse(request, REFUSALS.POLICY_MISMATCH);
      if (!Array.isArray(policy.allowed_targets) || !policy.allowed_targets.includes(request.target_ref)) {
        return refuse(request, REFUSALS.TARGET_MISMATCH);
      }
      if (!Array.isArray(policy.allowed_actions) || !policy.allowed_actions.includes(request.action_kind)) {
        return refuse(request, REFUSALS.POLICY_MISMATCH);
      }

      if (policy.requires_maintenance_lease !== undefined
        && typeof policy.requires_maintenance_lease !== "boolean") {
        fail("policy_shape_invalid", "requires_maintenance_lease");
      }
      if (policy.requires_maintenance_lease === true) {
        const lease = context.maintenance_lease ?? null;
        if (!lease || lease.target_ref !== request.target_ref
          || Date.parse(now) >= Date.parse(assertClock(lease.expires_at, "maintenance_lease.expires_at"))) {
          return refuse(request, REFUSALS.LEASE_MISSING);
        }
      }

      if (RECOVERY_KINDS.includes(request.action_kind)) {
        const generation = context.backup_generation ?? null;
        if (!generation) return refuse(request, REFUSALS.BACKUP_GENERATION_MISSING);
        assertRef(generation.generation_ref, "backup_generation.generation_ref");
        if (generation.isolated_restore_proof_ref == null) {
          return refuse(request, REFUSALS.RESTORE_PROOF_MISSING);
        }
        assertRef(generation.isolated_restore_proof_ref, "backup_generation.isolated_restore_proof_ref");
      }

      // Double-execution guard: once the port is touched, this request_id is
      // terminal no matter what. A throwing or malformed executor yields a
      // terminal FAILED receipt (never re-executed on retry); investigating
      // and re-attempting requires a new approved request. The real executor
      // adapter MUST additionally be idempotent by request_id, because a
      // crash between the port call and this record cannot be observed here.
      let executed;
      try {
        executed = await executor.execute({
          request_id: requestId,
          action_kind: request.action_kind,
          target_ref: request.target_ref,
          policy_ref: request.policy_ref,
          backup_generation_ref: RECOVERY_KINDS.includes(request.action_kind)
            ? context.backup_generation.generation_ref : null,
        });
        assertRef(executed?.receipt_ref, "executor.receipt_ref");
        assertRef(executed?.executor_ref, "executor.executor_ref");
      } catch {
        const failedReceipt = deepFreeze({
          schema: BASTION_ACTION_SCHEMA,
          receipt_ref: `bastion.failed:${requestId}`,
          request_id: requestId,
          action_kind: request.action_kind,
          target_ref: request.target_ref,
          outcome: "failed",
          refusal_code: REFUSALS.EXECUTOR_FAILURE,
        });
        receipts.set(requestId, failedReceipt);
        return failedReceipt;
      }
      const receipt = deepFreeze({
        schema: BASTION_ACTION_SCHEMA,
        receipt_ref: executed.receipt_ref,
        request_id: requestId,
        action_kind: request.action_kind,
        target_ref: request.target_ref,
        outcome: "executed",
        executor_ref: executed.executor_ref,
        approval_ref: approval.approval_ref,
      });
      receipts.set(requestId, receipt);
      return receipt;
    },

    getReceipt(requestId) {
      return receipts.get(assertRef(requestId, "request_id")) ?? null;
    },
  });
}

// Contract guard shared with Watch: a receipt carries NO health vocabulary,
// so it can never impersonate fresh evidence.
export function receiptCarriesNoHealthClaim(receipt) {
  const banned = ["state", "health", "healthy", "green", "status_text", "panel"];
  const offending = Object.keys(receipt ?? {}).filter((key) => {
    const lowered = key.toLowerCase();
    return banned.some((word) => lowered === word || lowered.startsWith(`${word}_`) || lowered.endsWith(`_${word}`));
  });
  return { ok: offending.length === 0, offending };
}
