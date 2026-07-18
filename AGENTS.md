# Soulforge — 저장소 작업 헌장

> **연속성 제약 (2026-06-13 owner)**: 이 저장소의 주 개발 환경은 Codex 다.
> 다른 모델/도구(예: 한정 윈도우의 강한 모델)가 개발하더라도, 산출물은
> **Codex 가 그대로 이어받아 유지보수 가능**해야 한다 — ① 에이전트 지침
> 정본은 이 AGENTS.md 하나(CLAUDE.md 는 @AGENTS.md 포인터만, 특정 모델
> 전용 지침을 밖에 흩뿌리지 말 것) ② 하네스/스크립트는 도구 비종속
> (표준 Node/CLI, 특정 에이전트 환경 전용 기능 의존 금지) ③
> NIGHT_WORK_HANDOFF 는 git commit/activity 에 남지 않는 휘발 forward-state
> (시도/기각·blocker·owner 결정 대기·다음 액션·stale-memory 정정)를
> 컨텍스트 경계 너머로 넘길 때 필수 — 특히 자율 루프 종료/compact/clear 전,
> 비-Codex 모델→Codex 인계, primary controller 변경, owner 요청 시 사용한다.
> 깨끗한 슬라이스 경계는 commit+push+self-verify 로 갈음 ④ 결정·계획·맥락은
> PLAN/DESIGN/packet 에 문서화.

## 목적

Soulforge는 canonical 구조와 public/private 경계를 고정한 설계 저장소다.
과거 이행 흔적이나 relocation pointer 는 정본으로 인식하지 않는다.

## 정본 구조

1. `.registry` is the outer canon/store.
2. `.unit` is the active subject owner.
3. `.workflow` is the orchestration canon.
4. `.party` is the reusable orchestration template.
5. `.mission` is the held mission plan owner.
6. `guild_hall` is the cross-project operations root.
7. `_workspaces` is the local-only project worksite.

보조 루트:

- `docs/architecture/` = root-owned canon docs
- `ui-workspace/` = derived UI consumer workspace

## 핵심 원칙

- Species canon uses `.registry/species/<species_id>/species.yaml` with inline `heroes:` entries.
- Class canon uses `.registry/classes/<class_id>/class.yaml` along with class-local `*_refs.yaml` files.
- `_workmeta/<project_code>/runs/<run_id>/` 의 실행 원천 기록은 실행 과정의 메타데이터, 판단 근거, 검증 로그를 뜻한다.
- HWP/HWPX, Word, Excel, PowerPoint, PDF, 압축파일, 메일 원문/첨부 같은 실제 원문 파일은 `_workmeta` 에 저장하지 않는다.
- 실제 참조/입력/산출 파일은 `_workspaces/<project_code>/...`, `_workspaces/system/...`, 또는 owner-approved shared worksite 에 두고, `_workmeta` 에는 경로 포인터, 크기, 해시, 출처, 사용 상태만 남긴다.
- HWP 원문은 본문 분석 대상이 아니라 전처리 대상이다. 모든 HWP는 먼저 `_workspaces` 또는 owner-approved shared worksite 에서 HWPX 파생본으로 저장/export 한 뒤, 그 HWPX 를 읽는다.
- PLAUD의 offset 없는 provider 절대 시각은 수집 시 UTC로 해석하고, 사용자에게 보이는 녹음 시작·종료 시각, session id, 날짜 폴더와 파생 event time은 항상 `Asia/Seoul`(KST)로 정규화한다. 명시적 `Z` audit timestamp와 녹음 시작 기준 상대 전사 시간은 변환하지 않으며 상세 계약은 `docs/architecture/workspace/PLAUD_ADOPTION_DECISION_V0.md`를 따른다.
- Cross-project ingress/state lives only under `guild_hall/state/**`.
- Cross-project command surface uses `guild-hall:*` only.
- Tracked workspace samples sit under `docs/architecture/workspace/examples/`, not `_workspaces/`.
- `.workflow` and `.party` remain distinct from `.registry`.
- Relocation stubs, old bridges, old work logs, and archive pointers stay excluded from the canonical tree.

## 개발 방향 확인 규칙

