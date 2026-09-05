# Team Pilot Access and Release Plan v0 — Buzz + Bot-mediated Tongs(MCP 문) 모델

> Status: `OWNER_REVIEW_DRAFT` / `canon_candidate` / claim ceiling `observed` — suite state, owner decisions, and claim rules are governed by [00_MASTER_INDEX_AND_DECISIONS.md](00_MASTER_INDEX_AND_DECISIONS.md).

| 항목 | 값 |
| --- | --- |
| 기준일 | 2026-09-02 |
| 결정 출처 | Owner 대화(2026-09-02): 팀원 접속 경로는 Buzz와 MCP, 서버 PC에는 Buzz 서버와 Hermes 봇, World Tree(코드 dev-erp, 포트 4300)에는 MCP를 통한 정본만, 결과 등록 뒤 Linear 상태 변경, 작업 과정은 MCP로 정리해 함께 제출 |
| 관계 | [05](05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md) 팀원 journey·MCP 최소 v0, [07](07_BUZZ_HERMES_COLLABORATION.md) Buzz/Hermes 협업 계약, [12](12_DEPLOYMENT_ROLLOUT_SUPPORT.md) rollout ring, [16](16_OPERATIONS_RUNBOOK_CATALOG.md) manual 역할, Master Map M6·M10·M16, `SOULFORGE_VOICE_FIRST_BOT_AGENT_OPERATING_MODEL_V0_2.md` |
| 비권한 | 이 문서만으로 서비스·connector·credential·writer·Linear 쓰기·network listener·Buzz 프로젝트·Hermes profile을 만들거나 켜지 않음 |
| 우선순위 | 현 active slice(read-only AX·SE Engine)와 D: staged migration을 바꾸지 않는 adjacent release-planning lane |

## 1. 한 줄 결정

> 팀원은 **Buzz(각자 PC의 클라이언트) + MCP(서버 PC의 Hermes 봇이 대신 호출)**로 Soulforge를 쓴다. 브라우저 World Tree는 팀에 열지 않고 Owner 감독용 loopback으로 둔다. World Tree에는 수락된 정본만 MCP로 들어가고, 결과 등록은 제출 영수증이며 Linear `done`은 사람 수락 뒤에만 온다. 작업 과정은 원문 대화가 아니라 5필드 요약과 참조로 결과와 함께 제출한다.

## 2. 정본 대조 — 유지 9, 교정 1

| Owner 문장 | 정본 | 판정 |
| --- | --- | --- |
| Buzz를 창구로 쓴다 | 07: Channel=지시·협업 source, Project=협업·접근 scope, Project Git=증거 제출면; 재기준 §10 Buzz=External Collaboration Adapter+Agent deployment surface | 유지 |
| 팀원 PC마다 Buzz 클라이언트 | `ui-workspace/apps/soulforge-universal-client/README.md` "Buzz remains a separately installed collaboration client" | 유지 |
| 서버 PC에 Buzz 서버 + Hermes 봇 | 07·06: Hermes=bounded gateway/profile/runtime adapter; Bot Chat이 canonical 통로(AI_ORG §Codex→Hermes) | 유지 |
| 각자 Linear에서 업무 인지 | 00: Linear = current Official Task SoR | 유지 |
| 각자 Codex에서 MCP로 필요한 것 받기 | 05: 팀원은 assignment에 허용된 accepted input-bundle manifest/revision만 내려받음; MCP JSON은 bytes를 싣지 않고 ticket→authenticated HTTPS | 유지(bytes는 data plane) |
| NAS에서 받기 | Path Registry: NAS source asset ≠ NAS backup target; `source.nas` row `HOLD` | 유지하되 열람용(§9) |
| World Tree에는 정본만, MCP로만 | W-AUTH·Genesis·target `_workspaces` accepted-bytes-only; MCP=query/control/result/evidence/receipt interface | 유지 |
| 받는 것도 MCP·Buzz 봇으로 | 05 journey 3단계 | 유지 |
| 작업 과정을 MCP로 정리해 함께 넣기 | 5필드(`bounded_work`), `soulforge.ai_work_record_event.v1`, `erp_publish_work_session`(dev-erp-mcp) | 유지(§8 형식으로) |
| **결과물을 등록하면 Linear가 done으로 변경** | World Bible 불변법칙 2(Agent Done·delivery receipt·review·human acceptance·Official Done 상호 대체 금지); Grill #5·M16 제외범위(Linear 자동변경·자동 Official Done 제외); 07 "Git commit, AgentRun success, verified candidate, Human Acceptance, Official Done never substitute for one another" | **교정**: 등록 = 제출 영수증. `done`은 독립검토 → 사람 수락 → 지정 sole writer 순서. 파일럿에서는 사람이 Linear에서 직접 `done`을 누르고, 자동화는 Linear writer Gate 뒤 |

