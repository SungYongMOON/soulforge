# Engineering Engine Core·Domain·Profile 조립 모델 v0

## 상태와 결정

- 상태: `canon_entry`
- Owner 결정일: 2026-08-25
- 결정 상태: target architecture 승인, 물리 migration 완료 (Core, Systems Engineering, Quality Readiness, Profile Schemas & Catalogs, Legacy Stubs)
- 현재 bytes 주장 한계: `observed`

이 문서는 Soulforge의 여러 전문 엔진을 같은 공통 실행부 위에서 만들고,
LIG·한화 같은 조직 요구와 개별 과제 요구를 엔진 자체와 섞지 않는 조립 모델을
고정한다. `guild_hall/engineering_engine/`은 `core/`, `engines/systems_engineering/`,
`engines/quality_readiness/`와 `.registry/engineering_profiles/`로 물리 migration이
완료되었으며, 기존 공개 인터페이스에 대한 호환 re-export를 유지한다.

## 한 줄 결정

> Soulforge Engineering Engine은 **공통 실행 Core + 독립 Domain Engine +
> Organization Profile + Project Profile + Project Binding**으로 구성한다.
> Core는 Rule Assembly·Evaluation의 작은 Interface와 공통 guard/receipt를 소유하고,
> 각 Domain Engine은 그 Interface를 만족하는 domain compiler/evaluator Adapter를 제공한다.
> Compiler는 계층이나 별도 엔진이 아니다.

## 고정 용어

| 용어 | 소유하는 것 | 소유하지 않는 것 |
| --- | --- | --- |
| **Engineering Engine Core** | canonical data guard, identity/authority/module binding, Rule Assembly·Evaluation orchestration Interface, 공통 실행·result/receipt 규칙 | domain token/schema, domain compile/evaluation semantics, 조직·과제 이름, project source payload |
| **Domain Engine** | SE·Quality·Interface 같은 전문분야의 schema, 공통 규칙, domain compiler/evaluator Adapter, 검증 계약, fixture, test, manual, topology | LIG·한화·특정 과제 조건, 실제 문서 위치 |
| **Organization Profile** | 여러 과제에서 반복 적용되는 조직별 tailoring과 추가 규칙 | 한 과제의 계약 사실, 실제 파일 위치, 조직 전체를 대신하는 별도 엔진 |
| **Project Profile** | 특정 과제의 applicability, tailoring, 별칭, 조건, 과제 고유 추가 규칙 | 실제 문서·메일·ERP row의 위치와 관측 사실 |
| **Project Binding** | 실제 source revision·문서·메일·RAG·ERP·요구사항을 engine 어휘와 Typed Project Facts에 연결 | 공통 규칙, 조직 규칙, 적용정책의 임의 변경 |
| **Effective Rule Set** | Core의 Rule Assembly Interface를 통해 Domain Adapter가 Domain rules + 선택 Organization/Profile delta를 조립한 재생성 가능 결과 | source truth, 수동 편집 정본, project observation |
| **Typed Project Facts** | Project Adapter가 exact binding과 관측에서 만든 evaluator 입력 | RAG 답변을 source truth로 승격하는 행위, 규칙 발행 |

`Overlay`는 사용자 관점의 계층 이름으로 쓰지 않는다. Organization Profile과
Project Profile을 구현하는 내부 operation 형식(`add`, `alias`, `condition` 등)을
말할 때만 쓴다.

## 전체 조립도

```text
Domain Engine Rules
        +
Organization Profile Delta     optional
        +
Project Profile Delta          project-local
        │
        ▼
┌──────────────────────────────────────────┐
│ Core Rule Assembly Interface             │
│   └─ Domain Compiler Adapter             │
└────────────────────┬─────────────────────┘
            ▼
    Effective Rule Set
            │
            │                    Project Sources
            │              Docs / Mail / RAG / ERP
            │                         │
            │                         ▼
            │                 Project Adapter
            │                         │
            │                         ▼
            │                Typed Project Facts
            │                         │
            └────────────┬────────────┘
                         ▼
                     Evaluator
                         │
                         ▼
        SATISFIED / MISSING / UNKNOWN / CONFLICT
                         +
                      Receipt
```

Rule Assembly Interface와 Project Adapter는 다른 seam이다.

- Rule Assembly/Domain Compiler의 질문: **무엇을 검사해야 하는가?**
- Project Adapter·Binding의 질문: **실제 과제에서 무엇이 관측됐는가?**
- Evaluator의 질문: **적용 규칙과 관측 사실을 비교하면 어떤 상태인가?**

