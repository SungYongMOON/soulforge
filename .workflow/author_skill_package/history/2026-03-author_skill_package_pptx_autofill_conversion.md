# author_skill_package pptx_autofill_conversion

## Scenario

- Source request: user-provided upstream Claude skill `pptx-autofill-conversion.skill`
- Candidate `skill_id`: `pptx_autofill_conversion`
- Goal: turn the upstream PPTX template-preserving workflow into a Soulforge tracked skill package without copying local sample files or mixing runtime install details into canon.

## Why This Was Routed Here

- The behavior is reusable across lecture proposals, lecture plans, and similar template-preserving PPTX tasks.
- The package needs both a canonical behavior description and an executor bridge with bundled helper scripts.
- Boundary review is needed because the upstream skill mixes detailed XML guardrails and local execution instructions in one prompt body.

## Curated Lessons

- A PPTX template-preserving skill can stay portable if the package carries scripts and references, while the actual source PPTX remains user input at runtime.
- The most reusable behavior is not "generate any presentation"; it is "keep the OOXML structure and replace only bounded text."
- Repeated placeholders such as `텍스트를 입력하세요` should be treated as an explicit replacement strategy choice rather than hidden magic.

## Public-Safe Outcome

- A new tracked package `pptx_autofill_conversion` was drafted under `.registry/skills/`.
- The package keeps helper scripts in `codex/scripts/` and detailed guardrails in `codex/references/`.
- Local smoke used the provided lecture proposal blank form as runtime input, extracted slide text, analyzed the template, replaced bounded text, repacked the deck, and passed validation.
- The smoke surfaced a concrete template detail: some placeholders carry leading spaces in slide XML, so trim-normalized exact-text replacement is now part of the bundled helper behavior.
- Sample PPTX binaries remain local runtime inputs rather than tracked skill assets.
