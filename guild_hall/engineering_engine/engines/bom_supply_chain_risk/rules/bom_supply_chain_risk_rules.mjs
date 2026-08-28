import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { canonicalise, compareCodePoints } from "../../../core/validators/canonical.mjs";
import {
  BOM_SCR_DOMAIN_ENGINE_ID,
  RISK_DIMENSIONS,
} from "../vocabulary/bom_supply_chain_risk_vocabulary.mjs";

export const BOM_SCR_RULESET_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.ruleset.v0";
export const BOM_SCR_SOURCE_PACKET_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.source_packet.v0";
export const BOM_SCR_RULESET_REVISION = "2026-08-28";

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

export const BOM_SCR_SOURCE_PACKET_REF = freezeDeep({
  entity_id: "bom-supply-chain-risk-public-source-packet-v0",
  revision_id: "2026-08-28",
  content_id: "sha256:7b2ae1bb16f97a9d62a37ce43db0c38f609d5e2a9279c64ec7e964692c619e57",
  content_hash_alg: "sha256",
});

export const BOM_SCR_SOURCE_REFERENCES = freezeDeep([
  {
    source_id: "S1-DODM-4245.15",
    revision: "effective-2022-10-26",
    locator: "§§3.3-3.4; glossary",
    applicability: "DoD policy; vocabulary only unless an explicit project binding establishes applicability",
    applicability_mode: "vocabulary_only",
  },
  {
    source_id: "S2-DFARS-252.246-7007",
    revision: "DFARS-change-2026-05-07; clause-JAN-2023",
    locator: "introductory applicability sentence; (a), (c)(2), (c)(4)-(12)",
    applicability: "only with affirmative typed clause-incorporation and Cost Accounting Standards applicability gates",
    applicability_mode: "conditional_contract",
  },
  {
    source_id: "S3-DFARS-252.246-7008",
    revision: "DFARS-change-2026-05-07; clause-JAN-2023",
    locator: "(a)-(c)",
    applicability: "only when the exact clause is incorporated",
    applicability_mode: "conditional_contract",
  },
  {
    source_id: "S4-NIST-MEP-2024",
    revision: "published-2024-01-16",
    locator: "Mapping Program Captures Key Data",
    applicability: "public educational guidance; not a procurement rule",
    applicability_mode: "educational_only",
  },
  {
    source_id: "S5-NIST-SP-800-161R1-UPD1",
    revision: "May-2022; updates-through-2024-11-01",
    locator: "supply-chain risk-management family",
    applicability: "ICT/OT supply-chain guidance; not a hardware-BOM rule",
    applicability_mode: "educational_only",
  },
]);

const source = (sourceId) => BOM_SCR_SOURCE_REFERENCES.find((entry) => entry.source_id === sourceId);

const rule = (rule_id, risk_dimension, source_id, purpose) => freezeDeep({
  rule_id,
  risk_dimension,
  source_id,
  source_revision: source(source_id).revision,
  source_locator: source(source_id).locator,
  source_applicability: source(source_id).applicability,
  source_applicability_mode: source(source_id).applicability_mode,
  purpose,
});

export const BOM_SCR_RULES = freezeDeep([
  rule("BOM-SCR-01", "lifecycle_status", "S1-DODM-4245.15", "Assess observed production/lifecycle status without inferring a manufacturer decision."),
  rule("BOM-SCR-02", "obsolescence_signal", "S1-DODM-4245.15", "Retain DMSMS notifications and validated issue signals as risk inputs."),
  rule("BOM-SCR-03", "long_lead", "S1-DODM-4245.15", "Compare observed lead time to a bound Profile threshold; never invent a universal limit."),
  rule("BOM-SCR-04", "sole_source", "S1-DODM-4245.15", "Project qualified-source count and alternate status as a continuity risk signal."),
  rule("BOM-SCR-05", "alternate_qualification", "S3-DFARS-252.246-7008", "Keep alternate status and source/traceability evidence distinct from approval authority."),
  rule("BOM-SCR-06", "counterfeit_control", "S2-DFARS-252.246-7007", "Project bounded traceability/control evidence only after both source-bound applicability gates; never counterfeit authentication."),
  rule("BOM-SCR-07", "supplier_concentration", "S4-NIST-MEP-2024", "Compare observed supplier count to a bound Profile threshold."),
  rule("BOM-SCR-08", "geographic_concentration", "S4-NIST-MEP-2024", "Compare observed geography count to a bound Profile threshold."),
  rule("BOM-SCR-09", "continuity_gap", "S1-DODM-4245.15", "Project bounded continuity-plan evidence and open gaps."),
]);

if (BOM_SCR_RULES.length !== RISK_DIMENSIONS.length
  || !BOM_SCR_RULES.every((entry, index) => entry.risk_dimension === RISK_DIMENSIONS[index])) {
  throw new Error("BOM/SCR base rules must remain one-to-one and ordered with the closed risk vocabulary");
}

const baseRulesMaterial = JSON.stringify(BOM_SCR_RULES);
export const BOM_SCR_RULESET_REF = freezeDeep({
  entity_id: "bom-supply-chain-risk-ruleset-v0",
  revision_id: BOM_SCR_RULESET_REVISION,
  content_id: `sha256:${sha256Hex(`soulforge.bom_supply_chain_risk.ruleset.v0\n${baseRulesMaterial}`)}`,
  content_hash_alg: "sha256",
});

function arrayOrderRules(value, path = "", rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = "insertion_ordered";
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

/**
 * One E08-local identity calculation for Profile-derived rule sets. Core owns
 * Profile-operation canonicalisation; this helper only binds the already
 * validated, ordered threshold/provenance result to the immutable base rule set.
 */
export function deriveBomSupplyChainRiskRulesetRef(thresholds, profileThresholdProvenance) {
  const thresholdEntries = Object.entries(thresholds).sort(([left], [right]) => compareCodePoints(left, right));
  const provenanceEntries = Object.entries(profileThresholdProvenance).sort(([left], [right]) => compareCodePoints(left, right));
  if (thresholdEntries.length === 0 && provenanceEntries.length === 0) {
    return freezeDeep({ ...BOM_SCR_RULESET_REF });
  }
  const material = {
    base_ruleset_content_id: BOM_SCR_RULESET_REF.content_id,
    thresholds: Object.fromEntries(thresholdEntries),
    profile_threshold_provenance: Object.fromEntries(provenanceEntries),
  };
  const canonicalMaterial = canonicalise(material, arrayOrderRules(material));
  const hash = sha256Hex(`soulforge.bom_supply_chain_risk.derived_ruleset.v0\n${canonicalMaterial}`);
  return freezeDeep({
    entity_id: BOM_SCR_RULESET_REF.entity_id,
    revision_id: `derived:${hash.slice(0, 20)}`,
    content_id: `sha256:${hash}`,
    content_hash_alg: "sha256",
  });
}
