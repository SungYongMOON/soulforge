# dev-erp 마스터 빌드맵 (①~⑭ + 제안 통합, 2026-06-14)

- 작성: claude_opus-4-8 (Code, 1M) — 멀티에이전트 4클러스터 설계 종합
- 지위: **⑤~⑭+제안 통합의 정본 빌드맵.** ①~④ 정본=`SE_ENGINE_BUILD_PLAN_20260614.md`, 설계 canon=`DESIGN.md`, 비전 인덱스=`CAPABILITY_VISION_20260614.md`.
- Codex 가 cold 로 이어받아 실행할 수 있게 각 슬라이스를 패킷(파일·검증·중단조건·의존)으로 작성. DESIGN canon 갱신은 owner 서명 후.

## 통합 정체성

"메일이 아니라 **SE 프로세스 규정이 스스로 일을 낳는다**" — SE 8단계(030 SRR~240 LL)·산출물 7스텝·보드 유형별 필수 기술자료 세트를 코드가 아닌 데이터로 인코딩(①⑩⑪) → 과제 적용 시 산출물 할일이 마감과 함께 자동 출몰, 마일스톤 흔들리면 마감 전파(①⑭), 단계 게이트가 BOM·Gerber·Digikey·회로도·PCB·블록도를 포인터로 판정해 미충족이면 hard 차단(②⑨). 만든 보드/부품은 재사용 라이브러리(③)로 누적·역참조 → 단종(EOL) 영향분석(S7)·형상 이력(S2). 실물은 캐비넷에서 차감 트랜잭션으로만 출고(④). 만든 것·아는 것은 지식·계산기·자동보고로 남고(⑤⑥⑦), 채워지면 자동 산출물 초안(⑪). 사람은 Soulforge 역량 캐논(.registry class/skill/hero)에 연결돼 "누가 무엇을 잘하나"가 데이터가 되고(⑧), 콕핏에 "먼저 할 것"·부하(S3)·미결(S4)·납기위험(S1)을 롤업.

**불변 가드:** 코어 LLM 0%(모든 AI 산출은 단일 `ai_proposal` 큐→사람 승인) · 원문 미저장(포인터+sha256+요약) · `event_log` append-only 라벨링 · zero-dependency(node:sqlite/crypto/test/http) · 진실 1개+뷰 N개.

## 마스터 슬라이스 순서 (Codex 패킷)

각 슬라이스: 파일=allowed_write_paths · 검증=node:test green · 의존=depends_on.

| P | 산출 | 기능 | 의존 | 결정 막힘? |
|---|---|---|---|---|
| P-0 | `core_stage.stage_code` 컬럼화+backfill, gateEval 결합 분리 | ①② | — | 없음 ✅ |
| P-1 | `artifact_requirement` + `core_attachment.artifact_type` + entity_type='part' + gateEval `required_artifacts_missing`. 보드 필수6종 미충족 hard 차단 | ② | P-0 | #2(기본=단계별 1세트) |
| P-2 | `se_stage_template`3 + `core_item` 앵커4 + applyTemplate(120 CDR) spawn + set-anchor 1-hop 전파 | ① | P-0,P-1 | #3(기본=달력일·1-hop) |
| P-3 | `issueStock` 차감 + `stock_txn` 이벤트 + 출고 라우트 권한 + `stock_low` 알림, 캐비넷/칸 시드 | ④ | P-0 | #4(기본=음수금지) |
| P-4 ⭐ | `core_part` revision/is_library/library + 라이브러리탭 + `partUsage` 역참조 + **`ai_proposal` 테이블**(pending→승인→쓰기) | ③①②④ | P-0,1,2 | **#1 키스톤** |
| P-5 | ⑨ 하드 게이트 확장(`item_blocking` rule, ② 엔진 공유) | ⑨ | P-0,1 | 모드 hard/soft |
| P-6 | ⑧ `person_skill` + .unit 링크 + 능력매트릭스 + 콕핏 `nudges`(먼저 할 것) | ⑧ | — | #6 능력어휘 |
| P-7 | S3 부하(사람별 GROUP BY) + S4 회의미결 롤업 (새 테이블 0) | S3,S4 | P-6 | 감시경계 |
| P-8 | ⑭ 일정 뷰어 카드(마감 3버킷) | ⑭ | P-0 | #3 |
| P-9 | S1 납기/CDR 위험 조기경보(days_left×pct→severity) | S1 | P-1,P-8 | 임계규칙 |
| P-10 | ⑤ `core_knowledge` 카탈로그 + 드롭 등재 + 검색 | ⑤ | (P-4 자동태깅) | #7 |
| P-11 | ⑥ `core_calculator` + 안전 평가 + example 회귀검증 | ⑥ | — | #10 파서범위 |
| P-12 | ⑦ 자동보고 UI 와이어링(기존 worklogDraft/reportDraft) | ⑦ | — | 발신경계 |
| P-13 | ⑩ `doc_recipe` 작성법 위저드(회의록 1종) | ⑩ | — | required_input 어휘 |
| P-14 | ⑪ input 충족 자동생성 버튼(gateEval 재사용) | ⑪ | P-1,P-2 | 생성=P-4 |
| P-15 | S7 부품 단종(EOL) 영향분석(bom_edge 역참조) | S7 | P-4 | 대체=P-4 |
| P-16 | S2 형상 변경 이력(`config_baseline` 스냅샷·diff) | S2 | P-4 | baseline≠승인 |
| P-17 | ⑬ 개인 캘린더 ICS export(파일 다운로드) | ⑬ | P-8 | 구독URL cut |
| P-18 | ⑫ Smartsheet 임베드 보기(read·topen 0) | ⑫ | — | write cut |
| P-19 | 자동화 제안 루프 통합(11기능 추천→승인→쓰기) | 다수 | **P-4** | **#1** |

