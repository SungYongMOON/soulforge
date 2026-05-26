# dapa_weapon_system_test_eval_guidebook

`dapa_weapon_system_test_eval_guidebook` registers an official public DAPA reference source for weapon-system test and evaluation.

## Summary

The guidebook supports a reusable Soulforge knowledge entry for how test and evaluation fits into systems engineering and defense acquisition. It covers acquisition-stage test planning and execution, development test evaluation, operational test evaluation, verification concepts, reliability testing, software reliability testing, M&S-based test evaluation, ILS test evaluation, and related law/regulation context.

## Ontology Seed

The public ontology seed in `knowledge.yaml` maps the core concepts:

- test and evaluation
- systems engineering process
- development test evaluation
- operational test evaluation
- verification
- reliability test
- acquisition risk reduction

These concepts may be used for graph/RAG routing and future wiki materialization.

## Boundary

- The official source itself is approved reference knowledge.
- Public registry summary and ontology seed are allowed because the source is official and public.
- NotebookLM packet membership is allowed, but NotebookLM answers are advisory and must not replace source citation.
- The registry entry state is `canon_entry`; the supported content claims remain `source_supported` and cite the official source.
- Full source text, extracted text, chunks, and answer-run payloads stay under `_workspaces/knowledge/**`.
