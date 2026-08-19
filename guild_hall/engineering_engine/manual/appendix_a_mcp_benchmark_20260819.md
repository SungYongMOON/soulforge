# 부록 A. 비슷한 시스템 벤치마크 → 엔진 MCP에 더 넣을 것 (2026-08-19)

Owner 요청("최근 수정·현재 단계·진행 현황 같은 것이 있어야 하지 않나, 비슷한 엔진들의 MCP에 어떤 기능이 있는지 조사")에 따라 리서처 4명(협업 도구 MCP·요구관리/SE 도구·PLM/DMS·MCP 규격 지침)이 조사하고 1명이 종합한 결과. 벤치마크이지 정본이 아니며, 실제 채택은 09장 9.1E 용어표로 옮겨 적는다.

읽는 법: "우리 엔진에 있나"는 오늘 main의 13개 도구(rules_layers·rules_stage·rules_card·rules_version·observe_scan·observe_register·observe_confirm·observe_status·judge_run·judge_result·judge_diff·next_steps·project_status) 기준입니다. 근거가 얇은 항목은 그렇다고 적었습니다.

## (1) 비슷한 시스템들의 MCP/API가 공통으로 가진 기능

| 기능 | 어느 시스템에 있나 (대표) | 우리 엔진에 있나 | 필요한가 | 이유 한 줄 |
|---|---|---|---|---|
| 최근 변경 (무엇이 언제 바뀌었나) | GitHub `list_notifications`/`list_issues since`/`list_commits since`, monday `get_board_activity(fromDate~toDate)`, Jama `/activities`, SharePoint Graph `delta`(토큰), Windchill Audit 도메인+`ModifiedOn` 필터, DOORS Next `modifiedSince`, SysML v2 commit 변경목록, Cameo `diff_snapshots`, StrictDoc git 차이. 공식 Jira·Linear·Asana·Notion에는 **없음** | 부분 (`judge_diff`가 같은 단계 판정 둘을 비교; "언제부터 무엇이" 조회는 없음) | 예 | Owner 요청 1순위이며 우리는 이미 영수증·관측 실행·해시를 남기므로 "그 시각 이후 등록·확정·판정 변화"를 결정론적으로 뽑을 수 있음 |
| 현재 단계 / 상태 | Windchill `State`+`GetLifeCycleTemplate`, Polarion `getWorkflowActions`(가능한 다음 상태와 안 되는 이유), Jira 전이 2단계, Asana `get_status_overview`, Linear project update | 부분 (`project_status`가 단계별 수치, `next_steps`가 한 단계의 위치·부족을 냄; "지금 단계는 X, 근거는 Y" 한 줄은 없음) | 예 | 매뉴얼의 첫 질문 "지금 어디쯤"에 한 줄로 답해야 하고, Polarion식 "다음으로 못 가는 이유" 표시가 판정 설명에 딱 맞음 |
| 진행률 / 현황 | Asana `get_status_overview`, monday `get_sprint_summary`/`board_insights`, GitHub project status update, Cameo 매트릭스 채움 밀도, StrictDoc 프로젝트 통계 | 부분 (`project_status`: 단계별 최근 판정 수·막힌 수·청소 알림 총계) | 예(보강) | 이미 있는 수치에 단계별 충족/미충족/미해당/미확인 개수와 비율만 더하면 됨; 의견이 아니라 셈이라 엔진 몫 |
| 검색 (문서·요구·규칙 찾기) | Jira JQL, Confluence CQL, Notion `notion-search`, Asana `search_objects`, GitHub `search_issues`, Jama `search_jama_entities`, Polarion Lucene, Alfresco 4가지 검색, Nuxeo NL→NXQL | 없음 (단계별 목록·폴더 훑기만; 이름으로 찾기 없음) | 예(작게) | 규칙·산출물 이름 키워드로 찾는 작은 read 도구 하나면 충분; 자연어 검색은 비서 층 |
| 항목 하나 자세히 보기 | 거의 전부 (`get_issue`, `get_task`, `notion-fetch`, `get_jama_entity_details`, `get_work_item`, Windchill Document+`Versions`) | 부분 (`rules_card`는 안내 카드, `judge_result`는 실행 단위; "등록된 산출물 하나"를 id로 보는 도구 없음) | 예 | 등록장부가 생기면 "이 파일: 단계·종류·성숙도·해시·언제 등록·어느 규칙이 봄·마지막 판정"이 기본 조회 단위 |
| 이력 / 감사 로그 | Jama `/activities`, Windchill Audit(누가·무엇·언제·필드 전후값), Nuxeo `search_audit`(관리자만), Graph `itemActivity`/버전, sooperset `jira_batch_get_changelogs`, Polarion 리비전 도구, Atlassian은 조직 감사로그만 | 부분 (호출마다 메타데이터 영수증은 남기지만 읽는 도구가 없음; `audit_replay`는 계획) | 예 | 영수증이 이미 있으니 읽기 도구만 열면 됨; Nuxeo처럼 읽기 전용·권한 표시 |
| 변경 알림 / 구독 | Graph subscriptions(≤30일, 포인터만→delta로 확인), MCP `resources/subscribe`→`notifications/resources/updated`(memory 서버 예제), `tools/list_changed`, GitHub notifications, monday `create_notification`. Linear·Jama MCP는 "push 없음"을 명시 | 없음 | 나중 | MCP 표준 알림(리소스 갱신·도구 목록 변경)만 엔진이 내고, 사람에게 보내는 알림은 비서 층 |
| 기준선 / 버전 고정 | OSLC Configuration-Context, Jama baselines, Polarion `revision=`, SysML v2 commit, Innoslate baselines, Windchill Revision/Version/Latest, Graph versions | 부분 (`rules_version` 릴리스 매니페스트, 모든 답에 engine_version, run_id 영수증; "과제 장부를 이 시점으로 얼음" 없음) | 나중 | 원장 모드 스캔이 먼저; 그 뒤 "장부+규칙판+해시" 묶음을 기준선으로 찍고 기준선끼리 `judge_diff` |
| 영향 분석 (이거 바뀌면 뭐가 흔들리나) | Teamcenter `whereUsed(numLevels)`, Windchill `DocUsedBy`/where-used, Aras `getItemWhereUsed`, Jama upstream/downstream, Polarion backlinks, Cameo traceability graph. SharePoint는 없음 | 없음 | 나중 | 링크(계약문서↔산출물↔규칙)가 있어야 계산 가능; `binding_set` 뒤에 "이 문서 바뀌면 어떤 단계 판정이 흔들림"만 결정론적으로 |
| 추적 링크 (요구↔산출물↔시험) | OSLC satisfiedBy/validatedBy, Jama 관계+suspect, Polarion 링크의 suspect+revision, Doorstop 해시 도장, Cameo Satisfy/Verify, Valispace V&V, Sphinx-Needs 타입 링크 | 없음 (`binding_set` 계획) | 나중(부분) | 요구↔시험 전체는 요구관리 도구 몫; 우리는 계약문서↔산출물 묶기와 "상류 해시 바뀜=흔들림 표시"(Doorstop식)까지만 |
| 리뷰 / 승인 상태 | codebeamer `get_item_reviews`, Polarion approvals, Jama 워크플로 전이, Doorstop review 도장, Windchill 라이프사이클, SharePoint 게시 수준 | 부분 (`observe_register`의 성숙도, `observe_confirm`으로 Owner 확정, `observe_status`의 확인 대기 수) | 예(보강) | 산출물별 "대기/확정/철회" 상태와 근거만 보이면 됨; 결재 흐름은 만들지 않음 |
| 코멘트 / 답 | Jira·Confluence·Asana·Notion·monday 코멘트, Polarion 코멘트 생성/해결, Jama `create_comment` | 없음 (`answer_record` 미해당 답, `context_requests` 열린 질문은 계획) | 예(근거 답만) | 엔진에는 "근거 있는 미해당 답"과 "열린 질문 장부"만; 자유 대화 코멘트는 비서 층 |
| 권한 · 읽기전용 표시 | GitHub `--read-only`+toolsets, Linear `/mcp/readonly`, Atlassian 권한 그룹, sooperset `READ_ONLY_MODE`, monday `-ro`, MCP 주석(readOnlyHint/destructiveHint), 파일시스템 참조서버의 도구별 정직한 주석 | 부분 (쓰기 스위치 env는 있음; 그러나 모든 도구에 destructiveHint=false, 쓰기 도구를 목록에 두고 거절, 오류를 -32000으로 냄) | 예 | 주석을 정직하게(등록=비파괴, 수정=파괴), 스위치 꺼짐이면 쓰기 도구를 목록에서 숨기고 `list_changed`, 인자 오류는 `isError`로 |
| 리소스 (문서 본문 읽기) | MCP 표준 resources; Notion `notion://docs/view-dsl-spec`, memory 서버 `memory://knowledge-graph`, GitHub toolsets의 resources, Alfresco `repository_info` | 없음 (tools-only) | 예 | 규칙 카드·단계 설명·매뉴얼 장·프로젝트 프로필·릴리스 매니페스트·CHANGELOG는 "행동"이 아니라 "읽을 문서"라 리소스가 맞고 도구 예산을 안 씀 |
| 표준 질문 프롬프트 | MCP prompts; elm-mcp 15 prompts, Alfresco `search_and_analyze`, devemberx recipe 도구, Cameo methodology pack | 없음 | 예(작게) | 매뉴얼의 6가지 실제 질문("지금 어디", "뭐가 부족", "왜 이 순서", "다음 할 일")을 슬래시 명령으로 고정 |
| 상태 점검 (health / whoami / version) | GitHub `get_me`, Sentry `whoami`, monday `get_user_context`, Atlassian `atlassianUserInfo`+`getAccessibleAtlassianResources`(먼저 불러야 함), Notion `notion-fetch self`(도구 사용가능 지도), 파일시스템 `list_allowed_directories` | 부분 (`rules_version`, 답마다 engine_version) | 예 | 인자 없는 도구 하나: 엔진 버전·규칙판·프로토콜·과제 프로필·쓰기 on/off·영수증 경로·만질 수 있는 폴더 |
| 페이지네이션 · 필터 (updated_since) | GitHub `since`+cursor, monday cursor+`has_more`, Linear before/after, Asana 수정일 필터, Notion `truncated`+`unknown_block_ids`, Atlassian은 약함(ECO-1431). MCP 표준 페이지네이션은 list 4종에만 | 부분 (`next_steps top`만; scan·result·layers는 잘림 제어 없음) | 예 | Claude Code가 결과 25k 토큰에서 자르므로 큰 결과(scan·result·layers)에 cursor/limit, 변경 조회에 since |
| 미리보기 → 적용 (dry-run) | Asana `*_preview`, devemberx 모든 쓰기에 `dry_run`, 파일시스템 `edit_file dryRun`, Cameo import preview→apply / detect→patchPlan→apply | 있음 (`observe_scan` 후보·확인표 → `observe_confirm` 적용) | 예(유지) | 이미 맞는 모양; 새 쓰기 도구(`observe_amend`, `binding_set`)도 같은 dry_run 규칙 |
| 쓰기 전 모양 알려주기 | Jama `get_jama_entity_type_details`, Polarion enum 옵션, Helix `get_requirement_types`, DNG `/rm/types` | 부분 (`rules_stage`가 기대 산출물, `rules_layers`) | 예(유지) | 등록 전에 "이 단계에 허용된 산출물 종류·성숙도 값"을 되돌려 주면 오등록이 줄어듦 |
| 일괄 처리 | Asana ≤50건, GitHub `update_project_items` ≤50, Windchill bulk 액션, sooperset batch | 있음 (`observe_confirm`이 확인표 전체 적용) | 예(유지) | 유지; 건별 결과를 함께 돌려주기 |

