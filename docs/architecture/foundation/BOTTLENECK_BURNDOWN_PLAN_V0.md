# 병목 번다운 수정 기획안 V0 — "오너가 병목이 되지 않는 Soulforge"

> 상태: **owner-review-pending · 빌드 0 (분석·기획만, 코드 변경 0)**
> 작성: claude_fable-5 (hybrid lane, 심층 리포 감사 1회)
> 날짜: 2026-06-13
> 범위: Soulforge 전체 + dev-erp 레인, 팀+ERP 본격 운영 직전 병목 식별
> 연속성 제약 준수: 본 문서는 PLAN/DESIGN/packet 계열 기획 문서이며, 모든 제안 산출물은
> 도구 비종속(표준 Node/CLI)·Codex 이어받기 가능을 전제로 한다. main 직접 push 없음.

---

## 0. 한 줄 결론

**병목은 특정 모듈이 아니라 "오너 1인이 모든 결정·통합·맥락의 단일 통과점(SPOF)"이라는 구조 그 자체다.**
시스템은 이미 충분히 크고 정교하다(워크플로우 64 · 서브시스템 24 · 스크립트 120). 문제는 그 거대함을
**오너만 머릿속으로 운전할 수 있고, 모든 진행이 오너의 명시 승인에서 직렬로 막힌다**는 점이다.
따라서 해법은 "더 만들기"가 아니라 **(1) 결정을 1회성 정책으로 박제해 위임 · (2) 중복 통합·축소 · (3) 통합 게이트를 분산**하는 것이다.

---

## 1. 진단 요약 (정량 지표)

| 지표 | 값 | 의미 |
|---|---|---|
| `.workflow` 워크플로우 수 | 64 | 표면적 거대 |
| 그중 `production_ready` 등급 | **0** | 전부 사적 파일럿(54개 `pilot_executed_private_fixture`). 실업무 검증된 진입점이 없음 |
| `guild_hall` 서브시스템 | 24 | 로깅 3종·동기화 2종·프리플라이트 2종 등 중복 다수 |
| npm 스크립트 | 120 | 신규 팀원이 익혀야 할 표면 |
| `validate:*` 스크립트 | 25+ | 실행 순서·우선순위 안내 문서 부재 |
| `_workmeta` 프로젝트 | 13 | 컨텍스트 분산 |
| dev_worker 후보큐(승인 대기) | 후보 11 · `approved:false` 14 | 전부 오너 승인에서 정지 |
| 메일 후보(라우팅 대기) | 43 | 전부 "어느 프로젝트?" 오너 판단 대기 |
| dev-erp MASTER_PLAN 결정 대기(갈림길) | 16 마커 / 갈림길 ①~⑪ | 9일치+ 작업이 오너 결정에 직렬 종속 |
| 최근 60커밋 중 dev-erp 성격 | 기획·하네스·docs 12 vs 실제 feature run 3 | **기획↔출하 비율 역전, "빌드 0" 3연속** |
| 30일 커밋 | 223 (사실상 1인) | churn은 높으나 출하는 정체 |
| CHANGELOG | 3,695줄 | 문서 동기화 유지보수 부담 |

---

## 2. 진짜 병목 — 3축

### 축 A. 오너 의존성 (Single Point of Failure)

오너가 자리에 없으면 시스템 전체가 "대기"로 수렴한다. 근거가 된 직렬 종속 지점:

1. **결정 게이트의 기본값이 "오너 승인 전엔 정지"** — `.workflow/owner_decision_packet_v0`, RAG `source_slice` 기본 false, dev_worker 후보 `owner_approval.required:true & approved:false`. 승인이 없으면 승격 자체가 막힌다(증거: `DEVELOPMENT_ROADMAP_V0.md` "승인 전에는 실행 큐로 승격하지 않는다").
2. **메일 라우팅이 오너 머릿속 규칙에 의존** — 게이트웨이는 자동으로 메일을 받지만, "어느 `project_code`로 보낼까요?"는 오너만 답한다. 현재 43건 적체.
3. **맥락 연속성이 단일 거대 파일에 의존** — `NIGHT_WORK_HANDOFF.md`(약 1.2만 줄)를 오너가 직접 읽고 해석해야 다음 세션/다른 PC/다른 도구로 이어진다. 자동 요약·추출 없음.
4. **시크릿·멀티 PC 핸드오프 수동** — `.env`는 오너가 손으로 복사해야 하고(설계상 에이전트 열람 금지), PC 전환마다 pull→sync→doctor→secret copy 10~20단계 수동.
5. **단일 통합자 머지 게이트** — AGENTS.md: "Codex 외 AI는 `claude/*` 브랜치, main 직접 push 금지, merge 전 owner/Codex 검증." 즉 **오너+Codex만 통합 가능**. 병렬 통합 경로 없음.

