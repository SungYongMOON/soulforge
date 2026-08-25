# Calibration and Measurement Validity — public source packet v0

Status: `candidate`
Claim ceiling: `source_supported`
Verified: 2026-08-26 (direct public-source access)

## Scope

This package consumes already-approved, typed calibration and test facts. It deterministically reports whether those facts are valid, missing, unknown, expired, out of range, unsuitable, or exception-held at the supplied test time. It does **not** create calibration truth, select a recalibration interval, certify a laboratory, or make a product-conformity decision.

## Authority and access inventory

| Source ID | Authority / revision | Direct public locator | Access / applicability | Used only for |
| --- | --- | --- | --- | --- |
| `NIST-METROLOGICAL-TRACEABILITY-FAQ` | National Institute of Standards and Technology (NIST), *Metrological Traceability: Frequently Asked Questions and NIST Policy*, current web publication accessed 2026-08-26 | https://www.nist.gov/metrology/metrological-traceability | Public official webpage. Supports the distinction between traceability of a measurement result and mere possession of an instrument calibration. It is not a project calibration procedure. | Traceability evidence is a distinct fact and cannot be inferred from a status label. |
| `NIST-TN-1297-1994` | NIST Technical Note 1297, 1994 Edition, *Guidelines for Evaluating and Expressing the Uncertainty of NIST Measurement Results* | https://www.nist.gov/pml/nist-technical-note-1297 | Public official technical note. Supports recording/reporting uncertainty and the relevance of conditions and current documentation; it does not set acceptance limits for this engine. | Uncertainty, conditions, and report-reference facts remain explicit. |
| `NIST-RECOMMENDED-CALIBRATION-INTERVAL-2026-05-29` | NIST Calibration Services, *Recommended Calibration Interval*, webpage updated 2026-05-29 | https://www.nist.gov/calibrations/recommended-calibration-interval | Public official webpage. It explicitly says there is no universally prescribed interval and identifies application accuracy and environmental factors as relevant. | The evaluator never invents an interval; it compares the supplied due date to supplied test time only. |
| `ILAC-G24-2022-PUBLICATION` | International Laboratory Accreditation Cooperation, ILAC-G24:2022, *Guidelines for the determination of recalibration intervals of measuring equipment* | https://ilac.org/publications-and-resources/ilac-guidance-series/ | Public official publication index. Supports the limited statement that recalibration intervals are determined and reviewed within an equipment-control program. | Interval-review provenance is external input; no interval-setting algorithm is implemented. |
| `ISO-IEC-17025-2017-CITATION-ONLY` | ISO/IEC 17025:2017 | https://www.iso.org/standard/66912.html | Controlled standard. Its protected body was not read, copied, or used as a source of executable rules. | Naming / boundary only; no implementation authority. |

## Direct derivation record

| Rule | Source support | Deterministic limitation |
| --- | --- | --- |
| `CMV-INSTRUMENT-IDENTITY-01` | A traceability claim must be tied to a particular measurement result and supporting documentation. | Requires an upstream instrument identifier and identity reference; does not validate the asset system. |
| `CMV-CALIBRATION-STATUS-01` | NIST interval guidance makes interval choice context-dependent. | Uses only typed upstream status, certificate reference, due time, and test time. No interval is calculated or recommended. |
| `CMV-RANGE-01`, `CMV-ACCURACY-01`, `CMV-UNCERTAINTY-01` | NIST TN 1297 supports explicit uncertainty/measurement-condition information. | Compares supplied like-unit numeric facts. It does not derive a measurement model or calculate uncertainty. |
| `CMV-TRACEABILITY-01` | NIST distinguishes traceability of the result from a generic instrument-calibration claim. | Requires a supplied documented-chain reference; never asserts traceability itself. |
| `CMV-ENVIRONMENT-01` | NIST interval and uncertainty material identifies environmental conditions as potentially relevant. | Consumes an upstream environmental-status fact; does not model an environmental correction. |
| `CMV-EXCEPTION-01`, `CMV-RESULT-IMPACT-01` | Engine safety boundary, not an external compliance clause. | An exception is held unless explicitly supported; aggregation reports an impact without approving a deviation. |

## Retrieval boundary

RAG, search, or an LLM may help a user locate the source URLs above. They are never evaluator input, source truth, interval authority, or verdict authority. The evaluator accepts only typed facts and public-safe references supplied through the existing Core Adapter seam.

## Exclusions and open applicability

- No customer, project, laboratory, calibration certificate, environmental log, or test record is included here.
- No controlled standard body is reproduced.
- Unit conversions, statistical uncertainty propagation, guard-band selection, and local exception approval policy remain `UNKNOWN` unless an approved project/profile binding supplies them through a future shared integration.
