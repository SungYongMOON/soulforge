# 개발팀 ERP — DESIGN.md (설계 정본 v0)

- 작성: 2026-06-12, owner 결정 반영 (claude_fable-5 초안)
- 지위: 사람용 설계 정본. 기계용 작업 큐는 `checklist_phase1.json` 이 소유.
- 갱신 규칙: 결정이 바뀌면 이 문서를 먼저 고치고, 체크리스트는 여기서 파생한다.

## 1. 한 줄 정의

하드웨어/체계공학 개발팀의 운영 레이어. Soulforge 메타데이터를 읽고, 구매·재고
같은 신규 도메인만 자체 DB 로 소유하며, 원문 파일은 포인터로만 연결한다.

## 2. 확정 결정 (P0, 2026-06-12 owner)

| 항목 | 결정 |
| --- | --- |
| 호스팅 | 파일럿: owner PC localhost → 검증 후 사내망 `tool_pc`(고성능PC) 이전. 이전 시점에 회사 보안 규정 확인 |
| 공개 범위 | owner 단독 파일럿(1~2주) → 팀 읽기 전용 → 쓰기 개방 |
| Smartsheet | 구독 유지 + read 전용 연동. 같은 시트의 쓰기 주체는 항상 하나(사람 또는 단일 자동화). write 자동화는 P5 별도 결정 |
| 개인정보 | 집계/비식별 화면 우선. 개인 원자료는 회사 규정·권한 확인 후 (wants.md 원칙) |
| 앱 구조 | **완전 신축.** 기존 UI(renderer-web, team-ops-board 등)는 모체로 쓰지 않음. 검증된 코어 로직(감사로그/CSV 패턴)만 부품으로 재사용 가능 |
| UI 방향 | 실사용자 사용성 최우선. 업무 모드 기본 + **판타지 스킨**(전장/던전) 토글 |

## 3. UI 원칙 — "진실 1개 + 뷰 2개 + 파생 게임 상태" (2026-06-12 owner 우려 반영 개정)

라벨만 바꾸는 단일 스킨은 채택하지 않는다 (이도저도 아닌 화면이 되는 실패 모드).
대신 같은 데이터 위에 성격이 다른 뷰 2개를 분리해 짓는다.

1. **업무 뷰 (도구)**: 팀원이 설명 없이 10초 안에 자기 일을 찾는 밀도 높고 차분한
   화면. **게임 코드 0%** — 게임 기능이 커져도 업무 화면은 무거워지지 않는다.
   모바일/외근 조회 고려. 선택적으로 가벼운 lexicon 토글(용어만)은 허용.
2. **전장 뷰 (게임 상황판)**: 별도 화면/페이즈. 열린 할일 수만큼 몹이 쌓이는 전장,
   과제 진행률 = 보스 체력 게이지, 처치(완료) 시 점수·기록. 용어는
   SHARED_GLOSSARY 대조표 사용. v0 는 read-only 시각화 + "처치 보고" 같은
   핵심 액션만, 상세 작업은 업무 뷰로 점프.
3. **파생 게임 상태**: 점수/기록/레벨은 저장하지 않고 **이벤트 로그에서 계산**한다
   (read-model). ERP 코어는 게임의 존재를 모른다. 규칙 변경 시 재계산으로 해결
   (battle_log → 승급 사상과 동일). 전제: P1 부터 모든 상태 변화 이벤트 로그를
   빠짐없이 쌓는다.
4. **점수 설계 가드 (2026-06-12 owner 정정)**: 누가 수행했는지는 **반드시 기록**한다
   (개인 수행 이력은 필수 데이터). 개인 랭킹 화면도 허용. 단 목적은 승급 판단·
   업무 부하 확인·지원이며 감시/자동 평가가 아니라는 원칙은 유지 — 화면 문구와
   사용 규칙에 명시한다.
5. 화면 수 최소: 페이즈마다 "화면 1~2개 + 패널" 이상 늘리지 않는다. 전장 뷰는
   P2 이후 별도 페이즈(P-G)로만 착수한다.
