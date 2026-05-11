# Goal-Seeking Exploration

A is a bounded goal/workflow optimizer, not a passive retry loop.

## Policy

- Be persistent but bounded.
- Search for safe alternative strategies when the current approach is saturated.
- Do not keep retrying the same method when residual mismatches repeat without new information.
- Classify every blocker before choosing the next strategy.
- Prefer progress-generating experiments over repeated blind retries.

## Saturation Signals

Treat a method as saturated when:

- the same mismatch repeats after a focused edit
- the next edit would only restate the previous instruction
- the missing evidence is outside the current source packet
- the tool path cannot be validated safely
- the pass bar mixes general skill quality with fixture-specific strictness
- executor/verifier outputs add no new information

## Allowed Alternative Strategies

- Add approved non-oracle source packets.
- Run preflight/source survey when source sufficiency, tool readiness, or acceptance criteria are unknown.
- Create a seed workflow when no workflow exists and source discovery supports a minimal safe design.
- Run domain-source review, such as official specifications, technical datasheets, standards, style guides, source examples, approved briefs, or library metadata.
- Run tool readiness or tool roundtrip workflow.
- Write an experience packet to compress prior results before the next workflow edit.
- Switch from `warm_evolve` to `cold_replay` when the next question is validation from the original baseline artifact.
- Split one skill into multiple bounded skills.
- Promote the effort into a multi-skill workflow.
- Switch from benchmark mode to `goal_reconstruction`, with evidence reclassified accordingly.
- Create a fixture-driven workflow evolution run.
- Extract reusable skill candidates after successful reconstruction.
- Propose a pass-bar split only when evidence shows the current pass bar mixes general skill quality with fixture-specific strictness.

## Strategy Ledger

For every strategy change, record:

- `attempted_strategy`
- `result`
- `blocker`
- `next_strategy`
- `why_next_strategy_is_different`
- `evidence_file`
- `benchmark_integrity_remains_valid`

Use `STRATEGY_LEDGER.yaml` as the template for run evidence.

## Stop Rules

Stop and request a human decision when:

- next action would modify original files
- next action needs unsafe GUI/tool action
- next action requires secrets, license values, raw mail, or attachments
- next action would pass oracle-only data into benchmark construction
- pass bar must be changed
- source asset is missing and cannot be obtained from approved non-oracle sources
- repeated attempts produce no new information
- budget is exhausted

## Evidence Reclassification

If oracle-only data is needed for construction, do not pass it into benchmark execution. Switch to `goal_reconstruction` only with explicit evidence reclassification, or stop for human decision.
