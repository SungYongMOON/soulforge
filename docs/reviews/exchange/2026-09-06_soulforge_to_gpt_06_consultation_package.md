# Soulforge 총괄 → GPT 재자문 패키지 06 — 2026-09-06 저녁 (스레드 2개, 문서 링크만)

수신: GPT 기획 조언자 두 스레드(제품화 검토 스레드 · 외부 실행계 자문 스레드). 발신: Soulforge 작업 총괄 세션,
Owner 검토 후 전달. 기준 커밋 `09df4945`. 판본: 6차. 이 문서는 판정 회신이 아니라 **"다음에 봐 줄 것"의
목록**이다. 정본 표는 [`../EXTERNAL_REVIEW_MAP_2026-09-06.md`](../EXTERNAL_REVIEW_MAP_2026-09-06.md)(EXT-19~34,
CE-06), 직전 회신은
[`2026-09-06_soulforge_to_gpt_05_forge_world_reply.md`](2026-09-06_soulforge_to_gpt_05_forge_world_reply.md).

규칙(Owner 2026-09-06 저녁): GPT 쪽은 채팅이라 본문을 붙여 넣지 않는다. 읽을 것은 GitHub blob(커밋 `09df4945`에
고정)과 드라이브 사본 링크로만 준다. 답은 드라이브 제안함(`Soulforge_기획·검토`)에 문서로 받는다. 판정 형식은
종전과 같다: 질문마다 한 줄 판정(동의 / 정정 / 반대) + 근거 2줄 + (있으면) 고칠 문장 1개, 마지막에 "가장 먼저 고칠
것 1개". 새 키는 제품화 스레드 EXT-35부터, 자문 스레드 CE-07부터 이어 쓴다. 새 폴더·번호 체계·패치·스크립트는
만들지 않고 문서의 절 번호(§)와 로드맵 단위 번호(1-1 … 4-3)만 참조한다.

## 0. 공통 머리말 (두 스레드 공통)

- 역할: 당신은 외부 기획 조언자다. 결정권은 Owner에게 있고, 당신은 판정과 근거를 준다.
- Soulforge 한 줄: 소나 개발 회사의 내부 운영 체계. World Tree(코드 dev-erp, 포트 4300)가 정본(ERP)을 갖고,
  Vigil(team-ops-board, 포트 4192)이 읽기 전용 감시 화면이며, 집게(Tongs, dev-erp-mcp, 포트 4311)가 봇·팀원이
  드나드는 유일한 MCP 문이다. Hermes/Buzz 봇(강도담 등)이 스킬로 일을 하고, Rune(engineering_engine)이 "무엇을
  해야 하는가"의 판정 authority를 가진다(LLM은 Task를 만들지 않는다). 결과는 언제나 후보이고 사람이 수락해야
  정본이 된다.
- 볼 수 없는 것: Owner PC의 사설 자료면·예약작업·토큰. 문서의 관측값은 2026-09-06 기준이며 없는 값은 UNKNOWN이다.
  추측으로 메우지 말고 UNKNOWN을 지적해 달라.
- 오늘 바뀐 것 4줄: (1) 저장소 main `09df4945` — Rune task hierarchy 계약 v1(candidate)이 저장소에 들어갔고,
  Vigil 디자인 시스템 S1과 소나 인텔 Goal #1 앱(포트 4420)이 병합됐다. (2) 요청서 접수 ↔ Rune 업무 결속 계약을
  문서로 고정했다(회신 05 §b). (3) 설계 문서는 §5f(Rune 매칭)가 있는 v2 사본이 정본이다. (4) Owner 새 지시:
  토폴로지 화면은 모듈 단위가 아니라 기능·구성 그룹 단위로 보인다(UX 지시서 §11).

## 1. 제품화 검토 스레드 — 봐 줄 것 5묶음 (이 순서로, 묶음마다 답 문서 하나)

### 1.1 먼저: 회신 05 재판정 (EXT-19~34 후속)

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| 회신 05(§a~§c·§e·§f가 이 스레드 몫) | 커밋 1b546583 | https://github.com/SungYongMOON/soulforge/blob/09df4945/docs/reviews/exchange/2026-09-06_soulforge_to_gpt_05_forge_world_reply.md |
| 대응표 EXT-19~34 | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-06.md |
| 접수 ↔ Rune 결속 계약 v0 | 드라이브 | https://drive.google.com/file/d/1PrJvEdyjP3joCk-gVxH7A52MEjhFmIgJ/view |
| 대장간 세계 설계 v2(§5f 포함) | 드라이브 | https://drive.google.com/file/d/1gEZLWxTvxrQu7-ZP5jvJR7Tirtd-EGtX/view |

