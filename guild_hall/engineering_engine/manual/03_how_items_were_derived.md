# 03. 항목(체크리스트 행)은 어떻게 구했나

이 장은 Owner 요구("항목을 어떤 식으로 구했는지·산출했는지·만들었는지가 기록에 있어야 한다")에 답한다.
층마다 방법이 다르므로 층별로 적고, 마지막에 모든 층에 공통인 규칙(세는 법·인용 형식·근거 등급 부여·어휘 발행)을 적는다.

## 3.0 공통 파이프라인 (모든 층이 같은 순서를 따른다)

```text
S0 정본 확보     공개 원문 다운로드 → 공통 지식 라이브러리 intake(해시·영수증) → 텍스트 추출(PDF: PyMuPDF, 스캔본: OCR kor+eng, HWP: HWPX 정규화)
S1 사실 추출     정본 1종당 리더 1개(병렬): "어느 검토/단계에서 어떤 산출물을 요구하는가"를 조·표·페이지 단위로 JSON 추출. 원문 문장은 짧은 근거만
S2 합성/대조     리더 결과를 게이트 코드에 매핑하고 산출물 행으로 합침(①) 또는 기존 variant 행과 대조해 판정(②③)
S3 비판 검토     독립 critic이 스팟체크(인용 재독)·위험 목록 → 정정 지시
S4 스펙 반영     코더(격리 worktree)가 스펙 md(YAML)에 행·기계 필드·인용을 쓰고 exporter로 compiled JSON 재생성, 컴파일러·어휘·시험 갱신
S5 검증          --check(스펙↔compiled 드리프트), validate:se-stage-rules, validate:se-foldertree-compiled, dry-run 생성, 실제 과제 1건 컴파일·비교
```

- 매 단계의 산출은 남긴다: S0 영수증은 `_workmeta/system/reports/source_research/<intake>/`, S1~S3 작업 파일은
  `_workspaces/knowledge/common/systems_engineering/derivations/<layer>_<date>/`(private worksite, 영수증은 `_workmeta/system/reports/se_stage_rules/`),
  S4 결과는 public 스펙·compiled·references 문서, S5 결과는 시험·private 비교 영수증.
- 정본 원문·긴 인용·절대경로는 public 파일에 넣지 않는다. public 문서의 인용은 `약칭 제N조`, `Table G-4`, `p.38 §5.2.2.2.b [SE-39]`처럼 **위치만**.

## 3.1 ② 국가 조달 공통(방사청·국방부) — "있던 표를 정본으로 검증하고, 빠진 필수를 채웠다"

출발점은 이미 운영 중이던 체계개발 폴더트리 스펙(`SE_FolderTree_Guide.md` v0.7, 128 task)이다. 이 표는 실무 경험과 발주처 요청으로 만들어져 있었고 근거 표기가 없었다.

1. **정본 확보(S0)**: 방위사업관리규정(훈령 981호)·국방전력발전업무훈령·국방 총수명주기관리 업무훈령·현존전력 성능극대화 업무지침·무기체계 RAM 업무지침·SE기반 기술검토회의 가이드북(2017, 2024 OCR)·SE 기술관리 실무지침서·국방 표준화 실무지침서·시험평가 가이드북(2012, 2013 OCR)·선행연구 수행지침(881호)·국방기술 연구개발 업무처리지침(974호) = **13종**. 법령센터 행정규칙 텍스트와 방위사업청 공개 PDF. 별표·별지 본문이 파생 텍스트에 없는 것이 공통 한계(대조표 §1에 원문별 읽기 한계 기록).
2. **사실 추출(S1)**: 리더 10건이 정본별로 "사업유형·단계·게이트별 요구 산출물"을 조번호·페이지 단위로 추출.
3. **대조(S2)**: comparer 4건이 variant 4종(체계개발·탐색개발·선행연구·운용연구개발)의 task 행마다 판정 부여 —
   `source_supported`(같은 명칭·같은 게이트에 명시) / `partially_supported`(실체는 있으나 명칭·시점·주체가 다르거나 점검기준으로만 존재) /
   `unsupported`(어느 정본에도 없음 — 대개 주계약사 계약 항목) / `internal_management`(INBOX/LOG/TDP) / `contradicted`(0건) /
   `missing_required`(정본은 요구하나 슬롯이 없음). mandatory 등급은 mandatory/conditional/recommended/proposed/unstated.
   결과 정본: `references/source_verification_v0.md`(+ 같은 데이터 JSON). 체계개발 v0.7: 지원 60·부분 30·미지원 14·내부관리 24·**빠진 필수 17**.
