# Owner 응답 대기함

## 목적과 현재 범위

`/owner-attention.html`은 모든 봇의 활동을 복제하는 상태판 대신 **내 응답으로 다음
일이 진행되는 명시적 질문**을 모은다. 기본 비활성이며 기존 ERP 로그인과 현재
project ACL을 사용한다. 봇 생성, 모델 호출, 기술 HOLD 해결 책임, 업무 수락,
Linear OfficialDone, 정본 자료 이관을 소유하지 않는다.

구현은 기존 `erp_publish_work_session` 입력의 좁은 예약 어휘와 앱 내부 비정본
상태표를 사용한다. 새로운 공유 schema, 정본 writer 또는 `_workspaces`/`_workmeta`
root를 만들지 않는다. 예전 C: 작업 메타데이터를 가져오지 않는다. 사람·봇 작업
폴더도 읽거나 생성하지 않는다. 새 상태표는 기존 ERP DB 백업/복원 범위에 포함된다.

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
  "summary": "표지 제목을 어느 표현으로 확정할까요?",
  "knowledge": "내용 검토를 마쳤고 표지의 대외 표기만 결정하면 됩니다.",
  "outputs": ["artifact:synthetic-document-r1"],
  "verification": "합성 문서 구조 검증을 통과했습니다.",
  "next_actions": ["Buzz에서 확정할 제목을 한 줄로 알려 주세요."],
  "stop_conditions": ["제목 확정을 기다리는 문서 최종본 작업"],
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
기본 서버는 dispatcher 주기·예약작업·외부 발송을 활성화하지 않는다. 관리봇의
실제 transport 연결과 verified response reader는 아직 필요한 구현/통합 작업이다.

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
