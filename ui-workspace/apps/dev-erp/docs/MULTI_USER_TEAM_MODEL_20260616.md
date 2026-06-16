# dev-erp 다중 접속자(팀) 모델 — 규칙 재정 (2026-06-16)

> 목적: 개발1팀이 실제로 함께 쓰는 ERP 로 만들기 위한 다중 접속자 규칙 재정.
> 계정·이메일·관리자·보기범위·계정별 메일 인입의 정의와 경계를 고정한다.
> owner 지시(2026-06-16) 반영. 작업자: claude_opus-4-8 (hybrid lane).
> 백본 구현은 슬라이스1(커밋: 팀 ERP 백본)에 있음. UI 는 후속 슬라이스.

## 1. 계정 (core_account)

| 필드 | 의미 |
|---|---|
| `username` | 로그인 아이디(고유) |
| `pw_hash` | scrypt 해시(평문 저장 0, 어떤 응답에도 미노출) |
| `display_name` | **실제 가입한 이름**(화면 표기). 없으면 username 폴백 |
| `email` | **가입 이메일 = 메일 인입 mailbox 키**(고유, 소문자 정규화) |
| `status` | active / disabled(비활성=세션 즉시 무효) |
| 역할 | `admin`(관리자) / `member`(팀원) — rbac_account_role |

- 계정 생성은 **관리자 전용**(`POST /api/accounts`). 첫 계정만 1회 `bootstrap`(관리자 자동 부여).
- 계정 0개면 앱은 **익명 모드**로 현행대로 동작(하위호환). 계정은 추가 기능, 강제 아님.

## 2. 관리자 모드

- `admin` 역할 보유 계정. `isAdmin()` 게이트로 계정 관리 surface 접근.
- 관리자만: 계정 생성/수정(이메일·표기명·역할)/비활성, 전체 계정·전체 보기범위 열람.
- 자기 자신 비활성 금지(잠김 방지). 팀원은 계정 관리 surface 403.

## 3. 보기 범위 (팀 / 사용자별) — `view`

owner 예시: "팀, 사용자1, 사용자2, 사용자3" 처럼 담당자별로 **할일·메일 이력**을 골라 본다.

- `GET /api/accounts/scopes` → 선택지. 관리자=`[팀 전체, 사용자1, 사용자2 …]`, 팀원=`[본인]`.
- `/api/items?view=<계정id|team>` — 할일을 담당자 식별자로 필터.
  담당자 매칭 키 = 로그인명 + 표기명 + 이메일 + (연결된 사람 이름). (`accountIdentities`)
- `/api/mail?view=<계정id|team>` — 메일을 **mailbox(=계정 이메일)** 로 필터.
- 권한: 관리자=아무 계정, 팀원=본인만(타인 요청은 본인으로 강등). 익명/team=전체(하위호환).
- 2026-06-17 구현 보강: 팀원 계정은 `view` 파라미터가 없어도 기본적으로 본인 할일/메일함
  범위로 좁힌다. `/api/search` 도 같은 원칙으로 할일·메일 결과를 제한한다. 메일 배정/라벨/승격
  요청은 서버에서 자기 mailbox 밖이면 거부한다.

## 4. 계정별 메일 인입 (구현 상태)

owner 요구: "계정별 email 을 등록하면 지금 내 email 처럼 똑같은 기준으로 메일을 들고온다."

**역할 분리 (코어 LLM 0% 유지):**

1. **등록(ERP)**: 관리자가 계정에 `email` 등록 → mailbox 키 확정.
   - 관리자는 계정별 mailbox 인입 메타데이터도 등록할 수 있다:
     `mailbox_provider`(`none`/`gmail`/`hiworks`), `mailbox_env_ref`, `mailbox_enabled`,
     `mailbox_status`, `mailbox_last_fetch_at`, `mailbox_last_error`, `mailbox_last_summary_ref`.
   - `mailbox_env_ref` 는 repo-relative 설정/env 파일 포인터만 허용한다. 절대경로, `..` traversal,
     Windows 절대/UNC, secret/token/password 값은 저장하지 않는다.
2. **팀 메일함 등록부(Codex 자동화)**: `guild_hall/state/gateway/mailbox/state/team_mailboxes.json`
   에 계정별 `id`/`email`/`provider`/`enabled`/`env_file`/`workspace` 만 둔다. `env_file` 은
   register 파일 기준 상대경로 또는 repo-relative 포인터이며, 비밀번호·토큰 값은 그 파일 안에만 둔다.
   - ERP 계정 메타데이터에서 등록부를 만들 때:
     `npm run dev-erp:export-team-mailboxes -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply`
