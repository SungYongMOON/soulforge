# 프로그램 인도 전문가 에이전트 + Soulforge↔산출물 연결 기획안 V0

- 작성자: `claude_fable-5`
- 상태: `proposed` (owner 승인 전. 본 문서는 방향 정본 후보이며, 정본 파일 생성·정본 편집은 owner/Codex 검증 후 전용 branch 에서만 수행한다)
- 범위: public-safe 아키텍처 방향. 실데이터·실프로젝트 세부는 본문에 인라인하지 않고 `_workmeta/<project_code>/` 포인터로만 참조한다.
- 권장 정본 위치: `docs/architecture/foundation/` (VISION/ROADMAP 와 같은 cross-root 방향 문서 층)
- 한 줄 목적: 팀이 실제로 쓰는 산출물(첫 사례 = dev-erp)을 **잘 구축·관리·인도**하고, 그 산출물을 Soulforge 정본과 **올바르게 잇는** 운영 전문가 레인을 ERP 준비와 한 묶음으로 세운다.

---

## 0. 이 기획안을 한 장으로

이 문서는 서로 묶인 두 가지를 동시에 설계한다.

1. **전문가 서브에이전트** — 프로그램을 정의·구축·검증·인도하고 재사용 패턴을 정본으로 승급시키는 운영 참모. ERP 전용이 아니라 Soulforge 위에서 도는 **모든 산출물 프로그램**에 쓰는 일반 레인이다.
2. **Soulforge ↔ 산출물 연결 아키텍처** — 산출물(ERP 등)이 Soulforge 정본의 **파생 소비자**로서 어떻게 데이터를 읽고, 자기 실행 흔적을 어떻게 정본 run truth 로 되돌리고, 무엇을 public/private 어디에 두는지의 계약.

그리고 둘을 **ERP 실사용 준비**와 결합한다: 앞서 도출한 실사용 6대 차단요건(인증·전송암호화·권한·백업·감사/행위자·개인정보)을 전문가 에이전트의 **릴리스 준비 게이트(auditor 기능)**로 정식화해, "코드를 더 짠다"와 "안전하게 연다"가 한 레인에서 같이 굴러가게 한다.

---

## 1. 배경과 문제 정의

현재 상태(2026-06 기준 확인):

- `ui-workspace/apps/dev-erp` 는 실제로 동작하는 앱이다. `node:http` + `node:sqlite`(WAL), append-only `event_log`, 실데이터 ingest(메타 전용), 합성↔실데이터 분리 가드, RBAC **필드 자리**까지 있다. `data/` 는 gitignore 되어 공개 repo 로 새지 않는다.
- 그러나 실사용에는 차단요건이 남아 있다: 로그인/인증 0, HTTP 평문, RBAC **강제** 미구현(P2b 예정), 자동 백업·복구 부재, solo 기간 actor 오염(갈림길 ⑪), 개인정보(근태/투입) 거버넌스 문서 부재.
- 조직 측면: 산출물을 "구축하는 사람"과 "관리·인도·연결을 책임지는 레인"이 분리되어 있지 않다. dev_worker(실행 레인)는 있지만, 그 위에서 **무엇을 어떤 순서로, 어떤 게이트를 통과해야 열 수 있는지**를 잡아주는 상위 조율자가 정본화되어 있지 않다.

문제 한 줄: **"팀이 쓰는 산출물을 안전하게 인도하고 정본과 잇는 책임 레인"이 비어 있고, 그 공백이 곧 ERP 오픈 리스크다.**

이 기획안은 그 공백을 채우는 전문가 레인을 세우되, Soulforge 의 비전(수동작업 → 재사용 자산 승급)과 owner 경계·public/private 규칙을 **하나도 깨지 않게** 끼워 넣는다.

---

## 2. 설계 원칙 (이 기획안이 스스로 지키는 규칙)

