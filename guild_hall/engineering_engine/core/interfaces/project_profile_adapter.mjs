// Project Profile Adapter: translates legacy project-profile envelopes and overlays into
// validated Profile Bindings and Project Bindings, preserving individual provenance with zero invented defaults.
import { validateProfileBinding, validateCanonicalInstant } from "./domain_engine_adapter.mjs";
import { ContractError } from "../validators/errors.mjs";

export const PROJECT_PROFILE_ADAPTER_SCHEMA_VERSION = "soulforge.project_profile_adapter.v0";

export function adaptLegacyProjectProfile(legacyProfileEnvelope, options = {}) {
  if (!legacyProfileEnvelope || typeof legacyProfileEnvelope !== "object") {
    throw new ContractError("PROJECT_PROFILE_ADAPTER_INVALID", "legacyProfileEnvelope must be an object");
  }

  const domainEngineId = options.domain_engine_id || legacyProfileEnvelope.domain_engine_id;
  if (!domainEngineId || typeof domainEngineId !== "string" || !domainEngineId.trim()) {
    throw new ContractError("LEGACY_PROFILE_PROVENANCE_INCOMPLETE", "domain_engine_id must be explicitly specified");
  }

  const profileBindings = [];

  // 1. Organization Profile (if present)
  if (legacyProfileEnvelope.organization_profile || legacyProfileEnvelope.prime_overlay_ref || legacyProfileEnvelope.prime_overlay) {
    const orgData = legacyProfileEnvelope.organization_profile || legacyProfileEnvelope.prime_overlay;
    if (!orgData || typeof orgData !== "object") {
      throw new ContractError("LEGACY_PROFILE_PROVENANCE_INCOMPLETE", "organization profile must be an object");
    }
    const orgId = orgData.profile_id || legacyProfileEnvelope.prime_overlay_ref?.entity_id;
    const orgRevision = orgData.revision_hash || orgData.revision || legacyProfileEnvelope.prime_overlay_ref?.revision_id;
    const orgExtends = orgData.extends_base_pin || orgData.extends || legacyProfileEnvelope.prime_overlay_ref?.extends_base_pin;
    const orgSourceRefs = orgData.source_refs || legacyProfileEnvelope.prime_overlay_ref?.source_refs;

    if (!orgId || !orgRevision || !orgExtends || !Array.isArray(orgSourceRefs) || orgSourceRefs.length === 0) {
      throw new ContractError("LEGACY_PROFILE_PROVENANCE_INCOMPLETE", "organization profile is missing required explicit provenance fields (profile_id, revision, extends, source_refs)");
    }

    profileBindings.push(validateProfileBinding({
      profile_kind: "organization",
      profile_id: orgId,
      domain_engine_id: domainEngineId,
      revision_or_hash: orgRevision,
      extends_or_base_pin: orgExtends,
      source_refs: orgSourceRefs,
      operations: orgData.operations || orgData.ops || [],
      order: profileBindings.length,
    }, profileBindings.length));
  }

  // 2. Project Profile
  const projData = legacyProfileEnvelope.project_profile || legacyProfileEnvelope;
  const projId = projData.profile_id || legacyProfileEnvelope.project_code || legacyProfileEnvelope.project_id;
  const projRevision = projData.revision_hash || projData.revision || legacyProfileEnvelope.content_id;
  const projExtends = projData.extends_base_pin || projData.extends;
  const projSourceRefs = projData.source_refs;

  if (!projId || !projRevision || !projExtends || !Array.isArray(projSourceRefs) || projSourceRefs.length === 0) {
    throw new ContractError("LEGACY_PROFILE_PROVENANCE_INCOMPLETE", "project profile is missing required explicit provenance fields (profile_id, revision, extends, source_refs)");
  }

  const projOps = [...(projData.operations || projData.ops || [])];
  const legacyConditions = legacyProfileEnvelope.conditions || legacyProfileEnvelope.overlay_conditions || [];
  for (const cond of legacyConditions) {
    if (typeof cond === "string") {
      projOps.push({ op: "condition", token: cond });
    } else if (cond && typeof cond === "object") {
      projOps.push(cond);
    }
  }
  profileBindings.push(validateProfileBinding({
    profile_kind: "project",
    profile_id: projId,
    domain_engine_id: domainEngineId,
    revision_or_hash: projRevision,
    extends_or_base_pin: projExtends,
    source_refs: projSourceRefs,
    operations: projOps,
    order: profileBindings.length,
  }, profileBindings.length));

  // 3. Project Binding: require explicit full provenance with zero invented defaults
  const rawBinding = legacyProfileEnvelope.project_binding || legacyProfileEnvelope.binding || legacyProfileEnvelope;
  const bindingRevisionHash = rawBinding.binding_revision_hash || rawBinding.revision_hash || rawBinding.revision;
  const sourceManifestRef = rawBinding.source_manifest_ref || rawBinding.manifest_ref;

  if (!bindingRevisionHash || typeof bindingRevisionHash !== "string" || !bindingRevisionHash.trim()) {
    throw new ContractError("LEGACY_PROFILE_PROVENANCE_INCOMPLETE", "project_binding requires explicit binding_revision_hash");
  }
  if (!sourceManifestRef || typeof sourceManifestRef !== "string" || !sourceManifestRef.trim()) {
    throw new ContractError("LEGACY_PROFILE_PROVENANCE_INCOMPLETE", "project_binding requires explicit source_manifest_ref");
  }

  const projectBinding = {
    schema_version: "soulforge.project_binding.v0",
    project_id: projId,
    domain_engine_id: domainEngineId,
    binding_revision_hash: bindingRevisionHash,
    source_manifest_ref: sourceManifestRef,
  };

  if (rawBinding.authority_family) projectBinding.authority_family = rawBinding.authority_family;
  if (rawBinding.valid_at) projectBinding.valid_at = validateCanonicalInstant(rawBinding.valid_at, "valid_at");
  if (rawBinding.known_at) projectBinding.known_at = validateCanonicalInstant(rawBinding.known_at, "known_at");
  if (Array.isArray(rawBinding.document_refs)) projectBinding.document_refs = [...rawBinding.document_refs];

  return {
    schema_version: PROJECT_PROFILE_ADAPTER_SCHEMA_VERSION,
    profile_bindings: profileBindings,
    project_binding: projectBinding,
  };
}