## 3. 흐름

```text
[팀원 PC]  Linear에서 할일 인지 ──▶ Buzz 채널/봇에 지시·질문
                                     │
                       [서버 PC]  Hermes 봇(exact profile)이 loopback MCP를 대신 호출
                                     │
     자료 받기  ① MCP 승인 입력꾸러미(revision pin, ticket→HTTPS)   ② NAS 원자료 열람(읽기 전용, pin 없음)
                                     ▼
              각자 Codex/로컬에서 작업 (원문 대화는 각자 Codex에 남음)
                                     ▼
     MCP 제출: 결과물 + 5필드 과정 요약 + 사용 revision·도구·시간·막힌 지점 ──▶ 제출 영수증(pending → verified_server_ack)
                                     ▼
              검토자 검토 ──▶ 사람 수락 ──▶ World Tree 정본 revision(Genesis 뒤) + Linear done(파일럿: 사람 클릭)
                                     ▼
              Context·Knowledge·Rune 개선 후보로 환류(지식 트리거·knowledge_access ledger)
```

## 4. 역할과 권한

| 주체 | 하는 것 | 하지 않는 것 |
| --- | --- | --- |
| 팀원 | Linear에서 인지, Buzz로 요청·대화, 로컬 작업, MCP 제출(봇 경유), 과정 요약 작성 | World Tree 직접 쓰기, Linear done 자동화, 원문 대화 업로드 |
| Hermes 봇(서버) | Bot Chat으로 지시 수신, loopback MCP 호출(읽기·ticket·제출·work_session), 결과를 Buzz로 회신 | 정본 승격, 수락, Linear 쓰기, 프로젝트 간 맥락 공유 |
| Buzz | 지시·대화·첨부의 source-local SoR, 봇 배치면 | Official Task·Artifact·acceptance truth |
| Linear | Official Task 상태 정본 | 자동 쓰기(파일럿 전 구간 HOLD) |
| World Tree | 수락된 정본·revision·관계·검색 | 미수락 후보 저장, 브라우저 팀 개방 |
| MCP(dev-erp-mcp·ingress) | 읽기 8종, upload ticket, work event/run receipt/submission status, work_session | 승인·완료·bytes 전송(bytes는 HTTPS data plane) |
| NAS | 원자료 열람(읽기 전용) | 입력 근거로 인정, 백업 target과 혼용 |
| Owner·지정 검토자 | 검토·수락·Linear done 클릭·봇 권한 부여 | 자기 결과 self-accept |

## 5. 부품 대조 (2026-09-02 관찰)

| 단계 | 있음 | 없음 / HOLD |
| --- | --- | --- |
| Buzz 클라이언트·서버 | 서버 가동(WSL 컨테이너 5, 3100/3500), 일일 백업·주간 복원시험 | Buzz→정본 인입은 Project Git 증거 pilot(브랜치 미병합) |
| Hermes 봇 | profile 다수 가동, canonical Bot Chat 규칙 | **봇 명부 없음**(이름·역할·권한·통로) |
| Linear | read-only whole-workspace backup 1회, SoR 결정 | writer HOLD |
| MCP 자료 받기 | World Tree MCP 읽기 8종, 입력꾸러미 manifest 설계(05), HTTPS data plane·mTLS gateway 코드 | World Tree 4300과 MCP 4311 모두 **loopback**; 원격 MCP 좌석은 OD-08 물리 tuple HOLD |
| NAS | Z: 접근 가능, source/backup 분리 원칙 | 팀원 NAS 계정, `source.nas` registry HOLD |
| 결과 제출 | ingress MCP 6종(ticket·work event·run receipt·status), 영수증 | promoter·검토/수락 durable ledger 없음, Genesis 전 |
| 과정 요약 | `erp_publish_work_session`, 5필드 CLI·schema, `ai_work_record_event.v1` | WorkSession 정식 생명주기 OFF(D28) |
| World Tree 팀 기능 스위치 | `run-dev-erp-background.ps1`의 `-ListenOnLan/-EnableMailCollect/-EnableAutoIntake/-EnableAutosync/-EnableMorningBrief/-EnableCodexWorker` | 현재 Main Node 예약작업은 `-Foreground -DatabasePath -SecureCookie`만 전달 → 전부 OFF |
| 승인 대기 화면(§12 코드 2조각, 2026-09-05 브랜치 `feat/rung1-pending-review`, Level 2 재검토 반영) | World Tree loopback "검사 중" 필터(`업무 관리 › 승인·현황 › 검사 중`, cookie `GET /api/reviews/pending`, admin·read-only, 수락은 기존 제안 큐·할 일 화면, 본인 제출 행은 버튼 비활성화 표시만), Vigil owner 표면 "검사 중 · World Tree 제출 대기" 패널(투영은 건수·상태 분포뿐 — 이름·제목·항목 ID·과제 ID 없음, `?view=mod:reviews` 안전 링크, writer 0, 자격증명 없으면 링크만, Tailscale Serve 프록시 경유 요청은 loopback 이어도 403) — 합성 데이터로 두 화면 확인(Board 응답에 식별 필드 없음 포함) | 운영 World Tree 플래그 `DEV_ERP_MCP_REVIEW_READ` OFF(Owner/cutover 세션이 켬), Board 전용 admin MCP 토큰·`<private_root>/config/team_ops_board/credentials/` 한 줄 파일 미배치, Board lane 재빌드 전, main 미병합, 본인 제출 강제(writer 측)는 후속 |

