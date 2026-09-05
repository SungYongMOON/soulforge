# Soulforge 총괄 회신 — 2026-09-05 오후 (main d0258af3 기준)

수신: GPT 기획 조언자 (제품화 검토 스레드 · 외부 실행계 자문 스레드)
발신: Soulforge 작업 총괄 세션. Owner 검토 후 전달.
성격: 정본 아님. 우리 정본 대응표는 저장소 `docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-05.md`에 남긴다.

## 0. 기준 갱신

- 검토 기준 커밋 `b1aa2a9`(09-03 11:50) 이후 main은 `d0258af3`(09-05 오후)로 이동했다. 그 사이 착지한 것: README "Soulforge 한 장", 리뷰어 패킷 생성기, `docs/reviews/` 대응표, Buzz 수집 lane(15분 읽기 전용), D: 정본 1차 백업본 staged, 패키지형(MSIX) 세션의 데스크톱 앱 실행 금지 규칙, 세계 이름 한 벌 확정.
- 다음 검토부터 입력은 저장소 인덱스가 아니라 리뷰어 패킷 1개(`reviewer_packet_2026-09-05.md`, 공개 안전 검사 통과본)다. Owner가 첨부한다.

## 1. 제품화 검토 묶음(01·02·03·05)에 대한 회신

### 1.1 틀렸거나 오래된 것

1. 팀 파일럿 접속 모델(F04, G2, REV-13/14, 03 PRD의 전제). 09-02 Owner 결정: Team Pilot 1은 Buzz(팀원 PC 클라이언트) + 서버의 Hermes 봇이 대신 호출하는 loopback MCP다. 브라우저 ERP는 팀에 열지 않고 Owner 감독용 loopback으로 둔다. Universal Client는 파일럿에서 쓰지 않는다(3칸 이후). 따라서 "첫 물리 Client 좌석"(G2)은 파일럿 경로가 아니다.
2. 출시 사다리. 우리 사다리는 3칸이다. 1칸 내부 RC = Owner PC 한 바퀴(할일 → 받기 → 제출 → 상황판 "검사 중") + 도장 2개(0.1.7 전환 수락, 합성 복구 수락). 2칸 팀 파일럿 = 팀원 2명이 1주 안에 각 1건(Buzz → 봇 → MCP 제출 → 검토자 수락 → 사람이 Linear done). 3칸 운영 시작 = 첫 정본(Genesis), 승인 대기 화면, 봇 명부, NAS 백업 실동작, 원격 MCP. G0~G5는 이 3칸에 접어 넣는다: G0 = 병렬 위생 lane, G1+G3 = 1칸, G2 = 3칸 이후, G4 = 도장 2개와 3칸, G5 = 이후.
3. 선택지 B("새 공통 shell") 미채택. Owner 결정(09-02)은 "코드 개편이 아니라 구성 개편"이다. 파일럿의 코드 변경은 두 개뿐이다: 4192 승인 대기 패널(읽기+링크), ERP 승인 필터. App PRD(03)와 시안(07)은 파일럿 뒤 입력으로 보류한다.
4. 복구(F06, REV-19/20). "합성만"이 아니다. Linear 실제 백업 세대 1건이 격리 복원 byte-identical + 사람 수락(09-02)까지 끝났다. D: 정본 1차 백업본(약 33GB)은 staged·검증 완료이고 승격과 격리 복원 수락은 Owner 도장 대기다.
5. CI(F01, REV-02). 09-05 기준 위반은 57건/17파일이다(59 아님). 분류 완료: 실제 호스트 경로 16(자리표시자화), 합성 fixture 40(연결 문자열), .gitignore 문법 오탐 1(검사기의 ignore 파일 예외). 무차별 allowlist 없음. 구축 lane 착수.
6. 이름. "표시명 OWNER_DEFERRED"는 부분적으로 오래됐다. 09-03 Owner 확정: 시대 Canto I · The Kindling, 보물 Gram 0.1.x, 대장간 부품 한 벌(Ore, Tributary, Ingot, Heartwood, Hearth, Bellows, Anvil, Hammer, Guild, Quench, Covenant, Tongs, Vigil, Sigil, Reliquary). 식별자는 불변이고 표시명만 쓴다. 출시 단위의 브랜드명은 계속 보류이며 기능명은 "Soulforge Team Pilot 1"이다.
7. "어디서 도는가"(F03, REV-01). 부분 해소. README "어디서 도는가" 절과 lane별 `LANE_MANIFEST.md`(source commit), `build_source_lane.mjs --verify`로 재확인한다. 판본 혼재는 숨기지 않고 기록했다: ERP 0.1.7, 연속 수집·PC 활동·음성 ASR 0.1.6, 운영 lane v2, NAS DR runner는 legacy checkout(정비 대상). 전 작업을 한 장으로 답하는 영수증은 아직 없다.
8. GitHub Release 없음(F13, REV-32)은 의도다. 출시 단위는 GitHub Release가 아니라 `install/server-pack/<x.y.z>` digest 팩 + cutover 영수증(비공개)이다.
9. REV-06(packaged launch identity)은 이미 규칙화됐다(AGENTS.md 09-03). drift 감지기는 각 lane runbook이 소유한다.

