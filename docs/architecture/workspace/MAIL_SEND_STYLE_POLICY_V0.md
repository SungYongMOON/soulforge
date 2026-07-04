# MAIL_SEND_STYLE_POLICY_V0

## 목적

- 이 문서는 Soulforge에서 사람이 보낼 메일의 초안, 승인, 발송, 발송 후 기록 기준을 고정한다.
- `MAIL_SEND_V0.md` 는 SMTP runner 와 ledger 저장 위치를 소유하고, 이 문서는 사람이 읽고 보내는 메일의 내용 작성 규칙을 소유한다.
- 목표는 AI 초안이 AI 보고서처럼 보이지 않고, owner 가 실제 업무 메일로 바로 검토할 수 있는 형태가 되게 하는 것이다.

## 적용 범위

- Outlook 에서 owner 가 직접 보내는 새 메일, 답장, 전달 메일.
- `guild-hall:gateway:send-mail` 로 발송하는 owner-approved 메일.
- 프로젝트 자료 송부, 검토 요청, 수정 요청, 확인 요청, 재송부, 일정 공유, 후속 조치 안내.
- Soulforge 내부 운영 상태 메일은 별도 자동화 메일로 다루되, 외부 업무 메일과 같은 승인 경계를 따른다.

## 비적용

- 계약, 법무, 구매, 대외 공식 제출처럼 별도 결재나 회사 양식이 필요한 발송.
- Outlook 폴더 생성, 메일 이동, 규칙 편집, 읽음 처리 같은 mailbox 운영 변경.
- raw mail body, HTML body, `.msg`, `.eml`, attachment payload, secret, token, password 를 읽거나 복사하는 작업.
- owner 가 명시 승인하지 않은 외부 발송.

## owner 분리

| owner | 책임 |
| --- | --- |
| human owner | 최종 수신자, 참조, 첨부, 본문, 발송 여부를 결정한다. |
| AI/Codex | 초안, 제목 후보, 점검표, 발송 후 metadata 기록안을 만든다. 외부 발송 권한은 갖지 않는다. |
| Outlook | owner 의 수동 발송 surface 다. 이 문서는 Outlook 폴더나 규칙을 변경하지 않는다. |
| `guild_hall/gateway/mail_send` | 명시 승인된 SMTP 발송과 local-only send record 생성을 맡는다. |
| `_workspaces/<project_code>/` | 실제 첨부, 산출물, 원문 파일을 둔다. |
| `_workmeta/<project_code>/` | 발송 metadata, 경로 포인터, 크기, 해시, 본문 요지만 기록한다. |
| `private-state/guild_hall/state/**` | cross-project outbound snapshot 과 append-only 발송 로그를 둔다. |

## 발송 권한 단계

| 단계 | 이름 | 허용 | 금지 |
| --- | --- | --- | --- |
| 0 | `draft_only` | 제목/본문 초안과 점검표 작성 | 수신자 확정, 첨부 확정, 외부 발송 |
| 1 | `owner_review_ready` | owner 가 Outlook 에 붙여 넣을 수 있는 최종 초안 작성 | owner 확인 없는 발송 |
| 2 | `owner_approved_send` | owner 가 같은 요청에서 수신자, 제목, 본문, 첨부, 발송 방식을 명시한 경우 발송 실행 | 다른 수신자 추가, 첨부 변경, 본문 임의 확장 |
| 3 | `approved_automation` | 기존 승인된 자동화의 고정 recipient/scope/status mail 발송 | 프로젝트 원문, 메일 본문, 첨부, 새 대외 수신자 포함 |

외부 발송은 기본값이 `draft_only` 이다.
`approved_by` metadata 는 owner 의 현재 요청이나 이미 승인된 자동화 surface 와 연결되어야 한다.

### 승인된 자동화 목록 (`approved_automation`)

| id | surface | recipient scope | 내용 경계 | 승인 |
| --- | --- | --- | --- | --- |
| `owner_20260704_morning_brief_v1` | dev-erp 서버 → `send-mail` runner (자식 프로세스) | dev-erp 활성 계정의 등록 이메일(팀 내부 한정) | 할일 제목·건수·마감일·과제코드 메타만. 메일 원문/첨부/외부 수신자/LLM 생성문 금지 | 2026-07-04 owner |

- 이 클래스의 `EMAIL_SEND_ENABLED=true` 는 secret env 파일을 수정하지 않고 해당 자동화 spawn 에만 주입한다.
- 발신 명의는 **관리자(owner) 계정의 메일함 env 한정**(코드 강제) — 일반 팀원 명의 자동 발송 금지.
- '팀 내부 한정'은 수신 도메인 allowlist(`DEV_ERP_BRIEF_DOMAIN_ALLOW`)로 코드에서 강제하고,
  allowlist 밖 주소는 발송하지 않고 `morning_brief_error(domain_not_allowed)` 로 기록한다.
