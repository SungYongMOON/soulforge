// Registration evidence — the deterministic, content-addressed answer to "is this subject
// actually registered, here, for this authority family, at this time".
//
// Three boundaries in this engine used to take registration as a caller assertion:
//
//   P5 acceptance           principal.kind === 'registered_human'
//   the pre-P7 policy gate  authority.registered === true
//   the P5 orchestration    a non-empty authority_ref string
//
// Each of those is a field the caller writes. A principal that merely *says* it is a
// registered human, and an authority_ref naming nothing that exists, both cleared the
// boundary — so the strongest gates in the lifecycle rested on the honesty of the thing
// being gated. That is the same self-certifying shape the capsule node set exists to close,
// one layer up.
//
// What this module does instead: it verifies supplied evidence. A registration registry is a
// content-addressed record whose address is recomputed here from its own entries, and which
// is pinned to an exact revision ref — the registry's declared address has to be the content
// id of the revision it claims to be. An entry cannot be added, removed or edited without
// changing that address, so "registered" becomes a computation over evidence rather than a
// boolean somebody typed.
//
// What this module deliberately does NOT do, and cannot be read as doing:
//
// 1. It is not a live registry and performs no lookup. It holds no roster, reads no runtime
//    state, opens no file and calls nothing. The caller hands it a registry snapshot; this
//    module decides whether that snapshot is internally consistent and whether it contains
//    the entry being claimed. Where the snapshot comes from, and who may issue one, is not
//    this module's authority.
// 2. It does not settle D-P10-08. The owner decision on how a human becomes a registered
//    P5/P8 approver is still open, and verifying the shape and scope of an evidence record is
//    not the same as deciding who belongs in one. A synthetic fixture verified here shows the
//    boundary refuses unevidenced claims; it says nothing about a real approver.
// 3. It is not a new truth owner. The registry it verifies is supplied evidence, and this
//    module keeps no state between calls.
//
// The honest reading of a pass here: the claim arrived with evidence, and the evidence is
// consistent with itself and in scope. Whether the evidence is *true* is an owner question
// this engine does not answer.

import { createHash } from 'node:crypto';
import { canonicalise, inspectInstant, compareCodePoints } from './canonical.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { CANONICAL } from './contract_config.mjs';
import { AUTHORITY_FAMILIES } from './authority.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  REGISTRY_MALFORMED: 'REGISTRATION_REGISTRY_MALFORMED',
  REGISTRY_ENTRY_MALFORMED: 'REGISTRATION_ENTRY_MALFORMED',
  REGISTRY_ENTRY_DUPLICATED: 'REGISTRATION_ENTRY_DUPLICATED',
  REGISTRY_ADDRESS_MISMATCH: 'REGISTRATION_REGISTRY_ADDRESS_MISMATCH',
  REGISTRY_NOT_PINNED_TO_ITS_REVISION: 'REGISTRATION_REGISTRY_NOT_PINNED_TO_ITS_REVISION',
  REGISTRY_SCOPE_MISMATCH: 'REGISTRATION_REGISTRY_SCOPE_MISMATCH',
  SUBJECT_NOT_REGISTERED: 'REGISTRATION_SUBJECT_NOT_REGISTERED',
  SUBJECT_REGISTRATION_AMBIGUOUS: 'REGISTRATION_SUBJECT_AMBIGUOUS',
  SUBJECT_OUT_OF_REGISTRATION_WINDOW: 'REGISTRATION_SUBJECT_OUT_OF_WINDOW',
  REGISTRATION_TIME_INVALID: 'REGISTRATION_TIME_INVALID',
  LIVE_REGISTRY_REFUSED: 'REGISTRATION_LIVE_REGISTRY_REFUSED',
});

/**
 * The two kinds of subject a boundary in this engine asks about.
 *
 * They are separate because they are scoped differently. A human is registered for a
 * project; an authority reference is registered for a project *and* an authority family,
 * since "this ref is a registered authority" says nothing usable unless it also says which
 * family's precedence it carries.
 */
export const SUBJECT_KINDS = Object.freeze({
  HUMAN: 'registered_human',
  AUTHORITY: 'authority_ref',
});

const SUBJECT_KIND_VALUES = Object.freeze(Object.values(SUBJECT_KINDS));

