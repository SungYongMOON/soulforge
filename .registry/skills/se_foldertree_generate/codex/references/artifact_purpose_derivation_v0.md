# 산출물 목적 문장(`purpose_ko`) 도출 기록 v0

규칙 행이 **무엇을 요구하는가**와 별개로, 그 산출물이 **무엇을 위한 것인가**는 따로 구해야 했다.
방법은 엔진 매뉴얼 03장 §3.0의 파이프라인 그대로이며, 이 파일은 그 S1~S4의 공개 기록이다.
목적 문장 자체는 스펙 md의 `purpose_ko`가 정본이므로 여기서 되풀이하지 않는다 — 이 표는
**어느 정본의 어디에서 읽었는가**만 적는다.

## 1. 방법

| 단계 | 한 일 |
| --- | --- |
| S0 | 정본은 이미 확보된 공통 지식 라이브러리의 파생 텍스트를 그대로 썼다(새 intake 없음). |
| S1 | 정본 계열마다 리더 1개(병렬 6). 각 리더는 자기 정본 안에서만 읽고, 그 산출물의 목적을 말한 문장이 있을 때만 토큰을 낸다. 목록에만 나오는 산출물은 **비운다**. |
| S2 | 토큰마다 층별 정본 우선순위로 **하나만** 고른다. 목적 문장은 근거 등급을 올리지도 내리지도 않는다(D45). |
| S3 | 스팟체크: 무작위 10건의 인용 위치를 본문 재독으로 확인. |
| S4 | 스펙 md의 행에 `purpose_ko`(≤200자)와 `purpose_refs[{source_key, locator}]`를 넣고 exporter 재생성 + `--check`. |

우선순위(층별):

- ② 국가 조달 공통 + ③ 발주처 (체계개발): 방위사업관리규정 · 국방전력발전업무훈령 > 방사청 SE 기술검토회의 가이드북 2017/2024 > SE 기술관리 실무지침서
- ① 일반 SE 기준선: NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) > NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) > DoD SE Guidebook 2022

규정 계열을 먼저 두는 것은 `AGENTS.md`의 우선순위(규정 > 가이드북 > 일반 SE 지침 > 미표기)를 따른 것이고,
일반 SE 층에서 NASA 계열을 먼저 두는 것은 프로세스 입출력을 절 단위로 갖는 정본이 그쪽뿐이기 때문이다(매뉴얼 03 §3.7).

## 2. 실측 (2026-08-19)

| 층 | 스펙 | 토큰 | 목적 있음 | 커버리지 | 행에 기록 |
| --- | --- | --- | --- | --- | --- |
| ② 국가 조달 공통 + ③ 발주처 (체계개발) | `SE_FolderTree_Guide.md` v0.13 | 100 | 71 | 71.0% | 110행 |
| ① 일반 SE 기준선 | `SE_FolderTree_GenericSE_Base.md` v0.4 | 115 | 79 | 68.7% | 171행 |

정본 계열별·신뢰도별:

| 스펙 | 정본 계열 | 토큰 | 신뢰도 high | medium |
| --- | --- | --- | --- | --- |
| `system_dev_lig_grade_a` | 방위사업관리규정 · 국방전력발전업무훈령 | 38 | 23 | 15 |
| `system_dev_lig_grade_a` | 방사청 SE 기술검토회의 가이드북 2017/2024 | 19 | 11 | 8 |
| `system_dev_lig_grade_a` | SE 기술관리 실무지침서 | 14 | 5 | 9 |
| `generic_se_base` | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | 29 | 18 | 11 |
| `generic_se_base` | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | 31 | 11 | 20 |
| `generic_se_base` | DoD SE Guidebook 2022 | 19 | 7 | 12 |

**목적이 비어 있는 행은 결함이 아니라 실측이다.** 카드는 그 자리에 `정본에 목적 문장 없음`이라고 적고,
일반 지식으로 채우지 않는다 — 채우면 인용된 지시와 구분할 수 없는 지시가 사람 앞에 놓인다(매뉴얼 11 §11.3).

