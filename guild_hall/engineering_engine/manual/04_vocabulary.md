# 04. 산출물 표준어 (`artifact_type_id`)

## 4.1 왜 필요한가

층이 넷이고 과제마다 폴더명·발주처 슬롯명이 다르므로, "같은 산출물"을 알아보는 열쇠가 하나 있어야 한다. 그것이 `artifact_type_id`(토큰)다.
①의 `rtm` 행, ②의 요구추적 행, ④의 발주처 슬롯 "요구사항 추적표"는 모두 같은 토큰으로 만나야 커버리지·결손 계산이 한 잣대가 된다.

## 4.2 정본과 모양

- 정본: `guild_hall/engineering_engine/stage_rules/artifact_vocabulary.mjs`의 `ARTIFACT_VOCABULARY_V0` (2026-08-18: 152 토큰) + `prime_<...>` 규칙 계열.
- 항목 모양: `{artifact_type_id, family, label_ko, label_en, capability_default}`. `capability_default`는 결손이 mission 후보가 될 때 기본 담당 capability(`systems_engineering`, `hw_engineering`, `sw_engineering`, `mechanical_design`, `configuration_management`, `verification_review`, `project_management`, `risk_management`).
- 계열(family) 19종: requirements_specification · design_description · drawing_and_interface · configuration_and_bom · mechanical_model · technical_plan · test_plan · test_procedure · test_result · test_docs · evaluation_report · configuration_audit · review_minutes · review_result · closeout · internal · prime_contract_item · **activity** · **decision**.
- `activity`·`decision` 계열(D46)은 문서가 아니다. 컴파일러가 gap scan 정책으로 옮길 때 `activity`는 `review_evidence`, `decision`은 `owner_decision_record`로 읽는다(둘 다 정책 템플릿이 이미 갖고 있던 종류다).
- 표시명(`label_ko`)은 D44(Owner 확정) 전까지 관찰 수준이다. 토큰 자체는 안정적으로 유지한다(토큰을 바꾸면 모든 층·overlay·Needs 정책이 깨진다).

## 4.3 발행 규칙

1. 토큰은 소문자 snake_case 영문 약어(`sss`, `ssrs`, `icd`, `temp`, `rtm`, `review_minutes_cdr`)이며 어휘 파일에서만 발행한다. 스펙·overlay·정책 파일이 새 토큰을 임의로 만들지 않는다.
2. 새 토큰을 넣을 때는 계열과 기본 capability를 반드시 정하고, 기존 토큰과 뜻이 겹치지 않는지 확인한다(예: `sps`는 체계성능시방서이므로 SW 제품 기준선은 `vdd`).
3. `prime_<...>` 모양(정규식 `^prime_[a-z0-9]+(?:_[a-z0-9]+)*$`)은 열거 없이 주계약사 계약 항목(family `prime_contract_item`)으로 인식한다. 다른 주계약사 과제는 overlay `mark_not_applicable`로 끈다.
4. 어휘에 없는 토큰이 스펙에 나오면 컴파일러는 거부하지 않고 그 행을 **unmapped context**로 남긴다(변형 전체를 막지 않기 위해). 대신 시험이 "어휘 밖 토큰 0"을 확인하므로 실수는 시험에서 드러난다.
5. 검토 회의록·결과보고서는 `review_minutes_<gate>` / `review_result_report_<gate>` 관례를 따른다.

## 4.4 확장 이력

