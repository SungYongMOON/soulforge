# Voice Recording Library v0

## 목적

항시 녹음, 음성 메모 import, 회의 녹음, 전사 sidecar 를 메일 intake 처럼 한곳에 모은 뒤 프로젝트별 후보 route 로 분리한다.

이 문서는 원본 녹음과 전사 payload 를 저장하는 위치, 프로젝트 매칭 전 격리 규칙, 공식 할일 장부로 승격하기 전 검토 단계를 고정한다.

## 저장 구조

```text
_workspaces/system/voice_capture/sessions/<YYYY-MM-DD>/<session_id>/
  audio/
  transcripts/
  analysis/local_asr/<run_id>/
  analysis/semantic_labels/<run_id>/
  analysis/diarization/<run_id>/
  analysis/context_resolution/<run_id>/
  transcript.jsonl
  transcript.txt
  session_manifest.json
  source_event_draft.yaml
  speakers/...

_workspaces/system/voice_capture/library/
  recordings/<YYYY-MM-DD>/<recording_id>/recording_manifest.json
  index/recordings.jsonl
  index/recordings.current.json
  project_routes/<project_code>/recordings/<recording_id>.json

_workspaces/system/voice_capture/meeting_bundles/<YYYY-MM-DD>/<meeting_bundle_id>/
  bundle_manifest.json

_workspaces/system/voice_capture/local_asr_queue/
  pending/<session_id>.json
  processed/<YYYY-MM-DD>/<session_id>.json

_workspaces/system/voice_capture/delivery/
  producer_receipts/<session_id>.json
  consumer_acknowledgements/<consumer_node>/<session_id>.json
  consumer_acknowledgements/<consumer_node>/latest.json

_workspaces/system/voice_capture/plaud_mail_triggers/
  pending/<trigger_id>.json
  processed/<YYYY-MM-DD>/<trigger_id>.json
  unresolved/<YYYY-MM-DD>/<trigger_id>.json
```

## 저장·기록·동기화 지도

| 정보 | 정본 위치 | 동기화 수단 | writer |
| --- | --- | --- | --- |
| 원음, provider 전사, 독립 전사, 화자·맥락 분석 payload | `_workspaces/system/voice_capture/sessions/**` | owner-approved shared worksite | TARGET HPP voice primary; cutover 전 맥미니 temporary failover |
| 녹음 색인, route 상태, 회의 묶음, queue, 전달 receipt/ack | `_workspaces/system/voice_capture/{library,meeting_bundles,local_asr_queue,plaud_mail_triggers,delivery}/**` | 같은 shared worksite | 동일 active writer 1대; consumer ack만 각 PC |
| 프로젝트별 음성 source event | `_workmeta/<project_code>/reports/voice_source_events/**` | project private Git | project metadata worker |
| 프로젝트 맥락·업무 후보 | `_workmeta/<project_code>/project_context/**`, `_workmeta/<project_code>/reports/할일_장부/**` | project private Git | 승인된 project worker |
| 공통 실행 이력·ingress 상태 | `private-state/guild_hall/state/**` | private-state Git | operational-primary |
| 코드, 계약, 테스트, public-safe 예시 | Soulforge public tracked tree | public Git | 개발 작업자 |

`_workspaces/system`의 실제 물리 위치는 PC마다 임의 폴더가 아니라
owner-approved shared worksite를 가리키는 동일 logical view여야 한다. raw payload는
Git으로 복제하지 않는다. Git에는 코드와 metadata만 두며, raw가 다른 PC에 실제로
도착했는지는 producer receipt만으로 주장하지 않고 그 PC의 consumer ack로 증명한다.

## 경계

