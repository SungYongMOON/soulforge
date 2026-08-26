# Shared integration request — Database Engineering v0

Requested shared-owner work, deliberately not performed in this package:

1. Register `database_engineering` in Core discovery/conformance only after an
   accepted package review.
2. Regenerate the shared engine manifest. The shared manifest collector will
   otherwise see this tracked package and fail its exact hash verification.
3. Extend shared topology roots and release manifest/release notes for this
   package. Current shared topology discovery lists only Systems Engineering and
   Quality Readiness, so a green shared topology check is not DBE discovery.
4. Decide whether a root validation script should be added; this package uses a
   focused command without editing root `package.json`.

No shared owner should treat this request as a release, activation, DBMS
endorsement, project applicability, or canon promotion.
