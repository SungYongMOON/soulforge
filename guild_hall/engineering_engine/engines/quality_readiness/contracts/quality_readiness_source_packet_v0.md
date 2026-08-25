# Quality Readiness Source Packet v0

- `mission_id`: `E01-R-01-quality-source-packet`
- `role`: `quality_researcher`
- `output_state`: `draft_source_packet`
- `status`: `DRAFT`
- `canon_claim_ceiling`: `source_supported` at most
- `applicability_approval`: `false`
- `compliance_approval`: `false`
- `quality_acceptance`: `false`
- `source_adoption`: `false`
- `implementation_scope`: none; this packet is implementation input only

This packet is a small, public-safe research input for a quality-readiness rule pack and
adapter. It does not create a second kernel. It proposes reuse of the existing
`engineering_engine` rule-pack/compiler, exact module binding, authority, finding, and
read-only assessment seams. Three selected documents are not a sufficient quality corpus by
count, and no row below establishes project applicability merely because its source is public
or current.

## 1. Source and applicability matrix

`S1`, `S2`, and `S3` are the three selected documents. Metadata, status, and body refs are
separated where the official publisher separates them. A metadata fact is not used as a body
claim.

| source_ref | exact document ID and title | revision/date basis | current status receipt | public/access class | exact official URL/ref | chosen body scope and locator | governing/source owner | project applicability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S1-MIL-STD-1916` | `MIL-STD-1916`, *DOD Preferred Methods for Acceptance of Product* | Base document `01-APR-1996`; current status action is `Notice 2 - Reactivation`, `05-JUN-2014`; ASSIST metadata `Document Date: 05-JUN-2014` | ASSIST page says `Status: Active`; page also displayed `Data updated: 21 Aug 2026`. The elapsed `Next Review Due: 04-JUN-2019` is recorded but is not treated as cancellation. | Revision-history rows are `Dist Stmt A`; base body says approved for public release, distribution unlimited. | Metadata: <https://quicksearch.dla.mil/qaDocDetails.aspx?ident_number=120287>; base body redirect: <https://quicksearch.dla.mil/ImageRedirector.aspx?token=41416.120287>; status notice: <https://quicksearch.dla.mil/ImageRedirector.aspx?token=5730603.120287> | §§1.1-1.5, 4.1-4.5, 5.1-5.1.4.3. Sampling tables and numerical plan execution are outside this packet. | ASSIST records lead/preparing activity `AR`, U.S. Army Combat Capabilities Development Command, Armaments Center; DLA ASSIST is the official metadata/body host. | The body §1.2 makes it applicable when referenced by the contract, specification, or purchase order. For any Soulforge project, invocation and flow-down are `UNKNOWN/HOLD` until an exact project binding proves them. |
| `S2-FAR-46` | `FAR Part 46`, *Quality Assurance* | Current FAR publication baseline `FAC 2026-01`, effective `03/13/2026`. This is the site-wide FAC locator; this packet does not claim that FAC 2026-01 amended Part 46 specifically. | Official current HTML under the stated FAC; Acquisition.gov does not display a separate active/cancelled flag for Part 46. | Official U.S. Government public HTML. | FAC index: <https://www.acquisition.gov/browse/index/far>; body: <https://www.acquisition.gov/far/part-46>; authority: <https://www.acquisition.gov/far/1.103>; applicability: <https://www.acquisition.gov/far/1.104> | §§46.000, 46.101-46.105, 46.201-46.203, 46.401, 46.407, 46.501-46.502. | FAR 1.103 says the FAR is jointly prepared, issued, maintained, and prescribed by the Secretary of Defense, Administrator of General Services, and Administrator of NASA; Acquisition.gov is the GSA official publication host. | FAR 1.104 says FAR applies to acquisitions as defined in FAR Part 2 except where expressly excluded. Whether a Soulforge project is such an acquisition, and which clauses govern it, remains `UNKNOWN/HOLD` without the exact contract and jurisdiction binding. |
| `S3-NASA-STD-8739.6B` | `NASA-STD-8739.6B`, *Implementation Requirements for NASA Workmanship Standards* | Version `B`, Change `0`, document/approval date `2021-02-04`; supersedes `NASA-STD-8739.6A with Change 1` | NASA metadata says `ACTIVE`, `NASA Mandatory Standard`, effective `2021-02-04`. The metadata's next five-year review date is `2026-02-04`; its passage is not treated as supersession while the same official page says active. | Metadata says `Internet Public`; official PDF is directly downloadable. | Metadata: <https://standards.nasa.gov/standard/NASA/NASA-STD-87396>; body: <https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/nasa-std-87396b.pdf> | §§1.1-1.3, 2.1, 4.1-4.3, 5.4, 6.6, 6.8. Clauses whose operative baseline depends on paid ANSI/ESD, SAE, or IPC bodies are not converted here. | NASA metadata names `OSMA - Office of Safety and Mission Assurance`; the foreword names NASA OSMA and the NASA Workmanship Standards Program as developers. | Body §1.2.1 applies directly to NASA installations and to JPL, contractors, grant/cooperative-agreement recipients, or others only to the extent specified or referenced in the applicable instrument. Other projects are not made subject to it by this packet. |

### Revision policy

1. Implementation must pin the exact metadata/status ref and exact body revision; `latest` is
   forbidden.
2. A later ASSIST notice, FAC, NASA version/change, status change, access restriction, or body
   replacement creates a new candidate source binding. It does not silently modify this packet.
3. If status and body cannot both be re-resolved at binding time, the affected rule is
   `UNKNOWN/HOLD`; cached prose is not a fallback authority.
4. Public access supports inspection, not contract applicability or compliance authority.

## 2. Source-native claim rows

These are short paraphrases. They are not copied source bodies and they do not normalize the
three sources into a new quality doctrine.

| claim_id | source_ref | locator | source modality | source-native activity | source-native artifact or confirmation basis | bounded claim |
| --- | --- | --- | --- | --- | --- | --- |
| `C-S1-01` | `S1-MIL-STD-1916` | §1.2 | applicability is conditional; lower-tier extension is `should` | Apply the standard only through the invoking contract, specification, or purchase order; check whether the instrument recommends or requires lower-tier flow-down without promoting `should` to `shall`. | Exact invocation/flow-down terms. | Applicability is conditional, not inherent, and lower-tier flow-down remains advisory unless the invoking instrument makes it mandatory. |
| `C-S1-02` | `S1-MIL-STD-1916` | §§4.1.1-4.1.3 | operative requirements, conditional on proposing an alternate method | A contractor proposing an alternate acceptance method describes the method replaced, protection provided, process-control evidence, measurements, evaluation procedures, and periodic assessment; approval and incorporation follow the contracting route. | Alternate-method submission, process-control/capability evidence, assessment plan, approval/incorporation record. | Supports an alternate-acceptance evidence candidate only when the contract invokes the standard and the designated Government authority approves it. |
| `C-S1-03` | `S1-MIL-STD-1916` | §§5.1-5.1.3 | operative requirements under resolved invocation | Establish, document, maintain, update, and improve a prevention-based quality system with defined organization, responsibilities, procedures, processes, and resources; show that relevant processes are understood, controlled, documented, and improved. | Quality system plan plus implementation records. | The source names a quality-system plan; it does not prove that any project has one. |
| `C-S1-04` | `S1-MIL-STD-1916` | §§5.1.4.1-5.1.4.3 | implementation/effectiveness proof required; listed evidence types are examples | Demonstrate implementation and effectiveness using objective evidence concerning process improvement, process control, and product conformance. | Examples include process-flow/control-point charts, control plans and supporting data, training evidence, measurement studies, corrective-action traceability, control charts, capability studies, inspection history, and in-process results. | Evidence selection and evaluation criteria must be pinned; no listed example is automatically sufficient by itself. |
| `C-S1-05` | `S1-MIL-STD-1916` | §§4.3-4.5 | operative requirements, with critical-nonconformance branch conditions | Segregate nonconforming product; for a critical nonconformance, prevent delivery, notify the Government representative, identify cause, take corrective action, screen available units, and retain corrective-action records. | Segregation/identification evidence and source-native corrective-action records. | Supports a candidate for critical-nonconformance containment and evidence, subject to exact contract applicability. |
| `C-S2-01` | `S2-FAR-46` | §§46.000, 46.102-46.105 | mixed role-specific `shall`/`may`; contract terms determine exact duty | Put appropriate quality requirements in the contract; the contractor controls quality, tenders conforming supplies/services, manages supplier quality, performs required inspections/tests unless reserved, and maintains substantiating evidence when the contract requires it. | Contract quality requirements, contractor inspection/test evidence, and substantiating conformance evidence. | Applies within the FAR acquisition and contract context; it is not a general private-project rule. |
| `C-S2-02` | `S2-FAR-46` | §46.104(c) | Government role duty | The contract administration office maintains suitable performance records of Government quality-assurance actions and decisions about acceptability and corrective action. | Records of observations/defects, acceptability decisions, and defect-correction action. | This is a Government contract-administration record duty, not contractor acceptance authority. |
| `C-S2-03` | `S2-FAR-46` | §46.401(a),(f) | surveillance planning is `should`; Government inspection documentation is `shall` | Plan surveillance around work and method where appropriate; separately require the prescribed record when Government inspection is performed. | Quality-assurance surveillance plan; inspection or receiving report. | Advisory planning and mandatory inspection documentation are separate checks. |
| `C-S2-04` | `S2-FAR-46` | §46.407 | branch-specific `should`/`may`/`shall`; no single unconditional action | Evaluate correction, replacement, rejection, or exceptional acceptance only under the exact paragraph branch; retain each branch's modality and prerequisites. | Written nonconformance description, recommendation/rationale, concurrence, disposition, and contract-file documentation required by the selected branch. | Evidence does not itself authorize acceptance; authority remains with the named Government role and the engine must not collapse conditional branches. |
| `C-S2-05` | `S2-FAR-46` | §§46.501-46.502 | ordinary acceptance path with stated exceptions and agency procedure | After required Government quality-assurance actions, evidence ordinary acceptance by the certificate/report required for the resolved contract and agency procedure; the contracting officer or properly assigned office owns acceptance. | Executed acceptance certificate when that path applies; the §46.401(f) Government inspection record is tracked separately. | Supports a conditional acceptance-record candidate, never an unconditional certificate requirement or engine acceptance verdict. |
| `C-S3-01` | `S3-NASA-STD-8739.6B` | §§1.2.1-1.2.3 | applicability is conditional; §1.2.3 referral is `should` | Resolve whether the standard is flowed to the organization or procurement; preserve risk-management duties separately from the advisory referral of procurement applicability questions. | Applicable contract/grant/agreement reference and risk-management basis. | External applicability is conditional and authority-bound; the advisory referral is not promoted to a mandatory gate. |
| `C-S3-02` | `S3-NASA-STD-8739.6B` | §§1.3.1-1.3.2 | operative approval/documentation requirements | Formally document and approve project/Center-specific workmanship requirements; document, approve, and trace conflicts to relief before implementation. | Approved special requirement or relief trace. | The source's NASA approval route cannot be replaced by an engine rule. |
| `C-S3-03` | `S3-NASA-STD-8739.6B` | §§4.1.2-4.1.5 | §4.1.2 is descriptive context; §§4.1.4-4.1.5 contain the operative `shall` duties | Use §4.1.2 only as context; separately require documented processes/procedures and work to approved manufacturing instructions under §§4.1.4-4.1.5. | Documented processes/procedures and approved manufacturing instructions; control, inspection, test, and data records remain contextual unless another operative clause is pinned. | Only the operative `shall` clauses may become mandatory candidates, and only within resolved NASA applicability. |
| `C-S3-04` | `S3-NASA-STD-8739.6B` | §4.1.6 | operative stop-work requirement | Stop workmanship at the next viable point when a condition may damage hardware until it is reviewed, documented, and resolved. | Condition review, documentation, and resolution evidence. | Candidate stop-work readiness check; no engine authority to resume work. |
| `C-S3-05` | `S3-NASA-STD-8739.6B` | §§4.3.1-4.3.2 | operative prior-review/approval requirements | Review and approve alternate/nonstandard configurations, processes, parts, or materials before use; the request includes fabrication/inspection details, acceptance/rejection criteria, and objective reliability evidence. | Approval request, fabrication/inspection method, criteria, and test-data/flight-history/analysis evidence. | Candidate evidence bundle only; authorized NASA/project roles decide approval. |
| `C-S3-06` | `S3-NASA-STD-8739.6B` | §§5.4.1-5.4.2 | operative retention and reviewability requirements | Retain supplier training records for at least five years and make evidence of training within the prior 24 months reviewable by projects and auditors. | Source-native training record and current training evidence. | Supports personnel-evidence readiness within the standard's scope; no current token is asserted. |
| `C-S3-07` | `S3-NASA-STD-8739.6B` | §§6.6.1, 6.8.1-6.8.2 | operative scope-specific inspection/rework/repair requirements | Visually inspect the named mission-hardware assemblies to the applicable workmanship criteria without product sampling; record rework and its nonconformance, and obtain prior MRB review/approval for repair that does not restore full conformity. | Inspection record, rework/nonconformance record, or MRB repair approval. | This is NASA mission-hardware workmanship scope. It must not be generalized to all products or used to override an exact contract without authority resolution. |

## 3. Current Soulforge artifact-vocabulary links

Only tokens already present in
`guild_hall/engineering_engine/stage_rules/artifact_vocabulary.mjs` are named.
A token is linked only to the bounded portion that has the same semantics; the packet does not
publish a synonym or new vocabulary.

| source claim and locator | existing token | exact-match boundary |
| --- | --- | --- |
| `C-S1-04`, MIL-STD-1916 §5.1.4.1(a), process-flow charts showing control points | `manufacturing_process_flow` | Match is limited to the process-flow artifact, not the whole quality system. |
| `C-S2-05`, FAR §§46.501-46.502, executed acceptance certificate/report | `delivery_acceptance_record` | Match is the delivery/acceptance record only. The token does not confer acceptance authority. |

No exact current token was found for the source-native `quality system plan`, generic corrective-
action record, generic Government quality-assurance action record, generic inspection record,
general manufacturing procedure/instruction, training record, relief decision, or MRB repair
approval. They remain source-native evidence descriptions with `artifact_token: null`. In
particular, a generic corrective-action record is not `defect_action_report`, a general NASA
manufacturing instruction is not necessarily `wps`, and a training record is not the composite
`training_material` token. Mapping any of them to `qa_plan`, a gate-specific review result, or
another near-synonym would be semantic promotion and is therefore `HOLD` pending vocabulary-owner
review. This packet does not request or authorize such a vocabulary change.

## 4. Proposed minimal rule candidates

These rows are implementation candidates, not adopted rules. `applicability` is a gate, not a
post-hoc annotation. `authority_family` uses only the existing authority-family keys; a
conditional value is not resolved until its stated condition is proven.

| rule_candidate | source_ref | locator | source modality | activity | expected_artifact_or_evidence | applicability | authority_family | claim_ceiling | `UNKNOWN/HOLD` condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `QR-MIL-01` | `S1-MIL-STD-1916` | §§1.2, 5.1-5.1.3 | operative requirements only after exact invocation; §1.2 flow-down `should` remains advisory | Establish and maintain the invoked prevention-based quality system. | Source-native quality system plan; `artifact_token: null`. | Exact contract/specification/purchase-order invocation establishes the scoped prime-contractor rule. A lower-tier subject is applicable only when its own binding instrument proves extension; absence of the advisory extension does not block the prime rule. | `project_contract_baseline` only after the applicable invocation; otherwise unresolved. | `source_supported` at most | Prime subject: no exact invocation, revision, or product scope -> `UNKNOWN/HOLD`. Lower-tier subject: no exact lower-tier binding terms -> lower-tier `UNKNOWN/HOLD` only. |
| `QR-MIL-02` | `S1-MIL-STD-1916` | §§5.1.4.1-5.1.4.3 | effectiveness proof required; evidence examples are non-exhaustive and not individually mandatory | Evaluate objective evidence that process controls are implemented and effective using a pinned evidence selection, measurement basis, and evaluation result. | `manufacturing_process_flow` for its exact subset; all corrective-action and other evidence stays source-native with `artifact_token: null` unless separately mapped. | Use the prime-versus-lower-tier invocation split from `QR-MIL-01`; the approved method/plan must also pin evidence selection and evaluation criteria. | `project_contract_baseline` only after the applicable invocation; otherwise unresolved. | `source_supported` at most | Applicable invocation, approved evidence selection, measurement/evaluation criteria, or evaluated effectiveness result absent -> `UNKNOWN/HOLD`; artifact presence alone cannot satisfy. |
| `QR-MIL-03` | `S1-MIL-STD-1916` | §§4.3-4.5 | operative requirements with critical-nonconformance branch conditions | Contain nonconforming product and execute/record critical corrective action. | Source-native segregation, Government-notification, cause, corrective-action, screening, and retained-record evidence; `artifact_token: null`. | Only for applicable product/characteristic and the contractually designated Government route. | `project_contract_baseline` only after invocation; otherwise unresolved. | `source_supported` at most | Criticality, Government representative, disposition authority, or record scope unknown -> `UNKNOWN/HOLD`; never infer acceptance. |
| `QR-FAR-01` | `S2-FAR-46` | §§46.103-46.105, 46.201-46.203 | role- and clause-specific duties; exact contract controls | Bind contract quality requirements, contractor quality controls, inspection/test duties, and required substantiating evidence. | Exact contract clauses and source-native inspection/test/conformance evidence; `artifact_token: null` for a generic inspection system. | FAR jurisdiction plus exact solicitation/contract clauses and agency allocation of duties must be known. | `applicable_law_and_regulation` only when FAR applicability is resolved; contract-specific obligations also bind as `project_contract_baseline`. | `source_supported` at most | Jurisdiction, clause set, item complexity/criticality, reserved Government tests, or responsible office unknown -> `UNKNOWN/HOLD`. |
| `QR-FAR-02` | `S2-FAR-46` | §§46.104(c), 46.401(f), 46.501-46.502 | §46.401(f) inspection documentation is mandatory; ordinary acceptance-certificate path is conditional on exact procedure and exceptions | Separately check the Government inspection record and, only when the resolved contract/agency path requires it, the authorized acceptance certificate. | §46.401(f) inspection/receiving or commercial document stays source-native; `delivery_acceptance_record` maps only to the resolved §§46.501-46.502 acceptance path. | Exact contract administration, agency procedure, exceptions, and acceptance delegation must identify the applicable path and responsible office/role. | `applicable_law_and_regulation` plus resolved `project_contract_baseline`. | `source_supported` at most | Applicable record path, authorized role, completion of quality-assurance action, or executed required record unresolved -> `UNKNOWN/HOLD`; evidence alone cannot set `accepted`. |
| `QR-FAR-03` | `S2-FAR-46` | §46.407 | preserve branch-specific `should`/`may`/`shall` and prerequisites | Evaluate only the selected correction, replacement, rejection, or exceptional-acceptance branch without collapsing it into one mandatory workflow. | Written description, rationale, concurrence, disposition, and contract-file evidence required by that branch; `artifact_token: null`. | Exact FAR contract, selected paragraph branch, nonconformance class, and contracting/technical authority required. | `applicable_law_and_regulation` plus resolved `project_contract_baseline`. | `source_supported` at most | Branch, criticality/class, concurrence, price/contract action, or authority missing/conflicting -> authority `HOLD`. The engine may report evidence gaps only. |
| `QR-NASA-01` | `S3-NASA-STD-8739.6B` | §§1.2-1.3, 4.1.2-4.1.5 | §1.2.3 referral remains advisory; §4.1.2 is context; only §§4.1.4-4.1.5 operative duties become checks | Under resolved flow-down, check documented processes/procedures and work to approved manufacturing instructions. | General manufacturing procedures and instructions remain source-native with `artifact_token: null`; §4.1.2 control/inspection/test/data records remain contextual unless another operative clause is pinned. | NASA installation scope or exact contract/grant/agreement reference and any tailoring/relief must be pinned. | `project_contract_baseline` after exact flow-down; without flow-down it is at most `general_se_guidance`. | `source_supported` at most | Flow-down, special requirement, relief, responsible SMA/quality authority, or applicable Table 1 baseline unknown -> `UNKNOWN/HOLD`. |
| `QR-NASA-02` | `S3-NASA-STD-8739.6B` | §§4.1.6, 4.3.1-4.3.2 | operative stop-work and prior-approval requirements | Stop on a potential damage condition and obtain prior review/approval for nonstandard work with objective evidence. | Condition/resolution record and nonstandard approval request; `artifact_token: null`. | Same NASA/contract applicability gate; the approved stop/resume and technical-authority route must be known. | `project_contract_baseline` after exact flow-down; otherwise `general_se_guidance`. | `source_supported` at most | Damage condition unresolved, objective evidence absent, or reviewer/approver not authorized -> `UNKNOWN/HOLD`; engine cannot resume work. |
| `QR-NASA-03` | `S3-NASA-STD-8739.6B` | §§5.4, 6.6.1, 6.8.1-6.8.2 | operative, scope-specific retention/inspection/rework/repair requirements | Check source-native current training evidence, required visual inspection evidence, and rework/repair records. | Training, inspection, rework, and MRB evidence remains un-tokenized with `artifact_token: null`. | Exact hardware type, applicable workmanship baseline, personnel role, and NASA/project authority must be known. | `project_contract_baseline` after exact flow-down; otherwise `general_se_guidance`. | `source_supported` at most | Paid referenced-body criteria are needed, hardware scope is not one named by the clause, training window is unresolved, or MRB authority is missing -> `UNKNOWN/HOLD`. |

## 5. Source gaps, blockers, and Owner decisions

### Gaps and `HOLD`

| gap_id | state | exact boundary |
| --- | --- | --- |
| `G-01-AQAP` | `HOLD` | AQAP-2105 was intentionally not researched further in this revision. No current official revision/body/applicability claim or rule is made. |
| `G-02-DTAQ-DAPA` | `HOLD` | DTaQ/DAPA body-level material was intentionally not researched further. Existing public-safe registry metadata identifies HWP/HWP-like and source-body blockers; metadata/index presence is not body authority. |
| `G-03-PAID-BODIES` | `HOLD` | ISO, SAE, IPC, ANSI/ESD, AS9100-family and other paid/controlled bodies were not accessed or copied. NASA clauses that require their operative acceptance/defect criteria cannot be expanded from NASA's references alone. |
| `G-04-CONTRACTS` | `UNKNOWN/HOLD` | No project contract, RFP, SOW, CDRL, clause set, grant/agreement, tailoring, waiver/relief, or delegation was supplied. Project applicability is therefore unresolved for all candidate rules. |
| `G-05-VOCABULARY` | `HOLD` | Several source-native records have no exact existing artifact token. Near-synonyms are not mapped and no vocabulary is issued. |
| `G-06-REVISION` | `HOLD on drift` | ASSIST has an active revision project and overdue review metadata; NASA's listed review date has passed; FAR can advance by FAC. The currently observed status is recorded, but any changed metadata/body at implementation binding requires fresh review. |
| `G-07-SUFFICIENCY` | `UNKNOWN` | Three selected sources cover prevention/process evidence, U.S. Federal contract quality administration, and NASA electronics workmanship. They do not establish full supplier-quality, software-quality, metrology, calibration, counterfeit, configuration, audit, production, or domain acceptance coverage. |

Source counts, private index counts, and chunk counts are not sufficiency or compliance evidence.
No HWP body, paid body, private index chunk, internal/LIG content, project payload, credential,
or raw source transcript is included.

### Owner decisions required before implementation or use

1. `OD-01`: identify the exact project/jurisdiction/contract instrument and source revisions that
   govern, including flow-down, tailoring, waiver/relief, and precedence.
2. `OD-02`: name data, source-applicability, and acceptance owners and the exact authority
   delegation for nonconformance, MRB/repair, and product/service acceptance.
3. `OD-03`: approve or reject each candidate row and its modality; do not adopt the packet by
   bulk source count.
4. `OD-04`: decide whether missing source-native record types warrant vocabulary-owner review;
   this packet supplies no default token.
5. `OD-05`: decide whether and through what authorized channel AQAP or DTaQ/DAPA body work may
   resume; until then keep both gaps on `HOLD`.
6. `OD-06`: fix an exact common assessment-port revision and exact module/rule/source bindings
   before implementation.

## 6. E01 decision, non-authorities, and assessment-port projection

### One decision question

> 단계별 품질 활동·산출물·수락 근거가 충분한가?

The answer is a bounded readiness assessment against an exact binding. It is not a statement
that a product complies, is acceptable, or may be delivered.

### Explicit non-authorities

E01 is not the owner of source applicability, contract interpretation, technical requirements,
quality acceptance, compliance/certification, audit conclusions, nonconformance disposition,
MRB/repair approval, waiver/relief, product release, canon adoption, Official Task creation,
ERP mutation, or any external write. A receipt proves an observed assessment run, not human or
contracting authority. Missing evidence is not automatically noncompliance, and observed
evidence is not automatically satisfaction when applicability or authority is unresolved.

### Proposed common `EngineAssessmentPort` projection

Reuse the read-only family seam from the Owner-approved research program:

```text
assessEngine({ manifest, binding, domain_input, cutoffs }, adapter)
  -> { assessment, domain_result, receipt }
