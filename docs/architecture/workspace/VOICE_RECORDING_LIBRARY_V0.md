# Voice Recording Library v0

## 목적

항시 녹음, 음성 메모 import, 회의 녹음, 전사 sidecar 를 메일 intake 처럼 한곳에 모은 뒤 프로젝트별 후보 route 로 분리한다.

이 문서는 원본 녹음과 전사 payload 를 저장하는 위치, 프로젝트 매칭 전 격리 규칙, 공식 할일 장부로 승격하기 전 검토 단계를 고정한다.

## 저장 구조

```text
_workspaces/system/voice_capture/sessions/<YYYY-MM-DD>/<session_id>/
  audio/
  transcripts/
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
```

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

| route status | 의미 |
| --- | --- |
| `unclassified_needs_owner_confirmation` | 아직 프로젝트가 확정되지 않은 기본 inbox 상태다. |
| `project_candidate_needs_review` | AI 또는 사람이 프로젝트 후보를 제안했지만 확정 전이다. |
| `accepted_project_route` | 책임자가 특정 프로젝트로 route 를 확정했다. |
| `rejected_or_archived` | 해당 녹음이 프로젝트 할일화 대상이 아니거나 보류/폐기됐다. |

초기 등록은 `P00-000_INBOX` + `unclassified_needs_owner_confirmation` 을 기본값으로 쓴다.

## 처리 순서

1. 녹음 또는 import 결과를 session 으로 만든다.
2. `register-library --apply` 로 전체 녹음 보관함에 metadata-only entry 를 만든다.
3. 동일 회의의 다른 source가 있으면 별도 session을 유지한 채 meeting bundle로 연결한다.
4. AI 는 session/bundle metadata, transcript ref, 프로젝트 wiki/RAG metadata 를 보고 프로젝트 후보를 제안할 수 있다.
5. 책임자가 프로젝트 route 를 확정하면 project route manifest 를 갱신한다.
6. 전사 품질, 화자분리 품질, action item 누락 가능성을 검토한 뒤에만 `_workmeta/<project_code>/reports/voice_source_events/**` 또는 공식 task ledger 후보로 넘긴다.

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
- 메일이 누락됐을 때만 운영자가 explicit `sync`를 실행한다. 정상 동작은 30분 polling이 아니라 mail queue event다.
- 메일 trigger 시점에 provider audio/transcript가 아직 보이지 않으면 trigger를 처리 완료로 옮기지 않고, launchd 실패 재시작을 5분 throttle로 제한해 다시 시도한다.
- 새 recording import가 확인되지 않은 trigger는 완료 처리하지 않는다. 기본 1시간 동안 재시도한 뒤에도 연결 가능한 새 recording이 없으면 `plaud_mail_triggers/unresolved/<date>/`로 격리해 사람이 확인할 수 있게 남긴다.
- 여러 trigger가 함께 대기하면 새 recording 1건당 가장 오래된 trigger 최대 1건만 완료 처리한다. 미해결 수명도 각 trigger의 `enqueued_at`을 따로 계산해 새 trigger가 오래된 trigger와 함께 격리되지 않게 한다.
- 한 조회에서 import 완료와 provider 처리 중 상태가 함께 나오면 처리 중 recording 및 조회 한도 초과 recording 수만큼 trigger 자리를 예약해 다음 재시도가 끊기지 않게 한다.
- provider가 transcript available로 표시했지만 고정된 CLI 형식에서 timestamp segment를 하나도 읽지 못하면 import 성공으로 간주하지 않고 동일한 재시도·미해결 격리 경로를 따른다.

## 금지

- 녹음별 원문 전사 본문을 public repo, `_workmeta`, changelog, review packet 에 붙여 넣지 않는다.
- 프로젝트 route 후보를 공식 프로젝트 확정으로 취급하지 않는다.
- AI가 추론한 할일을 owner review 없이 task ledger 에 바로 승격하지 않는다.
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
- `recordings.current.json` 와 `project_routes/P00-000_INBOX/**` 를 먼저 보고 미분류 녹음부터 route 검토한다.
- 맥미니 수집 노드는 `_workspaces/system`이 active OneDrive shared link인지 audit한 뒤에만 기본 수집 경로를 사용한다. launchd plist와 로그는 `_workspaces/_local/<node_id>/` 및 사용자 로그 폴더에 둔다.
