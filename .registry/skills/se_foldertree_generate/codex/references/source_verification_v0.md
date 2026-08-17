# SE 폴더트리 variant 정본 대조 검증 V0

- 상태: `DRAFT / claim_ceiling: observed / 2026-08-18` (후속 T2: §10에 추가 원문 2종 반영, JSON `updated: 2026-08-18T2`)
- 범위: 저장소 SE 폴더트리 variant 4종(체계개발·탐색개발·선행연구·운용연구개발)의 gate·task를 공개 정본 10종 + 2024 개정 가이드북(OCR)과 대조한 결과, 응용연구 variant 제안, 엔진 stage-rule 통일을 위한 다음 액션. §10은 선행연구 수행지침(제881호)·국방기술 연구개발 업무처리지침(제974호) 2종을 추가 대조한 후속.
- 입력: source reader 10건, variant comparer 4건, 응용연구 derive 1건, critic 스팟체크 1건. 기계판독본은 `se_foldertree_variant_source_verification_v0.json`(동일 데이터).
- 표기: 출처는 §1의 약칭으로 인용하며 `약칭 제N조` 또는 `약칭 p.N`. 행 번호(L)는 JSON에만 유지. NOT_FOUND는 '라이브러리에서 못 찾음'이며 '요구되지 않음'이 아니다.

## 0. 한 줄 결론

| 사업유형 | variant | spine 판정 | 지원 | 부분 | 미지원 | 내부관리 | 상충 | 빠진 필수 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 체계개발 | `system_dev_lig_grade_a` (SE_FolderTree_Guide.md v0.7) | 부합(MATCHES) — 병합 2건·비출처 게이트 1건(240_LL)·누락 슬롯(MRA·사업중간점검·국방규격화·PRR) | 60 | 30 | 14 | 24 | 0 | 17 |
| 탐색개발 | `exploratory_dev_common_no_grade` (SE_FolderTree_ExploratoryDev_Basic.md) | 불일치(MISMATCH, partial) — SRR만 출처 지원, SFR 부분, PDR~PCA 탐색개발 근거 없음 | 12 | 23 | 0 | 21 | 0 | 14 |
| 선행연구 | `pre_study_common_no_grade` (SE_FolderTree_PreStudy_Basic.md) | 출처 미규정(NOT source-mandated) → **§10에서 재기준(updated in §10)**: 선행연구지침(제881호) 확보로 회의체 실체 확인 — 검토위원회 착수·중간·최종 검토회의(제14조②)+실무회의(제14조의2)+결과보고(제15조) 흐름; SRR~PCA 명칭은 여전히 선행연구에 없음(재라벨 대상); 재판정 35건 중 판정 변경 1(186→지원)·근거 갱신 27·A 무관 7 | 18 | 17 | 0 | 21 | 0 | 11 + 12(§10.2 신규) |
| 운용연구개발(성능개량·현존전력 계열 해석) | `operational_rd_common_no_grade` (SE_FolderTree_OperationalRnD_Basic.md) | 부분 부합 — 체계개발 준용형 성능개량에는 지원, 현존전력 성능극대화형에는 규정 미명시(상충 아님) | 26 | 9 | 0 | 21 | 0 | 12 |
| 응용연구·시험개발 | (variant 없음 → §5 제안 v1: gate 7·task 37 → **§10.3 제안 v2: gate 7·task 56, updated in §10**) | 어떤 정본도 응용연구에 SRR~PCA를 요구하지 않음(기술연구개발지침 제974호에서도 재확인); v1의 HOLD 원인이던 「국방기술 연구개발 업무처리지침」 확보 → 회의체 4종(착수·설계검토·시험평가준비·종결, 제41조④)·성과평가 3종(중간·단계전환·종료, 제24~26조)+특별평가(제27조)·연구개발계획서 15항목(제39조①)·연구개발결과보고서 10항목(제42조②) 확정; 잔여 unknown(별표3 단계 정의·TRL 목표, 별표4·5 배점, 설계검토회의 시점, 시험평가 승인주체 B 국방부 vs 훈령 합참, 구 규정 제172~193조의6)은 부분 HOLD | — | — | — | — | 0 (규정 제116조 대비) | 정본 부재 4건 → 2건 해소, 잔여 unknown 6건(§10.3) |

- 요약: 체계개발 variant만 규정 제56조④5·제79조② spine과 부합하고, 탐색개발·선행연구 variant는 체계개발 명명틀을 차용한 상태라 재기준(re-base)이 필요하다. 운용연구개발 variant는 '체계개발 준용형 성능개량'에는 맞고 '현존전력 성능극대화형'에는 규정 미명시(상충 아님)라 트랙 분리가 필요하다. 응용연구는 위임 지침 확보 전까지 proposed/unstated로 HOLD.
- 2026-08-18 후속(§10): 선행연구 수행지침(제881호)·국방기술 연구개발 업무처리지침(제974호) 2종을 추가 대조. 선행연구는 정본 회의체(착수·중간·최종 검토회의+실무회의)와 산출물(선행연구요구서·선행연구계획서·조사·분석 수행계획서·조사·분석 결과보고서)이 확정되어 재기준 spine을 §10.2에 제시했고, 응용연구는 v2 제안(§10.3)으로 proposed 항목 대부분을 정본 근거로 승격하되 SE 검토회의(SRR~PCA)는 B에도 없어 optional로 남긴다.

## 1. 대조 원문 목록

| # | 약칭 | 출처키 | 제목 | 발행 | 판/일자 | 입수 경로* | 파생 텍스트 | 읽기 한계 |
|---|---|---|---|---|---|---|---|---|
| 1 | 규정 | `dapa_program_management_rule_law_20260811` | 방위사업관리규정 | 방위사업청 (훈령 제981호) | 시행 2026-08-11 | 법령센터(국가법령정보센터 행정규칙) | text (1조=1행, 페이지 마커 없음) | 별표2·4·11·12 및 별지5·9~15·26·27·30 등 본문 없음(제목만 수록); 제18~24조·제118조의2~9·제4장 구매(제119~130조)·제7장 전시·제8장 보칙은 정독하지 않음(grep 수준); 1조 1행 구조라 조번호 drift 위험(스팟체크에서 제47조①→제49조① 오인 1건 발견) |
| 2 | 훈령 | `mnd_force_development_directive_law_20260701` | 국방전력발전업무훈령 | 국방부 (훈령 제3184호) | 시행 2026-07-01 | 법령센터(국가법령정보센터 행정규칙) | text (조문만, 페이지 마커 없음) | 별표1~7·별지1~19(TEMP·DT/OT 계획서·결과보고서 서식 등) 본문 없음; 제29~35조·제37~42조·제92~105조·제107~120조·제131~141조·제145~229조는 헤더 grep만; 본문에 SRR/SFR/PDR/FCA/PCA 용어 없음(CDR만 등장) → 검토회의 근거는 규정 위임 |
| 3 | 총수명주기훈령 | `mnd_total_life_cycle_management_directive_law_20260303` | 국방 총수명주기관리 업무훈령 | 국방부 (훈령 제3144호) | 2026-03-03 개정 | 법령센터(국가법령정보센터 행정규칙) | text (페이지 마커 없음) | 별표1~11·별지1~17 본문 없음(별표4 요소×단계 활동표 확인 불가); 제1~11조·제80조 이후는 grep 수준; 검토회의 영문 약어·회의별 ILS 입출력 없음 |
| 4 | 현존전력지침 | `dapa_existing_force_performance_max_instruction_law_20231213` | 현존전력 성능 극대화 사업 업무지침 | 방위사업청 (예규 제883호) | 2023-12-13 | 법령센터(국가법령정보센터 행정규칙) | text (208행, 조문만) | 별표(사업 추진 절차도)·별지1~6 본문 없음; SRR~PCA 검토회의 언급 전무; 규정(2026-08) 제62조의2 대비 요건 수치 stale(200억/24·36개월 vs 300억/24·60개월) |
| 5 | RAM지침 | `dapa_weapon_system_ram_instruction_law_20210723` | 무기체계 RAM 업무지침 | 방위사업청 (예규 제726호) | 시행 2021-07-23 | 법령센터(국가법령정보센터 행정규칙) | text (303행) | 별표1~4 본문 없음(별표4 'SE 기반 RAM 업무절차' 회의별 매핑 확인 불가); HTML 스크래핑 노이즈 행 존재(행 286·291·294·296·298); SFR/TRR/FCA/PCA 언급 없음 |
| 6 | SE가이드북2017 | `dapa_se_technical_review_guidebook_2017` | SE기반 기술검토회의 가이드북 | 방위사업청 획득기획국 | 2017-06-30 | 방위사업청 공개자료(PDF) | text + 페이지 마커(p.N = 인쇄면) | 그림5·7·8 이미지(캡션만); 표가 셀 단위로 평탄화되어 행·열 헤더 없음 → 산출물의 게이트 귀속을 순서로 추론; 산출물은 의무 기준이 아님을 자체 명시(p.29-30) |
| 7 | SE가이드북2024(OCR) | `dapa_se_technical_review_guidebook_2024` | SE기반 기술검토회의 가이드북 (2024 개정) | 방위사업청 | 2024 | 방위사업청 공개자료(PDF→OCR) | OCR (pdf p = 인쇄 p+4) | 라틴 약어·괄호 OCR 깨짐(예: '소프트웨어개발계획서(60『)') → SDP/SEMP/SSRS grep 실패, 한글 정식명으로만 검색 가능; 인쇄 페이지 번호가 페이지 하단에 있어 페이지별 매핑 확인 필요; 부록 E 표 판독 불가 |
| 8 | SE실무지침서 | `dapa_se_technical_management_practice_guide` | 연구개발사업의 체계공학(SE) 기반 기술관리업무 실무지침서 | 방위사업청 | 2012경 (방위사업관리규정 훈령 제170호 2012-01-06 기준) | 방위사업청 공개자료(PDF) | text + 페이지 마커 | 부록 B(SMC-S-21 기반 점검표 약 10,000행)·부록 C 미판독; 인용 규정 조번호 stale(제111·113·119·120·125조 → 현행 제68~69·77·79조 등); DoDI 5000.2 참고 검토표(MRR/PRR/SAR/AoA) 포함 → 키워드 검색 시 미국 문맥 오탐 |
| 9 | 표준화지침서 | `dapa_defense_standardization_practice_guide` | 국방 표준화 업무 실무 지침서 | 방위사업청 표준기획과 | 2024-11 | 방위사업청 공개자료(PDF) | text + 페이지 마커(48면) | 자체 조문 없음(표준화 업무규정 조번호 참조 인용만); 검토회의 entry/exit·TRR 입출력 없음; TDP 구성요소별 제출 시점 없음 |
| 10 | TE가이드북2012 | `dapa_weapon_system_test_eval_guidebook` | 무기체계 시험평가 실무 가이드북 | 방위사업청 분석시험평가국 | 2012-07 | 방위사업청 공개자료(PDF) | text + Page 마커(마커 p ≈ 인쇄 p+10) | 신뢰성 통계기법·SW 정적/동적 시험·부록3~7은 grep만; FCA/PCA/PRR 시기·입출력 없음(약어 목록만); 구 규정 조번호(제103·125조) 인용 |
| 11 | TE실무가이드북2013 | `dapa_weapon_system_test_evaluation_practical_guide` | 무기체계 시험평가 실무가이드북 (개정·증보판) | 방위사업청 분석시험평가국 | 2013-12 | 방위사업청 공개자료(PDF→OCR) | OCR (단어 간 공백 없음; PDF p = 인쇄 p+8) | 공백 없는 OCR('응용연구단계로종결되는사업') → 구문·정규식 grep 실패, 거짓 NOT_FOUND 위험; 핵심기술 단계별 시험평가 절차 흐름도(PDF p.104) 이미지라 텍스트 없음; 구 규정 조번호(제119조 등)·구 조직명(분석시험평가국) 사용 → stale 가능 |

- 추가 원문 #12 선행연구지침(제881호)·#13 기술연구개발지침(제974호)은 §10.1에 같은 형식으로 수록(2026-08-18 후속).

\* 입수 경로는 파일 키 접미사(`_law_` = 법령센터 행정규칙, 그 외 = 방위사업청 공개 PDF)로 추정한 값이며 원본 URL은 이번 대조에서 재확인하지 않음. 공통 한계: (1) 규정·훈령·지침의 별표·별지 본문이 파생 텍스트에 없어 서식 항목 수준의 산출물 정의는 확인 불가, (2) OCR 2종(SE가이드북2024·TE실무가이드북2013)은 약어·공백 손상으로 키워드 검색 신뢰도 낮음, (3) 규정은 1조 1행이라 조번호 drift 위험, (4) 2012~2013년 실무지침류는 구 규정 조번호(제111·119·125조 등)를 인용.

## 2. 판정 기준 정의

| 판정 | 정의 | 대응 표현 |
|---|---|---|
| `source_supported` | 정본(규정·훈령·지침·가이드북)에 같은 명칭 또는 동일 실체의 산출물/활동이 해당 게이트·단계에 명시됨 (근거 있음) | 근거 있음 |
| `partially_supported` | 실체는 정본에 있으나 명칭·시점(게이트)·작성 주체·문서 형태가 다르거나, 점검 기준·프로세스 활동으로만 존재 (근거 있음·원문 없음) | 근거 있음·원문 없음(명칭·시점 상이 포함) |
| `unsupported` | 검색한 정본 어디에도 없음 — 대개 주계약사(LIG) 계약 품질 게이트·구매절차 항목 (근거 없음; 결함이 아니라 계약 항목) | 근거 없음 |
| `internal_management` | INBOX/LOG/TDP 고정 내부관리 폴더 — 정본 판정 대상 아님 | — |
| `contradicted` | 정본이 명시적으로 금지·상충하는 경우 (이번 대조 0건) | 상충 |
| `missing_required` | 정본이 해당 사업유형·게이트에 mandatory/conditional/recommended로 요구하나 variant에 슬롯이 없는 항목 | 빠진 필수 |

- '근거 있음' = source_supported, '근거 있음·원문 없음' = partially_supported(또는 위임·별지 본문 부재), '근거 없음' = unsupported; NOT_FOUND는 corpus 부재를 뜻하며 '요구되지 않음'으로 격상하지 않음.
- mandatory 등급: mandatory(정본이 수행·제출·확정을 지시) / conditional(사업 조건부) / recommended(가이드북·실무지침서 권고) / proposed(응용연구 제안, 정본 미기재) / unstated(정본 침묵).
- 게이트 귀속: 정본이 게이트를 명시하지 않는 항목(예: 운용성확인)은 실체가 맞아도 게이트 귀속을 '출처 근거 없음'으로 note에 남김.

## 3. variant별 결과

### 3.1 `system_dev_lig_grade_a` — 체계개발 (SE_FolderTree_Guide.md v0.7; 주계약사 LIG 넥스원, 품질등급 A)

| 지원 | 부분 | 미지원 | 내부관리 | 상충 | 빠진 필수 | 합계 task |
|---:|---:|---:|---:|---:|---:|---:|
| 60 | 30 | 14 | 24 | 0 | 17 | 128 |

- 게이트: 030_SRR (Q1,Q2), 060_SFR, 090_PDR (Q3), 120_CDR (Q4), 150_TRR_DT (Q5-Q7), 180_FCA_OT (Q8), 210_PCA, 240_LL
- spine 판정: **부합(MATCHES) — 병합 2건·비출처 게이트 1건(240_LL)·누락 슬롯(MRA·사업중간점검·국방규격화·PRR)**
- 판정 근거(요약): 규정 제56조④5·제79조②의 체계개발 검토 spine(SRR[탐색생략 시]·SFR·PDR·CDR·TRR·DT/OT·FCA·PCA)과 순서가 같고, TRR+DT·FCA+OT 병합은 SE가이드북2017 p.88(TRR은 DT/OT별)·p.98(FCA는 DT 후 OT 전)과 정합. 주의: (a) SRR은 규정상 조건부인데 variant는 무조건 수행으로 취급, (b) 240_LL은 정본 대응 없음(가장 가까운 것은 SE실무지침서 §4.10.5 사업종결회의·규정 제81조② 체계개발결과보고서), (c) MRA(규정 제78조③·제79조③)·사업중간점검(제65조①)·국방규격(안)/규격화(제80조①)·PRR(제82조④ 조건부) 슬롯 없음, (d) SSR(SE가이드북2017 p.51)은 미표현이나 정본도 unstated. variant의 '방사청 가이드북 p.N'은 2024 인쇄면(=pdf p+4)이고 근거 텍스트는 2017판이지만 내용은 일치(2024는 체계규격서→기능형상식별서 등 개명). (비교기 원문 판정문은 JSON `spine_verdict`)
- 내부관리(정본 판정 제외) 24건: 030_SRR 31/32/33; 060_SFR 61/62/63; 090_PDR 91/92/93; 120_CDR 121/122/123; 150_TRR_DT 151/152/153; 180_FCA_OT 181/182/183; 210_PCA 211/212/213; 240_LL 241/242/243 (INBOX_분류전·LOG_의사결정조치기록·TDP_기술자료)

