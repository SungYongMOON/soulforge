# Forge intent — work-generation seam core (in-memory only)

Owner: `guild_hall/forge_intent`. Status: `CURRENT = pure in-memory state machine + adversarial tests`; 실제 Linear/외부 task writer binding·accepted context 실공급·물리 assignment는 `TARGET`(별도 Owner gate).

Team Member Engineering Program plan 04의 work-generation 상태기계에서 아직 코드가 없던 이음부를 고정한다: `Work Candidate → TaskIntent(불변 digest) → 승인 기록 → (주입된 writer port를 통한) Official Task 등록 → Assignment → issued Work Brief`.

## 계약 요점

- accepted context는 **호출자 단언 exact ref**만 받는다 — 없으면 `HOLD_INPUT_UNAVAILABLE`, 사실을 합성하지 않는다.
- TaskIntent digest는 canonical JSON sha256로 결정론·순서독립이며, stale digest는 승인·등록 어디서든 `HOLD_STALE_TASK_INTENT`.
- 승인 기록 없이 writer port는 도달 불가(`HOLD_APPROVAL_REQUIRED`); `reject`/`hold` 결정은 영구 차단(재승인 불가). 승인돼도 task 적용은 writer의 일이며 이 모듈은 상태를 소유하지 않는다.
- 승인된 intent 1개 = official task 1개: 재호출은 멱등 replay, writer 이중 호출 0.
- Work Brief는 자유형 금지 — 8개 critical binding(problem/outcome/write scope/evidence/stop/escalation/review role/manifest digest) 중 하나라도 비면 발급되지 않는다(`HOLD_BRIEF_INCOMPLETE`).
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
