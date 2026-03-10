# _workspaces/company

## 목적

- `company/` 는 회사 성격의 실제 프로젝트 폴더를 둔다.
- 조직 소유 프로젝트를 개인 프로젝트와 분리한다.

## 포함 대상

- 회사 프로젝트 루트
- 필요 시 각 프로젝트 아래의 `.project_agent/`

## 제외 대상

- 개인 프로젝트
- 본체와 클래스 계층 자산

## 관련 경로

- [`_workspaces/README.md`](../README.md)
- [`docs/architecture/WORKSPACE_PROJECT_MODEL.md`](../../docs/architecture/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md`](../../docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md)

## 상태

- Draft
- `sample_reference_project/` 는 `_workspaces/company/` 아래에 둔 bound baseline reference sample project 다.
- `sample_invalid_project/` 는 `_workspaces/company/` 아래에 둔 invalid baseline reference sample project 다.
- 두 sample project 모두 운영용이 아니라 구조 검증과 회귀 입력 baseline 이다.
