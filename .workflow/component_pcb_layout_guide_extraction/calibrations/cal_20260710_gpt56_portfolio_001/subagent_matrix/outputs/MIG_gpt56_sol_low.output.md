# Dry-Run Extraction Packet

```yaml
schema_version: component_pcb_layout_guide_extraction_dry_run_v1
workflow_id: component_pcb_layout_guide_extraction
fixture_id: public_synthetic_two_component_layout_extraction
execution_state: planned_from_synthetic_metadata_only
boundary_attestation: Documents, checksums, components, and excerpts are synthetic metadata.
global_non_claims:
  - No source document content was inspected.
  - No whole PDF was supplied as AI context.
  - No supplemental source was downloaded.
  - No PDF page or figure was rendered.
  - No table was extracted.
  - No vendor payload or bounded verbatim excerpt is included.
  - No runtime path, tool version, output checksum, or filesystem state is asserted.
  - Topics supplied by the fixture are evidence-selection metadata, not verified PCB-layout instructions.
```

## U_DEMO_1

### Cache and candidate-span record

| Source | Synthetic checksum | Cache disposition | Candidate pages |
|---|---|---:|---:|
| `demo_converter_datasheet.pdf` | `sha256:fixture-converter-v1` | Hit: reusable index indicated by fixture | 7 |
| `demo_eval_guide.pdf` | `sha256:fixture-eval-v1` | Miss: index rebuild required in an executable run | 5 |

```yaml
component_key: U_DEMO_1
cache_hits: 1
cache_misses: 1
candidate_span_count: 2
candidate_spans:
  - source_file: demo_converter_datasheet.pdf
    source_file_sha256: sha256:fixture-converter-v1
    page_number: 7
    section: Layout Guidance
    topic: decoupling and exposed-pad vias
    status: selected_from_fixture_metadata
  - source_file: demo_eval_guide.pdf
    source_file_sha256: sha256:fixture-eval-v1
    page_number: 5
    section: Board Layout
    topic: ground return routing
    status: selected_from_fixture_metadata
ai_context_boundary: candidate_spans_only
```

### `layout_guide.md` plan

```markdown
# U_DEMO_1 PCB Layout Guide

## Source Coverage
Two synthetic PDF records are represented. Two layout-candidate spans are
identified on datasheet page 7 and evaluation-guide page 5. Source text and
document contents remain unverified.

## Layout-Relevant Original Excerpts
No excerpt available in the fixture. Do not reconstruct or quote source text.

## Layout-Relevant Findings
No source-bound layout finding can be stated from topic labels alone.

## Decoupling And Power Placement
Evidence placeholder: `SM-U1-DS-P7`.
The fixture labels the candidate topic as “decoupling and exposed-pad vias.”
Exact placement, values, distances, topology, and mandatory language are unknown.

## Grounding
Evidence placeholder: `SM-U1-EVAL-P5`.
The fixture labels the candidate topic as “ground return routing.”
The required routing method and constraints are unknown.

## Routing
No independently supported routing instruction is available.

## Thermal / Exposed Pad
Evidence placeholder: `SM-U1-DS-P7`.
The fixture associates page 7 with exposed-pad vias. Via count, dimensions,
pattern, connection, and thermal requirements are unknown.

## Evaluation Board Layout References
Synthetic evaluation-guide reference: `SM-U1-EVAL-P5`.
No board image, schematic, layout file, or verified reference design is present.

## Figures And Tables
Planned cited-page renders: `FIG-U1-DS-P7`, `FIG-U1-EVAL-P5`.
Planned promoted table: `T1`.
Rejected table candidate: `T2`.
These are dry-run records; no image or table artifact is asserted.

## Open Questions / Missing Official Guidance
- Recover source text for both cited pages before turning topic labels into instructions.
- Confirm whether page 7 specifies actionable decoupling or exposed-pad requirements.
- Confirm whether page 5 specifies actionable ground-return constraints.
- Validate `T1` as an explicit table before promotion.

## Source Map Summary
See `SM-U1-DS-P7` and `SM-U1-EVAL-P5`.
```

### Source-map entries