## (2) 우리 엔진 MCP에 더 넣을 것 (엔진 입장에서만; 순위순)

1. **엔진_상태** (`engine_status`, 읽기·인자 없음) — 엔진 버전+릴리스 sha, 규칙판 버전·갱신시각, 프로토콜, 과제 프로필 코드, 쓰기 스위치 on/off, 영수증 경로, 만질 수 있는 폴더. `rules_version`은 여기에 합치거나 링크. (근거: GitHub get_me, Sentry whoami, filesystem list_allowed_directories, Notion current_tool_access)
2. **변경_이후** (`changes_since`, 읽기) — 시각 또는 run_id/영수증 id를 주면 그 뒤로 등록·확정·철회된 산출물, 판정이 바뀐 요구, 해시가 달라진 파일을 냄. 영수증+관측 실행+`judge_diff` 조합. 솔직한 한계: 엔진은 훑은 시점만 알지 실시간 감시자가 아님. (GitHub since, monday activity, Graph delta, Jama activities)
3. **현재_단계·진행_현황을 `project_status`에 보강** (읽기) — "현재 단계 = X, 근거 = 판정 run·막힌 항목", 단계별 충족/미충족/미해당/미확인 개수와 비율, 다음 단계로 못 가는 이유 목록. (Polarion getWorkflowActions, Asana status_overview, Cameo 밀도)
4. **항목_보기** (`artifact_get`, 읽기) — 등록된 산출물 하나를 id/경로로: 단계·종류·성숙도·해시·등록 실행·확정 여부·관련 규칙·마지막 판정. (모든 시스템의 get_* 패턴)
5. **찾기** (`rules_find` / `ledger_find`, 읽기) — 키워드·단계·성숙도·updated_since로 규칙 또는 등록 산출물 찾기. 작게.
6. **리소스 문 열기** — `engine://rules/{stage}`, `engine://card/{id}`, `engine://manual/{chapter}`, `engine://profile`, `engine://release`, `engine://changelog` (text/markdown·json, lastModified 주석) + `resources.subscribe`/`list_changed`. `observe_confirm` 뒤 `resources/updated` 발신. (MCP spec, memory 서버)
7. **표준 질문 프롬프트 4개** — 지금_어디(project), 뭐가_부족(stage), 왜_이_순서(stage), 다음_할_일(project); 관련 규칙 카드 리소스를 함께 붙임.
8. **계획된 도구를 같은 규격으로** — `audit_replay`(=감사 로그 읽기, 읽기전용), `answer_record`(근거 있는 미해당 답, 도장식), `context_requests`(열린 질문 장부), `observe_amend`(수정/철회; dry_run 필수, destructiveHint=true). (Nuxeo search_audit, Doorstop review/clear, devemberx dry_run)
9. **기준선_찍기** (`baseline_set`/`baseline_get`, 나중) — 원장 모드 스캔 뒤 "장부+규칙판+해시" 묶음을 얼리고, 판정·`judge_diff`가 기준선을 인자로 받음. (Jama baseline, OSLC config context, SysML v2 commit)
10. **binding_set + 흔들림 표시** (나중) — 계약문서↔산출물 묶기, 상류 문서 해시가 바뀌면 묶인 산출물에 "흔들림(suspect)" 표시(Doorstop 해시 도장 방식), 그 위에 "이거 바뀌면 어느 단계 판정이 흔들리나"만.
11. **위생 정비(도구 추가 아님)** — 주석 정직화(읽기=readOnly·idempotent·openWorld=false, 등록=destructive false, 수정=true), 쓰기 스위치 꺼짐이면 쓰기 도구 숨김+`list_changed`, 인자 오류는 -32000 대신 `isError` 결과, 도구 목록 고정 순서, 설명 2KB 이내, 큰 결과에 cursor/limit, 모든 결과에 structuredContent+engine_version+schema_version. (spec 2025-11-25 SEP-1303, 2026-07-28, filesystem 참조서버, Claude Code 클라이언트)

