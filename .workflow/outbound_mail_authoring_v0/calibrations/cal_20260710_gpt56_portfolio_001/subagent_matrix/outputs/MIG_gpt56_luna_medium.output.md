# Outbound Mail Authoring Deliverable

workflow_id: `outbound_mail_authoring_v0`  
fixture_id: `public_synthetic_korean_draft_with_attachment_selection`  
mode: `new_mail`  
output_state: `draft_only`

## Authoring Scope

- 목적: 인터페이스 검토 패키지 검토 요청 메일 작성
- 수신자: 지정 수신자 있음; 최종 소유자 승인 대기
- 발송면: `draft_only`
- 프로젝트 메일 키워드: `AURORA`
- 내부 프로젝트 코드: 사용하지 않음
- 메일 종류: `검토 요청`
- 첨부 선택 범위: `ATT-FINAL`만 선택
- 누락 입력:
  - 최종 수신자 승인
  - 소유자 메일 본문·제목 승인
  - 푸터 템플릿 또는 Outlook 기본 서명 확인
  - 발송 승인

## Project Keyword Resolution

- resolution_source: active project keyword index
- resolved_keyword: `AURORA`
- internal project code disclosure: prohibited and omitted
- authority note: 프로젝트 키워드의 최종 권한은 프로젝트 로컬 정책 또는 소유자 결정에 있음

## Subject Candidate

`[AURORA] 검토 요청 - 인터페이스 검토 패키지`

상태: 후보안이며 소유자 승인 전까지 확정 제목으로 주장하지 않음.

## Owner-Style Body Draft

안녕하세요.

인터페이스 검토 패키지를 첨부드리오니 검토 부탁드립니다.

검토 후 2026-07-15까지 의견을 회신해 주세요. 필요한 수정 사항이 있으면 표시해 주시고, 수정이 없으면 확인 부탁드립니다.

감사합니다.

[서명 및 회사 보안 안내는 Outlook 기본 서명 또는 소유자 승인 템플릿 확인 후 적용]

## Attachment Selection Basis

- 선택: `ATT-FINAL` — `interface_review_revB.pdf`
  - 상태: current
  - 공유 가능: true
- 제외: `ATT-OLD` — `interface_review_revA.pdf`
  - 상태: superseded
  - 제외 사유: 구버전
- 선택 정책: `ATT-FINAL` 선택, `ATT-OLD` 제외
- 추가 첨부 변경: 소유자 승인 없이 수행하지 않음

## Footer Gap State

- required: `signature_block` 1회, `company_security_notice_block` 1회
- template_available: false
- footer_payload: 저장하거나 포함하지 않음
- 상태: `footer_confirmation_needed`
- 결과: 최종 발송용 본문이 아님; draft-only 유지

## Pre-Send Checklist

| Check | State |
|---|---|
| 수신자 범위 명시 | pending final owner approval |
| 제목이 프로젝트 키워드 규칙과 일치 | pass as candidate |
| 본문 목적 명시 | pass |
| 요청 사항과 기한 명시 | pass |
| 첨부 파일 공유 가능 여부 | pass |
| 첨부 선택 근거 | pass |
| 중복·구버전 첨부 제외 | pass |
| 푸터 블록 각 1회 적용 | blocked: template confirmation needed |
| 내부 코드·비공개 경로·실행 식별자 미포함 | pass |
| 소유자 승인 상태 | not provided |

## Owner Approval Gate

- result: `draft_only`
- owner approval: not provided
- external send: not authorized
- copy-ready final body: not authorized until footer confirmation and owner approval

## Draft-Only Handoff

- surface: `draft_only`
- handoff contents:
  - subject candidate
  - body draft
  - selected attachment reference: `ATT-FINAL`
  - excluded attachment reference: `ATT-OLD`
  - footer confirmation gap
  - owner-facing checklist
- Outlook 변경 또는 전송 수행: 없음
- 수신자·제목·본문·첨부 변경: 소유자 승인 전까지 보류

## Metadata-Only Record Plan

- record_type: outbound mail draft metadata
- workflow_id: `outbound_mail_authoring_v0`
- mode: `new_mail`
- project_mail_keyword: `AURORA`
- subject_gist: interface review package review request
- body_gist: review requested; comments due 2026-07-15; confirm or mark required modifications
- attachment_metadata:
  - selected: `ATT-FINAL`
  - excluded: `ATT-OLD`
- approval_state: not provided
- send_state: draft-only
- footer_state: confirmation needed
- storage boundary:
  - full body, raw HTML, MSG/EML, attachment payload, footer payload 저장 금지
  - metadata record는 원본 메일의 진실 원천이 아님

## Boundary Review

- 외부 발송 권한 없음
- 소유자 승인 주장 없음
- Outlook 변경 또는 Send 동작 주장 없음
- 내부 프로젝트 코드 `DEMO-042`를 제목·본문에 포함하지 않음
- 전체 푸터 내용 저장·복사하지 않음
- 첨부 payload 저장·복사하지 않음
- 제공된 사실 외의 수신자, 날짜, 수치, 주장 추가 없음
- 현재 결과의 claim ceiling: 공개 안전한 소유자 검토용 draft-only 패킷
- 진행 중지 조건:
  - 푸터 확인 전 최종 발송용 본문 확정 금지
  - 소유자 승인 전 외부 발송 금지
  - 수신자 또는 첨부 범위 변경 시 재검토 필요
