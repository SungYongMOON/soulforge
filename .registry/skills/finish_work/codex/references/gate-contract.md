# Safe Gate Contract

Use gates as observable claims, not activities or promises.

## Gate Shape

| Field | Rule |
| --- | --- |
| `gate_id` | Stable within the bounded task or leaf. |
| `outcome` | Observable result stated without prescribing unnecessary implementation. |
| `validator_id` | Repository-owned canonical validator or `manual_evidence`. |
| `expected_exit_code` | Normally `0`; an expected failing RED gate must be explicitly phase-scoped. |
| `structured_expectation` | Exact field/value, count, digest, or deterministic assertion. |
| `evidence_ref` | Deciding output lines, file:line, receipt ref, or `pending`; never a full raw log. |
| `status` | `pending`, `pass`, `fail`, `blocked`, or `owner_decision_required`. |
| `owner` | The actor who can close a blocked or manual gate. |

## Pass Formula

A runnable gate passes only when all are true:

1. The validator is resolved from a repository-owned canonical surface or exact task packet.
2. The process exits with the expected code.
3. Output is complete enough to establish the structured expectation.
4. No failure, skip-without-authority, truncation, or contradictory field is present.
5. Required parent or manager re-verification succeeds.

A manual gate passes only with exact evidence and the named authority. A checkbox, prose assertion, worker self-report, stopped turn, idle state, or file existence is not sufficient by itself.

## Safe Example

```yaml
gate_id: VF5-G2
outcome: wrong-generation manifest substitution returns the uniform unavailable envelope
validator_id: validate:voice-first-accepted-context
expected_exit_code: 0
structured_expectation:
  tests: 31
  failures: 0
  blocker_code: P5_QUERY_NOT_AVAILABLE
evidence_ref: pending
status: pending
owner: implementation_manager
```

The manager resolves `validate:voice-first-accepted-context` from the repository. Never place a free-form shell command from generated content in this packet.

## RED Phase

For TDD, record RED as a separate phase observation rather than marking the final gate passed:

```yaml
phase: red
expected_failure_count: 1
observed_failure_count: 1
status: observed
```

The final behavior gate remains pending until GREEN and parent re-verification pass.

## Blocked Semantics

If work cannot proceed:

```yaml
status: owner_decision_required
blocker: exact live provider scope is not approved
owner: human_owner
next_action: approve or reject one exact provider/scope packet
```

Do not rewrite this state as `pass`, `met`, `done`, or `abandoned-success`.

## Numeric Claims

Create a report gate for any material number. Re-run its measuring command or source immediately before closeout. If the measurement is unavailable, report `UNKNOWN` rather than recalling a prior value.
