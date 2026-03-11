# .agent_class

## 목적

- `.agent_class/` 는 현재 환경에 설치된 직업 계층의 정본을 둔다.
- 본체를 바꾸지 않고 어떤 installed module 이 있고 어떤 module id 를 장착했는지 관리한다.

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
- [`.agent_class/docs/architecture/MODULE_REFERENCE_CONTRACT.md`](docs/architecture/MODULE_REFERENCE_CONTRACT.md)
- [`.agent/README.md`](../.agent/README.md)

## 상태

- Draft
- 클래스 계층 경계는 정의되었다.
- installed library 는 `module.yaml` manifest 기준으로 해석하고, loadout 는 module id 기준으로 장착한다.
- installed library roots 아래에는 `sample_` prefix 디렉터리와 `sample.` module id 를 쓰는 repo-tracked reference sample baseline 이 들어올 수 있다.
- local CLI 는 workspace `.project_agent` 계약도 스캔해 `bound`, `unbound`, `invalid` 상태를 분류한다.
- local CLI 는 body/class/workspace resolve 결과를 renderer 입력용 derived state 로도 조합한다.
- local CLI 는 `.agent_class/tools/local_cli/ui_viewer/` 에서 derived state 소비자 역할의 read-only UI prototype 도 제공한다.
- read-only viewer 의 9차 개선은 표현 계층 한정이며, class 정본 구조나 derive 계약을 바꾸지 않는다.
- 현재 v1 closeout 범위는 installed/loadout resolve, derived state, read-only viewer, baseline 3종 연동까지로 닫혀 있다.