핵심 함의: 원격 MCP가 HOLD인 동안 **파일럿 경로는 "봇 경유 MCP"** 하나다. 팀원 Codex가 서버 MCP를 직접 부르는 경로는 3번째 ring에서 mTLS gateway로 연다.

## 6. 출시 사다리

| 칸 | 범위 | 완료 기준(Owner가 눈으로 확인) |
| --- | --- | --- |
| 1 설치 초기(internal_rc) | Owner 1좌석, Main Node 설치본 1벌, 되돌리기 증명, 매뉴얼 3종 실행 | Owner PC 한 바퀴(할일→받기→제출→Vigil "검사 중") + 도장 2개(0.1.7 전환 수락, 합성 복구 수락) |
| 2 팀 파일럿 | 팀원 2~3명, Buzz + 봇 경유 MCP, 브라우저 World Tree 비개방 | **팀원 2명이 1주 안에 Buzz로 자료 받고 → 작업 → 5필드와 함께 제출 → 검토자 수락 → 사람이 Linear done**, 각 1건 |
| 3 운영 시작 | 첫 정본 물건(Genesis), 승인 대기 화면, 봇 명부 정식, NAS 백업 실동작, 원격 MCP(mTLS), 팀 전체 | 정본 revision 1건 publish + 승인 대기 화면에서 Owner 수락 1건 |

## 7. 확정 필요 항목 — 기본안 포함

| # | 항목 | 기본안(Owner 미확정) | 막는 것 |
| --- | --- | --- | --- |
| 1 | 봇 명부 | 파일럿 봇 2~3개만: 이름·역할·부르는 말·허용 MCP 도구·Bot Chat | 팀원이 누구를 부를지 모름 |
| 2 | Buzz 구조 | 프로젝트 1개 = Buzz Project 1개, 채널 1개 + 봇 DM; Pulse는 상태 알림만 | 지시가 흩어짐 |
| 3 | 자료 요청 문법 | "봇에게 [과제코드]/[산출물명] 입력꾸러미 달라" 한 문장 템플릿; 봇은 revision ID를 함께 회신 | 입력 근거 추적 불가 |
| 4 | 제출 꾸러미 형식 | 결과물 + 5필드(입력·판단·출력·검증·중단조건) + 사용 revision·도구·소요시간·막힌 지점 + Linear issue ref | 수락 판단 근거 부족 |
| 5 | 검토자·수락자 | 파일럿: Owner가 검토·수락·Linear done 클릭; 프로젝트 책임자 위임은 ring 3 | 완료 authority 공백 |
| 6 | NAS | 팀원 계정·읽기 전용 폴더 확정; 입력 근거로는 불인정 | 이중 원천 |
| 7 | Linear 규약 | 상태는 사람만 변경; "제출됨"은 코멘트 또는 라벨(사람 입력) | 자동 done 오해 |
| 8 | D28(WorkSession) | 좌석당 활성 세션 1개, checkpoint 복수, closeout은 완료 제안일 뿐 | 과정 기록 형식 확정 불가 |
| 9 | World Tree 스위치 | 파일럿 동안 브라우저 팀 개방 없음; MorningBrief는 Buzz 알림으로 대체할지 결정 | 재방문 루프 |
| 10 | 원격 MCP 시점 | ring 3에서 mTLS gateway + 좌석 tuple(OD-08) | 팀원 Codex 직접 호출 기대와 불일치 |

## 8. 작업 과정 흡수 규칙

- 정본에 넣는 것: 5필드 요약, source/revision refs, 사용 도구·모델, 시작·종료 시각, 막힌 지점, 사람 결정. 형식은 기존 `bounded_work`(5필드)와 `soulforge.ai_work_record_event.v1`를 재사용하고 새 schema를 만들지 않는다.
- 정본에 넣지 않는 것: 원문 대화, 숨은 reasoning, 화면·키보드·OS 활동, credential. 원문은 각 팀원의 Codex에 source-local로 남고 정본에는 포인터만 둔다(VISION 불변원칙, AI 작업 기록 정의).
- 제출 시점: 결과물과 **같은 꾸러미**로 한 번. 결과만 오면 `PROPOSED`에 머물고, 과정 요약만 오면 결과가 아니다.
- 효과: 정본은 깨끗하고, 개인 대화는 감시되지 않으며, 사후분석(누가·무엇으로·얼마나·어디서 막혔나)이 재구성된다.