1. **최소·범위한정 변경** — 새 개념을 남발하지 않는다. 가능하면 기존 class(`administrator`/`marshal`/`auditor`)·기존 레인(`dev_worker`)·기존 연결점(`ui-workspace`, `guild_hall` projection)을 재사용한다.
2. **중복 금지** — 전문가 에이전트는 dev_worker(실행)·SE assistant(설계지원)와 **층위가 다르다**. 같은 일을 두 번 정의하지 않는다(3.2 경계표).
3. **파생 소비자 불변식** — 산출물은 정본의 derived consumer 다. 제2의 진실원(source of truth)이 되면 안 된다. UI 와 동일한 지위.
4. **public/private 분리** — 코드·구조·공개안전 샘플은 public repo. 업무 원문·실데이터·실프로젝트 metadata 는 `_workspaces`/`_workmeta`/로컬 DB. secret 은 agent 가 열지 않는다.
5. **게이트는 owner authority 를 침범하지 않는다** — 에이전트는 준비·정렬·검증·경고·패킷화까지. 최종 릴리스 승인·merge·배포·개인정보 수집 결정은 owner.
6. **승급은 증거 기반** — 반복 검증된 절차만 workflow/skill 로 승급한다. 한 사례로 universal standard 를 고정하지 않는다(VISION 비목표 준수).

---

## 3. 전문가 서브에이전트 설계

### 3.1 역할 정의 (한 줄)

> 프로그램(산출물 단위 작업 묶음)을 **정의 → 구축 순서화 → 릴리스 준비 검증 → 인도**하고, 반복 가능한 부분을 정본으로 **승급**시키는 운영 참모. 직접 손으로 빌드/merge/배포하지 않고, 실행은 `dev_worker` 레인에 패킷으로 위임한다.

게임 온톨로지 표현: **도편수(都片手) / 프로그램 인도장**. 길드의 "건설 총괄"에 해당한다. 길마(guild_master, intake·mission review)와 구분되며, 길마의 위임을 받아 특정 프로그램의 구축·인도를 책임진다.

### 3.2 기존 레인과의 경계 (중복 금지표)

| 레인 | 층위 | 책임 | 산출물 | 본 에이전트와의 관계 |
| --- | --- | --- | --- | --- |
| `guild_master` (administrator) | 최상위 | intake, mission review, nightly oversight, 위임 | mission 승인, 위임 결정 | 본 에이전트에게 프로그램을 **위임**한다 |
| **program_delivery (본 기획안)** | 상위 조율 | 프로그램 정의, 빌드 순서, 릴리스 게이트, 인도, 승급 | mission + dev_worker_request 패킷 + 릴리스 준비 리포트 | 길마 ↔ dev_worker 사이의 **빠진 층** |
| `dev_worker` | 실행 | 패킷 1개 → 검증된 branch | reviewable branch + report | 본 에이전트가 만든 **패킷을 소비**한다 |
| SE assistant (`se_assistant_operating_loop_v0`) | 설계지원 | SE 산출물 준비, 누락 탐지, owner 질문 | draft/checklist/traceability seed | 프로그램이 SE 성격일 때 본 에이전트가 **호출**하는 하위 워크플로 |
| `auditor` class | 검증 | 구조 검사, 수용 게이트, 릴리스 준비 | 검증 verdict | 본 에이전트의 **릴리스 게이트에 로드아웃**으로 들어감 |

핵심: 본 에이전트는 **새 실행 엔진을 만들지 않는다.** "무엇을·어떤 순서로·어떤 게이트로" 를 잡고, 실제 코드 변경은 `dev_worker` 가, 검증은 `auditor` 로드아웃이 수행한다.

### 3.3 정본 표현 (class / unit / party)

최소 변경 원칙에 따라 **새 class 신설은 옵션**으로 두고, 1차는 기존 class 조합(party)으로 표현한다.

권장 1차안 — 새 party + 새 unit, 새 class 없음:

- **party**: `program_delivery_cell` (프로그램 인도 셀)
  - loadout(class 조합):
    - `administrator` (총관) — 게이트·경계·위임·승급 핸드오프
    - `marshal` (집행관) — 빌드 순서·마감 추적·통제된 에스컬레이션
    - `auditor` (감식관) — 구조 검사·수용 게이트·릴리스 준비 검증
    - (선택) `knight` (빌드 정면 수행 성향) 또는 `healer` (안정화/복구) — 프로그램 성격에 따라 토글
- **unit**: `program_delivery_lead_01`
  - `identity.species_id`: 기존 가용 species 중 owner 선택(예: `human`)
  - `class_ids`: `[administrator, marshal, auditor]`
  - `summary`: "Current-default program delivery lead for build sequencing, release-readiness gating, product↔canon bridging, and promotion handoff."

