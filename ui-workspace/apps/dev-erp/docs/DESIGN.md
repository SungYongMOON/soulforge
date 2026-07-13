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

- 3존: 본체존(Soulforge `_workspaces`, 유일한 프로젝트/대화/첨부 owner) /
  ERP존(껍데기·read model과 ERP 자체 DB) / worker존(재생성 가능한 static cwd와
  single-active turn projection). NAS는 backup/restore 전용이며 live body가 아니다.
- 스택: Node.js 서버 + SQLite(파일럿) → 팀 동시 쓰기 시점에 PostgreSQL 검토.
  Docker 불필요(파일럿). 프론트는 단일 웹앱.
- LLM 분리: 코어는 LLM 0%. AI/규칙 산출은 `ai_proposal` 큐(테이블)로만 —
  `/api/proposals` 로 pending 적재, 사람이 승인해야 DB 반영(approve/reject).
- Codex 할일 스레드 연결 규칙(2026-06-19 owner): ERP 할일의 `대화` 버튼이
  Codex 스레드를 만들 때, 사람이 보는 스레드 제목은 `[과제번호] 할일명` 으로
  한다. 같은 과제 안에 같은 할일명이 중복될 때만 제목 끝에 `· 짧은할일ID`
  를 붙인다. 실제 연결 정본은 제목이 아니라 `core_item.id -> codex_thread_id`
  저장값이다. 할일명이 바뀌어도 같은 Codex 스레드를 계속 재사용하고,
  ERP 는 `project_code`, `task_title`, `thread_title`, `last_synced_at` 같은
  보조 메타만 함께 보존한다. 기존 ERP 챗봇 로그와 할일 전용 Codex 스레드는
  섞지 않는다.
- Codex 할일 bridge 운영형(2026-07-10 보강): 작업용 PC 브라우저는 ERP 서버의
  `/api/codex-task/*`만 호출한다. 실제 운영에서 ERP HTTP/메일 Windows identity는
  `DEV_ERP_CODEX_TASK_BRIDGE=worker`로 loopback 전용 broker를 호출하고, 별도 저권한
  Codex worker Windows identity만 내부 stdio `codex app-server`를 시작/재개한다.
  ERP는 worker URL이 정확한 `http://127.0.0.1:<port>`인지 확인하고, 실제 turn
  직전·직후마다 worker-only Ed25519 키의 새 nonce 서명을 검증한다. owner가 고정한
  identity SHA-256, public-key fingerprint, source commit, 별도 PID, registry/home/
  projection/deny-root revision, `app-server` mode가 모두 같은 worker일 때만 결과를 저장한다.
  별도 pathless `payload_deny_binding_revision`은 ERP가 실제 effective canonical
  attachment/message lexical root 두 개로 독립 계산한 기대값과 정확히 일치해야 한다.
  양쪽 계산은 root를 stat/read하지 않으며, 형식만 맞는 다른 결박값은 거부한다.
  직접 `app-server`는 개발용이고 `mock`은 test에서만
  허용한다. worker는 호스트 전역 Codex 설정을 읽어 고치지 않는다. 설정 parse가
  실패하면 사용자가 worker identity에서 직접 고친 뒤 재시작한다. 모델은 worker
  계정의 `model/list` catalog만 허용하므로 GPT-5.6이 제공될 때 동적으로 나타난다.
  자동 선택한 5.6이 turn 직전 사라진 때만 GPT-5.5로 내리고, 사용자가 직접 선택한
  모델은 대체하지 않으며 임의 slug는 거부한다.
  worker token 원문은 전송하지 않고 request/response HMAC 키로만 쓰며, 실제 operation은
  서명된 일회용 channel nonce를 소비한다. operation body/response는 HMAC key와
  signed channel에서 HKDF-SHA256으로 파생한 key로 AES-256-GCM 암호화하고 redirect를
  거부한다. thread ID는 별도 AES-256-GCM keyring의
  `dwr2.<kid>.*` ref로 보관한다. HMAC 키 회전은 기존 ref에 영향을 주지 않는다.
  ref key는 active+previous keyring으로 단계적으로 회전하며, key를 잃은 binding은
  명시적으로 retire하고 다른 실행경로로 fallback하지 않는다. 기존 inline message/부분 binding은 coherent backup 뒤
  owner mapping 기반 migration dry-run이 완전할 때만 `--apply`한다.
