# .agent_class/knowledge

## 목적

- `knowledge/` 는 클래스가 설치해 쓰는 지식 팩을 둔다.
- 본체의 `memory/` 와 분리된 설치형 지식 계층을 관리한다.

## 포함 대상

- 설치형 지식 팩
- 지식 메타와 로드 기준

## 제외 대상

- 본체 장기 기억
- 프로젝트 실자료 원본

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent/memory/README.md`](../../.agent/memory/README.md)
- [`.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`](../docs/architecture/AGENT_CLASS_MODEL.md)

## 상태

- Draft
- memory 와 knowledge 의 경계는 고정한다. 팩 구조는 추후 정의 예정이다.
- `sample_` prefix 지식 팩은 운영 지식이 아니라 resolve/derive/render happy-path 회귀 입력용 baseline 으로 둘 수 있다.