- 발송 기록은 runner 의 append-only send log + dev-erp `event_log(morning_brief_sent)` 이중으로 남는다.

## 즉시 중단 조건

- 수신자, 참조, 숨은참조 중 하나라도 불명확하다.
- 첨부 파일이 최신본인지, 외부 공유 가능한 파일인지, 실제 첨부할 파일인지 불명확하다.
- 취합자료와 발송자료가 구분되지 않았거나, 같은 발신자/같은 양식의 여러 버전 중 어떤 파일이 최종 발송본인지 불명확하다.
- `_workmeta` 파일을 외부에 첨부하려고 하지만 owner 가 그 파일의 외부 공유 가능성을 명시하지 않았다.
- 본문에 추정, 미검증 수치, 미확정 일정, 내부 판단어가 들어간다.
- secret, token, password, 계정 정보, raw mail body, attachment payload 읽기가 필요하다.
- reply thread 가 필요한데 원본 subject/thread 를 확인하지 못했다.
- 새 외부 수신자에게 AI가 임의로 첫 발송하려 한다.

## 첨부 선별 규칙

`_workspaces` 에 취합한 원첨부 묶음은 source packet 이고, 외부 또는 내부 담당자에게 실제 보내는 첨부 묶음은 send packet 이다.
취합된 파일 전체를 그대로 보내면 안 되며, 발송 전에는 send packet 을 별도로 확정한다.

- 같은 발신자 또는 같은 기관이 같은 목적의 파일을 여러 번 보낸 경우, 기본 발송 대상은 최신 시각의 1개 파일이다.
- 파일명에 `최종`, `수정`, `재송부`, `v숫자` 같은 버전 신호가 있으면 그 신호와 수신 시각을 함께 보고 최신 후보를 고른다.
- 최초 요청자, 고객사, 외부 이해관계자가 보낸 초기 양식이나 요청 메일 첨부는 작성 참고자료로만 취급한다. 그 파일을 다시 보내려면 owner 가 외부 공유/재전달 대상으로 명시해야 한다.
- 내부 작성 담당자에게 자료를 넘길 때도 중복 버전, 초기 양식, 과거본은 제외하고 최종 후보만 보낸다.
- 어떤 파일이 최신본인지, 요청자 자료인지, 담당자 작성자료인지 판단이 흔들리면 발송하지 않고 `ASSUMPTIONS` 에 후보 목록과 확인 질문을 남긴다.
- owner 가 `전체 이력`, `모든 회신 원본`, `감사용 원첨부 전체` 처럼 명시한 경우에만 중복/과거본까지 보낼 수 있다.

## 제목 규칙

### 답장/전달

- 원래 thread 제목을 유지한다.
- Outlook 이 붙이는 `RE:` / `FW:` 외에 AI가 임의 prefix 를 추가하지 않는다.
- 제목이 이미 실제 업무 키워드와 내용을 담고 있으면 수정하지 않는다.
- AI가 내부 회사 프로젝트 번호를 reply 제목에 새로 추가하지 않는다.

### 새 업무/프로젝트 메일

기본 형식:

```text
[<메일 키워드>] <업무구분> - <세부내용>
```

예시:

```text
[기뢰전] 자료송부 - TX PWR BRD 자료
[오링] 수정요청 - 보고자료 치수 및 계산값 정리
```

메일 제목의 bracket keyword 는 외부 메일에서 실제로 쓰는 업무 키워드만 사용한다.
회사 내부 project code, Soulforge project code, project display name 은 제목에 넣지 않는다.
`project_code` 는 routing 과 `_workmeta` 기록용 metadata 로만 남긴다.

키워드 우선순위:

1. 기존 회신 thread 에 이미 있는 bracket keyword
2. project-local mail routing/style rule 에 기록된 keyword
3. owner 가 현재 요청에서 지정한 keyword
4. 업무 내용에서 안전하게 드러나는 짧은 실제 키워드 후보

### 업무구분 후보

- `자료송부`
- `검토요청`
- `수정요청`
- `확인요청`
- `회신요청`
- `일정공유`
- `재송부`
- `첨부누락정정`

메일 키워드가 불명확하면 내부 project code 를 대신 넣지 않는다.
이 경우 기존 상대방 thread 제목을 유지하거나 owner 확인용 `ASSUMPTIONS` 로 멈춘다.

## owner 메일 문체

기본 톤은 짧고 실무적인 한국어 업무 메일이다.