- Codex 팀 작업실 규칙(2026-07-12 단일-body 교정): Soulforge `_workspaces`가 유일한
  프로젝트 본체이며 ERP runtime은 껍데기/read model이다. runtime-local ignored JSON은
  논리 `workspace_id`를 `_workspaces`가 materialize한 owner-approved local/UNC worksite에
  연결하고, 스레드는 workspace ID·revision·root fingerprint에 고정된다. raw root는
  API/DB 감사 응답에 노출하지 않는다. 대화·첨부 원본은
  `_workspaces/system/dev-erp`에만 영구 저장한다. ERP는 매 후속 메시지의 선택 첨부만
  rehash해 worker의 single-active turn projection으로 복사하고 종료 뒤 검증 삭제한다.
  worker에는 원본 경로나 canonical payload root를 전달하지 않는다. 첫 production slice는
  read-only이며 write grant를 즉시 거부한다. 각 작업실은 과제와 선택적 계정/역할
  allowlist를 가지며 새 스레드는 사용자가 직접 선택·확인한다. UI allowlist는 파일
  기밀성 경계가 아니므로 한 등록부는 같은 `trust_domain_id`만 담는다. 실제 읽기 경계는
  ERP HTTP/메일과 분리된 저권한 Codex worker Windows 계정, 전용
  `DEV_ERP_CODEX_HOME`, SMB/NTFS ACL, `dev_erp_bounded` permission profile이 소유한다.
  app-server 응답의 active profile/runtime roots/빈 instruction sources를 확인하고,
  turn-projection probe v4가 source/other-projection/junction/hardlink/network 경계를
  증명하지 못하면 worker 기동과 release를 차단한다.
  Enabled root는 local/UNC authority를 섞지 않고 UNC는 단일 share namespace만 허용한다.
  lexical/realpath/junction/share-alias overlap과 보호 이름/link는 bounded child가
  metadata-only로 검사한다. 대화/첨부 payload는 Soulforge 서비스 전용 `_workspaces` 영역에
  두고 SQLite에는 opaque pointer만 저장한다. 상세 운영은
  `docs/CODEX_TEAM_WORKSPACE.md`를 따른다.
- ERP work lifecycle rule (2026-06-28 AX hook slice): ERP item status buttons are
  the canonical start/completion surface. `open -> doing` records metadata-only
  work start, and `non-done -> done` records metadata-only work completion plus
  the existing completion log. Codex task threads are auxiliary evidence for
  digest/candidate enrichment and do not decide task completion.
- Codex task panel capability rule (2026-06-19 pilot): the small task panel may
  pass only model and reasoning-effort choices advertised by `model/list`.
  Production dedicated-worker turns disable all skills and project instruction
  discovery. 이미지와 allowlist 문서/데이터 첨부는 item-bound
  v1 manifest에 크기/hash/저장명을 기록하고 브라우저에는 opaque attachment ID만
  반환한다. 서버가 매 턴 item/size/hash/realpath를 검증한 뒤 선택 파일만 immutable
  turn projection으로 복사하고, worker는 그 projected 경로만 `localImage`/파일 참조로
  사용한다. `.hwp`는 HWPX 전처리 전에는 거부하고,
  실행형 등 allowlist 밖 확장자는 400 거부한다. app-server child는 최소 환경만
  상속하며 MCP/hooks/web search를 끈다. 첫 production slice는 read-only이고 network
  access는 false다. Real
  collab subagents work in app-server turns, but durable Codex worker-thread
  creation is not exposed to this app-server runtime; `$soulforge-codex-thread-manager`
  therefore reports `thread tools unavailable` unless a future host-side broker
  is explicitly designed and authorized.
- 권한: Codex surface는 계정 bootstrap 전과 익명 세션에서 항상 차단한다. 팀 공개는
  ERP 계정/RBAC + 작업실 과제/계정/역할 allowlist + 열람·승인 감사로그를 사용한다.
- 데이터 보관: ERP DB 는 매일 dump 백업(3-2-1), 대화 본문·첨부 파일은 DB 에 넣지
  않고 Soulforge `_workspaces/system/dev-erp`의 service-owned payload store에 둠,
  projection 은 재생성 가능하므로 백업 불필요, 민감 데이터는 별도 테이블+감사.
