# Workflow Extraction

Use this reference after a successful reconstruction, warm/cold cycle, or workflow evolution run shows reusable behavior.

## Goal

Extract reusable workflow steps or skill candidates from evidence without leaking oracle-derived target data into benchmark construction.

## Inputs A May Use

- run manifest
- strategy ledger
- experience packets
- source packets
- redacted verifier verdicts
- candidate artifact summaries
- tool logs
- regression matrix
- user acceptance notes

## Extraction Rules

- Separate reusable procedure from fixture-specific repair.
- Separate source-backed domain rules from oracle-derived target facts.
- Do not put raw reference/oracle payloads into reusable workflow or skill instructions.
- Do not extract reusable construction steps from detailed oracle-derived mismatch reports in benchmark mode.
- If a step depends on oracle-derived facts, label it reconstruction-only or verifier-only.
- Convert repeated manual steps into workflow steps only after they appear in more than one successful fixture or after the user approves them as reusable.
- Convert a workflow step into a skill candidate only when the step has a stable trigger, bounded inputs, clear outputs, and a validation gate.

## Output

Write a workflow extraction packet before creating or modifying reusable workflow/skill files.

The packet should answer:

- Which evidence supports each proposed step?
- Which steps are reusable across fixtures?
- Which steps are fixture-specific?
- Which steps are oracle-derived and must not enter benchmark construction?
- Which source packets justify construction behavior?
- Which redacted verifier checks protect the extracted workflow?
- Which cold replay or final cold gate is still required?

## Stop Rules

Stop before extraction when:

- evidence comes only from a single failed fixture
- the proposed step requires hidden oracle data in benchmark mode
- the proposed step changes the pass bar
- source evidence is missing
- extraction would modify public or protected canon without explicit approval
- repeated attempts produce no new information
