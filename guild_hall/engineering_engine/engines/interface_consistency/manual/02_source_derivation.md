# 02. Source derivation and RAG boundary

The [source packet](../contracts/interface_consistency_source_packet_v0.md) records four
directly verified official-public sources: ECSS interface management, the NASA Systems
Engineering Handbook, DoD DI-IPSC-81436, and RFC 9368. Rules retain only source IDs,
locators, and a structural check kind.

The derivation is deliberately narrow:

1. ECSS and NASA support identifying interface ends, characteristics, compatibility,
   control, and agreement/revision context.
2. ECSS and DI-IPSC-81436 support mechanical/electrical/software-data/timing
   vocabulary without creating universal required fields.
3. RFC 9368 supports an explicit bilateral version-reconciliation pattern without
   importing QUIC semantics into other protocols.

RAG may identify a candidate source or locator only. Direct publisher verification is
required before a source reference enters the package. RAG answers, source chunks, raw
PDF text, and protected standards never determine a verdict.
