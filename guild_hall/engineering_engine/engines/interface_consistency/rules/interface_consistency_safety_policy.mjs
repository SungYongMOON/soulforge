// One local policy owner for public/private and secret-shaped string sentinels used by
// compiler, evaluator, schemas, and candidate public metadata. Markers are deliberately
// substring-sensitive: public identifiers may not carry a credential/path fragment merely
// because it is prefixed or suffixed with another token.
export const INTERFACE_CONSISTENCY_POSIX_PATH_PATTERN = /\/(?:home|users|tmp|etc|var|usr|root|opt|srv|mnt|media|workspace|workspaces|private|data)(?:\/|$)/iu;
export const INTERFACE_CONSISTENCY_WINDOWS_DRIVE_PATH_PATTERN = /[A-Za-z]:[\\/]/u;

export const INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /_workspaces(?:[\\/]|$)/iu,
  /_workmeta(?:[\\/]|$)/iu,
  /private-state(?:[\\/]|$)/iu,
  INTERFACE_CONSISTENCY_WINDOWS_DRIVE_PATH_PATTERN,
  /\\\\[^\\/\s]+[\\/][^\\/\s]+/u,
  INTERFACE_CONSISTENCY_POSIX_PATH_PATTERN,
  /file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/iu,
  /(?:secret|password|passwd|bearer|api[_-]?key|access[_-]?token|refresh[_-]?token|credential|pem)/iu,
  /(?:sk-(?:proj-)?|ghp_|github_pat_|xox[baprs]-|AIza)/iu,
]);

const PUBLIC_HTTP_URL = /^https?:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?$/iu;

export function interfaceConsistencyStringHasForbiddenMarker(value) {
  if (typeof value !== "string") return true;
  const isOfficialHttpUrl = PUBLIC_HTTP_URL.test(value);
  return INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS.some((pattern) => (
    isOfficialHttpUrl && (pattern === INTERFACE_CONSISTENCY_POSIX_PATH_PATTERN
      || pattern === INTERFACE_CONSISTENCY_WINDOWS_DRIVE_PATH_PATTERN)
      ? false
      : pattern.test(value)
  ));
}

export const INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
export const INTERFACE_CONSISTENCY_SAFE_SOURCE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/u;
export const INTERFACE_CONSISTENCY_EXPONENT_LIKE = /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/u;
