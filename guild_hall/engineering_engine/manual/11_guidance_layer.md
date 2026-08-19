# 11. 안내 층 — 엔진의 "입"

`guild_hall/engineering_engine/guidance/` 세 모듈과 CLI 하나가 하는 일을 처음 보는 사람이
읽고 고칠 수 있게 적는다. 코드가 정본이고 이 장은 그 지도다.

## 11.1 목적 — 판단 옆에 안내를 놓는다

판단 층은 "이 단계에 이것이 있느냐"만 답한다(01장). 일부러 그렇게 만들었다 —
판정하는 쪽이 일하는 법까지 설명하기 시작하면 곧 일하는 법을 **정하기** 시작한다.

안내 층은 그 벽의 반대편이다. 같은 규칙 행을 읽어 **왜·언제·무엇을·어떻게·누가**를 붙여
사람이나 서브 에이전트가 움직일 수 있게 만든다. 계획 9.0.2 원칙 2의 그 문장이 이 층의 계약이다.

> 판단(A1·A2·D1·D2)은 결정론이고 문서를 직접 읽지 않는다. **안내(A3·E1)는 정본 인용 붙인
> 안내이며 판단을 바꾸지 않는다.**

"바꾸지 않는다"는 다짐이 아니라 코드의 규칙이다(11.4). 규칙 공급층(`stage_rules/`, 02·05장)이
기대를, 눈(`observation/`, 10장)이 관측을, 판단(`subjects/`, 01장)이 판정을 만들고,
이 층은 그 셋을 읽어 **말**로 바꾼다. 설계 근거는 D47이며 D47 자체는 여전히
**Owner 승인 전 제안**이다(설계 §8).

## 11.2 입력 — 무엇을 받고 무엇을 안 받나

세 모듈 모두 순수 함수다. 파일·시계·난수·환경변수·네트워크를 쓰지 않고 **모델도 부르지 않는다**
(정적 effect pin 시험이 import graph 전체를 `node:crypto` 하나로 묶어 둔다).

| 입력 | 어디서 | 무엇에 쓰나 | 없으면 |
| --- | --- | --- | --- |
| `compile_result.mapping_table` | `compileStageRules`(5.1) | 행마다 근거 등급·기대 상태·입력 토큰·성숙도 | 필수 |
| `compile_result.needs_stage_declarations` | 같은 곳 | 단계 순번 | 필수 |
| `vocabulary` | `artifact_vocabulary.mjs`(04장) | 표시명·기본 담당 capability | 필수 |
| `compiled_variant` | 사업유형 compiled 스펙 | 스펙 행의 `desc`·`name`·`term`·`template`·`verification_status` | 카드가 "설명 없음·양식 없음"으로 정직하게 줄어든다 |
| `work_order` | `orderStageWork`(5.4A) | 같은/앞 게이트 입력 수, 막힘 여부, 관측 상태 | `when`이 단계만 말한다 |
| `assessment` | runner stdout(`role_bound_assessment`) | 판정·mission 후보·요구 수 | 지시서에 필수 |
| `source_catalog` | 정본 색인 영수증(source_key 목록, 있으면 `source_family`) | 인용한 출처가 색인에 있나, 어느 계열인가 | `catalog_known: null`, 근거 계열 전부 `unknown` |
| `template_library` | 호출자(CLI가 양식 라이브러리를 훑어 만든 상대 참조 목록) | 그 산출물의 양식 **파일**을 과제가 이미 갖고 있나 | `양식 라이브러리 미조회` |
| `context_fill` | 호출자 | 기한(`due_dates`)·담당자(`owners`) | `due: null`, `principal_ref: null` |
| `known_at` | 호출자 | 지시서의 시각 | 거부(이 층은 시계를 안 읽는다) |

`mapping_table`에는 `desc`·`template`·`verification_status`가 없다(스펙 행에 남는다). 그래서 카드가
"이게 무엇인지"까지 말하려면 컴파일 결과 **말고** 스펙도 같이 받아야 한다.

## 11.3 가이드 카드 — 각 칸이 어디서 오나

