# .agent_class

## 목적

- `.agent_class/` 는 현재 환경에 설치된 직업 계층의 정본을 둔다.
- 본체를 바꾸지 않고 어떤 역량과 장비를 장착했는지 관리한다.

## 포함 대상

- `class.yaml`, `loadout.yaml`
- `skills/`, `tools/`, `workflows/`, `knowledge/`
- class owner 문서와 비추적 로컬 상태 경계

## 제외 대상

- 본체 장기 기억과 본체 정책
- 실제 프로젝트 파일과 프로젝트별 `.project_agent/`

## 관련 경로

- [루트 README](../README.md)
- [`.agent_class/docs/README.md`](docs/README.md)
- [`.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`](docs/architecture/AGENT_CLASS_MODEL.md)
- [`.agent/README.md`](../.agent/README.md)

## 상태

- Draft
- 클래스 계층 경계는 정의되었다. 모듈별 세부 규약은 추후 정의 예정이다.