- 큰 개발 방향, active slice, 우선순위 판단이 필요하면 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` 를 먼저 확인한다.
- 개발 예정, backlog, candidate, "나중에 개발할 것" 을 저장해야 하면 새 임의 파일을 만들기 전에 `DEVELOPMENT_ROADMAP_V0.md` 의 개발 예정 저장 규칙을 따른다.

## 지식·온톨로지 정본 라우팅

- Soulforge 전체 지식·온톨로지 저장 권한, Google Drive ontology canon package, `.registry/knowledge` 실행 투영, NotebookLM 책장, NAS 재해복구, OneDrive 작업면의 상세 계약은 `docs/architecture/guild_hall/ONTOLOGY_CANON_OPERATING_POLICY_V0.md` 를 따른다.

## AI 작업 실행 계약

- Soulforge에서 코드, 문서, 구조, 검토, 적용성 판단, 변경 계획, 파일 편집을 다루는 모든 작업은 먼저 `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- 작업 종료 검증을 반복 실행해야 하면 `.workflow/post_development_review_gate_v0/` 또는 설치된 Codex skill `soulforge-post-development-review-gate` 를 사용한다.
- 모든 bounded 업무 작업은 완료 보고 전 `AGENT_EXECUTION_CONTRACT_V0.md` 의 end-of-task knowledge trigger check 를 수행해 지식 후보 신호가 있는지 닫는다.
- 모든 bounded 업무 작업은 완료 보고 전 설치된 Codex skill `conversation-rule-hardening` 을 수행해 대화 중 드러난 반복 실수, 미정 규칙, 색인 후보, 다음번 자동 guard 후보가 있는지 `규칙 강화 체크:` 로 닫는다.
- (2026-07-05 owner 승인) 모든 bounded 업무 작업은 완료 보고 전 자동화 자산 5필드(입력/판단/출력/검증/중단조건)를 `.workflow/five_field_session_capture_v0` 의 capture CLI 로 `_workmeta` 레저에 남긴다. 기록 주체는 사람 아닌 AI, 원문 미복사(포인터만). 누락분은 일일 sweep 자동화가 커밋 이력에서 소급하며, 반복 request_kind 는 승격 신호가 된다.
- 지식 후보 판단은 rubric 을 `AGENTS.md` 에 복제하지 않고 `post_development_review_gate` 에 바인딩한다. `knowledge_access_event_capture_v0` 와 `sourcebound_knowledge_packet_operating_loop_v0` 는 후보 처리 route 이며 최종 판단 authority 가 아니다.
- Soulforge에서 skill 을 새로 만들거나 수정하는 작업은 제작 자체만으로 완료하지 않고, 1차 완료 보고 전 `AGENT_EXECUTION_CONTRACT_V0.md` 의 skill first-build verification gate 를 따른다.
- 단순 명령 출력 확인, repo 판단이 필요 없는 일반 질문은 예외로 둔다.

## Cross-PC Codex 준비 라우팅

- 사용자가 `Soulforge 최신화하고 이 PC에서 할 수 있게 준비해줘`, `이 PC 역할에 맞게 세팅해줘`, `다른 PC에서 이어서 작업하게 해줘`처럼 요청하면, 사용자가 터미널 명령을 직접 실행하게 나열하는 것으로 끝내지 않는다.
- 설치된 Codex skill `soulforge-github-down` 또는 tracked `.registry/skills/github_down/codex/` bridge를 사용해 Codex가 안전한 Git 동기화, tracked skill sync, 읽기 전용 device capability probe, node role별 허용·차단 작업 보고를 직접 수행한다.
- node role이나 bootstrap profile이 없으면 임의로 만들지 않고 `public-only` 안전 기본값으로 진단한 뒤 필요한 owner 선택만 요청한다. `_workmeta`·`private-state` 폴더 존재만으로 profile을 승격하지 않으며, `public-only`·`operator` capability probe는 private binding을 읽지 않는다. `always_on_node` writer bootstrap은 exact `owner-with-state`와 현재 operational-primary 지정이 모두 있어야 한다. secret 입력, 새 private repo 권한, 소프트웨어 설치, junction repair, NAS/Drive mutation은 별도 권한 경계를 유지한다.

## 브라우저 연결 복구 사전 승인