- 원본 오디오, 원문 전사, 화자분리 sidecar 는 `_workspaces/system/voice_capture/sessions/**` 아래에만 둔다.
- 입력원에서 받은 원본 형식은 변환본으로 대체하지 않고 보존하며, 보관함은 `m4a`, `wav`, `mp3`, `flac`, `ogg` 원본을 인식한다.
- 녹음 보관함 `library/**` 는 원문을 복사하지 않고 session 경로, 개수, 상태, hash, route 후보만 기록한다.
- `_workmeta/<project_code>/**` 에는 프로젝트 검토가 필요할 때 metadata-only source event 만 쓴다. 원본 오디오와 전사 본문은 쓰지 않는다.
- public Git 에는 CLI, 테스트, 문서, public-safe 예시만 올린다. `_workspaces/system/voice_capture/**` payload 는 Git 대상이 아니다.
- OneDrive 같은 owner-approved shared worksite 를 쓰는 경우에도 Git 이 아니라 공유 workspace/junction 으로 raw payload 를 동기화한다.

## 동일 회의의 복수 녹음

- Apple Notes, PLAUD, ChatGPT Record처럼 같은 회의를 여러 장치나 서비스로 녹음해도 각 물리 녹음은 별도 session과 recording entry로 보존한다.
- 동일 회의 관계는 `meeting_bundles/**/bundle_manifest.json`이 session ref, 시간 정렬, 자료 존재 상태, 품질 역할만 연결한다. bundle에는 오디오나 전사 본문을 복사하지 않는다.
- 같은 회의 여부는 녹음 시작·종료 시각, 길이, 선택적 오디오 fingerprint, 사용자 확인 근거로 판단한다.
- 회의록, 결정, 할일 후보는 source별로 중복 생성하지 않고 meeting bundle 기준으로 한 번 생성한다.
- 한 회의에 여러 프로젝트가 섞이면 원본 bundle은 하나로 유지하고 프로젝트별 구간 투영본만 여러 개 만든다.
- source 하나가 늦게 시작하거나 일부 구간만 포함해도 삭제하거나 병합하지 않고 coverage offset을 기록한다.

## 상태 모델

현재 구현이 쓰고 읽는 상태는 아래 네 가지다.

| route status | 의미 |
| --- | --- |
| `unclassified_needs_owner_confirmation` | 아직 프로젝트가 확정되지 않은 기본 inbox 상태다. |
| `project_candidate_needs_review` | AI 또는 사람이 프로젝트 후보를 제안했지만 확정 전이다. |
| `accepted_project_route` | 책임자가 특정 프로젝트로 route 를 확정했다. |
| `rejected_or_archived` | 해당 녹음이 프로젝트 할일화 대상이 아니거나 보류/폐기됐다. |

초기 등록은 `P00-000_INBOX` + `unclassified_needs_owner_confirmation` 을 기본값으로 쓴다.

2026-07-13 owner가 승인한 목표 구현은 사람의 매 건 확인을 병목으로 두지 않는다.
다만 현재 `accepted_project_route`와 섞거나 사람 승인을 가장하지 않도록 다음
별도 상태를 schema, writer, validator, fixture와 함께 추가한 뒤 활성화해야 한다.

| target route status | 의미 | 허용되는 다음 단계 |
| --- | --- | --- |
| `ai_provisional_project_route` | AI가 프로젝트 context card와 복수 근거를 이용해 내부 작업용 route를 임시 확정했다. 사람 승인이나 공식 사실이 아니다. | 회의/주제 구간별 project draft, 담당자·할일 후보, 재검증 |
| `exception_review_required` | 서로 다른 프로젝트 근거가 충돌하거나 새 프로젝트·낮은 신뢰도·필수 맥락 누락이 있다. | 자동 진행 보류, 예외 검토함 |

AI 임시 확정은 `accepted_by`, `accepted_at`을 쓰지 않는다. 대신 사용한 source ref,
project context version, 모델/규칙 version, confidence band, 반대 근거, 재검증 시각을
남겨야 한다. 같은 녹음 안의 서로 다른 구간은 서로 다른 프로젝트 route를 가질 수
있다.

## 처리 순서