4. **비판 검토(S3)**: 스팟체크에서 조번호 오인 1건(제47조→제49조) 발견 → 규칙: 새 정본 인용은 본문 재독으로 조번호 확정.
5. **스펙 반영(S4)**: v0.7 → **v0.8**: 빠진 필수 17건 추가(ICD·사업중간점검·MRA·RAM 분석·핵심부품 성적서·검토회의록 등), 모든 task에 기계 필드 부여 —
   `artifact_type_id`(표준어), `evidence_level`(regulation_mandated 35 / guidebook_recommended 46 / prime_contract 14 / unstated 22 / internal_management 4),
   `source_refs[{source_key, locator}]`, `verification_status`(위 판정), `applies_when`(조건 토큰, 예 `sw_included`), `added_by_verification`(날짜).
   evidence_level 부여 규칙: 규정·훈령이 수행·제출·확정을 지시하면 `regulation_mandated`; 가이드북·실무지침서 권고만 있으면 `guidebook_recommended`;
   주계약사 계약·품질지침 항목이면 `prime_contract`; 어느 정본도 말하지 않으면 `unstated`(약화됨). 근거를 **추정으로 올리지 않는다**.
6. **분리(S4 후속)**: exporter가 같은 스펙에서 `prime_contract` 아닌 행 → `compiled/system_dev_common_no_grade.json`(② 공통 기준선 107행+고정 24),
   `prime_contract` 행 14개 → `compiled/overlays/system_dev_lig_grade_a.prime.overlay.json`(③, `add` op·source_ref=스펙 md exact ref·`extends`=공통 키+스펙 sha).
   컴파일러는 통합 스펙 경로와 계층 경로가 같은 결과를 내도록 `prime_contract` 행의 `unsupported`를 강등하지 않는다(P26-014 CDR 27=27 확인).
7. **탐색·선행·운용·응용**: 대조 결과 탐색개발·선행연구 기본형은 체계개발 명명틀을 차용해 **재기준 필요**(선행연구는 881호로 회의체·산출물 재기준 초안 §10), 운용연구개발은
   "체계개발 준용형 성능개량"과 "현존전력 성능극대화형" 트랙 분리 필요, 응용연구는 어떤 정본도 SRR~PCA를 요구하지 않아 제안 v2(게이트 7·항목 56)만 둠. 승격은 D43.

## 3.2 ③ 발주처(주계약사) 덧씌움 — "표에서 계약 항목만 골라냈다"

- 항목의 출처는 주계약사 개발품질 지침·계약 데이터 요구(계약 문서). 대조에서 `unsupported`로 판정된 행이 대부분 여기에 해당하며, 그 행에는 `evidence_level: prime_contract`를 붙였다(결함이 아니라 계약 항목).
- 새로 조사한 것이 아니라 v0.8 스펙에 이미 있던 14행을 **exporter가 기계적으로 분리**한 것이다(3.1의 6). 사람이 고른 항목 목록은 스펙의 `evidence_level: prime_contract` 표시가 정본이다.
- 토큰은 `prime_<...>`(예 `prime_q1_contract_data_review`)로 발행해 다른 주계약사 과제에서는 overlay로 N/A 처리할 수 있게 했다(04장).

## 3.3 ④ 과제 덧씌움(P26-014, 120_CDR) — "발주처 요청 메일의 슬롯을 표준어로 번역했다"

