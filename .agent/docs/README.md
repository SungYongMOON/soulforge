# .agent/docs

## 목적

- `.agent/docs/` 는 private operating system 으로서의 `.agent` 를 설명하는 body owner 문서의 정본 위치다.
- 저장소 공용 문서와 분리해서 본체 경계, 기관 의미, body YAML 메타 계약을 관리한다.

## 포함 대상

- 본체 구조 설명 문서
- 본체 기관 README 와 연결되는 아키텍처 규약
- `body.yaml`, `body_state.yaml`, section-owned YAML 메타 계약 문서

## 제외 대상

- 저장소 전체 구조 문서
- class owner 문서, mission site 문서, shared team 운영 문서
- 본체 외 owner 의 canonical contract

## 대표 파일

- [`README.md`](README.md): `.agent/docs/` owner 경계와 문서 소유 원칙을 정의하는 현재 정본
- [`architecture/AGENT_BODY_MODEL.md`](architecture/AGENT_BODY_MODEL.md): body 구조 의미와 현재 YAML 배치를 설명하는 정본 문서
- [`architecture/BODY_METADATA_CONTRACT.md`](architecture/BODY_METADATA_CONTRACT.md): body 메타와 section-owned YAML index 규칙을 설명하는 계약 문서

## 참조 관계

- `.agent/docs/` 는 `.agent` README 들이 참조하는 canonical 문서군을 제공하고, 각 폴더 README 는 이 문서군의 요약 경계 문서로 동작한다.
- body 구조나 메타 계약이 바뀌면 루트 `docs/architecture/` 문서와 owner 경계 문서 사이의 링크를 함께 점검한다.
- [`../README.md`](../README.md)
- [`architecture/README.md`](architecture/README.md)
- [`../../docs/architecture/DOCUMENT_OWNERSHIP.md`](../../docs/architecture/DOCUMENT_OWNERSHIP.md)

## 변경 원칙

- `.agent` 폴더 책임, 파일, 하위 구조가 바뀌면 같은 변경 안에서 해당 README 와 이 경계를 함께 갱신한다.
- section-owned YAML 메타가 늘어나면 먼저 body 계약 문서에 반영한 뒤 각 owner README 를 맞춘다.
- `engine/` 경로는 현재 유지하고 runtime 의미를 우선하는 문서 재정의를 여기서 함께 관리한다.
