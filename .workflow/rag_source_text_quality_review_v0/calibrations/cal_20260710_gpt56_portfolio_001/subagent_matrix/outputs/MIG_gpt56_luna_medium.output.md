{
  "workflow_id": "rag_source_text_quality_review_v0",
  "calibration_id": "cal_20260611_rag_source_text_quality_review_quality_equiv_001",
  "public_safe": true,
  "quality_review_scope_binding": {
    "scope_id": "SCOPE-SYN-RAG-QA-001",
    "approved_source_refs": [
      "SRC-SYN-A",
      "SRC-SYN-B"
    ],
    "source_text_index_ref": "synthetic://rag_quality/source_text_index/SYN-001",
    "traceability_sidecar_ref": "synthetic://rag_quality/traceability_sidecar/SYN-001",
    "answer_run_trace_ref": "synthetic://rag_quality/answer_run_trace/SYN-001",
    "metadata_index_refs": [
      "synthetic://rag_quality/metadata_index/SYN-001"
    ],
    "sourcebound_packet_refs": [
      "synthetic://sourcebound/packet/SYN-001"
    ],
    "owner_decision_refs": [],
    "raw_payload_access": "forbidden",
    "claim_ceiling": "observed_synthetic_support_trace",
    "binding_status": "bound"
  },
  "source_text_index_inventory": {
    "index_ref": "synthetic://rag_quality/source_text_index/SYN-001",
    "page_count": 5,
    "pages": [
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
        "lifecycle_state": "stale"
      }
    ]
  },
  "traceability_sidecar_inventory": {
    "sidecar_ref": "synthetic://rag_quality/traceability_sidecar/SYN-001",
    "page_mapping_count": 5,
    "page_mappings": [
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
        "trace_event_refs": [],
        "mapping_state": "missing_page_mapping",
        "warning_labels": [
          "page_ref_missing_or_duplicate"
        ]
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
        ]
      }
    ]
  },
  "answer_run_trace_inventory": {
    "answer_run_ref": "synthetic://rag_quality/answer_run_trace/SYN-001",
    "run_timestamp_utc": "2026-06-11T00:00:00Z",
    "raw_question_available": false,
    "raw_answer_available": false,
    "notebooklm_payload_available": false,
    "claim_count": 5,
    "claims": [
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
    ]
  },
  "page_quality_review_packet": {
    "review_policy_id": "synthetic_payload_free_quality_review_policy_001",
    "claim_ceiling": "observed_synthetic_support_trace",
    "page_reviews": [
      {
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "answer_claim_ref": "CLM-SYN-001",
        "citation_ref": "CIT-SYN-001",
        "quality_status": "source_supported",
        "warning_labels": [],
        "support_basis": "matching current page index and sidecar refs; claim ceiling permits support review"
      },
      {
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "answer_claim_ref": "CLM-SYN-002",
        "citation_ref": "CIT-SYN-002",
        "quality_status": "manual_review",
        "warning_labels": [
          "picture_trace_missing",
          "figure_caption_trace_missing"
        ],
        "support_basis": "matching refs exist, but picture trace and figure-caption support remain unresolved"
      },
      {
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "answer_claim_ref": "CLM-SYN-003",
        "citation_ref": "CIT-SYN-003",
        "quality_status": "manual_review",
        "warning_labels": [
          "table_cell_mapping_uncertain",
          "layout_reading_order_uncertain"
        ],
        "support_basis": "matching refs exist, but table mapping and OCR/layout uncertainty require review"
      },
      {
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "answer_claim_ref": "CLM-SYN-004",
        "citation_ref": "CIT-SYN-004",
        "quality_status": "blocked",
        "warning_labels": [
          "page_ref_missing_or_duplicate"
        ],
        "support_basis": "required page mapping and trace event are missing"
      },
      {
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "answer_claim_ref": "CLM-SYN-005",
        "citation_ref": "CIT-SYN-005",
        "quality_status": "blocked",
        "warning_labels": [
          "mixed_source_or_claim_ceiling_warning",
          "stale_index_or_sidecar_ref"
        ],
        "support_basis": "source is outside approved scope, index is stale, and claim ceiling is blocked"
      }
    ],
    "count_summary": {
      "reviewed_page_count": 5,
      "citation_review_count": 5,
      "source_supported_page_count": 1,
      "manual_review_page_count": 2,
      "blocked_page_count": 2
    }
  },
  "boundary_review_note": {
    "package_public_safe": true,
    "raw_source_text_persisted": false,
    "source_chunks_or_excerpts_persisted": false,
    "raw_question_persisted": false,
    "raw_answer_or_notebooklm_answer_persisted": false,
    "answer_payload_persisted": false,
    "secrets_or_credentials_persisted": false,
    "runtime_absolute_paths_persisted": false,
    "owner_approval_claimed": false,
    "source_truth_claimed": false,
    "answer_correctness_claimed": false,
    "public_canon_promotion_allowed": false,
    "default_route_switch_allowed": false,
    "review_interpretation": "support trace only; not source truth, answer correctness authority, owner approval, canon promotion, or default-route authorization",
    "downstream_route_hints": [
      {
        "route": "owner_decision_packet_v0",
        "reason": "manual-review pages may require an owner decision before stronger use"
      },
      {
        "route": "rag_metadata_refresh_v0",
        "reason": "blocked or stale page trace requires metadata follow-up"
      },
      {
        "route": "sourcebound_knowledge_packet_operating_loop_v0",
        "reason": "scope mismatch or claim-ceiling gap may require sourcebound follow-up"
      },
      {
        "route": "post_development_review_gate_v0",
        "reason": "required before any public or canon promotion"
      }
    ],
    "stop_conditions_triggered": []
  }
}
