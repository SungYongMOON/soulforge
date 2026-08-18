# generic_se_base 도출 기록 v0 (layer ① 일반 체계공학 기준선)

상태: DRAFT / 2026-08-18. 이 문서는 `assets/SE_FolderTree_GenericSE_Base.md`(support_key `generic_se_base`)의 체크리스트 행이
**어떻게 구해졌는지**를 다른 작업자(사람·LLM)가 이어받을 수 있게 남긴 기록이다. 규칙 본문은 스펙이 정본이고 이 문서는 근거·방법·정정·미결만 다룬다.
엔진 전체 맥락은 `guild_hall/engineering_engine/manual/`를 먼저 읽는다.

## 1. 한 줄 요약

- 결과: 9 게이트(0 REF / 30 SRR / 60 SFR / 90 PDR / 120 CDR / 150 TRR_DT / 180 FCA_OT / 210 PCA / 240 LL) × 체크리스트 **202행**(+게이트마다 고정 INBOX/LOG/TDP 3개 = 229 task 폴더).
- 202행은 "202개의 서로 다른 문서"가 아니다. 서로 다른 산출물 종류(`artifact_type_id`)는 **100개**(must_have만 세면 67개)이고, SEMP·RTM·IMS·위험목록·TEMP/VCRM처럼 횡단하는 산출물은 게이트마다 기대 성숙도(preliminary→updated→baseline→final)를 바꿔 다시 세었다. 한 게이트에서 점검할 행은 평균 약 25개다.
- 바닥 등급(`se_floor`): must_have 124 / should_have 72 / context 6. 근거 상태: source_supported 167 / partially_supported 35.
- **출처 실사용**: 행이 인용하는 정본은 NASA NPR 7123.1D(195행)와 DoD SE Guidebook 2022(173행) 둘뿐이다. NASA SE Handbook(SP-2016-6105 Rev2)은 사실 추출까지 했으나 합성 단계 입력이 잘려 **행에 반영되지 않았다**(§6 미결 1). 스펙 principles 의 "Handbook 6.7" 문구는 이 사실에 맞춰 "추출됨·미반영"으로 정정했다.

## 2. 파이프라인 (누가 무엇을 만들었나)

| 단계 | 입력 | 방법 | 출력(보관 위치) |
| --- | --- | --- | --- |
| S0 정본 확보 | 공개 PDF 3종 | 다운로드 → 공통 지식 라이브러리 intake(영수증·해시) → PyMuPDF 텍스트 추출(page 마커) | `_workspaces/knowledge/common/systems_engineering/{nasa/npr_7123_1d, dod/se_guidebook_2022, nasa/se_handbook_rev2}/`(private worksite), 영수증 `_workmeta/system/reports/source_research/generic_se_sources_intake_20260818` |
| S1 사실 추출 | 파생 텍스트 | 정본 1종당 리더 1개(병렬 3개)가 검토회의별 진입·성공 기준에 나온 산출물을 표 번호·페이지 단위로 JSON 추출(reviews / cross_cutting_products / tailoring_rules) | `…/derivations/generic_se_base_20260818/src_*.json` 3개 |
| S2 합성 | S1 결과 | 합성기 1개가 검토회의를 엔진 게이트 코드에 매핑하고 산출물을 행으로 합침. **바닥 규칙**: must_have = 두 출처가 그 게이트 산출물로 모두 열거 또는 NASA required(`**`) 표기; should_have = 한 출처만 열거 또는 둘 다 권고/상태 수준; context = 발주처 소유 입력·임무 특화·어휘 자리표. 소규모 계약자 범위로 완화한 판단 2건(HSI 계획은 SEMP 절로 대체 가능, 보안계획 030/060 은 발주처 소유 PPP) | `synth.json`(202행, 어휘 추가 30, notes 8, unmapped_reviews) |
| S3 비판 검토 | S2 결과 + 파생 텍스트 | 스팟체크 10건(전부 confirmed) + 위험 7건 → 정정 지시로 변환(§4) | `critic.json` |
| S4 스펙 작성 | S2+S3 | 코더 1개(격리 worktree)가 스펙 md(YAML) 작성: 게이트별 task, 이름 규칙 `한글명(약어)_상태`, 기계 필드(artifact_type_id·evidence_level general_se_guidance·se_floor·maturity·source_refs·verification_status), 어휘 30 토큰 추가, 컴파일러 `general_se_guidance` 지원, generate_tree SUPPORTED_VARIANTS | 스펙·`compiled/generic_se_base.json`·`artifact_vocabulary.mjs`·`stage_rule_compiler.mjs`(+테스트) ; 지시문 `coder_packet_D_20260818.md` |
| S5 검증·비교 | 컴파일 결과 | `--check`(스펙↔compiled 드리프트), `validate:se-stage-rules` 35/35, `validate:se-foldertree-compiled`, generate_tree dry-run, 120_CDR 비교(① 38 / ② 16 / ②+③+④ 27, 공유 9) | 비교 영수증 `_workmeta/system/reports/se_stage_rules/generic_layer_cdr_compare_20260818.json`, 드라이버 `compare_generic_vs_dapa_cdr_20260818.mjs` |

S2 의 must_have 는 132행이었고 S3 정정(단일 출처 항목은 must_have 금지, IMS 성숙도 교정 등)을 S4 가 반영해 컴파일 결과는 must_have 124행이 되었다.

## 3. 게이트 매핑과 의도적 제외

