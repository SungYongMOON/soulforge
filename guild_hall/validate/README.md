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
  - AX·SE, Quality Readiness, Database Engineering과 P5 context-generation candidate Engine gate를 먼저 실행한 뒤 Watchtower federation과 Team Ops Board 소비자를 검증하여 생성물 drift를 fail-closed 처리
- `local_absolute_path_policy.mjs`
  - concrete local absolute paths such as Windows drive-root paths, POSIX user-volume paths, and local file URI paths 를 차단
  - 기본 `changed` scope 는 현재 변경분만 검사해서 새 upload 후보에 절대경로가 섞이는 것을 막음
  - `--scope tracked` 는 과거 tracked debt 전체를 점검하는 audit 모드
  - symlink file entry 는 `lstat` 으로 식별한 뒤 target 을 resolve/read 하지 않고 skip 함
- `path_length_policy.mjs` (2026-08-18)
  - Owner 결정: Windows 긴 경로 지원은 켜지 않는다(OneDrive·탐색기·Office·한컴이 어차피 깨짐). 새 경로는 예산 안에 들어와야 한다 — 총 길이 200자(로컬 checkout 접두 13자 포함), 폴더명 60자, 파일명(확장자 제외) 60자, 슬러그 폴더 안 파일명에 슬러그 반복 금지, 이름 속 해시 16자 이하
  - `npm run validate:path-length`는 변경분(changed scope)을, `npm run validate:path-length:tracked`는 tracked 전체(audit)를 검사한다. `--assert-path <repo-relative> [--kind directory]`로 단건 검사
  - `guard:workmeta-write`가 같은 예산을 write target에 적용한다(`path_budget_*` violation)
- `workmeta_payload_policy.mjs`
  - `npm run guard:workmeta-write -- --assert-write-target "<target>"`는 `_workmeta` 파일 생성 전에 metadata-only 경계를 검사한다. 디렉터리는 `--target-kind directory`를 추가한다.
  - `npm run validate:workmeta-payload`는 Git ignore 여부와 무관하게 새 runtime residue를 검사하고, 기존 HEAD에 이미 있던 legacy 경로만 grandfather한다.
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
  - `npm run validate:path-length`
  - `npm run validate:path-length:tracked`
  - `npm run validate:role-boundary`
  - `npm run validate:activity`
  - `npm run validate:knowledge-access`
  - `npm run validate:town-crier`
  - `npm run validate:engineering-engine-p5-context-generation-candidate`
  - `npm run validate:quality-readiness`
  - `npm run validate:quality-readiness-deepening`
  - `npm run validate:database-engineering`
  - `npm run validate:material-procurement-readiness`
  - `npm run validate:configuration-change-impact`
  - `npm run validate:manufacturing-readiness`
  - `npm run validate:field-failure-corrective-action`
  - `npm run validate:safety-hazard`
  - `npm run validate:bom-supply-chain-risk`
  - `npm run validate:pcb-compliance`
  - `npm run validate:reliability-maintainability`
  - `npm run validate:calibration-measurement-validity`
  - `npm run validate:watchtower`
  - `npm run validate:gateway`

Windows PowerShell 에서는 `npm.ps1` execution policy 차이를 피하기 위해 같은 script 를 `npm.cmd run validate`, `npm.cmd run done:check` 처럼 실행한다.

## 관련 경로

- [`../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md`](../../docs/architecture/foundation/ONTOLOGY_MODEL_V0.md)
- [`../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md`](../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md)
- [`../../docs/architecture/ui/UI_SYNC_CONTRACT.md`](../../docs/architecture/ui/UI_SYNC_CONTRACT.md)
- [`../doctor/README.md`](../doctor/README.md)
