# 10. Observation boundary

E07 consumes injected, bounded metadata and exact refs only. It does not open a hazard register,
test record, source PDF, contract, mail, RAG corpus, ERP row, or workspace file. No observation
attempt or unknown presence produces `gap_unknown`. After a successful observation, either a
declared confirmed absence or a missing required named evidence field produces `gap_missing`.
