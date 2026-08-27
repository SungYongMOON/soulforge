# Purpose and shape

E06 asks one narrow question: with an exact Project Binding, does the selected R&M evidence
row have enough traceable information to be reported as ready, missing, unknown, conflicting,
or not applicable?

```text
source-supported base rules + optional bound Profile additions
  -> Core compiler Adapter -> Effective Rule Set
exact Project Binding + Typed R&M facts
  -> evaluator Adapter -> state + digest + zero-effect receipt
```

The compiler answers what candidate evidence should be checked. The evaluator answers how the
bound, observed facts compare with that candidate. Neither reads source bodies or makes a
project decision. The current evaluator executes only the reviewed base rules; a Profile-added
rule has provenance but stays non-executable until a later source/evaluator revision covers it.
