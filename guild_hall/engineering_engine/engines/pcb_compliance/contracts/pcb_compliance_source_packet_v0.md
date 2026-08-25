# PCB Compliance Source Packet v0

- `domain_engine_id`: `pcb_compliance`
- `status`: `CANDIDATE_INPUT_ONLY`
- `claim_ceiling`: `source_supported` at most
- `source_adoption`: `false`
- `applicability_approval`: `false`
- `compliance_approval`: `false`
- `product_acceptance`: `false`
- `implementation_scope`: deterministic public-safe evidence readiness only

This packet supplies a narrow, public-safe input to the PCB Compliance Domain Engine. It
does not establish PCB compliance, product acceptance, repair approval, standards adoption,
or project applicability. It does not reproduce, acquire, or infer protected IPC/paid-standard
text. Source bodies are not stored in this repository.

## 1. Source authority and applicability inventory

The machine-readable inventory is
[`pcb_compliance_public_source_inventory_candidate_v0.json`](pcb_compliance_public_source_inventory_candidate_v0.json).
The following rows are the pinned source use in this candidate.

| Source | Authority/revision/access | Bounded use | Applicability boundary |
| --- | --- | --- | --- |
| `S-NASA-8739.6B` | NASA NTSS; version B, change 0, 2021-02-04, marked ACTIVE; internet public | Direct, short paraphrases from the listed public sections only | Applies to NASA settings and externally only when the relevant instrument specifies or references it. Any other project is `UNKNOWN/HOLD`. |
| `S-NASA-8739.1B-C2` | NASA NTSS; version B, change 2, active metadata; internet public | Scope inventory for polymeric/conformal-coating coverage only | No body-derived rule is emitted in v0; project applicability remains `UNKNOWN/HOLD`. |
| `S-IPC-REVISION-CATALOG` | IPC publisher revision catalog; public metadata accessed 2026-08-26 | Identifies revision metadata for IPC-A-600, IPC-A-610, IPC-J-STD-001, and IPC-6012 | Publisher body text, exact clauses, class/addendum selection, and contractual invocation are not acquired or inferred; all remain `UNKNOWN/HOLD` without Owner-approved lawful refs. |

Access to a public source supports review of that source. It never creates a contract
binding, acceptance authority, or compliance assertion.

## 2. Direct-source derivation rows

Each row is a short paraphrase of the listed public NASA source. It preserves the conditional
scope and maps only to an evidence-readiness question. `SATISFIED` means the named evidence
was observed under a supplied binding; it does not mean the hardware meets workmanship criteria.

| Candidate rule | Direct source locator | Bounded derivation | Engine behavior |
| --- | --- | --- | --- |
| `PCB-NASA-FAB-01` | NASA-STD-8739.6B §§1.2.1, 4.1.4-4.1.5 | When the standard is actually imposed, process/procedure documentation and approved manufacturing instructions are required for the specified work. | Tests only the presence/readiness of the defined evidence after explicit applicability and authority resolution. |
| `PCB-NASA-INSPECT-01` | NASA-STD-8739.6B §6.6.1 | The NASA scope calls for visual inspection and points to the applicable criteria. | Tests inspection-record readiness; exact criteria remain `HOLD` when their body is controlled or not lawfully bound. |
| `PCB-NASA-PROTECT-01` | NASA-STD-8739.6B §6.5.1 | The NASA scope covers controlled handling, processing, and storage to avoid damage or degradation. | Tests only a bounded evidence reference and never evaluates process adequacy. |
| `PCB-NASA-TOOL-01` | NASA-STD-8739.6B §§6.4.1-6.4.2 | The NASA scope ties tool/instrument use to project metrology and calibration controls and appropriate task use. | Tests a tool-control evidence reference; calibration validity semantics remain owned by the calibration domain. |
| `PCB-NASA-TRACE-01` | NASA-STD-8739.6B §§4.1.2, 6.8.1-6.8.2 | The public source describes recorded controls/inspection points and recorded rework or reviewed repair routes. | Tests traceability evidence only; it does not approve rework, repair, disposition, or material-review decisions. |
| `PCB-STD-APPLICABILITY-01` | IPC revision-catalog rows | Public metadata identifies named document revisions but not their executable body requirements. | Always holds without a project-approved lawful body reference, revision, and applicability basis. It cannot emit a compliance verdict. |

## 3. Controlled-standard and licensing boundary

IPC-A-600, IPC-A-610, IPC-J-STD-001, IPC-6012, their addenda, and any other paid or controlled
baseline are modeled only as source-reference metadata in this package. The package does not
contain their body, clause text, acceptance criteria, class semantics, tables, images, or inferred
equivalents.

An actual project may move a controlled-standard row beyond `UNKNOWN/HOLD` only when an
Owner-approved lawful source reference supplies the exact edition/revision, scope or class,
authority, project applicability, and access basis in that project's private binding. That decision
is outside this public candidate package.

## 4. Retrieval / RAG boundary

RAG may locate candidate official pages or surface a possible source identifier. It cannot prove
revision, official status, license, clause meaning, project applicability, authority, evidence
sufficiency, or a verdict. The evaluator accepts no RAG answer, source-body text, raw project
document, credential, absolute path, or model output as evidence.

For each future source addition, re-resolve the official metadata and allowed body, record a
short public-safe paraphrase with its locator, preserve modality and scope, and keep the row
`UNKNOWN/HOLD` if any binding or licensing condition is unresolved.

## 5. Explicit non-claims and next action

This packet is not an Owner approval to adopt a standard, create a profile, edit the shared Core,
or run against an actual PCB project. It is source-supported candidate input for deterministic
public-synthetic tests only.

Next action: a Human Owner may approve a lawful project-specific standard binding through the
private project plane. Shared vocabulary, Core, and standard applicability remain unchanged by
this package.
