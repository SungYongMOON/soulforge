# Safety and Hazard — source-direct derivation v0

Status: candidate input only. `rule_acceptance: false`; `source_adoption: false`.

## Direct source basis

The only executable candidate source family is `S1-MIL-STD-882E-CHANGE-1`, pinned in the
source inventory to the official DLA public document image and SHA-256. The direct reading
verified the eight-element process and the named sections below. This record keeps short
paraphrases and locators only; it does not reproduce the standard.

Locator reconciliation: the S1 inventory is a source-level locator superset. Figure 1 is
source-level process context only and is not mapped to an executable rule. Tables I-III
specifically support SH-RSK-02 severity, probability, and risk characterisation; the rule-level
locators below intentionally retain only the applicable subset.

| candidate rule | direct locator | bounded derivation |
| --- | --- | --- |
| `SH-HZ-01` | §4.3.2 | Hazard identity should be traceably documented across the system life cycle. |
| `SH-RSK-02` | §4.3.3; Tables I-III | Severity, probability, and risk characterisation need a bound assessment record. The engine does not calculate or tailor a matrix. |
| `SH-MIT-03` | §§4.3.4-4.3.5 | Proposed and selected mitigation evidence and expected reduction must be traceable. |
| `SH-VV-04` | §4.3.6 | Implementation and effectiveness evidence for selected mitigations must be separately bound. |
| `SH-RES-05` | §4.3.7 | Residual-risk characterisation must remain bound to the evidence used for its review. The engine does not decide acceptability. |
| `SH-AUT-06` | §4.3.7 | A formal acceptance record and a named human authority binding are evidence prerequisites only. The engine rejects AI/engine authority roles and performs no acceptance action. |
| `SH-LCY-07` | §4.3.8 | Hazard status, change-review evidence, and life-cycle tracking must be bound for review. |
| `SH-CLS-08` | §4.3.1(d); §§4.3.6-4.3.7 | Closure-evidence readiness is modelled as a traceability check for hazard status, verification, and written-record evidence; it is not a claim that a hazard is closed. |

## Source-status guard

The official NASA NODIS page for `S2-NASA-NPR-8715-3D` explicitly marks the document obsolete
and no longer used. Its useful historical description of closure and written residual-risk
acceptance is not carried into executable rules. This negative result is deliberate: a stale
public source must not silently strengthen a candidate engine.

`S3-NASA-SP-2010-580-V1` remains public guidance context only. No operative requirement,
acceptance threshold, or human authority is derived from it.

## RAG and retrieval boundary

No RAG corpus or model output was used to derive this record. Future retrieval can suggest a
source or locator, but only an official direct read that records exact revision, access state,
and applicability can update the inventory. Neither retrieval nor this evaluator can accept a
rule, accept residual risk, close a hazard, or conclude compliance.

## Applicability and authority boundary

These rules are generic evidence-check candidates, not a declaration that MIL-STD-882E applies
to any project. A caller must bind all five Core applicability components and a source revision.
An unresolved component produces `gap_unknown`; an explicit false component with a basis ref
may produce `not_applicable`. The human authority fields are proof-carrying references only:
the engine cannot inspect the authority's identity, delegation scope, signature, or decision.
