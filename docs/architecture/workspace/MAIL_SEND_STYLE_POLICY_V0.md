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
| AI/Codex | 초안, 제목 후보, 점검표, 발송 후 metadata 기록안을 만든다. 상시 외부 발송 권한은 없으며, 별도의 현재 owner 명시 지시가 있을 때만 정확히 잠긴 현재 초안을 제한된 executor로 1회 발송할 수 있다. |
| Outlook | owner 의 수동 또는 owner가 명시한 제한적 local executor 발송 surface 다. 이 문서는 Outlook 폴더나 규칙을 변경하지 않는다. |
| `guild_hall/gateway/mail_send` | 명시 승인된 SMTP 발송과 local-only send record 생성을 맡는다. |
| `_workspaces/<project_code>/` | 실제 첨부, 산출물, 원문 파일을 둔다. |
| `_workmeta/<project_code>/` | 발송 metadata, 경로 포인터, 크기, 해시, 본문 요지만 기록한다. |
| `private-state/guild_hall/state/**` | cross-project outbound snapshot 과 append-only 발송 로그를 둔다. |

## 발송 권한 단계

| 단계 | 이름 | 허용 | 금지 |
| --- | --- | --- | --- |
| 0 | `draft_only` | 제목/본문 초안과 점검표 작성 | 수신자 확정, 첨부 확정, 외부 발송 |
| 1 | `owner_review_ready` | owner 가 Outlook 에 붙여 넣을 수 있는 최종 초안 작성 | owner 확인 없는 발송 |
| 2 | `owner_approved_send` | 같은 bounded 메일 작업에서 owner가 수신자, 제목, 본문, 첨부, 발송 방식을 승인해 trusted lock에 묶었고, 이후 별도의 현재 발송 지시를 명시한 경우 정확히 잠긴 초안 발송 실행 | 다른 수신자 추가, 첨부 변경, 본문 임의 확장 |
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

기존 보낸메일이나 특정 개인의 메일 형식은 품질 기준 또는 정답으로 사용하지 않는다. 이 정책의 구조 기준은 아래 외부 근거와 승인된 업무 사실이다. 로컬/private owner voice profile 은 owner 가 별도로 요청한 경우에만 말끝, 문장 길이 같은 표면 문체를 제한적으로 보조하며, 구조 선택·사실 판단·행동/기한 추출을 덮어쓰지 않는다. profile 사용 시 집계 대상·건수·관찰 방식 같은 provenance 를 함께 확인하고, 정확한 샘플 문장·연락처·raw address·footer 전문·private path·project row 는 public 문서나 초안 packet 으로 복사하지 않는다.

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

발송용 footer 는 아래 순서로 처리한다.

1. 짧은 마무리 문장
2. 서명 block
3. 회사 보안 문구 block

공개 문서에는 실제 연락처, 개인 식별 정보, 회사 보안 문구 전문을 저장하지 않는다.
정확한 footer 내용은 Outlook 기본 서명 또는 local/private footer template 이 소유한다.

AI 초안의 footer 처리 규칙:

- Outlook 수동 작성: Outlook 이 삽입한 서명/보안 문구를 유지하고 본문만 그 위에 쓴다.
- Outlook local programmatic 작성: 논리 이름으로 승인된 `.rtf` 서명을 Word editor 본문에 삽입하되 `Range.InsertFile`의 `Attachment` 인수를 명시적으로 `false`로 둔다. 저장 전에 본문 content 증가와 `.rtf` 첨부 0건을 모두 확인하고, 실패하면 삽입 변경을 저장하지 않고 폐기한다.
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

## 본문 렌더링 원칙

AI가 사용하는 `outbound_team_mail_context_v1` 메타데이터는 항상 완전한
구조로 유지한다. 사람이 읽는 본문은 메일 목적과 복잡도에 맞춰 필요한
구역만 표시한다. 시각적 표제는 메타데이터 원천이 아니며, 빈 표제나
`해당 없음` placeholder 를 만들지 않는다.

| mode | 적용 | 본문 구조 |
| --- | --- | --- |
| `compact` | 단일 목적, 단순 공유, 짧은 답장 | 첫 1~3문장에 목적/행동. 고정 표제 없음 |
| `action_brief` | 복수 업무·담당자, 기한, 회신 요구, 기술 근거가 겹침 | 채워진 항목만 `수신/사유/요청업무/요청기한/요청사유/비고` |
| `decision_brief` | 승인·선택·의사결정 필요 | 결정 요청 → 권고안 → 대안/영향 → 기한 → 근거 |
| `status_change` | 일정·상태 변경이 주목적 | 변경 요약 → 전/후 → 영향 → 후속 조치 |
| `reply_map` | 둘 이상의 질문·요청에 회신 | 원 항목 번호에 1:1로 답변 |

