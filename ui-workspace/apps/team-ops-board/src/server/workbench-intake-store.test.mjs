import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtemp, readFile, writeFile, readdir, mkdir, symlink, rename, link, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createWorkbenchIntakeStore } from "./workbench-intake-store.mjs";
import { makeWorkBindingFixture } from "../../../../../docs/architecture/workspace/examples/work_binding/synthetic.mjs";

async function workspace(t) {
  const parent = await mkdtemp(join(tmpdir(), "sf-intake-test-"));
  const root = join(parent, "records");
  await mkdir(root);
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { parent, root };
}
const meta = evidence => ({ trusted_evidence: evidence, request_id: `w_${"1".repeat(32)}`, created_at: "2026-09-07T00:00:00.000Z" });

async function withFilesystemMocks(t, overrides, run) {
  for (const [name, implementation] of Object.entries(overrides)) t.mock.method(fs, name, implementation);
  syncBuiltinESMExports();
  try { return await run(); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
}
const permissionError = syscall => Object.assign(new Error("synthetic permission failure"), { code: "EPERM", syscall });

test("durable receipt survives store restart and exact retry does not append", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const first = await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
  assert.equal(first.status, "RECORDED");
  assert.equal(first.persisted, true);
  const restarted = createWorkbenchIntakeStore({ root });
  const replay = await restarted.record(request, { ...meta(evidence), request_id: `w_${"2".repeat(32)}` });
  assert.equal(replay.replayed, true);
  assert.equal(replay.record.request_id, first.record.request_id);
  assert.deepEqual(await readdir(root), [`${first.record.request_id}.json`]);
  assert.equal((await restarted.read(first.record.request_id)).status, "FOUND");
});

test("concurrent revisions of the same parent have exactly one durable successor", async t => {
  const {root}=await workspace(t);
  const {request,evidence}=makeWorkBindingFixture();
  const store=createWorkbenchIntakeStore({root});
  const first=await store.record(request,meta(evidence));
  const revision={...request,revision_of:first.record.request_id,revision_no:2};
  const responses=await Promise.all(['2','3'].map(hex=>createWorkbenchIntakeStore({root}).record(
    {...revision,idempotency_key:`synthetic-revision-${hex}`},{...meta(evidence),request_id:`w_${hex.repeat(32)}`})));
  assert.equal(responses.filter(row=>row.status==='RECORDED').length,1);
  assert.equal(responses.filter(row=>row.hold_code==='REVISION_ALREADY_EXISTS').length,1);
  assert.equal((await readdir(root)).length,2);
  const winner=responses.find(row=>row.status==='RECORDED');
  const replay=await createWorkbenchIntakeStore({root}).record(winner.record.request,{...meta(evidence),request_id:`w_${'4'.repeat(32)}`});
  assert.equal(replay.replayed,true);assert.equal(replay.record.request_id,winner.record.request_id);
});

test("concurrent same retry has one durable record; changed contents under same key conflict", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const a = createWorkbenchIntakeStore({ root });
  const b = createWorkbenchIntakeStore({ root });
  const results = await Promise.all([
    a.record(request, meta(evidence)),
    b.record(request, { ...meta(evidence), request_id: `w_${"2".repeat(32)}` }),
  ]);
  assert.ok(results.every(result => result.status === "RECORDED"), JSON.stringify(results.map(result => result.hold_code)));
  assert.equal(results.filter(result => result.replayed).length, 1);
  const conflict = await b.record({ ...request, directives: ["SHORTEN"] }, { ...meta(evidence), request_id: `w_${"3".repeat(32)}` });
  assert.equal(conflict.hold_code, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(conflict.append_required, false);
  assert.equal((await readdir(root)).length, 1);
});

test("concurrent different contents sharing a key produce one winner and one conflict", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const store = createWorkbenchIntakeStore({ root });
  const results = await Promise.all([
    store.record(request, meta(evidence)),
    store.record({ ...request, directives: ["SHORTEN"] }, { ...meta(evidence), request_id: `w_${"2".repeat(32)}` }),
  ]);
  assert.equal(results.filter(result => result.status === "RECORDED").length, 1);
  assert.equal(results.filter(result => result.hold_code === "IDEMPOTENCY_KEY_CONFLICT").length, 1);
});