## (3) 넣지 말 것 / 비서 층 몫

- 사람에게 보내는 알림(메일·텔레그램·슬랙 push, monday `create_notification`류)과 외부 구독(webhook) 관리 — 엔진은 MCP `resources/updated`·`list_changed`까지만.
- 자유 코멘트·대화 스레드·@멘션(Jira/Asana/Notion 코멘트) — 엔진은 근거 있는 답과 열린 질문 장부만.
- 자연어 검색·의미 검색·NL→질의 번역(Notion AI 검색, Nuxeo `natural_search`, Atlassian `searchAtlassian` Beta) — 판단은 결정론, 말로 풀기는 클라이언트 LLM(elm-mcp의 "도구는 AI 생성 0" 원칙).
- 일정·리마인더·스케줄링 — 이미 엔진 밖으로 결정됨.
- 결재 라우팅·워크플로 엔진·사용자/그룹/권한 관리(tc-mcp `create_user/group/role`류) — 엔진은 상태만 보이고 흐름을 만들지 않음.
- 문서 본문 작성·편집·페이지 생성·첨부 업로드(Notion `create-pages`, Confluence `createConfluencePage`) — 엔진은 등록·판정만, 저술 안 함.
- 원격 HTTP/OAuth 멀티유저 문 — 로컬 stdio 유지(Cameo·peakflames의 무인증 원격 문이 반면교사).
- 요구관리 전체(요구↔시험 매트릭스, 요구 버전 관리) — 요구관리 도구 몫; 우리는 산출물↔단계↔계약문서까지.
- 미리보기 UI 위젯(monday `show_*`, MCP Apps) — 호스트/클라이언트 몫.
- AI 추천 링크·자동 규칙 생성(Innoslate `assist/traceability`, Polarion `generateCompletion`) — `overlay_propose`는 후보를 저장·검증만, 제안 자체는 사람/비서.
- 대량 export·덤프 도구(Jama MCP "scoped context only") — 페이지네이션으로 대신.
- 삭제 도구 — 없음; 철회는 `observe_amend`로만(Helix ALM MCP의 "삭제 없음" 원칙).