`guide_cards.mjs`의 `buildGuideCards(request)`가 **(단계, 산출물 종류)마다 카드 하나**를 만든다.
엔진 요구가 된 행 전부, 그리고 요구가 아니어도 **활동·결정 행**은 카드를 받는다 — 그 행들이
"무슨 일을 해야 하는지"를 말하는 행이기 때문이다. 맥락으로 남은 *문서* 행(INBOX·LOG·근거 미표기 행)은
카드를 받지 않고 `skipped_context_rows`로만 센다.

| 칸 | 값이 오는 곳 | 문장이면 쓰는 템플릿 |
| --- | --- | --- |
| `title_ko` / `title_en` | 어휘의 `label_ko` / `label_en` | — |
| `purpose` | 스펙 행의 `purpose_ko`·`purpose_refs`(03장 §3.10) | — |
| `used_by` | mapping table 역방향 중 **같은/뒤 게이트**의 행 | — |
| `gate_role` | 행의 `gate_role`(02장 §2.7) | — |
| `why[]` ① 목적 | `purpose`(없으면 없다고 말한다) | `why_purpose_stated` / `why_purpose_absent` |
| `why[]` ② 없으면 막히는 것 | `used_by` + 어휘 표시명 | `why_used_by_named` / `why_used_by_named_more` / `why_used_by_none` |
| `why[]` ③ 게이트 역할 | 행의 `gate_role`(`core`·`entry`일 때만) | `why_gate_role_core` / `why_gate_role_entry` |
| `why[]` ④ 근거 등급 | 행의 `evidence_level` | `why_evidence_<등급>` 6종 |
| `why[]` ⑤ 기대 상태 | 행의 `minimum_presence_rule` | `why_presence_<규칙>` 3종 |
| `why[]` ⑥ 행의 종류 | 행의 `node_kind`(활동·결정일 때만) | `why_node_activity` / `why_node_decision` |
| `why[]` ⑦ 인용 없음 | 행의 `source_refs`가 비었을 때만 | `why_source_absent` |
| `why[]` ⑧ 정본 대조 | 스펙 행의 `verification_status` | `why_verification_status` |
| `why[]` ⑨ SE 바닥 | 행의 `se_floor` | `why_se_floor` |
| `when.maturity_expected` | 행의 `maturity` | 없으면 `when_maturity_absent` |
| `when.stage_sequence_note` | 순서 계산의 같은/앞 게이트 입력 수 | `when_stage_with_inputs` / `when_stage_only` |
| `what.name` / `term` / `desc` | 스펙 행 그대로 | — |
| `what.evidence_record` | 행의 `evidence_record` + 어휘 표시명 | — |
| `how.template` | 스펙 행의 `template`(`없음`은 양식이 아니다) | `how_template_stated` / `how_template_absent` |
| `how.template.library` | 양식 라이브러리 조회 결과(토큰 → 스펙 이름 → 약어 순) | `how_template_library_found(_versioned)` / `_absent` / `_unknown` |
| `how.inputs` | 행의 `depends_on` + `dependency_resolution`(범위) + 어휘 표시명 + 순서 목록의 `observation_state` | `how_inputs_listed` / `how_inputs_none` |
| `how.input_state_counts` | 입력별 있음(present)·없음(absence_confirmed)·불명(unknown·unobserved) | `how_inputs_state` |
| `how.produces_for` | mapping table 역방향 — 이 토큰을 입력으로 적은 행 | — |
| `how.method_refs` | 행의 `source_refs`(등급=행 등급) + `depends_on_refs`(등급=`depends_on_evidence`) | `how_method_listed` / `how_method_absent` |
| `how.method_families` | 같은 인용을 카탈로그의 `source_family`로 묶음(규정·가이드북·실무지침서·일반SE·발주처 계약·미표기) | `how_method_family` |
| `who.capability_default` | 어휘의 `capability_default` | `who_capability` / `who_capability_absent` |
| `evidence` | `evidence_level`·`verification_status`·`se_floor`·`minimum_presence_rule` | — |
| `citations` | `source_refs` + `depends_on_refs`, 카탈로그가 있으면 제목·판 | — |

지켜야 할 세 가지:

1. **문장을 짓지 않는다.** 카드의 한국어는 전부 `GUIDE_CARD_TEMPLATES`의 고정 틀이고 슬롯 값은
   행에서 복사한다. 문장은 `{template_id, text_ko, slots}`로 나가며 시험이 재렌더해 대조한다.
   새 문장이 필요하면 **템플릿을 늘리고** 코드 안에서 문자열을 조립하지 않는다.
