# SE Dungeon Stage Model v0

## 목적

이 문서는 체계공학 기반 프로젝트 폴더 구조를 Soulforge UI 의 `Dungeon Stage / Floor / Boss Clear` 모델로 읽는 기준을 고정한다.

원본 기준은 `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md` 의 public-safe guide 이며, 실제 project-local 자료는 `_workspaces/<project_code>/` 와 `_workmeta/<project_code>/` 에 남긴다.

## ASSUMPTIONS

- project 는 `Dungeon` 으로 본다.
- 체계공학 단계는 `Dungeon Stage` 또는 `Floor` 로 본다.
- 단계 완료 조건은 `Boss Clear` 로 본다.
- v0 는 stage taxonomy 와 UI 해석 기준만 정하고, 실제 project evidence 를 public 문서로 복제하지 않는다.

## Core Mapping

| SE / workspace 개념 | UI 개념 | 의미 |
| --- | --- | --- |
| `_workspaces/<project_code>/` | `Dungeon` | 실제 프로젝트 작업장 |
| SE gate / phase folder | `Dungeon Stage` 또는 `Floor` | 진행 단계 |
| phase deliverable / approval | `Boss Clear` | stage 완료 판정 |
| incoming mail/request/task | `Monster Encounter` | 처리할 업무 |
| stage inbox | `Encounter Lane` | stage 로 배치된 monster 대기열 |
| work folder | `Battle Workbench` | 진행 중 작업 공간 |
| out/final folder | `Artifact / Loot` | 완료 산출물 |
| review/action/quality folder | `Battle Evidence` | 검토, 조치, 품질 근거 |
| automation rule/config | `Workshop Material` | 자동화 후보와 운영 규칙 재료 |

## Stage List

| Code | Stage/Floor | Boss Clear 해석 |
| --- | --- | --- |
| `000_REF` | Reference Library | 프로젝트 기준/참고자료가 식별되어 stage 판단에 사용할 수 있음 |
| `020_MGMT` | Management Hall | 원본 수집, 상태, 의사결정/조치 기록이 운영 가능함 |
| `030_SRR` | SRR Floor | 체계요구조건검토 산출물과 SRR 조치 근거가 완료됨 |
| `060_SFR` | SFR Floor | 기능 기준선, 기능분석/할당, SFR 승인 근거가 완료됨 |
| `090_PDR` | PDR Floor | 기본설계/할당 기준선과 PDR 승인 근거가 완료됨 |
| `120_CDR` | CDR Floor | 상세설계/제품 기준선 준비와 CDR 승인 근거가 완료됨 |
| `150_TRR_DT` | TRR/DT Floor | 시험준비, 시제제작, 개발시험 관련 근거가 완료됨 |
| `180_FCA_OT` | FCA/OT Floor | 기능형상확인, 통합/운용시험 근거가 완료됨 |
| `210_PCA` | PCA Floor | 물리적 형상확인, 제품 기준선, 규격화 근거가 완료됨 |
| `240_LL` | Lessons Learned Floor | 개발이력 공유와 종결 산출물이 완료됨 |
| `270_UNCLASSIFIED` | Unclassified Holding | stage 미판정 monster/material 을 임시 보관함. boss clear 대상이 아님 |

## Boss Clear Rule

v0 에서 stage 는 아래 조건을 만족할 때 `boss_clear_candidate` 로 볼 수 있다.

1. stage 의 required artifact 가 `Out` 또는 Final-equivalent 위치에 있다.
2. review/action/quality evidence 가 stage 완료 판단을 뒷받침한다.
3. 관련 monster encounter 가 completed, transferred, or intentionally deferred 상태다.
4. mission readiness 가 terminal 상태라면 `terminal_provenance` pointer 가 있다.
5. snapshot freshness 가 `fresh` 다.

UI 는 위 조건을 직접 원본에서 깊게 검증하지 않는다. v0 UI 는 snapshot 또는 public-safe projection 이 제공하는 summary 만 표시한다.

## Monster Encounter Rule

- 업무/메일/요청은 `Monster Encounter` 다.
- `Monster Gate` 에 처음 들어온 encounter 는 아직 dungeon/stage 가 unresolved 일 수 있다.
- `DUNGEON_ASSIGNMENT_REQUEST_V0` 에 따라 assignment 는 부분 성공을 허용한다.
- stage 를 resolve 하지 못한 monster 는 `270_UNCLASSIFIED` 또는 workspace intake inbox 에 남길 수 있다.
- `boss` encounter 는 stage 완료 조건을 직접 닫는 요청이다.

## Artifact / Loot Rule

- 결과물은 `Artifact` 또는 `Loot` 로 표시한다.
- artifact 는 decorative inventory item 이 아니라 mission 이 만들거나 갱신한 산출물 pointer 다.
- 같은 artifact 는 한 mission 에서는 output 이고 다음 mission 에서는 input 이 될 수 있다.
- public UI fixture 는 실제 업무 원문, attachment, raw report 를 artifact 로 복제하지 않는다.

## Workshop Material Rule

자동화 후보는 `Workshop Material` 이다.

후보 예:

- 반복적으로 같은 stage/folder 에 배치되는 monster type
- manual intervention 이 줄어드는 battle pattern
- 재사용 가능한 folder packet shape
- 검토/조치/품질 evidence 를 안정적으로 생성하는 procedure
- stage assignment rule 로 승격 가능한 분류 기준

v0 에서는 후보를 표시하고 모으는 데 집중한다. 자동 승급은 v1 이후로 미룬다.

## UI Projection

`Dungeon Detail` 은 stage 를 아래 필드로 표시한다.

| Field | 의미 |
| --- | --- |
| `stage_code` | `030_SRR` 같은 stable stage id |
| `stage_label` | 사용자 표시명 |
| `floor_status` | `not_started`, `active`, `blocked`, `boss_clear_candidate`, `cleared` |
| `open_monster_count` | stage 에 남은 encounter count |
| `boss_clear_status` | stage 완료 조건 요약 |
| `artifact_count` | public-safe artifact pointer count |
| `blocker_summary` | raw content 없는 blocker 요약 |
| `freshness_status` | snapshot gate 상태 |

## v0에서 하지 않는 것

- stage 별 실제 project file content indexing
- 업무 원문이나 attachment 를 public snapshot 에 포함
- SE guide 전체를 UI schema 로 복제
- boss clear 를 자동으로 write-back
- stage taxonomy 를 universal schema 로 승격

## 다음 연결

- `Dungeon Map` 은 dungeon 단위 presence 와 stage progress summary 만 보여준다.
- `Dungeon Detail` 은 이 문서의 stage/floor list 를 기준으로 stage strip 을 만든다.
- `Mission Board` 는 stage 에 연결된 mission readiness 를 보여준다.
- `Battle Log` 는 boss clear 근거가 되는 terminal battle event 를 projection 으로 보여준다.
