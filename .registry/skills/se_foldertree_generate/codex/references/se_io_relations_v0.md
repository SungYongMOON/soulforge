# 선후 관계(입력→출력) 도출 기록 v0 — 활동·결정 노드와 `depends_on` (2026-08-18)

이 문서는 규칙표의 행에 **"이것보다 이것이 먼저"**를 붙인 근거를 남긴다. 설계 authority는
`docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md` §8 D46, 엔진 쪽 설명은
`guild_hall/engineering_engine/manual/03_how_items_were_derived.md` §3.7과 `05_compiler_and_generator.md` §5.4A이다.

인용은 **위치만** 적는다(조·표 번호, 페이지 마커, 절 번호). 정본 원문 문장·경로·과제명은 넣지 않는다.

## 1. 무엇을 만들었나

| 만든 것 | 어디에 |
| --- | --- |
| 활동 노드 19종 + 결정 노드 3종(어휘 토큰) | `guild_hall/engineering_engine/stage_rules/artifact_vocabulary.mjs` (계열 `activity`, `decision`) |
| 정본별 사실 추출 4건 + 관계표 `relations.json` (간선 206) | private worksite `_workspaces/knowledge/common/systems_engineering/derivations/se_io_relations_20260818/` (영수증 `_workmeta/system/reports/se_stage_rules/se_io_relations_20260818.json`) |
| ① 스펙 v0.1 → **v0.2**: 활동 18행 · 결정 3행 추가, 82행에 `depends_on`(산출물 64 + 활동·결정 18) | `assets/SE_FolderTree_GenericSE_Base.md` (250 task = 산출물 229 + 활동 18 + 결정 3) |
| ② 스펙 v0.8 → **v0.9**: 활동 9행 추가, 12행에 `depends_on`(산출물 5 + 활동 7) | `assets/SE_FolderTree_Guide.md` (154 task = 산출물 145 + 활동 9) |
| 순서 계산 `orderStageWork` | `guild_hall/engineering_engine/stage_rules/stage_rule_compiler.mjs` |

활동·결정 행은 **폴더를 만들지 않는다**(`is_virtual: true` → `generate_tree.py`가 건너뜀). 체계개발 폴더 생성 수는 145로 그대로다(일반SE 229).

## 2. 방법 (03장 S0~S5와 같은 파이프라인)

```text
S1 사실 추출   정본 4계열에 리더 4개(병렬). 프로세스·검토회의별 선언된 Inputs/Outputs를 항목 이름 + 인용 위치로 JSON 추출
S2 합성        리더가 제안한 프로세스 토큰 → 정본 공통 활동 토큰으로 손으로 매핑 → 스크립트가 기계적으로 간선 생성(synthesize_relations.py)
S2b 스펙 계획  간선 → 스펙 행 배치·`depends_on` 계획(derive_depends_on.py). 순환 차단 규칙 내장
S4 스펙 반영   patch_specs.py / add_decision_rows.py 가 스펙 md에 행·필드를 줄 단위로 삽입(YAML 재출력 없음)
S5 검증        export --check, validate:se-stage-rules(45), dry-run 폴더 수 동일, 계층=통합 등가
```

간선이 되는 조건은 둘뿐이다. (a) 리더가 그 항목에 어휘 토큰을 붙였을 것, (b) 그 프로세스가 활동 토큰으로 매핑될 것.
둘 중 하나라도 아니면 간선을 만들지 않고 **미포함으로 센다.** 그래서 아래 커버리지 수치는 추정이 아니라 실측이다.

## 3. 정본별 커버리지