- DoD SFR + NASA MDR/SDR → 060; NASA PRR(Table G-8)·DoD PRR → 210(생산 준비), 단 CDR 시점 선행 항목(제조계획·공정관리·인정/수락 시험계획)은 120 유지; NASA SAR 은 내용상 180; NASA ORR 은 180(V&V 결과)과 210(인계)로 분할; DoD TRR 은 기준 본문이 없어 150 은 NASA G-9/G-10 에 의존.
- 횡단 산출물(semp, risk_register, rtm, ims, tra_report, tpm_list, icd, temp/vcrm, integration_plan, ils_plan, security_plan, system_safety_analysis)은 한 번만 적지 않고 게이트마다 성숙도와 함께 반복한다 — 엔진이 게이트별 기대 성숙도를 점검하기 위함.
- 제외(임무 전용·비SE 산출물): 발사장 운용계획, 점검·활성화 계획, 폐기 계획, 유인등급 인증, RF 스펙트럼 인증, 비행 인증, 원가 근거(BOE/CARD/ICE/JCL, ims 항목 안에만 언급), 규제 대응(EIS). 검토회의 중 MRR/FRR·PLAR·CERR·PFAR·DR/DRR·Peer Review·PIR/PSR 등은 매핑하지 않았다(`synth.json.unmapped_reviews`).
- 어휘: fci/dci/pci 는 기능/할당/제품 기준선 형상식별서로 기존 스펙 id 47/95/143 과 대응 확인. 검토 회의록·결과보고서는 공유 어휘 `review_minutes_*`/`review_result_report_*`. 240_LL 종결 검토 결과보고서는 두 출처에 전용 게이트가 없어 어휘 토큰 없이 context 로만 남김.

## 4. 비판 검토가 남긴 정정·위험 (S3 → S4 반영 상태)

| # | 지적 | 반영 |
| --- | --- | --- |
| R1 | HSI 는 NASA required(`**`, [SE-66])+DoD SRR 항목인데 should_have 로 낮춤; 반대로 일부 must_have 가 NASA "as applicable" 행에만 기대고 DoD 가 유일한 강한 근거 | should_have 유지(소규모 계약자 완화 판단을 스펙 principles 에 명시), 단일 출처 항목은 must_have 금지 규칙으로 정리 |
| R2 | IMS 가 SRR 에서 baseline 으로 잘못 배정(NASA G-6 PDR 에서 ready-to-baseline) | SRR preliminary / PDR baseline 으로 교정 |
| R3 | NASA 전용 항목 누출(오염관리 등 우주비행 특화; 자원 예산) | 단일 출처 → partially_supported·should_have 로 표시(컴파일러는 partially_supported 를 약화시키지 않음) |
| R4 | DoD SFR 과 NASA SDR 통합, fci/dci/pci/VCRM 은 DoD/MIL-STD 명명이라 NASA 가 그 이름을 쓰지는 않음 | 유사물로 수용, source_ref 는 표 번호만(이름 귀속 주장 없음) |
| R5 | 인용 정밀도: 부록 G 파생 텍스트에 page 마커 없음(표 id 만 검증 가능); [SE-39]/[SE-66] 은 p.38(p.37 아님) | p.38 로 정정, 부록 G 는 표 id 인용 |
| R6 | 제조계획: NASA G-7 은 FAIT 계획을 말하고 제조성 계획은 G-6(PDR) | G-6/G-7 분리 인용 |
| R7 | 스팟체크에서 열지 않은 하위 인용(DoD p.108-109 IMS/IBR, Table 2-4 p.59) | **미검증으로 남음**(§6) |

## 5. 어휘 추가 30 토큰 (S2 제안 → S4 등록)

- `conops` — Concept of Operations / operations concept (requirements_specification)
- `risk_management_plan` — Risk management plan (technical_plan)
- `ims` — Integrated master schedule (resourced, critical path) (technical_plan)
- `spec_tree` — Document / specification tree (requirements_specification)
- `system_safety_analysis` — System safety / hazard analysis (PHA, SRHA, subsystem hazard analyses, test safety) (evaluation_report)
- `tpm_list` — MOP/TPM list with thresholds, margins and status (requirements_specification)
- `ils_plan` — Integrated logistics support / life cycle sustainment plan (technical_plan)
- `manufacturing_plan` — Manufacturing / production plan (producibility, process control, production readiness) (technical_plan)
- `hsi_plan` — Human systems integration approach / plan (technical_plan)
- `security_plan` — System security / program protection plan (technical_plan)
- `vcrm` — Verification cross-reference matrix (requirement-to-method-to-evidence) (test_plan)
- `integration_plan` — System integration plan and procedures (technical_plan)
- `resource_budget` — Technical resource budgets and margins (mass, power, memory, throughput) (design_description)
- `emc_control_plan` — EMI/EMC and environments control plan (technical_plan)
- `fmeca` — FMECA / reliability analysis report (evaluation_report)
- `long_lead_list` — Long-lead item / critical procurement list with supply-chain status (configuration_and_bom)
- `engineering_analysis_report` — Engineering analysis and M&S results report (loads, stress, thermal, EMC, material) (evaluation_report)
- `critical_items_list` — Critical safety/application items and single point failure list (configuration_and_bom)
- `as_built_config` — As-built configuration list (HW/SW) of test article or delivered item (configuration_and_bom)
- `vdd` — Software version description document (configuration_and_bom)
- `discrepancy_log` — Discrepancy / deficiency log with dispositions (evaluation_report)
- `handling_transport_plan` — Transportation, handling, packaging and checkout instructions (technical_plan)
- `ram_assessment_report` — R&M achieved-performance assessment report (evaluation_report)
- `acceptance_data_package` — Acceptance data package / certificate of conformance evidence (test_result)
- `security_assessment_report` — Security controls verification / assessment report (evaluation_report)
- `fracas_report` — Failure reporting, analysis and corrective action (FRACAS) records (evaluation_report)
- `waiver_deviation_log` — Waiver / deviation and deficiency closure register (configuration_and_bom)
- `tech_manual` — Operator and maintenance technical manuals / operations documentation (closeout)
- `training_material` — Training materials and training completion records (closeout)
- `action_item_log` — Review action item / RID-RFA closure log (review_result)

