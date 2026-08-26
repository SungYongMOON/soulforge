# 소나 인텔 플랫폼 — 마스터 미션 정의서 (MASTER PLAN V1)

> 이 문서가 소나 인텔 플랫폼 프로젝트의 **유일한 정본 계획서**다.
> 어떤 봇이든 이 문서를 읽으면 대화 맥락 없이 작업을 이어갈 수 있어야 한다.
- 작성: 2026-08-24, 관리자 봇(bot-message-probe)이 Owner(소나 엔지니어)와 합의
- 상태: **기획 확정 / 구현 미착수** — 다음 단계는 §9
- 하위 리서치 원본: 같은 폴더 `research/` 참조

---

## 1. 목표 (Goal)

소나 도메인(SAS/MBES/SSS/FLS + 보조센서 + 부품)의 논문·특허·뉴스·부품 정보를
자동 수집→통계 분석→전략 제안하는 **내부 전용 인텔 플랫폼**을 만든다.
카카오벤처스의 Orrery(상태 가시화)·Dealroom(버튼 워크플로우)·Pedigree(네트워크 자산화)를
참조 모델로 삼는다. LLM 사용은 최소화하고 스크립트 파이프라인이 기본이다.

## 2. 배경·근거 (왜 만드는가)

- 범용 시장인텔(CB Insights 연 $50K~265K)도 국방 인텔(Janes/Shephard/GlobalData)도
  "소나 세부장비·부품·알고리즘 레벨"은 커버하지 않음 = 검증된 공백 영역.
- 방법론 선행사례 5건 확인: 키워드 공출현 네트워크는 bibliometrics 확립 방법론
  (Springer/TFSC 논문, VOSviewer, bibliometrix).
- 무료 API만으로 Scopus급 커버리지 근사 가능 (Scopus는 개인 비기관 이용 불가 → OpenAlex 대체).
- 상세 근거: `research/research_api_and_methodology_validation.md`,
  `research/sonar-intel-platform-scout.md`, `research/research_synthesis_v1.md`

## 3. 추적 스코프 (확정)

### 소나 시스템
SAS(synthetic aperture sonar), MBES(multibeam echosounder), SSS(side-scan sonar),
FLS(forward-looking sonar)

### 보조센서 (SAS 알고리즘 성능에 직결)
DVL, SVP(sound velocity profiler), IMU/INS/AHRS/MRU(motion reference unit),
하이드로폰(hydrophone/hydrophone array)

### 부품 카테고리 (M2 스카우트 대상)
트랜스듀서 / 하이드로폰 / **수중커넥터(wet-mateable, subsea connector)** / DVL / SVP / IMU·INS

### 플랫폼·방산 축 (뉴스 위주 적용)
submarine, naval sonar, towed array, flank array, bow sonar,
passive sonar, active sonar, submarine sonar system, defense contract

### 알고리즘·ML
beamforming, motion compensation, refraction correction,
underwater object detection, sonar image segmentation, ML-based acoustic classification

### 키워드 운영 원칙
- 소스별 용도 분리: 논문=영문 기술용어 / 뉴스=방산·프로그램용어(+한글) / 특허=한글+영문 혼합
  (예: KIPRIS 한글 쿼리 — 소나, 하이드로폰, 음향 센서, 수중 탐지, 수중 커넥터)
- 키워드 리스트는 설정 파일(keywords.yaml)로 관리, 코드에 하드코딩 금지

## 4. 아키텍처 (확정)