| 정본(source_key) | 읽은 범위 | 추출 항목 | 간선 인용 수 | 한계(실측) |
| --- | --- | --- | --- | --- |
| `nasa_se_handbook_rev2` | 4~6장 프로세스 17개의 Inputs/Outputs 목록 | 프로세스 17 · 항목 126 | 20 | 유일하게 **번호가 붙은 Inputs/Outputs 절**(§X.Y.1.1 / §X.Y.1.3)을 전 프로세스가 갖는다. 항목 이름이 일반적("results", "work products")이어서 토큰이 붙는 비율이 낮다 |
| `nasa_npr_7123_1d` | §3.2 공통 기술 프로세스 17개, 부록 G 검토회의 21표 | 프로세스 17(항목 95) · 검토 21(항목 619, 이번엔 미사용 §7-4) | 14 | **부록 C는 Rev D에서 "Reserved"**(본문: 핵심 SE 프로세스 지침은 SP-6105로 이동). Rev D §3에는 규범적 프로세스 입출력 표가 **없다** — 이 문서의 프로세스 입출력은 §3.2.x 서술에서 파생된 것이며 규범이 아니다. 부록 G 진입기준도 §G.1.1/G.1.2가 "권고이며 완전한 목록이 아니고 조정 대상"이라고 스스로 밝힌다 |
| `dod_se_guidebook_2022` | §4 SE 프로세스 16개 | 프로세스 16 · 항목 282 | 109 | 2022판 §4에는 프로세스별 Inputs/Activities/Outputs **양식이 없다**. 명시 입력 목록은 §4.1.3 하나뿐이고 나머지 9개 프로세스는 서술에서 파생. 라벨이 붙은 입출력 표는 §3(검토회의)에 있으며 이번 읽기 범위 밖 |
| `dapa_se_technical_review_guidebook_2017` | 검토회의 7건(SRR·SFR·PDR·CDR·TRR·FCA·PCA)의 INPUT/OUTPUT 표 | 검토 7 · 항목 78 | 54 | 표가 **회의별로 명시**되어 가장 직접적인 근거다. SVR은 2017·2024 어디에도 없고 PRR·FFRR은 부록 개요만 있어 입출력 표가 없다 |
| `dapa_se_technical_review_guidebook_2024` | 위와 같은 항목의 교차확인(OCR) | 차이 12건 | 0 | OCR 잡음 2건(CDR·TRR 입력 열 경계). 사실 차이: 규격서 계열 → 형상식별서 계열 전환, 국방규격 초안 I/II 신설, DBDD·SDP·SW시험 4종 추가 |
| `dapa_se_technical_management_practice_guide` | 5장 12개 프로세스의 하위 활동 41건 입출력 | 활동 41 · 항목 192 | 35 | 활동 단위가 세분화되어 있어 엔진 활동 토큰으로 **묶어서** 매핑했다(예: 사업계획 5단계 → `act_technical_planning`) |

**전체 커버리지: 이번에 쓴 항목 773건 중 243건(31.4%)이 간선이 됐다.** 524건은 정본이 준 이름이 일반적이거나("산출물", "results",
"최신화된 기술계획문서") 어휘에 대응 토큰이 없어서 토큰을 붙이지 않았다. 6건은 프로세스 자체가 엔진 활동에 대응하지 않는다
(입찰 전 사업설명회, 공급자 선정 기준 확인). NPR 부록 G의 619항목은 이번 계산에 넣지 않았다(§7-4).

## 4. 관계표 (`relations.json`, 간선 206)

| 층 | `input_of`(산출물→활동) | `produces`(활동→산출물) | 근거 등급 |
| --- | --- | --- | --- |
| `generic_se` (NASA·DoD) | 49 | 79 | `general_se_guidance` 128 |
| `dapa_common` (방사청 2017·실무지침서) | 36 | 42 | `guidebook_recommended` 78 |

- 정본 대조: `source_supported` 11(두 정본이 같은 간선을 말함) / `partially_supported` 195(한 정본). **`regulation_mandated` 간선은 0이다** —
  이번에 읽은 4계열이 모두 지침·가이드북이고 규정·훈령이 아니기 때문이다. 규정 근거 간선은 아직 없으며 이것은 결함이 아니라 실측 결과다.
- 실무상 다들 지키지만 어느 정본도 쓰지 않은 순서는 간선으로 만들지 않았다. 스펙에서 인용 없이 붙은 간선은 `depends_on_evidence: unstated`로 남고 컴파일러가 가장 약하게 읽는다.

### 활동 토큰과 정본 대응