표시명(한글)은 D44(Owner 결정) 전까지 임시다.

## 6. 미결·다음 작업

1. **NASA SE Handbook 반영**: `src_NASA_SE_HANDBOOK_REV2_SP_2016_6105.json` 은 있으나 행에 반영되지 않았다. 합성기를 Handbook 포함 3-출처로 다시 돌리거나, 기존 202행에 Handbook 인용을 덧붙이는 보강 패스가 필요하다(바닥 규칙의 "두 출처" 정의도 그때 재확인).
2. **①↔② 토큰 별칭 정합**: ① 은 횡단 산출물을 게이트마다 반복, ②(방사청 공통)는 생성 게이트에 한 번 기재하고 토큰도 다름(예: p_temp vs temp, spec_linkage_table vs rtm). 두 계층을 같은 잣대로 비교하려면 별칭표(alias) 또는 ② 의 반복 행 추가가 필요하다.
3. R7 의 미검증 하위 인용 2건 재독.
4. 스펙 `principles` 의 완화 판단(HSI·보안계획)을 Owner 가 확인(D42~D45 와 함께).

## 7. 행 목록 (compiled 기준, 게이트순)

열: id · artifact_type_id · 폴더명 · floor · maturity · 근거상태 · 인용(표 번호·페이지만).


### 000_REF (4행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | `ord` | 소요-작전운용성능참조문서(ORD)_F | context | baseline | source_supported | NPR Table G-3; NPR p.37 §5.2.2.2.a [SE-35..SE-37]; DoD-SEG Table 3-1 p.69; DoD-SEG Table 3-4 p.81 |
| 5 | `conops` | 운용개념서초안(CONOPS)_D | should_have | preliminary | source_supported | NPR Table G-3; NPR Table G-4; DoD-SEG p.68; DoD-SEG Table 3-1 p.69 |
| 6 | `trade_study` | 대안분석-개념절충연구기록(Trade_Study)_D | should_have | preliminary | source_supported | NPR Table G-3; DoD-SEG p.68; DoD-SEG Table 3-1 p.69 |
| 7 | `tra_report` | 기술성숙도평가-기술성숙화계획초안(TRA)_D | should_have | preliminary | source_supported | NPR Table G-3; NPR p.36 §5.1.6; DoD-SEG Table 3-1 p.69 |

### 030_SRR (24행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 304 | `sss` | 체계요구사항명세서(SSS)_F | must_have | baseline | source_supported | NPR Table G-4; NPR p.38 §5.2.2.2.b [SE-39]; DoD-SEG Table 3-2 p.72 |
| 305 | `conops` | 운용개념서(CONOPS)_U | must_have | updated | source_supported | NPR Table G-4; DoD-SEG Table 3-1 p.69; DoD-SEG p.68 |
| 306 | `semp` | 체계공학관리계획서(SEMP)_F | must_have | baseline | source_supported | NPR Table G-4; NPR p.37 §5.2.2.2.b [SE-38]; DoD-SEG Table 3-2 p.72; DoD-SEG p.17; DoD-SEG p.63 |
| 307 | `rtm` | 요구사항추적표(RTM)_D | must_have | preliminary | source_supported | NPR Table G-4; NPR Table G-1; DoD-SEG Table 3-2 p.72; DoD-SEG p.71 |
| 308 | `icd` | 외부인터페이스통제문서(ICD)_D | must_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.72 |
| 309 | `vv_strategy` | 검증전략-요구사항별검증방법(V_and_V)_D | must_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.73 |
| 310 | `risk_management_plan` | 위험관리계획서(RMP)_F | must_have | baseline | source_supported | NPR Table G-4; DoD-SEG p.17; DoD-SEG Table 3-2 p.72 |
| 311 | `risk_register` | 위험목록(Risk_Register)_U | must_have | updated | source_supported | NPR Table G-4; NPR Table G-1; DoD-SEG Table 3-2 p.72 |
| 312 | `cm_plan` | 형상관리계획서(CMP)_F | must_have | baseline | source_supported | NPR Table G-4; NPR Table G-1; DoD-SEG Table 3-2 p.73; DoD-SEG p.134 |
| 313 | `tra_report` | 기술성숙도평가-기술성숙화계획(TRA)_U | must_have | updated | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.73 |
| 314 | `ims` | 통합일정(IMS)-WBS_D | must_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.72-73; DoD-SEG p.108-109; DoD-SEG Table 2-4 p.59 |
| 315 | `spec_tree` | 문서-규격트리(Spec_Tree)_D | should_have | preliminary | source_supported | NPR Table G-4; DoD-SEG p.78 |
| 316 | `system_safety_analysis` | 예비체계안전분석서(Safety)_D | must_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-1 p.69; DoD-SEG Table 3-2 p.73 |
| 317 | `ram_plan` | RAM계획서_F | must_have | baseline | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.72-73; DoD-SEG p.195-197 |
| 318 | `tpm_list` | 핵심성능지표(TPM)목록_D | should_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.72; DoD-SEG p.83 |
| 319 | `sdp` | 소프트웨어개발계획서(SDP)_D | should_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.72-73 |
| 320 | `ils_plan` | 종합군수지원계획(ILS)_D | should_have | preliminary | source_supported | NPR Table G-4; DoD-SEG Table 3-2 p.73 |
| 321 | `manufacturing_plan` | 제조-생산전략서(MFG_Plan)_D | should_have | preliminary | source_supported | NPR Table G-3; DoD-SEG Table 3-2 p.73; DoD-SEG Table 3-1 p.69 |
| 322 | `hsi_plan` | 인간체계통합계획-접근(HSI)_F | should_have | baseline | source_supported | NPR Table G-4; NPR p.37 §5.2.1.3; NPR p.38 §5.2.2.2.b [SE-66]; DoD-SEG Table 3-2 p.73 |
| 323 | `security_plan` | 체계보안-프로그램보호계획(PPP)_D | should_have | preliminary | source_supported | NPR Table G-4; NPR Table G-1; DoD-SEG Table 3-2 p.72; DoD-SEG p.216; DoD-SEG p.71 |
| 324 | `cdrl` | 자료요구목록(CDRL)_F | should_have | baseline | source_supported | NPR Table G-4; DoD-SEG Table 2-4 p.59; DoD-SEG Table 3-4 p.81 |
| 325 | `technical_review_package` | SRR검토자료(Review_Package)_F | must_have | final | source_supported | NPR Table G-4; DoD-SEG p.63; DoD-SEG p.75 |
| 326 | `review_minutes_srr` | SRR회의록_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG p.75 |
| 327 | `review_result_report_srr` | SRR결과보고서_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; NPR Table G-4; DoD-SEG p.74 |

