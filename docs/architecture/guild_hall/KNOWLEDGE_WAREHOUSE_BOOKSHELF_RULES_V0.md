# Knowledge Warehouse And Bookshelf Rules v0

## Purpose

This document fixes the owner vocabulary and placement rules for the LLM wiki
source warehouse, NotebookLM notebooks, and metadata ledgers.

The main rule is:

```text
Google Drive stores source files by durable source/domain logic.
NotebookLM notebooks are query bookshelves assembled from approved source sets.
_workspaces holds working and derived text/wiki/RAG payloads.
_workmeta records metadata-only refs, hashes, bindings, approvals, reviews, and ontology candidates.
```

## Vocabulary

| Term | Korean working term | Meaning | Authority boundary |
| --- | --- | --- | --- |
| Drive source warehouse | 창고 | Owner-held Google Drive storage/archive for source files, source refs, and packages. | Folder placement alone is not approval, source truth, or canon. A fully approved and validated ontology canon package is the narrow package-level exception. |
| NotebookLM query bookshelf | 책장 | One NotebookLM notebook or equivalent selected source set. | Advisory query surface; answers are not validation or canon. |
| Source item | 책 | One source handle, file, source packet, or Drive-native source ref. | Must be represented by a metadata source card before durable use. |
| Source catalog | 장서목록 | `_workmeta` ledgers, packet maps, NotebookLM bindings, query/use metadata, and review packets. | Records refs, hashes, decisions, claim ceilings, and reproducible source selections; it stores no source, projection, or wiki bodies. |
| Domain group | 서가 / 분야 | Human management grouping for related bookshelves or source families. | Not a NotebookLM object and not source authority. |
| Ontology candidate graph | 온톨로지 후보 | Reusable entity, relation, concept, claim, project, and domain patterns. | Lives in `_workmeta` until accepted by the correct owner/review route. |

## Storage And Knowledge Authority Matrix

Storage location, folder labels, sync/mount state, connector access, and a
successful read are access or placement facts. They do not grant source
approval, source truth, owner approval, or canon status.

| Surface | Primary role | May hold | Authority boundary and default posture |
| --- | --- | --- | --- |
| OneDrive or another owner-approved shared worksite | Active editable project files and shared work products. | Current documents, media, measurements, and editable deliverables. | Working-file access only; it is not the durable knowledge source warehouse or canon owner. |
| Company NAS | Company owner-held originals and owner-approved ontology disaster-recovery copies. | Original source files governed outside Soulforge and one-way copies of approved Drive ontology releases. | Default read-only from Soulforge. A DR copy is not jointly edited canon, and reachability alone grants no write or backup authority. |
| Soulforge `_workspaces/**` | Working view and derived payload worksite. | Approved working copies, extracted text, private projection/wiki bodies, RAG payloads, and generated views. | Working/derived runtime surface only; content here is not approved knowledge or canon by location. |
| Google Drive source warehouse and ontology package canon | Durable source storage plus canon owner for fully qualified reusable ontology releases. | Candidate/approved source refs and `30_Domain_CANON/Soulforge_ontology/<release_id>` packages. | Ordinary placement is not canon. Only an owner-approved release with manifest, revision, hashes, source refs, classification, NotebookLM membership, and recovery evidence is ontology package canon. |
| Soulforge `_workmeta/**` | Metadata-only catalog and decision evidence. | Refs, hashes, provenance, approval/review state, bindings, use metadata, claim ceilings, and ontology candidates. | No source bodies, extracted text, chunks, projection/wiki bodies, or generated answer payloads. Metadata records do not approve their targets. |
| NotebookLM, RAG, Obsidian, and generated graph views | Advisory query, retrieval, and derived navigation surfaces. | Selected source bindings, answers, indexes, generated notes, and graph signals within their own bounded runtime surfaces. | Advisory/derived only; they cannot approve sources, accept ontology, raise claim ceilings, or promote canon. |
| Soulforge `.registry/knowledge/**` | Git-tracked execution projection of approved ontology releases. | Public-safe knowledge entries accepted by the correct owner and review route. | Projection lineage must identify an approved Drive release. Differences are reviewed by diff/hash/impact before reconciliation; no automatic overwrite. |

