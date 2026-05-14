# Page XML Normalize Spec v0

Public-safe bridge workflow for turning page-level XML assets from `whole_xml_page_split_v0` into sidecar-first `page_module_spec_v0` metadata packages before XML-first asset registration.

## Current Validation Basis

- Public package state: `pilot_executed_private_fixture`
- Private execution basis: one whole-XML split fixture expanded into 11 page XML assets and normalized page-by-page under project-local `_workspaces/system/**` outputs.
- Confirmed in the private pilot matrix: required `page_module_spec_v0` top-level blocks, manifest/index/provenance/handoff outputs, and source-page immutability.
- Still intentionally conservative: ambiguous page function, interface direction, quantitative performance, and composition compatibility remain review-required until later XML-first registration and source-backed review.

## Contract

- Input: project-local page XML assets plus `page_manifest` from `whole_xml_page_split_v0`.
- Source policy: source page XML assets are immutable read-only inputs. This workflow records source refs and checksums, but it must not rewrite or overwrite split outputs.
- Output policy: per-page `page_module_spec_v0.yaml` sidecars, manifests, indexes, warnings, and handoff packets are project-local outputs resolved by binding. They do not live inside `.workflow/`.
- Required outputs: `page_module_spec_sidecars`, `module_spec_manifest`, `module_spec_index`, `provenance_update`, `normalization_warnings`, and `downstream_handoff`.
- Optional outputs: derived annotated XML review variants and `annotation_variant_manifest`, only when the binding policy explicitly enables them.
- Public workflow canon must not include raw XML bodies, generated page payloads, host-specific absolute paths, project-local output payloads, credentials, cookies, or secret material.

The workflow now also prepares harness-facing **contract slots** inside the sidecar, such as electrical domains, interface grouping, quantitative placeholders, source-gap state, and owner follow-up fields. These slots exist so later workflows can enrich them; this workflow still keeps them conservative and review-oriented.

## Output Tree

```text
<page_module_output_root>/
  module_specs/
    <stable_page_id>/
      page_module_spec_v0.yaml
  manifests/
    module_spec_manifest.yaml
    module_spec_index.yaml
    provenance_update.yaml
    normalization_warnings.yaml
    downstream_handoff.yaml
  optional_review_variants/
    <stable_page_id>.annotated.review.xml
    annotation_variant_manifest.yaml
```

The `module_specs/` sidecars are the primary outputs. The optional review variants are derived project-local artifacts only; they are not required for completion and are not canonical library sources. The manifests record stable page identity, source page links, checksums, internal registration keys, sidecar refs, optional annotation refs, and warnings without copying XML bodies into public canon.

## Page Module Sidecar Shape

Each per-page sidecar uses `schema_version: page_module_spec_v0` and must include these top-level blocks even when values are blank or review-required:

- `identity`: registration key, source system/page identity, source order, source ref, source checksum, and optional derived refs.
- `module_definition`: coarse circuit type, function, purpose, usage, tags, optional `module_scope`, optional `channelization`, and optional `classification_basis`. Inferred values stay review-required unless directly supported.
- `interfaces`: `inputs`, `outputs`, `bidirectional`, and `passive_or_none` containers. Interface items carry `kind`, optional `electrical_domain`, `direction`, optional `interface_group`, refs, optional `signal_family`, optional `nominal` quantity slots, constraints, claim status, and evidence refs. Optional `local_internal_candidates` may hold likely local control/status nodes that should not be promoted into external harness interfaces yet. Optional `interface_groups` may group related interfaces such as input rails, regulated outputs, repeated channels, or local-only clusters.
- `performance`: optional quantitative hints such as power consumption, output power, or gain. Unsupported values remain blank.
- `system_contract`: harness-facing slots for electrical domains, power contract, signal contract, and readiness/source-gap state. These slots may remain blank or `missing`, but they must not be silently omitted from the contract shape.
- `composition`: immutable page-asset stance, intended use, required/provided interface ids, and harness notes.
- `evidence_review`: evidence refs, derived fields, review-required claims, and open questions.
- `annotation_variant`: optional metadata for derived annotated XML review variants when they exist.

For v0, `normalized_page_ref` and `normalized_sha256` are optional derived-reference fields. They remain blank unless a policy-approved derived review XML variant is written.

The optional `module_scope.completeness` field may be `standalone`, `companion_required`, `partial_slice`, or `unknown`; `unknown` is the safe default. The optional `channelization` block records lightweight repeated-block hints such as apparent channelization, channel-count or range hints, and repeated-block labels. The optional `classification_basis` block records why a circuit/function hint was chosen, such as page labels, visible part names, connector-like labels, or regulator identities; it is rationale for review, not final semantic truth.

The `system_contract` block is where later harness composition will eventually look for machine-readable electrical and signal constraints. In v0:

- `electrical_domains.primary_domain` may still be `unknown`
- voltage/current/power/frequency/gain fields may still be blank or `missing`
- `readiness_contract.harness_ready` should remain `false` unless later workflows strengthen the evidence
- `source_gap_present`, `blocked_by`, and `owner_followup_needed` are preferred over guessing

Where units are present, compact UCUM-style unit strings such as `V`, `A`, `W`, `Hz`, and `dB` are preferred.

## Stage Order

1. Resolve project binding and confirm page assets are read-only inputs.
2. Reconcile `page_manifest`, optional `page_index`, `source_provenance`, `page_role_hints`, and `split_readiness`.
3. Choose deterministic sidecar naming, internal registration-key policy, and `page_module_spec_v0` field policy.
4. Write one `page_module_spec_v0.yaml` sidecar per page.
5. Optionally write derived annotated XML review variants only when the policy allows them.
6. Write module-spec manifest, index, provenance update, warnings, and downstream handoff.
7. Run boundary and handoff review before XML-first asset registration.

## Downstream Handoff

This workflow sits after `whole_xml_page_split_v0` and before XML-first asset registration such as `capture_xml_intake_library_v0` or a later asset-registration workflow. It prepares consistent page-level asset units, but it does not register the asset set as final library truth.

The downstream packet points to page module sidecars and manifests. Downstream registration may still read the source XML through project binding when XML structure is needed; the sidecars provide metadata, review state, and composition hints, not a canonical rewritten XML body.

Pages flagged as hardware/material or possible PCB/MDD context should be carried forward as review hints only. Deeper semantic interpretation belongs to later XML-first registration, material collection, MDD attachment, PCB review, or harness composition workflows.

## Boundary

This workflow may normalize sidecar naming, manifest structure, stable page identity metadata, provenance fields, interface containers, system-contract slot blocks, review-state fields, and internal registration keys. It must preserve source page order, source page ids, source checksums, and uncertainty labels.

It must not infer net semantics as confirmed truth, collect component materials, attach MDD files, compose harnesses, mutate source page XML files, make XML body rewriting the default output, or claim generated artifacts live inside `.workflow/`.
