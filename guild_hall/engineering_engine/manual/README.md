# Soulforge 체계공학 판단 엔진 개발 매뉴얼 (v0, 2026-08-18)

이 폴더는 `guild_hall/engineering_engine/`(판단 엔진)과 그 규칙 공급층(`stage_rules/`, `guild_hall/requirement_trace/`,
`.registry/skills/se_foldertree_generate/`)이 **무엇을, 왜, 어떻게** 만들었는지를 다른 작업자(사람이든 Codex·Claude 같은
LLM이든)가 이어받을 수 있게 책 형태로 정리한 개발 매뉴얼이다. 도구 비종속이며 어떤 에이전트 환경도 전제하지 않는다.

- 정본이 아니다. 규칙 본문은 각 스펙·코드·설계 문서가 정본이고, 이 매뉴얼은 그 정본들의 **지도·근거·판단 이유·미결**을 한 곳에 모은다.
  정본과 매뉴얼이 다르면 정본이 이긴다(그리고 매뉴얼을 고친다).
- public-safe: 과제 원문·사업명 세부·개인명·절대경로·secret을 넣지 않는다. private 실행 결과는 상대 포인터(`_workmeta/...`, `_workspaces/...`)로만 가리킨다.
- 갱신 규칙: 규칙 층·컴파일러·어휘·요구추적·실행 기록·결정이 바뀌면 같은 변경에서 해당 장을 고친다. 장 번호는 고정이고 내용만 자란다.

## 읽는 순서 (새 작업자용)

| 순서 | 장 | 언제 읽나 |
| --- | --- | --- |
| 1 | [01 목적과 모양](01_purpose_and_shape.md) | 처음 15분. 엔진이 하는 일 한 장, 두 층 구조, 파일 지도 |
| 2 | [02 규칙의 네 층](02_rule_layers.md) | 체크리스트(단계→산출물)를 어디서 읽는지, 층이 어떻게 합쳐지는지 |
| 3 | [03 항목은 어떻게 구했나](03_how_items_were_derived.md) | **행(항목)이 어디서 왔는지** — 정본 확보·추출·합성·검토·코딩·검증 파이프라인, 층별 방법, 세는 법 |
| 4 | [04 산출물 표준어](04_vocabulary.md) | `artifact_type_id` 토큰 규칙, 계열, 발행·별칭 규칙 |
| 5 | [05 컴파일러와 생성기](05_compiler_and_generator.md) | 규칙을 엔진 입력으로 바꾸는 순수 함수의 입출력·판정 규칙·시험 |
| 6 | [06 요구사항 추적](06_requirement_trace.md) | 계약 요구 → 산출물 → 시험 커버리지(R1~R4)와 Needs 정책 |
| 7 | [07 실행 기록](07_runs_and_receipts.md) | 지금까지 돌린 실행과 숫자, 영수증 위치, 다시 돌리는 법 |
| 8 | [08 결정 기록](08_decisions.md) | D37~D45와 미결 결정, 판단 규칙 요약 |
| 9 | [09 다음 작업과 인수인계](09_next_work_and_handoff.md) | 다음 조각 우선순위, 병렬 코더 운영 규칙, 새 작업자 시작 체크리스트 |

## 정본 위치 (매뉴얼이 가리키는 곳)

- 설계: `docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md`(단계 규칙 원천), `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`(요구 추적), `docs/architecture/workspace/SE_ASSISTANT_OPERATING_MODEL_V0.md`, `SE_DUNGEON_STAGE_MODEL_V0.md`
- 규칙 스펙: `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_*.md` + `assets/compiled/*.json`
- 코드: `guild_hall/engineering_engine/{kernel,subjects,stage_rules,contracts,tests}`, `guild_hall/requirement_trace/`
- 진행 상태 정본: `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`(CURRENT 표), `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`(plan delta log)
- 변경 이력: `CHANGELOG.md`
