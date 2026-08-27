# Manufacturing Readiness source packet v0

- `mission_id`: `SF-ENGINE-E05-20260826`
- `domain_engine_id`: `manufacturing_readiness`
- `status`: `candidate`
- `claim_ceiling`: `source_supported` at most
- `execution_mode`: `deterministic_only`
- `observed_at`: `2026-08-26`

## Purpose and boundary

This packet supplies a public-safe, source-bound input for a deterministic
manufacturing-readiness assessment.  It asks one bounded question:

> Do the supplied, revision-pinned facts support an Owner review of whether a
> bounded build may start?

It does not approve design, accept product, interpret a contract, release a
work order, confirm ERP inventory, authorize an inspection result, or start
production.  A `build_start_evidence_ready_for_owner_review` result means only
that under one exact Project Binding, every applicable facet is present and
`criteria_met`, any non-applicable facet has a bounded basis reference, at least
one facet is applicable, and no missing, unknown, or conflict gaps exist in the
supplied synthetic or bound facts. Not every declared facet need be applicable
or evidenced.

Every project applicability statement is `UNKNOWN/HOLD` until its Project
Binding identifies the governing instrument, source revisions, scope, and
authorized roles.  This packet never turns NASA applicability into a general
commercial or project obligation.

## Source authority and access inventory

