# Buzz 첫 업무 파일럿

첫 출시의 업무 지시와 답변은 기존 Buzz 대화에서 한다. 작업대는 진행·응답 대기·
이력·결과를 조회한다. 운영자가 모든 봇의 상태를 살피거나 중간 구현을 승인해야
업무가 진행되는 구조를 만들지 않는다. 첫 범위는 발행된 텍스트 검토 업무 한 건이다.

## 사용 흐름

1. 허용된 기존 봇 대화에 발행된 업무 지시를 보낸다.
2. 봇이 확인 질문을 실제로 전달하면 작업대에 답변 대기가 표시된다. 대기 시작 시각과
   경과 시간, 응답할 사람, 정확한 Buzz 대화 링크를 함께 제공한다.
3. 같은 대화에서 답한다. 답변을 보존한 뒤 질문을 해제하고 해당 업무를 한 번 재개한다.
4. 작업대에서 결과와 원래 지시·질문·답변·도구 기록을 확인한다. 결과의 생성과 전달,
   검증과 사람 수락은 각각 다른 상태다. 공식 업무 완료를 자동으로 변경하지 않는다.

질문 전달 실패·전달 불명·기록 실패는 운영 확인으로 표시한다. 사람이 읽었거나
미뤘다는 이유만으로 답변했다고 처리하지 않는다. 봇이 멈추거나 프로세스가 살아
있다는 사실만으로 오너가 답해야 한다고 추정하지 않는다.

## 현재 구현과 연결 조건

`buzz_pilot_job.mjs`는 발행·사건·멱등 기록과 보호 원문을 결속하고,
`buzz_pilot_job_cli.mjs`는 신뢰된 로컬 관측 진입점과 인증 조회용 포트를 제공한다.
Workbench HTTP는 현재 로그인·Owner·과제 권한을 재확인한다. 첫 파일럿 조회가 켜지면
기존 작업대의 변경 요청은 차단된다. 직접 실행 경로는 개발 실험으로 보존된다.

이 코드는 Hermes나 모델을 실행하지 않는다. 실제 연결에는 동일한 지시·봇·대화·
프로필·런타임·소스 판본을 결속한 private 배치 설정과 실제 gateway 사건이 필요하다.
합성 사건 시험, 설치된 코드 확인, 실제 질문·답변·최종 전달 시험을 구별한다.
`doctor` 성공은 설정 검사이며 실행 중 gateway나 실제 도구 호출의 증거가 아니다.

## 배치와 보존

관측 코드의 설치 입력은 `guild_hall/deployment_pack/lanes/buzz_pilot_observer_v1_lane.spec.json`
이다. 기존 source-lane builder로 깨끗한 exact commit의 네 파일을 조립·재검증한다.
Node 실행 파일, Hermes 원본에 적용할 별도 패치, 작업별 binding은 이 팩에 포함하지 않는다.
발행 전에 설치된 entry·의존 소스·Node SHA와 binding 원본 SHA가 모두 일치해야 한다.
binding의 문자열이나 모델이 작성한 사건은 독립적인 권한 증명이 아니다.

각 배치는 기존 저장 정책에서 허용된 작업 위치에 별도의 control DB와 evidence root를
지정한다. 원문은 fixed-role 파일로 보존하고 DB에는 refs·SHA·크기·사건 메타데이터만 둔다.
옛 workspace 메타데이터를 이식하지 않고, 정본 workspace나 정본 계보 저장소에 쓰지 않는다.
실제 지시와 받은 지시는 별도로 보존하여 transport의 가장자리 공백 제거를 추적한다.

보존 역할은 `instruction`, `original_message`, `question`, `answer`, `tool_input`,
`tool_input_effective`, `tool_output`, `final_response`다. 각 역할은 최대 64 KiB이고 임의 파일 경로를 받지 않는다.
첫 `clarify`의 `tool_output`은 실제 도구 반환값의 공개 `user_response` 문자열 투영이다.
전체 원시 도구 반환 JSON을 보존했다고 주장하지 않는다. 내부 추론은 수집하지 않는다.

### 질문 입력의 관측 계약

v2 hook은 `tool_started.payload.input_contract: "prepared_v2"`로 시작한다. 이 표시는
입력 관측 방식을 구별하며 도구 실행이나 권한을 추가하지 않는다. `tool_started`는
허용된 모델 입력 필드(`question`, `choices`, `multi_select`)를 `tool_input`에 보존한다.
실제 Python `clarify` callback 입구에서 준비된 세 값을 한 번 관측하고 다음 사건으로 보낸다.