6. **IA 그룹 (2026-06-12 owner 지시로 신설)**: 메뉴는 평면 나열 금지, 5그룹 고정 —
   운영(홈/할일/게이트/검색) · 기록·이력(메일/회의록/보고서/산출물) ·
   자재·구매(구매/재고/보드BOM/부품감시) · 지식·도구(RAG/계산기/연락처) ·
   팀(개발요청함/투입분석). 미가동 칸도 컬럼 구조+페이즈 태그로 선행 노출.
7. **UX 보정 상시 트랙**: 모든 페이즈 체크리스트에 UX 항목(밀도, 동선, 라벨,
   피드백 반영)을 최소 1개 포함한다. owner 화면 피드백은 편집자P 패턴대로
   즉시 체크리스트 신설 항목으로 흡수한다 (run3 칸 노출, run4 IA 그룹이 선례).

## 4. 아키텍처 (보고서 4·8절 요약)

- 3존: 읽기존(Soulforge projection, read-only) / 쓰기존(ERP 자체 DB: 구매·재고·
  요청함·계산기) / 포인터존(원문은 보호 저장소, ERP 는 포인터+SHA-256+권한+감사).
- 스택: Node.js 서버 + SQLite(파일럿) → 팀 동시 쓰기 시점에 PostgreSQL 검토.
  Docker 불필요(파일럿). 프론트는 단일 웹앱.
- LLM 분리: 코어는 LLM 0%. AI 는 `ai_jobs` 큐(테이블)로만 — 워커가 구독
  CLI/API 로 처리해 "제안" 으로 반환, 사람이 승인해야 DB 반영.
- Codex 할일 스레드 연결 규칙(2026-06-19 owner): ERP 할일의 `대화` 버튼이
  Codex 스레드를 만들 때, 사람이 보는 스레드 제목은 `[과제번호] 할일명` 으로
  한다. 같은 과제 안에 같은 할일명이 중복될 때만 제목 끝에 `· 짧은할일ID`
  를 붙인다. 실제 연결 정본은 제목이 아니라 `core_item.id -> codex_thread_id`
  저장값이다. 할일명이 바뀌어도 같은 Codex 스레드를 계속 재사용하고,
  ERP 는 `project_code`, `task_title`, `thread_title`, `last_synced_at` 같은
  보조 메타만 함께 보존한다. 기존 ERP 챗봇 로그와 할일 전용 Codex 스레드는
  섞지 않는다.
- Codex 할일 bridge 기본 운영형(2026-06-19 pilot): 작업용 PC 브라우저는 ERP
  서버의 `/api/codex-task/*` 만 호출하고, ERP 서버 PC 가 내부 stdio
  `codex app-server` 프로세스를 시작/재개한다. 기본값은 실제 `app-server`
  bridge 이며, UI/API smoke test 는 `DEV_ERP_CODEX_TASK_BRIDGE=mock` 으로만
  켠다. Codex 호스트 설정에 과거 `service_tier=priority` 값이 남아 있는
  테스트 PC 는 전역 설정 파일을 바로 수정하지 않고
  `DEV_ERP_CODEX_SERVICE_TIER=fast` 로 app-server 실행만 보정할 수 있다.
  `flex` 는 기본 비용 정책으로 UI/API 에 표시하지만 app-server turn 요청에는
  명시 override 로 보내지 않는다. bridge 는 기본 읽기 전용/승인 없음으로
  시작하며, 실제 파일 수정 권한은 별도 운영 정책으로 승격한다.
- ERP work lifecycle rule (2026-06-28 AX hook slice): ERP item status buttons are
  the canonical start/completion surface. `open -> doing` records metadata-only
  work start, and `non-done -> done` records metadata-only work completion plus
  the existing completion log. Codex task threads are auxiliary evidence for
  digest/candidate enrichment and do not decide task completion.
