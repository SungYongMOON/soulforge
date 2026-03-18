# PPTX Autofill Conversion Mapping

## Soulforge mapping

- Canon skill id: `pptx_autofill_conversion`
- Canon linkage: `.registry/skills/pptx_autofill_conversion/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Upstream reference:
  - user-provided Claude skill package `pptx-autofill-conversion.skill`
  - user-provided supporting examples:
    - lecture proposal blank form
    - lecture plan similar form
    - hybrid PPT template

## Bundled resource map

- `scripts/office/unpack.py`: unpack a PPTX archive into an editable directory with pretty-printed XML where possible
- `scripts/office/pack.py`: repack an edited directory back into a PPTX archive
- `scripts/extract_slide_text.py`: extract per-slide text outline from a PPTX
- `scripts/analyze_template.py`: summarize slides, text counts, table counts, group shapes, and repeated placeholder text
- `scripts/replace_text_runs.py`: perform bounded exact-text replacement on slide `<a:t>` nodes
- `scripts/validate.py`: validate PPTX structure and optionally assert expected text strings

## Runtime notes

- The bundled scripts use Python stdlib only; no extra dependency was required for the current smoke path.
- The replacement helper supports exact-text and trim-normalized exact-text replacement, which covers placeholders that carry leading spaces in slide XML.
- Local smoke for this package used the provided lecture proposal blank form and produced a repacked, validated PPTX after 24 bounded replacements.

## Default operating modes

1. User-provided template exists:
   - extract slide text
   - analyze tables and shapes
   - draft a bounded content map
   - replace exact text runs
   - repack
   - validate
2. Multiple similar template examples exist:
   - choose the closest example for structure analysis
   - keep the actual target PPTX as the edit source of truth
   - widen scope only after the initial bounded replacement path fails

## Output expectations

- State whether the run was template-preserving or scope-widened.
- State which text values were intentionally replaced.
- State whether validation passed.
- If a target deck contains repeated placeholders, say whether the replacement was global or intentionally selective.

## Boundary note

- Detailed mapping lives here so `codex/SKILL.md` can stay lean.
- Actual model, MCP, tool, and installed skill selection remain runtime binding concerns.
