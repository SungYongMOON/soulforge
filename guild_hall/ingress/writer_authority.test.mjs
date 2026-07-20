import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  WRITER_AUTHORITY_ABSENT_DIGEST,
  WRITER_AUTHORITY_CAS_LOCK_SCHEMA,
  WRITER_AUTHORITY_CAS_LOCK_TTL_MS,
  WRITER_AUTHORITY_LANES,
  WRITER_AUTHORITY_SCHEMA,
  WRITER_AUTHORITY_SCOPE,
  acquireWriterLease,
  transitionWriterAuthority,
  validateWriterLease,
} from "./writer_authority.mjs";

const execFile = promisify(execFileCallback);
const CLI = fileURLToPath(new URL("./writer_authority_cli.mjs", import.meta.url));
const NOW = Date.parse("2026-07-20T00:00:00.000Z");
const NOT_BEFORE = "2026-07-20T00:00:00.000Z";
const EXPIRES_AT = "2099-07-20T00:00:00.000Z";
const HPP = "hpp-always-on-synthetic";
const MAC = "mac-emergency-synthetic";

async function fixture(name = "writer-authority-") {
  const root = await mkdtemp(join(tmpdir(), name));
  return { root, recordPath: join(root, "authority.json") };
}

function common(f, overrides = {}) {
  return {
    stateRoot: f.root,
    recordPath: f.recordPath,
    notBefore: NOT_BEFORE,
    expiresAt: EXPIRES_AT,
    ownerApprovalRef: "owner-approval://synthetic/writer-authority",
    now: NOW,
    ...overrides,
  };
}

async function initialize(f, overrides = {}) {
  return transitionWriterAuthority(common(f, {
    action: "initialize",
    primaryNodeId: HPP,
    fallbackNodeId: MAC,
    expectedCurrentEpoch: 0,
    expectedCurrentDigest: WRITER_AUTHORITY_ABSENT_DIGEST,
    expectedNodeId: HPP,
    apply: true,
    ...overrides,
  }));
}

async function transition(f, current, overrides) {
  return transitionWriterAuthority(common(f, {
    expectedCurrentEpoch: current.epoch,
    expectedCurrentDigest: current.authority_digest,
    expectedNodeId: current.node_id,
    apply: true,
    ...overrides,
  }));
}

function leaseOptions(f, overrides = {}) {
  return {
    stateRoot: f.root,
    recordPath: f.recordPath,
    nodeId: HPP,
    lane: "mail",
    mode: "primary",
    now: NOW + 1,
    ...overrides,
  };
}