| 토큰 | NASA SE Handbook | DoD SEG 2022 | 방사청 실무지침서 |
| --- | --- | --- | --- |
| `act_stakeholder_expectations` | Stakeholder Expectations Definition | Stakeholder Requirements Definition | 사용자 요구사항 개발 |
| `act_requirements_analysis` | Technical Requirements Definition | Requirements Analysis | 체계요구사항 개발 |
| `act_logical_decomposition` | Logical Decomposition | — | — |
| `act_functional_analysis_allocation` | — | — | 체계 기능 분석(기능 분해·할당) |
| `act_architecture_design` | Design Solution Definition | Architecture Design | 체계설계 |
| `act_implementation` / `act_integration` / `act_verification` / `act_validation` / `act_transition` | Product Implementation…Transition | Implementation…Transition | 구성품 구현 / 통합 / 검증 / 확인 |
| `act_technical_planning` · `act_requirements_management` · `act_interface_management` · `act_risk_management` · `act_configuration_management` · `act_technical_data_management` · `act_technical_assessment` · `act_decision_analysis` | 6장 기술관리 8종 | §4.1 기술관리 8종 | 사업계획·요구사항관리·형상관리·위험관리·기술성과측정 |
| `act_technical_review` | (부록 G 검토회의) | (§3 검토회의) | 기술검토회의 7건의 INPUT 표 |

결정 노드 3종(`dec_functional_baseline` · `dec_allocated_baseline` · `dec_product_baseline`)의 근거는 DoD SEG 2022 §4.1.6의 기준선 정의
한 곳이다: 기능 기준선은 SFR에서, 할당 기준선은 PDR에서, 제품 기준선(초판)은 CDR에서 확정된다. ① 스펙이 `fci`·`dci`·`pci`를 바로 그 세
게이트에 갖고 있어 배치는 **제안이 아니라 인용**이다. 결정 노드는 형상식별서와 **다른 행**이다 — 문서는 있는데 형상통제에 넣지 않은 상태를
구분하는 것이 결정 노드의 존재 이유다.

## 5. 스펙에 어떻게 앉혔나 (배치 규칙)

1. **활동 행은 게이트마다 반복될 수 있다.** 어떤 정본도 기술 프로세스를 특정 검토회의 하나에 배정하지 않으므로 배정을 지어내지 않는다.
   대신 ①이 횡단 산출물에 이미 쓰는 관례를 따른다 — 그 활동이 만드는 산출물을 스펙이 요구하는 **모든 작업 게이트**에 행을 둔다.
   단, 앞 게이트 행이 갖지 않은 입력을 하나도 더하지 않는 반복은 정보가 없으므로 뺀다(앞 게이트 행이 stage sequence로 이미 순서를 준다).
2. **000_REF·020_MGMT에는 활동 행을 두지 않는다.** 발주처 소유 입력과 진행 자료를 담는 자리이지 작업 게이트가 아니다.
3. **기술관리 8종에는 이번에 행을 만들지 않았다.** 두 정본 모두 "체계설계·제품실현 프로세스는 수명주기를 따라 흐르고, 기술관리 프로세스는
   계속 돌아간다"고 나눈다. 게이트별 행을 주면 어느 정본도 말하지 않은 순서를 주장하게 되고, 실제로 첫 시도에서 규칙으로 잘라야 하는
   순환 고리가 무더기로 나왔다. 간선은 `relations.json`에 그대로 있고 행만 미결로 남긴다(§7).
4. **`act_technical_review`만은 게이트마다 다른 입력을 갖는다.** 2017 가이드북이 회의별 INPUT을 실제로 다르게 적기 때문이다.
   OUTPUT(주요 산출물) 열은 "그 검토에서 나와야 할 산출물 목록"이지 "회의가 만들었다"가 아니고 INPUT 열과 크게 겹치므로
   (예: ICD는 PDR의 입력이자 산출물) 산출물 쪽 `depends_on`으로 쓰지 않았다. 그대로 읽었으면 게이트마다 순환이 생긴다.
