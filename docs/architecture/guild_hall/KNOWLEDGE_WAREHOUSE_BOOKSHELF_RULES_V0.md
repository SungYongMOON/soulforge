# Knowledge Warehouse And Bookshelf Rules v0

## Purpose

This document fixes the owner vocabulary and placement rules for the LLM wiki
source warehouse, NotebookLM notebooks, and metadata ledgers.

The main rule is:

```text
Google Drive stores source files by durable source/domain logic.
NotebookLM notebooks are query bookshelves assembled from approved source sets.
_workmeta records the catalog, bindings, approvals, and ontology candidates.
```

## Vocabulary

| Term | Korean working term | Meaning | Authority boundary |
| --- | --- | --- | --- |
| Drive source warehouse | 창고 | Owner-held Google Drive storage/archive/backup for source files, source refs, and packages. | Stores files; folder placement alone is not approval, source truth, or canon. |
| NotebookLM query bookshelf | 책장 | One NotebookLM notebook or equivalent selected source set. | Advisory query surface; answers are not validation or canon. |
| Source item | 책 | One source handle, file, source packet, or Drive-native source ref. | Must be represented by a metadata source card before durable use. |
| Source catalog | 장서목록 | `_workmeta` ledgers, packet maps, NotebookLM bindings, query/use logs, and review packets. | Records refs, decisions, claim ceilings, and reproducible source selections. |
| Domain group | 서가 / 분야 | Human management grouping for related bookshelves or source families. | Not a NotebookLM object and not source authority. |
| Ontology candidate graph | 온톨로지 후보 | Reusable entity, relation, concept, claim, project, and domain patterns. | Lives in `_workmeta` until accepted by the correct owner/review route. |

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

Folder state is a storage convenience. The `_workmeta` source catalog remains
the place that records approval state, claim ceiling, source handle, hash,
NotebookLM binding, and review history.

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
  approval_status: candidate | owner_approved | rejected | superseded
  claim_ceiling: observed | source_supported | validated_private | canon_candidate | canon_entry | rejected_or_blocked
  candidate_bookshelves:
    - NOTEBOOKLM__BOOKSHELF_NAME
  excluded_bookshelves:
    - NOTEBOOKLM__OTHER_BOOKSHELF
  reason: Public-safe placement reason.
```

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

The ontology does not live in Drive folders or NotebookLM notebooks. Those
surfaces are too operational and too fluid.

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
