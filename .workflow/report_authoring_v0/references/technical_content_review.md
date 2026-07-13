# Technical-content review

Answer each applicable check `yes`, `no`, or `n/a` with an evidence pointer. Any
applicable `no` blocks the pass.

- Does every material assertion resolve to an approved source/draft claim or an
  explicit observation, inference, or `unconfirmed` state?
- Are signs, values, meaningful decimals, units, ranges, tolerances, uncertainty,
  coverage/confidence basis, sample counts, dates, and identifiers unchanged?
- Are candidate, comparator, metric, operator/direction, threshold, and condition
  still bound as one comparison?
- Are negation, modality, entities, pronoun/coreference, actor/role, attribution,
  and assurance status unchanged?
- Are time, location, operating condition, exclusions, applicability, and
  population scope unchanged?
- Is causal wording supported, with temporal or associative evidence kept
  distinct from causality?
- Does every citation resolve to the same protected reference id and `source_ref`,
  does its reader-facing label expose the protected citation surface, and does
  every source-dependent material claim retain its citation?
- Is every table value bound to the same table, row, column, entity, unit, and
  source?
- Is each verdict supported by the named criterion and evidence, with
  conditional/blocked/unconfirmed status preserved?
- Are source disagreements and missing data visible rather than silently
  reconciled?
- Did the candidate preserve every protected numeric/unit and citation surface
  exactly? v0 rejects unit conversion and citation renumbering because no
  executable authorized-change contract exists.
- Did any edit create a new implication or a summary-only claim?

The workflow-owned protected-claim baseline may be generated from the approved
source material or input draft. A caller-supplied semantic manifest is optional and
acts only as a stricter input. Generated manifests can omit a risk; they therefore
do not replace independent semantic verification or the required human review
before publishable/production-ready use.

Missing or conflicting support is a blocker. Do not invent bridging rationale.
Any authorized semantic change records before/after values, authority, reason,
affected derived claims, and renewed technical-content/evidence-logic review.
