import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, sha256Bytes } from "./canonical.mjs";
import { fail } from "./errors.mjs";
import { runReportAuthoringHandler } from "./report_authoring_handler.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BINDING_PATH = path.join(REPO_ROOT, ".workflow", "report_authoring_v0", "runtime_binding.json");
const SHA256 = /^[a-f0-9]{64}$/;

const EXPECTED_POLICY_FILES = Object.freeze([
  ".workflow/report_authoring_v0/references/editorial_contract.md",
  ".workflow/report_authoring_v0/references/interview_protocol.md",
  ".workflow/report_authoring_v0/references/technical_content_review.md",
  ".workflow/report_authoring_v0/references/evidence_logic_review.md",
  ".workflow/report_authoring_v0/references/final_polish_policy.md",
  ".workflow/report_authoring_v0/references/semantic_preservation_policy.md",
]);

const EXPECTED_RUNTIME_FILES = Object.freeze([
  ".workflow/report_authoring_v0/workflow.yaml",
  ".workflow/report_authoring_v0/step_graph.yaml",
  ".workflow/report_authoring_v0/role_slots.yaml",
  ".workflow/report_authoring_v0/handoff_rules.yaml",
  ".workflow/report_authoring_v0/monster_rules.yaml",
  ".workflow/report_authoring_v0/party_compatibility.yaml",
  ".workflow/report_authoring_v0/profile_policy.yaml",
  ".workflow/report_authoring_v0/references/editorial_research_basis.md",
  ".workflow/report_authoring_v0/templates/README.md",
  ".workflow/report_authoring_v0/templates/report_authoring_request.template.json",
  ".workflow/report_authoring_v0/templates/report_authoring_request.full_authoring.template.json",
  ".workflow/report_authoring_v0/contracts/workflow_job_request.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_job_state.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_job_result.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_job_outcome.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_receipt.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/report_document.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/semantic_verifier_result.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/semantic_preservation_audit.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/editorial_pass_record.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/summary_derivation_record.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/identity_authority_record.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_cli_finalize.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_execution_packet.v1.schema.json",
  ".workflow/report_authoring_v0/contracts/workflow_cli_issue_authority.v1.schema.json",
  ".workflow/report_authoring_v0/fixtures/synthetic_report_document.json",
  ".workflow/report_authoring_v0/fixtures/semantic_regression_cases.json",
  "guild_hall/workflow_runner/artifact_store.mjs",
  "guild_hall/workflow_runner/boundary.mjs",
  "guild_hall/workflow_runner/canonical.mjs",
  "guild_hall/workflow_runner/catalog.mjs",
  "guild_hall/workflow_runner/cli.mjs",
  "guild_hall/workflow_runner/contract.mjs",
  "guild_hall/workflow_runner/errors.mjs",
  "guild_hall/workflow_runner/index.mjs",
  "guild_hall/workflow_runner/identity_authority.mjs",
  "guild_hall/workflow_runner/lexical_guard.mjs",
  "guild_hall/workflow_runner/payload_store.mjs",
  "guild_hall/workflow_runner/receipt_store.mjs",
  "guild_hall/workflow_runner/render_report_pair.mjs",
  "guild_hall/workflow_runner/report_authoring_handler.mjs",
  "guild_hall/workflow_runner/runner.mjs",
  "guild_hall/workflow_runner/schema_runtime.mjs",
  "guild_hall/workflow_runner/semantic_preservation.mjs",
  "guild_hall/workflow_runner/state_machine.mjs",
  "guild_hall/workflow_runner/temporal.mjs"
]);

const STATIC_CATALOG = Object.freeze({
  report_authoring_v0: Object.freeze({ handlerId: "report_authoring_v0", handler: runReportAuthoringHandler, bindingPath: BINDING_PATH }),
});
const TRUSTED_BUNDLE_CACHE = new Map();

function exactObject(value, fields, pathLabel) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("binding_type", `${pathLabel} must be an object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("binding_unknown_field", `Unknown binding field ${pathLabel}.${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) fail("binding_missing_field", `Missing binding field ${pathLabel}.${key}`);
}

function exactList(actual, expected, code) {
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(code, "Binding file allowlist does not match the compiled static catalog");
}

