# 05. 컴파일러와 생성기 (Domain 규칙+Profile → Effective Rule Set)

둘 다 `guild_hall/engineering_engine/stage_rules/`의 순수 함수다. current Compiler는 계층이나
별도 엔진이 아니라 Systems Engineering Domain Adapter다. Engineering Engine Core는 이
Adapter를 부르는 Rule Assembly Interface와 공통 guard/receipt를 소유한다. fs·clock·random·env·
network를 쓰지 않으며(import graph 전체가 `node:crypto`만 bare로 사용, 정적 effect
pin 시험이 고정), 파일 읽기·쓰기는 호출자(드라이버·runner) 몫이다. CLI는 두지 않는다.

## 5.1 `compileStageRules(request)` — 스펙+덧씌움 → 정책 3종

입력(정확히 이 키만):

| 키 | 뜻 |
| --- | --- |
| `compiled_variant` | exporter가 만든 스펙 JSON(①·② 중 하나, `soulforge.se_foldertree_compiled_variant.v0`) |
| `overlay` | `null` 또는 `soulforge.se_stage_rule_overlay.v0`(`extends`, `ops[]`, 선택 `overlay_identity`). Organization Profile과 Project Profile의 current internal ops를 이어 붙여 하나로 준다 |
| `project_binding` | current compatibility compilation scope: `document_refs`, `valid_at`, `known_at`, `authority_family`, `applicability_default`. 실제 evidence location/observation Binding 전체가 아님 |
| `target_stage_codes` | 컴파일할 엔진 stage code 목록(예 `["120_CDR"]`) |
| `overlay_conditions` | 켜진 조건 토큰(예 `["sw_included"]`) |

출력(deep-frozen): `expected_artifact_policy`(`se_stage_expected_artifact_policy_v0`) · `engine_stage_policy_material`(`soulforge.ax_se_stage_policy.v0` 재료) · `needs_stage_declarations`(Needs 정책 stage·어휘 선언) · `mapping_table`(행마다 stage_code, artifact_type_id, engine_requirement_id 또는 null, presence rule, evidence_level, verification_status, se_floor, maturity, source_refs, overlay_source_ref, 그리고 D46의 `node_kind`·`is_virtual`·`depends_on`·`depends_on_evidence`·`depends_on_refs`·`overlay_depends_on`·`dependency_resolution`·`evidence_record`) · `receipt`(입력·출력 digest, `effects` 전부 0, counts: `overlay_strengthened`·`by_node_kind`·`dependency_edges`·`unresolved_dependency` 등, 그리고 이름을 지목하는 `unresolved_dependencies[]`).
gap scan 정책의 `expected_inputs`는 지금까지 빈 배열이었다 — 어떤 규칙표도 "무엇이 먼저"를 말하지 않았기 때문이다. 이제 그 행 그룹의 `depends_on` 합집합이 들어간다(인과 간선만, 게이트 순서는 넣지 않는다).
`mintEnginePolicyRef(material, identity)`는 엔진의 policy_ref digest 규칙을 그대로 재현한다.

Target Interface에서는 Core Rule Assembly Interface를 통해 Domain Compiler Adapter가
Domain Engine과 두 Profile만 조립해 Effective Rule Set을 만들고, Project Adapter가
별도로 Typed Project Facts를 만든다. 둘은
Evaluator에서만 만난다. current `project_binding`을 제거하거나 이름을 바꾸는 것은 ABI
migration과 replay 검증을 거치는 별도 작업이다.

판정 규칙(순서대로):

1. 행의 `evidence_level` → 기본 presence(02장 표): `regulation_mandated→present`, `guidebook_recommended / prime_contract / general_se_guidance → present_or_not_applicable`, `internal_management / unstated → optional_context`.
2. `verification_status`가 `unverified/unsupported/contradicted`거나 없으면 `optional_context`로 **낮춘다**. 예외: `prime_contract` 행은 `contradicted`만 낮춘다(정본 지지도가 없는 것이 정상). `partially_supported`는 낮추지 않는다.
3. `general_se_guidance` + `se_floor: context` → `optional_context`.
4. `applies_when`(토큰 또는 목록, 목록이면 전부 참이어야 함)이 `overlay_conditions`에 없으면 그 행은 이 컴파일에서 빠진다.
4A. `node_kind`가 `activity`·`decision`이고 evidence level이 `regulation_mandated`가 아니면 `present_or_not_applicable`이 상한이다(D46). 활동·결정의 증거는 기록이고, 기록은 근거를 대고 "해당 없음"이라 답할 수 있어야 한다.
5. overlay op 적용: `add`(표준 행이 `optional_context`일 때만 옆에 추가 가능 → `overlay_strengthened`; 표준이 이미 요구하면 거부) · `alias`(과제 이름→토큰) · `mark_not_applicable`(basis 필수) · `condition`(조건 토큰 선언) · `add_dependency`(입력 추가, exact `source_ref`+`basis` 필수, 합집합으로만; 표준 행이 없으면 거부). `override_evidence`·`remove_dependency`는 금지(D45·D46).
   `add`의 선택 필드 `task_id`(양의 정수)·`folder_name`(디스크 폴더 이름)은 둘 다 있거나 둘 다 없어야 하며, mapping row의 `task_id`·`folder_name`으로 실려 나간다. 스펙 행은 `folder_name`이 null이다 — 행의 `name`이 곧 폴더 이름이기 때문이다.