- 사용자는 Soulforge 작업 중 Chrome/Codex 브라우저 연결 복구에 대해 스레드 간 사전 승인을 부여했다.
- Chrome 창 열기, 선택 프로필 창 띄우기, Codex Chrome 연결 재시도, 비밀값을 읽지 않는 설치/실행 상태 점검은 같은 목적의 사용자 요청을 수행하기 위해 별도 확인 없이 진행한다.
- 이 사전 승인은 외부 사이트 메시지 전송, 파일 업로드, 권한 변경, 결제/구매, CAPTCHA 처리, secret 입력/노출, 확장 프로그램 또는 소프트웨어 설치/수리에는 적용하지 않는다. 해당 행위는 기존 브라우저 안전 규칙과 secret 취급 규칙을 따른다.

## SE 워크스페이스 폴더명 규칙

- SE 프로젝트 워크스페이스 폴더를 생성, 정리, rename, dry-run 할 때는 `docs/architecture/workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md` 를 먼저 확인한다.
- 사람이 보는 폴더명은 한글 중심, 짧은 의미 중심으로 작성하고, 날짜/메일 제목/source id/hash/원본 import 명은 폴더명이 아니라 `_workmeta` metadata 또는 manifest 에 기록한다.
- 실제 rename 전에는 dry-run rename map, pointer migration plan, owner approval 이 필요하다.

## Git 저장 규칙

- 기능 코드, 구조 문서, public-safe example 변경은 public GitHub repo (`Soulforge/.git`) 에 commit/push 한다.
- 메일 자료, 몬스터 이력, 해결 기록, battle_log, morning_report, outbound mail 기록 같은 보호 대상 업무 데이터는 public repo 에 commit/push 하지 않는다.
- project-local contract, 실행 기록, onboarding note 같은 과제별 metadata 는 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 에만 둔다.
- `_workmeta` private repo 에 commit/push 하는 대상은 메타데이터만이다. 실제 원문 파일이 발견되면 `_workspaces` 또는 owner-approved shared worksite 로 옮기고, `_workmeta` 에는 이동 기록과 해시 포인터만 남긴다.
- guild_hall continuity, ingress history, outbound log 같은 cross-project 보호 데이터는 Soulforge root 아래 nested private repo `private-state/` 에만 commit/push 한다.
- active AI workspace 는 `Soulforge/` 를 기준으로 읽되, project-local private metadata 는 companion `_workmeta/`, cross-project private data plane 은 `private-state/` 에서 함께 읽는다.
- 저장 대상이 불분명하면 public 이 아니라 private 쪽으로 해석하고, 공개 가능 여부가 확인되기 전에는 public commit 에 포함하지 않는다.

## 업무 기록 및 절차 추출 규칙

