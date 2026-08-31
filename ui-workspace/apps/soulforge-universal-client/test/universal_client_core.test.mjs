import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIENT_SESSION_SCHEMA,
  CLIENT_STATUS,
  projectUniversalClient,
} from "../src/core/universal_client_core.mjs";

const NOW = "2026-09-01T00:00:00.000Z";

function session(overrides = {}) {
  return {
    schema_version: CLIENT_SESSION_SCHEMA,
    actor_ref: "actor.owner",
    account_ref: "account.owner",
    device_ref: "device.owner-pc",
    agent_ref: null,
    project_scopes: ["project.alpha"],
    capabilities: [
      "assignment.read",
      "material.read",
      "submission.create",
      "buzz.collaborate",
      "operations.read",
      "authority.request",
    ],
    expires_at: "2026-09-01T04:00:00.000Z",
    revoked: false,
    policy_revision: "policy.client.v1",
    client_release_range: ">=0.1.0 <1.0.0",
    device_posture_state: "accepted",
    ...overrides,
  };
}

test("the same client policy projects Owner and member menus only from server capabilities", () => {
  const owner = projectUniversalClient({ session: session(), now: NOW });
  const member = projectUniversalClient({
    session: session({
      actor_ref: "actor.member",
      account_ref: "account.member",
      device_ref: "device.member-pc",
      capabilities: ["assignment.read", "material.read", "submission.create", "buzz.collaborate"],
    }),
    now: NOW,
  });
  assert.equal(owner.status, CLIENT_STATUS.READY);
  assert.equal(member.status, CLIENT_STATUS.READY);
  assert.equal(owner.binary_policy_digest, member.binary_policy_digest);
  assert.equal(owner.routes.find((row) => row.route_id === "operations")?.enabled, true);
  assert.equal(member.routes.find((row) => row.route_id === "operations")?.enabled, false);
  assert.equal(member.routes.find((row) => row.route_id === "assignments")?.enabled, true);
});

test("three virtual seats share one binary policy while scopes, capabilities, and revoke remain isolated", () => {
  const owner = projectUniversalClient({ session: session(), now: NOW });
  const kvdsMember = projectUniversalClient({
    session: session({
      actor_ref: "actor.kvds-member",
      account_ref: "account.kvds-member",
      device_ref: "device.kvds-pc",
      project_scopes: ["project.kvds"],
      capabilities: ["assignment.read", "material.read", "submission.create", "buzz.collaborate"],
    }),
    now: NOW,
  });
  const revokedMember = projectUniversalClient({
    session: session({
      actor_ref: "actor.revoked-member",
      account_ref: "account.revoked-member",
      device_ref: "device.revoked-pc",
      project_scopes: ["project.msh"],
      capabilities: ["assignment.read", "material.read", "submission.create", "buzz.collaborate"],
      revoked: true,
    }),
    now: NOW,
  });

  assert.equal(owner.binary_policy_digest, kvdsMember.binary_policy_digest);
  assert.equal(kvdsMember.binary_policy_digest, revokedMember.binary_policy_digest);
  assert.deepEqual(kvdsMember.project_scopes, ["project.kvds"]);
  assert.equal(kvdsMember.routes.find((row) => row.route_id === "assignments")?.enabled, true);
  assert.equal(kvdsMember.routes.find((row) => row.route_id === "operations")?.enabled, false);
  assert.equal(revokedMember.status, CLIENT_STATUS.HOLD);
  assert.equal(revokedMember.routes.every((row) => row.enabled === false), true);
  assert.equal(owner.status, CLIENT_STATUS.READY);
  assert.equal(kvdsMember.status, CLIENT_STATUS.READY);
});

test("revoked, expired, or rejected devices fail closed without inventing authority", () => {
  for (const candidate of [
    session({ revoked: true }),
    session({ expires_at: NOW }),
    session({ device_posture_state: "rejected" }),
  ]) {
    const result = projectUniversalClient({ session: candidate, now: NOW });
    assert.equal(result.status, CLIENT_STATUS.HOLD);
    assert.equal(result.routes.every((row) => row.enabled === false), true);
    assert.equal(result.authority_granted, false);
  }
});

test("unknown fields, wildcard scopes, raw content, and local-role elevation are rejected", () => {
  assert.throws(() => projectUniversalClient({ session: { ...session(), role: "owner" }, now: NOW }), /session_fields_invalid/u);
  assert.throws(() => projectUniversalClient({ session: session({ project_scopes: ["*"] }), now: NOW }), /project_scope_invalid/u);
  assert.throws(() => projectUniversalClient({ session: session({ raw_payload: "x" }), now: NOW }), /session_fields_invalid/u);
  assert.throws(() => projectUniversalClient({ session: session({ capabilities: ["authority.*"] }), now: NOW }), /capability_invalid/u);
});

test("projection is deterministic, deeply frozen, and contains no writer or secret material", () => {
  const first = projectUniversalClient({ session: session(), now: NOW });
  const second = projectUniversalClient({ session: session(), now: NOW });
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.routes), true);
  assert.equal(first.authority_granted, false);
  assert.equal(JSON.stringify(first).includes("secret"), false);
  assert.equal(JSON.stringify(first).includes("token"), false);
});
