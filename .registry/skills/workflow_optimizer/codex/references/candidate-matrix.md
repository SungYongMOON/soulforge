# Candidate Matrix

## Intent Selection

First decide whether model choice materially affects the workflow outcome. For deterministic/script-backed workflows whose authoritative result is owned by validators, record `optimization_not_applicable` and use at most a bounded compatibility smoke. Defer inactive or unused workflows unless a concrete risk, quality failure, or usage trigger justifies calibration.

Use `migration_validation` by default when model availability, model-family support, or pricing changes. Use `profile_search` for a first calibration, a materially changed workflow contract, no passing migration candidate, unstable close results, or an explicit request for broader optimization.

Do not build candidates until the exact executable runner launches and resolves supported efforts for each proposed model. A models cache, UI catalog, or filesystem-visible binary alone is insufficient. If the runner rejects catalog capability data (for example, an older runner encountering an unknown effort such as `max`), fails before output, or a newer executable cannot launch because access is denied, record `blocked_runner_catalog_incompatible`, retain the incumbent, and make no challenger-winner claim.

## Migration Shortlist

Build the bounded shortlist in this order:

1. The current incumbent profile.
2. Saved Top-K profiles whose workflow contract, gate, runner, and capability evidence are still applicable.
3. Available family challengers at their runner-supported default or recommended efforts.
4. A higher effort only when a lower/default effort fails quality or evidence predicts a material quality gain.

Keep the incumbent `species` and `class` fixed. Resolve effort support per model; never assume sibling models share the same effort set. Use `max` only when the runner supports it and a recorded quality/evidence escalation justifies it.

Treat `ultra` as a separate delegation-topology experiment, not a `reasoning_effort` value or an ordinary matrix cell. Test it only when both the workflow contract and runtime permit delegation; compare and archive it as a topology variant.

Archetype or sentinel results may eliminate or prioritize sibling candidates. They may not certify an untested sibling, rewrite the sibling's supported-effort policy, or stand in for a sibling's quality result.

## Expanded Staged Search

Expand only when at least one trigger is recorded:

- this is the workflow's first calibration;
- the workflow contract, output obligations, fixture class, or evaluator gate changed materially;
- no migration candidate passes;
- close results remain unstable after targeted repeats; or
- the user requests broader optimization.

Search in stages:

1. Compare runner-supported models and their default/recommended efforts with incumbent species/class fixed.
2. Escalate effort for quality only where Stage 1 evidence warrants it.
3. Compare species and class around the best passing model/effort when the workflow contract permits those dimensions to vary.
4. Re-run the top two or three when differences are close or stability is unresolved.

Do not run an exhaustive Cartesian product unless the user explicitly requests or authorizes it. Record omitted combinations as untested rather than implying coverage.

## Repeat Runs

For repeat runs, reuse still-applicable saved Top-K evidence before inventing nearby candidates.

- Produce the user-facing output with the saved primary profile.
- Shadow-run saved ranks 2-5 when the user asks for ongoing quality monitoring or when the workflow changed.
- If the primary fails the frozen quality gate or a shadow candidate repeatedly wins, update `profile_policy.yaml` or start the smallest justified staged expansion.
