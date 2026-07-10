# research_notes.md

# Research Notes

- Workflow: `build_lineage_map`
- Fixture: `PUBLIC_SYNTH_BUILD_LINEAGE_MAP`
- Source kind: synthetic fixture derived from the public workflow contract
- Evidence boundary: `source_documents` and `source_notes` only
- Authority: no source is promoted beyond the authority granted by the workflow contract

## Supported observations

1. Two synthetic source documents partially agree on the lineage under review.
2. Their agreement is insufficient to establish a complete or final lineage.
3. One ambiguity remains unresolved and must stay visible in downstream planning.
4. The current workflow is bounded to evidence-backed planning artifacts.

## Unresolved ambiguity

The synthetic source set does not establish which interpretation resolves the remaining lineage discrepancy. No conclusion is assigned until an owner supplies additional evidence or an explicit decision.

## Safe boundary

- Treat the partially agreeing documents as provisional evidence.
- Preserve the unresolved ambiguity in all downstream planning.
- Do not infer undocumented relationships.
- Do not claim completed diagramming, implementation, delivery, or runtime validation.
- Runtime truth and produced artifacts remain owned by the workflow runtime under its configured private runtime location; no runtime fact is asserted here.

## Handoff to `build_pbs`

`lineage_pbs.md` may organize only the supported observations, the unresolved ambiguity, evidence references, ownership gaps, and planning dependencies recorded above.

## Stop conditions

Stop if:

- the source boundary cannot be maintained;
- the unresolved ambiguity is presented as settled fact;
- required evidence is missing;
- the next artifact would imply finished delivery rather than bounded planning.

---

# lineage_pbs.md

# Lineage Planning Breakdown Structure

- Workflow: `build_lineage_map`
- Fixture: `PUBLIC_SYNTH_BUILD_LINEAGE_MAP`
- Status: planning draft
- Evidence basis: `research_notes.md`
- Delivery status: not delivered; planning only

## PBS-1 — Establish source-backed lineage scope

- Basis: two synthetic source documents partially agree.
- Output: a bounded lineage scope containing only relationships supported by the available evidence.
- Owner: `investigator` for structure; source owners retain factual authority.
- Constraint: unsupported relationships remain excluded.

## PBS-2 — Record the unresolved discrepancy

- Basis: one ambiguity remains unresolved in the source set.
- Output: an explicit ambiguity item linked to the affected lineage area.
- Owner: source owner or designated decision owner, not the planning artifact.
- Required decision: provide additional evidence or approve an explicit interpretation.
- Status: blocked pending owner/evidence input.

## PBS-3 — Prepare evidence-backed planning structure

- Output: organized lineage planning sections suitable for later review or diagram drafting.
- Owner: `investigator`.
- Constraint: the structure must distinguish confirmed observations from unresolved items and assumptions.
- Status: draft only.

## PBS-4 — Define next evidence gate

- Required input: clarification or additional evidence addressing the unresolved ambiguity.
- Review question: does the new evidence support a stable lineage relationship?
- Pass condition: the relationship is supported within the permitted source boundary.
- Fail condition: ambiguity remains or authority is insufficient.
- Failure action: stop and retain the item as unresolved.

## Explicit non-claims

This artifact does not claim:

- a complete lineage map;
- resolution of the source discrepancy;
- finished diagram drafting;
- implementation or operational delivery;
- runtime execution, validation, or artifact promotion;
- authority from hidden, private, or external evidence.

## Completion boundary

The workflow stops at `research_notes.md` and `lineage_pbs.md`. Further work requires a separately authorized workflow phase and additional evidence or owner decisions.