옵션 2차안 — 새 class `shipwright`(도편수, 조선관):

- 신설 시 `summary`: "Build-and-deliver class focused on delivery sequencing, production-readiness gates, integration boundaries, and promotion."
- `.registry/classes/shipwright/`(class.yaml + `*_refs.yaml`) 추가.
- 단, 기존 3 class 조합으로 충분히 표현되면 **신설하지 않는 것이 최소변경 원칙에 부합**. owner 결정 항목(7절 ①).

### 3.4 실행 표현 (runnable, 양쪽 런타임 바인딩)

본 에이전트는 Codex·Claude 양쪽에서 같은 정본(AGENTS.md)을 읽고 동작한다. (직전 작업으로 `CLAUDE.md = @AGENTS.md` 임포트가 이미 깔려 있어, 두 런타임의 지침이 한 소스에서 갈린다.)

- **Claude Code subagent**: `.claude/agents/program-delivery-architect.md`
  - frontmatter: `name`, `description`(언제 이 에이전트를 부르는지 트리거), `tools`(읽기·검색·파일·bash 한정, 배포·merge 도구 제외), `model`
  - 본문: 3.1 역할 + 3.5 계약 + 3.6 루프를 운영 프롬프트로 기술. AGENTS.md 의 실행 계약·검증 게이트를 따른다고 명시.
  - 부록 A 에 스펙 초안.
- **Codex skill**: `.registry/skills/program_delivery_architect/`
  - 기존 skill 패턴 미러(`skill.yaml` + `codex/SKILL.md` + `codex/agents/openai.yaml` + `references/`).
  - 부록 B 에 스켈레톤 초안.
- 두 표현은 **같은 party loadout(`program_delivery_cell`) 의 실행 바인딩**이다. 정본(누가/무슨 권한)과 실행(어떻게 돈다)을 분리.

### 3.5 입력 / 출력 / 권한 계약

받는 것(입력):

- 프로그램 의도 / brief(목적, 제약, 사용자, 기한 감각)
- 대상 산출물과 `project_code`
- 현재 상태(레포 스냅샷, 기존 mission/_workmeta, 산출물 코드 상태)

내는 것(출력):

- `.mission/<mission_id>/` 후보(mission.yaml, readiness.yaml) — 프로그램 실행 계획
- `.mission/<mission_id>/dev_worker_request.yaml` — 실행 가능한 public-safe 패킷(또는 private 는 `_workmeta/<code>/dev_worker_queue/*.yaml`)
- **릴리스 준비 게이트 리포트** — 5절 체크리스트 대비 통과/미통과 + 미통과 시 blocker
- 승급 후보 — 반복 검증된 절차의 workflow/skill 승급 제안(`_workmeta` candidate queue 경유)

못 하는 것(금지·owner 권한):

- main 직접 push, auto-merge, force-push, 배포(deploy)
- secret 열람/전송, 업무 원문(메일 본문·첨부)의 외부 LLM 전송(메타/요약 화이트리스트만)
- 개인정보 수집 결정, hard 게이트 전환 결정, public contract 변경 승인
- 요구사항·설계수치·검토결론을 추론으로 채우기(→ owner question / blocker 로 남김)

### 3.6 작동 루프

```text
intake(brief+project_code)
  -> scope     : 프로그램 경계·비목표·성공조건 고정 (VISION 비목표 점검)
  -> gate plan : 릴리스 준비 게이트(5절)를 이 프로그램에 인스턴스화
  -> packetize : dev_worker_request 로 슬라이스 (한 패킷=한 bounded 변경)
  -> delegate  : dev_worker 가 branch 생성·검증·push (본 에이전트는 실행 안 함)
  -> verify    : auditor 로드아웃으로 branch + 게이트 통과 검증
  -> handoff   : owner 에게 merge/릴리스 결정 핸드오프 (리포트 첨부)
  -> promote   : 반복 검증된 절차를 workflow/skill 승급 후보로 등록
```

매 bounded 작업 종료 시 AGENTS.md 의 end-of-task knowledge trigger check 와 post-development review gate 를 따른다.

---

## 4. Soulforge ↔ 산출물 연결 아키텍처

### 4.1 핵심 불변식

