import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, rm, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createWorkbenchIntakeHandler } from "./workbench-intake-adapter.mjs";
import { createWorkbenchIntakeStore } from "./workbench-intake-store.mjs";
import { makeWorkBindingFixture } from "../../../../../docs/architecture/workspace/examples/work_binding/synthetic.mjs";

const origin = "http://127.0.0.1:4192";
const id = `w_${"1".repeat(32)}`;
function req(body, overrides = {}) {
  const request = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body ?? {}))]);
  Object.assign(request, { method: "POST", url: "/api/workbench/requests", socket: { remoteAddress: "127.0.0.1" } }, overrides);
  request.headers = { host: "127.0.0.1:4192", origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-csrf-token": "synthetic-only", ...overrides.headers };
  return request;
}
async function call(handler, request) {
  const response = { statusCode: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(bytes) { this.body = JSON.parse(bytes); } };
  await handler(request, response);
  return response;
}
async function context(t) {
  const parent = await mkdtemp(join(tmpdir(), "sf-intake-http-test-"));
  const root = join(parent, "records");
  await mkdir(root);
  t.after(() => rm(parent, { recursive: true, force: true }));
  const fixture = makeWorkBindingFixture();
  const calls = { session: 0, csrf: 0, evidence: 0 };
  const settings = {
    store: createWorkbenchIntakeStore({ root }), enabled: true, readOnlyPilot: false, allowedOrigin: origin,
    verifySession: async () => { calls.session++; return { requester: fixture.request.requester }; },
    verifyCsrf: async ({ request }) => { calls.csrf++; return request.headers["x-csrf-token"] === "synthetic-only"; },
    currentEvidenceProvider: async () => { calls.evidence++; return fixture.evidence; },
    requestIdFactory: () => id, now: () => "2026-09-07T00:00:00.000Z",
  };
  return { root, fixture, calls, settings };
}

test("pilot and feature-off POST are 405 before authentication, evidence or filesystem effects", async t => {
  const { root, fixture, calls, settings } = await context(t);
  for (const flags of [{ readOnlyPilot: true }, { enabled: false }]) {
    const result = await call(createWorkbenchIntakeHandler({ ...settings, ...flags }), req(fixture.request));
    assert.equal(result.statusCode, 405);
  }
  assert.deepEqual(calls, { session: 0, csrf: 0, evidence: 0 });
  assert.deepEqual(await readdir(root), []);
});

test("real same-origin browser GET without Origin can read its authorized record", async t => {
  const {fixture,settings}=await context(t);
  const handler=createWorkbenchIntakeHandler(settings);
  assert.equal((await call(handler,req(fixture.request))).statusCode,201);
  const get=req(null,{method:"GET",url:`/api/workbench/requests/${id}`,headers:{origin:undefined}});
  assert.equal((await call(handler,get)).statusCode,200);
});

test("forged Origin cannot override Host or cross-site fetch metadata", async t => {
  const {fixture,settings,calls}=await context(t);
  const handler=createWorkbenchIntakeHandler(settings);
  for(const method of ["POST","GET"]){
    for(const headers of [{host:"evil.invalid"},{host:undefined},{"sec-fetch-site":"cross-site"},{"sec-fetch-site":"same-site"}]){
      const request=req(fixture.request,{method,url:method==="POST"?"/api/workbench/requests":`/api/workbench/requests/${id}`,headers});
      assert.equal((await call(handler,request)).statusCode,403);
    }
  }
  assert.deepEqual(calls,{session:0,csrf:0,evidence:0});
});

test("no-Origin GET requires same-origin fetch metadata and present Origin must match", async t => {
  const {fixture,settings}=await context(t);
  const handler=createWorkbenchIntakeHandler(settings);
  await call(handler,req(fixture.request));
  for(const headers of [{origin:undefined,"sec-fetch-site":undefined},{origin:undefined,"sec-fetch-site":"none"},{origin:"http://evil.invalid"}]){
    assert.equal((await call(handler,req(null,{method:"GET",url:`/api/workbench/requests/${id}`,headers}))).statusCode,403);
  }
});

test("loopback, exact Origin, session and CSRF failures return 403 before storing", async t => {
  const { root, fixture, settings } = await context(t);
  for (const request of [
    req(fixture.request, { socket: { remoteAddress: "192.0.2.1" } }),
    req(fixture.request, { headers: { origin: "http://localhost:4192", "content-type": "application/json" } }),
    req(fixture.request, { headers: { origin, "content-type": "application/json", "x-csrf-token": "wrong" } }),
  ]) assert.equal((await call(createWorkbenchIntakeHandler(settings), request)).statusCode, 403);
  assert.equal((await call(createWorkbenchIntakeHandler({ ...settings, verifySession: async () => null }), req(fixture.request))).statusCode, 403);
  assert.deepEqual(await readdir(root), []);
});

