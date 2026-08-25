// One local policy owner for public/private and secret-shaped string sentinels used by
// both the Profile compiler and typed-fact evaluator.
export const INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\\\]+\\/u,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);

export const INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
export const INTERFACE_CONSISTENCY_SAFE_SOURCE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/u;
export const INTERFACE_CONSISTENCY_EXPONENT_LIKE = /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/u;
