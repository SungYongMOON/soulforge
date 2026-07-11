# B10 — 캘린더 뷰 (월간 그리드 + 일정/마감 + 드래그 이동)

- status: done (2026-07-11 owner 지시 → 동일자 구현·브라우저 e2e 검증)
- execution_owner: erp_surface_thread_claude
- UI 소비자: `mod:calendar` 가상 뷰 + 대시보드 `month_cal` 미니 위젯
- 정본: 이 패킷. 상위 결정 — owner 2026-07-11: 표시 데이터=일정(core_meeting)+할일 마감(core_item.due), 배치=전용 뷰+대시보드 위젯 둘 다, UX 범위="구글처럼"(월 그리드·클릭 생성·드래그 이동).
- 범위 제외: **Google Calendar 연동은 P5**(DESIGN.md:114, 개인정보 규칙 선행) — 이 슬라이스는 자체 캘린더 UI 만. 주간 뷰·반복 일정·ICS 구독 URL(P-17 에서 cut)도 후속.

## 목적

마감(core_item.due)과 일정(core_meeting.at)을 한 달력 위에서 보고, 날짜 클릭으로 일정을 만들고, 드래그로 마감/일정을 옮기는 재방문 표면을 만든다. (P-8 3버킷 위젯 stop_condition 이 미룬 "캘린더 격자" 후속 + WIDGET_CATALOG_분석 "마감 캘린더 월 달력" P2 후보의 구현)

## API 계약

| 경로 | 메서드 | 요청 | 응답 | 비고 |
| --- | --- | --- | --- | --- |
| /api/calendar | GET | month=YYYY-MM, view/mine, project | { month, from, to, weeks: 6×7 [{date,in_month,items[],meetings[]}] } | 그리드 계산은 서버(src/calendar.mjs) — S10-2 처방(로직 실행-테스트) |
| /api/meetings/update | POST | { id, title?, at?, project_id?, attendees? } | { ok } | at 는 제공 시 /^\d{4}-\d{2}-\d{2}/ 접두 검증. 감사 kind=meeting_edit |
| /api/meetings/delete | POST | { id } | { ok } | 소프트삭제(status='deleted') — F2 하드삭제 금지 관례. 감사 kind=meeting_delete |

- 마감 드래그는 **기존 POST /api/items/update {id,due}** 재사용 — canAccessItem + due_overridden=1 + item_edit 감사가 이미 보장됨. 새 쓰기 경로 만들지 않는다.
- 스코프: /api/calendar 는 viewIdentities/requestScope 관례(관리자=팀 전체/계정 선택, 팀원=본인 강등). 항목엔 calendarFeed 필드 + urgency(강조색용).

## 검증된 사실 (실측)

- core_item.due 는 date-only YYYY-MM-DD, 시각/기간/반복 없음(store.mjs:145). due 수정은 updateItem 이 due_overridden=1 세팅(store.mjs:2343-2345) — 장부 재-ingest 가 안 덮음.
- calendarFeed(store.mjs:2980)가 ICS(P-17)용 활성 마감 피드 — 이 슬라이스가 from/to 범위 파라미터를 추가(하위호환, calendarIcs 무변경).
- core_meeting(store.mjs:315-324)은 store CRUD 일부(createMeeting/meetings)+라우트 GET·POST /api/meetings(server.mjs:2366-2374)+renderMeetings(app.js:6703)로 이미 표면화. **없는 것**: update/delete, 기간 필터, status 컬럼.
- 일정(SE) 개념과 별개: mod:schedule/applyTemplate 은 SE 템플릿→할일 물질화(store.mjs:2141) — 이 캘린더는 그 결과물(due 있는 할일)을 표시만 한다.
- '오늘' 정의 이원화: 서버 UTC slice(server.mjs:200) vs 브리핑 localDateKey(morning_brief.mjs:14, 'UTC 는 아침에 전날로 밀림'). **캘린더의 오늘 강조는 클라이언트 로컬 날짜** — 사용자가 보는 달력의 '오늘'은 벽시계 기준이 맞고, 브리핑 계열의 교정 관례와 일치.
- 가상 뷰 추가 지점: NAV_TREE(app.js:1254)+VIRTUAL_NAV(:1355)+render() 분기(:6842 패턴)+VIEWS(:1243)+새로고침 화이트리스트(:48). 위젯: WIDGET_PLAN(:1694)+widgetBody 분기+lexicon tile_* 키.
- lexicon 키 소유권: sched_*/schedule_*/tab_schedule 은 기소유(SLICES_INDEX 정합성 절) — 이 슬라이스는 **cal_*·tile_month_cal** 접두만 사용.

## 설계 결정

1. 주 시작=일요일, 그리드 6주 고정(구글 기본). 그리드 산출은 src/calendar.mjs 순수 함수(buildMonthGrid) — node:test 로 직접 실행 검증.
2. 일정 삭제는 소프트(status='deleted', 멱등 ALTER 마이그레이션) — meetings() 전 소비자가 active 만 보게 필터.
3. 일정 편집/삭제 권한 v1 = 로그인 사용자 전원(생성과 대칭 — POST /api/meetings 가 현재 전원 허용). 작성자 한정은 core_meeting 에 created_by 가 없어 후속 owner 결정.
4. 캘린더 셀 칩 강조색은 nudges 순위 관례와 일치: 연체>차단>⭐긴급>오늘.
5. 위젯(month_cal)은 mine=1 고정(멤버-퍼스트 보드 관례), 클릭 시 mod:calendar 로 점프. 기존 deadline_cal(3버킷)은 유지 — 대체 아님.

## 검사 방법

- test/calendar.test.mjs: buildMonthGrid 격자(6×7·경계월·일요일 시작·버킷팅), store(meetings 기간필터·updateMeeting·deleteMeeting 소프트삭제·calendarFeed from/to), 스폰 서버 라우트(GET /api/calendar 팀원 스코프 강등, meetings/update 감사 이벤트, delete 후 목록 제외).
- 기존 스위트 전건 green(TEST-003 lexicon parity 포함) + verify_gate Level ≥1.
- 브라우저: --fixture 기동 → mod:calendar 진입, 월 이동, 일정 추가, 칩 드래그로 마감 이동 확인.

## 완료 기준

로그인 사용자가 캘린더 뷰에서 해당 월의 마감·일정을 보고, 날짜 클릭으로 일정을 만들고, 드래그로 마감(due_overridden 계약 준수)·일정 날짜를 옮길 수 있으며, 대시보드 미니 달력에서 뷰로 점프할 수 있다. 전 변경이 감사 이벤트를 남기고 테스트 전건 green.

## guards

SLICES_INDEX 공통 가드 ①~⑪ 준수. 특이사항: ② 코어 LLM 0%(이 슬라이스는 AI 무관), ③ 원문 미저장(일정 title/attendees 는 메타), ⑤ core_meeting.status ALTER 는 try/catch 멱등, ⑪ cal_* 키 business/fantasy 양쪽.

## stop_conditions

- 주간 뷰·반복 일정·외부 캘린더 연동 요구 → 범위 밖, 후속 슬라이스.
- 일정 권한을 작성자 한정으로 요구 → created_by 컬럼 신설이 필요한 owner 결정 — 중단·확인.
