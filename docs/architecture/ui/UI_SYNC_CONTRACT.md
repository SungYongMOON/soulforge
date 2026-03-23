# UI 동기화 계약

## 목적

- 이 문서는 Soulforge UI가 어떤 정본을 어떤 순서로 읽고 파생해야 하는지 고정한다.
- renderer 와 control center 는 모두 정본 파일을 읽는 소비층이다.

## 기본 원칙

1. UI는 정본 파일을 읽고 파생 상태를 소비한다.
2. 정본 owner root 는 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces` 다.
3. `derive-ui-state` 는 7축 top-level payload 와 renderer surface (`overview`, `body`, `class_view`, `catalogs`, `ui_hints`) 를 함께 낸다.
4. `_workspaces/<project_code>/` 실자료 스캔은 기본 동작이 아니라 opt-in local smoke 다.

## 정본 계층

- `.registry/index.yaml`
- `.registry/species/**`
- `.unit/**/unit.yaml`
- `.registry/classes/**/class.yaml`
- `.workflow/index.yaml`
- `.workflow/**/workflow.yaml`
- `.party/index.yaml`
- `.party/**/party.yaml`
- `.mission/index.yaml`
- `.mission/**/mission.yaml`
- `.mission/**/readiness.yaml`
- `_workspaces/README.md`
- opt-in local-only `_workmeta/<project_code>/**`

## 생성 순서

```mermaid
flowchart LR
  S["Scan"] --> R["Resolve"]
  R --> V["Validate"]
  V --> D["Derive"]
  D --> E["Render"]
```

- `Scan` = owner roots 와 local-only mount policy 를 읽는다.
- `Resolve` = catalog ref, unit binding, workflow/party relation 을 해석한다.
- `Validate` = owner root 최소 파일 세트와 cross-ref 를 검사한다.
- `Derive` = 7축 top-level payload 와 renderer surface 를 계산한다.
- `Render` = derived state 를 소비한다.

## 현재 구현 범위

- `sync-body-state` = 상태 보고용 no-op
- `resolve-loadout` = class/workflow/party summary
- `resolve-workspaces` = local-only mount inspector
- `validate` = 7축 owner root 최소 검증
- `derive-ui-state` = 7축 payload + renderer surface
- renderer = `derive-ui-state --json` 소비자

## local-only workspace 규칙

- public repo 기본 모드는 `_workspaces/README.md` 만 기대한다.
- 실제 `_workspaces/<project_code>/` scan 은 `--local-workspaces` 가 있을 때만 수행한다.
- `--workspace-root` 또는 `SOULFORGE_LOCAL_WORKSPACE_ROOT` 로 private mount root 를 바꿀 수 있다.
- repo 내부 `_workspaces/` 를 scan 하면 `company`, `personal` 디렉터리는 project 후보가 아니므로 warning 후 skip 한다.

## 검증 규칙

1. `.registry`, `.unit`, `.workflow`, `.party`, `.mission` 은 각 owner root 의 현재 파일 세트로 검사한다.
2. `.unit` 는 active binding owner surface 로 검사한다.
3. `.workflow/history` 는 curated summary only 여야 한다.
4. `.party/stats` 는 template-level observation only 여야 한다.
5. public fixture 는 actual project id, run id, analytics, reports, artifacts 를 포함하지 않는다.
6. `resolve-workspaces` 는 public-safe mode 에서 local-only project contract 깊이 검증을 강제하지 않는다.

## derive 규칙

1. `derive-ui-state` 는 `species`, `units`, `classes`, `workflows`, `parties`, `missions`, `workspaces` top-level axis 를 낸다.
2. `overview`, `body`, `class_view`, `catalogs`, `ui_hints` 는 renderer surface 다.
3. `workspaces.projects` 는 direct `<project_code>` detection 결과만 가진다.
4. `workspaces.local_scan_enabled = false` 인 fixture 는 synthetic public-safe baseline 이어야 한다.

## 트리거

- catalog root 변경
- unit owner 변경
- workflow / party canon 변경
- mission plan canon 변경
- `_workspaces` local-only 정책 변경
- local smoke harness 변경

## 커밋 규칙

1. 정본 구조를 바꾸면 관련 UI contract 문서와 derive consumer 를 같은 변경 안에서 맞춘다.
2. 정본 owner vocabulary 와 UI consumer vocabulary 가 어긋난 상태로 두지 않는다.
3. local-only 정책을 바꾸면 `.gitignore`, `_workspaces/README.md`, guardrail check 를 같이 맞춘다.

