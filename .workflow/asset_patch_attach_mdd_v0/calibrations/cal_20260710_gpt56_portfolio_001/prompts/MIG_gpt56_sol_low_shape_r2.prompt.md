You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=administrator.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: asset_identity_updated, pcb_pairing_placeholder_updated, asset_patch_record, provenance_update.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: asset_patch_attach_mdd_v0
kind: workflow
status: active
title: Asset Patch Attach MDD v0
summary: Attach an owner-supplied MDD file to an existing XML-first asset set and bump asset version without replacing the original XML-first registration.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - asset_identity
  - pcb_pairing_placeholder
  - mdd_source
  - patch_policy
outputs:
  - asset_identity_updated
  - pcb_pairing_placeholder_updated
  - asset_patch_record
  - provenance_update
validation_level: pilot_executed_private_fixture
upstream_workflow:
  workflow_id: capture_xml_intake_library_v0
  expected_output: asset_identity
  optional_context_packet: pcb_pairing_placeholder
notes:
  - This workflow assumes the XML-first asset set already exists.
  - The owner-supplied MDD path is authoritative for attachment intent, but the workflow does not overclaim deeper XML/MDD pairing truth beyond that owner assertion.
  - The source XML registration remains authoritative for XML identity and is not rebuilt by this patch workflow.
  - Public canon must not include raw MDD payloads, host-specific runtime paths, or project-local run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: asset_patch_attach_mdd_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_patch_binding
    title: Prepare Patch Binding
    actor_slot: workflow_runner
    action:
      kind: local_workspace_setup
      requires:
        - asset_identity
        - pcb_pairing_placeholder
        - mdd_source
        - patch_policy
      validates:
        - asset_identity_exists
        - placeholder_exists
        - mdd_source_exists
      creates:
        - patch_log_root
    summary: Resolve the existing XML-first asset registration and the owner-supplied MDD path before any metadata change.
    next:
      on_success: validate_owner_supplied_attachment
      on_fail: stop
  - step_id: validate_owner_supplied_attachment
    title: Validate Owner-Supplied Attachment
    actor_slot: patch_registrar
    action:
      kind: attachment_state_review
      artifacts_in:
        - asset_identity
        - pcb_pairing_placeholder
        - mdd_source
      artifact_out: attachment_review_note
      rules:
        - source_xml_registration_remains_authoritative
        - owner_supplied_mdd_is_attachment_assertion_only
        - no_deep_pairing_inference
    summary: Confirm this is an owner-supplied MDD attach/patch event, not a request to rebuild or reinterpret the original XML registration.
    next:
      on_success: record_mdd_provenance
      on_fail: stop
  - step_id: record_mdd_provenance
    title: Record MDD Provenance
    actor_slot: provenance_writer
    action:
      kind: file_identity_probe
      artifact_in: mdd_source
      artifact_out: provenance_update
      records:
        - source_file_identity
        - source_file_sha256
        - created_at
        - attachment_mode
    summary: Record the MDD file identity and patch provenance without copying the raw MDD payload into reusable canon.
    next:
      on_success: update_asset_identity_and_placeholder
      on_fail: stop
  - step_id: update_asset_identity_and_placeholder
    title: Update Asset Identity And Placeholder
    actor_slot: patch_registrar
    action:
      kind: patch_manifest_write
      artifacts_in:
        - asset_identity
        - pcb_pairing_placeholder
        - provenance_update
        - attachment_review_note
      artifacts_out:
        - asset_identity_updated
        - pcb_pairing_placeholder_updated
        - asset_patch_record
      patch_rules:
        bump_asset_version: true
        update_mdd_status_to_attached: true
        preserve_prior_xml_registration_fields: true
    summary: Bump asset version, update MDD attachment state, and append a metadata-only patch record.
    next:
      on_success: boundary_review
      on_fail: stop
  - step_id: boundary_review
    title: Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: boundary_and_readiness_review
      artifacts_in:
        - asset_identity_updated
        - pcb_pairing_placeholder_updated
        - asset_patch_record
        - provenance_update
      artifact_out: readiness_note
      checks:
        - source_xml_registration_preserved
        - raw_mdd_payload_not_in_public_package
        - no_runtime_absolute_paths_in_public_package
        - owner_supplied_attachment_state_recorded
    summary: Confirm the patch only updated metadata and that the asset set is now ready for later PCB-aware workflows.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
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


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
