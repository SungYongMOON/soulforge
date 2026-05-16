You are a CLI-only public-safe calibration candidate for Soulforge workflow asset_patch_attach_mdd_v0.
Profile: model=gpt-5.5 reasoning_effort=medium species=dwarf class=administrator.

Rules:
- Do not run commands, browse, inspect local files, or claim external validation.
- Use only the public-safe fixture below and the workflow task.
- Do not include raw project payloads, runtime absolute paths, credentials, cookies, or private-state data.
- Output only one valid JSON object. No markdown fences.
- Include these top-level keys: asset_identity_updated, pcb_pairing_placeholder_updated, asset_patch_record, provenance_update, boundary_notes, readiness_note.
- Also include quality_self_check with arrays named covered_requirements, gaps, and boundary_notes.

Task:
Produce a compact metadata-only MDD attachment patch. Bump the asset version, mark MDD attached, preserve XML-first registration as authoritative, record sha256 provenance, avoid deep pairing inference, and keep raw MDD payload/runtime paths out of public canon.

Public-safe fixture:
{
  "workflow_id": "asset_patch_attach_mdd_v0",
  "fixture_type": "public_safe_synthetic_from_contract",
  "asset_identity": {
    "asset_id": "asset_demo_usb_ctrl_xml_first",
    "asset_version": "v1",
    "source_xml_registration_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "xml_identity_status": "authoritative"
  },
  "pcb_pairing_placeholder": {
    "placeholder_id": "pcb_pairing_demo_usb_ctrl",
    "mdd_status": "missing",
    "pairing_truth_status": "not_evaluated"
  },
  "mdd_source": {
    "owner_supplied": true,
    "root_relative_or_project_local_path": "_workspaces/<project_code>/owner_supplied/demo_usb_ctrl.mdd",
    "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "patch_policy": {
    "bump_asset_version": true,
    "update_mdd_status_to_attached": true,
    "preserve_prior_xml_registration_fields": true,
    "no_deep_pairing_inference": true,
    "do_not_copy_raw_mdd_payload_to_public_canon": true
  },
  "hard_rules": [
    "Existing XML-first asset registration remains authoritative.",
    "MDD path is owner attachment assertion only.",
    "Do not infer deeper XML/MDD pairing truth.",
    "Do not include raw MDD payloads or runtime absolute paths in public canon."
  ]
}