| gate | task | task명 | 판정 | 근거 출처 | note |
|---|---|---|---|---|---|
| 030_SRR | 34 | 계약자료검토결과(Q1) | unsupported | NOT_FOUND in 규정 / 훈령 / SE가이드북2017 / SE실무지침서 | LIG customer quality gate (Q1); no government source in scope mentions a Q1… |
| 030_SRR | 35 | 협력개발실행계획서(Q2) | partially_supported | 규정 제76조①, 제77조① (체계개발실행계획서); SE실무지침서 §2.4.6, 표7 A5 | Sources require a 체계개발실행계획서 by the 연구개발주관기관; the subcontractor-level 협력개발실행계획서 is an… |
| 030_SRR | 36 | 체계공학관리계획서(SEMP) | source_supported | SE실무지침서 표7 B2/B3, §5.1.3.4 (SEMP mandatory 체계개발); SE가이드북2017 p.120, p.47-48; 2024 서식: SE가이드북2024(OCR) pdf p.133 (printed p.129) '부록 F 1. 체계공학관리계획서' | variant page cite matches 2024 edition printed p.129 (pdf p.133) |
| 030_SRR | 37 | 품질보증계획서(QAP) | source_supported | SE가이드북2017 p.27 (기술계획: 품질보증계획), p.47 (SRR Check-List 개략적인 품질보증계획), p.72, p.85 | listed as a 기술계획 document to be set at SRR and updated at each review; guidebook outputs… |
| 030_SRR | 38 | 착수회의록(Kick-off) | source_supported | SE실무지침서 §4.10.1 (page 105) (사업착수회의, 사업 승인 후 3개월 이내, mandatory) | 2017 가이드북 has no 착수회의 term (grep 0 hits) |
| 030_SRR | 39 | 운용개념(CONOPS) | partially_supported | SE실무지침서 표3 순서1, §3.2 (운용개념 도출 OCD/ORD — 소요군 작성); SE가이드북2017 p.124 (ORD 부록 OMS/MP as SRR input) | Sources treat 운용개념/ORD as a 소요군/IPT input to SRR, not a developer deliverable; 2024… |
| 030_SRR | 40 | 체계요구사항명세서(SSRS)_D | source_supported | SE가이드북2017 p.40 (SRR 진입: SSRS 작성), p.49 (SSRS [F] at SRR), p.125 (서식); 규정 제78조④ (체계요구사항명세서 mandatory 체계개발) | Source has SSRS as Final at SRR; variant keeps Draft here and Final at SFR |
| 030_SRR | 41 | 가정및제약사항 | partially_supported | SE가이드북2017 p.44 (SRR Check-List 3.11 설계 및 구현 제약사항), p.125 (SSRS 서식 3.11) | constraints are a section of SSRS / a check item, not a standalone deliverable |
| 030_SRR | 42 | 초기위험관리자료 | source_supported | SE가이드북2017 p.40 (SRR 진입: 체계개발 단계 위험평가 결과 및 위험관리 방안), p.116; SE실무지침서 §4.2 (SRR 착수조건 위험평가) |  |
| 030_SRR | 43 | SRR_회의록및조치결과 | source_supported | SE가이드북2017 p.49 (SRR 수행 결과서 [F]), p.25 (회의록·Action Item); 규정 제79조② (기술검토회의 결과 IPT장 제출) |  |
| 030_SRR | 44 | 계약자료제출목록(CDRL) | partially_supported | SE가이드북2017 p.47 (SRR Check-List: SW 산출물 납품항목(CDRL) 식별), p.30 (CDRL 참고자료) | CDRL mentioned only as a SW check item; contract-driven |
| 030_SRR | 45 | SW개발계획서(SDP) | source_supported | SE가이드북2017 p.34 (표2 SRR 산출물 SDP); 규정 제47조① (소프트웨어개발계획서 IPT 검토·승인, mandatory); SE가이드북2024(OCR) pdf p.43 (SRR 산출물 4) 소프트웨어개발계획서) | [스팟체크 정정] SDP 검토·승인 조문은 규정 제49조①(제47조①은 SW 기술문서 조항). |
| 030_SRR | 46 | 시험평가기본계획서(TEMP)_D | partially_supported | SE가이드북2017 p.34, p.46 (SRR: P-TEMP; P-TEMP 미작성 시 TEMP(안)에 포함), p.70 (TEMP(안) at PDR); 훈령 제63조① (예비TEMP → TEMP) | At SRR the source-named document is 예비시험평가기본계획서(P-TEMP); TEMP draft appears at PDR |
| 030_SRR | 47 | 기능형상식별서(FCI)_D | source_supported | SE가이드북2017 p.49 (체계규격서(SSS)(안) [D] at SRR); SE가이드북2024(OCR) pdf p.34 (printed p.30) 'SRR 진입기준: SSRS와 기능형상식별서(안) 작성', pdf p.26 (요구사항기준선 대상 기능형상식별서(안)) | 2024 edition renames 체계규격서→기능형상식별서 (SE가이드북2024(OCR) pdf p.25) |
| 030_SRR | 48 | 연동통제문서(ICD)_D | source_supported | SE가이드북2017 p.49 (ICD(안) [D] at SRR); 규정 제43조① (연동통제문서 상세설계 완료 전 확정) |  |
| 060_SFR | 64 | 체계요구사항명세서(SSRS)_F | partially_supported | SE가이드북2017 p.49 (SSRS [F] at SRR), p.60 (SFR final = 체계규격서(SSS) → 기능기준선), p.31 | Source finalizes SSRS at SRR; the 기능기준선 document at SFR is SSS/기능형상식별서 (variant task… |
| 060_SFR | 65 | 기능분석및할당자료 | source_supported | SE실무지침서 표6 B7, 표8 B5 (SFR 산출물 기능흐름블록선도), §3.5.2; SE가이드북2017 p.53-54 (SFR 활동) |  |
| 060_SFR | 66 | 요구사항추적표(RTM) | partially_supported | SE가이드북2017 p.59 (SFR 종료: 일관성·추적성), p.99 & p.135 (국방규격화연계표); SE실무지침서 §5.8 REQM; SE가이드북2024(OCR) (시험평가 추적표) | traceability is a check criterion; no source names an RTM deliverable at SFR (2017 grep… |
| 060_SFR | 67 | 연동통제문서(ICD)_Prelim | source_supported | SE가이드북2017 p.60 (SFR 산출물: 검토중인 ICD [P]) |  |
| 060_SFR | 68 | 검증확인전략(V&V) | partially_supported | SE실무지침서 §4.3 (SFR 산출물 Pre-TEMP 검토/합의), §5.11 VER, §5.12 VAL; SE가이드북2017 p.117 (V&V 용어) | V&V strategy is embodied in P-TEMP/TEMP; no source lists a separate 'V&V 전략' deliverable |
| 060_SFR | 69 | 대안분석(Trade-Study) | partially_supported | SE가이드북2017 p.59 (수명주기비용 증가시 비용-성능 절충분석 고려); SE실무지침서 §5.9 TS (대안 평가) | trade-off analysis appears only as an LCC check item / TS process activity, not a listed… |
| 060_SFR | 70 | SFR_회의록및조치결과 | source_supported | SE가이드북2017 p.60 (SFR 수행 결과서 [F]); 규정 제79조② |  |
| 060_SFR | 71 | 기능형상식별서(FCI)_F | source_supported | SE가이드북2017 p.60 (체계규격서(SSS) [F] → 기능기준선), p.31; SE가이드북2024(OCR) pdf p.26 (기능기준선 대상 기능형상식별서), pdf p.47 (SFR 산출물 1) 기능형상식별서(수정·보완)) |  |
| 060_SFR | 72 | HW요구사항명세서(HRS)_D | source_supported | SE가이드북2017 p.60 (HRS(안) [D] at SFR), p.126 (서식) |  |
| 060_SFR | 73 | SW요구사항명세서(SRS)_D | source_supported | SE가이드북2017 p.60 (SRS(안) [D] at SFR) |  |
| 060_SFR | 74 | 체계설계기술서(SSDD)_D | source_supported | SE가이드북2017 p.60 (SSDD(안) [D] at SFR) |  |
| 090_PDR | 94 | 설계품질점검결과(Q3) | unsupported | NOT_FOUND (closest: 규정 제56조④6 — 기품원 양산관점 품질보증의견 at PDR/CDR, not an LIG Q3 record) | LIG customer quality gate |
| 090_PDR | 95 | 체계아키텍처및형상식별서(안) | source_supported | SE가이드북2017 p.73, p.64 (개발규격서(안) [D] → 할당기준선 at PDR), p.31; SE가이드북2024(OCR) pdf p.68 (PDR 산출물 4) 개발형상식별서(수정보완), 국방규격 초안 I), pdf p.71 | maps to 개발규격서/개발형상식별서 (allocated baseline) |
| 090_PDR | 96 | 체계설계기술서(SSDD)_F | source_supported | SE가이드북2017 p.73 (SSDD [F] at PDR), p.127 (서식) |  |
| 090_PDR | 97 | HW요구사항명세서(HRS)_D | partially_supported | SE가이드북2017 p.73 (HRS [F] at PDR), p.63-64 (PDR 진입: HRS 작성) | source has HRS Final at PDR; variant keeps Draft at PDR and Final at CDR (task 140) |
| 090_PDR | 98 | SW요구사항명세서(SRS)_D | partially_supported | SE가이드북2017 p.73 (SRS [F] at PDR) | same timing mismatch as HRS |
| 090_PDR | 99 | 인터페이스설계기술서(IDD)_D | source_supported | SE가이드북2017 p.73 (IDD(안) [D] at PDR) |  |
| 090_PDR | 100 | 연동통제문서(ICD)_Prelim | source_supported | SE가이드북2017 p.73-74 (PDR 산출물: 검토중인 ICD [P]) |  |
| 090_PDR | 101 | 요구사항추적표(RTM)_최신화 | partially_supported | SE가이드북2017 p.72-73 (PDR 종료: 요구조건-설계 추적성 누락 없음) | traceability criterion, no named RTM deliverable |
| 090_PDR | 102 | 시험평가기본계획서(TEMP)_D | source_supported | SE가이드북2017 p.70, p.73-74 (PDR 기술계획문서 TEMP(안)); 훈령 제63조 (TEMP 별지4) |  |
| 090_PDR | 103 | PDR_회의록및조치결과 | source_supported | SE가이드북2017 p.73, p.74 (PDR 수행 결과서 [F]); 규정 제79조② |  |
| 090_PDR | 104 | HW설계기술서(HDD)_D | source_supported | SE가이드북2017 p.73 (HDD(안) [D] at PDR) |  |
| 090_PDR | 105 | SW설계기술서(SDD)_D | source_supported | SE가이드북2017 p.73 (SDD(안) [D] at PDR) |  |
| 090_PDR | 106 | DB설계기술서(DBDD)_D | source_supported | SE가이드북2024(OCR) pdf p.68 (PDR 산출물 8) (개략)데이터베이스설계기술서(DBDD)); SE가이드북2017 p.35 (SDD(DBDD) at CDR), p.30 (표1 일부 사업) | 2017 edition lists DBDD only within CDR SDD(DBDD); 2024 edition lists 개략 DBDD at PDR —… |
| 090_PDR | 107 | 상세설계도면_D | source_supported | SE실무지침서 표8 B6 (PDR 산출물: 체계 도면 등 기술자료); SE가이드북2017 p.31 (제품기준선 도면) | drawings at PDR are 기본설계-level per SE실무지침서; '상세설계도면' naming fits CDR better |
| 090_PDR | 108 | 자재명세서(Q-BOM)_D | source_supported | SE가이드북2017 p.71 (PDR Check-List: 기본설계 결과로 부품/BOM목록 개발) | 'Q-BOM' label is LIG-specific; source lists BOM 목록 as PDR check item |
| 120_CDR | 124 | 제작준비검토결과(MRR_Q4) | unsupported | NOT_FOUND (closest: SE가이드북2017 p.86 CDR 종료 = 시제제작 진행 동의; p.84 MRA 계획 최신화; PRR is a 양산 gate p.115) | LIG Q4 manufacturing readiness review for prototype build; no government source defines… |
| 120_CDR | 125 | HW설계기술서(HDD)_F | source_supported | SE가이드북2017 p.87 (HDD [F] at CDR), p.128 (서식) |  |
| 120_CDR | 126 | SW설계기술서(SDD)_F | source_supported | SE가이드북2017 p.87 (SDD [F] at CDR), p.77 (CDR 진입) |  |
| 120_CDR | 127 | DB설계기술서(DBDD)_F | source_supported | SE가이드북2017 p.35 (CDR SDD(DBDD)), p.77; SE가이드북2024(OCR) pdf p.82 (CDR 산출물 4) (상세)DBDD) | conditional on DB-bearing systems |
| 120_CDR | 128 | 인터페이스설계기술서(IDD)_F | source_supported | SE가이드북2017 p.87 (IDD [F] at CDR; 필요시 SDD 포함) |  |
| 120_CDR | 129 | 연동통제문서(ICD)_F | source_supported | SE가이드북2017 p.87 (ICD [F] at CDR); 규정 제43조① (상세설계 완료 전 연동통제문서 확정, mandatory) |  |
| 120_CDR | 130 | 상세설계도면_F | source_supported | SE실무지침서 표8 B7 (CDR 산출물: 부체계 도면 등); SE가이드북2017 p.77 (CDR 진입: 상세설계 2D/3D 완료), p.31 |  |
| 120_CDR | 131 | 자재명세서(Q-BOM)_F | source_supported | SE가이드북2017 p.85 (CDR Check-List 핵심 자재 공급망·부품단종), p.31 (제품기준선: 부품목록); SE가이드북2024(OCR) pdf p.27 (제품기준선 대상 부품목록) | 부품목록 is part of the product baseline set at CDR |
| 120_CDR | 132 | Artwork설계검토서_F | unsupported | NOT_FOUND in 규정 / 훈령 / SE가이드북2017 / SE실무지침서 | PCB artwork approval is an LIG-level manufacturing quality item |
| 120_CDR | 133 | 표준품적절성검토서 | partially_supported | SE가이드북2017 p.85 (CDR: 부품단종·진부화 영향), p.71 (PDR 상용품·비개발품 식별); 규정 제79조④ (등록부품활용계획 PDR 반영) | part obsolescence/standard-part review is a check item; source-named deliverable is… |
| 120_CDR | 134 | 제작사양서(WPS)및검사요구 | partially_supported | SE가이드북2017 p.106 (PCA 관련자료: 조립절차서·시험절차서·제작지침서); SE실무지침서 부록D (공정규격서 Type D) | manufacturing/process specs appear as PCA inputs and as Type D specs, not as a CDR… |
| 120_CDR | 135 | 제조관점설계검토결과 | partially_supported | 규정 제56조④6 (PDR/CDR 기품원 양산관점 품질보증의견); SE가이드북2017 p.84 (CDR: MRA 계획 최신화) | source assigns manufacturing-perspective review to 기품원 opinion / MRA, not to a developer… |
| 120_CDR | 136 | 제조공정도및작업표준(Flow) | partially_supported | SE가이드북2017 p.106 (PCA: 제작지침서), p.115 (PRR 제작공정·공정지시서); SE실무지침서 §4.8 | process flow docs are PRR/PCA inputs in the sources |
| 120_CDR | 137 | 요구사항추적표(RTM)_업데이트 | partially_supported | SE가이드북2017 p.86 (CDR 종료: 추적성 누락 없음) | criterion, not a named deliverable |
| 120_CDR | 138 | 안전성및신뢰성분석_F | source_supported | SE가이드북2017 p.84-85 (CDR Check-List RAM 분석·FMECA·신뢰도 성장); 규정 제76조⑤ (RAM 분석자료·결과 보고서, mandatory 체계개발) |  |
| 120_CDR | 139 | CDR_회의록및조치결과 | source_supported | SE가이드북2017 p.87 (CDR 수행 결과서 [F]); 규정 제79조② |  |
| 120_CDR | 140 | HW요구사항명세서(HRS)_F | partially_supported | SE가이드북2017 p.73 (HRS [F] at PDR), p.77-78 (CDR input HRS) | HRS is finalized at PDR in the source; at CDR it is an input |
| 120_CDR | 141 | SW요구사항명세서(SRS)_F | partially_supported | SE가이드북2017 p.73 (SRS [F] at PDR) | same timing mismatch |
| 120_CDR | 142 | 통합시험계획서절차서(STP)_D | source_supported | SE가이드북2017 p.84 (CDR: SW 단위·통합시험계획), p.89 & p.95 (체계통합시험계획서/절차서·결과서 TRR 진입); SE실무지침서 §4.5 (CDR 산출물 형상항목별 시험절차서) |  |
| 120_CDR | 143 | 제품형상식별서(PCI)_D | source_supported | SE가이드북2017 p.87, p.83 (제품규격서(안) [D] at CDR → 초기 제품기준선); SE가이드북2024(OCR) pdf p.82 (CDR 산출물 6) 제품형상식별서(안), 국방규격 초안 II) |  |
| 150_TRR_DT | 154 | 협력사발주문서 | unsupported | NOT_FOUND in 규정 / 훈령 / SE가이드북2017 / SE실무지침서 | procurement PO — LIG purchasing procedure |
| 150_TRR_DT | 155 | 원자재성적서및COC | unsupported | NOT_FOUND (2017 guidebook grep COC = 0) | LIG material certification requirement |
| 150_TRR_DT | 156 | 부품COC(제조사또는대리점) | unsupported | NOT_FOUND | LIG parts certification requirement |
| 150_TRR_DT | 157 | 위조품검사성적서(Offer_COC) | unsupported | NOT_FOUND | LIG counterfeit-part inspection |
| 150_TRR_DT | 158 | 일솜씨검사결과(Q5) | unsupported | NOT_FOUND | LIG workmanship gate |
| 150_TRR_DT | 159 | 시제제작기록(공정확인표) | partially_supported | SE가이드북2017 p.106 (PCA: 품질보증 불량발생 이력·조치현황), p.131-132 (PCA 점검표 검사문서·제조기술문서); SE실무지침서 §4.9 (PCA inputs 검사 및 납품조서) | build records appear as PCA evidence, not as a named TRR deliverable |
| 150_TRR_DT | 160 | SW산출물명세서(SPS_VDD) | source_supported | SE가이드북2017 p.95 (TRR Check-List: SPS/SVD 등 SW 기술문서); SE가이드북2024(OCR) pdf p.93 (printed p.89) (TRR 산출물 4) SW산출물명세서(SPS), 5) SW목록명세서(SCS)) |  |
| 150_TRR_DT | 161 | SW시험계획절차서(STP_STD) | source_supported | SE가이드북2017 p.95 (TRR: SW 단위/통합시험 수행·결과 확인); SE가이드북2024(OCR) pdf p.93 (TRR 산출물 2) SW통합시험계획서(STP), 3) SW통합시험절차서(STD)) |  |
| 150_TRR_DT | 162 | SW시험결과서(STR) | source_supported | SE가이드북2017 p.95 (SW통합시험결과서); SE가이드북2024(OCR) pdf p.93 (STR) |  |
| 150_TRR_DT | 163 | SW신뢰성시험결과(Q6) | source_supported | SE가이드북2017 p.84 (CDR: SW 신뢰성·보안성 시험 대상), p.95 (TRR 결과 확인); 훈령 제64조④ (SW신뢰성 시험 DT 이전 수행 가능) | 'Q6' label is LIG's; SW reliability test itself is source-listed |
| 150_TRR_DT | 164 | 수락시험절차서(ATP)_F | partially_supported | SE가이드북2017 p.106 (PCA 관련자료: 수락시험 절차(QAR 포함) 및 시험자료), p.99 (FCA 점검표 수락시험 절차); SE실무지침서 §4.9 | acceptance test procedure is listed as FCA/PCA input, not at TRR; subcontractor ATP is… |
| 150_TRR_DT | 165 | 시험평가기본계획서(TEMP)_F | source_supported | 훈령 제63조 (TEMP 별지4, CDR 종료 후 3개월 이내 확정, mandatory); SE가이드북2017 p.83 (CDR TEMP), p.97 (TRR 산출물 시험평가계획서 [F]) | TEMP is 합참/국방부-confirmed; source finalizes it at CDR+3M — variant's TRR placement is… |
| 150_TRR_DT | 166 | 통합시험계획서절차서(STP)_F | source_supported | SE가이드북2017 p.89, p.90, p.97 (체계통합시험계획서/절차서·결과서 as TRR input) |  |
| 150_TRR_DT | 167 | 수락검사성적서(FAT_Q7)_F | partially_supported | SE가이드북2017 p.106 (PCA: 수락시험 절차 및 시험자료), p.99 (FCA 점검표 수락시험 결과) | acceptance test results are FCA/PCA evidence in the sources; FAT/Q7 is LIG-level |
| 150_TRR_DT | 168 | TRR_회의록및시험준비검토 | source_supported | SE가이드북2017 p.97 (TRR 수행결과서 [F]), p.88; 훈령 제65조①, 제68조① (TRR DT/OT 15일 전); 규정 제79조② |  |
| 150_TRR_DT | 169 | 개발시험평가결과(DT) | source_supported | 훈령 제66조① (개발시험평가결과보고서 별지6, DT 종료 1개월 이내); SE가이드북2017 p.90 |  |
| 180_FCA_OT | 184 | 입고검사결과(Q8) | unsupported | NOT_FOUND | LIG incoming inspection gate |
| 180_FCA_OT | 185 | 납품원장및인수증 | partially_supported | SE실무지침서 §4.9 (PCA inputs: 검사 및 납품조서) | delivery/acceptance records are PCA evidence, not an FCA/OT deliverable |
| 180_FCA_OT | 186 | 현장수락시험결과(SAT) | partially_supported | SE가이드북2017 p.99 (FCA 점검표 수락시험 절차·결과), p.106 (PCA 수락시험 자료) | generic 수락시험 evidence; SAT is LIG-level |
| 180_FCA_OT | 187 | 설치및시운전기록(STW) | unsupported | NOT_FOUND (시운전 appears only for 함정 후속함: 규정 제93조 — not this business type) | installation/commissioning record not defined for 체계개발 in sources |
| 180_FCA_OT | 188 | 체계통합지원결과 | partially_supported | SE가이드북2017 p.89 (체계통합시험결과서 TRR 입력), p.88 | the source deliverable is the prime's 체계통합시험결과서; subcontractor 'support results' is… |
| 180_FCA_OT | 189 | 기능형상확인결과보고서(FCA) | source_supported | SE가이드북2017 p.104 (기능적형상확인 결과보고서 [F]), p.133 (E-9 서식); 규정 제56조④5, 제79조② (체계기능형상확인) |  |
| 180_FCA_OT | 190 | 요구사항검증매트릭스(VCRM)_F | partially_supported | SE가이드북2017 p.99, p.101, p.135 (국방규격화연계표), p.96-97 (TRR 요구조건-시험 추적성) | the source-named artifact is 국방규격화연계표 (requirement→spec→test linkage); 'VCRM' term not… |
| 180_FCA_OT | 191 | 운용시험평가지원자료(OT) | source_supported | 훈령 제67~69조 (OT&E mandatory), 제69조① (OT 결과 별지8); SE가이드북2017 p.91-92 | OT itself is 소요군-led; developer supports |
| 180_FCA_OT | 192 | FCA_OT_회의록및조치결과 | source_supported | SE가이드북2017 p.104 (FCA 산출물·보완 요구목록), p.25; SE실무지침서 §4.7 (FCA 회의록 IPT 승인) |  |
| 180_FCA_OT | 193 | 개발시험결과보고서(DT)_종합본 | source_supported | 훈령 제66조① (별지6); SE가이드북2017 p.99 (FCA 관련자료: 시험평가 결과) | duplicate of task 169 content |
| 180_FCA_OT | 194 | 결함조치결과보고서(Defect) | partially_supported | SE가이드북2017 p.100 (형상확인 보완 요구목록), p.99 (예외/유보사항 목록), p.92 (OT 결함사항); 훈령 제69조⑤⑥ (조건부 적합 보완계획) | defect handling exists as 보완요구/예외유보 lists; no 'defect report' deliverable named |
| 180_FCA_OT | 195 | 제품형상식별서(PCI)_Prelim | source_supported | SE가이드북2017 p.123 (부록 D: 제품규격서 FCA [P]), p.99 (FCA 관련자료 제품규격서 최종 초안) |  |
| 210_PCA | 214 | 물리형상확인결과보고서(PCA) | source_supported | SE가이드북2017 p.111 (물리적형상확인 결과보고서 [F]), p.134 (E-10); 규정 제79조② |  |
| 210_PCA | 215 | 최종도면(As-Built)_F | source_supported | SE가이드북2017 p.106 (PCA 관련자료: 국방도면(부품번호) 초안), p.31 (제품기준선 도면), p.131-132 (HW 형상일치성) | 'As-Built' term not in source (grep 0) but 실물-도면 일치 확인 is the PCA purpose |
| 210_PCA | 216 | 자재명세서(Q-BOM)_F | source_supported | SE가이드북2017 p.31 (제품기준선: 부품목록); SE가이드북2024(OCR) pdf p.27; p.131-132 (PCA 점검표 부품 선정 목록) |  |
| 210_PCA | 217 | 시험성적서통합본 | source_supported | SE가이드북2017 p.106 (PCA: 수락시험 절차 및 시험자료, FCA 후속조치 결과), p.99 (FCA 시험평가 결과) |  |
| 210_PCA | 218 | 부적합및면제요청서(NCR) | source_supported | SE가이드북2017 p.106 (형상통제(기술변경·규격완화·면제) 현황), p.132 (제품 부적합(NCR) 목록확인) (규격완화/면제 절차 준수) |  |
| 210_PCA | 219 | 최종제품보증서(COC_CoA) | unsupported | NOT_FOUND | LIG delivery quality certificate |
| 210_PCA | 220 | 기술자료패키지목록(TDP) | source_supported | 규정 제81조② (체계개발결과보고서+기술자료묶음, 완료 후 2개월 이내, mandatory); SE가이드북2017 p.30 (TDP 정의), p.83 |  |
| 210_PCA | 221 | PCA_회의록및조치결과 | source_supported | SE가이드북2017 p.111 (PCA 산출물·보완 요구목록), p.107 |  |
| 210_PCA | 222 | 연동통제문서(ICD) | partially_supported | SE가이드북2017 p.87 (ICD [F] at CDR); SE가이드북2024(OCR) pdf p.27 (제품기준선 대상에 ICD 포함) | ICD is finalized at CDR; at PCA it is only re-confirmed as part of the product baseline |
| 210_PCA | 223 | 제품형상식별서(PCI)_F | source_supported | SE가이드북2017 p.123 (제품규격서 PCA [F]), p.35; SE가이드북2024(OCR) pdf p.107 (printed p.103) (PCA 산출물 2) 제품형상식별서) |  |
| 210_PCA | 224 | 상세설계도면_F(PCA) | source_supported | SE가이드북2017 p.106 (국방도면 초안); 규정 제80조① (국방규격(안) → 제정 건의) | overlaps task 215 |
| 240_LL | 244 | 협력개발품개발이력서 | partially_supported | 규정 제5조① (사업관리이력서 — IPT-level), 제118조의15③ (변경내역서·연구노트, 협약사업 성실수행평가) | development history docs exist at IPT/협약 level; LIG's 협력개발품 이력서 is analogous only |
| 240_LL | 245 | 실패사례요약서 | unsupported | NOT_FOUND (2017 guidebook grep 교훈/Lessons = 0) |  |
| 240_LL | 246 | 개발이력공유회결과 | unsupported | NOT_FOUND |  |
| 240_LL | 247 | 사업종료보고서 | partially_supported | 규정 제81조② (체계개발결과보고서 별지14), 제55조① (집행종결보고서 별지6, IPT); SE실무지침서 §4.10.5 (사업종결 회의) | source-required close-out documents are the prime's 체계개발결과보고서 and IPT's 집행종결보고서; LIG G6… |

**빠진 필수 항목 (17건)**

| gate/phase | 항목 | mandatory | 출처 + 인용 |
|---|---|---|---|
| CDR (체계개발 종료 전 / 양산 진입 심의) | 제조성숙도평가(MRA) 계획 및 결과 (MRL 8 목표) | mandatory | 규정 제78조③, 제79조③, 제56조⑦⑧; SE가이드북2017 p.84 (CDR: MRA 계획 최신화) |
| CDR 이전 | 사업중간점검 결과보고서 (별지27) — 체계개발 CDR 종료 이전 필수 (IPT 수행; 개발업체 입력자료) | mandatory | 규정 제65조①, ③④ |
| PCA / 체계개발 종료 | 국방규격(안) 및 국방규격화연계표 (DT로 검증, OT 적합 판정 후 제정 건의; 체계개발 종료시점 = 국방규격화 완료) | mandatory | 규정 제80조①③, 제81조①; SE가이드북2017 p.99, p.135 (국방규격화연계표) |
| PCA / 사업종결 | 체계개발결과보고서 (별지14) + 기술자료묶음 DTiMS 탑재 (완료 후 2개월 이내) — variant has only TDP 목록(220) and LIG 사업종료보고서(247) | mandatory | 규정 제81조②; SE실무지침서 §4.10.5 |
| TRR_DT | 개발시험평가계획(안)/개발시험평가계획서 (별지5, DT 착수 2개월 전 제출) 및 시험평가절차서(DT) — variant has TEMP_F/STP_F only | mandatory | 훈령 제64조①②, 제60조②2; SE가이드북2017 p.89, p.97 |
| FCA_OT | 운용시험평가계획(안)/계획서 (별지7) 및 상호운용성시험평가계획(안) — 소요군/합동상호운용성기술센터 문서, 개발업체 입력 지원 | mandatory | 훈령 제67조②③⑤, 제67조①⑥ |
| SRR (기술계획문서 최신화 slot) | 예비시험평가기본계획서(P-TEMP) — SRR 산출/SFR 최신화 (variant folds into TEMP_D) | mandatory | 규정 제73조② (탐색개발 산출); 훈령 제63조①; SE가이드북2017 p.34, p.46 |
| SRR~PCA (기술계획문서 [U] 최신화) | M&S 활용계획 (수명주기 단계별, SBA 등록) — 가이드북 각 회의 기술계획문서 최신화 항목 | mandatory | 규정 제64조①; SE가이드북2017 p.27, p.47, p.85 |
| SRR~TRR | 상호운용성 확보계획 (획득단계별) 및 연동합의문서 → ICD (variant has ICD but no 확보계획/수준측정/SCT slot) | mandatory | 규정 제41조, 제42조; SE가이드북2017 p.46-47, p.84 |
| SRR~TRR | RAM 업무계획 (SRR 수립·단계별 최신화) 및 RAM 분석자료(전산파일)·RAM 분석결과 보고서 (소요군 제출) — variant only has 안전성및신뢰성분석_F at CDR | mandatory | 규정 제76조⑤, 제56조④6; SE가이드북2017 p.47, p.95-96 |
| PDR | 등록부품활용계획 (제안 시 제출, 체계개발실행계획 포함, PDR 반영) → 국산화기본계획 | mandatory | 규정 제27조⑧, 제76조⑥, 제79조④ |
| CDR~TRR_DT | 핵심부품·구성품 선정 기준 및 공인시험기관 시험 성적서 (CDR까지 시험대상 선정, DT 결과에 포함) — variant's 원자재/부품 COC and 시험성적서통합본 are not this item | mandatory | 규정 제79조①⑤⑥, 제81조③6 |
| 020_MGMT / SRR | 업무분할구조(WBS) 관리방안 (EVM 적용사업; 미적용도 대안 마련) — variant lists WBS/IMS only as an option | conditional | 규정 제78조⑨, 제63조① |
| SRR (기술계획) / MGMT | 형상관리계획서 (및 SW 형상관리계획) — SRR에서 형상관리 계획 수립, 각 회의 형상관리체계 최신화 확인; variant lists CMP only as option | recommended | SE가이드북2017 p.45, p.47, p.48; 훈령 제158조 |
| FCA_OT / PCA | 기능적형상확인 계획서·점검표 (E-7) 및 물리적형상확인 계획서·점검표 (E-8), 품질보증요구서(QAR) — variant has only 결과보고서 folders | recommended | SE가이드북2017 p.99, p.106, p.130-132 |
| 체계개발 종료 → 양산 계약 전 | 양산 계약 이전 제출 자료(연구개발보고서, 시험절차서, 국산화 이행현황, OT 보완 조치계획, 기술교범, FMECA 등) 및 양산 지원 자료(개발시제 원가자료, 부품국산화 이행실적, 부품단종관리 계획서 등) — 기품원·국기연 제출 | mandatory | 규정 제81조③, 제81조④ |
| SRR~CDR (업체주관 연구개발) | 공식기술검토회의 자료 (회의 2주 전 IPT·신속원 제출; 신속원 진입조건 충족 검토 1주 전) — variant has 회의록 slots but no 검토자료 제출본 slot | mandatory | 규정 제70조③, 제78조⑧; SE가이드북2017 p.41, p.52 |

### 3.2 `exploratory_dev_common_no_grade` — 탐색개발 (SE_FolderTree_ExploratoryDev_Basic.md; 주계약사 공통, 품질등급 없음)

| 지원 | 부분 | 미지원 | 내부관리 | 상충 | 빠진 필수 | 합계 task |
|---:|---:|---:|---:|---:|---:|---:|
| 12 | 23 | 0 | 21 | 0 | 14 | 56 |

- 게이트: 030_SRR 체계요구조건검토 (tasks 31-38), 060_SFR 체계기능검토 (tasks 61-68), 090_PDR 기본설계검토 (tasks 91-98), 120_CDR 상세설계검토 (tasks 121-128), 150_TRR 시험준비상태검토 (tasks 151-158), 180_FCA 기능적형상확인 (tasks 181-188), 210_PCA 물리적형상확인 (tasks 211-218)
- spine 판정: **불일치(MISMATCH, partial) — SRR만 출처 지원, SFR 부분, PDR~PCA 탐색개발 근거 없음**
- 판정 근거(요약): 정본의 탐색개발 spine은 (탐색개발기본계획·RFP·실행계획서) → SRR → 핵심기술 입증(모형/시제 시험, M&S) → 운용성확인 → TRA(TRL 6) → ROC 결정·P-TEMP → 탐색개발결과보고서 → 체계개발 진입 심의(규정 제56조③·제70~73조; 훈령 제52조④⑤·제76조; SE가이드북2017 p.39; TE가이드북2012 Page 40/57). 규정 제56조④5는 SFR/PDR/CDR/TRR/DT&E·OT&E/FCA/PCA를 체계개발에 배정하므로 SRR gate만 지원, SFR은 SE실무지침서 표6(탐색개발 표에 병기)로 부분, PDR~PCA는 어느 정본에도 탐색개발 근거 없음(PCA는 양산기준설정 목적, FCA는 DT 후 감사). tailoring 조항(규정 제7조③·제56조④5, SE가이드북2017 p.29)이 7검토 어휘를 내부 시제 설계검토에 재사용하는 것을 막지는 않으나 요구하지도 않음. variant의 핵심 실체(TRA 36, 운용성확인 67·185, 결과보고서 216, 진입판단 217)는 존재하나 체계개발 명명 게이트 아래 분산되고, 체계개발 전용 산출물(DT 결과·IDD_F·PCI_F·As-Built·TEMP_D)이 탐색개발로 유입됨. (비교기 원문 판정문은 JSON `spine_verdict`)
- 내부관리(정본 판정 제외) 21건: SRR 31/32/33; SFR 61/62/63; PDR 91/92/93; CDR 121/122/123; TRR 151/152/153; FCA 181/182/183; PCA 211/212/213 (INBOX_분류전·LOG_의사결정조치기록·TDP_기술자료)