```yaml
source_map:
  - entry_id: SM-U1-DS-P7
    component_key: U_DEMO_1
    source_file: demo_converter_datasheet.pdf
    source_file_sha256: sha256:fixture-converter-v1
    page_number: 7
    fixture_section: Layout Guidance
    fixture_topic: decoupling and exposed-pad vias
    guide_sections:
      - Decoupling And Power Placement
      - Thermal / Exposed Pad
    citation_count: 2
    dedupe_key: sha256:fixture-converter-v1::7
    bounded_excerpt_hash_or_anchor: unavailable
    rendered_page_rect: full_page_planned
    output_file: Layout Guide/figures/FIG-U1-DS-P7.png
    output_sha256: unavailable_until_render
    status: planned_not_rendered
    warnings:
      - No source text or page image is present.
      - Fixture topic must not be promoted into a detailed layout claim.

  - entry_id: SM-U1-EVAL-P5
    component_key: U_DEMO_1
    source_file: demo_eval_guide.pdf
    source_file_sha256: sha256:fixture-eval-v1
    page_number: 5
    fixture_section: Board Layout
    fixture_topic: ground return routing
    guide_sections:
      - Grounding
    citation_count: 1
    dedupe_key: sha256:fixture-eval-v1::5
    bounded_excerpt_hash_or_anchor: unavailable
    rendered_page_rect: full_page_planned
    output_file: Layout Guide/figures/FIG-U1-EVAL-P5.png
    output_sha256: unavailable_until_render
    status: planned_not_rendered
    warnings:
      - The indicated cache miss requires indexing in an executable run.
      - No routing detail may be inferred from the topic label.
```

### Figure and table handling

```yaml
cited_page_render_plan:
  unique_cited_pages: 2
  records:
    - figure_id: FIG-U1-DS-P7
      dedupe_key: sha256:fixture-converter-v1::7
      citation_count: 2
      guide_sections:
        - Decoupling And Power Placement
        - Thermal / Exposed Pad
      render_scope: complete_referenced_page
      planned_location: Layout Guide/figures/FIG-U1-DS-P7.png
      status: planned_not_rendered
    - figure_id: FIG-U1-EVAL-P5
      dedupe_key: sha256:fixture-eval-v1::5
      citation_count: 1
      guide_sections:
        - Grounding
      render_scope: complete_referenced_page
      planned_location: Layout Guide/figures/FIG-U1-EVAL-P5.png
      status: planned_not_rendered

table_records:
  - candidate_id: T1
    page_number: 5
    supplied_context: board connector and power setup
    metrics_present: true
    disposition: conditionally_promote
    planned_location: Layout Guide/tables/layout_only/T1.md
    promotion_reason: Fixture context is layout/board-relevant and quality metrics are indicated.
    stop_condition: Do not promote unless executable extraction confirms an explicit table and acceptable accuracy/whitespace metrics.
    status: planned_not_extracted

  - candidate_id: T2
    page_number: 2
    supplied_context: two-column marketing prose
    metrics_present: true
    disposition: reject
    rejection_reason: Two-column marketing prose is not an explicit layout table.
    rejection_record: Layout Guide/cache/layout_only_rejection_summary.json
    status: rejected_from_promotion
```

## U_DEMO_2 — Source-Gap Packet

### Cache and coverage record

```yaml
component_key: U_DEMO_2
sources:
  - source_file: demo_sensor_brief.pdf
    source_file_sha256: sha256:fixture-sensor-v1
    page_count: 2
    cache_disposition: miss
    executable_followup: page-level indexing required
cache_hits: 0
cache_misses: 1
candidate_span_count: 0
coverage_state: insufficient
source_gap_state: true
owner_followup_needed: true
```

### `layout_guide.md`

```markdown
# U_DEMO_2 PCB Layout Guide — Source Gap

## Source Coverage
One synthetic two-page source record is listed. Its cached index does not match,
and the fixture supplies no layout-relevant candidate span.

Supplemental-source attempts recorded by the fixture:

- Official datasheet: missing.
- Official evaluation-board user guide: blocked because network execution is
  disabled for this fixture.

No actual network result beyond these supplied statuses is asserted.

## Layout-Relevant Original Excerpts
None available.

## Layout-Relevant Findings
No source-supported PCB-layout finding is available.

## Decoupling And Power Placement
Unresolved; no official guidance supplied.

## Grounding
Unresolved; no official guidance supplied.

## Routing
Unresolved; no official guidance supplied.

## Thermal / Exposed Pad
Unresolved; applicability and requirements are unknown.

## Evaluation Board Layout References
No accessible official evaluation-board guidance is represented.

## Figures And Tables
No cited page exists, so no current figure is planned.
No table candidate is represented.

## Open Questions / Missing Official Guidance
- Owner approval is needed for a later official-source retrieval attempt when
  network execution is permitted.
- Resolve the exact component identity before sourcing official documentation.
- Obtain an official datasheet or evaluation-board guide containing layout guidance.
- If no guidance exists, record an official not-applicable basis rather than
  inferring generic PCB practices.

## Source Map Summary
The source map contains an inventory-only source-gap entry. It does not support
a PCB-layout claim.
```