test("overlapping retry fan-in across store instances never returns transient partial state", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => createWorkbenchIntakeStore({ root }).record(request, {
    ...meta(evidence), request_id: `w_${(index + 1).toString(16).padStart(32, "0")}`,
  })));
  assert.ok(results.every(result => result.status === "RECORDED"), JSON.stringify(results.map(result => result.hold_code)));
  assert.equal(results.filter(result => !result.replayed).length, 1);
  assert.equal((await readdir(root)).length, 1);
});

test("Windows delete-pending lock open replays an exact committed retry without another lock", { skip: process.platform !== "win32", timeout: 5000 }, async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const original = { open: fs.open, lstat: fs.lstat, unlink: fs.unlink };
  const locked = Promise.withResolvers();
  const observed = Promise.withResolvers();
  const released = Promise.withResolvers();
  const lockPath = join(root, ".intake.lock");
  let contended = false, injected = 0, successfulLocks = 0;
  await withFilesystemMocks(t, {
    async open(path, ...args) {
      if (path === lockPath && contended) {
        await released.promise;
        injected++;
        throw permissionError("open");
      }
      if (String(path).startsWith(join(root, ".pending."))) await observed.promise;
      try {
        const handle = await original.open(path, ...args);
        if (path === lockPath) { successfulLocks++; locked.resolve(); }
        return handle;
      } catch (error) {
        if (path === lockPath && error.code === "EEXIST") contended = true;
        throw error;
      }
    },
    async lstat(path, ...args) {
      const stat = await original.lstat(path, ...args);
      if (path === lockPath && contended) observed.resolve();
      return stat;
    },
    async unlink(path, ...args) {
      const result = await original.unlink(path, ...args);
      if (path === lockPath) released.resolve();
      return result;
    },
  }, async () => {
    const first = createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
    await locked.promise;
    const retry = createWorkbenchIntakeStore({ root }).record(request, { ...meta(evidence), request_id: `w_${"2".repeat(32)}` });
    const results = await Promise.all([first, retry]);
    assert.deepEqual(results.map(row => row.status), ["RECORDED", "RECORDED"]);
    assert.deepEqual(results.map(row => row.replayed), [false, true]);
    assert.equal(results[1].record.request_id, results[0].record.request_id);
    assert.equal(injected, 1);
    assert.equal(successfulLocks, 1);
    assert.deepEqual(await readdir(root), [`${results[0].record.request_id}.json`]);
  });
});

test("lock open permission failure cannot append or accept a different whole request", async t => {
  for (const existing of [false, true]) {
    await t.test(existing ? "existing conflicting key" : "empty store", async child => {
      const { root } = await workspace(child);
      const { request, evidence } = makeWorkBindingFixture();
      if (existing) await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
      const original = { open: fs.open, readdir: fs.readdir };
      let listings = 0, denied = 0;
      await withFilesystemMocks(child, {
        async readdir(path, ...args) {
          const names = await original.readdir(path, ...args);
          // Reproduce publication after this caller's initial snapshot.
          return path === root && ++listings === 1 ? [] : names;
        },
        async open(path, ...args) {
          if (path === join(root, ".intake.lock")) { denied++; throw permissionError("open"); }
          return original.open(path, ...args);
        },
      }, async () => {
        const changed = existing ? { ...request, directives: ["SHORTEN"] } : request;
        const result = await createWorkbenchIntakeStore({ root }).record(changed, meta(evidence));
        assert.equal(result.hold_code, "STORE_IO_UNAVAILABLE");
        assert.equal(result.persisted, false);
        assert.equal(result.record, undefined);
        assert.equal(denied, 1);
        assert.equal((await original.readdir(root)).length, existing ? 1 : 0);
      });
    });
  }
});

