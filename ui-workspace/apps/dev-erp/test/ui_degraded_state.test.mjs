import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP_SOURCE = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const INDEX_SOURCE = readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
const CSS_SOURCE = readFileSync(new URL("../static/style.css", import.meta.url), "utf8");

const DOMAIN_GET_CASES = [
  { name: "wiki page", path: "/api/knowledge/wiki/page?ref=missing.md", accepted: [400], responses: [{ status: 400, error: "wiki_page_not_found" }] },
  { name: "context graph", path: "/api/context/graph?project=P99-999", accepted: [400], responses: [{ status: 400, error: "context_not_found" }] },
  { name: "branch story", path: "/api/context/branch_story?project=P99-999&branch=missing", accepted: [400], responses: [{ status: 400, error: "context_not_found" }] },
  { name: "life tree", path: "/api/context/life_tree?project=P99-999", accepted: [400, 403], responses: [
    { status: 400, error: "days_invalid", path: "/api/context/life_tree?project=P99-999&days=0" },
    { status: 403, error: "project_forbidden" },
  ] },
  { name: "mail detail", path: "/api/mail/detail?id=missing", accepted: [403, 404], responses: [
    { status: 403, error: "mail_forbidden", path: "/api/mail/detail?id=foreign" },
    { status: 404, error: "mail_not_found" },
  ] },
  { name: "parts completeness", path: "/api/parts/completeness?part=missing", accepted: [404], responses: [{ status: 404, error: "part_not_found" }] },
  { name: "Codex capabilities", path: "/api/codex-task/capabilities?item_id=missing", accepted: [403, 404], responses: [
    { status: 403, error: "item_forbidden", path: "/api/codex-task/capabilities?item_id=foreign" },
    { status: 404, error: "item_not_found" },
  ] },
  { name: "Codex thread", path: "/api/codex-task/thread?item_id=missing", accepted: [403, 404], responses: [
    { status: 403, error: "codex_workspace_forbidden", path: "/api/codex-task/thread?item_id=foreign" },
    { status: 404, error: "item_not_found" },
  ] },
];