async function missing(path) {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function waitForReady(child) {
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await new Promise((resolveReady, rejectReady) => {
    const onData = (chunk) => {
      stdout += chunk.toString();
      if (!stdout.includes("READY\n")) return;
      cleanup();
      resolveReady();
    };
    const onExit = (code, signal) => {
      cleanup();
      rejectReady(new Error(`paused child exited before ready: ${code ?? signal}; ${stderr}`));
    };
    const cleanup = () => {
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

async function spawnPausedAuthorityTransition(options, hookName) {
  const moduleUrl = new URL("./writer_authority.mjs", import.meta.url).href;
  const script = `
    import { transitionWriterAuthority } from ${JSON.stringify(moduleUrl)};
    const hookName = ${JSON.stringify(hookName)};
    await transitionWriterAuthority({
      ...${JSON.stringify(options)},
      testHooks: {
        [hookName]: async () => {
          process.stdout.write("READY\\n");
          await new Promise(() => { setInterval(() => {}, 1_000); });
        },
      },
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(child);
  return child;
}

test("feature-OFF initialization is dry-run by default and apply requires exact CAS expectations", async () => {
  const f = await fixture();
  try {
    const plan = await transitionWriterAuthority(common(f, {
      action: "initialize",
      primaryNodeId: HPP,
      fallbackNodeId: MAC,
    }));
    assert.equal(plan.operation_mode, "dry_run");
    assert.equal(plan.status, "planned");
    assert.equal(plan.authority_mode, "off");
    assert.equal(plan.epoch, 1);
    assert.deepEqual(plan.lanes, WRITER_AUTHORITY_LANES);
    assert.equal(plan.expected_current_digest, WRITER_AUTHORITY_ABSENT_DIGEST);
    assert.equal(await missing(f.recordPath), true);

    await assert.rejects(
      transitionWriterAuthority(common(f, {
        action: "initialize",
        primaryNodeId: HPP,
        fallbackNodeId: MAC,
        apply: true,
      })),
      { code: "writer_authority_cas_expectation_required" },
    );

    const applied = await initialize(f);
    assert.equal(applied.status, "updated");
    assert.equal(applied.authority_mode, "off");
    assert.equal(applied.writes_performed, 1);
    const stored = JSON.parse(await readFile(f.recordPath, "utf8"));
    assert.equal(stored.schema_version, WRITER_AUTHORITY_SCHEMA);
    assert.equal(stored.record_digest, applied.authority_digest);
    assert.equal(stored.owner_approval_ref, "owner-approval://synthetic/writer-authority");
    assert.deepEqual(stored.lanes, WRITER_AUTHORITY_LANES);
    await assert.rejects(acquireWriterLease(leaseOptions(f)), { code: "writer_authority_mode_off" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CLI defaults to a sanitized zero-write dry-run and applies only with explicit CAS", async () => {
  const f = await fixture("writer-authority-cli-");
  try {
    const approval = "owner-approval://synthetic/do-not-echo";
    const { stdout, stderr } = await execFile(process.execPath, [
      CLI,
      "--state-root", f.root,
      "--record", f.recordPath,
      "--action", "initialize",
      "--primary-node", HPP,
      "--fallback-node", MAC,
      "--not-before", NOT_BEFORE,
      "--expires-at", EXPIRES_AT,
      "--owner-approval-ref", approval,
    ]);
    const result = JSON.parse(stdout);
    assert.equal(stderr, "");
    assert.equal(result.operation_mode, "dry_run");
    assert.equal(result.status, "planned");
    assert.equal(result.writes_performed, 0);
    assert.equal(stdout.includes(approval), false);
    assert.equal(stdout.includes(f.root), false);
    assert.equal(stdout.includes(f.recordPath), false);
    assert.equal(await missing(f.recordPath), true);

    const appliedRun = await execFile(process.execPath, [
      CLI,
      "--state-root", f.root,
      "--record", f.recordPath,
      "--action", "initialize",
      "--primary-node", HPP,
      "--fallback-node", MAC,
      "--expected-current-epoch", String(result.expected_current_epoch),
      "--expected-current-digest", result.expected_current_digest,
      "--expected-node", result.expected_node_id,
      "--not-before", NOT_BEFORE,
      "--expires-at", EXPIRES_AT,
      "--owner-approval-ref", approval,
      "--apply",
    ]);
    const applied = JSON.parse(appliedRun.stdout);
    assert.equal(appliedRun.stderr, "");
    assert.equal(applied.operation_mode, "apply");
    assert.equal(applied.status, "updated");
    assert.equal(applied.writes_performed, 1);
    assert.equal(appliedRun.stdout.includes(approval), false);
    assert.equal(appliedRun.stdout.includes(f.root), false);
    assert.equal((JSON.parse(await readFile(f.recordPath, "utf8"))).mode, "off");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("stale HPP is fenced after fallback and stale fallback is fenced after failback", async () => {
  const f = await fixture();
  try {
    const initialized = await initialize(f);
    const primary = await transition(f, initialized, {
      action: "promote",
      targetMode: "primary",
      targetNodeId: HPP,
      ownerApprovalRef: "owner-approval://synthetic/promote-hpp",
    });
    const hppLease = await acquireWriterLease(leaseOptions(f, { lane: "voice" }));
    assert.equal((await validateWriterLease(leaseOptions(f, {
      lane: "voice",
      lease: hppLease,
      phase: "before_payload",
    }))).status, "valid");

    const hppRevoked = await transition(f, primary, {
      action: "revoke",
      ownerApprovalRef: "owner-approval://synthetic/revoke-hpp",
    });
    assert.equal(hppRevoked.authority_mode, "off");
    assert.equal(hppRevoked.revoked_digest, primary.authority_digest);
    const fallback = await transition(f, hppRevoked, {
      action: "promote",
      targetMode: "fallback",
      targetNodeId: MAC,
      ownerApprovalRef: "owner-approval://synthetic/promote-mac",
    });
    await assert.rejects(
      validateWriterLease(leaseOptions(f, {
        lane: "voice",
        lease: hppLease,
        phase: "after_payload",
      })),
      { code: "writer_authority_stale_epoch" },
    );

    const fallbackLease = await acquireWriterLease(leaseOptions(f, {
      nodeId: MAC,
      lane: "run_logs",
      mode: "fallback",
    }));
    assert.equal((await validateWriterLease(leaseOptions(f, {
      nodeId: MAC,
      lane: "run_logs",
      mode: "fallback",
      lease: fallbackLease,
      phase: "before_payload",
    }))).status, "valid");

    const fallbackRevoked = await transition(f, fallback, {
      action: "revoke",
      ownerApprovalRef: "owner-approval://synthetic/revoke-mac",
    });
    const failedBack = await transition(f, fallbackRevoked, {
      action: "failback",
      targetNodeId: HPP,
      ownerApprovalRef: "owner-approval://synthetic/failback-hpp",
    });
    assert.equal(failedBack.authority_mode, "primary");
    assert.equal(failedBack.epoch, fallbackRevoked.epoch + 1);
    assert.equal(failedBack.revoked_digest, fallback.authority_digest);
    await assert.rejects(
      validateWriterLease(leaseOptions(f, {
        nodeId: MAC,
        lane: "run_logs",
        mode: "fallback",
        lease: fallbackLease,
        phase: "after_payload",
      })),
      { code: "writer_authority_stale_epoch" },
    );
    const failbackLease = await acquireWriterLease(leaseOptions(f, { lane: "team_files" }));
    assert.equal((await validateWriterLease(leaseOptions(f, {
      lane: "team_files",
      lease: failbackLease,
      phase: "after_payload",
    }))).status, "valid");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("freeze alone never authorizes failback from fallback", async () => {
  const f = await fixture();
  try {
    const initialized = await initialize(f);
    const primary = await transition(f, initialized, {
      action: "promote",
      targetMode: "primary",
      targetNodeId: HPP,
    });
    const primaryRevoked = await transition(f, primary, { action: "revoke" });
    const fallback = await transition(f, primaryRevoked, {
      action: "promote",
      targetMode: "fallback",
      targetNodeId: MAC,
    });
    const fallbackFrozen = await transition(f, fallback, { action: "freeze" });

    await assert.rejects(transition(f, fallbackFrozen, {
      action: "failback",
      targetNodeId: HPP,
    }), { code: "writer_authority_transition_forbidden" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CAS races choose one writer and stale epoch, digest, and node expectations fail closed", async () => {
  const f = await fixture();
  try {
    const initialized = await initialize(f);
    const base = common(f, {
      action: "promote",
      expectedCurrentEpoch: initialized.epoch,
      expectedCurrentDigest: initialized.authority_digest,
      expectedNodeId: initialized.node_id,
      apply: true,
    });
    const outcomes = await Promise.allSettled([
      transitionWriterAuthority({
        ...base,
        targetMode: "primary",
        targetNodeId: HPP,
        ownerApprovalRef: "owner-approval://synthetic/race-hpp",
      }),
      transitionWriterAuthority({
        ...base,
        targetMode: "fallback",
        targetNodeId: MAC,
        ownerApprovalRef: "owner-approval://synthetic/race-mac",
      }),
    ]);
    const fulfilled = outcomes.filter((row) => row.status === "fulfilled");
    const rejected = outcomes.filter((row) => row.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(["writer_authority_cas_race", "writer_authority_stale_epoch"].includes(rejected[0].reason.code));
    const winner = fulfilled[0].value;

    await assert.rejects(transitionWriterAuthority(common(f, {
      action: "freeze",
      expectedCurrentEpoch: initialized.epoch,
      expectedCurrentDigest: winner.authority_digest,
      expectedNodeId: winner.node_id,
      apply: true,
    })), { code: "writer_authority_stale_epoch" });
    await assert.rejects(transitionWriterAuthority(common(f, {
      action: "freeze",
      expectedCurrentEpoch: winner.epoch,
      expectedCurrentDigest: initialized.authority_digest,
      expectedNodeId: winner.node_id,
      apply: true,
    })), { code: "writer_authority_stale_digest" });
    await assert.rejects(transitionWriterAuthority(common(f, {
      action: "freeze",
      expectedCurrentEpoch: winner.epoch,
      expectedCurrentDigest: winner.authority_digest,
      expectedNodeId: winner.node_id === HPP ? MAC : HPP,
      apply: true,
    })), { code: "writer_authority_wrong_node" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("an identical applied transition replays unchanged without a second write", async () => {
  const f = await fixture();
  try {
    const initialized = await initialize(f);
    const request = common(f, {
      action: "promote",
      targetMode: "primary",
      targetNodeId: HPP,
      expectedCurrentEpoch: initialized.epoch,
      expectedCurrentDigest: initialized.authority_digest,
      expectedNodeId: initialized.node_id,
      ownerApprovalRef: "owner-approval://synthetic/replay",
      apply: true,
    });
    const first = await transitionWriterAuthority(request);
    const firstBytes = await readFile(f.recordPath, "utf8");
    const replay = await transitionWriterAuthority(request);
    const continuousLeaseRoot = join(f.root, "state", "leases", "continuous_ingress");
    await mkdir(continuousLeaseRoot, { recursive: true });
    await writeFile(join(continuousLeaseRoot, "active.lock.json"), `${JSON.stringify({
      expires_at: "2100-07-20T00:00:00.000Z",
    })}\n`);
    const lateReplay = await transitionWriterAuthority({
      ...request,
      now: Date.parse(EXPIRES_AT) + 1,
    });
    assert.equal(first.status, "updated");
    assert.equal(replay.status, "unchanged");
    assert.equal(replay.writes_performed, 0);
    assert.equal(replay.authority_digest, first.authority_digest);
    assert.equal(lateReplay.status, "unchanged");
    assert.equal(lateReplay.writes_performed, 0);
    assert.equal(lateReplay.authority_digest, first.authority_digest);
    assert.equal(await readFile(f.recordPath, "utf8"), firstBytes);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a pre-replace process crash leaves a self-identifying lock that recovers only after expiry and no live continuous lease", async () => {
  const f = await fixture("writer-authority-crash-before-");
  const lockPath = `${f.recordPath}.cas.lock`;
  let child;
  try {
    const request = common(f, {
      action: "initialize",
      primaryNodeId: HPP,
      fallbackNodeId: MAC,
      expectedCurrentEpoch: 0,
      expectedCurrentDigest: WRITER_AUTHORITY_ABSENT_DIGEST,
      expectedNodeId: HPP,
      apply: true,
    });
    child = await spawnPausedAuthorityTransition(request, "beforeAuthorityRecordReplace");
    assert.equal(await missing(f.recordPath), true);
    let lock = JSON.parse(await readFile(lockPath, "utf8"));
    assert.deepEqual(Object.keys(lock).sort(), [
      "created_at", "expires_at", "identity", "owner_host", "owner_pid", "schema_version", "token",
    ]);
    assert.equal(lock.schema_version, WRITER_AUTHORITY_CAS_LOCK_SCHEMA);
    assert.equal(lock.owner_host, hostname());
    assert.equal(lock.owner_pid, child.pid);
    assert.deepEqual(Object.keys(lock.identity).sort(), ["birthtime_ns", "dev", "ino"]);
    assert.equal(Date.parse(lock.expires_at) - Date.parse(lock.created_at), WRITER_AUTHORITY_CAS_LOCK_TTL_MS);

    const recoveryNow = NOW + WRITER_AUTHORITY_CAS_LOCK_TTL_MS + 1;
    const continuousLeaseRoot = join(f.root, "state", "leases", "continuous_ingress");
    await mkdir(continuousLeaseRoot, { recursive: true });
    const continuousLeasePath = join(continuousLeaseRoot, "active.lock.json");
    const continuousLease = {
      schema_version: "soulforge.ingress.continuous_lease.v1",
      node_id: HPP,
      owner_host: hostname(),
      owner_pid: process.pid,
      lease_epoch: 1,
      fence_token: "synthetic-live-continuous-owner",
      acquired_at: new Date(recoveryNow - 1_000).toISOString(),
      expires_at: new Date(recoveryNow + 60_000).toISOString(),
    };
    await writeFile(continuousLeasePath, `${JSON.stringify(continuousLease)}\n`);
    await assert.rejects(initialize(f, { now: recoveryNow }), {
      code: "writer_authority_continuous_lease_active",
    });
    assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, lock.token);
    await writeFile(continuousLeasePath, `${JSON.stringify({
      ...continuousLease,
      owner_host: "remote-owner.invalid",
      acquired_at: new Date(recoveryNow - 60_000).toISOString(),
      expires_at: new Date(recoveryNow - 1).toISOString(),
    })}\n`);
    await assert.rejects(initialize(f, { now: recoveryNow }), {
      code: "writer_authority_continuous_lease_remote_owner",
    });
    await rm(continuousLeasePath);

    await assert.rejects(initialize(f, { now: recoveryNow }), {
      code: "writer_authority_lock_owner_alive",
    });
    await stopChild(child);

    lock = JSON.parse(await readFile(lockPath, "utf8"));
    await writeFile(lockPath, `${JSON.stringify({ ...lock, owner_host: "remote-owner.invalid" })}\n`);
    await assert.rejects(initialize(f, { now: recoveryNow }), {
      code: "writer_authority_lock_remote_owner",
    });
    await writeFile(lockPath, `${JSON.stringify(lock)}\n`);

    const recovered = await initialize(f, { now: recoveryNow });
    assert.equal(recovered.status, "updated");
    assert.equal(recovered.authority_scope, WRITER_AUTHORITY_SCOPE);
    assert.equal(await missing(lockPath), true);
    assert.equal(await missing(`${lockPath}.recovery`), true);
  } finally {
    await stopChild(child);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a post-replace process crash recovers the stale lock and replays the installed authority record", async () => {
  const f = await fixture("writer-authority-crash-after-");
  let child;
  try {
    const initialized = await initialize(f);
    const request = common(f, {
      action: "promote",
      targetMode: "primary",
      targetNodeId: HPP,
      expectedCurrentEpoch: initialized.epoch,
      expectedCurrentDigest: initialized.authority_digest,
      expectedNodeId: initialized.node_id,
      ownerApprovalRef: "owner-approval://synthetic/crash-after-replace",
      apply: true,
    });
    child = await spawnPausedAuthorityTransition(request, "afterAuthorityRecordReplace");
    const installed = JSON.parse(await readFile(f.recordPath, "utf8"));
    assert.equal(installed.epoch, initialized.epoch + 1);
    assert.equal(installed.mode, "primary");

    await assert.rejects(transitionWriterAuthority({
      ...request,
      now: NOW + WRITER_AUTHORITY_CAS_LOCK_TTL_MS + 1,
    }), { code: "writer_authority_lock_owner_alive" });
    await stopChild(child);
    const replay = await transitionWriterAuthority({
      ...request,
      now: NOW + WRITER_AUTHORITY_CAS_LOCK_TTL_MS + 1,
    });
    assert.equal(replay.status, "unchanged");
    assert.equal(replay.writes_performed, 0);
    assert.equal(replay.authority_digest, installed.record_digest);
    assert.equal(await missing(`${f.recordPath}.cas.lock`), true);
  } finally {
    await stopChild(child);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("active-to-active switches, wrong lease claims, and expired leases are forbidden", async () => {
  const f = await fixture();
  try {
    const initialized = await initialize(f);
    const primary = await transition(f, initialized, {
      action: "promote",
      targetMode: "primary",
      targetNodeId: HPP,
    });
    await assert.rejects(transition(f, primary, {
      action: "promote",
      targetMode: "fallback",
      targetNodeId: MAC,
    }), { code: "writer_authority_transition_forbidden" });
    await assert.rejects(transition(f, primary, {
      action: "failback",
      targetNodeId: HPP,
    }), { code: "writer_authority_transition_forbidden" });
    await assert.rejects(acquireWriterLease(leaseOptions(f, {
      nodeId: MAC,
      mode: "fallback",
    })), { code: "writer_authority_wrong_mode" });
    await assert.rejects(acquireWriterLease(leaseOptions(f, {
      nodeId: MAC,
    })), { code: "writer_authority_wrong_node" });
    await assert.rejects(acquireWriterLease(leaseOptions(f, {
      lane: "unknown",
    })), { code: "writer_authority_wrong_lane" });
    await assert.rejects(acquireWriterLease(leaseOptions(f, {
      now: Date.parse("2100-01-01T00:00:00.000Z"),
    })), { code: "writer_authority_expired" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("authority paths fail closed on lexical escape and symlink or junction traversal", async (t) => {
  const f = await fixture("writer-authority-path-");
  const outside = await fixture("writer-authority-outside-");
  try {
    await assert.rejects(transitionWriterAuthority(common(f, {
      recordPath: outside.recordPath,
      action: "initialize",
      primaryNodeId: HPP,
      fallbackNodeId: MAC,
    })), { code: "writer_authority_path_escape" });

    const linked = join(f.root, "linked");
    try {
      await symlink(outside.root, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
        t.diagnostic(`symlink fixture unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(transitionWriterAuthority(common(f, {
      recordPath: join(linked, "authority.json"),
      action: "initialize",
      primaryNodeId: HPP,
      fallbackNodeId: MAC,
    })), { code: "writer_authority_path_unsafe" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
    await rm(outside.root, { recursive: true, force: true });
  }
});

test("the public schema fixes the single mode and exact five-lane contract", async () => {
  const schemaPath = fileURLToPath(new URL("./writer_authority.schema.json", import.meta.url));
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.equal(schema.$id, WRITER_AUTHORITY_SCHEMA);
  assert.equal(schema.properties.authority_scope.const, WRITER_AUTHORITY_SCOPE);
  assert.deepEqual(schema.properties.mode.enum, ["off", "primary", "fallback"]);
  assert.deepEqual(schema.properties.lanes.const, WRITER_AUTHORITY_LANES);
  assert.equal(schema.additionalProperties, false);
});