- 첫 문장에 메일 목적을 바로 쓴다.
- 긴 배경 설명보다 요청사항, 첨부, 확인 필요일, 다음 행동을 앞세운다.
- 여러 수정사항은 번호 목록이나 짧은 bullet 로 정리한다.
- 기술 내용은 `확인`, `검토`, `수정`, `반영`, `공유`, `송부`, `재확인` 중심으로 쓴다.
- 결과나 판단은 확정어보다 검토 범위와 후속 확인을 함께 둔다.
- 마무리는 `확인 부탁드립니다.`, `검토 부탁드립니다.`, `수정본 공유 부탁드립니다.` 처럼 짧게 닫는다.
- 실제 발송되는 메일 끝에는 항상 owner Outlook footer block 을 둔다.
- footer block 은 서명 block 과 회사 보안 문구 block 으로 구성한다.
- Outlook 기본 서명은 논리 이름 `서명+보안` 을 우선 사용한다. 계정명이 붙은 실제 서명 이름과 footer 본문은 Outlook/local private runtime 에 둔다.
- Outlook 이 기본 서명/보안 문구를 자동 삽입하는 경우 본문은 그 위에 작성하고, footer block 을 삭제하거나 중복 삽입하지 않는다.
- Outlook 밖에서 복사용 최종 본문을 작성하는 경우 owner-approved local/private footer template 을 사용한다. 정확한 footer template 이 없으면 `owner_review_ready` 로 보내지 않고 발송 전 확인에서 멈춘다.

## footer 규칙

보낸편지함 샘플에서 관찰된 owner footer 는 아래 순서다.

1. 짧은 마무리 문장
2. 서명 block
3. 회사 보안 문구 block

공개 문서에는 실제 연락처, 개인 식별 정보, 회사 보안 문구 전문을 저장하지 않는다.
정확한 footer 내용은 Outlook 기본 서명 또는 local/private footer template 이 소유한다.

AI 초안의 footer 처리 규칙:

- Outlook 수동 작성: Outlook 이 삽입한 서명/보안 문구를 유지하고 본문만 그 위에 쓴다.
- Outlook 기본 서명이 `서명+보안` 이 아니거나 보안 문구가 자동 삽입되지 않으면, 발송 전 확인에서 멈추고 owner 지시가 있을 때만 Outlook 서명 설정을 바로잡는다.
- 복사용 최종 본문: local/private footer template 이 확인된 경우에만 본문 끝에 서명 block 과 보안 문구 block 을 붙인다.
- footer template 미확인: 본문 초안만 작성하고 발송 전 확인에 `서명/보안 footer 확인 필요` 를 남긴다.
- 최종 발송 전에는 서명 block 과 보안 문구 block 이 각각 1회 포함되어야 한다.

## 지양 문체

- `AI가 확인한 결과`, `시스템상`, `claim ceiling`, `boundary`, `metadata-only` 같은 내부 용어.
- 과한 사과, 긴 변명, 방어적인 한계 설명.
- `도움이 되었으면 좋겠습니다`, `편하실 때`, `좋은 하루 되세요` 같은 일반 챗봇형 문장.
- 상대방에게 결정권을 넘기지 않는 단정 표현.
- 메일 하나에 서로 다른 요청을 많이 섞는 구성.
- 본문에 private path, hash, internal run id, raw source ref 를 직접 노출하는 방식.

## 기본 본문 구조

### 짧은 자료 송부

```text
안녕하세요.

요청하신 자료 송부드립니다.

첨부:
- <파일명>

확인 부탁드립니다.

<서명 block>
<보안 문구 block>
```

### 검토 또는 수정 요청

```text
안녕하세요.

검토 중 확인된 수정 필요사항 공유드립니다.

수정 요청사항:
1. <수정 항목>
2. <수정 항목>
3. <수정 항목>

첨부:
- <검토 메모 또는 기준 자료>

수정본 공유해주시면 전달 전 다시 확인하겠습니다.

<서명 block>
<보안 문구 block>
```

### 첨부 누락 정정

```text
안녕하세요.

방금 보낸 메일에 첨부가 누락되어 다시 송부드립니다.

첨부 파일에 수정 필요사항을 정리했습니다.
확인 부탁드립니다.

<서명 block>
<보안 문구 block>
```

### 확인 요청

```text
안녕하세요.

아래 항목 확인 부탁드립니다.

확인 필요사항:
1. <확인 항목>
2. <확인 항목>

회신 가능 일정도 함께 공유 부탁드립니다.

<서명 block>
<보안 문구 block>
```

## 초안 작성 입력 packet

AI가 owner 스타일로 메일을 쓰려면 아래 입력을 먼저 확보한다.

