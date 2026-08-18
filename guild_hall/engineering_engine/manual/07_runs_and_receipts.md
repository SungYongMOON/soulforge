# 07. 실행 기록과 영수증

실제 과제(P26-014) 실행은 전부 private 면에 있고 여기에는 **수치와 포인터만** 남긴다. 모든 실행은 zero-write(엔진 effect 0)이며 Task 생성·승인·canon 승격은 하지 않았다.

## 7.1 실행 표 (시간순)

| 날짜 | run(포인터) | 무엇을 | 결과 수치 | 비고 |
| --- | --- | --- | --- | --- |
| 08-17 | `_workmeta/P26-014/runs/project_pdf_requirement_index_pilot_20260817_01` | 계약자료 PDF에서 요구 ID 색인(R1 선행 seam) | 요구 ID 118(중복 ID 4쌍 → D40) | 색인은 candidate(D37) |
| 08-17 | `…/ax_se_project_context_pilot_20260817_01`, `_02` | M2-2 Owner-frozen context pilot(발주처 슬롯 기반 packet) | command PASS·domain UNKNOWN: satisfied 5 / unknown 9, mission 후보 3 | run 02 packet이 이후 생성기의 base packet 템플릿 |
| 08-18 | `…/requirement_trace_coverage_pilot_20260818_01` | 요구 118 + Needs 정책 후보 → R1 커버리지(builder) | 셀 충족 31 / 결손 95 / 미시도 44 / 미선언 52 | 산출물 폴더 `_workspaces/P26-014/TB_Master_Doc/06_validation/requirement_trace_20260818_01` |
| 08-18 | `…/requirement_trace_coverage_pilot_20260818_02` | 같은 입력, Needs 정책 산출물 ID를 표준어(`artifact_type_id`)로 치환 | 수치 동일 | 표준어 전환이 결과를 바꾸지 않음을 확인 |
| 08-18 | `…/se_stage_rules_kvds_120_cdr_20260818_01` | 120_CDR 첫 컴파일(② 스펙 v0.8 + ④ overlay 24 op) | 발주처 슬롯 14 = 표준 5·강화 2·추가 7; 발주처 미요청 표준 11 중 규정 필수 6 → 엔진 요구 25 | 산출물 `…/06_validation/stage_rules_20260818_01/{policy,overlay,mapping}` |
| 08-18 | `…/ax_se_project_context_pilot_20260818_03` | R3: 컴파일 결과 → packet 생성기 → runner 1회 | 25 요구 = 충족 5 / 결손 4 / 불명 16, mission 후보 3(핵심부품 성적서→qa_reviewer, DBDD→sw_engineer, ICD→systems_engineer) | 엔진이 처음으로 **정본 규칙 기반**으로 판단 |
| 08-18 | (컴파일만) 계층 등가 검사 | ② 공통 + ③ overlay + ④ vs 통합 스펙 | 27 = 27 (prime_contract 강등 예외 뒤) | 27 정책 재실행은 아래 run 04의 120_CDR에서 완료 |
| 08-18 | `…/ax_se_project_context_pilot_20260818_04` | **전 단계 판단**: SRR·SFR·PDR·CDR·TRR·FCA·PCA 7단계 각각 ②+③+④ 컴파일 → packet 생성 → runner 1회(zero-write, 재실행 바이트 동일) | 엔진 요구 합계 104 = 충족 5 / 결손 4 / 불명 95. CDR 27(5/4/18, 27 정책 재실행 완료), 나머지 6단계는 관측 0 → 전부 불명(SRR 19·SFR 7·PDR 13·TRR 15·FCA 10·PCA 13). 000_REF는 엔진 단계 아님, 240_LL은 정본 필수 항목 없음 | 산출물 `…/06_validation/stage_rules_20260818_02/<stage>/`, `…/ax_se_context_pilot_20260818_04/<stage>/`; 결정 기록 `decision_record.json`(단계별 requirement 토큰 = 관측 확대 backlog). 로컬 과제 폴더 03_Out 스캔은 엔진 요구 폴더에 산출물 0 → 관측 공급 없음 |
| 08-18 | `_workmeta/system/reports/se_stage_rules/generic_layer_cdr_compare_20260818.json` | ① 단독 / ② 단독 / ②+③+④ 120_CDR 비교 | ① 38 / ② 16 / P26-014 27, ①∩② 토큰 9 | 별칭 정합 전 잠정값(02장) |

