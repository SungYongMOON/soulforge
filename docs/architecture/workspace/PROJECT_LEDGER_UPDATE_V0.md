# Project Ledger Update v0

## 목적

- owner 가 주기적으로 전달하는 회사 PJT 관리 대장을 project registration 의 반복 입력 정본으로 등록한다.
- public repo 에는 대장 원문, 실제 project code 목록, 실제 과제명, 담당자 목록을 넣지 않고, 업데이트 절차와 경계만 둔다.
- 새 대장이 들어올 때마다 `_workspaces`, `_workmeta`, workspace junction binding, team role map 을 같은 방식으로 갱신할 수 있게 한다.

## 한 줄 정의

회사 PJT 관리 대장은 project identity, current/open 여부, 일정, 담당 관찰값을 확인하는 owner-provided recurring source 이다. 실제 workbook payload 와 추출된 live project list 는 private state 에 남기고, public canon 은 intake/update procedure 만 소유한다.

## 정본 규칙

1. 새 대장이 전달되면 원본 workbook 은 public repo 에 복사하지 않는다.
2. 원본 workbook 은 private runtime/state surface 아래 source copy 와 manifest 로 남긴다.
   - 권장 private source root: `guild_hall/state/operations/company_project_ledger/sources/`
   - 권장 private manifest: `guild_hall/state/operations/company_project_ledger/manifest.json`
3. manifest 에는 source filename, captured date, checksum, latest marker 같은 metadata 만 둔다.
4. public tracked 문서에는 실제 파일명, 실제 project code, 실제 과제명, 실제 담당자명, 실제 업체명을 반복 목록으로 적지 않는다.
5. workbook 에서 관찰한 담당 셀은 source observation 으로 보존한다.
6. owner 가 현재 담당 변경을 알려주면 workbook 관찰값을 덮어쓰지 않고, `_workmeta/<project_code>/contract.yaml` 의 current operating responsibility 로 별도 기록한다.
7. project code 는 stable path id 로 쓰고, 사람용 display name 은 `_workmeta/<project_code>/contract.yaml` 에 둔다.
8. 여러 PC 에 공유되어야 하는 actual project files 는 owner-approved shared worksite 에 먼저 만들고, `_workspaces/<project_code>` 는 local-only junction/symlink view 로 둔다.
9. `_workspaces` 아래 HTML/index/shortcut 은 사람이 보기 위한 navigation surface 일 뿐 routing authority 가 아니다.
10. 완료/과거 row 는 owner 가 명시적으로 다시 현재 업무라고 지정하지 않는 한 active project registration 에 포함하지 않는다.
11. 같은 키워드가 여러 project 에 걸칠 수 있으면 broad keyword 를 exact mail route 로 승격하지 않는다. PJT number, owner correction, contract metadata 를 먼저 본다.
12. workbook 은 design truth, review approval, verification acceptance, deliverable authority 가 아니다. project identity/status metadata 의 source input 으로만 쓴다.

## 반복 업데이트 절차

1. 전달받은 최신 workbook 을 private source root 에 저장한다.
2. checksum 을 계산하고 private manifest 를 갱신한다.
3. workbook sheet 를 읽어 current/open 후보와 owner 가 명시한 지원 업무 후보를 분리한다.
4. 기존 `_workmeta/<project_code>/contract.yaml` 과 비교한다.
5. 새 current project 가 있으면 shared worksite folder 를 먼저 만든다.
6. `_workspaces/<project_code>` 를 shared worksite 로 향하는 local-only link 로 만든다.
7. `_workmeta/<project_code>/contract.yaml` 과 기본 `bindings/*.yaml` 을 만든다.
8. `_workmeta/system/bindings/workspace_junctions.yaml` 에 portable junction intent 를 기록한다.
9. `_workmeta/system/bindings/team_project_role_map.yaml` 에 current responsibility 를 갱신한다.
10. 필요하면 local-only `_workspaces/00_project_index.html` 같은 human index 를 갱신한다.
11. procedure capture 와 post-development review packet 을 `_workmeta/system/reports/**` 에 남긴다.
12. public 문서 변경이 동반되면 public `CHANGELOG.md` 를 갱신한다.

## `_workmeta` contract projection

반복 대장에서 추출해 private contract 에 넣을 수 있는 public-safe field shape 는 아래와 같다. 실제 값은 private `_workmeta/<project_code>/contract.yaml` 에만 둔다.

```yaml
ledger_ref:
  source_manifest_ref: ../../guild_hall/state/operations/company_project_ledger/manifest.json
  source_sha256: <checksum>
  sheet: <sheet_name>
  row: <row_number>
  pjt_no: <project_code>
responsibility:
  ledger_owner_cell: <observed_owner_cell>
  current_primary_responsible: <owner_corrected_current_responsible>
  current_primary_responsible_team: <team_or_org_hint>
  current_responsibility_source: <owner_statement_or_source_ref>
  soulforge_role: <owner_direct|team_shared|team_member_primary_owner_support|external_primary_team_coop>
schedule:
  due: <date_or_text>
status_hint:
  ledger_completion: <open_or_in_progress|closed_or_historical|unknown>
  claim_ceiling: workbook_supported_identity_only
```

## public/private 경계

Public repo 에 둘 수 있는 것:

- 이 문서처럼 반복 절차, owner boundary, field shape 를 설명하는 rule.
- generic placeholder 를 쓰는 schema 또는 example.
- workbook 이 source input 이라는 사실.

Public repo 에 두지 않는 것:

- workbook 원본.
- workbook 에서 추출한 실제 project list.
- 실제 project code 와 실제 과제명을 나열한 index.
- 실제 담당자/업체/일정 목록.
- mail body, attachment, customer payload, source workbook row dump.
- host-local OneDrive absolute path.

## 검증 기준

각 업데이트 작업은 최소한 아래를 확인한다.

- private YAML/JSON metadata parse.
- 새 `_workspaces/<project_code>` link 가 실제 shared worksite target 을 가리키는지 확인.
- public repo status 에 workbook, raw source, actual workspace payload 가 들어오지 않았는지 확인.
- private review packet 에 claim ceiling 과 owner correction 여부 기록.
- broad keyword 가 exact route 로 잘못 승격되지 않았는지 확인.

## 관련 경로

- [`PROJECT_ONBOARDING_V0.md`](PROJECT_ONBOARDING_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`WORKMETA_MINIMUM_SCHEMA.md`](WORKMETA_MINIMUM_SCHEMA.md)
- [`WORKMETA_SCHEMA_FIELD_MATRIX.md`](WORKMETA_SCHEMA_FIELD_MATRIX.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