`action_brief`의 6개 표제도 모두 강제하지 않는다.

- `수신`: Outlook TO/CC를 복사하는 필드가 아니다. 복수 역할 또는 실제 담당자의 책임을 구분할 때만 표시한다.
- `사유`: 왜 지금 이 메일을 보내는지 한 줄로 표시한다.
- `요청업무`: 담당자별 행동을 분리한다.
- `요청기한`: 실제 deadline 또는 reply-by가 있을 때만 표시한다.
- `요청사유`: 요청을 뒷받침하는 사실·원인·기술 근거가 있을 때만 표시한다. `사유`와 중복되면 합치고 생략한다.
- `비고`: 첨부, 형식, 제약, 보안 안내 또는 전역 메모가 있을 때만 표시한다.

### 기술 요청 action brief

승인된 기술 상수·계산식·제어 조건, 실행 또는 시험 순서, 회신받을 결과
증거가 한 메일에 함께 있으면 `action_brief` 안에서 기술 요청 구조를 쓴다.
별도 mode 를 만들지 않는다.

1. 첫 문장: 목적 또는 재송부 사유를 먼저 밝힌다.
2. 목적: 유지 동작, 변경 범위, 제외 범위, 이상 시 동작을 짧게 구분한다.
3. 기술 조건: 관련 상수·판정·제어 조건을 표 하나에 묶고 산문으로 반복하지 않는다.
4. 실행/시험: 실제 수행 순서만 번호 목록으로 쓴다.
5. 회신 증거: revision, 측정값, 로그, 전후 비교, 남은 문제를 별도 목록으로 쓴다.
6. 기한·첨부·후속조치: 값이 있을 때만 표시하고 `해당 없음`을 만들지 않는다.

공개 합성 예시는
`.workflow/outbound_mail_authoring_v0/templates/technical_action_brief.example.md`
가 소유한다. 이 예시는 구조만 보여 주며 실제 메일 원문, 연락처, 프로젝트
수치, footer 또는 발송 권한의 근거가 아니다. 예시의 placeholder 를 기술
사실로 복사하거나 승인되지 않은 상수·계산식·제어 방향을 만들어서는 안 된다.

갈등, 협상, 평판/감정 위험, 빠른 왕복 논의, 중대한 모호성이 있으면
긴 구조화 이메일로 해결하려 하지 않는다. 실시간 협의를 권고하고,
이메일은 의제 또는 합의된 결정·담당자·기한 기록으로 사용한다. 이
권고는 발송 권한을 높이지 않으며 기본값은 계속 `draft_only` 다.

선택 규칙의 정본은
`.workflow/outbound_mail_authoring_v0/templates/mail_render_policy.template.yaml`,
결정적 검사는 `scripts/select_mail_render_mode.mjs`가 소유한다.

### Outlook 가독성 프리셋

구조화 mode에는 별도 재지시가 없어도 `owner_outlook_readability_v1`을 기본 적용한다.
정본은 `.workflow/outbound_mail_authoring_v0/templates/outlook_readability_preset_v1.yaml`이다.

- 본문, bullet, 표는 맑은 고딕 10 pt와 본문 간격을 일관되게 쓴다.
- 구역 표제는 맑은 고딕 11 pt bold, 앞 12 pt/뒤 6 pt, 하단 선을 쓴다.
- 요청이나 회신기한이 있으면 `1. 요청사항` 독립 구역을 가장 먼저 두고 그 안에 요청 내용과 기한을 함께 표시한다.
- 이후 채워진 구역을 `2.`부터 연속 번호로 표시하고, 빈 구역을 생략한 뒤 전체 번호를 다시 맞춘다. 요청사항 구역이 없으면 첫 가시 구역이 `1.`부터 시작한다.
- 병렬 항목은 bullet, 반복 필드나 관련 값 3개 이상은 표를 사용한다.
- Outlook 업무 표는 창 폭에 맞춰 자동 확장하지 않는다. 기본은 왼쪽 정렬 고정 폭
  470 pt(약 16.6 cm) 이내로 두고, 열은 그 폭 안에서 내용 비중에 따라 배분하며
  긴 내용은 셀 안에서 줄바꿈한다. owner의 최신 지시가 있을 때만 다른 폭을 적용한다.
  적용 결과는 저장 후 초안을 닫았다 다시 열어도 실제 폭이 유지되는지 확인한다.
