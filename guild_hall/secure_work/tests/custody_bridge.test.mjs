import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { runCustody } from "../custody_bridge.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, body) => writeFile(path, JSON.stringify(body));

import { fixture } from "./custody_test_fixture.mjs";

test("existing IngressClient uploads exact candidate once, recovers lost reply and reads only the bound ACK", async (t) => {
  const f = await fixture(t);
  const options = { token: f.token, authorize: () => true };
  const first = await runCustody(f.request, options);
  assert.equal(first.status, "pending_server_ack");
  // Replay after an imagined caller crash: server idempotency retains one submission.
  const replay = await runCustody(f.request, options);
  assert.equal(replay.submission_id, first.submission_id);
  const files = await readdir(resolve(f.state, "submissions"));
  assert.equal(files.length, 1);
  const record = JSON.parse(await readFile(resolve(f.state, "submissions", files[0])));
  assert.equal(record.sha256, f.request.binding.sha256);
  assert.equal(record.official_completion, false);
  const payloads = (await readdir(resolve(f.outbox, "team_files"))).filter((name) => name.endsWith(".payload"));
  assert.equal(payloads.length, 1);
  assert.deepEqual(await readFile(resolve(f.outbox, "team_files", payloads[0])), f.body);
  for (const delta of [{ input_revision: "r2" }, { project_hint: "other.project" }]) {
    await assert.rejects(runCustody({ ...f.request, binding: { ...f.request.binding, ...delta } }, options));
  }
  await json(resolve(f.outbox, "state", "acks", "team_files", `${record.outbox_occurrence_id}.json`), {
    source_key: record.outbox_occurrence_id, sha256: record.sha256, size: record.size,
  });
  const status = { ...f.request, action: "status", submission_id: first.submission_id };
  const verified = await runCustody(status, options);
  assert.equal(verified.status, "verified_server_ack");
  assert.equal(verified.official_history_written, false);
  assert.equal(verified.source_deleted, false);
  assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
  await assert.rejects(runCustody({ ...status, principal: { ...status.principal, agent_id: "other.agent" } }, options));
});

test("scope or capability revoked after prepare blocks bytes at sending boundary", async (t) => {
  for (const field of ["project_scopes", "capabilities"]) {
    await t.test(field, async (t) => {
      const f = await fixture(t);
      let writes = 0;
      const guardedFetch = async (url, options) => {
        if (options.method === "PUT") writes++;
        const response = await fetch(url, options);
        if (String(options.body).includes("ingress_prepare_file_upload")) {
          const registry = JSON.parse(await readFile(f.registry));
          registry.tokens[0][field] = field === "capabilities" ? ["receipt:read"] : ["other.project"];
          await json(f.registry, registry);
        }
        return response;
      };
      await assert.rejects(runCustody(f.request, { token: f.token, fetchImpl: guardedFetch, authorize: () => true }));
      assert.equal(writes, 0);
      assert.equal((await readdir(resolve(f.state, "submissions"))).length, 0);
    });
  }
});

test("untrusted oversize reply and changed candidate are denied without candidate upload", async (t) => {
  const f = await fixture(t);
  await assert.rejects(runCustody(f.request, { token: f.token, authorize: () => true,
    fetchImpl: async () => new Response("S".repeat(32769), { status: 200, headers: { "content-type": "application/json" } }) }));
  await writeFile(f.request.candidate_path, Buffer.alloc(f.body.length, 84));
  await assert.rejects(runCustody(f.request, { token: f.token, authorize: () => true }));
  assert.equal((await readdir(resolve(f.state, "submissions"))).length, 0);
});

test("request proof fields alone never authorize the bridge", async () => {
  let calls = 0;
  await assert.rejects(runCustody({ authorization_expires_at: Date.now() / 1000 + 120,
    principal: { account_id: "synthetic" } }, { token: "synthetic", fetchImpl: () => { calls++; } }));
  assert.equal(calls, 0);
});

test("authority is current after the remote status response for upload and status-only returns", async t => {
  for (const action of ["upload", "status"]) {
    for (const mode of ["revoked", "principal_changed", "expired"]) {
      await t.test(`${action}/${mode}`, async t => {
        let currentTime = Date.now();
        t.mock.method(Date, "now", () => currentTime);
        const f = await fixture(t);
        let allowed = true;
        let remoteStatusResponses = 0;
        const installAck = async () => {
          const [name] = await readdir(resolve(f.state, "submissions"));
          const record = JSON.parse(await readFile(resolve(f.state, "submissions", name)));
          await json(resolve(f.outbox, "state", "acks", "team_files", `${record.outbox_occurrence_id}.json`), {
            source_key: record.outbox_occurrence_id, sha256: record.sha256, size: record.size,
          });
        };
        const request = { ...f.request, action };
        if (action === "status") {
          const first = await runCustody(f.request, { token: f.token, authorize: () => true });
          request.submission_id = first.submission_id;
          await installAck();
        }
        request.authorization_expires_at = currentTime / 1000 + 1;
        const afterResponseFetch = async (url, options) => {
          const response = await fetch(url, options);
          if (new URL(url).pathname.endsWith("/finalize")) await installAck();
          if (String(options.body).includes("ingress_get_submission_status")) {
            const result = await response.clone().json();
            assert.equal(result.result.structuredContent.status, "verified_server_ack");
            remoteStatusResponses++;
            if (mode === "revoked") allowed = false;
            else if (mode === "expired") currentTime += 2000;
            else {
              const registry = JSON.parse(await readFile(f.registry));
              registry.tokens[0].agent_id = "changed.agent";
              await json(f.registry, registry);
            }
          }
          return response;
        };
        await assert.rejects(runCustody(request, { token: f.token, authorize: () => allowed,
          fetchImpl: afterResponseFetch }));
        assert.equal(remoteStatusResponses, 1);
        // The request was sent: denial of a local return does not undo custody.
        assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
        const payloads = (await readdir(resolve(f.outbox, "team_files"))).filter(n => n.endsWith(".payload"));
        assert.equal(payloads.length, 1);
        assert.deepEqual(await readFile(resolve(f.outbox, "team_files", payloads[0])), f.body);
      });
    }
  }
});