| gate | task | task명 | 판정 | 근거 출처 | note |
|---|---|---|---|---|---|
| SRR | 34 | 운용개념(CONOPS) | source_supported | 규정 제72조①② (탐색개발에서 체계운용개념 확정·확인); SE실무지침서 표3 순서1-3 운용개념서(OCD)/ORD, 표6 A4-1 체계운용개념 (page 35) | 규정은 CONOPS라는 문서명을 쓰지 않고 '체계운용개념 확정'을 탐색개발 내용으로 규정; OCD 문서는 SE실무지침서(소요군 작성). |
| SRR | 35 | 탐색개발실행계획서 | source_supported | 규정 제68조① 별지10, 제69조①, 제70조①; 훈령 제76조②③ (운용성확인계획 포함); SE실무지침서 표5 A4 | 의무 문서. 계약 전 확정되는 문서라 SRR 폴더 앞부분 배치는 무리 없음. |
| SRR | 36 | 기술성숙도및TRA자료 | source_supported | 규정 제56조③4, 제70조④, 제72조③ (TRL 6 목표), 제56조⑦⑬ (TRA 결과보고서); SE가이드북2017 p.46 (탐색개발 사업 SRR에서 TRA 계획 점검); SE실무지침서 §2.3.3 | 탐색개발 핵심 필수 항목. |
| SRR | 37 | 체계요구사항명세서(SSRS)_D | source_supported | 규정 제70조⑤ (탐색개발에서 예비 체계요구사항명세서 작성); SE가이드북2017 p.49 (SRR 산출 SSRS [F]); SE실무지침서 표6 B6-2, §3.4.2 | 가이드북은 SRR에서 SSRS를 [F]로 두므로 '_D'(초안) 표기는 가이드북과 다르나 규정의 '예비 SRS'와는 부합. |
| SRR | 38 | SRR_회의록및조치결과 | source_supported | 규정 제56조③3 (탐색개발 SRR), 제70조③ (공식기술검토회의 자료 2주 전 제출·진입조건 검토·후속조치); SE가이드북2017 p.39 (탐색개발 후반부 SRR), p.49 (SRR 수행결과서), p.28 (회의록·Action Item); SE실무지침서 §4.2 | SRR은 탐색개발 단계의 규정상 검토회의. |
| SFR | 64 | 체계요구사항명세서(SSRS)_F | partially_supported | SE가이드북2017 p.49 (SSRS [F]는 SRR 산출), p.60 (SFR 기능기준선 문서는 체계규격서 SSS [F]), p.50-51 (SFR은 체계개발 초기); SE실무지침서 표6 B7-2 (탐색개발 표에 SFR·체계규격서), §3.5.2 (체계개발 초기) | SSRS 확정본은 SRR 산출물이며 SFR 기준선 문서는 체계규격서; SFR 자체는 2017 가이드북 기준 체계개발 초기(실무지침서 표6은 탐색개발 표에 병기). |
| SFR | 65 | 기능분석및할당자료 | partially_supported | SE실무지침서 표6 B7-1/B7-2 (요구사항 기능 할당·기능흐름블록선도, 탐색개발 표), 표4 B2 기능분석 및 할당 (선행연구), §3.5 (체계 기능분석은 체계개발 초기); SE가이드북2017 p.45 (기능분석 통한 설계조건 구체화 점검) | 기능분석·할당은 SE실무지침서에 명시되나 수명주기상 체계개발 초기 활동; 규정·훈령에는 미등장. |
| SFR | 66 | 요구사항추적표(RTM) | partially_supported | SE실무지침서 §5.8 REQM 요구사항 추적 매트릭스, §5.7; SE가이드북2017 p.59 (SFR 종료조건 추적성), p.13 | 추적 매트릭스는 단계 무관 프로세스 산출물로 권고됨; 2017 가이드북은 '추적성'만 요구하고 RTM 문서명은 없음; 탐색개발 특정 근거 NOT_FOUND. |
| SFR | 67 | 운용성확인계획및평가기준 | source_supported | 규정 제56조③3, 제72조④; 훈령 제76조③④ (운용성확인계획(안) 항목·기준, 합참 확정 계획서); SE실무지침서 표5 A4-2, 표6 A8; TE가이드북2012 (탐색개발 운용성확인계획 검토) | 탐색개발 필수. 다만 계획(안) 작성주체는 소요제기기관(mnd 제76조③)이며 SFR 게이트 귀속은 출처 근거 없음. |
| SFR | 68 | SFR_회의록및조치결과 | partially_supported | 규정 제56조④5 (SFR은 체계개발 수행내역), 제56조③3 (탐색개발 검토는 SRR만); SE가이드북2017 p.50-51 (체계개발 초기, 필요시 SRR과 동시); SE실무지침서 표6 A7/B7 (탐색개발 표에 SFR 기재), §3.5.2 | 규정·2017 가이드북은 SFR을 체계개발 검토로 분류; SE실무지침서 표6만 탐색개발 프로세스표에 병기 → 다른 단계 근거. |
| PDR | 94 | 기본설계기술서_D | partially_supported | SE가이드북2017 p.73 (PDR 산출 SSDD [F], 체계개발), p.62 (PDR 시기 체계개발); 규정 제72조② (탐색개발은 개략적 체계구성 확인) | 기본설계기술서는 체계개발 PDR 산출; 탐색개발 근거는 '개략적 체계구성' 수준. |
| PDR | 95 | 대안분석(Trade_Study) | source_supported | 규정 제72조① (탐색개발에서 임무 충족 여러 방안 비교연구); SE실무지침서 표6 B4 체계 대안 정의, 표4 B10 종합·절충·분석; SE가이드북2017 p.59, p.86 (비용·성능 절충분석, 필요시) | 항목 자체는 탐색개발 필수 활동(비교연구)이나 인용 출처(가이드북)는 필요시 절충분석만 언급; PDR 게이트 귀속 근거 없음. |
| PDR | 96 | 연동통제문서(ICD)_Prelim | partially_supported | SE가이드북2017 p.49 (SRR ICD(안)[D]), p.73 (PDR ICD [P]), p.87 (CDR [F]); 규정 제43조① (상세설계 완료 전 확정), 제72조② (탐색개발 M&S 연동 확인), 제41-42조 | ICD 초안은 체계개발 기준선 문서; 탐색개발은 M&S 연동 확인·상호운용성 확보계획 수준. |
| PDR | 97 | 시험평가기본계획서(TEMP)_D | partially_supported | 규정 제56조③3, 제73조② (탐색개발결과보고서 제출 시 예비시험평가기본계획서); 훈령 제63조①③ (TEMP는 체계개발 CDR 후 3개월 내 확정); SE가이드북2017 p.46 (P-TEMP, 미작성 시 TEMP(안)에 포함); TE가이드북2012 (탐색개발 P-TEMP / TEMP는 체계개발) | 탐색개발 필수 문서는 예비시험평가기본계획서(P-TEMP); 'TEMP_D' 명칭은 체계개발 PDR 문서이고 제출 시점도 탐색개발 종료 시. 명칭을… |
| PDR | 98 | PDR_회의록및조치결과 | partially_supported | 규정 제56조④5·6 (PDR은 체계개발 수행내역), 제56조③3 (탐색개발 검토는 SRR); SE가이드북2017 p.62 (체계개발 기본설계 완료 후) | PDR을 탐색개발에 두는 출처 NOT_FOUND; 체계개발 검토회의. |
| CDR | 124 | 상세설계패키지 | partially_supported | SE가이드북2017 p.87 (CDR 산출 HDD/SDD/IDD [F], 제품규격서(안)), p.76 (체계개발 시제제작 전); SE실무지침서 §4.5, 표8 B7 (체계개발) | 상세설계 산출물은 체계개발 CDR 소관; 탐색개발 근거 NOT_FOUND. |
| CDR | 125 | 인터페이스설계기술서(IDD)_F | partially_supported | SE가이드북2017 p.87 (CDR IDD [F], 필요시 SDD 포함), p.73 (PDR IDD(안)) | 체계개발 CDR 산출; 탐색개발 근거 NOT_FOUND. |
| CDR | 126 | 구현및시제제작준비자료 | source_supported | 규정 제56조③1 (탐색개발 모형제작·시험 또는 시제품 제작·시험으로 기술 입증), 제68조② (시제개발계획, 국과연주관), 제69조④ (시제생산계획); SE실무지침서 §2.3.1, 표5 A1-6 시제품관리계획 | 탐색개발 시제 제작은 규정상 활동; CDR 게이트 귀속은 체계개발 가이드북(CDR 종료=시제제작 진행 동의 p.86)에서 차용. |
| CDR | 127 | 위험관리및잔여과제 | source_supported | 규정 제39조①6 (위험관리 [필수] 중점관리사항), 제63조③ (체계공학 절차 적용); SE실무지침서 표5 B3-3 위험관리 계획 (탐색개발 SEMP), §5.4 RSKM; SE가이드북2017 p.40, p.48 (각 검토회의 위험평가·관리자료) | 위험관리 자료는 전 단계·전 검토회의 필수. 변형이 인용한 '과학적사업관리 수행지침'은 이번 출처 세트에 없음(UNKNOWN); CDR 게이트 귀속은 임의. |
| CDR | 128 | CDR_회의록및조치결과 | partially_supported | 규정 제56조④5, 제65조① (사업중간점검은 체계개발 CDR 이전); 훈령 제63조③ (CDR 후 TEMP), 제15조③ (CDR 직후 최종 ROC 제기); SE가이드북2017 p.76 | CDR은 모든 출처에서 체계개발 검토회의; 탐색개발 근거 NOT_FOUND. |
| TRR | 154 | 시험준비상태검토자료(TRR) | partially_supported | 규정 제56조④5 (TRR 체계개발); 훈령 제65조①, 제68조① (DT/OT 15일 전); SE가이드북2017 p.88; TE가이드북2012 (DT-TRR/OT-TRR 체계개발) ('운용성확인 TRR 참석' 언급) | TRR은 체계개발 DT/OT 전 검토; TE실무가이드북2013에 '운용성확인 TRR' 참석 문구가 있어 탐색개발 준용 여지만 존재. |
| TRR | 155 | 시험절차서및항목 | partially_supported | SE가이드북2017 p.89, p.35 (TRR 시험평가절차서, 체계개발); 훈령 제76조③4 (운용성확인 항목 및 기준); TE가이드북2012 (운용성확인 확인방법 및 절차) | 탐색개발에서는 운용성확인 항목·기준·절차가 대응; DT/OT 시험절차서는 체계개발. |
| TRR | 156 | 시험자원준비상태 | partially_supported | SE가이드북2017 p.89-90 (TRR 진입기준: 시험환경 구축, 기관별 준비); 훈령 제76조③2·5·6 (운용성확인 대상장비·예산·인원); TE가이드북2012 (가용시제·인원·장소) | 체계개발 TRR 항목; 탐색개발은 운용성확인계획의 대상장비·인원으로 부분 대응. |
| TRR | 157 | 안전보안환경확인 | partially_supported | SE가이드북2017 p.89-90 (TRR 안전문제 식별·대처), p.44 (안전·보안 요구조건); 훈령 제52조⑤1 (탐색개발결과보고서에 방첩사 보호대책 검토결과 포함) | 시험 안전은 체계개발 TRR 항목; 보안 측면은 훈령이 탐색개발결과보고서에 방첩사 검토결과를 요구(별도 필수항목으로 missing 목록에 기재). |
| TRR | 158 | TRR_회의록및조치결과 | partially_supported | 규정 제56조④5, 제79조② (체계개발 검토결과 IPT장 제출); 훈령 제65조①; SE가이드북2017 p.97 (TRR 수행결과서) | 체계개발 검토회의; 탐색개발 근거는 운용성확인 TRR 언급(TE가이드북2012)뿐. |
| FCA | 184 | 개발시험결과(DT) | partially_supported | 규정 제56조④5 (DT&E는 체계개발), 제56조③1 (탐색개발 시제품 제작·시험으로 기술 입증); 훈령 제59조①, 제64-66조; TE가이드북2012 (시험평가는 탐색개발 운용성확인 + 체계개발 DT/OT로 구분 원칙) (탐색개발 운용성확인은 판정 없음) | 공식 개발시험평가(DT&E)는 체계개발 전용; 탐색개발의 시제 시험은 '기술 입증' 활동으로 명칭 'DT' 사용은 출처와 불일치. |
| FCA | 185 | 운용성확인결과 | source_supported | 규정 제56조③3, 제118조의11① (협약사업 최종평가 운용성확인 기반); 훈령 제76조⑤⑥ (운용성확인결과보고서 1개월 내, 합참 검토의견); TE가이드북2012 | 탐색개발 필수 산출. FCA 게이트 귀속은 출처 근거 없음. |
| FCA | 186 | 요구사항검증매트릭스(VCRM)_F | partially_supported | SE가이드북2017 p.96-97 (TRR 요구조건-시험 추적성), p.104 (FCA 종료조건 추적성); SE실무지침서 §5.8, 부록 ('요구사항 입증 및 추적 매트릭스') | VCRM 명칭은 출처에 없고 추적성 요구만 존재; 단계 특정 근거 NOT_FOUND. |
| FCA | 187 | 결함및조치결과 | partially_supported | 훈령 제76조⑤5 (운용성확인결과보고서에 주요 결함사항·문제점·개선사항 포함); SE가이드북2017 p.100 (형상확인 보완 요구목록); TE가이드북2012 (제5절 결함 발생시 업무처리, DT/OT) | 탐색개발에서는 운용성확인결과보고서 내 결함사항으로 흡수; 독립 산출물 근거 없음. 인용 출처(과학적사업관리 수행지침)는 세트 외. |
| FCA | 188 | FCA_회의록및조치결과 | partially_supported | 규정 제56조④5 (체계기능형상확인은 체계개발), 제79조②; SE가이드북2017 p.98 (DT 후 OT 전), p.104 (FCA 결과보고서) | FCA는 체계개발 시험평가 후반부 활동; 탐색개발 근거 NOT_FOUND. |
| PCA | 214 | 제품형상식별서(PCI)_F | partially_supported | SE실무지침서 §5.5 형상식별서(기능/개발/제품) (page 139), §4.9 PCA 제품 기준선; SE가이드북2017 p.111 (PCA 제품기준선·제품규격서 [F]), p.105 (규격화 간, 양산착수 전) | 제품형상식별서/제품기준선은 체계개발 규격화·양산 전 산출; 탐색개발 근거 NOT_FOUND. |
| PCA | 215 | 기준선및As_Built자료 | partially_supported | SE실무지침서 §4.9 (실제 형상 vs 관련 문서, 제품 기준선); SE가이드북2017 p.35 (PCA 실제형상-설계문서 일치), p.31 (기준선 모델) | 방위사업관리규정에는 해당 명칭·요구 없음(제56조④5 PCA 목적=양산기준설정); SE 지침류의 체계개발 PCA 산출. |
| PCA | 216 | 탐색개발최종보고서 | source_supported | 규정 제73조① (탐색개발결과보고서 별지11, 완료 1개월 내), 제73조②; 훈령 제52조④1·⑤1; SE실무지침서 §4.10.5 사업종결회의, 표6 A10 | 정식 명칭은 '탐색개발결과보고서'(별지11); 명칭 정합 권고. |
| PCA | 217 | 체계개발진입판단자료 | source_supported | 규정 제56조③4 (TRA 결과 체계개발 진입 여부 반영), 제56조⑥⑦ (위원회 심의·TRA/MRA 결과 안건 반영), 제118조의11①; 훈령 제76조⑤6·⑥ (다음 단계 전환 의견) | 탐색개발 종료 의사결정 필수 근거. |
| PCA | 218 | PCA_회의록및조치결과 | partially_supported | 규정 제56조④5 ('양산기준설정 등을 위한 물리적 형상확인'은 체계개발), 제79조②; SE가이드북2017 p.105 (규격화 간, 양산착수 전; PRR 동시 가능) | PCA는 양산기준 설정 목적의 체계개발 말기 활동; 탐색개발 적용 근거 NOT_FOUND. |

**빠진 필수 항목 (14건)**

| gate/phase | 항목 | mandatory | 출처 + 인용 |
|---|---|---|---|
| 탐색개발 계획(SRR 이전) | 탐색개발기본계획서 (별지9, IPT 작성·분과위 확정) | mandatory | 규정 제67조①②; SE실무지침서 표5 A1 |
| 탐색개발 계획(SRR 이전) | 제안요청서(RFP, 운용성확인 부분 포함)·제안서 및 체계공학관리계획서(SEMP)/체계공학계획(SEP) | mandatory (SEMP/SEP: SE 실무지침서 기준; 2017 가이드북은 권고) | 규정 제27조①② (별지1); 훈령 제76조②; SE실무지침서 표5 A2/B1/B2/B3; SE가이드북2017 p.120 |
| SRR / 탐색개발 | 운용요구서(ORD)·사용자 요구사항(안) 및 작전운용성능(안)·기술적/부수적 성능(안) 결정 자료 | mandatory | 규정 제56조③3 (작전운용성능결정), 제37조, 제70조⑤; 훈령 제52조④1, 제15조③⑦, 제57조; SE실무지침서 §3.3.2 |
| SRR / 탐색개발 | 체계규격서(안)/초기 체계규격서 (SRR 산출, 기능기준선 전 단계) | recommended (2017 가이드북) / listed (SE 실무지침서 표6) | SE가이드북2017 p.49, p.34; SE실무지침서 표6 B6-2 |
| 탐색개발 종료 | 예비시험평가기본계획서(P-TEMP) — 탐색개발결과보고서 제출 시 IPT 검토 후 합참 제출 (변형의 'TEMP_D'는 명칭·시점 불일치) | mandatory | 규정 제56조③3, 제73조②; 훈령 제63조①; SE가이드북2017 p.46 |
| 탐색개발 종료 | 체계개발 일정과 소요비용 산출 및 진화적 연구개발전략 수립 자료 | mandatory (진화적 전략은 진화적 ROC 사업 conditional) | 규정 제56조③3; 제111조 |
| 탐색개발 종료 | 주파수 획득 가능성 확인 (탐색개발 종료 시) | mandatory (주파수 소요 무기체계) | 규정 제46조②; 훈령 제88조⑤⑥ |
| 탐색개발 종료 | 방첩사 정보시스템 보호대책 검토결과 (탐색개발결과보고서에 포함) 및 체계개발 착수 전 보호대책 검토 의뢰 | mandatory | 훈령 제52조⑤1·2 |
| 탐색개발 전 기간 | M&S 활용계획(수명주기 단계별) 및 SBA 통합정보체계 등록; 탐색개발 M&S 연동 확인 | mandatory | 규정 제64조①, 제72조②; SE실무지침서 표5 A1-4, 표6 A5-5 |
| 탐색개발 전 기간 | 상호운용성 확보계획(획득단계별) 및 연동합의문서 준비 | mandatory | 규정 제41조, 제42조, 제43조①; SE실무지침서 표5 A4-2 |
| 탐색개발 전 기간 (SW 포함 사업) | 소프트웨어개발계획서(SDP) 및 단계별 SW 기술문서 (IPT 검토·승인) | conditional (SW 포함 무기체계) | 규정 제47조①, 제49조①②, 제50조; SE가이드북2017 p.34 (SRR 산출 SDP) |
| 탐색개발 (조건부) | 사업중간점검 결과보고서 (별지27; 총사업비 1,000억↑ 또는 4년↑ 탐색개발, 운용성확인 이전) | conditional | 규정 제65조③ |
| 탐색개발 (조건부) | 협약사업 탐색개발 최종평가(운용성확인 기반 성공/실패) 및 성실수행평가 제출자료(기술검토회의결과·회의록·SSRS·변경내역서 등) | conditional (협약 연구개발사업) | 규정 제118조의11①, 제118조의15②③ |
| 탐색개발 종결 | 탐색개발 사업종결 회의(종결 1개월 전) 및 탐색개발사업관리계획서(IPT; 운용성확인·TRA·종결방안 포함) | mandatory (SE 실무지침서 기준, 2012 규정 근거) | SE실무지침서 §4.10.5, 표5 A5, §2.3.6 |

### 3.3 `pre_study_common_no_grade` — 선행연구 (SE_FolderTree_PreStudy_Basic.md; 주계약사 공통, 품질등급 없음)

| 지원 | 부분 | 미지원 | 내부관리 | 상충 | 빠진 필수 | 합계 task |
|---:|---:|---:|---:|---:|---:|---:|
| 17 | 18 | 0 | 21 | 0 | 11 | 56 |

- 게이트: 030_SRR 체계요구조건검토, 060_SFR 체계기능검토, 090_PDR 기본설계검토, 120_CDR 상세설계검토, 150_TRR 시험준비상태검토, 180_FCA 기능적형상확인, 210_PCA 물리적형상확인
- spine 판정: **출처 미규정(NOT source-mandated) — 7게이트 모두 선행연구 단계에 없음, 차용 명명틀**
- 판정 근거(요약): 어느 정본도 SRR/SFR/PDR/CDR/TRR/FCA/PCA를 선행연구에 두지 않음: 규정은 SRR을 탐색개발(제56조③3), 나머지를 체계개발(제56조④5·제79조②)에 배정하고 선행연구 세부는 「선행연구 수행지침」(제36조②·제37조①)에 위임(라이브러리 부재). SE가이드북2017은 최초 검토(SRR)를 탐색개발 후반부/체계개발 초기에 두고 선행연구는 ORD 작성단계로만 언급(p.39, p.124), 훈령 제36조는 선행연구를 기술수준·획득방안 조사분석으로 정의. 선행연구 SE 업무를 구조화한 유일한 출처인 SE실무지침서 표4·§2.2.3은 선행연구계획서 → 요구사항/ROC·ORD 분석 → 기능분석·할당 → WBS/PBS → 기술수준·시장·법규 조사 → TRA/진입단계 → 획득방안 개발·비교(LCC) → 획득대안 선정 → 사업추진기본전략(안)+SEP → 위원회 심의의 선형 흐름이며 회의 gate 없음('기술검토(TR) 계획' 수립만). 따라서 7게이트는 차용 명명틀(variant 자체도 명시)이고 상충은 아니지만, 게이트 회의 task 7건과 게이트 전용 산출물(SSRS_F·RTM·기준선·TRR/STP·FCA 요구충족)은 타 단계 항목. 실체 항목 13종은 출처 지원되나 mandatory 종료 산출물인 사업추진기본전략(안) 별지5(규정 제39조①)가 명명 task로 없음. (비교기 원문 판정문은 JSON `spine_verdict`)
- 내부관리(정본 판정 제외) 21건: SRR 31/32/33; SFR 61/62/63; PDR 91/92/93; CDR 121/122/123; TRR 151/152/153; FCA 181/182/183; PCA 211/212/213 (INBOX_분류전·LOG_의사결정조치기록·TDP_기술자료)

