# E06 Reliability and Maintainability Build Mission v0

- `mission_id`: `E06-reliability-maintainability-domain-engine-v0`
- `output_state`: `implementation_candidate`
- `claim_ceiling`: `source_supported` at most
- `execution_mode`: `deterministic_only`
- `effects`: filesystem/network/model/RAG/wiki/ERP/task/approval = `0`

## Bounded question

> Does an exact Project Binding contain enough traceable R&M evidence to report an
> evidence-ready state or a bounded gap for the candidate rule it selected?

The answer is never a reliability guarantee, maintainability demonstration approval,
availability calculation, failure closure, product acceptance, quality disposition, repair
authorization, support approval, spare-purchase recommendation, or project applicability
decision.

## Inputs and outputs

The evaluator accepts an exact `{ manifest, binding, domain_input, cutoffs }` envelope.
All project facts are typed exact refs. The evaluator returns an `assessment`, `domain_result`,
and `receipt` with deterministic digests and zero-effect counters.

An accepted rule can produce only:

- `satisfied` — exact applicability, context, authority, observation, and evaluation evidence
  are present;
- `gap_missing` — absence is positively confirmed after the exact prerequisite context is
  present;
- `gap_unknown` — applicability, context, authority, observation, or evaluation is unresolved;
- `gap_conflict` — two valid source claims conflict or an evaluated result says the selected
  criterion is not met; or
- `not_applicable` — an exact false applicability component and basis reference exist.

`satisfied` means evidence readiness only. For `RM-CLS-07`, it explicitly still reports that
the engine did not exercise closure authority.

## Required boundaries

1. Core owns common interface/orchestration; this package owns only R&M semantics.
2. Profile additions compile with identity/provenance, but their evaluation holds until a new
   source packet and evaluator revision explicitly support them.
3. R&M evidence kinds are a local closed vocabulary. They are not Quality evidence labels or
   cross-domain artifact aliases.
4. RAG is retrieval support only and is not an input/authority/effect of the evaluator.
5. Raw source text, private paths, project payloads, credentials, transcripts, and hidden
   reasoning are refused before rule evaluation.

## Completion conditions

The package is reviewable only after source-lock, compiler/Profile, evaluator state, hostile,
replay/digest, zero-write, manual/topology/integration-request, public/private boundary, and
fresh independent-review gates all pass. Integration, canon promotion, live project use, and
production activation remain separate Human Owner decisions.
