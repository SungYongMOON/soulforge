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

## 4. 계정별 메일 인입 (설계)

owner 요구: "계정별 email 을 등록하면 지금 내 email 처럼 똑같은 기준으로 메일을 들고온다."

**역할 분리 (코어 LLM 0% 유지):**

1. **등록(ERP)**: 관리자가 계정에 `email` 등록 → mailbox 키 확정.
2. **인입(Codex 자동화)**: 기존 메일 파이프라인(outlook-reconcile 등)을 **계정 email 별로** 돌려
   각자의 메일 메타를 `메일_이력.csv` 에 적되, **`mailbox=<계정 email>`** 컬럼을 채운다.
   (원문 미저장 원칙 동일 — 제목·상대·시각·포인터만.)
3. **표시(ERP)**: `ingestMail`/autosync 가 `mailbox` 를 그대로 보존 → `view=<계정>` 으로 그 사람 메일 이력만 분리 표시.

- ERP 는 mailbox 를 **받아 보존·필터만** 한다. 어느 메일을 누구 것으로 볼지는 mailbox 값이 결정.
- `mailbox` 빈 값 = 단일(owner) 파일럿 메일 → team/관리자 뷰에서만 보임(특정 사용자 뷰엔 안 잡힘).
- 실제 메일 인입 계약(어느 폴더·자격·매핑)은 **Codex 소유**: `_workmeta/system/dev_worker_candidate_queue/dev_erp_per_account_mail_ingestion_v0.yaml` 참조.
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

## 7. 후속(미구현·정책 필요)

- UI: 로그인 화면 · 관리자 계정 패널 · 보기범위 선택기 · 실명 표기(다음 슬라이스).
- 과제 가시성 RBAC(어느 팀원이 어느 과제를 보나) — 현재 보기범위는 담당자 필터일 뿐 접근 차단 아님.
- 비밀번호 재설정·초대 흐름.

---
관련: [DESIGN.md](DESIGN.md) · [LOCAL_LLM_MULTIUSER_DESIGN_20260616.md](LOCAL_LLM_MULTIUSER_DESIGN_20260616.md)
