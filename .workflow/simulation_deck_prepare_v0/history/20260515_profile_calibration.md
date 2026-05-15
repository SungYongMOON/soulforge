# 2026-05-15 Profile Calibration

`simulation_deck_prepare_v0` was calibrated with a public-safe synthetic LTspice deck-prepare fixture.

Recommended primary profile: `gpt-5.4-mini`, `medium`, `dwarf`, `auditor`.

Rationale: the primary profile passed all blocker and boundary gates while staying in the lowest model tier observed to produce a complete, independently evaluable packet. `gpt-5.4 medium / dwarf / auditor` is retained as the shadow profile when dependency framing quality is more important than cost.