- 사건축/생명수 경계(2026-07-12): 메일·음성·SE 일정·ERP 작업·Codex 지시·산출물은
  각 source owner의 이력을 유지하고, dev-ERP는 metadata allowlist만 읽어
  `과제→서울 업무일→확정 맥락→사건` read model을 재생성한다. 발생·상태변경과 예정
  시각을 분리하고 날짜 미상·partial/gap을 숨기지 않는다. 파일은 경로/mtime이 아니라
  `workspace binding → logical file → revision`과 node별 observation으로 추적하는
  activation-candidate helper를 둔다. live 연결 뒤에도 단일 always-on reconciler만
  canonical projection을 쓰며 현재 scheduler/transport는 꺼져 있다. 상세 계약은
  `docs/slices/ENGINE-12-CONTEXT-LIFE-TREE.md`를 따른다.
- TaskDriver target(2026-07-13): `core_item` current state와 append-only `event_log`의
  task truth를 유지하면서, 할일/전이의 `왜`와 `왜 지금`은 exact refs를 가진 별도
  TaskDriver causal record로 잇는다. 판단/적용 상태와 실제 작업 상태를 분리하며 LLM은
  후보만 만들고 completion은 후속 Driver 후보를 조용히 auto-open하지 않는다. 현행
  runtime 지원 주장이 아닌 migration target이며 상세는
  `docs/task_engine_redesign/README.md`와 `docs/slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md`다.
- Codex 복구 경계: 일반 DB 백업과 별도로 maintenance lock 아래 ERP와 전용 worker를
  모두 중지한 뒤 SQLite DB, opaque 대화 payload, 첨부 manifest/file을 하나의
  `dev_erp.codex_payload_backup_generation.v1` generation으로 묶는다. NAS 정본 위치는
  `03_codex_payload_backups`이고, 같은 manifest SHA-256을 가진 `RESTORE_VERIFIED`는
  `04_codex_payload_restore_tests/<generation_id>`에 둔다. `--require-live` audit은
  최신 `COMMITTED` generation과 이 restore marker가 없거나, 유효하지 않거나,
  live DB/WAL보다 오래되면 fail closed 한다. 감사 결과에는 generation ID, hash,
  시각, 개수/크기, 상태만 남기며 payload 본문·파일명·raw root는 남기지 않는다.

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

- 2026-07-13 (codex_gpt-5): TaskDriver closed-loop 설계 패키지와 ENGINE-13 cold-start
  packet을 추가했다. project RAG target owner, 두 상태축, 고성능 PC cut line과 activation
  gate를 문서화했으며 runtime code나 실제 project data는 변경하지 않았다.

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
- 2026-07-05 3차 (claude_fable-5): 줄기 3렌즈 뷰(owner 지시 "마인드맵 여러 뷰를 목적에 맞게") —
  drawTrunkGraph 를 뷰 스위처 구조로 재작성. **원칙: 결정 하나당 뷰 하나(갤러리 금지).** 뷰타입
  분석 후 채택 3 / 제외 명시: ① 지도(방사형 SVG) = "전체 모양·큰 갈래 한눈에"(기존) ② 목록
  (details 접이식 아웃라인, lazy 렌더) = "각 갈래에 뭐 쌓였고 뭘 할지 읽기"(Roam/Logseq 교훈:
  실사용은 그래프보다 아웃라인) ③ 우선순위(미결리뷰 내림차순 표, 행 클릭 펼침) = "뭐부터 손대나"
  (미결 병목 직결). **제외: force-directed/3D = 결정 안 돕는 eye-candy(Obsidian 그래프 교훈).**
  서버 무변경 — g(=/api/context/graph) 하나로 3뷰 클라 파생, trunkChildTable/trunkBranchChildren
  공용화(DRY). 지식 탭(드롭다운)·과제 허브 겸용, state.trunkView 프로젝트 전환에도 보존. lexicon
  양 모드 파리티. 커밋 전 적대검토(2렌즈) 반영.
