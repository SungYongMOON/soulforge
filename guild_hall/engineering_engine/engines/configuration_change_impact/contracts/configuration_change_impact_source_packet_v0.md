# Configuration Change Impact Source Packet v0

- `domain_engine_id`: `configuration_change_impact`
- `status`: `candidate_source_packet`
- `claim_ceiling`: `source_supported` at most
- `execution_boundary`: deterministic assessment of supplied Core-bound typed facts only
- `project_applicability`: `UNKNOWN/HOLD` until an exact project binding names its governing change-control process and authority
- `compliance_or_release_authority`: none

This packet is a public-safe, short-paraphrase research input for the Configuration
Change Impact Domain Engine. It does not create a configuration-management procedure,
approve a change, release a baseline, or determine a project's contractual obligations.
It contains no source body, project data, credentials, controlled standard text, or raw
retrieval transcript.

## 1. Direct-source inventory

| source_ref | authority and exact revision/access state | direct official locator | bounded use in this package | applicability boundary |
| --- | --- | --- | --- | --- |
| `S1-NASA-SEH-REV2` | NASA Office of the Chief Engineer, *NASA Systems Engineering Handbook*, `NASA/SP-2016-6105 Rev 2`, publication date `2017-02-17`; NTRS document `20170001761`; distribution `Public` and public use permitted. This handbook states it is guidance, not a directive. | [NASA handbook PDF](https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf) and [NTRS record](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20170001761.pdf) | Section 6.5.1.2.3: controlled change proposal, evaluation, approval, implementation, verification, final-document release, and closure. | General NASA engineering guidance only; it does not bind a non-NASA project or authorize a CCB decision. |
| `S2-NASA-SEH-WEB-6.2` | NASA public web edition, *6.2 Requirements Management*, retrieved `2026-08-26`. The public page does not expose an independent revision identifier; this is recorded as `UNVERSIONED_WEB_PRESENTATION`, not silently treated as a newer handbook revision. | [NASA §6.2](https://www.nasa.gov/reference/6-2-requirements-management/) | Requirements-baseline change impact, bidirectional traceability, impact review, CCB/equivalent approval, dissemination, and affected-document updates. | Guidance only; project requirements authority, CCB composition, and document system remain project-bound. |
| `S3-NASA-SEH-WEB-6.3` | NASA public web edition, *6.3 Interface Management*, retrieved `2026-08-26`; independent page revision is not published and remains `UNVERSIONED_WEB_PRESENTATION`. | [NASA §6.3](https://www.nasa.gov/reference/6-3-interface-management/) | Interface changes, interface-control documentation, drawings/parts-list context, and the relationship to verification/test plans. | Guidance only; an interface party's approval and change procedure must be explicitly bound. |
| `S4-NASA-SWE-053-VER-D` | NASA Software Engineering Handbook, `SWE-053 Manage Requirements Changes`, Version `D`, public web presentation retrieved `2026-08-26`. | [NASA SWE-053](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695435/SWE-053%2B-%2BManage%2BRequirements%2BChanges) | Configuration-managed lifecycle artifacts, cross-discipline impact review, updated/regression testing, and retained closure evidence. | Guidance only; it does not create software-release, test-pass, or defect-closure authority. |

### Revision and access rule

1. `S1` is revision-pinned. A later handbook revision is a new candidate source, not an automatic update.
2. `S2` and `S3` are direct official access surfaces, but their page-level revisions are not published. A changed page, inaccessible page, or disagreement with `S1` makes the related guidance mapping `UNKNOWN/HOLD` pending source review.
3. No paid or controlled body was accessed. ISO, SAE, ASME, IPC, contract text, customer documentation, and project change-board records are outside this packet.
4. Public access proves inspectability of the cited guidance; it does not prove project applicability, compliance, approval, or acceptance.

## 2. Source-direct derivation

| derivation_id | source support | public-safe derived behavior | fail-closed boundary |
| --- | --- | --- | --- |
| `D-CCI-01` | `S1` §6.5.1.2.3 and `S2` §§6.2.1.2.2-6.2.1.2.3 | A controlled change needs an explicit identifier, change-request reference, pre-change baseline/revision, and target post-change revision before its impact record can be assessed. | Missing change or revision identity is not inferred from a document name, RAG result, or revision-like string. |
| `D-CCI-02` | `S2` §§6.2.1.2.2-6.2.1.2.3, `S3` §§6.3.1.2.2-6.3.1.3 | A change-impact record must explicitly cover requirements, interfaces, related design/technical documentation, and verification implications. The engine's `bom` token is a generic parts-list/part-selection category; it is not claimed to be a source-native mandatory term. | Omitted, duplicate, unknown, or conflicting impact categories remain unresolved; the evaluator never fills them from adjacent categories. |
| `D-CCI-03` | `S1` §6.5.1.2.3, `S2` §§6.2.1.2.3 and 6.2.1.3 | Approval/decision evidence and updates to affected documentation are distinct from the initial impact analysis and must be represented separately. | An evidence reference cannot impersonate an approval decision, and an approved decision does not prove propagation or verification. |
| `D-CCI-04` | `S3` §§6.3.1.2.3-6.3.1.3 and `S4` §§5-7 | Changed interfaces and software-related lifecycle products require verification/test consideration; closure evidence must remain retrievable, linked to the change, and traceable through the explicit propagated relationship path. | A closed change with unrelated, pending, unknown, or conflicting evidence is refused rather than treated as complete. |
| `D-CCI-05` | `S2` §§6.2.1.2.2-6.2.1.2.3 and `S3` §§6.3.1.2.2-6.3.1.3 | Explicit traceability and controlled interface relationships can be represented as caller-supplied typed dependency facts, then traversed deterministically from the changed item. This graph algorithm is an implementation method, not a source-native mandatory data model. | An incomplete, dangling, duplicate, unordered, or contradictory dependency graph cannot prove an unaffected category or a closed change. |

## 3. Rule projection

| rule_id | derived check | source basis | result boundary |
| --- | --- | --- | --- |
| `CCI-CHANGE-01` | Controlled change identity, request reference, pre-change baseline/revision, and target post-change revision are explicit. | `D-CCI-01` | Missing or self-substituted identity/binding is a refused input, never a satisfied change. |
| `CCI-IMPACT-02` | Exactly one record exists for each declared impact category and each record carries an explicit state. | `D-CCI-02` | Any unknown/conflict keeps the overall result on `hold`; category coverage is not guessed. |
| `CCI-APPROVAL-03` | The change decision is separately supplied and can be approved, pending, rejected, or unknown. | `D-CCI-03` | The engine reports facts; it does not grant or modify approval. |
| `CCI-CLOSURE-04` | A closure claim is accepted only when the decision and every impact record support it, including change-bound closure evidence and propagated relationship paths. | `D-CCI-04` | Closed-with-open-impact or unrelated evidence is a contract refusal; a valid open change remains a non-release result. |
| `CCI-PROPAGATION-05` | Directed dependency edges are traversed from explicit seed items to produce the affected-item projection and shortest trace paths. | `D-CCI-05` | The engine does not invent missing relationships; an incomplete graph remains a hold. |

## 4. RAG and project-data boundary

RAG or search may help a human find source locators, but neither retrieved text nor a model
answer enters the compiler or evaluator. The runtime accepts only explicit Core-bound typed facts
with package-checked project/Profile/change identity. It performs no network access, source fetching, file read/write, ERP action,
baseline mutation, change-board action, document release, approval, notification, or task
creation. Project-specific change, BOM, drawing, software, interface, test, document, and
baseline payloads remain outside this public package.

## 5. Open boundaries and owner decisions

- The exact project configuration-management plan, change authority, baseline definition,
  item identifiers, lifecycle gates, and closure criteria must be bound by the project owner.
- A project may define more impact classes or a different evidence structure. That is a
  Profile/domain-rule extension decision, not a reason to silently widen this fixed vocabulary.
- This package produces a source-supported candidate assessment only. Human authority retains
  approval, release, implementation, verification acceptance, baseline establishment, and
  closure.
