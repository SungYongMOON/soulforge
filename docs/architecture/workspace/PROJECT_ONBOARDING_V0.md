# PROJECT_ONBOARDING_V0

## 목적

- 이 문서는 실제 프로젝트를 Soulforge `_workspaces/<project_code>/` 아래에 처음 붙일 때의 최소 온보딩 규칙을 잠근다.
- 첫 실제 프로젝트 온보딩을 한 PC 안의 local-only 실험으로만 흘려보내지 않고, 다른 owner PC 도 이어받을 수 있는 repeatable dogfood/manual 절차로 묶는다.
- 실제 프로젝트 현장 materialization 과 `_workmeta` 도입 순서를 분리해 과한 초기 반영을 막는다.

## 한 줄 정의

- 첫 실제 프로젝트 온보딩은 `실제 project root 를 _workspaces/<project_code>/ direct child 로 materialize` 한 뒤, `read-only intake -> bounded first run/use -> local fix -> local documentation -> stable rule promotion` 순서로 들어가는 workspace manual v0 다.

## 정본 규칙

1. canonical project root 는 항상 `_workspaces/<project_code>/` direct child 로 본다.
2. 실제 프로젝트가 Soulforge 바깥에 이미 있으면, local-only materialization 은 OS-local directory link 로 둘 수 있다.
3. 다른 owner PC 에서도 같은 실자료를 읽어야 하면 실제 project root 는 owner-approved shared worksite 에 두고, `_workspaces/<project_code>/` 는 그 위치를 가리키는 link 로 둔다.
4. Windows 에서는 directory link 기본값으로 junction 을 권장한다.
5. macOS/Linux 에서는 directory symlink 를 권장한다.
6. tracked 문서와 public changelog 에는 actual host-local source path 를 적지 않는다.
7. tracked 정본 문서, public changelog, public-safe example 에는 실제 project code, 실제 과제명, 실제 display name 을 적지 않고 generic example 으로만 표현한다.
8. `project_code` 는 경로와 식별자에 쓰는 짧고 안정적인 id 로 둔다.
9. 사람에게 보여줄 full project title 은 `_workmeta/<project_code>/contract.yaml` 의 `display_name` 에 둔다.
10. 첫 실제 프로젝트 온보딩은 `_workmeta/<project_code>/` 를 바로 active 로 만들지 않고, 먼저 read-only intake 로 구조와 민감 경계를 확인한 뒤 아주 작은 first run/use 로 들어간다.
11. first run/use 에서 확인한 문제는 `_workspaces` 수정과 `_workmeta` metadata 기록으로 먼저 정리한다.
12. 첫 실제 프로젝트 온보딩에서 얻은 안정 규칙은 다음 변경에서 workspace manual 과 changelog 로 승격한다.
13. 주기적으로 전달되는 회사 PJT 관리 대장으로 새 current project 를 발견하면 `PROJECT_LEDGER_UPDATE_V0.md` 의 intake/update 절차를 먼저 따른다.

## 추천 값

- path id:
  - `project_code: demo_project`
- human-facing title:
  - `display_name: Example Project`

경로에는 짧은 `project_code` 를 쓰고, full title 은 metadata 로 분리하는 것을 기본안으로 본다.

## local materialization 예시

Windows PowerShell:

```powershell
$projectCode = "demo_project"
$target = "<owner-approved-shared-or-local-project-root>"
New-Item -ItemType Junction -Path "_workspaces/$projectCode" -Target $target
```

macOS/Linux:

```bash
project_code="demo_project"
target="/path/to/owner-approved-shared-or-local-project-root"
ln -s "$target" "_workspaces/$project_code"
```

위 명령은 local-only materialization 예시일 뿐이며, tracked 문서에는 실제 target path 를 남기지 않는다. 사진, 영상, 측정 로그처럼 다른 PC 에서도 바로 읽어야 하는 payload 는 shared worksite 를 target 으로 둔다.