function sourceSlice(from, to) {
  const start = APP_SOURCE.indexOf(from);
  const end = APP_SOURCE.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source slice ${from} -> ${to}`);
  return APP_SOURCE.slice(start, end);
}

function element({ connectionAction = false } = {}) {
  return {
    dataset: {},
    disabled: false,
    hidden: false,
    textContent: "",
    innerHTML: "",
    matches(selector) {
      return connectionAction && selector === "[data-connection-action]";
    },
  };
}

function loadRequestHarness(fetchImpl, { booted = true } = {}) {
  const elements = {
    "#connectionStatus": element(),
    "#connectionTitle": element(),
    "#connectionDetail": element(),
    "#connectionRetry": element({ connectionAction: true }),
    "#viewTitle": element(),
    "#view": element(),
  };
  const control = element();
  const document = {
    body: { dataset: {} },
    querySelector: (selector) => elements[selector] || null,
    querySelectorAll: () => [control],
  };
  const state = {
    connection: { status: "checking", failure: null },
    booted,
    view: "items",
  };
  const requestSource = sourceSlice("const $ = (sel)", "// XSS");
  const mutationSource = sourceSlice("function assertMutationAllowed", "function logView");
  const helpers = Function(
    "state", "document", "fetch", "AbortController", "setTimeout", "clearTimeout", "esc",
    "REQUEST_TIMEOUT_MS", "CHAT_REQUEST_TIMEOUT_MS",
    `${requestSource}\n${mutationSource}\nreturn { api, post, request, setConnectionState, RequestFailure };`,
  )(
    state,
    document,
    fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    (value) => String(value ?? ""),
    15000,
    310000,
  );
  return { ...helpers, state, control, elements };
}

function loadRetryHarness() {
  const state = {
    account: { id: "acct-1" },
    booted: true,
    connection: { status: "network", failure: null },
    view: "projects",
  };
  const calls = [];
  const renderedViews = [];
  const transitions = [];
  class RequestFailure extends Error {}
  const retrySource = sourceSlice("async function retryConnection", "document.addEventListener(\"click\"");
  const { retryConnection } = Function(
    "state", "request", "loadMe", "loadLexicon", "pullServerLayout", "setConnectionState",
    "renderGate", "render", "refreshNotifBadge", "startRefreshLoops", "RequestFailure", "renderConnectionStatus",
    `let reconnecting = false;\n${retrySource}\nreturn { retryConnection };`,
  )(
    state,
    async (path, options) => { calls.push({ path, options }); return { ok: true, status: 200 }; },
    async () => {},
    async () => {},
    async () => { throw new Error("live retry must not repull the initial layout"); },
    (status, failure = null) => { state.connection = { status, failure }; transitions.push(status); },
    () => { throw new Error("authenticated retry must not render the auth gate"); },
    async () => { renderedViews.push(state.view); },
    () => {},
    () => {},
    RequestFailure,
    () => {},
  );
  return { retryConnection, state, calls, renderedViews, transitions };
}

test("degraded request path distinguishes timeout, unauthorized, HTTP, and network failures", async () => {
  const timeoutHarness = loadRequestHarness((_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }));
  await assert.rejects(timeoutHarness.request("/api/slow", { timeoutMs: 1, acceptedDomainStatuses: [400] }), (error) => error.kind === "timeout");
  assert.equal(timeoutHarness.state.connection.status, "timeout");

  const unauthorizedHarness = loadRequestHarness(async () => ({ ok: false, status: 401 }));
  await assert.rejects(unauthorizedHarness.api("/api/private", { acceptedDomainStatuses: [400, 403, 404] }), (error) => error.kind === "unauthorized" && error.status === 401);
  assert.equal(unauthorizedHarness.state.connection.status, "unauthorized");

  const httpHarness = loadRequestHarness(async () => ({ ok: false, status: 503 }));
  await assert.rejects(httpHarness.api("/api/unavailable", { acceptedDomainStatuses: [400, 403, 404] }), (error) => error.kind === "http" && error.status === 503);
  assert.equal(httpHarness.state.connection.status, "http");

  const networkHarness = loadRequestHarness(async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(networkHarness.api("/api/items", { acceptedDomainStatuses: [400] }), (error) => error.kind === "network");
  assert.equal(networkHarness.state.connection.status, "network");
});

test("documented domain GET statuses stay local through exact per-call allowlists", async () => {
  for (const entry of DOMAIN_GET_CASES) {
    for (const { status, error, path = entry.path } of entry.responses) {
      const harness = loadRequestHarness(async () => ({
        ok: false,
        status,
        json: async () => ({ error }),
      }));
      harness.setConnectionState("online");

      const result = await harness.api(path, { acceptedDomainStatuses: entry.accepted });

      assert.deepEqual(result, { error }, `${entry.name} ${status} returns its local domain payload`);
      assert.equal(harness.state.connection.status, "online", `${entry.name} ${status} does not become a global outage`);
      assert.equal(harness.control.disabled, false, `${entry.name} ${status} keeps unrelated controls enabled`);
    }
  }
});

test("exact domain allowlists reject undocumented 4xx and invalid JSON", async () => {
  const unexpectedHarness = loadRequestHarness(async () => ({
    ok: false,
    status: 418,
    json: async () => ({ error: "unexpected_status" }),
  }));
  unexpectedHarness.setConnectionState("online");
  await assert.rejects(
    unexpectedHarness.api("/api/context/graph?project=P26-005", { acceptedDomainStatuses: [400] }),
    (error) => error.kind === "http" && error.status === 418,
  );
  assert.equal(unexpectedHarness.state.connection.status, "http");
  assert.equal(unexpectedHarness.control.disabled, true);

  const invalidJsonHarness = loadRequestHarness(async () => ({
    ok: false,
    status: 404,
    json: async () => { throw new SyntaxError("invalid JSON"); },
  }));
  invalidJsonHarness.setConnectionState("online");
  await assert.rejects(
    invalidJsonHarness.api("/api/mail/detail?id=missing", { acceptedDomainStatuses: [403, 404] }),
    (error) => error.kind === "http" && error.message === "invalid_json_response",
  );
  assert.equal(invalidJsonHarness.state.connection.status, "http");
  assert.equal(invalidJsonHarness.control.disabled, true);
});

test("domain GET consumers declare exact statuses and retain their existing local fallback", () => {
  const consumers = [
    {
      name: "wiki page viewer", from: "async function renderKnowWiki", to: "async function renderKnowTrunk",
      call: 'api(`/api/knowledge/wiki/page?ref=${encodeURIComponent(tr.dataset.ref)}`, { acceptedDomainStatuses: [400] })',
      fallback: "if (!r || r.error)",
    },
    {
      name: "knowledge trunk", from: "async function renderKnowTrunk", to: "async function hubTrunk",
      call: 'api(`/api/context/graph?project=${encodeURIComponent(cur)}`, { acceptedDomainStatuses: [400] })',
      fallback: "if (!g || g.error)",
    },
    {
      name: "hub trunk", from: "async function hubTrunk", to: "function trunkTypeLabel",
      call: 'api(`/api/context/graph?project=${encodeURIComponent(p.id)}`, { acceptedDomainStatuses: [400] })',
      fallback: "if (!g || g.error)",
    },
    {
      name: "life-tree story", from: "async function lifeTreeOpenStory", to: "function wireLifeTreeActions",
      call: 'api(`/api/context/branch_story?project=${encodeURIComponent(g.project)}&branch=${encodeURIComponent(branchKey)}`, { acceptedDomainStatuses: [400] })',
      fallback: "!story || story.error",
    },
    {
      name: "map story", from: "function drawTrunkMap", to: "function drawTrunkTree",
      call: 'api(`/api/context/branch_story?project=${encodeURIComponent(g.project)}&branch=${encodeURIComponent(key)}`, { acceptedDomainStatuses: [400] })',
      fallback: "story && !story.error",
    },
    {
      name: "life tree", from: "async function drawTrunkLifeTree", to: "function trunkHeatmapHtml",
      call: "api(lifeTreeRequestPath(g.project, config), { acceptedDomainStatuses: [400, 403] })",
      fallback: "if (!raw || raw.error)",
    },
    {
      name: "quick-edit mail", from: "async function openItemQuickEdit", to: "async function renderKnowledge",
      call: 'api("/api/mail/detail?id=" + encodeURIComponent(info.origin_mail_id), { acceptedDomainStatuses: [403, 404] })',
      fallback: "if (m?.error) throw new Error(m.error)",
    },
    {
      name: "mail page detail", from: "async function renderMail", to: "function mailPromoteErrorText",
      call: 'api(`/api/mail/detail?id=${encodeURIComponent(sel.id)}`, { acceptedDomainStatuses: [403, 404] })',
      fallback: "if (detailMail?.error) throw new Error(detailMail.error)",
    },
    {
      name: "parts completeness", from: "async function renderBoards", to: "async function renderStockwatch",
      call: 'api(`/api/parts/completeness?part=${encodeURIComponent(sel)}`, { acceptedDomainStatuses: [404] })',
      fallback: "sel && comp && comp.required",
    },
    {
      name: "Codex capabilities", from: "const loadCapabilities = async", to: "const renderAttachments",
      call: 'api(`/api/codex-task/capabilities?item_id=${encodeURIComponent(itemId)}`, { acceptedDomainStatuses: [403, 404] })',
      fallback: "if (nextCapabilities?.error) throw new Error(nextCapabilities.error)",
    },
    {
      name: "Codex thread", from: "const load = async", to: "const ensureCodexThread",
      call: 'api(`/api/codex-task/thread?item_id=${encodeURIComponent(itemId)}`, { acceptedDomainStatuses: [403, 404] })',
      fallback: "if (nextPayload?.error) throw new Error(nextPayload.error)",
    },
  ];

  for (const consumer of consumers) {
    const block = sourceSlice(consumer.from, consumer.to);
    assert.ok(block.includes(consumer.call), `${consumer.name} owns only its documented domain statuses`);
    assert.ok(block.includes(consumer.fallback), `${consumer.name} keeps its local fallback`);
  }

  const boardBlock = sourceSlice("async function renderBoards", "async function renderStockwatch");
  assert.ok(boardBlock.includes("if (state.bomBoard && !selectedBoard) state.bomBoard = sel"),
    "a stale board selection is replaced only from the current board source list");
  assert.doesNotMatch(APP_SOURCE, /acceptedDomainStatuses:\s*true|acceptedDomainStatuses:\s*\[\s*418\s*\]/,
    "the exact-status option has no blanket or undocumented 418 acceptance");
});

test("proposal GET is skipped for members and shared consumers use the local empty queue", async () => {
  const helperSource = sourceSlice("async function loadProposalsForCurrentAccount", "async function renderProposals");
  const makeLoader = (account, apiImpl) => Function(
    "state", "api",
    `${helperSource}\nreturn loadProposalsForCurrentAccount;`,
  )({ account }, apiImpl);

  let memberCalls = 0;
  const memberLoader = makeLoader({ id: "member-1", is_admin: false }, async () => { memberCalls += 1; return []; });
  assert.deepEqual(await memberLoader(), []);
  assert.equal(memberCalls, 0, "ordinary members do not request the admin-only proposal queue");

  const adminCalls = [];
  const adminLoader = makeLoader({ id: "admin-1", is_admin: true }, async (path, options) => {
    adminCalls.push({ path, options });
    return [{ id: "prop-1" }];
  });
  assert.deepEqual(await adminLoader(), [{ id: "prop-1" }]);
  assert.deepEqual(adminCalls, [{ path: "/api/proposals", options: { acceptedDomainStatuses: [403] } }]);

  const staleAdminLoader = makeLoader({ id: "admin-2", is_admin: true }, async () => ({ error: "admin_only" }));
  assert.deepEqual(await staleAdminLoader(), [], "a stale client-side admin flag still renders the local empty state");

  for (const [name, from, to] of [
    ["proposal page", "async function renderProposals", "async function renderEmbeds"],
    ["home widget", "async function widgetBody", "const widgetSearchHtml"],
    ["gate page", "async function renderGates", "async function renderSchedule"],
    ["notification loop", "async function loadNotifications", "function refreshNotifBadge"],
  ]) {
    const block = sourceSlice(from, to);
    assert.match(block, /loadProposalsForCurrentAccount\(\)/, `${name} uses the account-aware proposal loader`);
    assert.doesNotMatch(block, /api\("\/api\/proposals"\)/, `${name} has no direct admin-only GET`);
  }
});

test("cold failure renders recovery UI and known degraded state fails writes closed", async () => {
  let fetchCount = 0;
  const harness = loadRequestHarness(async () => {
    fetchCount += 1;
    throw new TypeError("server down");
  }, { booted: false });

  await assert.rejects(harness.api("/api/lexicon"), (error) => error.kind === "network");
  assert.match(harness.elements["#view"].innerHTML, /connection-recovery/);
  assert.match(harness.elements["#view"].innerHTML, /다시 연결/);
  assert.equal(harness.control.disabled, true, "interactive controls are disabled while degraded");

  const beforePost = fetchCount;
  await assert.rejects(harness.post("/api/items", { title: "must not leave browser" }), (error) => error.kind === "network");
  assert.equal(fetchCount, beforePost, "known-offline POST is rejected before fetch");

  harness.setConnectionState("online");
  assert.equal(harness.control.disabled, false, "controls disabled by connection guard are restored after recovery");
});

test("live failure preserves the current screen while disabling writes", async () => {
  const harness = loadRequestHarness(async () => { throw new TypeError("server down"); });
  harness.elements["#viewTitle"].textContent = "진행 중인 할 일";
  harness.elements["#view"].innerHTML = "<p>unsaved local context</p>";

  await assert.rejects(harness.api("/api/items"), (error) => error.kind === "network");

  assert.equal(harness.state.view, "items");
  assert.equal(harness.elements["#viewTitle"].textContent, "진행 중인 할 일");
  assert.equal(harness.elements["#view"].innerHTML, "<p>unsaved local context</p>");
  assert.equal(harness.control.disabled, true);
});

test("transport wrapper covers JSON POST, PUT, and bounded raw upload", async () => {
  const calls = [];
  const harness = loadRequestHarness(async (path, options) => {
    calls.push({ path, options });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  harness.setConnectionState("online");

  await harness.post("/api/items", { title: "wrapped POST" });
  await harness.request("/api/dashboard/layout", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ layout: [] }),
    acceptHttpError: true,
  });
  const uploadBody = new Uint8Array([1, 2, 3]);
  await harness.request("/api/codex-task/attachment", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: uploadBody,
    timeoutMs: 120000,
    acceptHttpError: true,
  });

  assert.deepEqual(calls.map((call) => call.options.method), ["POST", "PUT", "POST"]);
  assert.equal(calls[2].options.body, uploadBody);
  assert.ok(calls.every((call) => call.options.cache === "no-store"));

  const uploadTimeoutHarness = loadRequestHarness((_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }));
  uploadTimeoutHarness.setConnectionState("online");
  await assert.rejects(uploadTimeoutHarness.request("/api/deliverables/inputs/upload", {
    method: "POST",
    body: new Uint8Array([4, 5, 6]),
    timeoutMs: 1,
    acceptHttpError: true,
  }), (error) => error.kind === "timeout");
  assert.equal(uploadTimeoutHarness.state.connection.status, "timeout");
});

test("invalid-login 401 remains retryable while an expired-session 401 fails closed", async () => {
  const calls = [];
  const harness = loadRequestHarness(async (path, options) => {
    calls.push({ path, options });
    return { ok: false, status: 401 };
  });
  harness.setConnectionState("online");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await harness.request("/api/auth/login", {
      method: "POST",
      body: "{}",
      acceptHttpError: true,
      retryableUnauthorized: true,
    });
    assert.equal(response.status, 401);
    assert.equal(harness.state.connection.status, "online", "invalid credentials do not become a global outage");
    assert.equal(harness.control.disabled, false, "the login form remains enabled for another attempt");
  }
  assert.equal(calls.length, 2, "the second credential attempt reaches the server");

  await assert.rejects(harness.api("/api/private"), (error) => error.kind === "unauthorized");
  assert.equal(harness.state.connection.status, "unauthorized");
  assert.equal(harness.control.disabled, true, "an expired session disables mutation controls");

  const beforeBlockedMutation = calls.length;
  await assert.rejects(harness.request("/api/dashboard/layout", {
    method: "PUT",
    body: "{}",
    acceptHttpError: true,
  }), (error) => error.kind === "unauthorized");
  assert.equal(calls.length, beforeBlockedMutation, "a mutation after session expiry makes zero network calls");
});

test("first mutation network outage makes the next mutation perform zero network calls", async () => {
  let fetchCount = 0;
  const harness = loadRequestHarness(async () => {
    fetchCount += 1;
    throw new TypeError("server down");
  });
  harness.setConnectionState("online");

  await assert.rejects(harness.post("/api/items", { title: "first" }), (error) => error.kind === "network");
  assert.equal(fetchCount, 1);
  await assert.rejects(harness.request("/api/dashboard/layout", {
    method: "PUT",
    body: "{}",
    acceptHttpError: true,
  }), (error) => error.kind === "network");
  assert.equal(fetchCount, 1, "transport guard blocks the second mutation before fetch");
});

test("successful live retry rerenders without changing state.view", async () => {
  const harness = loadRetryHarness();

  await harness.retryConnection();

  assert.equal(harness.state.view, "projects");
  assert.deepEqual(harness.renderedViews, ["projects"]);
  assert.deepEqual(harness.calls.map((call) => call.path), ["/api/health"]);
  assert.deepEqual(harness.transitions, ["checking", "online"]);
});

test("recovery surface is static-first, reconnectable, live-aware, and does not cache API payloads", () => {
  assert.match(INDEX_SOURCE, /id="connectionStatus"[^>]*aria-live="assertive"/);
  assert.match(INDEX_SOURCE, /id="connectionRetry"[^>]*data-connection-action/);
  assert.match(APP_SOURCE, /async function retryConnection\(\)/);
  assert.match(APP_SOURCE, /window\.addEventListener\("offline"/);
  assert.match(APP_SOURCE, /window\.addEventListener\("online"/);
  assert.match(APP_SOURCE, /request\("\/api\/health", \{ timeoutMs: 5000 \}\)/);
  assert.match(APP_SOURCE, /cache: "no-store"/);
  assert.match(APP_SOURCE, /function assertMutationAllowed/);
  assert.match(APP_SOURCE, /state\.connection\.status === "online"/);
  assert.match(CSS_SOURCE, /\[data-connection-disabled="1"\]/);
  assert.equal(APP_SOURCE.match(/\bfetch\s*\(/g)?.length, 1, "only the audited request wrapper may call fetch");
  assert.match(sourceSlice("async function request", "const api"), /response = await fetch\(path/);
  for (const endpoint of [
    "/api/auth/logout",
    "/api/auth/login",
    "/api/auth/bootstrap",
    "/api/dashboard/layout",
  ]) {
    assert.match(APP_SOURCE, new RegExp(`request\\([^\\n]*${endpoint.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")}`), `${endpoint} uses request wrapper`);
  }
  const gateAuthBlock = sourceSlice("async function submit()", "document.body.appendChild(gate)");
  assert.match(gateAuthBlock, /\/api\/auth\/register/);
  assert.match(gateAuthBlock, /request\(ep, \{/);
  assert.equal(APP_SOURCE.match(/retryableUnauthorized: true/g)?.length, 4,
    "modal login/bootstrap plus gate login/bootstrap/register preserve retryable auth-form failures");
  const deliverableUploadBlock = sourceSlice("const url = `/api/deliverables/inputs/upload", "await loadSubs()");
  const codexUploadBlock = sourceSlice("const uploadStagedImages = async", "const currentSkillToken");
  assert.match(deliverableUploadBlock, /request\(url, \{/);
  assert.match(codexUploadBlock, /request\(url, \{/);
  assert.match(APP_SOURCE, /UPLOAD_REQUEST_TIMEOUT_MS = 120000/);
  assert.equal(APP_SOURCE.match(/timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS/g)?.length, 2, "both binary upload paths use bounded longer timeout");

  const retryBlock = sourceSlice("async function retryConnection", "document.addEventListener(\"click\"");
  assert(retryBlock.indexOf('request("/api/health"') < retryBlock.indexOf("await loadMe()"));
  assert(retryBlock.indexOf("await loadMe()") < retryBlock.indexOf("await loadLexicon()"));
  assert(retryBlock.indexOf('setConnectionState("online")') < retryBlock.indexOf("await render()"));
  assert(retryBlock.indexOf('setConnectionState("online")') < retryBlock.indexOf("renderGate()"),
    "health bootstrap reaches online before auth controls are rendered");
  assert.doesNotMatch(retryBlock, /state\.view\s*=/, "reconnect rerenders the current view instead of changing it");

  const degradedBlock = sourceSlice("class RequestFailure", "// XSS");
  assert.doesNotMatch(degradedBlock, /localStorage|sessionStorage|caches\.|serviceWorker/,
    "connection state and response data stay in memory and API requests bypass browser cache");
});
