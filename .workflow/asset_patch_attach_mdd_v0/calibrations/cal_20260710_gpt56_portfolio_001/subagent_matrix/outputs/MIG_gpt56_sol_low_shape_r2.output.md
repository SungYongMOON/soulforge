{
  "asset_identity_updated": {
    "asset_id": "asset_demo_usb_ctrl_xml_first",
    "asset_version": "v2",
    "source_xml_registration_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "xml_identity_status": "authoritative",
    "mdd_attachment_status": "attached_owner_assertion",
    "mdd_source_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "pairing_truth_status": "not_evaluated"
  },
  "pcb_pairing_placeholder_updated": {
    "placeholder_id": "pcb_pairing_demo_usb_ctrl",
    "mdd_status": "attached_owner_assertion",
    "pairing_truth_status": "not_evaluated",
    "pcb_pairing_readiness": "metadata_attachment_recorded",
    "non_claim": "No deeper XML/MDD pairing truth has been inferred."
  },
  "asset_patch_record": {
    "workflow_id": "asset_patch_attach_mdd_v0",
    "asset_id": "asset_demo_usb_ctrl_xml_first",
    "prior_asset_version": "v1",
    "updated_asset_version": "v2",
    "patch_type": "owner_supplied_mdd_attachment",
    "attachment_mode": "owner_assertion_only",
    "source_xml_registration_preserved": true,
    "raw_mdd_payload_included": false,
    "runtime_absolute_path_included": false,
    "pairing_truth_evaluated": false,
    "stop_conditions": [
      "Stop if the existing asset identity or PCB pairing placeholder is unavailable.",
      "Stop if the owner-supplied MDD source is unavailable.",
      "Stop if preserving the authoritative XML registration cannot be ensured.",
      "Stop if the patch would require deep XML/MDD pairing inference.",
      "Stop if raw MDD content or a runtime absolute path would enter public canon."
    ]
  },
  "provenance_update": {
    "source_file_identity": "demo_usb_ctrl.mdd",
    "source_file_reference": "_workspaces/<project_code>/owner_supplied/demo_usb_ctrl.mdd",
    "source_file_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "created_at": null,
    "created_at_status": "not_supplied",
    "attachment_mode": "owner_supplied_assertion_only",
    "owner_supplied": true,
    "source_boundary": "The owner-supplied source reference is authoritative only for attachment intent.",
    "non_claims": [
      "No claim is made that XML/MDD semantic or PCB pairing compatibility was evaluated.",
      "No raw MDD payload is included.",
      "No host-specific runtime path is included."
    ]
  }
}
