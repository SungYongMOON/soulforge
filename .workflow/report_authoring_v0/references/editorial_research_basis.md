# Editorial research basis

This note records the public, primary-source basis for the workflow's editorial
and verification rules. It is provenance for maintainers, not a style corpus,
prompt supplement, or permission to copy source wording.

## Source-to-rule map

| Source | Rule adopted by `report_authoring_v0` |
| --- | --- |
| [NIST Technical Series author instructions](https://www.nist.gov/nist-research-library/nist-technical-series-publications-author-instructions) | Identify the report purpose and audience; keep the abstract/summary bounded by the report body; make references and document metadata inspectable. |
| [NASA report-writing manual](https://ntrs.nasa.gov/citations/19930013813) | Organize technical material around reader use, evidence, results, conclusions, and recommendations instead of presenting an undifferentiated data dump. |
| [GAO Government Auditing Standards](https://www.gao.gov/products/gao-24-106786) | Calibrate findings and conclusions to sufficient, appropriate evidence; keep unsupported claims and unresolved limitations visible. |
| [Digital.gov plain-language principles](https://digital.gov/guides/plain-language/principles) | Put the reader's decision need first, use direct sentences and informative headings, and remove words that do not perform a report function. |
| [NIST TN 1297, reporting uncertainty](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-7-reporting-uncertainty) | Keep a measurement value with its unit, uncertainty, coverage factor or confidence basis, and applicable conditions. |
| [BIPM SI Brochure](https://www.bipm.org/en/publications/si-brochure/) | Preserve SI quantity/unit identity and notation; never treat a silent unit change as prose-only polish. |
| [FactCC](https://aclanthology.org/2020.emnlp-main.750/), [FRANK](https://aclanthology.org/2021.naacl-main.383/), and [FActScore](https://aclanthology.org/2023.emnlp-main.741/) | Treat factual consistency as claim-level coverage rather than document fluency; check entities, relations, predicates, and atomic claims, while retaining an explicit limitation that automated checks are incomplete. |
| [Evidence Inference](https://aclanthology.org/2020.bionlp-1.13/) | Keep result direction, comparator, intervention/candidate, outcome or metric, and evidence binding together when a report makes a comparative claim. |

## Implementation consequences

The workflow therefore uses adaptive report roles, verifies the body before
deriving summary sentences, separates technical-content and evidence-logic
passes from grammar/tone polish, protects measurements and decision semantics,
and requires a separate semantic-verification record. Reader-facing reports do
not expose the audit structures that support those checks.

These sources do not establish a universal report outline or a vocabulary ban.
The workflow does not optimize for an AI-detector score, detector evasion,
surface similarity, or imitation of a named institution's voice. It evaluates
reader usefulness, evidence support, traceability, and preservation of meaning.
Human review and owner approval remain necessary before a publishable or
production-ready claim.