| gate | task | task명 | 판정 | 근거 출처 | note |
|---|---|---|---|---|---|
| SRR | 34 | 사업배경및임무정의 | source_supported | SE실무지침서 표4 B1/B1-1/B1-2 소요군 요구사항 분석·초기 ROC·OCD/ORD/OMS-MP 분석 (page 29); §3.2.2 운용개념 도출은 소요결정 및 선행연구 단계 (page 60); 규정 제39조①1·2 사업개요/소요결정사항(필요성 및 운영개념) | 선행연구 SE 프로세스로 명시된 소요군 요구사항·임무 분석에 해당. SRR gate 배치 자체는 근거 없음(선행연구에는 SRR 미규정). |
| SRR | 35 | 선행연구수행계획서 | source_supported | SE실무지침서 표4 A1 선행연구계획서 작성 (page 29); §2.2.3 선행연구계획서 작성·결재 흐름 ⑤⑥⑦ (page 28); 훈령 제122조① 선행연구계획서 9개 항목 (전력지원체계); 규정 제36조② 세부는 「선행연구 수행지침」 — 규정 본문에는 계획서 명칭 NOT_FOUND | 현행 방위사업관리규정 본문에는 계획서 명칭이 없고 수행지침에 위임(NOT_FOUND). 실무지침서(2012 규정 기준)와 훈령(전력지원체계)에서 명시. |
| SRR | 36 | 선행기술자료조사 | source_supported | 훈령 제36조① 기술수준 및 획득방안 조사분석이 포함된 선행연구; SE실무지침서 표4 B5 기술수준 분석·B6 시장조사·B7 획득정책/법규조사·B9 기존장비/타사업 관련성 (page 29); 규정 제7조② 심층적 선행연구; 제59조② 선행연구단계 국내 기술수준 분석·해외 기술보유현황 | 선행연구의 핵심 조사·분석 활동으로 명시. |
| SRR | 37 | 체계요구사항명세서(SSRS)_D | partially_supported | SE가이드북2017 p.49 SSRS [F]는 SRR 산출물; p.39 SRR 시기 = 탐색개발 후반부 또는 체계개발 초기; p.124 선행연구는 ORD 작성단계; SE실무지침서 표3 순서2·3 요구사항 명세서·SSRS는 사용자/체계요구사항 개발(탐색·체계개발) 산출 (page 25); 표4 선행연구는… | SSRS는 탐색개발/체계개발 SRR 산출물. 선행연구에서는 ORD(안) 검토·요구사항 분석 수준만 근거 있음. |
| SRR | 38 | SRR_회의록및조치결과 | partially_supported | 규정 제56조③3 SRR은 탐색개발; 제56조④5 체계개발 SRR은 탐색개발 생략 시에만; SE가이드북2017 p.39 (탐색개발 후반부/체계개발 초기); SE실무지침서 §4.2 SRR 탐색개발 완료시점 (page 79-82); 표4 B13-4 선행연구는 '기술검토(TR) 계획' 수립만 (page 30) | SRR은 선행연구 이후 단계 검토회의. 선행연구에서는 TR 계획 수립만 근거 있음(회의 자체 NOT_FOUND). |
| SFR | 64 | 체계요구사항명세서(SSRS)_F | partially_supported | SE가이드북2017 p.60 SFR 산출은 체계규격서(SSS)[F]→기능기준선(SSRS [F]는 SRR, p.49); p.50-51 SFR은 체계개발 초기; p.124 선행연구=ORD 작성단계 | 기능기준선 문서는 SSS이며 SFR은 체계개발 단계. 선행연구 근거 없음(가이드북 not_found: 선행연구 기술검토회의 NOT_FOUND). |
| SFR | 65 | 기능분석및대안정리 | source_supported | SE실무지침서 표4 B2 기능분석 및 할당(B2-1 기능 분석, B2-2 기능 할당), A2-4 체계방안분석 및 체계개념 설정 (page 29); SE가이드북2017 p.53-54 SFR 기능분석 활동은 체계개발 | 실무지침서가 선행연구 SE 프로세스로 기능분석·할당을 명시. 인용된 가이드북은 체계개발 SFR 문맥. |
| SFR | 66 | 요구사항추적표(RTM) | partially_supported | SE가이드북2017 p.48 SRR 종료조건 추적성; p.59 SFR 종료조건 추적성; p.72-73 PDR 요구조건-설계 추적성 (모두 탐색/체계개발); SE실무지침서 표4 (page 29-30) 선행연구 프로세스에 추적표 NOT_FOUND | 추적성은 탐색/체계개발 기술검토회의 종료조건. 선행연구 산출로는 미언급. |
| SFR | 67 | 운용개념및시나리오분석 | source_supported | 규정 제37조① 선행연구 시 운용요구서(안) 검토; 제39조①2다 필요성 및 운영개념; 제72조① 선행연구에서 정립된 체계운용개념; SE실무지침서 표4 B1-2 OCD/ORD/OMS-MP 분석, A2-5 연동대상 체계 식별 및 운용개념도 (page 29); §3.2.2 (page 60); SE가이드북2… | 선행연구 단계 운용개념 정립·ORD(안) 검토 근거 명확. |
| SFR | 68 | SFR_회의록및조치결과 | partially_supported | 규정 제56조④5 SFR은 체계개발; 제79조②; SE가이드북2017 p.50-51; SE실무지침서 §4.3 체계개발 초기 (page 83-85) | SFR은 체계개발 검토회의. 선행연구 근거 없음. |
| PDR | 94 | 개념설계기술서_D | source_supported | SE실무지침서 표4 A2-4 체계방안분석 및 체계개념 설정 (page 29); §2.3.1 '선행연구로 도출된 체계개념' (page 32); 규정 제72조① 선행연구에서 정립된 체계운용개념; 제86조1 함정 개념설계(소요군); 훈령 제24조⑤ 함정 개념설계를 선행연구 등에 활용 | '개념설계' 문서명은 함정에 한해 명시; 일반 무기체계는 체계개념 설정 프로세스로 지원. 가이드북 SSDD/PDR은 체계개발 문맥이라 인용 출처는 부적합. |
| PDR | 95 | 대안분석(Trade_Study) | source_supported | SE실무지침서 표4 A3-3 획득성능·비용·일정 비교표 및 상호 절충 가능성, A3-5 비용대 효과 분석, B10 종합·절충·분석, B11 획득대안 선정 (page 29); §2.2.3 ⑪ 획득방안 비교 및 분석평가 (page 28); 규정 제39조①5가 연구개발가능성·비용·기술성숙도 등 고려 사업추진… | 선행연구의 핵심(획득대안 비교·절충). 가이드북 인용은 부적합하나 실무지침서·규정으로 지원. |
| PDR | 96 | 기술성숙도및위험평가 | source_supported | 규정 제39조⑨ 선행연구 결과에 따른 다음 단계 진입 판단 TRL 기준; 제39조①6마 [필수] 위험관리방안; SE실무지침서 표4 A2-3 기술성숙도 평가(연구개발 진입단계 설정), A3-4 위험요소 분석 (page 29); §2.2.5 (page 31); 부록A 44 사전 기술성숙도평가(PTMA)는… | 선행연구 필수 판단요소. |
| PDR | 97 | 시험실증개념(TEMP)_D | source_supported | 규정 제39조①6가 [필수] 시험평가 등 추진방안(시험평가 전략); 제39조③6 시험평가전략의 적절성; SE실무지침서 표4 A3-12 시험평가 개략 계획, A4-7 시험평가 전략 (page 30); 훈령 제80조⑥ 선행연구 시 야전운용시험 연구; TEMP 자체는 체계개발(mnd 제63조; SE가이드북2… | '시험평가 개략계획/전략'으로는 필수 근거. TEMP 명칭은 체계개발 문서이며 인용된 '시험평가 가이드북'은 소스 세트에 없음. |
| PDR | 98 | PDR_회의록및조치결과 | partially_supported | 규정 제56조④5·6 PDR은 체계개발; 제79조②; SE가이드북2017 p.62 PDR 시기 체계개발 기본설계 완료 후 | PDR은 체계개발 검토회의. 선행연구 근거 없음. |
| CDR | 124 | 후보안구체화패키지 | source_supported | SE실무지침서 표4 A3 획득방안 수립(A3-1 획득제한요소 분석 포함 체계분석 ~ A3-16), B11 획득대안 선정, A2-8 탐색개발 생략 여부/체계개발 개략 계획 (page 29-30); §2.2.3 ⑨⑩ 획득방안 개발·수립 (page 28); 규정 제39조①5 획득방안 | 획득방안(후보안) 수립·구체화로 지원. 가이드북(CDR) 인용은 부적합. |
| CDR | 125 | 인터페이스영향분석 | source_supported | SE실무지침서 표4 A2-5 연동대상 체계 식별 및 운용개념도, A2-6 무기체계 상호운용성 확보 방안, A4-9 상호운용성 확보계획 (page 29-30); 규정 제39조③4 상호운용성 요구수준 검토; 제41조·제42조 획득 전 단계별 상호운용성 확보계획 | 연동대상 식별·상호운용성 확보방안으로 지원. |
| CDR | 126 | 구현전환가정및제약 | source_supported | 규정 제39조⑨ 다음 단계 진입 판단 기준; 제39조①7 단계 통합·생략 사항; 제39조①6자 부족기술 확보 계획; SE실무지침서 표4 A2-8 탐색개발 생략 여부 또는 체계개발 개략 계획, B13-2 기술성숙 비용/일정 제약사항 (page 29-30) | 연구개발 진입 전제·제약 검토로 지원. |
| CDR | 127 | 기준선후보및형상메모 | partially_supported | SE가이드북2017 p.31 기준선은 SFR(기능)·PDR(할당)·CDR~PCA(제품) 체계개발 단계 설정; 훈령 제158조 형상관리 총수명주기 4구분; 규정 제39조①2나 형상 및 주요 요구성능(기본전략 항목) | 기준선 설정은 체계개발 산출. 선행연구에는 '형상 및 주요 요구성능' 항목만. 인용 출처(표준화 실무지침서)는 소스 세트에 없음. |
| CDR | 128 | CDR_회의록및조치결과 | partially_supported | 규정 제56조④5; 제65조① CDR 이전 사업중간점검; 훈령 제63조③ CDR 후 TEMP; SE가이드북2017 p.76 | CDR은 체계개발 검토회의. 선행연구 근거 없음. |
| TRR | 154 | 실증준비상태검토자료(TRR) | partially_supported | 훈령 제65조① DT TRR 착수 15일 전; 제68조① OT TRR; 규정 제56조④5; SE가이드북2017 p.88 체계통합 후 DT/OT 15일 전 | TRR은 체계개발 시험평가 전 검토. 선행연구 실증 TRR 근거 없음; 인용 출처(시험평가 가이드북) 소스 세트에 없음. |
| TRR | 155 | 시험실증계획서(STP)_D | partially_supported | 훈령 제64조① DT 계획서(별지5) 체계개발; 제67조② OT 계획서(별지7); 선행연구는 SE실무지침서 표4 A3-12 시험평가 개략 계획 (page 30); 규정 제39조①6가 시험평가 전략 | 시험/실증 계획서·절차·판정기준은 체계개발 DT/OT 문서. 선행연구는 개략계획·전략 수준(task 97과 중복). |
| TRR | 156 | 자원및협의준비상태 | partially_supported | SE가이드북2017 p.89-90 TRR 진입기준 시험환경 구축(체계개발); SE실무지침서 §4.6 시험 환경 구축 (page 94-96); 선행연구 근거는 규정 제39조①6가 국내 시험시설·장비·능력 확보 등 시험평가 전략 | 준비상태 확인은 체계개발 TRR 항목. 선행연구는 시험시설·능력 확보 전략 검토 수준. |
| TRR | 157 | 실증안전보안검토 | partially_supported | SE가이드북2017 p.89-90 TRR 안전문제 식별·대처(체계개발); SE실무지침서 §4.6 시험 안전문제 식별 (page 94-96); 훈령 제52조⑤ 방첩사 보호대책 검토는 탐색·체계개발 | 체계개발 TRR/시험평가 항목. 선행연구 단계 안전·보안 검토 산출 NOT_FOUND. |
| TRR | 158 | TRR_회의록및조치결과 | partially_supported | 규정 제56조④5; 제79조②; 훈령 제65조①, 제68조① | TRR은 체계개발 검토회의. 선행연구 근거 없음. |
| FCA | 184 | 대안비교평가결과 | source_supported | SE실무지침서 §2.2.3 ⑪ 수립된 획득방안들에 대한 비교 및 분석평가 (page 28); 표4 A3-3 비교표·B10 종합/절충/분석·B11 획득대안 선정 (page 29); 규정 제39조①5가; 제39조③6·8 획득방안 분석평가 결과 타당성·활용 | 획득방안 비교·분석평가 결과로 지원(task 95와 중복). 인용 출처(시험평가 가이드북)는 소스 세트에 없음. |
| FCA | 185 | 요구충족근거자료 | partially_supported | SE가이드북2017 p.98-104 FCA 요구충족 확인은 체계개발 DT 후; 선행연구 근사 근거는 SE실무지침서 표4 A3-3 획득성능 비교, A3-7 전력화시기 충족여부, A4-3 획득성능 (page 29-30) | FCA형 요구충족 근거는 체계개발 산출. 선행연구는 획득방안의 획득성능·전력화시기 충족 검토 수준. |
| FCA | 186 | 운용적합성검토결과 | partially_supported | 규정 제56조③3 운용성확인은 탐색개발; 훈령 제76조①; 선행연구 근사 근거는 dapa 제37조① ORD(안) 검토, SE실무지침서 표4 B1 소요군 요구사항 분석 (page 29) | 운용성확인은 탐색개발 검토. 선행연구는 ORD(안) 검토·요구사항 분석 수준만. |
| FCA | 187 | 이슈및후속조치 | source_supported | 규정 제39조①3가 '선행연구 및 후속조치 결과' 기본전략 항목; 제40조② 기본전략 수정 시 선행조치 재실시 검토; 제5조① 사업관리이력서 선행연구 단계부터 조치사항 포함; SE실무지침서 §4.1.4 Action Item (page 75-76) | 선행연구 후속조치 결과는 기본전략 필수 항목. 인용 출처(과학적사업관리 수행지침)는 소스 세트에 없음. |
| FCA | 188 | FCA_회의록및조치결과 | partially_supported | 규정 제56조④5 체계기능형상확인은 체계개발; 제79조②; SE가이드북2017 p.98 DT 후 OT 전 | FCA는 체계개발 형상확인. 선행연구 근거 없음. |
| PCA | 214 | 선행연구결과보고서 | source_supported | 규정 제39조① 선행연구 결과 반영 기본전략(안) 수립; 제39조①3가; 제36조② 세부는 「선행연구 수행지침」; 훈령 제36조①② 선행연구 결과→전력소요서(안)·기본전략; 제121조 4호 '선행연구 및 사업분석 결과 보고서'(전력지원체계); SE실무지침서 §2.2.3 ⑧⑨ 선행연구 수행·결과 (pag… | '선행연구 결과'는 필수 입력물. 무기체계용 보고서 서식·명칭은 수행지침 위임(NOT_FOUND). |
| PCA | 215 | 탐색개발전환권고자료 | source_supported | 규정 제39조⑨ 선행연구 결과에 따른 다음 단계(탐색/체계개발) 진입 판단 기준; 제39조①7; SE실무지침서 표4 A2-3 연구개발 진입단계 설정, A2-8 탐색개발 생략 여부 (page 29); §2.2.3 ⑨ 각주 TRA에 따른 진입단계 설정 (page 28) | 선행연구 핵심 판단물. |
| PCA | 216 | 기준선및의사결정패키지 | partially_supported | 의사결정 패키지 실체는 규정 제39조① 사업추진기본전략(안) 별지5 및 제5조① 사업관리이력서; SE실무지침서 표4 A4/B12 기본전략(안) 수립 (page 30); '기준선'은 SE가이드북2017 p.31 체계개발 산출 | 의사결정 요약은 기본전략(안)으로 필수이나 variant는 기본전략을 명명하지 않고 기준선/형상 메모로 기술. 인용 출처는 소스 세트에 없음. |
| PCA | 217 | 향후과제및후속연계계획 | source_supported | 규정 제39조①6자 부족기술 확보 계획·차 타 사업과의 연계방안; 제39조③7 국방기술기획서상 기술확보계획·유사개발계획 중복여부; SE실무지침서 표4 A2-2 핵심기술요소 식별 및 확보 계획, B9 기존장비 및 타사업과의 관련성, A2-8 (page 29) | 부족기술 확보·타사업 연계·후속 단계 개략계획으로 지원. |
| PCA | 218 | PCA_회의록및조치결과 | partially_supported | 규정 제56조④5 물리적형상확인은 체계개발; 제79조②; SE가이드북2017 p.105 규격화 간·양산 착수 전 | PCA는 체계개발/양산 전 형상확인. 선행연구 근거 없음. |

**빠진 필수 항목 (11건)**

| gate/phase | 항목 | mandatory | 출처 + 인용 |
|---|---|---|---|
| 선행연구 종료 (사업추진기본전략 수립) | 사업추진기본전략(안) 별지5 — 위원회/분과위 심의; [필수] 시험평가 추진방안·필수기능 5요소·품질관리·수명주기관리·위험관리 포함 | mandatory | 규정 제39조①; 제39조③ 관련부서 20일 검토의견; 훈령 제36조②; SE실무지침서 표4 A4/B12 (page 30), §2.2.7 (page 31) |
| 선행연구 | 운용요구서(안)(ORD, 별지4) 접수·검토 (OMS/MP 포함) | mandatory | 규정 제37조①; SE가이드북2017 p.124 (작성단계 선행연구/IPT); SE실무지침서 표3 순서1 (page 25), 표4 B1-2 (page 29) |
| 선행연구 | 체계공학계획(SEP) 수립 (사업추진기본전략 부록; 핵심기술 식별, 기술성숙 비용/일정 제약, 기술인력·조직, 기술검토(TR) 계획) | mandatory | SE실무지침서 표4 B13~B13-4 (page 30); 표4 A4; SE가이드북2017 p.120 (SEP 방사청 작성) |
| 선행연구 | 야전운용시험(FT)에 관한 연구 및 사업추진기본전략 반영·예산 확보 | mandatory | 훈령 제80조⑥; 제81조② |
| 선행연구 | 업무분할구조(WBS)/제품분해구조(PBS) 도출 | mandatory | SE실무지침서 표4 B3/B3-1/B3-2 (page 29) |
| 선행연구 | 수명주기 비용분석(LCC)·비용대 효과 분석 (획득방안별) | mandatory | SE실무지침서 표4 B4, A3-5 (page 29); §2.2.3 ⑪ (page 28); 규정 제39조①5가 비용 |
| 선행연구 | M&S 활용 가능성·확보 및 활용 개략계획 | mandatory | 규정 제39조③3 M&S 활용 개략계획 검토; 제64조① 수명주기 단계별 M&S 활용계획; SE실무지침서 표4 A2-7, A4-10 (page 29-30) |
| 선행연구 | 국산품 적용 추진방안 / 국내업체 기술수준·국내구매 추진가능성 검토 | mandatory | 규정 제39조①5사 선행연구 검토항목 '국산품 적용 추진 방안'; 제59조②; 부칙 적용례; SE실무지침서 표4 A2-9 (page 29) |
| 선행연구 | 핵심기술요소(CTE) 식별 및 확보계획 (진화적 개발전략 적용 여부 검토 포함) | mandatory | SE실무지침서 표4 A2-2 (page 29); §2.2.5 진화적 연구개발전략 검토 (page 31); 규정 제39조⑨3 CTE; 제39조①5가 진화적 개발전략 적용 여부 |
| 선행연구 | 종합군수지원(전력화지원요소)·양산/전력화·운용/폐기 개략계획, CBM+ 소요 확정 | mandatory | SE실무지침서 표4 A3-11, A3-13, A3-14, A4-11, A4-12 (page 30); 규정 제39조①2바·6라; 훈령 제88조⑪ |
| 선행연구 단계부터 사업종료까지 | 사업관리이력서 (주요 의사결정 문서·조치사항·담당자 이력) | mandatory | 규정 제5조① (variant의 020_MGMT/025·026 static folder가 부분적으로 대응하나 task로 명시되지 않음) |

### 3.4 `operational_rd_common_no_grade` — 운용연구개발(성능개량·현존전력 계열 해석) (SE_FolderTree_OperationalRnD_Basic.md; 주계약사 공통, 품질등급 없음)

| 지원 | 부분 | 미지원 | 내부관리 | 상충 | 빠진 필수 | 합계 task |
|---:|---:|---:|---:|---:|---:|---:|
| 26 | 9 | 0 | 21 | 0 | 12 | 56 |

- 게이트: 030_SRR 체계요구조건검토, 060_SFR 체계기능검토, 090_PDR 기본설계검토, 120_CDR 상세설계검토, 150_TRR 시험준비상태검토, 180_FCA 기능적형상확인, 210_PCA 물리적형상확인
- spine 판정: **부분 부합 — 체계개발 준용형 성능개량에는 지원, 현존전력 성능극대화형에는 규정 미명시(상충 아님)**
- 판정 근거(요약): (a) 경미한 성능개량이 성능개량추진계획+체계개발기본계획으로 체계개발 절차를 준용하면 SRR(탐색생략 시)·SFR·PDR·CDR·TRR·FCA·PCA spine이 규정대로 적용(규정 제62조④, 제39조⑨2가, 제56조④5, 제79조②); SE가이드북2017 표1의 'OO 성능개량 사업'도 SRR~CDR 산출물을 보임(p.30). (b) 그러나 variant가 다수 task의 출처로 인용한 현존전력지침에는 SRR~PCA가 전혀 없고 절차는 사업신청(별지1·2)→검토→사전분석(별지4)→대상사업 선정→사업계획(별지5)→계약→시제품 개발·입증시험→(필요 시 DT 원칙·부착시험·체계 영향 시 OT)→군 수락시험·품질보증→기술변경(표준화 업무규정)→종결(제5·9·17·21조); 훈령 제86조③도 경미 성능개량은 합참 분류검토→방사청 자체심의→DT 원칙→규격 제정만 규정. 즉 spine은 체계개발 준용형에는 source_supported, 현존전력형에는 NOT_FOUND(지침 제21조①이 규정 준용을 허용하므로 상충 아님). 결함: SRR 앞단의 성능개량추진계획/사업신청·사전분석·사업계획, 형상식별서 3종·형상통제제안서·국방규격 개정, DT 계획서/결과보고서·수락시험 결과 슬롯 부재; 성능형 규격 사업은 PCA 활동 없음(SE가이드북2017 p.106) 미반영. (비교기 원문 판정문은 JSON `spine_verdict`)
- 내부관리(정본 판정 제외) 21건: SRR 31/32/33; SFR 61/62/63; PDR 91/92/93; CDR 121/122/123; TRR 151/152/153; FCA 181/182/183; PCA 211/212/213 (INBOX_분류전·LOG_의사결정조치기록·TDP_기술자료)

| gate | task | task명 | 판정 | 근거 출처 | note |
|---|---|---|---|---|---|
| SRR | 34 | 운용문제정의및배경 | partially_supported | 현존전력지침 제5조① (사업신청서 별지1); 제9조④1 (사전분석: 사업현황-필요성·운영개념) | 내용(개선 필요성·현황)은 지침의 사업신청서/사전분석 보고서 항목으로 요구되나, 지침에는 SRR 게이트가 없고 대상사업 선정 단계(계약 전) 산출물임. 명칭도… |
| SRR | 35 | 운용개념(CONOPS) | partially_supported | 규정 제37조 (운용요구서 별지4), 제56조③ (체계운용개념 확정=탐색개발); 현존전력지침 제9조④1 (사전분석 '운영개념 포함'); SE가이드북2017 p.49 (SRR 입력 ORD) | 규정에 'CONOPS' 명칭 산출물 없음. 운용개념은 ORD/탐색개발(체계운용개념 확정) 또는 현존전력 사전분석 항목으로 등장하며 SRR 게이트 산출물로… |
| SRR | 36 | 연구범위및제약사항 | partially_supported | 현존전력지침 제9조④2·4 (사전분석: 사업범위, 위험관리방안); 제21조② (사업계획: 사업범위·일정·비용 확정); SE가이드북2017 p.40 (SRR 진입: 위험평가·관리방안) | 범위·위험은 지침 사전분석/사업계획 항목이며 SRR 게이트가 아님; 가이드북 SRR 진입기준의 위험평가와는 일부 부합. 별도 명칭 산출물 없음. |
| SRR | 37 | 체계요구사항명세서(SSRS)_D | source_supported | SE가이드북2017 p.49 (SRR 산출 SSRS [F]); p.30 (표1 성능개량 사업 SRR: SSRS, SSS); 규정 제78조④ (체계요구사항명세서) | SRR 산출로 명시. 단 가이드북은 SRR에서 [F] 확정이며 variant는 _D(초안)로 둠 — 버전 상태만 상이. |
| SRR | 38 | SRR_회의록및조치결과 | source_supported | 규정 제79조② (검토 결과 IPT장 제출), 제56조④5 (SRR은 탐색개발 생략 시에만), 제39조⑨2가 (기전력화 성능개량 TRL6↑ 체계개발 직접 진입); SE가이드북2017 p.49 (SRR 수행 결과서) | 조건부: 성능개량이 체계개발 절차로 추진되고 탐색개발이 생략될 때 SRR 수행(=성능개량은 통상 해당). 현존전력 지침에는 SRR 없음. |
| SFR | 64 | 체계요구사항명세서(SSRS)_F | partially_supported | SE가이드북2017 p.60 (SFR 산출 체계규격서 SSS [F] → 기능기준선), p.49 (SSRS는 SRR [F]); SE실무지침서 §4.3 (SFR 산출에 SSRS·개정 체계규격서 포함) | 가이드북 기준 SFR 기능기준선 문서는 체계규격서(SSS)이며 SSRS는 SRR에서 이미 확정. 실무지침서는 SFR 산출에 SSRS를 포함하므로 부분 부합.… |
| SFR | 65 | 기능시나리오분석 | source_supported | SE가이드북2017 p.50 (SFR 개요: 체계기능요구조건), p.53-54 (활동); SE실무지침서 §4.3 (기능흐름블록선도, 구성품 기능 정의), 표6 B7 | SFR의 기능분석/기능할당 활동으로 지원. 고정 문서명은 없음. |
| SFR | 66 | 요구사항추적표(RTM) | partially_supported | SE가이드북2017 p.59 (SFR 종료조건: 일관성·추적성); SE실무지침서 §5.8 REQM (양방향 추적성) | 추적성 확보는 요구되나 'RTM'이라는 명칭 산출물은 두 출처 모두 미명시(가이드북 grep NOT_FOUND). |
| SFR | 67 | 인터페이스및데이터흐름초안 | source_supported | SE가이드북2017 p.60 (SFR: 검토중 ICD [P], IRS(안)); SE실무지침서 §4.3 (내·외부 인터페이스 정의, IRS) | SFR 단계 ICD(P)/IRS(안)로 지원. |
| SFR | 68 | SFR_회의록및조치결과 | source_supported | 규정 제56조④5, 제79조②; SE가이드북2017 p.60 (SFR 수행 결과서) | 체계개발 절차 준용 시 필수. 현존전력 지침에는 없음. |
| PDR | 94 | 기본설계및실증설계방안 | source_supported | SE가이드북2017 p.73 (PDR: SSDD [F], HRS/SRS [F], 개발규격서(안), HDD/SDD(안)); 규정 제56조④5·6, 제79조④ | 기본설계 산출물(SSDD·개발규격서·HDD/SDD 초안)로 지원. '실증설계'라는 명칭은 출처 없음. |
| PDR | 95 | 대안분석(Trade_Study) | partially_supported | SE가이드북2017 p.72 (PDR: 수명주기비용 증가 시 비용-성능 절충분석 고려, '필요시'); SE실무지침서 §5.9 TS (대안 평가) | 절충분석은 LCC 증가 시 필요시 항목이며 독립 산출물로 요구되지 않음. |
| PDR | 96 | 연동통제문서(ICD)_Prelim | source_supported | SE가이드북2017 p.73 (PDR: 검토중 ICD [P]); 규정 제43조① (연동통제문서 상세설계 완료 전 확정) | PDR 시점 ICD(P)로 지원(가이드북은 ICD(안)을 SRR부터 둠). |
| PDR | 97 | 검증실증계획(VnV)_D | source_supported | TE가이드북2012 (p.40, 체계개발단계 TEMP 기준 상세시험평가계획 수립); SE가이드북2017 p.70 (PDR TEMP(안) 작성 중); 훈령 제63조③ (TEMP 확정 CDR 후 3개월) | 'VnV 계획' 명칭은 없으나 PDR 시점 TEMP(안)/시험평가계획 초안으로 지원. |
| PDR | 98 | PDR_회의록및조치결과 | source_supported | 규정 제56조④5, 제79조②; SE가이드북2017 p.73 (PDR 수행 결과서) | 체계개발 절차 준용 시 필수. |
| CDR | 124 | 상세설계구현패키지 | source_supported | SE가이드북2017 p.87 (CDR: HDD/SDD/IDD/ICD [F], 제품규격서(안)); 표준화지침서 page 18 (개발형상식별서 완성본 CDR 전, 제품형상식별서 초안 CDR 전) | CDR 산출물 묶음으로 지원. |
| CDR | 125 | 인터페이스설계기술서(IDD)_F | source_supported | SE가이드북2017 p.87 (CDR IDD [F]; 필요시 SDD 포함 가능) | CDR 확정 산출물로 명시. |
| CDR | 126 | 시험실증절차서(STP)_D | source_supported | SE실무지침서 §4.5 (CDR 산출: 형상항목별 시험절차서, 표8 B7); SE가이드북2017 p.89 (TRR 진입: 시험평가절차서 준비); TE가이드북2012 (Page 68, DT계획(안) 포함사항: 항목·기준·방법) | CDR 시점 시험절차서 초안은 실무지침서가 직접 지원; 시험평가 가이드북은 DT계획 단계 절차로 기술. |
| CDR | 127 | 형상식별및변경관리자료 | source_supported | 표준화지침서 page 18 (형상통제 구분: 개발형상변경/기술변경; 형상식별서 3종 시기), page 19 (형상통제제안서 절차); SE가이드북2017 p.86 (CDR 종료: 형상관리체계 최신화) | CDR 전후 형상식별서·형상통제 자료로 지원. |
| CDR | 128 | CDR_회의록및조치결과 | source_supported | 규정 제56조④5, 제79조②①, 제65조① (사업중간점검 CDR 이전); 훈령 제63조③; SE가이드북2017 p.87 | 체계개발 절차 준용 시 필수. |
| TRR | 154 | 시험준비상태검토자료(TRR) | source_supported | TE가이드북2012 (Page 70, DT-TRR 15일 전, 준비상태·협조사항 제시); SE가이드북2017 p.89-92; 훈령 제65조① | TRR 검토 패키지로 지원. |
| TRR | 155 | 시험환경및자원준비상태 | source_supported | TE가이드북2012 (Page 70: 가용시제 준비상태·시험평가인원·장소협조); SE가이드북2017 p.89-90 (시험환경 구축·안전문제 식별) | TRR 확인사항으로 명시. |
| TRR | 156 | 안전보안상호운용성확인 | source_supported | SE가이드북2017 p.89-90 (TRR 진입: 시험 안전문제 식별·대책), p.95 (TRR 상호운용성 수준측정·주파수); 현존전력지침 제9조⑧ (시험평가 필요여부: 사용자 안전성·합동성·상호운용성); 훈령 제86조⑤ (성능개량 상호운용성 검토), 제52조⑤ (보호대책) | TRR 안전·상호운용성 점검은 가이드북이 직접 지원. variant가 인용한 현존전력 지침의 해당 항목은 대상사업 선정(시험평가 필요여부) 단계 판단이며… |
| TRR | 157 | 수락기준및평가항목 | source_supported | TE가이드북2012 (Page 68, DT계획(안): 개발시험평가 항목 및 기준) (Page 74, 결과 포함사항 항목·기준); 현존전력지침 제21조① (수락시험 조건 고려), 제21조⑥ (수락시험 절차·방법 계약특수조건 반영) | 시험항목·기준 및 현존전력 수락시험 조건으로 지원. |
| TRR | 158 | TRR_회의록및조치결과 | source_supported | 규정 제56조④5, 제79조②; 훈령 제65조①, 제68조①; SE가이드북2017 p.97 | 체계개발/DT 수행 시 필수(훈령은 '원칙'). |
| FCA | 184 | 기능검증실증결과 | source_supported | TE가이드북2012 (Page 74, 개발시험평가 결과 포함사항); SE가이드북2017 p.99 (FCA 입력: 시험평가 결과·시험현황); 현존전력지침 제17조②3, 제21조⑧ (입증시험); 훈령 제86조③5 (성능개량 DT 원칙), 제66조① (DT 결과보고서 별지6) | DT/입증시험 결과로 지원. |
| FCA | 185 | 운용적합성사용자피드백 | partially_supported | 현존전력지침 제21조⑦ (체계 영향 시 DT 후 OT 가능), 제21조⑥ (수요군 수락시험); 훈령 제86조③5, 제69조① (OT 결과) | 현존전력/경미한 성능개량은 DT 원칙이며 OT는 체계 영향 시 조건부. '사용자 피드백' 명칭 산출물 없음. |
| FCA | 186 | 요구사항검증매트릭스(VCRM)_F | partially_supported | SE가이드북2017 p.104 (FCA 종료: 요구 만족·추적성), p.99 및 p.135 (국방규격화연계표), p.96-97 (TRR 요구조건-시험 추적성) | 추적성 확인과 국방규격화연계표는 있으나 'VCRM' 명칭 산출물은 미명시. |
| FCA | 187 | 결함개선조치결과 | source_supported | SE가이드북2017 p.100 (FCA 형상확인 보완 요구목록·조치결과 확인); TE가이드북2012 (제5절 결함 발생시 업무처리 절차, p.89); 규정 제81조의2 (조건부 적합 보완계획·조치) | 인용 출처 '과학적사업관리 수행지침' derived text는 저장소에 NOT_FOUND; 다른 출처로 지원됨. |
| FCA | 188 | FCA_회의록및조치결과 | source_supported | 규정 제56조④5, 제79조② (체계기능형상확인); SE가이드북2017 p.104 (FCA 결과보고서); 표준화지침서 page 20 | 체계개발 절차 준용 시 필수. |
| PCA | 214 | 제품형상식별서(PCI)_F | source_supported | 표준화지침서 page 18 (제품형상식별서 완성본: PCA 종료 후 1개월 이내); SE가이드북2017 p.111 (PCA: 제품기준선 확인, 제품규격서 [F]) | 가이드북은 '제품규격서/제품기준선' 표현이며 '제품형상식별서' 명칭은 표준화 실무지침서가 직접 지원. |
| PCA | 215 | 현행체계변경반영자료 | source_supported | 현존전력지침 제21조⑧ (입증시험 결과 기술변경 → 표준화 업무 규정), 제17조②3; 표준화지침서 page 18-19 (성능개량 구매=개발형상변경, 개조=기술변경) (후속조치: 국방규격 개정·기술교범 수정); 훈령 제86조③6 (규격 제정) | 기술변경/규격 개정 반영 자료로 지원. 명칭은 출처와 상이. |
| PCA | 216 | 최종보고서및전환권고 | source_supported | 현존전력지침 제17조②5 (사업 종결 처리), 제21조④ (사업 종결 시 결과 제출); 규정 제55조①③ (집행종결보고서 별지6), 제81조② (체계개발결과보고서) | 사업종결 결과/종결보고서로 지원. '전환권고' 항목은 출처 없음. |
| PCA | 217 | 후속조치운용반영계획 | partially_supported | 규정 제53조④ (전력화평가 후속조치계획), 제55조④ (운영유지단계 형상관리 자료); 훈령 제84조①④ (전력화평가 조치계획), 제86조⑨ (성능개량 시제 전력화 시 보완 반영) | 현존전력 지침에는 해당 산출물 없음(NOT_FOUND). 일반 규정·훈령의 전력화 후속조치로만 부분 지원. |
| PCA | 218 | PCA_회의록및조치결과 | source_supported | 규정 제56조④5, 제79조② (양산기준설정 PCA); SE가이드북2017 p.111 (PCA 결과보고서); 표준화지침서 page 20 | 체계개발 절차 준용 시 필수(성능형 규격 사업은 PCA 활동 없음: 가이드북 p.106). |

**빠진 필수 항목 (12건)**

| gate/phase | 항목 | mandatory | 출처 + 인용 |
|---|---|---|---|
| SRR 이전 (소요/대상사업 선정) | 경미한 성능개량 분류 검토 요청 및 합참 검토결과 통보 (또는 현존전력 사업신청서 별지1 + 사업 체크리스트 별지2) | mandatory (성능개량 소요제기 시) / mandatory (현존전력 사업신청 시) | 훈령 제86조③1·2; 현존전력지침 제5조①② |
| SRR 이전 (계획 수립) | 성능개량추진계획 (제39조 준용; 필요시 체계개발기본계획/구매계획 동시 수립) | mandatory (경미한 성능개량) | 규정 제62조④ |
| SRR 이전 (계약 전) | 현존전력 사전분석 보고서(별지4: 사업현황·사업범위·추진방안·위험관리·개략 사업계획) 및 사업계획(안)(별지5) | mandatory (현존전력 성능 극대화 사업) | 현존전력지침 제9조④; 제21조①② |
| SRR 이전 / 착수 | 체계개발기본계획서(별지12) 및 체계개발실행계획서(별지13) (성능개량을 체계개발 절차로 추진 시) | mandatory (체계개발 절차 준용 시) | 규정 제62조④; 제75조①②; 제76조①; 제77조① |
| SRR (소요/합동성) | 합참 상호운용성위원회(또는 국방정보화책임관실무협의회) 합동성·상호운용성 검토 결과 | mandatory (성능개량) | 훈령 제86조⑤ |
| SRR~CDR (기술계획) | 체계공학관리계획서(SEMP)/기술계획문서 최신화(P-TEMP·SEMP·RAM 업무계획 등) [U] | mandatory (실무지침서, 탐색/체계개발) / recommended (가이드북) | SE실무지침서 표7 B2/B3; SE가이드북2017 p.49, p.120 |
| SFR | 체계규격서(SSS) [F] — 기능기준선 설정 문서 (표1 성능개량 사업 SRR/SFR 산출물에도 SSS 포함) | recommended (가이드북) / mandatory (실무지침서 표6 B7) | SE가이드북2017 p.60, p.30; SE실무지침서 표6 B7 |
| SFR / CDR (형상식별) | 기능형상식별서(SFR 전 완성) 및 개발형상식별서(CDR 전 완성) | mandatory (형상관리 대상 품목) | 표준화지침서 page 18 |
| TRR / DT | 개발시험평가계획서(별지5) 및 개발시험평가결과보고서(별지6) (성능개량은 DT 원칙, 필요시 부착시험; 체계 영향 시 OT 계획서·결과) | mandatory (시험평가 필요 사업) | 훈령 제86조③5, 제64조①②, 제66조①; 현존전력지침 제21조⑦ |
| FCA/PCA (표준화) | 형상통제제안서(기술변경/개발형상변경) 및 국방규격(안)/규격 개정 건의 | mandatory (기술변경 시 / 규격 제정) | 표준화지침서 page 19; 현존전력지침 제21조⑧; 훈령 제86조③6; 규정 제80조① |
| PCA / 종결 | 군 수락시험 결과 및 계약특수조건 품질보증 결과 (현존전력) / 체계개발결과보고서+TDP (체계개발 절차 시) | mandatory | 현존전력지침 제17조②4, 제21조⑥; 규정 제81조② |
| PCA 이후 (전력화) | 전력화평가 계획서/결과·조치계획 (성능개량 시제 전력화 시 보완 반영) | mandatory (생략·조정 가능) | 훈령 제83조①, 제84조①④, 제86조⑨ |

## 4. 사업유형 매트릭스

derive.json `business_type_matrix`를 source reader 사실(규정 phase_model/reviews, 훈령 reviews, SE가이드북2017 reviews)과 교차 확인한 결과. SE 기준선 문서는 가이드북 자체 선언(p.29-30)에 따라 recommended로 읽는다.

### 4.1 선행연구 (사업추진방법 결정 전 조사·분석; 무기체계 소요결정 전후)

| 구분 | 항목 |
|---|---|
| 필수 검토·게이트 | 운용요구서(안) 검토(선행연구 수행 시) — 규정 제37조① (mandatory) |
| 필수 검토·게이트 | 기술성숙도 판단·다음 단계 진입 기준 적용(TRL 4↑ 탐색개발 / TRL 6↑·CTE 없음 체계개발 직접 진입) — 규정 제39조⑨ (mandatory 판단) |
| 필수 검토·게이트 | 사업추진기본전략 위원회/분과위 심의(관련부서 20일 검토의견) — 규정 제39조①③, 훈령 제36조② (mandatory) |
| 필수 검토·게이트 | 통합소요검토회의→선행연구→전력소요서(안) 반영 — 훈령 제36조① (mandatory; 신속·긴급·시범사업 후 생략 가능 제36조②④) |
| 필수 검토·게이트 | SE 기술검토회의(ASR/SRR 등): NOT_FOUND — SE가이드북2017 p.124는 선행연구를 ORD 작성단계로만 언급 |
| 핵심 산출물 | 사업관리이력서(선행연구부터) — 규정 제5조① |
| 핵심 산출물 | 운용요구서(안)(별지4) — 규정 제37조 |
| 핵심 산출물 | 선행연구 결과(기술수준·획득방안 조사분석, TRA 진입기준) — 규정 제36조, 훈령 제36조① |
| 핵심 산출물 | 사업추진기본전략(안)(별지5; 필수 5요소·해당사업 항목·단계 통합/생략) — 규정 제39조① |
| 핵심 산출물 | 사업추진방법 결정결과 국회 제출 — 규정 제39조⑫ |
| 핵심 산출물 | SEP(사업추진기본전략 부록), OCD/ORD 분석, WBS/PBS — SE실무지침서 표4 (recommended) |
| 핵심 산출물 | 세부 산출물·절차: 「선행연구 수행지침」 위임 — 규정 제36조② (NOT_FOUND) |
| 인용 | 규정 제35~40조; 훈령 제36조; SE실무지침서 §2.2; SE가이드북2017 p.124 |

### 4.2 탐색개발

| 구분 | 항목 |
|---|---|
| 필수 검토·게이트 | 체계요구조건검토(SRR) — 규정 제56조③3 (탐색개발 수행항목); SE가이드북2017 p.39 탐색 후반부 (mandatory) |
| 필수 검토·게이트 | 기술성숙도평가(TRA, TRL 6 목표) — 규정 제56조③4, 제72조③ (mandatory) |
| 필수 검토·게이트 | 운용성확인 — 규정 제56조③3 (열거) / 훈령 제76조 (mandatory; 계획안 2개월 전, 계획서 1개월 전, 결과 1개월 내) |
| 필수 검토·게이트 | 공식기술검토회의(업체주관; 신속원 진입조건 검토 1주 전, 자료 2주 전) — 규정 제70조③ (mandatory) |
| 필수 검토·게이트 | 사업중간점검(1,000억↑ 또는 4년↑, 운용성확인 이전) — 규정 제65조③ (conditional) |
| 필수 검토·게이트 | 방첩사 정보시스템 보호대책 검토(탐색개발결과보고서 포함) — 훈령 제52조⑤ (mandatory) |
| 필수 검토·게이트 | 탐색개발기본계획 분과위 확정, 실행계획서 사업부장 결재 — 규정 제67조②, 제69조 (mandatory) |
| 필수 검토·게이트 | 사업종결회의(운용성확인 결과 판정 기반) — SE실무지침서 §4.10.5 |
| 필수 검토·게이트 | 협약사업 최종평가(운용성확인 기반 성공/실패) — 규정 제118조의11① (conditional) |
| 핵심 산출물 | 탐색개발기본계획서(별지9) — 규정 제67조 |
| 핵심 산출물 | 탐색개발실행계획서(별지10; 운용성확인계획 포함) — 규정 제68~69조, 훈령 제76조②③ |
| 핵심 산출물 | 예비 체계요구사항명세서 — 규정 제70조⑤ |
| 핵심 산출물 | 기술성숙도평가결과보고서(미성숙 시 기술성숙계획) — 규정 제56조⑬ |
| 핵심 산출물 | 운용성확인계획서·결과보고서 — 훈령 제76조④⑤ |
| 핵심 산출물 | 탐색개발결과보고서(별지11; 완료 후 1개월 내) — 규정 제73조① |
| 핵심 산출물 | 예비시험평가기본계획서 — 규정 제73조② |
| 핵심 산출물 | 작전운용성능(안)·기술적/부수적 성능(안) — 훈령 제52조④1 |
| 핵심 산출물 | 주파수 획득 가능성 확인(탐색개발 종료 시) — 규정 제46조② |
| 핵심 산출물 | SEP/SEMP, SSRS, 체계규격서(안), ICD(안), SRR 수행결과서 — SE가이드북2017 p.49 (recommended) |
| 인용 | 규정 제56조③, 제67~73조, 제65조③; 훈령 제52조④⑤, 제76조; SE가이드북2017 p.39; SE실무지침서 §2.3 |

### 4.3 체계개발 (탐색+체계 통합·탐색 생략 변형 포함)

| 구분 | 항목 |
|---|---|
| 필수 검토·게이트 | SRR(탐색개발 생략 시에만) — 규정 제56조④5 (conditional); SE가이드북2017 p.39 체계 초기 |
| 필수 검토·게이트 | SFR·PDR·CDR·TRR — 규정 제56조④5, 제79조② (mandatory; 세부 절차 선택적 적용 가능) |
| 필수 검토·게이트 | 개발시험평가·운용시험평가 및 결과판정(전투용 적합/조건부/잠정/부적합) — 규정 제79조②, 제80조; 훈령 제64~69조 (mandatory) |
| 필수 검토·게이트 | 시험준비검토회의 DT/OT 각 15일 전 원칙 — 훈령 제65조①, 제68조① |
| 필수 검토·게이트 | 체계기능형상확인(FCA)·물리적 형상확인(PCA, 양산기준설정) — 규정 제79조② (mandatory 열거); SE가이드북2017 p.98, p.105 |
| 필수 검토·게이트 | 제조성숙도평가(MRA, MRL 8) — 규정 제78조③, 제79조③ (mandatory) |
| 필수 검토·게이트 | 사업중간점검(CDR 종료 이전 필수) — 규정 제65조① |
| 필수 검토·게이트 | 공식기술검토회의(업체주관) — 규정 제78조⑧ |
| 필수 검토·게이트 | 방첩사 보호대책 검토(착수 전, 내장형 SW) — 훈령 제52조⑤2·3 |
| 필수 검토·게이트 | 체계개발기본계획 위원회/분과위 확정, 실행계획서 사업본부장 결재 — 규정 제75조②, 제77조 |
| 필수 검토·게이트 | 상호운용성 평가·연동통제문서(CDR 전 확정) — 규정 제41~43조 |
| 필수 검토·게이트 | 생산준비검토(PRR; MRA 시 생략 가능) — 규정 제82조④ (conditional) |
| 필수 검토·게이트 | 야전운용시험·전력화평가(최초양산 후, 시제 전력화 시 체계개발 내) — 규정 제53조, 제82조② |
| 핵심 산출물 | 체계개발기본계획서(별지12) / 체계개발실행계획서(별지13) — 규정 제75~77조 |
| 핵심 산출물 | 체계요구사항명세서(SRS) — 규정 제78조④ |
| 핵심 산출물 | RAM 분석자료·결과보고서 — 규정 제76조⑤ |
| 핵심 산출물 | 기술검토회의(SRR/SFR/PDR/CDR/TRR/DT&E/FCA/PCA) 수행결과 — 규정 제79조② |
| 핵심 산출물 | 핵심부품ㆍ구성품 선정기준·공인시험 성적서(시험개발 성적서 대체 가능) — 규정 제79조①⑤ |
| 핵심 산출물 | 예비TEMP→시험평가기본계획서(별지4; CDR 후 3개월 내 확정) — 훈령 제63조 |
| 핵심 산출물 | DT/OT 계획서·결과보고서(별지5~8) — 훈령 제64조, 제66조①, 제67조, 제69조① |
| 핵심 산출물 | MRA 결과(MRL 8) — 규정 제79조③ |
| 핵심 산출물 | 사업중간점검 결과보고서(별지27) — 규정 제65조 |
| 핵심 산출물 | 국방규격(안)→국방규격 제정 건의(체계개발 종료시점) — 규정 제80조, 제81조① |
| 핵심 산출물 | 체계개발결과보고서(별지14)+TDP(2개월 내) — 규정 제81조② |
| 핵심 산출물 | 양산 계약 전 제출자료(시험절차서·국산화 이행현황·기술교범·FMECA 등) — 규정 제81조③④ |
| 핵심 산출물 | SDP·단계별 SW 기술문서, M&S 활용계획, WBS — 규정 제47~50조, 제64조①, 제78조⑨ |
| 핵심 산출물 | 기준선 문서: SSS(기능기준선)→SSDD·HRS·SRS·개발규격서(할당기준선)→HDD·SDD·IDD·ICD·제품규격서(제품기준선) — SE가이드북2017 p.31, p.60/73/87 (recommended) |
| 인용 | 규정 제56조④, 제58조, 제65조, 제75~82조; 훈령 제52조⑤, 제63~69조; SE가이드북2017 p.34-35; SE실무지침서 §2.4, §4 |

### 4.4 성능개량·현존전력 (경미한 성능개량 / 현존전력 성능극대화 / 중대 성능개량)

| 구분 | 항목 |
|---|---|
| 필수 검토·게이트 | 중대 성능개량(운영개념·ROC 현저 변경·수명연장) = 신규 소요결정 절차 → 무기체계 연구개발 절차 전체 — 훈령 제86조② (mandatory) |
| 필수 검토·게이트 | 경미한 성능개량: 합참 분류검토(1개월 내, 필요시 전력업무현안실무협의회)→방사청 자체심의→소요검토팀(선택)→분과위/실무위 심의 성능개량추진계획 — 훈령 제86조③1~4; 규정 제62조②④ |
| 필수 검토·게이트 | 경미한 성능개량 시험평가: DT만 원칙, 필요시 부착시험, 체계영향 시 연동 DT 후 OT → 규격 제정 — 훈령 제86조③5·6; 규정 제62조⑤ |
| 필수 검토·게이트 | 기전력화 성능개량 TRL 6↑ 시 체계개발 직접 진입(→ 체계개발 검토회의 적용) — 규정 제39조⑨2가 |
| 필수 검토·게이트 | 합동성·상호운용성 검토(합참 상호운용성위원회 / 국방정보화책임관실무협의회) — 훈령 제86조⑤ |
| 필수 검토·게이트 | 현존전력 성능극대화: 합참 경미 분류 없이 방위사업정책국장 추진; 사업신청서 검토→대상사업 선정(사전분석)→수탁기관 사업계획→(예외 선정 시) DT만 원칙·부착시험·연동 시 OT, 입증시험·수락시험 계약특수조건 — 규정 제62조의2; 현존전력지침 제5~9조, 제21조①⑥⑦ |
| 필수 검토·게이트 | 창정비와 통합 추진 원칙 — 규정 제62조⑥; 훈령 제86조⑦ |
| 필수 검토·게이트 | SE 기술검토회의 전용 규칙: NOT_FOUND (SE가이드북2017 표1 p.30에 성능개량 사업 SRR 산출물 사례만 존재) |
| 핵심 산출물 | 경미한 성능개량 분류 검토 요청/합참 검토결과, P3I 제안 — 훈령 제86조③1·2, ⑥ |
| 핵심 산출물 | 성능개량추진계획(제39조 준용; 체계개발기본계획/구매계획 동시수립 가능; 선행연구 준하는 분석평가 요청 가능) — 규정 제62조④ |
| 핵심 산출물 | DT(부착시험) 결과·필요 시 OT 결과 → 국방규격 제정 — 훈령 제86조③5·6 |
| 핵심 산출물 | 현존전력: 사업신청서(별지1)+기술자료(규격서·사양서)+비용자료+사업 체크리스트(별지2) — 현존전력지침 제5조①② |
| 핵심 산출물 | 현존전력: 대상사업 선정계획, 사전분석 결과(비용 20% 증액 한도), 사업계획(별지5), 구매요구서·기술평가표(2단계 경쟁 시), 입증시험·기술변경(표준화 업무규정) — 현존전력지침 제4조, 제21조①②⑤⑧ |
| 핵심 산출물 | 시험평가는 국방전력발전업무훈령 준용 — 규정 제62조⑤ |
| 핵심 산출물 | 현존전력 세부 산출물·검토회의: 「현존전력지침」 위임 — 규정 제62조의2③ (지침 본문에도 SE 검토회의 없음) |
| 인용 | 규정 제62조, 제62조의2, 제39조⑨2가; 훈령 제86조; 현존전력지침 제2조, 제5~9조, 제8조, 제21조; SE가이드북2017 p.30 |

### 4.5 응용연구·시험개발 (핵심기술 연구개발; 기초연구→응용연구→시험개발)

| 구분 | 항목 |
|---|---|
| 필수 검토·게이트 | 과제기획: 각군·합참 과제제안(7항목)→방사청 국방기술기획서 반영 — 훈령 제54조 (mandatory) |
| 필수 검토·게이트 | 성과평가(중간평가·단계평가) — TE실무가이드북2013 p.37 (mandatory 명칭; 세부 NOT_FOUND) |
| 필수 검토·게이트 | 해외기술·부품 도입 시 단계별 사전승인 — 규정 제116조① (conditional) |
| 필수 검토·게이트 | 응용연구 종결 시 시험평가: 시제품 제작된 경우에 한해 실시 가능 — 훈령 제71조① 단서 (conditional) |
| 필수 검토·게이트 | 시험개발 시험평가: DT(기준 충족/미달) + 적용 무기체계 있는 경우 OT(군사용 적합/부적합, 잠정 적합); 적용체계 없음·체계영향 미미 부분품은 DT로 종결 — 훈령 제59조③, 제61조②, 제71조① |
| 필수 검토·게이트 | DT계획(안) 7항목 착수 2개월 전 합참 제출·1개월 전 확정; 결과보고서 6항목 1개월 내; 무기체계 절차 준용(TRR 15일 전 원칙 등), 위원회는 실무위로 본다 — 훈령 제71조③④, 제72조①⑥, 제65조① |
| 필수 검토·게이트 | 계획단계 분석평가 6요소 / 집행성과 분석(응용연구·시험개발) — 훈령 제43조⑤, 제50조②1 (conditional) |
| 필수 검토·게이트 | 시험개발 우선·무기체계 탐색/체계개발 포함 수행 가능 — 규정 제116조② |
| 필수 검토·게이트 | SE 기술검토회의(SRR~PCA)·TRA/MRA·사업중간점검: NOT_FOUND (규정 제79조②·SE가이드북2017 p.8·SE실무지침서 §1.1.2 적용범위 밖) |
| 필수 검토·게이트 | 그 외 절차: 「국방기술 연구개발 업무처리지침」 및 직전 규정 제172~193조의6 위임 — 규정 제116조③, 부칙 제3조 (NOT_FOUND in corpus) |
| 핵심 산출물 | 핵심기술 과제제안(7항목)·국방기술기획서 — 훈령 제54조③2·④ |
| 핵심 산출물 | 연구개발계획서(응용연구계획서/시험개발계획서; 시험평가 기초) — 훈령 제59조③; TE실무가이드북2013 p.37, p.64 |
| 핵심 산출물 | 개발시험평가계획(안)(7항목) / 확정 DT계획 — 훈령 제71조③④ |
| 핵심 산출물 | 개발시험평가 결과보고서(6항목) — 훈령 제72조① |
| 핵심 산출물 | 운용시험평가계획(안)·결과보고서(적용체계 OT 시) — 훈령 제71조⑤, 제72조④ |
| 핵심 산출물 | 임시규격(탑재 곤란 시 최초 OT 후) — 훈령 제71조①1가2) |
| 핵심 산출물 | 시험개발 공인시험 성적서(후속 체계개발 핵심부품 시험 대체) — 규정 제79조⑤ |
| 핵심 산출물 | 총사업비관리대장(과제관리 지원기관), 중기계획 자료 — 규정 제22조②, 제19조③④ |
| 핵심 산출물 | 디지털지형정보 기술문서·SW·데이터, 주파수 협의 — 규정 제44조③; 훈령 제88조⑥1 |
| 핵심 산출물 | 응용연구 전용 검토회의·최종보고서 양식: NOT_FOUND |
| 인용 | 규정 제17조, 제19조③④, 제22조②, 제44조, 제79조⑤, 제116조, 제167조③, 부칙 제3조; 훈령 제12조②4, 제43조⑤, 제50조②1, 제53~54조, 제59조③, 제61조②, 제71~72조, 제88조⑥; TE실무가이드북2013 p.36-37, p.64 |

- 교차 확인 메모: 규정 reviews에서 SRR은 conditional(탐색개발·탐색생략 체계개발), SFR/PDR/CDR/TRR/FCA·PCA는 체계개발 mandatory, TRA는 탐색개발→체계개발 진입 판단, MRA는 체계개발→양산 판단, 운용성확인은 conditional(훈령은 mandatory), 사업중간점검은 conditional(체계개발 CDR 이전 필수)로 읽혀 매트릭스와 정합. 훈령 reviews에는 CDR 외 SE 검토회의 용어가 없고 TRR은 '원칙'.

## 5. 응용연구 variant 제안

### 5.1 응용연구 phase model (정본 근거)

| 단계/요소 | 정의 위치 | 메모 |
|---|---|---|
| 핵심기술 연구개발 3단계: 기초연구 → 응용연구 → 시험개발 | 규정 제116조① (기초연구, 응용연구 및 시험개발의 연구개발 단계별); 제19조③ (핵심기술 연구개발사업 = 기초연구ㆍ응용연구ㆍ시험개발ㆍ민군겸용); 훈령 제53조①; TE실무가이드북2013 p.37 (4. 핵심기술 연구개발 가.) | 응용연구 자체의 정의문(목적·범위·TRL 목표)은 네 정본 어디에도 없음. 단계 명칭과 순서만 정의됨. 세부는 아래 위임 규정에 있음. |
| 위임 구조 (세부 절차 owner) | 규정 제17조 (핵심기술 과제결정 세부 = 국방기술 연구개발 업무처리 지침), 제116조③ (그 밖의 핵심기술 연구개발 사항 = 국방기술 연구개발 업무처리지침); 훈령 제53조③, 제54조⑤ (국방기술기획서 작성절차·핵심기술 연구개발 세부 = 방위사업관리규정 + 국방기술 연구개발 업무처리지침) | 「국방기술 연구개발 업무처리지침」(방사청 예규)은 knowledge corpus에 없음 → 응용연구 단계의 검토회의·산출물 정본은 NOT_FOUND. 아래 gate 제안은 훈령·규정·가이드북에서 간접 도출한 것. |
| 경과조치: 직전 방위사업관리규정의 핵심기술 조문 유효 | 규정 부칙 제3조 (직전 훈령 제172조 내지 제193조의6은 관련 규정 개정 발령 시까지 유효) | 현행 규정 본문에는 핵심기술 절차가 제116조 3개 항으로 축약되어 있고, 실제 절차는 직전 훈령 제172~193조의6에 있음 → 해당 구 조문도 corpus에 없음(NOT_FOUND). 이중 위임 상태. |
| 과제기획 (소요제기 대상 → 과제제안 → 국방기술기획서 반영) | 훈령 제12조②4 (소요제기 대상: 무기체계 연구개발 관련 핵심기술 과제); 제54조①~⑤ (각군→합참→방사청 과제제안; 정보화분야는 국방부 정보화국; 과제제안 포함사항 7개: 제안기술명·기술개요·필요성·목표성능·예상 소요시기 및 예산·적용대상 무기체계·기대효과 등; 결정 과제는 국방기술기획서 반영); 제37~39조 국방중기계획 대상 6호 (국방기술기획서 반영 핵심기술 연구개발 사업) | 응용연구 variant의 첫 gate 입력은 '과제제안서(7항목)'와 '국방기술기획서 반영 근거'로 두는 것이 source-backed. |
| 응용연구 종결 시 시험평가 트리거 (시제품 여부 스위치) | 훈령 제71조① 단서 ('응용연구 단계에서 과제가 종결되었을 때에는 시제품이 제작된 경우에 한하여 시험평가를 실시할 수 있다'); TE실무가이드북2013 p.37 (응용연구단계로 종결되는 사업 또는 시험개발단계 핵심기술사업에 대하여 DT/OT 구분, 응용연구계획서 및 시험개발계획서에 기초) | 응용연구 variant는 '시제품 제작 여부'를 분기 변수로 두어야 함. 시제품 없으면 공식 시험평가 gate(TRR/DT)는 비활성, 성과평가(중간·단계평가)로 종결. |
| 시험개발 단계 시험평가 (적용 무기체계 유/무 분기) | 훈령 제71조①1~2 (적용체계 개발중: 핵심기술 DT + OT는 적용체계 OT계획 포함 / 탑재곤란 시 최초 OT 후 임시규격; 적용체계 양산·운용중: 체계연동 DT→OT 또는 통합시험; 체계영향 미미 부분품·구성품: DT로 종결 가능(실무위 승인·연구개발계획서 반영 조건); 적용체계 없음: DT로 종결); 제71조② (무기체계 절차 준용, 적용체계 없으면 DT계획만); 제71조③④ (DT계획(안) 7항목, 착수 2개월 전 합참 제출, 1개월 전 확정 통보); 제71조⑤ (OT계획(안) 소요제기기관 수립) | 시험개발 variant(향후)의 핵심 분기. 응용연구 variant에도 '적용대상 무기체계 유무'를 메타데이터로 보유해야 후속 시험개발 연계 판단이 가능. |
| 시험평가 결과 조치 및 판정 (핵심기술 전용 판정어) | 훈령 제72조①~⑤ (DT 결과보고서 6항목, 1개월 내 방사청 제출→합참; OT 결과보고서 1개월 내 합참); 제61조② (DT: 기준 충족/미달; OT: 군사용 적합/부적합, 잠정 군사용 적합 가능); 제72조⑥ (기타는 무기체계 절차 준용, 이때 방추위·분과위 = 방위사업기획ㆍ관리실무위원회로 본다); TE실무가이드북2013 p.36 (핵심기술은 군사용 적합/부적합 판정) | 무기체계의 '전투용 적합' 대신 '군사용 적합'이 판정 용어. gate 결과 필드 어휘를 분리해야 함. |
| 성과평가 (과제수행 중 중간평가·단계평가) vs 최종 시험평가 | TE실무가이드북2013 p.37 (핵심기술 과제평가 = 성과평가(중간평가 및 단계평가) + 최종단계 시험평가(DT/OT)) | 중간·단계평가의 시기·입출력·판정은 corpus 내 NOT_FOUND (업무처리지침 위임 추정). 응용연구 variant의 중간 gate(PDR/CDR 자리)를 이 성과평가에 매핑하는 것은 제안 수준. |
| 시험개발 우선 원칙 및 무기체계 탐색/체계개발 포함 수행, 시험개발 성적서의 체계개발 대체 | 규정 제116조② (시험개발은 무기체계개발에 우선; 중첩 시 적용무기체계의 탐색개발 또는 체계개발에 포함 수행 가능); 제79조⑤ (핵심부품·구성품이 별도 핵심기술 시험개발과제로 개발 후 설계변경 없이 적용 시 시험개발 성적서로 대체); SE실무지침서 §2.4.10 (page 53) (동일 취지) | 응용연구→시험개발→탐색/체계개발 이관 시 '시험성적서·기술자료 인계'가 후속 사업의 정식 입력이 됨 → 종결 gate 산출물에 반영. |
| 분석·평가 (계획단계 6요소, 집행성과 분석) | 훈령 제43조①3·⑤ (핵심기술 계획단계 분석평가 6요소: 필요성, 목표·범위 적절성, 기술적 접근 타당성, 개발기술 활용가능성, 개발기간·예산 적정성, 체계개발 연계성·통합 가능성); 제50조②1 (집행성과 분석: 응용연구ㆍ시험개발 포함, 개발목표 대비 성과·다음 단계 필요성·재원 경제성·주요 의사결정 적절성·개발인력 및 기술관리 실태 등) | 응용연구 gate의 '기획 근거'와 '종결 평가' 항목 목록으로 직접 활용 가능한 유일한 조문 수준 체크리스트. |
| 부수 규정: 해외기술 도입 사전승인, 총사업비 관리, 중기계획 자료, 디지털지형정보, 주파수, 전시 분류 | 규정 제116조① (단계별 해외기술·부품 도입 시 국방기술개발보호국장/사업본부장 사전승인); 제22조② (핵심기술 총사업비관리대장은 과제관리 지원기관 작성); 제19조③④2 (국과연 중기계획 자료 → 국방기술개발보호국, 시험개발은 IPT); 제44조①~③ (핵심기술 과제책임자 디지털지형정보 상호운용성·기술문서 제출); 제167조③ (핵심기술 연구개발은 전시 집행중지 원칙, 예외 3호); 훈령 제88조⑥1 (핵심기술 주파수는 해당 연구기관(업체)이 직접 협의 획득) | folder-tree의 MGMT/REF 영역 또는 SRR gate 부속 항목으로 두면 충분. 대부분 conditional. |
| SE 기술검토회의(SRR~PCA)의 응용연구 적용 여부 | SE가이드북2017 p.8 (적용범위: 방위사업관리규정에 근거한 무기체계 연구개발 사업); SE실무지침서 §1.1.2 (page 13) (적용범위: 탐색개발·체계개발 업체주관); 규정 제79조② (SRR~PCA는 체계개발 내용); 훈령 제52조⑦ (세부 절차 방위사업관리규정 위임) | NOT_FOUND: 어느 정본도 응용연구·시험개발에 SRR/SFR/PDR/CDR/TRR/FCA/PCA를 요구하지 않음. 응용연구 variant가 spine 코드(30~210)를 유지한다면 tailoring_status는 'required'가 아니라 'optional/unstated'로 표기해야 정본과 충돌하지 않음. |

### 5.2 제안 gate·task (spine 코드 30~210 유지, 표시명은 응용연구 마일스톤)

| gate | task | mandatory | 출처 + 인용 |
|---|---|---|---|
| **30 (spine SRR 자리; 권고 폴더명 SRR_과제기획및연구개발계획)** — 과제기획·응용연구계획 확정 (요구/목표성능 기준선) | 핵심기술 과제제안서(7항목: 제안기술명·기술개요·필요성·목표성능·예상 소요시기 및 예산·적용대상 무기체계·기대효과) 및 국방기술기획서 반영 근거 | mandatory (과제결정 단계 입력; 응용연구 착수 시 사본·포인터) | 훈령 제54조③2·④; 제12조②4 |
|  | 연구개발계획서(응용연구계획서) — 시험평가 기초문서, 목표성능·시제품 제작 여부·적용대상 무기체계 명시 | mandatory | 훈령 제59조③ (연구개발계획서에 기초하여 시험평가); 제71조①1다 (연구개발계획서 반영 조건); TE실무가이드북2013 p.37 (응용연구계획서·시험개발계획서에 기초); p.64 (핵심기술개발계획서 RFP 일치 검토) |
|  | 계획단계 분석·평가 6요소 대응자료(필요성, 목표·범위, 기술접근, 활용가능성, 기간·예산, 체계개발 연계성) | conditional (계획단계 분석평가 선정 사업) | 훈령 제43조①3·⑤ |
|  | 해외기술·부품 도입 사전승인(응용연구 단계별) 기록 | conditional (해외기술 도입 시) | 규정 제116조① |
|  | 총사업비관리대장 포인터(과제관리 지원기관 작성) 및 중기계획 자료 제출 이력 | conditional (2년 이상 사업 등 제22조 요건) | 규정 제22조②; 제19조③④2 |
|  | 체계요구사항명세서(SSRS)_D 상당 — 목표성능을 요구조건 형식으로 정리 (SE 가이드 준용, 응용연구 필수 근거 없음) | proposed (unstated for 응용연구; SE 준용 제안) | SE가이드북2017 p.40; p.49 (SRR [F] SSRS) — 적용범위는 무기체계 연구개발 p.8 |
|  | 착수·검토 회의록 및 Action Item(과제 착수회의, 성과평가 일정 합의) | proposed (unstated for 응용연구) | SE실무지침서 §4.10.1 (page 105) (사업착수회의, 무기체계 대상) |
| **60 (spine SFR 자리; 권고 폴더명 SFR_기술요구분석및적용체계연계)** — 기술요구 분석·기능 분해·적용체계 연계 확인 | 목표성능 분해 및 검증방법 정의(요구사항 추적표 초안) — 후속 DT 항목·기준의 모체 | proposed (DT 대비 준비; 응용연구 mandatory 근거 없음) | 훈령 제71조③4 (시험평가 항목 및 기준); SE가이드북2017 p.59 (SFR 종료조건: 기능요구 추적성) |
|  | 적용대상 무기체계 유무·개발상태 판정 및 시험개발 연계 시나리오(제71조①1가/나/다/2 분기 선택) | mandatory (시험평가 계획 방식 결정 전제) | 훈령 제71조①1~2; 규정 제116조② (탐색/체계개발 포함 수행 가능) |
|  | 시제품 제작 여부 결정 기록(응용연구 종결 시 시험평가 실시 조건) | mandatory (variant 분기 변수) | 훈령 제71조① 단서 |
|  | 디지털지형정보·주파수 소요 식별(해당 시) | conditional | 규정 제44조①~③; 훈령 제88조⑥1 |
|  | SFR 회의록 및 조치결과(SE 준용) | proposed (unstated for 응용연구) | SE가이드북2017 p.60 (SFR 수행결과서) |
| **90 (spine PDR 자리; 권고 폴더명 PDR_기본설계및중간평가)** — 기본설계·성과평가(중간평가) | 성과평가(중간평가) 자료·결과 — 개발목표 대비 진척, 위험 | mandatory (명칭만 정본; 세부 미정) | TE실무가이드북2013 p.37 (성과평가 = 중간평가·단계평가) — 세부 시기·양식 NOT_FOUND |
|  | 기본설계 패키지(설계기술서·개발규격서(안)·인터페이스 초안) — SE 준용 | proposed (unstated for 응용연구) | SE가이드북2017 p.73-74 (PDR [F]/[D] 산출물) |
|  | 기술성숙도 판단 근거(TRL) — 시험개발·탐색개발 진입 판단 연계 | proposed (간접 근거) | 규정 제39조⑨ (TRL 4↑ 탐색개발, TRL 6↑ 체계개발 진입 기준; 선행연구 결과 기준이며 응용연구 직접 규정 아님) |
|  | PDR 회의록 및 조치결과(SE 준용) | proposed (unstated for 응용연구) | SE가이드북2017 p.73 |
| **120 (spine CDR 자리; 권고 폴더명 CDR_상세설계및단계평가)** — 상세설계·시제품 제작 결정·성과평가(단계평가) | 성과평가(단계평가) 자료·결과 및 다음 단계(시험개발) 진입 필요성 판단 | mandatory (명칭만 정본; 세부 미정) | TE실무가이드북2013 p.37; 훈령 제50조②1나 (다음 단계의 필요성·성공 가능성) |
|  | 상세설계 패키지·시제품 제작 계획(시제품 제작 결정 시) | conditional (시제품 제작 시; SE 산출물 형식은 proposed) | SE가이드북2017 p.87 (CDR [F] HDD/SDD/IDD/ICD, 제품규격서(안)); 훈령 제71조① 단서 |
|  | 개발시험평가계획(안) 초안 7항목(개요·기간 및 장소·장비 및 수량·항목 및 기준·인원·예산·협조사항) 준비 | conditional (시제품 있고 시험평가 실시 시 mandatory) | 훈령 제71조③ |
|  | CDR 회의록 및 조치결과(SE 준용) | proposed (unstated for 응용연구) | SE가이드북2017 p.87 |
| **150 (spine TRR 자리; 권고 폴더명 TRR_시험준비및DT계획확정)** — 시험준비상태·개발시험평가계획 확정 | 개발시험평가계획(안) 방사청(국방기술보호국/사업관리본부) 제출 → 합참 착수 2개월 전 제출; 확정계획 1개월 전 통보 접수 | conditional (시제품·시험평가 실시 시 mandatory) | 훈령 제71조③④; 제71조② (적용체계 없으면 DT계획만) |
|  | 시험준비검토회의(TRR) — DT 착수 15일 전 원칙(무기체계 절차 준용) | conditional (준용; '원칙' 표현) | 훈령 제65조① (원칙); 제72조⑥ (핵심기술은 무기체계 절차 준용); SE가이드북2017 p.88 |
|  | 시험평가절차서·시험환경·안전 확인 자료(SE 준용) | proposed (unstated for 응용연구) | SE가이드북2017 p.89-90 (TRR 진입기준) |
|  | 운용시험평가계획(안) — 적용 무기체계가 있고 OT 실시 시 소요제기기관 수립(방사청 협조) | conditional (주로 시험개발; 응용연구는 드묾) | 훈령 제71조⑤; 제72조③ |
|  | TRR 회의록 및 조치결과 | proposed | SE가이드북2017 p.97 |
| **180 (spine FCA 자리; 권고 폴더명 FCA_개발시험평가및판정)** — 개발시험평가 수행·결과보고·판정 | 개발시험평가 수행(확정계획 준수) 및 결과보고서 6항목(개요·기간 및 장소·장비 및 수량·항목ㆍ기준 및 결과·기준미달 항목 및 보완계획·결론 및 건의) 1개월 내 방사청 제출 | conditional (시험평가 실시 시 mandatory) | 훈령 제72조① |
|  | 합참 판정 접수: 기준 충족/기준 미달 (핵심기술 DT) | conditional (시험평가 실시 시 mandatory) | 훈령 제61조②1; 제72조② |
|  | 기준미달 시 재시험 계획(무기체계 절차 준용; 위원회는 실무위로 대체) | conditional | 훈령 제66조④ (재시험); 제72조⑥ |
|  | 기능적형상확인(FCA) 상당 자료 — 시험결과-요구조건 추적, 예외/유보사항 목록(SE 준용) | proposed (unstated for 응용연구) | SE가이드북2017 p.99; p.104 |
|  | 공인시험기관 시험성적서 확보 — 후속 체계개발에서 핵심부품 시험 대체 근거 | conditional (후속 체계개발 적용 예정 품목; 조문은 시험개발 대상) | 규정 제79조⑤⑥ (시험개발 성적서 대체·시험기관 승인 기준 ISO/IEC 17025 등) |
| **210 (spine PCA 자리; 권고 폴더명 PCA_과제종결및이관)** — 과제 종결·집행성과 분석·시험개발/무기체계 이관 | 집행성과 분석 요소 대응자료(개발목표 대비 성과·국산화 수준, 다음 단계 필요성·성공 가능성, 재원 경제성, 주요 의사결정 적절성, 개발인력·기술관리 실태, 도입기술 활용) | conditional (집행성과 분석평가 대상 선정 시) | 훈령 제50조②1 |
|  | 운용시험평가 결과보고서(1개월 내 합참) 및 군사용 적합/부적합(잠정 적합) 판정 접수 — 적용 무기체계 OT 실시 시 | conditional (주로 시험개발) | 훈령 제72조③④⑤; 제61조②2 |
|  | 임시규격 제정 건의(적용체계 탑재 곤란 시 최초 OT 후) 또는 국방규격화 연계 메모 | conditional | 훈령 제71조①1가2); 제156조 (정식/임시규격) |
|  | 기술자료·시험성적서·시제품 인계 패키지(시험개발 또는 탐색/체계개발 포함 수행 이관용) | conditional (후속 단계 있을 때) | 규정 제116조②; 제79조⑤; SE실무지침서 §2.4.10 (page 53) |
|  | 디지털지형정보 기술문서·SW·데이터 제출(해당 시) | conditional | 규정 제44조③ |
|  | 물리적형상확인(PCA) 상당 자료 — 시제품 형상·도면·SW 버전 일치 확인(SE 준용; 성능기반 획득 시 PCA 없음) | proposed (unstated for 응용연구) | SE가이드북2017 p.106; p.111 |
|  | 과제 종결회의 결과·최종보고서(명칭·양식 NOT_FOUND; 업무처리지침 위임) | unstated (HOLD: 업무처리지침 확보 후 확정) | 규정 제116조③; 부칙 제3조 — 정본 부재 |

