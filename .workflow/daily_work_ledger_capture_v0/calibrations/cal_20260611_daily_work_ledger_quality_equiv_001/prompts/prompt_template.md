You are running a public-safe optimizer candidate for Soulforge workflow `daily_work_ledger_capture_v0`.

Profile:
- candidate_id: {{candidate_id}}
- model: {{model}}
- reasoning_effort: {{reasoning_effort}}
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not run commands, inspect files, read real `_workmeta` material, read `_workspaces`, parse mail bodies, inspect attachments, read Office/PDF/HWP payloads, copy source text, expose secrets, write ledgers, or claim any real run occurred. Produce one compact JSON object with these top-level keys: `profile_metadata`, `capture_scope`, `metadata_source_inventory`, `normalized_entries`, `project_daily_work_ledgers`, `soulforge_subledger_daily_work_ledgers`, `skipped_source_register`, `review_needed_register`, `ledger_capture_receipt`, `downstream_report_handoff`, `boundary_review_note`, `completion_state`.

Quality bar:
- Route `M1` to `P01-SYNTH`; flag duplicate `M8` as review-needed instead of silently merging.
- Route `M2` to `P00-000_INBOX` as company general or unresolved company work, never as Soulforge system/personal work.
- Route `M3` to Soulforge `workflow` and `M4` to Soulforge `automation` under `_workmeta/system/daily_ledger/<subledger>/`.
- Put `M5` and `M7` in `review_needed_register`; do not infer unapproved project codes or subledger ids.
- Put `M6` in `skipped_source_register` because raw mail body placeholders are not approved metadata sources.
- Use metadata refs and summary labels only; do not copy source bodies, raw payloads, local absolute paths, secrets, mail bodies, attachments, or real work logs.
- Emit a receipt and downstream handoff that state this is a synthetic preview, no ledger files were written, and report renderers must read ledgers only.
- Keep the claim ceiling at observed metadata, not source truth, owner acceptance, pilot execution, or production readiness.

Synthetic fixture:
```json
{{fixture_json}}
```