| source_id | authority and exact revision | observed status/access | direct public locations | bounded use | project applicability |
| --- | --- | --- | --- | --- | --- |
| `S1-NASA-8739.6B` | NASA-STD-8739.6B, Change 0, approved 2021-02-04; NASA OSMA | NASA standards page reported `ACTIVE`; `Internet Public`; status observed 2026-08-26 | [metadata](https://standards.nasa.gov/standard/NASA/NASA-STD-87396), [body PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/nasa-std-87396b.pdf) | Manufacturing documentation, approved instructions, process/material/tool/equipment definition, personnel training, inspection and controlled material handling. | NASA facilities by default; others only where an applicable contract, grant, or agreement references it. Otherwise `UNKNOWN/HOLD`. |
| `S2-NASA-8739.12A` | NASA-STD-8739.12 Revision A, approved 2024-11-20; NASA OSMA | NASA standards page reported `ACTIVE`; `Internet Public`; status observed 2026-08-26 | [metadata](https://standards.nasa.gov/standard/NASA/NASA-STD-873912), [body PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/Revision/0/NASA-STD-873912A.pdf) | Measuring and test equipment selection, calibration, traceability, and records where quantitative accuracy is required. | NASA facilities by default; contractors only where a binding instrument specifies it. Otherwise `UNKNOWN/HOLD`. |
| `S3-NASA-8739.14` | NASA-STD-8739.14 Baseline, approved 2020-06-02; NASA OSMA | NASA standards page reported `ACTIVE`; `Internet Public`; status observed 2026-08-26 | [metadata](https://standards.nasa.gov/standard/NASA/NASA-STD-873914), [body PDF](https://standards.nasa.gov/sites/default/files/standards/NASA/Baseline/0/nasa-std-873914.pdf) | A narrow material-readiness illustration: procurement, receiving inspection, traceability, handling, and storage for fasteners. | NASA mission hardware when invoked by higher-level requirements or procurement. It is not a generic material-availability rule. |
| `S4-DOD-MRL-2025` | OUSD(R&E) announcement of the 2025 Manufacturing Readiness Level Deskbook; the separately linked 2020 deskbook is legacy guidance, not a 2025 body | Official OUSD(R&E) page observed a newer 2025 release. The automated task did not pin the 2025 body bytes. | [official 2025 announcement](https://www.cto.mil/sea/news/), [legacy 2020 guidance](https://www.dodmrl.com/MRL%20Deskbook%20V2020.pdf) | Retrieval/guidance taxonomy only; it does not create an executable rule in this package. | No project applicability or compliance claim. |

The exact source inventory is also available in
[`manufacturing_readiness_source_inventory_candidate_v1.json`](manufacturing_readiness_source_inventory_candidate_v1.json).

## Source-direct derivation

The following rules preserve the source boundary.  “Engine projection” is a
typed evidence check, not a paraphrased legal or technical requirement.

| rule_id | facet | direct source locator | bounded source-derived activity | engine projection and HOLD condition |
| --- | --- | --- | --- | --- |
| `MR-DOC-01` | drawings | S1 §§4.1.2, 4.1.4-4.1.5 | Manufacturing documentation addresses design/process/quality requirements; work follows approved manufacturing instructions. | Require a revision-pinned drawing/document release fact and a recorded evaluation. Missing or unresolved revision agreement is `gap_unknown`; this is not design approval. |
| `MR-BOM-01` | BOM | S1 §4.1.4; Owner task scope | S1 requires documented definition of parts and materials. | The BOM is an engine-specific projection for a declared parts/material list and revision agreement. S1 does not use the term “BOM”; this package does not infer procurement, inventory quantity, or design approval. |
| `MR-PROC-01` | processes | S1 §§4.1.4-4.1.7 | Documented processes/procedures are distinct from standards, and work follows approved instructions. | Require a pinned process/procedure evidence fact and evaluated result; an unpublished or unstated procedure remains `gap_unknown`. |
| `MR-TOOL-01` | tooling | S1 §§4.1.4, 6.4.1-6.4.2; S2 §§4.1-4.2 | Processes define tooling/equipment; tools and instruments must be appropriate, maintained, and controlled; MTE control depends on applicability. | Require declared tool/equipment prerequisites with known suitability and, where the binding requires it, calibration evidence. No calibration rule is applied without the bound scope. |
| `MR-WI-01` | work instructions | S1 §§4.1.2, 4.1.5, 4.1.7 | Operators follow approved manufacturing instructions, and standards are not a substitute for procedures. | Require an approved instruction/work-order/traveler fact for the bounded build. Missing instructions cannot be filled by a RAG answer. |
| `MR-PE-01` | personnel and equipment prerequisites | S1 §§5.2, 5.14; S2 Appendix A | Relevant workmanship personnel are trained; MTE is used where measurement accuracy matters. | Require role-specific qualification and required equipment-prerequisite facts. The engine neither certifies personnel nor assigns them. |
| `MR-INSP-01` | inspections | S1 §§4.1.2, 6.6; S2 Appendix A | Required in-process/post-production inspection and test points are performed/recorded within source scope; MTE may be required for accurate inspection/test. | Require an inspection-plan/readiness fact and an evaluated state. The engine does not accept product or judge quality conformity. |
| `MR-MAT-01` | materials | S1 §§4.1.4, 4.3, 6.3, 6.5; S3 §§4.4-4.6 | Processes define material controls; nonstandard parts/materials need prior review in scope; S3 illustrates procurement/receiving/traceability/storage for fasteners. | Require a material readiness fact with its own source/ERP binding. The engine reports the supplied evidence state only and never asserts stock, receipt, or supplier acceptance. |

## Vocabulary and source gaps

The executable vocabulary is closed to the eight task-authorized facets:
`drawings`, `bom`, `processes`, `tooling`, `work_instructions`,
`personnel_and_equipment`, `inspections`, and `materials`.

The engine deliberately does not create a public generic token for a drawing,
BOM, work order, calibration certificate, material lot, ERP row, inspection
record, training credential, or approval.  Each is an exact reference in a
future Project Binding or Typed Project Facts packet.

Paid or controlled bodies, including IPC, ISO, ANSI/ESD, and SAE material,
calibration, or workmanship bodies, were not accessed or reproduced.  A rule
that needs their body text is `HOLD`; a NASA citation to one of them is not a
substitute for the protected body.

## Retrieval boundary

RAG may help locate a candidate source or evidence reference.  It may not:

- create a facet, source revision, applicability decision, authority binding,
  evaluation result, or build-start verdict;
- substitute for an approved instruction, drawing, BOM, process, inspection,
  personnel qualification, equipment record, or material fact;
- provide source-body text to public fixtures, receipts, or this packet.

When direct source or project-binding evidence is absent, stale, inaccessible,
or contradictory, the applicable facet is `gap_unknown` or `gap_conflict`.

## Non-authorities and stop conditions

This package is not an ERP, PLM, QMS, MES, supplier system, design authority,
quality acceptance authority, material review board, calibration authority, or
production release system.  It stops at `UNKNOWN/HOLD` when a needed project
binding, source revision, accepted rule, authority, or evaluated fact is not
present.  Its output is a deterministic assessment receipt with all external
effect counters set to zero.
