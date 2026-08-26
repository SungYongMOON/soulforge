# 소나 도메인 인텔 플랫폼 기획 — 유사 제품/서비스 스카우트 (웹 리서치)

> 조사일: 2026-08-24 · 방식: 웹 검색 기반, 각 항목 출처 URL 첨부. 미확인 항목은 UNKNOWN 명시.

## 1. 경쟁/시장 인텔리전스 트래킹 도구

| 도구 | 주요 기능 | 가격(공개된 것만) | 우리 용도 적합성 |
|---|---|---|---|
| CB Insights | 신기술 트렌드·기업 스카우팅·M&A·투자 데이터, ChatCBI(LLM Q&A), Technology Lookup | 비공개. 제3자 추산 $50K~$265K+/yr | ❌ 상업/투자 도메인 중심, 방산 부품·소나 특화 데이터 없음, 가격 부담 |
| PitchBook | VC/PE 딜·M&A 등 사모시장 데이터 (Morningstar 소속), 600만+ 기업 | 비공개. 제3자: Core $1,000/user/yr ~ 최고 $3,333/user/yr, 실거래 사례 $12K~$70K/yr | ❌ 투자 딜 중심. 소나 기술 트렌드와 접점 낮음 |
| Crunchbase Pro | 기업 페르모그래픽스·투자 라운드·실시간 알림 | $49/user/월 (Pro 연 $99/월 옵션 공개) | △ 저가지만 역시 상업 도메인. "부품/논문" 축은 커버 불가 |

- CB Insights 공식: https://www.cbinsights.com/what-we-offer/pricing / 가격 추산: https://easyvc.ai/vs/cb-insights-pricing
- PitchBook 가격 집계: https://costbench.com/software/financial-data-terminals/pitchbook , https://botmemo.com/pitchbook-review
- Crunchbase Pro 요금: https://www.crunchbase.com/buy/select-product , https://support.crunchbase.com/hc/en-us/articles/360001616808-Buy-Crunchbase-Pro
- **시사점**: 범용 인텔 도구는 "돈·기업" 축만 강함 → 우리의 차별화 축은 "논문+특허+부품 스펙"이며 이 영역은 직접 구축해야 하는 공백.

## 2. 학술 문헌 모니터링 도구

| 도구 | 핵심 기능 | 가격 | co-occurrence 그래프 |
|---|---|---|---|
| Google Scholar Alerts | 키워드/저자 검색 결과를 주기적 이메일 발송 | 무료 | ✖ |
| Semantic Scholar Alerts | 저자·논문·토픽 이메일 알림 + Research Feeds(폴더 기반 추천), API 제공 | 무료 | ✖ |
| Connected Papers | 시드 논문 기반 co-citation 유사도 그래프 1장 생성 | 무료 5 graphs/월, 유료 ~$6/월 | △ (공출현 아닌 공인용 그래프) |
| Litmaps | 시드 논문들의 시간축(timeline) 매핑으로 분야 진화 가시화 | 무료 티어 제한적, Pro ~$10/월(연간) | ✖ |
| ResearchRabbit | 복수 시드 논문 컬렉션 확장, 저자 추적, Zotero 연동 | 무료 중심 | ✖ |
| Scite.ai | Smart Citations(지지/반박 분류, 16억+ 인용), 인용문 전문 검색 | 유료(공개 페이지 존재, 수치 미확인) | ✖ |
| **VOSviewer** | 서지학 네트워크 구축: 공인용·결합·**키워드/용어 공출현(co-occurrence) 맵**, OpenAlex/Semantic Scholar/Crossref 질의 내장, 무료 데스크톱 + VOSviewer Online | 무료 | ✅ **정확히 원하는 기능** |

- Google Scholar Alerts: https://scholar.google.com/scholar/help.html
- Semantic Scholar: https://www.semanticscholar.org/faq , https://www.semanticscholar.org/product
- 도구 비교(Connected Papers/Litmaps/ResearchRabbit): https://effortlessacademic.com/litmaps-vs-researchrabbit-vs-connected-papers-the-best-literature-review-tool-in-2025 , https://ponder.ing/blog/research-rabbit-alternatives
- Scite: https://scite.ai/features , https://docs.scite.ai/guides/search
- VOSviewer: https://vosviewer.com (v1.6.21에서 OpenAlex 기반 keyword co-occurrence maps 제공)
- **시사점**: 알림은 Scholar/S2 무료 조합으로 충분하고, "분야 흐름 보기"는 VOSviewer(+OpenAlex API)로 스크립트 파이프라인에 그대로 이식 가능 — LLM 불필요 영역.

## 3. 방산/국방 특화 인텔 도구 (실존 확인)

| 서비스 | 형태 |
|---|---|
| Janes | 오픈소스 국방 인텔. 장비·전력·사건 데이터를 상호연결(네트워크형 탐색)하고 AI-ready/머신리더블 데이터·API 제공. 포털 or 자사 시스템 융합 |
| Shephard Defence Insight | 데이터 기반 국방 시장 인텔 플랫폼. 인간 검증 데이터, 국가/부문 리포트·수주 예측, Basic/Team/Business 3티어 |
| GlobalData Aerospace, Defense & Security | 텐더 DB(167개국), 70개국 방예산·전력 데이터, 해상 플랫폼/서브시스템 오더·인도·프로그램 DB, 단일 구독 |