Domain Compiler Adapter는 Project source를 읽거나 RAG를 호출하거나 증거 존재를 판단하지 않는다.
Project Adapter는 규칙을 만들거나 완화하지 않는다. RAG는 후보 source와 locator를
찾는 retrieval 도구이며 verdict authority가 아니다.

## Module Interface와 seam

Target Interface는 개념적으로 다음 동작으로 제한한다. 구체 schema와 함수명은
SE와 E01 두 Domain Adapter의 conformance fixture가 같은 Core contract를 만족한 뒤
동결한다. 한 Domain implementation만 보고 Core Interface를 먼저 고정하지 않는다.

```text
loadDomainEngineAdapter(domain_engine_ref)
resolveProfileBindings(organization_profile_ref?, project_profile_ref?)
assembleEffectiveRuleSet(domain_adapter, ordered_profile_bindings, compilation_scope)
evaluate(domain_adapter, effective_rule_set, typed_project_facts, authority, cutoffs)
```

Domain Engine Adapter가 Core에 제공하는 최소 계약은 다음 범주다.

```text
domain_engine_id + revision
rule/schema refs + profile-delta schema
compile adapter + evaluator adapter
validation/conformance refs
fixture/manual/topology refs
```

Core는 이 refs와 result/receipt envelope를 검증하지만 domain rule token과 판정 의미를
해석하지 않는다.

Organization Profile과 Project Profile은 compile 전에 각각 검증된 ordered binding으로
보존한다. Profile binding은 최소 `profile_kind`, `profile_id`, `domain_engine_id`,
`revision/hash`, `extends/base pin`, `operation digest`, `source refs`, `order`를 가진다.
여러 Profile ops를 provenance 없이 먼저 평탄화하지 않으며 compilation trace가 각
Profile의 identity와 pin을 따로 보존해야 한다.

Project source 쪽은 별도 Interface다.

```text
adaptProjectEvidence(project_binding_ref, source_snapshot_refs, cutoffs)
  -> Typed Project Facts + observation receipt
```

현재 `compileStageRules(request).project_binding`은 document ref·authority·time·scope를
정책 material에 고정하는 compatibility 입력이다. target model의 `Project Binding`
전체와 같은 뜻으로 확대하지 않는다. 실제 파일·메일·RAG·ERP 관측을 Typed Facts로
바꾸는 책임은 Project Adapter seam으로 분리한다.

## Target public package tree

```text
guild_hall/engineering_engine/
├── README.md
├── core/
│   ├── interfaces/
│   ├── rule_assembly/
│   ├── evaluation_runtime/
│   ├── validators/
│   └── runtime/
└── engines/
    ├── systems_engineering/
    │   ├── engine.yaml
    │   ├── schema/
    │   ├── rules/
    │   ├── compiler/
    │   ├── evaluator/
    │   ├── contracts/
    │   ├── fixtures/
    │   ├── tests/
    │   ├── manual/
    │   └── topology/
    ├── quality_readiness/
    │   └── <same package categories>
    └── interface_consistency/
        └── <same package categories>
```

Domain Engine은 작고 깊은 Adapter Interface 뒤에 규칙 로딩, domain compilation,
validation, evaluation semantics와 test contract를 숨긴다. Core를 domain별로 복사하지
않고, Domain Engine package가 공통 Core의 orchestration Interface를 만족한다.

현재 `kernel/`, `stage_rules/`, `subjects/`, `contracts/`, `fixtures/`, `tests/`,
`tools/`, `manual/`, `topology/` 평면 구조는 migration source다. 새 엔진을 평면
prefix 파일로 계속 추가하는 것은 target이 아니다. migration이 끝나기 전까지는
현재 import와 manifest가 source of truth이며 새 target tree에 파일을 중복 복사하지
않는다.

## Organization Profile 저장 owner

Target public-safe catalog 모양은 다음과 같다.

```text
.registry/engineering_profiles/
├── schemas/
└── organizations/
    └── <organization_id>/
        ├── profile.yaml
        └── domains/
            └── <domain_engine_id>/
                └── profile.yaml
```

이 path는 migration target이며 이번 결정에서 materialize하거나 schema를 발행하지
않는다. public repo에는 public-safe identity, schema, source refs, hashes와 synthetic
example만 허용한다. 고객·계약·회사-private profile payload와 source body는 public
registry에 두지 않는다.

