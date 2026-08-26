# Purpose and shape

The engine asks one bounded question: which exact `(BOM item, risk dimension)`
pairs are evidenced, risky, unknown, conflicting, or explicitly not applicable
under an existing Core binding and a Profile-bound threshold set?

```text
Core Profile Binding -> BOM/SCR Compiler -> Effective Rule Set
Core Typed Project Facts -> BOM/SCR Evaluator -> findings + deterministic receipt
```

The nine closed risk dimensions are lifecycle status, obsolescence signal, long
lead, sole source, alternate qualification, counterfeit control, supplier
concentration, geographic concentration, and continuity gap.

The engine has no write side effects and no access to a BOM database, ERP,
purchasing system, supplier portal, or RAG service. Those sources must be
adapted elsewhere into Core Typed Project Facts before evaluation.