- 분기 변수: (1) 시제품 제작 여부(훈령 제71조① 단서) — 없으면 150/180 비활성, 성과평가(중간·단계)로 종결; (2) 적용대상 무기체계 유무·개발상태(훈령 제71조①1~2) — OT·임시규격·시험개발 이관 항목 활성 여부.
- 판정 어휘: DT = 기준 충족/기준 미달, OT = 군사용 적합/부적합/잠정 군사용 적합(훈령 제61조②); 위원회는 방위사업기획ㆍ관리실무위원회로 본다(훈령 제72조⑥). 무기체계의 '전투용 적합' 계열과 필드 분리 필요.
- 고정 내부관리 task(INBOX/LOG/TDP)는 기존 spec과 동일하게 is_fixed로 추가하면 되므로 제안 표에서 생략.

### 5.3 corpus gap 선언

- 「국방기술 연구개발 업무처리지침」(방사청 예규) — 규정 제17조·제116조③ 위임 — 라이브러리 부재(NOT_FOUND) → **2026-08-18 후속: 제974호(2025-02-14) 확보, §10.3 반영**
- 직전 방위사업관리규정 제172조~제193조의6(핵심기술 절차; 부칙 제3조로 유효) — 라이브러리 부재 (후속에서도 미확보)
- 「선행연구 수행지침」 — 규정 제36조②·제37조① 위임 — 라이브러리 부재 → **2026-08-18 후속: 제881호(2023-10-13) 확보, §10.2 반영**
- 응용연구 자체의 정의(목적·범위·TRL 목표), 중간·단계평가 시기·양식, 종결회의·최종보고서 양식 — 네 정본 모두 NOT_FOUND
- 따라서 'proposed'/'unstated' 항목은 Owner 확인 전 HOLD이며, gate 코드 30~210·SRR~PCA 폴더명은 저장소 관행 맞춤일 뿐 어떤 정본도 응용연구에 SE 기술검토회의를 요구하지 않는다(SE가이드북2017 p.8, SE실무지침서 §1.1.2, 규정 제79조②).

