# 02. SE 규칙의 네 내부 층

사용자 관점에서는 ①·②가 Systems Engineering Domain Engine의 규칙 source이고,
③은 Organization Profile, ④는 Project Profile이다. `덧씌움/overlay`은 ③·④를
구현하는 내부 operation 이름이다. Project Binding은 실제 자료를 Typed Project
Facts로 연결하는 별도 seam이며 규칙 층이 아니다.

## 2.1 왜 네 층인가

"이 단계에 이 산출물이 있어야 한다"는 규칙은 출처가 다르다. 출처가 다른 것을 한 표에 섞으면 (a) 다른 발주처·다른 나라 과제에 재사용할 수 없고,
(b) 결손이 나왔을 때 "규정 위반인지, 발주처 요청 미이행인지, 그냥 좋은 관행 미달인지"를 구분할 수 없다.
그래서 출처별로 물리적으로 다른 파일에 두고 컴파일러가 합친다.

| 층 | 뜻 | 파일 | 행 수(2026-08-18) | 근거 |
| --- | --- | --- | --- | --- |
| **① 일반 SE 기준선** | 발주처·국가 무관. "체계공학 기반으로 개발한다면 각 기술검토 전에 최소한 이건 만들어 둬라" | `assets/SE_FolderTree_GenericSE_Base.md` → `compiled/generic_se_base.json` | 202행(9게이트, +고정 27 = 229 task), 산출물 종류 100 | NASA NPR 7123.1D 부록 G, DoD SE Guidebook 2022 §3 (NASA SE Handbook은 추출만, 미반영) |
| **② 국가 조달 공통(방사청·국방부)** | 한국 방위사업 체계개발이면 사업·발주처와 무관하게 요구되는 것 | `assets/SE_FolderTree_Guide.md` v0.8의 prime_contract 아닌 행 → `compiled/system_dev_common_no_grade.json` | 107행(8게이트, +고정 24 = 131 task): 규정 필수 35 · 가이드북 권고 46 · 근거 미표기 22 · 내부관리 4 | 방위사업관리규정·SE 가이드북·기술검토회의 가이드북 등 정본 13종(대조표 `references/source_verification_v0.md`) |
| **③ Organization Profile (내부 구현: prime overlay)** | 특정 주계약사에 반복 적용되는 계약·품질 지침 추가 요구 | `compiled/overlays/system_dev_lig_grade_a.prime.overlay.json` (같은 스펙 v0.8의 `evidence_level: prime_contract` 행 14개를 exporter가 `add` op로 뽑아냄) | 14 op | 주계약사 개발품질 지침(계약 문서) |
| **④ Project Profile (내부 구현: project overlay)** | 이 과제만의 applicability·tailoring·별칭·추가·조건 | private: `_workspaces/<project>/…/06_validation/stage_rules_<date>/overlay.json` | private pilot 120_CDR: 24 op(별칭 14 · 추가 9 · 조건 1) | 발주처 요청 메일·SOW(과제 원문) |

탐색개발·운용연구개발·선행연구 기본형(`*_Basic.md`, 각 35행)은 체계개발 명명틀을 빌린 **미검증 초안**이다(D43: 실제 과제 1건 검증 전 승격 금지). 응용연구는 제안 v2만 있다.

## 2.2 층은 어떻게 합쳐지나

현재 컴파일러(`compileStageRules`)는 `compiled_variant`(①이든 ②든 하나) +
`overlay`(③·④ op 목록을 이어 붙인 것) + compatibility `project_binding`을 받는다.
제품 의미는 다음과 같다.

```text
SE Domain Engine + Organization Profile + Project Profile
                           ↓ Rule Compiler
                    Effective Rule Set

Project Sources → Project Adapter/Binding → Typed Project Facts

Effective Rule Set + Typed Project Facts → Evaluator
```

현재 `project_binding`은 document ref·authority·time·scope를 policy material에 고정한다.
Project file/RAG/ERP observation을 읽는 Evidence Binding과 같은 것으로 확대하지 않는다.

Current loader는 Organization/Project overlay ops를 compiler 입력 하나로 합치므로 파일
분리는 돼 있어도 Profile별 `identity`, `extends/base pin`, revision, order, source refs를
독립적으로 끝까지 검증하는 target semantic seam은 아직 없다. migration에서는 legacy
project-profile envelope를 읽는 compatibility Adapter를 유지하면서 각 Profile provenance를
compilation trace에 따로 남겨야 한다.