질문 3:
1. 회신 05 §b의 계약 8줄이 EXT-20·EXT-27("요청서에 쓰기 권한이 딸려 보인다")을 닫는가. 남는 구멍이 있으면 어느 줄에.
2. 설계 v2 §5f(Stage → Work Package → Task → Step → Action, 세계의 방 = Rune Task의 표시)가 Owner 구현계획 v0.1
   §15~§18과 어긋나는 곳(1차 판정은 §5f가 없는 v1 사본을 읽은 것이었다).
3. 회신 05 §a의 판정 요약(정정 수용 12 · 동의 3 · 일부 수용 1)에서 우리가 잘못 읽은 항목.

### 1.2 3단계: 작업대 명세 · 세계 어댑터 명세

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| `SPEC_WORKBENCH_INTAKE_V0` (작업대: 요청서 스키마·저장·상태기계·실행 경로·후보 회수·화면·경계 검사·시험·커밋 계획) | §12 총괄 답 + §13 GPT 반영 포함 | https://drive.google.com/file/d/1vHsqLEXulvFTEyKweTWLM1OhHTyCMnlu/view |
| `SPEC_FORGE_WORLD_ADAPTERS_V0` (세계 어댑터: world-state 계약·어댑터 4종·결정론 배치·줌 4단·성능 예산·모듈 분할·견본 정책) | §12 + §13 포함 | https://drive.google.com/file/d/1qwWUL0oeG1GjVqkj9eqhqAZw2CjVsRsJ/view |
| 접수 ↔ Rune 결속 계약 v0 (두 명세의 §13이 이 계약을 전제) | 드라이브 | https://drive.google.com/file/d/1PrJvEdyjP3joCk-gVxH7A52MEjhFmIgJ/view |

질문 6:
1. 요청서 스키마에서 빠진 필드나 위험한 필드(원문·경로·비밀이 새어 들어갈 수 있는 곳).
2. 요청서 상태기계가 secure_work의 19상태·candidate_execution 경로와 충돌하는 지점.
3. 어댑터의 fail-closed 의미(값 없으면 안개, 조용한 초록 금지)가 깨지는 경우.
4. 배치 결정론(과제 코드로 고정)이 과제가 늘거나 제품군이 바뀔 때 깨지는 경우.
5. 성능 예산(Canvas 2D, 건물 300개에 프레임당 2ms 이하, 라이브러리 0)이 비현실적인 부분.
6. 두 명세의 커밋 순서에서 서로 의존이 꼬인 곳.

답에 꼭: 명세마다 "구현자가 추가 설계 없이 착수 가능한가" 예/아니오와 막는 이유 1개.

### 1.3 4단계: Rune 파츠 그래프 Phase 0 — 브리프 + 저장소에 들어간 계약 v1

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| `RUNE_TASK_GRAPH_PHASE0_BRIEF` (계층 계약·불변 규칙 v0·파츠 분류표·투영·fixture·시험 매트릭스) | §15 총괄 답(row 3 위치 정정 포함) | https://drive.google.com/file/d/1qRvy0QMJ2hyG4zPW78GGyvsp8QOK3CW3/view |
| `task_hierarchy_v1` 계약 문서(candidate, 정본 아님) | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/guild_hall/engineering_engine/engines/systems_engineering/contracts/task_hierarchy_v1.md |
| 같은 계약의 JSON Schema | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/guild_hall/engineering_engine/engines/systems_engineering/schemas/task_hierarchy_v1.schema.json |
| Owner 구현계획 v0.1 §15~§18 | 드라이브 Google Doc `Soulforge_맥락·메모리·그래프·온톨로지_구현계획_v0.1` | (이미 공유된 문서) |

질문 8:
1. 계층 계약이 Owner 문서 §16.4(담당자·산출물·차단·승인·인계가 필요한 것만 Task)를 어기는 곳.
2. 불변 규칙 v0에서 빠진 "방식과 무관한 필수" 항목(소나 개발 현장 기준).
3. 불변 규칙을 precondition/completion으로 표현할 때 "워크플로를 정본으로 굳히는" 실수가 스며드는 지점.
4. project_task_graph.v1이 요구 추적 모델 §4(채택/보류 기법)와 어긋나는 곳.
5. 합성 fixture가 놓친 현실 사례(부품 대체, 재작업, 발주 취소).
6. Phase 0 범위가 너무 크거나 작은가 — 커밋 하나로 줄인다면 무엇.
7. 계약 v1의 `blueprint_ref`가 null이면 Task 상태가 `WORKFLOW_GAP`이어야 한다는 규칙과, 판본 접미사 없는
   워크플로 7건이 `blueprint_ref`를 발급받지 못한다는 규칙(§6)이 "워크플로를 정본으로 굳히지 않는다"는 원칙과 맞는가.
