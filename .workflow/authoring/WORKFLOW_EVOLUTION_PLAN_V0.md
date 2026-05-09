# Workflow Evolution Plan v0

## 목적

- 이 문서는 one-off 성공 사례를 반복 가능한 workflow/skill 후보로 바꾸고, 이미 만들어진 workflow 를 더 낮은 토큰과 더 낮은 모델 계층에서도 재현 가능하게 줄이는 authoring plan 이다.
- `workflow_evolution` 은 아직 `.workflow/index.yaml` 에 등록된 canon workflow 가 아니라, `.workflow/authoring/` 에 있는 public-safe 계획과 실험 대기실이다.

## 한 줄 정의

`workflow_evolution` 은 golden run, fixture, regression, harness candidate 를 사용해 workflow 를 발견하고 줄이는 절차다.

## 두 lane

### Discovery lane

- 목적: 단일 성공 사례에서 반복 가능한 절차를 추출한다.
- 입력: one-off reconstruction 결과, sanitized evidence, synthetic fixture.
- 출력: workflow candidate, skill boundary note, fixture candidate, regression criterion.
- 기본 owner:
  - project 가 분명하면 `_workmeta/<project_code>/reports/procedure_capture/workflow_evolution/**`
  - project 가 불명확하면 `_workmeta/system/reports/procedure_capture/workflow_evolution/**`

### Slimming lane

- 목적: 강한 모델이 만든 golden workflow 를 더 작은 prompt, 낮은 reasoning, 낮은 모델 tier 로 재현 가능한지 검증한다.
- 입력: golden workflow, fixture set, pass/fail criteria.
- 출력: execution profile 후보, 제거 가능한 step, skill 추출 후보, regression gap.

## Canon-lens compression

Soulforge 의 species/class/unit/skill 구조는 긴 역할 지시를 줄이는 compression layer 로 검증한다.

비교 축:

- `full_prompt`: 역할, 경계, 출력 형식을 자연어로 모두 설명한다.
- `class_compressed`: `administrator`, `archivist`, `auditor`, `healer` 같은 class lens 로 반복 지시를 줄인다.
- `species_class_compressed`: species/hero bias 와 class lens 를 함께 쓴다.
- `unit_compressed`: `.unit/<unit_id>/unit.yaml` 과 class 조합으로 actor 역할을 참조한다.

측정 항목:

- token reduction
- output shape 유지율
- boundary rule 유지율
- 작은 모델 pass rate
- 실패 유형
- 어떤 class/species 조합에서 drift 가 줄어드는지

Species 는 강제 규칙 owner 가 아니라 bias/lens 로만 사용한다. Class 는 reusable role behavior 와 skill/tool/knowledge ref 를 압축하는 owner 로 본다.

## Harness candidates

`/goal`, Ralph-style loop, promptfoo-style eval matrix, DSPy-style optimizer 는 모두 harness candidate 다. 이들은 곧바로 Soulforge canon 이 아니며, 먼저 synthetic/public-safe fixture 에서 검증한다.

| 후보 | 용도 | 현재 판정 |
| --- | --- | --- |
| Codex `/goal` | persistent objective runner, repeated challenge loop | sandbox harness candidate |
| Ralph-style loop | external repeat loop, long-running attempt cycle | sandbox harness candidate |
| promptfoo | prompt/model/fixture matrix comparison | optional eval matrix tool |
| OpenAI Evals | hosted/model eval and regression gate through the OpenAI SDK | installed local client, future eval candidate |
| DSPy | prompt/few-shot/program optimization | installed local optimizer candidate |

## 최소 experiment shape

```yaml
experiment_id: b_skill_workflow_evolution_001
lane: discovery | slimming | canon_lens_compression
harness: codex_goal | ralph_style | promptfoo | manual_loop
teacher_model: gpt-5.5
teacher_reasoning: xhigh
student_model: lower_model_or_same_model_lower_reasoning
input_fixture: synthetic_b_skill_case_001
expected_output_shape:
  - workflow steps
  - skill boundary
  - fixture candidates
  - regression criteria
pass_criteria:
  - no raw/private/secret leakage
  - output shape preserved
  - canon/runtime boundary preserved
  - repeated steps extracted
measure:
  - pass_rate
  - token_count
  - model_tier
  - failure_type
decision:
  - keep_local
  - workflow_candidate
  - skill_candidate
  - tool_candidate
  - reject
```

## Promotion gates

Workflow candidate 로 승격하려면:

- step sequence 가 반복 가능하다.
- actor slot 과 input/output 이 분명하다.
- fixture 3개 이상에서 public-safe pass/fail 판정이 가능하다.
- raw/private/secret 자료 없이 설명된다.

Skill candidate 로 승격하려면:

- 같은 behavior/output/boundary rule 이 둘 이상의 workflow 또는 task 에서 반복된다.
- `skill.yaml` 의 executor-neutral behavior 로 설명 가능하다.
- Codex bridge 나 local runtime binding 없이도 canon 의미가 유지된다.

Harness/tool candidate 로 승격하려면:

- 반복 실행의 중단, 예산 제한, 실패 보고 방식이 분명하다.
- synthetic fixture 로 최소 smoke 가 가능하다.
- public repo 자동 commit/push 없이도 실험 evidence 를 만들 수 있다.

## 다음 작업

1. B skill 제작 흐름에서 GPT-5.5 xhigh golden reconstruction run 1개를 만든다.
2. 같은 fixture 를 `full_prompt`, `class_compressed`, `species_class_compressed` 로 비교한다.
3. Codex `/goal` 과 manual loop 를 먼저 비교하고, Ralph-style loop 는 별도 sandbox 후보로 보류한다.
4. promptfoo eval matrix 와 DSPy optimizer 는 synthetic fixture 3개 이상이 생긴 뒤 사용한다.
5. Ralph-style loop 는 임의 package 설치 없이 Soulforge local sandbox runner 후보로 별도 설계한다.
6. 반복 성공한 public-safe 결과만 `.workflow/authoring/` draft 또는 `.workflow/<workflow_id>/history/**` 로 승격한다.