- 입력: 발주처가 CDR 앞에 요청한 산출물 슬롯 14개(요청 메일·SOW, private).
- 방법: 슬롯마다 표준 행과 대조 → 표준과 같으면 `alias`(과제 이름→`artifact_type_id`), 표준이 `optional_context`인데 발주처가 요구하면 `add`(강화), 표준에 없는 계약 항목이면 `add`, SW 포함 여부 같은 조건은 `condition`.
  결과 24 op(별칭 14·추가 9·조건 1). 발주처 슬롯 14 = 표준 5·강화 2·추가 7. 발주처가 요청하지 않은 표준 11 중 규정 필수 6(ICD·사업중간점검·MRA·RAM 분석·핵심부품 성적서·CDR 회의록)이 남아 엔진 요구는 27이 된다.
- 여기서 실측한 사실: "발주처 메일 기반 슬롯(14)"과 "정본 기반 표준(25~27)"은 다르다. 그래서 규칙 원천을 하나(스펙)로 통일하고 발주처 요청은 얇은 overlay로 두기로 했다.

## 3.4 ① 일반 SE 기준선 — "정본 3종에서 검토회의별 산출물을 새로 뽑아 합성했다"

Owner 지적: "1층이 0항목이면 안 된다. 체계공학 기반으로 엔지니어링을 한다면 적어도 이 정도는 만들어 놔야 한다는 게 체크리스트에 있어야 한다."

1. **정본 확보(S0)**: NASA NPR 7123.1D(2023) 5장·부록 F·G, DoD Systems Engineering Guidebook(2022) §3, NASA SE Handbook SP-2016-6105 Rev2 — 공개 PDF 다운로드 → intake 영수증 `generic_se_sources_intake_20260818` → PyMuPDF 파생 텍스트(page 마커).
2. **사실 추출(S1)**: 리더 3개 병렬. 검토회의(SRR/SDR/PDR/CDR/TRR/SAR/ORR/PRR…)별 진입·성공 기준에 나온 산출물, 횡단 산출물, 테일러링 규칙을 표 번호·페이지 단위 JSON으로. 결과 `src_*.json` 3개.
3. **합성(S2)**: 합성기 1개. 검토회의 → 엔진 게이트 코드 매핑(DoD SFR+NASA MDR/SDR→060, NASA PRR·DoD PRR→210, NASA SAR→180, ORR→180/210 분할, DoD TRR 본문 없음→150은 NASA G-9/G-10).
   **바닥 규칙(`se_floor`)**: `must_have` = 두 출처가 그 게이트 산출물로 모두 열거 또는 NASA required(`**`) 표기; `should_have` = 한 출처만 또는 권고/상태 수준; `context` = 발주처 소유 입력·임무 특화·어휘 자리표.
   횡단 산출물(SEMP·위험목록·RTM·IMS·TRA·TPM·ICD·TEMP/VCRM·통합계획·ILS·보안·안전분석)은 게이트마다 기대 성숙도(preliminary/updated/baseline/final)와 함께 반복 기재. 임무 전용(발사장·폐기·유인등급·RF 인증 등)은 제외.
   결과 202행 + 어휘 추가 제안 30 + notes. **알려진 결함**: 합성기 입력이 잘려 NASA SE Handbook 추출은 반영되지 못했다(행의 인용은 NPR·DoD SEG 둘뿐).
4. **비판 검토(S3)**: 스팟체크 10건 전부 확인, 위험 7건 → 정정: IMS는 SRR preliminary·PDR baseline, 단일 출처 항목은 must_have 금지, [SE-39]/[SE-66] 페이지 p.38, 제조계획은 G-6/G-7 분리 인용, NASA 전용 항목은 partially_supported로 표시. 미검증 하위 인용 2건은 미결로 남김.
5. **스펙 반영(S4)**: 코더 1개가 스펙 `SE_FolderTree_GenericSE_Base.md`(support_key `generic_se_base`, 사업유형 `일반SE/공통/없음`) 작성 — 9게이트, 행마다 `artifact_type_id`·`evidence_level: general_se_guidance`·`se_floor`·`maturity`·`source_refs`·`verification_status`(두 출처=source_supported, 한 출처=partially_supported, unverified 없음).
   컴파일러에 `general_se_guidance → present_or_not_applicable`(context floor는 optional_context) 추가, 어휘 30 토큰 등록, generate_tree 변형 등록.