8. `rune_task_id = task:<stage_code>:<artifact_type_id>` 결정론 발급이 다중 Work Package 연결·재작업(같은 산출물
   2회)·산출물 대체에서 깨지는 경우와 대안.

### 1.4 6단계: 소나 인텔 Goal #2/#3 (Goal #1 앱은 저장소에 있음)

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| `BRIEF_SONAR_INTEL_GOAL2_GOAL3` | §12 총괄 답(포트 4420) + §13 GPT 반영 포함 | https://drive.google.com/file/d/1kaaZgaSf7s0nC85NfoVuBg0Cl6FhtQ3L/view |
| 소나 인텔 마스터플랜 v1 | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/ui-workspace/apps/sonar-intel/docs/SONAR_INTEL_MASTER_PLAN_V1.md |
| Goal #1 앱 README(수집·저장·화면의 실제 범위) | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/ui-workspace/apps/sonar-intel/README.md |

질문 5:
1. 지표 8개의 공식이 자료 편향(영문 논문·뉴스 위주, 방산 비공개)을 어떻게 왜곡하는가, 보정안.
2. 공출현 그래프를 Node로 구현(라이브러리 0)하는 선택이 무리한가, 대안.
3. 특허 소스(EPO OPS·KIPRIS)의 약관·한도 위반 위험.
4. "예측"을 화면에 점수로 보이게 할 때 사용자가 오해할 지점과 표기 규칙.
5. Goal #2 → #3 → 화면 순서가 맞는가, 아니면 화면을 먼저.

### 1.5 6b단계: UX/UI 전면 재검토 (§11 토폴로지 그룹 표시 지시 포함)

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| `BRIEF_UX_REDESIGN_V1` (화면 감사·원칙 10·디자인 토큰·정보 구조·GraphRAG 식 표현 5곳·시안 7·이행 S1~S8) | §9 총괄 답 + §10 S1 검토 반영 + §11 Owner 지시 포함 | https://drive.google.com/file/d/1G7EqKncZke8H-ptn38LsTCLGsmfqLbC3/view |
| 디자인 시스템 S1 단일 원천(구현됨) | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/ui-workspace/apps/team-ops-board/src/design/design-system.mjs |

질문 6:
1. 토큰 체계(색 역할·도형 어휘·글꼴 2벌)에서 빠졌거나 과한 것.
2. 그래프 5곳 중 그래프가 오히려 해가 되는 자리(B8 겹침 지도 재발 위험).
3. "후보는 점선·상충은 빨간 간선·자동 병합 없음" 규칙이 화면에서 깨지는 경우.
4. World Tree 화면 처분(판타지 스킨 폐기, 자원 관리 HOLD 접기)의 부작용.
5. 이행 순서 S1~S8에서 경계 테스트(읽기 전용 4항목)를 지키기 어려운 단계.
6. §11 그룹 표시 규칙(공급자 → 패키지·기능 묶음 → 펼치면 모듈, 그룹 상태 = 구성원 최악값 + 개수 배지, 그룹은
   경로 접두사에서 파생)이 §5의 5곳과 충돌하는 곳, 최악값 집계가 오판을 내는 경우.

## 2. 외부 실행계 자문 스레드 — 봐 줄 것 3묶음

### 2.1 훈련 코퍼스 v0.1 답 (CE-06 후속)

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| 회신 05 §d(훈련 코퍼스 — 질문 답과 다음 요청) | 커밋 1b546583 | https://github.com/SungYongMOON/soulforge/blob/09df4945/docs/reviews/exchange/2026-09-06_soulforge_to_gpt_05_forge_world_reply.md |
| 대응표 CE-06 행 | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-06.md |

우리 답(문서가 정본): Q1 = C안(공개 프로젝트 기반 + 가상 고객·계약·변경·시험실패·회의록의 6개월 revision),
Q2 = 산업용 DAQ·초음파 계측장치, Q3 = OpenTitan UART부터. T2a 합성 source = LAB01, 보안 canary(B1~B8) = LAB03,
LAB02는 이번 사이클 미사용.

요청 3:
1. C안 첫 프로젝트의 골격 — 6개월 revision 달력 + 산출물 목록 + 심어 둘 함정 목록(정답은 `30_EVALUATOR_ONLY`에).
2. LAB03 5종(이름 치환 노출·known-anchor 수치 복원·affine known-pair·graph fingerprint·누적 공개)을 B1~B8·CE-01~05
   검사 단계에 붙이는 방법 — 입력 형식·판정 기준·통과선. CE-03의 서버측 self-accept 강제가 아직 미구현인 상태를
   LAB03 시나리오가 어떻게 다루는지 포함.
3. LAB01을 T2a 합성 source로 쓸 때 형식·분량·익명화 수준(우리 canary 입력 규격에 맞는지).

