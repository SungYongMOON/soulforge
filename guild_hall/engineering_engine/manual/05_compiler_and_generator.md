# 05. 컴파일러와 생성기 (규칙 → 엔진 입력)

둘 다 `guild_hall/engineering_engine/stage_rules/`의 순수 함수다. fs·clock·random·env·network를 쓰지 않으며(import graph 전체가 `node:crypto`만 bare로 사용, 정적 effect pin 시험이 고정), 파일 읽기·쓰기는 호출자(드라이버·runner) 몫이다. CLI는 두지 않는다.

## 5.1 `compileStageRules(request)` — 스펙+덧씌움 → 정책 3종

입력(정확히 이 키만):

| 키 | 뜻 |
| --- | --- |
| `compiled_variant` | exporter가 만든 스펙 JSON(①·② 중 하나, `soulforge.se_foldertree_compiled_variant.v0`) |
| `overlay` | `null` 또는 `soulforge.se_stage_rule_overlay.v0`(`extends`, `ops[]`, 선택 `overlay_identity`). ③과 ④를 쓸 때는 두 overlay의 `ops`를 이어 붙여 하나로 준다 |
| `project_binding` | 과제 결속: `document_refs`, `valid_at`, `known_at`, `authority_family`, `applicability_default` |
| `target_stage_codes` | 컴파일할 엔진 stage code 목록(예 `["120_CDR"]`) |
| `overlay_conditions` | 켜진 조건 토큰(예 `["sw_included"]`) |

출력(deep-frozen): `expected_artifact_policy`(`se_stage_expected_artifact_policy_v0`) · `engine_stage_policy_material`(`soulforge.ax_se_stage_policy.v0` 재료) · `needs_stage_declarations`(Needs 정책 stage·어휘 선언) · `mapping_table`(행마다 stage_code, artifact_type_id, engine_requirement_id 또는 null, presence rule, evidence_level, verification_status, se_floor, maturity, source_refs, overlay_source_ref) · `receipt`(입력·출력 digest, `effects` 전부 0, counts: `overlay_strengthened` 등).
`mintEnginePolicyRef(material, identity)`는 엔진의 policy_ref digest 규칙을 그대로 재현한다.

판정 규칙(순서대로):

1. 행의 `evidence_level` → 기본 presence(02장 표): `regulation_mandated→present`, `guidebook_recommended / prime_contract / general_se_guidance → present_or_not_applicable`, `internal_management / unstated → optional_context`.
2. `verification_status`가 `unverified/unsupported/contradicted`거나 없으면 `optional_context`로 **낮춘다**. 예외: `prime_contract` 행은 `contradicted`만 낮춘다(정본 지지도가 없는 것이 정상). `partially_supported`는 낮추지 않는다.
3. `general_se_guidance` + `se_floor: context` → `optional_context`.
4. `applies_when`(토큰 또는 목록, 목록이면 전부 참이어야 함)이 `overlay_conditions`에 없으면 그 행은 이 컴파일에서 빠진다.
5. overlay op 적용: `add`(표준 행이 `optional_context`일 때만 옆에 추가 가능 → `overlay_strengthened`; 표준이 이미 요구하면 거부) · `alias`(과제 이름→토큰) · `mark_not_applicable`(basis 필수) · `condition`(조건 토큰 선언). `override_evidence` 류는 금지(D45).
6. `optional_context` 행과 고정 내부 폴더는 엔진 requirement로 내보내지 않는다(gap scan 정책·mapping table에는 남는다). 나머지 행마다 결정론적 `engine_requirement_id`를 발행한다.
7. 어휘 밖 토큰은 unmapped context로 남긴다(거부하지 않음). 검토 회의록 등 어휘가 없는 행도 마찬가지.

## 5.2 `generatePilotPacketFromStageRules(request)` — 정책 + 관측 → pilot packet

