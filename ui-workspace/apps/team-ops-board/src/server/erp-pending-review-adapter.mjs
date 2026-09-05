// 4192 "승인 대기" read projection: GET /erp-pending-reviews.snapshot.json?read_only=1
//
// Loopback GET only. Without TEAM_OPS_ERP_REVIEW_TOKEN_FILE the endpoint is in
// link-only mode: it serves a fixed HOLD projection that still carries the safe
// ERP link, so the Owner can open the ERP "검사 중" filter by hand. With the
// credential file the adapter reads the ERP pending-review list through the
// bounded loopback transport, caches the projection for a short window (each
// upstream read is audited by the ERP), and never exposes the credential, the
// file path, or any error text. Nothing here writes to the ERP.
//
// Tailscale Serve proxies a tailnet peer's request to this host's 127.0.0.1,
// so a loopback socket address alone no longer proves the caller is the
// Owner's own local process (Level 2 review finding M1). The projection this
// endpoint serves therefore never carries a name, title, or any item/project
// identifier: only aggregate counts, a status distribution, the observed-at
// time, and the safe ERP link leave this process. Any request that carries a
// proxy-passage marker header is rejected outright, even from a loopback
// socket.
import { loadErpReviewCredential, isInjectedCredentialPath } from "./erp-review-bearer-file-loader.mjs";
import {
  ERP_REVIEW_DEFAULT_URL,
  buildErpReviewLink,
  createErpLoopbackReviewReadTransport,
} from "./erp-loopback-review-read-transport.mjs";

export const ERP_PENDING_REVIEWS_SNAPSHOT_PATH = "/erp-pending-reviews.snapshot.json";
export const ERP_REVIEW_URL_ENV = "TEAM_OPS_ERP_REVIEW_URL";
export const ERP_REVIEW_TOKEN_FILE_ENV = "TEAM_OPS_ERP_REVIEW_TOKEN_FILE";
export const ERP_PENDING_REVIEW_PROJECTION_SCHEMA = "soulforge.erp_pending_review_read_projection.v1";
export const ERP_REVIEW_DEFAULT_LINK = buildErpReviewLink(ERP_REVIEW_DEFAULT_URL);

const DEFAULT_MIN_REFRESH_MS = 60_000;
const ACCEPTED_ITEM_STATUSES = new Set(["done", "archived"]);
// A proxy hop (Tailscale Serve, or any other reverse proxy landing on this
// loopback port) rewrites the socket-level remoteAddress to 127.0.0.1 but
// leaves one of these behind. Presence of any one is treated as "not a direct
// local caller", regardless of what the socket address says.
const PROXY_MARKER_HEADERS = Object.freeze([
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
  "tailscale-user-login",
]);
export const ERP_REVIEW_PROXIED_REQUEST_REJECTED = "ERP_REVIEW_PROXIED_REQUEST_REJECTED";
const HOLD_CODES = new Set([
  "ERP_REVIEW_UNCONFIGURED",
  "ERP_REVIEW_URL_INVALID",
  "ERP_REVIEW_CREDENTIAL_PATH_INVALID",
  "ERP_REVIEW_CREDENTIAL_MISSING",
  "ERP_REVIEW_CREDENTIAL_INVALID",
  "ERP_REVIEW_DISCONNECTED",
  "ERP_REVIEW_TIMEOUT",
  "ERP_REVIEW_UNAUTHORIZED",
  "ERP_REVIEW_ROUTE_DISABLED",
  "ERP_REVIEW_RATE_LIMITED",
  "ERP_REVIEW_RESPONSE_MALFORMED",
  "ERP_REVIEW_RESPONSE_OVERSIZE",
  ERP_REVIEW_PROXIED_REQUEST_REJECTED,
]);

function emptyCounts() {
  return {
    proposals_pending: 0,
    work_sessions_recent: 0,
    work_sessions_unaccepted: 0,
    work_sessions_status_unknown: 0,
    pending_total: 0,
  };
}

// The Board projection carries counts and a status distribution only. A
// username, item id, project id, proposal id, work-session id, or item title
// is never written here; those stay behind the ERP's own loopback "검사 중"
// filter (post-login, Owner surface). See M1 in the rung1-b review packet.
export function holdProjection(holdCode, link = ERP_REVIEW_DEFAULT_LINK) {
  return {
    schema_version: ERP_PENDING_REVIEW_PROJECTION_SCHEMA,
    read_only: 1,
    refresh_state: "hold",
    observed_at: null,
    erp_link: { url: link, mode: "link_only" },
    counts: emptyCounts(),
    hold_code: HOLD_CODES.has(holdCode) ? holdCode : "ERP_REVIEW_RESPONSE_MALFORMED",
  };
}

