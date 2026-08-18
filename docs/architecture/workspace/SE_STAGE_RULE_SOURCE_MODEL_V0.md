# SE Stage Rule Source Model v0 — 단계 규칙의 단일 원천

- 상태: `DRAFT` / `canon_candidate` / `claim_ceiling: observed`
- 작성: Claude Fable 5 (2026-08-18) · Owner 승인 전
- 관계: `SE_DUNGEON_STAGE_MODEL_V0.md`(단계·boss clear 의미), `PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`(요구 커버리지·Needs 정책, D38), `.registry/skills/se_foldertree_generate/`(사업유형별 폴더트리 variant), `.workflow/se_stage_artifact_gap_scan_v0/`(`se_stage_expected_artifact_policy_v0`), `guild_hall/engineering_engine/`(`soulforge.ax_se_stage_policy.v0`). 모순 시 기존 정본이 이긴다.
- Owner 질문(2026-08-18): "폴더트리는 체계개발 기준의 최대치인데, 응용연구·탐색·체계 단계마다 다를 텐데 엔진이 구분할 수 있나? 폴더트리를 참고만 할까, 엔진이 다시 만들까, KVDS는 체계사업이니 그대로 쓸까?" — 이 문서는 그 질문에 대한 구조 답변이다.

---

## 1. 한 줄 결정

> **단계 규칙(어느 단계에 어떤 산출물이 있어야 하나)의 원천은 하나다 — 사업유형별 폴더트리 variant 스펙.** 엔진은 그것을 새로 만들지 않고 **읽는다.** 과제 차이는 **덧씌움(overlay)** 한 장으로만 표현하고, 세 소비자(폴더 생성 · 엔진 판단 · Needs 정책)는 같은 컴파일 결과를 쓴다.

근거: (1) 원천이 둘이면 어긋난다(현재 KVDS 엔진 슬롯 14개는 발주처 요청 메일에서, 폴더트리는 방사청 문서에서 왔고 서로 모름). (2) 폴더트리 variant는 이미 사업유형(선행연구·탐색개발·체계개발·운용연구개발) × 발주처 × 품질등급 3키로 갈라져 있고, 항목마다 출처(source)를 적는 자리가 있다. (3) 2026-08-18 정본 대조(`references/source_verification_v0.md`)로 체계개발 variant는 규정 spine과 부합함이 확인됐고, 나머지는 재기준 대상이 특정됐다.

## 2. 네 층

| 층 | 무엇 | 저장 | 소유 |
| --- | --- | --- | --- |
| L0 정본 근거 | 방사청·국방부 규정·훈령·지침·가이드북 원문과 파생 텍스트, intake 영수증 | `_workspaces/knowledge/common/**`(원문·파생) + `_workmeta/system/reports/source_research/**`(영수증) | 지식 라이브러리 |
| L1 표준 규칙표 | 사업유형별 **variant 스펙**의 gate/task 항목에 기계 필드(§3)를 더한 것 = "이 사업유형의 이 단계에는 이 산출물" | `.registry/skills/se_foldertree_generate/codex/assets/*.md`(스펙 YAML) → 컴파일 JSON `codex/assets/compiled/<support_key>.json` | 폴더트리 스킬(정본) |
| L2 과제 덧씌움 | 발주처 요청·SOW/CDRL·계약 품질게이트·과제 결정에 따른 추가/삭제/N-A/별칭 | 과제 metadata plane(`_workmeta/<project>/runs/<run>/binding/stage_rule_overlay.json`) | 과제 |
| L3 컴파일 산출 | (a) `se_stage_expected_artifact_policy_v0` 인스턴스, (b) 엔진 `soulforge.ax_se_stage_policy.v0`의 `stages[].requirements[]`, (c) Needs 정책의 `stages[]`·`needed_artifact_type_id` 어휘 | 실행 시 생성(결정론), 필요 시 과제 plane에 create-only 저장 | 엔진 컴파일러(§5) |

원칙: L1은 과제 이름을 모른다. L2만 과제를 안다. L3는 L1+L2의 순수 함수다. L0은 인용 대상이지 실행 입력이 아니다.