산출물(ERP 포함)은 **파생 소비자**다. `ui-workspace` 가 "derived UI consumer workspace" 인 것과 동일한 지위로 취급한다. 산출물은 정본을 **읽어** 보여주고 업무를 굴리되, **정본을 대신하는 새 owner 가 되지 않는다.** 산출물 내부의 쓰기(event_log, 업무 레코드)는 로컬 진실이며, 정본으로 올라갈 부분은 **승급 경로**를 통해서만 정본이 된다.

### 4.2 데이터 흐름

```text
[정본/상태]                         [투영]                  [산출물]
.registry/.workflow/.party/.mission  --derive-->  guild_hall   --read-->  dev-erp UI
guild_hall/state/**                              projection               (read view)
                                                 (SQLite v0,
                                                  metadata-only)

[산출물 쓰기]                        [run truth]              [승급]
dev-erp event_log / 업무 레코드  --capture-->  _workmeta/<code>/  --promote-->  .workflow / .registry/skills
(로컬 DB, gitignore)                runs·reports               (검증된 반복 절차만)
```

원칙:

- **읽기 방향**: 정본·state → projection → 산출물. 산출물은 projection 을 읽고, projection 은 파일에서 rebuild 가능(SQLITE_PROJECTION_V0). DB 파일은 어떤 repo 에도 commit 하지 않는다.
- **쓰기 방향**: 산출물의 실행 흔적(누가·언제·무엇)은 `_workmeta/<code>/runs/**` 의 run truth 로 캡처. 원문/payload 가 아니라 메타·포인터·해시.
- **외부 LLM 경계**: 메타/요약 화이트리스트만 전송, DB·원문·ingest 외부 전송 0. 원문 필요 기능은 로컬 백엔드(tool_pc) 선행(dev-erp MASTER_PLAN 갈림길 ⑨와 정합).

### 4.3 저장 경계 매트릭스

| 무엇 | 어디에 | public repo? |
| --- | --- | --- |
| ERP 앱 코드·구조·합성 샘플 | `ui-workspace/apps/dev-erp/**` (data 제외) | 예 |
| ERP 로컬 DB(`data/*.db`), 실데이터 ingest | 로컬 디스크(gitignore) | 아니오 |
| ERP project metadata·bindings·run truth | `_workmeta/<project_code>/**` (nested private repo) | 아니오(private) |
| ERP 실제 과제 원문/첨부/산출물 | `_workspaces/<project_code>/**` 또는 owner-approved worksite | 아니오 |
| cross-project 운영 ingress/state/projection | `guild_hall/state/**` (local-only) | 아니오 |
| 산출물 연결 방향·계약 문서 | `docs/architecture/**` | 예(public-safe) |

### 4.4 ERP 를 Soulforge project 로 등록

1. `project_code` 확정(예: `dev_erp` 또는 회사 코드). owner 가 정함(7절 ③).
2. `.mission/<mission_id>/` 에 ERP 인도 mission 1개 — 본 에이전트가 후보 작성, 길마 readiness review.
3. `_workmeta/<project_code>/` — project metadata, dev_worker_queue, reports(onboarding/procedure_capture/knowledge_access).
4. `_workspaces/<project_code>/` — 실데이터 materialization(로컬 전용).
5. 산출물 코드는 `ui-workspace/apps/dev-erp` 유지. 연결은 projection read + run truth capture 로만.

### 4.5 승급 루프 (ERP 에서 정본으로)

ERP 운영 중 반복 검증된 절차(예: "메일 → 할일 승격 규칙", "stage gate 차단 로직", "백업·복구 런북")는 `_workmeta` candidate → 검증 → `.workflow`/`.registry/skills` 승급. 이게 Soulforge VISION 의 "수동작업 → 재사용 자산" 루프가 ERP 에서 실제로 도는 지점이다. **한 번 검증으로 승급하지 않고**, 반복·증거·calibration 후 승급.

---

## 5. ERP 실사용 준비 = 에이전트의 릴리스 준비 게이트

앞서 도출한 실사용 차단·운영 요건을 본 에이전트의 **릴리스 준비 게이트 체크리스트**로 정식화한다. 이 체크리스트는 `auditor` 로드아웃이 매 릴리스 핸드오프 전에 평가하며, 미통과 항목이 있으면 "팀 오픈" 핸드오프를 막는다(차단), owner 가 명시적 예외 서명을 하지 않는 한.

