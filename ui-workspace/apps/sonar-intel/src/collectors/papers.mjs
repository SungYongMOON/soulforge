// Bounded metadata collectors. No browser, fulltext, account provisioning or scheduler.
import { computeStableId } from "../store.mjs";
import { sourceContract, contractSnapshot, digest, CONTRACT_VERSION } from "./source_contract.mjs";

export const PAPER_LIMITS = Object.freeze({ pages: 4, records: 400, pageBytes: 2 * 1024 * 1024, timeoutMs: 10000, elapsedMs: 60000, retries: 2, retryDelayMs: 8000 });
const endpoints = { openalex: "https://api.openalex.org/works", semantic_scholar: "https://api.semanticscholar.org/graph/v1/paper/search/bulk" };
const activeBudgets = new WeakSet();
const failure = (code) => Object.assign(new Error(code), { code });
const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const day = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value ? `${value}T00:00:00.000Z` : null;

export function normalizeDoi(value) {
  if (typeof value !== "string" || value.length > 300) return null;
  const doi = value.replace(/^https:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
  return /^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/.test(doi) ? doi : null;
}

export function normalizePaper(source, row, { contract, fetchedAt, queryDigest }) {
  if (!contract?.executable) return null;
  if (!row || typeof row.title !== "string" || !row.title.trim() || row.title.length > 2000) return null;
  const sourceId = source === "openalex" ? row.id?.match(/^https:\/\/openalex\.org\/(W\d+)$/)?.[1] : typeof row.paperId === "string" && /^[a-f0-9]{40}$/.test(row.paperId) ? row.paperId : null;
  if (!sourceId) return null;
  const doi = normalizeDoi(source === "openalex" ? row.doi : row.externalIds?.DOI);
  let publishedAt = null;
  try { publishedAt = day(source === "openalex" ? row.publication_date : row.publicationDate); } catch { /* Invalid dates stay unknown. */ }
  const url = source === "openalex" ? `https://openalex.org/${sourceId}` : `https://www.semanticscholar.org/paper/${sourceId}`;
  const record = {
    id: computeStableId(source, sourceId), source, type: "paper", title: row.title.trim(), url, summary: null,
    publishedAt, fetchedAt, keywordsMatched: [],
    meta: { identifiers: { sourceId, doi }, dates: { priorityAt: null, publicationAt: publishedAt, availableAt: null },
      provenance: { version: CONTRACT_VERSION, source, contractDigest: contract.contractDigest, contract: contractSnapshot(contract), queryDigest } },
  };
  record.meta.provenance.recordDigest = digest([record.source, record.type, record.title, record.summary, record.url, record.publishedAt, record.meta.identifiers]);
  return record;
}

/** A caller-owned, durable reservation journal is mandatory for every attempt,
 * including retries. This function never invents an allowance or refreshes it
 * at a calendar boundary. A fresh account observation is needed after expiry.
 * reserve() must atomically persist the returned balance before resolving.
 */
function validateBudget(budget, contract, now) {
  const state = budget?.state;
  if (!state || typeof budget.reserve !== "function" || state.contractDigest !== contract.contractDigest || !iso(state.observedAt) || !iso(state.resetAt)
    || state.observedAt > now || now >= state.resetAt || !finite(state.remaining) || !finite(state.requestCeiling) || state.requestCeiling <= 0
    || !Number.isSafeInteger(state.remainingRequests) || state.remainingRequests < 0 || state.unit !== contract.budget.unit) throw failure("budget_unconfirmed_or_expired");
  if (state.remainingRequests < 1 || state.remaining < state.requestCeiling) throw failure("budget_exhausted");
}

function requestUrl(source, endpoint, query, cursor, pageSize) {
  const url = new URL(endpoint);
  if (source === "openalex") {
    url.searchParams.set("search", query); url.searchParams.set("per_page", String(pageSize));
    url.searchParams.set("select", "id,doi,title,publication_date"); url.searchParams.set("cursor", cursor ?? "*");
  } else {
    url.searchParams.set("query", query); url.searchParams.set("fields", "title,publicationDate,externalIds");
    if (cursor) url.searchParams.set("token", cursor);
  }
  return url;
}

async function boundedJson(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) { await response.body?.cancel(); throw failure("response_byte_limit"); }
  if (!response.body) throw failure("invalid_response");
  const reader = response.body.getReader(); let total = 0; const chunks = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > maxBytes) throw failure("response_byte_limit"); chunks.push(value); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw failure("invalid_json"); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

