# _workspaces

## 목적

- `_workspaces/` 는 실제 프로젝트 운영 현장인 mission site 를 둔다.
- 추상 구조가 아니라 프로젝트 실자료와 결과물이 놓이는 공간이다.

## 범위

- 실제 프로젝트 폴더와 project 연결 규약만 다룬다.
- body organ, loadout 설치물, team shared 자산은 범위 밖이다.

## 포함 대상

- `company/`, `personal/` 아래의 실제 프로젝트 폴더
- 각 프로젝트 아래의 선택적 `.project_agent/` 연결 규약

## 제외 대상

- 본체 메모리와 클래스 지식 팩
- 저장소 전체 구조 문서와 클래스 운영 로그

## 미래 확장 방향

- 팀 단위 공유 자산은 `_workspaces` 가 아니라 루트 `_teams/shared/` 에서 확장한다.
- mission site 는 실제 현장 자료 owner 로 유지하고 shared baseline 은 분리한다.

## 관련 경로

- [루트 README](../README.md)
- [`_workspaces/company/README.md`](company/README.md)
- [`_workspaces/personal/README.md`](personal/README.md)
- [`docs/architecture/WORKSPACE_PROJECT_MODEL.md`](../docs/architecture/WORKSPACE_PROJECT_MODEL.md)

## 상태

- Stable
- 실제 프로젝트 폴더는 이 경계 안에 둔다.
- workspace project 상태는 `.project_agent` resolve 결과에 따라 `bound`, `unbound`, `invalid` 로 분류할 수 있다.
- `_workspaces/company/sample_reference_project/` 는 운영용 실프로젝트가 아니라 repo-tracked reference sample project 로 유지한다.
- `_workspaces/company/sample_bound_project/` 는 운영용 실프로젝트가 아니라 두 번째 bound reference sample project 로 유지한다.
- `_workspaces/personal/sample_unbound_project/` 는 `.project_agent/` 가 의도적으로 없는 unbound reference sample project 로 유지한다.
- 현재 repo-tracked sample 상태 세트는 `sample_reference_project = bound`, `sample_bound_project = bound`, `sample_unbound_project = unbound` 다.
- 세 sample project 는 모두 운영용 실프로젝트가 아니라 v1 상태판과 viewer 검증의 기준선 baseline 이다.
