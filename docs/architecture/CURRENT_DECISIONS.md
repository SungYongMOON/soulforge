# 현재 결정 사항

- Soulforge를 저장소명과 아키텍처명으로 사용한다.
- 저장소는 `.agent`, `.agent_class`, `_workspaces` 를 중심으로 구성한다.
- 루트 `docs/` 는 저장소 전체 설명만 소유한다.
- 메모리는 본체 계층에 속한다.
- 지식은 클래스 계층에 속한다.
- 스킬과 도구는 분리된 모델로 다룬다.
- 워크플로우는 운영 규범으로 취급한다.
- 프로젝트별 상태는 프로젝트 폴더 내부에 유지한다.
- body 운영 문서는 `.agent/docs/` 아래에 둔다.
- `.agent_class` 아래 `_local/` 은 무시되는 로컬 전용 데이터를 위해 남겨 둔다.
- class 운영 문서는 `.agent_class/docs/` 아래에 둔다.
- 루트 문서 세트는 `REPOSITORY_PURPOSE`, `AGENT_WORLD_MODEL`, `WORKSPACE_PROJECT_MODEL`, `PROJECT_AGENT_MINIMUM_SCHEMA`, `TARGET_TREE`, `DOCUMENT_OWNERSHIP`, `CURRENT_DECISIONS`, `MIGRATION_REFERENCE` 를 기준으로 유지한다.