**① 일반 SE 바닥층 착지(2026-08-18 후속, Owner 지적 "1단계가 0항목이면 안 된다")**: 발주처·국가 무관 SE 바닥 체크리스트를 스펙 `assets/SE_FolderTree_GenericSE_Base.md`(support_key `generic_se_base`, 사업유형 `일반SE`)로 만들었다 — NASA NPR 7123.1D 부록 G(검토회의별 진입/성공 기준)·DoD SE Guidebook 2022 §3에서 뽑은 검토회의별 산출물 202행(NASA SE Handbook 6.7은 추출만 되고 아직 행에 미반영; 도출 방법·정정·미결은 skill `references/generic_se_base_derivation_v0.md`, 엔진 전체는 `guild_hall/engineering_engine/manual/`)(+고정 27) = 229 task, 각 행에 `evidence_level: general_se_guidance`, `se_floor: must_have|should_have|context`, `maturity`, 출처 인용. 컴파일러는 `general_se_guidance`를 `present_or_not_applicable`(context floor는 `optional_context`)로 읽고 어휘 30토큰(ConOps·위험관리계획·IMS·안전분석·VCRM·FMECA·매뉴얼 등)을 더했다. ①과 ②는 같은 artifact_type_id로 만나므로 별도 링크 필드 없이 토큰 교집합으로 대응된다. 첫 비교(120_CDR, private receipt `_workmeta/system/reports/se_stage_rules/generic_layer_cdr_compare_20260818.json`): ① 38 / ② 16 / ②+③+④(KVDS) 27, 토큰 공유 9 — ①은 횡단 산출물(SEMP·RTM·TEMP·위험목록·TPM…)을 게이트마다 성숙도별로 반복하고 ②는 생성 게이트에 한 번 적으므로 차이의 상당수는 모델링 차이이며, 다음 조각은 ①↔② 토큰 별칭 정합이다.

**계층의 물리 분리(2026-08-18 후속, Owner 지적 "LIG 계약 항목이 섞이면 재사용 못 한다")**: 스펙 md 한 장(체계개발/LIG/A v0.8)이 원천이지만, 내보내기는 세 벌을 낸다 — ① 전체 `compiled/system_dev_lig_grade_a.json`(145), ② **방사청 공통 기준선** `compiled/system_dev_common_no_grade.json`(131 = prime_contract 항목 제외, 사업유형 공통), ③ **발주처 덧씌움** `compiled/overlays/system_dev_lig_grade_a.prime.overlay.json`(14 = prime_contract 항목을 overlay add로). 엔진은 "공통 기준선 + 발주처 덧씌움 + 과제 덧씌움"으로 컴파일하며, 같은 입력에서 ①+과제 덧씌움과 ②+③+과제 덧씌움은 동일 결과를 낸다(KVDS 120_CDR 27항목 동일 확인). 드리프트 가드는 세 벌 모두 대조한다. 기본 SE 지식(NASA·INCOSE)은 체크리스트 행이 아니라 배경 지식(공통 스타터·authority family general_se_guidance)이다.

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

컴파일 매핑: `evidence_level` → `se_stage_expected_artifact_policy_v0.minimum_presence_rule` = mandated→`present`, recommended/prime_contract→`present_or_not_applicable`, internal/unstated→`optional_context`; `not_applicable_default`→`draftability_rule: not_applicable` + `not_applicable_requires: [policy_rule]`.

## 4. 산출물 표준어 (artifact_type_id)

과제 이름 없는 토큰. 첫 판은 2024 가이드북 회의별 INPUT/OUTPUT 표와 규정 별지 명칭에서 뽑는다(전체 목록은 컴파일러의 `artifact_vocabulary.v0`가 소유하고 `SHARED_GLOSSARY_V0.md`에 표시 용어를 동기화한다).

- 요구·설계: `ord`, `roc`, `ssrs`, `sss`, `fci`(기능형상식별서), `dci`(개발형상식별서·국방규격 초안 I), `pci`(제품형상식별서·국방규격 초안 II), `hrs`, `srs`, `irs`, `ssdd`, `hdd`, `sdd`, `idd`, `dbdd`, `icd`, `drawings`, `bom`, `mechanical_model`
- 계획·관리: `semp`, `sdp`, `p_temp`, `temp`, `ms_plan`, `ram_plan`, `interop_plan`, `qa_plan`, `risk_register`, `mid_check_report`(사업중간점검), `registered_parts_plan`, `wbs`
- 시험·평가: `stp`, `std`, `str`, `sps`, `scs`, `dt_plan`, `dt_procedure`, `dt_report`, `ot_plan`, `ot_report`, `test_docs`(시험절차서/성적서 묶음), `ess_test`, `env_test`, `tra_report`, `mra_report`, `fca_plan`, `fca_checklist`, `fca_report`, `pca_plan`, `pca_checklist`, `pca_report`, `spec_linkage_table`(국방규격화연계표), `defense_spec_draft`
- 종결·인계: `dev_result_report`(체계개발결과보고서), `tdp`, `lessons_learned`
- 회의: `review_minutes_<gate>`(srr/sfr/pdr/cdr/trr/fca/pca), `review_result_report_<gate>`
- 내부관리: `inbox`, `log`, `tdp_exchange`(주고받은 기술자료)