2. **행이 말하지 않은 것은 말하지 않는다.** 양식 없으면 `양식 없음`, 인용 없으면 `근거 미표기`.
   일반 지식으로 채우면 인용된 지시와 구분할 수 없는 지시가 사람 앞에 놓인다.
3. **인용은 위치만.** `{source_key, locator}`만 싣고 원문은 싣지 않는다. 카탈로그가 모르는 출처는
   `catalog_known: false`로 남는다.

`card_id`는 카드 내용의 digest에서 나온 **handle**이지 발행된 식별자가 아니다(발행 경계는 직렬,
`kernel/minting.mjs`). 같은 행을 가진 두 호출자는 같은 handle을 얻는다.

## 11.4 지시서 — `instruction_packet_v0`

`instruction_packet.mjs`의 `buildInstructionPackets(request)`가 mission 후보마다 지시서 하나를
만든다(schema `soulforge.engine_instruction_packet.v0`, D47). 지시서 = **엔진 판정 + 카드 + 맥락 채움**.

| 필드 | 내용 | 출처 |
| --- | --- | --- |
| `for` | 단계·산출물 토큰·행 종류·요구 id·과제 별칭 | mission + 순서 목록 |
| `what` | 표시명·스펙 이름·설명 | 카드 |
| `why` | `engine_finding`·`reason_code`·`blocked_by`·`ready` + `purpose`·`used_by`·`gate_role` + 카드의 `why` 문장들 | 엔진 + 카드 |
| `inputs` | 입력 토큰·표시명·범위 + `input_state`(`present` / `absent` / `unknown`) + 원래 `observation_state` | 카드 + 순서 목록 |
| `output` | 기대 산출물·성숙도·기대 상태·증거 기록 | 카드 |
| `how` | 양식(+라이브러리 파일 참조)·근거 인용·근거 계열·이 항목을 입력으로 쓰는 항목 | 카드 |
| `who` | capability·논리 역할·`principal_ref` | 어휘 + 엔진 role_decision + `context_fill.owners` |
| `due` | 기한 | `context_fill.due_dates`만 |
| `judgment_ref` | `policy_ref`·`assessment_handle`·`requirement_counts`·판정 상태 | 엔진 stdout **복사** |
| `guidance_ref` | `card_id` | 카드 |

`engine_finding`은 엔진 어휘를 옮긴 것이다: `missing→gap_missing`, `unknown→gap_unknown`,
`conflict→gap_conflict`, `risk→open_risk`. 아직 아무도 안 본 항목은 판정이 아니므로 따로
`not_yet_observed`로 적는다.

**판단 불변을 지키는 두 장치:**

- **복사, 재계산 금지.** `judgment_ref`의 정책 ref·판정 handle·요구 수는 엔진 출력을 그대로 옮긴다.
  이 층이 자기 수를 만들면 같은 질문에 두 숫자가 돌아다니고, 사람이 읽는 쪽은 안내에 적힌 수다.
- **금지 키 검사.** 지시서 어디에든 `presence_state`, `observation_id`, `observation_attempt_ref`,
  `artifact_revision_ref`, `task_intent(_created)`, `approval_ref`, `approved`, `done`, `completed`,
  `stage_cleared`, `erp_write`가 나타나면 **빌드를 거부한다**. 관측이나 완료 표시를 실은 지시서는
  writer가 먹는 packet과 구분되지 않고, 언젠가 누군가 먹인다.

`claim_ceiling`은 언제나 `candidate`, `authority` 일곱 플래그는 전부 `false`, `effects`는 전부 0이다.
담당은 **논리 역할**이며 사람은 호출자가 준 경우에만 들어간다.

## 11.5 답 한 장 — `next_steps.md`

`answer_render.mjs`의 `renderNextStepsAnswer(request)`가 한국어 마크다운과 같은 내용의 JSON을 낸다.
순서는 고정 4부다.

