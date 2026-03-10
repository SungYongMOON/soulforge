# 2026-03-10 Option 1 문서 정합성 보강 로그

## 작업 목적

문서 정합성 보강, class 문서 운영 구조 확정, `.project_agent` 최소 스키마 기준 추가.

## 변경 파일

- `AGENTS.md`
- `README.md`
- `docs/architecture/REPOSITORY_PURPOSE.md`
- `docs/architecture/AGENT_BODY_MODEL.md`
- `docs/architecture/AGENT_CLASS_MODEL.md`
- `docs/architecture/WORKSPACE_PROJECT_MODEL.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`
- `docs/architecture/CURRENT_DECISIONS.md`
- `docs/architecture/AGENT_WORLD_MODEL.md`
- `docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `.agent_class/docs/architecture/DOCUMENT_OWNERSHIP.md`
- `.agent_class/docs/architecture/CLASS_METADATA_CONTRACT.md`
- `.agent_class/docs/devlog/README.md`
- `.agent_class/docs/prompts/README.md`
- `.agent_class/docs/plans/2026-03-10_docs_relocation_plan.md`

## 변경 이유

- `AGENTS.md` 를 bootstrap/setup 헌장 역할에 맞게 축약했다.
- root 문서와 class 문서의 소유 원칙을 분리해 기록했다.
- `class.yaml` 과 `loadout.yaml` 의 차이를 class 문서 쪽 계약으로 명확히 했다.
- `.project_agent` 네 파일의 최소 역할과 필드를 문서로 고정했다.

## 남은 리스크

- root `docs/architecture/` 에 아직 body/class 소유 문서가 과도기적으로 남아 있다.
- relocation 은 계획만 만들어졌고 실제 이동은 후속 작업이다.

## 다음 작업

- relocation 계획 기준으로 root 문서 이동 범위를 확정한다.
- `.agent/docs/architecture/` 와 `.agent_class/docs/architecture/` 의 정리 순서를 결정한다.
