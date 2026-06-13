# Workspace System Junction Prompt

Use this file when another PC cannot copy and paste a long prompt.

Short command to type in Codex:

```text
docs/ws.md 실행
```

Prompt:

```text
현재 열린 Soulforge 저장소 루트 기준으로 workspace system 상태를 정리해서 `_workspaces/system`이 공유본 junction이 되도록 진행해줘.

규칙:
- 보고/기록은 repo-relative path만 사용
- 로컬 절대경로, 드라이브명, 사용자명 기록 금지
- secret, .env, token, cookie, session, 업무 원문 내용 열람 금지
- 1차 실행에서는 삭제, 이동, 수정, 업로드, 권한 변경, junction 생성 실행 금지
- 먼저 dry-run plan을 제시하고 owner가 "적용 승인"이라고 말한 뒤에만 로컬 정리와 junction 생성을 진행
- 적용 승인 후에도 삭제하지 말고 기존 로컬 폴더는 repo-relative hold 위치로 보존 이동
- 공유 target은 local runtime 값으로만 다루고 보고서/기록에는 쓰지 말 것

기준:
- 최종 목표 경로는 `_workspaces/system`이다.
- 정리 완료 후 `_workspaces/system`은 일반 폴더가 아니라 junction이어야 한다.
- `Systems`는 legacy/alias 후보로만 보고, 별도 승인 없이는 만들지 않는다.

1단계 점검:
1. public, _workmeta, private-state git status
2. _workmeta/system/bindings/workspace_junctions.yaml 존재 여부
3. _workspaces/system 또는 Systems가 실제 폴더인지, 정션인지, 공유 경로인지
4. 파일 내용은 보지 말고 repo-relative path, count, mtime, size, extension 수준만 비교

2단계 분류:
- keep_local: 이 PC에서만 의미 있는 임시/캐시/로그 후보
- merge_candidate: 다른 PC 또는 공유본과 합칠 가능성이 있는 자료 후보
- duplicate_candidate: 이름/크기/mtime 기준 중복 의심
- stale_candidate: 오래되고 최근 사용 흔적이 약한 후보
- unknown_review: 판단 근거가 부족해 사람이 봐야 하는 후보

3단계 dry-run 정리안:
- `_workspaces/system`을 바로 지우거나 덮어쓰지 않는다.
- repo-relative 기준으로 보존 위치, 병합 후보 위치, junction 전환 전 백업 위치를 제안한다.
- 각 항목마다 reason, risk, proposed_action, needs_owner_check를 붙인다.
- 마지막에 “승인 후 실행 순서”를 제시한다.

4단계 적용 승인 후 실행:
- 기존 `_workspaces/system`이 일반 폴더면 `_workspaces/_local_hold/system/<timestamp>/` 아래로 보존 이동한다.
- owner가 지정한 공유 target으로 `_workspaces/system` junction을 만든다.
- 이동한 local hold와 새 junction의 메타데이터를 비교해 merge_candidate를 다시 표시한다.
- 바인딩 파일 변경이 필요하면 먼저 제안만 하고, 별도 승인 없이는 수정하지 않는다.
- 실패 시에는 만든 junction을 임의로 삭제하지 말고 상태와 rollback plan만 보고한다.

산출물:
1. 현재 상태 요약
2. 분류표
3. 이 PC 전용 dry-run cleanup plan
4. owner 승인 후 `_workspaces/system`을 junction으로 만드는 실행 순서
5. 적용 후에는 junction 여부, 보존 위치, merge_candidate 목록, 남은 owner 확인사항
6. 승인받기 전에는 아무것도 변경하지 않았다는 boundary check
```
