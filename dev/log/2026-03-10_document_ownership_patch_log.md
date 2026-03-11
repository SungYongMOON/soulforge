# 2026-03-10 문서 소유권 정리 패치 로그

## 작업 목적

root `docs/` 에 남아 있던 body/class 전용 문서를 owner 기준 위치로 이동하고, 링크와 문서 소유 원칙을 새 기준에 맞게 보정한다.

## 이동한 파일

- `docs/architecture/AGENT_BODY_MODEL.md` -> `.agent/docs/architecture/AGENT_BODY_MODEL.md`
- `docs/architecture/AGENT_CLASS_MODEL.md` -> `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`
- `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md` -> `.agent_class/docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`
- `.agent_class/docs/architecture/DOCUMENT_OWNERSHIP.md` -> `docs/architecture/DOCUMENT_OWNERSHIP.md`

## root 유지 파일

- `README.md`
- `AGENTS.md`
- `docs/architecture/REPOSITORY_PURPOSE.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/CURRENT_DECISIONS.md`
- `docs/architecture/MIGRATION_REFERENCE.md`
- `docs/architecture/WORKSPACE_PROJECT_MODEL.md`
- `docs/architecture/AGENT_WORLD_MODEL.md`
- `docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `docs/architecture/DOCUMENT_OWNERSHIP.md`

## 링크 갱신 파일

- `README.md`
- `AGENTS.md`
- `docs/architecture/REPOSITORY_PURPOSE.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/CURRENT_DECISIONS.md`
- `docs/architecture/DOCUMENT_OWNERSHIP.md`
- `.agent/docs/architecture/AGENT_BODY_MODEL.md`
- `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`
- `.agent_class/docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`

## 위치 결정

`DOCUMENT_OWNERSHIP.md` 는 class 전용 규칙이 아니라 repo 전체 문서 소유권 규칙이므로 root `docs/architecture/` 아래에 두는 쪽이 더 자연스럽다고 판단했다.

## 남은 리스크

- alias/index 문서를 추가할지 여부는 아직 정하지 않았다.
- `TARGET_TREE.md` 의 세부 표현 수준은 후속 정리 여지가 있다.