현재 tracked `system_dev_lig_grade_a.prime.overlay.json`은 target catalog의 모범
payload로 승인하지 않는다. 이 파일은 target public/private 정책 이전의 legacy tracked
artifact이며, 실제 계약 유래 Profile payload인지 public-safe abstraction인지 이번
checkout에서 분류 근거가 닫히지 않았다. migration 때 source/classification을 재검토해
private relocation 또는 public-safe synthetic/ref replacement 중 하나로 닫기 전까지
`HOLD`다. 이 legacy 파일의 존재는 새 customer Profile payload의 public 저장 선례가 아니다.

실제 private organization source와 도출 작업의 target owner는 다음과 같다.

```text
_workspaces/knowledge/organizations/
└── <organization_id>/
    └── <domain_engine_id>/
        ├── source/
        ├── source_cards/
        ├── derivations/
        └── accepted_profile_package/
```

조직 자료라는 이유만으로 승격하지 않는다. 여러 과제에 반복 적용되는지,
source·revision·authority가 무엇인지, public/private 경계와 Owner acceptance가
확인된 항목만 Organization Profile 후보가 된다.

## Project Profile·Binding·Facts 저장 owner

```text
_workspaces/<project_code>/
└── engineering/
    ├── profiles/
    │   ├── systems_engineering.yaml
    │   ├── quality_readiness.yaml
    │   └── interface_consistency.yaml
    ├── bindings/
    │   ├── document_binding.yaml
    │   ├── requirement_binding.yaml
    │   ├── evidence_binding.yaml
    │   └── lifecycle_binding.yaml
    ├── facts/
    │   ├── requirements.json
    │   ├── interfaces.json
    │   ├── documents.json
    │   └── verification.json
    └── runtime/
        ├── compiled/
        │   ├── effective_rule_set.json
        │   └── compilation_trace.json
        └── runs/<run_id>/
```

Project Profile, Binding, Typed Facts, Effective Rule Set와 result payload는 project
worksite에 둔다. Effective Rule Set은 재생성 가능한 runtime artifact이며 사람이
직접 고치는 정본이 아니다.

`_workmeta/<project_code>/**`에는 payload를 두지 않는다. exact refs, hashes,
status, authority/decision metadata와 compact input/result/execution receipts만 둔다.
이 규칙은 참조 설계에서 제안된 `_workmeta/.../compiled/*.json` payload 배치보다
현행 metadata-only 정책이 우선한다는 명시적 보정이다.

## 지식 계층과 승격 방향

```text
공통 Domain 지식
_workspaces/knowledge/common/<domain_engine_id>/

조직 반복 지식
_workspaces/knowledge/organizations/<organization_id>/<domain_engine_id>/

프로젝트 원문·사실
_workspaces/<project_code>/
```

프로젝트에서 발견한 사실은 자동으로 조직 지식이나 공통 Domain 지식이 되지 않는다.

```text
project-only인가?             YES -> Project Profile/Binding에 유지
여러 같은 조직 과제에 반복?   YES -> Organization Profile 승격 후보
조직·국가·과제와 무관한가?    YES -> Domain Engine 승격 후보
```

각 위쪽 승격은 sourcebound review, claim ceiling, Owner/review gate를 별도로 통과한다.
Bot memory, RAG answer, NotebookLM answer, 파일 경로의 존재만으로 승격하지 않는다.

## SE current mapping

| current implementation | target 의미 |
| --- | --- |
| `kernel/`, `assembly/`, 공통 authority/binding/receipt guard | Engineering Engine Core 후보 |
| `stage_rule_compiler.mjs`, 일반 SE·방사청 compiled variant와 SE schema/rules/tests/manual | Systems Engineering Domain Compiler/Evaluator Adapter 후보. current canonical physical owner는 foldertree skill+flat engine tree |
| `system_dev_lig_grade_a.prime.overlay.json` | Organization Profile 파일 분리의 legacy evidence. public/private classification과 semantic Profile seam은 `HOLD` |
| project `overlay.json` | Project Profile 파일 분리의 current implementation. semantic Profile identity/pin provenance 보존은 `HOLD` |
| project source catalog·artifact observations·requirement index | Project Binding/Adapter input과 Typed Facts 후보 |
| `compileStageRules` 결과 | SE Effective Rule Set·policy material 후보 |

LIG 엔진이나 `<project_code>` 엔진을 만들지 않는다. SE·Quality·Interface 같은 Domain
Engine만 만들고, Organization Profile과 Project Profile이 각각의 domain에 적용된다.

