# Candidate Matrix Notes

This directory preserves the optimizer archive shape for candidate and quality-eval indexes.

The final calibration ranking is based on isolated CLI runs under `cli_matrix/` because the app subagent runtime hit the thread concurrency limit during Stage A. The user explicitly approved CLI use. Subagent outputs were used only as an early sanity check; exact candidate usage and the final ranking come from `codex exec --ephemeral --json` outputs captured in this archive.
