import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, mkdir, symlink, rename, link, rm } from "node:fs/promises";
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
