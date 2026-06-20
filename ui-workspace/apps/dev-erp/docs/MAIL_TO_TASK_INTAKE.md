# 메일 → 할일 인입 (운영자 맵)

"메일은 오는데 할일로 안 변한다" 병목의 구조와 해소 절차.

## 4단계 체인

```
[메일 서버]
 ① fetch ──────────────→ _workmeta/<코드>/reports/메일_이력/메일_이력.csv   (email_fetch.env, 수동)
 ② scan_mail_ledger ───→ ERP 메일함(core_mail)        tools/scan_mail_ledger.mjs --apply --db
 ③ mail_to_task ───────→ 할일_장부.csv  ★메일→할일★    tools/mail_to_task_ledger.mjs --candidates ... --apply
 ④ autosync/import ────→ ERP 할일(core_item)           DEV_ERP_AUTOSYNC=1 (또는 tools/task_ledger.mjs --apply)
```

## 어디서 끊겼나

- **④만 자동**이었다(`DEV_ERP_AUTOSYNC=1` = 할일_장부→ERP 폴링). ①②③은 수동 CLI·스케줄 없음.
- 특히 **③ 메일→할일 변환**이 핵심 갭: 변환기는 "어떤 메일이 할일인가 + 업무유형/완료기준"을 **LLM 후보(`--candidates`)**로 받아야 하는데(코어 LLM 0%), 그 판단을 돌리는 주체·스케줄이 없었다. 후보 없이 돌리면 전건 `unclassified`(검토대기)로 격리되어 할일 목록에 안 보인다.

## 도구

- **`tools/mail_to_task_pending.mjs`** — 결정적. 아직 변환 안 된 메일만 추림(`mailtask:<이력키>` 행 없는 메일). `--json` 으로 LLM 입력 생성. 매 실행 LLM 부담을 신규 델타로 한정 → 증분/스케줄 가능.
- **`tools/mail_to_task_ledger.mjs`** — 결정적 엔진(기존). `--candidates <json>` 받아 할일_장부 작성. `--auto-open` + SE단계 있으면 open.

## LLM 판단 실행

변환의 LLM 판단(어떤 메일=할일 + 필드)은 **스킬 `mail_to_task_classify`** 가 소유한다 — 분류 계약(candidates 스키마·포함/생략 규칙·work_type 매핑·open 조건·한계)은 `.registry/skills/mail_to_task_classify/codex/references/rubric.md`. Codex(또는 어떤 LLM 에이전트)가 이 스킬을 (수동/스케줄로) 실행해 ③을 채운다.

흐름: `pending --json` → 분류 → `candidates.json` → `mail_to_task_ledger --auto-open --apply` → autosync 가 ERP 에 반영.

## 한계(V1)

할일로 안 만든(생략한) 메일은 다음 pending 스캔에 다시 뜬다(재판단). 파일럿 규모에선 무해. V2: 판정로그로 "할일 아님" 기억 → 재판단 스킵.
