{
  "workflow_id": "asset_patch_attach_mdd_v0",
  "deliverable_type": "public_safe_asset_patch",
  "status": "complete_from_supplied_fixture",
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
    "patch_type": "owner_supplied_mdd_attachment",
    "previous_asset_version": "v1",
    "updated_asset_version": "v2",
    "attachment_mode": "owner_asserted_attachment_only",
    "source_xml_registration_preserved": true,
    "deep_xml_mdd_pairing_inferred": false,
    "raw_mdd_payload_included": false,
    "runtime_absolute_path_included": false
  },
  "provenance_update": {
    "source_file_identity": "demo_usb_ctrl.mdd",
    "source_file_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "created_at": null,
    "created_at_status": "unknown_from_supplied_fixture",
    "attachment_mode": "owner_supplied",
    "source_path_disclosure": "withheld_from_public_deliverable"
  },
  "readiness_note": {
    "source_xml_registration_preserved": true,
    "owner_supplied_attachment_state_recorded": true,
    "public_boundary_posture": "metadata_only",
    "pcb_aware_workflow_readiness": "eligible_for_later_evaluation",
    "pairing_truth_status": "not_evaluated",
    "non_claims": [
      "No deeper XML/MDD compatibility, correctness, or pairing truth is asserted.",
      "No raw MDD payload is included.",
      "No runtime absolute path is disclosed.",
      "No filesystem existence, file contents, or runtime state is independently verified."
    ]
  },
  "stop_conditions": {
    "triggered": false,
    "basis": "The supplied synthetic fixture contains the required metadata and represents an owner-supplied attachment event.",
    "remaining_owner_boundary": "Any later assertion of XML/MDD pairing truth requires a separate PCB-aware evaluation."
  }
}
