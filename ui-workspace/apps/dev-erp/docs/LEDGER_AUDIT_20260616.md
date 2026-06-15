# dev-erp 장부 감사 — 통일·매칭·작성규칙·ERP연결 (2026-06-16)

> owner 지시(2026-06-16): "모든 장부가 규칙에 맞게 통일되고 빠진 장부가 없는지,
> 매칭이 잘되었는지, 작성 규칙이 완료됐는지 ERP 기준으로 검토. 안 됐으면 기준 작성 +
> ERP 연결까지." 작업자: claude_opus-4-8 (hybrid lane). **장부 표준 소유 = Codex** —
> 본 문서는 검증 결과 + 갭의 Codex 라우팅이며, 정본 표준을 일방 재작성하지 않는다.

## 1. 장부 가족 현황 (ERP 기준)

| 장부 | 스키마 ID | 템플릿 | 작성규칙 | ERP 연결 | 판정 |
|---|---|---|---|---|---|
| 메일_이력.csv | `soulforge.project_mail_history.private.v1` | (운영) | 있음(procedure_capture) | READ `scan_mail_ledger`→`ingestMail` | ✅ |
| 할일_장부.csv | `soulforge.project_task_ledger.private.v0` | `templates/project_task_ledger_template.{csv,md}` | 있음 | READ+WRITE 왕복 `autosync`·`task_ledger.mjs` | ✅ |
| 작업_장부.csv | `soulforge.project_work_ledger.private.v1` | `templates/project_work_ledger_template.{csv,md}` | 있음 | **연결 없음(의도적)** — §3 | ⚠️ 설계판단 |
| SE_산출물_목록.csv | **없음(미선언)** | (SE 폴더트리 생성) | **전용 규칙문서 없음** | READ `scan_se_foldertree`→`core_deliverable` | ⚠️ 스키마ID 갭 |

빠진 장부: ERP 의 1차 업무축(메일·할일·산출물·활동)은 모두 장부 또는 등가 테이블로 덮여 있다.
구매/BOM/재고/연락처 등은 장부(CSV)가 아니라 ERP 마스터 테이블로 관리(파일 장부 불필요).

## 2. 매칭 검증

- 스키마 ID: 4개 중 3개가 `soulforge.*.private.v*` 로 통일. SE_산출물만 미선언(§4).
- 키 매칭: 할일_장부 `할일키`=`core_item.id`, 메일_이력 `이력키`↔`mailcsv:` 정규화,
  산출물 `<과제>:<게이트>:<산출물ID>`=`core_deliverable.id` — 모두 안정 키로 일관.
- 포인터 규칙(원문 미저장·상대경로) 4개 모두 준수.

## 3. 작업_장부 = 활동 로그 (ERP 연결을 강제하지 않음)

`project_work_ledger_template.md` 가 명시: *작업_장부는 활동/이력 로그이며, 통째로
`core_item` 으로 인입하지 말고 실행 항목은 `할일_장부` 로 옮기라.*

- 따라서 **작업_장부 → 할일(core_item) 연결은 의도적으로 없음**(올바름).
- ERP 의 활동 로그 등가물 = **`event_log`**(append-only, actor 기록). 두 개가 같은 축.
- "ERP 연결"의 선택지(설계 판단 — owner/Codex):
  - (A) **연결 안 함**: 작업_장부=Codex/사람 외부 로그, event_log=ERP 내부 로그로 분리 유지(현행).
  - (B) **단방향 export**: ERP `event_log` → 작업_장부 형식 뷰(할일_장부 export 와 대칭).
  - (C) **양방향**: 외부 작업_장부 이력을 event_log 로 import — 중복/오염 위험(비권장).
- 권고: 현재는 (A) 유지. 통합 활동뷰가 필요하면 (B). → Codex 후보로 라우팅(§5).

## 4. SE_산출물_목록 — 스키마 ID 미선언 (유일한 명확 갭)

- ERP 연결은 **이미 존재**(`scan_se_foldertree.mjs` → `core_deliverable`). 데이터는 흐른다.
- 갭: 다른 3개 장부와 달리 `soulforge.*` 스키마 ID 와 전용 작성규칙 문서가 없다.
- 형식(SE_산출물_목록.csv) 표준은 **SE 폴더트리 생성기 소유(Codex)** → ERP 가 일방 변경 금지.
- 권고: Codex 가 `soulforge.se_deliverable_ledger.real.v0`(가칭) 스키마 ID + 작성규칙을
  정식화. ERP 는 선언되면 `scan_se_foldertree` 에 schema 검증만 추가(저위험). → §5.

## 5. Codex 라우팅 (정본 표준 소유 존중)

`_workmeta/system/dev_worker_candidate_queue/dev_erp_ledger_standards_completion_v0.yaml`:
- SE_산출물 스키마 ID + 작성규칙 정식화(ERP 는 검증만 추가).
- 작업_장부↔event_log 연결 방식(A/B/C) owner 결정.

## 6. 결론

- 통일·매칭·작성규칙: **3/4 완비**. 1개(작업_장부)는 활동로그로 연결 미강제가 정답.
- 명확한 갭은 **SE_산출물 스키마 ID 1건**뿐 — 형식 소유가 Codex 라 후보로 라우팅.
- ERP 측 데이터 흐름(읽기/쓰기/왕복)은 4개 모두 동작 중. 빠진 핵심 장부 없음.