1. 녹음 또는 import 결과를 session 으로 만든다.
2. `register-library --apply` 로 전체 녹음 보관함에 metadata-only entry 를 만든다.
3. 동일 회의의 다른 source가 있으면 별도 session을 유지한 채 meeting bundle로 연결한다.
4. provider 전사만으로는 프로젝트·할일·RAG 검색어를 만들지 않는다. 빠른 독립 전사는 중요 구간만 찾고, 강한 독립 재전사를 통과한 구간만 session/bundle metadata와 프로젝트 wiki/RAG metadata를 이용한 Shadow 프로젝트 후보로 진행할 수 있다.
5. 책임자가 프로젝트 route 를 확정하면 project route manifest 를 갱신한다.
6. 전사 품질, 화자분리 품질, action item 누락 가능성을 검토한 뒤에만 `_workmeta/<project_code>/reports/voice_source_events/**` 또는 공식 task ledger 후보로 넘긴다.

### 승인된 목표 처리선

1. active voice writer가 Hiworks trigger 또는 명시 recovery 신호로 PLAUD 원음을 수집한다. 정상 TARGET은 HPP이고 HPP unavailable/cutover 전에는 맥미니가 temporary failover다.
2. provider 결과와 독립된 빠른 local ASR을 만들고 token probability·반복·coverage 품질 flag를 계산하되, 확률을 정확도 보증으로 취급하지 않는다.
3. 요청·담당·기한·결정·약속·취소·진행상태·시험/측정 결과 또는 안전·비용·납기·고객·설계·품질 영향이 있는 구간만 강한 local ASR로 다시 읽는다. 잡담·인사·감사·맞장구·식사 이야기·일반적인 부탁말·반복·배경음·단순 종료말의 불명확성은 사람에게 넘기지 않고 무시한다.
   일반적인 `보내 주세요`형 실제 업무 요청, `아직 완료되지 않았다`형 미완료 상태, `10Ω` 같은 공학 단위, 제출 기한, 품질 점수·안전 등급처럼 조사가 붙은 수량·측정값도 중요 후보에서 누락하지 않는다. 반대로 `점심을 준비해 주세요`, `잘 부탁드립니다`, `문제가 발생하지 않았습니다`, `비용은 증가하지 않았습니다`는 할일·위험으로 승격하지 않는다.
4. 강한 재전사 후에도 중요한 의미가 갈릴 때만 질문 하나에 필요한 30~90초 원음 구간을 사람에게 확인 요청한다.
   서로 같은 사람·날짜·수치가 전사별로 다른 문장 경계에 들어간 것뿐이면 앞뒤 문맥을 합쳐 자동으로 같은 뜻으로 닫고 사람에게 넘기지 않는다.
   비교 권한은 같은 exact manifest/source/model/chunk/transcript 검증 호출이 함께 만든 fast/strong 메모리 객체 쌍에만 부여한다. 두 객체는 같은 pair receipt를 가져야 하며, semantic 분석 때 다시 읽은 manifest byte의 해시도 receipt와 같아야 한다. 복사·역직렬화하거나 합성 receipt를 붙인 객체는 다시 검증하기 전까지 권한이 없다.
   검증된 fast/strong run과 comparison 객체는 내용 digest에 결합하고 재귀적으로 동결한다. 합성 비교 helper는 권한을 만들지 않으며, 합성 review-audio helper는 realpath 기준 OS 임시 테스트 루트에서만 동작한다.
   production review clip은 comparison에 봉인된 `session_manifest` 해시와 원음 해시를 현재 선택된 세션·원음과 다시 비교한다. 원음 pathname을 ffmpeg에 다시 넘기지 않고, 검증 대상 원음 byte stream 자체를 ffmpeg stdin으로 보내면서 끝까지 SHA-256을 계산하므로 검사 직후 경로가 바뀌는 경우도 실패로 닫는다. 같은 session id를 가진 다른 날짜 폴더나 manifest·원음 동시 교체도 허용하지 않는다.
   의미 검토 window는 `start_seconds + duration_seconds`만 정본으로 저장하고 `end_seconds`는 clip manifest를 만들 때 계산한다.
5. 평상시 녹음, 회의, 통화, 개인 메모를 분류하고 긴 녹음을 회의·주제 구간으로
   나눈다.