> 왜 병목인가: 위 5개가 전부 "오너만 할 수 있는 일"이고, 팀원·에이전트는 그 앞에서 줄을 선다. 팀이 들어와도 처리량은 오너 1인의 가용 시간에 묶인다.

### 축 B. 시스템 복잡도 (신규 진입 불가)

1. **모든 워크플로우가 실험 등급** — 64개 중 `production_ready` 0개. 팀원은 "안전하게 매일 쓰는 진입점"이 없고, 들어오자마자 동시다발 엣지케이스의 첫 사용자가 된다.
2. **중복·근접중복 다수**
   - 로깅 3종: `battle_log` / `activity` / `daily_ledger` — 모두 타임스탬프 이벤트 적재, 상호참조 없음.
   - 동기화 2종: `workmeta_sync` / `private_state_sync` (+ workflow `latest_update_sync_and_followup_v0`).
   - 프리플라이트 2종: `monster_knowledge_preflight_v0` / `workflow_knowledge_preflight_v0` — 거의 동일.
   - 소스 수집 3종: `official_source_packet_collect_v0` / `exp_xml_component_materials` / `component_pcb_layout_guide_extraction`.
   - 리뷰 게이트 4종: 어떤 게이트를 언제 쓰는지 라우팅 문서 없음.
3. **120 스크립트 · 25+ validate** — 어떤 5~10개가 "필수"인지 안내 부재. `validate:`가 전체인지 일부인지 불명확(실제론 일부만 커버).
4. **RPG 메타포가 기능을 가린다** — `monster`(=업무요청), `species`(=에이전트 역량), `town_crier`(=알림), `healer`(=헬스체크), `night_watch`(=드리프트 점검). 신규자에겐 학습비용만 추가.
5. **7축 경계 누수** — `.workflow`가 정책(readiness ceiling 등)까지 소유해 `.unit`/`.mission` 영역과 섞임. `.mission`은 64개 워크플로우 어디서도 참조되지 않아 "계획↔실행" 연결이 끊김.

> 왜 병목인가: 이 복잡도는 오너 머릿속에서만 일관되다. 팀원·에이전트는 "어디서 시작해 무엇을 믿고 쓰는지" 판단을 못 해, 결국 오너에게 묻는다 → 축 A로 회귀.

### 축 C. 개발 워크플로우 정체 (출하가 안 됨)

1. **기획↔출하 비율 역전** — run18~20이 전부 "빌드 0"(검증·문서만). 최근 60커밋에서 기획/하네스/docs 12 : 실제 feature run 3.
2. **검증 과적재** — PLAN_P4가 스스로 "~150% 과적재" 인정. `done:check`가 38+ 검증을 직렬 연쇄, 슬라이스마다 Level 0~3 게이트 + 브라우저 수동 재검증.
3. **백로그 > 완료** — 후보큐 11 + 고아 wants 12 + 갈림길 ①~⑪이 승인 대기로 누적. 트리아지 자동화 없음.
4. **단일 통합자 + 직렬 LLM 체인** — 머지는 오너/Codex만, D5~D8 LLM 직렬 구간은 Codex 브릿지 마찰 시 후반 연쇄 지연.

> 왜 병목인가: "충분히 계획했는데 출하가 안 나간다"의 전형. 의식(ceremony)이 출하보다 무겁고, 결정·통합이 1인에 묶여 WIP가 흐르지 않는다.

---

## 3. 근본 원인 (한 문장)

> **solo-as-integrator(1인 통합자) + heavy ceremony(무거운 검증·문서 동기화) + no async decision path(비동기 결정 경로 부재)** 의 결합.
> 세 가지가 맞물려, 시스템이 커질수록 오너 1인의 처리량이 전체 상한이 된다.

---

## 4. 실용적 대안 — 3대 원칙

