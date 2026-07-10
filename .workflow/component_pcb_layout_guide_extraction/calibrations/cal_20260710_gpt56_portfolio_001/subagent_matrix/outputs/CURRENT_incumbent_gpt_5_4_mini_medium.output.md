**Component PCB Layout Guide Extraction Dry-Run Packet**

**Scope**
- Fixture: `public_synthetic_two_component_layout_extraction`
- Workflow: `component_pcb_layout_guide_extraction`
- Boundary: synthetic metadata only; no actual download, render, or vendor payload.

**Per-Component Records**

`U_DEMO_1`
- Cache/index:
  - `demo_converter_datasheet.pdf` (`sha256:fixture-converter-v1`): cache hit
  - `demo_eval_guide.pdf` (`sha256:fixture-eval-v1`): cache miss
- Candidate-span selection:
  - Selected `demo_converter_datasheet.pdf` page `7`, section `Layout Guidance`, topic `decoupling and exposed-pad vias`
  - Selected `demo_eval_guide.pdf` page `5`, section `Board Layout`, topic `ground return routing`
- Final guide citation set:
  - `demo_converter_datasheet.pdf` page `7` -> `Decoupling And Power Placement`
  - `demo_converter_datasheet.pdf` page `7` -> `Thermal / Exposed Pad`
  - `demo_eval_guide.pdf` page `5` -> `Grounding`
- Coverage state:
  - Layout guidance present
  - No source-gap downgrade required

`U_DEMO_2`
- Cache/index:
  - `demo_sensor_brief.pdf` (`sha256:fixture-sensor-v1`): cache miss
- Candidate-span selection:
  - No layout-relevant spans found
- Supplemental source attempts:
  - Datasheet: missing
  - Evaluation board user guide: blocked by network-disabled fixture
- Coverage state:
  - Insufficient official guidance
  - Source-gap packet required
  - Stop condition avoided by bounded fallback packet, not invented guidance

**`layout_guide.md` Section Plan**

`U_DEMO_1`
- `Source Coverage`
- `Layout-Relevant Original Excerpts`
- `Layout-Relevant Findings`
- `Decoupling And Power Placement`
- `Grounding`
- `Thermal / Exposed Pad`
- `Evaluation Board Layout References`
- `Figures And Tables`
- `Open Questions / Missing Official Guidance`
- `Source Map Summary`

`U_DEMO_2`
- `Source Coverage`
- `Layout-Relevant Original Excerpts`
- `Layout-Relevant Findings`
- `Decoupling And Power Placement`
- `Grounding`
- `Routing`
- `Thermal / Exposed Pad`
- `Evaluation Board Layout References`
- `Figures And Tables`
- `Open Questions / Missing Official Guidance`
- `Source Map Summary`

**Source Map Entries**

`U_DEMO_1`
- `source_map_entry_id`: `U_DEMO_1-S1`
  - source: `demo_converter_datasheet.pdf`
  - checksum: `sha256:fixture-converter-v1`
  - page: `7`
  - guide sections: `Decoupling And Power Placement`, `Thermal / Exposed Pad`
  - evidence basis: final guide citations from the synthetic fixture
- `source_map_entry_id`: `U_DEMO_1-S2`
  - source: `demo_eval_guide.pdf`
  - checksum: `sha256:fixture-eval-v1`
  - page: `5`
  - guide section: `Grounding`
  - evidence basis: final guide citation from the synthetic fixture

`U_DEMO_2`
- `source_map_entry_id`: `U_DEMO_2-S1`
  - source: `demo_sensor_brief.pdf`
  - checksum: `sha256:fixture-sensor-v1`
  - page: not applicable for layout citation mapping
  - status: no layout-relevant source-map citation available
- `source_map_entry_id`: `U_DEMO_2-S2`
  - supplemental attempt: datasheet missing
  - status: blocked/no official guidance acquired
- `source_map_entry_id`: `U_DEMO_2-S3`
  - supplemental attempt: evaluation board user guide blocked by network-disabled fixture
  - status: blocked/no official guidance acquired

**Cited Full-Page Render Plan**

`U_DEMO_1`
- Unique cited full-page renders planned, deduplicated by source checksum + page:
  - `demo_converter_datasheet.pdf` page `7`
  - `demo_eval_guide.pdf` page `5`
