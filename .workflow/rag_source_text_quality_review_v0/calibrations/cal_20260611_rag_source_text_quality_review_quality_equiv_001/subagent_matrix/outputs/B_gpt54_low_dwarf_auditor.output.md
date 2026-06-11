profile:
  candidate_id: B_gpt54_low_dwarf_auditor
  model: gpt-5.4
  reasoning_effort: low
  species: dwarf
  class: auditor

quality_review_scope_binding:
  workflow_id: rag_source_text_quality_review_v0
  scope_id: SCOPE-SYN-RAG-QA-001
  review_policy_id: synthetic_payload_free_quality_review_policy_001
  approved_source_refs:
    - SRC-SYN-A
    - SRC-SYN-B
  source_text_index_ref: synthetic://rag_quality/source_text_index/SYN-001
  traceability_sidecar_ref: synthetic://rag_quality/traceability_sidecar/SYN-001
  answer_run_trace_ref: synthetic://rag_quality/answer_run_trace/SYN-001
  metadata_index_refs:
    - synthetic://rag_quality/metadata_index/SYN-001
  sourcebound_packet_refs:
    - synthetic://sourcebound/packet/SYN-001
  raw_payload_access: forbidden
  claim_ceiling: observed_synthetic_support_trace
  scope_status: bound

source_text_index_inventory:
  index_ref: synthetic://rag_quality/source_text_index/SYN-001
  page_count: 5
  pages:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      page_label: SYN-A-001
      chunk_ref_count: 2
      text_hash_refs:
        - sha256:synthetic-page-001-a
        - sha256:synthetic-page-001-b
      token_count: 420
      extraction_method: synthetic_clean_text
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      page_label: SYN-A-002
      chunk_ref_count: 1
      text_hash_refs:
        - sha256:synthetic-page-002-a
      token_count: 280
      extraction_method: synthetic_picture_caption_ocr
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      page_label: SYN-B-003
      chunk_ref_count: 2
      text_hash_refs:
        - sha256:synthetic-page-003-a
        - sha256:synthetic-page-003-b
      token_count: 515
      extraction_method: synthetic_table_ocr
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      page_label: SYN-B-004
      chunk_ref_count: 1
      text_hash_refs:
        - sha256:synthetic-page-004-a
      token_count: 365
      extraction_method: synthetic_clean_text
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      page_label: SYN-Z-005
      chunk_ref_count: 1
      text_hash_refs:
        - sha256:synthetic-page-005-a
      token_count: 190
      extraction_method: synthetic_stale_mixed_source
      claim_ceiling: blocked
      lifecycle_state: stale

traceability_sidecar_inventory:
  sidecar_ref: synthetic://rag_quality/traceability_sidecar/SYN-001
  mapping_count: 5
  page_mappings:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      mapping_state: mapped
      warning_labels: []
    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      mapping_state: mapped_with_picture_warning
      warning_labels:
        - picture_trace_missing
        - figure_caption_trace_missing
    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      mapping_state: mapped_with_table_warning
      warning_labels:
        - table_cell_mapping_uncertain
        - layout_reading_order_uncertain
    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      mapping_state: missing_page_mapping
      warning_labels:
        - page_ref_missing_or_duplicate
    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      mapping_state: mapped_but_scope_mismatch
      warning_labels:
        - mixed_source_or_claim_ceiling_warning
        - stale_index_or_sidecar_ref

answer_run_trace_inventory:
  answer_run_ref: synthetic://rag_quality/answer_run_trace/SYN-001
  run_timestamp_utc: "2026-06-11T00:00:00Z"
  claim_count: 5
  payload_flags:
    raw_question_available: false
    raw_answer_available: false
    notebooklm_payload_available: false
  claims:
    - answer_claim_ref: CLM-SYN-001
      citation_ref: CIT-SYN-001
      retrieval_event_ref: RET-SYN-001
      page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      trace_hash_ref: sha256:synthetic-trace-001
    - answer_claim_ref: CLM-SYN-002
      citation_ref: CIT-SYN-002
      retrieval_event_ref: RET-SYN-002
      page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      trace_hash_ref: sha256:synthetic-trace-002
    - answer_claim_ref: CLM-SYN-003
      citation_ref: CIT-SYN-003
      retrieval_event_ref: RET-SYN-003
      page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      trace_hash_ref: sha256:synthetic-trace-003
    - answer_claim_ref: CLM-SYN-004
      citation_ref: CIT-SYN-004
      retrieval_event_ref: RET-SYN-004
      page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      trace_hash_ref: sha256:synthetic-trace-004
    - answer_claim_ref: CLM-SYN-005
      citation_ref: CIT-SYN-005
      retrieval_event_ref: RET-SYN-005
      page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      trace_hash_ref: sha256:synthetic-trace-005

page_quality_review_packet:
  page_reviews:
    - page_ref: P-SYN-001
      answer_claim_ref: CLM-SYN-001
      source_ref: SRC-SYN-A
      classification: source_supported
      basis:
        approved_source_ref_match: true
        page_index_ref_match: true
        sidecar_mapping_match: true
        claim_ceiling_blocked: false
      warning_categories: []
    - page_ref: P-SYN-002
      answer_claim_ref: CLM-SYN-002
      source_ref: SRC-SYN-A
      classification: manual_review
      basis:
        approved_source_ref_match: true
        page_index_ref_match: true
        sidecar_mapping_match: true
        claim_ceiling_blocked: false
      warning_categories:
        - picture
        - ocr
    - page_ref: P-SYN-003
      answer_claim_ref: CLM-SYN-003
      source_ref: SRC-SYN-B
      classification: manual_review
      basis:
        approved_source_ref_match: true
        page_index_ref_match: true
        sidecar_mapping_match: true
        claim_ceiling_blocked: false
      warning_categories:
        - table
        - ocr
    - page_ref: P-SYN-004
      answer_claim_ref: CLM-SYN-004
      source_ref: SRC-SYN-B
      classification: blocked
      basis:
        approved_source_ref_match: true
        page_index_ref_match: true
        sidecar_mapping_match: false
        claim_ceiling_blocked: false
      warning_categories:
        - page
    - page_ref: P-SYN-005
      answer_claim_ref: CLM-SYN-005
      source_ref: SRC-SYN-Z
      classification: blocked
      basis:
        approved_source_ref_match: false
        page_index_ref_match: true
        sidecar_mapping_match: false
        claim_ceiling_blocked: true
      warning_categories:
        - page

boundary_review_note:
  boundary_status: public_safe_preserved
  note: >
    This packet is limited to synthetic refs, hashes, counts, labels, statuses,
    and warning categories. It reviews support-trace sufficiency only and does
    not establish source truth, answer correctness, owner approval, canon
    readiness, registration, or default-route safety.
  downstream_route_hints:
    - source_supported pages may proceed to bounded downstream review within the same approved scope.
    - manual_review pages require picture/table/OCR-focused human inspection before stronger reuse.
    - blocked pages require scope, page identity, sidecar, or claim-ceiling remediation before reuse.

completion_state:
  status: complete
  packet_type: payload_free_synthetic_workflow_output
  public_safe: true