export const REQUIRED_ENTRY_FIELDS = Object.freeze([
  'subject_kind', 'subject_id', 'project_binding_ref', 'valid_from', 'valid_to',
]);

export const REQUIRED_REGISTRY_FIELDS = Object.freeze([
  'registry_revision_ref', 'project_binding_ref',
  'entries', 'entry_content_addresses', 'registry_content_address',
]);

const AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((f) => f.key));
const IS_SHA256_HEX = /^[0-9a-f]{64}$/;
const nonEmptyString = (v) => typeof v === 'string' && v.length > 0;

/** The open owner decision this module does not close. Stated in code so a caller cannot miss it. */
export const OPEN_OWNER_DECISION = Object.freeze({
  id: 'D-P10-08',
  affects: 'registered human P5 and P8 approver registration policy',
  still_open_after_this_module: true,
  note: 'verifying the shape and scope of a registration evidence record does not decide who may be in one',
});

/**
 * The address of one registration entry.
 *
 * Over the entry exactly as recorded. Two entries differing in any field — a different
 * project, a different family, a wider validity window — are different bytes and therefore a
 * different address, which is what makes the entry set unforgeable once the registry address
 * is pinned.
 */
export function registrationEntryContentAddress(entry) {
  return createHash(CANONICAL.hashAlgorithm)
    .update(`soulforge.se_engine.registration_entry.v0\n${canonicalise(entry, {})}`)
    .digest('hex');
}

/**
 * The address of the registry itself.
 *
 * Computed over the revision it claims to be, the project it is scoped to, and the sorted set
 * of its entry addresses. Entries are covered through their addresses rather than inline, so
 * the registry address changes if and only if the entry *set* changes.
 *
 * The revision ref's own `content_id` is excluded from the material, for the same reason a
 * chain element's address excludes its own provenance: the content id *is* this address, and a
 * value cannot be an input to its own computation. Everything else about the ref is included,
 * so two registries differing in which revision they claim to be still have different addresses.
 */
export function registrationRegistryContentAddress({ registryRevisionRef, projectBindingRef, entryContentAddresses }) {
  const material = {
    registry_revision_ref: {
      entity_id: registryRevisionRef?.entity_id,
      revision_id: registryRevisionRef?.revision_id,
      content_hash_alg: registryRevisionRef?.content_hash_alg,
    },
    project_binding_ref: projectBindingRef,
    entry_content_addresses: [...entryContentAddresses].sort(compareCodePoints),
  };
  return createHash(CANONICAL.hashAlgorithm)
    .update(`soulforge.se_engine.registration_registry.v0\n${canonicalise(material, { entry_content_addresses: 'insertion_ordered' })}`)
    .digest('hex');
}

function assertEntry(entry, registryBinding, index) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new ContractError(CODES.REGISTRY_ENTRY_MALFORMED, 'a registration entry is not a record', { index });
  }
  for (const field of REQUIRED_ENTRY_FIELDS) {
    if (!Object.hasOwn(entry, field)) {
      throw new ContractError(CODES.REGISTRY_ENTRY_MALFORMED,
        `registration entry field "${field}" is missing`, { index, field });
    }
  }
  if (!SUBJECT_KIND_VALUES.includes(entry.subject_kind)) {
    throw new ContractError(CODES.REGISTRY_ENTRY_MALFORMED,
      'a registration entry must declare a known subject kind', { index, subject_kind: entry.subject_kind ?? null });
  }
  if (!nonEmptyString(entry.subject_id)) {
    throw new ContractError(CODES.REGISTRY_ENTRY_MALFORMED, 'a registration entry must name its subject', { index });
  }
  if (entry.project_binding_ref !== registryBinding) {
    throw new ContractError(CODES.REGISTRY_SCOPE_MISMATCH,
      'a registration entry is scoped to a different project than the registry carrying it', { index });
  }
  // An authority reference carries a family or it carries nothing usable: precedence is the
  // only thing a registered authority contributes, and precedence is a property of a family.
  // A human entry carrying one would be asserting a precedence a person does not have.
  if (entry.subject_kind === SUBJECT_KINDS.AUTHORITY) {
    if (!AUTHORITY_KEYS.has(entry.authority_family)) {
      throw new ContractError(CODES.REGISTRY_ENTRY_MALFORMED,
        'an authority_ref entry must name one of the eight registered authority families',
        { index, authority_family: entry.authority_family ?? null });
    }
  } else if (Object.hasOwn(entry, 'authority_family')) {
    throw new ContractError(CODES.REGISTRY_ENTRY_MALFORMED,
      'a registered_human entry does not carry an authority family; a person is not a source tier', { index });
  }
  for (const t of ['valid_from', 'valid_to']) {
    if (!inspectInstant(entry[t]).valid) {
      throw new ContractError(CODES.REGISTRATION_TIME_INVALID,
        `registration entry ${t} is not a canonical instant`, { index, field: t });
    }
  }
  if (compareCodePoints(entry.valid_to, entry.valid_from) < 0) {
    throw new ContractError(CODES.REGISTRATION_TIME_INVALID,
      'a registration window that ends before it starts registers nobody', { index });
  }
  return true;
}

