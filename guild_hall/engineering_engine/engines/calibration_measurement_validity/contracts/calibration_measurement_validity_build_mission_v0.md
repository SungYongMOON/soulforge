# Calibration and Measurement Validity build mission v0

## Objective

Provide a deterministic, public-safe Domain Engine that reports the validity state of supplied instrument and measurement evidence at a supplied test time.

## Inputs and outputs

- Inputs: typed project facts only; no raw calibration certificate, project payload, credential, filesystem path, or RAG answer.
- Outputs: determinations for identity, calibration timing, range, accuracy, uncertainty, traceability, environment, exception, and aggregate result impact; plus a deterministic zero-effect receipt.
- Claim boundary: `source_supported` package candidate. No production, laboratory accreditation, product conformity, or standard-compliance assertion.

## Closed error contract

Malformed or unsafe data, non-canonical test time, mismatched units, and non-empty profile deltas fail closed with a stable `CMV_*` code. Missing ordinary evidence is returned as `missing` or `unknown`; it is not silently converted into pass/fail.

## Explicit non-goals

The engine does not choose a calibration interval, issue a certificate, calculate an uncertainty budget, convert units, apply a correction, approve an exception, mutate a record, or call an external service.
