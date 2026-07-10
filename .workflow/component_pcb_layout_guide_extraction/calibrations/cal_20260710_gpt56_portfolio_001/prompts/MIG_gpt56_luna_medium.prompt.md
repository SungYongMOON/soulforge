You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=elf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: component_pcb_layout_guide_extraction
kind: workflow
status: active
title: Component PCB Layout Guide Extraction
summary: Read per-component DATA Sheet and EVAL materials produced by component material collection, extract PCB-layout guidance into per-component Layout Guide folders, and cache PDF indexing so later AI use reads layout-focused Markdown instead of whole PDFs.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - parts_root_binding
  - extraction_policy
  - approved_download_policy
outputs:
  - layout_guide_markdown
  - source_map
  - extraction_manifest
  - pdf_text_index_cache
  - layout_candidate_spans
  - layout_guide_citation_map
  - supplemental_source_docs
  - cited_full_page_renders
  - context_page_fallbacks
  - strict_quality_tables
  - raw_table_candidates
  - cited_page_figures
  - layout_only_tables
  - rejected_visual_table_candidates
validation_level: owner_accepted_usable
upstream_workflow:
  workflow_id: exp_xml_component_materials
  expected_output: parts_materials_tree
notes:
  - The workflow reads each component folder's DATA Sheet and EVAL folders and writes a sibling Layout Guide folder.
  - Reusable workflow canon must use portable project binding paths only; runtime absolute paths and concrete run ids belong only in run evidence or project-local outputs.
  - PDF text extraction is cache-first: compute file SHA256, build page-level indexes once, and reuse caches when the source checksum is unchanged.
  - AI-facing synthesis receives only layout-relevant candidate spans, not whole PDFs.
  - Search terms include PCB layout, layout guidelines, grounding, decoupling, bypass capacitor placement, routing, thermal, exposed pad, planes, vias, evaluation board layout, and reference layout.
  - If local DATA Sheet and EVAL coverage is insufficient, source-bootstrap may download official supplemental layout guides, application notes, user guides, or reference design archives into Layout Guide/source_docs.
  - "If official layout guidance still cannot be acquired, the workflow must write a bounded source-gap packet rather than stalling: `layout_guide.md`, `source_map.json`, and `extraction_manifest.json` must record attempted sources, blocking reasons, unresolved gaps, and owner follow-up needs without inventing layout claims."
  - Public workflow files must not contain copied vendor document text, downloaded binaries, or local project file paths.
  - Project-local Layout Guide outputs should preserve source maps, bounded excerpts, summaries, figures/tables when extractable, and enough provenance for source-bound later review.
  - Figure PNG outputs should render the full PDF page referenced by layout_guide.md directly under Layout Guide/figures, deduplicated by source file checksum and page number.
  - Current registration is owner-accepted usable after a pilot with cited full-page direct figure outputs; it is not a claim that vendor document content or runtime PNG outputs belong in public canon.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: component_pcb_layout_guide_extraction