- Codex task panel capability rule (2026-06-19 pilot): the small task panel may
  pass model and reasoning effort overrides to `codex app-server`, and pass only
  non-default service tier overrides that the host app-server accepts;
  `/` or `$` skill autocomplete is backed by local `SKILL.md` metadata and is
  sent as real `skill` input. Image attachments are saved under
  `_workspaces/system/dev-erp/codex-task-attachments/**` and sent as `localImage`
  input. (2026-07-03 owner 지시로 개정) Allowlist 문서/데이터 파일 첨부도 같은 로컬
  첨부 루트에 `localFile` 로 저장되며, 파일 payload 는 모델 API 로 전송하지 않고
  메시지에 **로컬 경로 참조**만 붙인다 — Codex 가 read-only 샌드박스에서 그 경로를
  직접 읽는다. 실행형 등 allowlist 밖 확장자는 400 거부. Real
  collab subagents work in app-server turns, but durable Codex worker-thread
  creation is not exposed to this app-server runtime; `$soulforge-codex-thread-manager`
  therefore reports `thread tools unavailable` unless a future host-side broker
  is explicitly designed and authorized.
- 권한: 파일럿은 localhost 단독(로그인 없음) → 팀 공개 시 Google Workspace
  도메인 제한 + RBAC(팀장/팀원) + 열람·삭제 감사로그.
- 데이터 보관: ERP DB 는 매일 dump 백업(3-2-1), 파일은 DB 에 넣지 않음,
  projection 은 재생성 가능하므로 백업 불필요, 민감 데이터는 별도 테이블+감사.

## 5. 모듈 지도와 페이즈

| 페이즈 | 범위 | 비고 |
| --- | --- | --- |
| **P1 읽기 콕핏** | 프로젝트 홈, 할일/마감 리스트, 메일 이력, 산출물 포인터, 현장 검색 뷰어, 스킨 토글 | 전부 read-only, 기존 메타 재사용 |
| P1.5 | 계산기 모음 v0 (2~3개), 개발요청함 thin UI | 저위험 early win |
| P2 | 구매/발주/납기/업체 이력 (첫 쓰기 도메인) | RBAC 선행 |
| P3 | 보드 묶음(BOM/회로도/Gerber 포인터), 랙 재고, stock watcher | PLM-lite |
| P4 | stage gate 강제, 보고서/연구노트/업무일지 생성기 연결 | `.mission`+skill 재사용 |
| P5 | Smartsheet read 동기화, Google Calendar, 투입률 분석(집계) | 개인정보 규칙 선행 |

## 6. 비목표 (당장 만들지 않음)

회계/재무/급여, 메일 raw/html/첨부 payload의 ERP 복제 저장, 문서 편집기, Smartsheet write,
완전 자동 인사 평가, 다국어, 외부 인터넷 공개 배포.

메일 본문 텍스트는 예외적으로 dev-ERP runtime DB `core_mail.body_text`에 정규화 텍스트로 저장할 수 있다.
단, `_workmeta` 원장/후보큐/보고서/할일 장부에는 본문을 복사하지 않고, raw HTML, provider raw payload, 첨부 payload는 저장하지 않는다.
메일 목록/전역 검색 API는 `body_preview`, `body_text_available`, `body_text_len`만 반환하고, 전체 `body_text`는 단일 메일 상세 조회처럼 기존 메일 접근권한을 통과한 경로에서만 반환한다.

## 7. 데이터 모델 기본틀 (2026-06-12 owner DB 질문 반영)

근거: World Bible §9 (몬스터 필드의 80%는 업무 필드), ONTOLOGY_MODEL_V0
(10개 개체·12개 관계), PLAY_LOOP_V0 (monster_id 유지 + project_monster_ref,
battle_event 최소 필드, intervention_count/bottleneck_reason 지표).

