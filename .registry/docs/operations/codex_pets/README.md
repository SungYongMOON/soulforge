# Codex pet operations packages

- 이 폴더는 cross-PC에서 명시적으로 설치하는 public-safe Codex pet package를 둔다.
- 각 package는 `<pet_id>/pet.json`과 `<pet_id>/spritesheet.webp` 두 파일만 포함한다.
- 이 경로는 opt-in 운영 배포 surface이며 새 `.registry` 정본 category가 아니다.
- 설치·검증·제거 계약은 [`../CODEX_PET_INSTALL_SYNC.md`](../CODEX_PET_INSTALL_SYNC.md)를 따른다.
- 일반 bootstrap이나 skill sync는 이 package를 자동 설치하지 않는다.
- 현재 package: [`moru/`](moru/) — moon-forged Codex pet, sprite contract v2.