현재 `soulforge.engine_project_profile.v0`와 `engine_context` loader는 variant·복수
overlay·binding·observation/runtime refs를 한 envelope로 받고, 여러 overlay ops를
compiler 입력 하나로 합친다. 이것은 target Profile seam의 완료 증거가 아니라 legacy
compatibility surface다. migration은 이 envelope를 읽는 Adapter를 유지하면서 Profile별
identity·base pin·revision·order·source refs를 별도 검증하고 compilation trace에 남겨야 한다.

## Migration gate

물리 relocation은 별도 bounded implementation으로 수행한다.

1. current file/import/manifest/topology/validator inventory와 clean baseline을 동결한다.
2. Systems Engineering과 별도 E01 candidate branch(`codex/quality-engine-v0@f306f3c7`)의
   Adapter 후보를 같은 conformance fixture로 비교해 Core Interface 후보를 만든다.
3. 두 Domain Adapter가 통과한 뒤 Core Interface를 동결하고 compatibility export로 caller를 유지한다.
4. Systems Engineering Domain Engine을 옮기고 현재 public-synthetic 및 reported private
   zero-write replay의 결과·digest가 동일한지 확인한다.
5. Quality Readiness candidate를 독립 package category에 맞춰 통합하고 second-adapter
   conformance를 다시 실행한다.
6. Organization Profile catalog와 Project Profile/Binding Adapter를 schema·fixture·
   validator와 함께 만든다.
7. legacy project-profile envelope compatibility Adapter와 Profile별 identity/base pin/
   revision/order/source-ref compilation trace를 검증한다.
8. manifest·topology·manual·release candidate를 재생성하고 fresh review를 통과한다.
9. 그 뒤에만 Interface Consistency와 이후 Domain Engine을 같은 package 규격으로 만든다.

다음이면 migration을 중단한다.

- current import/caller를 compatibility 없이 깨야 하는 경우;
- 동일 입력의 Effective Rule Set 또는 assessment가 달라지는 경우;
- Core와 Domain Engine 양쪽이 같은 domain 규칙·schema/evaluation authority를 소유하는 경우;
- Profile ops가 개별 identity·base pin·revision·order·source provenance 없이 평탄화되는 경우;
- project/customer/private payload가 public package나 `_workmeta`에 들어가는 경우;
- manifest/topology/release 또는 zero-write replay가 실패하는 경우;
- folder move가 source truth의 자동 승격이나 Owner acceptance로 해석되는 경우.

## 하지 않는 것

- Domain Engine마다 Compiler/Evaluator/Registry를 복사하지 않는다.
- LIG·한화·`<project_code>`를 별도 엔진으로 만들지 않는다.
- Organization Profile에 project-only 계약·메일·실제 file path를 넣지 않는다.
- Project Profile과 Project Binding을 하나의 자유형 YAML로 합치지 않는다.
- RAG나 LLM이 Effective Rule Set 또는 verdict를 직접 발행하지 않는다.
- compiled artifact를 사람이 수정하거나 canon으로 승격하지 않는다.
- current flat layout을 한 번에 이동하거나 relocation stub를 active canon으로 두지 않는다.

## 현재 완료와 HOLD

Current public evidence:

- 공통 Core와 Domain Engine(`systems_engineering`, `quality_readiness`) 및 Profile schema·adapter 물리 분리가 완료됐다.
- `core/` 아래에 validator, interface, profile/binding adapter, evaluation runtime, assembly engine이 위치한다.
- `engines/systems_engineering/` 및 `engines/quality_readiness/`로 규칙, evaluator, fixtures, guidance, mcp, manual, tests가 물리 relocation됐다.
- legacy flat 경로는 순수 thin compatibility wrapper(re-export / pointer)로 유지되며 no-duplicate-authority validator로 검증된다.
- Organization Profile authoring/binding schema(`.registry/engineering_profiles/schemas/engineering_profile_schema_v0.json` 및 `core/schemas/`)와 AJV validator 및 Profile별 provenance-preserving compilation trace가 구현됐다.
- E01 Quality Readiness candidate integration과 two-domain adapter conformance가 완료됐다.
- public roadmap/manual에는 private SE zero-write pilot이 보고돼 있다. 이 worktree에는
  exact private receipt payload가 없으므로 이 문서는 production activation이나 private
  validation을 새로 주장하지 않는다.

HOLD (외부/상위 승인 대기 항목):

- root done-check (외부 56개 pre-existing tracked absolute-path debt 미해결로 HOLD);
- private full Phase-1 production activation 및 private payload validation (private workspace/payload 부재로 HOLD);
- legacy tracked LIG overlay의 public/private classification과 relocation/replacement;
- E02 (Interface Consistency) package creation;
- production release, writer/action authority와 actual project acceptance.
