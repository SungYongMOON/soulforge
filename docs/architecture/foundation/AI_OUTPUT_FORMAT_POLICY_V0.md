# AI Output Format Policy v0

## Purpose

This document fixes how Soulforge chooses between Markdown, HTML, and
structured text when AI agents produce project knowledge, review material, or
temporary working interfaces.

The policy is not a migration from Markdown to HTML. It separates durable
source-of-truth files from human-review artifact outputs.

## Decision

- Durable source-of-truth records stay in diff-friendly text formats:
  Markdown, YAML, JSON, or other owner-approved structured text.
- Self-contained HTML is allowed and encouraged for generated
  human-review artifact outputs when layout, diagrams, filtering, comparison,
  or interaction materially improves human review.
- HTML must not become the default canonical storage format for Soulforge
  architecture, workflow, registry, mission, or private evidence records.
- A long AI response that a human must actually inspect should be considered
  for HTML, but the underlying decision, source packet, or acceptance record
  must still be exportable back to Markdown, YAML, JSON, or another structured
  text form.

## When To Use Markdown Or Structured Text

Use Markdown, YAML, JSON, or equivalent structured text when the output is:

- repository canon or owner contract;
- an agent instruction, README, changelog, workflow, mission, skill, class,
  species, tool, or knowledge record;
- expected to be reviewed through Git diff;
- expected to be read by another agent as compact context;
- a machine-validated packet, index, manifest, or schema-bound artifact;
- long-lived project evidence or promotion-ready procedure capture.

Markdown remains the preferred authoring surface for prose that must stay easy
to edit, quote, diff, and patch. YAML and JSON remain preferred for structured
contracts and validator-owned data.

## When To Use HTML

Use self-contained HTML when the output is primarily a human-review artifact,
not the canonical source:

- PR or code review explanations with annotated diffs, severity colors, or
  jump links;
- architecture explanations that benefit from diagrams, tabs, callouts, or
  side-by-side comparisons;
- research reports where filters, collapsible sections, charts, or glossaries
  make review faster;
- design or UI review pages using live component states, swatches, or motion
  controls;
- one-off editors where the human changes ordering, grouping, parameters, or
  prompt variables and then exports the result.

For one-off editors, include an export control that produces the final decision
or patch candidate as Markdown, YAML, JSON, plain text, or a copyable diff. The
HTML page is the review surface; the exported text is the durable record.

## Boundaries

- HTML artifacts must not contain secrets, credentials, cookies, session
  values, private raw source bodies, mail bodies, protected attachment content,
  or private run truth.
- The secrets/private boundary is mandatory for every generated output format,
  including HTML.
- Public HTML artifacts must only contain public-safe summaries, synthetic
  examples, or redacted references.
- Do not fetch remote scripts, fonts, images, analytics, or third-party assets
  by default. Prefer a self-contained file.
- Do not grant HTML artifacts authority to mutate repository state, private
  state, external tools, accounts, or source systems. Mutation still belongs to
  explicit commands, workflows, or owner-approved operations.
- Generated JavaScript may support local filtering, navigation, interaction,
  and export, but it must not hide required evidence from the exported durable
  record.
- If an HTML artifact uses generated analysis, it must state its source refs
  and claim ceiling in the visible page or exported record.

## AI Readability

HTML is usually readable by modern AI models, and semantic HTML can preserve
headings, tables, links, and sections better than plain extracted text. The
cost is extra tokens and possible noise from tags, CSS, and JavaScript.

For AI-to-AI context, prefer compact source-of-truth Markdown, YAML, JSON, or a
cleaned HTML excerpt over a full styled page. For human-in-the-loop review,
prefer HTML when the visual or interactive structure changes whether the human
will inspect the result.

## Prompt Pattern

Use this pattern for human review outputs:

```text
Create a self-contained HTML human-review artifact for this task.
Keep the source-of-truth decision/export as Markdown, YAML, JSON, or plain text.
Do not include secrets, private raw payloads, remote assets, or hidden evidence.
Include a copy/export control for the durable result.
```

Use this pattern for durable records:

```text
Create the durable source-of-truth record as Markdown/YAML/JSON.
Do not replace the canonical record with HTML.
If a human-review HTML artifact would help, produce it as a derived companion.
```

## Soulforge Application

- Existing `.md` architecture documents stay as canonical text unless a
  specific owner contract says otherwise.
- HTML outputs may be added as derived review artifacts under an owner-approved
  artifact path, not as replacements for canonical `.md`, `.yaml`, or `.json`
  records.
- For public examples, store reusable samples under
  `docs/architecture/workspace/examples/` only when they are public-safe.
- For project-local or cross-project protected evidence, keep the durable
  record in the correct private surface and expose only redacted/public-safe
  HTML companions when explicitly approved.
- If a format choice affects owner boundaries, update the relevant README and
  validation surface in the same change.

## Completion Criteria

A new AI-generated knowledge or review output is policy-compliant when:

- its canonical source-of-truth location and format are explicit;
- any HTML file is labeled or treated as a derived human-review artifact;
- a text or structured export exists for durable decisions;
- public/private/secret boundaries are preserved;
- the output can be validated, diffed, or re-generated without relying on
  hidden browser state.
