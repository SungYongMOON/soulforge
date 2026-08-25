# 07. Runs and receipts

The public-synthetic runner imports literals from the package fixture and writes one deterministic
JSON record to stdout. Its receipt reports zero filesystem reads/writes, network calls, model
calls, RAG/wiki calls, ERP/task writes, acceptance actions, and human-authority mutations.

Replay normalises rows by `case_id` before digesting. The same candidate input yields the same
assessment, result, receipt, and input digest even if input rows arrive in a different order.
