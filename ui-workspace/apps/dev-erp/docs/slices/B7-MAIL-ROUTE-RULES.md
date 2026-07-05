# B7-MAIL-ROUTE-RULES — Outlook식 메일→과제 라우팅 규칙 (사용자 입력 UI + 소급 적용)

- task_id: B7-MAIL-ROUTE-RULES
- status: done 2026-07-05
- owner_approval: 2026-07-05 owner 지시 원문 — "실제 메일이 프로젝트로 변경되는 규칙?? 키워드라던지,
  보내는이라던지, 이런거 혹시 직접 입력할수있게 UI 만들수있어? outlook 처럼 규칙 넣을수있게,
  그리고, 현재 폴더에 다 적용하겠습니까? 이런것 처럼 그 규칙 다 적용하는기능도." +
  인터럽트 보정 "현재 이미 만들어진 규칙들도 보이게 해줘, 그래야 거기에 맞게 추가하고 수정하니까."
- 작성: claude_fable-5 (2026-07-05)
- parallel_group: G-intake-cycle / depends_on: ENGINE-10(제외 규칙층, done) · run17 setMailProject(done)

## 범위 (이번 슬라이스)

1. **DB**: `mail_route_rule` 테이블(field=from|subject, match=contains|equals, project_id, enabled).
   메타 전용 — 발신자 문자열/제목 키워드만, 메일 원문 무접촉.
2. **store**: `mailRouteRules / addMailRouteRule / deleteMailRouteRule / _mailRouteTarget /
   applyMailRouteRulesToExisting` + `ingestMail` 훅(INBOX행에만, 첫 매칭 승, 등록순).
   - 대상 과제 실존 검증 + `class='inbox'` 대상 거부(자기참조 차단).
   - 소급 적용은 run17 검증 경로 `setMailProject` 재사용 → 승격 할일 동행 이동 + autosync write-through.
   - 규칙 캐시(`_mailRouteCache`)는 add/delete 시 무효화.
3. **server**: `/api/mail/route-rules` GET(사용자 규칙 + 엔진 바인딩)·POST(add)·`/delete`·`/apply`,
   게이트 = `allowSharedWrite`(관리자). 이벤트 3종 `mail_route_rule_set / mail_route_rule_delete /
   mail_route_apply` — **패턴 값은 이벤트 로그 미기재**(필드명·대상 과제·건수만, 제외 규칙 관례).
4. **엔진 바인딩 읽기**: `src/mail_router_binding.mjs` — `_workmeta/system/bindings/
   mail_project_router.yaml`(정본, 엔진 레인 소유) zero-dep 라인 파서. **읽기 전용** — ERP 는
   표시만 하고 수정하지 않는다. 사용자 규칙 > 엔진 backfill 우선순위를 UI 캡션으로 명시.
5. **UI**(관리자 패널): `wireMailRouteRules` — 사용자 규칙 CRUD + 규칙별/전체 [기존 적용] +
   엔진 규칙 12건 읽기 전용 표(조건 앞 3개 + N, 전체는 툴팁). 추가 직후 Outlook식
   "기존 받은함 메일에도 지금 적용할까요?" — **인라인 확인 바**(uiConfirm 전역 오버레이는
   관리자 패널 자체를 제거하므로 패널 내부에서 사용 금지, 이번에 실측 확인).
6. lexicon `rrule_*` 양 모드 + EVENT_KIND_LABELS 3종.

## 결정 기준 (재사용 규칙)

- 사용자 규칙 우선순위 = **등록순(id ASC), 첫 매칭 승** — Outlook 규칙 순서 모델과 동일.
- 라우팅은 **INBOX(미분류)행 메일에만** 작동: 인입 시(existing 실과제 보존 뒤) + 소급 적용 시
  (hidden=0 canonical 만). 이미 실과제로 분류된 메일은 어떤 경로로도 건드리지 않는다.
- 정본 경계: 엔진 규칙 YAML 은 엔진 레인 소유(수정은 말로 요청) — ERP 는 소비자.

## 검증

- node:test 신규 4건(MAIL-ROUTE-001~004: CRUD 검증 / 인입 라우팅·캐시 무효화 / 소급 적용·할일
  동행·멱등·rule_id 필터 / 바인딩 파서) + 전건 465 중 464 pass(유일 실패 codex_bridge_process
  child_pid_timeout — 단독 재실행 8/8 pass, 부하 플레이크, 본 슬라이스 무관).
- 프리뷰(fixture, 4311): 첫관리자 등록 → 관리자 패널 → 섹션 렌더(엔진 12규칙 표) → 규칙 추가
  → 목록 표시 + 인라인 확인 바 → 적용 토스트("기존 적용: 메일 0건 이동") → 규칙별 적용
  취소 경로 → 삭제 → 빈 목록. 스크린샷은 30s 타임아웃(기계 특성)으로 DOM 추출 증빙 대체.
- verify_gate Level 1 (이 패킷).

## 다음 액션 후보

- 규칙 enabled 토글(현재 추가/삭제만) — 수요 확인 후.
- 운영 미분류 143건에 owner 가 실제 규칙 2~3개 등록해 소급 적용해보는 첫 사용 세션.
