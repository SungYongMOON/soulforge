# Database Engineering source packet v0

Claim ceiling: `source_supported`. The inventory records public official source
metadata and short, bounded derivations only; it does not contain source bodies.

The authoritative source list is
[`database_engineering_source_inventory_v0.json`](database_engineering_source_inventory_v0.json).
SQLite behavior is scoped to 3.53.4 and PostgreSQL behavior to 18.6. PostgreSQL
minor revisions need source refresh before a rule is applied to a different
minor version. NIST SP 800-34 Rev.1 supports recovery-planning evidence, not
project RPO/RTO values or an operational recovery decision.

The four PostgreSQL 18.6 executable-rule pages are pinned as public-safe
metadata: official/final URL, fixed no-cookie identity request profile, access
instant, HTTP/content metadata, raw entity-byte length, SHA-256, release ref,
and `body_storage: none`. Those pins detect source drift; they do not copy a
page into the package, make a retrieval source a verdict authority, or turn the
floating `/docs/18/` locator into an assertion about a future minor release.

RAG/LLM may locate a listed source or propose a candidate. It cannot add a
source, accept a rule, derive project facts, issue a verdict, or promote this
package. ISO/IEC, DAMA, books, and other protected material remain locator-only
until a rights-approved human-curated mapping is supplied.
