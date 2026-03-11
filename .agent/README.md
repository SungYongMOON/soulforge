# .agent

## 목적

- `.agent/` 는 한 명의 durable agent unit 을 이루는 private operating system 이다.
- loadout 교체와 mission site 이동 이후에도 남는 본체 기관과 메타를 관리한다.

## 범위

- body 소유의 지속 계층, 본체 기본값, 운영 기관, 구조 메타만 다룬다.
- `.agent_class` 의 장착 구성과 `_workspaces` 의 현장 실자료는 이 범위 밖이다.

## 포함 대상

- `body.yaml`, `body_state.yaml`
- `identity/`, `engine/`, `memory/`, `sessions/`, `communication/`, `protocols/`, `autonomic/`, `policy/`, `registry/`, `artifacts/`, `docs/`
- 본체 owner 기준의 구조 문서와 기관 README

## 제외 대상

- 설치형 `skills`, `tools`, `workflows`, `knowledge` 와 현재 장착 상태인 loadout
- 실제 프로젝트 파일, 프로젝트별 `.project_agent/`, mission 결과물 원본
- 미래 협업 확장 경로인 `_teams/shared/`
- 독립 top-level body 기관으로서의 `export/`

## 미래 확장 방향

- `engine/` 는 현재 경로를 유지하되 의미는 runtime layer 로 재정의하고, 추후 major 정리에서 `runtime/` rename 을 검토한다.
- 팀 협업과 shared 운영 자산은 `.agent` 안이 아니라 저장소 루트의 `_teams/shared/` 로 확장한다.
- `protocols/`, `sessions/`, `autonomic/` 의 세부 스키마는 후속 계약 문서에서 깊게 정의한다.

## 관련 경로

- [루트 README](../README.md)
- [`.agent/docs/README.md`](docs/README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md)
- [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](docs/architecture/BODY_METADATA_CONTRACT.md)

## 상태

- Draft
- 본체 경계, body 메타, 핵심 기관 의미를 우선 고정했고 세부 파일 세트는 후속 차수에서 확장한다.