입력: `base_packet`(이미 검증된 pilot packet: Knowledge View request·authority grant·role roster·objective·risks·project binding 등 stage rule이 소유하지 않는 모든 것의 템플릿), `engine_stage_policy_material`·`mapping_table`(5.1 출력), `artifact_observations`(산출물 단위 관측: 토큰 또는 과제 alias 이름 + `present/unknown/absence_confirmed` + 근거), `policy_identity{policy_id, revision_label}`, `packet_identity_seed`, `known_at`, 선택 `common_binding_requirement_id`.

출력: `{ pilot_packet, launch_material, receipt }` — packet은 `soulforge.ax_se_project_context_pilot_packet.v0`, launch는 runner가 쓰는 launch 필드, receipt에는 `unbound_observations`(어느 requirement에도 안 붙은 관측), preflight 재현 digest가 남는다.

규칙: 관측을 이웃 requirement로 추정해 붙이지 않는다(unbound로 남김). 한 requirement에 관측 둘, 한 이름이 requirement 둘을 가리키면 거부. 재컴파일로 requirement 신원이 바뀌면 base가 가리키던 exact ref가 새 정책에 그대로 있을 때만 common binding을 유지하고, 없으면 `common_binding_requirement_id` 명시로만 옮긴다.

## 5.3 실행 흐름(드라이버 패턴)

```text
compiled JSON(①/②) + overlay(③+④) + binding ──compileStageRules──▶ policy 3종 + mapping table + receipt
                                                                     │
base packet + 관측(artifact_observations) ────generatePilotPacket───▶ pilot_packet + launch + receipt
                                                                     │
runner(ax_se_project_context_pilot_runner) ── 1회 zero-write 평가 ─▶ satisfied / gap_missing / gap_unknown / mission 후보
```

드라이버는 스크립트(호출자)이며 파일을 읽고 쓴다. 실제 과제 드라이버는 private 실행 폴더에 두고 public에는 fixture만 둔다(`docs/architecture/workspace/examples/se_stage_rules/`).
① 층만으로 판단하려면 `compiled_variant`에 `generic_se_base.json`을, ②+③+④는 `system_dev_common_no_grade.json` + 두 overlay ops를 준다.

## 5.4 시험·검증

- `npm run validate:se-stage-rules` — 컴파일러·생성기 시험(2026-08-18: 두 파일 합쳐 35). 실제 compiled 파일(①·②·overlay)도 읽어 "모든 게이트에 엔진 요구 ≥1", "어휘 밖 토큰 0", "계층=통합 등가" 류를 확인한다.
- `npm run validate:se-foldertree-compiled` — 스펙 md ↔ compiled JSON 드리프트(`export_variant_json.py --check`, `uv run --with pyyaml`).
- `npm run validate:canon`, `npm run validate:path-length` — 공개 구조·경로 예산.
- 스펙을 고쳤을 때 순서: exporter 실행 → `--check` → `validate:se-stage-rules` → 실제 과제 1개 재컴파일해 수치 비교(07장) → 문서 동기화.

## 5.5 exporter (`codex/scripts/export_variant_json.py`)

- 스펙 md의 YAML 앞부분을 읽어 `assets/compiled/<support_key>.json`을 만든다(`variant_binding.support_key`가 있는 스펙 자동 발견).
- `evidence_level: prime_contract` 행이 있는 스펙은 추가로 공통 기준선 `compiled/<common_key>.json`(prime 행 제외, `derived_from`)과 `compiled/overlays/<support_key>.prime.overlay.json`(prime 행 → `add` op, `source_ref`=스펙 md exact ref, `extends`=공통 키+스펙 sha, `overlay_identity`)을 낸다. 매핑은 `COMMON_KEY_BY_SUPPORT_KEY`.
- 알 수 없는 task 키는 pass-through(`normalize_task`)이므로 새 기계 필드를 더할 때 exporter를 고칠 필요가 대개 없다. 컴파일러 쪽 `TASK_OPTIONAL_FIELDS`·`VARIANT_OPTIONAL_FIELDS`·`OVERLAY_OPTIONAL_FIELDS`는 고쳐야 한다.