5. **산출물 행의 `depends_on`** 은 그 산출물을 만든다고 정본이 말한 활동이며, 그 활동 행이 같은 게이트나 앞 게이트에 있을 때만 붙인다.
6. **순환 차단**: 활동은 자기가 만드는 것을 입력으로 선언하지 않는다(그건 반복이지 선행조건이 아니다). 스펙이 그 게이트나 앞 게이트에
   갖고 있지 않은 입력은 붙이지 않는다. 그러고도 남는 고리는 결정론적으로 가장 약한 간선을 끊고 기록한다 — 이번에 끊은 것은 **1건**
   (120_CDR `act_implementation` ← `drawings`).

## 6. 순서는 어떻게 계산되나 (요약)

`orderStageWork(compileResult, observations?)`는 게이트별로 할 일을 정렬한다. 자세한 규칙은 매뉴얼 05장 §5.4A.

1. 같은 게이트 안에서 `depends_on` 위상 정렬(앞 게이트 입력은 stage sequence가 이미 정렬한다)
2. 막힌 것보다 안 막힌 것 먼저 — 관측이 0이면 **입력이 하나도 없는 항목이 먼저** 나온다
3. 근거 등급 순: 규정 > 가이드북 > 발주처 계약 > 일반 SE 지침 > 내부관리 > 미표기
4. 토큰 사전순(결정론 tie-break)

"게이트 진입기준 먼저"는 **적용하지 않았다.** 어느 스펙 필드도 어떤 행이 진입기준인지 표시하지 않으며, 여기서 표시를 만들면
컴파일러가 규칙을 쓰는 것이 된다. 영수증의 `tie_breaks_skipped`에 그대로 적어 둔다.

인과(`depends_on`)와 순서(게이트)는 출력에서 분리되어 있다: `same_stage_inputs` / `earlier_stage_inputs` / `blocked_by` / `stage_sequence`.

빈 과제(관측 0) 실측 — 체계개발 공통 기준선 + 발주처 덧씌움, 030_SRR: 안 막힌 18건이 먼저 나오고(규정 7 → 가이드북 9 → 발주처 2),
막힌 4건이 뒤에 온다(`p_temp`·`ssrs`·`technical_review_package`는 기능분석 뒤, `act_technical_review`는 소요요구서 뒤).

## 6A. 2판 정정과 보강 (2026-08-18 후속)

1판을 실제 출력으로 검토한 결과 세 가지가 드러났고, 이 절이 그 처리다.

### (1) 거꾸로 된 간선 4개 제거

1판은 실무지침서 표 3 순서 4(체계 기능분석)의 출력 목록을 읽고 `ssrs`·`p_temp`·`technical_review_package` ← `act_functional_analysis_allocation` 간선을 만들었다.
체계공학 순서로는 **요구사항분석 → SSRS → 기능분석·할당 → FCI**이므로 이것은 뒤집힌 관계다. 뒤집어 다시 넣지 않고 **지웠다** — 뒤집는 것은 정본이 하지 않은 새 주장이기 때문이다.
(같은 방향을 규정이 직접 말한 문장이 §6B 후보에 있다: 운용요구서를 토대로 체계요구사항명세서를 작성. 확인 뒤 반영 대상.)

### (2) 검토회의 INPUT 표 → 인과가 아니라 **게이트 역할**

2017 가이드북의 회의별 INPUT 표는 "회의에 가져올 자료"이지 "산출물끼리의 입력"이 아니다. 그래서 산출물 사이의 간선으로 쓰지 않고 행에 `gate_role`을 붙였다.

| `gate_role` | 뜻 | 근거 |
| --- | --- | --- |
| `core` | 그 검토회의가 내놓기로 되어 있는 것 | ② 가이드북 회의별 **주요 산출물(OUTPUT)** 표 · ① NPR 부록 G 성공기준 |
| `entry` | 회의 전에 있어야 할 자료 | ② 가이드북 회의별 **INPUT** 표 · ① NPR 부록 G 진입기준 |
| `supporting` | 그 밖에 그 게이트가 담는 것 | 표기 없음(기본값) |

