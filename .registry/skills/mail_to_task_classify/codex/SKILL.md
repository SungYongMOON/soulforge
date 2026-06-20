---
name: soulforge-mail-to-task-classify
description: "Use when dev-erp mail is not turning into tasks, or to run the mail→할일 intake: deterministically detect unconverted project mail, judge which mails are real tasks and fill work_type/completion_criteria/title/due, apply via the ledger engine with --auto-open, and let autosync surface the new tasks in the ERP. Metadata-only, idempotent, incremental."
---

# Soulforge Mail → Task Classify

dev-erp 의 메일→할일 인입 갭(메일은 오는데 할일로 안 변함)을 닫는다. 결정적 엔진은 이미 있다 —
이 스킬은 그 사이의 **LLM 판단**(어떤 메일이 진짜 할일인가 + 필드 채우기)을 반복 가능한 증분 실행으로 묶는다.

## Operating Steps

1. `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽는다.
2. **미변환 델타 추출**(결정적):
   `node ui-workspace/apps/dev-erp/tools/mail_to_task_pending.mjs --workmeta <repo>/_workmeta [--project P26-014] --json`
3. 각 pending 메일을 [`references/rubric.md`](references/rubric.md) 분류 계약으로 판단 → `candidates.json` 작성.
   - 액션 필요한 메일만 포함. 순수 FYI/뉴스레터는 생략. 애매하면 보수적 `review` 할일로 포함.
   - 진짜 할일이면 `work_type` + `completion_criteria` 를 반드시 채워 open 되게 한다.
4. **적용**(프로젝트별):
   `node ui-workspace/apps/dev-erp/tools/mail_to_task_ledger.mjs --project P26-014 --candidates candidates.json --db ui-workspace/apps/dev-erp/data/dev-erp.db --auto-open --apply`
   (`--db` 로 SE단계=프로젝트 현재상태를 읽음. 없으면 `--stage <단계>`.)
5. **ERP 반영**: `DEV_ERP_AUTOSYNC=1` 이면 할일_장부 변경을 ERP 가 자동 import. 아니면 `tools/task_ledger.mjs --apply`.
6. **검증**: pending 재스캔 → 변환된 메일 빠짐(멱등). ERP 할일 목록에 OPEN 신규 표시.
7. 종료 시 boundary review + (해당되면) end-of-task knowledge trigger check.

## Boundary Rules

- 메타데이터만(제목/발신자/메일함/소스ID/기한힌트). 본문·HTML·.msg·첨부·secret·credential 미열람.
- 메일 fetch(서버→메일_이력)는 이 스킬 범위 밖(상위 fetch 단계).
- owner 정책(`--assign-mailbox-owner`) 없이 메일함 수신자를 확정 담당으로 강제하지 않는다(기본 제안만).
- rbac_permission 경계 미설정 상태에서 팀 전체 hard-assign 하지 않는다.
- 메일 행·런타임 절대경로·원문을 public tracked 파일에 쓰지 않는다.
- 결정적 엔진의 CSV/장부 로직을 스킬 안에 재구현하지 않는다(엔진이 데이터 형태 소유).

## Load On Demand

[`references/rubric.md`](references/rubric.md) — candidates JSON 스키마, 포함/생략 규칙, work_type 매핑, open 조건, 재판단/멱등/보안 한계.