## (4) 요약

벤치마크한 20여 시스템은 공통으로 "누구/무엇 상태 점검 → 찾기 → 하나 자세히 → 최근 변경 → 이력"의 읽기 계단과, 쓰기에는 "미리보기 후 적용·읽기전용 스위치·정직한 주석"을 갖추고 있습니다. 우리 엔진은 판정·안내·미리보기→적용 축은 이미 맞게 갖췄지만, Owner가 짚은 "최근 변경·현재 단계·진행 현황"과 상태 점검·항목 보기·리소스·프롬프트가 비어 있습니다. 새로 만들 것은 대부분 이미 있는 영수증·관측 실행·규칙판을 읽는 도구라 결정론을 해치지 않고, 알림 발송·대화·자연어 검색·저술은 비서 층에 남깁니다. 기준선·영향 분석·추적 링크는 원장 모드 스캔과 `binding_set` 뒤에 붙이는 것이 순서입니다.

## 출처 (압축)

- 협업 도구 MCP: support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools · jira.atlassian.com/browse/ECO-1431 · mcp-atlassian.soomiles.com/docs/tools-reference · linear.app/docs/mcp · blog.fiberplane.com/blog/mcp-server-analysis-linear · developers.asana.com/docs/mcp-tools-reference · developers.notion.com/guides/mcp/mcp-supported-tools · github.com/makenotion/notion-mcp-server · github.com/github/github-mcp-server (README, docs/server-configuration.md, docs/remote-server.md) · developer.monday.com/api-reference/docs/platform-mcp-tools · github.com/mondaycom/mcp
- 요구관리/SE: jazz.net/library/article/1197 · docs.oasis-open-projects.org/oslc-op/rm/v2.1 · docs.oasis-open-projects.org/oslc-op/config/v1.0 · github.com/systelab/jama-api · help.jamainterchange.com/en/jama-connect-mcp- (capabilities, operational-constraints) · github.com/t-j-thomas/jama-mcp-server · developer.siemens.com/polarion/advanced-concepts.html · github.com/devemberx/mcp-server-polarion · github.com/peakflames/PolarionMcpServers · docs.valispace.com/vhd · github.com/ajhcs/cameo-mcp-bridge · github.com/Systems-Modeling/SysML-v2-API-Python-Client · sparxsystems.jp/en/MCP · help.specinnovations.com/innoslate-apis · github.com/3KniGHtcZ/codebeamer-mcp · github.com/romep/helix-alm-mcp-server · github.com/madhanbabubhoopal/ibm-doorsnext-mcp-server · github.com/brettscharm/elm-mcp (404) · doorstop.readthedocs.io/en/latest/cli/validation.html · strictdoc.readthedocs.io · sphinx-needs.readthedocs.io/en/stable/api.html
- PLM/DMS: docs.mendix.com/appstore/industry/teamcenter-connector/teamcenter-reference · github.com/goenninger-b-t/tc-mcp · support.ptc.com/help/windchill_rest_services/r2.7 · github.com/Cars-10/windchill-mcp-server · github.com/srinivasmd/windchill-plm · aras.com (2024 RESTful API PDF) · github.com/DaanTheoden/aras-claude-agent · learn.microsoft.com/graph (driveitem-checkin, driveitemversion, driveitem-delta, change-notifications-overview, drive-recent) · github.com/softeria/ms-365-mcp-server · github.com/stevereiner/python-alfresco-mcp-server · github.com/nuxeo/nuxeo-mcp-server · github.com/nloui/paperless-mcp · github.com/Modern-CAD/vault-ai-mcp-server
- MCP 규격·지침: modelcontextprotocol.io/specification/2025-06-18 (server/tools, resources, prompts, utilities/pagination, client/elicitation, basic/lifecycle) · /2025-11-25/changelog · /2026-07-28/changelog · modelcontextprotocol.io/extensions/tasks/overview · github.com/modelcontextprotocol/servers (filesystem, git, memory) · github.com/modelcontextprotocol/typescript-sdk/docs/servers · anthropic.com/engineering/writing-tools-for-agents · aws.amazon.com/blogs/machine-learning/mcp-tool-design-practical-approaches-and-tradeoffs · code.claude.com/docs/en/mcp · github.com/getsentry/sentry-mcp · mcp-best-practice.github.io · github.com/modelcontextprotocol/registry (server.json) · forum.cursor.com (40-tool limit)
- 로컬: guild_hall/engineering_engine/mcp/engine_mcp_server.mjs(PROTOCOL_VERSION 2025-06-18, destructiveHint=false 고정, -32000 TOOL_REFUSED, SOULFORGE_ENGINE_MCP_WRITE) 및 mcp/tools/ 13개 파일
