# Quality Readiness Derivation Batch Q-B1 Candidate v1

- `engine_id`: `E01-quality-readiness`
- `batch_id`: `Q-B1`
- `status`: `CANDIDATE_INPUT_ONLY`
- `claim_ceiling`: `observed` / `source_supported` at most
- `source_adoption`: `false`
- `rule_acceptance`: `false`
- `implementation_authority`: none

This queue selects 11 official-public research targets from the 56-row sanitized inventory.
It is a bounded reading and derivation queue, not evidence that the bodies are current,
sufficient, applicable to a project, or accepted as executable rules. The selected set is
defined machine-readably in
`quality_readiness_source_family_matrix_candidate_v1.json`; titles, publishers, and official
URLs remain owned by `quality_readiness_public_source_inventory_candidate_v1.json`.

## 1. Selected targets and unresolved checks

| source_id | intended gap/domain | why selected | direct body, status, and revision checks required before a claim row |
| --- | --- | --- | --- |
| `dapa_quality_management_rule_law_20251017` | Korean defence quality-system governance and contract-quality administration | Establishes the common Korean public-regulation lane without importing a customer overlay. | Re-resolve the official law.go.kr body, exact current revision/effective date, operative clauses, named roles, applicability, and any repeal/supersession status. |
| `dapa_dqms_certification_management_guideline_law` | DQMS certification and supplier-quality governance | Adds certification-process evidence absent from the three-source proof. | Re-resolve current status and revision; distinguish certification duties, evidence, and authority from product acceptance; retain conditional scope. |
| `dtaq_aqap_2110_certification_rule_20260521` | Korean AQAP-2110 certification practice | Connects Korean certification administration with the separate AQAP body lane. | Read the exact official attachment/body, verify revision and effective status, preserve role/modality, and do not treat certification as project applicability. |
| `dtaq_international_gqa_export_import_basic_rule_20251105` | Government quality assurance and supplier-quality branches | Adds public Korean GQA process coverage for export/import contexts. | Verify the exact official body and current revision; the inventory reports two source files but only one extractor status, so per-file extraction coverage is `UNKNOWN`; separate agreement, export, and import branches and retain designated authorities and prerequisites. |
| `aqap_2110_italy_mod_official_pdf` | Design, development, and production quality-system requirements | Adds an official national-MoD publication of an AQAP body beyond the proof subset. | Confirm exact edition/version, body integrity, current NATO status, and whether the national republication matches the current baseline. If reconciliation fails, keep every candidate `HOLD`. |
| `aqap_2131_italy_mod_official_pdf` | Final inspection, test, and nonconformance evidence | Adds a focused inspection/test lane. | Confirm exact edition/version and current NATO status; preserve final-inspection scope and contract applicability. Unreconciled edition/status stays `HOLD`. |
| `dfars_part_246_quality_assurance` | U.S. defence contract-quality administration | Extends the packet-bound FAR Part 46 proof-subset source with the defence supplement. | Re-resolve the current Acquisition.gov publication baseline, exact sections, role-specific modality, clause dependencies, and contract applicability. |
| `dfars_252_246_7007_counterfeit_electronic_parts` | Counterfeit electronic-part prevention and supplier control | Opens a high-value component-quality gap with an official public clause. | Confirm current clause text, definitions, applicability/flow-down conditions, required system evidence, and contracting authority. Do not generalize beyond electronic parts. |
| `dodi_4140_67_counterfeit_prevention` | Department-level counterfeit-prevention policy | Supplies policy context against which the DFARS clause can be compared without collapsing their authorities. | Verify current issuance/change/status and operative policy assignments; distinguish DoD organizational policy from contractor duties. |
| `dodi_5000_87_software_acquisition` | Software-quality context | Tests whether a bounded software-quality lane belongs in E01 or should remain with a later specialist engine. | Verify current issuance/change/status and exact quality-related clauses. If only acquisition-path governance is found, reclassify to context/out-of-scope instead of minting an E01 rule. |
| `mil_hdbk_61_configuration_management` | Configuration-control support to quality readiness | Tests a common change/control gap while preserving the boundary with the future configuration-impact engine. | Re-resolve ASSIST metadata, exact revision/body, active status, and advisory handbook modality. If the claim is primarily configuration management rather than quality evidence, defer it to the owning engine. |

## 2. Derivation method

For each target, a source reader records only short paraphrases with exact clause/table/page
locators and the source-native modality. A later synthesis pass maps those rows to the E01
candidate shape. A fresh critic then re-reads at least 10% of new citation rows, with a
minimum of 10 rows, against the official body rather than a RAG chunk. RAG may locate likely
clauses and gaps, but it is not status, applicability, acceptance, or verdict authority.

No source advances to an executable rule until its metadata and body revisions are pinned,
its official status is re-resolved, its access class is allowed, its applicability and
authority conditions are explicit, and the Human Owner accepts that exact rule binding.

## 3. Stop conditions

Stop the affected source or row as `UNKNOWN/HOLD` when any of the following occurs:

1. official status and exact body revision cannot both be re-resolved;
2. the available evidence is only a RAG hit, cached extraction, metadata API record, or
   machine-extracted-unreviewed text without direct body confirmation;
3. the operative baseline is paid, controlled, internal, HWP/HWP-like without approved HWPX
   normalization, or otherwise outside the allowed public-source lane;
4. a customer, vendor, LIG, contract, supplier-specific, or project fact would be needed;
5. modality, applicability, named authority, branch prerequisite, or conflict cannot be
   preserved without inference;
6. the candidate belongs primarily to another specialist engine and no cross-engine ownership
   seam has been fixed;
7. exact Human Owner rule acceptance is absent.

## 4. Required next-leaf outputs

The next source-reading leaf may produce a source-direct derivation record, a blocked-source
register update, and candidate rule rows. It still must not edit evaluator, rule pack, tests,
fixtures, runner, topology, release manifest, or package scripts. Implementation remains a
separate leaf after source review, independent criticism, and Owner rule acceptance.
