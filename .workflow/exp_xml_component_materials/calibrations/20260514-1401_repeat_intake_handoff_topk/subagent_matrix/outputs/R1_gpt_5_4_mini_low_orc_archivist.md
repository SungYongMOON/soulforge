# R1 subagent output capture

The previous primary `gpt-5.4-mini/low/orc/archivist` preserved the major safety boundary and identified U1/U2 correctly, but its download_manifest grouped U1 EVAL artifacts under a DATA Sheet item list while only declaring `eval_dir` separately, and it rendered J1/R1/TP1 as `none_found` rather than clearly review-required/no-download. This failed the frozen repeat gate for explicit DATA Sheet/EVAL placement and review-required semantics.
