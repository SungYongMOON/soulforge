import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  WRITER_AUTHORITY_ABSENT_DIGEST,
  inspectWriterAuthority,
  transitionWriterAuthority,
} from "./writer_authority.mjs";
import {
  WRITER_AUTHORITY_RENEWAL_POLICY_FILE,
  WRITER_AUTHORITY_RENEWAL_POLICY_SCHEMA,
  planWriterAuthorityRenewal,
  runWriterAuthorityRenewal,
  validateWriterAuthorityRenewalPolicy,
} from "./writer_authority_renewal.mjs";

const NOW = Date.parse("2026-08-20T00:00:00.000Z");
const BINDING_DIGEST = `sha256:${"b".repeat(64)}`;
const PRIMARY = "hpp-primary-test";
const FALLBACK = "hpp-fallback-test";

function policy(overrides = {}) {
  return {
    schema_version: WRITER_AUTHORITY_RENEWAL_POLICY_SCHEMA,
    enabled: true,
    expected_binding_digest: BINDING_DIGEST,
    expected_authority_id: "task-engine-hpp-production-ingress",
    expected_authority_scope: "raw_ingress_custody_only",
    expected_primary_node_id: PRIMARY,
    expected_fallback_node_id: FALLBACK,
    renew_before_seconds: 72 * 3_600,
    validity_seconds: 30 * 24 * 3_600,
    policy_expires_at: "2027-02-20T00:00:00.000Z",
    owner_approval_ref: "owner-approval://synthetic/conditional-renewal",
    ...overrides,
  };
}

async function authorityFixture(
  expiresAt = "2026-08-22T00:00:00.000Z",
  authorityNow = NOW,
  notBefore = "2026-08-19T00:00:00.000Z",
) {
  const root = await mkdtemp(path.join(tmpdir(), "writer-authority-renewal-"));
  const recordPath = path.join(root, "authority.json");
  const initialized = await transitionWriterAuthority({
    stateRoot: root,
    recordPath,
    action: "initialize",
    primaryNodeId: PRIMARY,
    fallbackNodeId: FALLBACK,
    expectedCurrentEpoch: 0,
    expectedCurrentDigest: WRITER_AUTHORITY_ABSENT_DIGEST,
    expectedNodeId: PRIMARY,
    notBefore,
    expiresAt,
    ownerApprovalRef: "owner-approval://synthetic/initialize",
    now: authorityNow,
    apply: true,
  });
  await transitionWriterAuthority({
    stateRoot: root,
    recordPath,
    action: "promote",
    targetMode: "primary",
    targetNodeId: PRIMARY,
    expectedCurrentEpoch: initialized.epoch,
    expectedCurrentDigest: initialized.authority_digest,
    expectedNodeId: initialized.node_id,
    notBefore,
    expiresAt,
    ownerApprovalRef: "owner-approval://synthetic/promote",
    now: authorityNow,
    apply: true,
  });
  const bindingPath = path.join(root, "continuous-binding.json");
  await writeFile(path.join(root, WRITER_AUTHORITY_RENEWAL_POLICY_FILE), `${JSON.stringify(policy())}\n`, "utf8");
  return { root, recordPath, bindingPath };
}

test("policy validation is exact and bounded", () => {
  assert.equal(validateWriterAuthorityRenewalPolicy(policy()).renew_before_seconds, 259_200);
  for (const value of [
    { ...policy(), raw: true },
    policy({ expected_binding_digest: "bad" }),
    policy({ renew_before_seconds: 60 }),
    policy({ validity_seconds: 365 * 24 * 3_600 }),
    policy({ policy_expires_at: "not-a-time" }),
  ]) assert.throws(() => validateWriterAuthorityRenewalPolicy(value), /writer_authority_renewal_policy_invalid/u);
});

