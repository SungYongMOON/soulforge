# dev-erp 지식 모듈 기획안 (Knowledge Module Plan) — 2026-06-13

- 작성: claude_fable-5 (역할: **설계자 + 검사자**. 빌드/코드 변경 0 — 기획안만)
- 구현 주체: codex (dev_worker)
- 성격: dev-erp 안에 "지식 투입 + 진행상황 + 안 된 것 + 지식 뷰어"를 붙이는
  UI 모듈 설계 정본 초안. 상세 구현은 codex 가 실행 패킷으로 받아 진행한다.
- 실행 패킷: `_workmeta/system/dev_worker_candidate_queue/dev_erp_knowledge_module_prototype_v0.yaml` (`status: proposed`)

## 0. owner 결정 반영 (2026-06-13)

| 결정 항목 | 선택 |
| --- | --- |
| 호스트 앱 | 현재 개발 중인 ERP(`dev-erp`)에 통합. 지식 뷰어(3-RAG 뷰어)도 ERP 안에 함께 |
| 드롭 시 처리 | **인테이크 인박스 복사 + 후보 등록** (원문은 `_workmeta` 금지 → `_workspaces/knowledge/inbox/`) |
| 첫 산출물 범위 | **클릭 가능 프로토타입** (합성 데이터, 쓰기/실복사는 다음 슬라이스) |

## 1. 배경 — wants/MASTER_PLAN 연결

이 모듈은 새 발명이 아니라 MASTER_PLAN 의 미배정/고아 클러스터를 한 화면으로
모은 것이다. 중복 backlog 를 만들지 않고 아래를 실현한다.

- `RAG/지식/skill 조회` (wants 20·28·172~176·222) — MASTER_PLAN 에서 "IA 칸만
  존재, P4 후반 모듈" 로 배정된 항목의 UI.
- `파일 첨부/삭제/뷰어` (wants 59·118~121) — "고아 확인, P2.5 파일 포인터+
  첨부+뷰어 신설 제안" 항목의 투입/뷰어 부분.
- `업로드 자동 배치 filing` (wants 44·73·215) — "고아, 당장 불편 6번" 의 투입
  진입점.
- Soulforge 차원에서는 `knowledge_pipeline_bottleneck_burndown_v0` 의 **B5
  (pending-work 단일 뷰)** 와 **B1/B3 (promotion-ready·커버리지 지표)** 의 UI
  소비면이다. 그 rollup 산출물을 읽어 표시하는 것이지, 새 파이프라인을 만들지
  않는다.

## 2. 화면 구성 — nav "지식" 그룹 (4개 뷰)

### 2.1 투입 (Intake)

- 드래그앤드롭 영역 + `파일 선택` 버튼(`<input type="file" multiple>`로 파일
  탐색기 열기). 폴더 단위는 후속.
- 드롭/선택 시 동작(프로토타입): 파일의 **메타만**(이름·크기·확장자) 읽어
  "처리 대기" 목록에 후보 행을 추가하고 상태를 `인박스 복사됨 · 처리대기`,
  claim ceiling `—` 로 표시한다. 실제 파일 복사·업로드는 하지 않는다(시뮬레이션,
  `synthetic` 라벨).
- 안내 문구 고정: "원문은 인박스로만 들어갑니다. 드롭 = 정본 아님, 처리 대기
  후보 등록입니다."
- 실 구현(S2) 시: 원문을 `_workspaces/knowledge/inbox/<수신일>/` 로 복사하고
  ERP store 에는 포인터·해시·출처·상태만 기록(원문 본문 비저장).

### 2.2 진행상황 (Pipeline)

- 6단계 스테퍼: `① 원본 → ② Intake → ③ Projection → ④ Candidate → ⑤ Review →
  ⑥ Canon`, 단계별 항목 수 배지.
- RAG 커버리지 미터: Stage1(검색가능)/Stage2(업무용)/Stage3(정본) 도달 비율
  (B3 rollup 소비). 숫자 없으면 합성.
- 항목별 진행 테이블: 지식 항목 × 현재 단계 × claim ceiling × 마지막 갱신.

### 2.3 안 된 것 (Blocked / 대기 / 누락) — "안 까먹게"

- promotion-ready 인데 미승격(B1): 기준 통과했으나 정본 안 된 항목 + named
  blocker(owner hold / 경계 위험 / validator 실패 / surface 불명확).
- blocked: 진행 막힌 항목 + 사유(예: NotebookLM auth, source gap).
- gap: figure/table/OCR 경고로 약한 페이지.
- 각 행에 `다음 행동(next action)` 1개. 이 뷰가 "까먹지 않게" 하는 핵심.

### 2.4 지식 뷰어 (3-RAG Viewer)

- 정본 카드 목록: `.registry/knowledge/**` 파생(read-only) — id·title·claim
  ceiling·source ref 수.
- 카드 클릭 → 우측 탐지 카드(detection card): summary·claim ceiling·source
  refs·관련 노드·부족한 증거(missing evidence)·다음 행동. 이는
  `guild_hall/knowledge_graph` 의 `retrieval_plan` 출력 계약을 그대로 소비한다
  (UI 가 재해석하지 않음).
