# Forge intent — work-generation seam core (in-memory only)

Owner: `guild_hall/forge_intent`. Status: `CURRENT = pure in-memory state machine + Work Brief draft 상태 + adversarial tests`; 실제 Linear/외부 task writer binding·accepted context 실공급·물리 assignment는 `TARGET`(별도 Owner gate).

Team Member Engineering Program plan 04의 work-generation 상태기계에서 아직 코드가 없던 이음부를 고정한다: `Work Candidate → TaskIntent(불변 digest) → 승인 기록 → (주입된 writer port를 통한) Official Task 등록 → Assignment → issued Work Brief`.

## 계약 요점

- accepted context는 **호출자 단언 exact ref**만 받는다 — 없으면 `HOLD_INPUT_UNAVAILABLE`, 사실을 합성하지 않는다.
- TaskIntent digest는 canonical JSON sha256로 결정론·순서독립이며, stale digest는 승인·등록 어디서든 `HOLD_STALE_TASK_INTENT`.
- 승인 기록 없이 writer port는 도달 불가(`HOLD_APPROVAL_REQUIRED`); `reject`/`hold` 결정은 영구 차단(재승인 불가). 승인돼도 task 적용은 writer의 일이며 이 모듈은 상태를 소유하지 않는다.
- 승인된 intent 1개 = official task 1개: 재호출은 멱등 replay, writer 이중 호출 0.
- Work Brief는 자유형 금지 — 8개 critical binding(problem/outcome/write scope/evidence/stop/escalation/review role/manifest digest) 중 하나라도 비면 발급되지 않는다(`HOLD_BRIEF_INCOMPLETE`).
- **Draft 상태**(`draftWorkBrief`/`issueWorkBriefFromDraft`/`getLatestDraft`): 발급 전 brief는 불변 draft revision 체인으로 준비한다. draft는 binding을 비워둘 수 있으나 빈 목록이 `missing_bindings`(정렬)로 **데이터로 보이고**, 채워진 필드는 발급과 **같은 단일 validator**로 draft 시점에 검증된다(불량값이 draft에 숨지 못함; 문자열/배열이 아닌 값은 presence로 인정되지 않고 missing으로 보인다). draft는 `claim: draft_not_issuable_material`로 **발행 가능 자료가 아니며** issued-brief 표면에 절대 나타나지 않는다(core 보유자용 `getLatestDraft`는 draft 내용을 반환하는 검토 표면이다). 발급은 authority 선검사 순서로 **assignment authority만**(`issuer_not_assignment_authority`) → **최신 draft만**(`HOLD_STALE_DRAFT`) → **완결 draft만**(HOLD가 누락 필드 전체를 나열) 가능하다. 발급 brief는 `source_draft_ref`를 남기고, assignment당 1 brief 불변식은 draft 경로·직접 경로 모두에 걸린다(발급 후 추가 draft·재발급 거부). draft 이벤트는 revision·missing 수만 기록하고 binding 내용은 담지 않는다.
- 검증 단일화에 따른 직접 경로 강화(선언된 변경): 과거에는 배열로 감싼 digest가 regex 문자열 강제변환을 통과해 발급 brief에 실릴 수 있었다 — 이제 두 경로 모두 `digest_invalid`로 거부하고, 목록 자리에 문자열이 오면 raw TypeError 대신 `text_invalid`로 거부한다(테스트로 고정).
- assignment는 등록된 official task와 명시 assignment authority·epoch·expiry를 요구한다. Forge는 사람을 고르지 않는다.
- 완료·수락·기준선·외부행위 표면이 존재하지 않는다(팩토리에 해당 메서드 없음이 테스트로 고정).
- writer port는 팩토리 주입식이며 이 저장소에는 synthetic adapter만 존재한다.

## 검증

```powershell
npm.cmd run validate:forge-intent
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/04_FORGE_AX_SE_WORK_AND_ENGINE.md`
- `guild_hall/engineering_engine/` (판단 근거 생산자 — 이 모듈은 그 출력을 ref로만 소비)
- `ui-workspace/apps/dev-erp/src/candidate_execution_coordinator.mjs` (인접 실행 기반; 중복 구현 아님 — 본 모듈은 intent/brief 계약 seam만 소유)