- overlay op는 다섯 가지뿐: `add`(행 추가) · `alias`(과제 이름→표준어) · `mark_not_applicable`(N/A, 근거 필요) · `condition`(조건 토큰, 예 `sw_included`) · `add_dependency`(입력 추가, §2.6).
- `add`는 선택 필드 `task_id`·`folder_name`으로 **그 행이 디스크 어디에 있는지**를 말할 수 있다(둘 다 쓰거나 둘 다 안 쓴다). 덧씌움이 더한 규칙은 보통 폴더가 없지만, 원래 스펙 행이었다가 덧씌움으로 옮겨온 슬롯은 이미 폴더가 있다. 이 두 값이 있어야 파일 문(12장)이 스펙 행과 같은 방식(번호와 이름이 둘 다 맞아야 함)으로 그 폴더를 찾는다.
- overlay는 evidence level을 **올리거나 바꾸지 못한다**(D45). `add`는 표준 행이 `optional_context`일 때만 옆에 `prime_contract` 행을 둘 수 있고(발주처 요구 강화, 영수증 `overlay_strengthened`), 표준이 이미 요구하는 항목에는 거부된다.
- 등가성 증명(2026-08-18): "통합 스펙(②+③이 한 파일) 컴파일" 결과와 "② 공통 + ③ overlay 컴파일" 결과가 private pilot 120_CDR에서 **같은 27개 엔진 요구**를 낸다. 이 검사가 깨지면 exporter나 컴파일러의 약화 규칙이 어긋난 것이다.
- ①과 ②는 별도 링크 필드 없이 **같은 `artifact_type_id`**로 만난다. 행 배정이 어긋났던 3건은 D44 확정(2026-08-19)으로 ② 행을 고쳐 두 층이 같은 토큰으로 바로 만나고(08장 §8.3), 남은 대응은 진짜 동의어 한 쌍뿐이다(04장 §4.6). 그 위에서 ①의 관계를 ②로 투영한다(§2.7). 묶음 대응은 여전히 미결.

## 2.3 한 단계(120_CDR)로 본 숫자

| 조합 | 엔진 요구 수 | 비고 |
| --- | --- | --- |
| ① 만 | 38 | 횡단 산출물(SEMP·RTM·TEMP·위험목록·TPM…)을 게이트마다 반복 계수 |
| ② 만 | 16 | 생성 게이트에 한 번만 기재 |
| ②+③+④ (private pilot) | 27 | 표준 16 중 5는 발주처 슬롯과 일치, 규정 필수 6은 발주처 미요청, 발주처 추가 9 |
| ①∩② 토큰 공유 | 9 | 나머지 차이의 상당수는 위 모델링 차이 — 별칭 정합 뒤 다시 센다 |

## 2.4 evidence level(행의 근거 등급)과 컴파일 결과

| evidence_level | 뜻 | 컴파일 결과(기대 상태) |
| --- | --- | --- |
| `regulation_mandated` | 규정이 요구 | `present`(반드시 있어야 함) |
| `guidebook_recommended` | 정부 가이드북 권고 | `present_or_not_applicable`(있거나, 근거를 들어 해당 없음) |
| `prime_contract` | 주계약사 계약 항목 | `present_or_not_applicable`; `verification_status`는 정본 지지도를 재는 값이므로 `unsupported`가 기대값이며 강등하지 않음(`contradicted`만 강등) |
| `general_se_guidance` | ① 일반 SE 지침 | `present_or_not_applicable`(있거나, 근거를 들어 해당 없음); `se_floor: context`면 `optional_context` |
| `internal_management` | 내부 관리 폴더(INBOX/LOG/TDP) | 엔진 요구 아님 |
| `unstated` | 근거 미표기 | `optional_context` |

`verification_status`(정본 대조 결과)가 `unverified/unsupported/contradicted`거나 없으면 `optional_context`로 **낮춘다**(prime_contract 예외). `partially_supported`(한 정본만 확인)는 낮추지 않는다.

## 2.5 행의 종류: 산출물·활동·결정 (D46, 2026-08-18)

지금까지 규칙표의 행은 전부 문서였다. 문서만 담는 체크리스트는 "기능분석을 끝내고 설계기술서를 써라"를 말할 수 없다. 그래서 행에 `node_kind`를 붙였다.

| `node_kind` | 뜻 | 증거 | 폴더 |
| --- | --- | --- | --- |
| `artifact`(기본값) | 문서·도면·모델 | 파일이 있는가 | 만든다 |
| `activity` | 정본이 "하라"고 말하는 일(요구분석·기능분석·통합·검증…) | **기록**(회의록·결정 기록·그 일이 만든 산출물) — 행의 `evidence_record`가 무엇이 증거인지 지목한다 | 만들지 않는다(`is_virtual: true` → `generate_tree.py`가 건너뜀) |
| `decision` | 정본이 "확정하라"고 말하는 상태(기능·할당·제품 기준선) | 같음 | 만들지 않는다 |