## 3. 토큰별 인용 위치

`행` = 그 토큰이 규칙표에서 차지하는 행 수(게이트마다 반복되는 횡단 산출물은 여러 행을 갖고, 같은 목적 문장을 공유한다).

### 3.1 ② 국가 조달 공통 + ③ 발주처 (체계개발)

| artifact_type_id | 행 | 정본 | 위치 | 신뢰도 |
| --- | --- | --- | --- | --- |
| `act_functional_analysis_allocation` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide 부록A 18 (p.176); dapa_se_technical_management_practice_guide §3.5.1 (p.54); dapa_se_technical_management_practice_guide §3.5.2 (p.54) | high |
| `act_stakeholder_expectations` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §5.7.1 (p.140) | high |
| `act_technical_review` | 7 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조②; dapa_program_management_rule_law_20260811 제56조④ | medium |
| `atp` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.110; dapa_se_technical_review_guidebook_2017 p.108; dapa_se_technical_review_guidebook_2017 p.106 | medium |
| `bom` | 3 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제55조④ | medium |
| `cdrl` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.47 | medium |
| `cm_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제158조①; mnd_force_development_directive_law_20260701 제158조② | medium |
| `conops` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide 부록A 84 (p.188); dapa_se_technical_management_practice_guide §3.2.1 (p.47) | high |
| `critical_parts_test_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조⑤; dapa_program_management_rule_law_20260811 제79조① | high |
| `dbdd` | 2 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.121; dapa_se_technical_review_guidebook_2024 pdf p.111 | high |
| `dci` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2024 pdf p.117; dapa_se_technical_review_guidebook_2024 pdf p.27 | medium |
| `defect_action_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제69조⑤; mnd_force_development_directive_law_20260701 제69조⑥ | high |
| `defense_spec_draft` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제80조① | high |
| `defense_spec_drawings` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제55조④ | medium |
| `dev_result_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제81조② | high |
| `drawings` | 3 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.31; dapa_se_technical_review_guidebook_2017 p.131 | medium |
| `dt_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제60조②; mnd_force_development_directive_law_20260701 제64조①; mnd_force_development_directive_law_20260701 제64조② | high |
| `dt_report` | 2 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제66조①; mnd_force_development_directive_law_20260701 제66조② | high |
| `fca_pca_plan_checklist` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.99; dapa_se_technical_review_guidebook_2017 p.103; dapa_se_technical_review_guidebook_2017 p.110 | medium |
| `fca_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조②; dapa_program_management_rule_law_20260811 제56조④ | medium |
| `fci` | 2 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2024 pdf p.117; dapa_se_technical_review_guidebook_2024 pdf p.26 | high |
| `functional_analysis` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §3.5.1 (p.54); dapa_se_technical_management_practice_guide §3.5.3 (p.54); dapa_se_technical_management_practice_guide 부록A 18 (p.176) | medium |
| `hdd` | 2 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.128; dapa_se_technical_review_guidebook_2017 p.121; dapa_se_technical_review_guidebook_2017 p.31 | high |
| `hrs` | 3 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.126; dapa_se_technical_review_guidebook_2017 p.120 | high |
| `icd` | 5 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제43조① | high |
| `idd` | 2 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.121; dapa_se_technical_review_guidebook_2024 pdf p.113 | high |
| `interop_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제41조① | high |
| `manufacturing_design_review` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제56조④ | medium |
| `manufacturing_process_flow` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.108; dapa_se_technical_review_guidebook_2017 p.132 | medium |
| `mid_check_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제65조①; dapa_program_management_rule_law_20260811 제65조④ | high |
| `mra_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제56조④; dapa_program_management_rule_law_20260811 제79조③; dapa_program_management_rule_law_20260811 제78조③ | high |
| `ms_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제64조① | high |
| `ncr` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §5.6.3.4 (p.138); dapa_se_technical_management_practice_guide 부록A 16 (p.175); dapa_se_technical_management_practice_guide 부록A 14 (p.175) | medium |
| `ot_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제60조②; mnd_force_development_directive_law_20260701 제67조②; mnd_force_development_directive_law_20260701 제67조⑤ | high |
| `ot_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제68조⑤ | medium |
| `p_temp` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제73조②; mnd_force_development_directive_law_20260701 제63조①; mnd_force_development_directive_law_20260701 제63조② | high |
| `pca_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조②; dapa_program_management_rule_law_20260811 제56조④ | high |
| `pci` | 3 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2024 pdf p.117; dapa_se_technical_review_guidebook_2024 pdf p.27; dapa_se_technical_review_guidebook_2024 pdf p.107 | high |
| `prime_q2_development_execution_plan` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide 부록A 2 (p.173); dapa_se_technical_management_practice_guide §5.1.3.4 (p.103) | medium |
| `prime_q6_sw_reliability_test` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제64조③; mnd_force_development_directive_law_20260701 제64조④ | medium |
| `prime_q7_factory_acceptance_test` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §3.8.2 (p.57) | medium |
| `production_transition_package` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제81조③; dapa_program_management_rule_law_20260811 제81조④ | high |
| `qa_plan` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.116; dapa_se_technical_review_guidebook_2017 p.47; dapa_se_technical_review_guidebook_2017 p.85 | medium |
| `ram_analysis_report` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제76조⑤; dapa_program_management_rule_law_20260811 제56조④ | high |
| `ram_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제76조⑤ | high |
| `registered_parts_plan` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제27조⑧; dapa_program_management_rule_law_20260811 제76조⑥; dapa_program_management_rule_law_20260811 제79조④ | high |
| `review_minutes_cdr` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조②; dapa_program_management_rule_law_20260811 제56조④ | medium |
| `review_minutes_fca` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §4.1.3 (p.63); dapa_se_technical_management_practice_guide §4.7.1 (p.85) | medium |
| `review_minutes_kickoff` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §4.10.1.1 (p.93) | medium |
| `review_minutes_pca` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §4.1.3 (p.63); dapa_se_technical_management_practice_guide §4.9.1 (p.90) | medium |
| `review_minutes_pdr` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조②; dapa_program_management_rule_law_20260811 제56조④ | medium |
| `review_minutes_sfr` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조② | medium |
| `review_minutes_srr` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제79조②; dapa_program_management_rule_law_20260811 제56조④ | medium |
| `review_minutes_trr` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제65조①; mnd_force_development_directive_law_20260701 제68조①; dapa_program_management_rule_law_20260811 제79조② | high |
| `risk_register` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.116; dapa_se_technical_review_guidebook_2017 p.40 | high |
| `rtm` | 3 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §5.8.3.4 (p.149) | high |
| `sdd` | 2 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.121; dapa_se_technical_review_guidebook_2017 p.31 | high |
| `sdp` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제49조① | medium |
| `semp` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.120; dapa_se_technical_review_guidebook_2024 pdf p.133 | high |
| `srs` | 3 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.120; dapa_se_technical_review_guidebook_2024 pdf p.112 | high |
| `ssdd` | 2 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.127; dapa_se_technical_review_guidebook_2017 p.121; dapa_se_technical_review_guidebook_2017 p.31 | high |
| `ssrs` | 2 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제78조④ | medium |
| `tdp` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제81조② | medium |
| `tdp_exchange` | 8 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide §5.9.2 (p.152); dapa_se_technical_management_practice_guide 부록A 24 (p.177) | medium |
| `technical_review_package` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제70조③; dapa_program_management_rule_law_20260811 제78조⑧ | high |
| `temp` | 3 | 방위사업관리규정 · 국방전력발전업무훈령 | mnd_force_development_directive_law_20260701 제60조②; mnd_force_development_directive_law_20260701 제63조③ | high |
| `trade_study` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide 부록A 28 (p.179); dapa_se_technical_management_practice_guide §5.9.3.1 (p.152) | high |
| `vdd` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제50조① | high |
| `vv_strategy` | 1 | 방사청 SE 기술검토회의 가이드북 2017/2024 | dapa_se_technical_review_guidebook_2017 p.118; dapa_se_technical_review_guidebook_2024 pdf p.110 | medium |
| `wbs` | 1 | 방위사업관리규정 · 국방전력발전업무훈령 | dapa_program_management_rule_law_20260811 제78조⑨; dapa_program_management_rule_law_20260811 제63조① | high |
| `wps` | 1 | SE 기술관리 실무지침서 | dapa_se_technical_management_practice_guide 부록D (p.320) | medium |