`act_technical_review` 행의 `depends_on`은 그대로 둔다. 그것은 산출물끼리의 관계가 아니라 **회의 자체가 무엇을 기다리는가**이고, 회의가 그 게이트의 마지막에 오게 하는 것도 이 간선이다.

행 수: ① 핵심 32 · 진입 57 · 보조 161 / ② 핵심 25 · 진입 4 · 보조 125.

②의 `core`는 두 정본을 합친 것이다 — 2017 가이드북의 회의별 주요 산출물 표와 실무지침서의 회의별 완료조건·산출물(4.2.5~4.9.5). 한 산출물이 한 회의에서는 진입 자료이고 다음 회의에서는 그 회의가 완료로 내놓는 것일 수 있으며(체계요구사항명세서가 SFR에서 그렇다), 그럴 때는 **강한 쪽(core)이 그 행을 대표**한다.

### (3) ①→② 투영 — 두 층이 토큰으로 만나게

②는 산출물 사이 인과가 사실상 없었다(SRR..PCA 통틀어 10건, 그나마 대부분이 회의 입력). ①의 128개 관계가 ②에 닿지 않은 이유는 **토큰이 달라서**다.

**대응표**(어휘 `CROSS_LAYER_TOKEN_EQUIVALENCE`, 근거는 두 스펙의 행 이름·용어):

| ① | ② | 종류 | 근거 | 현재 |
| --- | --- | --- | --- | --- |
| `temp` | `p_temp` | 동의어(성숙도) | ② 행 '예비시험평가기본계획서(P-TEMP)'가 SFR 이후 TEMP로 발전한다고 스스로 적음. ②는 `temp` 행도 따로 갖는다 | 유지 |
| `vcrm` | `spec_linkage_table` | ② 행 토큰 배정 | ② 행 이름 '요구사항검증매트릭스(VCRM)_F', 용어 VCRM. 토큰 이름이 가리키는 국방규격화 연계표는 `defense_spec_draft` 행에 있다 | **D44로 ② 행을 `vcrm`으로 고침, 대응 제거** |
| `vdd` | `sps` | ② 행 토큰 배정 | ② 행 이름 'SW산출물명세서(SPS_VDD)', 용어 SPS/VDD. 어휘의 `sps`는 체계성능시방서이고 ①은 같은 행에 이미 `vdd`를 골랐다 | **D44로 ② 행을 `vdd`로 고침, 대응 제거** |
| `conops` | `ord` | ② 행 토큰 배정 | ② 행 이름 '운용개념(CONOPS)', 용어 CONOPS. ①은 `ord`(소요-작전운용성능참조문서)와 `conops`를 따로 둔다 | **D44로 ② 행을 `conops`로 고침, 대응 제거** |

**D44 확정(2026-08-19)**: Owner는 대응표로 우회하지 말고 ② 행의 토큰 배정을 고치라고 확정했다(08장 §8.3). 토큰 자체는 하나도 바뀌지 않았고 `ord`·`sps`·`spec_linkage_table`은 각자의 뜻을 지킨다. 같은 스펙 안에서 그 토큰을 가리키던 `depends_on`·`evidence_record` 12건도 함께 옮겼다. 영향은 엔진 요구 id 1개(`150_TRR_DT_sps` → `150_TRR_DT_vdd`)뿐이고, ①→② 투영은 52간선/20행으로 수치가 같으며 이제 대응표를 거치지 않는다. ② `entry` 행은 4 → 2로 줄었는데, 줄어든 둘은 가이드북이 **다른 문서**(소요요구서·국방규격화연계표)를 회의 입력으로 적은 것을 잘못 배정된 토큰이 받아 가던 자리라 사라진 것이 정정이다.

**기각한 가설**: `spec_linkage_table` ↔ `rtm`. ②는 요구사항추적표 행 3개를 이미 `rtm`으로 갖고 있고, ②의 `spec_linkage_table` 행은 VCRM이다. 묶음 대응(`fca_plan`+`fca_checklist`+`pca_plan`+`pca_checklist` ↔ `fca_pca_plan_checklist`, 시험문서류 ↔ `test_docs`)은 다대일이라 토큰 대 토큰으로 적을 수 없어 미결로 둔다.

