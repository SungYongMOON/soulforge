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
  - path-policy, role-boundary, canon, snapshot, activity, knowledge-access, town_crier, UI, gateway harness 를 한 entrypoint 로 묶음
- `local_absolute_path_policy.mjs`
  - concrete local absolute paths such as Windows drive-root paths, POSIX user-volume paths, and local file URI paths 를 차단
  - 기본 `changed` scope 는 현재 변경분만 검사해서 새 upload 후보에 절대경로가 섞이는 것을 막음
  - `--scope tracked` 는 과거 tracked debt 전체를 점검하는 audit 모드
  - symlink file entry 는 `lstat` 으로 식별한 뒤 target 을 resolve/read 하지 않고 skip 함
- `workmeta_payload_policy.mjs`
  - `_workmeta` 안에 HWP/HWPX, Office, PDF, 압축파일, mail raw/archive 확장자 파일이 생기면 차단
  - 파일 내용은 읽지 않고 경로와 확장자만 검사해서 ignored local payload 재생성을 잡음
- `run_ui_workspace_command.mjs`
  - root npm script 에서 `ui-workspace` script 를 실행하는 portability wrapper
  - `UI_LINT_CANONICAL_ROOT` 기본값을 설정하고 Windows 에서는 `npm.cmd`, 그 외 환경에서는 `npm` 을 직접 실행
- `role_boundary_validate.mjs`
  - local `node_identity.yaml` 의 `primary_writer.public_repo` 를 읽고, non-primary node 가 protected public contract 문서를 수정했는지 검사
  - `guild_hall/state/local/node_identity.yaml` 이 없는 CI/public-only 환경에서는 advisory warning 으로만 처리

## 실행 계약

- canonical entrypoint:
  - `npm run guild-hall:validate:canon`
- convenience alias:
  - `npm run canon:validate`
- root harness:
  - `npm run validate`
  - `npm run done:check`
  - `npm run validate:path-policy`
  - `npm run validate:path-policy:all`
  - `npm run validate:path-policy:state`
  - `npm run validate:workmeta-payload`
  - `npm run validate:role-boundary`
  - `npm run validate:activity`
  - `npm run validate:knowledge-access`
  - `npm run validate:town-crier`
  - `npm run validate:gateway`

Windows PowerShell 에서는 `npm.ps1` execution policy 차이를 피하기 위해 같은 script 를 `npm.cmd run validate`, `npm.cmd run done:check` 처럼 실행한다.

## 관련 경로

- [`../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md`](../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md)
- [`../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md`](../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md)
- [`../../docs/architecture/ui/UI_SYNC_CONTRACT.md`](../../docs/architecture/ui/UI_SYNC_CONTRACT.md)
- [`../doctor/README.md`](../doctor/README.md)