```json
{
  "event_type": "tool_input_prepared",
  "payload": {
    "tool_call_id": "call.synthetic",
    "tool_name": "clarify",
    "tool_input_ref": "<exact tool_started ACK tool_input ref>",
    "input": { "question": "Who?", "choices": ["Engineering"], "multi_select": false }
  }
}
```

이는 기존 version 1 사건 envelope 안의 새 사건이다. `input` 세 필드는 모두 필수이며
`choices`는 문자열 배열, `multi_select`는 boolean이다. Node는 정규화나 추천 label 코드를
복제하지 않는다. 키를 정렬한 compact UTF-8 JSON bytes를 별도 `tool_input_effective.json`에
보존하며, 원래 `tool_input`을 덮어쓰지 않는다. 이 JSON 형식의 보존은 원래 transport JSON의
공백·키 순서까지 보존했다는 뜻이 아니다. 준비 입력 SHA와 `question_registered`의 세 값을
같은 JSON 형식으로 만든 SHA가 정확히 같아야 등록한다. 문자열의 공백·추천 표시·선택지 순서를
느슨하게 비교하지 않는다.

준비 사건은 시작 ACK의 raw ref와 실제 call ID에 결속한다. 다른 call/ref, 알 수 없는 계약,
중간 계약 변경, 새 observation ID로 보낸 두 번째 준비 사건, 준비 전 등록과 이후 입력 변경은
거부한다. 같은 observation ID와 같은 사건의 재전달만 멱등 기록 재시도로 인정한다.
marker가 없는 v1은 기존 raw 입력과의 정확 비교만 유지한다(생략된 choices/multi_select의
기존 기본값은 `[]`/`false`). v1은 새 준비 사건을 받지 않는다. v2 hook은 marker와 준비 관측을
함께 사용해야 하며 raw 비교로 내려가지 않는다. 미완료 보존 claim은 같은 사건의 정확 재전달만
복구할 수 있고 다른 실패 사건으로 덮거나 도구를 다시 실행하지 않는다.

DB와 역할 파일은 같은 백업 세대로 보존해야 한다. DB 파일만 복사하거나 원문 없이 해시만
남긴 것은 업무 복구가 아니다. 질문 대기 중 WAL snapshot, 격리 복원, 동일 사건 재전달의
중복 억제, 원문 변조 거부를 실제로 측정한 영수증이 있어야 복구 검증을 주장한다.
복원한 기록도 현재 계정·과제 권한으로 조회하며 과거 권한을 되살리지 않는다.

## 실패 시 운영

- 업무 지시가 일치하지 않거나 binding이 만료·변조되면 해당 파일럿을 진행하지 않는다.
- 전달 결과를 모르면 성공으로 바꾸거나 자동 재전송하지 않는다. 같은 사건의 기록 재시도는
  같은 observation ID를 사용하며 업무·모델 호출 재시도와 구별한다.
- 기록 실패 후 기술 복구가 필요한 일은 개발·운영 담당자가 처리한다. 오너에게 기술 승인을
  요청하거나 응답 대기 건수를 늘려 문제를 넘기지 않는다.
- 거부된 append 응답 자체는 `failed` 사건이 아니다. native 실패가 실제 관측되면 관측자가
  별도 `failed(reason_code)` 사건을 기록한다. 보존 결과가 불명확하거나 미완료 claim이 있으면
  성공·재전송으로 바꾸지 않는다. 조회의 `failure_reason_code`는 마지막 기록된 사유 코드이며
  미관측 원인을 추정하지 않는다. 실패 상태는 운영 확인을 요구하고 답변 대기로 표시하지 않는다.
- 실제 운영 전환은 exact 소스 패치·현재 binding·launcher·되돌리기 묶음을 별도 확인한다.
  조립·합성 시험·내부 후보의 검토가 운영 활성화나 사람 수락을 대신하지 않는다.

## 검증 진입점

`node --test --test-concurrency=1 test/buzz_pilot_job.test.mjs test/buzz_pilot_job_cli.test.mjs
test/buzz_pilot_workbench_http.test.mjs`를 앱 디렉터리에서 실행한다.
`node --test test/buzz_pilot_wal_restore.test.mjs`는 v1과 prepared v2 각각의 발행·질문 대기
WAL 내보내기와 보호 원문 복원, 현재 권한 조회와 재전달 불변을 합성 격리 환경에서 확인한다.
조회 체험은 `node test/workbench_preview.mjs --buzz`이며 실제 모델이나 회사 자료를
사용하지 않는다. 실제 운영 사례의 결과는 private 시험 영수증에서 별도로 확인한다.
