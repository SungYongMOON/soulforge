schema_version: official_source_packet_bundle_v0
packet_identity:
  workflow_id: official_source_packet_collect_v0
  fixture_id: public_synthetic_mixed_source_states
  packet_mode: dry_run
  public_safe: true
  source_collection_binding: fixture://source_packets/demo_board
  boundary_attestation: All publishers, identifiers, URLs, refs, checksums, and records are synthetic.

approval:
  approved_source_policy:
    official_publishers:
      - ACME Devices
      - Synth Tool Foundation
    owner_local_use_requires_explicit_scope: true
    network_execution_allowed: false
  approved_for_executor_states:
    - official_present
    - owner_approved_local
  non_approved_states:
    - missing
    - blocked
    - not_applicable
    - candidate_official
    - third_party_unapproved
    - conflicting

scope:
  permitted_evidence:
    - supplied existing source packet records
    - supplied owner-approved local source manifest
  prohibited_actions:
    - browsing
    - downloading
    - uploading
    - archive synchronization
    - local file reads
    - mirror promotion
    - silent owner-local approval
    - payload copying
    - source claims beyond supplied evidence

identifier_inventory:
  - identifier_id: ID-A
    identifier_kind: component
    display_value: ACME-100
    source_basis: supplied_identifier_scope
    confidence_state: supplied_identity_unverified
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
    source_basis: supplied_identifier_scope
    confidence_state: supplied_identity_unverified
    requested_source_kinds:
      - standard_or_tool_document
    downstream_consumers:
      - harness

source_state_summary:
  official_present: 1
  owner_approved_local: 1
  blocked: 1
  third_party_unapproved: 1
  missing: 0
  not_applicable: 0
  candidate_official: 0
  conflicting: 0

source_inventory:
  - source_id: SRC-A-DATASHEET
    identifier_id: ID-A
    source_kind: datasheet
    state: official_present
    approved_for_executor: true
    authoritative_publisher: ACME Devices
    title: ACME-100 Data Sheet
    canonical_url_or_landing_page: https://example.invalid/acme/acme-100
    revision_or_publication_date_when_available: R2
    access_date: "2026-07-10"
    claims_supported:
      - identity
      - electrical limits
    evidence_basis: supplied_existing_source_packet
    uncertainty: Publisher authority and document contents were not independently checked in this dry run.

  - source_id: SRC-A-LAYOUT
    identifier_id: ID-A
    source_kind: layout_or_package_document
    state: third_party_unapproved
    approved_for_executor: false
    publisher: Unknown mirror
    title: ACME-100 Layout Notes
    claims_supported: []
    evidence_basis: supplied_existing_source_packet
    blocker_if_any: No authoritative provenance or owner-approved scope is supplied.
    uncertainty: The document's identity, revision, accuracy, and relationship to ACME-100 remain unconfirmed.

  - source_id: SRC-A-SIMULATION
    identifier_id: ID-A
    source_kind: simulation_model
    state: blocked
    approved_for_executor: false
    searched_identifier: ACME-100
    requested_source_kind: simulation_model
    searched_locations_or_access_attempts:
      - fixture://official/acme/simulation-model-download
    blocker_if_any: account-bound download unavailable
    downstream_impact: simulation readiness remains blocked
    required_next_action: owner supplies an approved local model or separately authorizes an acceptable access route
    claims_supported: []
    evidence_basis: supplied_existing_source_packet
    uncertainty: Model format, version, license terms, and suitability are unknown.

  - source_id: SRC-B-TOOL-GUIDE
    identifier_id: ID-B
    source_kind: standard_or_tool_document
    state: owner_approved_local
    approved_for_executor: true
    title: Synth Tool Format Guide
    owner_approval_scope: executor_for_fixture
    root_relative_or_project_local_path: owner-local://docs/synth-format-guide.pdf
    source_origin_type: owner_supplied_local_manifest
    public_summary_allowed: true
    checksum_when_a_local_file_is_used: sha256:fixture-tool-guide
    claims_supported:
      - synthetic tool format guidance within the owner-approved fixture scope
    evidence_basis: supplied_owner_approved_local_source_manifest
    uncertainty: File presence, checksum, contents, revision, and publisher provenance were not independently checked.

source_gap_report:
  - gap_id: GAP-A-LAYOUT
    identifier_id: ID-A
    requested_source_kind: layout_or_package_document
    current_state: third_party_unapproved
    searched_identifier: ACME-100
    searched_locations_or_access_attempts:
      - supplied existing source packet only
    acceptable_source_found: false
    downstream_impact: Layout claims cannot use the supplied mirror record; layout work is limited to gap-aware review.
    required_next_action: Supply an authoritative ACME Devices package or layout document, or an explicitly scoped owner-approved local official copy.

  - gap_id: GAP-A-SIMULATION
    identifier_id: ID-A
    requested_source_kind: simulation_model
    current_state: blocked
    searched_identifier: ACME-100
    searched_locations_or_access_attempts:
      - fixture://official/acme/simulation-model-download
    acceptable_source_found: false
    downstream_impact: simulation readiness remains blocked
    required_next_action: owner supplies an approved local model or separately authorizes an acceptable access route

