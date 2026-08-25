# 01. 목적과 모양

## 1.1 엔진이 하는 일 (한 장)

Owner의 목적: 제품 엔지니어링을 체계공학 기반으로 해서 **요구사항을 놓치지 않고, 품질 좋게, 목적에 맞게** 만든다.
엔진은 그 목적을 위해 두 가지 상태를 만들어 비교한다.

- **Expected State(기대 상태)** — "이 단계(예: CDR)에서 이 과제는 무엇을 갖고 있어야 하는가". 규칙(정본·계약)에서 나온다.
- **Observed State(관측 상태)** — "실제로 무엇이 있는가". 과제 폴더·문서 색인·메일 첨부·검토 결과에서 나온다.

비교 결과는 요구별로 `satisfied / gap_missing / gap_unknown / gap_conflict` 중 하나이고, 결손·불명은 담당 역할에게 갈 mission 후보로 바뀐다.
엔진은 **판단만** 한다 — 파일을 쓰지 않고, Task를 만들지 않고, 승인하지 않는다(zero-write). 쓰기는 호출자(runner·writer)가 별도 권한으로 한다.

### 제품 용어

이 매뉴얼에서 `엔진`은 다음 두 가지를 구분해 쓴다.

- **Engineering Engine Core**: 공통 canonical guard·identity/authority/module binding·Rule Assembly/Evaluation orchestration Interface·Receipt 실행부. SE·LIG·과제 token을 모른다.
- **Systems Engineering Domain Engine**: SE schema·공통 규칙·domain compiler/evaluator Adapter·평가 계약·fixture·test·manual. 이것이 전문분야로서의 SE 엔진이다.

LIG·한화는 **Organization Profile**, `<project_code>` 같은 개별 과제 조건은 **Project
Profile**, 실제 문서·요구사항·메일·RAG·ERP 연결은 **Project Binding**이다.
Compiler는 계층이 아니라 Domain Adapter이고 Core는 조립 Interface를 소유한다. 전체 정본은
`docs/architecture/guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md`가
소유한다.

## 1.2 현재 구현의 두 실행층

| 층 | 역할 | 코드 | 특징 |
| --- | --- | --- | --- |
| **규칙 공급층** | "무엇이 있어야 하는가"를 만든다 | `stage_rules/`(단계→산출물 컴파일러·packet 생성기), `guild_hall/requirement_trace/`(요구→산출물 커버리지), `.registry/skills/se_foldertree_generate/`(규칙 스펙 정본) | 순수 함수. 규칙을 새로 만들지 않고 정본을 읽어 엔진 입력으로 바꾼다 |
| **판단 엔진** | Expected와 Observed를 비교해 finding·mission 후보를 낸다 | `kernel/`(결정론 커널), `subjects/`(평가 대상별 subject: `ax_se_project_context_pilot.mjs` 등), `contracts/`, `tests/` | 학습 모델 호출 없음, 결정론, 영수증 4종 분리 |

둘 사이의 계약은 `soulforge.ax_se_stage_policy.v0`(단계 정책)과 `soulforge.ax_se_project_context_pilot_packet.v0`(pilot packet)이다.
규칙 공급층이 이 두 계약 인스턴스를 결정론적으로 만들고, 판단 엔진의 runner가 그것을 받아 1회 평가한다.

## 1.2A 판단은 두 겹이 된다 (두 번째 겹은 아직 없음)

1. **있음/없음** — 산출물이 그 단계에 존재하는가(지금 엔진이 하는 것).
2. **제대로 됐나** — 있는 문서가 필수 절·표·양식을 갖추고 요구를 다뤘는가. 이것이 **문서 내용 검사기**(Owner 제안 2026-08-17, 설계 §2.1A)이며 아직 만들지 않았다. 검사기는 엔진 안이 아니라 관측을 만드는 쪽에 붙어 `내용 충족/부족/미검사`를 관측으로 넣고, 미검사는 부족으로 찍지 않는다. 모든 기능 표·구조도에 상태 "없음(합의됨)"으로 함께 그린다(README의 합의 목록).

## 1.3 왜 Domain 규칙과 Profile을 밖에 두는가

Owner 방향(2026-08-18): **"한 과제만 끼워맞추는 게 아니다. 다른 과제도 한다."**
규칙(어느 단계에 어떤 산출물, 어떤 요구를 어떤 산출물이 덮나)은 Domain Engine에 있어야 하고 과제는 얇은 Project Profile만 가진다.
그래서 규칙 정본은 엔진 코드가 아니라 사업유형별 폴더트리 스펙(`SE_FolderTree_*.md`)에 있고, 엔진은 읽기만 한다.
발주처(주계약사) 반복 항목도 스펙 본문에 섞지 않고 Organization Profile로 분리한다. 현재 내부 구현은 overlay operation이다(02장). 이유: 계약 항목이 섞이면 다른 발주처 과제에서 재사용할 수 없다.

