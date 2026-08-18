# Draft Variant Preview

Use this reference only when designing or checking draft SE foldertree variants. It does not replace the production generator.

## Purpose

The variant preview lane separates three concerns:

- `common_se_base_v0`: source-backed common SE gate identity.
- `pre_study_basic_v0`: production-bound pre-study basic variant with explicit spec binding.
- `lig_grade_a_overlay_v0`: current LIG/A local behavior captured as an overlay candidate.
- `operational_rd_no_grade_candidate_v0`: blocked candidate for operational-R&D/no-quality-grade work.
- `exploratory_dev_basic_v0`: production-bound exploratory-development basic variant with explicit spec binding.
- `operational_rd_basic_v0`: production-bound operational-R&D basic variant with explicit spec binding.

## Boundary

- `scripts/generate_tree.py` remains the only materialization path.
- `scripts/preview_variants.py` is review-only and must not create project folders.
- Draft variants with `generation_enabled: false` are not production-supported combinations.
- Public skill files must not contain private NotebookLM IDs, project source ledgers, credentials, or customer/company originals.

## Preview Command

```powershell
python scripts/preview_variants.py --variants-dir assets/variants
```

Optional JSON preview:

```powershell
python scripts/preview_variants.py --variants-dir assets/variants --json-out <preview.json>
```

## Acceptance For Draft Preview

- All variant YAML files parse.
- Every variant has `variant_id`, `status`, `generation_enabled`, `variant_type`, `evidence_level`, and `decision`.
- Draft and blocked variants keep `generation_enabled: false`.
- Overlay and candidate variants reference an existing `base_variant`.
- `common_se_base_v0` contains the canonical `SRR/SFR/PDR/CDR/TRR/FCA/PCA` spine.
- Production-enabled basic variants declare `supported_input`, `support_key`, and `spec_asset`.

Passing this preview does not by itself authorize folder generation. It only says the metadata is internally consistent; actual folder generation still goes through `generate_tree.py` and its supported-combination checks.

## Compiled JSON

`scripts/export_variant_json.py` compiles each bundled spec's YAML front section into a tracked, deterministic JSON so that consumers (folder generation, the engine stage-rule compiler, Needs policy) read one compiled artifact instead of re-parsing the markdown. Design authority: `docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md` (L1 = variant spec + machine fields, L3 = compiler).

```powershell
python scripts/export_variant_json.py            # regenerate all bundled specs
python scripts/export_variant_json.py --check    # drift guard, exit 1 on mismatch
python scripts/export_variant_json.py --spec assets/SE_FolderTree_Guide.md --out-dir <dir>
```

- Output: `assets/compiled/<support_key>.json`, schema `soulforge.se_foldertree_compiled_variant.v0`.
- Keys: `schema_version`, `support_key`, `business_type`, `prime_contractor`, `quality_grade`, `spec_file` (skill-relative), `spec_sha256`, `spec_version`, `generated_by`, `principles`, `special_folders`, `management_static_folders`, `gates[].{code,name,desc,tasks[]}`, `completion_rule`, `generation_rules`, `profiles`.
- Deterministic serialization: sorted keys, `ensure_ascii=False`, indent 2, trailing newline, LF. Any spec edit changes `spec_sha256`, so `--check` fails until the JSON is regenerated.
- `spec_sha256` hashes the spec bytes with CRLF normalized to LF, so the guard gives the same digest on a Windows and a POSIX checkout.
- Repo-level guard: `npm run validate:se-foldertree-compiled` (not part of the aggregate `validate` chain). It calls `python`; that interpreter must have PyYAML available.
- Gate-level keys that are not part of the schema (for example `lig_qgate`) are not carried into the compiled JSON; the prime-contractor quality-gate identity lives in each task's `artifact_type_id`/`evidence_level` instead.

## Machine fields on task entries

Optional per-task keys defined in design §3. `generate_tree.py` ignores unknown keys, so adding them does not change folder generation. `SE_FolderTree_Guide.md` (체계개발/LIG/A, v0.8) and `SE_FolderTree_GenericSE_Base.md` (일반SE/공통/없음, v0.1) carry them; for the other three baselines the exporter fills `verification_status: unverified` and no other machine field, which keeps them at the compiler's lowest tier until they are re-based.

