// FFCA candidate rule metadata. It contains only concise public-source paraphrases and
// deterministic evidence requirements; no source body, project payload, or authority grant.
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";

export const FFCA_RULESET_SCHEMA = "soulforge.field_failure_corrective_action.ruleset.v0";
export const FFCA_RULESET_REVISION = "soulforge.field_failure_corrective_action.ruleset.v0";
export const FFCA_SOURCE_PACKET_SCHEMA = "soulforge.field_failure_corrective_action.source_packet.v0";

export const FFCA_SOURCE_INVENTORY = Object.freeze([
  Object.freeze({
    source_id: "S1-NRC-10CFR50-APPB",
    authority: "U.S. Nuclear Regulatory Commission; eCFR current view",
    access_class: "official_public_html",
    revision_basis: "eCFR Title 10 API up_to_date_as_of 2026-08-24; latest_amended_on 2026-08-21; observed 2026-08-26",
    url: "https://www.ecfr.gov/current/title-10/chapter-I/part-50/subject-group-ECFR89aa6ca4aada73c/appendix-Appendix%20B%20to%20Part%2050",
    applicability: "nuclear scope only unless an exact project binding establishes applicability",
  }),
  Object.freeze({
    source_id: "S2-NRC-10CFR21",
    authority: "U.S. Nuclear Regulatory Commission; eCFR current view",
    access_class: "official_public_html",
    revision_basis: "eCFR Title 10 API up_to_date_as_of 2026-08-24; latest_amended_on 2026-08-21; observed 2026-08-26",
    url: "https://www.ecfr.gov/current/title-10/chapter-I/part-21",
    applicability: "NRC-regulated scope only unless an exact project binding establishes applicability",
  }),
  Object.freeze({
    source_id: "S3-FDA-QMSR-2026",
    authority: "U.S. Food and Drug Administration",
    access_class: "official_public_html_with_protected_ibr",
    revision_basis: "FDA QMSR page updated 2026-02-02; accessed 2026-08-26",
    url: "https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr",
    applicability: "medical-device finished-manufacturer scope only; ISO 13485 body was not accessed",
  }),
]);

// This is the SHA-256 of the accepted public source-packet Markdown bytes. Runtime does not
// read files; the corresponding regression test recomputes the Markdown hash and fails on
// source, derivation, or HOLD drift.
export const FFCA_SOURCE_PACKET_MARKDOWN_SHA256 = "d88f4c21084a56d4b64206cd530c8233f707249c2465224731c590dc491f0bef";

export const FFCA_SOURCE_PACKET_REF = Object.freeze({
  entity_id: "field-failure-corrective-action-source-packet-v0",
  revision_id: "field-failure-corrective-action-source-packet-v0",
  content_id: "sha256:" + FFCA_SOURCE_PACKET_MARKDOWN_SHA256,
  content_hash_alg: "sha256",
});

const freezeRule = (rule) => Object.freeze({
  ...rule,
  source_refs: Object.freeze([...rule.source_refs]),
  required_evidence_keys: Object.freeze([...rule.required_evidence_keys]),
  ...(rule.not_required_evidence_keys
    ? { not_required_evidence_keys: Object.freeze([...rule.not_required_evidence_keys]) }
    : {}),
});

// Ordered by rule_id. Rows are candidate evidence checks only: accepted project applicability
// and external human authority remain prerequisites outside this package.
export const FFCA_RULES = Object.freeze([
  freezeRule({
    rule_id: "FFCA-ACTION-01",
    source_refs: ["S1-NRC-10CFR50-APPB", "S2-NRC-10CFR21"],
    source_locator: "Appendix B Criterion XVI; 10 CFR 21.21(d)(4)(vii)",
    source_modality: "corrective action, responsible organization, and completion horizon are sector-specific recorded facts",
    required_evidence_keys: ["action_owner_ref", "corrective_action_ref", "target_date_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-CHANGE-01",
    source_refs: ["S1-NRC-10CFR50-APPB"],
    source_locator: "Appendix B Criteria III and VI",
    source_modality: "a declared related design or document change needs traceable control and propagation review; approval stays external",
    required_evidence_keys: ["change_propagation_review_ref", "related_change_ref"],
    not_required_evidence_keys: ["change_not_required_basis_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-CLOSURE-01",
    source_refs: ["S1-NRC-10CFR50-APPB"],
    source_locator: "Appendix B Criteria XVI and XVII",
    source_modality: "closure-readiness evidence and records may be assessed; a closure decision is never emitted",
    required_evidence_keys: ["closure_evidence_index_ref", "closure_readiness_review_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-CONTAIN-01",
    source_refs: ["S1-NRC-10CFR50-APPB"],
    source_locator: "Appendix B Criterion XV",
    source_modality: "nonconforming items require control records that prevent inadvertent use; disposition remains external",
    required_evidence_keys: ["containment_owner_ref", "containment_record_ref", "containment_scope_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-EFFECT-01",
    source_refs: ["S1-NRC-10CFR50-APPB"],
    source_locator: "Appendix B Criterion XVIII",
    source_modality: "follow-up or re-audit evidence can support an effectiveness-review slot without defining a universal metric",
    required_evidence_keys: ["effectiveness_criteria_ref", "effectiveness_owner_ref", "effectiveness_verification_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-INTAKE-01",
    source_refs: ["S1-NRC-10CFR50-APPB", "S2-NRC-10CFR21"],
    source_locator: "Appendix B Criterion XVI; 10 CFR 21.21(a)",
    source_modality: "failure, nonconformance, or corrective-action intake and evaluation are sector-bound evidence categories",
    required_evidence_keys: ["failure_description_ref", "intake_owner_ref", "intake_receipt_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-RCA-01",
    source_refs: ["S1-NRC-10CFR50-APPB"],
    source_locator: "Appendix B Criterion XVI",
    source_modality: "a significant condition branch records cause determination and corrective action to preclude repetition",
    required_evidence_keys: ["root_cause_method_ref", "root_cause_owner_ref", "root_cause_record_ref"],
  }),
  freezeRule({
    rule_id: "FFCA-RECURRENCE-01",
    source_refs: ["S1-NRC-10CFR50-APPB"],
    source_locator: "Appendix B Criteria XVI and XVIII",
    source_modality: "recurrence-review evidence is a candidate follow-up check, not a reliability or compliance conclusion",
    required_evidence_keys: ["recurrence_owner_ref", "recurrence_review_ref", "recurrence_scope_ref"],
  }),
]);

const rulesetDigest = sha256Hex(`soulforge.field_failure_corrective_action.ruleset.v0\n${canonicalise({
  schema_version: FFCA_RULESET_SCHEMA,
  revision: FFCA_RULESET_REVISION,
  source_packet_ref: FFCA_SOURCE_PACKET_REF,
  rules: FFCA_RULES,
}, {
  rules: "insertion_ordered",
  "rules[].source_refs": "insertion_ordered",
  "rules[].required_evidence_keys": "insertion_ordered",
  "rules[].not_required_evidence_keys": "insertion_ordered",
})}`);

export const FFCA_RULESET_REF = Object.freeze({
  entity_id: "field-failure-corrective-action-ruleset-v0",
  revision_id: FFCA_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: "sha256",
});

const RULE_BY_ID = new Map(FFCA_RULES.map((rule) => [rule.rule_id, rule]));

export function getFfcaRule(ruleId) {
  return typeof ruleId === "string" ? RULE_BY_ID.get(ruleId) : undefined;
}

export function isFfcaRuleId(value) {
  return typeof value === "string" && RULE_BY_ID.has(value);
}