test("strict JSON, bounded body and trusted actor binding reject before a record is written", async t => {
  const { root, fixture, settings } = await context(t);
  const handler = createWorkbenchIntakeHandler(settings);
  for (const [body, status] of [["{", 400], ["x".repeat(20000), 413], [{ ...fixture.request, instruction: "private prose" }, 400], [{ ...fixture.request, requester: "owner.local" }, 403]]) {
    assert.equal((await call(handler, req(body))).statusCode, status);
  }
  const scope = createWorkbenchIntakeHandler({ ...settings, currentEvidenceProvider: async () => ({ ...fixture.evidence, acl: { ...fixture.evidence.acl, project_code: "SYN-002" } }) });
  assert.equal((await call(scope, req(fixture.request))).statusCode, 403);
  assert.deepEqual(await readdir(root), []);
});

test("POST, retry and authenticated exact GET show only RECORDED metadata", async t => {
  const { root, fixture, settings } = await context(t);
  const handler = createWorkbenchIntakeHandler(settings);
  const first = await call(handler, req(fixture.request));
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.status, "RECORDED");
  assert.equal(first.body.request_id, id);
  assert.equal(first.body.claim_created, false);
  const replay = await call(handler, req(fixture.request));
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  const get = await call(handler, req(null, { method: "GET", url: `/api/workbench/requests/${id}` }));
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.status, "RECORDED");
  assert.equal(get.body.record, undefined);
  assert.equal(get.body.instruction_ref, undefined);
  assert.equal(get.body.requester, undefined);
  assert.equal((await readdir(root)).length, 1);
  const other = await call(createWorkbenchIntakeHandler({ ...settings, verifySession: async () => ({ requester: "owner.local" }) }), req(null, { method: "GET", url: `/api/workbench/requests/${id}` }));
  assert.equal(other.statusCode, 404);
  const wrongProject = await call(createWorkbenchIntakeHandler({ ...settings, currentEvidenceProvider: async () => ({ ...fixture.evidence, acl: { ...fixture.evidence.acl, project_code: "SYN-002" } }) }), req(null, { method: "GET", url: `/api/workbench/requests/${id}` }));
  const revoked = await call(createWorkbenchIntakeHandler({ ...settings, currentEvidenceProvider: async () => ({ ...fixture.evidence, acl: { ...fixture.evidence.acl, state: "revoked" } }) }), req(null, { method: "GET", url: `/api/workbench/requests/${id}` }));
  const absent = await call(handler, req(null, { method: "GET", url: `/api/workbench/requests/w_${"f".repeat(32)}` }));
  assert.equal(wrongProject.statusCode, 404);
  assert.equal(revoked.statusCode, 404);
  assert.deepEqual(other.body, absent.body);
  assert.deepEqual(wrongProject.body, absent.body);
  assert.deepEqual(revoked.body, absent.body);
});

test("unknown routes, unsupported methods, corrupt stored bodies and provider faults stay redacted", async t => {
  const { root, fixture, settings } = await context(t);
  const handler = createWorkbenchIntakeHandler(settings);
  assert.equal((await call(handler, req(null, { method: "GET", url: "/api/workbench/requests/../../outside" }))).statusCode, 404);
  assert.equal((await call(handler, req(null, { method: "DELETE" }))).statusCode, 405);
  await writeFile(join(root, `${id}.json`), '{"secret_body":"sensitive raw material"}');
  const broken = await call(handler, req(null, { method: "GET", url: `/api/workbench/requests/${id}` }));
  assert.equal(broken.statusCode, 503);
  assert.equal(JSON.stringify(broken.body).includes("sensitive"), false);
  const failed = await call(createWorkbenchIntakeHandler({ ...settings, currentEvidenceProvider: async () => { throw new Error("private upstream detail"); } }), req(fixture.request));
  assert.equal(failed.statusCode, 503);
  assert.equal(JSON.stringify(failed.body).includes("private upstream"), false);
});

test("unmapped prephase intake remains RECORDED with zero execution effects through HTTP", async t => {
  const { fixture, settings } = await context(t);
  const request = { ...fixture.request, rune_task_id: null, work_order_ref: null };
  const handler = createWorkbenchIntakeHandler({ ...settings, currentEvidenceProvider: async ({ session, request: bound, operation }) => {
    assert.equal(session.requester, request.requester);
    assert.equal(bound.project_code, request.project_code);
    assert.equal(operation, "record");
    return { ...fixture.evidence, mapping_phase: "pre_phase0", mappings: [] };
  } });
  const response = await call(handler, req(request));
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.status, "RECORDED");
  assert.equal(response.body.mapping_status, "UNMAPPED_WORK_CANDIDATE");
  assert.equal(response.body.claim_created, false);
  assert.equal(response.body.execution_started, false);
  assert.equal(response.body.acceptance_authority, false);
});