- 빈 첨부·비고·후속 조치 구역과 `해당 없음` placeholder는 만들지 않는다.

이 프리셋은 authoring 결과에 포함되는 render plan이다. authoring workflow나 얇은
launcher는 Outlook 항목을 생성·수정하거나 메일을 발송하지 않는다. Outlook 초안에
실제 적용하려면 현재 요청에서 owner가 승인한 별도 executor handoff가 필요하며,
발송 승인은 다시 별도 경계로 유지한다. 정확한 서명·footer payload는 계속
Outlook/local private runtime에만 둔다.

## 기본 본문 예시

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
communication_intent: auto | simple_share | request_action | request_decision | status_change | answer_points
render_mode_preference: auto | compact | action_brief | decision_brief | status_change | reply_map
reply_item_count: 0
channel_risk_flags: []
send_surface: outlook_manual | soulforge_send_mail | draft_only
thread_mode: new | reply | forward
project_code: internal metadata only, not for outgoing subject/body
project_mail_keyword:
recipient_to:
recipient_cc:
recipient_bcc:
subject_source: owner_given | existing_thread | generated
team_mail_context_schema: outbound_team_mail_context_v1
mail_reason:
requested_work_by_assignee: []
global_notes: []
facts: []
schedule:
  before: null
  after: null
  rationale: null
  deadline_or_reply_by: null
