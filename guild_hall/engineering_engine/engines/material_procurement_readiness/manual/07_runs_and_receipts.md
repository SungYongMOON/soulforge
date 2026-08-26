# Runs and receipts

The evaluator returns `assessment`, `domain_result`, and an evaluation receipt. The evidence
adapter separately returns a payload-free observation/evidence receipt. Both receipts carry
lineage, digest, cutoff, and fixed zero effect counters for filesystem writes, network, ERP
mutation, PO mutation, supplier commitment, and task creation.

The counters are contract values, not observed runtime measurements. The public-synthetic runner
writes deterministic JSON only to stdout and is not an ERP client.
