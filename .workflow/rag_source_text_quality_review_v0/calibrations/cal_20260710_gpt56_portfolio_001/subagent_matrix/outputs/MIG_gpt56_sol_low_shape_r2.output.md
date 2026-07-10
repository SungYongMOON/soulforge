profile:
  candidate_id: MIG_gpt56_sol_low_shape_r2
  model: gpt-5.6-sol
  reasoning_effort: low
  species: unknown
  class: unknown
quality_review_scope_binding:
  workflow_ref: rag_source_text_quality_review_v0
  fixture_status: missing
  scope_status: blocked
  approved_source_refs: []
source_text_index_inventory:
  status: blocked
  reason: synthetic_fixture_not_provided
  entries: []
traceability_sidecar_inventory:
  status: blocked
  warning_labels:
    - missing_sidecar_mapping
  mappings: []
answer_run_trace_inventory:
  status: blocked
  traces:
    - claim_ref: claim_ref_1
      page_ref: page_ref_1
      citation_refs: []
      retrieval_refs: []
      source_refs: []
      trace_refs: []
    - claim_ref: claim_ref_2
      page_ref: page_ref_2
      citation_refs: []
      retrieval_refs: []
      source_refs: []
      trace_refs: []
    - claim_ref: claim_ref_3
      page_ref: page_ref_3
      citation_refs: []
      retrieval_refs: []
      source_refs: []
      trace_refs: []
    - claim_ref: claim_ref_4
      page_ref: page_ref_4
      citation_refs: []
      retrieval_refs: []
      source_refs: []
      trace_refs: []
    - claim_ref: claim_ref_5
      page_ref: page_ref_5
      citation_refs: []
      retrieval_refs: []
      source_refs: []
      trace_refs: []
page_quality_review_packet:
  - page_ref: page_ref_1
    claim_ref: claim_ref_1
    classification: blocked
    warning_labels:
      - missing_fixture_metadata
      - missing_page_identity
      - missing_sidecar_mapping
  - page_ref: page_ref_2
    claim_ref: claim_ref_2
    classification: blocked
    warning_labels:
      - missing_fixture_metadata
      - missing_page_identity
      - missing_sidecar_mapping
  - page_ref: page_ref_3
    claim_ref: claim_ref_3
    classification: blocked
    warning_labels:
      - missing_fixture_metadata
      - missing_page_identity
      - missing_sidecar_mapping
  - page_ref: page_ref_4
    claim_ref: claim_ref_4
    classification: blocked
    warning_labels:
      - missing_fixture_metadata
      - missing_page_identity
      - missing_sidecar_mapping
  - page_ref: page_ref_5
    claim_ref: claim_ref_5
    classification: blocked
    warning_labels:
      - missing_fixture_metadata
      - missing_page_identity
      - missing_sidecar_mapping
boundary_review_note:
  payload_free: true
  review_limit: support_traces_only
  does_not_prove:
    - source_truth
    - answer_correctness
    - owner_approval
    - canon_readiness
    - registration
    - default_route_safety
  route_hints:
    - provide_synthetic_fixture_metadata
    - rerun_quality_review
completion_state: blocked_missing_fixture