| # | 게이트 항목 | 통과 기준 | 현재 | 책임 class |
| --- | --- | --- | --- | --- |
| G1 | 인증(로그인·계정) | 사용자 계정 + 로그인 없이는 접근 불가 | 미구현 | administrator |
| G2 | 전송 암호화(TLS) | 네트워크 노출 시 HTTPS, 평문 금지 | 미구현 | auditor |
| G3 | 권한 강제(RBAC) | 역할별 read/write 강제, 필드만 있는 상태 탈출 | 필드만 | administrator |
| G4 | 백업·복구 | 자동 백업 + **복구 1회 실전 테스트** 통과 | 미구현 | marshal |
| G5 | 감사·행위자 식별 | 모든 변경이 실제 사용자에 귀속(actor 오염 해소) | 부분(오염 플래그) | auditor |
| G6 | 개인정보 거버넌스 | 근태/투입 수집 전 동의·보관기간·접근규칙 확정 | 문서 부재 | administrator+owner |
| G7 | 스키마 마이그레이션 | 업데이트 시 팀 데이터 무손실 이전 경로 | 버전만 존재 | marshal |
| G8 | 상시 호스트·운영 | 크래시 자동 재시작·모니터링되는 호스트 | dev 스크립트 | marshal |
| G9 | 온보딩·지원 경로 | 비개발자 가이드 + 문제 신고/대응 루프 | 부재 | administrator |

게이트 ↔ 파일럿 단계 매핑은 6절. G1·G2·G4 는 어떤 팀 오픈이든 **무조건 선행**, G6 는 개인정보 기능을 켜는 순간의 **하드 선행**.

---

## 6. 단계별 실행 계획 (ERP 준비와 병렬)

각 단계는 목적 / 산출물 / 완료기준 / owner 결정 / 검증을 가진다. 단계는 **새 축을 늘리지 않고** 차단요건을 닫는 순서로 짠다(레포의 "수직 슬라이스 먼저" 방향과 정합).

### Phase 0 — 레인 정본화 + project 등록 (승인 후 착수)

- 목적: 전문가 에이전트와 연결 계약을 정본에 올리고 ERP 를 project 로 등록.
- 산출물: `program_delivery_cell` party + `program_delivery_lead_01` unit + Claude subagent + Codex skill(승인 후 생성), `.mission/<id>` ERP 인도 mission, `_workmeta/<code>` 스캑폴드, 본 게이트 체크리스트(G1~G9) 정본화.
- 완료기준: `npm run validate` / `done:check` 통과, party/unit canon validate 통과, 게이트 체크리스트가 auditor 로드아웃에서 평가 가능.
- owner 결정: 7절 ①②③.
- 검증: canon validate + 독립 감사 서브에이전트 1회.

### Phase 1 — 읽기 전용 파일럿 (G1·G2·G4 선행)

- 목적: 소수에게 **읽기 전용**으로 열어 실사용 흐름 검증.
- 산출물: 인증(G1) 최소구현, 사내망 TLS(G2), 자동 백업+복구 테스트(G4), 읽기 전용 모드.
- 완료기준: 2~3명이 사내망에서 로그인 후 읽기 사용, 백업에서 복구 1회 성공, event_log 에 actor 기록.
- owner 결정: 호스트 PC, 파일럿 인원, 사내망/VPN 경계(MASTER_PLAN 갈림길 ⑩).
- 검증: 침투 점검(평문/무인증 노출 없음), 복구 드릴.

### Phase 2 — 쓰기 파일럿 (G3·G5)

- 목적: RBAC 강제 + 행위자 식별 후 쓰기 권한 단계 개방.
- 산출물: RBAC 강제 로직(P2b 정합), actor 오염 해소(갈림길 ⑪), 변경 감사 뷰.
- 완료기준: 역할별 권한이 강제되고, 모든 쓰기가 실제 사용자에 귀속.
- owner 결정: 역할 정의(누가 어떤 권한), 팀 공개 범위.
- 검증: 권한 우회 시도 차단 테스트.

### Phase 3 — 개인정보 기능 (G6 하드 선행)

- 목적: 근태/투입률 등 개인정보 기능을 거버넌스 확정 후에만 개방.
- 산출물: 개인정보 정책(동의·보관기간·접근·삭제), 회사 차원 데이터 소유·책임 합의.
- 완료기준: 정책 문서 owner 승인 + 기능 게이트가 정책 없이는 켜지지 않음.
- owner 결정: 개인정보 정책 주체·법적 검토.
- 검증: 정책 대비 데이터 접근 감사.