### 2.2 5단계: 사이클 시험 사다리 runbook T1~T3 — 안전 검토

| 문서 | 판본 | 링크 |
| --- | --- | --- |
| `RUNBOOK_TRIAL_LADDER_T1_T3` (집게 등록 → T1 읽기 → T2a 합성+외부 1회 → T2b 실자료 1건 → T3 메일 초안·승인·발송) | §8 총괄 답 + §9 EXT-23·24 반영 포함 | https://drive.google.com/file/d/1WdfSVbwDq5Tnr3w4eXgQ9DShuH_Th-Gg/view |
| 보안 작업 사이클 v0(19상태·M01~M10·permit·B1~B8) | 커밋 09df4945 | https://github.com/SungYongMOON/soulforge/blob/09df4945/docs/architecture/guild_hall/SECURE_WORK_CYCLE_V0.md |

질문 6(안전 우선):
1. 원본이 외부로 나갈 수 있는 경로가 한 곳이라도 남아 있는가(패킷·로그·오류 메시지·모델 컨텍스트 포함).
2. permit(1회용·만료·신뢰 키 서명)이 우회되는 시나리오.
3. T2b 실자료 승인 전 체크리스트(B1~B8)에서 빠진 항목.
4. T3 메일 발송에서 "새 발송 권한 0"이 지켜지는지, Outlook COM 경로의 위험.
5. 중단선이 늦게 발동하는 칸(사고 뒤에야 걸리는 검사).
6. 이 runbook을 Owner가 5분 체크리스트만 보고 안전하게 수행할 수 있는가.

### 2.3 사이클 2호(외부 전송·보관 실구현) 설계 전 질문

배경: 1호는 scripted-only다(M06 외부 전송과 M10 보관이 stub, live 비활성). 2호는 그 둘을 실구현하며 Level 3
검토 대상이다. 문서는 위 `SECURE_WORK_CYCLE_V0` 하나로 충분하다.

질문 4:
1. M06 실전송 프로세스 안에서 permit을 다시 검증하는 구조(서명 검증·1회용·만료·route commitment 대조)의 최소 요건.
2. 외부 응답을 QUARANTINE에 둔 뒤 M08 복원이 외부 응답 속 프롬프트 주입(원문 요구·경로 요구·추가 전송 유도)을
   걸러내는 검사 목록.
3. M10 보관 ingress(집게, 포트 4311)에서 ACK 유실·중복 제출을 다루는 멱등 규칙(같은 job·같은 bytes·다른 bytes).
4. 시험용 신뢰 키쌍(BIND09)을 운영 키로 바꾸는 절차와 "열쇠 4개는 Owner만 배치"가 깨지는 경로.

## 3. 붙여 넣기 문구 (링크만 — 이 문서를 읽으라는 한 줄)

이 문서는 드라이브 제안함 폴더 `ChatGPT_제품기획실_20260905`에 같은 이름으로 올라가 있고, 같은 내용이 저장소
`docs/reviews/exchange/2026-09-06_soulforge_to_gpt_06_consultation_package.md`에도 커밋돼 있다. 붙여 넣기는 링크와 한 줄만.

A. 제품화 검토 스레드:

```
[재자문 패키지 06 — 2026-09-06 저녁] 다음에 봐 줄 것을 문서 하나로 정리했습니다. 링크의 문서를 읽고 §1을 1.1부터 순서대로, 묶음마다 답 문서 하나씩 드라이브 제안함에 올려 주세요. 키는 EXT-35부터.
문서: <드라이브 링크> (같은 문서 GitHub: <blob 링크>)
```

B. 외부 실행계 자문 스레드:

```
[재자문 패키지 06 — 2026-09-06 저녁] 훈련 코퍼스 답(CE-06)과 다음 요청, 사이클 시험 사다리 안전 검토, 사이클 2호 설계 전 질문을 문서 하나로 정리했습니다. 링크의 문서에서 §2만 읽고 2.1부터 순서대로, 묶음마다 답 문서 하나씩. 키는 CE-07부터.
문서: <드라이브 링크> (같은 문서 GitHub: <blob 링크>)
```

## 4. 회신을 받은 뒤 우리가 하는 일

1. 회신 문서를 제안함에서 받아 `docs/reviews/EXTERNAL_REVIEW_MAP_<date>.md`에 대응표 행 추가(EXT-35~, CE-07~).
2. "정정"은 해당 문서에 한 줄 정정(원문 보존, 정정 표시), "반대"는 Owner 결정 항목으로 올림.
3. 첨부 스크립트·패치는 우리 트리에서 재현 전 실행·적용 금지.
4. 반영 뒤 회신 07을 같은 폴더에 커밋·push하고 blob URL을 다음 붙여 넣기 머리에 붙임.
