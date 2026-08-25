# Legacy Fixtures Compatibility Directory

This directory is preserved strictly for backward-compatible JavaScript module re-exports.

## Canonical Fixture Locations

All canonical domain fixtures, specifications, and test data reside in their respective domain engine packages:
- **Systems Engineering Fixtures**: `../engines/systems_engineering/fixtures/`
- **Quality Readiness Fixtures**: `../engines/quality_readiness/fixtures/`

No raw payload files (`.json`, `.sha256`, `.yaml`) are stored here; only thin `.mjs` re-export stubs are permitted.