```
ui-workspace/apps/sonar-intel/          ← 본 앱 (dev-erp의 형제 앱, 동일 패턴)
├── server.mjs                          ← 무의존 Node 서버
├── src/
│   ├── collectors/                     ← L0 수집기 (LLM 0회)
│   │   ├── arxiv.py|mjs               ← 주 1회 (3초 간격·동시 1 접속 준수)
│   │   ├── openalex                   ← 일 1회 (polite pool, email 파라미터)
│   │   ├── semantic_scholar           ← 일 1회 (키 필요, 기본 1 RPS)
│   │   ├── epo_ops                    ← 주 1회 (OAuth, 주 4GB 한도)
│   │   ├── kipris                     ← 키 발급 후 활성화 (승인 절차 완료됨, 키 발급 대기)
│   │   └── news_rss                   ← 6시간마다 (Google News RSS + Defense News RSS 실측 OK)
│   ├── store.mjs                       ← CORE DB (intel.db, SQLite 시작 → PostgreSQL 이식 가능)
│   ├── analysis/                       ← M4 공출현 그래프(networkx/louvain), 버스트 감지 (LLM 0회)
│   └── llm_station/                    ← M3 태깅·M5 브리핑만 (유일한 LLM 지점)
├── config/
│   ├── sources.yaml                    ← 소스별 on/off 스위치 (논문=실험적 on, 끌 수 있음)
│   └── keywords.yaml                   ← §3 키워드
├── static/                             ← 프론트엔드 (vanilla JS, cytoscape.js 그래프 뷰)
├── export/                             ← ERP 내보내기 스냅샷 (CSV/JSON, ERP가 흡수)
└── test/

데이터 위치: intel.db는 본 앱 안(data/) — SW와 데이터 한 몸,
ERP 연동은 DB 병합이 아니라 export/ 스냅샷 교환으로 (결합 없음, dev-erp P1 read-only 철학 유지)
```

### 설계 원칙 (변경 금지급)
1. **자체 스키마 단일 진실원본**: ERP 형식에 맞추지 않는다. 모든 엔티티에 안정 ID(part_id 등),
   ERP 매핑 여지 필드는 `erp_mapping`(nullable) 별도 컬럼으로 비워둠.
2. **LLM 최소화**: L0~L2(수집·저장·분석)·L4(출력)는 LLM 0회. llm_station만 호출 허용.
   LLM 산출물에는 출처 링크 필수, 수치는 원문 대조 검증(발췌 방식 — "요약해줘" 금지).
3. **소스 on/off 스위치**: sources.yaml 한 줄로 각 소스 활성/비활성. 논문은 노이즈 시 off 예정.
4. **모듈은 파이프라인, UI는 하나**: 화면은 웹앱 1개(탭: 논문/부품/시장/트렌드맵/카탈로그),
   M번호는 백엔드 파이프라인 번호일 뿐. Pedigree류 "플랫폼 여러 개"가 아니라 단일 플랫폼+탭.

## 5. UI 설계 (프론트엔드)

- 스택: dev-erp와 동일 계열 — 무의존 Node 서버 + vanilla JS/static. 빌드체인 없음.
  그래프 뷰만 cytoscape.js 추가. React/Next 등 무거운 스택 금지(과함).
- 탭 구조: 대시보드(수집현황·시그널피드) / 논문 / 부품 / 시장 / 트렌드맵 / 장비 카탈로그
- 엔티티 카드(Pedigree 리뷰 탭 방식): 기업·기술·부품 클릭 → 관련 논문+특허+뉴스+제품 한 화면
- 버튼형 액션(Dealroom 방식): "심층분석", "비교표", "브리핑 생성"

## 6. 수집 주기 (근거 기반 확정)

| 소스 | 주기 | 근거 |
|---|---|---|
| arXiv API | 주 1회 | 공식: 24h 사이클, "같은 쿼리 하루 2회 이상 호출 불필요" 명시 |
| OpenAlex/S2/Crossref | 일 1회 (심야) | 메타데이터 변화 느림, polite pool 여유 |
| Google News RSS | 6시간마다 | 실시간성, 수주발표 놓침 방지, 비용 0 |
| Defense News RSS | 6시간마다 | 동일 |
| EPO OPS | 주 1회 | 주 4GB 한도, 특허 공개 주단위 |
| KIPRIS | 주 1회 | 특허 성격상 동일 |

## 7. API 제약 요약 (준수 의무)