- 2026-07-11 (claude_fable-5): B10 캘린더 뷰(owner 지시 "ERP에 캘린더, 구글처럼") — 월간 그리드
  (마감 core_item.due + 일정 core_meeting.at) + 날짜 클릭 일정 생성 + 드래그 이동 + month_cal
  미니 위젯. 그리드 산출은 서버 src/calendar.mjs 순수함수(/api/calendar) — 프론트 로직 실행-테스트
  원칙. 마감 드래그는 기존 /api/items/update 재사용(due_overridden 계약). 일정 삭제는 소프트
  (core_meeting.status, F2 관례), 갱신 이벤트는 store 소유 + no-op 무이벤트(S8-4 교훈). '오늘'
  강조는 클라 로컬 날짜(브리핑 localDateKey 관례와 동일 취지). Google Calendar 연동은 P5 그대로
  범위 밖. 브라우저 e2e 검증에서 state._scopes 캐시 오염 버그 발견·수정(ensureScopes 재사용).
  정본: docs/slices/B10-CALENDAR-VIEW.md.
- 2026-07-11 2차 (claude_fable-5): B9a 가지 이야기 뷰(owner "B9a 착수", 기본값 승인) — branch_story
  API(CSV+DB 읽기전용 조인, 메일 suffix 조인, 실일시 원칙) + 지도 렌즈 ctxDetail 3단(기원/경로/종결)
  교체. 이력줄기 기원 = 시간순 첫 점(작업줄기와 단일 규칙). 착수 전 정리: B9 패킷 spawned_from
  → 실존 필드 정정(야간 리뷰 HIGH-3), SLICES_INDEX 소급 3건+B6 done. 다음 큐 = B9c.
  정본: docs/slices/B9-STEM-RIVER-VIEW.md §3·§6-1.
- 2026-07-11 3차 (codex_gpt-5, Claude 인계): B9c 줄기 모양 진단 — `/api/context/graph`에
  metadata-only `diagnostics`를 일괄 파생해 최근 52주 기록 밀도, 담당·사람 이벤트·해결 분포,
  수신 요청 상대·시기, 죽은 가지 후보를 제공. 네 번째 `진단` 렌즈와 지도 회색 표시를 추가했다.
  후속 사용 미관찰 후보는 유효 종결일+exact item 연결+종결 뒤 공유 source-ref 0+
  `completion:<item>` 완료지식 0의 관찰 판정이며, 시각 없는 관계·store 미조인·그래프/입력 잘림
  시 유보한다. 시각은 Asia/Seoul 업무일로 정규화. 개인 점수·자동 성과판정·원장 쓰기 없음. 다음 큐 = B9d.
  정본: docs/slices/B9-STEM-RIVER-VIEW.md §4·§6-1.

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
- 페이즈 1개 = dev_worker packet 1개 + 체크리스트 JSON 1개 + main 직접 작업
  (슬라이스별 commit+push, AGENTS.md 2026-06-13) + 종료 inspector. bypass-permissions 미사용.
- 체크리스트 항목 status: todo / in_progress / done / blocked. blocked 는
  사유와 함께 명시적으로 남긴다.
- 페이즈마다: 합성 fixture 로 화면 검증 + 코어 node:test + 토큰/시간 기록.
- 사람-판단 항목(스킨 기본값, 화면 우선순위, 권한 정책)은 agent 가 채우지 않고
  owner 질문으로 남긴다.

## 보고서 워크플로우 셸

- UI 는 기존 worklog/report draft generator 를 보존하고 별도 `final_polish` card 만 추가한다.
- browser payload 는 project, fixed mode, core-canonical report type/audience, opaque input handles 만 보낸다. prompt/model/skill/path/binding 선택은 없다.
- ERP orchestrator 는 canonical `runWorkflowJob` import 를 정확히 1회 호출한다. core prepared result 를 actual validator 로 검증해 그대로 저장하고 outcome/result/receipt/DB digest chain 뒤 terminal CAS 한다. artifact body writer 는 `_workspaces` payload adapter 하나, receipt metadata writer 는 companion `_workmeta` sink 하나다.
- author/verifier receipt 는 서버 발행 nonce, 독립 process/context/operation, 종료 순서, exact digest 로 묶고 human review 는 DB/runtime 모두 `required` 로 고정한다.
- 이 설계는 candidate/default-off 이다. 실제 worker adapter release, service identity, ACL/actual runtime probe, bundle/attestation digest, receipt sink, owner approval, expiry 와 live semantic evidence 없이는 활성화하지 않는다. 환경 self-attestation 만으로는 열리지 않는다.
- 상세 계약: [`slices/REPORT-AUTHORING-WORKFLOW-SHELL.md`](slices/REPORT-AUTHORING-WORKFLOW-SHELL.md)
