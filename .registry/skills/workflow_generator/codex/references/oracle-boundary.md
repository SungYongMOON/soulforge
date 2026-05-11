# Oracle Boundary

Use this reference whenever a reference/oracle artifact exists.

## Benchmark Rule

In benchmark or skill-validation mode, A-controller is oracle-blind.

A must not inspect:

- raw reference/oracle artifacts
- accepted outputs or answer keys
- exact target text, coordinates, object IDs, object signatures, layout positions, embedded payloads, or file structure
- detailed V mismatch reports that reveal target-specific construction hints
- repair packets derived from the oracle

B/workflow construction executors must not inspect any of the above.

V verifier may inspect the oracle in a separate verification workspace and return only a redacted verdict.

## Redacted Verdict Allowed Content

V may return:

- pass/fail
- score or acceptance level
- failure class
- abstract delta
- missing capability
- source gap
- boundary issue
- confidence
- tolerated vs non-tolerated residual counts
- whether B avoided oracle exposure
- whether A remained oracle-blind

V must not return:

- copied oracle payload
- exact target values, coordinates, IDs, labels, text, or embedded assets
- answer-key reconstruction steps
- target-specific patch instructions
- detailed mismatch lists usable as construction recipes

## Evidence Reclassification

If A reads raw oracle content or receives detailed oracle-derived repair hints, stop benchmark validation and reclassify the run as:

- `goal_reconstruction`
- open-book `discovery_repair`
- verifier-only investigation
- blocked pending human decision

Do not claim `verified-against-reference` from any run where A or B used oracle-derived construction data.

## Optional Oracle Contract Role

An optional oracle-contract role may inspect the oracle only to create a generalized acceptance contract.

Rules:

- The user's latest request must explicitly authorize this oracle-contract role or ask for a generalized acceptance contract derived from the oracle. Permission to compare with the oracle/reference authorizes V verification only; it does not authorize O.
- The role must be separate from B and cold replay executors.
- The output must be abstract and benchmark-safe.
- The output must not include answer-key details.
- A must record the contract provenance and whether it is safe for benchmark use.
- If the remaining blocker is target-scope/minimization after a source-supported candidate and no new non-oracle source constraint exists, stop for human decision before O.
