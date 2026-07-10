{
  "workflow_id": "asset_patch_attach_mdd_v0",
  "fixture_type": "public_safe_synthetic_from_contract",
  "asset_identity_updated": {
    "asset_id": "asset_demo_usb_ctrl_xml_first",
    "asset_version": "v2",
    "source_xml_registration_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "xml_identity_status": "authoritative",
    "mdd_status": "attached",
    "prior_xml_registration_fields_preserved": true
  },
  "pcb_pairing_placeholder_updated": {
    "placeholder_id": "pcb_pairing_demo_usb_ctrl",
    "mdd_status": "attached",
    "pairing_truth_status": "not_evaluated"
  },
  "asset_patch_record": {
    "asset_id": "asset_demo_usb_ctrl_xml_first",
    "from_asset_version": "v1",
    "to_asset_version": "v2",
    "attachment_mode": "owner_supplied_mdd_attach",
    "owner_supplied": true,
    "deep_pairing_inference": false,
    "raw_mdd_payload_included": false
  },
  "provenance_update": {
    "source_file_identity": "demo_usb_ctrl.mdd",
    "source_file_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "created_at": "unknown",
    "attachment_mode": "owner_supplied_mdd_attach"
  },
  "readiness_note": {
    "source_xml_registration_preserved": true,
    "raw_mdd_payload_not_in_public_package": true,
    "runtime_absolute_paths_in_public_package": false,
    "owner_supplied_attachment_state_recorded": true,
    "pairing_truth": "not_evaluated",
    "non_claims": [
      "No deeper XML/MDD pairing truth is asserted.",
      "No runtime execution or external verification is asserted."
    ]
  }
}
