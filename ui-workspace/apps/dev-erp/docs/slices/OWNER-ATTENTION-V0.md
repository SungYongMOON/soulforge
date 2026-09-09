# Owner 응답 대기함

## 목적과 현재 범위

`/owner-attention.html`은 모든 봇의 활동을 복제하는 상태판 대신 **내 응답으로 다음
일이 진행되는 명시적 질문**을 모은다. 기본 비활성이며 기존 ERP 로그인과 현재
project ACL을 사용한다. 봇 생성, 모델 호출, 기술 HOLD 해결 책임, 업무 수락,
Linear OfficialDone, 정본 자료 이관을 소유하지 않는다.

Owner의 기본 위임(2026-09-08): 내부 팀 협업과 되돌릴 수 있는 개발·문서 수정은
담당 봇이 판단해 먼저 실행하고 결과를 보고한다. 제목·양식·표현·통상 도구 선택이나
기술 디버깅을 사전 확인 항목으로 만들지 않는다. 이 함에는 외부 반출 검토와 실제로
Owner에게 남은 결정만 명시적으로 등록한다. 읽음·미루기·대기 해제는 외부 반출 허가,
정본 수락 또는 권한 확대를 대신하지 않으며 해당 실행 관문이 별도로 검증한다.

카드는 현재 수신자(Owner), 검증된 요청 등록시각과 서버 관측시각 기준의 등록 후
경과시간을 보여 준다. 이는 원래 도구가 멈춘 시각을 추정한 값이 아니다. 시각이
잘못되거나 관측보다 미래이면 미확인으로 남기며 종료된 요청에는 증가하는 경과시간을
표시하지 않는다. 미루기는 목록·알림의 유예이며 실제 업무 pause와 같다고 해석하지 않는다.

구현은 기존 `erp_publish_work_session` 입력의 좁은 예약 어휘와 앱 내부 비정본
상태표를 사용한다. 새로운 공유 schema, 정본 writer 또는 `_workspaces`/`_workmeta`
root를 만들지 않는다. 예전 C: 작업 메타데이터를 가져오지 않는다. 사람·봇 작업
폴더를 일반 검색하거나 생성하지 않는다. 상태표는 기존 ERP DB 백업/복원 범위에 포함된다.

## Buzz 파일럿 질문 연결

기존 `DEV_ERP_BUZZ_PILOT_READ`와 정확한 reader binding이 설정된 서버는 해당 업무의
native 질문도 같은 함에 표시한다. Owner 계정은 그 binding에서 결정하며, 별도 Owner
설정이 다르면 연결하지 않는다. 기존 MCP 요청은 원래 opt-in에서 함께 사용할 수 있다.
별도 후보 viewer는 원본 Owner 세션을 읽기 검증하고 자기 DB에 보기 선호만 저장한다.
원본 계정·세션·native 업무 DB에 쓰거나 새 MCP 제출을 만들어 질문을 복제하지 않는다.

질문 원문은 현재 Owner·세션·과제 권한으로 기존 보호 evidence reader에서 읽고 정확한
ref·해시를 확인해 화면에만 표시한다. 같은 질문의 request key와 source hash는 답변 전후
유지한다. 읽음·미루기는 낙관적 버전 검사로 적용하며 오래된 창의 변경을 거부한다.
실제 답변·철회는 원본 사건에서만 판단한다. 관측 불명·만료 상태에는 읽음·미루기를
허용하지 않고 기본 목록에 진행 확인 필요로 표시한다. 이것을 완료 목록에 넣지 않는다.

질문 전달 영수증과 binding의 정확한 Buzz 링크만 사용한다. 화면의 “Buzz 질문 전달 확인”은
그 원래 전달 사실이며 추가 알림 transport가 설치됐다는 뜻이 아니다. native 질문 때문에
새 알림 outbox나 반복 발송을 만들지 않는다. 별도로 구성된 기존 MCP notifier는 유지한다.

## 봇에서 요청 등록하기

현재 MCP의 `erp_publish_work_session`에 아래 입력을 보낸다. 모든 값은 합성 예다.
실제 사용에서는 도구가 이미 허용한 정확한 업무 ID·본인 계정과 실제 간결한
질문/판단/검증/다음 행동/막힌 작업을 사용한다. transcript, 자료 본문, secret,
파일의 절대경로는 넣지 않는다. 이 등록만으로 실제 알림이 보내지지는 않는다.