6. **검증(S5)**: export/--check, `validate:se-stage-rules` 35/35, dry-run 생성, 120_CDR 비교(① 38 / ② 16 / P26-014 27, 공유 9).
7. **행별 인용·정정·미결 전체**: `references/generic_se_base_derivation_v0.md`(compiled JSON에서 스크립트로 생성). 작업 파일 원본: `_workspaces/knowledge/common/systems_engineering/derivations/generic_se_base_20260818/`(영수증 `_workmeta/system/reports/se_stage_rules/generic_se_base_derivation_20260818.json`).

## 3.5 세는 법 — "202행"이 뜻하는 것

- 행(row) = (게이트, 산출물 종류, 기대 성숙도) 한 칸. 문서 종류가 아니다.
- ①: 202행이지만 서로 다른 산출물 종류는 **100개**(must_have만 67개). 한 게이트에서 실제로 점검할 행은 평균 약 25개다. SEMP·RTM·IMS·위험목록·TEMP 같은 횡단 문서는 게이트마다 다시 나오므로 행 수가 부푼다 — 이것은 "게이트마다 그 문서의 성숙도를 점검하겠다"는 의도이지 중복이 아니다.
- ②: 131 task 중 고정 폴더 24를 빼면 107행이고, 한 산출물은 대개 생성 게이트에 한 번만 있다. 그래서 ①과 ②의 행 수는 직접 비교하면 안 되고, 같은 게이트·같은 토큰으로 맞춘 뒤(별칭 정합) 비교해야 한다.
- 엔진 요구(engine requirement) = 컴파일 뒤 `optional_context`가 아닌 행. ①의 must_have·should_have는 둘 다 엔진 요구가 되고 차이는 표시용으로만 남는다.

## 3.6 공통 규칙 (새 층·새 정본을 더할 때도 같다)

1. 정본 없이 행을 만들지 않는다. 경험·추정으로 만든 행은 `unstated`로 두고 컴파일러가 약화시킨다.
2. 인용은 위치만(조번호·표 번호·페이지). 스팟체크에서 페이지·조번호는 본문 재독으로 확정한다.
3. 근거 등급은 올리지 않는다: 한 출처=partially_supported, 두 출처 또는 required 표기=source_supported. overlay는 등급을 바꾸지 못한다(D45).
4. 어휘 토큰은 어휘 파일(`artifact_vocabulary.mjs`)에서만 발행하고 계열(family)을 반드시 정한다. 과제 폴더명·발주처 슬롯명은 토큰이 아니라 별칭이다(D44).
5. 스펙을 고쳤으면 exporter로 compiled를 다시 만들고 `--check`를 통과시킨다. 컴파일러 시험은 실제 compiled 파일도 읽으므로 스펙 변경이 시험을 깨면 그 시험이 알려준다.
6. 병렬 코더 결과를 합칠 때 enum·list·date 같은 계약 불일치는 컴파일러 쪽에서 수용하고 시험으로 고정한다(예: `applies_when` 토큰|목록, `added_by_verification` 날짜 문자열, `internal_management` verification status).
7. 남은 의문·미검증은 지우지 말고 도출 기록 §미결에 남긴다.

## 3.7 선후 관계는 어떻게 구했나 (D46, 2026-08-18)

행이 **어디서 왔나**와 별개로, 행 사이의 "이것이 먼저"는 따로 구해야 했다. 방법은 3.0의 파이프라인 그대로다.