```text
[core_*  — 업무 진실, 게임을 모름]
  core_project(던전)  core_stage(스테이지, gate_rule_ref)  core_person
  core_item(몬스터=할일): origin(mail/schedule/manual),
    spawn_kind(spawned/fixed/respawn), encounter_role(normal/elite/boss),
    difficulty, urgency, automation_level(수동/보조/반자동/자동),
    assignee_ref, party_ref, status, due, result, log_ref
  core_vendor / core_order / core_stock  (P2+)

[event_log — append-only 단일 사건 기록 (battle_event 호환)]
  at, actor_ref, actor_kind(human/ai/mixed), item_ref, kind,
  from→to, intervention_count, bottleneck_reason, note,
  used_refs[] (사용한 skill/workflow/knowledge/tool — World Bible battle log
    "사용한 도구/지식 소스" 필드의 구현),
  data_label (synthetic/real, draft/confirmed 등 — 학습/보존 분류용)

[guide_* — 가이드형 워크플로우 (run13, SE 절차의 화면화)]
  guide_artifact(project_id, stage_code, name): 단계별 산출물 등록
  guide_step(artifact_id, step_key, done_at, actor): 7스텝 체크 상태
  출처 = .registry/skills/se_foldertree_generate SE_FolderTree_Guide v0.7.
  단계 코드(030 SRR~240 LL)와 스텝 순서(snapshot→원자료→Work→Review→
  Action→Out(완료판정)→Quality)는 src/guide.mjs 한 곳에만 정의 —
  "폴더 순서 = 업무 순서" 원칙을 UI가 그대로 따른다(폴더트리가 곧 위저드).
  체크/해제는 event_log 에 used_refs+data_label 로 기록.

[game_* — 게임 전용 확장 (core 는 game 을 참조하지 않음)]
  game_profile(item_ref 1:1 nullable): 외형/스프라이트/설명/등급 오버라이드
    → "몬스터 정보 설정/편집" 화면은 이 테이블의 CRUD
  game_rule(버전 관리되는 점수 규칙)
  game_score / game_record: event_log 에서 계산되는 파생 캐시 (재계산 가능)
```

4원칙:

1. 몬스터 = 업무 레코드 동일 행. 테이블 분리 금지 (이중 진실 방지).
2. 게임 전용은 확장 테이블. core 쿼리는 `game_*` 를 join 하지 않는다 — ERP
   성능·복잡도 영향 0. 게임 모듈 제거 시 `game_*` 만 drop 하면 된다.
3. 점수/기록은 저장하지 않고 event_log 에서 계산 (규칙 변경 = 재계산).
4. 연결은 stable id + ref 문자열 (Soulforge ontology refs 방식 그대로,
   PLAY_LOOP 의 monster_id 유지 규칙 준수).

통합 결정: **보스전 = stage gate 동일 개체.** 보스 체력 = 해당 스테이지의
미완 필수 산출물/몬스터 수. 업무 뷰는 게이트 체크리스트로, 전장 뷰는 HP
게이지로 표현만 달리한다. 점수 체계는 intervention_count 기반 — 게임 기록이
곧 자동화 승급(수동→자동) 판단 데이터가 된다 (World Bible Phase 2).

**라벨링 우선 원칙 (2026-06-12 owner 지시)**: 지식/파티/스킬/워크플로우 등
모든 자산의 사용 사건에는 "누가, 언제, 무엇으로, 몇 번째" 라벨을 장착한다
(`used_refs[]` + `data_label`). 목적: ① 쓰레기 데이터 누적 방지와 구분
(버릴 것/남길 것 라벨로 식별) ② 사용 빈도 분석 ③ 향후 학습용 데이터 추출
효율. 학습 자체는 현재 범위 밖 — 지금은 라벨 자리만 판다. 시스템 전반의
같은 줄기는 로드맵 후보 11(workflow/skill 사용 ledger)이 소유하고, ERP
event_log 는 그 라벨의 수집기 역할을 겸한다.

**구조 변경 위임 (2026-06-12 owner)**: 효율을 위해 프로젝트 구조 변경이
필요하다고 판단되면 수행해도 된다. 단 ① 변경 규칙을 이 문서/해당 owner
문서에 적고 ② 변경 사유를 변경 이력에 기록한다.

## 변경 이력