**투영 규칙**(순수 함수 `projectGenericLayerEdges`): ①의 관계는 이분(산출물→활동, 활동→산출물)이므로 그대로는 ②에 닿지 않는다. 그래서 **활동 하나를 통과하는 합성**을 쓴다 — `A는 활동 X의 입력` + `X는 B를 만든다` → `B는 A가 먼저 필요`. 합성은 정본이 쓴 문장이 아니므로
(a) 등급은 `general_se_guidance`를 넘지 않고, (b) 통과한 활동을 `via_activity`로 남기고, (c) 행에 `depends_on_origin: generic_layer_projection`으로 표시한다. ②가 이미 가진 간선이 있으면 `mixed`가 되고 ② 자신의 근거가 이긴다.
양 끝이 모두 ②에 있어야 하고, 입력은 같은 게이트나 **앞** 게이트에서 요구되는 것이어야 한다.

실측: 합성 128 → 투영 52간선 / ② 행 20개. 떨어져 나간 것은 ②가 그 산출물을 갖지 않아서 70, 입력이 아직 요구되지 않는 게이트라서 6.

### (3A) 양식 참조 간선

정본의 **별지 서식**이 산출물 A의 칸에 다른 산출물 B를 적도록 요구하면, A는 B가 먼저 있어야 쓸 수 있다. 이건 합성이 아니라 서식이 직접 보여 주는 관계이므로 등급은 `guidebook_recommended`다.

- 추출 **62건**, 양 끝에 표준어 토큰이 붙은 것 **21건**, ② 스펙에 실제로 앉은 것 **9건**(나머지는 ②가 그 산출물을 갖지 않거나 입력이 그 게이트보다 뒤에 요구된다).
- 가장 강한 근거는 2017 부록 E의 **빈칸 격자 서식 3종**이다: 국방규격화연계표(p.135)의 `적용문서`·`근거문서`·`규격 항번` 열, FCA 점검표(p.130)의 `점검 준비`·`연계성`·`규격 검토` 칸, PCA 점검표(p.131~132)의 도면↔부품목록 추적성·규격서→도번 참조.
- 읽기 한계: 부록 E 11종 중 실제 격자 서식은 그 3종뿐이고 나머지는 표준 목차다. 실무지침서(2012)에는 별지 서식 본문이 아예 없다(요구사항 추적 매트릭스는 언급만 있고 칸 구성이 없어 간선으로 만들지 않았다).
- 정본 판본 차이 2건은 OCR 오독이 아니라 **실제 개정**으로 판정했다: 2024가 체계규격서→기능형상식별서, 개발규격서→개발형상식별서, 제품규격서→제품형상식별서로 개명했다(어휘의 `fci`/`dci`/`pci`와 대응).

### (4) 중요도 순서

같은 등급 안에서 가나다순이라 SRR의 중심 산출물(SSRS)이 "다음 할 일 3개"에 안 나오던 문제. 정렬에 두 단계를 더했다(05장 §5.4A): **게이트 역할**(핵심 > 진입 > 보조) 다음 **뒤에서 몇 개가 이 산출물을 입력으로 쓰는가**(많은 것 먼저). 둘 다 컴파일된 규칙에서 계산되며 관측과 무관하다.

효과(빈 과제, 관측 0, ② 공통+발주처): 030_SRR 첫 5개가
`ICD · 상호운용성확보계획서 · M&S활용계획서 · RAM업무계획서 · SRR회의록`
→ **`체계요구사항명세서(SSRS)`** · 상호운용성확보계획서 · M&S활용계획서 · 예비TEMP · RAM업무계획서로 바뀌었다.
전 단계 인과 연결 수는 10 → **25**로 늘었다(단계별 4·1·1·1·1·1·1 → 3·4·4·4·2·4·4; SRR이 4→3인 것은 거꾸로 된 간선 4개를 지운 결과다).

## 6B. 규정 근거 선후 관계 — 후보만 (D37식)

§4에서 적었듯 이번에 읽은 4계열은 전부 지침·가이드북이라 `regulation_mandated` 간선이 0이다. 그래서 방위사업관리규정과 국방전력발전업무훈령 본문에서 **선후를 말한 문장**만 따로 뽑았다.