토큰은 소문자 스네이크, 정본이 준 약어를 우선한다. 별칭(과제별 폴더명·발주처 명칭)은 L2 overlay의 `aliases`에만 둔다.

구현 메모(2026-08-18): 컴파일러의 `artifact_vocabulary.v0`는 위 목록 + 체계개발 스펙 v0.8이 쓴 확장 토큰 26개(`cdrl`, `rtm`, `ram_analysis_report`, `critical_parts_test_report`, `cm_plan`, `technical_review_package` …, 스킬 `references/variants.md`)를 갖고, `prime_<...>` 모양의 토큰은 주계약사 계약 항목(family `prime_contract_item`)으로 인식한다(열거 불가·다른 주계약사는 overlay로 N/A). D44 확정 전까지 표시명은 관찰 수준이다. overlay의 `add`는 표준 행이 `optional_context`일 때만 옆에 `prime_contract` 행을 추가할 수 있고(발주처 요구 강화, receipt `overlay_strengthened`), 표준이 이미 요구하는 항목에는 금지된다(D45). `verification_status`는 정본(규정·가이드북) 지지도를 재는 값이므로 `prime_contract` 행에는 `unsupported/unverified`가 기대값이며 강등하지 않는다(`contradicted`만 강등) — 그래야 통합 스펙 경로와 계층 경로가 같은 결과를 낸다.

## 5. 컴파일러 (L3)

- 위치: `guild_hall/engineering_engine/stage_rules/`(신규 sibling; kernel 어휘 재사용, 순수 함수, fs/clock/net 0). CLI는 두지 않는다. I/O는 호출자(스크립트·runner)가 한다.
- 입력: `compiled variant JSON`(L1, 스킬 패키지에서 Python `export_variant_json.py`로 생성·tracked, 스펙 md sha 포함) + `overlay JSON`(L2, 선택) + `document refs`(요구 근거 exact ref).
- 출력(결정론, digest 포함): (a) `se_stage_expected_artifact_policy_v0` 인스턴스, (b) 엔진 stage policy `stages[].requirements[]`(requirement_id = `<stage>_<artifact_type_id>`, requirement_kind = 산출물 계열, required_capability = 표준 매핑, requirement_ref = 과제가 준 문서 ref), (c) Needs 정책 `stages[]`와 어휘 검사 결과, (d) 영수증(입력 digest·규칙 수·N-A 수·overlay 적용 수·unmapped 수).
- 드리프트 가드: compiled JSON에 스펙 md의 sha256을 넣고, `validate:se-foldertree-compiled`가 md 재파싱 결과와 대조한다(불일치 = 실패).
- overlay 연산: `add`(발주처 요청 산출물 추가, evidence_level=prime_contract, source_ref=요청 문서 exact ref), `mark_not_applicable`(basis 필수), `alias`(과제 슬롯명 ↔ artifact_type_id), `override_evidence`(금지: L1 근거 등급은 overlay가 못 바꾼다), `condition`(applies_when 조건 충족 선언).

## 6. 사업유형 라우팅

- 3키(사업유형·발주처·품질등급)로 variant 선택 — 폴더트리 스킬의 support_key와 동일. 매핑표는 스킬 `references/variants.md`가 소유.
- 2026-08-18 대조 결과 반영: `체계개발`은 spine 부합(필수 17건 보강 필요), `탐색개발`·`선행연구`는 재기준 후에만 L1로 승격(그 전엔 `verification_status: unverified` 유지 → 컴파일러는 `optional_context`로 낮춘다), `운용연구개발`은 트랙(경미 성능개량/현존전력) 분리, `응용연구`는 제안 v2를 draft variant로 등록.

## 7. KVDS(P26-014) 적용 순서 (검증용, 승인 후)

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

## 9. 완료 기준 (첫 조각)

1. 체계개발 variant compiled JSON 생성·드리프트 가드 통과
2. 컴파일러 순수 함수 + 합성 fixture 테스트, `npm run validate:se-stage-rules` 통과
3. KVDS 120_CDR: 컴파일 결과와 run-02 policy 14슬롯의 대응표(표준 유래/발주처 추가/누락) 산출, runner 1회 PASS
4. Needs 정책 후보의 산출물 ID가 표준어로 치환됨
5. 이 문서·스킬 README·CHANGELOG·로드맵 delta 동기화