### Migration gate

The matrix above is the target authority contract. The current
`sourcebound_knowledge_packet_operating_loop_v0` draft binding still places its
compiled projection root under `_workmeta/**`. Until that workflow binding and
manifest are migrated to `_workspaces/**` payload plus `_workmeta/**`
metadata-only refs, callers must treat payload-producing sourcebound execution
as `blocked_migration_required`. Existing metadata-only calibration placeholders
do not authorize runtime projection bodies under `_workmeta`.

## Placement Rule

Do not make Google Drive mirror every NotebookLM bookshelf by copying files into
one folder per notebook. A source may be useful in more than one bookshelf, so
file copies create version drift and false authority.

Use this split instead:

1. Store each source once in the Drive source warehouse.
2. Classify it by lifecycle state and durable domain/source family.
3. Record its source card in `_workmeta`.
4. Build NotebookLM bookshelves from source-list manifests.
5. Preserve bookshelf reconstruction through manifests and optional Drive
   shortcuts, not duplicate source files.

Official public agency sources can enter the approved lane without a per-source
owner prompt when the owner has declared that source family canonical. In that
case Soulforge may create public-safe summaries, ontology seeds, NotebookLM
packet manifests, and `.registry/knowledge` entries in the same bounded task.
The full source body, extracted text, chunks, and NotebookLM answers still stay
out of public tracked files.

## Recommended Drive Shape

The historical root label `Soulforge_LLM_Wiki_Bookshelf/` may remain as a
compatibility name, but its role is a source warehouse. A future neutral label
such as `Soulforge_LLM_Wiki_Warehouse/` should follow the same model.

```text
Google Drive source warehouse
  Soulforge_LLM_Wiki_Bookshelf/
    00_INBOX_candidate/
      <domain>/<source_family>/
    10_CANON_source/
      <general_reference_domain>/<source_family>/
    20_Project_CANON/
      <project_code>/<source_context>/
    30_Domain_CANON/
      <domain>/<subdomain>/<source_family>/
      Soulforge_ontology/<ontology_release_id>/
    80_SUPERSEDED/
      <domain>/<source_family>/
    90_REJECTED_or_UNCLEAR/
      <domain>/<source_family>/
    _BOOKSHELF_MANIFESTS/
      <notebooklm_bookshelf_name>/
        BOOKSHELF_CARD.yaml
        SOURCE_LIST.yaml
        optional_shortcuts/
```

Folder state, including a `CANON` label, is a storage convenience rather than an
approval. The only exception is a package that passes the ontology release
contract in `ONTOLOGY_CANON_OPERATING_POLICY_V0.md`. `_workmeta` records its
approval state, hash, revision, NotebookLM binding, and review history without
storing the package body.

## Bookshelf Creation Rule

A NotebookLM bookshelf is not "one domain folder." It is one repeated question
world.

Create a new NotebookLM bookshelf when at least one of these conditions is true:

1. The recurring questions are different enough that shared answers would be
   confusing.
2. The allowed source boundary differs.
3. Project-specific and general reusable material would contaminate each other.
4. Organization-specific material and general standards/patterns would blur
   attribution.
5. Sensitivity, owner approval, or sharing boundary differs.
6. The same terms have different meanings in the two contexts.
7. A temporary cross-domain experiment is needed before promotion.

Do not create a new bookshelf only because a Drive folder exists. Do not merge
bookshelves only because the files share a domain label.

## Required Cards

Every durable source should have a source card:

