# Wiki Curation Maintenance v0

## Purpose

- This document defines how a worker should maintain the LLM wiki after source
  intake, query-first work, or sourcebound deepening.
- It is the current-default curation runbook. It is documentation on purpose:
  the curation step touches multiple owner-boundary surfaces and should remain
  explicit until repeated use proves a narrower executable workflow.

## One-line Rule

- Curation does not create truth. It keeps project wiki state reusable by
  updating source ledger rows, packet membership, known gaps, and lifecycle
  state after a bounded source-backed task.

## Owner Split

| Surface | Role |
| --- | --- |
| Google Drive source warehouse | stores approved source files or Drive-native refs |
| NotebookLM query bookshelf | advisory query surface over approved source sets |
| `_workmeta/<project_code>/reports/source_research/**` | project-local metadata owner for bindings, source ledgers, and query logs |
| `guild_hall/knowledge_access` | metadata-only usage signal and rollup layer |
| review gate and owner decision | claim-ceiling and approval authority |

## When To Run

Run curation after:

1. a new source is approved for Drive warehouse placement or NotebookLM packet use
2. a source changes state to superseded, rejected, or unclear
3. a query-first task finds a stable new source grouping or stable source gap
4. a sourcebound loop produces concept candidates or a stronger claim route
5. a project notebook binding, source ledger, or packet map is now stale

## Inputs

- project source ledger
- project NotebookLM binding
- project NotebookLM query log when present
- project or domain packet map
- approved source packet refs or sourcebound outputs
- usage rollup or retention signals when available
- owner decisions when approval or promotion pressure exists

## Required Curation Actions

### 1. Normalize Source Identity

- keep one stable `source_handle` per source entry
- keep one public-safe label
- do not create new aliases when an existing handle already names the source

### 2. Update Source Lifecycle State

- set warehouse lifecycle or folder state
- set approval status
- set superseded or rejected state when needed
- keep the replacement relation as metadata

### 3. Update Project Wiki Metadata

- update project source ledger rows
- update NotebookLM binding notes when a notebook/source relation changes
- update packet membership only for approved CANON sources

### 4. Preserve Gaps Explicitly

- if a claim is still weak, record the gap
- if a source is missing, route it as missing, not implied
- if owner approval is missing, hold the packet or source row as pending

### 5. Keep Usage Evidence Thin

- record refs, ids, route, and purpose only
- do not copy raw source payloads or NotebookLM answers into public canon
- keep claim ceiling at the weakest supported state

## Update Order

1. source ledger row
2. packet map
3. NotebookLM binding note
4. knowledge access event or follow-up note when needed
5. review gate or owner decision packet when claim pressure rises

## Do Not Do

- do not infer `source_supported` from Drive placement alone
- do not infer owner approval from packet membership alone
- do not infer per-source Drive backing from folder existence alone
- do not let NotebookLM answer text become canon authority
- do not copy source payloads into the public repo

## Relation To Existing Workflows

- use `monster_knowledge_preflight_v0` before the main workflow when the task is
  query-first
- use `knowledge_candidate_triage_v0` when candidate material or packet
  membership must be classified first
- use `sourcebound_knowledge_packet_operating_loop_v0` when raw or approved
  source inspection is needed
- use `wiki_curation_maintenance_v0` when the curation step should be expressed
  as a reusable metadata-only workflow packet instead of a freeform manual note
- use `knowledge_access_event_capture_v0` when enough metadata-only use events
  exist to justify rollup and maintenance signals
- use `owner_decision_packet_v0` or `post_development_review_gate_v0` when the
  curation result changes approval, promotion, or release posture

## Current Default

- Curation is required for reusable results.
- The runbook remains the human-readable default even after the executable
  `wiki_curation_maintenance_v0` package exists.
- It is already usable for projects because the ledgers, packet maps, Drive
  warehouse refs, and query logs now exist, and the builder can now route into
  the executable curation layer.