## 9. 자료 받기 규칙

- 입력용 승인 자료 = MCP(봇 경유): revision pin이 남아 결과 수락 때 "무엇을 보고 만들었나"가 추적된다.
- 참고·열람용 원자료 = NAS 읽기 전용: pin이 없으므로 입력 근거로 인정하지 않는다.
- 팀원 매뉴얼 한 줄: "쓸 자료는 봇에게 달라고 하고, 구경할 자료는 NAS에서 본다."

## 10. 제외·비권한

- Linear 자동 쓰기·자동 Official Done, 비 canary 외부 자동전송, 최종 기술수락, 팀 전체 배포, NAS recovery-ready 주장, 브라우저 World Tree 팀 개방, 원문 대화 저장, 봇의 프로젝트 간 맥락 공유.
- 이 문서는 Master Map M16의 one-seat RC를 대체하지 않고 그 다음 ring의 접속 모델을 고정한다. 실제 봇 프로필·Buzz 프로젝트·credential·listener는 각각의 Owner Gate 뒤다.

## 11. 다음 행동

1. Owner가 §7의 1·2·5(봇 명부, Buzz 구조, 검토자)를 결정한다.
2. 그 뒤 팀원용 1장 매뉴얼(training-new-hire 역할)을 이 문서의 §3·§8·§9 세 줄로 작성하고, 팀원 1명이 따라 해 본 영수증을 남긴다.
3. Ring 2 완료 기준(§6)을 통과한 뒤에만 ring 3 항목을 연다.

## 12. Team Pilot 1 구성표 (Owner 2026-09-02: 코드 개편이 아닌 구성 개편 B 채택)

- 출시 단위 이름은 기능명 `Soulforge Team Pilot 1`이다. 브랜드명·판타지명은 계속 `OWNER_DEFERRED`. 묶음 번호는 Suite 규칙(`suite_release`)대로 하나만 붙이며 실제 번호는 Pack을 결합할 때 정한다.
- 내용물: HPP Server Pack `0.1.7`(파일럿 동안 동결) · Buzz Project 1 + 채널 1 + 봇 DM · 봇 명부(§13) · 봇이 대신 호출하는 MCP 도구 묶음(읽기 8 + upload ticket + work event/run receipt/submission status + work_session) · Owner 승인 대기 필터(World Tree loopback) + Vigil 승인 대기 패널(World Tree로 가는 안전 링크만, writer 아님) · 팀원용 그림책(`training-new-hire` 역할의 HTML book 투영) · known-issue list.
- 코드 변경 범위: Vigil 패널 1개(읽기+링크), World Tree 필터 1개. 나머지는 설정·명부·매뉴얼. 소스 이동·이름 변경·schema 변경 0.

| 사용자 | 여는 것 | 파일럿에서 보이는 것 | 파일럿에서 안 보이는 것(보류, 삭제 아님) |
| --- | --- | --- | --- |
| 팀원 | Buzz 클라이언트 + 봇, 자기 Linear, 자기 Codex | 봇과 대화·자료 요청·제출·상태 회신 | Soulforge 전용 팀원 화면(없음; 필요해지면 Vigil 패널로 추가) |
| Owner·검토자 | Vigil(보는 곳) + World Tree 웹 loopback(도장 찍는 곳) | 상황·건강·사용량·승인 대기 목록, 승인 필터 | World Tree 게임 모드 UI, 줄기·강 뷰, 지식 서가 화면 |
| 봇(서버) | MCP 도구 묶음, Bot Chat | 명부에 적힌 허용 도구만 | Rune Tongs(OFF 유지), 프로젝트 간 맥락 |
| 보류 | — | — | `team-ops-board-mockup`, `renderer-web`, `skin-lab-storybook`, Universal Client(파일럿 미사용), `sonar-intel` |

## 13. 봇 명부 구조 — 조직도 투영 (확정 아님)

명부는 새로 짓지 않고 기존 조직도를 그대로 투영한다. 사람 조직도는 `DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`, 역할·기본 모델은 `AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`, 프로젝트 15개 책임 분야는 `PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`가 정본이다. 그룹 순서는 Owner 지시대로 **프로젝트별 → 전문 툴 공방 → 공통 → 플랫폼**이며, 이는 World Bible §6 세력(Project AI Organizations / Tool Workshops / Common AI Workforce / AI Platform Organization)과 Bot 작업 root의 `PJT / TOOL / COMMON` 폴더와 같은 모양이다.