### 060_SFR (23행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 604 | `fci` | 기능형상식별서(FCI)_F | must_have | baseline | source_supported | NPR p.38 §5.2.2.2.c [SE-41] [SE-42]; DoD-SEG p.74; DoD-SEG p.132 |
| 605 | `sss` | 체계요구사항명세서(SSS)_U | must_have | updated | source_supported | NPR Table G-2; NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 606 | `functional_analysis` | 기능분석-체계아키텍처정의서(Functional_Analysis)_F | must_have | baseline | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 607 | `ssrs` | 부체계요구사항명세서(SSRS)_D | must_have | preliminary | source_supported | NPR Table G-5; NPR p.38 [SE-42]; DoD-SEG Table 3-3 p.76 |
| 608 | `vcrm` | 검증교차참조표(VCRM)_D | must_have | preliminary | source_supported | NPR Table G-5; NPR Table G-4; DoD-SEG Table 3-3 p.76 |
| 609 | `tpm_list` | 핵심성능지표정의및추이(TPM)_F | must_have | baseline | source_supported | NPR Table G-5; NPR p.38 [SE-40] [SE-43]; DoD-SEG p.83; DoD-SEG p.89; DoD-SEG Table 3-3 p.76 |
| 610 | `trade_study` | 절충연구보고서(Trade_Study)_U | must_have | updated | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 611 | `icd` | 인터페이스통제문서(ICD)_D | must_have | preliminary | source_supported | NPR Table G-5; NPR Table G-2; DoD-SEG p.132-133; DoD-SEG Table 3-2 p.72 |
| 612 | `rtm` | 요구사항추적표(RTM)_U | must_have | updated | source_supported | NPR Table G-2; NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 613 | `risk_register` | 위험목록(Risk_Register)_U | must_have | updated | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 614 | `semp` | SEMP_U | must_have | updated | source_supported | NPR Table G-5; NPR Table G-2; DoD-SEG p.15-18 |
| 615 | `ram_plan` | RAM계획서_U | must_have | updated | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 616 | `system_safety_analysis` | 체계안전분석서(Safety)_U | must_have | updated | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 617 | `ims` | IMS_U | must_have | updated | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 618 | `integration_plan` | 통합계획서(Integration)_D | should_have | preliminary | partially_supported | NPR Table G-5; NPR Table G-2 |
| 619 | `ils_plan` | ILSP_D | should_have | preliminary | source_supported | NPR Table G-5; DoD-SEG Table 3-3 p.76 |
| 620 | `resource_budget` | 기술자원예산-여유도(Margins)_D | should_have | preliminary | partially_supported | NPR Table G-5; NPR Table G-6 |
| 621 | `tra_report` | TRA_U | should_have | updated | partially_supported | NPR Table G-5 |
| 622 | `conops` | 운용개념서(CONOPS)_U | should_have | updated | partially_supported | NPR Table G-5 |
| 623 | `security_plan` | 체계보안계획(PPP)_D | should_have | preliminary | source_supported | NPR Table G-5; NPR Table G-2; DoD-SEG Table 3-3 p.76 |
| 624 | `technical_review_package` | SFR검토자료(Review_Package)_F | must_have | final | source_supported | NPR Table G-5; DoD-SEG p.75; DoD-SEG p.63 |
| 625 | `review_minutes_sfr` | SFR회의록_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG p.76 |
| 626 | `review_result_report_sfr` | SFR결과보고서_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; NPR p.38 §5.2.2.2.c; DoD-SEG p.74; DoD-SEG p.76 |

