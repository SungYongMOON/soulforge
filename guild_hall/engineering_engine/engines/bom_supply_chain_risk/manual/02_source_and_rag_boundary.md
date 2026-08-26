# Source and RAG boundary

The package records only short public-safe derivations and official locators in
its [source packet](../contracts/bom_supply_chain_risk_source_packet_v0.md).
The DoD DMSMS manual informs lifecycle, availability, obsolescence, impact, and
continuity vocabulary. DFARS clauses inform counterfeit/traceability and source
vocabulary only where their exact contract applicability is bound. NIST material
informs risk-mapping vocabulary for supplier and geographic concentration.

The engine does not decide whether a source applies. An unbound DoD/DFARS/NIST
context cannot be silently transformed into a compliance conclusion. RAG can
retrieve candidates outside this package but cannot add facts, select a source,
set a threshold, qualify a supplier, or decide an evaluator state.
