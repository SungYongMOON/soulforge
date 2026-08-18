# 02. 규칙의 네 층

## 2.1 왜 네 층인가

"이 단계에 이 산출물이 있어야 한다"는 규칙은 출처가 다르다. 출처가 다른 것을 한 표에 섞으면 (a) 다른 발주처·다른 나라 과제에 재사용할 수 없고,
(b) 결손이 나왔을 때 "규정 위반인지, 발주처 요청 미이행인지, 그냥 좋은 관행 미달인지"를 구분할 수 없다.
그래서 출처별로 물리적으로 다른 파일에 두고 컴파일러가 합친다.

| 층 | 뜻 | 파일 | 행 수(2026-08-18) | 근거 |
| --- | --- | --- | --- | --- |
| **① 일반 SE 기준선** | 발주처·국가 무관. "체계공학 기반으로 개발한다면 각 기술검토 전에 최소한 이건 만들어 둬라" | `assets/SE_FolderTree_GenericSE_Base.md` → `compiled/generic_se_base.json` | 202행(9게이트, +고정 27 = 229 task), 산출물 종류 100 | NASA NPR 7123.1D 부록 G, DoD SE Guidebook 2022 §3 (NASA SE Handbook은 추출만, 미반영) |
| **② 국가 조달 공통(방사청·국방부)** | 한국 방위사업 체계개발이면 사업·발주처와 무관하게 요구되는 것 | `assets/SE_FolderTree_Guide.md` v0.8의 prime_contract 아닌 행 → `compiled/system_dev_common_no_grade.json` | 107행(8게이트, +고정 24 = 131 task): 규정 필수 35 · 가이드북 권고 46 · 근거 미표기 22 · 내부관리 4 | 방위사업관리규정·SE 가이드북·기술검토회의 가이드북 등 정본 13종(대조표 `references/source_verification_v0.md`) |
| **③ 발주처(주계약사) 덧씌움** | 특정 주계약사 계약·품질 지침이 추가로 요구하는 것 | `compiled/overlays/system_dev_lig_grade_a.prime.overlay.json` (같은 스펙 v0.8의 `evidence_level: prime_contract` 행 14개를 exporter가 `add` op로 뽑아냄) | 14 op | 주계약사 개발품질 지침(계약 문서) |
| **④ 과제 덧씌움** | 이 과제만의 별칭·추가·조건 | private: `_workspaces/<project>/…/06_validation/stage_rules_<date>/overlay.json` | P26-014 120_CDR: 24 op(별칭 14 · 추가 9 · 조건 1) | 발주처 요청 메일·SOW(과제 원문) |

탐색개발·운용연구개발·선행연구 기본형(`*_Basic.md`, 각 35행)은 체계개발 명명틀을 빌린 **미검증 초안**이다(D43: 실제 과제 1건 검증 전 승격 금지). 응용연구는 제안 v2만 있다.

## 2.2 층은 어떻게 합쳐지나

컴파일러(`compileStageRules`)는 `compiled_variant`(①이든 ②든 하나) + `overlay`(③·④ op 목록을 이어 붙인 것) + `project_binding`을 받는다.

- overlay op는 네 가지뿐: `add`(행 추가) · `alias`(과제 이름→표준어) · `mark_not_applicable`(N/A, 근거 필요) · `condition`(조건 토큰, 예 `sw_included`).
- overlay는 evidence level을 **올리거나 바꾸지 못한다**(D45). `add`는 표준 행이 `optional_context`일 때만 옆에 `prime_contract` 행을 둘 수 있고(발주처 요구 강화, 영수증 `overlay_strengthened`), 표준이 이미 요구하는 항목에는 거부된다.
- 등가성 증명(2026-08-18): "통합 스펙(②+③이 한 파일) 컴파일" 결과와 "② 공통 + ③ overlay 컴파일" 결과가 P26-014 120_CDR에서 **같은 27개 엔진 요구**를 낸다. 이 검사가 깨지면 exporter나 컴파일러의 약화 규칙이 어긋난 것이다.
- ①과 ②는 별도 링크 필드 없이 **같은 `artifact_type_id`**로 만난다. 지금은 토큰이 다른 쌍(예 `p_temp`↔`temp`, `spec_linkage_table`↔`rtm`)이 있어 별칭 정합이 다음 조각이다(09장).

## 2.3 한 단계(120_CDR)로 본 숫자

| 조합 | 엔진 요구 수 | 비고 |
| --- | --- | --- |
| ① 만 | 38 | 횡단 산출물(SEMP·RTM·TEMP·위험목록·TPM…)을 게이트마다 반복 계수 |
| ② 만 | 16 | 생성 게이트에 한 번만 기재 |
| ②+③+④ (P26-014) | 27 | 표준 16 중 5는 발주처 슬롯과 일치, 규정 필수 6은 발주처 미요청, 발주처 추가 9 |
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
