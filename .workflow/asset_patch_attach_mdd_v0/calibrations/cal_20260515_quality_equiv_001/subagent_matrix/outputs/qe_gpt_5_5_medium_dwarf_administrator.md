{
  "asset_identity_updated": {
    "asset_id": "asset_demo_usb_ctrl_xml_first",
    "asset_version": "v2",
    "source_xml_registration_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "xml_identity_status": "authoritative",
    "mdd_attachment_status": "attached"
  },
  "pcb_pairing_placeholder_updated": {
    "placeholder_id": "pcb_pairing_demo_usb_ctrl",
    "mdd_status": "attached",
    "pairing_truth_status": "not_evaluated"
  },
  "asset_patch_record": {
    "workflow_id": "asset_patch_attach_mdd_v0",
    "patch_type": "metadata_only_mdd_attachment",
    "version_bumped": true,
    "previous_asset_version": "v1",
    "new_asset_version": "v2",
    "raw_mdd_payload_included": false,
    "runtime_paths_included": false,
    "deep_pairing_inference_performed": false
  },
  "provenance_update": {
    "mdd_owner_supplied": true,
    "mdd_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "source_xml_registration_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "mdd_path_public_canon_status": "withheld",
    "mdd_path_assertion_scope": "owner_attachment_assertion_only"
  },
  "boundary_notes": [
    "Existing XML-first asset registration remains authoritative.",
    "MDD attachment is recorded as owner-supplied metadata only.",
    "No XML/MDD pairing truth was inferred.",
    "Raw MDD payload and runtime absolute paths are excluded from public canon."
  ],
  "readiness_note": "Metadata-only MDD attachment patch is ready for public-safe canon update with XML-first registration preserved as authoritative.",
  "quality_self_check": {
    "covered_requirements": [
      "Bumped asset version from v1 to v2.",
      "Marked MDD as attached.",
      "Preserved XML-first registration and sha256 as authoritative.",
      "Recorded MDD sha256 provenance.",
      "Avoided deep pairing inference.",
      "Excluded raw MDD payload and runtime paths."
    ],
    "gaps": [],
    "boundary_notes": [
      "Public-safe output only.",
      "No external validation claimed.",
      "No raw project payloads, credentials, cookies, private state, or runtime absolute paths included."
    ]
  }
}