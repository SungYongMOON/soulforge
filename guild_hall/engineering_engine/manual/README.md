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
| 9 | [09 다음 작업과 인수인계](09_next_work_and_handoff.md) | **확정 계획(9.0: 이정표 M1~M4·원칙·조각 A1~E1·맥락 다섯 쓰임·Owner 결정)**, 상세 참고표, 출시 형태(MCP), 새 작업자 시작 체크리스트 |

## 합의됐지만 아직 없는 것 (모든 요약·도식에 반드시 같이 그린다)

Owner 지시(2026-08-18): "하기로 한 것이 그림에서 빠지면 누락된 채 지나간다." 아래 항목은 엔진의 기능 표·구조도·시퀀스를 그릴 때 **상태 '없음(합의됨)'으로 항상 포함**한다. 만들어지면 상태만 바꾸고 줄은 지우지 않는다.

| 항목 | 뜻 | 자리 | 상태 |
| --- | --- | --- | --- |
| **문서 내용 검사기** (Owner 제안 2026-08-17, 설계 §2.1A, 09장 7번) | "파일이 있냐" 다음 단계 — 있는 문서가 제대로 됐나(필수 절·표·양식·요구 반영). 관측을 만드는 쪽에 붙어 `내용 충족/부족/미검사`를 넣고, 엔진 핵심은 그대로. 미검사는 부족으로 찍지 않는다 | 관측 공급 층(눈) | 없음(합의됨) |
| **선후 관계표 + 순서 계산(파이프라인)** | 규칙 행에 입력 산출물 열 → 컴파일러가 과제·사업유형·등급·발주처별 순서 계산; 빈 과제도 "무엇부터" | 규칙 + 컴파일러 | **있음(A2 착지 2026-08-18)** — 활동·결정 노드, `depends_on`(간선 206, 인용 포함), `orderStageWork`. 남은 것: 규정 근거 간선 0 · 기술관리 8종 행 없음(`references/se_io_relations_v0.md` §7) |
| **산출물별 가이드 카드(어떻게)** | 스펙 행 + 정본 인용 + 양식 + 앞뒤 관계 + 담당 → "왜·언제·어떻게" 안내(판단과 분리) | 안내 층 | 없음(합의됨, A3) |
| 관측 공급(문서 색인·메일 첨부 → 산출물 분류) | 폴더 03_Out 스캔 외의 자료를 있음/없음으로 | 눈 | 부분→후보 생성기 착지(확정은 사람) — `observation/`(A1). 자동 확정은 `03_Out`+업무 1:1+**파일 이름 단서** 세 조건 모두일 때만. 남은 것: 메일 첨부·문서 색인 입력, 성숙도 근거 확대 |
| 폴더 청소 알림(housekeeping) | 중복·엉뚱한 자료·압축본·중간본·업무폴더 중복·`03_Out` 없음을 사람에게 | 눈(판단과 분리) | 있음 — `observation/observation_housekeeping.mjs`, 실행마다 `housekeeping_report.md`. 판단·관측이 아니며 팀 등록이 정착한 뒤에도 상시 가드로 유지(Owner 방침) |
| 결과 전달(결손 표·브리프·담당자 카드) | 판단 결과를 사람에게 | 입 | 없음 |
| 답변 우편함(Context Response 수신) | 사람 답 → 다음 실행 반영 | MCP 단계 | 없음(합의: MCP 시점) |
| MCP 문 + 야간 예약 실행 | 밖에서 부르는 문 하나, 밤에 자동 | 호출 | 없음 |
| 과제 착수 명령 | 5입력 → 폴더트리·규칙·첫 판단 | 착수 | 없음 |
| 발주처 덧씌움 추가(한화 등), 탐색·선행·운용 스펙 재기준 | 다른 발주처·사업유형 실체 | 규칙 | 없음(초안만) |
| R2 원장·R3 투영·R4 카드 | 요구 추적 후반 | 요구 추적 | 없음 |

## 정본 위치 (매뉴얼이 가리키는 곳)

- 설계: `docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md`(단계 규칙 원천), `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`(요구 추적), `docs/architecture/workspace/SE_ASSISTANT_OPERATING_MODEL_V0.md`, `SE_DUNGEON_STAGE_MODEL_V0.md`
- 규칙 스펙: `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_*.md` + `assets/compiled/*.json`
- 코드: `guild_hall/engineering_engine/{kernel,subjects,stage_rules,contracts,tests}`, `guild_hall/requirement_trace/`
- 진행 상태 정본: `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`(CURRENT 표), `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`(plan delta log)
- 변경 이력: `CHANGELOG.md`
