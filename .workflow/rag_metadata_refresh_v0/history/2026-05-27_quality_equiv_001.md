# Quality Equivalence Calibration - 2026-05-27

- Calibration: `cal_20260527_quality_equiv_001`
- Archive: `calibrations/cal_20260527_quality_equiv_001/`
- Workflow status label remains `pilot-executed`.
- Selected primary: `gpt-5.4-mini|low|dwarf|archivist` (quality gate pass, score 91).
- Shadow 1: `gpt-5.4|low|dwarf|archivist` (higher-detail pass, score 96).
- Shadow 2: `gpt-5.5|low|dwarf|archivist` (frontier low-effort pass, score 95).
- Shadow 3: `gpt-5.5|medium|dwarf|archivist` (conservative blocker pass, score 94).
- Boundary basis: public-safe synthetic fixture only; no private payloads, raw source text, NotebookLM answers, credentials, or runtime absolute paths were written into workflow canon.
- Primary selection follows the lowest-cost quality-gate-passing candidate rule for this staged matrix.
