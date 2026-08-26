# 소나 인텔 플랫폼 — 사전 리서치 종합 보고서 (v1 기획 근거)

작성: 2026-08-24 · 관리자(bot-message-probe) 통합 · 하위 리서치 2건(A: 유사제품 스카우트, B: 데이터소스/API 검증) 교차검증 완료
하위 원본: `sonar-intel-platform-scout.md`(A), `research_api_and_methodology_validation.md`(B)

---

## 1. 결론 요약 (Executive Summary)

1. **차별화 공백 확인**: 범용 시장인텔(CB Insights $50K~265K/년)도, 국방 인텔(Janes/Shephard/GlobalData)도 "소나 세부장비·부품·알고리즘 레벨"은 커버하지 않음 → 자체 구축할 가치가 명확한 공백 영역.
2. **무료로 시작 가능**: 학술(arXiv+OpenAlex+Semantic Scholar)·특허(EPO OPS 주 4GB, KIPRIS 무료)·뉴스(Google News RSS, Defense News RSS 실측 정상) 모두 무료 파이프라인 구성 가능. Scopus는 개인(비기관) 이용 불가 → OpenAlex가 대체 1순위.
3. **방법론 검증됨**: "API 수집 → 키워드 공출현 네트워크 → 버스트 감지"는 bibliometrics 계열 확립 방법론(Springer/TFSC 논문, VOSviewer, bibliometrix 선행사례 5건). 이제현 박사 Scopus 사례의 무료 재현 경로 존재.
4. **Pedigree 패턴 재현 가능**: Palantir Gotham/Linkurious가 엔티티 그래프 매핑 패턴을 검증. 오픈소스 스택(SQLite→PostgreSQL + networkx + cytoscape.js)으로 소나 도메인 특화 소규모 재현 현실적 — 개인 1인 규모 판단 근거 확보.

## 2. v1 엔진 권장 스택 (리서치 근거 기반)

| 레이어 | 선택 | 근거 |
|---|---|---|
| 학술 수집 | arXiv API (3초 딜레이·동시 1 접속 준수) + OpenAlex(polite pool 10 req/s·10만/day) + S2 API(키 발급, 기본 1 RPS) | B안 §1 |
| 특허 수집 | EPO OPS(OAuth, 주 4GB) + KIPRIS Plus(**승인 절차 있어 초기 신청 선행 필요**) | B안 §2 |
| 뉴스 수집 | Google News RSS(키워드별) + Defense News RSS | B안 §3 실측 200 OK |
| 분석 | networkx 공출현 그래프 + Louvain 커뮤니티 + 월별 버스트 스코어 | B안 §4 방법론 |
| 참고 비교 | VOSviewer(무료 데스크톱)를 사람 눈 검증 도구로 병행 | A안 §2 |
| LLM 사용처 | 기사 구조화 태깅·주간 브리핑 문장 생성만 (수치는 원문 대조 검증) | 설계 원칙 |

## 3. 리스크·UNKNOWN 목록

- Janes 공개 RSS 없음(404 실측) → 페이지 크롤링은 약관 검토 전 보류.
- USPTO PatentsView는 ODP 전환 중(2026-03~) → 전환 완료 후 재검토, 당분간 EPO OPS 위주.
- KIPRIS 일일 한도 수치 UNKNOWN → 신청 후 확인.
- Pedigree 플랫폼 상세·소나 도메인 네트워크매핑 선례: 웹 확인 불가(UNKNOWN).
- Navy Recognition RSS는 403(UA 설정 필요).

## 4. 다음 단계 (확정 대기)

1. Owner가 키워드 초기 리스트 최종 확정 (SAS/MBES/SSS/FLS + SVP/DVL/IMU/INS/AHRS + 부품 카테고리)
2. 제작 전용 새 봇 프로필 세팅 + 별도 워크트리 생성
3. v1 골격: CORE DB 스키마 → M1(arXiv+RSS 수집기) → 첫 주간 diff 산출
