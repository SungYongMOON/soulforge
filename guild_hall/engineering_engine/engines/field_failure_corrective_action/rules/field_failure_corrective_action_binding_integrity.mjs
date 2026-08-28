// Package-local binding digests. Each function delegates canonical serialisation and hashing
// to the existing Engineering Engine Core; this package adds only the domain separation labels.
import { arrayOrderRules, withoutNulls } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";

export const FFCA_FLOATING_REVISION = /(?:^|[-_.:/])(latest|current|head|main|master|develop|development|trunk|stable|production)(?:$|[-_.:/])|[*^~<>]/iu;

export function isFfcaFloatingRevision(value) {
  return typeof value === "string" && FFCA_FLOATING_REVISION.test(value);
}

export function canonicalFfcaDigest(domain, value) {
  return sha256Hex(domain + "\n" + canonicalise(value, arrayOrderRules(value)));
}

export function computeFfcaCompilationScopeDigest(compilationScope) {
  return canonicalFfcaDigest("soulforge.field_failure_corrective_action.compilation_scope.v0", compilationScope);
}

export function computeFfcaTypedFactsDigest(facts) {
  return canonicalFfcaDigest("soulforge.project_observations.v0", withoutNulls(facts));
}

export function computeFfcaRequestBindingRevision(binding) {
  return canonicalFfcaDigest("soulforge.field_failure_corrective_action.project_binding.v0", binding);
}

export function computeFfcaSourceManifestDigest(sourceBindings) {
  return canonicalFfcaDigest("soulforge.field_failure_corrective_action.source_manifest.v0", sourceBindings);
}

export function computeFfcaProfileProvenanceDigest(profiles) {
  return canonicalFfcaDigest("soulforge.field_failure_corrective_action.profile_provenance.v0", profiles);
}