6. 익명 화자 구간을 만들고, 동의·등록된 화자만 실명 후보로 연결한다.
7. 음성만 보지 않고 메일, 체계공학 일정, project context card를 함께 읽어 구간별
   프로젝트를 `ai_provisional_project_route`로 정한다.
8. 발언자와 업무 담당자를 구분해 담당자, 결정, 할일, 기한, 의존성 후보를 만든다.
9. 내부 업무 초안과 metadata ledger를 AI 임시 확정 상태로 기록하고, 새 메일·일정·
   음성이 들어오면 재검증·정정 이력을 append한다.
10. 정상 건은 계속 진행하고 충돌·근거 부족·새 프로젝트·낮은 화자 신뢰도만
   `exception_review_required`로 모은다.
11. 외부 발송·공식 승인·구매·기술 truth 변경은 별도 사람 승인 전 실행하지 않는다.

2026-07-22 기준으로 위 안전 cascade의 첫 Shadow 조각은 구현됐다. provider
transcript는 위치 후보만 만들고 action/project/RAG authority는 0이다. 빠른 local-ASR
manifest는 중요 구간 후보를 만들며, 검증된 fast/strong manifest pair를
통과한 경우에만 구간별 발화 행위·극성·양태·귀속·행동 cue·entity·프로젝트 근거·
project-independent 후보·coverage·후속 검색 계획을 계산한다.
여기서 검증은 이름표가 아니라 session manifest, 실제 원음 SHA-256, 승인된 모델
파일 SHA-256, 모든 chunk 결과/receipt, chunk로 재구성한 transcript SHA-256을 묶는다.
이는 로컬 artifact chain 증명이며 hardware attestation으로 과대 주장하지 않는다.
stdout은 원문 없는 요약이고, 현재 CLI는 dry-run 전용이며 `--apply`를 거부한다.
context card가 없거나 근거가 부족해도 강한 전사에서 확인된 요청·약속 후보는 버리지 않고 프로젝트 미정
상태로 남긴다. 같은 녹음 전체를 프로젝트 하나로 강제하지 않는다.
한 개의 약한 프로젝트 단서만으로는 `project_candidate_needs_review`로 올리지 않으며,
최소 점수, 서로 다른 두 anchor 종류, 서로 다른 두 실제 anchor 값을 모두 충족해야 한다.
같은 단어가 별칭과 용어에 중복 등록되거나 한 단서가 다른 단서 전체를 포함해도 두
독립 단서로 세지 않는다. context card의 별칭·
인명·역할·용어는 짧은 label만 허용하고, 문장이나 전사 본문 복사·secret 유사 값은
검증에서 거부한다. card loader는 읽기 전에
`_workmeta/<project>/project_context/cards/<card>.json` 모양을 확인하며 다른
`_workmeta` JSON은 열지 않는다.
JSON Schema는 구조를 검증하고 runtime은 그 위에 in-memory 권한 brand,
artifact digest, 경로 custody를 추가 검증한다. context card의 절대경로 ref와
상위경로 이동 ref는 둘 다 거부한다.

feature-OFF bounded strong-ASR runner는 approved material window 중 30~90초
구간만 강한 모델로 재전사할 수 있다. 결과는 append-only non-canonical revision과
HPP continuity receipt로만 남고, canonical whole-session 전사 포인터·완료
알림·delivery receipt·project route를 덮어쓰지 않는다. 실제 private 음성,
운영 모델 경로, live writer에 연결한 pilot은 아직 수행하지 않았다.

아직 구현 완료가 아닌 것은 실제 topic segmentation, production diarization,
메일·일정·파일·PC 이력·RAG/Wiki retrieval 실행, context card producer,
reconciliation writer, metadata 후보 투영, TaskDriver 연결과 공식 Task Engine write다.
따라서 현재 Shadow 결과는 `accepted_project_route`, 공식 할일, 완료·결정 정본이 아니다.
다른 PC는 구현 여부를
`_workmeta/system/dev_worker_queue/autonomous_voice_context_resolver_v0.yaml`과
검증 결과로 판단하며 문서만 보고 동작 완료로 간주하지 않는다.

### 연구 근거와 적용 한계