| 그룹 | organization_kind | 구성 | 팀원 노출 |
| --- | --- | --- | --- |
| 1 프로젝트별 AI 조직 | `project` | 프로젝트마다 업무운영/팀장 1 + 책임 분야 15 = 최대 16 프로필. 프로젝트 간 맥락 격리 | 프로젝트당 2~3개만(기본안: 팀장 + 시스템공학, 선택: 기술자료·데이터관리) |
| 2 전문 툴 공방 | `tool_workshop` | **툴마다 봇 1개**(Owner 2026-09-02): 발표(PPT)·한글(HWPX)·엑셀(XLSX)을 각각 별도 봇으로 두고, 뒤에 CAD·PCB·시험 등을 같은 모양으로 추가. 각 봇은 capacity-1 lease, 자기 입력/출력 계약, 자기 validator, 결과는 candidate custody receipt로 반환(11번 계획서, 재기준 §19) | 팀원 직접 호출 없음; 창구 봇이 넘겨서 호출 |
| 3 공통 AI 인력 | `common` | 조사·검토·검증·형식화·기록 역할(World Bible "Common AI Workforce") | 파일럿 제외 |
| 4 플랫폼·엔진 | `platform` | Rune factory·실행기반·개발 보조(조직 B) | 팀원 비노출 |

필드는 새 schema를 만들지 않고 기존 Board/governance overlay 어휘를 재사용한다: `organization_id`, `parent_organization_id`, `organization_kind`, `role_code`, `display_label`, `lifecycle`(`active|held|retired`), `role_binding_id`. 여기에 파일럿용 4칸을 더한다: `profile_ref`(private), `bot_chat_ref`(private), `allowed_tools`(MCP allowlist), `pilot_exposed`(true/false). 기본 모델·추론은 AI_ORG 표를 그대로 따른다(프로젝트 팀장 `Sol/xhigh`, 분야 책임자 `Sol/high`, 결과물 TASK `Terra/max`, 단순 수집 `Luna/medium`).

프로젝트 그룹의 `role_code` ↔ 정본 15개 책임 분야:

| role_code | 정본 분야 | role_code | 정본 분야 |
| --- | --- | --- | --- |
| `pm` | 총괄 CEO/업무운영·팀장 | `cm` | 형상·변경관리 |
| `se` | 시스템공학·요구사항 | `tdm` | 기술자료·데이터관리 |
| `hw` | 하드웨어설계 | `proc` | 구매·자재재고 |
| `sw` | 소프트웨어설계 | `sched` | 일정·계약대외협력 |
| `me` | 기구설계 | `safe` | 안전·보안보증 |
| `if` | 전장·인터페이스통합 | `mfg` | 생산·정비지원 |
| `tv` | 시험·검증 | `cost` | 원가·예산 |
| `qa` | 품질·인증 | `pr` | 홍보·대외공개 |

- 실제 프로필 이름·Bot Chat·ID는 public 문서에 넣지 않는다(`CODEX_WORK_DIRECTORY_V1` local-only 규칙, `AGENTS.md` roster 규칙). 실제 명부 초안은 private `_workmeta/system/reports/team_pilot/hermes_bot_roster_draft_20260902.md`에 두며(metadata-only, 확정 아님), 확정되면 `_workmeta/system/bindings/`의 governance overlay 형식으로 승격한다(별도 Gate, 이 문서가 승격하지 않음).
- 이름은 세 층으로 나눈다(Owner 2026-09-02): **이름**(페르소나, 사람 이름처럼) · **직책**(조직도 자리; 업무형 직책이 정본이고 판타지 직책은 같은 자리의 표시 별칭) · **stable id**(불변). 페르소나 이름은 계속 쓰는 봇(공통 운영·툴 공방)에만 붙이고, **프로젝트 봇은 이름 없이 `과제코드 + 직책`**(예: `KVDS 팀장`)으로 표기한다(Owner 2026-09-02: 과제명 페르소나는 헷갈림). 게임 옷을 켜면 직책 별칭만 바뀐다. 실제 이름 값은 private 명부에만 둔다.
- 명부에 있다고 권한이 생기지 않는다. 각 봇의 `allowed_tools`는 OD-11 R0~R2 범위 안에서만 채우고, R3 이상 행위는 표현 자체를 두지 않는다.

## 13A. 옛집→새집 lane 전환 규칙 (2026-09-02 Slack rc=1 사고에서 도출)

