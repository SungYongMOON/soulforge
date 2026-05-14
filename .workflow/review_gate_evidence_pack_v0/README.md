# Review Gate Evidence Pack v0

`review_gate_evidence_pack_v0` is a public-safe governance workflow for assembling lightweight review-readiness packets from existing Soulforge evidence.

It reads trace, interface-control, verification-plan, source-gap, harness, configuration, owner-decision, and open-question refs. It writes a compact review packet, entrance and success criteria, blockers, actions, decision status, and provenance for SRR/SFR/PDR/CDR/TRR/FCA/PCA-style review conversations.

It does not approve a review gate, certify verification completion, replace owner judgment, make missing sources true, mutate upstream packets, or make private evidence public-safe.

## Inputs

- `page_module_trace_matrix_v0` review indexes, trace rows, evidence authority, gap registers, verification seeds, and boundary notes.
- `interface_control_and_harness_readiness_v0` interface-control packets, readiness ceilings, blockers, review-required items, owner follow-up, and boundary notes.
- `verification_plan_from_page_contracts_v0` verification summaries, gap registers, TRR readiness handoffs, FCA/SVR handoff indexes, owner follow-up, and boundary notes.
- `source_gap_followup_packet_v0` source-gap packets, owner action queues, retry triggers, and downstream unblock maps.
- Optional `xml_harness_composition_v0` composition readiness, blocked/review-required/candidate-safe/source-supported connection rows, and owner follow-up.
- Optional configuration baseline refs, scoped owner decisions, and risk or open-question registers.

## Outputs

- `review_gate_packet.yaml`
- `source_index.yaml`
- `evidence_matrix.yaml`
- `entrance_criteria_checklist.yaml`
- `success_criteria_checklist.yaml`
- `review_blockers.yaml`
- `action_item_register.yaml`
- `decision_summary.yaml`
- `review_gate_provenance.yaml`
- `readiness_summary.md`
- `boundary_review_note.md`

## Contract

- The review family is explicit: SRR-like, SFR-like, SRR/SFR-like, PDR-like, CDR-like, TRR-like, FCA/SVR-like, PCA-like, or mixed-tailored.
- Every major review question maps to source refs or an explicit gap.
- Entrance criteria and success criteria stay separate.
- Blockers distinguish scheduling blockers, closure blockers, and confidence weakeners.
- Actions include an owner or responsible surface, evidence target, trigger or due condition, and supporting criterion or blocker.
- Actual decisions require scoped owner decision evidence; otherwise entries are proposed decisions or deferred decisions.
- The packet includes explicit non-claims preventing review approval and verification-completion overclaim.
- Upstream evidence remains read-only. Repairs and evidence refreshes go back to the owning workflow.

## Boundary Rules

- The workflow packages evidence for a review conversation only.
- Readiness states are limited to whether the conversation is ready, ready with named caveats, not ready, blocked, or not applicable pending owner input.
- Source gaps, trace conflicts, harness blockers, missing quantitative values, absent procedures, and unresolved owner decisions remain first-class blockers or action items.
- Public canon contains only portable rules and templates. Raw project payloads, source files, vendor text, test logs, simulation results, runtime absolute paths, `_workspaces` outputs, and private run truth stay outside `.workflow`.

## Current Maturity

`validation_level: pilot_ready_contract_only`

The package is registered as a first public-safe contract. A controlled project-local pilot is still required before claiming pilot-executed, usable, or production-ready behavior.

Best first pilot: a mixed page/harness review packet over the existing representative page lane with one power-oriented page carrying source/material/layout/quantitative evidence, one interface-oriented page with connector or owner-map gaps, one ambiguous or channelized page with source gaps, one harness packet with blocked and review-required joins, one trace-matrix review index, and one verification-plan/TRR handoff.
