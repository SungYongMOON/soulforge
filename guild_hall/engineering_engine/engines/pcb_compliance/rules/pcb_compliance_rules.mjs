// Public-safe PCB compliance rule metadata. This package checks evidence readiness only;
// it does not reproduce, infer, or adjudicate protected IPC/paid-standard requirements.
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";

export const PCB_COMPLIANCE_RULESET_SCHEMA = "soulforge.pcb_compliance.ruleset.v0";
export const PCB_COMPLIANCE_RULESET_REVISION = "soulforge.pcb_compliance.ruleset.v0";

export const PCB_COMPLIANCE_SOURCE_PACKET_SHA256 = "fa810fdb890363d4ab0e87eb278c9f9d791675422b5e70703ffba2f2c0f52ff5";

export const PCB_COMPLIANCE_SOURCE_PACKET_REF = Object.freeze({
  entity_id: "pcb-compliance-source-packet-v0",
  revision_id: "pcb-compliance-source-packet-v0",
  content_id: `sha256:${PCB_COMPLIANCE_SOURCE_PACKET_SHA256}`,
  content_hash_alg: "sha256",
});

const freezeRule = (rule) => Object.freeze({
  ...rule,
  required_authority_families: Object.freeze([...rule.required_authority_families]),
  expected_evidence_keys: Object.freeze([...rule.expected_evidence_keys]),
  allowed_artifact_tokens: Object.freeze([...rule.allowed_artifact_tokens]),
});

export const projectPcbRuleForDigest = ({ allowed_artifact_tokens, ...rule }) => ({
  ...rule,
  allowed_artifact_mappings: allowed_artifact_tokens.map((artifact_token) => (
    artifact_token === null ? { source_native: true } : { artifact_token }
  )),
});

const CONTROLLED_IPC_SOURCE = /(?:^|[-_])IPC(?:[-_]|$)|(?:A-600|A-610|J-STD-001|IPC-6012)/iu;

export const isPcbControlledSourceRef = (value) => typeof value === "string" && CONTROLLED_IPC_SOURCE.test(value);

// Every public-source row is conditional on an explicit project binding. A `SATISFIED`
// outcome means the defined evidence bundle was observed; it never means PCB acceptance,
// workmanship compliance, disposition, release, or approval.
export const PCB_COMPLIANCE_RULES = Object.freeze([
  freezeRule({
    rule_id: "PCB-NASA-FAB-01",
    source_ref: "S-NASA-8739.6B",
    source_locator: "§§1.2.1, 4.1.4-4.1.5",
    source_modality: "conditional NASA workmanship requirement; process and approved-instruction evidence",
    coverage_area: "fabrication_and_assembly",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["approved_instruction_ref", "manufacturing_documentation_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: false,
    claim_ceiling: "source_supported",
  }),
  freezeRule({
    rule_id: "PCB-NASA-INSPECT-01",
    source_ref: "S-NASA-8739.6B",
    source_locator: "§6.6.1",
    source_modality: "conditional NASA inspection-record requirement; external criteria body may remain controlled",
    coverage_area: "inspection",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["applicable_criteria_ref", "inspection_record_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: true,
    claim_ceiling: "source_supported",
  }),
  freezeRule({
    rule_id: "PCB-NASA-PROTECT-01",
    source_ref: "S-NASA-8739.6B",
    source_locator: "§6.5.1",
    source_modality: "conditional NASA handling, processing, and storage control requirement",
    coverage_area: "protection_and_handling",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["manufacturing_documentation_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: false,
    claim_ceiling: "source_supported",
  }),
  freezeRule({
    rule_id: "PCB-NASA-TOOL-01",
    source_ref: "S-NASA-8739.6B",
    source_locator: "§§6.4.1-6.4.2",
    source_modality: "conditional NASA tool and measurement-control requirement",
    coverage_area: "tools_and_measurement",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["tool_control_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: false,
    claim_ceiling: "source_supported",
  }),
  freezeRule({
    rule_id: "PCB-NASA-TRACE-01",
    source_ref: "S-NASA-8739.6B",
    source_locator: "§§4.1.2, 6.8.1-6.8.2",
    source_modality: "conditional NASA record and rework/repair traceability requirement",
    coverage_area: "traceability_and_rework",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["build_record_ref", "nonconformance_record_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: false,
    claim_ceiling: "source_supported",
  }),
  freezeRule({
    rule_id: "PCB-STD-APPLICABILITY-01",
    source_ref: "S-IPC-REVISION-CATALOG",
    source_locator: "IPC-A-600, IPC-A-610, IPC-J-STD-001, IPC-6012 revision rows",
    source_modality: "public revision metadata only; controlled body and exact clause applicability stay HOLD",
    coverage_area: "approved_standard_applicability",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["lawful_access_authorization_ref", "standard_applicability_ref", "standard_revision_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: true,
    claim_ceiling: "source_supported",
  }),
]);

const digestMaterial = {
  schema_version: PCB_COMPLIANCE_RULESET_SCHEMA,
  revision: PCB_COMPLIANCE_RULESET_REVISION,
  source_packet_ref: PCB_COMPLIANCE_SOURCE_PACKET_REF,
  rules: PCB_COMPLIANCE_RULES.map(projectPcbRuleForDigest),
};

const rulesetDigest = sha256Hex(`soulforge.pcb_compliance.ruleset.digest.v0\n${canonicalise(digestMaterial, {
  rules: "sorted_by:rule_id",
  "rules[].required_authority_families": "insertion_ordered",
  "rules[].expected_evidence_keys": "insertion_ordered",
  "rules[].allowed_artifact_mappings": "insertion_ordered",
})}`);

export const PCB_COMPLIANCE_RULESET_REF = Object.freeze({
  entity_id: "pcb-compliance-ruleset-v0",
  revision_id: PCB_COMPLIANCE_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: "sha256",
});