### 3.2 ① 일반 SE 기준선

| artifact_type_id | 행 | 정본 | 위치 | 신뢰도 |
| --- | --- | --- | --- | --- |
| `acceptance_data_package` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.117 (printed p.104) §5.3 (Verification/Qualification/Acceptance/Certification box) | medium |
| `act_architecture_design` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.90 (printed p.77) §4.4; nasa_npr_7123_1d §3.2.5.2-§3.2.5.3 (p.25) | high |
| `act_implementation` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.104 (printed p.91) §5.1; nasa_npr_7123_1d §3.2.6.2 (p.25) | high |
| `act_integration` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.111 (printed p.98) §5.2; nasa_npr_7123_1d §3.2.7.2 (p.26) | high |
| `act_logical_decomposition` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.86 (printed p.73) §4.3; nasa_npr_7123_1d §3.2.4.2 (p.25) | high |
| `act_requirements_analysis` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.76 (printed p.63) §4.2; nasa_npr_7123_1d §3.2.3.2 (p.24-25) | high |
| `act_stakeholder_expectations` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.66 (printed p.53) §4.1; nasa_npr_7123_1d §3.2.2.3 (p.24) | high |
| `act_transition` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.137 (printed p.124) §5.5; nasa_npr_7123_1d §3.2.10.2 (p.26) | high |
| `act_validation` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.129 (printed p.116) §5.4; nasa_npr_7123_1d §3.2.9.2 (p.26) | high |
| `act_verification` | 2 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.116 (printed p.103) §5.3; nasa_npr_7123_1d §3.2.8.2 (p.26) | high |
| `action_item_log` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `atp` | 2 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.117 (printed p.104) §5.3 (Verification/Qualification/Acceptance/Certification box) | medium |
| `cdrl` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.1.7 (p.136); dod_se_guidebook_2022 p.56 | medium |
| `cm_plan` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.182 (printed p.169) §6.5.1.2.1 | high |
| `conops` | 4 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.222 (printed p.209) App B Glossary 'Concept of Operations'; nasa_se_handbook_rev2 pdf p.71 (printed p.58) §4.1.1.2.4 | high |
| `critical_items_list` | 1 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §5.6 (p.167) | high |
| `dci` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.183 (printed p.170) §6.5.1.2.2; nasa_se_handbook_rev2 pdf p.220 (printed p.207) App B Glossary 'Allocated Baseline' | high |
| `dec_allocated_baseline` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.183 (printed p.170) §6.5.1.2.2 | high |
| `dec_functional_baseline` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.183 (printed p.170) §6.5.1.2.2 | high |
| `dec_product_baseline` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.183 (printed p.170) §6.5.1.2.2; nasa_se_handbook_rev2 pdf p.236 (printed p.223) App B Glossary 'Product Baseline' | high |
| `discrepancy_log` | 2 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.125 (printed p.112) §5.3.1.2.2; nasa_se_handbook_rev2 pdf p.126 (printed p.113) §5.3.1.2.3; nasa_se_handbook_rev2 pdf p.128 (printed p.115) §5.3.1.3 | medium |
| `drawings` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.98 (printed p.85) §4.4.1.2.6 | medium |
| `dt_report` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.2.6 (p.151) | medium |
| `engineering_analysis_report` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.2.6 (p.150) | medium |
| `fca_plan` | 1 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §3.6 (p.90-91) | medium |
| `fca_report` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.229 (printed p.216) App B Glossary 'Functional Configuration Audit (FCA)' | medium |
| `fci` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.183 (printed p.170) §6.5.1.2.2; nasa_se_handbook_rev2 pdf p.229 (printed p.216) App B Glossary 'Functional Baseline' | high |
| `fmeca` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 Table 5-6 (p.197); dod_se_guidebook_2022 Table 5-6 (p.198) | medium |
| `fracas_report` | 1 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 Table 5-6 (p.197); dod_se_guidebook_2022 Table 5-6 (p.198) | high |
| `functional_analysis` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.88 (printed p.75) §4.3.1.2.2 | medium |
| `handling_transport_plan` | 2 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.101 (printed p.88) §4.4.1.3 | medium |
| `hsi_plan` | 2 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.305 (printed p.292) App R.1; nasa_npr_7123_1d §5.2.1.3 (p.37) | high |
| `icd` | 4 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.172 (printed p.159) §6.3.1.3; nasa_se_handbook_rev2 pdf p.171 (printed p.158) §6.3.1.2.3 | medium |
| `ils_plan` | 5 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.230 (printed p.217) App B Glossary 'Integrated Logistics Support' | medium |
| `ims` | 7 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.1.1 (p.106-107); dod_se_guidebook_2022 §4.1.1 (p.109) | high |
| `integration_plan` | 4 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.269 (printed p.256) App H.1; nasa_se_handbook_rev2 pdf p.111 (printed p.98) §5.2 | high |
| `irs` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 a~m) | nasa_se_handbook_rev2 pdf p.297 (printed p.284) App L §1.1-1.3 | medium |
| `lessons_learned` | 3 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §2.2.8 (p.46) | medium |
| `manufacturing_plan` | 4 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §5.14 (p.178) | high |
| `mra_report` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §5.14.5 (p.185) | high |
| `ord` | 1 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.2.1 (p.143) | medium |
| `ot_report` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.136 (printed p.123) §5.4.1.3 | medium |
| `pca_plan` | 1 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §3.8 (p.96-97) | medium |
| `pca_report` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.235 (printed p.222) App B Glossary (Physical Configuration Audits); nasa_se_handbook_rev2 pdf p.187 (printed p.174) §6.4.1.2.5 (Conduct Configuration Audits) | high |
| `pci` | 2 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.183 (printed p.170) §6.5.1.2.2; nasa_se_handbook_rev2 pdf p.236 (printed p.223) App B Glossary (Product Baseline) | high |
| `qa_plan` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.239 (printed p.226) App B Glossary (Quality Assurance) | medium |
| `ram_plan` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 Table 5-6 (p.196); dod_se_guidebook_2022 §5.18 (p.194) | high |
| `registered_parts_plan` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 Table 5-6 (p.198) | medium |
| `resource_budget` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.232 (printed p.219) App B Glossary (Margin) | high |
| `review_minutes_cdr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_minutes_fca` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_minutes_pca` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_minutes_pdr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_minutes_sfr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_minutes_srr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_minutes_trr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.2.9 (p.40); nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_cdr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_fca` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_pca` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_pdr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_sfr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_srr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `review_result_report_trr` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_npr_7123_1d §5.2.3.1 (p.40) | medium |
| `risk_management_plan` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.176 (printed p.163) §6.4.1.1 | high |
| `risk_register` | 8 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.1.5 (p.123); dod_se_guidebook_2022 §4.1.1 (p.109) | medium |
| `rtm` | 5 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.165 (printed p.152) §6.2.1.2.3; nasa_se_handbook_rev2 pdf p.163 (printed p.150) §6.2 | high |
| `sat_report` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.142 (printed p.129) §5.5.1.2.4 | medium |
| `sdd` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §4.1.6 (p.133) | medium |
| `security_plan` | 5 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §5.24 (p.216) | high |
| `semp` | 4 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.282 (printed p.269) App J §J.1; nasa_se_handbook_rev2 pdf p.155 (printed p.142) §6.1.1.2.4 | high |
| `sss` | 2 | DoD SE Guidebook 2022 | dod_se_guidebook_2022 §3.3 (p.74); dod_se_guidebook_2022 §4.2.2 (p.143) | medium |
| `system_safety_analysis` | 5 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.290 (printed p.277) App J §7.1 | medium |
| `tdp` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.191 (printed p.178) §6.6.1.2.1 | high |
| `tech_manual` | 1 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.139 (printed p.126) §5.5.1.1 | medium |
| `temp` | 3 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.272 (printed p.259) App I §1.1 | medium |
| `tpm_list` | 5 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.84 (printed p.71) §4.2.1.2.5; nasa_se_handbook_rev2 pdf p.290 (printed p.277) App J §7.4 | high |
| `tra_report` | 5 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.260 (printed p.247) App G §G.1 | high |
| `trade_study` | 4 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.94 (printed p.81) §4.4.1.2.3; nasa_se_handbook_rev2 pdf p.247 (printed p.234) App B Glossary (Trade Study Report) | high |
| `vcrm` | 5 | NASA SE Handbook Rev2 · NPR 7123.1D (토큰 n~z) | nasa_se_handbook_rev2 pdf p.253 (printed p.240) App D | high |

## 4. 스팟체크와 미결

### 4.1 스팟체크 (2026-08-19, 독립 critic)

표본은 리더별로 층화해 10건을 뽑았고, 각 인용 위치의 본문을 다시 읽어 대조했다.
**10/10 확인, 위치 정정 0건.** 페이지 오프셋(실무지침서 인쇄쪽 = 파생 pdf 쪽 − 12, DoD SEG 인쇄쪽 =
파생 pdf 쪽 − 8)도 전건 그대로 맞았다.

남긴 경고 두 가지 — 둘 다 인용 오류가 아니라 **적용 범위**의 문제다.

1. **회의록 계열은 회의 자체의 목적을 물려받았다.** 정본은 대개 "검토회의가 무엇을 위한 것인가"를 말하고
   그 회의록의 목적을 따로 말하지 않는다. `review_minutes_*`에 붙은 문장은 그 일반 진술에서 온 것이며
   회의록 고유의 진술이 아니다(① 층에서도 NPR §5.2.2.9/§5.2.3.1 하나를 14개 토큰이 공유한다).
2. **`review_minutes_pca`의 NPR 인용은 수명주기 검토 회의록 일반 규정이다.** NPR 7123.1D에는 물리적
   형상감사(PCA)가 없고 같은 약어가 다른 뜻(Program Commitment Agreement)으로 쓰인다.

### 4.2 미결

1. 정본이 목적을 말하지 않은 토큰은 ② 29 / ① 36이며 **비워 두었다**. 카드는 그 자리에
   `정본에 목적 문장 없음`이라고 적는다. 규정 계열을 더 읽으면(국방 총수명주기관리 업무훈령, 시험평가
   가이드북 등) 일부는 채워질 수 있다.
2. 리더들이 **일부러 비운** 자리가 있다. 서로 다른 산출물을 하나로 합치지 않기 위해서다 — 예: 시험
   계획·절차·성적서를 일반 SE 정본의 "verification plan/procedure/report"에 맞추지 않았고,
   HW·SW 요구명세를 DoD의 일반 "development specification"에 맞추지 않았으며, TDP는 정본 자신이
   용어가 불명확하다고 경고하므로 비웠다. 이 판단들은 리더 보고의 `omitted_note`에 남아 있다.
3. `source_family`(규정·가이드북·실무지침서·일반SE)는 지금 색인 카탈로그를 만들 때 붙는다. 색인
   영수증 자체가 이 필드를 갖는 것이 맞는지는 Owner 판단이 필요하다.
4. `purpose_ko`가 있는 행과 없는 행이 한 게이트에 섞여 있으므로, 커버리지는 게이트마다 다르다.
   KVDS 실측(2026-08-19): 030_SRR 카드 22 중 20, 120_CDR 카드 28 중 14.

