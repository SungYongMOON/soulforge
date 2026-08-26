# Purpose and shape

> Given one exact, read-only ERP snapshot and its Project Binding, does each material need have
> enough supplied availability by its need date, and which bounded fact gap prevents readiness?

The answer is a deterministic candidate interpretation at `source_supported` at most. It does
not accept a product, supplier, project, or schedule and cannot create a purchase order, alter
inventory, or contact a supplier.

The package shape is a Domain compiler/evaluator Adapter plus a package-local Project Evidence
Adapter. The evidence adapter accepts injected binding metadata, snapshot facts, and cutoffs; it
does not connect to ERP, files, RAG, or a network.