| 원칙 | 한 줄 | 병목 대응 |
|---|---|---|
| **P1. 결정을 정책으로 박제(Decide-once, delegate-forever)** | 오너의 반복 판단을 `standing_policy.yaml`에 1회 명문화하면, 이후 같은 케이스는 규칙이 자동 처리하고 예외만 오너에게 올린다 | 축 A |
| **P2. 통합·축소(Consolidate)** | 중복 로깅/동기화/프리플라이트/소스수집/리뷰게이트를 합치고, "production_ready 골든패스 7개"를 지정해 나머지는 보관 등급으로 내린다 | 축 B |
| **P3. 게이트 분산 + WIP 제한(Distribute & limit)** | `claude/*` 브랜치 자동 검증(CI 동등물)으로 머지 전 통과를 자동화하고, "동시에 빌드 0 문서 N개 초과 금지" WIP 룰로 출하를 강제한다 | 축 C |

---

## 5. 수정 기획안 — 우선순위별 (각 항목: 문제 → 대안 → 자동 보완 산출물 → 완료기준 → 오너 1회 결정)

### P0 (이번 주, 출혈 멈추기)

**P0-1. 결정 원장(Decision Ledger)으로 오너 승인 박제**
- 문제: 후보 승인·소스슬라이스·메일 라우팅이 매번 오너 명시 승인 대기.
- 대안: `standing_policy.yaml` 한 파일에 "위험도 tier별 자동 승인 규칙"을 명문화. 저위험(문서 동기화, 라벨 감사, 후보큐 archive 등)은 **자동 승인**, 고위험(스키마 변경, public canon 승격, 외부 전송)은 오너 유지.
- 자동 보완 산출물: `guild_hall/decision_ledger/` (cli.mjs + validate). 입력=후보 packet, 출력=`auto_approved | owner_required` 라우팅 + event_log.
- 완료기준: 후보큐 11건 중 저위험이 자동 분류되어 오너 대기열이 절반↓. `node --test` 통과.
- 오너 1회 결정: tier 경계(무엇이 저/중/고위험인가) 서명 1회.

**P0-2. 갈림길 ①~⑪ 일괄 비동기 결정 패킷**
- 문제: dev-erp 16개 결정 마커가 직렬로 출하를 막음.
- 대안: 11개 갈림길을 **객관식 1장**(권장안 + 대안 + 영향)으로 묶어 오너가 한 번에 서명.
- 자동 보완 산출물: `ui-workspace/apps/dev-erp/docs/OWNER_DECISION_BATCH_20260613.md` (결정 패킷 템플릿, 각 항목 default 권장안 포함).
- 완료기준: 11개 중 ≥9개 close → P2b 등 후속 슬라이스 잠금 해제.
- 오너 1회 결정: 패킷 서명(예상 20~30분).

**P0-3. "빌드 0" WIP 제한 룰**
- 문제: 기획 문서만 3연속, 출하 정지.
- 대안: 룰 명문화 — "미출하(빌드 0) 기획 문서는 동시 2개까지. 새 기획 추가 전, 기존 기획 1개를 출하 슬라이스로 전환해야 함."
- 자동 보완 산출물: `guild_hall/validate/wip_limit_policy.mjs` — `git log`에서 연속 "빌드 0" 카운트, 임계 초과 시 `done:check` 경고.
- 완료기준: validate에 편입, 위반 시 비차단 경고.
- 오너 1회 결정: WIP 상한값(기본 2) 승인.

### P1 (2~3주, 위임 가능화)

**P1-1. 메일 자동 라우터 + 폴백**
- 대안: 발신자/제목/도메인 → `project_code` 규칙표(`mail_routing_rules.yaml`). 매칭 시 자동 업무화, 미매칭만 오너 큐.
- 자동 보완 산출물: `guild_hall/gateway/mail_router.mjs` + 규칙표 + event_log. 신규 발신자는 오너 1클릭 후 규칙 학습 제안.
- 완료기준: 43건 적체 중 규칙 매칭분 자동 분류, 오너 큐 ≤ 10.

**P1-2. NIGHT_WORK_HANDOFF 자동 요약 추출기**
- 대안: 1.2만 줄 서사 파일에서 "미결 결정 · 블로커 · 다음 액션"만 구조화 JSON으로 추출 → 1페이지 digest.
- 자동 보완 산출물: `guild_hall/handoff/handoff_digest.mjs` (입력=HANDOFF.md, 출력=`handoff_digest.json` + 80줄 요약).
- 완료기준: 세션 시작 시 오너가 전체 파일을 읽지 않고 digest만으로 복귀 가능.