1. **사실 추출(S1)**: 정본 4계열에 리더 4개(병렬) — NASA SE Handbook Rev2 4~6장 프로세스 17개의 Inputs/Outputs, NPR 7123.1D §3.2와 부록 G, DoD SE Guidebook 2022 §4, 방사청 SE 기술검토회의 가이드북 2017의 회의별 INPUT/OUTPUT 표(+2024 OCR 교차확인)와 SE 기술관리 실무지침서의 활동 41건. 항목 이름 + 인용 위치만 뽑고 원문 문장은 넣지 않았다.
2. **합성(S2)**: 리더가 제안한 프로세스 이름을 정본 공통 **활동 토큰**으로 손으로 매핑한 뒤(예: NASA "Technical Requirements Definition" = DoD "Requirements Analysis" = 실무지침서 "체계요구사항 개발" → `act_requirements_analysis`), 스크립트가 기계적으로 간선을 만든다. 간선이 되는 조건은 둘뿐이다 — 리더가 그 항목에 어휘 토큰을 붙였을 것, 그 프로세스가 활동 토큰으로 매핑될 것. 아니면 만들지 않고 **미포함으로 센다**. 결과 `relations.json` 간선 206(일반 SE 128 · 방사청 128 중 78).
3. **스펙 반영(S4)**: 배치 규칙은 스크립트 안에 있고 순환 차단을 내장한다(활동은 자기가 만드는 것을 입력으로 선언하지 않는다, 스펙이 그 게이트나 앞 게이트에 갖고 있지 않은 입력은 붙이지 않는다). 남은 고리는 결정론적으로 가장 약한 간선 하나를 끊고 기록한다 — 이번에 끊은 것은 1건.
4. **검증(S5)**: export `--check`, `validate:se-stage-rules` 45/45, dry-run 폴더 수 불변(체계개발 145 / 일반SE 229 — 활동·결정 행은 폴더를 만들지 않는다), 계층=통합 등가 유지.

**정정 하나**: 계획(09장 A2a)은 NPR 7123.1D **부록 C**에서 공통 기술 프로세스 17개의 입출력을 뽑는다고 적었는데, Rev D에서 부록 C는 "Reserved"이고 본문이 "핵심 SE 프로세스 지침은 SP-6105로 옮겼다"고 말한다(부록 D도 마찬가지). 그래서 부록 C는 인용하지 않았다. 더 중요한 결과: **Rev D §3에는 규범적 프로세스 입출력 표가 없고**, DoD SEG 2022 §4에도 Inputs/Activities/Outputs 양식이 없다(명시 입력 목록은 §4.1.3 하나뿐). 번호 붙은 입출력 절을 전 프로세스에 갖는 정본은 NASA SE Handbook 하나뿐이다.

**2판 정정(2026-08-18 후속, 실제 출력 검토)**: 세 가지가 드러나 고쳤다. 자세한 것은 `references/se_io_relations_v0.md` §6A.

1. **거꾸로 된 간선 4개** — 실무지침서 표 3 순서 4를 읽고 "기능분석이 체계요구사항명세서를 만든다"로 간선을 걸었는데, 체계공학 순서는 그 반대다(요구분석 → SSRS → 기능분석·할당). 뒤집어 다시 넣지 않고 지웠다. 뒤집는 것은 정본이 하지 않은 새 주장이기 때문이다. 같은 방향을 규정이 직접 말한 문장이 §6B 후보에 있다.
2. **검토회의 INPUT 표는 인과가 아니다** — "회의에 가져올 자료" 목록이지 산출물끼리의 입력이 아니다. 이제 행의 `gate_role`(핵심/진입/보조)로 표현한다(02장 §2.7). 회의 활동 자신의 `depends_on`은 남는다.
3. **층이 토큰으로 만나지 못했다** — ①의 관계 128개가 ②에 하나도 닿지 않은 이유는 토큰이 달라서였다. 어휘에 층 대응표를 두고(04장 §4.6; 그중 행 배정이 어긋났던 3쌍은 D44 확정으로 ② 행을 고쳐 없앴다) ①의 이분 관계를 활동 하나를 통과해 합성해 ② 행에 옮겼다(합성 128 → 투영 52간선/20행, 등급은 지침을 넘지 않음). 여기에 정본 별지 서식이 직접 보여 주는 참조 관계 9건을 더했다(추출 62, 양 끝 토큰 21).