### 090_PDR (35행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 904 | `dci` | 할당형상식별서-아키텍처및형상식별서(DCI)_F | must_have | baseline | source_supported | NPR Table G-6; NPR p.38 [SE-45]; DoD-SEG p.78; DoD-SEG p.83; DoD-SEG p.132-133 |
| 905 | `ssdd` | 체계-부체계설계기술서(SSDD)_D | must_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 906 | `hdd` | 하드웨어설계기술서(HDD)_D | must_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 907 | `sdd` | 소프트웨어설계기술서(SDD)_D | must_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81-82 |
| 908 | `hrs` | 하드웨어요구사항명세서(HRS)_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG p.78; DoD-SEG Table 3-4 p.81 |
| 909 | `srs` | 소프트웨어요구사항명세서(SRS)_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 910 | `irs` | 인터페이스요구사항명세서(IRS)_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 911 | `icd` | 인터페이스통제문서(ICD)_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG p.78; DoD-SEG Table 3-4 p.81; DoD-SEG p.133 |
| 912 | `sdp` | 소프트웨어개발계획서(SDP)_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81-82 |
| 913 | `rtm` | 요구사항추적표(RTM)_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 914 | `temp` | 시험평가기본계획서(TEMP)-검증확인계획_F | must_have | baseline | source_supported | NPR Table G-6; NPR p.38 [SE-68]; DoD-SEG Table 3-4 p.80; DoD-SEG p.82 |
| 915 | `vcrm` | VCRM_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG p.78; DoD-SEG Table 3-4 p.81 |
| 916 | `integration_plan` | 통합계획서(Integration)_F | must_have | baseline | source_supported | NPR Table G-6; NPR p.38 [SE-67]; DoD-SEG Table 3-4 p.82 |
| 917 | `trade_study` | 절충연구보고서(Trade_Study)_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.82 |
| 918 | `risk_register` | 위험목록(Risk_Register)_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.80; DoD-SEG p.83 |
| 919 | `tpm_list` | TPM현황-자원여유도_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG p.83-84 |
| 920 | `tra_report` | TRA_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG p.112; DoD-SEG Table 3-4 |
| 921 | `drawings` | 도면트리-예비도면(Drawings)_D | should_have | preliminary | source_supported | NPR Table G-6; DoD-SEG p.86 |
| 922 | `registered_parts_plan` | 부품관리계획서(Parts_Plan)_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81-82 |
| 923 | `fmeca` | 기능FMECA-신뢰성분석_D | must_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 924 | `system_safety_analysis` | 체계안전분석서(Safety)_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 925 | `manufacturing_plan` | 생산성평가-예비제조계획(MFG_Plan)_D | must_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81-82 |
| 926 | `qa_plan` | 품질보증계획서(QAP)_F | should_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 927 | `emc_control_plan` | EMI-EMC및환경통제계획_F | should_have | baseline | partially_supported | NPR Table G-6 |
| 928 | `ils_plan` | ILSP-LCSP_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.82-83 |
| 929 | `conops` | 운용개념서(CONOPS)_F | should_have | baseline | partially_supported | NPR Table G-6 |
| 930 | `ims` | IMS_F | must_have | baseline | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.82; DoD-SEG p.83 |
| 931 | `security_plan` | 보안-보호계획(PPP)_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.82 |
| 932 | `semp` | SEMP_U | must_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 933 | `long_lead_list` | 장납기품목-조달목록(Long_Lead)_D | should_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.82 |
| 934 | `engineering_analysis_report` | 공학해석-M&S결과서(Analysis)_D | should_have | preliminary | source_supported | NPR Table G-6; DoD-SEG Table 3-2 p.73; DoD-SEG Table 3-4 |
| 935 | `hsi_plan` | HSI접근_U | should_have | updated | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.81 |
| 936 | `technical_review_package` | PDR검토자료(Review_Package)_F | must_have | final | source_supported | NPR Table G-6; DoD-SEG Table 3-4 p.80; DoD-SEG p.82 |
| 937 | `review_minutes_pdr` | PDR회의록_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG p.83 |
| 938 | `review_result_report_pdr` | PDR결과보고서_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; NPR p.38 §5.2.2.2.d; DoD-SEG p.83-84 |