## 1.4 파일 지도

```text
docs/architecture/workspace/
  ../guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md  Core·Domain·Profile·Binding target 정본
  SE_STAGE_RULE_SOURCE_MODEL_V0.md         단계 규칙 원천 설계(L0~L3, D42~D45)
  PROJECT_REQUIREMENT_TRACE_MODEL_V0.md    요구 추적 설계(R1~R4, D36~D41, §8.2 결정 기록)
  examples/se_stage_rules/                 컴파일러·생성기 public-safe fixture
  examples/project_requirement_trace/      커버리지 fixture
.registry/skills/se_foldertree_generate/codex/
  assets/SE_FolderTree_Guide.md            ② 체계개발 스펙 v0.8 (+③ prime_contract 행 포함, exporter가 분리)
  assets/SE_FolderTree_GenericSE_Base.md   ① 일반 SE 기준선 스펙 v0.1
  assets/SE_FolderTree_{ExploratoryDev,OperationalRnD,PreStudy}_Basic.md  탐색·운용·선행 기본형(재기준 필요)
  assets/compiled/*.json, compiled/overlays/*.json   스펙에서 export한 기계 형태
  scripts/export_variant_json.py           스펙→compiled(+공통 기준선/prime overlay 분리), --check 드리프트 방지
  references/source_verification_v0.md     ② 정본 대조표(행별 근거 판정)
  references/generic_se_base_derivation_v0.md  ① 도출 기록(행별 인용·방법·정정·미결)
guild_hall/engineering_engine/
  kernel/assembly/evaluation/...           current Core 후보(flat transition layout)
  stage_rules/artifact_vocabulary.mjs      산출물 표준어(artifact_type_id)
  stage_rules/stage_rule_compiler.mjs      compileStageRules: Domain 규칙+Profile delta+scope → Effective Rule Set 재료
  stage_rules/pilot_packet_generator.mjs   generatePilotPacketFromStageRules: 정책+관측 → pilot packet + launch
  subjects/ax_se_project_context_pilot.mjs 판단 subject(M2-2), tools/…_runner.mjs 1회 실행
  manual/                                  이 매뉴얼
guild_hall/requirement_trace/
  requirement_coverage.mjs                 R1 computeRequirementCoverage(순수)
  coverage_input_builder.mjs               R2 준비: 색인+Needs 정책+관측 → R1 입력
guild_hall/validate/path_length_policy.mjs 경로 길이 예산(200/60/60/해시16) — 모든 새 파일에 적용
```

private 면(공개 저장소 밖):

```text
_workspaces/<project_code>/…/06_validation/<run>/    실행 산출물(packet·policy·overlay·coverage)
_workmeta/<project_code>/runs/<run>/                 실행 binding·영수증·결정 기록(metadata-only)
_workmeta/system/reports/{se_stage_rules,source_research,rag}/  비교·정본 확보·색인 영수증
_workspaces/knowledge/common/…                        정본 원문·파생 텍스트·source card(공통 지식 라이브러리)
_workspaces/knowledge/common/systems_engineering/derivations/  규칙 도출 작업 파일(03장)
```

Target에서는 Project Profile·Binding·Typed Facts·Effective Rule Set payload를
`_workspaces/<project_code>/engineering/**`에 두고, `_workmeta`에는 exact ref·hash·
status·compact receipt만 둔다.

## 1.5 지켜야 할 경계 (요약)

- 순수 함수: `stage_rules/*`·`requirement_trace/*`는 fs·clock·random·env·network를 쓰지 않는다(정적 effect pin 시험).
- 규칙을 코드에 새로 쓰지 않는다. 규칙이 틀리면 스펙(정본)을 고치고 export한다.
- Domain Compiler Adapter는 Profile delta만 조립하고 Project source를 읽지 않는다. Project Adapter는 Typed Facts만 만들고 규칙을 발행하지 않는다.
- 정본 대조 상태가 없거나 약한 행은 **낮추기만** 하고 올리지 않는다(05장).
- private 실자료·사업명 세부·절대경로는 public 파일에 넣지 않는다. 실행 결과는 상대 포인터와 수치만.
- 새 파일·폴더는 경로 예산(총 200자·세그먼트 60자·해시 16자)을 지킨다(`npm run validate:path-length`).