- Render scope:
  - full page only
  - no crop outputs
  - no duplicate render for the repeated citation of `demo_converter_datasheet.pdf` page `7`

`U_DEMO_2`
- No cited full-page render planned
- Reason: no layout-eligible cited pages

**Table Handling**

`U_DEMO_1`
- `T1`
  - page `5`
  - context: board connector and power setup
  - metrics present: yes
  - disposition: promote as layout-only table candidate
  - rationale: board setup / power / connector context matches layout-table policy
- `T2`
  - page `2`
  - context: two-column marketing prose
  - metrics present: yes
  - disposition: reject
  - rationale: two-column prose detected as table-like candidate; not a layout table

`U_DEMO_2`
- No table candidates provided
- No promotions or rejections

**Source-Gap Packet**

`U_DEMO_2`
- Attempted official sources:
  - datasheet: missing
  - evaluation board user guide: blocked by network-disabled fixture
- Blocking reason:
  - official guidance could not be acquired within the fixture constraints
- Owner follow-up needed:
  - supply official layout guidance source or approved local source packet
- Constraints preserved:
  - no unsupported PCB-layout claims
  - no implied vendor content
  - no runtime path disclosure

**Extraction Manifest**

```json
{
  "workflow_id": "component_pcb_layout_guide_extraction",
  "fixture_id": "public_synthetic_two_component_layout_extraction",
  "components": [
    {
      "component_key": "U_DEMO_1",
      "processed_source_files": [
        {
          "source_file_name": "demo_converter_datasheet.pdf",
          "sha256": "sha256:fixture-converter-v1",
          "cache_status": "hit"
        },
        {
          "source_file_name": "demo_eval_guide.pdf",
          "sha256": "sha256:fixture-eval-v1",
          "cache_status": "miss"
        }
      ],
      "attempted_supplemental_sources": [],
      "source_gap_state": "none",
      "owner_followup_needed": false,
      "cache_hits": 1,
      "cache_misses": 1,
      "candidate_span_count": 2,
      "supplemental_downloads": 0,
      "figure_table_extraction_status": "partial_success",
      "figure_count": 2,
      "raw_table_candidate_count": 2,
      "strict_quality_table_count": 1,
      "cited_page_figure_count": 2,
      "layout_only_table_count": 1,
      "rejected_visual_table_candidate_count": 1,
      "tool_versions": "synthetic/fixture-only",
      "extraction_errors": [],
      "extraction_warnings": [],
      "open_questions": []
    },
    {
      "component_key": "U_DEMO_2",
      "processed_source_files": [
        {
          "source_file_name": "demo_sensor_brief.pdf",
          "sha256": "sha256:fixture-sensor-v1",
          "cache_status": "miss"
        }
      ],
      "attempted_supplemental_sources": [
        {
          "source_kind": "datasheet",
          "result": "missing"
        },
        {
          "source_kind": "evaluation_board_user_guide",
          "result": "blocked_by_network_disabled_fixture"
        }
      ],
      "source_gap_state": "bounded_source_gap_packet",
      "owner_followup_needed": true,
      "cache_hits": 0,
      "cache_misses": 1,
      "candidate_span_count": 0,
      "supplemental_downloads": 0,
      "figure_table_extraction_status": "not_applicable",
      "figure_count": 0,
      "raw_table_candidate_count": 0,
      "strict_quality_table_count": 0,
      "cited_page_figure_count": 0,
      "layout_only_table_count": 0,
      "rejected_visual_table_candidate_count": 0,
      "tool_versions": "synthetic/fixture-only",
      "extraction_errors": [],
      "extraction_warnings": [
        "official_guidance_missing",
        "network_disabled_blocks_bootstrap"
      ],
      "open_questions": [
        "official layout guidance source not available in fixture"
      ]
    }
  ]
}
```

**Boundary And Readiness Result**
- `U_DEMO_1`: ready for AI-assisted design review within the synthetic packet boundary
- `U_DEMO_2`: not layout-ready; correctly downgraded to source-gap packet
- Public/private boundary status:
  - no runtime absolute paths
  - no vendor document text
  - no downloaded binaries
  - no unsupported layout claims