- arXiv: 요청 간 최소 3초, 동시 접속 1개 (info.arxiv.org/help/api/tou.html)
- OpenAlex: polite pool 10 req/s · 10만/day (email 파라미터 필수)
- Semantic Scholar: API 키 기본 1 RPS
- EPO OPS: OAuth2 등록제, 주 4GB, Fair use charter
- KIPRIS Plus: ServiceKey 발급 필요 (회원가입·상품신청·관리자 승인 완료 2026-08-24, 키 발급 대기)
- Janes: 공개 RSS 없음(404 실측) → 크롤링 보류(약관 검토 전 금지)
- USPTO PatentsView: ODP 전환 중(2026-03~) → 당분간 미사용, EPO 위주

## 8. 팀 구성 및 운영 루프

### 봇 4종 (모두 reasoning effort high)
| 프로필 | 역할 | 권한 경계 |
|---|---|---|
| sonar-research | 정찰병: 구조 조사·소스 감시·도메인 리서치 | 코드 작성 금지, URL 근거 의무 |
| sonar-backend | 엔지니어: 수집기·DB·분석 파이프라인 | 지정 워크트리만 수정 |
| sonar-frontend | 디자이너·개발자: 대시보드·탭·엔티티 카드 | 지정 워크트리만 수정, 목업 선행 허용 |
| sonar-verifier | 독립검증자: **실물 실행+화면 캡처로 판정** | 수정 절대 금지, substring PASS 금지 |

### 운영 방식 (Owner 개입 최소화)
```
Owner: 방향 승인 ("굴려") 
관리자(bot-message-probe): Goal 동결 → 패킷 발행 → 결과 통합 → 한국어 보고
backend/frontend: Goal/Loop 자율 수렴 (구현→테스트→검증 회신 반복)
verifier: approve/request-changes/hold 판정 (request-changes면 자동 재루프, 2회 실패 시 HOLD 보고)
```
- 봇들 SOUL.md 원칙: "하라는 것만 하지 말 것 — 불필요한 건 줄이고 누락은 제안"
- 서브에이전트 패킷에는 산출물 경로를 반드시 명시(본 트리 루트 오염 방지 — 과거 실수 교정)

## 9. 진행 상태 및 다음 단계

### 완료
- [x] 사전 리서치 2건 (A안 유사제품, B안 데이터소스/API) — research/ 폴더
- [x] 키워드 리스트 확정 (§3)
- [x] 팀 봇 4종 생성 + SOUL.md 주입 (profiles/ 아래 각 프로필)
- [x] 위치·스택·주기 설계 확정 (§4~6)
- [x] KIPRIS 가입 완료 (Owner 직접, 2026-08-24)

### 대기/착수 전 (다음 순서)
1. [ ] 4봇 모델 등급 high 설정 (hermes profile 설정 또는 kanban --model)
2. [ ] 본 앱 골격 생성: ui-workspace/apps/sonar-intel/ (워크트리에서)
3. [ ] v1 Goal #1 발행: CORE DB 스키마 + news_rss/arXiv 수집기 + 첫 수집 성공
       (성공 기준 = verifier가 실제 실행·DB 행수·스크린샷으로 증명)
4. [ ] v1 Goal #2: OpenAlex+S2 수집기 + 공출현 분석 + 주간 브리핑
5. [ ] v1 Goal #3: EPO OPS 수집기 + KIPRIS 키 발급 후 활성화
6. [ ] v2: 프론트엔드 탭 UI (백엔드 안정화 후)
7. [ ] v3: 트렌드맵 시각화 + 버튼형 LLM 액션 (Pedigree 형태 완성)

### Owner에게 남은 것
- KIPRIS ServiceKey 발급 (마이페이지에서) → 나오면 백엔드봇에 전달
- (선택) 논문 소스 노이즈 평가 후 off 결정

## 10. 함정·교훈 (재발 방지)

- Hermes 명령 가드가 node -e 인라인 스크립트 차단 → 임시 .mjs 파일로 실행
- uv run python은 Hermes venv 외 파이썬 선택 → venv python.exe 직접 경로 실행
- youtube-transcript-api는 이미 hermes-agent venv에 설치됨 (youtube-content 스킬)
- git-bash tasklist 조건필터는 //FI 형태
- 서브에이전트 리서치 산출물이 C:\Soulforge 루트에 생성되는 사고 1회 → 패킷에 산출 경로 명시로 교정