- Whisper는 대규모 weak supervision으로 다양한 음성 조건의 전사를 다룬다는
  근거를 제공하지만, 특정 회사 통화의 고유명사·과제번호 정확도를 보증하지는
  않는다: <https://arxiv.org/abs/2212.04356>
- 공식 `large-v3`와 `large-v3-turbo` model card는 정확도/속도 역할을 구분하는
  구현 근거다. Soulforge는 이 설명을 그대로 신뢰 점수로 쓰지 않고 실제 HPP
  녹음 golden set으로 별도 평가한다:
  <https://huggingface.co/openai/whisper-large-v3>,
  <https://huggingface.co/openai/whisper-large-v3-turbo>
- Silero VAD와 pyannote는 각각 음성 구간 탐지와 diarization 후보 도구다. VAD
  구간과 화자 cluster는 발화자 실명 또는 업무 담당자 권한을 뜻하지 않는다:
  <https://github.com/snakers4/silero-vad>, <https://arxiv.org/abs/1911.01255>
- 발화행위/업무 약속 추출 연구는 후보 탐지에 참고할 수 있지만, 회사 메일·일정·
  파일 이력과 대조하지 않은 음성 문장만으로 공식 할일을 만들 근거는 아니다:
  <https://aclanthology.org/L16-1117/>, <https://arxiv.org/abs/2508.05055>

위 자료는 구조 선택의 근거이며 Soulforge threshold의 calibration 증거가 아니다.
사람 확인 비율, 중요 의미 누락률, 고유명사 CER/WER, 두 전사 합의율은 실제
audio-adjudicated golden set에서 측정한 뒤에만 운영 threshold로 승격한다.

## dev-ERP 할일 후보 합류

- recording-library `recording_manifest.json`의 `route_state.route_status=accepted_project_route`가
  프로젝트 확정의 유일한 입력 authority다. `accepted_project_code`, `accepted_by`, `accepted_at`도 모두 필요하다.
- `ui-workspace/apps/dev-erp/tools/voice_to_task_candidates.mjs`는 호출자가 지정한 manifest 1개와
  할일 장부 1개만 읽으며 디렉터리를 재귀 탐색하지 않는다.
- `payload_refs.source_event_draft_ref`는 상대 ref인지 확인해 `소스계보=voicedraft:<ref>`로만 기록한다.
  도구는 source event, audio, transcript ref를 역참조하지 않는다.
- 미확정 또는 후보 route는 할일을 만들지 않는다. 수락 route도 `voicetask:<recording_id>`,
  `출처=voice`, `상태=unclassified`, `검토상태=needs_review` 1행까지만 만들며 사람 승인 전 실행 할일로 올리지 않는다.
- 현재 구현은 이미 수락된 manifest를 소비하는 단계다. `route_suggestion`은 manifest의 기존
  `project_code_candidate`를 metadata-only로 반영할 뿐 프로젝트 후보를 계산하지 않는다.
  자동 프로젝트 matcher와 owner-acceptance mutator는 아직 구현하지 않았다.
- dry-run이 기본이고 `--apply`에서만 기존 알 수 없는 헤더와 다른 행을 보존해 원자 기록한다.
  같은 recording은 멱등이고 기존 같은 키의 내용이 다르면 자동 덮어쓰기 대신 검토 필요로 중단한다.
- `--task-ledger`는 수락 프로젝트와 같은 `_workmeta/<accepted_project_code>/reports/할일_장부/할일_장부.csv`
  정규 경로만 허용한다. owner가 다르거나 비정규·unsafe 경로면 읽기/쓰기 전에 중단한다.

## PLAUD 정기 수집