- 후보 **60건**(방위사업관리규정 34 · 국방전력발전업무훈령 26 / 확신 high 51 · medium 9), 양 끝에 표준어 토큰이 붙은 것 **16건**.
- **아직 어떤 스펙에도 넣지 않았다.** 규정 등급은 가이드북 등급을 이기므로 사람이 확인하기 전에는 규칙이 되지 않는다 — 관측을 사람이 확정하는 것과 같은 규칙이다.
- 확인 시트: private worksite `regulation_edges_confirmation_sheet.md`(확인칸 / from / to / 조문 / 요지 80자), 후보 데이터 `relations_regulation_candidates.json`.
- 읽기 한계: 두 정본 모두 조문 본문만 있고 별표·별지 서식 본문이 없어 서식 항목 단위의 선후는 확인할 수 없다.

## 7. 미결

1. **기술관리 8종의 행** — 간선은 있고 규칙 행이 없다(§5의 3). 게이트별 반복이 아니라 "과제 전체에 한 번" 같은 다른 모양이 필요할 수 있다.
2. **규정 근거 간선 0** — 후보 60건은 뽑았으나(§6B) Owner 확인 전이라 규칙표에는 아직 없다. 확인되면 `regulation_mandated` 간선이 처음 생긴다.
2A. ~~**② 행의 토큰 배정 3건**~~ — **닫힘(D44, 2026-08-19)**: 대응표 우회 대신 ② 행을 고쳤다(§6A(3)). 실제 영향은 엔진 요구 id 1개뿐이었고, KVDS overlay 24 op 중 그 토큰을 가리키는 것은 0건이었다. 남은 후속: 그 overlay의 `extends.spec_sha256`이 v0.8을 가리켜 D44 이전부터 `OVERLAY_BASE_MISMATCH` 상태이므로 다시 pin해야 한다(Owner).
2B. **묶음 대응** — `fca_pca_plan_checklist`·`test_docs`처럼 ②가 여러 ① 산출물을 한 행에 묶은 자리는 다대일이라 토큰 대응으로 적을 수 없어 투영에서 빠진다.
2C. **투영 잡음 1건** — `ord ← p_temp`(030_SRR, 활동 `act_validation` 경유)는 합성 규칙상 나오지만 읽기에 어색하다. 그 행은 `unstated`라 엔진 요구가 아니어서 조언에는 나오지 않는다. 검토 대상.
3. **DoD SEG §3** — 검토회의별 `Inputs and Review Criteria` / `Outputs and Products` 표가 §3에 있다(이번 읽기 범위는 §4). ① 층의 게이트 입력을 크게 보강할 수 있는 가장 가까운 다음 정본.
4. **NPR 부록 G 21표** — 검토 21건의 진입·성공 기준 항목 714건을 추출해 뒀지만 간선으로 쓰지 않았다(진입기준은 "권고이며 완전하지 않다"고 스스로 밝힌 목록이라 산출물 depends_on으로 바로 쓰면 과장이 된다). 게이트 진입기준 표시 필드가 생기면 그때 쓴다.
5. **커버리지 31.7%** — 나머지 524항목은 정본 이름이 일반적이라 토큰을 붙이지 못했다. 어휘를 늘리면 올라가지만 어휘는 뜻이 겹치면 안 되므로 D44와 함께 판단한다.
6. **`act_quality_assurance`** — 실무지침서가 품질보증 프로세스를 별도로 두지만 추출된 입출력 항목에 어휘 토큰이 하나도 붙지 않아 토큰을 발행하지 않았다.
7. **기본설계·상세설계 활동** — 게이트 이름(PDR/CDR)은 있어도 이를 별도 프로세스로 부르는 정본이 이번 4계열에 없다. `act_architecture_design` 하나로 두고 남겨 둔다.
8. 실무지침서 2건의 미확인(표 25 입력물 열 정렬, 표 29 대 5.10.3 흐름도의 인터페이스 문서 위치)은 원본 표 재확인이 필요하다.
