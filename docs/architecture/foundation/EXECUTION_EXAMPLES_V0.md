# Execution Examples v0 — 구체 실행 예시 모음

상태: `OWNER_REVIEW_DRAFT` / 주장 상한 `관찰됨`. 이 문서는 정본 결정이 아니다. Owner나 팀이 "이렇게 돌아가면 좋겠다"고 말한 장면을 **누가·무엇을·어디까지** 수준으로 잘라 둔 카드 모음이며, 로드맵의 `다음 후보` 행이 카드 ID를 가리킨다. 카드가 구체화되어 owner 문서로 내려가면 여기서는 포인터만 남긴다. 부품 이름은 `SHARED_GLOSSARY_V0.md` §세계 이름을 따른다.

카드 형식: ID · 제목 · 한 줄 · 장면(단계) · 밖으로 나가는 것 / 안에 남는 것 · 보안 논리 · 검증 · 연결 · 상태·시작 조건 · 출처.

## EX-001 · 슬라이드 형태 보존 외부 저작, 내부 결속

- 한 줄: 발표자료의 **형태**만 밖에 보내 외부 Hearth가 배치·간격을 다듬고, **내용**은 안에서 로컬 Hearth가 끼운다.
- 장면
  1. 팀원 또는 Owner가 World Tree(코드 dev-erp)에서 발표자료 업무 1건을 고른다.
  2. 로컬 Hearth가 실제 PPT를 열어(Computer Use 또는 COM) 슬라이드별 형태를 뽑는다: 글자 수, 그림 수, 자리(placeholder id), 스타일 id. 실제 문장과 그림은 같은 길이·같은 개수의 더미로 바꾼 "형태 사본"을 만든다.
  3. Tongs(코드 dev-erp-mcp)를 거쳐 형태 사본과 요구("슬라이드별 간격·배치·강조를 다듬어라")를 외부 Hearth에 준다.
  4. 외부 Hearth가 슬라이드별 배치·간격·강조 지시를 typed edit로 돌려준다. 새 문장이나 그림을 지어내지 않는다.
  5. Quench가 반환물이 형태 규칙 안인지 검사한다: 글자 수 범위, 그림 수, 허용된 스타일 id만.
  6. 로컬 Hearth가 실제 PPT에 지시를 적용하되 텍스트·그림은 실제 값으로 교체하고 스타일은 지시대로 둔다. 렌더 뒤 넘침·겹침을 검사한다.
  7. 결과는 제출 영수증으로 검토자에게 가고, 사람 수락 뒤 Anvil에 걸린다.
- 밖으로 나가는 것: 슬라이드 형태(글자 수·그림 수·자리·스타일 id·더미 텍스트). 안에 남는 것: 실제 문장·그림·수치·이름·과제 정보.
- 보안 논리: 내용이 아니라 형태만 공개된다. 단 글자 수·그림 수 자체가 정보가 되는 자료(E07 §11 "관측도 새 공개")는 공개 등급 판단을 따로 받는다. 외부 반환물은 데이터이며 실행 권한을 갖지 않는다(Tongs·Quench가 집행).
- 검증: 형태 규칙 검사 통과, 실제 값 결속 뒤 렌더에서 넘침·겹침 0(E05 AF08), 스타일 보존, 사람 수락 1건.
- 연결: 로드맵 `다음 후보` 28, E05 v0.2 WA03(PPT 경로)·AF08·RT02, E07 X3(실행완결 저작원본), plan 11 PPT 봇(Tool Workshop, capacity-1).
- 상태·시작 조건: 아이디어(관찰됨). Tool Workshop PPT 봇 자리와 E05 첫 적격 패키지(G2 WA03)가 열리면 합성 자료로 먼저 시험한다. 실행 예약 없음.
- 출처: Owner 2026-09-05 대화("실제 PPT를 Computer Use로 잘 조절하더라").

## EX-002 · Soulforge 자기 개선 조직의 접수함과 자동 개선 루프