5A. 입력 토큰 해석: 이번 컴파일이 만드는 토큰이면 간선, 어휘는 아는데 이번에 안 만들면 범위 밖, 둘 다 아니면 `unresolved_dependency`로 **세고 이름을 남기되 컴파일을 거부하지 않는다**.
6. `optional_context` 행과 고정 내부 폴더는 엔진 requirement로 내보내지 않는다(gap scan 정책·mapping table에는 남는다). 나머지 행마다 결정론적 `engine_requirement_id`를 발행한다.
7. 어휘 밖 토큰은 unmapped context로 남긴다(거부하지 않음). 검토 회의록 등 어휘가 없는 행도 마찬가지.

## 5.2 `generatePilotPacketFromStageRules(request)` — 정책 + 관측 → pilot packet

입력: `base_packet`(이미 검증된 pilot packet: Knowledge View request·authority grant·role roster·objective·risks·project binding 등 stage rule이 소유하지 않는 모든 것의 템플릿), `engine_stage_policy_material`·`mapping_table`(5.1 출력), `artifact_observations`(산출물 단위 관측: 토큰 또는 과제 alias 이름 + `present/unknown/absence_confirmed` + 근거), `policy_identity{policy_id, revision_label}`, `packet_identity_seed`, `known_at`, 선택 `common_binding_requirement_id`.

출력: `{ pilot_packet, launch_material, receipt }` — packet은 `soulforge.ax_se_project_context_pilot_packet.v0`, launch는 runner가 쓰는 launch 필드, receipt에는 `unbound_observations`(어느 requirement에도 안 붙은 관측), preflight 재현 digest가 남는다.

규칙: 관측을 이웃 requirement로 추정해 붙이지 않는다(unbound로 남김). 한 requirement에 관측 둘, 한 이름이 requirement 둘을 가리키면 거부. 재컴파일로 requirement 신원이 바뀌면 base가 가리키던 exact ref가 새 정책에 그대로 있을 때만 common binding을 유지하고, 없으면 `common_binding_requirement_id` 명시로만 옮긴다.

## 5.3 실행 흐름(드라이버 패턴)

