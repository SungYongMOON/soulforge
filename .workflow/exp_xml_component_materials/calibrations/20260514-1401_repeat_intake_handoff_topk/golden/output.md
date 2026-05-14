# Golden Baseline Summary

The evaluator-only `gpt-5.5/xhigh/orc/archivist` baseline produced the expected packet shape. It kept the optional downstream handoff as context only, inventoried exactly U1/U2/R1/TP1/J1 from PartInst, recovered U1 from Package/SymbolUserProp, confirmed U2 from PartInst props, routed R1/TP1/J1 to review, left J2/U3 as handoff-only unmatched refs, counted exactly four mocked files, and marked U2 EVAL as `none_found`.