- 2026-06-12: 초안 작성 (P0 결정 5건 반영).
- 2026-06-12: 3절 개정 — 단일 스킨 → "진실 1 + 뷰 2 + 파생 게임 상태"
  (사유: 한 화면에 두 성격을 섞으면 이도저도 아니게 되는 실패 모드 방지,
  owner 우려 반영).
- 2026-06-12: 점수 가드 정정 — 개인 수행 기록 필수, 랭킹 화면 허용
  (사유: owner 명시 지시. 감시 아닌 승급/지원 목적 원칙은 유지).
- 2026-06-12: 3절에 IA 5그룹과 UX 상시 트랙 신설 (사유: owner 지적 — 평면
  메뉴는 판단 불가, 분류 필요. 전체 칸 선행 노출과 함께 적용).
- 2026-06-12: event_log 에 used_refs/data_label 추가, 라벨링 우선 원칙 신설
  (사유: owner 의 메타데이터/학습 데이터 관리 비전 — 쓰레기 누적 방지와
  사용 분석 가능 구조. World Bible battle log 필드의 구현이기도 함).
- 2026-06-12: guide_* 구역 신설 — 가이드형 워크플로우 v1 (사유: owner 1순위
  UX 원칙 "위에서 아래로 따라 하면 되는" + run12 툴 정체성 리서치 결론
  '폴더트리가 곧 위저드'. 저장소 SE 폴더 규칙의 단계·역할 순서를 화면이
  그대로 따름. 구조 변경 위임 규칙에 따라 기록).
- 2026-06-12 (run16): P2a 할일 쓰기 + 과제 허브 (사유: owner "진행해" 승인,
  P2 순서 제안 approved — 할일 쓰기를 구매보다 먼저). core_item 에
  guide_artifact_id/guide_step_key/origin_mail_id/created_by 추가,
  event_log 에 project_ref 차원 추가(과제별 이력 — NetSuite 다차원 원칙).
  RBAC 는 created_by/assignee_ref/actor_ref 필드 설계만 — 로그인·권한
  강제와 팀 공개는 P2b. actor 는 solo 파일럿 전제로 "owner" 고정.
- 2026-06-12 (run17): 메일 과제 분류(재배정) — 단건/묶음, INBOX 트리아지
  (사유: owner 승인+추가 요구). 경계 결정: **몬스터=core_item 행 원칙 유지**
  — 분류 자체는 메일 이동이고, 분류 시 "할일도 생성" 체크(기본 ON)가
  몬스터 출몰을 만든다. 이미 승격된 메일을 재배정하면 연결 할일도 동행
  이동(item_move 이벤트, PLAY_LOOP id 유지 준수). 출몰 연출은 표시 계층
  (CSS, 진실 무관). 분류 후 랜딩: 업무=허브 메일 탭(owner 지시),
  판타지=전황 탭(출몰 연출) — 뷰 2개 원칙 안에서의 모드별 분기.
- 2026-06-19: Codex 할일 스레드 연결 규칙 추가 — 스레드 제목은
  `[과제번호] 할일명`, 저장 정본은 `core_item.id -> codex_thread_id`.
  기존 ERP 챗봇과 할일 전용 Codex 스레드를 분리한다.
- 2026-07-02 (claude_fable-5): 메일→할일 자동 인입 사이클 추가 (사유: owner 지시
  "행보관 자동화 단계까지"). 수집 완료 훅(opt-in, DEV_ERP_AUTO_INTAKE) →
  tools/auto_intake_cycle.mjs → classifyMailForTasks(로컬 Ollama, 메타 전용)
  → mail_to_task_ledger --auto-open → haengbogwan_run --apply-context(줄기 갱신).
  코어 LLM 0%·저신뢰 격리·lock·receipts 가드 포함. 상세: MAIL_TO_TASK_INTAKE.md 자동화 절.