### 120_CDR (39행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 1204 | `pci` | 제품형상식별서(PCI)_F | must_have | baseline | source_supported | NPR p.38 §5.2.2.2.e [SE-46]; NPR Table G-7; DoD-SEG p.84; DoD-SEG p.88; DoD-SEG p.132-133 |
| 1205 | `ssdd` | 체계-부체계설계기술서(SSDD)_F | must_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86 |
| 1206 | `hdd` | 하드웨어설계기술서(HDD)_F | must_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86 |
| 1207 | `sdd` | 소프트웨어설계기술서(SDD)_F | must_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86-87 |
| 1208 | `idd` | 인터페이스설계기술서(IDD)+ICD갱신_F | must_have | baseline | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86-87 |
| 1209 | `dbdd` | 데이터베이스설계기술서(DBDD)_F | should_have | baseline | source_supported | DoD-SEG Table 3-5 p.87; NPR Table G-7 |
| 1210 | `drawings` | 제작도면(Drawings)_F | must_have | baseline | source_supported | NPR Table G-7; DoD-SEG p.86; DoD-SEG p.89 |
| 1211 | `mechanical_model` | 기계3D모델(3D_Model)_F | must_have | final | source_supported | NPR Table G-8; DoD-SEG Table 3-5 p.86 |
| 1212 | `bom` | 자재명세서(BOM)_F | must_have | baseline | source_supported | NPR Table G-7; NPR Table G-8; DoD-SEG Table 3-5 p.86 |
| 1213 | `rtm` | 요구사항추적표(RTM)_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86 |
| 1214 | `tdp` | 기술자료묶음(TDP)_D | must_have | preliminary | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86; DoD-SEG p.96 |
| 1215 | `manufacturing_plan` | 제조계획서(MFG_Plan)_F | must_have | baseline | source_supported | NPR Table G-6; NPR Table G-7; DoD-SEG Table 3-5 p.86-87 |
| 1216 | `dt_plan` | 개발시험계획서(DT_Plan)_F | must_have | baseline | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86-87 |
| 1217 | `dt_procedure` | 개발시험절차서(DT_Proc)_D | should_have | preliminary | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86 |
| 1218 | `atp` | 수락시험계획서(ATP)_F | must_have | baseline | source_supported | NPR Table G-7; DoD-SEG Table 3-7 p.94 |
| 1219 | `temp` | TEMP_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1220 | `vcrm` | VCRM_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1221 | `std` | 소프트웨어시험기술서(STD)_D | should_have | preliminary | source_supported | DoD-SEG Table 3-5 p.87; NPR Table G-7 |
| 1222 | `integration_plan` | 통합계획서(Integration)_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1223 | `fmeca` | 설계FMECA-신뢰성분석_F | must_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1224 | `system_safety_analysis` | 체계-부체계안전분석서(Safety)_F | must_have | baseline | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1225 | `risk_register` | 위험목록(Risk_Register)_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87; DoD-SEG p.88 |
| 1226 | `tpm_list` | TPM현황-자원여유도_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG p.89 |
| 1227 | `tra_report` | TRA_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG p.112 |
| 1228 | `registered_parts_plan` | 부품관리-단종관리,부품목록(Parts_Plan)_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.88 |
| 1229 | `long_lead_list` | 장납기조달계획(Long_Lead)_U | should_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.88 |
| 1230 | `engineering_analysis_report` | 공학해석보고서(Analysis)_F | should_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.88 |
| 1231 | `critical_items_list` | 핵심품목-단일고장점목록(CIL)_F | should_have | baseline | source_supported | DoD-SEG Table 3-5 p.86-87; NPR Table G-7 |
| 1232 | `trade_study` | 절충연구보고서(Trade_Study)_F | must_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.88 |
| 1233 | `mra_report` | 제조성숙도평가(MRA)_D | should_have | preliminary | source_supported | DoD-SEG Table 5-5 p.187-189; DoD-SEG Table 3-5; NPR Table G-7 |
| 1234 | `qa_plan` | 품질보증계획(QAP)_U | should_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.86-87 |
| 1235 | `ssdd` | 운용한계-제약및명령·텔레메트리목록(SSDD)_U | context | updated | partially_supported | NPR Table G-7 |
| 1236 | `semp` | SEMP_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1237 | `ims` | IMS_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.88 |
| 1238 | `ils_plan` | ILSP_U | must_have | updated | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.88 |
| 1239 | `security_plan` | 체계보안계획(PPP)_F | must_have | baseline | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87-88 |
| 1240 | `technical_review_package` | CDR검토자료(Review_Package)_F | must_have | final | source_supported | NPR Table G-7; DoD-SEG Table 3-5 p.87 |
| 1241 | `review_minutes_cdr` | CDR회의록_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG p.88 |
| 1242 | `review_result_report_cdr` | CDR결과보고서_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; NPR p.38 §5.2.2.2.e; DoD-SEG p.88-89 |

### 150_TRR_DT (21행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 1504 | `dt_plan` | 개발시험계획서(DT_Plan)_F | must_have | final | source_supported | NPR Table G-10; DoD-SEG Table 3-5 p.87; DoD-SEG p.67 |
| 1505 | `dt_procedure` | 개발시험절차서(DT_Proc)_F | should_have | final | partially_supported | NPR Table G-10 |
| 1506 | `std` | 소프트웨어시험기술서(STD)_F | should_have | final | partially_supported | NPR Table G-10 |
| 1507 | `as_built_config` | 시험품as-built형상목록(As_Built)_F | should_have | baseline | partially_supported | NPR Table G-10 |
| 1508 | `vdd` | 버전기술서(VDD)_F | should_have | baseline | partially_supported | NPR Table G-10 |
| 1509 | `integration_plan` | 통합계획서및통합절차(Integration)_U | should_have | updated | source_supported | NPR Table G-9; NPR p.38 [SE-47] |
| 1510 | `dt_report` | 하위시험결과보고서(DT)_D | must_have | preliminary | source_supported | NPR Table G-9; NPR p.38 [SE-48]; DoD-SEG Table 3-6 p.91 |
| 1511 | `env_test` | 환경시험계획-절차(Env_Test)_F | should_have | final | source_supported | NPR Table G-9; NPR Table G-7; DoD-SEG Table 3-5 p.86 |
| 1512 | `ess_test` | ESS시험_F | context | final | partially_supported | NPR Table G-9 |
| 1513 | `vcrm` | 인터페이스검증기록-VCRM_U | should_have | updated | partially_supported | NPR Table G-9 |
| 1514 | `discrepancy_log` | 결함-불일치목록(Discrepancy)_U | must_have | updated | source_supported | NPR Table G-9; NPR Table G-10; DoD-SEG p.95-96 |
| 1515 | `system_safety_analysis` | 시험안전계획-취급안전요구(Safety)_U | should_have | updated | partially_supported | NPR Table G-10; NPR Table G-9 |
| 1516 | `technical_review_package` | TRR검토자료(Review_Package)_F | should_have | final | partially_supported | NPR Table G-10; NPR Table G-9 |
| 1517 | `temp` | TEMP_U | should_have | updated | partially_supported | NPR Table G-9 |
| 1518 | `risk_register` | 위험목록(Risk_Register)_U | should_have | updated | partially_supported | NPR Table G-10; NPR Table G-9 |
| 1519 | `handling_transport_plan` | 운송-취급-포장지침(PHS_T)_F | should_have | final | partially_supported | NPR Table G-9 |
| 1520 | `icd` | 설계기술서-ICD_U | should_have | updated | partially_supported | NPR Table G-9 |
| 1521 | `ims` | IMS_U | should_have | updated | partially_supported | NPR Table G-9 |
| 1522 | `lessons_learned` | 시험교훈수집계획(Lessons_Learned)_D | should_have | preliminary | partially_supported | NPR Table G-10 |
| 1523 | `review_minutes_trr` | TRR회의록_F | should_have | final | partially_supported | NPR p.40 §5.2.3.1; NPR Table G-10 |
| 1524 | `review_result_report_trr` | TRR결과보고서_F | should_have | final | partially_supported | NPR p.40 §5.2.3.1 |

