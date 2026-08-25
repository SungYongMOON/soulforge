# 01 — Purpose and shape

E11 is a small, pure Domain Engine. It consumes an immutable project-binding reference and typed facts about one synthetic or project-local measurement event. The package has two seams: the compiler supplies the base rule set; the evaluator compares that rule set with supplied facts.

It deliberately has no document reader, RAG client, certificate parser, ERP connector, filesystem path, or write API. Those belong outside this Domain Engine and must produce typed facts before evaluation.

The output is a list of determinations and an aggregate result impact. `valid` means only that all required E11 typed facts were supplied and mutually suitable under this limited rule set; it is not a laboratory, compliance, or product-acceptance decision.