export function validateRuntimeBinding(binding) {
  exactObject(binding, ["schema", "workflow_id", "binding_revision", "handler_id", "skills_disabled", "allowed_modes", "caller_entrypoint_allowed", "entrypoint_policy", "bundle_digest_algorithm", "policy_files", "runtime_files", "bundle_digest", "contracts", "integrity_claim", "erp_expected_digest_required", "default_route_enabled", "maturity_claim"], "$binding");
  if (binding.schema !== "soulforge.workflow_runtime_binding.v1") fail("binding_schema", "Unexpected binding schema");
  if (binding.workflow_id !== "report_authoring_v0") fail("workflow_not_allowlisted", "Only report_authoring_v0 is allowlisted");
  if (binding.binding_revision !== "report_authoring_v0.binding.v1") fail("binding_revision", "Unexpected binding revision");
  if (binding.handler_id !== "report_authoring_v0") fail("handler_not_allowlisted", "Only the static report_authoring_v0 handler is allowed");
  if (binding.skills_disabled !== true) fail("binding_skills_enabled", "Fixed-bundle lane requires skills_disabled=true");
  exactList(binding.allowed_modes, ["full_authoring", "final_polish"], "binding_modes");
  if (binding.caller_entrypoint_allowed !== false || binding.entrypoint_policy !== "static_handler_allowlist_only") fail("binding_entrypoint_policy", "Caller entrypoints are forbidden");
  if (binding.bundle_digest_algorithm !== "sha256-canonical-binding-and-file-manifest-v2") fail("binding_digest_algorithm", "Unexpected bundle digest algorithm");
  exactList(binding.policy_files, EXPECTED_POLICY_FILES, "binding_policy_files");
  exactList(binding.runtime_files, EXPECTED_RUNTIME_FILES, "binding_runtime_files");
  if (typeof binding.bundle_digest !== "string" || !SHA256.test(binding.bundle_digest)) fail("binding_bundle_digest", "Invalid bundle digest");
  exactObject(binding.contracts, ["request", "state", "result", "outcome", "receipt", "report_document", "semantic_verifier_result", "semantic_preservation_audit", "editorial_pass_record", "summary_derivation_record", "identity_authority_record", "finalize_config", "execution_packet", "issue_authority_config"], "$binding.contracts");
  const bundled = new Set([...binding.policy_files, ...binding.runtime_files]);
  for (const contractPath of Object.values(binding.contracts)) if (!bundled.has(contractPath)) fail("binding_contract_not_bundled", `Contract is not runtime-bound: ${contractPath}`);
  if (binding.integrity_claim !== "local_self_integrity_only" || binding.erp_expected_digest_required !== true) fail("binding_integrity_claim", "Local self-integrity must not be represented as owner-approved ERP integrity");
  if (binding.default_route_enabled !== false) fail("binding_default_route_enabled", "Default routing must remain disabled");
  if (binding.maturity_claim !== "candidate") fail("binding_maturity_claim", "Runtime lane must remain candidate until the full B/V gate passes");
  return binding;
}

function bindingDigestView(binding) {
  const copy = { ...binding };
  delete copy.bundle_digest;
  return copy;
}

export async function computeBundleDigest(binding) {
  validateRuntimeBinding(binding);
  const manifest = [];
  for (const portablePath of [...binding.policy_files, ...binding.runtime_files].sort()) {
    const absolutePath = path.resolve(REPO_ROOT, ...portablePath.split("/"));
    const relative = path.relative(REPO_ROOT, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) fail("binding_bundle_path_escape", `Bundle path escaped repository: ${portablePath}`);
    const metadata = await fs.lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail("binding_bundle_file_identity", `Bundle member must be a non-link regular file: ${portablePath}`);
    const bytes = await fs.readFile(absolutePath);
    manifest.push({ path: portablePath, sha256: sha256Bytes(bytes), size: bytes.length });
  }
  return sha256Bytes(Buffer.from(canonicalJson({ binding: bindingDigestView(binding), files: manifest }), "utf8"));
}

async function loadPolicyBundle(binding) {
  const files = {};
  for (const portablePath of binding.policy_files) files[portablePath] = await fs.readFile(path.resolve(REPO_ROOT, ...portablePath.split("/")), "utf8");
  return Object.freeze({
    schema: "soulforge.workflow_policy_bundle.v1",
    workflow_id: binding.workflow_id,
    binding_revision: binding.binding_revision,
    skills_disabled: true,
    files: Object.freeze(files),
  });
}

export async function loadStaticWorkflowBinding({ workflowId, mode, expectedBundleDigest = null }) {
  const entry = STATIC_CATALOG[workflowId];
  if (!entry) fail("workflow_not_allowlisted", `Workflow is not allowlisted: ${workflowId}`);
  let trustedPromise = TRUSTED_BUNDLE_CACHE.get(workflowId);
  if (!trustedPromise) {
    trustedPromise = (async () => {
      const binding = validateRuntimeBinding(JSON.parse(await fs.readFile(entry.bindingPath, "utf8")));
      if (binding.handler_id !== entry.handlerId) fail("handler_binding_mismatch", "Binding handler does not match static catalog");
      const actualDigest = await computeBundleDigest(binding);
      if (actualDigest !== binding.bundle_digest) fail("workflow_bundle_digest_mismatch", "Workflow bundle digest does not match runtime_binding.json", { expected: binding.bundle_digest, actual: actualDigest });
      const policyBundle = await loadPolicyBundle(binding);
      return { binding, actualDigest, policyBundle };
    })();
    TRUSTED_BUNDLE_CACHE.set(workflowId, trustedPromise);
  }
  const { binding, actualDigest, policyBundle } = await trustedPromise;
  if (binding.handler_id !== entry.handlerId) fail("handler_binding_mismatch", "Binding handler does not match static catalog");
  if (!binding.allowed_modes.includes(mode)) fail("workflow_mode_not_allowlisted", `Mode is not allowlisted: ${mode}`);
  if (expectedBundleDigest !== null) {
    if (typeof expectedBundleDigest !== "string" || !SHA256.test(expectedBundleDigest)) fail("external_expected_digest_invalid", "External expected digest is invalid");
    if (expectedBundleDigest !== actualDigest) fail("external_expected_digest_mismatch", "Owner-approved expected digest does not match the local bundle");
  }
  return {
    binding,
    handler: entry.handler,
    bundleDigest: actualDigest,
    policyBundle,
    integrity: { claim: expectedBundleDigest === null ? "local_self_integrity_only" : "externally_pinned_digest_match" },
  };
}

export function listStaticWorkflowIds() {
  return Object.keys(STATIC_CATALOG);
}
