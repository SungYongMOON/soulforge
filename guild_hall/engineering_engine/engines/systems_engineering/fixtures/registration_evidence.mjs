// Synthetic registration evidence, built the way a real registry would have to be.
//
// Shared by the lane 1A and Phase 3 suites so the two cannot drift into testing different
// shapes of the same contract. It is a fixture, not a kernel module: it holds no rule, and
// every field it produces is one the kernel recomputes for itself. If this builder were wrong,
// `verifyRegistrationRegistry` would refuse what it produces rather than agree with it.
//
// Nothing here names a real person, a real project or a real authority. `pb-alpha`, `person-1`
// and `auth-1` are placeholders in the same family as every other fixture in this engine.

import {
  SUBJECT_KINDS, registrationEntryContentAddress, registrationRegistryContentAddress,
} from '../../../core/validators/registration.mjs';

/**
 * Builds a registry over the supplied entries.
 *
 * The registry's content address is computed and then used *as the content id of its own
 * revision ref*, which is the pin the kernel checks. A caller who edits an entry afterwards
 * gets a registry whose address no longer matches, which is the point.
 */
export function buildRegistrationRegistry({ projectBindingRef, entries, revisionEntityId = 'registration-registry', revisionId = 'registration-registry-r1' }) {
  const entryContentAddresses = entries.map(registrationEntryContentAddress);
  const registryRevisionRef = { entity_id: revisionEntityId, revision_id: revisionId, content_hash_alg: 'sha256' };
  // The address is computed without the content id and then becomes it. That is the pin the
  // kernel checks, and it is only satisfiable because the address excludes the field it fills.
  const address = registrationRegistryContentAddress({ registryRevisionRef, projectBindingRef, entryContentAddresses });
  return {
    registry_revision_ref: { ...registryRevisionRef, content_id: address },
    project_binding_ref: projectBindingRef,
    entries,
    entry_content_addresses: entryContentAddresses,
    registry_content_address: address,
  };
}

export const humanEntry = ({ subjectId, projectBindingRef, validFrom, validTo }) => ({
  subject_kind: SUBJECT_KINDS.HUMAN,
  subject_id: subjectId,
  project_binding_ref: projectBindingRef,
  valid_from: validFrom,
  valid_to: validTo,
});

export const authorityEntry = ({ subjectId, projectBindingRef, authorityFamily, validFrom, validTo }) => ({
  subject_kind: SUBJECT_KINDS.AUTHORITY,
  subject_id: subjectId,
  project_binding_ref: projectBindingRef,
  authority_family: authorityFamily,
  valid_from: validFrom,
  valid_to: validTo,
});
