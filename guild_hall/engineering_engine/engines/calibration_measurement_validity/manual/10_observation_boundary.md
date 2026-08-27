# 10 — Observation boundary

E11 does not observe files, ERP records, instruments, environmental sensors, or certificates. An upstream Project Binding/Adapter may produce facts such as `calibration.status`, `due_at`, or `environment.status`, but this package receives only the typed values and immutable references.

Q1 supplies a pure candidate generator only. It turns already source-bound Typed Facts into six candidate rows and marks all of them as requiring owner confirmation. It does not scan a filesystem or promote presence to a confirmed fact.

Each candidate retains its canonical direct-source envelope. Guidance validates that envelope again before it creates a card, so a fabricated candidate cannot borrow the source-bound label from the observation producer.

The observation seam first revalidates and snapshots the complete adapted Typed Facts v1 graph, including six-family provenance, source references, cutoff relationship, and typed-fact receipt digest. A nested Proxy, getter, substituted provenance reference, stale receipt, or malformed envelope is rejected before candidate construction; no candidate is emitted from partial or caller-relabelled evidence.

An observation producer must not encode an LLM/RAG conclusion as a fact. If identity, certificate, interval, traceability, or environmental evidence cannot be supplied under its authority, it should emit an explicit absence or unknown state so E11 can report it rather than guessing.
