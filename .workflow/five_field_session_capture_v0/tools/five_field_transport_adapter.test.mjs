import assert from "node:assert/strict";
import test from "node:test";

import {
  TRANSPORT_BINDING_SCHEMA,
  createTransportAdapter,
  validateTransportBinding,
} from "./five_field_transport_adapter.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const FINGERPRINT = `sha256:${"c".repeat(64)}`;

function binding(overrides = {}) {
  return {
    schema_version: TRANSPORT_BINDING_SCHEMA,
    logical_remote: "ledger-authority",
    ref: "refs/heads/main",
    transport_class: "https",
    authority_fingerprint: FINGERPRINT,
    ...overrides,
  };
}

test("transport adapter sends only the exact secret-free binding", () => {
  const requests = [];
  const adapter = createTransportAdapter(binding(), (request) => {
    requests.push(request);
    if (request.operation === "fetch_fresh_tip") {
      return {
        status: "OK",
        tip: SHA_A,
        authority_binding_verified: true,
      };
    }
    if (request.operation === "push_commit") {
      return { status: "PUSHED", authority_binding_verified: true };
    }
    return {
      status: "INCLUDED",
      tip: SHA_B,
      authority_binding_verified: true,
    };
  });

  assert.equal(adapter.fetchFreshTip(), SHA_A);
  assert.equal(adapter.pushCommit(SHA_B), "PUSHED");
  assert.deepEqual(adapter.verifyInclusion(SHA_B), {
    status: "INCLUDED",
    tip: SHA_B,
  });
  assert.deepEqual(adapter.receiptEvidence(), {
    transport_class: "https",
    authority_binding_verified: true,
  });

  for (const request of requests) {
    assert.deepEqual(
      Object.keys(request).sort(),
      [
        "authority_fingerprint",
        "logical_remote",
        "operation",
        "ref",
        "schema_version",
        ...(request.operation === "fetch_fresh_tip" ? [] : ["commit"]),
        "transport_class",
      ].sort(),
    );
    assert.doesNotMatch(JSON.stringify(request), /url|credential|userinfo/iu);
  }
});

test("local, HTTPS, and SSH classes use the same injected protocol", () => {
  for (const transportClass of ["local_file", "https", "ssh"]) {
    const adapter = createTransportAdapter(
      binding({ transport_class: transportClass }),
      (request) => request.operation === "fetch_fresh_tip"
        ? { status: "OK", tip: SHA_A, authority_binding_verified: true }
        : request.operation === "push_commit"
          ? {
            status: "REJECTED_NON_FAST_FORWARD",
            authority_binding_verified: true,
          }
          : {
            status: "NOT_INCLUDED",
            tip: SHA_A,
            authority_binding_verified: true,
          },
    );
    assert.equal(adapter.fetchFreshTip(), SHA_A);
    assert.equal(
      adapter.pushCommit(SHA_B),
      "REJECTED_NON_FAST_FORWARD",
    );
    assert.equal(adapter.verifyInclusion(SHA_B).status, "NOT_INCLUDED");
  }
});

test("UNKNOWN_AFTER_PUSH remains distinct from a non-fast-forward rejection", () => {
  const adapter = createTransportAdapter(binding({ transport_class: "ssh" }), (
    request,
  ) => request.operation === "push_commit"
    ? { status: "UNKNOWN_AFTER_PUSH", authority_binding_verified: true }
    : request.operation === "fetch_fresh_tip"
      ? { status: "OK", tip: SHA_A, authority_binding_verified: true }
      : {
        status: "UNKNOWN_AFTER_PUSH",
        tip: SHA_A,
        authority_binding_verified: true,
      });

  assert.equal(adapter.pushCommit(SHA_B), "UNKNOWN_AFTER_PUSH");
  assert.equal(
    adapter.verifyInclusion(SHA_B).status,
    "UNKNOWN_AFTER_PUSH",
  );
});

test("unknown keys, raw URL fields, invalid refs, and malformed fingerprints fail closed", () => {
  for (const value of [
    binding({ remote_url: "https://example.invalid/private" }),
    binding({ logical_remote: "https://example.invalid/private" }),
    binding({ ref: "refs/private/main" }),
    binding({ authority_fingerprint: "not-a-digest" }),
    binding({ transport_class: "network" }),
  ]) {
    assert.throws(
      () => validateTransportBinding(value),
      (error) => typeof error?.code === "string"
        && !JSON.stringify(error).includes("example.invalid"),
    );
  }
});

test("executor outputs are exact-key validated and executor failures are redacted", () => {
  const extra = createTransportAdapter(binding(), () => ({
    status: "OK",
    tip: SHA_A,
    authority_binding_verified: true,
    remote_url: "forbidden",
  }));
  assert.throws(
    () => extra.fetchFreshTip(),
    (error) => error?.code === "transport_fetch_result_invalid",
  );

  const thrown = createTransportAdapter(binding(), () => {
    throw new Error("credential=private");
  });
  assert.throws(
    () => thrown.fetchFreshTip(),
    (error) => error?.code === "transport_executor_failed"
      && !JSON.stringify(error).includes("credential=private"),
  );
});
