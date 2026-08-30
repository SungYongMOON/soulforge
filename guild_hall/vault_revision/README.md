# Vault ArtifactRevision — synthetic vertical core (in-memory only)

Owner: `guild_hall/vault_revision`. Status: `CURRENT = pure in-memory state machine + bundle/redaction-lineage/external-gate + adversarial tests`; persistence, byte custody, promoter writer, real redaction execution, real external transmission, and any real acceptance are `TARGET` behind D27/D29 activation and Owner gates.

Team Member Engineering Program leaf row-3의 합성 수직이다. plan 03의 artifact 상태기계와 5-owner 분리, 승격·충돌 정책을 결정론 순수 모듈로 고정한다. 모든 custody·scan·binding·review·acceptance 사건은 **호출자가 단언한 합성 사실**이며, 이 모듈은 바이트를 소유하지 않고, 아무것도 영속하지 않고, 어떤 실제 산출물도 수락하지 않는다.

## 계약 요점

- 상태기계: `catalog → submission → custody receipt → scan class → revision candidate(parent/head 검사) → review record → human acceptance → accepted head`.
- 5-owner 분리: `logical / byte / revision / acceptance / backup_restore` owner가 모든 객체에서 별도 필드로 유지된다.
- 충돌 정책(plan 03 표 기반, foreign 처리만 의도적 강화): stale parent → `HOLD_CHANGED_HEAD`(candidate 생성·acceptance 양쪽); 동일 actor·key·digest 재요청 → 멱등 replay; 동일 key·다른 digest → conflict+quarantine("실패는 무기록" 원칙의 의도된 예외는 conflict 기록 3종 — submission quarantine·`bundle_conflict`·`external_submission_conflict` — 뿐이다); **foreign과 absent와 cross-project custody는 구분 불가능한 균일 `not_available`** — plan의 `HOLD_FOREIGN_SCOPE` 코드는 존재 누설이 되므로 만들지 않았다; scan `clean` 외 전부 → candidate 불가(분류는 1회, `pending` 재설정 금지); assignment 결속 불일치 → `HOLD_BINDING_MISSING`; review 없음·HOLD/REVISE verdict → `HOLD_REVIEW_REQUIRED`; accepted revision은 후속 review로 되돌릴 수 없는 terminal 상태.
- **Input bundle**(`assembleInputBundle`): exact **accepted** revision만 담는 deep-frozen 불변 manifest(codepoint 정렬 entries + order-independent·locale-무관 sha256 digest). 미수락 entry → `HOLD_BUNDLE_ENTRY_NOT_ACCEPTED`(무기록), absent/foreign entry → 균일 거부, 같은 key·같은 purpose·같은 entry set → 멱등 replay(manifest_digest 반환), 같은 key에 다른 set **또는 다른 purpose** → conflict(`bundle_conflict` 기록 후 거부). `latest`·raw fallback·cross-project entry는 표현 불가능.
- **Redaction lineage**(`deriveRedactionCandidate`): accepted 원본 revision에서만, 파생 **조상 체인의 어떤 artifact도 아닌** 다른 logical artifact 위에(redaction-of-redaction이 raw 원본 artifact로 되돌아오는 것도 차단), 원본과 **다른** digest로만 파생 후보를 만든다(`redaction_identical_digest`·`redaction_same_artifact`·`HOLD_REDACTION_SOURCE_NOT_ACCEPTED`, 전부 쓰기 전 검증·무기록 실패). 파생 후보의 `derivation`은 {kind, derived_from_revision_id, source_content_id, redaction_profile_ref}를 deep-frozen으로 고정하며 custody·scan·review·acceptance를 **하나도 건너뛰지 않는다**.
- **External gate**(`registerExternalSubmission`): 경계 밖으로 나가는 등록은 **accepted redaction derivative만** 참조할 수 있다 — accepted라도 raw 원본은 구조적으로 등록 불가(`external_requires_redacted_derivative`), 혼합 목록은 all-or-nothing 거부. 기록의 lineage entry는 chain-complete다: 직접 source(`derived_from_revision_id`)와 파생 체인의 raw 기원(`origin_revision_id`)을 모두 담아 "무엇이, 무엇을 redact해서, 어떤 profile로"에 깊이 2 체인에서도 답한다. idempotency digest는 **destination을 포함**해 같은 key로 다른 목적지 재사용은 replay가 아니라 conflict다. `claim: lineage_registration_only_no_external_send` — **등록일 뿐**이며 어떤 전송 port도 존재하지 않는다.
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
