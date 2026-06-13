# dev-erp 다음 작업 — 우선순위 (claude_fable-5 판단)

- 작성: 2026-06-13, claude_fable-5. owner "너가 볼 때 중요한 순으로 정해줘. 실동작화는 다른 PC에서 할 것."
- 따라서 이 문서는 **우선순위 + 각 항목의 설계·계약·착수 지점**을 git 브랜치에 남겨, 다른 PC가 pull 받아 바로 이어서 구현하도록 한 것. (실제 서버 기동·실데이터 작업 = 다른 PC)
- 현재 상태: 위젯/IA UX 작업 `claude/widget-freeform` 브랜치 20커밋(main 미병합). node:test 22/22. localhost 파일럿 단계.

---

## 0순위 (선행 정리) — 브랜치 병합 검토

지금까지 위젯·IA·드로어 작업이 전부 `claude/widget-freeform`에 쌓여 main 미병합. 다른 PC가 깨끗한 기준에서 시작하도록 **먼저 합치는 게 맞다.**

- 할 일: owner가 브랜치 diff 검토 → main 병합(또는 squash). push는 owner.
- 위험: 낮음(테스트 통과·UX 검증 완료). MASTER_PLAN(ECount 반영분)은 owner github_up 별도 관리라 병합 대상에서 분리.
- 이 PC에서 가능: 충돌 점검·정리 커밋. 실제 main push = owner.

## 1순위 — 계정·권한 + 계정별 저장 (P2b) ★제품 척추

이게 "개인 도구"를 "팀 ERP"로 바꾸는 핵심. 지금 막힌 고가치 위젯(내 담당·팀원별 부하·결재)과 레이아웃 영속이 전부 여기에 걸려 있음.

- 구성요소:
  1. **계정/로그인**: core_person ↔ 세션. (보안: 비밀번호 입력·계정 생성은 owner가 직접, 자동화 금지)
  2. **계정별 위젯 레이아웃 서버 저장**: 현재 localStorage(`dev_erp_widgets`) → 서버 `user_dashboard_layout{user_id, widget_id, x,y,w,h,collapsed,settings}`. logout 내성.
  3. **RBAC = visible-but-locked**: 메뉴/위젯 가시성(show)과 행동권한(access)을 분리. 권한 없으면 보이되 잠김(ECount 관찰 모델).
- 이 PC에서 가능: 스키마 설계(테이블 DDL 초안)·API 계약(`GET/PUT /api/dashboard/layout`)·RBAC 매트릭스 표 작성. 실 구현·마이그레이션 = 다른 PC.
- 선행: 없음(현 구조 위에 얹기). 다인 쓰기 개방 전 필수.

## 2순위 — '준비 중' 위젯 실동작 승격 (현행 데이터부터)

지금 31슬롯 중 9개만 동작. 데이터가 이미 있는 것부터 켜면 눈에 보이는 진도가 가장 빠름.

- 바로 가능(현 API): **단계 게이트 대기**(/api/guide), **산출물 진행률**(/api/guide 집계), **미분류 메일함**(/api/mail inbox), **마감 캘린더**(/api/items due).
- 계정 후(P2b 의존): 내 담당 할 일, 팀원별 부하, 처리량 추세.
- 이 PC에서 가능: widgetBody 케이스 추가·WIDGET_PLAN ready 플래그 전환(코드만, 서버 기동 불필요로 로직 작성 가능). 실 검증 = 다른 PC.

## 3순위 — 모듈 1개 실구현: 단계 게이트(gates)

좌측 메뉴 12개가 phase 태그 플레이스홀더. SE 워크플로우의 심장인 **게이트(단계 종료 승인)**부터 실제 화면으로.

- 내용: 단계별 산출물 체크리스트 + 게이트 통과 조건 + 통과/반려 기록(event_log).
- 선행 결정: P4 ②(게이트 hard/soft) 필요 → 4순위와 맞물림.
- 이 PC에서 가능: 화면 설계·상태도 초안.

## 4순위 — P4 거버넌스 결정 ②⑧⑨ + 하네스

owner 결정 대기 항목. 결정 전엔 못 나아감.
- ② 게이트 hard(차단)/soft(경고) ⑧ 고아 항목 배정 정책 ⑨ 원문-LLM 경계.
- 이 PC에서 가능: 각 결정의 트레이드오프 1페이지 정리(owner가 고르기 쉽게). 결정 후 하네스 구현.

---

## 권장 진행 순서 요약

**0(병합 정리) → 1(계정·권한 P2b) → 2(준비중 위젯 승격) → 3(게이트 모듈) → 4(P4 결정·하네스).**

근거: 1번이 제품 가치의 척추이자 여러 위젯의 선행조건이라 가장 중요. 단 "실동작화는 다른 PC" 이므로, 이 PC에서는 **1·2·3·4의 설계·계약·코드 로직**을 미리 깔아 두고, 다른 PC는 서버 기동·실데이터·검증만 이어받으면 되게 한다.

## 다른 PC 이어받기 메모 (cross-PC)

- 코드: `claude/widget-freeform` 브랜치 pull. `node --test`로 22 통과 확인 후 `node --watch server.mjs` (localhost:4300).
- 위젯 모델: `static/app.js`의 WIDGET_PLAN(31슬롯, ready 플래그) / widgetBody(본문 빌더) / dashLayout·resolveDashCollisions(겹침해소) / uiConfirm(중앙모달).
- IA: NAV_LAYOUT(객체축 6대분류) / lexicon group_*·tile_*(이중사전, parity 테스트 강제).
- 가드레일: claude는 claude/ 브랜치만(main push 금지) / 사내 데이터 읽기전용·실값 미기록 / 비밀번호·계정생성은 owner 직접.