```json
{
  "item_id": "synthetic-item-id",
  "idempotency_key": "attention-doc-cover-r1",
  "client_session_ref": "oa1:document_cover:1:none",
  "request_kind": "owner_attention/request",
  "summary": "외부 제출 후보의 공개 범위를 확인해 주세요.",
  "knowledge": "내부 작성과 검증을 마쳤습니다. 외부 반출만 검토를 기다립니다.",
  "outputs": ["artifact:synthetic-document-r1"],
  "verification": "합성 문서 구조 검증을 통과했습니다.",
  "next_actions": ["Buzz에서 외부 반출 승인 여부와 변경할 공개 범위를 알려 주세요."],
  "stop_conditions": ["외부 반출만 보류합니다. 독립적인 내부 개발과 수정은 계속합니다."],
  "artifact_ids": []
}
```

- `client_session_ref`: `oa1:<correlation>:<revision>:<due>`.
  correlation은 소문자·숫자·`_`·`-` 최대 64자, revision은 1부터 연속 증가한다.
  due는 `none` 또는 UTC Unix epoch **초** 10자리다. 기한을 추정해서 만들지 않는다.
- 정확한 source key는 Owner 계정·원 발신 계정·업무·correlation·revision의 결합이다.
  transport idempotency key를 바꿔 같은 immutable payload를 재제출해도 질문은 하나다.
  같은 revision의 내용 변경은 거부한다. 수정은 다음 revision으로 제출한다.
- `summary` 질문은 2,000자, `knowledge` 판단/`verification` 검증도 각각 2,000자 이하다.
  `next_actions`, `stop_conditions`는 비어 있지 않은 명시적 목록이다. 일반 완료,
  idle, 텍스트의 “기다림”, 검토 제출, 기술 HOLD만으로 요청을 추정하지 않는다.
- `outputs`는 `artifact:<opaque-id>` 같은 namespace + opaque refs만 받는다.
  대화 URL은 source가 주지 않는다. exact Buzz route는 서버의 별도 resolver가 소유한다.
- 원 발신 계정의 활성 상태·현재 업무 배정을 다시 읽는다. 권한을 잃은 질문은
  현재 목록과 보내기 대상에서 빠진다. 누락/변조/지원하지 않는 이벤트는 조회 실패다.

## 응답, 철회와 판본

원 봇은 같은 `item_id`, `client_session_ref`로 `owner_attention/responded`를 제출할
수 있다. outputs에 `owner-request:<원 work_session_id>`와
`owner-response:<응답 관측 ref>`가 필요하다. **이 자기 보고만으로 닫지 않는다.**
UI는 `답변 기록 확인 대기`로 표시하고 응답 필요 목록에 남긴다.

다음 중 하나만 해결 관측이 된다.

1. 정확한 현재 Owner 계정이 기존 work-session 도구로 `owner_attention/response`를
   제출한다. 같은 업무·client_session_ref·원 요청 backlink와 실제 응답 요약이
   있어야 한다. 다른 발신자·다른 업무·이전 판본의 응답은 닫지 않는다.
2. `verifyBuzzResponse`가 실제 현재 응답 영수증을 독립적으로 검증해 반환한다.
   `verified`, `active`, 만료시각, 정확한 Owner, source ref/digest, 보고된 response ref,
   receipt ref가 모두 맞아야 한다. 기본 resolver는 `null`이다.

`owner_attention/withdrawn`은 원 봇이 동일 현재 revision과 원 요청 backlink를
명시적으로 철회한다. 새 판본은 앞 판본을 superseded로 보존하고 별도 요청으로
등장한다. `seen`, `snooze`, `unsnooze`에는 해결/수락/업무 완료 권한이 없다.

## 화면과 저장

- `GET /api/owner-attention`: 현재 Owner 전용 목록·확인 시각·세션에 결속된 CSRF.
- `POST /api/owner-attention/actions`: `request_key`, `source_sha256`, `view_version`,
  `action`과 snooze에만 `minutes` 30/120/1440. 다른 창의 오래된 판본은 409다.
- 30분/2시간/내일 같은 시각까지 미루기는 DB에 남는다. 서버·브라우저 재시작에도
  유지되며 만료 후 다시 보인다. 브라우저 표시는 로컬 시간대다.
- 새로 고침 실패·잘못된 응답은 이전 카드를 지우고 수치를 `—`, 상태를 미확인으로
  바꾼다. 8초 timeout, 요청 순서 fencing, page disposal 후 late reply 무시가 있다.
