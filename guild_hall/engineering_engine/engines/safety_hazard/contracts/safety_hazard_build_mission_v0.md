# E07 Safety and Hazard — bounded build mission v0

Status: implementation candidate only.

## Outcome

Build one deterministic, read-only domain engine that reports evidence readiness for hazard and
residual-risk review. The only deep entry point is:

```text
assessSafetyHazard({ manifest, binding, domain_input, cutoffs })
  -> { assessment, domain_result, receipt }
```

The output is evidence readiness for human review, not residual-risk acceptance, hazard closure,
legal/contract compliance, product release, or task authority.

## Fixed boundaries

- Reuse the existing Core Domain Adapter, Profile binding, Typed Facts, authority,
  canonicalisation, manifest, and claim-ceiling contracts without modifying Core.
- Keep only public-safe metadata, locators, short paraphrases, hashes, synthetic references, and
  deterministic code in Git. Raw public source bodies belong only in the ignored common-knowledge
  workspace. Project/customer facts and actual human acceptance records are out of scope.
- Bind every rule to an exact source packet and `human_rule_acceptance_ref`. Do not default to
  every candidate row.
- A residual-risk acceptance authority must be supplied as `authority_kind: named_human`; an AI,
  engine, or anonymous authority role fails closed. The engine only confirms that bounded
  references exist and performs zero acceptance actions.

## Deterministic order

1. Refuse malformed, floating, stale, mismatched, unbound, private-path, or secret-like input.
2. Resolve all five Core applicability components; unresolved means `gap_unknown`, explicit false
   with a basis ref means `not_applicable`.
3. Preserve a valid source conflict as `gap_conflict`.
4. Check required authority-family and named-human evidence bindings.
5. Check observation attempt, confirmed absence, named evidence fields, supported life-cycle
   status, and risk-characterisation vocabulary in that order.
6. Emit only `satisfied`, `gap_missing`, `gap_unknown`, `gap_conflict`, or `not_applicable` plus
   evidence-axis and receipt metadata. Never emit a risk-acceptance decision.

## Completion evidence

- Public source inventory with authority/revision/access/applicability state and direct-source
  derivation/RAG boundary.
- Descriptor/schema/vocabulary/rules/compiler/evaluator and a closed `ContractError` surface.
- Core Profile, binding, and Typed Facts conformance without a Core change.
- Public synthetic fixture, hostile/replay tests, deterministic digests, and a zero-write runner.
- Manual, manifest factory, domain topology, and shared integration request.
- Focused validators, boundary scan, fresh independent review, scoped commit/push, and handoff.
