# Ontology Canon Operating Policy v0

## Purpose

This document records the 2026-07-15 owner decision for Soulforge-wide
knowledge and ontology storage. It applies to reusable ontology packages, not
to all Soulforge code, workflow, party, project, or source-truth owners.

## Authority map

| Surface | Authority |
| --- | --- |
| Owner-held original, company NAS, project repository, or approved source packet | Source truth for the original material. |
| Google Drive `Soulforge_LLM_Wiki_Bookshelf/30_Domain_CANON/Soulforge_ontology/<ontology_release_id>/` | Canon owner for a reusable ontology package only when the release has owner approval, manifest, revision, hashes, source refs, classification, NotebookLM membership, and recovery evidence. |
| `.registry/knowledge` | Public-safe, Git-tracked execution/search/automation projection of approved Drive ontology releases. It is not an independent replacement for the Drive release lineage. |
| `_workmeta` | Metadata-only catalog: Drive IDs/paths/revisions, hashes, approval and review state, NotebookLM IDs/membership/query status, validation and recovery results. No package or source bodies. |
| NotebookLM | Default advisory query bookshelf over approved source and ontology package membership. Important conclusions must trace to the connected source revision or approved package. |
| Owner-approved company NAS target | One-way disaster-recovery copy of a Drive ontology release. It is not a jointly edited canon. |
| OneDrive | Active/latest editable project work surface. It is not an ontology canon store. |
| RAG, Obsidian, and graph views | Derived query and navigation views generated from approved sources or canon packages. |

Folder placement, a `CANON` label, connector access, or a successful read does
not create canon. The package-level exception exists only after every required
release field and review guard passes.

## Drive structure

Keep the existing root and these logical lanes:

```text
Soulforge_LLM_Wiki_Bookshelf/
  00_INBOX_candidate/
  10_CANON_source/
  20_Project_CANON/
  30_Domain_CANON/
    Soulforge_ontology/
      <ontology_release_id>/
  _BOOKSHELF_MANIFESTS/
  80_SUPERSEDED/
  90_REJECTED_or_UNCLEAR/
```

Each ontology release manifest must contain:

- ontology release ID and creation date;
- scope and corresponding Soulforge Git commit;
- included file inventory and per-file SHA-256;
- source refs and approval/review state;
- sensitivity/classification;
- NotebookLM notebook ID and source membership;
- previous release and supersede relations;
- Drive-to-Soulforge and NAS-to-Soulforge recovery results.

The deterministic implementation surface is
`guild_hall/knowledge_canon/ontology_canon_package.mjs`. Package payloads are
materialized under `_workspaces/system/**` or another owner-approved worksite;
only their metadata refs belong in `_workmeta`.

## Projection and reconciliation

1. Compare release ID, manifest, Git commit, inventory, SHA-256, and impact.
2. Never overwrite `.registry/knowledge` automatically.
3. Dry-run the difference and exclude private/raw/secret or unsupported claims.
4. Apply only the reviewed public-safe projection.
5. Run canon, path, knowledge-canon, and post-development review gates.
6. Record the release and validation metadata in `_workmeta`.

If Drive and `.registry/knowledge` differ, the last approved Drive ontology
release is the lineage authority, but reconciliation remains review-first. A
newer unapproved Drive file or an unreviewed Git edit cannot win by timestamp.

## NotebookLM operating rule

Approved knowledge questions should query the matching approved NotebookLM
bookshelf first when one exists. A bookshelf is a query view, not a duplicate
file store or approval authority. Record notebook ID, source ID, source
revision/hash, purpose, and last synchronization state in
`_BOOKSHELF_MANIFESTS` and `_workmeta`. Do not store answer bodies there.

NotebookLM output may identify a candidate relation or route. Before using an
important conclusion, trace it to the connected source or package, run the
sourcebound/review route, and keep the weakest supported claim ceiling.

## Security boundary

- Personal Google Drive and NotebookLM accept only public-safe or explicitly
  owner-approved reusable ontology packages.
- Defense, customer, company-private, contract, mail, test, requirement, and
  detailed design source bodies stay in the company NAS or approved project
  worksite. `_workmeta` stores pointers and metadata only.
- A private-project abstraction may enter the Drive ontology lane only after a
  separate review confirms that the original cannot be reconstructed.
- Secret, credential, token, cookie, password, and session files are never read
  or copied into the package.

## Disaster recovery

Drive to Soulforge recovery:

1. Download or read back a release into a new `_workspaces/system/**` staging
   path.
2. Verify the manifest, inventory, hashes, release ID, and Git commit.
3. Produce a dry-run `.registry/knowledge` diff and impact review.
4. Reconcile only after validation and review; never blind-overwrite.

NAS recovery:

1. Use only an explicitly owner-approved NAS target.
2. Verify the one-way copy against the same release manifest and hashes.
3. Restore into a new Drive staging/release path, not over the approved release.
4. Re-register the Drive package and revalidate NotebookLM membership.

An empty or reachable NAS path is not approval. The candidate location
`<owner-approved-NAS-root>/Soulforge_Project_Backup` remains unusable until
owner approval is recorded.
