# BOM and Supply-Chain Risk public source packet v0

Status: `source_supported` candidate only. This packet records public-source
vocabulary and boundaries for a deterministic risk/readiness evaluator. It does
not make a contract, purchasing, technical, quality, counterfeit, supplier
qualification, or production decision.

## Scope and direct-verification inventory

All sources below were directly accessed from their official public locations on
2026-08-26; S2 was rechecked on 2026-08-28. Their bodies are not copied into
this package. No paid standard,
private project data, RAG corpus, supplier portal, ERP data, or credential was
used.

| ID | Official authority and revision | Public access | Bounded derivation | Applicability boundary |
| --- | --- | --- | --- | --- |
| `S1-DODM-4245.15` | U.S. DoD Manual 4245.15, *Management of Diminishing Manufacturing Sources and Material Shortages*, effective 2022-10-26, 41 pages | [DoD public PDF](https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodm/424515m.PDF) | DMSMS is risk-based across life cycles; BOM/manufacturer detail, production status, availability, time-to-impact, time-to-resolve, supply-chain vulnerability, and proactive obsolescence monitoring are relevant data categories (§§3.3–3.4; glossary). | DoD policy/manual. Outside an explicitly bound DoD context, it supplies risk vocabulary only. |
| `S2-DFARS-252.246-7007` | DFARS Change 5/7/2026, effective 2026-05-07; clause dated JAN 2023 | [Acquisition.gov clause](https://www.acquisition.gov/dfars/252.246-7007-contractor-counterfeit-electronic-part-detection-and-avoidance-system.) | Counterfeit-risk, traceability, supplier-source, suspect-part, and obsolete-part control vocabulary. The introductory applicability sentence says paragraphs (a)-(e) do not apply unless the contractor is subject to CAS under 41 U.S.C. chapter 15 as implemented at 48 CFR 9903.201-1. | Only an affirmative, source-bound clause-incorporation gate and an independent affirmative, source-bound CAS-applicability gate can admit this rule. This engine never concludes either fact, compliance, or satisfaction. |
| `S3-DFARS-252.246-7008` | DFARS Change 5/7/2026, effective 2026-05-07; clause dated JAN 2023 | [Acquisition.gov clause](https://www.acquisition.gov/dfars/252.246-7008-sources-electronic-parts.) | Authorized-source, contractor-approved supplier, inspection/testing/authentication, and traceability vocabulary. | Applies only where the clause is incorporated. Supplier eligibility and approval remain outside this engine. |
| `S4-NIST-MEP-2024` | NIST Manufacturing Extension Partnership blog, *Mapping Your Supply Chains Helps Prioritize Risks, Actions*, 2024-01-16 | [NIST article](https://www.nist.gov/blogs/manufacturing-innovation-blog/mapping-your-supply-chains-helps-prioritize-risks-actions) | Geographic concentration, critical-part/supplier-count, multi-tier visibility, and bottleneck/continuity risk as assessment inputs. | Public educational guidance, not a binding specification or procurement rule. |
| `S5-NIST-SP-800-161R1-UPD1` | NIST SP 800-161r1-upd1, May 2022, updates through 2024-11-01 | [NIST public PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-161r1-upd1.pdf) | Risk identification, response, monitoring, and supplier/third-party supply-chain management framing. | ICT/OT cybersecurity supply-chain guidance. It does not create hardware-BOM or purchasing requirements here. |

`content_digest_status`: no persistent raw-body capture was performed; inventory
identity is pinned by official authority, revision/date, locator, public-access
class, and direct-verification date. A future source-byte capture belongs only
under `_workspaces/knowledge/common/bom_supply_chain_risk/**` after its own
source/storage review.

## Rule derivation and RAG boundary

- `lifecycle_status`, `obsolescence_signal`, `long_lead`, and `continuity_gap`
  are risk/readiness dimensions derived from `S1`; no universal threshold is
  inferred from it.
- `sole_source`, `alternate_qualification`, and `counterfeit_control` retain the
  source/traceability distinction shown by `S2` and `S3`. They never designate
  an approved supplier, authenticate a part, or determine a contract clause.
- `BOM-SCR-06` has two independent project-typed applicability gates: exact
  clause incorporation and Cost Accounting Standards applicability. Every
  affirmative gate basis is an opaque ref that must resolve to one digest-bound
  `project_typed_fact` applicability-evidence member with the same S2 source and
  gate. Unknown, negative, missing, forged, or mismatched material stays
  `unknown`/`HOLD`; it never becomes compliance or `not_applicable`.
- `supplier_concentration` and `geographic_concentration` are visibility/risk
  dimensions derived from `S4`, with configured thresholds supplied only by a
  bound Profile.
- `S5` supports the assessment-and-monitoring framing, not a parts decision.
- RAG may retrieve a candidate source locator outside this package. It must not
  populate typed facts, compile thresholds, select a source, or produce a
  verdict. Unbound or missing facts remain `unknown`.

## Explicit non-authorities

This package does not own or perform BOM authoring, ERP material truth,
purchasing, PO release, supplier approval, alternate qualification approval,
counterfeit authentication, contract interpretation, compliance certification,
waiver/disposition, production release, task creation, or external writes.