| field | meaning |
| --- | --- |
| `artifact_type_id` | shared artifact token (design §4 vocabulary), lower snake case |
| `evidence_level` | `regulation_mandated` / `guidebook_recommended` / `prime_contract` / `general_se_guidance` / `internal_management` / `unstated` |
| `se_floor` | `must_have` / `should_have` / `context`, only on `general_se_guidance` rows (see the generic SE baseline section) |
| `maturity` | maturity expected at that gate: `preliminary` / `updated` / `baseline` / `final` |
| `source_refs` | `[{source_key, locator}]` copied from `references/source_verification_v0.md` citations; may be empty |
| `verification_status` | the verdict recorded by the source verification, unchanged until re-verified |
| `applies_when` | list of condition tokens; absent means unconditional |
| `added_by_verification` | date the entry was added because the verification listed it as a missing required item |

Derivation rules used for the 체계개발 v0.8 pass (deterministic, reproducible from the verification record):

- `internal_management` for the fixed INBOX/LOG/TDP slots and for every `240_LL` task (the gate has no canonical source).
- `prime_contract` for `unsupported` verdicts and for LIG Q/G-labelled slots whose verdict is not `source_supported`.
- `regulation_mandated` for `source_supported` with at least one 규정/훈령/예규 citation (`*_law_*` source keys).
- `guidebook_recommended` for `source_supported` with only 가이드북/실무지침서 citations, and for `partially_supported` items that still cite a 규정/훈령 article (the artifact exists in canon but under another name or at another gate).
- `unstated` for `partially_supported` items that exist only as a guidebook check item or process activity.
- `applies_when` tokens: `exploratory_skipped` on the pre-existing `030_SRR` review slots (규정 제56조④5 makes SRR conditional on exploratory development being skipped), `sw_included` on SW-only artifacts, `db_included` on the two DBDD slots the verification marks conditional, `evm_applied` on WBS. Items added at SRR that canon mandates independently of the SRR meeting do not carry `exploratory_skipped`.
- `applies_when` is always a list, so a task with two conditions (for example SDP at SRR) is expressible; design §3 shows a single token, which is the one-element case.

Vocabulary notes:

- Prime-contractor slots use `prime_*` tokens (`prime_q1_contract_data_review`, `prime_g6_project_closeout_report`, …) so other prime contractors can mark them N/A.
- Tokens used that are not yet in design §4 and need the `artifact_vocabulary.v0` owner decision (D44): `cdrl`, `rtm`, `functional_analysis`, `vv_strategy`, `trade_study`, `standard_parts_review`, `wps`, `manufacturing_design_review`, `manufacturing_process_flow`, `ram_analysis_report`, `build_record`, `atp`, `delivery_acceptance_record`, `sat_report`, `integration_test_support`, `defect_action_report`, `ncr`, `defense_spec_drawings`, `development_history`, `lessons_learned_workshop`, `review_minutes_kickoff`, `cm_plan`, `technical_review_package`, `critical_parts_test_report`, `fca_pca_plan_checklist`, `production_transition_package`.
- `unmapped_41` (가정및제약사항) has no sensible token: canon treats it as a section of the SSRS, not a deliverable.
- `artifact_type_id` is unique inside a gate, so a compiled `(gate, artifact_type_id)` pair identifies one slot.


## Generic SE baseline (layer ①, 2026-08-18)

How the rows were derived (sources → per-source extraction → synthesis floor rule → critic → coder → compile), the critic corrections, the 30 vocabulary additions and the open items are recorded in [`generic_se_base_derivation_v0.md`](generic_se_base_derivation_v0.md).

`assets/SE_FolderTree_GenericSE_Base.md` (`support_key: generic_se_base`, input `일반SE / 공통 / 없음`) is the buyer- and country-independent floor: what a development run on systems engineering lines is expected to have produced before each technical review, before any national procurement rule or prime contract is applied.