- 2026-07-02 2차 (claude_fable-5): 인입 알고리즘 최적화 3건 — ① not_task 고신뢰 판정의
  no_action 영수증 기억(재판단 루프 수렴, 공용 작성기 tools/mail_receipts.mjs) ② 분류
  프롬프트에 줄기 메타 요약 주입(맥락 인지 분류) ③ haengbogwan_run 브랜치 힌트를 KVDS
  하드코딩 → 프로젝트 규칙 파일 우선 + 계약 Branch Seeds 폴백으로 일반화(타 과제 줄기
  오염 제거). 운영은 Codex 소유, 이 슬라이스는 알고리즘 계층만.
- 2026-07-03 2차 (claude_fable-5): 대화 첨부 저장 규칙 확정(owner 지시) — 정본:
  docs/architecture/workspace/CHAT_ATTACHMENT_STORAGE_V0.md. 과제 워크스페이스가 있으면
  `_workspaces/<과제코드>/대화첨부/<할일명 축약>/원본파일명`(충돌 시만 짧은ID 접미,
  스레드 제목 규칙 선례) + 폴더당 첨부_manifest.json(item_id 바인딩·sha256·시각),
  미존재 시 legacy system 루트 폴백. 기존 첨부는 이동하지 않음.
- 2026-07-03 (claude_fable-5): 대화창 입력 확장(owner 지시) — ① 마이크 받아쓰기:
  챗봇·Codex 할일 대화 입력에 브라우저 SpeechRecognition(ko-KR) 토글 버튼. 서버
  전송/저장 없음(입력창 텍스트로만), 브라우저 벤더 서버 처리 가능성을 툴팁으로 고지,
  미지원 브라우저는 버튼 비활성. ② Codex 대화 파일 첨부: 이미지 전용 → allowlist
  문서/데이터 파일로 확장(위 capability rule 개정 참조). 챗봇에는 파일 첨부를 붙이지
  않음 — 챗봇은 매뉴얼 검색 기반이라 파일을 읽지 않으며, 파일을 읽는 대화 상대는
  Codex 창이라는 역할 구분 유지.
- 2026-07-04 (claude_fable-5): 사내망 직접 HTTPS(owner 승인 — LAN HTTP 파일럿에서 전환) —
  `data/tls/server.crt`+`server.key` 존재 시 같은 포트 TLS polyglot(첫 바이트 0x16 스니핑):
  평문은 https 301(예외: `/api/health` 모니터링 프로브 보존, `/dev-erp-ca.crt` 신뢰 부트스트랩),
  Secure 쿠키 자동 ON, X-Forwarded-Proto: https 는 loopback 소스에서만 신뢰·통과(Tailscale
  Serve 공존, 위조 차단). zero-dependency 유지(node:https/net). 커밋 전 적대검토 확정 4건 반영:
  ① 권장 발급 = 1회용 로컬 CA(키 즉시 삭제)→CA:FALSE leaf ② CA:TRUE 상주키 인증서는 앵커
  배포 404 차단+시작 경고(X509Certificate 검사) ③ 시작 로그에 앵커 SHA-256 지문 출력, 팀 PC
  는 certutil 대조 후 설치(평문 다운로드 무결성 보강) ④ 테스트 하네스 DEV_ERP_NO_TLS=1 기본
  격리(TLS-001 만 opt-in). 동기: LAN 접속 마이크 차단(secure context)과 비번·쿠키 평문 노출
  동시 해소. 런북 3.4/6절 + TLS-001 테스트.