| 부 | 내용 |
| --- | --- |
| **1 위치** | 판정 상태·바닥 상태, 요구 수(충족·결손·불명·해당없음·상충), 순서 목록 중 안 막힌 수, 열린 위험 |
| **2 부족** | 결손·불명 수와 엔진이 지목한 상위 5건(토큰·표시명·판정·사유·담당 capability) |
| **3 다음 할 일** | 지시서마다 무엇을 · **왜**(목적 · 없으면 막히는 것 · 판정과 근거) · **어떻게**(입력 상태 · 양식 · 방법 근거 · 담당) · 산출 · 기한 |
| **4 그 뒤** | 막힌 항목과 그것을 막은 입력 |

수치를 먼저 놓는 이유가 있다. 할 일부터 읽은 사람은 "엔진이 결손이라 판정한 것"과
"아직 아무도 안 본 것"을 구분하지 못한 채 움직인다.

**"다음 3개"를 고르는 규칙**(`--top N`, 기본 3):

1. 엔진이 낸 mission 후보를 순서대로 쓴다. 엔진은 이슈를 `conflict → unknown → risk → missing`
   순, 같은 종류면 요구 id 오름차순으로 정렬해 **최대 3개**만 낸다(subject 정본).
2. 그것이 N보다 적을 때만, 순서 목록에서 **안 막혔고 아직 "있음"으로 관측되지 않은** 항목을
   순서대로 채운다. 이미 mission 후보가 다룬 요구는 뺀다.
3. 채운 항목은 `instruction_kind: next_ready` · `engine_finding: not_yet_observed`로 표시한다 —
   판정이 아니라 아무도 안 본 것이기 때문이다.

마지막 줄은 언제나 "이 답은 안내이고 판단은 엔진 영수증이 정본"이라고 스스로 적는다.

## 11.6 출력 5종과 저장 위치

파일을 읽고 쓰는 자리는 CLI 하나뿐이다.

```text
node guild_hall/engineering_engine/tools/engine_next_steps_runner.mjs \
  --compile-dir <abs dir> --assessment <abs json> --stage <code> --out <abs dir> \
  [--compiled-variant <abs json>] [--observations <abs json>] [--source-catalog <abs json>] \
  [--context-fill <abs json>] [--template-library <abs json>] [--template-library-root <abs dir>] \
  [--top N] [--known-at <instant>]
```

`--template-library-root`는 양식 라이브러리를 **읽기 전용으로 훑어**
`<게이트>/<산출물 폴더>/00_Temp/templates_or_forms/**`의 첫 파일을 산출물마다 하나씩 모은다. 답에 실리는 것은
라이브러리 **이름**과 라이브러리 **안쪽 상대 경로**뿐이다 — private worksite의 절대 위치는 나가지 않고, 순수
층은 절대 경로나 `..`가 섞인 참조를 받으면 거부한다. 이미 만들어 둔 목록이 있으면 `--template-library`로 준다.

`--compile-dir`에서 읽는 것은 드라이버가 이미 쓴 `mapping_table.json`과
`needs_stage_declarations.json` 둘이다.

| 파일 | 무엇 |
| --- | --- |
| `guide_cards.json` | 카드 전부 + 영수증(템플릿 id 목록, 카드 수, 양식·인용 없는 수) |
| `instructions.json` | 지시서 + 영수증(금지 키 목록, 판정별 수) |
| `next_steps.md` | 사람이 읽는 답 한 장 |
| `next_steps.json` | 같은 답의 구조 |
| `receipt.json` | 네 영수증(순서·카드·지시서·답) + 입력 요약 + `authority`·`effects` |

`--out` 아래에만 쓰고 **이미 있는 답은 덮어쓰지 않고 거부한다**(`NEXT_STEPS_OUTPUT_EXISTS`) —
답은 그 시점에 엔진이 한 말의 기록이고, 조용히 갈아치울 수 있는 기록은 기록이 아니다.
`--known-at`이 없어도 거부한다(순수 층이 시계를 안 읽으므로 호출자가 시각을 댄다).
저장 위치는 답이 `_workspaces/<project>/…/06_validation/next_steps_<run>/<stage>/`,
영수증이 `_workmeta/<project>/runs/next_steps_<run>/`(metadata-only, 쓰기 전 `guard:workmeta-write`).

## 11.7 P26-014 첫 답 실측 (2026-08-18)

run 04의 판정을 **그대로 재사용**하고 두 단계를 현재 컴파일러로 다시 컴파일한 뒤 CLI 1회.

