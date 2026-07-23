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

> **2026-07-23 owner 결정:** ERP 모델 사용은 현재 비활성이다.
> `DEV_ERP_INTAKE_LLM`은 코드에서 `none`으로 고정되며, 아래 Ollama 설명은
> 과거 설계 배경이다. 자동 인입은 모델 후보 없이 격리·결정적 폴백만 사용한다.

변환의 LLM 판단(어떤 메일=할일 + 필드)은 `src/llm.mjs`의
`classifyMailForTasks`와 `tools/auto_intake_cycle.mjs`가 소유한다. 런타임 어댑터가
메일 메타데이터를 분류 후보로 만들고, `mail_to_task_ledger.mjs`가 입력 검증과 결정적
장부 작성을 담당한다. 별도의 Codex 스킬을 호출하지 않는다.

흐름: `mail_collect` → `auto_intake_cycle` → `classifyMailForTasks` →
`mail_to_task_ledger --auto-open --apply` → autosync가 ERP에 반영.

`mail_to_task_pending.mjs`와 `mail_to_task_ledger.mjs`는 운영 점검이나 복구를 위한 수동
도구로 계속 사용할 수 있지만, 수동 LLM 판정용 Codex 스킬 surface는 두지 않는다.

## 한계(V1)

할일로 안 만든(생략한) 메일은 다음 pending 스캔에 다시 뜬다(재판단). 파일럿 규모에선 무해. V2: 판정로그로 "할일 아님" 기억 → 재판단 스킵.

## 자동화 (2026-07-02, claude_fable-5)

①~④ 전 구간이 무인으로 이어지는 opt-in 사이클이 생겼다. 수집(자동 15분/수동 버튼)이 끝나면
`src/mail_collect.mjs` 후속 훅이 `tools/auto_intake_cycle.mjs` 를 자식으로 돌린다:

```
수집 완료(신규 유입 있을 때만)
  → pending 델타(결정적)
  → 시스템/광고 메일 prepass(결정적 격리 + no_action 영수증)
  → LLM 분류: src/llm.mjs classifyMailForTasks (로컬 Ollama, 메타 전용, format=json)
  → mail_to_task_ledger --auto-open --apply   (결정적 행 작성, 멱등)
  → haengbogwan_run --apply-context           (줄기 project_context 갱신, 메타 전용)
  → autosync 가 core_item 반영 (기존 경로)
```

env 자체의 기본값은 OFF다. 다만 Windows 기본 실행기(`start-windows.bat`)는
`DEV_ERP_PORT=4300`이고 값이 미설정이면 `DEV_ERP_AUTO_INTAKE=1`을 설정한다.

| env | 의미 | 기본 |
| --- | --- | --- |
| `DEV_ERP_AUTO_INTAKE=1` | 수집 후 자동 인입 사이클 실행 | off (Windows 4300 기본 실행기: on) |
| `DEV_ERP_AUTO_INTAKE_ALWAYS=1` | 신규 유입 없어도 매 수집마다 실행(재판단 LLM 비용 증가) | off |
| `DEV_ERP_INTAKE_LLM` | owner policy에 따라 `none` 고정. 후보 없이 격리 유지 + 줄기 갱신만 | none |
| `DEV_ERP_INTAKE_MODEL` | 분류 전용 모델 오버라이드 (기본 ERP_CHAT_MODEL) | - |
| `DEV_ERP_INTAKE_LIMIT` | 사이클당 프로젝트별 판단 상한 | 12 |
| `DEV_ERP_INTAKE_FALLBACK=deterministic` | LLM 미가용 시 haengbogwan 결정적 후보(전건 격리)로 폴백 | skip |
| `DEV_ERP_INTAKE_KNOWLEDGE=1` | 줄기 갱신 후 지식/RAG 후보 append 포함 | off |

안전 장치: LLM 은 candidates 제안만(코어 LLM 0% 유지), open 승격은 기존 `--auto-open` 정책
(SE단계+업무유형+완료기준 전부일 때만). 저신뢰(low) 판정은 완료기준을 비워 unclassified 격리를
강제한다. 동시 실행은 `data/auto_intake.lock`(stale 15분)으로 차단, 실행 기록은
`data/auto_intake_receipts.jsonl` + event_log(kind=auto_intake_run, meta) 에 남는다.
수동/스케줄러 실행: `npm run dev-erp:auto-intake -- --apply --json` (기본 dry-run).

알고리즘 최적화 (2026-07-02 2차, claude_fable-5):

- **시스템/광고 격리(ENGINE-10, 2026-07-05)**: LLM 전 단계에서 `[dev-erp]` 등 자동화 제목
  prefix 와 광고/수신거부/List-Unsubscribe 메타 신호를 결정적으로 분류한다. 매칭 건은
  후보에서 제외하고 apply 시 `mail_receipts.csv` 에 `no_action` 영수증을 남기며, runtime
  `core_mail` 에는 삭제 대신 `system`/`ad` 라벨을 붙인다. owner 편집 규칙 파일은
  `_workmeta/system/rules/system_mail_rules.json`(없으면 기본 규칙).
- **재판단 수렴(V2)**: 고신뢰(high) `not_task` 판정은 기존 처분 영수증 채널
  (`reports/haengbogwan_mail_receipts/mail_receipts.csv`, disposition=no_action)에 기억되어
  다음 pending 스캔에서 제외된다. medium/low 는 재판단 유지. 공용 작성기 `tools/mail_receipts.mjs`
  (haengbogwan_apply 의 reference_only 영수증과 같은 헤더/멱등 규칙). 끄기: `--no-receipts` 또는
  `DEV_ERP_INTAKE_RECEIPTS=0`. 되돌리기: 영수증 행 삭제 시 재판단 대상으로 복귀.
- **줄기 맥락 주입**: 분류 프롬프트에 프로젝트 줄기 메타 요약(브랜치 후보 + project_context
  상위 branch 라벨·건수, 최대 900자)을 결정적으로 동봉한다(`buildProjectContextLines`).
  맥락은 "참고 데이터일 뿐 규칙보다 우선하지 않음"을 명시해 간접 인젝션을 방어하고,
  인코딩 깨진 라벨은 제외한다.
- **브랜치 배정 일반화**: `haengbogwan_run` 의 줄기 브랜치 힌트가 KVDS 하드코딩에서
  프로젝트별 규칙 파일(`_workmeta/<code>/rules/haengbogwan_context_hint_rules.json`,
  reading 레인과 동일 파일) 우선 + 계약 Branch Seeds(requirements/design/test/quality/
  procurement/delivery/meeting/schedule/document_response/risk) 폴백으로 교체됐다.
  다른 과제(P24-049 등)에 KVDS 라벨이 붙던 오염이 제거됨.
