# 06. 요구사항 추적 (계약 요구 → 산출물 → 시험 커버리지)

설계 정본: `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`(R1~R4, D36~D41, §8.2 결정 기록). 코드: `guild_hall/requirement_trace/`.
02~05장이 "이 단계에 어떤 **산출물**이 있어야 하나"를 다뤘다면, 이 장은 "계약의 **요구 하나하나**가 어떤 산출물·시험으로 덮였나"를 다룬다. 두 축은 같은 어휘(`artifact_type_id`)와 같은 엔진 GAP 값으로 만난다.

## 6.1 흐름

```text
계약 요구사양서(exact revision) → 요구 ID 색인(ID·절·쪽·블록 해시; 자동은 candidate만, D37)
  → 파생(SSRS→HRS/SRS/ICD, derived_from) → Needs 선언(어떤 requirement_kind를 어떤 stage에서 어떤 artifact_type이 덮어야 하나; 기존 stage_expected_artifact_policy 확장, D38)
  → 산출물·시험 관측(artifact_revision covers|verifies requirement_revision)
  → 커버리지 셀 satisfied | gap_missing | gap_unknown | gap_conflict | unexpected_observed(고아)
  → 게이트 준비도(진입기준/성공기준 분리) → 엔진 packet → [별도 게이트] 수락 → [별도 게이트] Owner 결정
```

fail-closed: 미관측은 `gap_unknown`, 개정 미지정 ref는 거부, 상충은 `gap_conflict`(부재·충족으로 접지 않음), Needs 미선언은 `gap_unknown`, 구 개정을 덮는 관측은 `coverage_revision_stale` + `gap_unknown`(D39: 별도 enum은 미결). 고아 관측은 지우지 않고 센다.

## 6.2 조각별 착지 상태

| 조각 | 내용 | 상태(2026-08-18) |
| --- | --- | --- |
| R1 계약 고정·순수 함수 | `computeRequirementCoverage(input)`: 요구·Needs·관측·위험·stage·cutoff 2종(`valid_at`,`known_at`) → 셀·요구 상태·고아·게이트 준비도·payload 없는 영수증 | 착지. 결정론·양시간축 재생·fail-closed·deep-freeze·정적 pin 시험 |
| R1 선행 조각 | 프로젝트 PDF 요구 ID 색인 seam(`식별자` 블록 결정론 추출) | 착지(P26-014 계약자료 118 ID 색인) |
| R2 준비 조각 | `coverage_input_builder.mjs`: 색인 1건 + Needs 정책(`soulforge.requirement_needs_policy.v0`) 1건 + 산출물 단위 관측 → R1 입력 + provenance manifest + 영수증. hold 사유 전건 기록(중복 ID가 최우선, `faults[]`), Needs 미선언은 그대로 R1로, unbound 관측은 manifest에, `PRESENCE_SEMANTICS`(inconclusive/satisfies) 2종, cutoff 밖 binding 거부, 문서 정체성 기반 신선도(BINDING_INCOMPLETE) | 착지(시험 26). 검토 수정: cutoff 교차검사, faults[], covered_document_ref, 정책 digest 정렬, 패턴 가드 |
| R2 본체 | JSONL 원장 4종 writer(`requirements/`, `requirement_needs/`, `coverage_observations/`, `decisions/`), CSV 7종 g0 동결, 재생 parity | **미착수**. 시드는 자동 추출이 아니라 Owner 승인 소량 pin(rtm 25 + contract_sow 18, 한 stage)부터 |
| R3 투영·엔진 packet | 커버리지 generation 생성기 + packet → runner 1회 | 단계 규칙 쪽 packet 생성기(05장)는 착지; 커버리지 generation 생성기는 미착수 |
| R4 카드·ERP read model·MCP 뷰·수락 게이트 | 얇은 RTM 카드, SQLite read model, MCP 뷰 4종, 7조건 게이트 리포트 | 미착수 |

## 6.3 Needs 정책은 어디서 오나

- Needs 선언 = "requirement_kind × stage → needed artifact_type". 정본은 별도 store가 아니라 `stage_expected_artifact_policy`의 확장(D38)이고, 컴파일러의 `needs_stage_declarations`(05장)가 stage·어휘 선언을 낸다.
- P26-014 첫 실측(요구 118 + Needs 정책 후보): 셀 충족 31 / 결손 95 / 미시도 44 / 미선언 52(run 01) — Needs 정책 후보의 산출물 ID를 표준어로 치환한 run 02는 수치 동일. Needs 정책 **후보** 자체는 Owner 확인 대기.
- 색인 중복 ID 4쌍은 D40 판정 대기(자동 병합 금지, conflict 보존).

## 6.4 "메모리" 판단(설계 §3·§4 요약)

- 과제 맥락은 순수 메모리도 순수 그래프도 아니고 **append-only 사실 원장 + 재생 가능한 타입 그래프·RTM 투영 + 별도 수락 게이트 + 얇은 카드**다. 원장이 진실, 그래프·카드는 재생 산물.
- Graph DB는 §4.4 트리거(규모·질의 패턴) 전에는 도입하지 않는다(D41). 도입 시 backup/restore 분류와 synthetic restore gate 선행.
- 3계층(핫/웜/콜드)과 만료·압축 규칙은 수년 과제를 전제한다.
