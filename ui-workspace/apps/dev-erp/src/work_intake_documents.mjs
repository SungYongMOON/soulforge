import { createHash } from "node:crypto";

// Caller-owned reader metadata and policy selection; this module neither reads
// documents nor grants source access, writer authority, or policy acceptance.
export const WORK_INTAKE_ACTIONS = Object.freeze(["hourly_intake", "source_index", "backlog"]);
const REQUIRED_ROLES = Object.freeze({
  hourly_intake: ["authority_policy", "intake_policy"],
  source_index: ["authority_policy", "source_policy"],
  backlog: ["authority_policy", "queue_policy"],
});
const ROLES = new Set(["authority_policy", "intake_policy", "source_policy", "queue_policy", "executor_policy", "source_index", "general_guidance", "reference_index"]);
const MANIFEST_KEYS = ["document_ref", "document_role", "required_for", "applicable_actions", "revision_policy", "required_sections", "authority_ref"];
const DOCUMENT_KEYS = ["document_ref", "revision", "sections", "authority_ref", "read_status"];
const VALIDATIONS = new WeakSet();
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const token = (value) => typeof value === "string" && SAFE.test(value);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const list = (value, predicate = token) => Array.isArray(value) && value.length <= 32 && value.every(predicate) && new Set(value).size === value.length;
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function result(action, codes, warnings = [], checked = [], manifestSha = null) {
  const value = freeze({ status: codes.length ? "HOLD" : "VALIDATED", action, hold_codes: [...new Set(codes)], warnings, checked_documents: checked, manifest_sha256: manifestSha });
  if (value.status === "VALIDATED") VALIDATIONS.add(value);
  return value;
}

export function isValidatedWorkIntakeDocuments(value) {
  return record(value) && VALIDATIONS.has(value);
}

export function validateWorkIntakeDocuments(input) {
  try {
    if (!exact(input, ["action", "manifest", "documents"]) || !WORK_INTAKE_ACTIONS.includes(input.action)) return result(null, ["INVALID_DOCUMENT_INPUT"]);
    const { action, manifest, documents } = input;
    if (!Array.isArray(manifest) || manifest.length < 2 || manifest.length > 16 || !Array.isArray(documents) || documents.length > 16) return result(action, ["INVALID_DOCUMENT_MANIFEST"]);
    const codes = [], warnings = [], checked = [];
    const specs = new Map(), reads = new Map(), roles = new Map();
    for (const spec of manifest) {
      const policy = spec?.revision_policy;
      if (!exact(spec, MANIFEST_KEYS) || !token(spec.document_ref) || !ROLES.has(spec.document_role)
        || !list(spec.required_for, (v) => WORK_INTAKE_ACTIONS.includes(v)) || !list(spec.applicable_actions, (v) => WORK_INTAKE_ACTIONS.includes(v))
        || !spec.required_for.every((v) => spec.applicable_actions.includes(v)) || !list(spec.required_sections)
        || !(spec.authority_ref === null || token(spec.authority_ref))
        || !exact(policy, ["mode", "revisions"]) || !["exact", "allowed"].includes(policy.mode)
        || !list(policy.revisions) || policy.revisions.length === 0 || (policy.mode === "exact" && policy.revisions.length !== 1)) {
        codes.push("INVALID_DOCUMENT_MANIFEST"); continue;
      }
      if (specs.has(spec.document_ref)) codes.push("DUPLICATE_DOCUMENT_REF");
      specs.set(spec.document_ref, spec);
      if (spec.applicable_actions.includes(action)) {
        if (roles.has(spec.document_role)) codes.push("DUPLICATE_APPLICABLE_DOCUMENT_ROLE");
        roles.set(spec.document_role, spec);
        if (spec.document_role.endsWith("_policy") && (policy.mode !== "exact" || !token(spec.authority_ref))) codes.push("INVALID_POLICY_REVISION_OR_AUTHORITY");
      }
    }
    for (const requiredRole of REQUIRED_ROLES[action]) {
      const spec = roles.get(requiredRole);
      if (!spec || !spec.required_for.includes(action)) codes.push("MISSING_REQUIRED_DOCUMENT_ROLE");
      // Policy-specific sections must be selected explicitly, never copied from
      // the Queue policy into every document in the packet.
      else if (spec.required_sections.length === 0) codes.push("MISSING_POLICY_SECTION_CONTRACT");
    }
    for (const document of documents) {
      if (!exact(document, DOCUMENT_KEYS) || !token(document.document_ref) || !(document.revision === null || token(document.revision))
        || !list(document.sections) || !(document.authority_ref === null || token(document.authority_ref))
        || !["read", "partial", "unavailable"].includes(document.read_status)) {
        codes.push("INVALID_DOCUMENT_READ"); continue;
      }
      if (reads.has(document.document_ref)) codes.push("DUPLICATE_DOCUMENT_READ");
      if (!specs.has(document.document_ref)) codes.push("UNDECLARED_DOCUMENT_REF");
      reads.set(document.document_ref, document);
    }
    if (codes.length) return result(action, codes);
    for (const spec of specs.values()) {
      if (!spec.applicable_actions.includes(action)) continue;
      const read = reads.get(spec.document_ref), required = spec.required_for.includes(action);
      if (!read || read.read_status !== "read") {
        const code = !read ? "DOCUMENT_NOT_READ" : read.read_status === "partial" ? "DOCUMENT_PARTIAL" : "DOCUMENT_UNAVAILABLE";
        if (required) codes.push(code);
        else warnings.push({ document_ref: spec.document_ref, code });
        checked.push({ document_ref: spec.document_ref, document_role: spec.document_role, revision: read?.revision ?? null, status: required ? "HOLD" : "OPTIONAL_UNAVAILABLE" });
        continue;
      }
      const errors = [];
      if (!spec.revision_policy.revisions.includes(read.revision)) errors.push("DOCUMENT_REVISION_MISMATCH");
      if (read.authority_ref !== spec.authority_ref) errors.push("DOCUMENT_AUTHORITY_MISMATCH");
      if (!spec.required_sections.every((section) => read.sections.includes(section))) errors.push("DOCUMENT_SECTION_MISSING");
      // An applicable document that was actually read cannot silently supply
      // stale policy or incorrect authority merely because it was optional.
      codes.push(...errors);
      checked.push({ document_ref: spec.document_ref, document_role: spec.document_role, revision: read.revision, status: errors.length ? "HOLD" : "VALIDATED" });
    }
    const canonical = [...specs.values()].sort((a, b) => a.document_ref.localeCompare(b.document_ref)).map((spec) => ({
      document_ref: spec.document_ref, document_role: spec.document_role, required_for: [...spec.required_for].sort(),
      applicable_actions: [...spec.applicable_actions].sort(), revision_policy: { mode: spec.revision_policy.mode, revisions: [...spec.revision_policy.revisions].sort() },
      required_sections: [...spec.required_sections].sort(), authority_ref: spec.authority_ref,
    }));
    return result(action, codes, warnings, checked, digest({ action, manifest: canonical }));
  } catch {
    return result(null, ["INVALID_DOCUMENT_INPUT"]);
  }
}
