# SE Stage Rule Source Model v0 — 단계 규칙의 단일 원천

- 상태: `DRAFT` / `canon_candidate` / `claim_ceiling: observed`
- 작성: Claude Fable 5 (2026-08-18) · Owner 승인 전
- 관계: `../guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md`(Core·Domain Engine·Organization/Profile·Binding 정본), `SE_DUNGEON_STAGE_MODEL_V0.md`(단계·boss clear 의미), `PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`(요구 커버리지·Needs 정책, D38), `.registry/skills/se_foldertree_generate/`(사업유형별 폴더트리 variant), `.workflow/se_stage_artifact_gap_scan_v0/`(`se_stage_expected_artifact_policy_v0`), `guild_hall/engineering_engine/`(`soulforge.ax_se_stage_policy.v0`). 모순 시 기존 정본이 이긴다.
- Owner 질문(2026-08-18): "폴더트리는 체계개발 기준의 최대치인데, 응용연구·탐색·체계 단계마다 다를 텐데 엔진이 구분할 수 있나? 폴더트리를 참고만 할까, 엔진이 다시 만들까, KVDS는 체계사업이니 그대로 쓸까?" — 이 문서는 그 질문에 대한 구조 답변이다.

---

## 1. 한 줄 결정

> **SE 단계 공통 규칙의 원천은 사업유형별 폴더트리 variant 스펙이다.** 이것은 Systems Engineering Domain Engine의 rule source다. 발주처 반복 요구는 Organization Profile, 과제 고유 적용조건은 Project Profile로 분리하고, 내부 overlay operations로 구현한다. Rule Compiler는 세 규칙 입력을 조립해 Effective Rule Set 재료를 만들며, Project Binding·Typed Facts는 별도 seam이다.

근거: (1) 원천이 둘이면 어긋난다(현재 KVDS 엔진 슬롯 14개는 발주처 요청 메일에서, 폴더트리는 방사청 문서에서 왔고 서로 모름). (2) 폴더트리 variant는 이미 사업유형(선행연구·탐색개발·체계개발·운용연구개발) × 발주처 × 품질등급 3키로 갈라져 있고, 항목마다 출처(source)를 적는 자리가 있다. (3) 2026-08-18 정본 대조(`references/source_verification_v0.md`)로 체계개발 variant는 규정 spine과 부합함이 확인됐고, 나머지는 재기준 대상이 특정됐다.

## 2. 네 층

| 층 | 무엇 | 저장 | 소유 |
| --- | --- | --- | --- |
| L0 정본 근거 | 방사청·국방부 규정·훈령·지침·가이드북 원문과 파생 텍스트, intake 영수증 | `_workspaces/knowledge/common/**`(원문·파생) + `_workmeta/system/reports/source_research/**`(영수증) | 지식 라이브러리 |
| L1 Domain 규칙표 | 사업유형별 **variant 스펙**의 gate/task 항목에 기계 필드(§3)를 더한 것 = "이 사업유형의 이 단계에는 이 산출물" | `.registry/skills/se_foldertree_generate/codex/assets/*.md`(스펙 YAML) → 컴파일 JSON `codex/assets/compiled/<support_key>.json` | current physical/canonical owner: 폴더트리 skill package; target semantic/package owner: Systems Engineering Domain Engine |
| L2 Profile delta | 발주처에 반복되는 요구는 Organization Profile, 과제 고유 applicability·tailoring·별칭·추가·조건은 Project Profile. current implementation은 overlay ops | public-safe profile envelope는 future registry target; private organization/project payload는 각각 approved cross-project worksite와 `_workspaces/<project>/engineering/profiles/**` | current physical owner: compiled skill asset/project worksite; target semantic owner: 조직 Profile owner / 과제 |
| L3 Effective Rule Set 재료 | (a) `se_stage_expected_artifact_policy_v0` 인스턴스, (b) 엔진 `soulforge.ax_se_stage_policy.v0`의 `stages[].requirements[]`, (c) Needs 정책의 `stages[]`·`needed_artifact_type_id` 어휘 | 실행 시 결정론 생성; payload는 `_workspaces/<project>/engineering/runtime/**`, `_workmeta`에는 ref·hash·status·compact receipt만 | Systems Engineering Domain Compiler Adapter, Core Rule Assembly Interface 뒤(§5) |

