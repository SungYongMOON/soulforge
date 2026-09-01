// Mirrors deployment_pack_contract.mjs's strict pack semver. Importing that
// deployment-owner module into the ERP runtime would create a reverse runtime
// dependency, so this exact shape is pinned by runtime_checkout.test.mjs.
const SERVER_PACK_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DEVELOPMENT_ONLY_SEGMENTS = new Set(["dev", "source_checkout"]);

function pathSegments(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.split(/[\\/]+/);
  // This is a classification boundary, not a path resolver. A traversal or
  // current-directory segment must not disappear through normalization and
  // accidentally become an admitted runtime shape.
  if (raw.some((segment) => segment === "." || segment === "..")) return null;
  return raw.filter(Boolean);
}

function hasVersionedServerPackPayload(segments) {
  for (let index = 0; index + 3 < segments.length; index += 1) {
    if (segments[index].toLowerCase() !== "install") continue;
    if (segments[index + 1].toLowerCase() !== "server-pack") continue;
    if (!SERVER_PACK_VERSION.test(segments[index + 2])) continue;
    if (segments[index + 3].toLowerCase() !== "payload") continue;
    return true;
  }
  return false;
}

/**
 * Returns true only for the legacy runtime root or a versioned installed
 * server-pack payload. This is path-shape recognition; it never probes the
 * filesystem or treats a development checkout as a runtime release.
 */
export function isRuntimeCheckout(value) {
  const segments = pathSegments(value);
  if (segments === null) return false;
  if (segments.some((segment) => DEVELOPMENT_ONLY_SEGMENTS.has(segment.toLowerCase()))) return false;
  return segments.some((segment) => segment.toLowerCase() === "soulforge-runtime")
    || hasVersionedServerPackPayload(segments);
}
