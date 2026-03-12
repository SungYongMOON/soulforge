# _workspaces/personal

## 목적

- `personal/` 는 개인 성격의 실제 프로젝트 폴더를 둔다.
- 회사 프로젝트와 분리된 개인 운영 현장을 관리한다.

## 포함 대상

- 개인 프로젝트 루트
- 필요 시 각 프로젝트 아래의 `.project_agent/`

## 제외 대상

- 회사 프로젝트
- 본체와 클래스 계층 자산

## 관련 경로

- [`_workspaces/README.md`](../README.md)
- [`docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`](../../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/workspace/PROJECT_AGENT_MINIMUM_SCHEMA.md`](../../docs/architecture/workspace/PROJECT_AGENT_MINIMUM_SCHEMA.md)

## 상태

- Draft
- `sample_unbound_project/` 는 `_workspaces/personal/` 아래에 둔 첫 unbound reference sample project 다.
- `sample_unbound_project/` 는 프로젝트 폴더만 존재하고 `.project_agent/` 는 의도적으로 두지 않는다.
- personal root 의 sample 역시 운영용 실프로젝트가 아니라 v1 상태판에서 `unbound` 를 고정하는 baseline 이다.