원칙: L1은 조직·과제 이름을 모른다. Organization Profile은 project-only 사실을 모르고,
Project Profile만 해당 과제의 적용정책을 안다. L3는 L1+두 Profile delta의 순수 함수다.
L0은 인용 대상이지 실행 입력이 아니다. 실제 source location·관측·Typed Facts는
Project Binding/Adapter seam이 소유하며 규칙 층에 넣지 않는다.

**① 일반 SE 바닥층 착지(2026-08-18 후속, Owner 지적 "1단계가 0항목이면 안 된다")**: 발주처·국가 무관 SE 바닥 체크리스트를 스펙 `assets/SE_FolderTree_GenericSE_Base.md`(support_key `generic_se_base`, 사업유형 `일반SE`)로 만들었다 — NASA NPR 7123.1D 부록 G(검토회의별 진입/성공 기준)·DoD SE Guidebook 2022 §3에서 뽑은 검토회의별 산출물 202행(NASA SE Handbook 6.7은 추출만 되고 아직 행에 미반영; 도출 방법·정정·미결은 skill `references/generic_se_base_derivation_v0.md`, 엔진 전체는 `guild_hall/engineering_engine/manual/`)(+고정 27) = 229 task, 각 행에 `evidence_level: general_se_guidance`, `se_floor: must_have|should_have|context`, `maturity`, 출처 인용. 컴파일러는 `general_se_guidance`를 `present_or_not_applicable`(context floor는 `optional_context`)로 읽고 어휘 30토큰(ConOps·위험관리계획·IMS·안전분석·VCRM·FMECA·매뉴얼 등)을 더했다. ①과 ②는 같은 artifact_type_id로 만나므로 별도 링크 필드 없이 토큰 교집합으로 대응된다. 첫 비교(120_CDR, private receipt `_workmeta/system/reports/se_stage_rules/generic_layer_cdr_compare_20260818.json`): ① 38 / ② 16 / ②+③+④(KVDS) 27, 토큰 공유 9 — ①은 횡단 산출물(SEMP·RTM·TEMP·위험목록·TPM…)을 게이트마다 성숙도별로 반복하고 ②는 생성 게이트에 한 번 적으므로 차이의 상당수는 모델링 차이이며, 다음 조각은 ①↔② 토큰 별칭 정합이다.

**계층의 물리 분리(2026-08-18 후속, Owner 지적 "LIG 계약 항목이 섞이면 재사용 못 한다")**: 스펙 md 한 장(체계개발/LIG/A v0.8)이 원천이지만, 내보내기는 세 벌을 낸다 — ① legacy 통합 `compiled/system_dev_lig_grade_a.json`(145), ② **방사청 공통 기준선** `compiled/system_dev_common_no_grade.json`(131 = prime_contract 항목 제외, 사업유형 공통), ③ **Organization Profile 파일 분리의 legacy 구현 후보** `compiled/overlays/system_dev_lig_grade_a.prime.overlay.json`(14 = prime_contract 항목을 overlay add로). 엔진은 target 의미상 "Domain 공통 기준선 + Organization Profile + Project Profile"로 컴파일한다. current 파일 분리와 120_CDR 27항목 등가 시험은 존재하지만, tracked LIG payload의 public/private classification과 여러 Profile의 개별 identity/base-pin/provenance 보존은 아직 `HOLD`다. 드리프트 가드는 현재 세 벌을 대조한다. 기본 SE 지식(NASA·INCOSE)은 체크리스트 행이 아니라 배경 지식(공통 스타터·authority family general_se_guidance)이다.

## 3. L1 기계 필드 (variant task 항목 확장)

기존 task 항목 `{id, name, desc, term, source, template, is_fixed}`은 유지하고(생성기는 모르는 키를 무시함, `generate_tree.py`는 `.get()`으로만 읽음) 다음을 **선택 필드**로 더한다.

