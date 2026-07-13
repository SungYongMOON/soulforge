# .registry/docs/operations

- `.registry/docs/operations/` 는 `.registry` owner-local 운영 절차를 둔다.
- tracked skill package 의 `codex/` bridge 를 local `~/.codex/skills/` installed mirror 로 동기화하는 절차를 이 경로에서 설명한다.
- public-safe Codex pet package를 `${CODEX_HOME:-$HOME/.codex}/pets/`에 opt-in 동기화하는 절차는 [`CODEX_PET_INSTALL_SYNC.md`](CODEX_PET_INSTALL_SYNC.md)에서 설명한다.
- pet package source는 [`codex_pets/`](codex_pets/)가 소유하며 일반 bootstrap에서는 자동 설치하지 않는다.
- skill canon / executor bridge 경계 자체는 [`../architecture/SKILL_CANON_BOUNDARY.md`](../../../.registry/docs/architecture/SKILL_CANON_BOUNDARY.md) 를 따른다.
