# CHANGELOG

Soulforge public repo 의 구조/기능/운영 문서 변경을 버전 대신 revision 단위로 기록한다.
Git log 는 원문 이력을 남기고, 이 문서는 사람이 읽는 patch note 와 운영 영향만 요약한다.

## 기록 원칙

- public repo changelog 는 기능 코드, 구조 문서, bootstrap/doctor/update/handoff 규칙 변경을 기록한다.
- 보호 대상 업무 데이터와 continuity record 는 여기 적지 않고 nested `private-state/CHANGELOG.md` 에 적는다.
- secret 값, credential, token, password 는 절대 기록하지 않는다.

## 2026-03-27

### Revision `working` - bootstrap 프로필을 public-only/operator/owner-with-state 3단으로 정리

- `public-only` 가 operator env 없이도 성립하도록 bootstrap profile 문서, checklist, doctor 계약을 정리했다.
- 새 `operator` 프로필을 추가해 private repo 없이도 gateway/town_crier local env 와 smoke/live 를 다룰 수 있게 했다.
- `owner-with-state` 는 계속 `_workmeta/`, `private-state/` 와 continuity restore 를 요구하는 owner 전용 프로필로 유지했다.

### Revision `working` - root canon validator 첫 버전 추가

- `guild_hall/validate/canon_validate.mjs` 를 추가해 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces/README.md` 의 최소 path/ref/readiness 무결성을 점검하게 했다.
- canonical entrypoint 는 `npm run guild-hall:validate:canon` 으로 두고, convenience alias 로 `npm run canon:validate` 를 함께 제공한다.
- mission 의 `workflow_id: null` 예외가 readiness blocked 규칙과 맞는지도 첫 validator 범위에 포함했다.

### Revision `working` - root validate/done-check 와 GitHub Actions 최소 게이트 추가

- root `validate`, `done:check`, `validate:gateway` entrypoint 를 추가해 canon validator, UI acceptance, `mail_fetch` pytest harness 를 한 surface 로 묶었다.
- `.github/workflows/validate.yml` 을 추가해 PR 과 `main` push 에서 `npm run done:check` 를 돌리는 최소 public CI gate 를 열었다.
- `CONTRIBUTING.md`, `SECURITY.md` 를 추가해 public contribution 기준선과 비공개 보안 제보 원칙을 정리했다.

### Revision `working` - update manual 에 operator 프로필 절차 추가

- `UPDATE_MANUAL_V0.md` 에 `operator` update 절차를 추가해 `public-only`, `operator`, `owner-with-state` 3단 프로필이 bootstrap 과 update 문서에서 같은 구조를 갖도록 맞췄다.
- `operator` 는 public repo pull + local operator env 유지까지만 다루고, private repo pull 은 하지 않는다고 다시 고정했다.

### Revision `working` - night_watch Stage 0 preflight 를 script owner 로 분리 시작

- `guild_hall/night_watch/preflight_repo_sync.mjs` 와 `npm run guild-hall:night-watch:preflight` 를 추가해 repo sync, retry, owner-with-state remote doctor, activity log write 를 deterministic script 가 맡게 했다.
- `soulforge-night-watch-pipeline.prompt.txt` 와 `NIGHT_WATCH_AUTOMATION_V0.md` 의 Stage 0 는 이제 자연어로 git/doctor 제어를 다시 서술하지 않고, preflight script 실행과 그 결과 소비를 기준으로 삼는다.

### Revision `working` - gateway intake dedupe index manifest 추가

- `guild_hall/gateway/monster_index.mjs` 를 추가해 `intake_inbox/**/monsters.json` 전역 파싱 대신 `intake_inbox/_index/monster_index.json` manifest cache 를 우선 읽는 구조를 넣었다.
- `runIntake`, `touchExistingMonster`, `update-monster` 는 `monsters.json` 저장 뒤 manifest 를 함께 갱신하도록 맞췄다.
- `validate:gateway` 에 Node builtin test 를 추가해 manifest rebuild 와 stale detection 을 최소 범위로 검증하게 했다.

### Revision `working` - guild_hall 공용 io/path helper 추가

- `guild_hall/shared/io.mjs` 를 추가해 `doctor`, `gateway`, `town_crier`, `night_watch` 가 공통으로 쓰는 repo-relative path 정규화, JSON/JSONL state 입출력, 존재 여부 점검 helper 를 한 surface 로 모았다.
- `night_watch` preflight 와 `gateway` dedupe index 는 이제 같은 JSON/경로 helper 를 써서 `/` 기준 repo path 와 state write 형식을 맞춘다.
- `guild_hall/shared/README.md` 를 추가하고 `guild_hall` owner 문서에 새 내부 helper surface 를 연결했다.

### Revision `working` - 1차 world-facing class 4종 추가와 2차 후보군 기록

- `archer`, `rogue`, `healer`, `envoy` canonical class sample 4종을 starter lineup 에 추가했다.
- 현재 registry skill/tool/knowledge 가 아직 작기 때문에, 이 4종은 기존 canon refs 를 재조합한 starter interpretation 으로 두었다.
- `blacksmith`, `artificer`, `mage`, `fighter` 는 2차 후보군으로 `.registry/classes/README.md` 에 기록해 later expansion 에서 잊지 않게 했다.

### Revision `working` - class title 을 세계관 톤으로 보정

- `archivist` 의 사람용 title 을 `기록관` 으로, `administrator` 의 사람용 title 을 `총관` 으로 조정했다.
- 내부 `class_id` 는 그대로 유지하고, world-facing 설명만 조정해 기존 unit/workflow binding 과 경로를 깨지 않게 유지했다.
- `human` species hero 와 guild master 관련 설명도 governance / archive 톤으로 같이 맞췄다.

### Revision `working` - ontology review 상기 manual 과 guild_master carry-forward 규칙 추가

- `docs/architecture/foundation/ONTOLOGY_REVIEW_MANUAL_V0.md` 를 추가해 ontology review trigger, 저장 위치, carry-forward owner 를 고정했다.
- root `AGENTS.md` 와 `night_watch` 문서/prompt 에 ontology candidate 상기 규칙을 넣어, 현재 프로젝트가 아니어도 `guild_master` / `night_watch` lane 이 cross-project 후보를 다시 떠올리게 했다.
- activity surface 에는 ontology review candidate 를 `carry_forward: true` 로 남길 수 있다는 규칙을 추가했다.

### Revision `working` - ontology-style 저장 규칙 기준선 추가

- Soulforge 핵심 개념을 `개체 + 관계` 기준으로 읽는 `Ontology Model v0` foundation 문서를 추가했다.
- ontology 정의와 관계 규칙은 public foundation 문서가 들고, project-specific instance 는 `_workmeta/<project_code>/ontology/` 에 두며, runtime event 는 계속 `guild_hall/state/**` 와 `private-state/**` 가 소유하도록 저장 위치를 고정했다.
- 새 top-level `ontology/` root 는 만들지 않고, 기존 owner root 안에서 정의/canon instance/runtime event 를 분리하는 방향으로 정리했다.

### Revision `working` - starter class lineup 을 6종으로 확장

- 기존 `knight`, `archivist`, `administrator` 에 더해 `pathfinder`, `marshal`, `auditor` canonical class sample 3종을 추가했다.
- 새 class 들은 species 와 독립된 축을 유지하고, 실제 조합은 계속 unit/party/workflow/mission 에서 결정하도록 유지했다.
- ref 는 기존 `.registry/skills`, `.registry/tools`, `.registry/knowledge` canon 안에서만 조합해 `정찰`, `집행`, `검증` lane 을 드러내도록 맞췄다.

### Revision `working` - night_watch preflight 에 transient retry 추가

- `night_watch` current-default pipeline 의 preflight 는 계속 `fail-closed` 로 유지하되, dirty repo, detached HEAD, missing origin, non-main branch 는 즉시 hard fail 하도록 명시했다.
- 반대로 DNS 해석 실패, temporary name resolution failure, timeout, connection reset, TLS handshake timeout, network unreachable, transient 5xx gateway 오류 같은 일시적 network-class 실패는 bounded retry 뒤 최종 판정하도록 규칙을 추가했다.
- repo sync 는 최대 3회 시도, doctor remote 검사는 repo sync 성공 후 1회 재시도만 허용하고, 그래도 실패하면 blocked preflight 로 중단하게 prompt/source 와 운영 문서를 맞췄다.

## 2026-03-26

### Revision `working` - 종족 직업 몬스터의 사람용 한글 표시 규칙 추가

- canonical id 는 계속 stable ASCII 를 유지하고, 사람에게 보여주는 이름은 `title`, `display_name`, `monster_label` 같은 human-facing 필드에 한국어로 둘 수 있다는 규칙을 public canon 문서에 추가했다.
- current sample species/class title 과 human hero title 을 한국어로 바꿨다.
- `monster` 계열은 `monster_family` / `monster_name` / `monster_type` id 를 유지하되, candidate note 와 lineup 문서에서 optional `monster_label` 로 한국어 표시를 둘 수 있게 했다.

### Revision `working` - species 와 class 독립 조합 규칙 추가

- `.registry` canon 에서 species 와 class 는 서로 종속되지 않는 독립 catalog 축이라고 명시했다.
- 실제 조합은 `.unit/<unit_id>/unit.yaml` 의 `identity.species_id + class_ids` 가 결정하도록 문서와 schema 를 정리했다.
- 그래서 `orc + knight` 같은 조합도 canon 상 허용되며, 제한이 필요하면 unit/party/workflow/mission 에서만 표현하도록 규칙을 고정했다.
- starter species lineup 은 `human`, `orc`, `elf`, `dwarf`, `darkelf` 5종으로 맞췄다.

## 2026-03-25

### Revision `working` - mission model 에 monster 와 artifact 구분 규칙 추가

- `docs/architecture/workspace/MISSION_MODEL.md` 에 `monster = 요청`, `artifact = 산출물`, `mission = 실행 계획` 구분을 명시했다.
- 같은 artifact 가 한 mission 에서는 output 이고, 다음 mission 에서는 input 이 될 수 있다는 generic meeting-followup 예시를 추가했다.

### Revision `working` - agent procedure capture entrypoint rule

- Added a root `AGENTS.md` rule so every bounded business task leaves tracked promotion-ready evidence in `_workmeta/<project_code>/reports/**` instead of relying on chat memory or ignored runtime logs.
- Kept `AGENTS.md` as the short routing surface and pointed detailed capture fields to `_workmeta/PROCEDURE_CAPTURE_RULE.md`, including repeatable steps, decision criteria, folder or packet shape, and completion criteria for later promotion into `skill`, `workflow`, `mission`, `role_or_class`, or `data_contract`.

### Revision `working` — night_watch local automation source 를 tracked renderer 구조로 고정

- `Soulforge Night Watch Pipeline` 의 prompt/spec source 를 public tracked tree 아래 `guild_hall/night_watch/automations/` 로 옮기고, 각 PC 의 local `automation.toml` 은 renderer 로 재생성하는 구조를 추가했다.
- 이 변경으로 automation prompt 업데이트 자체는 Git 형상관리되고, 다른 PC 는 repo pull 후 같은 source 를 보고 local automation 을 다시 install 할 수 있다.
- 관련 경로:
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.spec.json`
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.prompt.txt`
  - `guild_hall/night_watch/render_local_automation.mjs`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 시작 전에 전 repo 최신 동기화 gate 추가

- 항상 켜 두는 운영 PC 의 `night_watch` pipeline 이 점검 전에 public `Soulforge`, `_workmeta`, `private-state` 를 모두 fast-forward pull 하도록 preflight stage 를 추가했다.
- preflight stage 는 세 repo 중 하나라도 dirty, missing, origin 누락, branch mismatch, pull 실패, `owner-with-state --remote` doctor 실패가 있으면 그 run 에서 후속 점검을 건너뛰고 blocked report 만 남기도록 규칙을 고정했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — legacy `_workspaces` continuity lane 제거와 runtime README 경계 정리

- bootstrap/install checklist 에서 `private-state/_workspaces` restore 경로를 제거했다.
- `owner-with-state` bootstrap 은 `guild_hall/state/**` continuity subset 만 `private-state/` 에서 복원하고, `_workspaces/<project_code>/` 는 각 PC 에서 다시 materialize 하도록 정리했다.
- tracked `guild_hall/state/README.md` 가 runtime root 안의 유일한 boundary note 라는 점을 문구로 명시해 public tracking 예외를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `guild_hall/state/README.md`
  - `guild_hall/doctor/cli.mjs`

## 2026-03-24

### Revision `working` — night_watch automation 을 worktree-safe local path 기준으로 재설계

- Codex app automation 이 임시 worktree 에서 실행될 수 있다는 전제를 문서에 반영했다.
- tracked canon 의 상대 경로 계약은 유지하되, local automation prompt 에는 `<LOCAL_SOULFORGE_ROOT>`, `<LOCAL_ACTIVITY_ROOT>`, `<LOCAL_PRIVATE_STATE_ROOT>`, `<LOCAL_WORKMETA_ROOT>` 같은 absolute path 입력을 쓰도록 규칙을 추가했다.
- `soulforge_activity` writer 는 worktree-local copy 가 아니라 이 PC 의 active absolute root 를 canonical sink 로 삼는다고 명시했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 결과 저장 surface 와 Fix Draft companion 설계 추가

- night_watch 자동화가 Codex inbox/thread 에만 머물지 않고 `guild_hall/state/operations/soulforge_activity/**` 에도 결과를 남기도록 output contract 를 보강했다.
- `latest_context.json`, `events/YYYY/YYYY-MM.jsonl` 외에 상세 실행 결과를 저장하는 `log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md` surface 를 추가했다.
- 자동 수정은 current-default 에 넣지 않고, draft-only 후속 조치 제안을 만드는 `Soulforge Fix Draft` companion spec 을 추가했다.
- 새 점검 자동화가 추가되거나 출력 형식이 바뀌면 `Fix Draft` spec 도 같은 patch 에서 함께 갱신하는 동기화 규칙을 문서화했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 자동화 후보 문서화

- `guild_hall/night_watch` owner 아래에서 장기 운영용 새벽 점검 자동화 후보 3개를 문서화했다.
- `Boundary Check`, `Portability Check`, `Context Drift Check` 의 목적과 입력 경로, 결과 surface 를 정리했다.
- 자동화 규칙 문서는 tracked repo 에 두고, 실제 스케줄과 ACTIVE 상태는 Codex app local automation 이 맡는다는 경계를 분리했다.
- 다른 PC 에서 그대로 다시 만들 수 있도록 각 자동화의 이름, 권장 주기, 작업 경로, 실행 프롬프트를 문서 안에 ready-to-create spec 으로 추가했다.
- 다른 PC 에서는 repo pull 후 같은 문서를 보고 Codex automation 을 다시 만들도록 절차를 적었다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/README.md`
  - `guild_hall/night_watch/README.md`
  - `README.md`

### Revision `working` — Soulforge 전체 활동 recent-context surface 추가

- Soulforge 전체 작업의 최근 맥락을 project `_workmeta` 가 아니라 `guild_hall/state/operations/soulforge_activity/**` 에 두는 규칙을 추가했다.
- 최근 PC/session 에서는 `latest_context.json` 을 먼저 읽고, 부족할 때만 월별 `events/*.jsonl` 마지막 몇 건을 추가로 읽는 recent-window 규칙을 문서화했다.
- `private-state/` mirror 범위와 update/handoff restore 절차에 `operations/soulforge_activity/**` 를 포함했다.
- 관련 경로:
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `docs/architecture/guild_hall/GUILD_HALL_MODEL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`

### Revision `working` — private-state mailbox continuity mirror 범위 확대

- `private-state/` allowlist 를 intake/monster/outbound 중심에서 mailbox continuity mirror 까지 확대했다.
- owner handoff/update/private-state 문서에서 `mailbox/company/**`, `mailbox/personal/**`, `log/mail_fetch/**` sync/restore 절차를 추가했다.
- active runtime 경로는 그대로 두고, `private-state/` 는 mirror copy plane 으로만 쓰도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

### Revision `working` — 메일 수신/이동 이력 폴더와 skill spec 추가

- `020_MGMT/027_수신이력_이동이력` 폴더를 관리 폴더 quick map 과 SE 폴더트리 skill spec 에 추가했다.
- generator 가 `management_static_folders` 설명을 `폴더_인덱스.txt` 와 `plan_manifest.json` 에 반영할 수 있게 갱신했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — 온보딩 가이드에 관리 폴더 설명 추가

- `PROJECT_ONBOARDING_V0.md` 에 `020_MGMT` 관리 폴더 quick map 과 `022 -> stage별 *_INBOX_분류전 -> gate 내부 세부 폴더` 흐름 설명을 추가했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — owner 전용 `_workmeta` clone/pull 절차 문서화

- `_workmeta/` 를 `_workspaces/` 와 같은 레벨의 owner-only private metadata repo 로 clone/pull 하는 절차를 bootstrap/update/multi-PC 문서에 추가했다.
- `owner-with-state` 프로필이 public `Soulforge` 외에 `_workmeta/` 와 `private-state/` 를 함께 다루도록 문서를 정리했다.
- `private-state` 문서와 예시 템플릿에서 `_workmeta` 를 범위 밖의 별도 private repo 로 분리했다.
- 관련 경로:
  - `README.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

## 2026-03-23

### Revision `working` — SE 폴더트리 생성 skill package 편입

- internal SE folder-tree generator 리소스를 Soulforge canonical skill package 로 편입했다.
- 새 package 는 `.registry/skills/se_foldertree_generate/` 아래 canon entry 와 sync 가능한 `codex/` bridge 를 함께 두고, bundled asset/script/reference 를 local Codex mirror 로 materialize 할 수 있게 구성했다.
- skill package 와 generator 를 입력 확인형으로 보강해 `layout mode(new-root/in-place)`, `business type`, `prime contractor`, `quality grade` 를 먼저 확인하고, 현재 지원 조합이 아니면 중단하도록 했다.
- generator 는 `in-place` 모드를 추가해 기존 프로젝트 루트에 한 단계 더 nested root 를 만들지 않고 직접 tree 내용을 생성할 수 있게 했다.
- bundled asset/script/reference 는 skill root 기준 상대경로 사용을 기본 원칙으로 명시해 이식성을 높였다.
- 기존 install/sync 문서는 이미 `skills:sync` 전체 동기화 규약을 갖고 있어 이번 변경에서는 새 package 추가만 반영했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/skill.yaml`
  - `.registry/skills/se_foldertree_generate/README.md`
  - `.registry/skills/se_foldertree_generate/codex/SKILL.md`
  - `.registry/skills/se_foldertree_generate/codex/agents/openai.yaml`
  - `.registry/skills/se_foldertree_generate/codex/references/mapping.md`
  - `.registry/skills/se_foldertree_generate/codex/references/workflow.md`
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `.registry/skills/se_foldertree_generate/codex/scripts/convert_gate_numbers.py`
  - `.registry/skills/se_foldertree_generate/codex/requirements.txt`
  - `.registry/skills/README.md`

### Revision `working` — 첫 실제 프로젝트 온보딩 manual 승격

- 첫 실제 프로젝트를 `_workspaces/<project_code>/` 에 붙이는 절차를 별도 workspace manual 로 승격했다.
- short `project_code`, full `display_name`, read-only first, bounded first run/use, local-only junction/symlink materialization 규칙을 workspace 정본 문서에 반영했다.
- tracked 정본 문서와 public-safe example 에는 실제 project code / 과제명 대신 generic placeholder 만 쓰는 규칙을 추가했다.
- 실제 프로젝트별 실험 문서와 근거는 local-only `reports/onboarding/`, `artifacts/onboarding/` 아래에 두고, 안정 규칙만 정본 문서로 승격하는 흐름을 명시했다.
- 사람과 Codex 가 함께 첫 과제를 여는 `project_start_worklog.md` 와 project start workflow manual 을 추가했다.
- 새 시작 행위는 사용자가 따로 요청하지 않아도 실제 작업 순서를 worklog 와 workflow note 로 저장하는 규칙을 추가했다.
- project assignment 규칙을 승격할 때는 비밀 project code 나 내부 관리번호 대신 공개 가능한 대표 업무명/주제어를 우선 쓰고, 약어·제품군명·일반 사업유형은 보조 힌트로만 다루도록 정리했다.
- project metadata 와 raw runtime truth 를 project root 내부 metadata folder 대신 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 로 분리하는 모델로 구조 문서, 예시, UI 경로 해석을 전환했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`
  - `docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md`
  - `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
  - `docs/architecture/workspace/WORKMETA_SCHEMA_FIELD_MATRIX.md`
  - `docs/architecture/workspace/WORKMETA_MINIMUM_SCHEMA.md`
  - `docs/architecture/workspace/README.md`
  - `_workspaces/README.md`

### Revision `working` — Windows runbook shell 차이 보강

- bootstrap, handoff, private-state runbook 에 남아 있던 Unix shell 예시에 Windows PowerShell 대응 명령을 보강했다.
- `npm.ps1` execution policy, `which`, `mkdir -p`, `cp`, `rsync` 같은 shell 차이 때문에 새 Windows PC 에서 막히는 지점을 문서에서 바로 풀 수 있게 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`

### Revision `working` — Windows bootstrap skill sync Ruby 의존 제거

- `npm run skills:sync -- --all` 이 Ruby 미설치 환경에서도 동작하도록 Node 기반 sync script 로 전환했다.
- skill install sync 운영 문서를 새 script 경로와 사용 예시로 갱신했다.
- 관련 경로:
  - `.registry/docs/operations/scripts/sync_codex_skill.mjs`
  - `package.json`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`

### Revision `working` — doctor skill sync 범위 확대

- bootstrap/doctor 계약을 기본 3개 skill 에서 sync 가능한 Soulforge Codex skill 전체로 확대했다.
- `codex/SKILL.md` 가 없는 registry entry 는 canon-only 또는 test package 로 보고 기본 sync 대상에서 제외하도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `.registry/skills/README.md`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`
  - `guild_hall/doctor/README.md`
  - `guild_hall/doctor/cli.mjs`

### Revision `1b58127` — owner handoff 체크리스트 추가

- `OWNER_HANDOFF_CHECKLIST_V0.md` 를 추가해 회사/집 사이 handoff 순서를 고정했다.
- owner 는 작업 시작 전 `doctor --remote`, 작업 종료 전 public/private push 를 확인하는 흐름을 문서화했다.
- 관련 경로:
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `e128441` — private-state 원격 연결과 owner push 규칙 보강

- nested `private-state/` 가 local Git repo 만 있고 `origin` remote 가 비어 있는 예외 복구 절차를 추가했다.
- public/private 두 저장소의 역할과 owner PC 의 private-state push 조건을 명시했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`

### Revision `b878873` — bootstrap 인증과 continuity 가이드 보강

- 설치 완료 기준에 `gh auth login` 과 owner `doctor --remote` 통과를 포함했다.
- continuity sync/pull/restore 절차를 owner 전용 가이드로 보강했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `b6df3a7` — public sync probe

- 다른 PC 에서 public repo round-trip sync 를 검증하기 위한 harmless probe 파일을 추가했다.
- 목적은 public `pull/push` 동작 검증이며, 기능 변화는 없다.
- 관련 경로:
  - `docs/architecture/bootstrap/SYNC_PROBE_PUBLIC_2026-03-23.md`

## 2026-03-22

### Revision `3bbd424` — update 절차와 owner prompt 추가

- 설치 후 업데이트 표준 절차를 별도 문서로 분리했다.
- owner 가 다른 PC Codex 에 업데이트를 맡길 때 사용할 프롬프트 문서를 추가했다.

### Revision `f9680da` — secret 규칙과 필수 skill 기준 정리

- secret 파일 비열람 원칙을 agent/document 규칙에 추가했다.
- 기본 Soulforge skill 3개를 bootstrap doctor 필수 항목으로 승격했다.

### Revision `029560a` — public 기능과 private 업무데이터 저장 규칙 정리

- public repo 와 private repo 의 역할을 owner 관점에서 문서화했다.
- 팀원/public-only 와 owner-with-state 의 경계를 더 명확히 했다.

### Revision `77d6db0` — nested private-state 구조와 bootstrap 가이드 정리

- `Soulforge/private-state/` nested repo 구조를 기준으로 bootstrap/doctor 경로를 정리했다.
- active workspace 는 `Soulforge/` 하나라는 운영 모델을 문서에 반영했다.

### Revision `82672d5` — doctor 원격 점검과 bootstrap 프로필 추가

- `guild-hall:doctor` 에 `--profile owner-with-state`, `--remote`, `fix_hint` 를 추가했다.
- 팀원용 `public-only`, owner 용 `owner-with-state` bootstrap 프로필을 정식화했다.

### Revision `20f9b49` — doctor fatal schema 정리

- fatal path JSON 도 normal path 와 같은 top-level schema 를 유지하도록 정리했다.

### Revision `58621c6` — doctor 계약과 outbound ledger 정리

- `doctor` JSON/exit code 계약을 보강했다.
- outbound mail ledger 최소 필드와 private state 경계를 문서로 잠갔다.

### Revision `60b8870` — bootstrap doctor 와 private state 기준 추가

- bootstrap 문서 묶음과 `guild-hall:doctor` entrypoint 를 추가했다.
- private state repo 기준과 outbound mail 기록 자리의 초기 계약을 마련했다.