| 필드 | 값 | 뜻 |
| --- | --- | --- |
| `artifact_type_id` | §4 표준어 토큰(예 `hdd`, `srs`, `stp`, `review_minutes_cdr`) | 세 소비자가 공유하는 산출물 식별자. 없으면 컴파일러가 `internal_management` 또는 `unmapped`로 분류 |
| `evidence_level` | `regulation_mandated` \| `guidebook_recommended` \| `prime_contract` \| `internal_management` \| `unstated` | 정본 근거 등급. 규정·훈령·지침 조문 = mandated; 가이드북 산출물 = recommended(2024 가이드북 p.26 "조정 적용 대상"); 발주처 계약 항목(Q/G 게이트) = prime_contract |
| `source_refs` | `[{source_key, locator}]` | 정본 인용(예 `dapa_program_management_rule_law_20260811 제79조②`, `dapa_se_technical_review_guidebook_2024 p.82`) |
| `applies_when` | 조건 토큰(예 `exploratory_skipped`, `sw_included`, `prototype_built`) 또는 생략 | 조건부 항목. 컴파일러는 overlay/과제 조건이 없으면 `present_or_not_applicable`로 낮춘다 |
| `not_applicable_default` | `true`/생략 | 이 사업유형에서 기본 N/A인 항목(과함 처리). N/A 근거는 `source_refs` 또는 overlay 결정 |
| `verification_status` | `source_supported` \| `partially_supported` \| `unsupported` \| `contradicted` \| `unverified` | 정본 대조 결과(`source_verification_v0.md`)의 판정을 그대로 옮긴 값. 재대조 전까지 변경 금지 |
| `purpose_ko` + `purpose_refs` | 200자 이하 한 문장 + `[{source_key, locator}]`(필수) | 정본이 그 산출물의 **목적**을 말한 문장의 압축과 그 위치. 안내 층만 읽고 컴파일러는 키만 검증한다 — 목적은 판정을 바꾸지 않는다. 정본이 말하지 않았으면 **비운다** |

컴파일 매핑: `evidence_level` → `se_stage_expected_artifact_policy_v0.minimum_presence_rule` = mandated→`present`, recommended/prime_contract→`present_or_not_applicable`, internal/unstated→`optional_context`; `not_applicable_default`→`draftability_rule: not_applicable` + `not_applicable_requires: [policy_rule]`.

## 4. 산출물 표준어 (artifact_type_id)

과제 이름 없는 토큰. 첫 판은 2024 가이드북 회의별 INPUT/OUTPUT 표와 규정 별지 명칭에서 뽑는다(전체 목록은 컴파일러의 `artifact_vocabulary.v0`가 소유하고 `SHARED_GLOSSARY_V0.md`에 표시 용어를 동기화한다).

- 요구·설계: `ord`, `roc`, `ssrs`, `sss`, `fci`(기능형상식별서), `dci`(개발형상식별서·국방규격 초안 I), `pci`(제품형상식별서·국방규격 초안 II), `hrs`, `srs`, `irs`, `ssdd`, `hdd`, `sdd`, `idd`, `dbdd`, `icd`, `drawings`, `bom`, `mechanical_model`
- 계획·관리: `semp`, `sdp`, `p_temp`, `temp`, `ms_plan`, `ram_plan`, `interop_plan`, `qa_plan`, `risk_register`, `mid_check_report`(사업중간점검), `registered_parts_plan`, `wbs`
- 시험·평가: `stp`, `std`, `str`, `sps`, `scs`, `dt_plan`, `dt_procedure`, `dt_report`, `ot_plan`, `ot_report`, `test_docs`(시험절차서/성적서 묶음), `ess_test`, `env_test`, `tra_report`, `mra_report`, `fca_plan`, `fca_checklist`, `fca_report`, `pca_plan`, `pca_checklist`, `pca_report`, `spec_linkage_table`(국방규격화연계표), `defense_spec_draft`
- 종결·인계: `dev_result_report`(체계개발결과보고서), `tdp`, `lessons_learned`
- 회의: `review_minutes_<gate>`(srr/sfr/pdr/cdr/trr/fca/pca), `review_result_report_<gate>`
- 내부관리: `inbox`, `log`, `tdp_exchange`(주고받은 기술자료)