- 2026-07-04 2차 (claude_fable-5): 아침 브리핑 push v1(owner 승인 — 팀 정착 진단 '재방문 루프'의
  push 조각) — src/morning_brief.mjs: 계정별 지연/오늘 마감/차단/내게 온 제안(미분류
  suggested_assignee_ref) 집계('내 일' 규약 accountIdentities 재사용), 행동 걸이 0건이면
  발송 스킵(소음 방지). 발송은 guild_hall mail_send 캡슐 재사용(SMTP 재구현 없음,
  MAIL_SEND_STYLE_POLICY_V0 approved_automation 등재, EMAIL_SEND_ENABLED 는 spawn 한정 주입).
  스케줄: DEV_ERP_MORNING_BRIEF=1 + HHMM(기본 0800), 완주(to=ok)까지 하루 3회·10분 간격
  재시도, 계정별 morning_brief_sent 멱등(성공분 이중발송 없음). API: GET /api/brief/preview(본인),
  POST /api/admin/brief/send-test(관리자 본인 강제 재발송 — 배포 검증용). 커밋 전 적대검토
  확정 7건 반영: ① 제안 버킷 SQL 직행(팀 전체 limit 절단이 최신 제안부터 누락) ② 발신 명의
  관리자 계정 한정(팀원 자격증명 폴백 금지) ③ 수신 도메인 allowlist 코드 강제(정책 '팀 내부
  한정' 이행) ④ 본문 임시파일 전달(argv 32K 동기 throw 실측) ⑤ 계정별 오류 격리 ⑥ 스케줄러
  store 호출 try 내부화(unhandled rejection 서버 전면 다운 방지) ⑦ bat 발송 기본값 제거
  (bat 인코딩 붕괴로 4300 가드 신뢰 불가 — ops ps1 이 정경로). BRIEF-001/002/003 테스트.
- 2026-07-04 3차 (claude_fable-5): 지식 표면 연결 + 줄기 그래프(owner 지시 — "위키/RAG 가 ERP 에
  안 보인다, 무엇이/언제/얼마나 + 그래프로") — 지식 화면(mod:knowledge)을 4탭으로 개편:
  ① 서가 현황(/api/knowledge/overview, src/knowledge_overview.mjs): 공통(체계공학·표준)/도메인/
  과제별 계층 집계 + 수집 영수증·후보 장부 타임스탬프(언제) + knowledge_access 원장 rollup
  (얼마나 — 자동 기록 미배선임을 화면에 정직 표기) ② 위키: 목록 + 본문 뷰어. 본문은 knowledge
  shell metadata-only 계약의 owner 승인 예외(2026-07-04, 로그인 팀 한정, .md 페이지만, chunk/raw/
  원문 차단 유지 — KARPATHY 계약 문서와 contract 상수에 wiki_body_exception 등재) ③ 줄기 그래프
  (/api/context/graph, src/context_graph.mjs): _workmeta/<과제>/project_context CSV(이미 노드-엣지)
  를 읽어 trunk 중심 방사형 SVG 렌더(가지 크기=소스 수, 배지=미결 리뷰, 클릭→하위 이벤트·할일
  목록). 읽기 전용 — 쓰기는 행보관만 ④ 기존 FAQ·매뉴얼 유지. + owner 지식그래프 익스포터
  (guild_hall/knowledge_graph) 산출물을 /knowledge-graph/** 로 서빙(로그인 한정, html/js/json/css 만)
  — '지식 그래프(3D) 열기' 버튼. KNOW-OV-001~003 + CTX-GRAPH-001 테스트.
  커밋 전 적대검토(9-agent) 확정 6건 반영: ① overview 서버 60초 TTL memo + 클라 세션 캐시
  (요청당 ~2s 동기 풀스캔이 이벤트루프 블로킹 + 탭 전환마다 재스캔 → critical) ② 위키 스캔이
  대형 비-위키 디렉터리(source_cards 1,286·인덱스 1,298) 가지치기(22,843 lstat→위키 3페이지 낭비)
  ③ 서가 깊이 캡 초과 시 truncated=true + UI '≈' 표기(조용한 누락 방지) ④ 줄기 가지 40캡을
  중요도(소스+할일+미결) 정렬 후 적용 + '+N개 생략' 표기(임의 CSV 순서 절단이 최중요 가지를
  숨김) ⑤ 과제 열거를 _workmeta ∪ _workspaces 로(운영본 _workmeta=INBOX 만이어도 공유 정션 과제
  위키 노출) + context root 를 KNOWLEDGE_SHELL.root 로 일원화 ⑥ readWikiPage 실경로 containment
  (Windows junction 이 심링크 가드 통과). 런북 9절에 지식 데이터 평면(공유 정션 vs _workmeta) 명시.
  KNOW-OV-004/005 추가.

## 9. owner 방향 (기록만 — 구현 금지 상태)

- 2026-06-12 owner: **"프로젝트 안에 산출물이 들어 있어야 한다 — 프로젝트별로."**
  과제(프로젝트)가 컨테이너가 되고, 그 과제의 산출물(SE 8단계 산출물 등)이
  프로젝트 하위에 묶이는 구조를 원함. 현재 데이터는 이미 프로젝트 종속
  (guide_artifact.project_id, artifact.project_id)이나 IA 가 가이드/산출물
  별도 메뉴로 분리되어 있음 — 격차는 화면 구조(IA) 쪽.
  ~~상태: 방향 기록만~~ → **2026-06-12 owner "진행해"로 승인, run16 에서
  과제 허브(개요/산출물/메일/이력 탭)로 구현 완료.** 데이터 이동 0
  (리서치 하이브리드 권고 채택: 저장=관계형 유지, 표시=컨테이너).
  선행 리서치: _workspaces ERP_분류체계_비교 문서.
- 2026-06-12 owner: **회계(accounting) = 보류(later).** 지금은 비목표 유지,
  "나중에 채우자"로 명시. 6절 비목표와 일관 — 차원(태그) 원칙만 event_log
  로 선반영되어 있고, 회계 모듈 자체는 owner 가 다시 열기 전까지 안 만든다.
- 2026-06-13 owner: **LLM 레인 데이터 경계 확정 (P4 갈림길① 해소).**
  1차 백엔드 = Codex CLI(구독) 헤드리스 로컬 브릿지, 어댑터는 전환형
  (codex|local|none — 추후 tool_pc 로컬 모델 교체 가능). 전송 컨텍스트는
  **메타/요약만**(필드 화이트리스트 코드 강제, 메일 원문·민감 필드 금지),
  이 메타/요약이 Codex 경유로 OpenAI 에 전송됨을 owner 가 인지·승인.
  DB·원문·ingest 의 "외부 전송 0" 가드레일은 불변 — 예외는 이 LLM 레인
  하나뿐. 모든 호출은 event_log(kind=llm_call) 기록. P4 에 **ERP 챗봇
  v1(읽기 전용)** 슬라이스 추가 — 상세는 docs/PLAN_P4_HARNESS_20260613.md.
  상태: 계획만 — 빌드/실연결은 별도 지시 대기.
- 2026-06-13 owner: **연속성 제약 (영구).** 주 개발 환경은 Codex — 이
  모델(강한 모델, 한정 윈도우)의 모든 산출물은 윈도우 종료 후 Codex 가
  그대로 이어받아 유지보수 가능해야 한다. 적용: ① 지침 정본=AGENTS.md
  (CLAUDE.md 는 포인터) ② 하네스 도구 비종속(표준 Node/CLI — dev-erp 의
  zero-dependency 설계와 정합) ③ 페이즈 끝·윈도우 종료 시
  NIGHT_WORK_HANDOFF 체크포인트 ④ 결정·맥락은 PLAN/DESIGN/packet 문서화
  ⑤ 챗봇 백엔드=Codex CLI 도 이 제약과 정합. AGENTS.md 상단 메모 동기.

## 8. 빌드/검증 방식

- 방법론: SDD 형식 + 편집자P 속도 요소 + Soulforge 거버넌스 (보고서 9절).
- 페이즈 1개 = dev_worker packet 1개 + 체크리스트 JSON 1개 + 전용 브랜치 +
  종료 inspector. bypass-permissions 미사용.
- 체크리스트 항목 status: todo / in_progress / done / blocked. blocked 는
  사유와 함께 명시적으로 남긴다.
- 페이즈마다: 합성 fixture 로 화면 검증 + 코어 node:test + 토큰/시간 기록.
- 사람-판단 항목(스킨 기본값, 화면 우선순위, 권한 정책)은 agent 가 채우지 않고
  owner 질문으로 남긴다.
