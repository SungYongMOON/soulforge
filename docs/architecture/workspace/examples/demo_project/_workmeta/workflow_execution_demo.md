# Workflow Execution Demo

## 목적

- 이 문서는 tracked example 기준에서 workflow step 가 model, attached skill, MCP/tool hint 로 이어지는 방식을 요약한다.
- raw run payload, local source file, rendered artifact 는 이 문서에 올리지 않는다.

## demo workflow

- workflow: `build_lineage_map`
- tracked opening steps:
  - `investigate_sources`
  - `build_pbs`
- tracked binding:
  - `bindings/execution_profile_binding.yaml`
  - `bindings/skill_execution_binding.yaml`

## example matrix

| Scenario | Selected unit | Execution profile | Model | Attached skills | Preferred MCPs / tools | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| Knight baseline | `vanguard_01` | `analysis_heavy` | `gpt-5.1-codex-mini` | `soulforge-shield-wall` | `rg` | workflow step 의 기본 profile 로 boundary review 를 수행한다. |
| Draft assembly | `scribe_01` | `structured_planning` | `gpt-5.1-codex-mini` | `soulforge-record-stitch` | `rg`, `markdown_editor` | bounded note set 을 evidence-backed lineage draft 로 정리한다. |
| Candidate selection | `vanguard_01` | `analysis_heavy` | `gpt-5.1-codex-mini` | `soulforge-shield-wall` | `rg` | candidate unit 중 `shield_wall` 를 실제로 resolve 하는 unit 이 선택된다. |
| PDF profile override | `vanguard_01` | `pdf_evidence_review` | `gpt-5.4` | `soulforge-shield-wall`, `pdf` | `pdf`, `pdftoppm`, `pdfplumber` | execution profile override 로 heavier model 과 PDF-focused tooling hint 를 붙인다. |

## boundary

- workflow step 는 `action.skill_id` 와 `execution_profile_ref` 만 소유한다.
- tracked example opening phase 는 현재 seeded canon 이 지원하는 `shield_wall` 과 `record_stitch` 단계까지만 materialize 한다.
- model, reasoning, attached skill name, MCP/tool hint 는 local runtime binding 이 소유한다.
- raw execution truth 와 actual file inspection log 는 `_workmeta/<project_code>/runs/<run_id>/` 아래에만 남긴다.

