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
```

## 경계

- 원본 오디오, 원문 전사, 화자분리 sidecar 는 `_workspaces/system/voice_capture/sessions/**` 아래에만 둔다.
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
