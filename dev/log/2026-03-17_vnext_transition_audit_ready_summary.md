# 2026-03-17 vNext transition audit-ready summary

관련 계획: [2026-03-16_vnext_canon_migration_plan.md](../plan/2026-03-16_vnext_canon_migration_plan.md)

## 목적

- 2026-03-16 vNext 정본 전환에서 실제로 반영된 범위를 감리 관점에서 한 문서로 정리한다.
- public repo 정본, owner-local skeleton, validator/fixture 전환, local-only smoke 경계까지 현재 상태를 요약한다.
- 아직 남아 있는 legacy bridge 와 out-of-scope 변경을 분리해서 기록한다.

## 반영 완료 커밋

### 1. foundation + owner-local + validator/fixture 전환

- 커밋: `2cdb0fb`
- 메시지: `vNext 6축 정본 문서, skeleton, UI validator fixture 전환`
- 요약:
  - 루트 정본을 3축에서 6축으로 재정의했다.
  - `.unit`, `.workflow`, `.party` skeleton 을 추가했다.
  - `.agent`, `.agent_class` owner-local README 를 새 canon 기준으로 교체했다.
  - `ui_sync.py`, UI fixture, UI lint, UI schema 를 새 6축 payload 기준으로 전환했다.
  - `_workspaces` 를 local-only mission site mount point 로 재정의하고 `.gitignore` 를 그 정책에 맞췄다.

### 2. local-only smoke 경로 분리

- 커밋: `e798b04`
- 메시지: `local-only smoke path for vNext workspace validation`
- 요약:
  - `ui_sync.py` 에 `--workspace-root` 와 `SOULFORGE_LOCAL_WORKSPACE_ROOT` 지원을 추가했다.
  - public-safe 기본 검증과 opt-in local smoke 경로를 분리했다.
  - repo `_workspaces/` 를 default 로 스캔할 경우 legacy `company/`, `personal/` bridge 를 warning 후 skip 하도록 했다.

## 이번 전환에서 고정된 정본

- `.agent` = species / hero catalog
- `.unit` = active agent unit owner
- `.agent_class` = class / package catalog
- `.workflow` = workflow canon + curated learning history
- `.party` = reusable party template + template-level stats
- `_workspaces` = reserved / local-only mission site mount point

## 반영된 핵심 결과

### A. foundation 문서와 루트 지도

- [README.md](../../README.md) 는 상위 지도 역할만 유지하고 6축 정본을 설명한다.
- [TARGET_TREE.md](../../docs/architecture/foundation/TARGET_TREE.md) 는 새 target tree 와 `_workspaces/<project_code>/` local-only materialization 을 고정한다.
- [DOCUMENT_OWNERSHIP.md](../../docs/architecture/foundation/DOCUMENT_OWNERSHIP.md) 는 새 owner 기준으로 책임 경계를 분리한다.
- [_workspaces/README.md](../../_workspaces/README.md) 와 [WORKSPACE_PROJECT_MODEL.md](../../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md) 는 public/private 경계와 `_workspaces/<project_code>/` 직행 구조를 고정한다.

### B. owner-local skeleton

- `.agent/` 는 species / hero catalog template skeleton 을 가진다.
- `.agent_class/` 는 class / package catalog template skeleton 을 가진다.
- `.unit/` 는 active owner template skeleton 을 가진다.
- `.workflow/` 는 workflow canon template 와 curated `history/README.md` 를 가진다.
- `.party/` 는 reusable template 와 curated `stats/README.md` 를 가진다.

### C. validator / fixture / UI 파생 상태

- [ui_sync.py](../../.agent_class/tools/local_cli/ui_sync/ui_sync.py) 는 더 이상 `.agent/body.yaml`, `.agent_class/loadout.yaml`, `.agent_class/workflows`, `_workspaces/company|personal` 를 canonical input 으로 취급하지 않는다.
- derived payload 는 `species`, `units`, `classes`, `workflows`, `parties`, `workspaces` 6축 top-level 을 가진다.
- renderer compatibility 를 위해 `overview`, `body`, `class_view` projection 은 유지하되 정본 surface 는 6축 top-level 로 옮겼다.
- public fixture 는 synthetic-only 정책을 유지하고 actual project id, run id, analytics, battle log, reports, raw performance metrics 를 포함하지 않는다.

### D. local-only smoke 경계

- public-safe 기본 경로는 실제 `_workspaces/<project_code>/` materialization 없이도 동작한다.
- opt-in local smoke 는 `--local-workspaces` 와 `--workspace-root` 또는 `SOULFORGE_LOCAL_WORKSPACE_ROOT` 가 있을 때만 수행한다.
- local smoke 는 `_workspaces/<project_code>/` 직행 구조를 기대하고, legacy `company/`, `personal/` 는 canonical project 로 취급하지 않는다.
- local-only smoke sample 로 `_workspaces/P00-000/` 를 materialize 해 `project_agent_present=true` 인식까지 확인했다.
- `_workspaces/P00-000/**` 는 `.gitignore` 에 의해 public tracking 대상이 아니며 감리용 local sample 로만 사용한다.

