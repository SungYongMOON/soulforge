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

## 자동화 (2026-07-02, claude_fable-5)

①~④ 전 구간이 무인으로 이어지는 opt-in 사이클이 생겼다. 수집(자동 15분/수동 버튼)이 끝나면
`src/mail_collect.mjs` 후속 훅이 `tools/auto_intake_cycle.mjs` 를 자식으로 돌린다:

```
수집 완료(신규 유입 있을 때만)
  → pending 델타(결정적)
  → LLM 분류: src/llm.mjs classifyMailForTasks (로컬 Ollama, 메타 전용, format=json)
  → mail_to_task_ledger --auto-open --apply   (결정적 행 작성, 멱등)
  → haengbogwan_run --apply-context           (줄기 project_context 갱신, 메타 전용)
  → autosync 가 core_item 반영 (기존 경로)
```

env (모두 기본 OFF — runtime PC 에서 owner 가 켠다):

| env | 의미 | 기본 |
| --- | --- | --- |
| `DEV_ERP_AUTO_INTAKE=1` | 수집 후 자동 인입 사이클 실행 | off |
| `DEV_ERP_AUTO_INTAKE_ALWAYS=1` | 신규 유입 없어도 매 수집마다 실행(재판단 LLM 비용 증가) | off |
| `DEV_ERP_INTAKE_LLM=ollama` | 분류 백엔드. 미설정(none)이면 후보 없이 격리 유지 + 줄기 갱신만 | none |
| `DEV_ERP_INTAKE_MODEL` | 분류 전용 모델 오버라이드 (기본 ERP_CHAT_MODEL) | - |
| `DEV_ERP_INTAKE_LIMIT` | 사이클당 프로젝트별 판단 상한 | 12 |
| `DEV_ERP_INTAKE_FALLBACK=deterministic` | LLM 미가용 시 haengbogwan 결정적 후보(전건 격리)로 폴백 | skip |
| `DEV_ERP_INTAKE_KNOWLEDGE=1` | 줄기 갱신 후 지식/RAG 후보 append 포함 | off |

안전 장치: LLM 은 candidates 제안만(코어 LLM 0% 유지), open 승격은 기존 `--auto-open` 정책
(SE단계+업무유형+완료기준 전부일 때만). 저신뢰(low) 판정은 완료기준을 비워 unclassified 격리를
강제한다. 동시 실행은 `data/auto_intake.lock`(stale 15분)으로 차단, 실행 기록은
`data/auto_intake_receipts.jsonl` + event_log(kind=auto_intake_run, meta) 에 남는다.
수동/스케줄러 실행: `npm run dev-erp:auto-intake -- --apply --json` (기본 dry-run).
