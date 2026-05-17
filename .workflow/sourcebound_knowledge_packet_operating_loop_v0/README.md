# Sourcebound Knowledge Packet Operating Loop v0

`sourcebound_knowledge_packet_operating_loop_v0` is the dedicated Karpathy-style
Soulforge lane for turning source intake into verified conceptualization and
then workflowization.

The workflow creates a private source-bound knowledge packet: approved source
refs are compiled into a derivative projection with an index and log, then linted
for contradictions and gaps. Only after that does it extract source-cited concept
candidates and route them by claim ceiling toward workflow, ontology, owner
decision, source follow-up, or private hold.

## Outputs

- `source_intake_manifest`
- `sourcebound_knowledge_packet_manifest`
- `compiled_projection_index`
- `compiled_projection_log`
- `contradiction_gap_lint_report`
- `concept_candidate_register`
- `claim_ceiling_and_promotion_route`
- `optional_notebooklm_advisory_handoff`
- `notebooklm_handoff_validation`
- `ontology_candidate_rule_register`
- `workflowization_review_packet`
- `boundary_review_note`

## Boundary

Source truth remains in source packets or owner-held sources. The knowledge
packet is a private derivative projection, not canon and not source authority.
NotebookLM or similar tools are optional owner-operated advisory aids only; their
answers cannot approve concepts, ontology candidates, or workflow promotion.
NotebookLM handoff validation checks only that the handoff is bounded,
payload-safe, and advisory-only. Ontology-facing entries remain candidate rules
for review; they do not create or accept ontology canon.

## Current Maturity

`validation_level: pilot_executed_private_evidence`

This package is public-safe and registered from repeated private LLM-wiki/source
packet sandbox evidence. It is not profile-optimized and not production-ready.