- 하이웍스 수집기가 PLAUD 전사 완료 메일을 새로 수신하면 메일 원문 없는 hash 기반 trigger를 shared voice queue에 쓴다.
- 24시간 노드는 shared queue 변경을 감시한 뒤 PLAUD 공식 CLI로 최근 recording ID를 조회하고, 기존 session manifest에 없는 ID만 수집한다.
- PLAUD Note에서 계정으로 전송되지 않았거나 전사가 끝나지 않은 녹음은 실패로 확정하지 않고 다음 주기에 재시도한다.
- 수집물은 원본 오디오, provider 전사, provider 요약을 모두 보존하되 증거 역할을 구분한다.
- 원본 오디오는 재전사·사실확인에 사용할 `canonical_source_candidate`다.
- PLAUD 전사와 화자 라벨은 시간 정렬에 유용한 `auxiliary_unverified`이며, 기술용어·인명·화자 식별을 확정하지 않는다.
- PLAUD 요약은 `quarantined_untrusted`이며 회의록, 결정, 할일을 직접 생성하거나 장부에 승격하는 근거로 쓰지 않는다.
- provider recording ID는 중복 방지 키다. 공유 링크 import와 CLI import가 같은 ID면 새 원본을 만들지 않고 기존 session을 우선한다.
- PLAUD 로그인 token과 24시간 audio download URL은 저장하거나 `_workmeta`·Git에 복사하지 않는다.
- 새 session은 기본적으로 `P00-000_INBOX`에 등록하고, 독립 전사 또는 오디오 검토와 프로젝트 매칭 후에만 과제별로 투영한다.
- 독립 전사는 provider 전사와 별도인 `analysis/local_asr/<run_id>/`에 저장한다. 원본 hash·모델·run id가 같은 완료본은 재사용하고, 미완료 chunk만 이어서 처리한다.
- 독립 전사 완료 시 `voice` source pointer를 만들되, 메일(`mail`)과 체계공학 일정(`se_schedule`)을 함께 읽는 프로젝트 줄기 판단 전에는 P00 후보 상태를 유지한다.
- 메일이 누락됐을 때만 운영자가 explicit `sync`를 실행한다. 정상 동작은 provider polling이 아니라 5분 간격 local mail/ASR queue drain이다. 두 queue가 비어 있으면 PLAUD를 조회하지 않는다.
- 메일 trigger 시점에 provider audio/transcript가 아직 보이지 않으면 trigger를 처리 완료로 옮기지 않고, persistent loop의 다음 5분 주기에 다시 시도한다.
- 새 recording import가 확인되지 않은 trigger는 완료 처리하지 않는다. 기본 1시간 동안 재시도한 뒤에도 연결 가능한 새 recording이 없으면 `plaud_mail_triggers/unresolved/<date>/`로 격리해 사람이 확인할 수 있게 남긴다.
- 여러 trigger가 함께 대기하면 새 recording 1건당 가장 오래된 trigger 최대 1건만 완료 처리한다. 미해결 수명도 각 trigger의 `enqueued_at`을 따로 계산해 새 trigger가 오래된 trigger와 함께 격리되지 않게 한다.
- 한 조회에서 import 완료와 provider 처리 중 상태가 함께 나오면 처리 중 recording 및 조회 한도 초과 recording 수만큼 trigger 자리를 예약해 다음 재시도가 끊기지 않게 한다.
- provider가 transcript available로 표시했지만 고정된 CLI 형식에서 timestamp segment를 하나도 읽지 못하면 import 성공으로 간주하지 않고 동일한 재시도·미해결 격리 경로를 따른다.

## 금지

- 녹음별 원문 전사 본문을 public repo, `_workmeta`, changelog, review packet 에 붙여 넣지 않는다.
- 프로젝트 route 후보를 공식 프로젝트 확정으로 취급하지 않는다.
- AI가 추론한 route·담당자·할일을 사람 승인 또는 공식 사실로 가장하지 않는다.
- 별도 AI 임시 확정 schema와 validator가 구현되기 전에는 현재 formal task ledger에
  자동 승격하지 않는다. 구현 후에도 외부 실행·공식 승인 truth와 분리한다.
- 여러 녹음의 전사 본문을 하나의 파일로 합쳐 원본 provenance 를 잃지 않는다.

## CLI

```bash
npm run guild-hall:voice-capture -- register-library \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-29/<session-id> \
  --project-code P00-000_INBOX \
  --apply
```