test("lock open failure recovery preserves canonical and partial-state guards", { skip: process.platform !== "win32" }, async t => {
  for (const defect of ["missing", "permission", "outside-hardlink", "partial-stage"]) {
    await t.test(defect, async child => {
      const { parent, root } = await workspace(child);
      const { request, evidence } = makeWorkBindingFixture();
      const first = await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
      const recordPath = join(root, `${first.record.request_id}.json`);
      const before = await readFile(recordPath, "utf8");
      const original = { open: fs.open, readdir: fs.readdir, lstat: fs.lstat };
      let listings = 0, denied = 0;
      await withFilesystemMocks(child, {
        async readdir(path, ...args) {
          const names = await original.readdir(path, ...args);
          return path === root && ++listings === 1 ? [] : names;
        },
        async open(path, ...args) {
          if (path === join(root, ".intake.lock")) {
            denied++;
            if (defect === "outside-hardlink") await link(recordPath, join(parent, "external-copy.json"));
            if (defect === "partial-stage") await writeFile(join(root, `.pending.${"a".repeat(32)}.json`), '{"partial":');
            throw permissionError("open");
          }
          if (path === recordPath && defect === "permission") throw permissionError("open");
          return original.open(path, ...args);
        },
        async lstat(path, ...args) {
          if (path === recordPath && defect === "missing") throw Object.assign(new Error("synthetic disappearance"), { code: "ENOENT", syscall: "lstat" });
          return original.lstat(path, ...args);
        },
      }, async () => {
        const result = await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
        assert.equal(result.hold_code, defect === "outside-hardlink" ? "STORE_FILE_UNSAFE" : defect === "partial-stage" ? "STORE_INCOMPLETE" : "STORE_IO_UNAVAILABLE");
        assert.equal(result.persisted, false);
        assert.equal(result.record, undefined);
        assert.equal(denied, 1);
        assert.equal((await original.readdir(root)).length, defect === "partial-stage" ? 2 : 1);
        assert.equal(await readFile(recordPath, "utf8"), before);
        if (defect === "partial-stage") assert.equal(await readFile(join(root, `.pending.${"a".repeat(32)}.json`), "utf8"), '{"partial":');
      });
    });
  }
});

test("permission failure during published staging or lock cleanup stays commit-uncertain", async t => {
  for (const target of ["stage", "lock"]) {
    await t.test(target, async child => {
      const { root } = await workspace(child);
      const { request, evidence } = makeWorkBindingFixture();
      const originalUnlink = fs.unlink;
      let denied = 0;
      await withFilesystemMocks(child, {
        async unlink(path, ...args) {
          if (target === "lock" ? path === join(root, ".intake.lock") : String(path).startsWith(join(root, ".pending."))) {
            denied++;
            throw permissionError("unlink");
          }
          return originalUnlink(path, ...args);
        },
      }, async () => {
        const result = await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
        assert.equal(result.hold_code, "STORE_COMMIT_UNCERTAIN");
        assert.equal(result.persisted, false);
        assert.equal(result.record, undefined);
        assert.equal(denied, 1);
        assert.equal((await readdir(root)).length, 2);
      });
    });
  }
});

test("restart preserves whole-request scope and requester in the idempotency conflict", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
  const changed = { ...request, requester: "owner.local", project_code: "SYN-002" };
  const trusted = structuredClone(evidence);
  trusted.authenticated_requester = changed.requester;
  trusted.acl.requester = changed.requester;
  trusted.acl.project_code = changed.project_code;
  trusted.policy_slots[0].project_code = changed.project_code;
  trusted.mappings[0].project_code = changed.project_code;
  const result = await createWorkbenchIntakeStore({ root }).record(changed, { ...meta(trusted), request_id: `w_${"2".repeat(32)}` });
  assert.equal(result.hold_code, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(result.record, undefined);
  assert.equal((await readdir(root)).length, 1);
});

