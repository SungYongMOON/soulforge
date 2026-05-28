# RAG Source-family Promotion Policy v0

## Purpose

This policy makes Soulforge's RAG promotion rules source-family specific.

The owner should not need to read every document manually before Soulforge can
classify it. Instead, the owner defines source families, default trust levels,
allowed automatic promotion lanes, and stop conditions. Agents then apply the
policy and record exact evidence, blockers, and claim ceilings.

This policy distinguishes two different meanings of "canon":

- source canon: the source file or source card is accepted as an authentic
  source for a bounded use.
- knowledge canon: a derived claim, work card, wiki packet, ontology entry, or
  public canon entry is accepted for reuse.

An official source can be source canon without making every derived RAG claim a
knowledge canon entry.

## Shared Promotion Ladder

Use the weakest supported state:

| Level | Meaning | Typical owner surface |
| --- | --- | --- |
| `observed` | The material was found or inventoried, but source support is not enough. | `_workmeta/**` |
| `source_canon` | The source identity/provenance is accepted for a bounded source family. | `_workspaces/knowledge/**` source card plus `_workmeta/**` evidence |
| `source_supported` | A bounded claim is backed by accepted source refs, pages/chunks, and review metadata. | `_workspaces/knowledge/rag/**`, `_workmeta/**` |
| `validated_private` | A private/workspace artifact is validated for bounded internal reuse. | `_workspaces/knowledge/**`, `_workmeta/**` |
| `canon_candidate` | A reusable knowledge entry is prepared but not yet registered. | `_workmeta/**`, private wiki candidate, or target owner draft |
| `canon_entry` | The target owner surface has registered the entry with passing guards. | `.registry`, `.workflow`, `.party`, docs, or approved private wiki surface |
| `rejected_or_blocked` | A required source, review, boundary, or owner-surface guard failed. | `_workmeta/**` |

## Source Families

### 1. Official Public Sources

Examples:

- government publications;
- laws, regulations, standards, and official manuals;
- official vendor documentation;
- owner-approved public DAPA, ministry, or standards documents.

Default authority:

- May become `source_canon` when a source card records official source
  authority, source locator/provenance, version or date, file hash, sensitivity,
  and Soulforge-root-relative storage refs.
- Official source authority proves that the source is authentic. It does not
  prove that parser output, OCR, extracted tables, LLM summaries, or work-card
  claims are correct.

Automatic lanes allowed without per-item owner prompt:

- source card registration as source-canon metadata;
- parser-first source-text extraction and index build when the source card and
  ready manifest grant retrieval/index use;
- source-text work-card route when citation/page/chunk quality review passes;
- current-scope private work-card or private wiki candidate when claim ceiling
  is explicit and review blockers are named;
- public-safe abstraction draft when it contains no raw source body, chunks, or
  private payload.

Still requires a separate gate:

- public canon registration;
- ontology acceptance;
- final-answer authority;
- external upload or NotebookLM packet membership;
- default-route mutation;
- production-ready claims.

Stop conditions:

- missing source card, hash, or provenance;
- source text not extracted from an approved parser-first route;
- table, diagram, OCR, page-order, or citation alignment risk remains open for
  the proposed claim;
- public-safe abstraction is not written;
- the target owner surface is unclear.

### 2. Owner-approved Private Project Sources

Examples:

- project plans, contracts, specifications, review notes, and customer or
  company documents;
- owner-provided internal files under `_workspaces/<project_code>/**` or
  `_workspaces/knowledge/**`;
- private source packets.

Default authority:

- May become `source_canon` only for the private/project scope named by the
  source card or project packet.
- Does not grant public canon, public summary, external upload, or cross-project
  reuse by default.

Automatic lanes allowed without per-item owner prompt:

- metadata inventory and source-card validation;
- private source-text extraction/index when the source card grants retrieval
  and the output stays in approved private workspace paths;
- project-local work-card route after citation/quality review;
- private wiki candidate when private/raw/secret exclusion and claim ceiling
  are explicit.

Still requires a separate gate:

- public-safe abstraction;
- cross-project reusable knowledge;
- external upload or NotebookLM packet use;
- canon entry outside the owning project;
- final-answer authority.

Stop conditions:

- sensitivity or owner surface is unclear;
- source body would be copied into public repo or `_workmeta`;
- raw mail, attachments, credentials, personal data, or protected payloads are
  needed;
- source-card permission does not include retrieval/index use.

### 3. Owner Notes, Worklogs, and Procedure Records

Examples:

- `_workmeta/**` worklogs;
- procedure capture notes;
- onboarding notes;
- owner statements and task history.

Default authority:

- Start as `observed` or `metadata_only_record`.
- They can support process knowledge, workflow candidates, and owner-decision
  follow-up, but they are not external source truth.

Automatic lanes allowed without per-item owner prompt:

- procedure-capture candidate;
- workflow/skill improvement candidate;
- private operational memory or handoff note;
- sourcebound review queue item when the note references traceable source refs.

Still requires a separate gate:

- workflow canon changes;
- public documentation changes;
- claims about external facts;
- source truth, ontology acceptance, or public canon promotion.

Stop conditions:

- the note is the only evidence for a domain fact;
- raw transcript, private payload, or secret would be copied;
- the source referenced by the note is not traceable.

### 4. Parser, OCR, and Index Outputs

Examples:

- Docling JSON;
- Tika or PDF text extraction;
- OCR output;
- source-text indexes;
- traceability sidecars;
- source-text answer runs and quality reviews.

