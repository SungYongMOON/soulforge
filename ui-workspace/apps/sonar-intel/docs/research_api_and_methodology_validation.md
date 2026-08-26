# 소나 도메인 인텔 플랫폼 — 데이터 소스/API·방법론 검증 리서치 (B안)

작성일: 2026-08-24 · 모든 rate limit은 **공식 문서 기준**만 기재. 확인 불가 항목은 UNKNOWN 명시.

## 1. 학술 API

| API | 무료 여부 | Rate Limit (공식) | 약관 핵심 | 적합성 |
|---|---|---|---|---|
| **arXiv API** | 완전 무료 | 레거시 API(OAI-PMH·RSS 포함): **초기화 시 최소 3초 간격, 동시 접속 1개** | 메타데이터는 CC0로 자유 이용 가능. 본문 PDF 재배포는 저작권자 허가 필요 | ★★★ eess.SP/cs.RO/cs.CV 카테고리 검색 지원, 주기 수집에 최적 |
| **Semantic Scholar Graph API** | 무료(키 권장) | 미인증: 전체 사용자 공유 풀(공식 페이지상 1000 rps 공유, 혼잡 시 스로틀). **API 키 발급 시 기본 1 RPS**, 더 높은 한도는 별도 신청 | 논문 214M편, 인용 24.9억 건. 학술 목적 무료 | ★★★ 초록·인용 그래프·SPECTER2 임베딩까지 제공 |
| **Crossref REST API** | 무료 | 2025-12-01부터: public 풀 리스트 조회 **1 req/s(동시성 1)**, polite 풀(mailto 파라미터) **단건 10/s·리스트 3/s(동시성 3)** | 메타데이터 공공 제공이 사명. 대량이면 연 1회 Public Data File 권고 | ★★ DOI 메타데이터 보완용 |
| **OpenAlex** | 무료(키 없음, email 파라미터로 polite 풀 진입) | 기본 **1 req/s**, polite 풀 **10 req/s**, **10만 req/day**. 상업적 대량 이용용 유료 플랜 존재(authentication 가이드 참조) | CC0 완전 오픈. Scopus 대체 오픈 데이터셋으로 실사용 사례 다수 | ★★★ KAIST 사례의 Scopus를 대체할 1순위 후보 |
| **Europe PMC** | 무료(키 불필요) | 공식 문서에 수치 미게재. EBI 운영진 답변 기준 **~10 req/s**(공식 문서 아님, 참고) | 논문 33M+, OA 본문 6.5M, OAI-PMH/FTP 벌크 제공. 생의학 편중이라 소나 도메인엔 보조 | ★★ |
| **Scopus API (유료 참고)** | 비상업·학술/공공기관 연구자 무료 키. **개인(비소속) 무료 이용 불가 — 기관 소속 필요** | Scopus Search: **주간 20,000 요청, 9 req/s**(Abstract Retrieval 10,000/주 등 API별 상이, 7일 리셋) | Elsevier Developer Portal 약관상 비상업 이용자(학술·공공기관) 대상 | △ 기관 키 없으면 현실적으로 배제 |

출처: info.arxiv.org/help/api/tou.html · semanticscholar.org/product/api · crossref.org/blog/announcing-changes-to-rest-api-rate-limits/ · docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication (+ developers.openalex.org/guides/authentication) · europepmc.org/RestfulWebService (+ groups.google.com/a/ebi.ac.uk/g/epmc-webservices/c/cZLnV1JhCj8) · dev.elsevier.com/api_key_settings.html

## 2. 특허 API

| API | 무료 범위 | 신청 절차 | 비고 |
|---|---|---|---|
| **EPO OPS (Espacenet)** | 등록 사용자 주 **4GB/week 무료**. 초과 시 연 EUR 2,800 | developers.epo.org 회원가입 → 테스트 앱 정의 → OAuth2 인증 구현 | 전 세계 120M+ 특허 서지·법적상태·전문(CPC 코드 검색에 유리). Fair use charter 준수 필요 |
| **USPTO PatentsView → Open Data Portal** | 무료. 단 2026-03-20부터 data.uspto.gov로 이전 중, **USPTO.gov 계정(MFA 필수) 등록 요구(6/18 시행)**. 기존 PatentSearch API는 이전 중 일시 중단·구키 무효, 신규 키는 ODP에서 발급 | data.uspto.gov/apis/getting-started | 전환기라 API 안정성 리스크 있음. 벌크 데이터(tsv) 다운로드는 이미 ODP에서 가능 |
| **KIPRIS Plus Open API (한국)** | 기본 무료(수수료 안내 페이지 존재 → 유료 상품 구분). 일일 호출 한도 수치: **UNKNOWN**(공개 문서에서 확인 못함) | plus.kipris.or.kr 회원가입 → 로그인 → 데이터 신청 → 상품 선택·이용조건 입력 → **관리자 승인** → 마이페이지에서 ServiceKey 발급 | REST/SOAP 샘플에 Python 샘플 포함. 국내 소나 특허 모니터링엔 필수 |