```yaml
source_card:
  source_handle: source-YYYYMMDD-short-label
  title_label: Public-safe source label
  drive_ref: owner-held Drive ref or stable label
  source_hash: sha256-or-null
  warehouse_state: 00_INBOX_candidate
  source_kind: pdf | spreadsheet | slide_deck | drive_native_doc | source_packet
  domains:
    - domain_id
  organizations:
    - organization_or_null
  projects:
    - project_or_null
  sensitivity: public | owner_private | project_private | restricted
  approval_status: candidate | owner_approved | owner_approved_official_public_source | rejected | superseded
  claim_ceiling: observed | source_supported | validated_private | canon_candidate | canon_entry | rejected_or_blocked
  candidate_bookshelves:
    - NOTEBOOKLM__BOOKSHELF_NAME
  excluded_bookshelves:
    - NOTEBOOKLM__OTHER_BOOKSHELF
  reason: Public-safe placement reason.
```

This warehouse card shape is a catalog/placement record. It is not identical to
the RAG `soulforge.knowledge_source_card.v0` used by `guild_hall/rag`, which can
point at extracted `.md`/`.txt` source text under `_workspaces/knowledge/**`.
RAG source cards may therefore use text-oriented values such as
`source_kind: markdown_source_text` and more specific public-source labels, while
the warehouse catalog card keeps durable Drive/NotebookLM placement vocabulary.

Every durable NotebookLM bookshelf should have a bookshelf card:

```yaml
bookshelf_card:
  bookshelf_id: NOTEBOOKLM__BOOKSHELF_NAME
  notebooklm_label: NotebookLM label only, not an account URL
  purpose_questions:
    - What recurring question does this bookshelf answer?
  include_rules:
    - Include only approved source handles matching this scope.
  exclude_rules:
    - Exclude inbox, rejected, superseded, and unrelated project-private material.
  allowed_warehouse_states:
    - 10_CANON_source
    - 20_Project_CANON
    - 30_Domain_CANON
  allowed_sensitivity:
    - owner_private
  claim_ceiling: observed
  source_list_ref: _workmeta/<scope>/reports/source_research/<source_list>.yaml
  notebooklm_binding_ref: _workmeta/<scope>/reports/source_research/notebooklm_binding.yaml
  last_materialized_at_utc: null
```

## Ontology Rule

Ontology candidates and project-local relation truth do not become canon by
living in Drive folders or NotebookLM notebooks. A reusable ontology release is
canon only through the package contract in
`ONTOLOGY_CANON_OPERATING_POLICY_V0.md`; NotebookLM remains advisory.

Use `_workmeta` to record candidate graph edges such as:

| Edge | Meaning |
| --- | --- |
| `stored_in` | Source item has a Drive warehouse location. |
| `included_in_bookshelf` | Source handle is selected for a NotebookLM bookshelf manifest. |
| `mentions_entity` | Source names an organization, project, standard, artifact, or tool. |
| `supports_claim` | Source supports a scoped claim at the recorded claim ceiling. |
| `derives_concept` | A reusable concept candidate was extracted from a source or packet. |
| `applies_to_project` | Source or concept is project-specific. |
| `generalizes_to` | A project or organization-specific pattern may become reusable. |
| `supersedes` | One source replaces another source. |
| `conflicts_with` | Two sources disagree and need review. |
| `requires_owner_decision` | Promotion, approval, sharing, or claim ceiling needs owner action. |

NotebookLM can help discover candidate relations, but it cannot accept ontology,
raise claim ceilings, mutate graph truth, or promote canon by itself.
Official public source authority can support ontology seed registration; the
authority comes from the approved source and review route, not from NotebookLM
answers.

## Workbench Rule

Cross-domain discovery should use workbench bookshelves.

```text
Drive warehouse domains
  -> source cards and ontology candidates
  -> WORKBENCH__<domain_a>_to_<domain_b> bookshelf
  -> sourcebound/review check
  -> promoted stable bookshelf or rejected/held candidate
```

Workbench bookshelves are allowed to combine sources from multiple domains, but
their output stays advisory until sourcebound review and owner/review gates
raise the claim ceiling.
