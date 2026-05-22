# se_cross_stage_mapping_governance_v0

`se_cross_stage_mapping_governance_v0` is a public-safe governance workflow for aggregating SE lifecycle artifact coverage, artifact-to-input mapping, claim ceilings, and missing-download follow-up across stages.

This workflow is structure-only. It does not create evidence, author stage artifacts, approve readiness, validate source truth, or replace any source-bound workflow.

It may also run in repeated per-artifact-folder inspection mode. That mode inspects only folder-level metadata and existing governance refs, records deltas and gaps, and routes follow-up or downstream rerun needs. It is not artifact authoring, source acquisition, evidence validation, or HWP/HWPX body review.

## Scope

The workflow aggregates already-visible governance inputs such as:

- stage gap scan packets from `se_stage_artifact_gap_scan_v0`
- source and evidence follow-up packets from `source_gap_followup_packet_v0`
- source sufficiency or blocked-field summaries from source-review workflows
- existing PDF, HTML, intake-note, filename, and title level metadata
- current repo planning docs and public-safe workflow contracts
- artifact folder inventories using only portable folder refs, filenames, titles, sidecar metadata, existing PDF/HTML derivative refs, and approved intake/planning refs
- prior inspection packets from this same workflow package, treated as previous metadata observations only

The stage set includes:

- `000_REF`
- `020_MGMT`
- `030_SRR`
- `060_SFR`
- `090_PDR`
- `120_CDR`
- `150_TRR_DT`
- `180_FCA_OT`
- `210_PCA`
- `240_LL`
- `270_UNCLASSIFIED`

`TRR_DT`, `FCA_OT`, and `LL` are treated as current lifecycle stage names, not legacy aliases.

## HWP/HWPX Boundary

HWP and HWPX body review is out of scope for this workflow version.

Allowed handling for HWP/HWPX-related rows is limited to filenames, titles, existing PDF/HTML derivatives, existing intake notes, and current repo planning docs. The workflow must not read HWP bodies, attempt HWP extraction, infer hidden body contents, or mark HWP/HWPX documents as reviewed.

The repeated inspection mode keeps the same boundary. HWP/HWPX folders may be inventoried only by allowed metadata such as filenames, titles, approved sidecar notes, and already-existing PDF/HTML derivative refs. A folder that requires body access must be registered as a gap or blocked row and routed out of this workflow.

## Outputs

- `mapping_governance_packet.yaml`
- `cross_stage_artifact_matrix.yaml`
- `artifact_to_input_map.yaml`
- `claim_ceiling_register.yaml`
- `missing_download_register.yaml`
- `stage_gap_scan_index.yaml`
- `boundary_review_note.md`
- `artifact_folder_inventory_index.yaml`
- `per_artifact_folder_inspection_packet.yaml`
- `required_content_gap_register.yaml`
- `input_basis_gap_register.yaml`
- `inspection_delta_register.yaml`
- `owner_source_followup_rows.yaml`
- `downstream_rerun_routes.yaml`

The repeated inspection outputs are optional loop outputs. They extend the package without replacing the stage gap scan index, cross-stage matrix, artifact-to-input map, claim ceiling register, or source gap follow-up rows.

## Allowed Claim Ceilings

This workflow may assign only governance-level ceilings:

- `observed`: a row, filename, title, packet reference, or public-safe note is visible.
- `mapped_governance_only`: an observed artifact row is mapped to stage, expected artifact family, and input need.
- `source_gap_followup_needed`: a missing or insufficient source/download should be routed to a follow-up workflow.
- `owner_decision_needed`: owner confirmation is required before stronger action.
- `blocked_missing_download`: a missing download blocks downstream evidence work until resolved elsewhere.
- `not_applicable_owner_marked`: an owner or upstream packet marks the row not applicable.
- `rejected_or_blocked`: the row cannot support a claim under the current boundary.

## Explicit Non-Claims

This workflow does not claim:

- artifact completion
- source-supported evidence
- validated private truth
- stage readiness
- PDR, CDR, TRR_DT, FCA_OT, PCA, or LL readiness
- review approval or audit closure
- test execution, verification completion, or final readiness
- HWP/HWPX body coverage
- successful download or source acquisition
- owner decision creation
- public-safe status for private/raw payloads

## Compatibility

The workflow consumes `se_stage_artifact_gap_scan_v0` outputs as read-only stage scan context and emits route-ready rows for `source_gap_followup_packet_v0` when missing downloads, source gaps, owner source batches, or retry triggers are needed.

It can also provide governance summaries to readiness digest, review gate evidence pack, verification planning, TRR_DT harness planning, FCA_OT audit library, PCA asset package, and LL carry-forward workflows. Those downstream workflows remain the authority for their own evidence and acceptance states.

Repeated per-folder inspection keeps compatibility by linking folder observations back to `stage_gap_scan_index`, `cross_stage_artifact_matrix`, `artifact_to_input_map`, and `missing_download_register` row ids where available. The loop can produce downstream rerun routes when new metadata gaps or changed folder inventories suggest that an owning workflow should rerun, but this package does not execute those reruns or claim their outcomes.

## Current State

- `output_state: active_governance_only`
- `validation_level: pilot_executed_private_candidate`
- `registration_policy: registered_governance_only`
- `.workflow/index.yaml` includes this workflow as a registered workflow id
- Systems Engineering Cell may use it as an optional governance route
- private pilot evidence exists for primary artifact-family governance shape,
  but private run truth stays outside public canon
- repeated per-artifact-folder inspection mode remains metadata-only and does
  not create artifact/source/readiness authority
