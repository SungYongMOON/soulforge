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

회계/재무/급여, 메일 원문의 ERP 복제 저장, 문서 편집기, Smartsheet write,
완전 자동 인사 평가, 다국어, 외부 인터넷 공개 배포.

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

## 9. owner 방향 (기록만 — 구현 금지 상태)

- 2026-06-12 owner: **"프로젝트 안에 산출물이 들어 있어야 한다 — 프로젝트별로."**
  과제(프로젝트)가 컨테이너가 되고, 그 과제의 산출물(SE 8단계 산출물 등)이
  프로젝트 하위에 묶이는 구조를 원함. 현재 데이터는 이미 프로젝트 종속
  (guide_artifact.project_id, artifact.project_id)이나 IA 가 가이드/산출물
  별도 메뉴로 분리되어 있음 — 격차는 화면 구조(IA) 쪽.
  상태: 방향 기록만. owner 의 명시 지시("아직 수정하지 말고")로 구현 보류.
  선행 작업: ERP 분류체계 비교 리서치 (_workspaces ERP_분류체계_비교 문서).
- 2026-06-12 owner: **회계(accounting) = 보류(later).** 지금은 비목표 유지,
  "나중에 채우자"로 명시. 6절 비목표와 일관 — 차원(태그) 원칙만 event_log
  로 선반영되어 있고, 회계 모듈 자체는 owner 가 다시 열기 전까지 안 만든다.

## 8. 빌드/검증 방식

- 방법론: SDD 형식 + 편집자P 속도 요소 + Soulforge 거버넌스 (보고서 9절).
- 페이즈 1개 = dev_worker packet 1개 + 체크리스트 JSON 1개 + 전용 브랜치 +
  종료 inspector. bypass-permissions 미사용.
- 체크리스트 항목 status: todo / in_progress / done / blocked. blocked 는
  사유와 함께 명시적으로 남긴다.
- 페이즈마다: 합성 fixture 로 화면 검증 + 코어 node:test + 토큰/시간 기록.
- 사람-판단 항목(스킨 기본값, 화면 우선순위, 권한 정책)은 agent 가 채우지 않고
  owner 질문으로 남긴다.