## 6. 2024 개정 가이드북 반영사항

- 근거: parent-supplied 2024 notes + OCR 스팟체크(critic) — se2024_guidebook_extract.json 부재로 원문 재독 없음. 페이지 매핑: pdf p = 인쇄 p + 4 (스팟체크 2건에서 확인; 인쇄 번호는 페이지 하단).
- 규정 명시 검토회의 = SRR/SFR/PDR/CDR/TRR/FCA/PCA. 가이드북 산출물은 '조정 적용 가능한 대상(의무 아님)' — 인쇄 p.26.
- 명칭 변경(2017→2024): 체계규격서(SSS) → 기능형상식별서; 개발규격서 → 개발형상식별서; 제품규격서 → 제품형상식별서 (SE가이드북2024(OCR) pdf p.25-27).
- 기타 수록: 신속원(방산기술지원센터→국방신속획득기술연구원) 진입조건 검토(업체주관); 품질통제점 회의(PDR/CDR/TRR); 함정사업 부록; 국과연주관 절차; PRR/FFRR/IBR/SSR 소개.
- 판독 불가: 부록 E 표(산출물 서식/현황표)는 OCR 판독 불가.

| 검토회의 | 2024 산출물(OUTPUT) | 2017 대비 | 체계개발 variant 반영 상태 |
|---|---|---|---|
| SRR | SSRS, 기능형상식별서(안), ICD(안), SDP, SRR 결과서, 기술계획 최신화 | 체계규격서(안)→기능형상식별서(안) 개명; 내용 동일 | 40·47·48·45·43 반영; TEMP_D(46)는 P-TEMP가 정본 명칭 |
| SFR | 기능형상식별서 확정, SSDD(안), HRS(안), SRS(안) | 체계규격서 [F]→기능형상식별서 확정 | 71·74·72·73 반영; SSRS_F(64)는 SRR 확정본이라 명칭 주석 필요 |
| PDR | SSDD, HRS, SRS, 개발형상식별서·국방규격 초안 I, HDD(안), SDD/IDD/DBDD 개략 | 개발규격서(안)→개발형상식별서·국방규격 초안 I; DBDD 개략이 PDR로 명시 | 96·95·104·105·99·106 반영; HRS/SRS는 PDR 확정인데 variant는 CDR 확정(97/98→140/141) |
| CDR | HDD, SDD, IDD, DBDD 상세, STP(안), ICD, 제품형상식별서(안)·국방규격 초안 II | 제품규격서(안)→제품형상식별서(안)·국방규격 초안 II; STP(안) 명시 | 125~129·142·143 반영 |
| TRR | 시험평가계획서, STP, STD, STR, SPS, SCS | SW 문서 6종 명시 | 165·161·162·160 반영; SCS(SW목록명세서) 별도 슬롯 없음(160에 포함 여부 확인) |
| FCA | FCA 계획서·점검표·결과보고서, 국방규격화연계표 | 계획서·점검표 명시 | 189 결과보고서만; 계획서·점검표 없음(빠진 필수 #15), VCRM(190)은 국방규격화연계표로 개명 검토 |
| PCA | PCA 계획서·점검표·결과보고서, 제품형상식별서 | 제품규격서→제품형상식별서 | 214·223 반영; 계획서·점검표 없음(빠진 필수 #15) |

- 2024 개정본은 산출물 명칭 통일(형상식별서 3종)과 SW 문서·품질통제점 회의(PDR/CDR/TRR)·신속원 진입조건 검토를 추가했을 뿐 게이트 spine·의무 여부(비의무)는 2017과 같다. variant의 '방사청 가이드북 p.N' 인용은 2024 인쇄면 기준(=pdf p+4)이며 근거 텍스트는 2017판이므로 판 혼용 주의.

## 7. 교차 모순·주의점

### 7.1 정본 간 모순 (규칙 제정에 영향)

| # | 쟁점 | 내용 |
|---|---|---|
| 1 | SRR 필수성 | SRR 필수성: 규정 제56조④5은 '체계요구조건검토는 탐색개발을 생략하는 경우에만 수행'(체계개발 관점 conditional; 탐색개발에서는 제56조③3로 수행)인 반면, SE가이드북2017 p.39는 모든 사업유형에서 SRR 수행(탐색 후반부 또는 체계 초기, 재수행 가능)으로 mandatory 취급; SE실무지침서 §4.2·§2.4.3은 '탐색개발 완료시점 원칙, 체계개발은 탐색생략시에 한함'. 훈령에는 SRR 용어 자체가 없음(not_found). 저장소 common_se_base_v0.yaml은 SRR tailoring_status: required로 고정 → 규정과 정합하지 않음. |
| 2 | 검토회의 명칭 불일치 | 검토회의 명칭 불일치: 규정 제56조④5·제79조② = 체계요구조건검토/체계기능형상확인/물리적 형상확인; SE가이드북2017 p.98 = 기능적형상확인(FCA)(p.8에서 규정 용어와 동일하다고 자체 해설); SE실무지침서 §4.2 = 체계요구사항검토(SRR), §4.7 = 체계검증검토(SVR)/FCA(SVR은 규정 미명시 각주19); 훈령 제65조① = 시험준비검토회의(TRR) vs 규정·가이드북 = 시험준비상태검토(TRR); 훈령 본문에는 SRR/SFR/PDR/FCA/PCA가 없고 CDR만 등장(제15조③, 제63조③). |
| 3 | TRR 필수성 | TRR 필수성: 훈령 제65조①·제68조①·제74조①은 DT/OT/구매 각각 15일 전 개최 '원칙'(강제 아님)이나, 규정 제79조②는 연구개발주관기관 수행 항목으로 열거(mandatory 취급), SE가이드북2017 p.88은 mandatory·DT/OT 분리 시 각각; SE실무지침서 §4.6은 '필요시 부체계 TRR' 추가. |
| 4 | PCA/PRR 필수성 | PCA/PRR 필수성: 규정 제79조②는 '양산기준설정 등을 위한 물리적 형상확인'을 체계개발 수행항목으로 열거(mandatory 취급)하고 PRR은 제82조④에서 MRA 수행 시 생략 가능(conditional); SE실무지침서 §4.9는 PCA를 '후속양산 결정 이전 원칙, TDP 미수정 시 계약자 내부 PCA'로 conditional 취급하고 §4.8은 PRR을 SFR/PDR/CDR마다 반복 검토+최종 PRR로 확대; SE가이드북2017 p.100·p.106은 성능기반 획득환경에서 PCA 활동 없음. 세 문서의 PCA 시점(규격화 간·양산 전 / 후속양산 결정 전 / 초도양산 착수 전 PRR 동시)도 상이. |
| 5 | FCA 시점 | FCA 시점: SE가이드북2017 p.98 = DT 후 OT 전(필요시 OT 간); 규정 제79조② = '개발시험평가 및 체계기능형상확인' 순서(정합); SE실무지침서 §4.7 = 시험평가/규격화 후반부·초도생산 이전·PRR과 동시 가능(OT 이후 시점 함의) → 시점 불일치. |
| 6 | 현존전력 성능극대화 요건 | 현존전력 성능극대화 요건: 규정(2026-08) 제62조의2② = 총사업비 300억 미만(특수 500억)·24개월(특수 60개월) vs 현존전력지침(2023-12) 제8조② = 200억 미만·24개월(합참 시험평가 필요 시 36개월) → 지침이 stale. 또한 현존전력지침 제8조③6는 '합참 주관 시험평가 필요 사업'을 대상 제외로 두면서 제8조②3·제21조⑦는 시험평가 필요 대상사업의 절차(DT만 원칙, 부착시험, 연동 시 OT)를 규정 → 지침 내부 긴장(위원회 예외 선정 경로 제8조③ 단서로 해소되나 명시적이지 않음). |
| 7 | 성능개량 트랙 이원화 | 성능개량 트랙 이원화: 훈령 제86조③ = 경미한 성능개량은 합참 분류검토→방사청 자체심의→DT만 원칙(부착시험, 체계영향 시 OT)→규격 제정 (검토회의 명칭 없음); 규정 제62조④ = 성능개량추진계획(제39조 준용)+체계개발기본계획 동시수립 가능, 제39조⑨2가 = 기전력화 성능개량 TRL 6↑ 시 체계개발 직접 진입(→ 제79조② 전체 검토회의 적용 함의); SE가이드북2017 표1 p.30 = 'OO 성능개량 사업'이 SRR 산출물 SSRS·SSS를 작성한 실사례. 즉 성능개량에 SE 검토회의가 붙는지 여부는 규모(경미/중대)와 진입 단계에 따라 갈리며 정본 간 명시적 통일 규칙 없음. |
| 8 | 운용성확인 필수성 | 운용성확인 필수성: 규정 제56조③3은 탐색개발 수행항목 열거, 제58조①2는 통합 사업에서 '필요 시'(conditional); 훈령 제76조①은 소요제기기관이 탐색개발 기간 중 '실시한다'(mandatory; 탐색생략 시 체계개발 중 가능, 함정은 기본설계시험평가 대체). |
| 9 | TEMP 확정 시점 | TEMP 확정 시점: 훈령 제63조③ = CDR 종료 후 3개월 이내(또는 ROC 결정 후 3개월 이내) 확정·통보; SE가이드북2017 p.83·표2 p.35 = CDR에서 TEMP 작성(CDR 이후 TEMP); SE실무지침서 §4.5 = CDR 진입기준에 'TEMP 승인' 포함 → TEMP 승인이 CDR 전인지 후인지 상충. |
| 10 | P-TEMP 작성 시점·주체 | 예비시험평가기본계획서(P-TEMP) 작성 시점·주체: 규정 제73조② = 탐색개발결과보고서 제출 시(탐색개발 산출); 훈령 제63조① = 체계개발실행계획서 근거로 연구개발주관기관 작성(체계개발 TEMP 근거); SE가이드북2017 p.34·p.46 = SRR 이후 작성·SFR 최신화, 미작성 사업은 TEMP(안)에 포함. |
| 11 | 핵심기술 시험평가 기초문서 명칭 | 핵심기술 시험평가 기초문서 명칭: 훈령 제59조③ = '연구개발계획서'에 기초; TE실무가이드북2013 p.37 = '응용연구계획서 및 시험개발계획서'에 기초; 규정 제116조·부칙 제3조는 명칭 미정의(구 훈령 제172~193조의6 위임). |
| 12 | 응용연구 종결 시 시험평가 조건 | 응용연구 종결 시 시험평가 조건: 훈령 제71조① 단서 = 시제품이 제작된 경우에 한하여 '실시할 수 있다'(permissive·conditional); TE실무가이드북2013 p.37 = '응용연구단계로 종결되는 사업 … 에 대하여 수행하며'(무조건 수행처럼 기술) → 강도 차이. |
| 13 | 양산 단계 명칭 | 양산 단계 명칭: 규정 제56조⑤·제82조 = 최초양산/후속양산; SE가이드북2017 p.18 = 초도양산(FT)/후속양산/전력화 평가; SE실무지침서 §2.5 = 초도생산/최소전술단위 전력화평가/후속양산; 훈령 제80·83조 = 야전운용시험(최초물량)/전력화평가(배치 후 1년 이내). |
| 14 | 조문 번호 stale | 조문 번호 stale: SE실무지침서(훈령 170호, 2012)는 규정 제111조·제113조·제119조·제120조·제125조를 인용(현행 제68~69조·제77조·제79조 등으로 이동); SE가이드북2017 p.123은 SSRS 근거로 규정 제114조·제123조를 인용; TE실무가이드북2013 p.64는 규정 제119조를 인용 → 현행 2026 규정 번호와 불일치. |
| 15 | SE 검토회의의 응용연구·시험개발 적용 | SE 검토회의의 응용연구·시험개발 적용: 규정 제79조②·SE가이드북2017 p.8·SE실무지침서 §1.1.2 모두 적용범위를 무기체계 탐색·체계개발로 한정(응용연구 NOT_FOUND)인데, 저장소 variant 관행(pre_study_basic_v0·operational_rd_basic_v0)은 비무기체계 사업유형에도 SRR~PCA spine을 유지 → 정본 근거 없는 spine 유지이며 evidence_level를 낮춰 표기해야 함. |

### 7.2 검증 방법상 체계적 위험 (critic; 원문 영문은 JSON `systematic_risks`)

1. 규정 파생 텍스트의 조번호 drift: 1조가 1행이라 line 근접으로 조번호를 추정하면 틀린다(SDP의 제47조①은 실제 제49조①). 제N조 인용은 본문 재독으로 확정한다.
2. 문자 그대로의 NOT_FOUND는 용어가 외국 참고표에만 있을 때 틀릴 수 있다: SE실무지침서는 DoDI 5000.2 검토표(MRR·PRR·SAR·AoA)를 재수록하므로 그곳의 키워드 히트는 미국 문맥이지 국내 요구가 아니고, 반대로 NOT_FOUND 주장은 그것을 놓쳤다.
3. SE가이드북2024(OCR)는 라틴 약어·괄호가 깨져(예: '소프트웨어개발계획서(60『)') SDP/SEMP/SSRS/ICD grep이 실패한다. 한글 정식명으로 검색하고, 인쇄 번호가 페이지 하단에 있으므로 pdf=인쇄+4 매핑을 페이지별로 확인한다.
4. TE실무가이드북2013 OCR은 단어 간 공백이 없어('응용연구단계로종결되는사업') 공백·구문 정규식이 빗나가고, grep만 의존하면 거짓 NOT_FOUND가 나온다.
5. SE가이드북2017 표는 행·열 헤더 없이 셀 단위로 평탄화돼('* 이후P-TEMP' 뒤 게이트 라벨 없이 SFR 산출물 나열) 산출물의 게이트 귀속을 순서로 추론해야 한다 — 목차·표만 읽으면 게이트 시점을 오배정할 수 있다(SSRS/HRS/SRS Draft vs Final 논쟁 일부가 여기서 비롯).
6. 출처 간 단계·검토명 모호성: 시험준비검토회의(훈령) vs 시험준비상태검토(규정·가이드북), 체계기능형상확인(규정) vs 기능적형상확인(가이드북), 제조준비상태검토(MRR, DoDI 표) vs 제작준비검토(LIG Q4) vs 제조성숙도평가(MRA) — 키워드 검색이 이를 뒤섞으므로 판정에는 어떤 용어를 검색했는지 명시한다.
7. 키워드 히트의 사업유형 누수: 시운전은 함정 후속함(규정 제93조)·재활용장비(제56조⑯)·전시 조기추진(훈령)에서, 착수회의는 사전개념연구(훈령)에서 나온다 — 체계개발/응용연구 범위 밖 히트는 걸러낸 뒤 지원을 선언한다.
8. 응용연구 corpus gap: 규정 제116조③·부칙 제3조가 「국방기술 연구개발 업무처리지침」과 구 제172~193조의6에 위임하는데 둘 다 라이브러리에 없다. 응용연구 gate·산출물의 NOT_FOUND는 corpus 부재이지 부존재 확인이 아니므로 'unstated'를 '불필요'로 격상하지 않는다.
9. 판 혼용: variant 페이지 인용은 2024 인쇄면, 근거 행은 대부분 2017 파생 텍스트. 개명된 산출물(체계규격서→기능형상식별서 등)은 한 판만 보면 불일치처럼 보인다.
10. LIG 고유 게이트(Q1~Q8, G1~G6)는 정의상 정부 정본에 없다. 'unsupported' 분류는 옳지만 결함으로 읽지 않으며, variant의 source 필드(LIG 개발품질 N)가 이미 계약 항목임을 표시한다.

## 8. 스팟체크 결과

- critic 스팟체크 11건: confirmed 9 / refuted 2 / unverifiable 0.

| # | 유형 | 주장(요약) | 결과 | 정정/근거 요약 |
|---|---|---|---|---|
| 1 | source_supported | Task 36 SEMP: SE실무지침서 §5.1.3.4 (SEMP(안) in 체계개발실행계획), SE가이드북2017 p.120 (SEMP definition), SE가이드북2024(OCR) pdf p.133 =… | confirmed | SE실무지침서: 연구개발주관업체가 SEMP(안)을 부록으로 포함하는 체계개발실행계획(안) 작성; SE가이드북2017 (page 120 marker at): item 29 체계공학관리계획(SEMP) 연구개발주관기관 작성; SE가이드북2024(OCR) '<!-- page 133 -->'… |
| 2 | source_supported | Task 45 SDP listed as SRR 산출물: SE가이드북2017 p.34 and SE가이드북2024(OCR) pdf p.43 | confirmed | SE가이드북2017 (page 34 marker): '산출물 •SSRS •SDP •체계규격서(안) •ICD(안) •SRR 수행 결과서'; SE가이드북2024(OCR) '<!-- page 43 -->' '4) 소프트웨어개발계획서(...)' within SRR 산출물 list… |
| 3 | source_supported | Task 45 SDP: 규정 제47조① = 소프트웨어개발계획서 IPT 검토·승인 (mandatory) | refuted | 정정: SDP 검토·승인 조문은 규정 제49조①(제47조①은 SW 기술문서·국방규격 포함 조항). 실체·판정(source_supported)은 유지, 조번호만 오류. |
| 4 | source_supported | Task 189 기능형상확인결과보고서(FCA): SE가이드북2017 p.104 (기능적형상확인 결과보고서 [F]); 규정 제56조④5, 제79조② (체계기능형상확인) | confirmed | SE가이드북2017 page 104 marker at; '•기능적형상확인 결과보고서'; table row '기능적형상확인 결과보고서 / F' and '1) 기능적형상확인 결과보고서'; 규정 (제56조④5) and (제79조②) both enumerate '개발시험평가 ...… |
| 5 | unsupported | Task 34 계약자료검토결과(Q1) — NOT_FOUND in 규정 / 훈령 / SE가이드북2017 / SE실무지침서 | confirmed | SE_FolderTree_Guide.md (source: LIG 개발품질 1, 첨부1 Q1 활동). Grep of 계약자료\|계약 자료\|Q1 across the four sources returns only CDRL mentions (SE실무지침서) and none in the… |
| 6 | unsupported | Task 124 제작준비검토결과(MRR_Q4) — 'NOT_FOUND ... no government source defines an MRR' | refuted | 정정: MRR은 SE실무지침서 p.78 DoDI 5000.2 참고 검토표에 '제조준비상태검토(MRR)'로 등장 → 문자 그대로의 NOT_FOUND는 오류. 다만 미국 참고표이지 국내 요구가 아니므로 unsupported 판정은 유지. |
| 7 | unsupported | Task 187 설치및시운전기록(STW) — NOT_FOUND; 시운전 appears only for 함정 후속함 (규정 제93조) | confirmed | SE_FolderTree_Guide.md (source: 현장지원). 시운전 hits: 규정 (제93조/제93조의2 후속함·잠수함 시운전) (제56조⑯ 재활용장비, 함정사업의 경우 시운전) (전시 조기추진·함정); 훈령 (전시 함정 후속함 시운전). No 체계개발… |
| 8 | missing_required | 제조성숙도평가(MRA) mandatory at 체계개발 종료: 규정 제78조③, 제79조③ (MRL 8) | confirmed | 규정 (제78조③ 통합사업관리팀장은 체계개발결과물에 대해 제조성숙도평가를 관리); (제79조③ 연구개발주관기관은 제조성숙도 평가결과 목표 성숙도 수준(제조성숙도수준 8)을 달성하여야 한다). Grep of SE_FolderTree_Guide.md shows no MRA/제조성숙도… |
| 9 | missing_required | 사업중간점검 결과보고서 (별지27) mandatory before CDR 종료: 규정 제65조①, ③④ | confirmed | 규정 제65조① '체계개발 사업추진 과정에서 상세설계검토 종료 이전에 ... 사업관리 위험요소를 점검하여야 하며'; ③ 탐색개발 조건부·함정 PDR 후 2개월 이내; ④ '점검결과(별지 제27호서식)에 따라 ... 후속조치'. It is an IPT duty (통합사업관리팀장)… |
| 10 | 응용연구 derivation | 훈령 제71조① 단서: 응용연구 단계 종결 시 시제품이 제작된 경우에 한하여 시험평가 실시 가능; 제61조② 판정어 기준 충족/미달·군사용 적합/부적합; 제72조⑥ 무기체계 절차 준용(위원회=실무위) | confirmed | 훈령 제71조① 본문+단서 verbatim as claimed; 제61조② 1. 개발시험평가: 기준 충족/기준 미달, 2. 운용시험평가: 군사용 적합/부적합(잠정 적합 가능); 제72조① DT 결과보고서 1개월 내 방사청 제출; 제72조⑥ 준용 및 실무위원회 대체. |
| 11 | 응용연구 derivation | 핵심기술 3단계 명칭·위임 구조: 규정 제116조①②③ (기초연구·응용연구·시험개발 단계별 사전승인; 시험개발 우선; 업무처리지침 위임), 부칙 제3조 (직전 훈령 제172조~제193조의6 유효)… | confirmed | 규정 제116조①~③ and 부칙 제3조 read as claimed; TE실무가이드북2013 page 37 marker items 가./나./다. match (note OCR text has no inter-word spaces, e.g.… |

## 9. 결론 및 다음 액션

### 9.1 결론

- 체계개발 variant는 유지 가능(spine 부합, 60 지원/30 부분). 부분 지원 30건은 명칭·시점 주석으로 해결되고, 미지원 14건은 주계약사 계약 품질 게이트라 결함이 아니다. 빠진 필수 17건(특히 MRA·사업중간점검·국방규격화·체계개발결과보고서·DT/OT 계획서)이 실질 보완 대상.
- 탐색개발·선행연구 variant는 체계개발 명명틀을 차용한 상태여서 재기준(re-base) 대상. 실체 항목(TRA·운용성확인·진입판단 / 계획서·조사분석·대안분석·기본전략)은 이미 들어 있으나 정본이 쓰지 않는 게이트 라벨 아래 배치돼 있고, 각 게이트의 회의록 task는 타 단계 항목.
- 운용연구개발 variant는 트랙(경미 성능개량 / 현존전력 / 중대 성능개량) 분리가 필요하며, spine 자체는 상충하지 않는다.
- 응용연구는 「국방기술 연구개발 업무처리지침」·직전 규정 제172~193조의6이 없어 정본 확정 불가 — 제안 gate로 variant를 만들되 tailoring_status를 optional/unstated로 두고 HOLD.

### 9.2 다음 액션 (엔진 stage-rule 통일용)

| # | 범위 | 액션 | 근거 |
|---|---|---|---|
| 1 | 공통 spine | common_se_base_v0.yaml의 SRR tailoring_status 'required'를 규정 제56조④5(탐색개발 생략 시에만) 기준 conditional로 낮추고, 탐색개발 variant에서만 required로 둔다. | 규정 제56조③3·④5; SE가이드북2017 p.39 |
| 2 | 공통 spine | 검토회의 용어 이원화를 엔진 사전에 등록: 시험준비검토회의(훈령) = 시험준비상태검토(규정·가이드북); 체계기능형상확인(규정) = 기능적형상확인(가이드북); MRR(DoDI 참고표)·제작준비검토(LIG Q4)·제조성숙도평가(MRA)는 서로 다른 항목. | critic systematic_risks; derive contradictions |
| 3 | 공통 인용 | 조번호 인용은 line 근접이 아니라 제N조 본문 재독으로 확정(스팟체크 제47조①→제49조① 오인). 2024 가이드북 인용은 인쇄면·pdf면(+4)을 병기. | critic |
| 4 | 체계개발(system_dev_lig_grade_a) | source_supported 60건 유지. partially_supported 30건은 명칭·시점 주석 부여(SSRS_F는 SRR 확정본, HRS/SRS는 PDR 확정, SRR의 TEMP_D는 P-TEMP, RTM/VCRM은 추적성 기준·국방규격화연계표). unsupported 14건은 'LIG 계약 품질 게이트(Q1~Q8·G1~G6)'로 태깅하여 타 주계약사 variant에서는 N/A. 240_LL은 내부관리로 표시. | cmp_system_dev; SE가이드북2017 p.49/60/73; 규정 제79조② |
| 5 | 체계개발(system_dev_lig_grade_a) | 빠진 필수 17건 추가: MRA(MRL 8), 사업중간점검 결과보고서(별지27), 국방규격(안)·국방규격화연계표, 체계개발결과보고서(별지14)+TDP, DT 계획서(별지5)·절차서, OT 계획서(별지7), P-TEMP, M&S 활용계획, 상호운용성 확보계획, RAM 업무계획·분석보고서, 등록부품활용계획, 핵심부품 공인시험 성적서, WBS(조건부), 형상관리계획서(권고), FCA/PCA 계획서·점검표·QAR(권고), 양산 계약 전 제출자료, 공식기술검토회의 자료 제출본. | 규정 제65·78·79·80·81조; 훈령 제63~67조 |
| 6 | 탐색개발(exploratory_dev_common_no_grade) | 재기준(re-base) 필요: SRR 유지, SFR은 partial(실무지침서 표6만), PDR/CDR/TRR/FCA/PCA는 탐색개발 근거 없음 → 출처 기반 마일스톤(기술입증·시제 / 운용성확인 / TRA / ROC·P-TEMP / 결과보고·진입심의)으로 재라벨하거나 optional 내부검토로 명시. TEMP_D→예비시험평가기본계획서(P-TEMP), 개발시험결과(DT)→기술입증 시험, 탐색개발최종보고서→탐색개발결과보고서(별지11)로 개명. 빠진 필수 14건(탐색개발기본계획서·실행계획서·RFP/SEMP, ORD·ROC(안), P-TEMP, 체계개발 일정·비용, 주파수, 방첩사 검토, M&S, 상호운용성, SDP, 사업중간점검, 협약 최종평가, 사업종결회의) 추가. | 규정 제56조③·제67~73조; 훈령 제52조·제76조; TE가이드북2012 Page 40/57 |
| 7 | 선행연구(pre_study_common_no_grade) | 재기준 필요: 7게이트 회의 task(38·68·98·128·158·188·218)와 게이트 전용 산출물(SSRS_F·RTM·기준선·TRR/STP·FCA 요구충족)은 타 단계 항목. 출처 정합 spine = 선행연구계획 → 조사분석 → 획득방안·대안분석(TRA·LCC) → 사업추진기본전략(안)/SEP → 위원회 심의(제39조⑨ 진입 판단). 사업추진기본전략(안) 별지5를 명명된 종료 산출물로 추가하고 빠진 필수 11건(ORD(안), SEP, 야전운용시험 연구, WBS/PBS, LCC, M&S, 국산품 적용, CTE, ILS 개략계획, 사업관리이력서) 반영. 세부 절차는 「선행연구 수행지침」 확보 전 HOLD. | 규정 제35~40조; 훈령 제36조; SE실무지침서 표4 |
| 8 | 운용연구개발(operational_rd_common_no_grade) | 트랙 분리: (a) 경미한 성능개량(체계개발 준용) → SRR~PCA spine 유지 + 성능개량추진계획·체계개발기본/실행계획·합참 상호운용성 검토 추가; (b) 현존전력 성능극대화 → 사업신청서(별지1)·체크리스트(별지2)·사전분석(별지4)·사업계획(별지5)·입증시험·군 수락시험·기술변경(표준화 업무규정)·종결 흐름으로 별도 variant, SRR~PCA는 optional; (c) 중대 성능개량은 체계개발 variant로 라우팅. 형상식별서 3종·형상통제제안서·국방규격 개정, DT 계획서/결과보고서 추가; 성능형 규격 사업은 PCA N/A. | 규정 제62조·제62조의2; 훈령 제86조; 현존전력지침 제5·9·17·21조; 표준화지침서 p.18-19 |
| 9 | 응용연구(신규) | 제안 gate(30~210)로 variant를 만들되 tailoring_status는 'optional/unstated', evidence_level 하향, gate 표시명은 응용연구 마일스톤(과제기획/기술요구·연계/중간평가/단계평가·시제결정/DT계획/DT판정/종결·이관)으로. 분기 변수 2개(시제품 제작 여부, 적용대상 무기체계 유무·개발상태)와 판정 어휘(기준 충족/미달, 군사용 적합/부적합/잠정 적합, 위원회=실무위)를 메타데이터로 보유. 「국방기술 연구개발 업무처리지침」과 직전 규정 제172~193조의6 확보 전까지 proposed/unstated 항목은 HOLD. | 규정 제116조·부칙 제3조; 훈령 제54·59·61·71·72조; TE실무가이드북2013 p.37 |
| 10 | 정본 확보 | 다음 3종을 지식 라이브러리에 추가한 뒤 재대조: 「국방기술 연구개발 업무처리지침」(방사청 예규), 「선행연구 수행지침」, 「기술성숙도평가 및 제조성숙도평가 업무처리규정」; 규정·훈령 별표·별지 본문(별지5·11·13·14·27, 훈령 별지4~8)도 서식 항목 수준 확인용으로 확보. 현존전력지침 개정본(규정 제62조의2 정합) 확인. **(2026-08-18 후속: 앞의 2종 확보·재대조 완료 → §10; 남은 확보 대상은 §10.5)** | 규정 제17·36·37·56·116조 위임 조항 |

### 9.3 입력 불일치 메모

- PreStudy 비교기는 supporting_source_keys에 축약 키(se_mgmt_guide, dapa_rule, mnd_dir, se_guide_2017)를 사용 → 본 파일에서 정식 출처키로 정규화함.
- OperationalRnD 비교기의 missing_required source_key는 '; '로 복수 키를 연결 → source_keys 배열로 분리(첫 키를 source_key로 유지).
- 네 비교기의 summary_counts는 task_verdicts 재집계와 모두 일치(체계개발 128 task, 나머지 각 56 task).
- citation 본문에는 언급되나 supporting_source_keys에 없는 출처가 있음: 탐색개발 비교기 8건(TE가이드북2012), 체계개발 비교기 17건(SE가이드북2024 OCR)·2건(unsupported 항목의 '가장 가까운' 출처), 선행연구 비교기 6건 — verdict에는 영향 없음, JSON은 원본 배열을 유지.
- 스팟체크 2건 refuted: (1) 체계개발 task 45 SDP의 규정 제47조① 인용은 제49조①이 정확(실체는 유지); (2) task 124 MRR 'NOT_FOUND'는 문자 그대로는 오류(SE실무지침서 DoDI 5000.2 참고표에 MRR 존재)이나 unsupported 판정은 유지. 본 파일 task note에 정정 표기.
- derive.json caveats 중 비공개 프로젝트 소스를 언급한 1건은 public-safe 원칙에 따라 본 산출물에서 제외.
- se2024_guidebook_extract.json은 scratchpad에 존재하지 않아 2024 가이드북 사실은 부모 제공 노트와 critic 스팟체크에만 근거.

## 10. 추가 원문 2종 반영 (2026-08-18 후속): 선행연구 수행지침 제881호 · 국방기술 연구개발 업무처리지침 제974호

- 상태: `DRAFT / claim_ceiling: observed / 2026-08-18 (후속 T2)`. §5.3에서 corpus gap으로 선언한 위임 지침 3종 중 2종이 지식 라이브러리에 추가되어 전문을 재독(A 147행·B 697행, 조문 단위)하고 §3.3(선행연구)·§5(응용연구)를 재판정·재제안한다.
- 표기: `선행연구지침 제N조` = A(제881호), `기술연구개발지침 제N조` = B(제974호). 기존 약칭(규정·훈령·SE실무지침서 등)은 §1 그대로. 두 지침 모두 별표 본문이 파생 텍스트에 없으므로 별표 수준 주장은 HOLD로 둔다.
- 재판정 원칙: §2 판정 정의를 그대로 적용한다. 게이트 배치(SRR~PCA 슬롯)는 선행연구·응용연구 어느 쪽도 정본이 요구하지 않으므로 판정은 '실체(활동·산출물)'에 대해 내리고 게이트 명칭 비정합은 비고에 남긴다.

### 10.1 추가 대조 원문 (§1 표 형식)

| # | 약칭 | 출처키 | 제목 | 발행 | 판/일자 | 입수 경로* | 파생 텍스트 | 읽기 한계 |
|---|---|---|---|---|---|---|---|---|
| 12 | 선행연구지침 | `dapa_preliminary_research_execution_instruction_law_20231013` | 선행연구 수행지침 | 방위사업청 선행연구과 (예규 제881호) | 시행 2023-10-13 (일부개정) | 법령센터(국가법령정보센터 행정규칙) | text (147행, 1조=1행, 전문 정독) | [별표] '선행연구 검토항목' 본문 없음(제목만) → 검토항목 수준 확인 불가(제10조 위임); 부칙 구간(136~146행) HTML 스크래핑 노이즈; '사업추진기본전략' 명칭 미등장(기본전략 연계는 규정 제39조 측 근거); 표준 연구기간 미규정(계획서 항목 '연구기간' 제10조2나만) |
| 13 | 기술연구개발지침 | `dapa_defense_technology_rnd_work_instruction_law_20250214` | 국방기술 연구개발 업무처리지침 | 방위사업청 기술정책과 (예규 제974호) | 시행 2025-02-14 (일부개정) | 법령센터(국가법령정보센터 행정규칙) | text (697행, 1조=1행, 전문 정독) | 별표1~7 본문 없음 — 특히 별표3(용어정의)·별표4/5(중간·종료평가 배점) 부재로 기초/응용/시험개발 정의문·TRL 목표·평가기준 확인 불가; 제6장 미래도전국방기술(제55~57조) 전부 삭제 → 「미래도전국방기술 연구개발사업 관리지침」 위임(라이브러리 부재); 국기연·국과연 '별도로 정한 규정' 다수 위임(제16조②·제20조①·제21조③·제25조⑤·제39조④·제41조⑦ 등, 부재); 규정 제172조·제173조 인용(제42조③·제61조①)은 구 조번호(현행 규정 부칙 제3조 경과조치); 시험개발 시험평가 계획 승인·결과판정 주체(제4조5 국방부)가 훈령 제71조④·제72조②⑤(합참)와 불일치; 발행(2025-02)이 규정(2026-08)·훈령(2026-07)보다 앞서 stale 가능 |

\* 입수 경로는 키 접미사 `_law_` 기준 추정(§1과 동일).

### 10.2 선행연구 재판정 (A 기준)

#### 10.2.1 A가 정하는 선행연구 절차 모델

| 요소 | 내용 | 근거 |
|---|---|---|
| 정의 | 선행연구 = 방위사업법 제17조①에 따라 방위력개선사업 추진방법 결정을 위해 방사청이 수행하는 획득단계; 조사·분석 = 연구개발 가능성, 소요시기·소요량 적정성, 국방과학기술수준, 기술적·경제적 타당성, 비용 대 효과 분석 등; 수행기관 = 방사청, 국기연 등 | 선행연구지침 제2조1~3 |
| 기본원칙 | 소요 결정 시 수행(긴급소요 제외); 국내 연구개발 가능성·최적 획득방안 우선 검토, 업체주관 원칙; 국과연주관 검토 시 착수시기 판단; 국기연 위탁(군·민간 전문연구기관 수행은 청장 승인); 국과연·방산업체·연구기관 일부 수행 가능 | 제5조①~⑤ |
| 수행 주체·업무분장 | 선행연구과(정책·대상과제 선정·선행연구계획서·조정통제·결과보고), 통합사업관리팀(선행연구요구서·계획서 검토·자료지원·실무회의·보고서 검토), 국기연(의견·결과물 관리), 수행기관(조사·분석 수행계획서·조사·분석·검토위원회 운영·결과보고서), 합참(의견·자료), 소요군(자료·운용요구서안 작성·제출) | 제6조1~6 |
| 절차 1: 요구·선정 | 선행연구요구서(7항목: 사업개요/무기체계 운용특성(운용환경·운용개념·운용절차·합동성 및 상호운용성)/목표운용가용도·RAM 잠정 목표값/검토 항목안/사업현안·중점검토사항/연구 중복 검토결과/ORD 초안 검토 여부·통합선행연구 여부) → 대상과제 선정(실무위 심의·의결, 매년 4월·10월, 중요/일반 구분, 통합 선행연구 지정) → 재수행(획득방안 변경 필요 시, 검토항목 최소화) | 제7조; 제8조①~④; 제9조 |
| 절차 2: 계획 | 선행연구계획서(선행연구과장 작성·차장 결재·수행기관 통보; 검토항목은 별표 기준; 사업개요/수행계획(연구범위·중점검토, 연구기간·수행기관·과제 중요도, 검토항목, 기관별 임무분장)/향후 추진계획) → 조사·분석 수행계획서(방사청 외 수행기관 작성·제출) | 제10조; 제11조 |
| 절차 3: 수행 | 운용요구서(안) 소요군 접수·검토(필요 시 운용요구조건 검토; 미제출 시 생략) → 조사·분석(IPT 정보협조·관계기관 협의 주관; 함정=개념설계 진도·관급장비 4유형 식별; 유도무기=사격시험 수량 산정 3기준; 패키지시설사업비; 성능개량=총수명주기비용 비교) → 실무회의(IPT 개최, 최종검토회의 전까지, 보고서 검토·보완·진행 점검; 합의 결과 반영, 이견은 검토위원회) | 제12조; 제13조①~⑤; 제14조의2 |
| 회의체 | 선행연구 검토위원회: 착수·중간·최종 검토회의(중간은 시급 등 부득이한 경우 생략 가능); 공동위원장(중요과제=방위사업정책국장+사업본부 부장 / 일반과제=선행연구과장+통합사업관리팀장), 간사=과제책임자, 위원 6인↑(IPT·합참·소요군·사업/비용분석 전문가 등); 위원 구성·변경은 선행연구과장 승인(착수 검토회의 전); 2/3 출석 개의·출석 과반 의결 | 제14조①~⑥ |
| 절차 4: 결과보고·종결 | 최종검토회의 이후 선행연구과장이 결과보고(중요과제→차장, 일반과제→정책국장) → 그 이후 수행기관이 선행연구 조사·분석 결과보고서 작성·제출(방사청 수행 시 선행연구과장 작성) → 국기연 결과물 종합관리·정보체계, 연간 성과분석·방법론(다음연도 1월), 출연금 집행실적 | 제15조①~③; 제17조①~③ |
| 예외: 중단·보류 | 수행 중 또는 착수 검토위원회 전 ROC 충족 제한 등으로 추진방안 제시 불가 시 검토위원회에 건의 → 심의 → 정책국장(중요과제 차장) 결재(IPT 협의) → 사유 명시 보고서 | 제16조①~④ |
| 사업추진기본전략 연계 | A에는 명칭 없음(NOT_FOUND). 선행연구 결과 → 사업추진기본전략(안)·위원회 심의·진입 판단은 규정 제39조①③⑨·훈령 제36조② 측 근거 유지 | 규정 제39조; 훈령 제36조 |
| 기간 | 표준 연구기간 미규정; 계획서 항목 '연구기간'(제10조2나)·선정 주기(4월·10월, 제8조②)만 | 제8조②; 제10조2나 |

#### 10.2.2 선행연구 variant task 재판정 (비내부 35건)

| task | 이전 판정 | 재판정 | 근거 제N조 (A) | 비고 |
|---|---|---|---|---|
| 34 사업배경및임무정의 | source_supported | source_supported (유지·근거갱신) | 제7조1·2·3; 제10조1가~마 | 요구서·계획서의 사업개요·운용특성 항목과 일치. 작성 주체는 IPT(요구서)·선행연구과(계획서)이며 수행기관은 입력물로 보유 |
| 35 선행연구수행계획서 | source_supported | source_supported (유지·근거갱신, 명칭 확정) | 제10조(선행연구계획서: 선행연구과 작성·차장 결재); 제11조(조사·분석 수행계획서: 방사청 외 수행기관); 제6조1다·4가 | 규정 위임 NOT_FOUND가 A로 해소. 문서 2종이므로 task 분리 권고: '선행연구계획서(접수본)' + '선행연구 조사·분석 수행계획서' |
| 36 선행기술자료조사 | source_supported | source_supported (유지·근거갱신) | 제2조2; 제10조 본문(검토항목은 별표 기준); 제13조① | 별표(검토항목) 본문 부재 → 항목 수준은 HOLD |
| 37 체계요구사항명세서(SSRS)_D | partially_supported | partially_supported (유지) | A NOT_FOUND(SSRS·요구사항 명세 없음); 제12조 ORD(안) 검토만 | '운용요구서(안) 검토'로 개명하면 제12조 근거 |
| 38 SRR_회의록및조치결과 | partially_supported | partially_supported (유지·근거갱신 — 회의 실체 확인) | 제14조②(착수 검토회의); ⑤(위원 구성 승인); ⑥(의결) | 이전 '회의 자체 NOT_FOUND' → 착수 검토회의로 실체 확인. SRR 명칭만 비정합 → '착수검토회의_회의록및의결' 개명 시 source_supported |
| 64 체계요구사항명세서(SSRS)_F | partially_supported | partially_supported (유지) | A NOT_FOUND | 기능기준선·SSRS 없음 |
| 65 기능분석및대안정리 | source_supported | source_supported (유지; A 간접) | 제2조2(연구개발 가능성·타당성) 간접; 별표 부재 | SE실무지침서 표4 근거 유지 |
| 66 요구사항추적표(RTM) | partially_supported | partially_supported (유지) | A NOT_FOUND | |
| 67 운용개념및시나리오분석 | source_supported | source_supported (유지·근거갱신) | 제7조2가~라; 제10조1나; 제12조① | |
| 68 SFR_회의록및조치결과 | partially_supported | partially_supported (유지) | 대응 회의 없음(A 회의체는 검토회의 3회+실무회의); 제14조의2 실무회의 회의록으로만 근사 | 삭제 또는 '실무회의_회의록'으로 개명 후보 |
| 94 개념설계기술서_D | source_supported | source_supported (유지; A는 함정 한정) | 제13조②(함정 개념설계 진도 고려) | 일반 무기체계 개념설계 문서는 A에도 없음 |
| 95 대안분석(Trade_Study) | source_supported | source_supported (유지·근거갱신) | 제2조2; 제5조②③; 제13조⑤ | 국내 연구개발 가능성·최적 획득방안·업체주관 원칙 검토가 A 명시 |
| 96 기술성숙도및위험평가 | source_supported | source_supported (유지) | 제2조2(국방과학기술수준·연구개발 가능성); TRL 자체는 A NOT_FOUND | 규정 제39조⑨ 유지 |
| 97 시험실증개념(TEMP)_D | source_supported | source_supported (유지) | 제13조③(유도무기 사격시험 수량 산정)만 | 규정 제39조①6가 유지; TEMP 명칭 비정합 그대로 |
| 98 PDR_회의록및조치결과 | partially_supported | partially_supported (유지·근거갱신) | 제14조②(중간 검토회의, 생략 가능) | '중간검토회의_회의록' 개명 시 conditional 근거(98/128 중 1개만) |
| 124 후보안구체화패키지 | source_supported | source_supported (유지·근거갱신) | 제5조②; 제13조②④ | 관급장비 식별·시설사업비 포함 |
| 125 인터페이스영향분석 | source_supported | source_supported (유지·근거갱신) | 제7조2라(합동성 및 상호운용성) | |
| 126 구현전환가정및제약 | source_supported | source_supported (유지·근거갱신) | 제5조③(국과연주관 착수시기); 제16조①(추진방안 제시 불가) | |
| 127 기준선후보및형상메모 | partially_supported | partially_supported (유지) | 제10조1가(무기체계 형상 및 주요성능) | |
| 128 CDR_회의록및조치결과 | partially_supported | partially_supported (유지) | 대응 회의 없음(98과 중복 슬롯) | 잉여 슬롯 → 삭제 후보 |
| 154 실증준비상태검토자료(TRR) | partially_supported | partially_supported (유지) | A NOT_FOUND(선행연구에 실증·시험 없음) | 삭제 후보 |
| 155 시험실증계획서(STP)_D | partially_supported | partially_supported (유지) | 제13조③만 | 97과 중복 |
| 156 자원및협의준비상태 | partially_supported | partially_supported (유지·근거갱신) | 제13조①(IPT 정보협조·관계기관 협의 주관); 제6조 자료협조 | 실증 준비가 아닌 '자료요청·기관 협조 목록'으로 개명 시 근거 |
| 157 실증안전보안검토 | partially_supported | partially_supported (유지) | A NOT_FOUND | 삭제 후보 |
| 158 TRR_회의록및조치결과 | partially_supported | partially_supported (유지) | 대응 회의 없음 | 삭제 후보 |
| 184 대안비교평가결과 | source_supported | source_supported (유지·근거갱신) | 제2조2; 제14조②(최종 검토회의 검토 대상) | |
| 185 요구충족근거자료 | partially_supported | partially_supported (유지·근거갱신) | 제12조①(운용요구조건 검토) | |
| 186 운용적합성검토결과 | partially_supported | **source_supported (변경)** | 제12조①②(ORD(안) 검토·운용요구조건 검토, 수행기관 활동); 제16조①(ROC 충족 제한 판단) | 선행연구 수행기관 활동으로 명시. '운용요구서(안) 검토결과'로 개명하고 탐색개발 '운용성확인'(규정 제56조③3·훈령 제76조)과 구분 |
| 187 이슈및후속조치 | source_supported | source_supported (유지·근거갱신) | 제14조의2③(실무회의 합의 반영·이견은 검토위원회); 제16조 | |
| 188 FCA_회의록및조치결과 | partially_supported | partially_supported (유지·근거갱신) | 제14조②(최종 검토회의) | '최종검토회의_회의록및의결' 개명 시 source_supported |
| 214 선행연구결과보고서 | source_supported | source_supported (유지·근거갱신, 명칭 확정) | 제15조②③; 제6조2마·4라 | 정식 명칭 '선행연구 조사·분석 결과보고서'; 결과보고(제15조①) 이후 제출하는 순서 제약 |
| 215 탐색개발전환권고자료 | source_supported | source_supported (유지) | 제2조1(추진방법 결정); 제5조② | TRL 진입기준은 규정 제39조⑨ |
| 216 기준선및의사결정패키지 | partially_supported | partially_supported (유지·근거갱신) | 제15조①(선행연구 결과보고) | 사업추진기본전략 명칭은 A NOT_FOUND(규정 제39조①) |
| 217 향후과제및후속연계계획 | source_supported | source_supported (유지·근거갱신) | 제10조3(향후 추진계획); 제9조(재수행) | |
| 218 PCA_회의록및조치결과 | partially_supported | partially_supported (유지·근거갱신) | 제15조①(결과보고·결재로 대체; 대응 회의 없음) | 최종검토회의 후 회의 없음 → 결과보고 결재 기록으로 대체 |

- 집계: 재판정 35건 — 판정 변경 1건(186 partially→source_supported), 유지 34건(A 조문으로 근거 갱신 27건 / A 무관·NOT_FOUND 7건: 37·64·66·128·154·157·158). 새 counts: 지원 18 / 부분 17 / 미지원 0 / 내부관리 21 / 상충 0.
- A로 새로 드러난 빠진 필수 12건(§3.3의 11건에 추가; 별표 검토항목은 HOLD로 제외):

| gate/phase | 항목 | mandatory | 근거 |
|---|---|---|---|
| 요구·선정 | 선행연구요구서(7항목; IPT 작성·통합사업관리체계 제출) 사본·포인터 | mandatory (입력) | 선행연구지침 제7조; 제6조2가 |
| 요구·선정 | 대상과제 선정 결과·중요/일반 구분·통합 선행연구 지정 통보(실무위 심의; 4월·10월) | mandatory (입력) | 제8조①~④ |
| 계획 | 선행연구계획서(선행연구과 작성·차장 결재·수행기관 통보) 접수본 — 기존 35와 별개 문서 | mandatory (입력) | 제10조 |
| 계획 | 검토위원회 위원 구성(안)·선행연구과장 승인(착수 검토회의 전; 변경 시 재승인) | mandatory (방사청 외 수행기관) | 제14조③⑤ |
| 수행 | 실무회의 회의록·합의사항 반영 기록 | conditional (IPT 개최 시) | 제14조의2 |
| 수행 | 함정: 관급장비 식별 목록(4유형)·개념설계 진도 반영 | conditional (함정) | 제13조② |
| 수행 | 유도무기: 사격시험 수량 산정 근거(3기준) | conditional (유도무기) | 제13조③ |
| 수행 | 패키지시설사업비 산정 | conditional | 제13조④ |
| 수행 | 성능개량: 신규/대체 장비 총수명주기비용 비교분석 | conditional (성능개량; IPT 협의로 조정·생략 가능) | 제13조⑤ |
| 예외 | 중단·보류 건의·검토위원회 심의·결재·사유 보고서 | conditional | 제16조①~④ |
| 종결 | 선행연구 결과보고(선행연구과장→차장/정책국장) 기록 — 결과보고서 제출 선행 조건 | mandatory (순서 제약) | 제15조① |
| 종결 | 결과물 국기연 제출·정보체계 등록 | mandatory | 제17조①; 제6조3나 |

#### 10.2.3 선행연구 재기준 gate·task 제안 (spine 코드 30~210 유지, 표시명은 A 절차)

| gate | 표시명(권고 폴더명) | task | 근거 | mandatory |
|---|---|---|---|---|
| **30** | SRR_요구및과제선정 | 선행연구요구서(7항목) 사본·포인터 | 선행연구지침 제7조 | mandatory (입력) |
| | | 대상과제 선정 결과·중요/일반·통합 선행연구 지정 통보 | 제8조①~④ | mandatory (입력) |
| | | 재수행 요구·검토항목 최소화 근거 | 제9조 | conditional (재수행 과제) |
| | | 사업배경·임무정의(운용환경·운용개념·운용절차·합동성/상호운용성·RAM 잠정 목표값) [기존 34] | 제7조2·3; 제10조1 | mandatory |
| **60** | SFR_선행연구계획및수행계획 | 선행연구계획서 접수본(3부 구성; 검토항목 별표 기준) | 제10조 | mandatory (입력) |
| | | 선행연구 조사·분석 수행계획서 [기존 35 개명] | 제11조; 제6조4가 | mandatory (방사청 외 수행기관) |
| | | 검토위원회 위원 구성(안)·승인(공동위원장·간사·위원 6인↑) | 제14조③⑤ | mandatory (방사청 외 수행기관) |
| | | 자료요청·기관 협조 목록(IPT 협조·합참/군 협의 주관) [기존 156 대체] | 제13조①; 제6조 | mandatory |
| **90** | PDR_착수검토회의 | 착수 검토회의 자료·회의록·의결(2/3 출석·과반) [기존 38 개명] | 제14조②⑥ | mandatory |
| | | 운용요구서(안) 접수·검토·(필요 시) 운용요구조건 검토 [기존 67·186 연계] | 제12조; 규정 제37조① | mandatory (ORD 제출 시; 미제출 시 생략) |
| | | 착수 전 중단·보류 건의(ROC 충족 제한 등) | 제16조① | conditional |
| **120** | CDR_조사분석수행 | 검토항목별 조사·분석 결과(연구개발 가능성·소요시기/소요량 적정성·국방과학기술수준·기술적/경제적 타당성·비용 대 효과; 국내 연구개발 가능성·최적 획득방안·업체주관 원칙) [기존 36·65·95·96·124 재배치] | 제2조2; 제5조②③; 제10조(별표—본문 부재); 규정 제39조①5·⑨ | mandatory |
| | | 함정: 개념설계 진도 반영·관급장비 식별 목록 | 제13조② | conditional (함정) |
| | | 유도무기: 사격시험 수량 산정 근거 | 제13조③ | conditional (유도무기) |
| | | 패키지시설사업비 산정 | 제13조④ | conditional |
| | | 성능개량: 총수명주기비용 비교분석 | 제13조⑤ | conditional (성능개량) |
| | | 실무회의 회의록·합의사항 반영 [기존 187 연계] | 제14조의2 | conditional (IPT 개최 시) |
| | | 상호운용성·인터페이스 검토 [기존 125], TRA·위험 [96], 시험평가 전략 [97], 전환 제약 [126] | 제7조2라; 규정 제39조①6·③4·⑨; SE실무지침서 표4 | mandatory (규정 측) |
| **150** | TRR_중간검토회의 | 중간 검토회의 자료·회의록·의결 [기존 98/128 중 1 개명; 154~158 실증 항목은 삭제 후보] | 제14조② | conditional (부득이한 경우 생략 가능) |
| | | 수행 중 중단·보류 건의·심의·결재·사유 보고서 | 제16조②~④ | conditional |
| **180** | FCA_최종검토회의 | 최종 검토회의 자료(획득방안 비교·분석평가, 요구충족·운용요구 검토, 이슈·후속조치)·회의록·의결 [기존 184~188 재배치; 188 개명] | 제14조②⑥; 제14조의2③ | mandatory |
| **210** | PCA_결과보고및종결 | 선행연구 결과보고(선행연구과장→중요과제 차장/일반과제 정책국장) 기록 | 제15조① | mandatory (방사청; 순서 제약) |
| | | 선행연구 조사·분석 결과보고서 [기존 214 개명] | 제15조②③; 제6조2마·4라 | mandatory |
| | | 다음 단계 진입 판단(TRL 4↑ 탐색/6↑·CTE 없음 체계)·사업추진기본전략(안) 반영 입력 [기존 215·216·217] | 규정 제39조①⑨; 훈령 제36조② (A에는 기본전략 명칭 없음) | mandatory (규정 측) |
| | | 결과물 국기연 제출·정보체계 등록 | 제17조①; 제6조3나 | mandatory |
| | | 연간 성과분석·방법론 개선 입력(국기연, 다음연도 1월) | 제17조② | recommended (포인터) |

- 제안 규모: gate 7·task 26(mandatory 15·conditional 10·recommended 1). 기존 variant 35건 중 실증 계열 5건(154~158)과 잉여 회의록 3건(68·128·218)은 삭제 후보, 나머지는 위 표의 [기존 N]으로 재배치·개명.
- 분기 변수: (1) 과제 중요도(중요/일반 — 공동위원장·보고 라인, 제14조③1·제15조①), (2) 수행기관 유형(방사청 / 방사청 외 — 수행계획서·위원 승인·결과보고서 작성 주체, 제11조·제14조⑤·제15조②③), (3) 사업 유형(함정·유도무기·패키지시설·성능개량 — 제13조②~⑤), (4) ORD 제출 여부(제12조②), (5) 통합 선행연구 여부(제8조④).
- 판정 어휘: 검토위원회 의결(2/3 출석 개의·출석 과반 찬성), 중단/보류(제16조), 결과보고 결재(차장/정책국장). 체계개발형 '진입조건 충족/보완' 어휘와 분리.

### 10.3 응용연구 제안 v2 (B 기준)

#### 10.3.1 B가 정하는 국방기술(핵심기술) R&D phase 모델

| 요소 | 내용 | 근거 | 메모 |
|---|---|---|---|
| 적용 대상 | 국방기술 = 핵심기술 + 미래도전국방기술; 미래도전은 별도 「미래도전국방기술 연구개발사업 관리지침」(제6장 삭제) | 기술연구개발지침 제1조; 제3조②; 제55~57조(삭제) | 미래도전 과제 유형 정의는 corpus 부재 |
| 단계 구분 | 핵심기술 연구개발단계 = 기초연구·응용연구·시험개발; 과제제기서·과제결정(안)에 단계·목표성능(응용/시험개발 구분) 명시 | 제35조④1; 제36조①2 | 각 단계 정의문·TRL 목표는 별표3(용어정의) 위임 → 본문 NOT_FOUND |
| 기초연구 | 개별기초(과기정통부 「미래국방혁신기술개발사업」 통합)·특화연구실·특화연구센터; 3년 단위·최대 2단계 6년(센터는 3년×2단계, 최대 3단계 9년); 복수기관 위탁 후 2단계는 1개 기관; TRL 분석·시제/시험장비 추적 예외; 방위산업기술보호계획 대상 아님; 기초연구 성과→핵심기술(시험개발 제외) 연계 | 제44조①~③; 제45조; 제46조; 제47조②; 제29조②4가·④3; 제39조①14; 제20조의2②3; 제35조④3 | 기초연구 variant 후보의 기간·유형 근거 |
| 응용연구 | 목표성능 구분 대상; 시험개발과 연계된 응용연구 계획 변경 시 시험개발 사업통제부서장 협조; 전력화 일정 수정 등으로 시험개발 진행 곤란 시 응용연구단계에서 종료 가능(시험개발 계획은 적용무기체계 탐색개발/체계개발실행계획에 포함); 방위산업기술보호계획 대상 | 제36조①2; 제10조④; 제42조④; 제39조①14 | 응용연구 고유 정의·TRL 목표는 본문 없음(별표3) |
| 시험개발 | 시험평가(계획 승인·결과판정 국방부 / 계획 수립·수행 합참·각군 — 제4조5·6; 훈령 제71~72조는 합참 → 불일치 HOLD); 연구개발계획서에 ILS 요소(조건부)·시험평가계획(통합시험 여부)·규격화계획·상호운용성 및 표준·개략 OT계획; 시험평가 준비회의; 체계개발 연계 5항목 반영·관리; DT 종료 후 OT 신규과제 편성 가능; 국방규격(안) 산학연 작성; 군사용 적합 시 규격화, DT 종료 시제품 예비규격, 최초 OT 후 임시규격(시험개발종료보고서 포함) | 제4조5·6·9라; 제39조①5자·차·카·10·12; 제41조④⑥; 제12조②; 제43조①~③; 제61조③④ | 시험개발 variant(향후) 핵심 근거 |
| 과제 유형 | 하향식(WBS 기반 MIL-STD-881 Level 1~5, 패키지 핵심기술 우선, 정책적 지시과제) / 상향식(산학연·국방부·합참·각군·IPT·국과연 제기; 과제제기서 9항목) / 국제공동기술개발(F+5년까지 결정, 사업협정서·사업합의각서) / 주관형태(산학연 우선; 국과연 4호 예외; 복수 주관 가능) / 정출연 특례·중소벤처 우선 / 부품국산화 연계 | 제34조; 제35조②③; 제48~50조의2; 제31조①; 제16조③; 제20조의2; 제35조⑤; 제33조⑥ | 응용연구 variant 메타데이터(주관형태·과제유형) 후보 |
| 무기체계 연구개발 연계(규정 제116조 준용) | 규정 우선(상충 시); 핵심기술이 무기체계 연구개발에 포함되거나 단일 무기체계 전환 가능 시 IPT로 조정·통제 이관; 체계개발 포함이 효과적인 과제는 핵심기술 제외; 시험개발-체계개발 연계 5항목; 응용연구 종료 시 시험개발계획 이관; 무기체계 전력화 일정 고려·군사용 적합 및 규격화 후 적용; 임시규격 후 구매 전환 가능; 참여업체 기술이전 지원 | 제3조①; 제32조; 제36조②1; 제41조⑥; 제42조④; 제61조②③④⑫; 규정 제116조①②③ | 규정 제116조와 상충 0건(10.3.5) |

#### 10.3.2 단계 공통 절차·회의체·평가·산출물 (B)

| 구분 | 항목 | 근거 | mandatory |
|---|---|---|---|
| 기획·결정 | 과제기획(과제기획팀; WBS 분석·세부 분할과제·요소기술·목표성능·예산 기획연구) → 과제제기서(9항목) → 과제결정(안)(5항목: 적용 무기체계·목표성능(응용/시험개발 구분)·주관형태·개발방법/기간/예산·부품국산화 연계 현황) 실무위 심의(10월말) → 청장 결재 → 국방기술기획서 반영; 제외 과제 6종 | 제33조③④; 제35조③; 제36조①②④ | mandatory |
| 예산·수행계획 | 중기계획·예산편성(총액 프로그램 예산); 사업수행계획(안)(국기연→국방기술보호국장 결재); 분기별 추진·집행실적; 국과연 인력투입 실적(분기) | 제9~13조; 제19조②④⑤; 제15조④ | mandatory (기관 단위) |
| 선정·협약 | 연구개발주관기관·참여기관·시제(시작)업체 선정(공개경쟁 원칙, 별도 절차, 결과 제출); 협약(영 제4조② 사항·연구개발계획서·성실수행·정보수집 동의·IP 공동소유; 다년도 원칙); 협약 변경·해약(집행중지·현장조사·회수·참여제한) | 제16조; 제20조; 제21조; 제22조; 제23조; 제41조① | mandatory |
| 연구개발계획서 | 15항목(사업개요/개발목표·범위/적용대상 무기체계/이전 연계과제 결과/연구개발 계획[기간·예산, 일정, 기술적 접근, M&S, 인력, 시제(시작)제작, 위탁, 해외협력, 해외출장, ILS(시험개발 조건부), 시험평가계획(시험평가 종료 시), 규격화계획(동), 성과평가 계획, 국방표준서 계획]/연도별 계획/시제품 활용계획/기대성과/비용분석/상호운용성·표준(시험개발)/소요군·사용기관·유지보수기관 참여/개략 OT계획/안전관리/방위산업기술보호계획(응용·시험개발)/기타) + 연구개발관리계획서(산학연) + 요약서·검토결과서 → 사업통제부서장 검토 후 확정 → 제출·DTiMS 탑재; SW 과제는 SW 매뉴얼 준용 | 제39조①~⑥ | mandatory |
| 계획 변경 | 사업기간 연장·연구목표 수정·총사업비 증가는 사업통제부서장 보고 후 변경; 전문위원회 심의(협의 후 생략 가능) | 제40조; 제40조의2 | conditional |
| 회의체 | 과제 착수회의·종결회의·설계 검토회의·시험평가 준비회의 — 관련기관(합참·소요군·방사청 기술혁신과/사업통제부서/IPT·국과연·국기연) 참석 가능하도록 회의계획 사전 통보 | 제41조④ | mandatory (통보 의무; 시점·횟수·입출력 unstated) |
| 성과평가 | 연간 성과평가계획(국과연 12월말 목록 통보→국기연 확정); 중간평가(중간시점, 단계별; 착수 후 1년 미만 생략 가능): 80↑ 정상추진/70~80 계획조정/70↓ 사업중단; 단계전환평가: 80↑ 합격/70~80 계획조정/70↓ 불합격(전환 불가); 종료평가(단계전환·과제 종료 시, 종료 전 30근무일 이내; 합참 주관 시험평가 있는 과제는 시험평가 결과로 대체 가능): 80↑ 합격/80↓ 불합격; 발표자료·산출물 목록 제출; 보완요구 조치 추적관리; 이의신청 10근무일; 하위 10% 관리강화 | 제24조①②; 제25조②; 제26조①~④; 제28조⑥; 별표4·5(본문 없음) | mandatory |
| 특별평가 | 해약 사유·연구환경 변화·조기달성 등 시 중단여부 판정(중단/계획조정/계속수행); 결과 확정 전 연구개발비 추가 집행 금지 | 제27조 | conditional |
| 시험평가(시험개발·시제 있는 응용연구) | 훈령 제71~72조 절차 준용(응용연구 종결 시 시제품 제작된 경우에 한해 실시 가능); B는 계획 승인·결과판정 주체를 국방부, 수립·수행을 합참·각군으로 기재 | 훈령 제71조①③④·제72조①②; B 제4조5·6; 제24조②2 | conditional |
| 종료 | 연구개발결과보고서(과제종료 후 2개월 내; 국방기술보호국·사업통제부서장·IPT·합참(시험개발) 제출; 국기연 전산매체) 10항목(과제개요/기술현황 분석/추진계획 대 실적/참여현황/시험평가(종료평가) 결과/연구개발 효과/세부 성과/향후 추진계획/결론·건의/기타); 국방과학기술조사서 반영; 규격화·예비규격·임시규격·국방표준서; 기술자료 등록·보관(국방과학기술 획득결과보고서에 민수이전 가능여부·목록); IP 양도계약; 시제품 소요군 제공(100억↑ 실무위) | 제42조①~③; 제43조; 제58~60조; 제16조④·제61조⑧; 제61조⑤⑦ | mandatory / conditional |
| 사후 | 성과분석(F-1 종결과제: 투입 예산·인력·기간, 기술 성격, 국외협력, TRL 전후(기초연구 예외)·수출통제 기술, 활용·관리(DTiMS), 추가개발 필요기술, 미활용 원인, 정책 시사점); 추적조사(F-6~F-2, 활용실적 매년 2월말); 활용실적 5년간 제출(합격·성실수행 과제); 사사표기(별표7) | 제29조①~⑦; 제61조⑨⑩ | mandatory |
| 예외·제재 | 성실수행평가(산학연)/창의도전수행평가(국과연): 시험평가 기준미달·군사용 부적합, 중간평가 사업중단, 단계전환·종료평가 불합격, 특별평가 중단 시 20근무일 내 요청; 70점↑ 성실수행/창의도전수행; 참여제한·환수·제재부가금 | 제62~68조 | conditional |
| TRL 매핑 | 본문에는 단계별 TRL 목표 없음(별표3 위임). 성과분석에서 '과제 수행 이전 vs 종료 후 TRL' 분석만 의무(기초연구 예외). 선행연구 측 진입 기준(TRL 4↑ 탐색/6↑ 체계, 규정 제39조⑨)은 핵심기술 단계와 직접 결부되지 않음 | 제29조②4가; 규정 제39조⑨ | — |

#### 10.3.3 응용연구 제안 v2 gate·task (spine 코드 30~210 유지; v1 대비 상태 병기)

| gate | task | 근거 제N조 | mandatory | v1 대비 |
|---|---|---|---|---|
| **30 SRR_과제결정및연구개발계획** | 핵심기술 과제제기서(9항목: 제기기술명·기술개요·필요성·목표성능·예상 소요시기 및 예산·적용대상 무기체계 및 활용분야·중복성 검토결과(별표1)·개발방법·기타) 및 과제결정(안)(5항목)·국방기술기획서 반영 근거 사본 | 기술연구개발지침 제35조③; 제36조①④; 훈령 제54조③2·④ | mandatory (입력) | 유지·승격(7항목→9항목) |
| | 주관기관·참여기관·시제(시작)업체 선정 결과 및 협약서(다년도 원칙; 연구개발계획서 포함) / 국과연주관은 시제업체 계약 | 제16조①②③; 제20조①②; 제21조①②; 제4조7라 | mandatory | 신규 |
| | 연구개발계획서(15항목; 성과평가 계획·시제제작계획·M&S·인력·위탁·해외협력·안전관리 포함; 시험평가로 종료 시 시험평가계획·규격화계획) + 요약서·검토결과서, 사업통제부서장 검토·확정, DTiMS 탑재 | 제39조①④⑤⑥; 훈령 제59조③ | mandatory | 유지·승격(항목 확정) |
| | 연구개발관리계획서(산학연 과제) | 제39조①④⑤ | conditional (산학연) | 신규 |
| | 사업수행계획(안)·분기별 집행실적 포인터(기관 단위 보고) | 제19조②④⑤ | mandatory (포인터) | 신규 |
| | 계획단계 분석·평가 6요소 대응자료 | 훈령 제43조①3·⑤ | conditional | 유지(B 미언급) |
| | 해외기술·부품 도입 사전승인 기록 / 해외협력·해외출장 계획 / 국제공동기술개발 사업협정서·사업합의각서 | 규정 제116조①; B 제39조①5사·아; 제48조; 제50조; 제50조의2 | conditional | 유지·보강 |
| | 총사업비관리대장 포인터·중기계획/예산편성 자료 이력 | 규정 제22조②·제19조③④2; B 제10조①·제13조① | conditional | 유지 |
| | 체계요구사항명세서(SSRS)_D 상당 | B 미지원(목표성능은 과제결정(안)·연구개발계획서 항목으로 흡수) | optional (내부) | 강등 |
| | 과제 착수회의 자료·회의록·Action Item(관련기관 참석 통보) | 제41조④ | mandatory (통보 의무) | 승격(proposed→정본) |
| **60 SFR_기술요구분석및적용체계연계** | 목표성능 분해·검증방법 정의(요구사항 추적표 초안; 중간평가 시 평가받을 목표성능·추진계획 명시) | 제39조①2·5타; 훈령 제71조③4 | recommended (내용은 계획서 항목, 추적표 형식 unstated) | 유지·보강 |
| | 적용대상 무기체계 유무·개발상태 판정 및 시험개발·체계개발 연계 시나리오 | 제39조①3; 제41조⑥; 제42조④; 훈령 제71조①; 규정 제116조② | mandatory | 유지·보강 |
| | 시제(시작)품 제작 여부·제작계획·활용계획(응용연구 종결 시 시험평가 실시 조건) | 제39조①5바·7; 훈령 제71조① 단서 | mandatory (계획서 항목) | 승격 |
| | 이전 연계과제 연구결과·기초연구 성과 연계 확인 | 제39조①4; 제20조의2②3; 제35조④3 | conditional | 신규 |
| | 방위산업기술보호계획(보호지침 별표10 서식; 보호지침 제36조 절차) 및 보안 준수(방위산업기술 보호지침·군사보안업무훈령) | 제39조①14·③; 제18조① | mandatory (응용·시험개발) | 신규 |
| | 상호운용성·표준(시험개발), 디지털지형정보·주파수 소요 식별 | 제39조①10; 규정 제44조①~③; 훈령 제88조⑥1 | conditional | 유지·보강 |
| | SFR 회의록(SE 준용) | B 미지원(B 회의체는 착수·설계검토·시험평가준비·종결) | optional (내부) | 강등 |
| **90 PDR_설계검토및중간평가** | 설계 검토회의 자료·회의록(관련기관 참석 통보) | 제41조④ | mandatory (회의 실체; 시점·횟수·입출력 unstated) | 승격(PDR 회의록→정본 명칭) |
| | 중간평가 발표자료·산출물 목록·평가결과(정상추진/계획조정/사업중단)·보완요구 조치 추적 | 제24조②1; 제25조②; 제26조①1·②; 별표4(본문 없음) | mandatory (착수 후 1년 미만이면 생략 가능) | 승격(명칭만→절차·판정) |
| | 평가결과 이의신청(10근무일) 기록 | 제26조③④ | conditional | 신규 |
| | 기본설계 패키지(SE 준용) | B 미지원(설계 검토회의 입력물 형식 unstated) | optional (내부) | 강등 |
| | 기술성숙도(TRL) 현황 기록(착수 시점 대비; 성과분석 입력) | 제29조②4가; 규정 제39조⑨(간접) | recommended | 승격(간접→성과분석 항목) |
| | 분기별 과제 추진실적·예산집행실적·(국과연) 인력투입 실적 포인터 | 제19조⑤; 제15조④ | mandatory (포인터; 전 기간 반복) | 신규 |
| **120 CDR_단계전환평가및시제제작** | 단계전환평가 자료·판정(합격/계획조정/불합격→전환 불가) | 제24조②2; 제26조①2 | conditional (단계 구분 과제) | 재정의(v1 '단계평가'→B 단계전환평가; 종료평가는 180으로 분리) |
| | 연구개발계획 변경(기간 연장·목표 수정·총사업비 증가 → 사업통제부서장 보고; 전문위원회 심의) 및 협약 변경 | 제40조; 제40조의2; 제22조 | conditional | 신규 |
| | 상세설계·시제(시작)품 제작(시제업체 선정·계약 포함) | 제39조①5바; 제4조7라; 제20조 | conditional (시제 제작 시; 설계 문서 형식 unstated) | 유지(SE 형식은 강등) |
| | 개발시험평가계획(안) 초안 7항목 | 훈령 제71조③; B 제39조①5차 | conditional | 유지 |
| | 특별평가(중단/계획조정/계속수행)·협약 해약·집행중지 대응 | 제27조; 제23조 | conditional | 신규 |
| | 시험개발-체계개발 연계 5항목(동시 운용 가능성·운용상 문제점·목표성능-군 요구성능 연계·적용계획·IPT 요구사항) 반영·관리 | 제41조⑥ | conditional (시험개발) | 신규 |
| | CDR 회의록(SE 준용) | B 미지원(설계 검토회의로 흡수) | optional (내부) | 강등 |
| **150 TRR_시험평가준비및DT계획확정** | 시험평가 준비회의 자료·회의록(관련기관 참석 통보) | 제41조④ | conditional (시험평가 실시 과제; 회의 실체 mandatory) | 승격(TRR 준용→정본 명칭) |
| | 개발시험평가계획(안) 제출·확정 통보 접수(착수 2개월 전 합참 제출·1개월 전 확정) | 훈령 제71조③④; B 제4조5·6(승인·판정 주체 국방부 vs 훈령 합참 — HOLD) | conditional | 유지 + 주체 HOLD |
| | 시험평가절차서·시험환경·안전 확인 자료 | SE가이드북2017 p.89-90(B unstated) | optional | 유지(강등) |
| | 운용시험평가계획(안)(적용 무기체계 OT 시; 개략 OT계획은 연구개발계획서 항목; 소요군 OT 예산 협조) | 훈령 제71조⑤; B 제39조①12·⑦ | conditional | 유지·보강 |
| | 규격화 준비(시험평가로 종료 시 규격화계획; 국방규격(안) 산학연 작성) | 제39조①5카; 제4조9라 | conditional | 신규 |
| **180 FCA_시험평가및종료평가** | 개발시험평가 결과보고서 6항목(1개월 내 방사청 제출) 및 판정(기준 충족/미달) 접수 | 훈령 제72조①②; B 제42조②5 | conditional (시험평가 실시 시 mandatory) | 유지(합참 판정 항목 병합) |
| | 종료평가 발표자료·산출물 목록·결과(합격/불합격; 종료 전 30근무일 이내; 합참 주관 시험평가 있는 과제는 시험평가 결과로 대체 가능) | 제24조②2; 제25조②; 제26조①3; 별표5(본문 없음) | mandatory | 신규 |
| | 평가결과 보완요구 조치·추적관리·이의신청 | 제26조②③ | mandatory | 신규 |
| | 기준미달 시 재시험 계획(무기체계 절차 준용; 위원회=실무위) | 훈령 제66조④·제72조⑥ | conditional | 유지 |
| | 예비규격 작성(DT로 종료되는 시제품) / 군사용 적합 시 규격화 추진(표준화 업무규정) | 제43조①② | conditional | 신규 |
| | 공인시험기관 시험성적서 확보(후속 체계개발 핵심부품 시험 대체) | 규정 제79조⑤⑥ | conditional | 유지 |
| | 성실수행평가(산학연)/창의도전수행평가(국과연) 요청·자료(불합격·중단·부적합 판정 시 20근무일 내; 별표6 기준) | 제62조; 제63조; 제64조; 제65조; 제66조 | conditional | 신규 |
| | 기능적형상확인(FCA) 상당 자료(SE 준용) | B 미지원 | optional | 강등 |
| | 운용시험평가 결과보고서(1개월 내 합참)·판정(군사용 적합/부적합/잠정 적합) 접수 | 훈령 제72조③④⑤; B 제61조④ | conditional (시험개발·OT 시) | 유지(210→180 이동) |
| **210 PCA_과제종결및성과관리** | 과제 종결회의 자료·회의록(관련기관 참석 통보) | 제41조④ | mandatory | 승격(v1 'unstated HOLD'→정본) |
| | 연구개발결과보고서 10항목(과제종료 후 2개월 내; 국방기술보호국·사업통제부서장·IPT·합참(시험개발) 제출; 국기연 전산매체 1부) | 제42조①② | mandatory | 승격(v1 '최종보고서 명칭 NOT_FOUND'→확정) |
| | 국방과학기술조사서 반영 자료 / 국방과학기술 획득결과보고서(민수이전 가능여부·대상 목록) / 기술자료 등록·보관(DTiMS) | 제42조③; 제60조; 제59조 | mandatory | 신규 |
| | 성과분석 대응자료(F-1: 투입 예산·인력·기간, 기술 성격, 국외협력, TRL 전후, 활용·관리, 추가개발 필요기술, 미활용 원인) + 집행성과 분석 요소(훈령) + 사사표기(별표7) | 제29조①②⑥; 훈령 제50조②1 | mandatory | 유지·보강 |
| | 활용실적 제출(합격·성실수행 과제 5년간; 국과연 F-6~F-2 매년 2월말) 및 추적조사 대응 | 제61조⑨⑩; 제29조③④⑤ | conditional (합격 시) | 신규 |
| | 응용연구 단계 종료 시 시험개발계획의 탐색/체계개발실행계획 이관 자료 / 기술자료·시험성적서·시제품 인계 패키지 | 제42조④; 제41조⑥; 규정 제116조②·제79조⑤ | conditional | 유지·승격 |
| | 지식재산권 공동소유 양도계약(사업 종료 후 방사청장과 체결) | 제16조④; 제61조⑧ | conditional | 신규 |
| | 시제(시작)품 소요군 제공(100억↑ 실무위 승인; 안전·신뢰성 자료 동봉; 소요량·요구성능 반영) | 제61조⑤⑥⑦ | conditional | 신규 |
| | 임시규격 관리(시험개발종료보고서 포함) / 국방표준서 제정 | 제43조③④; 훈령 제71조①1가2) | conditional (시험개발) | 유지·보강 |
| | 기술이전 지원(참여업체 요청 시 성과물 세부내역·자문·교육) | 제61조⑫ | conditional | 신규 |
| | 디지털지형정보 기술문서·SW·데이터 제출 | 규정 제44조③ | conditional | 유지 |
| | 물리적형상확인(PCA) 상당 자료(SE 준용) | B 미지원 | optional | 강등 |

- 규모: gate 7·task 56 = 정본 근거 49(mandatory 17·conditional 30·recommended 2) + optional 7(B 미지원 SE 준용; tailoring 시 제외 가능). v1 37건 대비: 유지·보강·승격 35건(SSRS_D·SFR/CDR 회의록·기본설계/FCA/PCA 상당·시험절차서 7건은 optional 강등, 승격 10건 — v1 행 기준; 착수회의·설계검토회의·중간평가·TRL·시험평가준비회의·종결회의/결과보고서·시제 제작·이관 패키지·과제제기서·연구개발계획서), 병합 2건(TRR 회의록→시험평가 준비회의, 합참 판정→DT 결과보고서), 분리 1건(종결회의/연구개발결과보고서), 신규 20건.
- 분기 변수(v1 2개 → v2 4개): (1) 주관형태 — 국과연주관(시제업체 계약·창의도전수행평가·인력투입 실적) / 산학연주관(협약·연구개발관리계획서·성실수행평가) (제4조7·8, 제21조, 제39조①, 제62·65조); (2) 시제(시작)품 제작 여부(제39조①5바; 훈령 제71조① 단서); (3) 적용대상 무기체계 유무·개발상태(제39조①3; 훈령 제71조①); (4) 단계 구분 여부(단계전환평가 vs 종료평가, 제24조②·제26조①2·3).
- 판정 어휘(추가): 중간평가 정상추진/계획조정/사업중단(80/70점), 단계전환평가 합격/계획조정/불합격, 종료평가 합격/불합격(80점), 특별평가 중단/계획조정/계속수행, 성실수행/창의도전수행(70점); 기존 DT 기준 충족/미달·OT 군사용 적합/부적합/잠정 적합(훈령 제61조②) 유지.
- 기간 규칙(엔진 due 계산용): 중간평가 생략 조건 착수 후 1년 미만(제24조②1), 종료평가 종료 전 30근무일 이내(제24조②2), 이의신청 10근무일(제26조③), 성실수행/창의도전수행평가 요청 20근무일(제62조②·제65조②), 연구개발결과보고서 2개월(제42조①), 활용실적 5년(제61조⑨), 성과평가 대상목록 12월말(제24조①1), 활용실적 2월말(제29조③), 협약 다년도 원칙(제21조②).

#### 10.3.4 B 확보 후에도 남는 unknown

1. 별표3(용어정의) 부재 → 기초연구/응용연구/시험개발 정의문·단계별 TRL 목표 NOT_FOUND. 응용연구 종료 TRL은 성과분석 '종료 후 TRL'(제29조②4가)로만 기록.
2. 별표4·5(중간·종료평가 배점 및 기준) 부재 → 평가 항목 수준 체크리스트 작성 불가(점수 경계 80/70만 확정).
3. 설계 검토회의(제41조④)의 시점·횟수·입출력 unstated → PDR/CDR 슬롯 배분은 제안(1회 이상; SE 준용 optional).
4. 시험개발 시험평가 계획 승인·결과판정 주체: B 제4조5·6(국방부 승인·판정, 합참·각군 수립·수행) vs 훈령 제71조④·제72조②⑤(합참 확정·판정) — 훈령이 최신(2026-07)이나 B(2025-02)와 불일치 → HOLD, 엔진에는 '승인기관' 필드를 값 미정으로 둔다.
5. 국기연·국과연 '별도로 정한 규정'(선정 절차, 협약 세부, 성과평가팀 운영, 계획서 확정 세부, 사업비, 이의신청) 및 「국방과학기술 정보관리 업무지침」·「미래도전국방기술 연구개발사업 관리지침」·「무기체계 소프트웨어 개발 및 관리 매뉴얼」 부재.
6. 직전 규정 제172~193조의6(부칙 제3조 경과조치) 여전히 부재; B 제42조③·제61조①이 규정 제172·173조(구 번호)를 인용 → 현행 규정과의 번호 매핑 미확인.

#### 10.3.5 B와 규정 제116조의 정합

| 규정 제116조 | B 대응 | 판정 |
|---|---|---|
| ① 국내 독자 개발 원칙; 해외기술·부품 도입 시 기초·응용·시험개발 단계별 국방기술개발보호국장/사업본부장 사전 승인 | 명시적 '사전 승인' 조항 없음; 연구개발계획서 해외협력·해외출장 계획(제39조①5사·아)이 사업통제부서장 검토·확정(제39조④)을 거치고, 국제공동기술개발은 제48조 요건(국가안보 지장 없는 요소기술 등)·기술협력 양해각서 기반 | 상충 아님(승인 경로 미재기술; 조직명 '국방기술개발보호국' vs B '국방기술보호국' drift) |
| ② 시험개발은 무기체계개발에 우선; 중첩 시 적용무기체계 탐색개발/체계개발에 포함 수행 가능 | 제42조④(응용연구 종료 시 시험개발계획을 탐색/체계개발실행계획에 포함), 제36조②1(체계개발 포함이 효과적인 과제 제외), 제32조(IPT 이관), 제41조⑥(연계 5항목), 제61조④(전력화 일정 고려) | 정합 |
| ③ 그 밖의 사항은 「국방기술 연구개발 업무처리지침」 | 제3조①(규정에 근거, 상충 시 규정 우선) | 정합(상호 참조) |

- 결론: B와 규정 제116조 사이 상충 0건. 주의 2건 — (a) B가 인용하는 규정 제172·173조는 구 조번호(부칙 제3조 경과조치), (b) 조직명 drift. 별도 cross-source 긴장 1건 — B 제4조5·6 vs 훈령 제71~72조의 시험평가 승인·판정 주체(10.3.4-4).

### 10.4 §0 한 줄 결론 갱신 문장

- 선행연구: "출처 미규정 → 선행연구지침(제881호)으로 회의체(착수·중간·최종 검토회의+실무회의)·산출물(요구서·계획서·조사분석 수행계획서·조사분석 결과보고서)·결과보고 흐름 확정; SRR~PCA 명칭은 여전히 선행연구에 없어 §10.2.3 재기준 spine(요구·선정/계획/착수검토/조사분석/중간검토(조건부)/최종검토/결과보고·종결)으로 재라벨; 재판정 35건 중 변경 1(186→지원)·근거갱신 27; 지원 18/부분 17; 빠진 필수 11+12."
- 응용연구: "정본(B) 확보로 v1 proposed의 대부분이 정본 근거로 승격(gate 7·task 56 = 정본 49+optional 7); 회의체 4종·평가 3종+특별평가·연구개발계획서 15항목·결과보고서 10항목 확정; SRR~PCA는 B에도 없어 optional; 규정 제116조 상충 0; 잔여 unknown 6건(별표3 정의·TRL 목표, 별표4·5 배점, 설계검토회의 시점, 시험평가 승인주체, 국기연·국과연 내규, 구 규정 제172~193조의6) → 부분 HOLD."
- (§0 표의 두 행은 위 문장 요지로 in-place 갱신하고 'updated in §10'을 표기함.)

### 10.5 엔진 stage-rule 통일에 대한 영향 요약

| # | 범위 | 영향 | 근거 |
|---|---|---|---|
| 1 | 선행연구 variant | §9.2 #7의 '세부 절차는 수행지침 확보 전 HOLD' 해제. 재기준 spine을 A 절차(요구·선정 → 계획 → 착수 검토회의 → 조사·분석(+실무회의) → 중간 검토회의(조건부) → 최종 검토회의 → 결과보고·결과보고서·국기연 등록)로 확정 가능. 7슬롯 중 회의 gate는 3(+실무회의)이므로 68·128·218 회의록과 154~158 실증 계열은 삭제 후보; 회의 명칭은 A 용어(착수/중간/최종 검토회의)로 재라벨. | 선행연구지침 제10~17조 |
| 2 | 선행연구 메타데이터 | 분기 변수 5개(과제 중요도, 수행기관 유형, 사업 유형(함정·유도무기·시설·성능개량), ORD 제출 여부, 통합 선행연구 여부)와 판정 어휘(검토위원회 의결·중단/보류·결과보고 결재)를 엔진 사전에 추가. 별표(검토항목)는 HOLD. | 제8조③④; 제11조; 제12조②; 제13조②~⑤; 제14조③⑤⑥; 제16조 |
| 3 | 응용연구 variant | §9.2 #9의 'proposed/unstated HOLD'를 부분 해제: 회의체·평가·계획서·결과보고서는 정본 근거로 required/conditional 승격, SRR~PCA 명칭은 B에도 없으므로 tailoring_status optional 유지·표시명은 B 용어(착수회의/설계 검토회의/중간평가/단계전환평가/시험평가 준비회의/종료평가/종결회의). 분기 변수 4개·판정 어휘·기간 규칙(10.3.3)을 메타데이터로 보유. | 기술연구개발지침 제24~27조·제39조·제41조④·제42조 |
| 4 | 공통 spine·용어 | §7.1 #15(SE 검토회의의 응용연구 적용)와 §9.2 #2 용어 사전에 추가: '설계 검토회의'(B)는 PDR/CDR의 상위 총칭이며 시점·횟수 미정; '시험평가 준비회의'(B) = 시험준비검토회의(훈령) = 시험준비상태검토(규정·가이드북)로 3자 동치 등록; '단계전환평가'(B) = 종료평가의 단계전환 시점 실시(단계평가라는 별도 명칭 없음). | B 제41조④; 제24조②2; 제26조①2 |
| 5 | 판정·기간 규칙 | 핵심기술 성과평가 점수 경계(80/70)와 기간 규칙 9건(10.3.3)을 stage-rule의 due/verdict 스키마에 추가; 선행연구 결과보고→결과보고서 순서 제약(제15조①②)과 종료평가 30근무일 규칙은 gate 순서 검증기에 반영. | A 제15조; B 제24조·제26조·제42조·제61조⑨ |
| 6 | 잔여 정본 확보 | 남은 대상: 「기술성숙도평가 및 제조성숙도평가 업무처리규정」, 「미래도전국방기술 연구개발사업 관리지침」, 직전 규정 제172~193조의6, 두 지침의 별표(선행연구 검토항목; 별표1·3·4·5·6·7), 국기연·국과연 내규, 훈령 별지4~8. 시험평가 승인주체 불일치(B vs 훈령)는 최신 훈령 우선 추정이나 Owner 확인 전 HOLD. | §10.1 읽기 한계; 10.3.4 |
| 7 | 기초연구·시험개발 후보 | B로 기초연구(유형 3·기간 3년×2단계)와 시험개발(시험평가·규격화·체계개발 연계 5항목·임시규격) 근거가 확보되어 별도 variant 후보 정의 가능 — 이번 범위 밖, roadmap 저장 규칙에 따라 후보로만 기록. | B 제44~47조; 제41조⑥; 제43조 |

---
문서 끝. 이 문서는 관찰된 파생 텍스트와 비교기 판정만을 요약하며(claim_ceiling: observed), 별표·별지 본문·위임 지침·OCR 손상 구간에 대한 주장은 UNKNOWN/HOLD로 둔다.
