{
  "quality_review_scope_binding": {
    "scope_id": "SCOPE-SYN-RAG-QA-001",
    "workflow_id": "rag_source_text_quality_review_v0",
    "approved_source_refs": [
      "SRC-SYN-A",
      "SRC-SYN-B"
    ],
    "source_text_index_ref": "synthetic://rag_quality/source_text_index/SYN-001",
    "traceability_sidecar_ref": "synthetic://rag_quality/traceability_sidecar/SYN-001",
    "answer_run_trace_ref": "synthetic://rag_quality/answer_run_trace/SYN-001",
    "review_policy_ref": "synthetic_payload_free_quality_review_policy_001",
    "claim_ceiling": "observed_synthetic_support_trace",
    "binding_status": "bound_with_scope_exception",
    "scope_exception_refs": [
      "P-SYN-005"
    ],
    "public_safe_exclusions": {
      "raw_source_text": "not_included",
      "source_chunks_or_excerpts": "not_included",
      "raw_question": "not_included",
      "raw_answer": "not_included",
      "notebooklm_answer": "not_included",
      "secrets_or_credentials": "not_included",
      "runtime_absolute_paths": "not_included"
    },
    "authority_note": "This binding supports synthetic page-level trace review only; it does not establish source truth, answer correctness, owner approval, canon promotion, or default-route authority."
  },
  "source_text_index_inventory": {
    "index_ref": "synthetic://rag_quality/source_text_index/SYN-001",
    "inventory_status": "indexed_with_one_out_of_scope_blocked_entry",
    "page_count": 5,
    "page_entries": [
      {
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "page_label": "SYN-A-001",
        "chunk_refs": [
          "CHK-SYN-001-A",
          "CHK-SYN-001-B"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-001-a",
          "sha256:synthetic-page-001-b"
        ],
        "token_count": 420,
        "extraction_method": "synthetic_clean_text",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "page_label": "SYN-A-002",
        "chunk_refs": [
          "CHK-SYN-002-A"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-002-a"
        ],
        "token_count": 280,
        "extraction_method": "synthetic_picture_caption_ocr",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "page_label": "SYN-B-003",
        "chunk_refs": [
          "CHK-SYN-003-A",
          "CHK-SYN-003-B"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-003-a",
          "sha256:synthetic-page-003-b"
        ],
        "token_count": 515,
        "extraction_method": "synthetic_table_ocr",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "page_label": "SYN-B-004",
        "chunk_refs": [
          "CHK-SYN-004-A"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-004-a"
        ],
        "token_count": 365,
        "extraction_method": "synthetic_clean_text",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "page_label": "SYN-Z-005",
        "chunk_refs": [
          "CHK-SYN-005-A"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-005-a"
        ],
        "token_count": 190,
        "extraction_method": "synthetic_stale_mixed_source",
        "claim_ceiling": "blocked",
        "lifecycle_state": "stale",
        "warning_labels": [
          "mixed_source_or_claim_ceiling_warning",
          "stale_index_or_sidecar_ref"
        ]
      }
    ],
    "payload_persistence": "none"
  },
  "traceability_sidecar_inventory": {
    "sidecar_ref": "synthetic://rag_quality/traceability_sidecar/SYN-001",
    "inventory_status": "inventory_complete_with_review_and_blocker_signals",
    "page_mapping_count": 5,
    "mapping_entries": [
      {
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "chunk_refs": [
          "CHK-SYN-001-A",
          "CHK-SYN-001-B"
        ],
        "trace_event_refs": [
          "TR-SYN-001"
        ],
        "mapping_state": "mapped",
        "warning_labels": []
      },
      {
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "chunk_refs": [
          "CHK-SYN-002-A"
        ],
        "picture_refs": [
          "PIC-SYN-002-A"
        ],
        "trace_event_refs": [
          "TR-SYN-002"
        ],
        "mapping_state": "mapped_with_picture_warning",
        "warning_labels": [
          "picture_trace_missing",
          "figure_caption_trace_missing"
        ]
      },
      {
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "chunk_refs": [
          "CHK-SYN-003-A",
          "CHK-SYN-003-B"
        ],
        "table_refs": [
          "TBL-SYN-003-A"
        ],
        "ocr_event_refs": [
          "OCR-SYN-003-A"
        ],
        "trace_event_refs": [
          "TR-SYN-003"
        ],
        "mapping_state": "mapped_with_table_warning",
        "warning_labels": [
          "table_cell_mapping_uncertain",
          "layout_reading_order_uncertain"
        ]
      },
      {
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "chunk_refs": [
          "CHK-SYN-004-A"
        ],
        "mapping_state": "missing_page_mapping",
        "warning_labels": [
          "page_ref_missing_or_duplicate"
        ],
        "blocking_reason": "Required traceability page mapping is absent."
      },
      {
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "chunk_refs": [
          "CHK-SYN-005-A"
        ],
        "trace_event_refs": [
          "TR-SYN-005"
        ],
        "mapping_state": "mapped_but_scope_mismatch",
        "warning_labels": [
          "mixed_source_or_claim_ceiling_warning",
          "stale_index_or_sidecar_ref"
        ],
        "blocking_reason": "Source ref is outside the bound approved-source scope and the index claim ceiling is blocked."
      }
    ],
    "payload_persistence": "none"
  },
  "answer_run_trace_inventory": {
    "answer_run_ref": "synthetic://rag_quality/answer_run_trace/SYN-001",
    "run_timestamp_utc": "2026-06-11T00:00:00Z",
    "inventory_status": "metadata_only_inventory_complete",
    "raw_payload_availability": {
      "raw_question_available": false,
      "raw_answer_available": false,
      "notebooklm_payload_available": false
    },
    "claim_count": 5,
    "claim_entries": [
      {
        "answer_claim_ref": "CLM-SYN-001",
        "citation_ref": "CIT-SYN-001",
        "retrieval_event_ref": "RET-SYN-001",
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "trace_hash_ref": "sha256:synthetic-trace-001"
      },
      {
        "answer_claim_ref": "CLM-SYN-002",
        "citation_ref": "CIT-SYN-002",
        "retrieval_event_ref": "RET-SYN-002",
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "trace_hash_ref": "sha256:synthetic-trace-002"
      },
      {
        "answer_claim_ref": "CLM-SYN-003",
        "citation_ref": "CIT-SYN-003",
        "retrieval_event_ref": "RET-SYN-003",
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "trace_hash_ref": "sha256:synthetic-trace-003"
      },
      {
        "answer_claim_ref": "CLM-SYN-004",
        "citation_ref": "CIT-SYN-004",
        "retrieval_event_ref": "RET-SYN-004",
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "trace_hash_ref": "sha256:synthetic-trace-004"
      },
      {
        "answer_claim_ref": "CLM-SYN-005",
        "citation_ref": "CIT-SYN-005",
        "retrieval_event_ref": "RET-SYN-005",
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "trace_hash_ref": "sha256:synthetic-trace-005"
      }
    ],
    "payload_persistence": "none"
  },
  "page_quality_review_packet": {
    "review_packet_id": "SYN-RAG-QA-REVIEW-001",
    "scope_id": "SCOPE-SYN-RAG-QA-001",
    "review_status": "completed_with_manual_review_and_blocked_pages",
    "claim_ceiling": "observed_synthetic_support_trace",
    "page_reviews": [
      {
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "answer_claim_refs": [
          "CLM-SYN-001"
        ],
        "citation_refs": [
          "CIT-SYN-001"
        ],
        "status": "source_supported",
        "support_basis": [
          "approved_source_ref",
          "matching_index_page_ref",
          "matching_sidecar_page_and_chunk_refs",
          "matching_answer_trace_page_ref",
          "claim_ceiling_not_blocked"
        ],
        "warning_labels": []
      },
      {
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "answer_claim_refs": [
          "CLM-SYN-002"
        ],
        "citation_refs": [
          "CIT-SYN-002"
        ],
        "status": "manual_review",
        "support_basis": [
          "approved_source_ref",
          "matching_index_page_ref",
          "matching_sidecar_page_and_chunk_refs",
          "matching_answer_trace_page_ref",
          "claim_ceiling_not_blocked"
        ],
        "warning_labels": [
          "picture_trace_missing",
          "figure_caption_trace_missing"
        ],
        "manual_review_reason": "Picture trace and figure-caption trace remain unresolved."
      },
      {
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "answer_claim_refs": [
          "CLM-SYN-003"
        ],
        "citation_refs": [
          "CIT-SYN-003"
        ],
        "status": "manual_review",
        "support_basis": [
          "approved_source_ref",
          "matching_index_page_ref",
          "matching_sidecar_page_and_chunk_refs",
          "matching_answer_trace_page_ref",
          "claim_ceiling_not_blocked"
        ],
        "warning_labels": [
          "table_cell_mapping_uncertain",
          "layout_reading_order_uncertain"
        ],
        "manual_review_reason": "Table-cell mapping and OCR reading order remain uncertain."
      },
      {
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "answer_claim_refs": [
          "CLM-SYN-004"
        ],
        "citation_refs": [
          "CIT-SYN-004"
        ],
        "status": "blocked",
        "warning_labels": [
          "page_ref_missing_or_duplicate"
        ],
        "blocking_reason": "Required traceability page mapping is missing."
      },
      {
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "answer_claim_refs": [
          "CLM-SYN-005"
        ],
        "citation_refs": [
          "CIT-SYN-005"
        ],
        "status": "blocked",
        "warning_labels": [
          "mixed_source_or_claim_ceiling_warning",
          "stale_index_or_sidecar_ref"
        ],
        "blocking_reason": "The source is not approved in the bound scope and the claim ceiling is blocked."
      }
    ],
    "count_summary": {
      "reviewed_page_count": 5,
      "source_supported_page_count": 1,
      "manual_review_page_count": 2,
      "blocked_page_count": 2,
      "citation_review_count": 5
    },
    "stop_conditions_triggered": [
      {
        "page_ref": "P-SYN-004",
        "condition": "required_page_identity_missing"
      },
      {
        "page_ref": "P-SYN-005",
        "condition": "source_text_index_ref_missing_or_unapproved"
      },
      {
        "page_ref": "P-SYN-005",
        "condition": "claim_ceiling_blocks_support_review"
      }
    ],
    "non_claim": "Source-supported is limited to matching approved synthetic index, sidecar, and answer-trace refs within this review scope. It is not a source-truth, answer-correctness, or owner-approval determination."
  },
  "boundary_review_note": {
    "boundary_review_status": "public_safe_boundary_preserved",
    "boundary_checks": {
      "raw_source_text_persisted": false,
      "source_chunks_or_excerpts_persisted": false,
      "raw_question_persisted": false,
      "raw_answer_or_notebooklm_answer_persisted": false,
      "secrets_or_credentials_persisted": false,
      "runtime_absolute_paths_persisted": false,
      "owner_approval_inferred": false,
      "public_canon_promotion_claimed": false,
      "default_route_switch_claimed": false
    },
    "downstream_route_hints": [
      {
        "workflow_id": "rag_work_card_router_v0",
        "condition": "optional for reviewed page-quality outcomes"
      },
      {
        "workflow_id": "rag_metadata_refresh_v0",
        "condition": "optional for stale-index signal on P-SYN-005"
      },
      {
        "workflow_id": "sourcebound_knowledge_packet_operating_loop_v0",
        "condition": "optional for source-scope or traceability gap on P-SYN-005"
      },
      {
        "workflow_id": "owner_decision_packet_v0",
        "condition": "optional if a policy exception or disposition is needed for manual-review pages P-SYN-002 or P-SYN-003"
      },
      {
        "workflow_id": "post_development_review_gate_v0",
        "condition": "required before any public or canon promotion request"
      }
    ],
    "authority_boundary_note": "No owner approval, source truth, answer correctness, canon promotion, or default-route switching is granted or implied by this packet."
  }
}