/**
 * Verifies a registration registry against itself.
 *
 * Three separate things, and the third is the one that matters. The entries are well formed;
 * the declared address set is exactly the set those entries produce; and the registry's own
 * declared address both recomputes and equals the content id of the revision ref it claims to
 * be. Without that last equality the registry is self-describing — a caller could hand over
 * any internally consistent set of entries and it would verify. With it, the registry is
 * pinned to a revision whose content id has to have come from somewhere else.
 */
export function verifyRegistrationRegistry(registry) {
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new ContractError(CODES.REGISTRY_MALFORMED, 'a registration registry is not a record');
  }
  for (const field of REQUIRED_REGISTRY_FIELDS) {
    if (!Object.hasOwn(registry, field)) {
      throw new ContractError(CODES.REGISTRY_MALFORMED, `registration registry field "${field}" is missing`, { field });
    }
  }
  if (classifyRef(registry.registry_revision_ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {
    throw new ContractError(CODES.REGISTRY_MALFORMED,
      'a registration registry must name the exact revision it is; a registry naming no revision is not evidence of anything');
  }
  if (!nonEmptyString(registry.project_binding_ref)) {
    throw new ContractError(CODES.REGISTRY_MALFORMED, 'a registration registry must name the project it is scoped to');
  }
  if (!Array.isArray(registry.entries) || registry.entries.length === 0) {
    throw new ContractError(CODES.REGISTRY_MALFORMED, 'a registration registry with no entries registers nobody');
  }
  if (!Array.isArray(registry.entry_content_addresses)) {
    throw new ContractError(CODES.REGISTRY_MALFORMED, 'entry_content_addresses must be the declared address set');
  }

  const computed = registry.entries.map((entry, index) => {
    assertEntry(entry, registry.project_binding_ref, index);
    return registrationEntryContentAddress(entry);
  });
  if (new Set(computed).size !== computed.length) {
    throw new ContractError(CODES.REGISTRY_ENTRY_DUPLICATED,
      'the same registration entry appears more than once; a duplicated entry makes the matching subject ambiguous');
  }
  const declared = [...registry.entry_content_addresses];
  if (declared.some((a) => !IS_SHA256_HEX.test(a ?? ''))) {
    throw new ContractError(CODES.REGISTRY_MALFORMED, 'a declared entry address is not a sha256 digest');
  }
  const sortedComputed = [...computed].sort(compareCodePoints);
  const sortedDeclared = [...declared].sort(compareCodePoints);
  if (sortedComputed.length !== sortedDeclared.length || sortedComputed.some((a, i) => a !== sortedDeclared[i])) {
    throw new ContractError(CODES.REGISTRY_ADDRESS_MISMATCH,
      'the declared entry addresses are not the addresses these entries produce; the entry set moved after it was addressed',
      { declared: sortedDeclared.length, computed: sortedComputed.length });
  }

  const recomputed = registrationRegistryContentAddress({
    registryRevisionRef: registry.registry_revision_ref,
    projectBindingRef: registry.project_binding_ref,
    entryContentAddresses: computed,
  });
  if (recomputed !== registry.registry_content_address) {
    throw new ContractError(CODES.REGISTRY_ADDRESS_MISMATCH,
      'the registry does not hash to the content address it declares');
  }
  // The pin. A registry whose address is not the content id of its own revision is a set of
  // entries with a name attached, and a caller could assemble one for any claim they liked.
  if (registry.registry_content_address !== registry.registry_revision_ref.content_id) {
    throw new ContractError(CODES.REGISTRY_NOT_PINNED_TO_ITS_REVISION,
      'the registry content address is not the content id of the revision it claims to be, so it is pinned to no revision at all');
  }

  return {
    verified: true,
    registry_revision_id: registry.registry_revision_ref.revision_id,
    registry_content_address: registry.registry_content_address,
    project_binding_ref: registry.project_binding_ref,
    entry_count: registry.entries.length,
  };
}

/**
 * Answers whether one subject is registered, in this project, for this authority family where
 * one is required, at this instant.
 *
 * Throws rather than returning false. A boundary that asked this question and got "no" has no
 * business continuing, and a verdict object invites a caller to read past it.
 *
 * `at` is supplied and never read from a clock here, so replaying the same inputs produces the
 * same answer.
 */
export function assertRegisteredSubject({
  registry, subjectKind, subjectId, projectBindingRef, authorityFamily = null, at,
}) {
  const verifiedRegistry = verifyRegistrationRegistry(registry);
  if (!SUBJECT_KIND_VALUES.includes(subjectKind)) {
    throw new ContractError(CODES.SUBJECT_NOT_REGISTERED, `"${subjectKind}" is not a registration subject kind`);
  }
  if (!nonEmptyString(subjectId)) {
    throw new ContractError(CODES.SUBJECT_NOT_REGISTERED, 'an unnamed subject cannot be looked up in any registry');
  }
  if (!nonEmptyString(projectBindingRef) || verifiedRegistry.project_binding_ref !== projectBindingRef) {
    throw new ContractError(CODES.REGISTRY_SCOPE_MISMATCH,
      'the registration evidence is scoped to a different project than the boundary being cleared',
      { registry_scope: verifiedRegistry.project_binding_ref, boundary_scope: projectBindingRef ?? null });
  }
  if (!inspectInstant(at).valid) {
    throw new ContractError(CODES.REGISTRATION_TIME_INVALID,
      'a registration only holds at an instant, and the instant has to be a canonical one');
  }
  if (subjectKind === SUBJECT_KINDS.AUTHORITY && !AUTHORITY_KEYS.has(authorityFamily)) {
    throw new ContractError(CODES.SUBJECT_NOT_REGISTERED,
      'an authority reference is registered for a family; naming no family leaves nothing to check it against',
      { authority_family: authorityFamily ?? null });
  }

  const matches = registry.entries.filter((e) => e.subject_kind === subjectKind
    && e.subject_id === subjectId
    && (subjectKind !== SUBJECT_KINDS.AUTHORITY || e.authority_family === authorityFamily));

  if (matches.length === 0) {
    throw new ContractError(CODES.SUBJECT_NOT_REGISTERED,
      'the registration evidence holds no entry for this subject in this scope; a claim of registration is not a registration',
      { subject_kind: subjectKind, authority_family: authorityFamily ?? undefined });
  }
  if (matches.length > 1) {
    throw new ContractError(CODES.SUBJECT_REGISTRATION_AMBIGUOUS,
      'more than one registration entry matches this subject, so which window governs is undetermined',
      { subject_kind: subjectKind, match_count: matches.length });
  }

  const [entry] = matches;
  if (compareCodePoints(at, entry.valid_from) < 0 || compareCodePoints(at, entry.valid_to) > 0) {
    throw new ContractError(CODES.SUBJECT_OUT_OF_REGISTRATION_WINDOW,
      'the subject is registered, but not at the instant this boundary is being cleared',
      { subject_kind: subjectKind });
  }

  return {
    registered: true,
    subject_kind: subjectKind,
    entry_content_address: registrationEntryContentAddress(entry),
    registry_revision_id: verifiedRegistry.registry_revision_id,
    registry_content_address: verifiedRegistry.registry_content_address,
    // Stated rather than implied: this is evidence verification, not a live lookup, and the
    // owner decision on who may be registered is still open.
    live_registry_consulted: false,
    open_owner_decision: OPEN_OWNER_DECISION.id,
  };
}

/** Refuses the one thing this module must never grow into. */
export function assertNoLiveRegistryAccess(intent) {
  throw new ContractError(CODES.LIVE_REGISTRY_REFUSED,
    `this module verifies supplied registration evidence; "${intent}" would make it a live registry client`,
    { open_owner_decision: OPEN_OWNER_DECISION.id });
}
