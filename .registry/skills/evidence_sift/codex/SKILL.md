---
name: soulforge-evidence-sift
description: Use when a Soulforge task has mixed-strength source claims and Codex must separate confirmed facts from weak, speculative, or missing evidence before drafting or deciding. Also use for requests mentioning evidence sift, evidence scan, claim confidence, source support, or archivist.evidence_scan.
---

# Soulforge Evidence Sift

Use this skill when the unit lens or workflow step calls for `evidence_sift` or `archivist.evidence_scan`.

## Core Rules

- Mention use of this skill briefly when it changes the work; lead the final answer with the result in the user's language.
- Identify the target artifact or decision that depends on evidence confidence.
- Separate claims into confirmed/source-supported, observed but not confirmed, speculative, contradicted, and missing-source buckets.
- Use the weakest supported claim ceiling. Do not promote advisory output, NotebookLM/LLM summaries, access ledgers, or analysis labels into source truth.
- Draft only from claims with sufficient support, and name the remaining gap or owner decision when support is weak.

## Stop Conditions

Stop the unsupported claim or dependent action when source access, source approval, private payload handling, or owner judgment is required. Report that limit and continue independent work using supported evidence within the authorized scope.