토큰은 소문자 스네이크, 정본이 준 약어를 우선한다. 별칭(과제별 폴더명·발주처 명칭)은 L2 Profile 구현 overlay의 `aliases`에만 둔다.

구현 메모(2026-08-18): 컴파일러의 `artifact_vocabulary.v0`는 위 목록 + 체계개발 스펙 v0.8이 쓴 확장 토큰 26개(`cdrl`, `rtm`, `ram_analysis_report`, `critical_parts_test_report`, `cm_plan`, `technical_review_package` …, 스킬 `references/variants.md`)를 갖고, `prime_<...>` 모양의 토큰은 주계약사 계약 항목(family `prime_contract_item`)으로 인식한다(열거 불가·다른 주계약사는 overlay로 N/A). D44 확정 전까지 표시명은 관찰 수준이다. overlay의 `add`는 표준 행이 `optional_context`일 때만 옆에 `prime_contract` 행을 추가할 수 있고(발주처 요구 강화, receipt `overlay_strengthened`), 표준이 이미 요구하는 항목에는 금지된다(D45). `verification_status`는 정본(규정·가이드북) 지지도를 재는 값이므로 `prime_contract` 행에는 `unsupported/unverified`가 기대값이며 강등하지 않는다(`contradicted`만 강등) — 그래야 통합 스펙 경로와 계층 경로가 같은 결과를 낸다.

## 5. Systems Engineering Domain Compiler Adapter (L3 조립)

- 위치: `guild_hall/engineering_engine/stage_rules/`(신규 sibling; kernel 어휘 재사용, 순수 함수, fs/clock/net 0). CLI는 두지 않는다. I/O는 호출자(스크립트·runner)가 한다.
- 입력: `compiled variant JSON`(L1, 스킬 패키지에서 Python `export_variant_json.py`로 생성·tracked, 스펙 md sha 포함) + Organization/Project Profile 구현 `overlay JSON`(L2, 선택) + current compatibility compilation scope(`document_refs`, time, authority, applicability).
- 출력(결정론, digest 포함): (a) `se_stage_expected_artifact_policy_v0` 인스턴스, (b) 엔진 stage policy `stages[].requirements[]`(requirement_id = `<stage>_<artifact_type_id>`, requirement_kind = 산출물 계열, required_capability = 표준 매핑, requirement_ref = 과제가 준 문서 ref), (c) Needs 정책 `stages[]`와 어휘 검사 결과, (d) 영수증(입력 digest·규칙 수·N-A 수·overlay 적용 수·unmapped 수).
- 드리프트 가드: compiled JSON에 스펙 md의 sha256을 넣고, `validate:se-foldertree-compiled`가 md 재파싱 결과와 대조한다(불일치 = 실패).
- overlay 연산: `add`(발주처 요청 산출물 추가, evidence_level=prime_contract, source_ref=요청 문서 exact ref), `mark_not_applicable`(basis 필수), `alias`(과제 슬롯명 ↔ artifact_type_id), `override_evidence`(금지: L1 근거 등급은 overlay가 못 바꾼다), `condition`(applies_when 조건 충족 선언).

Compiler는 Project source body·RAG·ERP·메일을 읽지 않고 evidence 존재를 판정하지 않는다.
Target Project Binding은 Project Adapter가 source snapshot을 Typed Project Facts로 바꾸는
별도 seam이며, Effective Rule Set과 Typed Facts는 Evaluator에서만 만난다. current
`project_binding` arg는 ABI migration 전 compilation scope compatibility field다.

