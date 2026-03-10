# 저장소 지침

- 변경은 작고 범위가 명확하게 유지한다.
- `.agent`, `.agent_class`, `_workspaces` 는 책임이 분리된 별도 계층으로 다룬다.
- 아키텍처 결정이 바뀌면 `README.md` 와 `docs/architecture/` 문서를 우선 갱신한다.
- `.agent_class/_local/` 의 로컬 전용 상태는 절대 커밋하지 않는다.
