# experiment_report_authoring_v0

## 무엇을 하는가

`experiment_report_authoring_v0`는 프로젝트 실험, 시험, 기술검토 결과를 팀 공통 보고서 형태로 작성하기 위한 authoring workflow 초안이다.

이 workflow는 다음을 만든다.

- 보고서 작성 범위와 검토 범위
- 원본/분석/산출물 ref 기반 evidence map
- 팀 공통 실험 보고서 목차를 따른 Markdown 정본 초안
- 사람 검토용 HTML 검토본 작성 준비
- 고려사항, 한계, 후속 조치, 문서 관리 항목
- public/private/raw/secret 경계 검토 note

이 workflow는 시험 결과를 계약상 수락/합격, 인증, 단계 통과, 고객 승인으로 확정하지 않는다.

## 왜 필요한가

현재 Soulforge에는 `SOULFORGE_REPORT_FORMAT_V0.md`가 있어 보고서 산출물의 기본 형식과 저장 규칙은 정해져 있다.

하지만 실제 팀 실험 보고서를 작성할 때 다음 항목은 별도 실행 절차로 고정되어 있지 않았다.

- 어떤 입력을 먼저 확인할지
- 공통 목차를 어디에 두고 어떻게 가져다 쓸지
- 취득 데이터와 분석 결과를 보고서 어느 항목에 연결할지
- 확인 가능한 결론과 단정 불가 항목을 어떻게 분리할지
- Markdown 기준본, HTML 검토본, 원본 데이터 위치를 어떻게 나눌지

이 workflow 초안은 그 작성 절차를 채운다.

## 현재 성숙도

- 위치: `.workflow/authoring/`
- 상태: `draft`
- canon 등록: 아직 아님
- 현재 주장 한계:
  - 보고서 작성 절차 초안: 가능
  - 팀 공통 실험 보고서 목차 reference: 가능
  - project-local 보고서 pilot 적용: 가능
  - 공식 문서 표준 확정: 불가
  - 계약상 수락/합격 판정: 불가

## 입력

- `report_authoring_scope`
- `project_binding`
- `source_and_data_refs`
- `analysis_result_refs`
- `review_question_list`

선택 입력으로 외부 요청사항, 메일/회의 ref, 기존 보고서 ref, 후속 액션 register ref, 교정/계측 조건 ref를 받을 수 있다.

## 출력

- `report_scope_packet`
- `evidence_map`
- `markdown_report_draft`
- `html_review_plan`
- `open_gap_and_next_action_register`
- `boundary_review_note`

## 참고 목차

팀 공통 실험 보고서 목차는 `templates/experiment_report_outline.reference.md`에 둔다.

workflow 실행자는 이 reference를 그대로 복사하거나, 시험 성격에 맞게 항목명을 약간 조정하되 다음 spine은 유지한다.

```text
문서 개요 -> 시험 목적 -> 시험 대상 및 조건 -> 취득 데이터 -> 요청 및 검토 항목
-> 분석 방법 -> 시험 결과 -> 결과 해석 -> 고려사항 및 한계
-> 종합 판단 -> 후속 조치 -> 문서 관리
```

## 보고서 문체와 HTML 목차

실제 시험/기술검토 보고서는 시스템 경고문이나 AI 보조 설명처럼 보이면 안 된다.
검토 범위와 판정 한계는 별도 배너 문장으로 크게 쓰기보다 `문서 개요`, `자료 성격`, `검토 범위`, `본 자료만으로 판단하지 않는 항목`에 녹여 쓴다.

권장 표현:

```text
수조시험 계측 결과에 대한 기술 검토 자료이며, 계약상 수락 판정·고객 승인·최종 합격 기준 적용은 별도 확인 대상이다.
```

핵심 요약은 파일명과 계산값을 한 줄씩 나열하지 않는다. 먼저 검토 대상을 한 문장으로 제시하고, 그 다음 `검토 항목 / 결과 요약` 표로 판단, 핵심 수치, 해석 한계를 함께 정리한다. 파일명, 채널명, 원시 계산 절차는 필요할 때만 근거로 넣고, “관찰했다”, “비교했다”가 반복되는 작업 로그 문체는 피한다.

거리 환산값처럼 시험 조건에 따라 달라지는 수치는 확정 거리처럼 쓰지 않는다. 예를 들어 `c = 1500 m/s` 가정으로 환산한 값은 `시험 배치 검토용 환산값`처럼 용도를 붙여 쓴다. 같은 취득 데이터 안에서 만든 replica 비교는 `동일 취득분 기준 비교`로 쓰고, owner-facing 보고서에는 `shot`, `self-replica`, `upper-bound` 같은 내부 분석 jargon을 그대로 노출하지 않는다.

피할 표현:

```text
이 문서는 ... 아닙니다.
공식 판정이 아닙니다.
합격/불합격 기록이 아닙니다.
```

HTML 검토본을 만들 때는 Markdown 제목 자체가 `1. 문서 개요`, `2. 시험 목적`처럼 번호를 포함하는 경우가 많다. 이때 목차 wrapper는 번호 있는 `ol`을 쓰지 않고 marker 없는 목록으로 렌더링한다. 그렇지 않으면 브라우저에서 자동 목차 번호와 제목 번호가 중복된다.

## 절대 하지 않는 것

- 원본 데이터, 대용량 첨부, 메일 원문, Office/PDF/HWP/HWPX 원문을 public workflow package에 저장
- secret, token, credential, session 정보 저장
- project-local raw payload를 `_workmeta` 보고서 본문에 복제
- 시험 결과를 계약상 수락/합격, 단계 통과, 고객 승인으로 확정
- 기존 source, 분석 산출물, project metadata를 workflow 실행 중 임의 수정

## 다음 승격 조건

이 draft를 `.workflow/<workflow_id>/` canon entry로 승격하려면 적어도 아래 증거가 더 필요하다.

1. project-local 실험 보고서 1건 이상에 controlled pilot 적용
2. Markdown 기준본과 HTML 검토본이 같은 근거와 결론을 유지하는지 확인
3. 팀 공통 목차가 실제 보고서 작성에서 과도하거나 부족하지 않은지 owner review
4. raw/private/secret 경계 검토 통과
5. manager registration decision