- 한 줄: 세 구성 중 **Soulforge 자체를 개선하는 그룹**(plan 18 §13의 플랫폼·엔진 그룹, 조직 B)이 아이디어·버그 리포트를 한 곳에 받아, worktree에서 고치고 시험하고 검토받아 병합하는 루프를 외부 상용 Hearth로 돌린다.
- 장면
  1. 접수: 아이디어·버그 리포트가 한 접수함에 쌓인다. 저장 위치는 새로 만들지 않고 로드맵 저장 규칙을 따른다: 아이디어는 로드맵 `다음 후보` 한 줄 + 이 문서의 카드, 실행 후보와 버그는 current legacy `_workmeta/system/dev_worker_queue/*.yaml`(`status: proposed`). 채널 후보는 Buzz 봇 DM("버그: …"), Vigil(포트 4192)의 작업 칩, Tongs(코드 dev-erp-mcp)의 제출 도구.
  2. 분류: 개선 그룹의 팀장 역할(Sol급 외부 Hearth)이 접수 건을 읽어 재현 가능 여부·범위·위험을 적고, 지시서(목표·착지점·완료 정의·검증·금지)를 만든다. 오늘 lane A~G의 인수인계문 형식이 그 원형이다.
  3. 착수: 짧은 경로에 worktree 하나를 만들고(`<TARGET_SOULFORGE_ROOT>/dev/model-worktrees/<짧은이름>`, node_modules 정션 공유) 결과물 TASK(Terra급 = Sonnet)가 브랜치에서 고친다. push·main 병합·예약작업·플래그 변경은 금지.
  4. 시험: 그 worktree에서 관련 validator와 테스트를 돌리고, 실패 테스트 먼저(RED) → 수정(GREEN) 기록을 남긴다. 정션 worktree에서 못 믿는 검사(deployment-pack)는 병합 뒤 원 checkout에서 다시 돈다.
  5. 검토: 비작성자 fresh Level 2(Sol급 = Opus/Fable)가 diff·검증 결과·경계를 보고 ACCEPT/REVISE/HOLD. REVISE면 수정 작업자가 고치고 다시 검토.
  6. 병합: 통합 세션이 fast-forward로 main에 얹고 push. CI(Quench)가 초록이어야 다음 접수 건으로 넘어간다. 빨가면 그 단계가 새 접수 건이 된다(오늘 CI 복구가 정확히 이 순서로 8회 돌았다).
  7. 기록: 5필드 캡처와 Level 2 packet, CHANGELOG 항목. 사람 수락이 필요한 것(정책·권한·운영 변경)은 Owner 결정으로 올린다.
- 밖으로 나가는 것: public 저장소 코드·문서(이미 공개), 합성 fixture. 안에 남는 것: `_workmeta`·`private-state` 장부, 호스트 경로, 자격증명, 운영 상태.
- 보안 논리: 작업자는 worktree 안에서만 쓰고 push·병합·운영 변경 권한이 없다. 병합은 검토 뒤 통합 세션 또는 사람이 한다. 외부 상용 Hearth를 써도 되는 이유는 입력이 공개 저장소와 합성 자료뿐이기 때문이다.
- 검증: 접수 → 병합 왕복 1건이 CI 초록으로 닫힌 영수증. 평균 왕복 시간과 REVISE 비율을 센다.
- 연결: `docs/architecture/guild_hall/DEV_WORKER_AUTOMATION_V0.md`(task packet → 검토용 branch), 로드맵 `개발 예정 저장 규칙` 5·6(dev_worker_queue), 자동화 계단(요청 → 5필드 → packet → validator → workflow → dev-worker → scheduler), plan 18 §13 그룹 4, 2026-09-05 lane A~G 운영 기록(CHANGELOG).
- 상태·시작 조건: 아이디어(관찰됨). 수동 원형은 오늘 검증됨(lane 7개, CI 8회). 자동화는 접수함 채널 1개(Buzz 봇 DM 또는 Vigil 칩)와 dev_worker packet 생성기가 생기면 시작. Owner 09-05: "상용 LLM으로 해도 된다."
- 출처: Owner 2026-09-05 대화.