### Source-map entry

```yaml
source_map:
  - entry_id: SM-U2-GAP-1
    component_key: U_DEMO_2
    source_file: demo_sensor_brief.pdf
    source_file_sha256: sha256:fixture-sensor-v1
    page_number: null
    guide_sections:
      - Source Coverage
      - Open Questions / Missing Official Guidance
    evidence_role: inventory_only
    claim_support: none
    bounded_excerpt_hash_or_anchor: unavailable
    cited_page_render: not_applicable
    warnings:
      - No candidate span is available.
      - Component identity and official layout guidance remain unresolved.
```

### Supplemental-source attempt record

```yaml
attempted_supplemental_sources:
  - source_kind: datasheet
    source_policy: official_only
    result: missing
    download_status: not_attempted
  - source_kind: evaluation_board_user_guide
    source_policy: official_only
    result: blocked_by_network_disabled_fixture
    download_status: not_attempted
stop_condition:
  state: owner_followup_required
  rule: Do not add layout claims until official evidence or a supported not-applicable reason is available.
```

## Extraction Manifest

```yaml
manifest_schema: component_layout_extraction_manifest_dry_run_v1
fixture_id: public_synthetic_two_component_layout_extraction
status: dry_run_packet
processed_component_count: 2
totals:
  processed_source_files: 3
  cache_hits: 1
  cache_misses: 2
  candidate_span_count: 2
  supplemental_downloads: 0
  unique_cited_page_render_count_planned: 2
  rendered_figure_count: 0
  raw_table_candidate_count: 2
  strict_quality_table_count: 0
  layout_only_table_count_planned: 1
  rejected_visual_table_candidate_count: 1
components:
  - component_key: U_DEMO_1
    processed_source_files:
      - demo_converter_datasheet.pdf
      - demo_eval_guide.pdf
    source_gap_state: false
    owner_followup_needed: true
    cache_hits: 1
    cache_misses: 1
    candidate_span_count: 2
    attempted_supplemental_sources: []
    supplemental_downloads: []
    figure_table_extraction_status: planned_only
    cited_page_figure_count_planned: 2
    layout_only_table_count_planned: 1
    rejected_visual_table_candidate_count: 1
    extraction_warnings:
      - Source text, citations, figures, and table structure require executable source-bound confirmation.
    open_questions:
      - Exact wording and constraints on cited pages.
      - Whether T1 passes strict table-quality validation.

  - component_key: U_DEMO_2
    processed_source_files:
      - demo_sensor_brief.pdf
    source_gap_state: true
    owner_followup_needed: true
    cache_hits: 0
    cache_misses: 1
    candidate_span_count: 0
    attempted_supplemental_sources:
      - datasheet: missing
      - evaluation_board_user_guide: blocked_by_network_disabled_fixture
    supplemental_downloads: []
    figure_table_extraction_status: not_applicable_without_citations
    cited_page_figure_count_planned: 0
    layout_only_table_count_planned: 0
    rejected_visual_table_candidate_count: 0
    extraction_warnings:
      - No source-supported layout guidance is available.
    open_questions:
      - Exact component identity.
      - Availability of official layout documentation.
tool_versions: not_applicable_to_dry_run
extraction_errors: []
```

## Boundary and Readiness Result

```yaml
boundary_review:
  runtime_absolute_paths_in_public_packet: false
  vendor_text_or_binary_payload_in_public_packet: false
  runtime_figure_payload_in_public_packet: false
  whole_pdf_ai_context_claimed: false
  actual_download_claimed: false
  actual_render_claimed: false
  cache_policy_recorded: true
  source_maps_present: true
  source_gap_reason_recorded: true

readiness:
  - component_key: U_DEMO_1
    result: conditionally_ready_for_source_bound_extraction
    not_ready_for_layout_design_reliance: true
    reason: Candidate and citation metadata exist, but source text, figures, and table quality remain unconfirmed.
    next_gate: Confirm cited-page evidence and strict table quality in an authorized executable run.

  - component_key: U_DEMO_2
    result: source_gap_packet_complete
    ready_for_ai_assisted_design_review: false
    reason: No layout-relevant candidate evidence or supported not-applicable reason is available.
    next_gate: Owner-directed official-source follow-up.

overall_result: usable_dry_run_packet_with_one_conditional_component_and_one_bounded_source_gap
```