## 첫 온보딩 절차

1. `project_code` 를 정한다.
2. 사람용 full title 을 정한다.
3. 실제 project root 를 `_workspaces/<project_code>/` direct child 로 materialize 한다.
4. read-only 로 top-level structure, 민감 폴더, 핵심 산출물, active lane 을 파악한다.
5. 첫 mission 또는 first-use scenario 를 아주 작게 정한다.
6. 그다음에만 `_workmeta/<project_code>/` minimal shape 를 draft 로 만든다.
7. bounded first run/use 를 실제로 한 번 수행한다.
8. first run/use 에서 드러난 blocker, 수정점, 관찰값을 `_workmeta` shared metadata 문서에 먼저 남긴다.
9. local worksite 수정과 shared metadata 정리가 안정화되면 그 규칙만 `WORKSPACE_PROJECT_MODEL.md`, field matrix, 관련 runbook 에 다시 반영한다.

## 관리 폴더 quick map

- `020_MGMT/021_자동화설정_운영규칙`
  - project-local routing rule, 분류 기준, 운영 메모를 둔다(2026-03-23/24 결정, 신규 규칙 아님).
  - legacy plane: 정본 metadata 는 `_workmeta/<project_code>/rules/` 에 두고, 현장 폴더에는 mirror 또는 pointer 를 둘 수 있었다.
  - D: target plane(2026-09-21 결정): 규칙 파일 원문(byte)은 `<TARGET_SOULFORGE_ROOT>/_workspaces/<project 폴더>/020_MGMT/021_자동화설정_운영규칙/`에 두고, 그 byte lineage(sha256·출처·상태·Owner 결정)는 `<TARGET_SOULFORGE_ROOT>/_workmeta/<project 폴더>/lineage/`에 둔다. 새 프로젝트별 규칙은 새 폴더 체계를 만들지 않고 이 고정 관리 폴더를 쓴다.
- `020_MGMT/022_INBOX_원본수집`
  - project 로 라우팅된 메일/자료의 first landing path 다.
  - stage 가 아직 미판정인 intake 자료를 임시 보관한다.
- `020_MGMT/023_연락처_이해관계자`
  - 연락처, 조직, 역할, 이해관계자 정보를 둔다.
- `020_MGMT/024_예산_집행`
  - 예산, 집행, 행정 정산 자료를 둔다.
- `020_MGMT/025_통합로그_의사결정조치`
  - 회의 결과, 공문, action item, 조치 이력을 통합 기록한다.
  - 이 폴더에 `작업_장부.csv`(작업 장부)를 두고, 실제로 한 일을 한 행씩 남긴다: 누가, 언제, 어떤 task, 무엇을 근거로 했는지, 무엇이 나왔는지, 다음 action.
  - 그 작업을 한 주체가 직접 행을 쓴다(사람 또는 AI). AI 가 작업을 끝내면 작업 장부에 한 행을 남기고 후속이 필요하면 할일 장부에 추가하며, AI 작업의 완료 여부는 사람이 확인한다.
- `020_MGMT/026_상태_진행현황`
  - 사람이 읽는 current project status board 로 본다.
  - 현재 단계, 주요 blocker, next action, 진행 현황 요약을 둔다.
  - 이 폴더에 `할일_장부.csv`(할일 장부)를 두고, 앞으로 해야 할 항목을 한 행씩 남긴다: 항목, 담당자, 마감일, SE stage, 어디서 나온 항목인지, 완료 기준, 상태.
  - 팀이 보는 to-do 화면은 issue tracker 를 그대로 쓰고, 할일 장부는 그 항목의 출처(메일 이력 key, 회의, 산출물, tracker issue)와 연결을 기록한다.
  - AI 가 만든 할일은 바로 확정하지 않고 제안 상태로 시작하며, 사람이 수락·수정·거절한다.