### Phase 4 — 승급 루프 가동 (G7·G8·G9 안정화 위)

- 목적: ERP 운영 절차를 정본 workflow/skill 로 승급, 상시 호스트·온보딩·마이그레이션 안정화.
- 산출물: 마이그레이션 경로(G7), 상시 호스트·모니터링(G8), 온보딩·지원 루프(G9), 승급 후보 1~2건.
- 완료기준: 데이터 무손실 업데이트 1회, 비개발자 온보딩 1명 성공, 승급 후보가 calibration 거쳐 정본화.
- 검증: 마이그레이션 드릴 + 승급 게이트.

---

## 7. owner 결정 필요 목록 (갈림길)

| # | 질문 | 기본 권장 |
| --- | --- | --- |
| ① | 새 class `shipwright` 신설 vs 기존 3 class(admin+marshal+auditor) 조합 | 조합(최소변경). 부족할 때만 신설 |
| ② | unit 이름·species·hero (`program_delivery_lead_01` 채택?) | 채택, species=human 기본 |
| ③ | ERP `project_code` 확정(`dev_erp`?) | owner 명명 |
| ④ | 파일럿 호스트 PC 1대 지정 + 상시 가동 책임 | 사내 PC 1대 고정 |
| ⑤ | 파일럿 인원·읽기전용 범위 | 2~3명, 읽기전용 시작 |
| ⑥ | 사내망/VPN 외부 접근 경계 (MASTER_PLAN ⑩) | VPN 외 외부 직접 노출 금지 |
| ⑦ | actor 오염 완화 시점 (MASTER_PLAN ⑪) | Phase 2 전 |
| ⑧ | 개인정보 정책 주체·법적 검토 책임자 | owner 지정 |
| ⑨ | hard 게이트 전환(차단 강제) 서명 | Phase 1 종료 시 |

---

## 8. 리스크와 완화

1. **레인 과잉(over-engineering 재발)** — 전문가 에이전트가 또 하나의 무거운 축이 될 위험. 완화: 새 class 신설 보류, 기존 조합 재사용, 산출물 = derived consumer 불변식 고수.
2. **dev_worker 와 책임 중복** — 완화: 3.2 경계표를 정본에 박고, 본 에이전트는 패킷 생산·게이트만, 실행은 dev_worker.
3. **인증 없는 LAN 노출** — 완화: G1·G2·G4 를 Phase 1 하드 선행, 읽기전용·비민감 데이터부터.
4. **개인정보 사고** — 완화: G6 하드 선행, 정책 없으면 기능 게이트 잠금.
5. **승급 성급** — 완화: 반복·증거·calibration 후 승급(VISION 비목표 준수).
6. **solo→팀 전환 인수비용** — 완화: NIGHT_WORK_HANDOFF 체크포인트, 절차문서 강제, boot digest 항목화.

---

## 9. 검증 계획

- 구조: `npm run validate`, `npm run done:check`, party/unit canon validate.
- 독립 감사: fresh adversarial 서브에이전트로 본 기획안·각 Phase 산출물을 재검(dev-erp MASTER_PLAN run20 패턴 재사용).
- 게이트: G1~G9 를 auditor 로드아웃이 릴리스 핸드오프 전 평가.
- 운영 드릴: 백업 복구 1회, 마이그레이션 1회, 침투(무인증/평문 노출) 점검.
- 사용성: 비개발자 온보딩 1명 통과.

---

## 10. 다음 행동 (즉시 가능한 public-safe 선행)

owner 승인을 침범하지 않는 하위 slice 만 먼저 수행 가능:

1. 본 기획안을 `docs/architecture/foundation/` 방향 문서로 검토·확정(이 문서).
2. G1~G9 게이트 체크리스트를 ERP 레포의 점검용 `.md` 로 분리(읽기전용 산출).
3. 백업·복구 런북 초안(스크립트 아님, 절차문서)과 synthetic 데이터 복구 드릴 설계.
4. `program_delivery_cell` party / unit / subagent / skill 의 **스펙 초안**(부록 A·B) 리뷰 — 실제 정본 파일 생성은 ①②③ 승인 후 전용 branch 에서.

