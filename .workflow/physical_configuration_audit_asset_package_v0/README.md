# Physical Configuration Audit Asset Package v0

`physical_configuration_audit_asset_package_v0` is a public-safe governance workflow for auditing whether an artifact package matches the declared physical/configuration baseline.

It checks presence, checksum, attachment state, and mismatch/discrepancy rows. It does not approve baselines, approve acceptance, or mutate upstream artifacts.

## Inputs

- Baseline manifest refs.
- Optional configuration-baseline packets, MDD patch refs, trace/source refs, harness refs, release-candidate inventory refs, and owner decisions.

## Outputs

- `physical_audit_packet`
- `artifact_inventory_report`
- `checksum_report`
- `missing_or_mismatched_artifacts`
- `release_blocking_discrepancies`
- `owner_followup_needed`
- `closure_handoff`
- `boundary_review_note`

## Current Maturity

`validation_level: draft_contract_only`

This package is registered as a first public-safe contract skeleton. A controlled project-local audit pilot is still required before claiming pilot-executed, usable, or production-ready behavior.