- `020_MGMT/027_수신이력_이동이력`
  - project-side mail receive history 와 자료 move history 를 둔다. 메일 수신/발송 이력은 매 refresh마다 수집된 메일에서 다시 만드는 현재 시점 view이며(Owner기입 칸 보존, 이전 파일은 `history/`에 보관), append-only인 것은 그 아래 수집 메일 custody와 정정 이력이다 — 라우팅 규칙이 바뀌면 그 메일이 다른 프로젝트로 옮겨가면서 한 행이 현재 view에서 빠질 수 있다.
  - 실제 intake, stage inbox 이동, 최종 폴더 승격 이력을 남긴다.
- `020_MGMT/029_보류_미분류`
  - 바로 분류하지 못한 자료나 보류 항목을 둔다.

### 과제별 규칙 파일 (2026-09-21)

- D: target plane에 과제별 정본 자료를 하나씩 배치 중이며, 첫 항목은 과제별 메일 라우팅 규칙(mail routing rule)이고 파일명은 `mail_routing_rule.md`다.
- 파일 안 상태값은 `초안 vN`으로 시작하고, Owner 확인이 필요한 항목이 모두 비면 `확정`으로 올린다.
- 규칙 파일은 다음 절을 둔다: 상태·적용 범위 / 확정 트리거(제목·본문·첨부명) / 검토 힌트(단독 귀속 금지) / 사람·발신자 원칙(발신자는 힌트로만 쓰고 연락처 정본은 `023_연락처_이해관계자`) / Owner 확인 기록 / Owner 확인이 필요한 것 / 처리 순서와 기록 자리(`022_INBOX_원본수집` 최초 투입, `027_수신이력_이동이력` 이력) / 근거(실측 건수).
- 두 프로젝트의 정확한 트리거가 같은 메일에 함께 걸리면 자동 귀속하지 않고 아침 질문으로 보류한다. 제품명 하나나 광의의 일반어, 프로젝트 코드 단독은 정확한 트리거로 쓰지 않는다 — 발주처 정책상 메일 제목에 과제 코드 표기가 금지되는 경우가 흔해 코드 문자열 하나에만 기대어 귀속하지 않는다.

### 배경 — 이관 후 메일 라우팅 연결 상태 (2026-09-21 기록)

- 실행면이 D: 로 이관되면서 legacy `_workmeta/system/bindings/mail_project_router.yaml` 바인딩은 새 실행면으로 이관되지 않았다.
- 새 Tributary(수집 lane)은 project router를 호출하지 않고 메일을 저장한다(구현됨). 그 결과 색인 귀속은 리터럴 코드 규칙으로만 fallback 한다(구현됨).
- 과제별 `021_자동화설정_운영규칙` 규칙 파일이 이 귀속 단계가 읽어야 할 정본 소스로 지정됐지만, 그 연결(wiring)은 아직 구현되지 않았다 — 계획 상태(계획)로만 본다.

### 작업 장부·할일 장부 (2026-09-21)

- 두 장부는 project 폴더뿐 아니라 공용 자료를 두는 폴더와 project-less 일반업무 폴더(`P00-000_INBOX` 류)에도 동일하게 둔다.
- 장부에는 포인터만 남긴다(경로, 링크, 메일 이력 key). 메일 본문, 첨부, 개인정보, secret 은 어떤 장부에도 적지 않는다.
- 사본은 하나만 두고(UTF-8 BOM, CRLF), 행은 지우지 않고 사유와 함께 정정한다. 헤더 행은 Owner 결정 없이 바꾸지 않는다.
- 새 프로젝트 폴더를 만들 때 두 장부(헤더만 있는 빈 파일)도 함께 만든다.
- 칸(column) 단위 작성 규칙은 이 문서가 아니라 프로젝트 폴더 옆 private workspace plane 이 소유한다.
- 방향: 내부 이력·문서·맥락을 보는 local model 이 할일을 찾고 작업을 하고 이 장부를 쓰는 것을 지향한다. 외부 chat 서비스 예약작업이 plug-in 으로만 할일을 만드는 현재 방식은 임시 pilot 이다.