owner_followup_needed:
  required: true
  items:
    - followup_id: FOLLOWUP-A-LAYOUT
      identifier_id: ID-A
      priority: required_for_layout_claims
      decision_or_material_needed: Authoritative package/layout documentation or an explicitly scoped owner-approved local official copy.
      stop_condition: Do not derive or approve layout claims from SRC-A-LAYOUT while it remains third_party_unapproved.

    - followup_id: FOLLOWUP-A-SIMULATION
      identifier_id: ID-A
      priority: required_for_simulation
      decision_or_material_needed: Approved local simulation model, including known format and permitted-use scope, or separate authorization for an acceptable access route.
      stop_condition: Do not obtain, approve, or use an account-bound model without owner-supplied material or appropriate authorization.

download_or_reuse_manifest:
  execution_state: no_action_dry_run
  downloads:
    - status: none
      reason: Network execution is prohibited by the fixture policy.
  reuse_entries:
    - source_id: SRC-A-DATASHEET
      disposition: index_supplied_packet_record
      payload_copied: false
      verification_claimed: false

    - source_id: SRC-A-LAYOUT
      disposition: retain_as_unapproved_reference_only
      payload_copied: false
      verification_claimed: false

    - source_id: SRC-A-SIMULATION
      disposition: retain_blocked_state_only
      payload_copied: false
      verification_claimed: false

    - source_id: SRC-B-TOOL-GUIDE
      disposition: index_owner_manifest_reference_with_fixture_scope
      payload_copied: false
      verification_claimed: false

owner_held_source_archive_manifest:
  requested: false
  action_taken: none
  entries: []
  authority_note: No archive presence, upload, synchronization, or canon status is asserted.

downstream_ready_refs:
  materials:
    identifier_id: ID-A
    readiness_state: review_only
    approved_source_refs:
      - SRC-A-DATASHEET
    unresolved_refs:
      - GAP-A-LAYOUT
      - GAP-A-SIMULATION
    basis: An approved datasheet record supports identity and electrical-limit claims, but the synthetic identity and document contents remain independently unverified.
    allowed_use: Datasheet-backed materials review limited to the named supported claims.
    stop_condition: Do not extend the datasheet record to package, layout, or simulation claims.

  layout:
    identifier_id: ID-A
    readiness_state: review_only
    approved_source_refs: []
    unresolved_refs:
      - SRC-A-LAYOUT
      - GAP-A-LAYOUT
    basis: The layout source is third_party_unapproved, while the layout gap is explicitly recorded.
    allowed_use: Gap-aware planning only.
    stop_condition: No layout requirement or geometry claim may be approved without an acceptable source.

  simulation:
    identifier_id: ID-A
    readiness_state: blocked
    approved_source_refs: []
    unresolved_refs:
      - SRC-A-SIMULATION
      - GAP-A-SIMULATION
    basis: The only supplied simulation-model state is blocked.
    allowed_use: Blocker tracking only.
    stop_condition: No simulation model availability, format, license, or suitability claim may be made until approved evidence is supplied.

  harness:
    identifier_id: ID-B
    readiness_state: review_only
    approved_source_refs:
      - SRC-B-TOOL-GUIDE
    unresolved_refs: []
    basis: The guide has explicit owner approval for executor use within the fixture, but its contents and checksum remain unchecked.
    allowed_use: Fixture-scoped review using the manifest reference, subject to downstream access and integrity checks.
    stop_condition: Do not treat archive presence, manifest metadata, or the synthetic checksum as independent proof of file contents or authoritative publication.

boundary_review_note:
  review_basis: supplied_fixture_only
  disposition: conditionally_handoff_ready
  findings:
    - Official and owner-approved-local records are explicitly separated from blocked and third-party-unapproved records.
    - Only SRC-A-DATASHEET and SRC-B-TOOL-GUIDE are marked approved_for_executor.
    - Layout and simulation gaps remain visible to downstream consumers.
    - Owner follow-up items include explicit materials or decisions and stop conditions.
    - No raw payload, runtime absolute path, credential, cookie, session, or account state is included.
    - No network, download, upload, archive, or local-file action is represented as performed.
    - Archive presence is not treated as source authority or canon truth.
  unresolved_conditions:
    - ACME-100 layout evidence lacks acceptable provenance.
    - ACME-100 simulation evidence remains access-blocked.
    - Supplied metadata and owner-local file integrity were not independently checked.
  non_claims:
    - No source document contents were extracted.
    - No identifier, publisher, revision, URL, path, checksum, model format, license, or runtime fact was independently verified.
    - No downstream design, layout, simulation, ECAD, or harness requirement is established beyond the supplied evidence and approval scopes.