구현 착지 2판(2026-08-18 후속, 실제 출력 검토 후 정정): 검토회의 INPUT 표를 산출물 사이의 인과로 읽어 생긴 거꾸로 된 간선 4개를 지우고, 그 표는 행의 `gate_role`(`core`/`entry`/`supporting`)로 옮겼다. 어휘에 층 대응표(`CROSS_LAYER_TOKEN_EQUIVALENCE` 4쌍)와 `canonicalArtifactType`을 두고 순수 함수 `projectGenericLayerEdges`로 ①의 관계를 활동 하나를 통과해 합성해 ②에 투영했다(52간선/20행, 등급은 `general_se_guidance`를 넘지 않고 행에 `depends_on_origin`으로 표시). 정렬에 게이트 역할과 "뒤에서 몇 개가 쓰는가"를 더해 빈 과제 SRR이 체계요구사항명세서부터 나온다(② 인과 연결 10 → 25). 규정 계열 2종에서 뽑은 선후 문장 60건은 **후보로만** 두고 Owner 확인 시트로 남겼다(어떤 스펙에도 넣지 않음).

구현 착지(2026-08-18, D46 제안대로): 행에 `node_kind`(artifact|activity|decision)·`depends_on`(+`depends_on_refs`/`depends_on_evidence`)·`evidence_record`·`is_virtual`을 더하고, 컴파일러에 순수 함수 `orderStageWork(compileResult, observations?)`(인과 간선과 게이트 순서를 분리 출력, 고리는 `SE_STAGE_RULE_DEPENDENCY_CYCLE`로 거부)와 overlay 연산 `add_dependency`(더하기만, `remove_dependency`는 금지)를 더했다. 어휘 152 토큰(활동 19·결정 3), 간선 206(일반 SE 128·방사청 78, 규정 근거 0). 도출 근거·커버리지·미결은 `.registry/skills/se_foldertree_generate/codex/references/se_io_relations_v0.md`, 엔진 매뉴얼은 02장 §2.5~2.6·03장 §3.7·05장 §5.4A. D46 자체는 여전히 Owner 승인 전 제안이다.

구현 착지(2026-08-18, D47 제안대로 — **D47은 여전히 Owner 승인 전 제안이다**): 컴파일 결과 옆에 안내 층 `guild_hall/engineering_engine/guidance/`를 두었다 — `buildGuideCards`(행마다 왜·언제·무엇을·어떻게·누가 카드, 인용은 `{source_key, locator}`만), `buildInstructionPackets`(`soulforge.engine_instruction_packet.v0`: mission 후보 + 카드 + 맥락 채움, `judgment_ref`로 policy_ref·assessment_handle·requirement_counts를 **복사**), `renderNextStepsAnswer`(위치·부족·다음 할 일·막힌 것). 셋 다 순수 함수이고 판단을 바꾸지 않으며, 한국어 문장은 고정 틀에서만 나온다(모델 호출 0). 호출자는 CLI 하나(`tools/engine_next_steps_runner.mjs`, create-only). 시험 42(`npm run validate:se-guidance`), fixture `examples/se_stage_rules/next_steps_synthetic_v0.json`. 첫 실측은 private pilot 030_SRR·120_CDR 답 1회(카드 22·28, 지시서 3·3).

구현 착지 2판(2026-08-19, 첫 답 검토 후): 카드의 "왜"가 근거 등급·기대 상태·정본 대조 결과 세 문장뿐이어서 인용은 있는데 이유가 없었다. 행에 정본이 말한 목적 `purpose_ko`(≤200자, 인용 위치 `purpose_refs` 필수, 컴파일러는 키만 검증하고 읽지 않음)를 더하고, 카드가 규칙표 역방향에서 "없으면 뒤의 무엇이 막히나"와 행의 `gate_role`을 계산해 목적 앞뒤에 붙인다. "어떻게"에는 입력별 관측 상태(있음/없음/불명), 양식 라이브러리에서 찾은 양식 파일의 **라이브러리 상대** 참조, 카탈로그가 말한 근거 계열(규정·가이드북·실무지침서·일반SE)이 더해진다. 문장은 여전히 고정 틀에서만 나오고 판단은 바뀌지 않는다(KVDS 재실행에서 판정 handle 동일). 도출은 `.registry/skills/se_foldertree_generate/codex/references/artifact_purpose_derivation_v0.md`, 매뉴얼 03장 §3.10·11장 §11.10, 시험 55.