**P1-3. 로깅 3종 통합 → 단일 이벤트 스트림**
- 대안: `battle_log`+`activity`+`daily_ledger`를 append-only 단일 스트림 + 다중 뷰(일별/프로젝트별)로 통합.
- 자동 보완 산출물: `guild_hall/activity/event_stream.mjs` + 마이그레이션 스크립트(기존 3종 → 1종) + 호환 alias.
- 완료기준: 세 CLI가 동일 스트림에 기록, 기존 테스트 통과.

**P1-4. `claude/*` 자동 검증(머지 게이트 분산)**
- 대안: 도구 비종속 검증 스크립트로 `claude/*` 브랜치를 자동 통과시켜, 오너/Codex는 "검토"가 아니라 "확인"만.
- 자동 보완 산출물: `guild_hall/validate/branch_acceptance.mjs` + (선택) GitHub Actions 워크플로우(표준 Node, 비밀 불요한 검증만).
- 완료기준: claude 브랜치 PR이 자동 그린 → 머지 리드타임↓.

### P2 (1~2개월, 신규 진입 가능화)

**P2-1. 골든패스 7개 production_ready 승격**
- 대안: 팀이 매일 쓸 7개 워크플로우만 골라 실프로젝트 파일럿 → `production_ready` 등급 + "안전하게 쓰는 법" 1페이지. 나머지 57개는 `incubating/archived` 등급으로 강등(삭제 아님).
- 자동 보완 산출물: `.workflow/index.yaml`에 `lifecycle` 필드 추가 + `validate:workflow-lifecycle.mjs`.
- 완료기준: 신규 팀원이 7개 진입점만 알면 일상 업무 가능.

**P2-2. 중복 워크플로우 통합**
- 프리플라이트 2→1, 소스수집 3→1(파라미터화), 리뷰게이트 4개 라우팅 문서화, 동기화 2종 정리.
- 자동 보완 산출물: 통합 워크플로우 + deprecation alias(기존 호출 깨지지 않게).

**P2-3. 용어 별칭 레이어(메타포 → 평어)**
- 대안: 코드 대량 rename 대신 **별칭 사전** 도입. `monster=업무요청`, `town_crier=알림`, `healer=헬스체크` 등을 문서·UI 라벨·`--help`에 평어 우선 노출, 내부 식별자는 유지(Codex 연속성 보호).
- 자동 보완 산출물: `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` 확장 + UI "업무 뷰"는 평어, "전장 뷰"만 메타포(이미 DESIGN의 2뷰 원칙과 정합).

---

## 6. 자동 보완 — 드롭인 산출물 목록 (Codex 이어받기 가능, 표준 Node/CLI)

아래는 "자동으로 보완할 수 있는 수준"의 구체 명세다. 각 항목은 독립 PR(`claude/<slug>`)로 분리 가능하며, 모두 `node --test` 자기검증을 포함한다.

| # | 산출물 경로(제안) | 입력 → 출력 | 대체/축소 대상 | npm 스크립트(제안) |
|---|---|---|---|---|
| 1 | `guild_hall/decision_ledger/cli.mjs` | 후보 packet → `auto_approved\|owner_required` | 수동 승인 대기 | `guild-hall:decision:route` |
| 2 | `standing_policy.yaml` (루트 또는 `_workmeta`) | tier 규칙 1회 정의 | 반복 오너 판단 | — |
| 3 | `guild_hall/gateway/mail_router.mjs` | 메일 → `project_code` | 43건 수동 라우팅 | `guild-hall:gateway:route` |
| 4 | `guild_hall/handoff/handoff_digest.mjs` | HANDOFF.md → 80줄 digest+json | 1.2만 줄 수동 독해 | `guild-hall:handoff:digest` |
| 5 | `guild_hall/activity/event_stream.mjs` (+migrate) | 3 로그 → 1 스트림 | battle_log/activity/daily_ledger 중복 | `guild-hall:activity:stream` |
| 6 | `guild_hall/validate/branch_acceptance.mjs` | claude 브랜치 → green/red | 단일 통합자 머지 | `validate:branch` |
| 7 | `guild_hall/validate/wip_limit_policy.mjs` | git log → 빌드0 연속 카운트 | 기획 적체 | `validate:wip` |
| 8 | `.workflow/index.yaml` `lifecycle` 필드 + `validate:workflow-lifecycle.mjs` | 64 워크플로우 → 7 golden / incubating / archived | 전부 실험 등급 | `validate:workflow-lifecycle` |
| 9 | `OWNER_DECISION_BATCH_20260613.md` | 갈림길 ①~⑪ → 1장 객관식 | 16 결정 마커 직렬 | — |