participants: []
format_and_examples: []
attachment_refs:
attachment_selection_basis: latest_only | owner_selected | all_history_explicitly_requested | unclear
attachment_sender_roles: requester | contributor | internal_reviewer | external_stakeholder | unknown
response_requirements: []
source_basis:
external_share_confirmed: true | false
```

필수 입력이 없으면 초안 아래에 `ASSUMPTIONS` 를 먼저 적고, 발송 단계는 `draft_only` 로 고정한다.

팀이 AI에 업무 맥락을 전달할 때는 `.workflow/outbound_mail_authoring_v0/templates/team_mail_context.template.yaml` 의 `outbound_team_mail_context_v1` shape 을 사용한다. 이 template 은 역할만 담는 `to`/`cc`/`bcc` 수신자와 이유, 메일 사유, 실제 담당자별 요청 업무와 메모, 전역 메모, 사실, 일정의 before/after/rationale/deadline-or-reply-by, 참여자별 관여 내용, 요청 형식/예시 설명, 첨부 metadata, 회신 요구, assumptions 를 분리한다. 실제 주소나 private 경로 대신 역할과 승인된 사실만 적는다.

기존 `outbound_team_mail_context_v0` 입력은 workflow 의 compatibility map 으로 v1 하나에만 정규화한다. 의미가 명확한 값만 직접 옮기고, 실제 담당자·일정·참여 관계처럼 의미가 겹치는 public-safe 값은 source path 와 값을 `assumptions` 에 보존한다. keyword, 수신자, 첨부, footer, 승인, 정규화 과정에서 파생된 모든 gap 도 본문을 만들기 전에 v1 `assumptions` 에 병합하며, 별도 출력하는 ASSUMPTIONS 와 같은 내용을 유지한다. 수신자나 참여자를 담당자로 추정하지 않으며 v0/v1 필드를 한 packet 에 함께 내보내지 않는다. 선언 flag뿐 아니라 값 검사에서 이메일·강한 전화번호 형식, 구체적인 절대/private runtime 경로, 인용 메일 헤더 체인, footer-security 고지 문구가 발견되어도 그 값을 assumptions 로 복사하지 않고 정규화를 중단한다. 일반 날짜, 구분자 없는 숫자 식별자, 부품번호는 연락처로 판정하지 않는다. 미해결 정규화가 있으면 발송 권한은 `draft_only` 로 유지한다.

## AI 재수집 가능한 업무 메일

사람의 가독성과 이후 AI 업무 인식을 함께 확보하기 위해, 업무 수행·검토·결정·회신을
요청하는 메일은 본문만으로도 최소 업무 구조를 복원할 수 있어야 한다.

핵심 표시 필드는 다음과 같다.

- `수신`: 승인된 표시 이름과 역할만 사용하고 실제 주소는 본문에 복제하지 않는다.
- `사유`: 지금 메일을 보내는 이유를 한 줄로 쓴다.
- `목적`: 메일을 통해 얻으려는 결과나 결정을 쓴다.
- `요청 업무`: 실제 담당자와 구체적인 행동을 쓴다.
- `회신기한`: 승인된 기한이 있을 때만 표시한다. 일정이 중요한데 값이 없으면 묵시적으로 생략하지 않고 초안 상태에서 확인한다.
- `완료·회신 기준`: 결정, revision, 측정값, 결과서처럼 요청 종료를 판단할 증거를 쓴다.

업무 특성에 따라 `변경 전/후`, `변경·요청 사유`, `적용 방안`, `적용 대상품`,
`검토 사안`, `참여 부서`, `첨부`, `비고`를 조건부로 추가한다. 근거가 없는 빈 필드는
`해당 없음`으로 채우지 않고 생략한다.

관련 기술값이 세 개 이상이면 `항목/적용값/비고` 표 하나로 묶는다. 복수 담당자는
`담당자/선행조건/요청 업무/완료·회신 기준` 표 하나로 구분한다. 이 표에서 의존성과
완료 조건이 이미 드러나면 별도 `처리 순서`는 만들지 않는다. 실제 시험·구현 순서처럼
순서 자체가 중요한 경우에만 번호 목록을 사용한다.

본문 반환 전에는 메일만 읽고도 수신자, 사유, 목적, 담당자별 행동, 적용 범위, 선행조건,
승인된 기한, 완료 증거를 추출할 수 있는지 확인한다. 개인 메일 원문, 실명 사례, 실제
주소, 비공개 경로는 이 공통 규칙의 근거로 복사하지 않는다.

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
Outlook 수동 초안은 출력 packet 과 점검표에 `requested_send_surface: outlook_manual` 과 `authority_state: draft_only` 를 각각 명시한다. gap 만 나열하고 권한 상태를 암시하는 것으로 갈음하지 않는다.

## 발송 전 점검

1. 제목이 reply thread 또는 실제 메일 키워드 규칙과 맞는가.
2. 본문 첫 문장에 목적이 드러나는가.
3. 요청사항, 첨부, 확인 필요일, 다음 행동이 빠지지 않았는가.
4. 담당자가 여러 명이면 각 담당자의 요청 업무와 메모가 서로 섞이지 않았는가.
5. 전역 메모, 사실, 일정 before/after/rationale/deadline, 참여 관계, 요청 형식/예시, 첨부, 회신 요구가 초안과 점검표에 보존되었는가.
6. render mode와 선택 이유가 기록되었고, 빈 표제 없이 필요한 구역만 표시되었는가.
7. 본문이 compact 여도 전체 v1 메타데이터 coverage 가 줄지 않았는가.
8. 첨부 파일이 실제 존재하고 외부 공유 가능한 최신본인가.
9. 취합자료 전체와 발송자료 선별본이 분리되어 있고, 중복/과거 버전이 제외되었는가.
10. 요청자, 고객사, 외부 이해관계자 자료를 재전달하는 경우 owner 가 명시 승인했는가.
11. 수신자, 참조, 숨은참조가 owner 지시와 일치하는가.
12. 내부 용어, private path, secret, raw mail/source 내용이 본문에 없는가.
13. AI가 미검증 수치나 일정 약속을 만들어 넣지 않았는가.
14. 발송 후 metadata 기록 위치가 정해졌는가.
15. 서명 block 과 보안 문구 block 이 정확히 1회 포함되어 있는가.
16. 같은 업무의 후속 지시라면 제목, 수신자 순서, 본문 수정, 첨부, control surface, 논리 서명, runtime-private Outlook StoreID/EntryID binding이 현재 검증값과 일치하는가.
17. 별도 현재 발송 지시가 있다면 정확히 잠긴 초안 하나만 대상으로 `.Send()`를 최대 1회 호출하도록 제한했는가.
18. 발송 결과가 불명확하면 자동 재발송하지 않고 Sent Items와 Outbox 확인 결과를 그대로 보고하는가.

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
- 같은 bounded 메일 작업에서는 마지막으로 검증된 제목, To/Cc/Bcc 표시 순서, 본문 수정, 정확한 첨부, control surface, 논리 서명과 첫 저장 후 얻은 runtime-private Outlook StoreID/EntryID를 유지한다. `계속`, `서명 넣어줘`, `보내줘` 같은 후속 지시는 그 현재 초안에만 적용하며, 누락·변경·상태 drift·복수 후보·파일 변경·신뢰할 lock 부재가 있을 때만 다시 묻는다.
- owner가 local Outlook 초안 작성을 요청하면서 control surface를 지정하지 않은 경우 `Marshal.GetActiveObject('Outlook.Application')`으로 이미 실행 중인 classic Outlook session만 확인하고, 사용 가능하면 local programmatic executor를 기본 선택한다. 이 probe는 새 COM instance나 process를 시작하지 않는다. 사용할 수 없으면 복사용 초안에서 중단하며 UI로 자동 전환하지 않는다.
- UI 또는 computer control은 현재 owner가 그 surface를 명시적으로 요청한 경우에만 사용한다.
- 별도의 현재 `보내줘` 또는 예약발송 지시가 있으면 StoreID/EntryID로 정확히 잠긴 초안을 찾고, 현재 lock 전체의 재검증 결과를 만든 뒤 `.Send()`를 1회만 호출한다. Sent Items와 Outbox는 1초 간격으로 최대 30초 확인하고, runtime-private 제목·순서 있는 recipient SMTP 값·첨부 이름/크기/digest·정규화 본문 digest·send-start UTC가 모두 맞는 1건만 확인한다. 0건은 `unknown`, 복수건은 `ambiguous`이며 둘 다 자동 재시도하지 않는다.
- 답장은 원본 thread 에서 작성한다.
- 전달 메일은 원문 chain 과 첨부가 외부 공유 가능한지 확인한 뒤 작성한다.
- Outlook folder/rule 작업은 `outlook_mail_reconcile_v0` 또는 별도 Outlook operations task 로 분리한다.

## `send-mail` runner 규칙

- `EMAIL_SEND_ENABLED=true` 와 owner 승인 metadata 가 모두 필요하다.
- `--dry-run` 은 초안 검증에 사용할 수 있다.
- 실제 발송은 `MAIL_SEND_V0.md` 의 outbound snapshot 과 append-only send log 를 남긴다.
- SMTP secret 값은 env/local secret file 에만 있고, 명령 출력이나 문서에 쓰지 않는다.

## ASSUMPTIONS

- 기존 보낸메일과 특정 개인의 메일은 품질 oracle 로 사용하지 않는다.
- 일반 업무 이메일에서 헤딩 수와 LLM 파싱 정확도를 함께 무작위 비교한 직접 연구는 확인하지 못했다. 사람 대상 텍스트 이해·접근성 연구와 semantic email 연구를 보수적으로 결합한 정책이다.
- 프로젝트별 고객/상대방이 별도 제목 키워드 규칙을 요구하면 이 문서보다 해당 project-local rule 이 우선한다.

## 외부 근거

- Microsoft Outlook best practices: 행동 중심 제목, 중요도순 본문, 담당자와 행동 항목 명시 — <https://support.microsoft.com/en-US/Outlook/outlook-best-practices-write-great-email>
- UK Government Communication Service: reason/ask first, background later, action and deadline visible — <https://www.communications.gov.uk/guidance/digital-communication/writing-effective-emails/>
- GOV.UK Service Manual: 중요한 정보를 첫 문장에 두고 필요한 행동과 기한을 명확히 표시 — <https://www.gov.uk/service-manual/design/sending-emails-and-text-messages>
- Digital.gov Plain Language: 목적·핵심을 먼저 두고 긴 내용은 정보성 표제와 목록으로 조직 — <https://digital.gov/guides/plain-language/principles/organize>
- U.S. National Archives plain-writing checklist: 길고 복잡한 내용에 표제와 목록 사용 — <https://www.archives.gov/open/plain-writing/checklist.html>
- W3C Writing for Web Accessibility: 3~4문단보다 긴 내용에서 표제·소제목으로 탐색을 지원하고 의미 구조를 사용 — <https://www.w3.org/WAI/tips/writing/>
- Frontiers information-overload review: 행동 필요 여부·형태·응답 시점을 명확히 하고 불필요한 정보와 수신자를 줄임 — <https://doi.org/10.3389/fpsyg.2023.1122200>
- Semantic Email action-item classification: 자유문장만이 아니라 명시적 업무 메타데이터와 사람 확인이 필요 — <https://aclanthology.org/L10-1018/>
- Heading/text-memory research: 표제는 구조 파악을 돕지만 내용과 맞지 않으면 기억을 편향시킬 수 있음 — <https://doi.org/10.1016/j.cedpsych.2007.11.001>