test("planner distinguishes disabled, not-due, due, and drift", () => {
  const authority = {
    authority_id: "task-engine-hpp-production-ingress",
    authority_scope: "raw_ingress_custody_only",
    primary_node_id: PRIMARY,
    fallback_node_id: FALLBACK,
    node_id: PRIMARY,
    mode: "primary",
    lanes: ["mail", "voice", "structured_pc_work", "team_files", "run_logs"],
    expires_at: "2026-08-30T00:00:00.000Z",
  };
  assert.equal(planWriterAuthorityRenewal({ policy: null, authority, bindingDigest: BINDING_DIGEST, nowMs: NOW }).status, "disabled");
  assert.equal(planWriterAuthorityRenewal({ policy: policy({ enabled: false }), authority, bindingDigest: BINDING_DIGEST, nowMs: NOW }).status, "disabled");
  assert.equal(planWriterAuthorityRenewal({ policy: policy(), authority, bindingDigest: BINDING_DIGEST, nowMs: NOW }).status, "not_due");
  assert.equal(planWriterAuthorityRenewal({ policy: policy(), authority: { ...authority, expires_at: "2026-08-22T00:00:00.000Z" }, bindingDigest: BINDING_DIGEST, nowMs: NOW }).status, "due");
  assert.throws(() => planWriterAuthorityRenewal({ policy: policy(), authority, bindingDigest: `sha256:${"c".repeat(64)}`, nowMs: NOW }), /writer_authority_renewal_binding_drift/u);
  assert.throws(() => planWriterAuthorityRenewal({ policy: policy(), authority: { ...authority, node_id: FALLBACK }, bindingDigest: BINDING_DIGEST, nowMs: NOW }), /writer_authority_renewal_authority_drift/u);
});

test("due policy renews the same primary writer atomically for thirty days", async () => {
  const f = await authorityFixture();
  try {
    const before = await inspectWriterAuthority({ stateRoot: f.root, recordPath: f.recordPath });
    const result = await runWriterAuthorityRenewal({
      bindingPath: f.bindingPath,
      bindingDigest: BINDING_DIGEST,
      binding: { writerAuthorityRecordPath: f.recordPath },
      now: () => NOW,
    });
    const after = await inspectWriterAuthority({ stateRoot: f.root, recordPath: f.recordPath });
    assert.equal(result.status, "renewed");
    assert.equal(result.renewed, true);
    assert.equal(after.epoch, before.epoch + 1);
    assert.equal(after.mode, "primary");
    assert.equal(after.node_id, PRIMARY);
    assert.equal(after.expires_at, "2026-09-19T00:00:00.000Z");
    assert.equal(after.transition, undefined);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("expired primary authority renews once after downtime and immediate replay is not due", async () => {
  const f = await authorityFixture(
    "2026-08-19T00:00:00.000Z",
    Date.parse("2026-08-18T00:00:00.000Z"),
    "2026-08-17T00:00:00.000Z",
  );
  try {
    const first = await runWriterAuthorityRenewal({
      bindingPath: f.bindingPath,
      bindingDigest: BINDING_DIGEST,
      binding: { writerAuthorityRecordPath: f.recordPath },
      now: () => NOW,
    });
    assert.equal(first.status, "renewed");
    const second = await runWriterAuthorityRenewal({
      bindingPath: f.bindingPath,
      bindingDigest: BINDING_DIGEST,
      binding: { writerAuthorityRecordPath: f.recordPath },
      now: () => NOW + 1,
    });
    assert.equal(second.status, "not_due");
    assert.equal(second.renewed, false);
    assert.equal(second.epoch, first.epoch);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing policy is disabled and expired policy fails closed", async () => {
  const f = await authorityFixture();
  try {
    const disabled = await runWriterAuthorityRenewal({
      bindingPath: f.bindingPath,
      bindingDigest: BINDING_DIGEST,
      binding: { writerAuthorityRecordPath: f.recordPath },
      readPolicy: async () => null,
      now: () => NOW,
    });
    assert.deepEqual(disabled, {
      schema_version: "soulforge.ingress.writer_authority_renewal_result.v1",
      status: "disabled",
      renewed: false,
    });
    await assert.rejects(runWriterAuthorityRenewal({
      bindingPath: f.bindingPath,
      bindingDigest: BINDING_DIGEST,
      binding: { writerAuthorityRecordPath: f.recordPath },
      readPolicy: async () => policy({ policy_expires_at: "2026-08-19T00:00:00.000Z" }),
      now: () => NOW,
    }), { code: "writer_authority_renewal_policy_expired" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("public renewal policy schema is strict and carries the bounded operating window", async () => {
  const schemaPath = fileURLToPath(new URL("./writer_authority_renewal_policy.schema.json", import.meta.url));
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.equal(schema.$id, WRITER_AUTHORITY_RENEWAL_POLICY_SCHEMA);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.renew_before_seconds.maximum, 7 * 24 * 3_600);
  assert.equal(schema.properties.validity_seconds.maximum, 31 * 24 * 3_600);
});