또 **규정 계열 2종**(방위사업관리규정·국방전력발전업무훈령)에서 선후를 말한 문장 60건을 뽑아 후보로 두었다(§6B). 규정 등급은 가이드북을 이기므로 사람이 확인하기 전에는 규칙표에 넣지 않는다 — 관측을 사람이 확정하는 것과 같은 규칙이다.

측정된 한계: 추출 항목 773 중 간선이 된 것은 **243(31.4%)**이고, 정본이 준 이름이 일반적이어서("산출물", "results") 토큰을 붙이지 못한 것이 524건이다. 이번에 읽은 4계열은 전부 지침·가이드북이므로 **`regulation_mandated` 간선은 0**이다 — 결함이 아니라 실측이며, 규정·훈령 계열은 아직 읽지 않았다. 행별 근거·정본 대응표·미결 8건은 `.registry/skills/se_foldertree_generate/codex/references/se_io_relations_v0.md`, 작업 파일은 `_workspaces/knowledge/common/systems_engineering/derivations/se_io_relations_20260818/`(영수증 `_workmeta/system/reports/se_stage_rules/se_io_relations_20260818.json`).

## 3.8 관측은 어떻게 만드나 (행이 아니라 사실)

3.1~3.7은 **기대**(어느 단계에 무엇이 있어야 하는가)의 행이 어디서 왔는지였다. 비교의 다른 쪽인
**관측**(실제로 무엇이 있는가)은 정본에서 오지 않는다. 과제 폴더에서 온다.

만드는 길은 둘이다. 정식 통로는 작업자가 산출물을 업무폴더 `03_Out`에 넣는 것이고,
훑기는 과제 폴더를 걸어 파일 이름·위치로 **후보**를 제안한 뒤 사람이 확정하는 것이다(D37).
문서 내용은 읽지 않으므로 "있다/없다"까지가 이 층의 답이고, "제대로 됐나"는 문서 내용 검사기(D1)의 몫이다.

규칙(업무폴더 번호 → 이름 단서 → 성숙도 단어 → 자동 확정 3조건), 확인표와 폴더 단위 확정,
관측 생성 계약, 폴더 청소 알림, 출력 파일과 실측 수치는 **[10장 관측 공급자](10_observation_eye.md)**에 있다.

## 3.9 안내 문장은 어떻게 만드나 (짓지 않고 조립한다)

3.1~3.8이 기대와 관측의 **사실**이 어디서 왔는지였다면, 그 사실을 사람에게 말로 돌려주는 문장은
어디서 오는가. 답은 "새로 쓰지 않는다"다. 가이드 카드와 지시서의 한국어 문장은 전부
`guidance/guide_cards.mjs`의 고정 템플릿 목록(`GUIDE_CARD_TEMPLATES`)에서 나오고, 그 안의 슬롯은
규칙 행의 필드(`evidence_level`·`minimum_presence_rule`·`node_kind`·`maturity`·`template`·
`verification_status`·`se_floor`·입력 수·인용 수)를 그대로 복사해 채운다. 모델을 부르지 않으므로
행이 말하지 않은 것은 문장에도 없고, 양식이나 인용이 없는 행은 채워지는 대신 `양식 없음`·
`근거 미표기`로 표시된다. 시험이 모든 문장을 template_id로 재렌더해 같은 바이트인지, 슬롯 값이
행의 필드에서 왔는지를 확인한다. 카드의 각 칸이 어느 필드에서 오는지의 대응표와 지시서·답 한 장의
구성은 **[11장 안내 층](11_guidance_layer.md)**에 있다.