```

This packet proposes, but does not implement, the following Revision Gate 1 E01 projection:

- `binding`: exact `engine_ref`, `project_binding_ref`, `objective_ref`, `policy_ref`,
  `source_packet_ref`, and `snapshot_ref`; accepted generation; exact module/adapter/ruleset
  revisions; exactly three sorted source bindings (`S1-MIL-STD-1916`, `S2-FAR-46`, and
  `S3-NASA-STD-8739.6B`), each with distinct exact metadata and body revision refs; and sorted
  accepted rule bindings. Each accepted rule binding names the candidate `rule_id`, exact
  `stage_ref`, and exact `owner_acceptance_ref`. No floating revision text is allowed.
- `domain_input`: exact per-row `stage_ref`; all five applicability components; exact executable
  source-prerequisite context refs; typed authority bindings (`authority_family`, role,
  delegation, and decision refs); observation/presence/evidence metadata; and an evaluated
  outcome ref/state where a present non-conflict row reaches judgment. It carries refs/metadata,
  not source or project payloads. An explicit false applicability component also carries an exact
  `not_applicable_basis_ref`. Missing required context refs remain a bounded `gap_unknown`; they
  are not promoted to `gap_missing` or rejected as if an unavailable project fact were malformed.
- `domain_result`: one deterministic result per accepted rule binding with source ID/locator/
  modality, explicit artifact token or `null`, stage ref, prerequisites, typed authority bindings,
  applicability components, observed evidence, evaluated outcome, state, bounded reason, and
  explicit `canon_claim_ceiling` and `evidence_claim_ceiling` fields. A conflict retains every
  side plus the common authority record's governing family and resolution rationale.
- `assessment`: projects only the existing common gap states `satisfied`, `gap_missing`,
  `gap_unknown`, and `gap_conflict`; `not_applicable` requires an exact basis. New E01 output
  fields name both claim axes explicitly. The common manifest's bare `claim_ceiling` remains a
  compatibility-only canon `source_supported` field until its ABI owner decides otherwise.
- `receipt`: digests of input/domain result/assessment; exact execution, source, rule-stage-owner,
  and module/adapter bindings; deterministic counts; and observed effect counts. Default
  filesystem, network, model, ERP, task, and approval effects are all `0`.
- fail closed: an absent/disabled quality adapter, inaccessible source, stale binding, unknown
  applicability, unresolved conflict, or missing authority is not auto-replaced by another
  engine, an LLM, or a lower-authority source.

The quality-specific evaluator belongs behind an adapter/rule pack bound through the existing
`kernel/module_binding.mjs`. No second registry, common-kernel copy, domain MCP server, writer,
or quality truth ledger is proposed.

## 7. One public-synthetic fixture outline

Fixture ID: `quality_readiness_public_synthetic_v0`. All names and records are synthetic; it
contains no source body or project payload. One fixture contains five independent rows so the
same deterministic adapter exercises every required state.

| case | synthetic setup | expected projection | required assertion |
| --- | --- | --- | --- |
| `SATISFIED` | A synthetic U.S. Government supply contract pins `S1` base plus Notice 2 and the selected clauses. Its approved synthetic method pins `manufacturing_process_flow` as the selected evidence, names the measurement/evaluation criteria, supplies the resolvable evidence ref, and records an evaluated result that the criteria are met under the designated authority route. | `satisfied` for `QR-MIL-02` only | Means the candidate's approved evidence selection, criteria, observed evidence, and evaluated result are all present under a resolved synthetic binding; artifact presence alone is insufficient and no product acceptance/compliance is asserted. |
| `MISSING` | A synthetic FAR-covered contract pins FAC 2026-01, the agency procedure, the ordinary §§46.501-46.502 acceptance path, its exceptions as not applicable, and the authorized role. Required Government quality-assurance actions and the separate §46.401(f) inspection record are complete, but the exact path's required executed `delivery_acceptance_record` is absent. | `gap_missing` for the acceptance-record subcheck of `QR-FAR-02` | Missing is confirmed only because jurisdiction, procedure, exceptions, authority, completed actions, and the exact expected record are resolved; no acceptance status is inferred. |
| `UNKNOWN` | Synthetic NASA workmanship evidence exists, but the contract fixture omits whether NASA-STD-8739.6B was flowed down and omits the approval scope. | `gap_unknown` for `QR-NASA-01` | Unknown applicability cannot be converted to missing, satisfied, or not-applicable. |
| `CONFLICT` | The same synthetic hardware characteristic is bound to a contract sampling instruction derived from `S1` while an asserted `S3` flow-down requires the named mission-hardware visual inspection without product sampling; no precedence/tailoring/relief record is supplied. | `gap_conflict` | Retain both source claims and exact refs; do not pick a winner from document status or source count. |
| `AUTHORITY_HOLD` | A synthetic FAR §46.407 exceptional-acceptance branch is pinned for a major nonconformance and includes technical evidence plus a proposed disposition, but the fixture omits the authorized contracting-officer decision and required technical-concurrence refs. No competing authority claim is supplied. | domain flag `authority_hold: true` plus `gap_unknown` for `QR-FAR-03` | The missing authority fact has one deterministic projection; the adapter cannot accept, release, waive, close, or create a task. |

The fixture also asserts stable ordering, input immutability, exact counts, source modality
preservation, null handling for unmapped artifacts, typed authority/evidence separation, exact
execution/source/rule-stage-owner bindings, executable FAR/MIL/NASA prerequisites, evaluated
outcome behavior, no payload in receipts, and all external-effect counters equal zero.

## 8. Implementation acceptance and stop conditions

### Acceptance conditions for a later implementation leaf

A later implementation is acceptable for review only if all conditions hold:

1. It reuses the existing rule-pack/adapter and `module_binding.mjs` seams; no new common kernel,
   registry, writer, or truth owner appears.
2. Exact engine, objective, policy, snapshot, source-packet, project-binding, module, adapter,
   ruleset, cutoff, source metadata/body, and rule-stage-owner bindings are present. The three
   named sources are bound separately; all six metadata/body exact refs are globally distinct and
   are never interchangeable or floating.
3. The candidate table is accepted row-by-row through sorted exact rule/stage/Owner-acceptance
   bindings; unaccepted rows remain data, not executable requirements.
4. Applicability resolves all five existing components before a row can become `satisfied` or
   `gap_missing`; unknown remains unknown; false carries an exact not-applicable basis.
5. Artifact tokens validate against the existing vocabulary; `null` is retained when semantic
   identity is not exact. No adapter aliases by label similarity.
6. Modalities, typed required authority families, and exact prerequisite context refs are
   preserved. Evidence cannot satisfy an authority binding or confer contracting, MRB, NASA SMA,
   compliance, or acceptance authority. Role, delegation, and decision refs are mutually distinct
   and disjoint from observation, evidence, prerequisite, evaluation, stage, and acceptance refs.
7. Every present non-conflict row carries an exact evaluated outcome. Only `criteria_met` can
   satisfy; `criteria_not_met` conflicts; absent/unknown evaluation remains unknown. Confirmed
   absence has an exact observation attempt and may have no auxiliary evidence refs.
8. The one synthetic fixture deterministically proves `satisfied`, `gap_missing`, `gap_unknown`,
   `gap_conflict`, and authority `HOLD`, including hostile typed-authority, prerequisite,
   evaluated-outcome, floating-revision, prototype/accessor, and near-synonym cases. A retained
   source conflict cannot bypass missing prerequisite context or missing authority.
9. The common read-only assessment-port projection validates digests, counts, immutable input,
   deterministic ordering, exact bindings, explicit output claim axes, collision-free typed
   canonicalization of accepted values, and zero external effects.
10. Public tests and docs contain synthetic metadata only; source bodies, paid text, private
   chunks, project payload, credentials, raw transcripts, and hidden reasoning are absent.
11. Validation may support `source_supported` at most. Compliance, quality acceptance, source
    adoption, canon write, task creation, ERP write, commit, and push remain outside the leaf.

### Stop conditions

Stop and return exact `UNKNOWN/HOLD` without fallback when any of the following occurs:

- official revision, status, access class, body bytes, or governing owner cannot be resolved;
- an exact project applicability component or authority delegation is missing or contradictory;
- a rule depends on an unreviewed paid/controlled/HWP/internal body;
- only metadata or an index exists for a body-level claim;
- source clauses conflict and no exact precedence/tailoring/relief record resolves them;
- a source-native artifact lacks an exact current token;
- evidence is present but acceptance/disposition/resume authority is absent;
- an adapter, common-port revision, manifest, source binding, or test receipt is missing,
  incompatible, floating, or stale;
- implementation would require a second kernel/registry/writer, project payload in the public
  package, or any external side effect.

## 9. Inspected references and metadata receipt

### Repository/current-byte refs inspected

- `AGENTS.md`
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`
- `.registry/knowledge/defense_quality_management_standards/knowledge.yaml`
- `.registry/knowledge/defense_quality_management_standards/README.md`
- `guild_hall/engineering_engine/stage_rules/stage_rule_compiler.mjs`
- `guild_hall/engineering_engine/stage_rules/artifact_vocabulary.mjs`
- `guild_hall/engineering_engine/kernel/module_binding.mjs`
- `guild_hall/engineering_engine/kernel/authority.mjs`
- `guild_hall/engineering_engine/kernel/finding.mjs`
- `guild_hall/engineering_engine/manual/README.md`
- Owner-approved private research-program ref `engine-family-hermes-research-program/20260824`,
  E01 and §§5/6/9/11; the exact private locator remains outside this public-safe packet. This
  packet uses the E01 decision question and §5.2 common-port/manifest boundary.