- Sources actually cited by the rows: NASA NPR 7123.1D (2023) appendix G entrance/success criteria and section 5.2 products, and DoD Systems Engineering Guidebook (2022) section 3 review criteria. NASA SE Handbook SP-2016-6105 Rev2 6.7 was extracted but is not yet folded into any row (see `generic_se_base_derivation_v0.md` §6). These are guidance, not regulation, so every checklist task carries `evidence_level: general_se_guidance`, which the compiler maps to `present_or_not_applicable`.
- Shape: 9 gates (`0 REF / 30 SRR / 60 SFR / 90 PDR / 120 CDR / 150 TRR_DT / 180 FCA_OT / 210 PCA / 240 LL`), 229 task folders = 202 checklist items + the three fixed INBOX/LOG/TDP slots per gate. Task ids are `gate_code * 10 + n` (`901…938`, `1201…1242`) because two gates carry more items than the classic `gate_code + n` decade allows; the ids stay grouped by gate and stay unique across the tree.
- `se_floor` semantics: `must_have` = both canonical texts list the product at that review, or NASA marks it required (`**`); `should_have` = only one of them does; `context` = buyer-owned input or mission-specific product the development does not produce. Only `context` drops out of the engine requirements — `must_have` and `should_have` both compile to `present_or_not_applicable`, and the difference is recorded for the reader, not enforced as two different rules.
- `maturity` (`preliminary` / `updated` / `baseline` / `final`) is the maturity expected at that gate and pairs with the folder-name suffix `_D` / `_U` / `_F`. A cross-cutting product (SEMP, IMS, RTM, risk register, TEMP/VCRM, ILS, security plan, safety analysis) repeats gate by gate with rising maturity on purpose, so the engine can check the expected maturity at each review instead of once.
- `verification_status`: `source_supported` when two sources list the item or NASA marks it required, `partially_supported` when only one does. Never `unverified`: `partially_supported` does not weaken a `general_se_guidance` row, because single-source guidance is still guidance.
- Citations are table ids and page markers only (`Table G-4`, `Table 3-2 p.72`, `p.38 §5.2.2.2.b [SE-39]`). No source sentence, derived-text path, or project name goes into this public spec.
- How national/buyer rows relate: through the shared `artifact_type_id`. A national procurement tree's `ssrs`, `icd`, `temp`, `pci` rows and this baseline's rows are the same artifact at the same stage code, so a project can compile the generic floor, then a national layer, then a prime-contract overlay, and see one merged rule set. Contract-only items stay in the overlay with `evidence_level: prime_contract`; nothing buyer-specific is edited into this spec.
- Deviations recorded at build time: the review tokens use the shared vocabulary (`review_minutes_srr` …) rather than the stage-coded names the checklist proposed; the two software-product-baseline rows use `vdd` because the vocabulary's `sps` is 체계성능시방서 (System Performance Specification); the 240_LL closeout result report keeps a token the vocabulary does not own and therefore compiles as unmapped context, which is correct — neither source defines a closeout gate. Single-source items are never `must_have`, and the IMS is `preliminary` at SRR and `baseline` at PDR (NASA lists the IMS as ready-to-baseline in Table G-6, not G-4).
- 000_REF is a real gate here (buyer-owned concept-stage inputs), so `generation_rules.static_folders` carries only the `020_MGMT` folders.

## Layered outputs (2026-08-18)

- `export_variant_json.py` derives, from a spec that carries `evidence_level: prime_contract` tasks, two more files: `compiled/<common_key>.json` (the common baseline: every task except prime_contract ones; `support_key` mapped via `COMMON_KEY_BY_SUPPORT_KEY`, currently `system_dev_lig_grade_a → system_dev_common_no_grade`; carries `derived_from`) and `compiled/overlays/<support_key>.prime.overlay.json` (`soulforge.se_stage_rule_overlay.v0`, one `add` op per prime task, `extends` = common key + spec sha, `source_ref` = the spec md by exact ref, `overlay_identity` provenance).
- The engine compiles `common baseline + prime overlay + project overlay`; `--check` guards all three files against the spec.
