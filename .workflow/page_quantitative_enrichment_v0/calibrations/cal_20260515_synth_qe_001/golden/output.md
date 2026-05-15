# Golden Output Summary

Evaluator-only baseline used `gpt-5.5` with `xhigh`.

Expected outcome:

- Source-confirmed claims for `J1_PIN1.VIN_MAIN.voltage_range` and `U1_PIN3.REG_3V3.voltage_nominal`.
- Missing claims for `J1_PIN1.VIN_MAIN.max_current`, `J1_PIN2.GND.reference_role`, and `U1_PIN3.REG_3V3.max_current`.
- Review-required handling for `thermal.max_ambient_temp` because the 85 C fact is review-only and not tied to an approved operating condition.
- Patch-like overlay only; no source XML or normalized sidecar replacement.
- Machine-readable gaps and owner follow-up for every missing or review-required required quantity.
- Harness readiness delta only; no final harness approval or join validity claim.

The full baseline packet contained the required shapes: `quantitative_claims`, `enriched_sidecar_overlay`, `source_gap_report`, `owner_followup_needed`, `harness_readiness_delta`, `enrichment_provenance`, and `quantitative_enrichment_summary`.
