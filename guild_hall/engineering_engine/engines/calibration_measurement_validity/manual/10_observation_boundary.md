# 10 — Observation boundary

E11 does not observe files, ERP records, instruments, environmental sensors, or certificates. An upstream Project Binding/Adapter may produce facts such as `calibration.status`, `due_at`, or `environment.status`, but this package receives only the typed values and immutable references.

Q1 supplies a pure candidate generator only. It turns already source-bound Typed Facts into six candidate rows and marks all of them as requiring owner confirmation. It does not scan a filesystem or promote presence to a confirmed fact.

An observation producer must not encode an LLM/RAG conclusion as a fact. If identity, certificate, interval, traceability, or environmental evidence cannot be supplied under its authority, it should emit an explicit absence or unknown state so E11 can report it rather than guessing.