- **판정 어휘는 그대로다**: 활동·결정도 `satisfied / gap_missing / gap_unknown`으로 판정한다. 달라지는 것은 무엇을 증거로 보느냐뿐이다.
- 규정이 요구하지 않는 활동·결정은 `present`가 될 수 없고 `present_or_not_applicable`이 상한이다(근거를 대고 "해당 없음"이라 답할 수 있어야 한다).
- 결정 노드는 형상식별서와 **다른 행**이다. `pci`(제품형상식별서)를 갖고 있는 것과 `dec_product_baseline`(제품 기준선 확정)은 다르며, 그 차이를 보이게 하는 것이 결정 노드의 존재 이유다.

## 2.6 선후 관계(`depends_on`)와 층 (D46)

행은 `depends_on: [토큰]`으로 "이것이 먼저 있어야 한다"를 말한다. 간선마다 근거를 따로 단다 — `depends_on_refs`(정본 인용 위치) 또는 `depends_on_evidence: unstated`(관행).

- **간선의 등급은 행의 등급과 다르다.** 행이 규정 필수여도 그 행의 입력 관계는 가이드북이 말한 것일 수 있다. 말하지 않으면 `unstated`로 두고 행의 등급을 물려받지 않는다(추정으로 올리지 않는다).
- **층은 섞지 않는다**: ①의 간선은 NASA·DoD 인용만, ②의 간선은 방사청 인용만 단다. 같은 원칙이 행에도 적용된다(2.1).
- **덧씌움은 간선을 더할 수만 있다**: overlay op `add_dependency`(exact `source_ref` + `basis` 필수). 정본 간선을 지우는 연산은 없다 — evidence level을 못 내리는 것과 같은 이유다(D45).
- 어휘가 모르는 토큰을 입력으로 적으면 컴파일을 거부하지 않고 영수증의 `unresolved_dependencies`에 이름과 함께 남긴다. 간선 하나의 오타가 변형 전체를 막지 않아야 한다.

2026-08-18 현재 수치: ① 250행(산출물 229·활동 18·결정 3) · ② 154행(산출물 145·활동 9). 도출 근거와 커버리지 한계는 `.registry/skills/se_foldertree_generate/codex/references/se_io_relations_v0.md`.

## 2.7 게이트 역할(`gate_role`)과 층을 건너는 투영 (2판, 2026-08-18)

**행이 무엇을 먼저 필요로 하는가(`depends_on`)와 그 행이 게이트에 무엇인가(`gate_role`)는 다른 질문이다.** 1판은 이 둘을 섞어 검토회의 INPUT 표를 산출물 사이의 인과로 읽었고, 그 결과 기능분석이 그 분석의 대상인 요구사항명세서보다 앞선다는 거꾸로 된 간선이 나왔다. 2판에서 분리했다.

| `gate_role` | 뜻 | 근거 |
| --- | --- | --- |
| `core` | 그 검토회의가 내놓기로 되어 있는 것 | ② 회의별 주요 산출물 표 · ① NPR 부록 G 성공기준 |
| `entry` | 회의 전에 있어야 할 자료 | ② 회의별 INPUT 표 · ① NPR 부록 G 진입기준 |
| `supporting` | 나머지(기본값) | 표기 없음 |

회의 INPUT 표는 이제 산출물끼리의 간선이 아니라 `entry` 표시가 된다. 다만 `act_technical_review` 행의 `depends_on`은 남는다 — 그것은 산출물끼리의 관계가 아니라 **회의 자체가 무엇을 기다리는가**이고, 회의를 그 게이트의 마지막에 두는 것도 이 간선이다.

**층을 건너는 투영**: ①과 ②는 토큰이 달라 ①의 관계가 ②에 닿지 않았다. 어휘의 `CROSS_LAYER_TOKEN_EQUIVALENCE`(D44 정정 뒤 동의어 1쌍)로 대응시키고, ①의 이분 관계를 활동 하나를 통과해 합성해 ② 행에 옮긴다(05장 §5.4B). 합성은 정본 문장이 아니므로 등급이 `general_se_guidance`를 넘지 않고 행에 `depends_on_origin: generic_layer_projection`으로 표시된다. **② 자신의 근거가 있으면 그쪽이 이긴다.**

행 수(2판): ① 핵심 32·진입 57·보조 161 / ② 핵심 25·진입 4·보조 125. ② 인과 연결은 전 단계 10 → 25.

정본의 별지 **서식**이 A의 칸에 B를 적도록 요구하는 자리도 간선이 된다(합성이 아니라 서식이 직접 보여 준다 → `guidebook_recommended`). 추출 62건 중 양 끝 토큰이 붙은 21건, ②에 앉은 것 9건.