- `AGENTS.md` 는 agent 작업 지시의 짧은 목차이며, 상세 기록 양식과 필드 정의는 tracked repo 문서로 분리한다.
- 모든 bounded 업무 작업은 결과물과 함께 promotion-ready 근거를 tracked `_workmeta` 경로에 남긴다. 채팅 기억, 구두 합의, ignored runtime log 만으로 끝내지 않는다.
- AI 작업자는 commit message, activity event, worklog, review packet 의 작업자 표기에 도구와 모델을 함께 남긴다. 예: `codex_gpt-5.3`, `claude_fable-5`.
- (2026-06-13 owner 지시로 변경, 2026-06-24 handoff 조건 보정) Codex 가 main 에서 작동하므로 AI 도구도 **main 직접 작업 허용**으로 통일한다. 매 슬라이스 후 commit(작업자·모델 표기) + push 로 Codex 가 깨끗이 이어받게 하고, self-verify(node:test 전건 + verify_gate Level ≥1)를 남긴다. handoff 체크포인트는 위 연속성 제약 ③ 조건에 해당할 때만 남긴다. 동시 편집 충돌 방지를 위해, 작업 전 트리 안정성(HEAD 고정·index.lock 부재·외부 worktree 분리)을 확인하고 외부가 같은 트리를 동시 편집하는 징후가 있으면 중단·보고한다. (이전 규칙 — `claude/<task-slug>` 전용 branch·main 미 push — 는 본 지시로 폐지. 단 sandbox 에서 origin push 가 막힌 프로필은 commit 까지만 하고 push 는 owner/Codex 가 수행.)
- 다만 `public-only` bootstrap/review 세션처럼 `_workmeta/` write access 가 없는 프로필에서는 owner-only 경로 생성을 전제로 삼지 않고, public-safe 결과와 follow-up note 만 남긴다.
- 프로젝트별 기본 기록 surface 는 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md`, `_workmeta/<project_code>/reports/procedure_capture/procedure_capture_worklog.md`, `_workmeta/<project_code>/reports/procedure_capture/promotion_candidate_register.md` 이다.
- 각 task 는 repeatable steps, decision criteria, folder/packet/data shape, completion criteria, next action 을 남겨서 later promotion to `skill`, `workflow`, `mission`, `role_or_class`, `data_contract` 가 가능해야 한다.
- project-local 을 넘어서는 reusable entity/relation pattern 이 보이면 `ontology` candidate 도 함께 검토하고, cross-project candidate 는 `guild_hall/state/operations/soulforge_activity/**` carry-forward 와 foundation ontology manual 로 이어준다.
- 상세 기록 계약은 `_workmeta/PROCEDURE_CAPTURE_RULE.md` 에 둔다.

## Secret 취급 규칙

- `.env`, token, password, cookie, session, credential JSON 같은 secret 파일은 agent 가 내용을 열어 읽지 않는다.
- secret 파일이 필요하면 agent 는 파일 경로와 대상 경로만 안내하고, 사용자가 직접 복사/입력하게 한다.
- bootstrap/이전 작업에서 agent 는 secret 파일의 존재 여부만 점검할 수 있지만, 값을 출력하거나 요약하지 않는다.
- secret 값을 다른 PC 로 옮길 때도 agent 는 “어느 파일을 사용자가 직접 열어 복사해야 하는지”만 안내한다.

## 문서 원칙

- 루트 `README.md` 는 상위 지도를 제공합니다.
- `docs/architecture/foundation/` 는 구조 목적과 owner 경계를 고정합니다.
- `docs/architecture/guild_hall/` 는 `guild_hall` cross-project 운영 owner 문서를 다룹니다.
- `docs/architecture/workspace/` 는 `_workspaces` 및 `_workmeta` 계약을 다룹니다.
- `docs/architecture/ui/` 는 root-owned UI 계약을 다룹니다.
- owner-local 설명과 owner boundary 설명은 각 루트 `README.md` 아래에 담습니다.

## README 동기화 규칙

- 폴더 책임이나 구조가 바뀔 때는 해당 `README.md` 를 같은 변경 안에서 갱신합니다.
- 구조 변경이 상위 owner 경계를 건드리면 루트 `README.md` 와 `docs/architecture/**` 문서도 함께 갱신합니다.
- `.registry/**`, `.unit/**/unit.yaml`, `.workflow/**`, `.party/**`, `docs/architecture/workspace/examples/**` 의 변경은 관련 계약 문서와 동시에 조율합니다.

## CHANGELOG 규칙

- public repo 에 구조/기능/설치 흐름/운영 규칙 변경이 있으면 루트 `CHANGELOG.md` 를 같은 변경 안에서 갱신합니다.
- private repo 에 continuity data plane 규칙이나 private 운영 흐름 변경이 있으면 `private-state/CHANGELOG.md` 를 같은 변경 안에서 갱신합니다.
- secret 값과 업무 원문은 changelog 에 적지 않습니다.

## 제외 원칙

- top-level relocation stub 는 만들지 않습니다.
- old archive, old checklist, working log 은 active canon 에 포함하지 않습니다.
- `_workspaces/<project_code>/` 실자료는 public tracked tree 로 올리지 않습니다.

## 커밋 원칙

1. 문서와 구조를 같은 커밋에 묶습니다.
2. 범위를 넘는 정리는 따로 나눕니다.
3. 커밋 전에는 status 와 diff 를 다시 점검합니다.
4. 커밋 메시지는 한글을 우선하며, scope 가 분명하면 영어 prefix 를 허용합니다.

## 한 줄 규칙

Soulforge의 정본은 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `guild_hall`, `_workspaces` 와 그 계약 문서입니다.
