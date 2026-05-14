# page_xml_normalize_spec_v0 profile calibration

Calibration id: `20260514-205331_staged_cli_public_structural`

Result: set the primary workflow profile to `gpt-5.4 / medium / elf / auditor`.

The calibration used a public-safe structural fixture derived from the already public-safe `whole_xml_page_split_v0` calibration archive. It did not archive raw XML bodies, generated page XML payloads, runtime absolute paths, `_workspaces` outputs, `_workmeta` raw truth, credentials, cookies, or private-state material.

The default `subagent_quality_first` mode was blocked by the current runtime policy, so the archive is explicitly labeled `cli_only_calibration_with_manual_gate_review`. Stage A selected `elf|auditor`; Stage B compared model and reasoning effort; Stage C reran finalists and added a manual `gpt-5.4/medium` rerun because the literal-key rule evaluator under-scored equivalent manifest fields.

The selected profile passed the frozen quality gate while preserving 11 ordered source pages, stable page ids, source checksums, source XML immutability, sidecar-first `page_module_spec_v0.yaml` output, blank normalized refs unless derived review variants exist, review-required semantics, local/internal candidate separation, project-local output boundaries, and downstream `capture_xml_intake_library_v0` handoff.

Faster `gpt-5.4-mini` shadows remain in `profile_policy.yaml`, but their Stage C reruns stayed `pass_with_gaps` or failed coverage, so they are not the primary profile.