## 7.2 정본·지식 영수증

| 영수증 | 내용 |
| --- | --- |
| `_workmeta/system/reports/source_research/dapa_se_guidebook_intake_20260818` | 방사청·국방부 정본 확보(13종; 2024 SE 가이드북은 스캔본→OCR) |
| `_workmeta/system/reports/source_research/se_foldertree_variant_source_verification_20260818` | variant 4종 정본 대조(리더 10·comparer 4·critic 1) |
| `_workmeta/system/reports/source_research/generic_se_sources_intake_20260818` | NASA NPR 7123.1D·DoD SE Guidebook 2022·NASA SE Handbook 확보 |
| `_workmeta/system/reports/rag/source_text_indexes/dapa_common_sources_index_build_20260818.json` | 공통 정본 source-text index 12건(청크 2,056) — 엔진·위키가 인용할 수 있는 색인 |
| `_workmeta/system/reports/se_stage_rules/generic_se_base_derivation_20260818.json` | ① 도출 작업 파일 보관 영수증(worksite `_workspaces/knowledge/common/systems_engineering/derivations/generic_se_base_20260818/`) |
| `_workmeta/system/reports/path_length_audit_20260818/` | 경로 길이 감사·이동 매니페스트(52,896 파일 → `_workspaces/_trash_260818/`, 삭제 예정 2026-09-17) |

## 7.3 다시 돌리는 법 (요약)

0. **관측 후보 만들기**(A1, 2026-08-18 착지): `guild_hall/engineering_engine/tools/artifact_observation_inventory_runner.mjs`에
   `--project-root`(과제 폴더)·`--out`(private 실행 폴더)·`--compiled-variant`(사업유형 compiled JSON)·`--overlay`(과제 overlay, 별칭·prime add)를 주고 1회 실행한다.
   `--out` 아래에 `inventory.json`·`candidates.json`·`confirmation_sheet.md`·`confirmation_sheet.json`·`artifact_observations_auto.json`·`receipt.json`이 생기며 이미 있으면 덮어쓰지 않고 거부한다.
   `confirmation_sheet.md`를 Owner가 보고 `confirmation_sheet.json`의 `decision`에 `confirm`/`reject`/`reassign`을 적으면 그것이 2번의 관측이 된다.
   업무폴더 `03_Out` 아래이고 그 업무가 산출물 종류 하나에만 대응하는 줄만 자동 확정이고 나머지는 사람 확인을 기다린다(D37).
1. 스펙·overlay·binding을 읽어 `compileStageRules` 호출(05장) → policy·mapping·receipt를 `_workspaces/<project>/…/06_validation/stage_rules_<date>_<nn>/`에 저장.
2. base packet(직전 accepted run의 packet) + 관측 → `generatePilotPacketFromStageRules` → packet·launch 저장.
3. `guild_hall/engineering_engine/tools/ax_se_project_context_pilot_runner.mjs`로 1회 실행 → `assessment_stdout.json`(effects 전부 0 확인).
4. `_workmeta/<project>/runs/<run>/`에 binding·영수증·결정 기록만(metadata-only) 남긴다. 만들기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"`.
5. 수치를 마스터플랜 CURRENT 표·로드맵 delta log·이 장에 적는다.

새 실행 폴더 이름은 `<subject>_<YYYYMMDD>_<nn>` 관례를 지키고 경로 예산(01장)을 넘기지 않는다.
