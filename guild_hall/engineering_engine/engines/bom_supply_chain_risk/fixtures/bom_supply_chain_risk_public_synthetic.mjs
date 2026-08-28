// Public-synthetic typed facts only. No supplier portal, ERP row, source body,
// project payload, local path, credential, or live purchasing state is present.
import { adaptProjectEvidence } from "../../../core/interfaces/domain_engine_adapter.mjs";

const clone = (value) => structuredClone(value);

const evidence = (name) => `evidence:${name}`;
const basis = (name) => `basis:${name}`;

function healthyItem(item_id, criticality = "medium") {
  return {
    item_id,
    criticality,
    lifecycle_status: "active",
    lifecycle_evidence_ref: evidence(`${item_id}-lifecycle`),
    obsolescence_signal: "none",
    obsolescence_evidence_ref: evidence(`${item_id}-obsolescence`),
    lead_time_days: 21,
    lead_time_evidence_ref: evidence(`${item_id}-lead-time`),
    approved_source_count: 2,
    supplier_evidence_ref: evidence(`${item_id}-supplier`),
    alternate_status: "qualified",
    alternate_evidence_ref: evidence(`${item_id}-alternate`),
    counterfeit_control_status: "traceable_verified",
    counterfeit_evidence_ref: evidence(`${item_id}-counterfeit`),
    supplier_count: 3,
    geography_count: 2,
    geography_evidence_ref: evidence(`${item_id}-geography`),
    continuity_status: "covered",
    continuity_evidence_ref: evidence(`${item_id}-continuity`),
    conflict_dimensions: [],
  };
}

export function buildBomSupplyChainRiskPublicSyntheticObservation() {
  const notApplicable = healthyItem("synthetic-not-applicable", "low");
  notApplicable.alternate_status = "not_required";
  delete notApplicable.alternate_evidence_ref;
  notApplicable.alternate_not_required_basis_ref = basis("synthetic-not-applicable-alternate");

  const conflict = healthyItem("synthetic-conflict", "high");
  conflict.conflict_dimensions = ["lifecycle_status"];

  return {
    snapshot_kind: "bom_supply_chain_risk_snapshot_v0",
    snapshot_revision: "public-synthetic-v0",
    bom_identity_ref: "bom:public-synthetic-bom-v0",
    bom_revision_ref: "revision:public-synthetic-bom-r1",
    source_system_revision_ref: "source-system:public-synthetic-source-r1",
    source_applicability: {
      "S1-DODM-4245.15": { status: "vocabulary_only" },
      "S2-DFARS-252.246-7007": {
        status: "bound_applicable",
        clause_incorporation: {
          status: "affirmative",
          basis_ref: "basis:s2_clause-public-synthetic-dfars-7007",
        },
        cost_accounting_standards_applicability: {
          status: "affirmative",
          basis_ref: "basis:s2_cas-public-synthetic-dfars-7007",
        },
      },
      "S3-DFARS-252.246-7008": {
        status: "bound_applicable",
        basis_ref: "basis:s3_clause-public-synthetic-dfars-7008",
      },
      "S4-NIST-MEP-2024": { status: "educational_only" },
      "S5-NIST-SP-800-161R1-UPD1": { status: "educational_only" },
    },
    applicability_evidence: [
      {
        basis_ref: "basis:s2_clause-public-synthetic-dfars-7007",
        source_id: "S2-DFARS-252.246-7007",
        gate: "clause_incorporation",
        evidence_class: "project_typed_fact",
      },
      {
        basis_ref: "basis:s2_cas-public-synthetic-dfars-7007",
        source_id: "S2-DFARS-252.246-7007",
        gate: "cost_accounting_standards_applicability",
        evidence_class: "project_typed_fact",
      },
      {
        basis_ref: "basis:s3_clause-public-synthetic-dfars-7008",
        source_id: "S3-DFARS-252.246-7008",
        gate: "clause_incorporation",
        evidence_class: "project_typed_fact",
      },
    ],
    bom_items: [
      healthyItem("synthetic-healthy", "medium"),
      {
        item_id: "synthetic-at-risk",
        criticality: "high",
        lifecycle_status: "end_of_life",
        lifecycle_evidence_ref: evidence("at-risk-lifecycle"),
        obsolescence_signal: "notification",
        obsolescence_evidence_ref: evidence("at-risk-obsolescence"),
        lead_time_days: 120,
        lead_time_evidence_ref: evidence("at-risk-lead-time"),
        approved_source_count: 1,
        supplier_evidence_ref: evidence("at-risk-supplier"),
        alternate_status: "not_available",
        alternate_evidence_ref: evidence("at-risk-alternate"),
        counterfeit_control_status: "elevated_risk",
        counterfeit_evidence_ref: evidence("at-risk-counterfeit"),
        supplier_count: 1,
        geography_count: 1,
        geography_evidence_ref: evidence("at-risk-geography"),
        continuity_status: "gap",
        continuity_evidence_ref: evidence("at-risk-continuity"),
        conflict_dimensions: [],
      },
      {
        item_id: "synthetic-unknown",
        criticality: "unknown",
        lifecycle_status: "unknown",
        obsolescence_signal: "unknown",
        alternate_status: "unknown",
        counterfeit_control_status: "unknown",
        continuity_status: "unknown",
        conflict_dimensions: [],
      },
      notApplicable,
      conflict,
    ],
  };
}

export function buildBomSupplyChainRiskPublicSyntheticProjectBinding() {
  return {
    project_id: "public-synthetic-bom-supply-chain-risk",
    domain_engine_id: "bom_supply_chain_risk",
    binding_revision_hash: "public-synthetic-bom-supply-chain-risk-binding-v0",
  };
}

export function buildBomSupplyChainRiskPublicSyntheticProfile() {
  return {
    profile_kind: "organization",
    profile_id: "public_synthetic_bom_supply_chain_risk",
    domain_engine_id: "bom_supply_chain_risk",
    revision_or_hash: "public-synthetic-profile-v0",
    extends_or_base_pin: "bom-supply-chain-risk-ruleset-v0",
    source_refs: ["public-synthetic:bom-supply-chain-risk-profile-v0"],
    operations: [
      { op: "set_threshold", metric: "max_lead_time_days", value: 60 },
      { op: "set_threshold", metric: "minimum_supplier_count", value: 2 },
      { op: "set_threshold", metric: "minimum_geography_count", value: 2 },
    ],
    order: 0,
  };
}

export function buildBomSupplyChainRiskPublicSyntheticTypedFacts() {
  return adaptProjectEvidence(
    buildBomSupplyChainRiskPublicSyntheticProjectBinding(),
    {
      source_refs: ["public-synthetic:bom-supply-chain-risk-fixture-v0"],
      observations: [buildBomSupplyChainRiskPublicSyntheticObservation()],
    },
    {
      valid_at: "2026-08-26T00:00:00.000Z",
      known_at: "2026-08-26T00:00:00.000Z",
    },
  ).typed_project_facts;
}

export function cloneBomSupplyChainRiskPublicSyntheticObservation() {
  return clone(buildBomSupplyChainRiskPublicSyntheticObservation());
}