owner 승인이 필요한 항목(class 신설, project_code, 파일럿 범위)은 실행 큐로 밀지 않고 7절에 남긴다.

---

## 부록 A — Claude Code subagent 스펙 초안

```markdown
---
name: program-delivery-architect
description: >
  Soulforge 위 산출물 프로그램(ERP 등)을 정의·구축순서화·릴리스준비검증·인도하고
  재사용 절차를 정본 승급 후보로 올리는 상위 조율 에이전트. 코드 실행/merge/배포는
  하지 않고 dev_worker 패킷과 릴리스 게이트 리포트를 생산한다. 프로그램 단위 작업의
  계획·게이트·인도 책임이 필요할 때 호출.
tools: Read, Grep, Glob, Bash, Write, Edit   # 배포/merge 도구 제외
model: inherit
---

역할: 도편수 / 프로그램 인도장 (administrator+marshal+auditor 로드아웃).
계약: AGENTS.md 실행 계약·검증 게이트·secret 규칙·branch 규칙을 따른다.
루프: intake -> scope -> gate plan -> packetize(dev_worker_request) ->
      delegate(dev_worker) -> verify(auditor) -> handoff(owner) -> promote.
금지: main 직접 push, auto-merge, 배포, secret 열람, 원문 외부 LLM 전송,
      요구사항/설계수치 추론 채움(→ owner question/blocker).
출력: .mission/<id> 후보, dev_worker_request 패킷, 릴리스 준비 게이트 리포트(G1~G9),
      승급 후보(_workmeta candidate queue 경유).
```

## 부록 B — Codex skill 스켈레톤 초안

```text
.registry/skills/program_delivery_architect/
  skill.yaml                 # id, kind=skill, status=proposed, summary, refs
  README.md                  # owner 경계·사용법
  codex/
    SKILL.md                 # 트리거·루프·계약(부록 A 본문과 정합)
    agents/openai.yaml       # 실행 바인딩(기존 skill 패턴 미러)
    references/
      gates.md               # G1~G9 릴리스 준비 게이트
      bridge.md              # 4절 연결 아키텍처 요약
```

## 부록 C — dev_worker_request 패킷 예시 (ERP 인증 슬라이스, 개념용)

```yaml
schema_version: soulforge.dev_worker_request.v0
task_id: dev_erp_auth_min_001
status: ready
lane: dev_worker
requested_by: program_delivery_lead_01
project_code: <owner_confirms>            # 갈림길 ③
summary: dev-erp 최소 인증(계정+로그인) 추가, 읽기전용 모드 게이트 부착.
branch_slug: dev-erp-auth-min
allowed_write_paths:
  - ui-workspace/apps/dev-erp/src/**
  - ui-workspace/apps/dev-erp/server.mjs
  - ui-workspace/apps/dev-erp/test/**
acceptance_checks:
  - 로그인 없이는 모든 라우트 401
  - event_log 에 actor 기록
  - node:test 통과
stop_conditions:
  - 스키마 파괴적 변경 필요 시 중단·blocker 보고
  - secret/토큰 요구 시 중단(값 미포함)
origin:
  kind: agent_generated
  evidence_refs:
    - docs/architecture/foundation/PROGRAM_DELIVERY_AGENT_AND_PRODUCT_BRIDGE_PLAN_V0.md
owner_approval:
  required: true
  approved: false
```

## 부록 D — 게임어 ↔ 업무어 매핑(본 레인 한정)

| 게임어 | 업무어 |
| --- | --- |
| 도편수 / 프로그램 인도장 | program delivery lead |
| 프로그램 인도 셀(party) | delivery loadout(admin+marshal+auditor) |
| 릴리스 준비 게이트 | production-readiness gate (G1~G9) |
| 패킷 위임 | dev_worker task handoff |
| 승급 | promotion to workflow/skill canon |
| 파생 소비자 | derived consumer(산출물=ERP, UI 와 동급) |

---

*본 문서는 `proposed` 상태다. 정본 파일 생성과 정본 편집은 owner/Codex 검증 후 전용 branch 에서 수행하며, 작업자 표기는 `claude_fable-5` 로 남긴다. 실데이터·실프로젝트 세부는 본 문서에 인라인하지 않고 `_workmeta/<project_code>/` 포인터로만 참조한다.*