출처: epo.org/en/searching-for-patents/data/web-services/ops · patentsview.org/apis/purpose · data.uspto.gov/apis/api-rate-limits · plus.kipris.or.kr (API 개발가이드 nttId=1060/638, use/paymentMmg.do)

## 3. 뉴스/산업동향 소스 (RSS 실측 포함)

- **Google News RSS**: ✅ 실측 200 OK, 정상 XML 반환. `https://news.google.com/rss/search?q=<키워드>&hl=ko&gl=KR&ceid=KR:ko` 형태. 공식 문서는 없음(비공식). (실측 + cloro.dev/blog/google-news-rss)
- **Defense News**: ✅ 실측 200 OK, `https://www.defensenews.com/arc/outboundfeeds/rss/` 정상 RSS. 공식 피드 안내 페이지: defensenews.com/m/rss/
- **Janes**: ❌ 공개 RSS 확인 실패(`janes.com/osint-insights/defence-news/rss` → 404). 뉴스 목록 페이지(janes.com/defence-intelligence-insights/defence-news)는 공개지만 심층 콘텐츠는 유료 제품. RSS 대신 페이지 크롤링은 약관 검토 필요 → UNKNOWN
- **기타 방산 RSS**: Defence Blog Maritime(defence-blog.com/category/news/navy/feed/), Defense One(defenseone.com/rss/all), The Diplomat Asia Defense 등 Feedspot 목록에 실재. Navy Recognition은 curl 차단(403) 확인 — UA 설정 필요

## 4. Co-occurrence 트렌드 분석 방법론 선행사례

1. **Cobo et al., "Keywords Co-occurrence Analysis to Map New Topics and Recent Trends"** (Springer) — 키워드 공출현 네트워크로 방법론 분야 급상승 주제 식별: link.springer.com/chapter/10.1007/978-3-030-44041-1_93
2. **"Exploring trends and topics in hybrid intelligence using keyword co-occurrence networks"**, *Technological Forecasting & Social Change* (2025) — 공출현 네트워크+클러스터링으로 기술 트렌드 분석: sciencedirect.com/science/article/pii/S0016328725000138
3. **VOSviewer** (CWTS van Eck & Waltman) — 키워드/저자/저널 공출현(co-occurrence) 네트워크 구축·시각화 표준 도구: vosviewer.com (+ casrai.org/guides/vosviewer)
4. **bibliometrix** (R, Massimo Aria) — Keyword Co-occurrences 기능 내장 과학계량 패키지: github.com/massimoaria/bibliometrix
5. **GitHub 생태계**: `topic:co-occurence-network`, `topic:bibliometric-analysis` 태그에 다수 파이썬 프로젝트 존재 — github.com/topics/bibliometric-analysis

→ 결론: "API 수집 → 키워드 공출현 네트워크 → 클러스터/버스트 감지"는 확립된 방법론(bibliometrics/science mapping)이며 자체 스크립트 구현 근거 충분.

## 5. Python 패키지 생태계

| 패키지 | 용도 | 실존/관리 상태 |
|---|---|---|
| `arxiv` | arXiv API 래퍼 | ✅ pypi.org/project/arxiv — 활발히 유지보수 중(2.4.x, 이후 4.0.0 릴리스 확인) |
| `semanticscholar` | S2 Graph API 비공식 클라이언트 | ✅ pypi.org/project/semanticscholar (v0.12.0, danielnsilva/semanticscholar) |
| `pyalex` | OpenAlex 클라이언트 | ✅ pypi.org/project/pyalex |
| `metapub` | NCBI EUtils(PubMed) | ✅ pypi.org/project/metapub (문서 v0.6.5) — 생의학 위주라 보조 |
| (추가 권장) `feedparser`, `networkx`, `python-louvain` | RSS 파싱, 공출현 그래프, 커뮤니티 탐지 | 모두 표준적·안정적 패키지 |

## 종합 권고

- **학술**: arXiv(API 3초 딜레이 준수) + OpenAlex(polite pool) + Semantic Scholar(키 발급) 3중 파이프라인이 무료로 가능하며 Scopus급 커버리지 근사. Scopus는 기관 소속 없으면 배제.
- **특허**: OPS(주 4GB) + KIPRIS Plus(승인 절차 감안해 초기 신청 선행). USPTO는 ODP 전환 완료 후 재검토.
- **뉴스**: Google News RSS + Defense News RSS는 즉시 사용 가능. Janes는 공개 피드 부재로 별도 대응.
- **분석**: networkx 기반 공출현 그래프 + VOSviewer/bibliometrix와 동일한 방법론을 스크립트로 구현하는 것이 검증된 경로.