| | 030_SRR | 120_CDR |
| --- | --- | --- |
| 카드 | 22 (문서 19 · 활동 3) | 28 (문서 27 · 활동 1) |
| 지시서 | 3 (전부 불명) | 3 (전부 불명) |
| 상위 3 토큰 | `cm_plan` · `fci` · `icd` | `critical_parts_test_report` · `dbdd` · `icd` |
| 담당 capability | 형상관리 2 · 체계공학 1 | 검증 1 · SW 1 · 체계공학 1 |
| 순서 목록 / 막힌 것 | 22 / 4 | 28 / 1 |
| 관측 공급 / present | 12 / 0 | 12 / 8 |
| 양식 없는 카드 | 2 / 22 | **11 / 28** |
| 인용 수 / 색인에 없는 출처 | 67 / 2 | 53 / 11 |
| 판정 수(run 04) | 불명 19 | 충족 5 · 결손 4 · 불명 18 |

이 층이 바꾼 판정은 0이다. 다만 run 04는 A2 이전 컴파일러로 돌렸으므로 **재컴파일한 요구 수(22·28)와
판정이 센 요구 수(19·27)가 다르다** — 답에도 "요구 19건 / 순서 목록 22건"으로 그대로 보인다.
같아지려면 재컴파일한 정책으로 runner를 다시 돌려야 한다.

관측 하나가 어긋났다: 같은 토큰을 자동 훑기는 있음, run-02 Owner 확정은 없음으로 봤다.
**Owner 확정이 이긴다**(D37) — 그리고 그 사실을 영수증에 남긴다.

## 11.8 한계 — 이 층이 아직 못 하는 것

| 한계 | 뜻 | 어디서 풀리나 |
| --- | --- | --- |
| 목적 없는 카드가 남는다 | 정본이 그 산출물의 목적을 말하지 않은 자리는 비어 있다(② 29/100 토큰, ① 36/115). 카드는 `정본에 목적 문장 없음`이라고 적는다 | 정본 추가 독해(03장 §3.10 미결) |
| 그 조문이 무슨 요건인지까지는 아니다 | 목적 한 문장과 인용 위치까지다. 조문의 실제 요건 본문은 인용 위치를 열어야 안다 | 조언 lane(E1) |
| 양식 파일은 라이브러리가 가진 만큼만 | 스펙이 양식을 적었어도 라이브러리에 파일이 없으면 `양식 파일이 라이브러리에 없다`. KVDS 실측 1/22(SRR)·5/28(CDR) | 양식 라이브러리 채우기 |
| 인용에 제목이 없다 | 색인 영수증이 source_key만 갖고 title·판을 갖지 않아 `catalog_known`만 붙는다 | 색인 카탈로그에 title 필드 |
| 기한·담당자가 빈다 | `context_fill` 공급 경로가 아직 없다(계획 9.0.4의 세·네 번째 쓰임) | 맥락 층·답변 우편함(B2) |
| 중요도 정렬이 없다 | 지금 순서는 엔진의 이슈 순서와 순서 계산의 tie-break뿐이다. 위험·기한·영향 기반 우선순위는 없다 | A2 후속(순서 계산 확장) |
| 내용의 질을 못 본다 | "있다"까지만. 있는 문서가 제대로인지는 문서 내용 검사기(D1)의 몫 | D1 |

## 11.9 이 부품을 고칠 때 순서

1. **fixture 먼저.** `docs/architecture/workspace/examples/se_stage_rules/next_steps_synthetic_v0.json`에
   바꾸려는 상황(양식 있는 행, 인용 없는 행, 해결 안 되는 입력…)을 합성으로 만든다. 실제 과제 자료·이름은 넣지 않는다.
2. **시험 다음.** 기대 수치를 fixture의 `expected`에 손으로 적고 먼저 실패시킨다. 문장을 늘렸으면
   "모든 문장이 template_id로 재렌더된다" 시험이 자동으로 잡는다.
3. **코드와 CLI.** 순수 모듈을 고치고 파일 입출력은 CLI에서만 한다. 새 출력 파일은 `OUTPUT_FILES`에
   더해야 create-only 검사가 그것도 지킨다.
4. **문서.** 이 장, 05장 §5.6, 엔진 `README.md`, `CHANGELOG.md`. `tools/` 아래 파일이 늘거나 엔진
   README가 바뀌면 엔진 manifest를 다시 만든다.

