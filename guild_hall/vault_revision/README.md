# Vault ArtifactRevision — synthetic vertical core (in-memory only)

Owner: `guild_hall/vault_revision`. Status: `CURRENT = pure in-memory state machine + adversarial tests`; persistence, byte custody, promoter writer, and any real acceptance are `TARGET` behind D27/D29 activation and Owner gates.

Team Member Engineering Program leaf row-3의 합성 수직이다. plan 03의 artifact 상태기계와 5-owner 분리, 승격·충돌 정책을 결정론 순수 모듈로 고정한다. 모든 custody·scan·binding·review·acceptance 사건은 **호출자가 단언한 합성 사실**이며, 이 모듈은 바이트를 소유하지 않고, 아무것도 영속하지 않고, 어떤 실제 산출물도 수락하지 않는다.

## 계약 요점

- 상태기계: `catalog → submission → custody receipt → scan class → revision candidate(parent/head 검사) → review record → human acceptance → accepted head`.
- 5-owner 분리: `logical / byte / revision / acceptance / backup_restore` owner가 모든 객체에서 별도 필드로 유지된다.
- 충돌 정책(plan 03 표 기반, foreign 처리만 의도적 강화): stale parent → `HOLD_CHANGED_HEAD`(candidate 생성·acceptance 양쪽); 동일 actor·key·digest 재요청 → 멱등 replay; 동일 key·다른 digest → conflict+quarantine(이 기록 1건이 "실패는 무기록" 원칙의 의도된 예외); **foreign과 absent와 cross-project custody는 구분 불가능한 균일 `not_available`** — plan의 `HOLD_FOREIGN_SCOPE` 코드는 존재 누설이 되므로 만들지 않았다; scan `clean` 외 전부 → candidate 불가(분류는 1회, `pending` 재설정 금지); assignment 결속 불일치 → `HOLD_BINDING_MISSING`; review 없음·HOLD/REVISE verdict → `HOLD_REVIEW_REQUIRED`; accepted revision은 후속 review로 되돌릴 수 없는 terminal 상태.
- `eventLog()`는 factory 소유자 전용 신뢰 감사면(무scope)이다 — 다중 테넌트 노출은 별도 scoped adapter를 거쳐야 한다.
- upload·custody·clean scan은 승격이 아니다. review는 head를 움직이지 못하고, 등록된 acceptance owner의 exact-revision 수락만 head를 전진시킨다. 제출자는 자기 제출을 review할 수 없다.
- append-only frozen event log; 동일 호출 순서 → byte-동일 로그(결정론).

## 검증

```powershell
npm.cmd run validate:vault-revision
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/03_VAULT_ERP_ASSET_REVISIONS.md`
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
