import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_USAGE_PROJECTION_CACHE_TTL_MS,
  AI_USAGE_SNAPSHOT_PATH,
  createAiUsageProjectionRequest
} from "./ai-usage-projection-request.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test("AI usage projection request: one fetch serves a StrictMode-style remount", async () => {
  const response = deferred();
  const calls = [];
  const request = createAiUsageProjectionRequest((path, options) => {
    calls.push({ path, options });
    return response.promise;
  });
  const firstConsumer = new AbortController();
  const firstResult = request.load({ signal: firstConsumer.signal });

  assert.equal(calls.length, 1);
  firstConsumer.abort();
  const remountedResult = request.load();
  await assert.rejects(firstResult, { name: "AbortError" });

  response.resolve({
    ok: true,
    json: async () => ({})
  });
  assert.equal((await remountedResult).state, "invalid");
  assert.equal((await request.load()).state, "invalid");
  assert.equal(calls.length, 1);
});

test("AI usage projection request: fetch is local, credential-free, and redirect-blocked", async () => {
  const calls = [];
  const request = createAiUsageProjectionRequest((path, options) => {
    calls.push({ path, options });
    return Promise.resolve({ ok: false });
  });

  assert.equal((await request.load()).state, "unmeasured");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, AI_USAGE_SNAPSHOT_PATH);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.mode, "same-origin");
  assert.equal(calls[0].options.redirect, "error");
});

test("AI usage projection request: explicit refresh invalidates the cached snapshot", async () => {
  const calls = [];
  const request = createAiUsageProjectionRequest((path) => {
    calls.push(path);
    return Promise.resolve({ ok: true, json: async () => null });
  });

  await request.load();
  await request.load();
  await request.load({ force: true });
  assert.deepEqual(calls, [AI_USAGE_SNAPSHOT_PATH, `${AI_USAGE_SNAPSHOT_PATH}?refresh=1`]);
});

test("AI usage projection request: automatic polling refetches after the bounded cache expires", async () => {
  let clock = 1_000;
  const calls = [];
  const request = createAiUsageProjectionRequest((path) => {
    calls.push(path);
    return Promise.resolve({ ok: true, json: async () => null });
  }, { now: () => clock });

  await request.load();
  clock += AI_USAGE_PROJECTION_CACHE_TTL_MS - 1;
  await request.load();
  clock += 1;
  await request.load();

  assert.deepEqual(calls, [AI_USAGE_SNAPSHOT_PATH, AI_USAGE_SNAPSHOT_PATH]);
});