- 2026-09-01 21:47 N9 전환에서 Slack 수집 예약작업이 새 경로로 재등록됐으나 배치 바인딩의 `forbidden_roots`와 채널 상태 9개의 digest 울타리가 함께 갱신되지 않아 실행 전 검사(`slack_batch_live_runner.mjs:402-414`, `:469-474`)에서 `required_forbidden_root_missing`으로 즉시 종료(02:00·12:00 rc=1)했다. 2026-09-02 13시대에 lane 등록기를 통해 재고정·재등록했다(영수증 `local-recovery/slack-batch-fix-20260902/receipt.md`).
- 규칙: 어떤 lane이든 경로가 바뀌는 전환은 **수집기 pin · 바인딩 digest · VBS/launcher · 채널/상태 digest 울타리** 넷을 한 묶음으로 갱신하고, 예약작업 재등록은 반드시 그 lane의 등록기(`register-*-task.ps1`, preflight gate 내장)로만 한다. 재등록 직후 launcher `--preflight`를 등록된 인자로 한 번 실행해 통과를 확인한다.
- 이 규칙은 §12의 운영 lane(Vigil·메일 전달기·Codex 정리기·usage meter) 전환에도 그대로 적용한다.
- 2026-09-02 13:35–13:51 Phase 1 실행: 메일 전달기·Codex 정리기 예약작업을 `operations-lane-v1`로 재지정(전달기 binding은 `<control_root>\mail\…`에 byte-identical 복사, 정리기 `-LocalRoot`는 C: 유지), 수동·트리거 실행 rc=0, 롤백 XML 보존(packet §8). 발견: 두 lane의 등록기는 "코드 root ≠ 상태 root" 분리를 표현하지 못하고 launcher에 `--preflight`가 없어 §13A를 그대로 충족할 수 없음 → 등록기에 `-CodeRoot/-BindingPath`(메일), `-LocalRoot`≠`-RuntimeRoot`(정리기)와 `--preflight` 추가가 lane v2 전 선행 과제. 그 전까지는 "등록기 dry-run digest + `Set-ScheduledTask` + 관찰 실행"을 §13A의 명시 예외로 둔다.
- 2026-09-02 17:45–17:56 Phase 2 실행(packet §10): Vigil·Codex 정리기·메일 전달기 예약작업이 `operations-lane-v2`(커밋 `2c14021`)에서 실행, 상태 root `<control_root>\ops-lane`(seed 74,767 files + live delta 239, 실패 0), user env `SOULFORGE_STATE_ROOT`/`SOULFORGE_OWNER_ROOT` 설정, 포트 4192 HTTP 200·Tailscale 4193 유지, C: `operations` 이후 쓰기 0. **잔여 split-brain**: `<legacy_root>` main(ef9b0e66)에는 재정의 코드가 없어 Codex meter hook·enrollment CLI는 계속 C: 상태에 씀 → 브랜치 `claude/ops-owner-root-override`(및 `claude/linear-collect-lane-v1`) main 병합 + legacy·target 양쪽 checkout fast-forward가 마감 조건. 롤백 = env unset + `tasks-before-phase2` XML 재등록.
- 2026-09-02 오후 Option B 착지: 브랜치 `claude/ops-owner-root-override`(커밋 `2c14021`, base `ef9b0e66`)에 `guild_hall/shared/soulforge_state_root.mjs` + Board 런타임·enrollment·catalog·topology, usage meter CLI, 정리기 CLI/등록기 재정의. 우선순위 = 파일별 명시 flag/env > `SOULFORGE_STATE_ROOT` > `SOULFORGE_OWNER_ROOT` > git-derived; 잘못된 값은 fail-closed, 미설정 시 바이트 동일(테스트로 고정). Board 737/739(실패 2는 main 기존), meter 156/156. main 병합은 Owner `github-up` 결정. Phase 2는 lane v2를 이 커밋에 고정해 `SOULFORGE_STATE_ROOT=<control_root>\ops-lane`(공유 root 하나) + copy-only 상태 이전으로 진행(packet §9·§10).
- 2026-09-02 13시대 준비 결과(영수증 `local-recovery/c-state-snapshot-20260902/`): 옛집 `guild_hall/state` 스냅샷 116,262 files(실패 0, sha256 manifest), 운영 lane `install/source-lanes/operations-lane-v1`(source 437f8c96 고정, import 폐포 92 files, `vite`·`yaml` 의존 동봉). 메일 전달기·Codex 정리기는 즉시 전환 가능(Phase 1). **Vigil·usage meter·정리기 상태는 한 owner-root 묶음**으로, 런타임이 `git rev-parse --git-common-dir`로 root를 정해 `<root>/guild_hall/state/operations/**`에 고정 결합함 → 상태를 `<control_root>`로 옮기려면 `SOULFORGE_OWNER_ROOT`/`SOULFORGE_STATE_ROOT` 재정의(Option B) 코드 변경 뒤 lane v2로 Phase 2 전환.

## 13B. 병합 기록 — 2026-09-02 저녁

