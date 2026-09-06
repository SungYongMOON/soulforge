// Shared caller-trust check for every loopback read endpoint the Board
// (Vigil, port 4192) registers under src/server/*-adapter.mjs.
//
// A loopback socket address alone does not prove the caller is the Owner's
// own local process. Tailscale Serve (or any other reverse proxy landing on
// this loopback port) rewrites the socket-level remoteAddress to 127.0.0.1 for
// a tailnet peer's request, but leaves one of the proxy-passage marker headers
// below behind. A direct local request carries none of them, so the presence
// of any one is treated as "not a direct local caller", regardless of what the
// socket address says (Level 2 review finding M1 on the ERP pending-review
// endpoint, 2026-09-05; generalised to every adapter after the 2026-09-06
// cross-adapter finding). Each adapter answers such a request with the same
// fail-closed 403 it already used for a non-loopback socket, at the same point
// in its request handling.
//
// This module is dependency-free and pure so the cross-adapter test
// (loopback-request-guard.test.mjs) can prove that every middleware in this
// directory consumes it, and that a future adapter cannot skip it silently.

export const PROXY_PASSAGE_MARKER_HEADERS = Object.freeze([
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
  "tailscale-user-login",
]);

export function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

// Node lower-cases incoming header names, so the marker list matches
// case-insensitively by construction. A marker present with an empty value
// still counts as present.
export function hasProxyPassageMarker(headers) {
  if (headers === null || typeof headers !== "object") return false;
  return PROXY_PASSAGE_MARKER_HEADERS.some((name) => headers[name] !== undefined);
}

// The one predicate the adapters gate on: a loopback socket address AND no
// proxy-passage marker. A missing socket or headers object fails closed.
export function isDirectLoopbackRequest(request) {
  return isLoopbackAddress(request?.socket?.remoteAddress) && !hasProxyPassageMarker(request?.headers);
}