test("malformed and unauthorized requests cannot create directories or files", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const store = createWorkbenchIntakeStore({ root });
  assert.equal((await store.record({ ...request, instruction: "private prose" }, meta(evidence))).persisted, false);
  assert.equal((await store.record(request, meta({ ...evidence, acl: { ...evidence.acl, project_code: "SYN-002" } }))).persisted, false);
  assert.deepEqual(await readdir(root), []);
  assert.equal((await store.read("../outside")).status, "HOLD");
  assert.throws(() => createWorkbenchIntakeStore({ root: "relative/path" }));
});

test("truncated, corrupt, unknown or oversized canonical files fail closed without raw echo", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const store = createWorkbenchIntakeStore({ root });
  const id = meta(evidence).request_id;
  for (const bytes of ['{"private":"sensitive prose"', "x".repeat(40000)]) {
    await writeFile(join(root, `${id}.json`), bytes);
    const result = await store.read(id);
    assert.equal(result.status, "HOLD");
    assert.equal(JSON.stringify(result).includes("sensitive"), false);
    assert.equal((await store.record(request, meta(evidence))).persisted, false);
    assert.equal(await readFile(join(root, `${id}.json`), "utf8"), bytes);
  }
});

test("abandoned transaction cannot append; committed receipt may replay after crash", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const store = createWorkbenchIntakeStore({ root, lockRetries: 1 });
  const first = await store.record(request, meta(evidence));
  await writeFile(join(root, ".intake.lock"), "{}\n");
  const restarted = createWorkbenchIntakeStore({ root, lockRetries: 1 });
  assert.equal((await restarted.record(request, meta(evidence))).replayed, true);
  assert.equal((await restarted.record({ ...request, idempotency_key: "synthetic-request-002" }, { ...meta(evidence), request_id: `w_${"2".repeat(32)}` })).hold_code, "STORE_BUSY");
  assert.equal((await restarted.read(first.record.request_id)).status, "FOUND");
});

test("crash after atomic publication may leave an exact staged hardlink and still replay", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const first = await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
  await link(join(root, `${first.record.request_id}.json`), join(root, `.pending.${"b".repeat(32)}.json`));
  await writeFile(join(root, ".intake.lock"), "{}\n");
  const restart = createWorkbenchIntakeStore({ root, lockRetries: 0 });
  const replay = await restart.record(request, meta(evidence));
  assert.equal(replay.status, "RECORDED");
  assert.equal(replay.replayed, true);
  assert.equal((await restart.read(first.record.request_id)).status, "FOUND");
  assert.equal((await readdir(root)).length, 3);
});

test("a record hardlinked to an unowned outside name is refused", async t => {
  const { parent, root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const first = await createWorkbenchIntakeStore({ root }).record(request, meta(evidence));
  await link(join(root, `${first.record.request_id}.json`), join(parent, "external-copy.json"));
  const result = await createWorkbenchIntakeStore({ root }).read(first.record.request_id);
  assert.equal(result.hold_code, "STORE_FILE_UNSAFE");
  assert.equal(result.record, undefined);
});

test("partial staging file has no request status and prevents a new append", async t => {
  const { root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  await writeFile(join(root, `.pending.${"a".repeat(32)}.json`), '{"partial":');
  const store = createWorkbenchIntakeStore({ root, lockRetries: 1 });
  assert.equal((await store.read(meta(evidence).request_id)).status, "HOLD");
  assert.equal((await store.record(request, meta(evidence))).persisted, false);
  assert.equal((await readdir(root)).length, 1);
});

test("symlink/junction root, linked records and replaced root cannot write outside isolated root", async t => {
  const { parent, root } = await workspace(t);
  const { request, evidence } = makeWorkBindingFixture();
  const outside = join(parent, "outside");
  await mkdir(outside);
  const linked = join(parent, "linked");
  await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await createWorkbenchIntakeStore({ root: linked }).record(request, meta(evidence))).persisted, false);
  const store = createWorkbenchIntakeStore({ root });
  await store.read(meta(evidence).request_id);
  await rename(root, join(parent, "old-root"));
  await symlink(outside, root, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await store.record(request, meta(evidence))).persisted, false);
  assert.deepEqual(await readdir(outside), []);
});
