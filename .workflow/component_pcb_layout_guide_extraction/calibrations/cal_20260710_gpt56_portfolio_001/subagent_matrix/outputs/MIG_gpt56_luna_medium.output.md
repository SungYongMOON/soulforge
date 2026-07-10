# Dry-Run Extraction Packet

## U_DEMO_1

### Cache and candidate-span record

| Source file | SHA256 | Pages | Cache status | Candidate spans |
|---|---|---:|---|---:|
| `demo_converter_datasheet.pdf` | `sha256:fixture-converter-v1` | 12 | Hit; checksum matched | Page 7 — `Layout Guidance`; decoupling and exposed-pad vias |
| `demo_eval_guide.pdf` | `sha256:fixture-eval-v1` | 8 | Miss; checksum did not match | Page 5 — `Board Layout`; ground return routing |

AI context is limited to the two candidate spans and neighboring source-bound context. No whole-PDF content is included.

### `Layout Guide/layout_guide.md` section plan

- Source Coverage
- Layout-Relevant Original Excerpts
  - Source-bound anchors only; no vendor text reproduced
- Layout-Relevant Findings
  - Findings pending source-bound synthesis from the listed candidate spans
- Decoupling And Power Placement
  - Cite `demo_converter_datasheet.pdf`, page 7
- Grounding
  - Cite `demo_eval_guide.pdf`, page 5
- Routing
  - No separate citation supplied in the fixture
- Thermal / Exposed Pad
  - Cite `demo_converter_datasheet.pdf`, page 7
- Evaluation Board Layout References
  - Cite `demo_eval_guide.pdf`, page 5
- Figures And Tables
  - Reference planned cited-page render and promoted table records
- Open Questions / Missing Official Guidance
  - No additional gap claim supplied by the fixture
- Source Map Summary

No unsupported PCB-layout claim is introduced.

### `source_map.json` records

```json
[
  {
    "entry_id": "U_DEMO_1-SM-001",
    "source_file": "demo_converter_datasheet.pdf",
    "source_file_sha256": "sha256:fixture-converter-v1",
    "page_number": 7,
    "layout_guide_section": "Decoupling And Power Placement",
    "markdown_evidence_anchor": "U_DEMO_1::Decoupling And Power Placement::demo_converter_datasheet.pdf:p7",
    "dedupe_key": "sha256:fixture-converter-v1::7",
    "citation_count": 1,
    "extraction_method": "synthetic_fixture_candidate_span"
  },
  {
    "entry_id": "U_DEMO_1-SM-002",
    "source_file": "demo_converter_datasheet.pdf",
    "source_file_sha256": "sha256:fixture-converter-v1",
    "page_number": 7,
    "layout_guide_section": "Thermal / Exposed Pad",
    "markdown_evidence_anchor": "U_DEMO_1::Thermal / Exposed Pad::demo_converter_datasheet.pdf:p7",
    "dedupe_key": "sha256:fixture-converter-v1::7",
    "citation_count": 1,
    "extraction_method": "synthetic_fixture_candidate_span"
  },
  {
    "entry_id": "U_DEMO_1-SM-003",
    "source_file": "demo_eval_guide.pdf",
    "source_file_sha256": "sha256:fixture-eval-v1",
    "page_number": 5,
    "layout_guide_section": "Grounding",
    "markdown_evidence_anchor": "U_DEMO_1::Grounding::demo_eval_guide.pdf:p5",
    "dedupe_key": "sha256:fixture-eval-v1::5",
    "citation_count": 1,
    "extraction_method": "synthetic_fixture_candidate_span"
  }
]
```

### Figure and table handling

Cited full-page render plan:

| Source file | Page | Planned output | Reason |
|---|---:|---|---|
| `demo_converter_datasheet.pdf` | 7 | `Layout Guide/figures/demo_converter_datasheet_p7.png` | Cited twice; render once |
| `demo_eval_guide.pdf` | 5 | `Layout Guide/figures/demo_eval_guide_p5.png` | Cited once |

No files are rendered in this dry run.

Table records:

```json
[
  {
    "candidate_id": "T1",
    "source_file": "demo_eval_guide.pdf",
    "page_number": 5,
    "context": "board connector and power setup",
    "metrics_present": true,
    "decision": "promote",
    "planned_output": "Layout Guide/tables/layout_only/T1.md",
    "reason": "Board setup context is layout-relevant"
  },
  {
    "candidate_id": "T2",
    "source_file": "demo_converter_datasheet.pdf",
    "page_number": 2,
    "context": "two-column marketing prose",
    "metrics_present": true,
    "decision": "reject",
    "planned_output": "Layout Guide/cache/layout_only_rejection_summary.json",
    "reason": "Two-column prose is not an explicit layout table"
  }
]
```

## U_DEMO_2

### Cache and candidate-span record

| Source file | SHA256 | Pages | Cache status | Candidate spans |
|---|---|---:|---|---:|
| `demo_sensor_brief.pdf` | `sha256:fixture-sensor-v1` | 2 | Miss; checksum did not match | None |

Supplemental official-source attempts:

| Source kind | Result |
|---|---|
| Datasheet | Missing |
| Evaluation board user guide | Blocked because network execution is disabled |

### Source-gap packet

`Layout Guide/layout_guide.md`, `source_map.json`, and `extraction_manifest.json` shall record:

- No layout-relevant candidate spans were available.
- Official datasheet material was attempted but missing.
- An official evaluation-board user-guide lookup was attempted but blocked by the fixture’s disabled network policy.
- No layout claim is supported or added.
- Owner follow-up is required to provide approved official source material or enable an approved acquisition path.

Planned guide sections remain present, with unsupported sections marked as unavailable or unresolved. No figure renders or table promotions are planned.

### `source_map.json`

```json
{
  "component_key": "U_DEMO_2",
  "entries": [],
  "source_gap_state": "source_gap",
  "unresolved_gap": "No official layout guidance acquired from local or supplemental sources"
}
```

## Extraction manifests

```json
[
  {
    "component_key": "U_DEMO_1",
    "processed_source_files": [
      "demo_converter_datasheet.pdf",
      "demo_eval_guide.pdf"
    ],
    "attempted_supplemental_sources": [],
    "source_gap_state": "not_required",
    "owner_followup_needed": false,
    "cache_hits": 1,
    "cache_misses": 1,
    "candidate_span_count": 2,
    "supplemental_downloads": 0,
    "figure_table_extraction_status": "planned_only",
    "figure_count": 2,
    "raw_table_candidate_count": 2,
    "strict_quality_table_count": 1,
    "cited_page_figure_count": 2,
    "layout_only_table_count": 1,
    "rejected_visual_table_candidate_count": 1,
    "tool_versions": "not applicable in dry run",
    "extraction_errors": [],
    "extraction_warnings": [
      "Synthetic metadata only; no PDF text, binary, render, or vendor payload included"
    ],
    "open_questions": []
  },
  {
    "component_key": "U_DEMO_2",
    "processed_source_files": [
      "demo_sensor_brief.pdf"
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
    "source_gap_state": "source_gap",
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
    "tool_versions": "not applicable in dry run",
    "extraction_errors": [],
    "extraction_warnings": [
      "Official guidance unavailable; no unsupported layout claims permitted"
    ],
    "open_questions": [
      "Which approved official source should the owner provide for layout guidance?"
    ]
  }
]
```

## Boundary and readiness result

```json
{
  "workflow_id": "component_pcb_layout_guide_extraction",
  "fixture_id": "public_synthetic_two_component_layout_extraction",
  "result": "bounded_dry_run_packet_ready",
  "U_DEMO_1": {
    "readiness": "layout_ready_pending_local_extraction_outputs",
    "source_traceability": "planned",
    "public_boundary": "preserved"
  },
  "U_DEMO_2": {
    "readiness": "source_gap",
    "source_traceability": "attempts_and_blockers_recorded",
    "owner_followup_needed": true,
    "public_boundary": "preserved"
  },
  "checks": {
    "runtime_absolute_paths_in_public_canon": "none present",
    "vendor_docs_or_excerpts_in_public_packet": false,
    "downloads_performed": false,
    "renders_performed": false,
    "whole_pdf_ai_context": false,
    "cache_reuse_policy_recorded": true,
    "source_gap_recorded_when_needed": true
  }
}
```
