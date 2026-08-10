// PC-01 identifier semantics and PC-02 exact revision refs.
//
// The three identifier kinds answer different questions and are never substituted for one
// another: entity_id asks "which subject", revision_id asks "which state of it",
// content_id asks "which bytes". Two different subjects sharing bytes is normal, so
// content equality must never be read back as subject equality.

import { REF_REQUIRED_FIELDS, CANONICAL } from './contract_config.mjs';

export const RESOLUTION = Object.freeze({
  RESOLVABLE: 'ref_resolvable',        // well formed and the bytes are obtainable
  UNKNOWN: 'unknown',                  // well formed, bytes not obtainable, absence unconfirmed
  MISSING: 'missing',                  // absence positively confirmed
  MALFORMED: 'malformed_ref',          // not fully formed, so it has no resolution state
  FLOATING: 'invalid_floating_ref',    // no revision named at all
});

const nonEmptyString = (v) => typeof v === 'string' && v.length > 0;

/**
 * Classifies an exact revision ref.
 *
 * A ref that names no revision is floating and invalid, not "latest". A ref that is
 * incomplete is malformed and carries no resolution state at all: downgrading it to
 * unknown or missing would let a broken ref masquerade as a legitimate observation.
 */
export function classifyRef(ref, { bytesAvailable = false, absenceConfirmed = false } = {}) {
  if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) return RESOLUTION.MALFORMED;
  if (!Object.hasOwn(ref, 'revision_id')) return RESOLUTION.FLOATING;
  for (const field of REF_REQUIRED_FIELDS) {
    if (!nonEmptyString(ref[field])) return RESOLUTION.MALFORMED;
  }
  if (ref.content_hash_alg !== CANONICAL.hashAlgorithm) return RESOLUTION.MALFORMED;
  if (bytesAvailable === true) return RESOLUTION.RESOLVABLE;
  if (absenceConfirmed === true) return RESOLUTION.MISSING;
  return RESOLUTION.UNKNOWN;
}

export const isWellFormedRef = (ref) => {
  const c = classifyRef(ref, { bytesAvailable: true });
  return c === RESOLUTION.RESOLVABLE;
};

// ---------------------------------------------------------------- equality (PC-01)

export const sameEntity = (a, b) => nonEmptyString(a?.entity_id) && a.entity_id === b?.entity_id;

export const sameRevision = (a, b) => nonEmptyString(a?.revision_id) && a.revision_id === b?.revision_id;

/**
 * Byte equality only. Callers must not read this as subject or revision equality: two
 * unrelated subjects legitimately share bytes (an identical attachment, a shared
 * template), and a revision can be reissued with unchanged bytes.
 */
export const sameContent = (a, b) => nonEmptyString(a?.content_id) && a.content_id === b?.content_id;

// ---------------------------------------------------------------- placeholders

// Tokens used while an owner decision is open. They are not identifiers and must never be
// persisted where an identifier is expected.
export const PLACEHOLDERS = Object.freeze({
  PENDING_COMMON_CONTRACT: 'UNKNOWN_pending_phase_1_0',
  PENDING_ENGINE_OWNER: 'UNKNOWN_pending_engine_owner',
});

export const isPlaceholder = (v) => Object.values(PLACEHOLDERS).includes(v);

/**
 * Guards the boundary where a placeholder would otherwise be written into storage as if it
 * were a real identifier.
 */
export function assertNotPlaceholder(value, where) {
  if (isPlaceholder(value)) {
    throw new Error(`placeholder "${value}" cannot be persisted as an identifier at ${where}`);
  }
  return value;
}

// ---------------------------------------------------------------- opacity (PC-01.2)

// Identifiers travel into public-safe artifacts, so nothing parseable may be embedded in
// them. This is a shape guard, not a secret scanner: it refuses the forms that would make
// an identifier readable as project or personal context.
const FORBIDDEN_IN_IDENTIFIER = [
  { code: 'project_code_shape', re: /[A-Za-z]\d{2}[-_]\d{3}/ },
  { code: 'path_fragment', re: /[\\/]/ },
  { code: 'whitespace', re: /\s/ },
];

// A canonical UUID is opaque by construction: every character is hex in a fixed layout, so
// it cannot carry a project code, a path, or a date field. The heuristics below are for
// hand-assembled identifiers like "src-0001-r3" and produce false positives on random hex —
// a valid UUIDv7 such as 0192f0a1-b2c3-7d4e-8f01-234567890abc matches project_code_shape
// purely by coincidence, because "f01-234" spans a dash boundary. Rejecting it would make
// minting fail intermittently on a fraction of legitimate values, which is worse than the
// heuristic is worth. So the form check settles opacity first.
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function inspectIdentifierOpacity(value) {
  if (!nonEmptyString(value)) return { opaque: false, code: 'not_a_non_empty_string' };
  if (CANONICAL_UUID.test(value)) return { opaque: true, basis: 'canonical_uuid_layout' };
  for (const rule of FORBIDDEN_IN_IDENTIFIER) {
    if (rule.re.test(value)) return { opaque: false, code: rule.code };
  }
  return { opaque: true, basis: 'no_forbidden_pattern' };
}