- 경량 그래프 뷰(노드·엣지) 옵션. 본격 3D preview 임베드 여부는 owner 결정(4절).

## 3. 데이터 흐름과 경계 (헌장 정합 — 가장 중요)

```text
드롭 파일 ──(원문)──> _workspaces/knowledge/inbox/   (S2부터, _workmeta 금지)
        └──(메타/포인터)──> ERP store (event_log: used_refs + data_label)
파이프라인 상태 <── B1/B3 rollup 산출물 (read-only)
정본 카드/탐지카드 <── .registry/knowledge + knowledge_graph retrieval_plan (read-only 파생)
```

불변 경계:

- 원문(HWP/PDF/Office/zip/메일)은 `_workmeta`·public repo 에 저장 금지. 인박스는
  `_workspaces/knowledge/**` 또는 owner-approved worksite.
- 정본 표시는 `.registry/knowledge` 에서만 파생. 후보 본문·`_workmeta` projection
  payload·NotebookLM 답변 전문은 뷰에 노출하지 않는다(WORLDVIEW 의 Obsidian
  export 규칙과 동일 경계).
- 프로토타입(S1)은 read + 시뮬레이션. 실제 쓰기는 P2.5 쓰기 도메인(RBAC 필드).
- 듀얼 스킨 사전: 투입/후보/정본 등 신규 용어는 `src/lexicon.mjs` 에 업무/판타지
  쌍으로 추가(라벨 하드코딩 금지 규칙 준수).

## 4. 단계 슬라이싱

| 슬라이스 | 내용 | 쓰기 | 데이터 |
| --- | --- | --- | --- |
| **S1 (이번, 프로토타입)** | 4뷰 클릭 동작, 드롭→후보행 시뮬레이션 | 없음 | 합성(synthetic) |
| S2 | 실제 인박스 복사 + 후보 메타 기록(P2.5, RBAC 필드) | 인박스/메타 | 실데이터 |
| S3 | B1/B3 rollup 실데이터를 진행/blocked 뷰에 연결 | 읽기 | 실데이터 |
| S4 | 뷰어를 `retrieval_plan`/`graph_export` 실데이터에 연결 | 읽기 | 실데이터 |

S1 의 목적은 owner 가 "느낌"을 먼저 확인하는 것이다(team-ops-board 가 거친
mockup→working slice 순서와 동일).

## 5. 검사 기준 (검사자 모자 — INSPECTOR_PROTOCOL / verify_gate 정합)

구현 후 fresh-context inspector(codex 별도 스레드/owner/subagent)가 확인:

1. **경계**: 변경 파일이 dev-erp scope 안인가. public repo 에 원문/secret/보호
   데이터 0 (`git show --stat`).
2. **가드레일 대조**: S1 은 `synthetic` 라벨만·실데이터 0; 정본 뷰는 `.registry`
   파생만; `_workmeta` 원문 0; 드롭이 실제 업로드/복사를 하지 않음.
3. **테스트 재실행**: 기존 `node --test test/core.test.mjs` 무회귀 + 신규 지식
   모듈 스키마/라벨/이스케이프(XSS esc) 테스트 추가·통과.
4. **claim ceiling**: 프로토타입 UI 는 "표시·시뮬레이션"이며 정본 승격/소스
   진실/answer 진실을 주장하지 않는다.
5. **judge**: 효과 대비 복잡도, 기존 모듈 패턴(store/adapter/lexicon) 정합.
6. packet 끝에 `inspector_verdict` 기록(자기검증 무효).

비목표: GraphRAG/RAG 답변 엔진, LLM 자동 정본화, 원문 인덱싱, NotebookLM
import, 정본 승격 권한.

## 6. 미해결 owner 결정 (구현 시작 전 닫을 것)

- 인박스 실제 경로 확정: `_workspaces/knowledge/inbox/` 로 고정할지.
- 후보 메타 스키마: 기존 `knowledge_candidate_triage_v0` register 를 재사용할지
  ERP 자체 경량 스키마를 둘지.
- 뷰어 그래프: `knowledge_graph` 3D preview 임베드 vs ERP 자체 경량 SVG 그래프.
- 페이즈 배치: P2.5(파일 뷰어)에서 시작 vs P4(RAG 모듈)에서 시작 — MASTER_PLAN
  타임라인과의 우선순위.

## 7. 참조

- 설계 정본: `docs/DESIGN.md`, `docs/MASTER_PLAN_20260613.md`
- 검사: `docs/INSPECTOR_PROTOCOL.md`, `tools/verify_gate.mjs`
- 경계/파이프라인: `docs/architecture/guild_hall/KNOWLEDGE_WIKI_WORLDVIEW_V0.md`,
  `RAG_THREE_STAGE_OPERATING_MODEL_V0.md`, `KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md`
- Soulforge 병목: `_workmeta/system/dev_worker_candidate_queue/knowledge_pipeline_bottleneck_burndown_v0.yaml` (B1/B3/B5)