- fresh Level 2 검토(비작성 reviewer)가 두 브랜치에 `REVISE`(override: 파생 state root 오류 종류 가림 1 major + minor 6; linear: 활성화 사실과 다른 "미활성" 문서 1 major, 실행 시간 상한 vs lease 1 major, README의 Slack private 파일명 노출 등 minor 7)를 냈고, 통합 브랜치 `claude/integration-20260902`에서 7커밋으로 전부 수정(문서화 아닌 코드 수정 포함: 파생 state root 검증·`activity_log` 기본 root 재정의·조직 catalog env 명시·win32 드라이브 root 요구·8분 실행 상한+`run_deadline_reached` gap·CLI argv guard·pure-Node validator·main의 `agent_observation` caller 카탈로그 1줄).
- 검증: module-operability 8/8, product-composition 4/4(main 기존 실패 해소), linear-collect 33/33, ai-usage-meter 156/156, codex-retention 26/26, shared 162/162, Board 737/739(기존 2건).
- main `ef9b0e66` → `1aec216d`(18 commits, fast-forward) push, `<TARGET_SOULFORGE_ROOT>\dev\source_checkout` 동일 커밋으로 갱신. 이로써 C: dev checkout과 D: checkout 모두 재정의 코드를 가져 Codex 훅·enrollment CLI의 split-brain이 닫힘(이미 떠 있던 세션은 재시작 후 적용).
- 주장 상한: `validated_private / internal_rc candidate`. Level 3(fresh B/V)은 미실행.

## 14. Owner 결정 기록 — 2026-09-02