## 현재 검증 상태

### PASS

- `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json`
- `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
- `npm run lint:ui-state --workspace @soulforge/ui-lint`
- `npm run lint:catalog --workspace @soulforge/ui-lint`
- `npm run lint:fixtures --workspace @soulforge/ui-lint`
- repo 내부 `_workspaces` 기준 local smoke 명령 자체는 정상 실행된다.
- `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --local-workspaces --workspace-root /Users/seabotmoon-air/Workspace/Soulforge/_workspaces --json`
  - local-only sample `P00-000` 인식
  - `project_count = 1`
- `python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --local-workspaces --workspace-root /Users/seabotmoon-air/Workspace/Soulforge/_workspaces --json`
  - `workspace_counts.total = 1`
  - `candidate_count = 1`

### WARN

- `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --local-workspaces --workspace-root /Users/seabotmoon-air/Workspace/Soulforge/_workspaces --json`
  - `workspace-root-default`
  - `legacy-workspace-bridge`: `_workspaces/company`
  - `legacy-workspace-bridge`: `_workspaces/personal`
- repo 내부 `_workspaces` 는 여전히 canonical private mount root 가 아니라 legacy bridge 와 local sample 이 함께 있는 혼합 상태다.
- live 문서와 일부 UI consumer code 에는 out-of-scope legacy vocabulary 가 일부 남아 있다.

### FAIL

- `git ls-files _workspaces` 결과상 `_workspaces/company/**`, `_workspaces/personal/**` sample baseline 이 여전히 tracked 상태다.
- 따라서 “public repo 에는 `_workspaces/README.md` 외 실제 mission site 내용이 없어야 한다”는 최종 보안 기준은 아직 완전히 달성되지 않았다.

## 감리 시 확인할 포인트

### 1. 정본 정의

- 새 정본 6축이 foundation 문서, owner-local README, validator 입력 구조에서 일관되게 적용되었는지 확인한다.
- `.run/` 루트가 새 정본에서 제거되었는지 확인한다.

### 2. public/private 경계

- `_workspaces` 는 public repo 에서 mount point 로만 설명되고 있는지 확인한다.
- `_workspaces/<project_code>/` actual content, `.project_agent/runs`, analytics, reports, artifacts 가 fixture 나 public validator 기본 경로에 섞이지 않는지 확인한다.

### 3. validator / UI 파생 상태

- validator 가 single-root body/loadout 전제를 canonical requirement 로 사용하지 않는지 확인한다.
- `derive-ui-state` 가 6축 top-level payload 를 내보내고 있는지 확인한다.
- synthetic fixture 만으로 UI lint 와 fixture lint 가 통과하는지 확인한다.

### 4. 남은 migration 작업

- tracked legacy `_workspaces/company/**`, `_workspaces/personal/**` cleanup
- live 문서와 UI consumer 에 남아 있는 legacy vocabulary 정리
- 실제 local mission site 를 새 `_workspaces/<project_code>/` 구조로 materialize 할 때의 smoke path 재검증

## 감리용 명령 목록

```bash
git log --oneline --decorate -5
git show --stat 2cdb0fb
git show --stat e798b04
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --local-workspaces --workspace-root /Users/seabotmoon-air/Workspace/Soulforge/_workspaces --json
python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-workspaces --local-workspaces --workspace-root /Users/seabotmoon-air/Workspace/Soulforge/_workspaces --json
git ls-files _workspaces
```

## 현재 작업 트리의 제외 대상

아래 경로는 이번 vNext 전환과 무관한 기존 변경이며, 감리 범위와 커밋 범위에서 제외했다.

- [`.agent_class/docs/architecture/README.md`](../../.agent_class/docs/architecture/README.md)
- [`.agent_class/docs/architecture/CODEX_APP_SERVER_AGENT_START_CHECKLIST.md`](../../.agent_class/docs/architecture/CODEX_APP_SERVER_AGENT_START_CHECKLIST.md)
- [`dev/experiments/`](../../dev/experiments/)

## 결론

- vNext 정본 6축, owner-local skeleton, validator/fixture 전환, local-only smoke 분리는 반영 완료 상태다.
- public-safe 기본 경로와 synthetic fixture 정책은 정상 동작한다.
- 다만 repo 에 남아 있는 legacy `_workspaces/company|personal` tracked baseline 은 감리에서 반드시 residual risk 로 보고해야 한다.

## ASSUMPTIONS

- `dev/plan/**`, `dev/log/**`, `docs/architecture/archive/**` 안의 legacy 용어는 historical record 로 보고 정본 위반으로 분류하지 않았다.
- local smoke 에 사용한 `_workspaces` 경로는 사용자가 실제 mount root 로 지정한 repo 내부 [`_workspaces/`](../../_workspaces/) 를 기준으로 기록했다.