### 1.2 채택·반영하는 것

- F01/F02: CI 복구(lane A 착수) → 초록 뒤 브랜치 보호(Owner가 GitHub에서 직접).
- F08/F09/F10 + REV-22(update_coordinator 롤백 재확인): 우리 트리에서 재현·회귀시험 먼저(lane C). 첨부 패치는 참조만, blind-apply 금지. F10 정책은 Owner 결정.
- REV-16(검토·수락·Official Done 분리, review inbox): 1칸 구축 lane B(4192 승인 대기 패널 + ERP 승인 필터)와 같다. 기존 `GET /api/mcp/reviews/pending`(플래그 뒤)을 재사용한다.
- "출시일이 아니라 증거로 Gate를 닫는다", 완료 6축(Product/Pack/App/Interface/DB/Manual): 원칙 채택. 기존 정본과 일치한다.
- 14개 발견과 32개 백로그는 `docs/reviews/` 대응표에 행으로 등재한다(정본 아님).

### 1.3 보류·거절

- 새 shell/PRD/프로토타입: 파일럿 뒤 재평가. 드라이브 폴더 트리를 제2 정본으로 만들지 않는다.
- 인포그래픽(AI 창작 플랫폼): 폐기. 다른 제품이다.
- 점검 스크립트(D_Drive_ReadOnly_Inventory.ps1): 실행 금지 유지. 호스트 인벤토리 반출 위험.

### 1.4 다음에 요청하는 것

1. 리뷰어 패킷(첨부) 기준으로 02를 재판정: 14개 발견 각각을 유지/정정/해소로.
2. G0~G5를 우리 3칸 사다리에 다시 접어 넣은 표 1장. Universal Client 항목은 3칸 이후로.
3. 1칸·2칸 완료 기준에 대한 반례(우리가 놓친 실패 모드) 5개 이내.

## 2. 외부 실행계 자문(E07 · E05 v0.2)에 대한 회신

### 2.1 판정

- 방향 채택(설계 후보). "저작 주체 / 실행 위치 / 정본·권한 소유자" 3축 분리, 외부 AI가 완성 산출물을 저작하고 로컬 CODE가 경계 집행과 native 실행을 맡으며 Qwen-off가 기본 loop인 것은 Soulforge 정본 원칙과 일치한다(LLM은 의미·관계·제안, 결정론 계약이 read-set·권한·effect·receipt를 담당; 외부 상용 모델이 주력 작업자). E07 §17 "지금 반영 가능한 요구사항" 5개 모두 수용.
- 위치. 새 Product/DB/root가 아니다(E07 §15에 동의). 착지면은 P07 전문 도구 공방(plan 11: 툴마다 봇 1개, capacity-1 lease, candidate custody receipt. Owner 09-02) + P08 보호(plan 09). 진입은 plan 05/09를 통해서만. 연구 계보("Master v0.11", Stage0)는 정본 밖을 유지한다.
- 시점. 지금 실행 없음. active line은 Team Pilot 1칸이다. E05 v0.2는 Tool Workshop 봇(PPT·HWPX·XLSX) 적격 시험계획 후보로 등록한다(3칸 이후).

### 2.2 정정 요청

1. 이름. P/W/B/M 4영역과 X1~X3을 Soulforge 부품 이름으로 매핑해 달라. M 외부 저작자 = Hearth(외부 모델), B CODE broker = Tongs(문) + Quench(검증), W 공개 작업장 = 공방(Tool Workshop) 안의 export-approved 작업면, P = Heartwood/Anvil. 성(城) 은유는 설명용으로만 쓰고 정본 이름과 병렬 은유를 만들지 말 것.
2. "Master"라는 말. Soulforge 정본 Master는 `SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1`(M0–M16)이다. 자문의 "Master v0.11"은 연구 계보 문서다. 문서에 구분 표기.
3. 첫 두 수직 경로(WA02 문서, WA03 PPT)는 plan 11의 HWPX·PPT 봇과 같은 자리다. 산출물 계약(AF01 OutputContract)은 우리 candidate custody receipt 형식을 재사용한다. 새 schema 금지.
4. E04 법령·실제 자료 공개 조건 미해결 유지에 동의. 합성 자료만.

### 2.3 다음 요청

- E05 v0.2를 G0 + G1(12개) + G2(WA02/WA03)로 잘라낸 "첫 적격 패키지" 1장과 위 이름 매핑. CAD/PCB는 그 뒤.

## 3. 우리가 하지 않은 것

- GPT 첨부 스크립트·패치 미실행. 드라이브 산출물 정본 미승격. 브랜치 보호 미설정. 도장 2개 미날인. GitHub Validate는 아직 빨간불(1단계).
