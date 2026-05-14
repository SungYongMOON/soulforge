# Draft Variant Preview

Use this reference only when designing or checking draft SE foldertree variants. It does not replace the production generator.

## Purpose

The variant preview lane separates three concerns:

- `common_se_base_v0`: source-backed common SE gate identity.
- `lig_grade_a_overlay_v0`: current LIG/A local behavior captured as an overlay candidate.
- `operational_rd_no_grade_candidate_v0`: blocked candidate for operational-R&D/no-quality-grade work.

## Boundary

- `scripts/generate_tree.py` remains the only materialization path.
- `scripts/preview_variants.py` is review-only and must not create project folders.
- Draft variants with `generation_enabled: false` are not production-supported combinations.
- Public skill files must not contain private NotebookLM IDs, project source ledgers, credentials, or customer/company originals.

## Preview Command

```powershell
python scripts/preview_variants.py --variants-dir assets/variants
```

Optional JSON preview:

```powershell
python scripts/preview_variants.py --variants-dir assets/variants --json-out <preview.json>
```

## Acceptance For Draft Preview

- All variant YAML files parse.
- Every variant has `variant_id`, `status`, `generation_enabled`, `variant_type`, `evidence_level`, and `decision`.
- Draft and blocked variants keep `generation_enabled: false`.
- Overlay and candidate variants reference an existing `base_variant`.
- `common_se_base_v0` contains the canonical `SRR/SFR/PDR/CDR/TRR/FCA/PCA` spine.

Passing this preview does not authorize folder generation. It only says the draft metadata is internally consistent.
