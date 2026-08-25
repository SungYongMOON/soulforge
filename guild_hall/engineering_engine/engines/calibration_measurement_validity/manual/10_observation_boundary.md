# 10 — Observation boundary

E11 does not observe files, ERP records, instruments, environmental sensors, or certificates. An upstream Project Binding/Adapter may produce facts such as `calibration.status`, `due_at`, or `environment.status`, but this package receives only the typed values and immutable references.

An observation producer must not encode an LLM/RAG conclusion as a fact. If identity, certificate, interval, traceability, or environmental evidence cannot be supplied under its authority, it should emit an explicit absence or unknown state so E11 can report it rather than guessing.