| 결정 | 상태 |
| --- | --- |
| 코드 개편(A)이 아니라 구성 개편(B)으로 Team Pilot 1을 낸다 | Owner 채택 |
| 봇 명부는 기존 조직도의 투영이며 그룹 순서는 프로젝트별 → 전문 툴 → 공통 | Owner 방향(확정 아님) |
| 팀원용 App은 Buzz 자체이고 Soulforge 전용 팀원 화면은 만들지 않는다 | 가정(Owner 확인 대기) |
| 파일럿에 노출할 봇 선택, Buzz Project/채널 구조, 검토자·수락자 | 미확정(§7 1·2·5) |
| Linear 백업 스냅샷은 "멈추지 않은 스냅샷"을 수락한다(hourly writer quiesce 없음) | Owner 채택 |
| Linear는 **수집(collection) lane**과 **백업(backup) 세대**를 분리한다: 수집은 메일·Slack처럼 자주(cursor·delta·custody, 읽기 전용), 백업은 공통 백업 주기에 함께 | Owner 방향 |
| 파일럿 전 Linear 수집·백업이 갖춰져야 한다 | Owner 요구 |
| Linear Tributary(수집 lane)는 서버용 API 키(`secret_ref`, Owner가 값 배치) + 15분 예약작업으로 구현한다(방식 A); 코드는 읽기 질의만, 키 값은 어디에도 기록하지 않음; 이후 read 스코프 OAuth 앱으로 교체 검토 | Owner 채택(2026-09-02) |
| Linear 읽기 전용(Read scope) 개인 API 키 `soulforge-collect`가 Main Node의 lane 자격증명 파일(`<private_root>/config/linear_history/credentials/linear_api_key.txt`, 한 줄·BOM 없음·48 bytes)에 배치되고 ACL이 Owner 계정·SYSTEM 읽기로 제한됨(값은 어떤 기록에도 없음). 쓰기 키는 sole Linear writer Gate가 열릴 때 별도 identity(봇 계정/OAuth 앱)로 발급 | 기록(2026-09-02) |
| Linear 15분 Tributary 코드 착지: 브랜치 `claude/linear-collect-lane-v1`(커밋 `e940775`, base `ef9b0e66`) — `guild_hall/linear_history/`(read-only GraphQL client·runner·custody·receipt·launcher·등록기·vbs·tests 30/30, 쓰기 질의 0 보장 테스트, health-before-reject), `path_registry` Linear source-lane adapter, 예시 바인딩, plan 10 Linear row. 바인딩 `soulforge.linear_collect.binding.v1`(`credentials.api_key_file`, `workspace.url_key`, `cursor.*`). live 스키마는 첫 `--apply`에서 fail-closed로 검증. main 병합 미실행(Owner `github-up`). 주간 전체 백업을 서버 키로 예약하는 것은 후속(LB1 physical one-shot에 key-based provider 추가 필요) | 기록(2026-09-02) |
| Linear 15분 Tributary **가동**(2026-09-02 17:53 첫 성공, 17:54 idempotent): 예약작업 `Soulforge-HPP-Linear-Collect`(PT15M), lane `install/source-lanes/linear-collect-v1`(브랜치 커밋 `0dc8453f`; live 응답 불일치 4건 수정: 트리거 `StopAtDurationEnd`, GraphQL `operationName`, float `position` 텍스트화, NFC 정규화), custody `<private_root>/ingress/linear/<url_key>/`, 바인딩에 `organization_id` pin. 18:11 전체 이력 backfill(lane의 backfill 커서, gen 4) 뒤 custody 이슈 84·댓글 184·프로젝트 12(Reliquary(백업 세대) 82/178 이상), 18:15 delta run gen 5 idempotent; 바인딩 v3(`initial_updated_at` 2020-01-01) 재등록, README 절차 커밋 `5bd6a9b1`. Level 3 B/V·main 병합 전이라 `관찰됨` | 기록(2026-09-02) |
| Linear Reliquary `linear-actual-20260902-133154-kst`(82 issues/178 comments/12 projects, 격리 복원 byte-identical, `PARTIAL_TECHNICAL_RESTORE_CANDIDATE`) 생성. Human restore acceptance는 2026-09-02 Owner 채팅 진술("백업은 맞아 복원 확인")로 수락됨 — evidence/pin 봉투는 private control root(`backup-controller/linear-human-acceptance-20260902-133154/`)에 create-only 기록, LB1 세대 영수증은 불변 유지. 발견된 결함: LB1 physical one-shot 기본 clock의 ms 경계 race(`clockSnapshot` 이중 Date 읽기) → 무인 반복 전 수정 필요; `get_issue`의 actor-less `stateHistory`는 page 계약 확장 후보 | 기록(2026-09-02) |
| **보류 메모(2026-09-02 저녁, Owner 요청 "까먹지 않게")**: Buzz 에이전트 작업 데이터 백업. 관찰: Buzz 서버 데이터(postgres·minio 미디어·redis·git)는 이미 host controller 예약작업 `BuzzBackup-Daily`(매일 03:30, 오늘 rc 0)가 `<buzz_root>\backup\<surface>\`에 5세대 보관하고 `BuzzRestoreTest-Weekly`(일요일 04:00, 08-30 rc 0)가 복원시험을 함. 빠진 것 3가지: (1) 호스트 밖 사본 없음(같은 D: 디스크뿐 → NAS lane 복구 뒤 포함), (2) Hermes 봇 작업 root `<bot_work_root>\{COMMON,MFG,PJT,TOOL}`와 Hermes 런타임 루트(프로필 34개 전부 실행 중; SOUL·config·profiles·sessions·memories·state·kanban·checkpoints·skills·cron 저장소, 자격증명 파일은 미열람)는 어떤 Soulforge 백업 lane에도 없음(`hermes_agent_backup_manifest` 계약만 존재), (3) Buzz `buzz_backup_generation_manifest` 기준 사람 백업 수락 증거 없음. World Tree 유입도 0: `<private_root>` spine의 `10_SOURCE_CAPTURE_CATALOG/{buzz,hermes}`·`50_AI_WORKFORCE_INDEX/*`는 0 files이고 `60_BACKUP_GENERATIONS`에는 linear만 있음(Context-to-Execution 감사 스레드 교차 관찰 2026-09-02 19:5x, 이 세션 재확인 20:4x). 우선순위: **Hermes 프로필·설정 스냅샷 백업 먼저**(백업 0, 유실 시 조직 명부 소실), Buzz는 기존 controller 백업을 Soulforge 세대·수락 체계에 편입. 착수 시점: 지침(AGENTS.md) 정비 뒤 | 착수됨(2026-09-03, 아래 행) |
| Buzz Tributary + Buzz 백업 색인 + Sigil(Hermes 프로필 스냅샷) **코드 착지**(2026-09-03 새벽, 브랜치 `worktree-bztrib`): `guild_hall/buzz_history/`(WSL·docker exec·psql 읽기 전용 exporter + runner·custody·receipt·launcher·emitter·등록기·vbs, 합성 exporter 테스트 19/19, 쓰기 SQL 0 보장 소스 스캔, 자격증명 키 자체가 없는 바인딩), `path_registry` Buzz source-lane adapter(테스트 5/5), `guild_hall/backup_controller/buzz_backup_generation_index.mjs`(controller 백업 4스트림 stat+sha256 재계산, 영수증 16hex 접두 대조, 바이트 복제 0, `claim_ceiling: index_only`, 테스트 8/8), `guild_hall/backup_controller/hermes_profile_snapshot.mjs`(SOUL.md만 바이트 복제 + 격리 readback, config는 digest·크기, skills/hooks/plans/cron은 이름, sessions/memories/workspace/DB는 개수·바이트, 자격증명은 존재·크기만이며 해시 금지, DB 바이트 미포함, `claim_ceiling: inventory_v0`, 테스트 7/7). **운영 미적용**: 예약작업 등록·바인딩 배치·`--apply` 실행은 전부 Owner 승인 대기. 정직성 편차 2건: (1) Soulforge가 격리 복원을 하지 않았으므로 Buzz `restore_test` lane record 대신 관찰 기록(`buzz_restore_test_observation.v0`, `human_acceptance_state: pending`)을 쓴다, (2) 수집 회차가 없으면 `backup_generation_pointer`를 지어내지 않고 보류한다 | 기록(2026-09-03) |