검증: `npm run validate:se-guidance`(2026-08-19: 55) · `validate:se-stage-rules`(53) · `validate:canon` ·
`validate:path-length` · local-absolute-path(`--scope changed`) · `emit_manifest --verify`.

## 11.10 "왜"와 "어떻게"를 채운 방식 (2026-08-19)

첫 답을 읽은 Owner의 지적이 이 절의 이유다: **카드의 "왜"가 이유가 아니었다.** 세 문장이 나가는데
그 셋이 "규정이 요구한다 / 있어야 한다 / 정본 대조 결과는 source_supported다"였다. 인용은 붙어 있는데
**무엇을 위한 것인지**가 없었다. "어떻게"도 마찬가지로 양식 이름과 인용 개수뿐이었다.

고친 방식은 이 층의 규칙을 바꾸지 않는다 — **여전히 문장을 짓지 않는다.** 대신 말할 거리를 세 군데에서 더 가져온다.

| 새로 말하는 것 | 어디서 오나 | 짓지 않는다는 뜻 |
| --- | --- | --- |
| 목적 | 스펙 행의 `purpose_ko` + `purpose_refs` | 정본이 그 산출물의 목적을 말한 문장을 리더가 뽑아 스펙에 적어 둔 것이다(03장 §3.10). 이 층은 복사만 한다 |
| 없으면 무엇이 막히나 | 규칙표의 역방향 간선 중 같은/뒤 게이트의 행 | 규칙표가 이미 말한 관계다. 새 주장이 아니라 **계산**이다 |
| 이 게이트의 무엇인가 | 행의 `gate_role`(`core`·`entry`) | 정본의 회의별 주요 산출물·INPUT 표에서 온 표시(02장 §2.7). `supporting`은 기본값이라 아무 말도 하지 않는다 |
| 입력이 지금 있나 | 순서 목록의 `observation_state` | 눈이 본 것을 그대로 옮긴다. **아무도 안 본 것은 불명이지 없음이 아니다** |
| 양식 파일이 있나 | 호출자가 준 양식 라이브러리 목록 | 파일 내용은 읽지 않는다. 있는지와 라이브러리 안 상대 위치까지다 |
| 어느 계열의 근거인가 | 색인 카탈로그의 `source_family` | 계열은 정본에 대한 사실이라 카탈로그가 말한다. 카탈로그가 없으면 전부 `미표기`다 |

두 가지를 같이 고쳤다.

- **`template: 없음`은 양식이 아니다.** ② 스펙은 양식이 없는 행에 `없음`이라고 적는데, 그것을 양식 이름으로
  읽으면 지시서의 양식 줄에 "없음"이라는 이름의 양식이 놓인다. 이제 `양식 없음`으로 읽는다(KVDS SRR에서 10행이 바뀌었다).
- **답의 3부가 두 덩어리로 갈렸다.** `왜 · 목적` / `왜 · 없으면 막히는 것` / `왜 · 판정과 근거`,
  그리고 `어떻게 · 입력` / `어떻게 · 양식` / `어떻게 · 방법 근거` / `어떻게 · 담당`. 한 줄에 이어 붙이면
  읽는 사람이 맨 앞만 읽고 나머지를 규칙 상투구로 넘긴다.

**KVDS 실측(2026-08-19, run `next_steps_20260819_01`)**: 판정은 그대로다(재실행한 판정 handle이 08-18 것과 같다).

| | 030_SRR | 120_CDR |
| --- | --- | --- |
| 카드 | 22 | 28 |
| 목적 있음 | 20 | 14 |
| 없으면 막히는 것이 있는 카드 | 2 | 6 |
| 양식 파일 찾음 | 1 | 5 |
| 양식 없음(정정 뒤) | 12 (이전 2) | 15 (이전 11) |
| 인용 수 / 계열 미표기 | 67 / 2 | 53 / 11 |

한 단계만 컴파일한 디렉터리를 읽었으므로 `used_by`는 같은 게이트 안의 간선만 센다. 그리고 이 컴파일은
`gate_role`이 mapping table에 들어가기 전 것이라 카드의 `gate_role`이 전부 비어 있다 — 다시 컴파일하면 채워진다.