3. **인입(Codex 자동화)**: `npm run guild-hall:gateway:fetch:team -- --once --json` 또는
   `python3 guild_hall/gateway/mail_fetch/team_cli.py --once --json` 이 등록부의 enabled mailbox 를
   순회한다. 각 mailbox 는 별도 cursor/dedupe/run log 를 사용하고, 메일 후보와 `메일_이력.csv` 의
   기존 `메일함` 컬럼에 계정 email/id 를 남긴다.
4. **표시(ERP)**: `scan_mail_ledger.mjs`/`ingestMail` 이 `메일함` 값을 `core_mail.mailbox` 로 보존한다.
   관리자 전체 보기에서는 팀 장부 전체를 보고, 팀원 기본 보기에서는 본인 mailbox 만 본다.
5. **할일 장부화**: `mail_to_task_ledger.mjs` 는 `메일함` 값을 기본 확정 `담당자` 로 넣지 않는다.
   후보에 담당자가 없으면 `제안담당자` 와 검토사유에만 남긴다. 정말 mailbox owner 를 담당자로
   확정하려면 `--assign-mailbox-owner` 를 명시해야 한다.
   - 후보 JSON 이 `assignee_ref` 를 명시한 경우는 “분류기가 확정 담당자를 냈다”는 뜻으로 보고
     `담당자` 에 반영한다. 보수적으로 운영하려면 후보 생성기는 `assignee_ref` 대신
     `suggested_assignee_ref` 를 써서 사람 검토 단계에 남긴다.

- ERP 는 mailbox 를 **받아 보존·필터만** 한다. 어느 메일을 누구 것으로 볼지는 mailbox 값이 결정.
- `mailbox` 빈 값 = 단일(owner) 파일럿 메일 → team/관리자 뷰에서만 보임(특정 사용자 뷰엔 안 잡힘).
- **보안 경계**: 계정별 메일 자격증명/토큰은 ERP 가 보관·열람하지 않는다. Codex 파이프라인이
  owner 승인 자격으로 인입하고, ERP 에는 메타+mailbox 만 흘려준다. (secret 취급 규칙 준수)

## 5. 동시 쓰기·세션

- 세션: HttpOnly 쿠키 토큰, 12h TTL, 만료/비활성 시 무효. `purgeExpiredSessions`.
- 현 저장소 = SQLite(WAL). 소규모 팀 동시 읽기/간헐 쓰기엔 충분. **대규모 동시 쓰기 시 PostgreSQL 검토**(DESIGN.md 라인 계속).
- 변경은 모두 `event_log` 에 actor 기록(누가 무엇을). 감사 가능.

## 6. 배포 (팀 공개)

- 기본은 `127.0.0.1`(안전). 팀 공유는 `--host 0.0.0.0`(사내 LAN).
- 실데이터 + LAN 공개 전 점검: 계정·관리자 설정 완료, 보기범위 격리 확인, 보안 검토(DESIGN.md P2b).
- 로컬 LLM 다중 사용자는 [LOCAL_LLM_MULTIUSER_DESIGN_20260616.md](LOCAL_LLM_MULTIUSER_DESIGN_20260616.md) 참조.

## 7. 후속(정책 필요)

- 과제 가시성 RBAC(어느 팀원이 어느 과제를 보나) — 현재 보기범위는 담당자 필터일 뿐 접근 차단 아님.
- 비밀번호 재설정·초대 흐름.
- 실제 운영 등록부 작성은 secret 값을 보지 않는 owner/operator 절차가 필요하다. agent 는 env 파일 경로와
  필요한 변수명을 안내할 수 있지만 값은 열람하지 않는다.

## 8. 내일 사용 전 체크리스트

1. 관리자 계정으로 팀원 5명 계정 생성 또는 수정: 이름, 로그인 아이디, 이메일 확인.
2. 각 계정의 메일함 provider/enabled/env ref 저장. env ref 는 상대경로 포인터만, secret 값은 입력하지 않음.
3. `dev-erp:export-team-mailboxes` 로 `team_mailboxes.json` 생성.
4. `guild-hall:gateway:fetch:team -- --once --dry-run --json` 으로 등록부/수집 경로 점검.
5. 실제 수집 후 `scan_mail_ledger.mjs`, `mail_to_task_ledger.mjs`, `task_ledger.mjs --apply` 순서로 메일 장부와 할일 장부를 반영.
6. 팀원 계정으로 로그인해 메일/검색/대시보드/최근 이벤트가 본인 범위만 보이는지 확인.

---
관련: [DESIGN.md](DESIGN.md) · [LOCAL_LLM_MULTIUSER_DESIGN_20260616.md](LOCAL_LLM_MULTIUSER_DESIGN_20260616.md)
