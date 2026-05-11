# Goal Reconstruction

Use `goal_reconstruction` when the user's priority is one concrete result rather than proving a reusable skill or benchmark-valid workflow.

## When To Use

- The user asks to solve one case by any safe means.
- reference/oracle material is needed during construction.
- A previous benchmark run is blocked because source evidence is insufficient, but the user still wants the case reconstructed.
- Tool operation, manual review, or owner-provided target details are part of the solution.

## Evidence Boundary

If reference artifacts, accepted outputs, V reports, previous candidates, repair packets, or reference-derived strict target data are used for construction, the result is reconstruction evidence only. Do not claim skill-validation, benchmark pass, or `verified-against-reference` for a reference-blind skill.

## Workflow

1. Declare `controller_mode: goal_reconstruction`.
2. Record which references are allowed for construction.
3. Separate protected or secret material from construction inputs.
4. Build the concrete artifact using safe sources and tools.
5. Verify the artifact against the user's concrete goal.
6. Record which steps are reusable and which were case-specific.
7. If the result succeeds and the procedure seems repeatable, switch only the reusable part into `skill_extraction_after_success`.

## Strategy Ledger

Goal reconstruction must still avoid blind retries. Record:

- attempted strategy
- result
- blocker
- next strategy
- why the next strategy is different
- evidence file
- whether benchmark integrity remains valid

If reconstruction succeeds, the next different strategy may be skill extraction. If reconstruction stalls because oracle-only data would be used in benchmark mode, explicitly keep the evidence classified as reconstruction or stop for human decision.

## Stop Conditions

Stop when original files would be modified without approval, a secret/license value/raw mail/attachment would be needed, a tool save/export action is unsafe, the user has not approved oracle use for construction, a missing source asset cannot be obtained from approved non-oracle sources, the pass bar must change, repeated attempts produce no new information, budget is exhausted, or the result depends on owner judgment that has not been provided.