```text
compiled JSON(①/②) + Profile overlay ops(③+④) + compilation scope
  ──compileStageRules──▶ Effective Rule Set 재료 + mapping table + receipt
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

## 5.4A 순서 계산 `orderStageWork(compileResult, observations?)` (D46, 2026-08-18)

컴파일 결과를 게이트별 **"무엇부터"** 목록으로 바꾸는 순수 함수. 출력은 `{schema_version, stages[], receipt}`이고 effect는 전부 0이다.

여기서 두 가지를 **분리해서** 낸다. 섞으면 "PDR이 CDR보다 먼저"와 "설계기술서가 회의록보다 먼저"가 같은 말이 되어 버린다.

| 나오는 것 | 뜻 |
| --- | --- |
| `stage_sequence` | 게이트 순서(수명주기가 정한다). 앞 게이트 입력은 이것으로 이미 정렬된다 |
| `same_stage_inputs` / `earlier_stage_inputs` / `forward_stage_inputs` | 인과 간선(`depends_on`)을 어디서 만나는지로 나눈 것 |
| `blocked_by` / `satisfied_inputs` / `ready` | 관측 기준 상태(관측 0이면 모든 선언 입력이 `blocked_by`) |
| `out_of_scope_inputs` / `unresolved_inputs` | 어휘는 아는데 이번 컴파일이 안 만드는 것 / 아무도 안 가진 토큰 |

정렬 규칙(순서대로):

1. 같은 게이트 안 `depends_on` 위상 정렬. 고리가 있으면 `SE_STAGE_RULE_DEPENDENCY_CYCLE`로 **거부**한다(어느 하나를 임의로 앞세우면 컴파일러가 규칙을 정하는 셈이다).
2. 안 막힌 것 먼저. 관측이 0이면 결과적으로 **입력이 없는 항목이 먼저** 나온다.
3. 근거 등급 순: `regulation_mandated` > `guidebook_recommended` > `prime_contract` > `general_se_guidance` > `internal_management` > `unstated`. 표시 순서일 뿐 등급을 바꾸지 않는다(계획 9.0.2의 4번; `prime_contract`는 그 목록에 없어 "이 과제가 실제로 진 의무"라는 이유로 가이드북과 일반 지침 사이에 둔다).
4. **게이트 역할**: `core`(그 회의가 내놓기로 되어 있는 것) > `entry`(회의 전에 있어야 할 자료) > `supporting`. 02장 §2.7.
5. **뒤에서 이 산출물을 입력으로 쓰는 항목 수**(많은 것 먼저). 이번 컴파일의 전 대상 단계를 통틀어 work item만 세며, 맥락 행은 세지 않는다. 규칙에서 계산되므로 관측과 무관하다.
6. 토큰 사전순(결정론 tie-break).

4번과 5번은 2026-08-18 2판에서 더했다. 그전에는 같은 등급 안이 가나다순이라 SRR의 중심 산출물(체계요구사항명세서)이 계획서들 뒤에 묻혀 "다음 할 일 3개"에 나오지 않았다. **"게이트 진입기준 먼저"가 이제 적용된다** — 스펙이 `gate_role`을 갖게 됐기 때문이며, 영수증의 `tie_breaks_skipped`는 이제 비어 있다.

관측(`[{artifact_type_id, presence_state}]`, 상태 어휘는 생성기와 같은 `present/unknown/absence_confirmed`)은 **무엇이 이미 됐는지를 표시할 뿐 규칙을 다시 쓰지 않는다.** 간선은 관측과 무관하게 그대로 있으므로 어떤 항목도 자기 입력보다 앞설 수 없다. 달라지는 것은 "막히지 않은 것 먼저" tie-break에서 어느 항목이 위로 올라오느냐다.

work item은 엔진 요구가 된 행만이다. `optional_context` 행과 고정 폴더는 그래프의 노드로는 남아(뒤 항목의 순서를 정하므로) 목록에는 나오지 않는다 — 사람에게 "할 일"로 줄 것이 아니기 때문이다.

빈 과제 실측(2026-08-18 2판, 관측 0): ② 공통 기준선 + 발주처 덧씌움 030_SRR 첫 5개 = **체계요구사항명세서 · 상호운용성확보계획서 · M&S활용계획서 · 예비TEMP · RAM업무계획서**(1판은 ICD로 시작해 SSRS가 뒤로 밀려 있었다). 전 단계 인과 연결 10 → 25.

## 5.4B `projectGenericLayerEdges({generic_variant, national_variant})` (2판)

①의 관계는 이분 구조(산출물→활동, 활동→산출물)이고 ②는 그 활동 행을 거의 갖지 않아, ①의 128개 관계가 ②에 하나도 닿지 않았다. 이 순수 함수가 **활동 하나를 통과하는 합성**으로 옮긴다: `A는 X의 입력` + `X는 B를 만든다` → `B는 A가 먼저 필요`.

- 합성은 정본이 쓴 문장이 아니다. 그래서 등급은 `general_se_guidance`를 넘지 않고, 통과한 활동을 `via_activity`로 남기며, 행에는 `depends_on_origin: generic_layer_projection`(② 자신의 간선도 있으면 `mixed`)을 붙인다.
- 양 끝이 모두 ②에 있어야 하고, 입력은 같은 게이트나 앞 게이트에서 요구돼야 한다. 토큰 대응은 어휘의 `CROSS_LAYER_TOKEN_EQUIVALENCE`(04장 §4.6)만 쓰고 이름이 비슷하다고 잇지 않는다. D44 정정 뒤 대부분의 행은 대응 없이 같은 토큰으로 바로 만난다.
- 결과는 스펙에 기록된다(스펙이 단일 원천). 실측: 합성 128 → 투영 52간선 / ② 행 20개.

## 5.5 exporter (`codex/scripts/export_variant_json.py`)

- 스펙 md의 YAML 앞부분을 읽어 `assets/compiled/<support_key>.json`을 만든다(`variant_binding.support_key`가 있는 스펙 자동 발견).
- `evidence_level: prime_contract` 행이 있는 스펙은 추가로 공통 기준선 `compiled/<common_key>.json`(prime 행 제외, `derived_from`)과 `compiled/overlays/<support_key>.prime.overlay.json`(prime 행 → `add` op, `source_ref`=스펙 md exact ref, `extends`=공통 키+스펙 sha, `overlay_identity`)을 낸다. 매핑은 `COMMON_KEY_BY_SUPPORT_KEY`.
- 알 수 없는 task 키는 pass-through(`normalize_task`)이므로 새 기계 필드를 더할 때 exporter를 고칠 필요가 대개 없다. 컴파일러 쪽 `TASK_OPTIONAL_FIELDS`·`VARIANT_OPTIONAL_FIELDS`·`OVERLAY_OPTIONAL_FIELDS`는 고쳐야 한다.

## 5.6 안내 층 `guidance/` (A3, D47 제안, 2026-08-18)

컴파일러와 순서 계산이 "무엇이 있어야 하고 무엇부터인가"를 만들면, `guild_hall/engineering_engine/guidance/`는 그 옆에 **"왜·언제·무엇을·어떻게·누가"**를 붙인다. 판단 층과 같은 규칙 행을 읽지만 판단을 만들지 않는다(9.0.2 원칙 2).

| 모듈 | 순수 함수 | 내는 것 |
| --- | --- | --- |
| `guide_cards.mjs` | `buildGuideCards({compile_result, vocabulary, compiled_variant?, source_catalog?, work_order?})` | (단계, 산출물 종류)마다 카드 하나 + 영수증. 엔진 요구가 된 행 전부, 그리고 요구가 아니어도 **활동·결정 행**은 카드를 받는다 |
| `instruction_packet.mjs` | `buildInstructionPackets({assessment, work_order, guide_cards, known_at, role_roster?, context_fill?, include_next_ready?, top_n?})` | mission 후보마다 지시서 하나(`soulforge.engine_instruction_packet.v0`) + 영수증 |
| `answer_render.mjs` | `renderNextStepsAnswer({assessment, work_order, instructions, guide_cards, stage_code, locale})` | 한국어 마크다운과 같은 내용의 JSON: **위치 · 부족 · 다음 할 일 · 그 뒤** |

지켜야 할 네 가지(코드가 아니라 시험이 지킨다):

1. **문장을 짓지 않는다.** 카드의 모든 한국어 문장은 `GUIDE_CARD_TEMPLATES`의 고정 틀 하나이고 슬롯 값은 규칙 행에서 그대로 복사한다. 문장은 `{template_id, text_ko, slots}`로 나가며, 시험이 template_id로 재렌더해 같은 바이트가 나오는지와 슬롯 값이 행의 필드에서 왔는지를 확인한다. 모델 호출 0.
2. **행이 말하지 않은 것은 말하지 않는다.** 양식 없으면 `양식 없음`, 인용 없으면 `근거 미표기`. 채워 넣으면 인용된 지시와 구분되지 않는 지시가 생긴다.
3. **인용은 위치만.** `{source_key, locator}`만 싣고 원문은 싣지 않는다. 색인 카탈로그를 주면 그 카탈로그가 가진 제목만 덧붙고 없는 출처는 `catalog_known: false`로 남는다.
4. **지시서는 판단도 쓰기도 아니다.** `judgment_ref`(policy_ref · assessment_handle · requirement_counts 스냅숏)는 **복사**이며 다시 계산하지 않는다. `presence_state`·수정본 ref·완료 표시가 지시서에 들어가려 하면 빌드를 거부한다. 담당은 논리 역할이고 사람은 `context_fill.owners`가 준 경우에만, 기한은 `context_fill.due_dates`가 준 경우에만 들어간다. `known_at`은 호출자 입력이다(이 층은 시계를 읽지 않는다).

엔진이 mission 후보를 요청 수보다 적게 냈을 때만 "안 막혔는데 아직 관측되지 않은" 항목으로 채우고, 그것은 `instruction_kind: next_ready` · `engine_finding: not_yet_observed`로 구분한다 — 판정이 아니라 아무도 안 본 것이기 때문이다.

파일을 읽고 쓰는 자리는 CLI 하나뿐이다(`tools/engine_next_steps_runner.mjs`, `--out` 아래 create-only). 시험은 `npm run validate:se-guidance`(2026-08-18: 42), fixture는 `docs/architecture/workspace/examples/se_stage_rules/next_steps_synthetic_v0.json`.

첫 실측(private pilot, 2026-08-18, run 04 판정 재사용): 030_SRR 카드 22 · 지시서 3(불명 3, 담당 형상관리 2·체계공학 1), 120_CDR 카드 28 · 지시서 3(불명 3, 담당 검증 1·SW 1·체계공학 1). 판정 수치는 run 04 그대로이고 이 층이 바꾼 것은 없다. 다만 run 04는 A2 이전 컴파일러로 돌렸으므로 재컴파일한 요구 수(22·28)와 판정이 센 요구 수(19·27)가 다르다 — 같아지려면 재컴파일한 정책으로 runner를 다시 돌려야 한다(다음 실행).
