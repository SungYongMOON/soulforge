# Workspace System Junction Prompt

다른 PC에서 긴 프롬프트를 복사할 수 없을 때 이 파일만 열어 실행한다.

짧게 입력:

```text
docs/ws.md 실행
```

## 실행 지시

현재 열린 Soulforge 저장소 root 기준으로 `_workspaces/system`을 공유
정션으로 정리할 준비 상태만 점검하고, 승인 전에는 아무것도 변경하지
마세요.

먼저 아래 명령을 실행하세요.

```text
npm.cmd run guild-hall:workspace-system:inventory -- --json
```

없으면 metadata-only 수동 점검으로 대체하되, 파일 본문은 열지 마세요.

## 경계

- 보고와 기록에는 repo-relative path만 사용합니다.
- 로컬 절대경로, 드라이브명, 사용자명, PC 이름, 클라우드 계정명은 기록하지 않습니다.
- secret, `.env`, token, cookie, session, credential 파일은 열지 않습니다.
- `_workspaces/system` 안의 파일 본문, 원문, 첨부, 문서 제목, 메일 본문은 읽지 않습니다.
- 승인 전에는 삭제, 이동, 수정, 업로드, 권한 변경, 정션 생성/수리를 하지 않습니다.
- 공유 target은 local runtime 값으로만 취급하고, 보고서나 public 문서에 쓰지 않습니다.

## 분류 규칙

- `shared_generated_view`: `_workspaces/system/rag/**`, `_workspaces/system/knowledge_view/**`
- `shared_fixture_candidate`: 공통 fixture, reference, XML/materials 후보
- `project_move`: 프로젝트 코드나 프로젝트 전용 자료로 보이는 항목
- `knowledge_move`: 공통 knowledge worksite로 가야 할 후보
- `pc_local_runtime_tool`: local LLM, venv, tools, 실행 파일, machine-only runtime
- `pc_local_cache_temp`: log, pid, lock, cache, tmp, scratch
- `repo_promote_review`: portable script/helper 후보
- `conflict_review`: 같은 경로 충돌 또는 conflict 후보
- `unknown_review`: 근거 부족으로 owner review가 필요한 항목

## 통과 기준

`_workspaces/system`은 최종적으로 일반 폴더가 아니라 공유 target을 향한
link view여야 합니다. 단, 현재 PC의 기존 일반 폴더는 먼저
`_workspaces/_local_hold/system/<timestamp>_<node_id>/` 아래로 보존하는
dry-run plan을 제시한 뒤 owner가 명시 승인할 때만 실제 이동합니다.

`state: planned`는 정리 완료가 아니라 아직 migration 중이라는 뜻입니다.
`state: active`로 바꾸려면 inventory blocker가 0이고, PC-local runtime과
project-specific 자료가 `_workspaces/system` 밖으로 분리되어 있어야 합니다.

## 산출물

1. 현재 상태 요약
2. inventory 명령 결과 요약
3. 분류표와 blocker
4. 이 PC 전용 dry-run cleanup plan
5. owner 승인 후에만 수행할 junction 전환 순서
6. 승인 전에는 변경하지 않았다는 boundary check
