/**
 * Secret-free transport boundary for AI work result recovery.
 *
 * The adapter never accepts a remote URL, user information, or credentials.
 * A trusted caller binds a logical remote/ref and an opaque authority
 * fingerprint to an injected synchronous executor.
 */
import {
  DIGEST_RE,
  PUBLIC_COMMIT_RE,
  exactKeys,
} from "./five_field_recovery_contract.mjs";

export const TRANSPORT_BINDING_SCHEMA =
  "soulforge.five_field_transport_binding.v1";

const REF_RE = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;
const TOKEN_RE = /^[a-z0-9][a-z0-9._-]{0,119}$/u;
const TRANSPORT_CLASSES = new Set(["local_file", "https", "ssh"]);

class TransportAdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = "TransportAdapterError";
    this.code = code;
  }
}

function fail(code) {
  throw new TransportAdapterError(code);
}

function assertBinding(binding) {
  if (!exactKeys(binding, [
    "schema_version",
    "logical_remote",
    "ref",
    "transport_class",
    "authority_fingerprint",
  ])) fail("transport_binding_contract_invalid");
  if (binding.schema_version !== TRANSPORT_BINDING_SCHEMA) {
    fail("transport_binding_schema_mismatch");
  }
  if (
    typeof binding.logical_remote !== "string"
    || !TOKEN_RE.test(binding.logical_remote)
  ) fail("transport_logical_remote_invalid");
  if (typeof binding.ref !== "string" || !REF_RE.test(binding.ref)) {
    fail("transport_ref_invalid");
  }
  if (!TRANSPORT_CLASSES.has(binding.transport_class)) {
    fail("transport_class_invalid");
  }
  if (
    typeof binding.authority_fingerprint !== "string"
    || !DIGEST_RE.test(binding.authority_fingerprint)
  ) fail("transport_authority_fingerprint_invalid");
}

function request(binding, operation, commit) {
  const value = {
    schema_version: TRANSPORT_BINDING_SCHEMA,
    operation,
    logical_remote: binding.logical_remote,
    ref: binding.ref,
    transport_class: binding.transport_class,
    authority_fingerprint: binding.authority_fingerprint,
  };
  if (commit !== undefined) value.commit = commit;
  return Object.freeze(value);
}

function callExecutor(executor, value) {
  let result;
  try {
    result = executor(value);
  } catch {
    fail("transport_executor_failed");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail("transport_executor_result_invalid");
  }
  return result;
}

function assertSha(value, code) {
  if (typeof value !== "string" || !PUBLIC_COMMIT_RE.test(value)) fail(code);
  return value;
}

export function validateTransportBinding(binding) {
  assertBinding(binding);
  return Object.freeze({ ...binding });
}

export function createTransportAdapter(binding, executor) {
  const validated = validateTransportBinding(binding);
  if (typeof executor !== "function") fail("transport_executor_required");
  let authorityBindingVerified = false;

  function verifyAuthority(result) {
    if (result.authority_binding_verified !== true) {
      fail("transport_authority_not_verified");
    }
    authorityBindingVerified = true;
  }

  return Object.freeze({
    binding: validated,

    fetchFreshTip() {
      const result = callExecutor(
        executor,
        request(validated, "fetch_fresh_tip"),
      );
      if (
        !exactKeys(result, ["status", "tip", "authority_binding_verified"])
        || result.status !== "OK"
      ) {
        fail("transport_fetch_result_invalid");
      }
      verifyAuthority(result);
      return assertSha(result.tip, "transport_fetch_tip_invalid");
    },

    pushCommit(commit) {
      assertSha(commit, "transport_push_commit_invalid");
      const result = callExecutor(
        executor,
        request(validated, "push_commit", commit),
      );
      if (
        !exactKeys(result, ["status", "authority_binding_verified"])
        || ![
          "PUSHED",
          "REJECTED_NON_FAST_FORWARD",
          "UNKNOWN_AFTER_PUSH",
        ].includes(result.status)
      ) fail("transport_push_result_invalid");
      verifyAuthority(result);
      return result.status;
    },

    verifyInclusion(commit) {
      assertSha(commit, "transport_inclusion_commit_invalid");
      const result = callExecutor(
        executor,
        request(validated, "verify_inclusion", commit),
      );
      if (
        !exactKeys(result, ["status", "tip", "authority_binding_verified"])
        || !["INCLUDED", "NOT_INCLUDED", "UNKNOWN_AFTER_PUSH"].includes(
          result.status,
        )
      ) fail("transport_inclusion_result_invalid");
      verifyAuthority(result);
      return Object.freeze({
        status: result.status,
        tip: assertSha(result.tip, "transport_inclusion_tip_invalid"),
      });
    },

    receiptEvidence() {
      return Object.freeze({
        transport_class: validated.transport_class,
        authority_binding_verified: authorityBindingVerified,
      });
    },
  });
}
