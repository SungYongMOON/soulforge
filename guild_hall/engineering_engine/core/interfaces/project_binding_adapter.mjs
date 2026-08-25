// Project Binding Adapter: connects source revisions, documents, and evidence to engine vocabulary.
import { adaptProjectEvidence } from "./domain_engine_adapter.mjs";
import { ContractError } from "../validators/errors.mjs";

export const PROJECT_BINDING_ADAPTER_SCHEMA_VERSION = "soulforge.project_binding_adapter.v0";
export const TYPED_PROJECT_FACTS_SCHEMA_VERSION = "soulforge.typed_project_facts.v0";

export function createProjectBindingAdapter(domainEngineId, projectBindingRef) {
  if (typeof domainEngineId !== "string" || !domainEngineId.trim()) {
    throw new ContractError("PROJECT_BINDING_ADAPTER_INVALID", "domainEngineId must be a non-empty string");
  }
  if (!projectBindingRef || typeof projectBindingRef !== "object") {
    throw new ContractError("PROJECT_BINDING_ADAPTER_INVALID", "projectBindingRef must be an object");
  }
  if (projectBindingRef.domain_engine_id && projectBindingRef.domain_engine_id !== domainEngineId) {
    throw new ContractError("DOMAIN_ENGINE_MISMATCH", `projectBindingRef domain "${projectBindingRef.domain_engine_id}" does not match adapter domain "${domainEngineId}"`);
  }

  const boundRef = Object.freeze({
    ...projectBindingRef,
    domain_engine_id: domainEngineId,
  });

  return Object.freeze({
    schema_version: PROJECT_BINDING_ADAPTER_SCHEMA_VERSION,
    domain_engine_id: domainEngineId,
    project_binding_ref: boundRef,
    adaptEvidence(sourceSnapshotRefs, cutoffs) {
      return adaptProjectEvidence(boundRef, sourceSnapshotRefs, cutoffs);
    },
  });
}