kind: step_graph
status: active
steps:
  - step_id: prepare_parts_binding
    title: Prepare Parts Binding
    actor_slot: workflow_runner
    action:
      kind: local_workspace_setup
      requires:
        - parts_root_binding
        - extraction_policy
        - approved_download_policy
      validates:
        - parts_root_exists
        - parts_root_is_project_local
        - component_folders_have_expected_material_subfolders
      creates:
        - run_log_root
        - per_component_layout_guide_folders
    summary: Resolve the project binding for the component parts root, confirm the output location is project-local, and create Layout Guide folders without writing runtime paths into workflow canon.
    next:
      on_success: discover_component_source_docs
      on_fail: stop
  - step_id: discover_component_source_docs
    title: Discover Component Source Documents
    actor_slot: source_inventory_builder
    action:
      kind: local_source_inventory
      artifact_in: parts_root_binding
      artifact_out: component_source_doc_inventory
      source_folders:
        - DATA Sheet
        - EVAL
        - Layout Guide/source_docs
      archive_handling:
        inspect_zip_archives: true
        extract_candidate_docs_to_cache: true
        candidate_extensions:
          - .pdf
          - .txt
          - .md
          - .csv
          - .xlsx
      records:
        - component_key
        - source_folder
        - source_file_name
        - source_file_sha256
        - source_file_type
        - extraction_status
    summary: Build a per-component inventory of datasheets, EVAL PDFs, and layout-related documents inside ZIP archives, recording checksums before extraction.
    next:
      on_success: build_pdf_text_index_cache
      on_fail: stop
  - step_id: build_pdf_text_index_cache
    title: Build PDF Text Index Cache
    actor_slot: pdf_indexer
    action:
      kind: cached_pdf_text_extraction
      artifact_in: component_source_doc_inventory
      artifact_out: pdf_text_index_cache
      cache_folder: Layout Guide/cache
      cache_key:
        - source_file_sha256
        - source_file_name
      page_index_fields:
        - page_number
        - text_sha256
        - text_length
        - layout_keyword_hits
        - extraction_method
      reuse_when_checksum_matches: true
      full_pdf_to_ai_context: false
    summary: Extract or reuse page-level PDF text metadata and layout keyword hits so full PDFs are not repeatedly loaded into AI context.
    next:
      on_success: select_layout_candidate_spans
      on_fail: stop
  - step_id: select_layout_candidate_spans
    title: Select Layout Candidate Spans
    actor_slot: layout_span_selector
    action:
      kind: keyword_and_section_span_selection
      artifact_in: pdf_text_index_cache
      artifact_out: layout_candidate_spans
      cache_folder: Layout Guide/cache
      keywords:
        - pcb layout
        - layout guidelines
        - board layout
        - grounding
        - ground plane
        - decoupling
        - bypass capacitor
        - capacitor placement
        - routing
        - thermal
        - exposed pad
        - vias
        - analog ground
        - digital ground
        - evaluation board layout
        - reference layout
      span_policy:
        include_neighbor_context: true
        keep_source_page: true
        keep_section_heading_when_available: true
        ai_context_uses_candidate_spans_only: true
    summary: Reduce extracted PDF text into layout-focused candidate spans with page and section provenance.
    next:
      on_success: assess_layout_coverage
      on_fail: stop
  - step_id: assess_layout_coverage
    title: Assess Layout Coverage
    actor_slot: coverage_reviewer
    action:
      kind: source_coverage_review
      artifacts_in:
        - component_source_doc_inventory
        - layout_candidate_spans
      artifact_out: layout_coverage_report
      pass_conditions:
        - at_least_one_layout_relevant_span_or_not_applicable_reason
        - source_map_can_be_built
      insufficient_coverage_action: source_bootstrap_supplemental_layout_docs
    summary: Decide whether existing DATA Sheet and EVAL materials provide enough PCB layout guidance, or whether official supplemental layout documents should be searched and downloaded. If not enough guidance exists even after source bootstrap, the workflow must still continue into a bounded source-gap packet rather than stopping.
    next:
      on_success: synthesize_layout_guide
      on_insufficient_coverage: source_bootstrap_supplemental_layout_docs
      on_fail: stop
  - step_id: source_bootstrap_supplemental_layout_docs
    title: Source Bootstrap Supplemental Layout Docs
    actor_slot: source_researcher
    action:
      kind: official_source_bootstrap
      artifact_in: layout_coverage_report
      artifact_out: supplemental_source_discovery_packet
      source_policy:
        official_sources_first: true
        random_mirrors_forbidden: true
        owner_approved_local_sources_allowed: true
      target_material_types:
        - layout_guideline
        - application_note
        - evaluation_board_user_guide
        - reference_design_pdf
        - reference_design_archive
    summary: When local source coverage is weak, find official supplemental layout material from manufacturer or owner-approved sources. If official material is still unavailable, preserve attempted-source evidence so a later source-gap packet can explain what is missing.
    next:
      on_success: download_supplemental_layout_docs
      on_fail: synthesize_layout_guide
  - step_id: download_supplemental_layout_docs
    title: Download Supplemental Layout Docs
    actor_slot: download_operator
    action:
      kind: approved_download
      artifact_in: supplemental_source_discovery_packet
      artifact_out: supplemental_source_docs
      output_folder_name: Layout Guide/source_docs
      completion_requires:
        - saved_binary_file
        - source_url
        - byte_size
        - content_type_or_file_magic
        - sha256
      accepted_file_magic:
        pdf: "%PDF-"
        zip: PK
      url_shortcut_is_completion: false
    summary: Download official supplemental layout PDFs or archives into component-local Layout Guide/source_docs and record checksums. If downloads fail or remain blocked, continue into synthesis with source-gap mode rather than stalling the run.
    next:
      on_success: build_pdf_text_index_cache
      on_fail: synthesize_layout_guide
  - step_id: synthesize_layout_guide
    title: Synthesize Layout Guide
    actor_slot: layout_guide_writer
    action:
      kind: source_bound_markdown_synthesis
      artifacts_in:
        - component_source_doc_inventory
        - layout_candidate_spans
        - layout_coverage_report
      artifacts_out:
        - layout_guide_markdown
        - source_map
      output_folder_name: Layout Guide
      markdown_file_name: layout_guide.md
      source_map_file_name: source_map.json
      required_sections:
        - Source Coverage
        - Layout-Relevant Original Excerpts
        - Layout-Relevant Findings
        - Decoupling And Power Placement
        - Grounding
        - Routing
        - Thermal / Exposed Pad
        - Evaluation Board Layout References
        - Figures And Tables
        - Open Questions / Missing Official Guidance
        - Source Map Summary
      public_commit_policy:
        commit_source_text: false
        commit_downloaded_vendor_docs: false
      ai_context_policy:
        summarize_from_candidate_spans_only: true
        cite_source_page_for_each_claim: true
      degraded_gap_policy:
        when_official_guidance_missing: write_source_gap_packet
        source_gap_requirements:
          - attempted_official_sources_or_local_sources_named
          - blocker_reason_or_missing_guidance_reason_named
          - no_unsupported_layout_claims_added
          - explicit_owner_followup_needed
    summary: Write a per-component Markdown layout guide with source-bound summaries, bounded excerpts, open questions, and a source map that points back to files, pages, and checksums. If guidance is missing, write a bounded source-gap packet instead of fabricating layout claims.
    next:
      on_success: map_layout_guide_citations_to_pdf_pages
      on_fail: stop
  - step_id: map_layout_guide_citations_to_pdf_pages
    title: Map Layout Guide Citations To PDF Pages
    actor_slot: citation_mapper
    action:
      kind: markdown_citation_to_source_page_mapping
      artifacts_in:
        - layout_guide_markdown
        - source_map
        - layout_candidate_spans
        - pdf_text_index_cache
      artifact_out: layout_guide_citation_map
      cache_file_name: Layout Guide/cache/layout_guide_citation_map.json
      mapping_policy:
        parse_markdown_sections:
          - Layout-Relevant Original Excerpts
          - Layout-Relevant Findings
          - Decoupling And Power Placement
          - Grounding
          - Routing
          - Thermal / Exposed Pad
          - Evaluation Board Layout References
        match_fields:
          - source_file
          - page_number
          - bounded_excerpt_hash_or_anchor
          - source_map_entry_id_when_available
        deduplicate_pages_by:
          - source_file_sha256
          - source_file
          - page_number
        exclude_sections:
          - Figures And Tables
          - Open Questions / Missing Official Guidance
          - Source Map Summary
      summary: Build a map from the final Markdown guide's actual cited evidence lines back to source files, pages, text anchors, and a unique cited-page set before any image capture is attempted.
    next:
      on_success: extract_figures_and_tables
      on_fail: extract_figures_and_tables
  - step_id: extract_figures_and_tables
    title: Extract Figures And Tables
    actor_slot: figure_table_extractor
    action:
      kind: best_effort_pdf_visual_table_extraction
      artifacts_in:
        - component_source_doc_inventory
        - layout_guide_markdown
        - layout_guide_citation_map
        - layout_candidate_spans
      artifacts_out:
        - cited_full_page_renders
        - context_page_fallbacks
        - extracted_tables
      output_folders:
        figures: Layout Guide/figures
        cited_full_page_renders: Layout Guide/figures
        context_page_fallbacks: Layout Guide/figures/context_pages
        legacy_cited_crops: Layout Guide/figures/context_pages/legacy_cited_evidence_crops
        tables: Layout Guide/tables
        strict_quality_tables: Layout Guide/tables/camelot_quality
        raw_table_candidates: Layout Guide/tables/raw_candidates
      preferred_tool_policy:
        figure_cited_evidence:
          primary_tool: pymupdf
          method: render_unique_layout_guide_cited_pages_to_png
          notes:
            - Use layout_guide.md evidence lines and source_map/page anchors as the figure capture source of truth.
            - Render the full source PDF page for each unique source-file/page pair referenced by layout_guide.md.
            - Deduplicate repeated citations to the same source file checksum and page number before writing PNG outputs.
            - Write current figure PNGs directly under Layout Guide/figures, not under a layout_only subfolder.
            - Do not crop cited regions; the figure output is the complete referenced page so surrounding layout diagrams, captions, and tables remain visible.
            - Move older cited crop outputs to context_pages/legacy_cited_evidence_crops when present instead of treating them as current figure outputs.
            - Store rendered pages as runtime evidence, not public canon.
        table_extraction:
          primary_tool: camelot
          method: strict_quality_filtered_markdown
          quality_filters:
            - accuracy_and_whitespace_metrics_required
            - reject_two_column_prose_when_not_explicit_table
            - require_layout_or_board_context_keyword
          fallback_tool: pdfplumber
          fallback_method: raw_table_candidate_markdown_with_quality_flag
      source_map_fields:
        - source_file
        - source_file_sha256
        - page_number
        - layout_guide_section
        - markdown_evidence_anchor
        - markdown_evidence_anchor_hashes
        - dedupe_key
        - rendered_page_rect
        - citation_count
        - layout_guide_sections
        - extraction_method
        - output_file
        - output_sha256
        - quality_filter_or_confidence
        - warnings
      source_map_update_required: true
      missing_tool_action: record_not_extracted_reason
    summary: Render one full-page PNG directly under Layout Guide/figures for each unique PDF page actually cited in layout_guide.md and extract quality-filtered tables; keep non-cited context renders and raw candidates separate from current figure outputs.
    next:
      on_success: promote_cited_figures_and_layout_tables
      on_fail: promote_cited_figures_and_layout_tables
  - step_id: promote_cited_figures_and_layout_tables
    title: Promote Cited Figures And Layout Tables
    actor_slot: cited_figure_table_promoter
    action:
      kind: source_bound_cited_figure_and_layout_table_promotion
      artifacts_in:
        - cited_full_page_renders
        - context_page_fallbacks
        - extracted_tables
        - layout_guide_citation_map
        - layout_candidate_spans
        - source_map
      artifacts_out:
        - cited_page_figures
        - layout_only_tables
        - rejected_visual_table_candidates
      output_folders:
        cited_page_figures: Layout Guide/figures
        layout_only_tables: Layout Guide/tables/layout_only
      promotion_policy:
        promote_when_any:
          - cited_full_page_is_bound_to_layout_guide_citation
          - explicit_pcb_layout_or_board_layout_caption
          - table_has_board_setup_link_connector_power_ground_or_routing_context
        reject_when_any:
          - whole_page_render_without_layout_guide_citation
          - duplicate_cited_page_render
          - software_installation_only
          - pc_connection_or_driver_setup_only
          - marketing_or_ordering_info_only
          - two_column_prose_detected_as_table
        keep_rejected_candidates: true
        rejected_candidate_record: Layout Guide/cache/layout_only_rejection_summary.json
      source_map_fields:
        - source_file
        - source_file_sha256
        - page_number
        - layout_guide_section
        - markdown_evidence_anchor
        - source_output_file
        - promoted_output_file
        - promoted_output_sha256
        - dedupe_key
        - citation_count
        - layout_guide_sections
        - promotion_reason
        - rejection_reason
        - promotion_method
      source_map_update_required: true
    summary: Promote only layout_guide.md-cited unique full-page renders directly under Layout Guide/figures and quality-filtered layout tables into tables/layout_only, while keeping non-cited context renders and rejection reasons as traceable evidence.
    next:
      on_success: write_extraction_manifest
      on_fail: write_extraction_manifest
  - step_id: write_extraction_manifest
    title: Write Extraction Manifest
    actor_slot: manifest_writer
    action:
      kind: manifest_write
      artifacts_in:
        - component_source_doc_inventory
        - pdf_text_index_cache
        - layout_candidate_spans
        - layout_coverage_report
        - supplemental_source_docs
        - layout_guide_markdown
        - layout_guide_citation_map
        - source_map
        - cited_full_page_renders
        - context_page_fallbacks
        - extracted_tables
        - cited_page_figures
        - layout_only_tables
        - rejected_visual_table_candidates
      artifact_out: extraction_manifest
      output_file_name: Layout Guide/extraction_manifest.json
      records:
        - component_key
        - processed_source_files
        - attempted_supplemental_sources
        - source_gap_state
        - owner_followup_needed
        - cache_hits
        - cache_misses
        - candidate_span_count
        - supplemental_downloads
        - figure_table_extraction_status
        - figure_count
        - raw_table_candidate_count
        - strict_quality_table_count
        - cited_page_figure_count
        - layout_only_table_count
        - rejected_visual_table_candidate_count
        - tool_versions
        - extraction_errors
        - extraction_warnings
        - open_questions
    summary: Record processed docs, cache behavior, attempted and completed supplemental sourcing, source maps, unresolved coverage issues, and any source-gap state that should be batched for later owner follow-up.
    next:
      on_success: boundary_and_readiness_review
      on_fail: stop
  - step_id: boundary_and_readiness_review
    title: Boundary And Readiness Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_and_readiness_review
      artifacts_in:
        - layout_guide_markdown
        - source_map
        - extraction_manifest
      artifact_out: readiness_note
      checks:
        - no_runtime_absolute_paths_in_public_canon
        - no_vendor_docs_or_excerpts_staged_for_public_commit
        - local_outputs_have_source_maps
        - cache_reuse_policy_recorded
        - source_gap_or_block_reason_recorded_when_not_layout_ready
    summary: Confirm public/private boundaries, source traceability, and whether each component layout guide is ready for AI-assisted design review or is correctly downgraded into a source-gap packet.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "component_pcb_layout_guide_extraction",
  "fixture_id": "public_synthetic_two_component_layout_extraction",
  "public_safe": true,
  "request": "Produce a dry-run extraction packet for two synthetic components. Describe the resulting guide/source-map/manifest records and figure-table handling; do not download or render files.",
  "inputs": {
    "parts_root_binding": "fixture://parts/demo_board",
    "extraction_policy": {
      "cache_first": true,
      "candidate_spans_only_to_ai": true,
      "full_page_render_for_cited_pdf_pages": true,
      "strict_table_quality_filter": true
    },
    "approved_download_policy": {
      "official_sources_only": true,
      "network_execution_allowed": false,
      "record_blocked_attempts": true
    }
  },
  "synthetic_component_inventory": [
    {
      "component_key": "U_DEMO_1",
      "docs": [
        {
          "source_file_name": "demo_converter_datasheet.pdf",
          "sha256": "sha256:fixture-converter-v1",
          "pages": 12,
          "cached_index_checksum_matches": true
        },
        {
          "source_file_name": "demo_eval_guide.pdf",
          "sha256": "sha256:fixture-eval-v1",
          "pages": 8,
          "cached_index_checksum_matches": false
        }
      ],
      "candidate_spans": [
        {
          "source_file": "demo_converter_datasheet.pdf",
          "page_number": 7,
          "section": "Layout Guidance",
          "topic": "decoupling and exposed-pad vias"
        },
        {
          "source_file": "demo_eval_guide.pdf",
          "page_number": 5,
          "section": "Board Layout",
          "topic": "ground return routing"
        }
      ],
      "final_guide_citations": [
        {
          "source_file": "demo_converter_datasheet.pdf",
          "page_number": 7,
          "guide_section": "Decoupling And Power Placement"
        },
        {
          "source_file": "demo_converter_datasheet.pdf",
          "page_number": 7,
          "guide_section": "Thermal / Exposed Pad"
        },
        {
          "source_file": "demo_eval_guide.pdf",
          "page_number": 5,
          "guide_section": "Grounding"
        }
      ],
      "table_candidates": [
        {
          "candidate_id": "T1",
          "page_number": 5,
          "context": "board connector and power setup",
          "metrics_present": true
        },
        {
          "candidate_id": "T2",
          "page_number": 2,
          "context": "two-column marketing prose",
          "metrics_present": true
        }
      ]
    },
    {
      "component_key": "U_DEMO_2",
      "docs": [
        {
          "source_file_name": "demo_sensor_brief.pdf",
          "sha256": "sha256:fixture-sensor-v1",
          "pages": 2,
          "cached_index_checksum_matches": false
        }
      ],
      "candidate_spans": [],
      "supplemental_official_source_attempts": [
        {
          "source_kind": "datasheet",
          "result": "missing"
        },
        {
          "source_kind": "evaluation_board_user_guide",
          "result": "blocked_by_network_disabled_fixture"
        }
      ]
    }
  ],
  "requested_deliverable": [
    "per-component cache hit/miss and candidate-span selection record",
    "layout_guide.md section plan and source_map entries",
    "deduplicated cited full-page render plan and table promotion/rejection records",
    "source-gap packet for the component without official guidance",
    "extraction manifest and boundary/readiness result"
  ],
  "prohibitions": [
    "no unsupported PCB-layout claim",
    "no whole-PDF AI context, actual download, actual render, or vendor payload",
    "no runtime absolute path or public-commit recommendation for vendor text/binaries/runtime figures"
  ],
  "boundary_attestation": "Documents, checksums, components, and excerpts are synthetic metadata."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
