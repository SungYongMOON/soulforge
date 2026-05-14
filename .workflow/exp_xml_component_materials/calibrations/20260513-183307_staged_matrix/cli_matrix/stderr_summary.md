# CLI stderr summary

Raw stderr logs were intentionally not archived. The CLI emitted repeated Codex plugin warm-up 403 HTML warnings unrelated to candidate quality or telemetry. Candidate exit codes were zero for completed runs, and structured JSONL events plus final outputs are archived under `cli_matrix/stage_*/events/` and `cli_matrix/stage_*/outputs/`.
