// E02 Interface Consistency candidate rule metadata. It contains no source body,
// project payload, private interface register, or project-specific applicability decision.
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";

export const INTERFACE_CONSISTENCY_RULESET_SCHEMA = "soulforge.interface_consistency.ruleset.v0";
export const INTERFACE_CONSISTENCY_RULESET_REVISION = "soulforge.interface_consistency.ruleset.v0";
export const INTERFACE_CONSISTENCY_DOMAIN_INPUT_SCHEMA = "soulforge.interface_consistency.domain_input.v0";
export const INTERFACE_CONSISTENCY_ASSESSMENT_SCHEMA = "soulforge.interface_consistency.assessment.v0";

export const INTERFACE_CONSISTENCY_CATEGORIES = Object.freeze([
  "interface_register",
  "electrical",
  "signal",
  "data_protocol",
  "mechanical",
  "timing",
  "revision",
  "bilateral_agreement",
]);

export const INTERFACE_CONSISTENCY_COMPARISON_CATEGORIES = Object.freeze([
  "electrical",
  "signal",
  "data_protocol",
  "mechanical",
  "timing",
]);

export const INTERFACE_CONSISTENCY_SOURCE_PACKET_REF = Object.freeze({
  entity_id: "interface-consistency-source-packet-v0",
  revision_id: "interface-consistency-source-packet-v0",
  content_id: "sha256:4105f0ae10fe126be2f068c078eff259a95c93746eff072f42356e7d36780580",
  content_hash_alg: "sha256",
});

const freezeRule = (rule) => Object.freeze({
  ...rule,
  source_refs: Object.freeze([...rule.source_refs]),
  source_locators: Object.freeze([...rule.source_locators]),
});

export const INTERFACE_CONSISTENCY_RULES = Object.freeze([
  freezeRule({
    rule_id: "IC-REG-01",
    category: "interface_register",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S2_NASA_SP_2016_6105_REV_2"],
    source_locators: ["ECSS Annex A.2.1<4>a,e,f", "NASA SP-2016-6105 Rev 2 §6.3.1.1"],
    check_kind: "registered_interface_ends",
  }),
  freezeRule({
    rule_id: "IC-ELEC-01",
    category: "electrical",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S2_NASA_SP_2016_6105_REV_2"],
    source_locators: ["ECSS Annex A.2.1<4>i, <5>a", "NASA SP-2016-6105 Rev 2 §6.3"],
    check_kind: "pairwise_declared_attribute_equality",
  }),
  freezeRule({
    rule_id: "IC-SIG-01",
    category: "signal",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S2_NASA_SP_2016_6105_REV_2"],
    source_locators: ["ECSS Annex A.2.1<4>a,g,i", "NASA SP-2016-6105 Rev 2 §6.3.1.2.2"],
    check_kind: "pairwise_declared_attribute_equality",
  }),
  freezeRule({
    rule_id: "IC-DATA-01",
    category: "data_protocol",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S3_DOD_DI_IPSC_81436_REV_A_NOTICE_3"],
    source_locators: ["ECSS Annex A.2.1<4>g,i", "DI-IPSC-81436 §10.2"],
    check_kind: "pairwise_declared_attribute_equality",
  }),
  freezeRule({
    rule_id: "IC-MECH-01",
    category: "mechanical",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S2_NASA_SP_2016_6105_REV_2"],
    source_locators: ["ECSS Annex A.2.1<5>a.5-a.6", "NASA SP-2016-6105 Rev 2 §6.3"],
    check_kind: "pairwise_declared_attribute_equality",
  }),
  freezeRule({
    rule_id: "IC-TIME-01",
    category: "timing",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S3_DOD_DI_IPSC_81436_REV_A_NOTICE_3"],
    source_locators: ["ECSS Annex A.2.1<4>a,g", "DI-IPSC-81436 §10.2"],
    check_kind: "pairwise_declared_attribute_equality",
  }),
  freezeRule({
    rule_id: "IC-REV-01",
    category: "revision",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S2_NASA_SP_2016_6105_REV_2"],
    source_locators: ["ECSS Annex A.2.1<2>b-c", "NASA SP-2016-6105 Rev 2 §6.3.1.2.3"],
    check_kind: "interface_revision_alignment",
  }),
  freezeRule({
    rule_id: "IC-BILAT-01",
    category: "bilateral_agreement",
    source_refs: ["S1_ECSS_E_ST_10_24C_REV_1", "S2_NASA_SP_2016_6105_REV_2", "S4_IETF_RFC_9368"],
    source_locators: ["ECSS Annex A.2.1<4>d-e", "NASA SP-2016-6105 Rev 2 §6.3.1.1", "RFC 9368 §§2.2-2.3,3"],
    check_kind: "all_ends_agree_at_reconciled_revision",
  }),
]);

const digestMaterial = {
  schema_version: INTERFACE_CONSISTENCY_RULESET_SCHEMA,
  revision: INTERFACE_CONSISTENCY_RULESET_REVISION,
  source_packet_ref: INTERFACE_CONSISTENCY_SOURCE_PACKET_REF,
  rules: INTERFACE_CONSISTENCY_RULES,
};

const rulesetDigest = sha256Hex(
  `soulforge.interface_consistency.ruleset.digest.v0\n${canonicalise(digestMaterial, {
    rules: "insertion_ordered",
    "rules[].source_refs": "insertion_ordered",
    "rules[].source_locators": "insertion_ordered",
  })}`,
);

export const INTERFACE_CONSISTENCY_RULESET_REF = Object.freeze({
  entity_id: "interface-consistency-ruleset-v0",
  revision_id: INTERFACE_CONSISTENCY_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: "sha256",
});