A lookup for `guild_hall/engineering_engine/kernel/projection.mjs` returned `not found`; no file
was invented and no claim relies on it. Repository search found no implemented
`EngineAssessmentPort` symbol, so the port above is explicitly a proposal from the approved
research-program ref, not a claim of current code existence.

### Official source refs inspected

- `S1`: DLA ASSIST metadata HTML, public base body, and Notice 2 reactivation refs listed in
  §1. The metadata and body were used only within their distinct roles.
- `S2`: Acquisition.gov current FAR index, Part 46 body, FAR 1.103 authority, and FAR 1.104
  applicability refs listed in §1.
- `S3`: NASA official standard metadata page and public Revision B PDF listed in §1.

### Observed command/tool receipts before final validation

| observation | result |
| --- | --- |
| `git rev-parse HEAD` | exit `0`; `e7f465ccbe0243efe5678cdf1a5a7dd05bbcde35` |
| `git branch --show-current` | exit `0`; `codex/quality-engine-v0` |
| pre-write `git status --short` | exit `0`; empty |
| Git index-lock check via resolved `git rev-parse --git-dir` | exit `0`; `index.lock` absent |
| official DLA metadata fetch with `curl -sS https://quicksearch.dla.mil/qaDocDetails.aspx?ident_number=120287` | exit `0`; metadata page exposed ID/title/status/date/owner/revision-history fields |
| Acquisition.gov FAR index/Part 46/1.103/1.104 extraction | success |
| NASA metadata/PDF extraction | success |
| DLA generic extractor attempt | failed to extract; no fallback claim was made from that failure. The official page was then read directly with the observed `curl` receipt. |
| `read_file .../kernel/projection.mjs` | `not found`; no write and no derived claim |

Post-write repository validators are run after this file is materialized; their exact final exits
are reported with delivery. No raw transcript, credential, local secret, source body, private
index chunk, or project payload is stored in this packet.