Default authority:

- These are derivative evidence, not source canon.
- They can prove extraction/index/retrieval behavior only inside their review
  scope.

Automatic lanes allowed without per-item owner prompt:

- extraction quality record;
- citation/page traceability record;
- source-supported work-card candidate when page/chunk evidence aligns;
- current-scope route guard when visual/table/OCR risks are reviewed for the
  proposed claim.

Still requires a separate gate:

- source truth;
- stronger knowledge promotion;
- public canon;
- final-answer authority.

Stop conditions:

- weak mapping, unmapped chunks, OCR corruption, missing pages, or table/diagram
  ambiguity affects the proposed claim;
- source text was not derived from an approved source card;
- answer run is plausible but not citation-grounded.

### 5. Advisory LLM, NotebookLM, and Cloud Parser Output

Examples:

- LLM summaries;
- NotebookLM answers;
- LlamaParse or cloud OCR/parser output;
- Codex bridge advisory analysis.

Default authority:

- Advisory only. Starts as `observed`.
- It can route candidates and suggest questions, but it cannot approve source
  truth, owner decisions, ontology, public canon, or final answers.

Automatic lanes allowed without per-item owner prompt:

- metadata-only candidate note;
- question fingerprint or usage signal;
- follow-up queue item;
- sourcebound review scope proposal.

Still requires a separate gate:

- any claim that will be reused as knowledge;
- NotebookLM packet membership;
- external upload;
- public or private knowledge promotion.

Stop conditions:

- no independent source refs;
- answer text would be copied into public repo or `_workmeta`;
- cloud account/session IDs or conversation IDs would be recorded.

### 6. Mail, Attachments, and Protected Operational Payloads

Examples:

- mail bodies and `.msg` files;
- attachments;
- protected customer or company payloads;
- raw exports that may contain credentials, personal data, or private material.

Default authority:

- Protected payload. Metadata-only unless an owner-approved project source card
  explicitly converts it into a source packet.

Automatic lanes allowed without per-item owner prompt:

- metadata pointer, hash, size, source-card preparation, and relocation record;
- private project intake queue;
- blocker or owner-decision follow-up.

Still requires a separate gate:

- body reading;
- source-text extraction;
- index build;
- public summary;
- cross-project reuse;
- external upload.

Stop conditions:

- payload would be stored under `_workmeta`;
- public repo would receive raw or private data;
- secret/session/credential data might be exposed.

### 7. Public Web and Community Sources

Examples:

- blogs, GitHub issues, community posts, videos, forums, and web articles.

Default authority:

- Usually `observed` or `source_supported` for a bounded claim after citation.
- Official vendor/government pages may be routed as official public sources if
  the source card records official authority.

Automatic lanes allowed without per-item owner prompt:

- external signal candidate;
- adoption candidate;
- sourcebound review candidate;
- metadata-only reference entry.

Still requires a separate gate:

- public canon;
- workflow/skill adoption;
- source truth beyond the cited claim;
- production-ready claims.

Stop conditions:

- source is unstable, unofficial, contradicted, or not archived by ref/hash;
- claim needs current web verification;
- source license or copyright boundary is unclear.

## Default Auto-promotion Rules

Agents may auto-promote within the stated family only when all applicable
conditions pass:

1. source family is explicit;
2. source card or metadata packet is present;
3. source sensitivity and owner surface are explicit;
4. target promotion layer is explicit;
5. the claim ceiling is no stronger than the passed evidence;
6. raw/private/secret/source bodies are not copied into public repo or
   `_workmeta`;
7. validators and review packets pass for the target layer;
8. failed or not-applicable guards are recorded by name.

If the family policy allows the target layer and all target-layer guards pass,
the agent should register or apply the result in the same bounded task. If any
guard fails or is unknown, the agent must stop at the weakest supported state
and write the next required action.

## Default Source-family Matrix

| Source family | Source canon | Source-text index | Work card | Private wiki | Public canon |
| --- | --- | --- | --- | --- | --- |
| Official public source | Auto if source card/hash/provenance pass | Auto if source card and ready manifest grant it | Auto after citation/quality review | Candidate or validated private after review | Separate public-safe abstraction and review |
| Owner-approved private project source | Private/project only | Private only when source card grants it | Private/project only after review | Private candidate or validated private | Blocked until redacted/public-safe policy passes |
| Owner notes/worklogs | Metadata only | No | Procedure/workflow candidate only | Candidate only | Separate review; no domain facts without source |
| Parser/OCR/index output | No, derivative only | N/A | Candidate after quality review | Candidate after review | Separate public-safe abstraction and review |
| Advisory LLM/NotebookLM/cloud output | No | No | No direct work-card authority | Candidate only with independent source refs | No |
| Mail/attachments/protected payloads | Private only after source-card conversion | Separate owner/source-card gate | Private/project only after review | Private only | No by default |
| Public web/community source | Citation support only | No by default | Candidate after source review | Candidate after review | Separate adoption/public-safe review |

## DAPA-style Interpretation

For an owner-approved official DAPA source:

- the downloaded official document may be treated as source canon when source
  card, hash, provenance, and storage refs pass;
- Docling/OCR/index outputs remain derivative and need extraction quality and
  traceability checks;
- work cards can become `source_supported` for the current claim scope when
  page/chunk/visual review passes;
- private route preference can be applied when a delegated guard packet passes;
- public canon, ontology, final answer, and external upload remain separate
  gates.

In short: the book can be official, while the notes made from the book still
need review before becoming reusable knowledge.