결과물은 기본적으로 `_workspaces/system/voice_capture/library/` 에 생긴다.

## 다른 PC 이어받기

- Git pull 로 CLI/규칙/테스트를 받는다.
- OneDrive 또는 owner-approved shared worksite 에서 `_workspaces/system/voice_capture/sessions/**` 와 `library/**` payload 를 같은 경로 identity 로 materialize 한다.
- 다른 PC 에서 raw payload 가 보이지 않으면 Git 문제가 아니라 workspace 동기화 문제로 본다.
- producer의 `ready` receipt는 생산 완료만 뜻하며 전달 완료가 아니다. consumer PC가 receipt의 상대 ref를 로컬에서 열어 exact size와 streaming SHA-256을 다시 계산하고 acknowledgement를 써야 `delivered`다.
- producer receipt는 `delivery/producer_receipts/<session_id>.json`, consumer acknowledgement는 `delivery/consumer_acknowledgements/<consumer_node>/<session_id>.json`과 `latest.json`에 둔다. receipt가 바뀌면 기존 acknowledgement는 `stale`이며 다시 ack해야 한다.
- receipt에는 expected size/SHA-256을, ack 각 file row에는 실제 관찰한 size/SHA-256을 둔다. missing은 `null/null`, mismatch와 delivered는 실제 관찰값을 남기며 status는 receipt 기대값과 이 관찰값에서 다시 계산 가능해야 한다.
- receipt와 ack에는 safe node/session/recording ID, strict UTC 생성/검사 시각, stage, file role, 상대 ref, hash/size, required/status만 둔다. 녹음 제목·전사 본문·절대경로·URL·secret-like key는 금지한다.
- producer/consumer node label은 암호학적 장치 identity가 아니라 운영 assertion이다. 같은 label의 self-ack는 금지하지만, 실제 도착 증명에는 권한 있는 운영자가 producer와 다른 PC에서 ack를 실행해야 한다.
- node label과 metadata hash는 signature가 아니며 payload와 metadata 양쪽의 write 권한을 가진 주체의 위조를 방지하지 않는다. 또한 producer/consumer clock을 동기화해야 한다. 계산된 `checked_at < created_at`이면 ack 파일과 latest를 쓰기 전에 중단하며, forged/legacy clock-inverted ack는 status에서 stale이다.
- delivery prepare/ack/write는 `_workspaces/system`이 public repo 밖 shared target을 가리키는 symlink일 때만 허용한다. repo 내부 일반 디렉터리 materialization과 repo subtree를 가리키는 symlink는 모두 거부한다.
- `<session_id>.json`은 latest-stage pointer다. `local_asr_ready`가 같은 session의 `plaud_import_ready`를 의도적으로 덮어쓰며 기존 ack는 stale이 된다. immutable stage history archive는 아니다.
- PLAUD import/library 등록과 독립 ASR 완료 뒤 producer receipt를 best-effort로 한 번 준비한다. receipt 실패는 retryable delivery warning이며 이미 성공한 import/ASR를 rollback하지 않는다.
- `recordings.current.json` 와 `project_routes/P00-000_INBOX/**` 를 먼저 보고 미분류 녹음부터 route 검토한다.
- active 수집 노드는 `_workspaces/system`이 active OneDrive shared link인지 audit한 뒤에만 기본 수집 경로를 사용한다. launchd plist와 로그는 `_workspaces/_local/<node_id>/` 및 사용자 로그 폴더에 둔다.
- TARGET HPP와 temporary-failover 맥미니 중 유효 lease/epoch를 가진 정확히 한 대만
  voice payload와 session/runtime metadata를 쓴다. 다른 PC는 같은
  session/library/queue 파일을 동시에 수정하지 않고 read, consumer ack, 허용된
  project metadata write만 수행한다.
- 이어받을 PC는 public repo, 필요한 `_workmeta/<project_code>`, `private-state`를 각각
  pull한다. 세 저장소의 commit이 같다는 이유만으로 raw payload 동기화가 끝났다고
  보지 않으며, shared worksite materialization과 consumer ack를 별도로 확인한다.
