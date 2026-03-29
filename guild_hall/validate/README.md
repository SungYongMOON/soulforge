# guild_hall/validate

## 목적

- `validate/` 는 Soulforge canonical root 의 최소 무결성을 자동으로 점검하는 cross-project validation capsule 이다.
- 첫 단계에서는 path/ref/readiness 같은 구조 규칙을 public-safe 하게 검사한다.

## 포함 대상

- `canon_validate.mjs`
  - `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces/README.md` 의 최소 무결성 검사
  - `--json` 출력 지원
- `run_root_acceptance.mjs`
  - root `validate` / `done:check` 단계 실행기
  - canon, UI, gateway harness 를 한 entrypoint 로 묶음

## 실행 계약

- canonical entrypoint:
  - `npm run guild-hall:validate:canon`
- convenience alias:
  - `npm run canon:validate`
- root harness:
  - `npm run validate`
  - `npm run done:check`
  - `npm run validate:gateway`

## 관련 경로

- [`../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md`](../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md)
- [`../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md`](../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md)
- [`../../docs/architecture/ui/UI_SYNC_CONTRACT.md`](../../docs/architecture/ui/UI_SYNC_CONTRACT.md)
- [`../doctor/README.md`](../doctor/README.md)