```yaml
mail_kind: 자료송부 | 검토요청 | 수정요청 | 확인요청 | 회신요청 | 재송부 | 기타
send_surface: outlook_manual | soulforge_send_mail | draft_only
thread_mode: new | reply | forward
project_code: internal metadata only, not for outgoing subject/body
project_mail_keyword:
recipient_to:
recipient_cc:
recipient_bcc:
subject_source: owner_given | existing_thread | generated
requested_action:
attachment_refs:
attachment_selection_basis: latest_only | owner_selected | all_history_explicitly_requested | unclear
attachment_sender_roles: requester | contributor | internal_reviewer | external_stakeholder | unknown
deadline_or_reply_need:
source_basis:
external_share_confirmed: true | false
```

필수 입력이 없으면 초안 아래에 `ASSUMPTIONS` 를 먼저 적고, 발송 단계는 `draft_only` 로 고정한다.

## AI 초안 출력 shape

```text
ASSUMPTIONS
- <불명확하거나 owner 확인이 필요한 항목>

제목
<제목 후보>

본문
<메일 본문>
<서명 block>
<보안 문구 block>

발송 전 확인
- 수신자:
- 참조:
- 첨부:
- 서명/보안 footer:
- thread:
- owner 승인:

기록 위치
- <_workmeta 또는 private-state metadata 기록 후보>
```

`ASSUMPTIONS` 가 비어 있고 owner 가 명시 승인한 경우에만 발송 실행을 검토할 수 있다.

## 발송 전 점검

1. 제목이 reply thread 또는 실제 메일 키워드 규칙과 맞는가.
2. 본문 첫 문장에 목적이 드러나는가.
3. 요청사항, 첨부, 확인 필요일, 다음 행동이 빠지지 않았는가.
4. 첨부 파일이 실제 존재하고 외부 공유 가능한 최신본인가.
5. 취합자료 전체와 발송자료 선별본이 분리되어 있고, 중복/과거 버전이 제외되었는가.
6. 요청자, 고객사, 외부 이해관계자 자료를 재전달하는 경우 owner 가 명시 승인했는가.
7. 수신자, 참조, 숨은참조가 owner 지시와 일치하는가.
8. 내부 용어, private path, secret, raw mail/source 내용이 본문에 없는가.
9. AI가 미검증 수치나 일정 약속을 만들어 넣지 않았는가.
10. 발송 후 metadata 기록 위치가 정해졌는가.
11. 서명 block 과 보안 문구 block 이 정확히 1회 포함되어 있는가.

## 발송 후 기록

프로젝트가 있는 메일은 `_workmeta/<project_code>/reports/mail_history/YYYYMMDD_<slug>.md` 에 metadata-only 로 기록한다.

기록 항목:

- project code 와 표시명
- 발송 시각
- 제목
- 수신자 요약
- 발송 방식
- 첨부명, 경로 포인터, 크기, 해시
- 본문 요지
- 후속 조치
- 원문/첨부 보관 방침

금지:

- 메일 본문 전체 복사
- raw HTML 복사
- `.msg` / `.eml` 파일을 `_workmeta` 에 저장
- 첨부 payload 를 `_workmeta` 에 저장
- secret, token, private mailbox state 기록

프로젝트가 불명확한 회사 업무 메일은 `P00-000_INBOX` 로 보류하고, 프로젝트 확정 전에는 public repo 에 기록하지 않는다.

## Outlook 수동 발송 규칙

- AI는 Outlook 창 조작이나 붙여넣기 도움을 줄 수 있지만, owner 가 명시하지 않은 발송 버튼 클릭은 하지 않는다.
- 답장은 원본 thread 에서 작성한다.
- 전달 메일은 원문 chain 과 첨부가 외부 공유 가능한지 확인한 뒤 작성한다.
- Outlook folder/rule 작업은 `outlook_mail_reconcile_v0` 또는 별도 Outlook operations task 로 분리한다.

## `send-mail` runner 규칙

- `EMAIL_SEND_ENABLED=true` 와 owner 승인 metadata 가 모두 필요하다.
- `--dry-run` 은 초안 검증에 사용할 수 있다.
- 실제 발송은 `MAIL_SEND_V0.md` 의 outbound snapshot 과 append-only send log 를 남긴다.
- SMTP secret 값은 env/local secret file 에만 있고, 명령 출력이나 문서에 쓰지 않는다.

## ASSUMPTIONS

- 현재 v0 는 owner 가 이미 보여준 프로젝트 메일 이력 요약, Outlook 발송 metadata, 팀 보고서 tone profile, 기존 mail send runner 계약을 기준으로 잡은 문체 규칙이다.
- raw sent mail corpus 전체를 본문 단위로 학습하거나 저장하지 않았다.
- 프로젝트별 고객/상대방이 별도 제목 키워드 규칙을 요구하면 이 문서보다 해당 project-local rule 이 우선한다.