- `owner_attention_view`에는 exact request/digest, Owner, view version, 읽음과
  snooze 시각만 저장한다. 질문 원문을 별도 복제하지 않는다.
- `owner_attention_outbox`에는 event key·source digest·Owner·사유·시각·시도/fence·
  결과 ref만 저장한다. 기존 정본/수락/업무 상태표에 쓰지 않는다.

## 오너 전용 알림 접점

`createOwnerAttentionService().dispatch(access)`는 UI를 열지 않아도 현재 source를
조회해 새 요청, 기한 1시간 이내 진입, 사용자가 지정한 미루기 만료만 enqueue한다.
변화 없는 반복 조회는 새 이벤트를 만들지 않는다. 한 번에 최대 20개 이벤트를
한 개의 Owner 전용 알림으로 묶고 최소 1분 간격을 둔다. 모델을 호출하지 않는다.

서버의 기본 조립은 알림 route/adapter와 Buzz link/response resolver가 **미연결**이다.
설치·실제 관리봇 선정·권한 바인딩은 별도 연동 단계다. 아무 봇의 기존 키나 일반
채널을 재사용하거나 이름으로 destination을 검색하지 않는다. 현 코드만으로
실제 회사 알림이 동작한다고 주장하지 않는다.

연동자는 아래 서버 소유 입력을 exact resolve해야 한다.

| 입력 | 필수 결속 |
| --- | --- |
| `resolveBuzzLink(source)` | source ref/digest, Owner, 원 발신자, 업무, active/expiry, exact http(s) 대화 URL. 비 loopback http, credential URL과 script URI는 거부 |
| `resolveNotificationRoute(ownerId)` | 정확한 Owner 계정, `purpose: owner_attention`, active/expiry, binding SHA-256, Owner-only destination ref |
| `adapter.send(payload, {authorize})` | 전송 직전 재검증; fixed count + inbox 안내만. raw 질문/대화/자료 본문은 payload에 없음 |
| `verifyBuzzResponse(source)` | 현재 Owner 실제 응답 관측·원 요청 판본에 결속된 별도 검증 영수증 |

정확한 resolver 결속이 있는 경우 Buzz의 기존 native 주소도 지원한다:
`buzz://channel/UUID[/MESSAGE_ID]` 또는
`buzz://message?channel=UUID&id=MESSAGE_ID[&thread=THREAD_ID]`.
UUID와 64자리 event ID, 인자 집합을 엄격히 검사하고 credential·fragment·중복/알 수 없는
인자·경로 정규화 우회는 거부한다. 서버와 화면이 같은 검사를 사용한다. 근거는 Buzz
0.5.20의 `channelLink.ts`/`messageLink.ts` 생성 형식이다. 주소 형식 지원과 해당 PC/폰의
OS protocol dispatch 성공은 별개이며, native 앱 열기·메시지 발송은 이 검사에서 수행하지 않았다.
thread 인자는 현재 Buzz에서 metadata일 뿐 thread 화면 직접 이동의 증거가 아니다.

`createOwnerAttentionLoopbackAdapter({endpoint,binding})`는 정확한 loopback endpoint와
Owner/destination/purpose/digest pin을 요구한다. 5초 timeout, redirect 거부, 4KiB
JSON receipt 한도다. 재사용된 `attempt_id`와 opaque `receipt_ref`가 맞는
`delivered`만 전달 성공이다. exact `not_sent` 영수증은 1분 뒤 최대 총 3회 시도 후
held이며, timeout/네트워크 오류/잘못된 응답/권한 변경은 `delivery_unknown`이다.
불명확한 전송은 자동 재송신하지 않는다. 재시작 시 아직 유효한 다른 worker의
claim을 훔치지 않으며, 1분 lease 만료 후 unknown으로 바꾼다. 늦은 success도 이
fence를 덮지 못한다. 이 결과는 Buzz 메시지의 실제 읽음이나 사람 수락과 다르다.

설치 조립에 필요한 환경: 기존 `DEV_ERP_MCP_ENABLED=1`에 더해
`DEV_ERP_OWNER_ATTENTION=1`과 exact `DEV_ERP_OWNER_ATTENTION_ACCOUNT_ID`.
기본 서버는 dispatcher 주기·예약작업을 활성화하지 않는다. verified response
reader는 아직 필요한 구현/통합 작업이다.

