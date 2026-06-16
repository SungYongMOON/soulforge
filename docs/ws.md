# Workspace System Junction Prompt

Windows PowerShell 5.1 note: if Korean text is garbled, reopen with
`Get-Content -Encoding UTF8 docs/ws.md`.

## One-Line Report Command

On another PC, first pull the latest public Soulforge repo and make sure the
private `_workmeta` repo is present. Then run this from the Soulforge repo root:

```text
npm.cmd run guild-hall:workspace-system:report
```

If the local node identity file is missing, add a temporary node alias without
recording the PC name:

```text
npm.cmd run guild-hall:workspace-system:report -- --node-id node_alias
```

The command writes a metadata-only report folder under:

```text
_workmeta/system/reports/workspace_system_inventory/
```

The command refuses to write the report if `_workmeta/.git` is missing. The
report includes JSON, Markdown, and CSV files. It does not move, copy, delete,
upload, create a junction, read payload bodies, print host-local absolute
paths, or inspect secrets. To send the report back through the private metadata
repo, review the generated folder and commit only that report folder inside
`_workmeta`.

다른 PC에서 `_workspaces/system` 공유 정션 전환 준비 상태를 점검할 때
이 문서를 실행 지시로 사용한다.

입력 예:

```text
docs/ws.md 실행
```

## 목적

현재 열린 Soulforge repo root 기준으로 `_workspaces/system` 을 공유 link
view 로 전환하기 전 상태만 점검한다. owner 승인 전에는 이동, 삭제, 수정,
업로드, 권한 변경, 정션 생성, 정션 해제를 하지 않는다.

먼저 아래 명령을 실행한다.

```text
npm.cmd run guild-hall:workspace-system:inventory -- --json
```

기본 실행은 full scan 이어야 한다. `--max-depth` 또는 `--max-entries` 로 제한된
결과는 `scan_limited` blocker 로 보고, 이동/정션 계획의 전체 수량 근거로 쓰지 않는다.

명령이 없거나 실패하면 metadata-only 수동 점검으로 대체하고, 파일 본문은
읽지 않는다.

수동 점검으로 대체할 때도 아래 필드만 기록한다.

- `_workspaces/system` 이 일반 폴더인지 link view 인지
- top-level relative path
- item type: file 또는 directory
- file size, modified timestamp, extension counts
- deterministic class 와 blocker

수동 점검에서도 파일 본문, 문서 제목, 메일 제목, 압축 내부 목록, secret 값,
로컬 절대경로는 기록하지 않는다. 상세 기준은
[`SYSTEM_WORKSPACE_SYNC_MIGRATION_V0.md`](architecture/workspace/SYSTEM_WORKSPACE_SYNC_MIGRATION_V0.md)
의 `Inventory Rule` 을 따른다.

## 경계

- 보고와 기록에는 repo-relative path 만 사용한다.
- 로컬 절대경로, 드라이브명, 사용자명, PC 이름, 클라우드 계정명은 public
  문서에 기록하지 않는다.
- secret, `.env`, token, cookie, session, credential 파일은 열지 않는다.
- `_workspaces/system` 안의 파일 본문, 원문, 첨부, 문서 제목, 메일 본문은
  읽지 않는다.
- owner 승인 전에는 삭제, 이동, 수정, 업로드, 권한 변경, 정션 생성/해제를
  하지 않는다.
- 공유 target 은 alias 로만 기록한다. 실제 host-local target path 는
  owner-only binding 또는 `_workmeta` private metadata 에만 둔다.

## 분류 규칙

- `shared_generated_view`: `_workspaces/system/rag/**`,
  `_workspaces/system/knowledge_view/**`
- `shared_fixture_candidate`: 공통 fixture, reference, XML/materials 후보
- `project_reference_payload_review`: project code 와 reference payload 성격이
  함께 보이는 항목. 프로젝트 루트로 바로 이동하지 말고 owner mapping 후
  project payload relocation/reference surface 로 분류한다.
- `project_move`: 특정 project code 또는 project 전용 자료로 보이는 항목
- `knowledge_move`: `_workspaces/knowledge` 로 가야 하는 cross-project 지식 후보
- `pc_local_runtime_tool`: local LLM, venv, tools, EDA/CAD tool runtime,
  machine-only runtime
- `pc_local_cache_temp`: log, pid, lock, cache, tmp, scratch
- `repo_promote_review`: portable script/helper 후보
- `conflict_review`: 같은 경로 충돌 또는 conflict 후보
- `unknown_review`: 근거 부족으로 owner review 가 필요한 항목

## Tool-Worker PC 규칙

Allegro, Cadence, OrCAD, GPU/large-memory local LLM 처럼 특정 PC 에만 설치된
도구는 그 PC 를 tool-worker node 로 본다.

- 도구 설치본, license-bound runtime, cache, scratch, temporary export 는
  `_workspaces/system` 에 두지 않는다.
- ongoing local output 은 `_workspaces/_local/<node_id>/system/<tool_or_run>/...`
  아래에 둔다.
- 특정 프로젝트 산출물은 owner 승인 후 `_workspaces/<project_code>/...` 로
  보낸다.
- project-agnostic reusable fixture/export 만 owner 분류 후 공유
  `_workspaces/system` 으로 보낼 수 있다.
- 실행 조건, 도구 프로필, 입력/출력 포인터, 크기, 해시, blocker 는
  `_workmeta/system` 또는 `_workmeta/<project_code>` 에 metadata-only 로 남긴다.
- 다른 PC 에 Allegro/Cadence/OrCAD 가 없어도 오류가 아니다. 그 PC 는 공유된
  산출물과 metadata 를 읽고, 재실행이 필요하면 tool-worker PC 에 요청한다.

## 통과 기준

`_workspaces/system` 은 최종적으로 일반 폴더가 아니라 owner-approved shared
target 을 가리키는 link view 여야 한다.

현재 PC 의 기존 일반 폴더는 먼저
`_workspaces/_local_hold/system/<timestamp>_<node_id>/` 아래에 보존하는
dry-run plan 을 제시하고, owner 가 명시 승인한 뒤에만 실제 이동한다.

owner 가 dry-run plan, 분류표, shared-target alias, conflict disposition 을
명시 승인하기 전에는 copy, rename, junction/symlink 생성, shared tree build
를 하지 않는다.

`state: planned` 는 정리 완료가 아니라 아직 migration 중이라는 뜻이다.
`state: active` 로 바꾸려면 inventory blocker 가 0이어야 하고, PC-local
runtime, project-specific 자료, unknown/conflict 항목이 `_workspaces/system`
밖으로 분리되어 있어야 한다.

## 산출물

1. 현재 상태 요약
2. inventory 명령 결과 요약
3. 분류표와 blocker 목록
4. 이 PC 전용 dry-run cleanup plan
5. owner 승인 후에만 수행할 junction 전환 순서
6. 승인 전 변경하지 않았다는 boundary check
