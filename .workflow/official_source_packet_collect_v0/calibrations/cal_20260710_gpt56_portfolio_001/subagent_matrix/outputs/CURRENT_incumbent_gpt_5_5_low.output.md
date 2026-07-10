```yaml
source_packet_manifest:
  packet_identity:
    workflow_id: official_source_packet_collect_v0
    fixture_id: public_synthetic_mixed_source_states
    source_collection_binding: fixture://source_packets/demo_board
    dry_run: true
    public_safe: true
  approval:
    approved_source_policy:
      official_publishers:
        - ACME Devices
        - Synth Tool Foundation
      owner_local_use_requires_explicit_scope: true
      network_execution_allowed: false
    executor_approved_source_states:
      - official_present
      - owner_approved_local
  scope:
    identifiers:
      - ID-A
      - ID-B
    note: All publishers, identifiers, URLs, refs, checksums, and records are synthetic.
  source_state_summary:
    official_present: 1
    owner_approved_local: 1
    blocked: 1
    third_party_unapproved: 1
    missing: 0
    conflicting: 0
    not_applicable: 0
    candidate_official: 0
  boundary_notes:
    - No browsing, download, upload, archive action, payload copy, or local file read is claimed.
    - Third-party mirror evidence remains unapproved and is not promoted.
    - Owner-local use is approved only where explicit owner scope is supplied.
    - Blocked and weak states remain visible to downstream workflows.

identifier_inventory:
  - identifier_id: ID-A
    identifier_kind: component
    display_value: ACME-100
    source_basis: supplied_identifier_scope_and_existing_source_packets
    confidence_state: bounded_synthetic_fixture_identity
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
    source_basis: supplied_identifier_scope_and_owner_approved_local_source_manifest
    confidence_state: bounded_synthetic_fixture_identity
    requested_source_kinds:
      - standard_or_tool_document
    downstream_consumers:
      - harness

source_inventory:
  - identifier_id: ID-A
    display_value: ACME-100
    source_kind: datasheet
    state: official_present
    approved_for_executor: true
    authoritative_publisher: ACME Devices
    title: ACME-100 Data Sheet
    canonical_url_or_landing_page: https://example.invalid/acme/acme-100
    revision_or_publication_date_when_available: R2
    access_date: 2026-07-10
    claims_supported:
      - identity
      - electrical limits
    public_summary_allowed: true

  - identifier_id: ID-A
    display_value: ACME-100
    source_kind: layout_or_package_document
    state: third_party_unapproved
    approved_for_executor: false
    publisher: Unknown mirror
    title: ACME-100 Layout Notes
    canonical_url_or_landing_page: null
    revision_or_publication_date_when_available: null
    access_date: null
    claims_supported: []
    blocker_if_any: Source is outside authoritative or owner-approved channels.
    downstream_impact: Layout claims must not be made from this source.
    required_next_action: Owner supplies an official or explicitly owner-approved layout/package source, or accepts a recorded layout gap.

  - identifier_id: ID-A
    display_value: ACME-100
    source_kind: simulation_model
    state: blocked
    approved_for_executor: false
    searched_identifier: ACME-100
    requested_source_kind: simulation_model
    searched_locations_or_access_attempts:
      - fixture://official/acme/simulation-model-download
    blocker: account-bound download unavailable
    downstream_impact: simulation readiness remains blocked
    required_next_action: owner supplies an approved local model or separately authorizes an acceptable access route

  - identifier_id: ID-B
    display_value: SYNTH-TOOL
    source_kind: standard_or_tool_document
    state: owner_approved_local
    approved_for_executor: true
    title: Synth Tool Format Guide
    root_relative_or_project_local_path: owner-local://docs/synth-format-guide.pdf
    source_origin_type: owner_approved_local_official_copy
    owner_approval_scope: executor_for_fixture
    public_summary_allowed: true
    checksum_when_a_local_file_is_used: sha256:fixture-tool-guide
    claims_supported:
      - tool format guide availability for fixture executor use

source_gap_report:
  - identifier_id: ID-A
    source_kind: layout_or_package_document
    state: third_party_unapproved
    gap_type: acceptable_source_not_available
    downstream_impact: Layout workflow may record a layout/package source gap but must not extract layout claims from the mirror.
    required_next_action: Provide official ACME Devices layout/package documentation or explicitly scoped owner-approved local source.
  - identifier_id: ID-A
    source_kind: simulation_model
    state: blocked
    gap_type: access_blocked
    searched_locations_or_access_attempts:
      - fixture://official/acme/simulation-model-download
    downstream_impact: Simulation workflow is blocked for model-backed execution.
    required_next_action: Owner supplies an approved local model or separately authorizes an acceptable access route.

owner_followup_needed:
  - identifier_id: ID-A
    source_kind: layout_or_package_document
    priority: required_before_layout_claims
    owner_action: Supply official/owner-approved layout or package documentation, or approve downstream handling as an explicit layout source gap.
  - identifier_id: ID-A
    source_kind: simulation_model
    priority: required_before_simulation_model_use
    owner_action: Supply an approved local simulation model with scope/checksum, or authorize an acceptable access route.

download_or_reuse_manifest:
  network_execution_allowed: false
  downloads_performed: []
  reused_sources:
    - identifier_id: ID-A
      source_kind: datasheet
      reuse_basis: existing_source_packet
      state: official_present
      approved_for_executor: true
    - identifier_id: ID-B
      source_kind: standard_or_tool_document
      reuse_basis: owner_approved_local_source_manifest
      state: owner_approved_local
      approved_for_executor: true
  rejected_or_non_executor_sources:
    - identifier_id: ID-A
      source_kind: layout_or_package_document
      reason: third_party_unapproved
    - identifier_id: ID-A
      source_kind: simulation_model
      reason: blocked_account_bound_download_unavailable

owner_held_source_archive_manifest:
  requested: false
  archive_actions_performed: []
  archive_truth_claim: none
  note: Remote archive presence is not used as source or canon authority.

downstream_ready_refs:
  materials:
    state: ready
    refs:
      - identifier_id: ID-A
        source_kind: datasheet
        source_state: official_present
        approved_for_executor: true
        claims_supported:
          - identity
          - electrical limits
    limits:
      - Materials workflow may use only the named datasheet-supported claims from the synthetic packet.

  layout:
    state: review_only
    refs:
      - identifier_id: ID-A
        source_kind: layout_or_package_document
        source_state: third_party_unapproved
        approved_for_executor: false
    limits:
      - No layout claim may be made from the unapproved mirror.
      - Downstream layout may carry the visible source gap or wait for owner-approved evidence.

  simulation:
    state: blocked
    refs:
      - identifier_id: ID-A
        source_kind: simulation_model
        source_state: blocked
        approved_for_executor: false
    blocker: account-bound download unavailable
    required_next_action: owner supplies an approved local model or separately authorizes an acceptable access route

  harness:
    state: ready
    refs:
      - identifier_id: ID-B
        source_kind: standard_or_tool_document
        source_state: owner_approved_local
        approved_for_executor: true
        owner_approval_scope: executor_for_fixture
    limits:
      - Harness use is bounded to the supplied owner approval scope.

  ecad:
    state: not_applicable
    refs: []
    reason: No ECAD model source kind was requested in the synthetic identifier scope.

boundary_review_note:
  result: pass_for_public_safe_dry_run_packet
  checks:
    official_and_owner_local_states_are_explicit: pass
    missing_blocked_not_applicable_states_have_reasons: pass
    provenance_fields_present_for_executor_approved_sources: pass
    owner_followup_is_structured: pass
    downstream_readiness_does_not_overclaim: pass
    owner_archive_manifest_distinguishes_archive_truth: pass
    remote_archive_presence_not_treated_as_source_or_canon_authority: pass
    no_raw_payloads_or_runtime_absolute_paths_in_public_package: pass
    no_secret_or_account_state_requested_from_agent: pass
  non_claims:
    - No runtime source discovery was performed or claimed.
    - No official URL validity beyond supplied fixture evidence is claimed.
    - No checksum verification is claimed.
    - No local file existence or contents are claimed.
    - No archive, upload, sync, or download action is claimed.
```