## owner 결정 10건 (빌드 막힘 순)

1. **⭐#1 키스톤** — `ai_proposal` 신규 테이블 vs `event_log` 재사용 + 자동화 경계. **14기능 중 11기능의 '추천→쓰기'를 좌우.** 미정이면 자동화 전체가 수동 버튼. (4클러스터 권고: 테이블 신설)
2. 필수 산출물 세트 보드유형별 vs 단계별 + board_type 규칙(type/grp/수신부·신호처리·전원).
3. 마감 전파 단위(영업일/달력일), 앵커=회의·검토일 vs 발주·납기, 8단계 캐스케이드 시점. (MVP=달력일·1-hop)
4. 출고 3역할(junior/dispatcher/senior)↔core_person.role 매핑 + 가용초과 거부 vs 마이너스.
5. 자동화 경계 세부 — ⑦메일 회신 초안만 vs 반자동, 월간보고 결정적 vs LLM 다듬기, ⑨ hard/soft·force 권한, S3/⑧ 개인 열람 권한.
6. 능력 어휘 1벌 — skill id vs class assign vs species bias.
7. `core_knowledge` vs `core_faq` 경계 + .registry/knowledge 9정본 시드.
8. 리비전 식별(part_no vs supersedes_id) + 캐비넷 깊이 + baseline 스냅샷 깊이.
9. 외부 토폴로지 — RAG 포인터 인입 vs 직접호출(tool_pc), Smartsheet 임베드 vs CSV import·토큰, ICS 파일 vs 구독.
10. ⑥ 안전 평가 파서 범위 + LLM 계산기 example 회귀검증 강제(권고: 강제).

## 잘라낼 것 (defer)

Smartsheet write/양방향 동기 · ①8단계 전체 캐스케이드 · 회로유형 자동분류 · 회의 액션 LLM 자동추출 · ⑬구독 ICS URL · S7 BOM N-hop·런웨이 · S2 재귀 스냅샷 · 외부 생성기 실연결(tool_pc) · ⑦메일 자동발신(절대) · ⑥LLM계산기 자동 active(회귀검증 전) · 전장뷰/랭킹(P-G) · 대체부품 자동치환 · 외부 supplier 실시간 조회.

## Codex 핸드오프

(1) main 직접 작업 — 작업 전 트리 안정성(HEAD·index.lock·외부 worktree) 확인. (2) 슬라이스(P-N) 단위, depends_on 위상 순서. (3) 슬라이스마다 `cd ui-workspace/apps/dev-erp && node --test test/core.test.mjs` 전건 green + verify_gate Level≥1 + 작업자·모델 표기 commit+push. (4) 페이즈 끝 NIGHT_WORK_HANDOFF. (5) zero-dependency 유지(새 npm 금지, ICS는 gateway 복사). (6) 불변 가드(코어 LLM 0%/원문 미저장/append-only/게이트 신규함수 0/ALTER try-catch 멱등/.unit·.registry read-only). (7) **키스톤 차단**: 결정 #1 미정이면 P-4 ai_proposal 절반·P-19 전체 막힘 — 그 전까지 '추천 없는 읽기·뷰·게이트' 부분만 buildable.
