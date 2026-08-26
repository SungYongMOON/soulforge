export const BOM_SCR_DOMAIN_ENGINE_ID = "bom_supply_chain_risk";
export const BOM_SCR_SNAPSHOT_KIND = "bom_supply_chain_risk_snapshot_v0";

export const RISK_DIMENSIONS = Object.freeze([
  "lifecycle_status",
  "obsolescence_signal",
  "long_lead",
  "sole_source",
  "alternate_qualification",
  "counterfeit_control",
  "supplier_concentration",
  "geographic_concentration",
  "continuity_gap",
]);

export const THRESHOLD_METRICS = Object.freeze([
  "max_lead_time_days",
  "minimum_supplier_count",
  "minimum_geography_count",
]);

export const RESULT_STATES = Object.freeze([
  "evidence_sufficient",
  "risk_detected",
  "unknown",
  "conflict",
  "not_applicable",
]);

export const LIFECYCLE_STATUSES = Object.freeze([
  "active",
  "last_time_buy",
  "not_recommended",
  "end_of_life",
  "obsolete",
  "unknown",
]);

export const OBSOLESCENCE_SIGNALS = Object.freeze([
  "none",
  "notification",
  "validated_issue",
  "unknown",
]);

export const ALTERNATE_STATUSES = Object.freeze([
  "qualified",
  "pending",
  "not_available",
  "not_required",
  "unknown",
]);

export const COUNTERFEIT_CONTROL_STATUSES = Object.freeze([
  "traceable_verified",
  "elevated_risk",
  "unknown",
]);

export const CONTINUITY_STATUSES = Object.freeze([
  "covered",
  "gap",
  "unknown",
]);

export const SOURCE_APPLICABILITY_STATUSES = Object.freeze([
  "vocabulary_only",
  "educational_only",
  "bound_applicable",
  "bound_not_applicable",
  "unknown",
]);