## 알림 도달 경로

전달 계층은 구현돼 있었지만 서버가 route와 adapter를 넘기지 않아 **어떤 구성에서도
도달할 수 없었다**. 지금은 Owner가 놓는 로컬 결속 파일이 있을 때만 연결된다.

`DEV_ERP_OWNER_ATTENTION_NOTIFY_CONFIG`가 가리키는 JSON은 정확한
`owner_account_id`, `purpose: "owner_attention"`, Owner 전용 `destination_ref`,
64자리 `binding_sha256`, `expires_at`, loopback `endpoint`를 모두 만족해야 한다.
파일이 없거나 하나라도 어긋나면 route와 adapter를 만들지 않고 이전과 똑같이
아무것도 보내지 않는다(`capability: unavailable`). 이것이 기본값이다.

보내는 계기는 **새 진입점이 아니라 기존 호출 주체**다. 봇이 기존 MCP
`POST /api/mcp/work-sessions`로 `owner_attention/*`를 등록하면 그 시점에 outbox를
한 번 비운다. Owner는 응답 대기함 화면을 열지 않는다. 주기 실행·예약작업·새 라우트는
만들지 않으며, 봇의 등록 응답을 막거나 실패시키지 않는다.

권한은 넓히지 않는다. Owner 계정이 active이고 **자신의 유효한 세션 행이 남아 있고**
admin scope일 때만 보낸다. 셋 중 하나라도 아니면 보내지 않는다. `canAccessProject`가
admin에 대해 이미 true이므로 읽을 수 없는 자료가 새로 열리지는 않는다. payload에는
고정된 건수와 event 식별자만 들어가고 요청 원문은 어댑터를 넘지 않는다.

### 발송 중 등록과 간격 제한 안의 등록

두 경우 모두 **버려지지 않고, 추가 등록이나 화면 열기 없이 처리된다.**

- **발송 중 등록**: 진행 중인 발송을 방해하지 않고 재실행 하나로 합친다. 발송이 끝나면
  그 재실행이 outbox에 새 요청을 넣는다.
- **간격 제한 안의 등록**: 기존 1분 제한이 그대로 적용돼 즉시 나가지 않는다. 대신
  outbox에 `pending`으로 남고, **제한이 풀리는 시점에 한 번만** 실행이 예약된다.

이 예약은 주기 실행이 아니다. `pending` 행이 실제로 있을 때만, 기존 간격 제한과
각 event의 `available_at`이 이미 허용하는 시점으로 한 번 잡히고, 남은 것이 없으면
스스로 사라진다. 예약작업을 만들지 않고 프로세스를 붙잡지도 않는다(`unref`).
매 시도마다 Owner 계정·세션·admin scope를 다시 읽으므로, 로그아웃한 Owner에게는
보내지 않고 예약도 걸지 않는다. 그 경우 대기 작업은 다음 등록까지 그대로 남는다.

중복 방지와 전달불명 처리는 기존 outbox 규칙 그대로다. 같은 요청은 같은 event id로
한 번만 쌓이고, lease가 지난 `sending`은 다음 실행에서 `delivery_unknown`이 되며
조용히 재발송되지 않는다.

## 재현과 검증

```text
node --test test/owner_attention_source.test.mjs test/owner_attention_service.test.mjs test/owner_attention_http.test.mjs test/owner_attention_load.test.mjs
node test/owner_attention_preview.mjs
```

preview는 격리된 합성 ERP DB, 실제 화면/controller, 합성 로그인 버튼과 합성 Buzz
응답 페이지다. 회사 질문·실제 Buzz에 연결하지 않았다는 배너를 표시한다. 로컬
임시 port와 20분 TTL만 사용하며 4192/4300을 쓰지 않는다. 표준 입력의 `failure`,
`invalid`, `ok`, `expire`, `revision`, `stop`으로 실패·복구·만료·판본을 검증한다.
외부 계정·실자료·모델/GPU 작업·정본 이식은 0이다.

전체 ERP 서버 login/CSRF/current account·project ACL/재시작, source 자기보고와
foreign response 거부, 중복·판본·철회·두 창 CAS, 전달 unknown·lease fence·재시도,
실제 짧은 loopback HTTP, late/out-of-order refresh/disposal을 결정론 시험한다.
합성 브라우저 검증은 실제 운영 활성화나 실제 Buzz 메시지 전달 증거가 아니다.