## 6. 사업유형 라우팅

- 3키(사업유형·발주처·품질등급)로 variant 선택 — 폴더트리 스킬의 support_key와 동일. 매핑표는 스킬 `references/variants.md`가 소유.
- 2026-08-18 대조 결과 반영: `체계개발`은 spine 부합(필수 17건 보강 필요), `탐색개발`·`선행연구`는 재기준 후에만 L1로 승격(그 전엔 `verification_status: unverified` 유지 → 컴파일러는 `optional_context`로 낮춘다), `운용연구개발`은 트랙(경미 성능개량/현존전력) 분리, `응용연구`는 제안 v2를 draft variant로 등록.

## 7. Private pilot 적용 순서 (검증용, 승인 후)

1. 체계개발 variant에 기계 필드 부여(체계개발만 먼저) + 필수 17건을 `evidence_level: regulation_mandated`로 추가한 v0.8 스펙 → compiled JSON.
2. overlay 1장: 08-08 발주처 CDR 요청 14슬롯을 `alias`/`add`로 표현(요구 근거 = 요청 메일·SOW exact ref).
3. 컴파일러로 120_CDR 엔진 stage policy를 생성 → run-02 packet의 policy와 diff(무엇이 표준에서 왔고 무엇이 발주처 추가인지 표시) → zero-write runner 1회.
4. Needs 정책 후보(2026-08-18)의 `needed_artifact_type_id`를 표준어로 치환.

## 8. Owner 결정 항목

| ID | 결정 | 제안 기본값 |
| --- | --- | --- |
| D42 | L1 기계 필드를 variant 스펙 md에 직접 넣을지(단일 원천) vs 사이드카 | 직접(단일 원천). 생성기는 모르는 키 무시 |
| D43 | 탐색개발·선행연구 재기준 스펙의 승격 시점 | draft variant로 먼저, 실제 과제 1건 검증 후 승격 |
| D44 | 표준어(artifact_type_id) 소유자 | 컴파일러의 `artifact_vocabulary.v0` + 글로서리 표시명 |
| D45 | overlay가 evidence_level을 낮추는 것 허용 여부 | 금지(N/A는 가능, 등급 변경 불가) |
| D46(제안 2026-08-18) | 규칙 행의 종류 확장 — 산출물(문서)만이 아니라 활동·결정 노드(예: PBS 확정, 기능분석, 트레이드 스터디, 기본설계, 리서치, 이해관계자 확인)를 같은 표에 두고 선후 관계(depends_on)를 붙일지 | 확장. `node_kind: artifact|activity|decision`, 활동·결정의 증거는 기록(회의록·결정 기록·산출물)이며 판정 어휘는 그대로(satisfied/gap_missing/gap_unknown), 어휘에 activity/decision 계열 추가, 컴파일러가 depends_on으로 순서 계산 |
| D47(제안 2026-08-18) | 엔진 mission 후보를 서브 에이전트가 읽는 지시서(무엇을·왜·입력·산출·근거·담당·기한) 계약의 owner | 엔진 owner의 별도 계약(`instruction_packet_v0`, zero-write). 지시서 = mission 후보 + 가이드 카드(정본 인용) + 맥락 채움(기한·담당·사연); 판단을 바꾸지 않음 |

## 9. 완료 기준 (첫 조각)

1. 체계개발 variant compiled JSON 생성·드리프트 가드 통과
2. 컴파일러 순수 함수 + 합성 fixture 테스트, `npm run validate:se-stage-rules` 통과
3. KVDS 120_CDR: 컴파일 결과와 run-02 policy 14슬롯의 대응표(표준 유래/발주처 추가/누락) 산출, runner 1회 PASS
4. Needs 정책 후보의 산출물 ID가 표준어로 치환됨
5. 이 문서·스킬 README·CHANGELOG·로드맵 delta 동기화
