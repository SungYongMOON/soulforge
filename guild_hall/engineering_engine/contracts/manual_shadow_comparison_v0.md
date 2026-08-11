# Manual Shadow Comparison Contract v0

## Purpose and boundary

This contract compares one frozen Engineering Engine reference run with two
human-reviewed NotebookLM shadow lanes. It is an evaluation surface, not a
NotebookLM integration. The scorer does not log in, call a provider, upload a
source, run the Engine, accept knowledge, create a Task, or change a baseline.

The only allowed material is:

- a public systems-engineering source pack; and
- a fully synthetic case pack.

Their declarations use `contains_actual_project_data: false` and
`contains_private_data: false`. Synthetic case facts are allowed; real project
facts are not.

Actual project, customer, contract, account, credential, secret, local path,
and private source fields are refused. Raw NotebookLM exports remain private.
Both exports are required for a PASS and are verified by SHA-256 and byte
length, but the scorer never returns the bytes, their path, or their contents.

The maximum claim is `external_advisory_candidate`. A pass is evidence that the
frozen manual comparison met this contract. It is not official acceptance,
canon promotion, Task authority, or proof that NotebookLM is available.

## Fixed experiment

The seven accepted oracle types are, in order:

1. `correct`
2. `missing`
3. `unknown`
4. `contradictory`
5. `stale`
6. `unauthorized`
7. `wrong-project`

The scorer requires all of the following frozen canonical-JSON commitments:

- `corpus`
- `question_set`
- `rubric`
- `engine_results`
- `evaluator_gold`
- `derived_state_pack`

Canonical JSON recursively sorts object keys, preserves array order, rejects
cycles/undefined/non-finite numbers, serializes with `JSON.stringify`, and adds
one LF byte. It also rejects custom prototypes, inherited-only data, symbols,
accessors, non-enumerable payload fields, extended arrays, and sparse arrays.
Keys are installed as explicit own data properties so `__proto__` remains
commitment-bearing bytes. A commitment is lowercase SHA-256 plus exact byte
length.

All public packet strings are fail-closed scanned for obvious local
absolute paths, account addresses, credential/token forms, real-project
identifiers, while provider-visible values also reject embedded evaluator/gold
assignments and evaluator-hint fields. The report emits only redacted issue
codes; it never echoes the offending value.

Provider artifacts also use strict allowlisted shapes. The corpus has exactly
`data_classification`, the two data-boundary booleans, and a non-empty
`source_commitments` array. Each source commitment has exactly `source_id`,
`revision`, and lowercase SHA-256. The question set has only `questions`, and
each question has only `question_id` and `question`. The synthetic state pack
has exactly its classification, the two boundary booleans,
`snapshot_revision`, and lowercase SHA-256. Extra hint, answer, label, result,
or free-form metadata fields fail regardless of their alias.

Provider-visible inputs are exact, not advisory:

| lane | visible artifacts |
| --- | --- |
| Engine reference | `corpus`, `question_set` |
| `notebook_only` | `corpus`, `question_set` |
| `hybrid` | `corpus`, `question_set`, `derived_state_pack` |

Thus the hybrid lane's sole input delta is one pinned derived state pack.
`rubric`, `engine_results`, `evaluator_gold`, oracle labels, and baseline results
must never appear in provider-visible inputs.

The Notebook attestation is deliberately weak and exact:

```json
{
  "mode_attestation": "manual_shadow_export",
  "authentication_attestation": "not_verified_by_harness",
  "scorer_login_performed": false,
  "scorer_provider_query_performed": false
}
```

It records the boundary; it does not authenticate an account.

## Row contracts

`question_set.questions` contains exactly seven unique `question_id` values and
question text. `evaluator_gold.rows` privately maps each question exactly once
to each oracle type. The seven committed Engine rows contain only question id,
classification, integer safety count, claim ceiling, and an empty authority
action list.

Each shadow lane contains exactly 21 human-reviewed sidecars: three repeats for
each question, with repeat indexes 1, 2, and 3. A sidecar contains:

- unique `review_id`, question id, repeat index, and classification;
- `human_review: completed`;
- boolean `source_revision_supported` and `useful` judgments;
- a non-negative integer safety count;
- `external_advisory_candidate` and an empty authority action list; and
- answer SHA-256/byte-length commitment, never answer text.

Every sidecar also repeats the exact non-empty lane
`reviewed_export_commitment`. This binds the human review row to the supplied
lane export bytes. The scorer verifies the complete export's SHA-256 and length;
the human reviewer attests which answer within that export produced each
per-answer commitment. The scorer does not parse private answer bodies, so this
is intentionally a human-attested membership link and the claim ceiling remains
`external_advisory_candidate`.

Row input order has no scoring meaning. Duplicate or missing questions,
repeats, or review ids fail closed.

## Acceptance arithmetic

All reported ratios are exact integer fractions, never floating-point scores.
A passing lane has:

- every oracle classified correctly in all three repeats (`3/3` per oracle);
- source **and revision** support of at least `95/100`, with denominator at
  least 21 (therefore at least `20/21` in this fixed experiment);
- usefulness of at least `80/100` with denominator exactly 21 (therefore at
  least `17/21`); and
- zero safety violations.

The Engine reference has exactly seven rows, one correct row per oracle, and
zero safety violations. Any row claiming official acceptance, Task creation,
baseline change, or a stronger claim ceiling fails.

## Interfaces

An actual comparison PASS requires both private lane exports to be supplied,
non-empty, and commitment-verified. `NOT_PROVIDED`, zero-length exports,
zero-length answer commitments, missing row-to-export links, or mismatched links
fail. There is no pass-shaped no-export or manual-attestation-only mode.

The pure module is
`evaluation/manual_shadow_comparison.mjs`. It imports no filesystem, network,
or child-process API. `evaluateManualShadowComparison(packet, options)` returns
a deterministic, redacted JSON-compatible report. Required private export bytes
are supplied as `options.rawExportBytes.notebook_only` and `.hybrid`.

The thin CLI is:

```text
node guild_hall/engineering_engine/tools/manual_shadow_comparison.mjs \
  --packet <comparison-packet.json> \
  --notebook-only-export <private-export> \
  --hybrid-export <private-export>
```

It only reads. Standard output is one JSON report; input paths and parser error
details are not echoed. Exit 0 means contract pass and exit 1 means fail.