> 권장 착수 순서: **9 → 2 → 1 → 7 → 4 → 3 → 6 → 5 → 8**.
> (먼저 오너 결정을 비동기로 닫고[9·2], 그 정책으로 자동 라우팅[1]을 켜고, 출하 압력[7]과 복귀비용[4]을 낮춘 뒤, 처리량[3·6]과 구조[5·8]를 정리.)

---

## 7. 오너가 "지금" 닫아야 할 결정 (한 번에)

1. 위험도 tier 경계(저/중/고) — P0-1 정책의 근간.
2. 갈림길 ②(게이트 hard/soft), ⑧(고아 4클러스터 단계 배치), ⑨(tool_pc 로컬 백엔드 시점), ⑩(외근 접근 경로/VPN), ⑪(solo 기간 actor 오염 보정 시점) — P0-2 패킷으로 일괄.
3. WIP 상한값(기본 2) — P0-3.
4. 골든패스 7개 후보 확정 — P2-1.

> 이 4묶음만 서명되면, 위 산출물 1~9 대부분이 오너 추가 개입 없이 진행 가능한 상태가 된다.

---

## 8. 30일 실행 캘린더 (제안, 빌드 0 → 출하)

| 구간 | 작업 | 산출물 |
|---|---|---|
| D1~D2 | 갈림길 일괄 패킷 작성 + 오너 서명 | #9, #2 |
| D3~D5 | 결정 원장 + WIP 룰 | #1, #7 |
| D6~D9 | 메일 라우터 + 폴백 | #3 |
| D10~D12 | HANDOFF digest | #4 |
| D13~D16 | `claude/*` 자동 검증 | #6 |
| D17~D22 | 로깅 3종 통합 | #5 |
| D23~D27 | 워크플로우 lifecycle + 골든패스 7 승격 | #8 |
| D28~D30 | 용어 별칭 레이어 + 회고/지표 측정 | §6 P2-3 |

각 구간은 독립 `claude/<slug>` 브랜치 → 자동 검증 → 오너 확인 머지. 한 번에 빌드 0 문서는 2개 이하 유지.

---

## 9. 리스크 · 연속성(Codex) 준수

- 모든 산출물은 **표준 Node/CLI**로 작성, 특정 에이전트 전용 기능 의존 금지(AGENTS.md 연속성 제약 ②).
- 결정·계획은 본 PLAN과 결정 패킷에 문서화(제약 ④).
- 내부 식별자(`monster` 등)는 **유지**하고 평어는 표시 레이어에만 — Codex 이어받기 호환 보호.
- 통합/강등은 **삭제가 아니라 lifecycle 등급 강등 + alias** — 회귀 안전.
- 시크릿은 본 작업 범위에서 열람/이동하지 않음(취급 규칙 유지).
- 단계 끝마다 NIGHT_WORK_HANDOFF 체크포인트(제약 ③).

## 10. 병목 해소 측정 지표 (KPI)

| 지표 | 현재 | 목표(30일) |
|---|---|---|
| 오너 승인 대기 후보 | 11 + 14 | ≤ 5 |
| 메일 라우팅 오너 큐 | 43 | ≤ 10 |
| 연속 "빌드 0" 문서 | 3 | ≤ 2 (룰화) |
| claude 브랜치 머지 리드타임 | 오너/Codex 수동 | 자동 그린 후 확인 머지 |
| 일상용 production_ready 워크플로우 | 0 | 7 |
| 중복 로깅/프리플라이트/소스수집 | 3/2/3 | 1/1/1 |

---

### 부록 A. 근거 파일(감사 출처)
- `AGENTS.md` (연속성 제약, 머지 규칙, 시크릿 규칙)
- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` (후보 승격 규칙, active slice)
- `docs/architecture/foundation/VISION_AND_GOALS.md`, `PROJECT_MAP_V0.md`
- `ui-workspace/apps/dev-erp/docs/MASTER_PLAN_20260613.md`, `DESIGN.md`, `PLAN_P4_HARNESS_20260613.md`
- `_workmeta/system/dev_worker_candidate_queue/*` (후보 11, approved:false 14)
- `.workflow/*/` (validation_level 분포: production_ready 0)
- `guild_hall/` (24 서브시스템), `package.json` (120 스크립트)
- git log 60커밋(기획 12 : feature run 3), 메일 후보 pending 43

> 본 기획안은 owner-review-pending 상태다. 서명/수정 후 `claude/*` 브랜치에서 산출물 1~9를 슬라이스로 구현하며, merge 전 owner/Codex 검증을 거친다.
