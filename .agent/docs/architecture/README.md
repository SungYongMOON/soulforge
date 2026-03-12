# .agent/docs/architecture

## 목적

- `.agent/docs/architecture/` 는 `.agent` private operating system 의 구조 문서와 계약 문서를 고정하는 위치다.
- 본체 기관 의미, body 메타 규칙, section-owned YAML index 규칙을 저장소 공용 문서와 분리해서 관리한다.

## 포함 대상

- `AGENT_BODY_MODEL.md`
- `BODY_METADATA_CONTRACT.md`
- 추후 추가될 `protocols`, `sessions`, `runtime` 관련 본체 계약 문서

## 제외 대상

- 저장소 전체 아키텍처 문서
- class 구조 문서와 project 연결 문서
- `_teams/shared` owner 문서

## 대표 파일

- [`AGENT_BODY_MODEL.md`](AGENT_BODY_MODEL.md): durable agent unit body 구조와 현재 YAML 배치의 정본 설명
- [`BODY_METADATA_CONTRACT.md`](BODY_METADATA_CONTRACT.md): `body.yaml`, `body_state.yaml`, `section_files` 동기화 기준 계약
- [`README.md`](README.md): architecture 문서군의 owner 경계 안내

## 참조 관계

- `AGENT_BODY_MODEL.md` 는 `.agent` 하위 기관 의미를 설명하고, `BODY_METADATA_CONTRACT.md` 는 그 의미가 `body.yaml`, `body_state.yaml`, section-owned YAML index 에 어떻게 반영되는지 고정한다.
- 루트 `docs/architecture/` 문서는 저장소 전체 소유 경계를 설명하고, 이 폴더는 `.agent` owner 내부 계약만 설명한다.
- [`../README.md`](../README.md)
- [`../../../docs/architecture/README.md`](../../../docs/architecture/README.md)

## 변경 원칙

- `engine/` 경로 유지 하의 runtime 재정의, continuity 계약 세분화, policy floor 계약 추가 같은 구조 변경은 먼저 이 문서군에서 정의한 뒤 폴더 README 와 메타 파일을 맞춘다.
- canonical body contract 는 이 폴더에 두고, 요약 설명은 각 owner README 에만 남긴다.
- team shared 표준이 생겨도 canonical shared 문서는 루트 경계에서 관리하고 여기로 끌어오지 않는다.
