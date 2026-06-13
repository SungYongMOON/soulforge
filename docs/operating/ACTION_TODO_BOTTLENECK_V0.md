# 해야 할 일 — 병목 해소 액션 리스트 V0

> 상태: owner-review-pending · 빌드 0 (지금은 계획·결정만)
> 작성: claude_fable-5 · 2026-06-13
> 근거: `docs/architecture/foundation/BOTTLENECK_BURNDOWN_PLAN_V0.md` + 머스크식 SE 리뷰 + 오너 피드백 반영
> 핵심 수정점: "워크플로우를 다 지운다" → **"먼저 카탈로그(목록화), 지우는 건 그다음"** (오너 판단 반영)

---

## 0. 한 줄 원칙

> 더 만들지 말고 — **보이게 하고(카탈로그) · 통과점을 분산하고(self-merge) · 승인은 위험별로만 남긴다.**
> 지우기 전에 "이게 왜 있는지" 이름과 이유부터 붙인다. 이유를 못 붙이는 것만 나중에 치운다.

---

## A. 오늘 (무료·즉시·되돌리기 가능)

- [ ] **A1. 워크플로우 카탈로그 한 장 만들기** — `.workflow/` 64개가 각각 뭘 하는지 1줄씩 색인. 분류 라벨만 단다: `매일쓸 / 가끔쓸 / 안쓰는듯 / 모르겠음`. **아무것도 안 지움.** (→ "뭐가 있는지 몰라서 못 쓰는" 문제부터 해소)
- [ ] **A2. 머지 규칙 1줄 교체** — AGENTS.md: "Codex 외 AI는 owner/Codex 검증 후 merge" → **"`node --test` + `npm run validate` 그린이면 self-merge 가능. `schema`/`secret`/`external` 라벨이 붙은 변경만 owner가 코멘트 한 줄로 ack."** (← single-integrator를 깨는 핵심 한 줄)
- [ ] **A3. 승인 기준표 채택** — `docs/operating/APPROVAL_TIER_POLICY_V0.md`의 저/중/고 위험 tier를 1회 서명. 저위험은 승인 개념 제거, 고위험만 유지.
- [ ] **A4. WIP 룰 구두 확정** — "미출하(빌드 0) 기획 문서는 동시 1개까지. 새 기획 전에 기존 기획 1개를 출하 슬라이스로 전환." (스크립트 안 만듦, 규율로 시작)

> A1~A4는 코드 빌드 0줄. 여기까지로 병목의 큰 덩어리가 풀린다.

## B. 이번 주 (가벼운 정리)

- [ ] **B1. 카탈로그 보고 "안쓰는듯"만 `_attic/`으로 이동** — 삭제 아님, `git mv`. 오너가 직접 고른 것만. 되돌리기 1줄.
- [ ] **B2. 중복 1개씩만 남기기** — 로깅은 `activity` 하나(또는 dev-erp `event_log`)로 수렴, 프리플라이트 2→1. 나머지는 attic.
- [ ] **B3. 골든패스 README 1장** — 팀이 매일 쓸 6개 워크플로우 "안전하게 쓰는 법" 한 페이지. (lifecycle 필드 같은 거 추가 안 함)

## C. 2주 (여기서부터 빌드 — 출하 강제)

- [ ] **C1. 메일 자동 라우터** — 발신자/도메인 → `project_code` 규칙표. 미매칭만 오너 큐. (적체 43 → ≤5)
- [ ] **C2. `claude/*` 자동 검증** — GitHub Actions 1개(`node --test` + `validate`). A2의 self-merge 게이트 실체화. 표준 Node = Codex 호환.
- [ ] **C3. dev-erp P2b 구매/발주 1슬라이스 실제 출하** — 더 기획 금지. "빌드 0" 연쇄를 코드로 끊는다.

## D. 버리지 말 것 (코어 — 손대지 않음)

- `event_log` 단일사실 모델 (dev-erp)
- dev-erp "진실 1(core) + 뷰 2(업무/전장)" 아키텍처
- Codex 비종속 하네스(표준 Node/CLI) + AGENTS.md 단일 정본
- `_workmeta` run truth / public·private 보안 경계
- 연속성 장치: `long_thread_handoff_v0`, `post_development_review_gate_v0`

---

## 측정 지표 (병목 풀렸는지 확인)

| 지표 | 현재 | 목표(30일) |
|---|---|---|
| 오너 승인 대기 후보 | 11 + 14 | ≤ 5 |
| 메일 라우팅 오너 큐 | 43 | ≤ 10 |
| 연속 "빌드 0" 문서 | 3 | ≤ 1 (룰화) |
| claude 브랜치 머지 | 오너 수동 | 그린 시 self-merge |
| 팀이 매일 쓰는 진입점 | 0 | 6 (카탈로그+README) |

> 다음 액션 후보: A1 워크플로우 카탈로그를 Claude가 바로 생성 가능.
