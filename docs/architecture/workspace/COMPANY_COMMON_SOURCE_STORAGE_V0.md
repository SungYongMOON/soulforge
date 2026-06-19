# Company Common Source Storage v0

## 목적

회사 공통으로 반복 참조하는 원문 파일을 프로젝트 자료나 임시 폴더와 섞지 않고, Soulforge 작업자가 다음번에도 같은 위치와 같은 경계로 보관하게 한다.

이 문서는 실제 파일명, 실제 연락처, 실제 조직도, 실제 프로젝트 목록을 공개 저장소에 적지 않는다. 공개 저장소에는 저장 규칙과 public-safe 절차만 둔다.

## 분류 규칙

1. 특정 프로젝트 산출물, 계약, 설계, 시험, 메일 첨부, 고객 자료는 `_workspaces/<project_code>/...` 또는 owner-approved shared worksite 에 둔다.
2. 프로젝트 companion metadata, 실행 기록, 판단 근거, 해시, 경로 포인터는 `_workmeta/<project_code>/...` 또는 cross-project 경우 `_workmeta/system/...` 에 둔다.
3. 여러 프로젝트에 공통으로 쓰는 회사 운영 참조 자료는 `_workspaces/knowledge/common/company/<source_set_id>/` 아래에 둔다.
4. 프로젝트 번호, 담당자 관찰값, project registration 갱신처럼 회사 프로젝트 관리용 recurring source 는 `_workspaces/knowledge/common/project_management/<source_set_id>/` 아래에 두고, PJT 관리 대장은 `PROJECT_LEDGER_UPDATE_V0.md` 를 따른다.
5. 실제 프로젝트 폴더와 회사 공통 지식 폴더를 임의로 섞지 않는다. 분류가 불명확하면 public repo 에 올리지 말고 metadata-only candidate 로 보류한다.

## 회사 공통 source packet 형태

회사 공통 자료를 knowledge workspace 에 보관할 때 기본 구조는 다음과 같다.

```text
_workspaces/knowledge/common/company/<source_set_id>/
├── source/
├── source_cards/
├── manifest.json
└── source_inventory.csv
```

최소 기록 항목:

- source set id 와 생성 시각
- 원본 출처 라벨
- 보관본 상대 경로
- 파일 종류, 크기, 수정 시각, SHA-256
- 본문 추출 여부
- 허용 사용 범위와 금지 사용 범위
- claim ceiling

실제 원문 파일은 `_workmeta` 에 저장하지 않는다. `_workmeta/system/runs/<run_id>/` 에는 request packet, registration report, 검증 결과, source pointer 만 둔다.

## 본문 분석과 지식화 경계

1. source packet 보관은 원문 내용 분석, RAG index 생성, NotebookLM 업로드, public canon promotion 을 의미하지 않는다.
2. PowerPoint, Word, Excel, PDF 같은 원문은 별도 owner 지시가 없으면 파일 payload 로만 보관하고, 추출 여부를 manifest 에 명시한다.
3. HWP 원문은 직접 본문 분석하지 않는다. 본문 분석이 필요하면 먼저 owner-approved worksite 에서 HWPX 파생본을 만들고 `HWP_NORMALIZATION_V0.md` 를 따른다.
4. 연락처, 조직도, 자리배치도처럼 개인정보나 조직 정보가 들어갈 수 있는 자료는 public repo 에 원문, 행 목록, 텍스트 추출본, 스크린샷을 올리지 않는다.
5. source card 나 manifest 는 source truth, 최신 조직도 확정, 담당자 확정, ontology acceptance, public canon registration 을 만들지 않는다. 기본 claim ceiling 은 metadata-only 또는 source-supported metadata 다.

## 저장 위치 선택 순서

1. 사용자가 특정 프로젝트 코드를 지정하면 해당 `_workspaces/<project_code>/...` 또는 owner-approved shared worksite 를 먼저 검토한다.
2. 사용자가 "회사 공통", "우리 회사", "프로젝트 관리대장처럼", "지식 쪽" 이라고 말하고 특정 프로젝트가 아니면 `_workspaces/knowledge/common/...` 아래를 우선한다.
3. 회사 공통 자료 중 조직, 연락처, 자리배치, 회사 운영 참고자료는 `common/company/` 를 쓴다.
4. 회사 프로젝트 번호, project registration, 담당자 관찰값 갱신 자료는 `common/project_management/` 를 쓴다.
5. 기존 팀 공유 폴더에 `_Soulforge_*` 같은 보관 폴더를 만들 수 없으면 무리해서 shared folder 를 수정하지 않고, approved knowledge workspace 에 사본과 metadata-only pointer 를 둔다.
6. 임의의 새 top-level 폴더, 임의의 `knowledge/projects` 같은 미승인 분기, 개인 임시 폴더는 만들지 않는다.

## 주기 갱신과 자동화 권한

- 주기적으로 확인할 자료라도 해당 PC 가 실행 노드로 지정되지 않았으면 local automation 을 만들지 않는다.
- 사용자가 "다른 PC 에서 설정"한다고 말하면 현재 PC 에서는 refresh policy, 주기, source pointer, 검증 방법만 manifest 또는 run packet 에 남긴다.
- automation 생성, 삭제, scheduler 등록, watcher 실행은 node assignment 또는 owner 지시가 있을 때만 별도 작업으로 수행한다.
- 주기 정보는 source packet 의 metadata 다. 주기 정보만으로 source truth, 최신성 검증, 자동 실행 권한이 생기지 않는다.

## 검증 기준

회사 공통 source packet 을 만들거나 갱신하면 최소한 다음을 확인한다.

- source count 와 inventory row count 가 맞는지 확인한다.
- manifest/source card JSON 이 parse 되는지 확인한다.
- 원본과 보관본의 SHA-256 이 일치하는지 확인한다.
- public Git status 에 원문 payload, extracted text, 실제 연락처/조직 정보가 잡히지 않는지 확인한다.
- HWP 가 포함되어 있으면 body analysis flag 가 false 이거나 HWPX 파생본 검증 경로가 명시되어 있는지 확인한다.
- `_workmeta` 기록은 metadata-only 인지 확인한다.

## 관련 문서

- [`PROJECT_LEDGER_UPDATE_V0.md`](PROJECT_LEDGER_UPDATE_V0.md)
- [`PROJECT_FOLDER_INDEXING_POLICY_V0.md`](PROJECT_FOLDER_INDEXING_POLICY_V0.md)
- [`HWP_NORMALIZATION_V0.md`](HWP_NORMALIZATION_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