| 시점 | 추가 | 이유 |
| --- | --- | --- |
| 설계 §4 초안(컴파일러 첫 착지) | 기본 74 토큰 | 체계개발 스펙 v0.7 폴더 기준 |
| 2026-08-18 v0.8 반영 | +26 → 100(`cdrl`, `rtm`, `ram_analysis_report`, `critical_parts_test_report`, `cm_plan`, `technical_review_package`, `manufacturing_design_review`, `standard_parts_review`, `atp`, `ncr` …) | 정본 대조로 추가된 필수 17건과 기계 필드 부여 시 필요. 어휘에 없어서 규정 필수 행이 조용히 강등되던 문제를 발견 → 어휘 확장 + 시험 |
| 2026-08-18 ① 반영 | +30 → 130(`conops`, `risk_management_plan`, `ims`, `system_safety_analysis`, `vcrm`, `fmeca`, `tech_manual`, `training_material`, `hsi_plan`, `tpm_list`, `trade_study` …) | NASA/DoD 검토회의 산출물 중 기존 어휘에 없던 것. 목록은 `references/generic_se_base_derivation_v0.md` §5 |
| 2026-08-18 D46 반영 | +22 → 152: 활동 19(`act_stakeholder_expectations` … `act_decision_analysis` 17종 + `act_functional_analysis_allocation` + `act_technical_review`), 결정 3(`dec_functional_baseline`, `dec_allocated_baseline`, `dec_product_baseline`) | 정본이 말하는 일과 상태를 행으로 둘 수 있게. 토큰별 정본 대응·도출 방법은 `references/se_io_relations_v0.md` §4 |
| — | `prime_*` 규칙 계열 | 주계약사 항목을 열거 없이 인식 |

## 4.5 별칭(alias)과 정합 미결

- 과제 이름 → 토큰 번역은 overlay의 `alias` op가 한다(④). 스펙에 과제 이름을 넣지 않는다.
- ①↔② 정합 미결: ①은 미국 문서 용어(`temp`, `rtm`, `semp`), ②는 한국 정본 용어로 토큰을 만들었고 일부가 다른 토큰이 되었다(예 `p_temp`↔`temp`, `spec_linkage_table`↔`rtm`). 또 ①은 횡단 산출물을 게이트마다 반복하지만 ②는 한 번만 둔다.
  두 선택지 (a) 어휘에 동의어 별칭표를 두기 (b) ②의 토큰을 ①로 정규화하기 중 **(a)를 골랐다**(§4.6). (b)는 engine requirement id를 바꾸므로 D44와 함께 판단한다. ①과 ②의 비교 수치(예 공유 9)는 그때까지 잠정값이다.

## 4.6 동의어와 층 대응표 (2판, 2026-08-18)

두 가지를 구분해서 둔다. 섞으면 어휘가 오염된다.

- **동의어(`ARTIFACT_TYPE_ALIASES`, `canonicalArtifactType(id)`)**: 두 토큰이 정말 같은 문서일 때만. 지금 한 쌍뿐이다 — `p_temp` → `temp`(예비/확정은 성숙도이고 ② 스펙이 스스로 "SFR 이후 TEMP로 발전"이라 적는다). 전역 주장이므로 문턱이 높다.
- **층 대응(`CROSS_LAYER_TOKEN_EQUIVALENCE`, `nationalTokenFor`/`genericTokenFor`)**: ①의 관계를 ②로 옮길 때만 쓰는 표. 4쌍이며 3쌍은 `national_row_assignment` — ② **행**은 분명히 ① 토큰이 가리키는 문서인데(행 이름·용어가 그렇게 말한다) 배정된 토큰은 어휘에서 다른 문서를 가리킨다.

| ① | ② | 종류 | 근거(두 스펙의 행 표기) |
| --- | --- | --- | --- |
| `temp` | `p_temp` | 동의어 | 예비시험평가기본계획서(P-TEMP), SFR 이후 TEMP로 발전 |
| `vcrm` | `spec_linkage_table` | 행 배정 | ② 행 '요구사항검증매트릭스(VCRM)_F', 용어 VCRM |
| `vdd` | `sps` | 행 배정 | ② 행 'SW산출물명세서(SPS_VDD)', 용어 SPS/VDD |
| `conops` | `ord` | 행 배정 | ② 행 '운용개념(CONOPS)', 용어 CONOPS |

기각: `spec_linkage_table` ↔ `rtm`(②는 요구사항추적표 행 3개를 이미 `rtm`으로 갖는다). 묶음 대응(`fca_pca_plan_checklist`, `test_docs`)은 다대일이라 표현할 수 없어 미결.

**토큰은 바꾸지 않는다.** 행의 토큰 배정을 바로잡는 것이 더 깨끗하지만 engine requirement id가 바뀌므로 D44와 함께 판단한다.
