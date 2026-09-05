// loopback-caller-guard.mjs — the one rule that decides whether a request
// reaching a Board loopback-only endpoint came from the Owner's own local
// process. Every read endpoint under src/server/ applies it, before its
// method check, so the header list and the check order live here once.
//
// A loopback socket address alone does not prove the caller is local:
// Tailscale Serve (or any other reverse proxy landing on this loopback port)
// rewrites the socket-level remoteAddress to 127.0.0.1 but leaves one of the
// proxy-passage marker headers behind (Level 2 review finding M1/M8, first
// closed on the ERP pending-review adapter). Presence of any one of them is
// treated as "not a direct local caller", regardless of what the socket
// address says. Only presence is inspected; no header value is read, kept,
// or logged.

export const PROXY_MARKER_HEADERS = Object.freeze([
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
  "tailscale-user-login",
]);

export function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function hasProxyPassageMarker(headers) {
  if (headers === null || typeof headers !== "object") return false;
  return PROXY_MARKER_HEADERS.some((name) => headers[name] !== undefined);
}

// True only for a loopback socket that carries no proxy-passage marker. An
// adapter that gets false answers 403 with an empty body and checks nothing
// else first, so a remote or proxied caller sees the same fail-closed answer
// regardless of verb, path query, or configuration.
export function isDirectLoopbackCaller(request) {
  return isLoopbackAddress(request?.socket?.remoteAddress) && !hasProxyPassageMarker(request?.headers);
}