export function readyProjection(result, { link, observedAt }) {
  const counts = emptyCounts();
  counts.proposals_pending = result.proposals.length;
  counts.work_sessions_recent = result.work_sessions.length;
  for (const row of result.work_sessions) {
    if (row.item_status === null) counts.work_sessions_status_unknown += 1;
    else if (!ACCEPTED_ITEM_STATUSES.has(row.item_status)) counts.work_sessions_unaccepted += 1;
  }
  counts.pending_total = counts.proposals_pending + counts.work_sessions_unaccepted;
  return {
    schema_version: ERP_PENDING_REVIEW_PROJECTION_SCHEMA,
    read_only: 1,
    refresh_state: "ready",
    observed_at: observedAt,
    erp_link: { url: link, mode: "read_and_link" },
    counts,
    hold_code: null,
  };
}

function writeJson(response, projection) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(projection));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function hasProxyPassageMarker(headers) {
  if (headers === null || typeof headers !== "object") return false;
  return PROXY_MARKER_HEADERS.some((name) => headers[name] !== undefined);
}

function createProjectionReader({ readPending, loadCredential, link, minRefreshMs, now }) {
  if (typeof readPending !== "function" || typeof loadCredential !== "function") return null;
  const refreshWindow = Number.isSafeInteger(minRefreshMs) && minRefreshMs >= 0 && minRefreshMs <= 3_600_000
    ? minRefreshMs
    : DEFAULT_MIN_REFRESH_MS;
  let cached = null;
  let cachedAtMs = null;
  let inFlight = null;

  const refresh = async () => {
    const credential = await loadCredential();
    if (credential?.state !== "ready" || typeof credential.token !== "string") {
      return holdProjection(credential?.hold_code, link);
    }
    try {
      const result = await readPending(credential.token);
      return readyProjection(result, { link, observedAt: new Date(now()).toISOString() });
    } catch (error) {
      return holdProjection(error?.code, link);
    }
  };

  return {
    async readProjection() {
      const nowMs = now();
      if (cached !== null && cachedAtMs !== null && nowMs - cachedAtMs < refreshWindow) return cached;
      if (inFlight === null) {
        inFlight = refresh().then((projection) => {
          cached = projection;
          cachedAtMs = now();
          return projection;
        }).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}

export function createErpPendingReviewAdapterPlugin({
  readPending = null,
  loadCredential = null,
  link = ERP_REVIEW_DEFAULT_LINK,
  minRefreshMs = DEFAULT_MIN_REFRESH_MS,
  now = Date.now,
  unconfiguredHoldCode = "ERP_REVIEW_UNCONFIGURED",
} = {}) {
  const reader = createProjectionReader({ readPending, loadCredential, link, minRefreshMs, now });
  const fixedHold = holdProjection(unconfiguredHoldCode, link);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== ERP_PENDING_REVIEWS_SNAPSHOT_PATH) {
        next();
        return;
      }
      // Loopback/proxy trust is checked before the method, so a proxied or
      // remote caller gets the same fail-closed 403 regardless of verb (M8).
      if (!isLoopbackAddress(request.socket?.remoteAddress) || hasProxyPassageMarker(request.headers)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (url.search !== "?read_only=1") {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (reader === null) {
        writeJson(response, fixedHold);
        return;
      }
      void reader.readProjection().then(
        (projection) => writeJson(response, projection),
        () => writeJson(response, holdProjection("ERP_REVIEW_RESPONSE_MALFORMED", link)),
      );
    });
  };

  return {
    name: "soulforge-erp-pending-review-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export function createErpPendingReviewAdapterPluginFromEnvironment({
  env = process.env,
  httpGet,
  minRefreshMs,
  now = Date.now,
  timeoutMs,
  maxResponseBytes,
  loadCredentialFile = loadErpReviewCredential,
} = {}) {
  let url;
  let tokenFile;
  try {
    url = env?.[ERP_REVIEW_URL_ENV];
    tokenFile = env?.[ERP_REVIEW_TOKEN_FILE_ENV];
  } catch {
    return createErpPendingReviewAdapterPlugin();
  }
  const configuredUrl = typeof url === "string" && url.length > 0 ? url : ERP_REVIEW_DEFAULT_URL;

  let transport;
  try {
    transport = createErpLoopbackReviewReadTransport({ url: configuredUrl, httpGet, timeoutMs, maxResponseBytes });
  } catch {
    // A set-but-invalid URL is reported as such, on the default safe link.
    return createErpPendingReviewAdapterPlugin({ unconfiguredHoldCode: "ERP_REVIEW_URL_INVALID" });
  }
  if (typeof tokenFile !== "string" || tokenFile.length === 0) {
    return createErpPendingReviewAdapterPlugin({ link: transport.link });
  }
  if (!isInjectedCredentialPath(tokenFile)) {
    return createErpPendingReviewAdapterPlugin({
      link: transport.link,
      unconfiguredHoldCode: "ERP_REVIEW_CREDENTIAL_PATH_INVALID",
    });
  }

  return createErpPendingReviewAdapterPlugin({
    readPending: (token) => transport.read(token),
    loadCredential: () => loadCredentialFile({ filePath: tokenFile }),
    link: transport.link,
    minRefreshMs,
    now,
  });
}