- Janes: https://www.janes.com/
- Shephard Defence Insight: https://businessinfo.shephardmedia.com/defence-insight , https://www.shephardmedia.com/
- GlobalData: https://www.globaldata.com/industries/aerospace-defense-and-security/
- 가격: Janes/Shephard/GlobalData 모두 견적제(비공개) — 세부 금액 UNKNOWN.
- **시사점**: "검증된 데이터 + 연결된 맥락 + 수주/텐더 추적"이라는 우리 기획과 동일한 철학이 이미 상업적으로 성립함. 단 이들은 범국방 스케일 → 소나/수중익향 세부장비·부품·알고리즘 레벨은 빈 곳(내부 전용 플랫폼 근거).

## 4. Pedigree류 '네트워크 매핑' 플랫폼 유사체

| 도구 | 내용 |
|---|---|
| Palantir Gotham | 정부/국방/수사용: 이질 데이터 통합 → 엔티티·관계 객체화 → 링크 분석·지도·대시보드로 숨은 연결 시각화, AI investigation helper, 감사추적 |
| Recorded Future | Intelligence Graph®: 100만+ 소스를 ML로 엔티티 연결·위험도 스코어링. 다만 사이버 위협인텔 특화 |
| Linkurious Enterprise | Neo4j 등 그래프 DB 위 링크분석 UI. 패턴 알림(alerts), 엔티티 리졸루션, 온프레미스 지원. Gartner 리뷰에서 "직관적이나 비쌈" 평가 |
| 카카오벤처스 Pedigree | 플랫폼 자체 공개 정보 확인 불가(카카오벤처스 본체 kakao.vc만 확인). 상세 UNKNOWN |

- Palantir Gotham: https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/801146272055049 , https://zoftwarehub.com/products/palantir-gotham/overview
- Recorded Future: https://www.recordedfuture.com/platform
- Linkurious: https://linkurious.com/ , https://doc.linkurious.com/admin-manual/latest/feature-map/ , https://www.gartner.com/reviews/market/data-and-analytics/vendor/linkurious
- 카카오벤처스: https://www.kakao.vc/
- 소나/해양 도메인 적용 사례: 검색으로 확인 불가 — **UNKNOWN**
- **시사점**: 사람/조직/기술을 그래프로 묶는 것은 Gotham·Linkurious가 증명한 성숙 패턴. 우리는 "저자↔기관↔특허↔부품↔프로그램" 엣지로 같은 패턴을 소규모 재현하면 되고, 시각화는 Linkurious 대신 오픈소스(Ogma 대체: cytoscape.js 등)로 가능.

## 5. 오픈소스/셀프호스트 대안 — 직접 구축 가능성

- **가능 규모 판단: 개인 1인 파이프라인으로 현실적으로 충분.** 근거:
  - 데이터 소스가 대부분 공개 API: OpenAlex·Semantic Scholar·Crossref·Europe PMC는 VOSviewer가 이미 일반인 대상으로 질의 UI까지 제공(https://vosviewer.com) → 수집 난이도 낮음.
  - 그래프 저장·시각화는 오픈소스 성숙: Neo4j(커뮤니티 에디션) + 오픈소스 LLM Knowledge Graph Builder(https://github.com/neo4j-labs/llm-graph-builder , https://neo4j.com/blog/developer/llm-knowledge-graph-builder-release/ ), CocoIndex류 파이프라인(https://github.com/cocoindex-io/cocoindex ).
- 장점: 비용(CB Insights급 연 수천만원 대비 서버+시간), 도메인 특화 스키마 자유, 기관 내부망 상주 가능(방산 보안).
- 단점/리스크: 엔티티 정규화(회사명·부품명 매칭), 소스 크롤링 유지보수, 특허/텐더 원문 파싱 — 여기가 실제 노동. 상용 도구의 "사람이 검증하는" 부분(Janes, Shephard)을 자동화 한계로 대체해야 함.
- 권장 하이브리드: 수집·알림·공출현 그래프 = 셀프호스트(VOSviewer/OpenAlex/Neo4j/RSS) + 필요시 Janes류 데이터는 구독 없이 뉴스 RSS로 1차 추적.

## 종합 결론
1. 범용 시장인텔(CB Insights 등)은 가격·도메인 모두 불적합 → 배제.
2. 문헌 축은 무료 도구(Scholar/S2 Alerts + VOSviewer)로 즉시 프로토타입 가능.
3. 방산 특화 인텔은 상업 서비스가 존재하나 "소나 부품/알고리즘" 세부 레벨은 공백 = 차별화 포지션.
4. Pedigree식 네트워크 매핑은 Gotham/Linkurious가 검증한 패턴이며 오픈소스 스택(Neo4j+cytoscape)으로 소규모 재현 가능.