## 단계 inbox 해석

- `022_INBOX_원본수집` 은 project 진입 직후의 intake inbox 다.
- stage 가 판정되면 해당 gate 의 `*_INBOX_분류전` 으로 옮긴다.
  - 예: `030_SRR/031_INBOX_분류전`, `150_TRR_DT/151_INBOX_분류전`
- stage inbox 에 들어간 뒤에는 해당 gate 안에서 `LOG`, `TDP`, 세부 산출물 폴더로 다시 분류한다.

## owner-only shared 실험 기록 위치

- 사람용 실험 메모와 온보딩 문서는 `_workmeta/<project_code>/reports/onboarding/` 아래에 둔다.
- 사람과 Codex 가 같이 진행한 시작 단계 판단, blocker, 다음 액션은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 에 append 한다.
- 사용자가 따로 요청하지 않아도 새 시작 행위의 실제 작업 순서와 절차 초안은 `project_start_worklog.md` 와 관련 onboarding note 에 함께 남긴다.
- 근거 파일, 임시 export와 비교 산출물은 workspace/worksite에 두고, `_workmeta/<project_code>/artifacts/onboarding/`에는 pointer, hash, status와 compact comparison receipt만 둔다.
- 위 경로는 모두 owner-only shared metadata 경로이며 public tracked tree 로는 올리지 않는다.
- tracked 정본 문서에는 실험 결과에서 승격된 규칙만 남기고, 실제 프로젝트별 working note 원문은 남기지 않는다.

## read-only intake 체크리스트

- top-level folder 목록
- 민감 자료 경계
- 현재 실제로 관리할 work item 종류
- 대표 산출물/근거 surface
- 첫 mission 후보 1건
- immediate blocker 유무

첫 온보딩 단계에서는 raw/private content 를 대량 전개하지 않고, first run/use 에 필요한 최소 범위만 다룬다.

## `_workmeta` 반영 타이밍

- read-only intake 전:
  - link 또는 actual root 존재 확인만 한다
- read-only intake 후:
  - `contract.yaml` 초안
  - `bindings/` 초안
  - reserved dir skeleton
- first run/use 중:
  - `reports/onboarding/`
  - `artifacts/onboarding/`
- 첫 mission scope 와 binding resolve 후:
  - `status: active`

## 반복 대장 기반 온보딩

- owner 가 최신 회사 PJT 관리 대장을 전달하면 그 workbook 은 public repo 가 아니라 private source root 와 manifest 에만 둔다.
- 대장에서 발견한 새 current/open project 는 first onboarding 후보가 될 수 있다.
- 이 경우에도 실제 project file root 는 owner-approved shared worksite 에 먼저 만들고, `_workspaces/<project_code>` 는 junction/symlink view 로 둔다.
- workbook 의 담당 셀은 source observation 이고, owner 가 알려준 최신 담당 변경은 current operating responsibility 로 별도 기록한다.
- 반복 대장 intake 와 diff 절차는 [`PROJECT_LEDGER_UPDATE_V0.md`](PROJECT_LEDGER_UPDATE_V0.md) 가 소유한다.

## 관련 경로

- [`PROJECT_START_WORKFLOW_V0.md`](PROJECT_START_WORKFLOW_V0.md)
- [`PROJECT_LEDGER_UPDATE_V0.md`](PROJECT_LEDGER_UPDATE_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`WORKMETA_MINIMUM_SCHEMA.md`](WORKMETA_MINIMUM_SCHEMA.md)
- [`WORKMETA_RESOLVE_CONTRACT.md`](WORKMETA_RESOLVE_CONTRACT.md)
- [`WORKMETA_SCHEMA_FIELD_MATRIX.md`](WORKMETA_SCHEMA_FIELD_MATRIX.md)
- [`MISSION_MANUAL_DRAFT.md`](MISSION_MANUAL_DRAFT.md)