const admittedCodes = new Set(["authorization_changed", "authorization_revoked", "credential_missing", "budget_in_use", "budget_unconfirmed_or_expired", "budget_exhausted", "budget_reservation_failed", "provider_budget_headers_invalid", "provider_budget_exhausted", "redirect_denied", "authorization_denied", "http_failed", "retry_later", "retry_exhausted", "timeout", "transport_failed", "response_byte_limit", "invalid_response", "invalid_json", "pagination_cycle", "elapsed_limit", "page_limit", "record_limit", "invalid_options", "invalid_endpoint", "store_failed"]);

/** Defaults remain OFF. fixtureEndpoint is an explicit loopback-only transport
 * seam; synthetic authorization never opens an external fixture destination.
 */
export async function collectPapers({ source, config = {}, authorizationProvider = () => config, query, budget, apiKey, store = null,
  fixtureEndpoint = null, fetchImpl = fetch, now = () => Date.now(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), limits = {} } = {}) {
  const start = now(); const initial = sourceContract(source, authorizationProvider(), new Date(start).toISOString());
  const receipt = { source, contractDigest: initial.contractDigest, startedAt: new Date(start).toISOString(), finishedAt: null, state: "off", reasons: initial.reasons,
    attemptedRequests: 0, pages: 0, fetched: null, stored: null, deduped: null, invalidRecords: 0, error: null, queryDigest: null, endpoint: endpoints[source] ?? null,
    storage: "app_owned_working_metadata", acceptance: "not_canonical_acceptance", truncated: false, stopReason: null };
  const finish = (state, records = []) => { receipt.state = state; receipt.finishedAt = new Date(now()).toISOString(); return { records, receipt }; };
  if (!initial.executable) return finish("off");
  const cap = { ...PAPER_LIMITS, ...limits };
  let records = []; const seen = new Set(); let previousRequestAt = null; let ownsBudget = false;
  try {
    if (!budget || typeof budget !== "object") throw failure("budget_unconfirmed_or_expired");
    if (activeBudgets.has(budget)) throw failure("budget_in_use");
    activeBudgets.add(budget); ownsBudget = true;
    if (!endpoints[source] || typeof query !== "string" || !query.trim() || query.length > 512 || Object.keys(limits).some((key) => !Object.hasOwn(PAPER_LIMITS, key)) || Object.entries(cap).some(([key, value]) => !Number.isInteger(value) || value < (key === "retries" ? 0 : 1) || value > PAPER_LIMITS[key])) throw failure("invalid_options");
    receipt.queryDigest = digest(query);
    let endpoint = endpoints[source];
    if (initial.account.evidenceScope === "synthetic_fixture" && !fixtureEndpoint) throw failure("invalid_endpoint");
    if (source === "semantic_scholar" && (typeof apiKey !== "string" || !apiKey)) throw failure("credential_missing");
    if (fixtureEndpoint) {
      const fixture = new URL(fixtureEndpoint);
      if (fixture.protocol !== "http:" || fixture.hostname !== "127.0.0.1" || !fixture.port || fixture.username || fixture.password || fixture.search || fixture.hash) throw failure("invalid_endpoint");
      endpoint = fixture.href;
      receipt.endpoint = "synthetic_loopback_fixture";
    }
    const check = () => {
      if (now() - start >= cap.elapsedMs) throw failure("elapsed_limit");
      const current = sourceContract(source, authorizationProvider(), new Date(now()).toISOString());
      if (current.account.state === "revoked") throw failure("authorization_revoked");
      if (!current.executable || current.contractDigest !== initial.contractDigest) throw failure("authorization_changed");
      return current;
    };
    let cursor = null; const cursors = new Set(); let done = false;
    while (!done && receipt.pages < cap.pages) {
      let payload;
      for (let attempt = 0; ; attempt++) {
        check(); validateBudget(budget, initial, new Date(now()).toISOString());
        if (previousRequestAt !== null) {
          const delay = Math.max(0, 1000 - (now() - previousRequestAt));
          if (now() - start + delay >= cap.elapsedMs) throw failure("elapsed_limit");
          if (delay) await wait(delay);
        }
        check(); validateBudget(budget, initial, new Date(now()).toISOString());
        const nextState = { ...budget.state, remainingRequests: budget.state.remainingRequests - 1, remaining: budget.state.remaining - budget.state.requestCeiling };
        try { await budget.reserve(nextState); budget.state = nextState; } catch { throw failure("budget_reservation_failed"); }
        check(); receipt.attemptedRequests++; previousRequestAt = now();
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Math.min(cap.timeoutMs, cap.elapsedMs - (now() - start)));
        let response;
        try {
          const headers = { Accept: "application/json" };
          if (apiKey) headers[source === "openalex" ? "Authorization" : "x-api-key"] = source === "openalex" ? `Bearer ${apiKey}` : apiKey;
          response = await fetchImpl(requestUrl(source, endpoint, query, cursor, Math.min(100, cap.records - records.length)), { headers, redirect: "manual", signal: controller.signal });
          check();
          if (response.status >= 300 && response.status < 400) throw failure("redirect_denied");
          if ([401, 403].includes(response.status)) throw failure("authorization_denied");
          if (source === "openalex") {
            const remaining = response.headers.get("x-ratelimit-remaining"); const reset = response.headers.get("x-ratelimit-reset"); const used = response.headers.get("x-ratelimit-credits-used");
            if (remaining === null || reset === null || used === null || !finite(Number(remaining)) || !finite(Number(reset)) || !finite(Number(used)) || Number(used) > budget.state.requestCeiling) throw failure("provider_budget_headers_invalid");
            // Never replenish a caller reservation from headers; only tighten it.
            const tightened = { ...budget.state, remaining: Math.min(budget.state.remaining, Number(remaining)), resetAt: new Date(Math.min(Date.parse(budget.state.resetAt), now() + Number(reset) * 1000)).toISOString() };
            try { await budget.reserve(tightened); budget.state = tightened; } catch { throw failure("budget_reservation_failed"); }
            if (response.status === 429 && Number(remaining) === 0) throw failure("provider_budget_exhausted");
          }
          if (response.status === 429 || response.status >= 500) {
            if (attempt >= cap.retries) throw failure("retry_exhausted");
            const retryHeader = response.headers.get("retry-after");
            const retryMs = retryHeader === null ? 1000 * 2 ** attempt : /^\d+(?:\.\d+)?$/.test(retryHeader) ? Number(retryHeader) * 1000 : Date.parse(retryHeader) - now();
            if (!Number.isFinite(retryMs) || retryMs > cap.retryDelayMs || now() - start + Math.max(0, retryMs) >= cap.elapsedMs) throw failure("retry_later");
            await response.body?.cancel(); clearTimeout(timeout); await wait(Math.max(0, retryMs)); continue;
          }
          if (!response.ok) throw failure("http_failed");
          payload = await boundedJson(response, cap.pageBytes); check(); break;
        } catch (error) {
          if (error.code && admittedCodes.has(error.code)) throw error;
          throw failure(controller.signal.aborted ? "timeout" : "transport_failed");
        } finally { clearTimeout(timeout); await response?.body?.cancel().catch(() => {}); }
      }
      receipt.pages++;
      const rows = source === "openalex" ? payload?.results : payload?.data;
      const next = source === "openalex" ? payload?.meta?.next_cursor : payload?.token;
      if (!Array.isArray(rows) || rows.length > (source === "openalex" ? 100 : 1000) || (next != null && (typeof next !== "string" || !next || next.length > 4096))) throw failure("invalid_response");
      for (const row of rows) {
        const record = normalizePaper(source, row, { contract: initial, fetchedAt: new Date(now()).toISOString(), queryDigest: receipt.queryDigest });
        if (!record) { receipt.invalidRecords++; continue; }
        if (seen.has(record.id)) { receipt.deduped = (receipt.deduped ?? 0) + 1; continue; }
        if (records.length >= cap.records) { receipt.truncated = true; receipt.stopReason = "record_limit"; break; }
        seen.add(record.id); records.push(record);
      }
      if (records.length === cap.records && next != null) { receipt.truncated = true; receipt.stopReason = "record_limit"; }
      if (receipt.truncated || next == null) done = true;
      else { if (cursors.has(next)) throw failure("pagination_cycle"); cursors.add(next); cursor = next; }
    }
    if (!done) { receipt.truncated = true; receipt.stopReason = "page_limit"; }
    check();
    receipt.fetched = records.length; receipt.stored = 0; receipt.deduped ??= 0;
    if (store) {
      for (const record of records) {
        check();
        try { const result = store.upsertItem(record); if (result.status === "duplicate") receipt.deduped++; else receipt.stored++; } catch { throw failure("store_failed"); }
      }
    }
    return finish(receipt.truncated ? "bounded_partial" : records.length ? "collected" : "no_data", records);
  } catch (error) {
    // Never copy exception messages, headers, request URLs, continuation tokens or response bodies.
    receipt.error = admittedCodes.has(error.code) ? error.code : "invalid_options";
    receipt.fetched ??= records.length || null;
    return finish("collection_failed");
  } finally { if (ownsBudget) activeBudgets.delete(budget); }
}
