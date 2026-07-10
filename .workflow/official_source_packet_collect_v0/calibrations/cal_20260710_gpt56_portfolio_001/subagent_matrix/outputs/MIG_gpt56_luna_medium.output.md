```yaml
packet_identity:
  workflow_id: official_source_packet_collect_v0
  fixture_id: public_synthetic_mixed_source_states
  mode: dry_run
  public_safe: true
  source_collection_binding: fixture://source_packets/demo_board

approval:
  approved_source_policy:
    official_publishers:
      - ACME Devices
      - Synth Tool Foundation
    owner_local_use_requires_explicit_scope: true
    network_execution_allowed: false
  executor_approval_rule: only official_present and owner_approved_local
  no_browse_download_upload_or_local_file_access: true

scope:
  identifiers:
    - ID-A
    - ID-B

identifier_inventory:
  - identifier_id: ID-A
    identifier_kind: component
    display_value: ACME-100
    source_basis: supplied synthetic identifier_scope
    confidence_state: confirmed_fixture_identifier
    requested_source_kinds:
      - datasheet
      - layout_or_package_document
      - simulation_model
    downstream_consumers:
      - materials
      - layout
      - simulation

  - identifier_id: ID-B
    identifier_kind: tool
    display_value: SYNTH-TOOL
    source_basis: supplied synthetic identifier_scope
    confidence_state: confirmed_fixture_identifier
    requested_source_kinds:
      - standard_or_tool_document
    downstream_consumers:
      - harness

source_state_summary:
  official_present: 1
  owner_approved_local: 1
  missing: 0
  blocked: 1
  not_applicable: 0
  candidate_official: 0
  third_party_unapproved: 1
  conflicting: 0

source_inventory:
  - identifier_id: ID-A
    source_kind: datasheet
    state: official_present
    authoritative_publisher: ACME Devices
    title: ACME-100 Data Sheet
    canonical_url_or_landing_page: https://example.invalid/acme/acme-100
    revision_or_publication_date: R2
    access_date: 2026-07-10
    claims_supported:
      - identity
      - electrical limits
    approved_for_executor: true
    public_summary_allowed: true

  - identifier_id: ID-A
    source_kind: layout_or_package_document
    state: third_party_unapproved
    publisher: Unknown mirror
    title: ACME-100 Layout Notes
    approved_for_executor: false
    public_summary_allowed: false
    required_next_action: Obtain an authoritative ACME Devices layout or package document, or an explicitly approved local official copy.

  - identifier_id: ID-A
    source_kind: simulation_model
    state: blocked
    searched_identifier: ACME-100
    requested_source_kind: simulation_model
    searched_locations_or_access_attempts:
      - fixture://official/acme/simulation-model-download
    blocker: account-bound download unavailable
    downstream_impact: simulation readiness remains blocked
    required_next_action: Owner supplies an approved local model or separately authorizes an acceptable access route.
    approved_for_executor: false
    public_summary_allowed: false

  - identifier_id: ID-B
    source_kind: standard_or_tool_document
    state: owner_approved_local
    title: Synth Tool Format Guide
    root_relative_or_project_local_path: owner-local://docs/synth-format-guide.pdf
    source_origin_type: owner-provided local official source
    owner_approval_scope: executor_for_fixture
    approved_for_executor: true
    public_summary_allowed: true
    checksum: sha256:fixture-tool-guide

source_gap_report:
  - identifier_id: ID-A
    source_kind: layout_or_package_document
    state: third_party_unapproved
    gap: No authoritative or owner-approved layout/package evidence is supplied.
    downstream_impact: Layout claims and package-specific guidance cannot be source-backed.
    required_next_action: Acquire authoritative or owner-approved local evidence.

  - identifier_id: ID-A
    source_kind: simulation_model
    state: blocked
    gap: Account-bound model access is unavailable.
    downstream_impact: Simulation workflow is blocked.
    required_next_action: Owner supplies an approved local model or authorizes an acceptable access route.

owner_followup_needed:
  - identifier_id: ID-A
    source_kind: layout_or_package_document
    action: Provide authoritative ACME Devices evidence or owner-approved local official copy.

  - identifier_id: ID-A
    source_kind: simulation_model
    action: Provide an approved local model or separately authorize an acceptable access route.

download_or_reuse_manifest:
  mode: dry_run
  actions:
    - identifier_id: ID-A
      source_kind: datasheet
      action: reuse_supplied_existing_source_packet
      state: official_present
      download_performed: false

    - identifier_id: ID-B
      source_kind: standard_or_tool_document
      action: reuse_supplied_owner_approved_local_reference
      state: owner_approved_local
      download_performed: false

    - identifier_id: ID-A
      source_kind: layout_or_package_document
      action: no_reuse_unapproved_source
      state: third_party_unapproved

    - identifier_id: ID-A
      source_kind: simulation_model
      action: no_download_blocked
      state: blocked

owner_held_source_archive_manifest:
  requested: false
  entries: []
  archive_presence_is_not_source_authority: true

downstream_ready_refs:
  materials:
    state: ready
    refs:
      - ID-A/datasheet
    notes: Datasheet evidence supports identity and electrical-limit claims. No package or simulation claims are implied.

  layout:
    state: review_only
    refs:
      - ID-A/layout_or_package_document
    notes: The supplied layout document is third_party_unapproved. Layout claims require authoritative or owner-approved evidence.

  simulation:
    state: blocked
    refs:
      - ID-A/simulation_model
    notes: Model access is blocked; no simulation model or simulator-term claim is approved.

  harness:
    state: ready
    refs:
      - ID-B/standard_or_tool_document
    notes: Source status and remaining gaps are visible. No unsupported quantitative or model claims are implied.

boundary_review_note:
  status: boundary_safe_with_followup
  confirmed:
    - All identifiers and records remain synthetic.
    - official_present and owner_approved_local states are explicit.
    - Only those states are approved_for_executor.
    - third_party_unapproved and blocked states remain visible.
    - Owner follow-up is structured for unresolved gaps.
    - No browsing, downloading, uploading, archive action, payload copy, or local-file access is represented.
    - No runtime absolute paths, credentials, sessions, or raw vendor payloads are included.
    - Archive non-request status is explicit.
  non_claims:
    - No source beyond the supplied fixture is asserted.
    - Archive presence, mirror content, and blocked-download availability are not treated as source authority.
    - Layout and simulation readiness are not claimed as complete.
```
