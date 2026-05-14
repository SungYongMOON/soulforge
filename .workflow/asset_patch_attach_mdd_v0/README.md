# Asset Patch Attach MDD v0

Public-safe follow-on workflow for attaching an owner-supplied MDD file to an existing XML-first asset set after the initial `capture_xml_intake_library_v0` registration already exists.

## Contract

- Inputs:
  - existing `asset_identity.yaml`
  - existing `pcb_pairing_placeholder.yaml`
  - one owner-supplied MDD path
  - patch policy / versioning policy
- Source policy:
  - the existing XML-first asset registration stays authoritative for XML identity
  - this workflow records attachment state and version patch metadata
  - it does not independently prove deeper XML↔MDD pairing truth beyond owner-supplied attachment assertion
- Public workflow canon must not include raw MDD payloads, raw XML, runtime absolute paths, project-local run truth, credentials, cookies, or secret material.

## Output Tree

```text
<asset_registration_root>/
  asset_identity.yaml
  pcb_pairing_placeholder.yaml
  asset_patch_record.yaml
  provenance_update.yaml
```

`asset_identity.yaml` is updated with the new asset version and current MDD attachment state. `pcb_pairing_placeholder.yaml` is updated from `missing` / `expected_later` to `attached` or `patched`. `asset_patch_record.yaml` records who supplied the MDD, what version bump occurred, and what changed. `provenance_update.yaml` records the MDD file identity and the patch event.

## Stage Order

1. Resolve the existing XML-first asset registration and the owner-supplied MDD binding.
2. Verify the source XML registration exists and the MDD path is present.
3. Record MDD file identity and attachment provenance without copying the raw payload into reusable canon.
4. Update asset identity, patch history, and placeholder state.
5. Write patch manifests and boundary review note.

## Boundary

This workflow is a registration/patch workflow, not a deep pairing-analysis workflow. It records owner-supplied MDD attachment state so later PCs can continue from the same asset set without redoing the original XML-first registration.

## Current Maturity

`validation_level: pilot_executed_private_fixture`

The package has completed a controlled private LT8624S page-level attachment pilot using a real owner-supplied `.mdd` file. The first pilot showed that attachment state, version bump, patch record, and provenance update can be written without rebuilding source XML or overclaiming deeper semantic pairing.

The package is still conservative: it does not yet have a calibrated execution profile or a broader family of attachment examples.
