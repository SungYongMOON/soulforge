import { createHash } from "node:crypto";

import {
  AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
  validateTopologyProviderFragment,
} from "../topology_federation.mjs";

export const NOTEBOOK_ADVISORY_SOURCE_REFS = Object.freeze([
  ".workflow/dual_deep_research_v0/workflow.yaml",
  "docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md",
  "guild_hall/knowledge_access/notebooklm_bridge.mjs",
]);

const SOURCE_CONTENT_ANCHORS = Object.freeze({
  ".workflow/dual_deep_research_v0/workflow.yaml": Object.freeze([
    "workflow_id: dual_deep_research_v0",
    "notebooklm_output_is_advisory: true",
    "handoff_is_not_registration: true",
  ]),
  "docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md": Object.freeze([
    "# NOTEBOOKLM_MCP_SETUP_V0",
    "advisory research surface",
    "public canon 에 복사하려면 먼저",
  ]),
  "guild_hall/knowledge_access/notebooklm_bridge.mjs": Object.freeze([
    "soulforge.notebooklm_metadata_bridge_import.v0",
    "metadata_only: true",
    "notebooklm_advisory_only: true",
  ]),
});

const AUTHORITY_BOUNDARY = Object.freeze({
  source_truth: false,
  answer_authority: false,
  owner_approval_authority: false,
  runtime_mutation: false,
});

export class NotebookAdvisoryTopologyError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "NotebookAdvisoryTopologyError";
    this.code = code;
  }
}

function fail(code, detail = "") {
  throw new NotebookAdvisoryTopologyError(code, detail);
}

function validateSourceBuffers(sourceBuffers) {
  if (
    sourceBuffers === null
    || typeof sourceBuffers !== "object"
    || Array.isArray(sourceBuffers)
    || Object.getPrototypeOf(sourceBuffers) !== Object.prototype
  ) {
    fail("notebook_advisory_source_set_invalid");
  }

  const ownKeys = Reflect.ownKeys(sourceBuffers);
  if (ownKeys.some((key) => typeof key !== "string")) {
    fail("notebook_advisory_source_allowlist_mismatch");
  }
  const actualRefs = ownKeys.sort();
  if (
    actualRefs.length !== NOTEBOOK_ADVISORY_SOURCE_REFS.length
    || actualRefs.some((ref, index) => ref !== NOTEBOOK_ADVISORY_SOURCE_REFS[index])
  ) {
    fail("notebook_advisory_source_allowlist_mismatch");
  }

  for (const ref of NOTEBOOK_ADVISORY_SOURCE_REFS) {
    const descriptor = Object.getOwnPropertyDescriptor(sourceBuffers, ref);
    const bytes = descriptor?.value;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      fail("notebook_advisory_source_bytes_invalid", ref);
    }
    for (const anchor of SOURCE_CONTENT_ANCHORS[ref]) {
      if (!bytes.includes(Buffer.from(anchor, "utf8"))) {
        fail("notebook_advisory_source_anchor_missing", ref);
      }
    }
  }
}

function digestSourceSet(sourceBuffers) {
  const hash = createHash("sha256");
  for (const ref of NOTEBOOK_ADVISORY_SOURCE_REFS) {
    const bytes = sourceBuffers[ref];
    hash.update(Buffer.from(`${Buffer.byteLength(ref, "utf8")}:`, "utf8"));
    hash.update(Buffer.from(ref, "utf8"));
    hash.update(Buffer.from(`${bytes.length}:`, "utf8"));
    hash.update(bytes);
  }
  return hash.digest("hex");
}

export function buildNotebookAdvisoryTopologyProvider(sourceBuffers) {
  validateSourceBuffers(sourceBuffers);

  return validateTopologyProviderFragment({
    schema_version: AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
    provider_id: "watchtower_notebook_advisory_adapter",
    provider_kind: "advisory_workbench",
    label: "NotebookLM advisory topology adapter",
    source: {
      source_id: "watchtower_notebook_advisory_sources",
      schema_version: "soulforge.notebook_advisory_sources.v1",
      revision: "notebook_advisory_adapter.v1",
      digest: digestSourceSet(sourceBuffers),
    },
    declared_status: "hold",
    validation: {
      validator_id: "watchtower.notebook_advisory_provider.v1",
      state: "passed",
      evidence_ref: "guild_hall/watchtower/providers/notebook_advisory.test.mjs",
      source_commit: null,
    },
    capabilities: {
      observe: ["advisory_boundary", "declared_structure", "source_contract_digest"],
      diagnose: ["authority_boundary", "source_allowlist_integrity"],
      propose_repair: [],
      execute_repair: false,
    },
    authority_boundary: { ...AUTHORITY_BOUNDARY },
    claim_ceiling: "source_supported",
    runtime_state: "unknown",
    payload_state: "public_safe_contract",
    blocker_codes: ["canonical_provider_id_missing"],
    nodes: [
      {
        id: "advisory_boundary",
        label: "Notebook advisory boundary",
        kind: "workbench",
        layer: "subsystem",
        parent_id: null,
        group: "Notebook advisory",
        diagnostic_state: "validator_backed",
        repair_state: "none",
      },
      {
        id: "metadata_bridge",
        label: "Notebook metadata bridge",
        kind: "module",
        layer: "module",
        parent_id: "advisory_boundary",
        group: "Notebook advisory",
        diagnostic_state: "structural",
        repair_state: "none",
      },
      {
        id: "discovery_workflow",
        label: "Dual research discovery workflow",
        kind: "operation",
        layer: "operation",
        parent_id: "advisory_boundary",
        group: "Notebook advisory",
        diagnostic_state: "structural",
        repair_state: "none",
      },
      {
        id: "human_review_handoff",
        label: "Human save and export review handoff",
        kind: "gate",
        layer: "operation",
        parent_id: "advisory_boundary",
        group: "Notebook advisory",
        diagnostic_state: "structural",
        repair_state: "none",
      },
    ],
    edges: [
      {
        id: "boundary_contains_metadata_bridge",
        from: "advisory_boundary",
        to: "metadata_bridge",
        label: "contains metadata bridge",
        relation: "contains",
        layer: "module",
        evidence_mode: "structural_only",
      },
      {
        id: "boundary_contains_discovery_workflow",
        from: "advisory_boundary",
        to: "discovery_workflow",
        label: "contains discovery workflow",
        relation: "contains",
        layer: "operation",
        evidence_mode: "structural_only",
      },
      {
        id: "boundary_contains_human_review_handoff",
        from: "advisory_boundary",
        to: "human_review_handoff",
        label: "contains human review handoff",
        relation: "contains",
        layer: "operation",
        evidence_mode: "structural_only",
      },
      {
        id: "discovery_advises_human_review",
        from: "discovery_workflow",
        to: "human_review_handoff",
        label: "research delta handoff",
        relation: "advises",
        layer: "operation",
        evidence_mode: "structural_only",
      },
      {
        id: "metadata_projects_human_review",
        from: "metadata_bridge",
        to: "human_review_handoff",
        label: "metadata-only advisory handoff",
        relation: "projects",
        layer: "operation",
        evidence_mode: "structural_only",
      },
    ],
  });
}