### 180_FCA_OT (24행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 1804 | `dt_report` | 개발시험결과보고서-검증결과(DT)_F | must_have | final | source_supported | NPR Table G-11; NPR Table G-12 [SE-69]; DoD-SEG Table 3-6 p.91 |
| 1805 | `str` | 소프트웨어시험결과보고서(STR)_F | must_have | final | source_supported | DoD-SEG p.90; NPR Table G-11 |
| 1806 | `vcrm` | VCRM완료본_F | must_have | final | source_supported | NPR Table G-11; DoD-SEG Table 3-6 p.91; DoD-SEG p.90 |
| 1807 | `rtm` | 요구사항추적표(RTM)_F | must_have | final | source_supported | NPR Table G-11; DoD-SEG Table 3-6 p.91 |
| 1808 | `fca_plan` | 기능형상감사계획서(FCA_Plan)_F | should_have | final | partially_supported | DoD-SEG §3.6; DoD-SEG p.89-91 |
| 1809 | `fca_checklist` | 기능형상감사점검표(FCA_Checklist)_F | should_have | final | partially_supported | DoD-SEG Table 3-6 p.91 |
| 1810 | `fca_report` | 기능형상감사결과보고서(FCA)_F | must_have | final | source_supported | DoD-SEG p.91; NPR Table G-11 |
| 1811 | `ot_plan` | 운용시험계획(발주처주관(OT_Plan)_F | should_have | final | source_supported | DoD-SEG Table 3-6 p.91; NPR Table G-11 |
| 1812 | `ot_report` | 운용시험결과보고서(OT)_F | should_have | final | source_supported | NPR Table G-11; DoD-SEG Table 3-6 p.91; DoD-SEG p.95 |
| 1813 | `ram_assessment_report` | RAM평가보고서_F | should_have | final | source_supported | DoD-SEG Table 3-6 p.91; NPR Table G-7 |
| 1814 | `as_built_config` | As-built형상문서(As_Built)_F | must_have | baseline | source_supported | NPR Table G-11; DoD-SEG Table 3-6 p.91 |
| 1815 | `tdp` | TDP_U | must_have | updated | source_supported | NPR Table G-11; DoD-SEG p.90 |
| 1816 | `acceptance_data_package` | 수락자료묶음(ADP)_F | must_have | final | source_supported | NPR Table G-11; DoD-SEG Table 3-7 p.94; DoD-SEG p.91 |
| 1817 | `discrepancy_log` | 결함-면제·일탈현황(Discrepancy)_U | should_have | updated | source_supported | NPR Table G-11; NPR Table G-12; DoD-SEG p.95-96 |
| 1818 | `risk_register` | 위험목록(Risk_Register)_U | must_have | updated | source_supported | NPR Table G-11; DoD-SEG Table 3-6 p.91 |
| 1819 | `security_assessment_report` | 보안통제검증보고서(SAR)_F | should_have | final | partially_supported | DoD-SEG p.90; DoD-SEG Table 3-5 p.88 |
| 1820 | `vdd` | 소프트웨어제품명세서(VDD)_D | should_have | preliminary | source_supported | DoD-SEG p.90; DoD-SEG p.96; NPR Table G-11 |
| 1821 | `dev_result_report` | 개발결과보고서(Final_Report)_D | should_have | preliminary | source_supported | DoD-SEG Table 3-6 p.91; NPR Table G-11 |
| 1822 | `handling_transport_plan` | 운송-취급-점검절차(PHS_T)_F | should_have | final | partially_supported | NPR Table G-11 |
| 1823 | `ims` | IMS_U | should_have | updated | partially_supported | DoD-SEG Table 3-6 p.91 |
| 1824 | `lessons_learned` | 교훈기록(Lessons_Learned)_U | should_have | updated | partially_supported | NPR Table G-11 |
| 1825 | `technical_review_package` | FCA검토자료(Review_Package)_F | must_have | final | source_supported | NPR Table G-11; DoD-SEG p.90 |
| 1826 | `review_minutes_fca` | FCA회의록_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG Table 3-7 p.94 |
| 1827 | `review_result_report_fca` | FCA결과보고서_F | must_have | final | source_supported | NPR Table G-11; NPR p.40 §5.2.3.1; DoD-SEG p.91 |

### 210_PCA (26행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 2104 | `pca_plan` | 물리형상감사계획서(PCA_Plan)_F | should_have | final | partially_supported | DoD-SEG §3.8; DoD-SEG p.95-97 |
| 2105 | `pca_checklist` | 물리형상감사점검표(PCA_Checklist)_F | should_have | final | partially_supported | DoD-SEG p.95-96 |
| 2106 | `pca_report` | 물리형상감사결과보고서(PCA)_F | must_have | final | source_supported | DoD-SEG p.97; NPR Table G-12 |
| 2107 | `pci` | 제품형상식별서(PCI)_F | must_have | final | source_supported | DoD-SEG Table 3-8 p.97; DoD-SEG p.133; NPR Table G-12; NPR Table G-11 |
| 2108 | `drawings` | 제작도면(Drawings)_F | must_have | final | source_supported | NPR Table G-8; DoD-SEG p.95-96 |
| 2109 | `bom` | BOM-예비품목록_F | must_have | final | source_supported | NPR Table G-8; DoD-SEG Table 3-7 p.94 |
| 2110 | `tdp` | TDP_F | must_have | final | source_supported | DoD-SEG p.96; NPR Table G-8 |
| 2111 | `manufacturing_plan` | 생산계획서(MFG_Plan)_F | must_have | final | source_supported | NPR Table G-8; DoD-SEG Table 3-7 p.93-94 |
| 2112 | `atp` | 수락시험절차-장비(ATP)_F | must_have | final | source_supported | DoD-SEG Table 3-7 p.94; NPR Table G-8 |
| 2113 | `qa_plan` | 생산품질-검사계획(QAP)_F | must_have | final | source_supported | NPR Table G-8; DoD-SEG Table 3-7 p.94; DoD-SEG Table 3-8 p.97 |
| 2114 | `mra_report` | 제조성숙도평가-생산준비검토보고서(MRA)_F | must_have | final | source_supported | DoD-SEG p.94; DoD-SEG Table 5-5 p.187-189; NPR Table G-8 |
| 2115 | `fracas_report` | 고장보고·분석·시정조치(FRACAS)기록_F | should_have | baseline | source_supported | DoD-SEG Table 3-7 p.94; NPR Table G-8 |
| 2116 | `waiver_deviation_log` | 면제-일탈및결함종결대장(Waiver)_F | must_have | final | source_supported | NPR Table G-12; DoD-SEG p.95-96 |
| 2117 | `tech_manual` | 운용-정비기술교범(Tech_Manual)_F | must_have | final | source_supported | NPR Table G-12; DoD-SEG p.96; DoD-SEG Table 3-5 p.88 |
| 2118 | `training_material` | 교육훈련자료-이수기록(Training)_F | should_have | final | source_supported | NPR Table G-12; DoD-SEG Table 3-7 p.94; DoD-SEG Table 3-8 p.97 |
| 2119 | `vdd` | 소프트웨어제품명세서-버전기술서(VDD)_F | must_have | final | source_supported | DoD-SEG p.96; NPR Table G-12 |
| 2120 | `ils_plan` | ILSP_F | must_have | final | source_supported | NPR Table G-11; NPR Table G-12; DoD-SEG Table 3-8 p.97 |
| 2121 | `ims` | 생산-납품IMS_U | must_have | updated | source_supported | NPR Table G-8; DoD-SEG Table 3-7 p.94; DoD-SEG Table 3-8 p.97 |
| 2122 | `risk_register` | 위험목록(Risk_Register)_U | must_have | updated | source_supported | NPR Table G-8; NPR Table G-12; DoD-SEG Table 3-7 p.93; DoD-SEG Table 3-8 p.97 |
| 2123 | `defense_spec_draft` | 국방규격(Spec_Draft)_D | should_have | preliminary | partially_supported | DoD-SEG p.132-133; DoD-SEG p.95 |
| 2124 | `sat_report` | 현장인수-설치점검시험보고서(SAT)_F | should_have | final | partially_supported | NPR Table G-12 |
| 2125 | `security_plan` | 보안-보호계획(PPP)_U | should_have | updated | source_supported | NPR Table G-12; DoD-SEG p.216 |
| 2126 | `dev_result_report` | 개발결과보고서(Final_Report)_F | should_have | final | source_supported | NPR Table G-12; DoD-SEG p.97 |
| 2127 | `technical_review_package` | PCA-PRR검토자료(Review_Package)_F | must_have | final | source_supported | NPR Table G-8; NPR Table G-12; DoD-SEG Table 3-7 p.94; DoD-SEG Table 3-8 p.97 |
| 2128 | `review_minutes_pca` | PCA-PRR회의록_F | must_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG p.94; DoD-SEG p.97 |
| 2129 | `review_result_report_pca` | PCA-PRR결과보고서_F | must_have | final | source_supported | NPR Table G-8; NPR p.40 §5.2.3.1; DoD-SEG p.94; DoD-SEG p.97 |

### 240_LL (6행)

| id | token | 폴더명 | floor | maturity | 근거 | 인용 |
| --- | --- | --- | --- | --- | --- | --- |
| 2404 | `lessons_learned` | 교훈보고서(Lessons_Learned)_F | should_have | final | partially_supported | NPR Table G-4; NPR Table G-10; NPR Table G-11 and G-12 |
| 2405 | `action_item_log` | 검토조치사항종결대장(Action_Log)_F | should_have | final | source_supported | NPR p.40 §5.2.3.1; DoD-SEG p.75; DoD-SEG p.87; DoD-SEG p.94 |
| 2406 | `cdrl` | 자료납품종결확인(CDRL)_F | should_have | final | source_supported | DoD-SEG p.96; NPR Table G-11 |
| 2407 | `risk_register` | 위험목록종결본(Risk_Register)_F | context | final | source_supported | NPR Tables G-1..G-12; DoD-SEG p.17 |
| 2408 | `tpm_list` | TPM최종추이요약_F | context | final | source_supported | NPR Tables G-2, G-5..G-9; DoD-SEG p.83; DoD-SEG p.89 |
| 2409 | `review_result_report_240_LL` | 종결검토결과보고서_F | context | final | partially_supported | NPR p.40 §5.2.3.1 |

## 8. 재현 방법

- 스펙을 고치면 `uv run --with pyyaml python .registry/skills/se_foldertree_generate/codex/scripts/export_variant_json.py` 로 compiled 를 다시 만들고 `--check` 로 드리프트를 막는다.
- 컴파일러·어휘 시험: `npm run validate:se-stage-rules`; 스펙↔compiled: `npm run validate:se-foldertree-compiled`.
- 이 문서 자체는 compiled JSON + 도출 작업 파일에서 스크립트로 생성했다(수기 편집 시 표 부분은 재생성으로 덮일 수 있음).
