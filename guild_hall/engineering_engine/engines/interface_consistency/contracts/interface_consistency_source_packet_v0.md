# Interface Consistency source packet v0

Status: source-supported implementation input. This packet authorizes no project
application, standard-compliance conclusion, source-body storage, or production
activation.

## 1. Authority and access inventory

Direct official-public verification occurred on 2026-08-26 KST. The engine retains
only bounded source identifiers, locators, revisions, and short paraphrases. It does
not retain source bodies, project facts, controlled-standard text, or RAG chunks.

| source_ref | publisher / authority | exact revision and status | access | direct locator verified | bounded engine use | applicability boundary |
| --- | --- | --- | --- | --- | --- | --- |
| `S1_ECSS_E_ST_10_24C_REV_1` | ECSS Secretariat / ESA Requirements and Standards Section | ECSS-E-ST-10-24C Rev.1, 15 November 2024; listed active by ECSS | `official_public` PDF | Annex A.2.1, pp. 37-40, requirements `1290039`-`1290049` | Interface ends, physical/functional/procedural/operational scope, discipline grouping, interface plane, units, accuracy, and verification-responsibility vocabulary | Operative only where an ECSS flow-down or governing agreement establishes applicability. Otherwise this is source-supported generic vocabulary, not a compliance verdict. |
| `S2_NASA_SP_2016_6105_REV_2` | NASA Office of the Chief Engineer / NASA NTRS | NASA/SP-2016-6105 Rev 2, published 17 February 2017; public-use permitted | `official_public` PDF | Section 6.3, printed pp. 157-160 | Registering interface characteristics, maintaining configuration/change linkage, and recording interface-agreement state | NASA describes this handbook as top-level guidance rather than a directive; it is never used here to infer a project obligation. |
| `S3_DOD_DI_IPSC_81436_REV_A_NOTICE_3` | U.S. Department of Defense ASSIST Quick Search; Navy Supply Systems Command approval authority | DI-IPSC-81436, Revision A Notice 3, 29 July 2026; Active | `official_public` page and document image | Page `10.2 Content Requirements`, data-element characteristics and timing/frequency/sequencing examples | Data/protocol attribute names, types, format, units, range, accuracy, timing, frequency, and sequencing vocabulary | A Data Item Description is contract-invoked. The engine does not treat its examples as universally required fields. |
| `S4_IETF_RFC_9368` | IETF / RFC Editor | RFC 9368, 2023, Proposed Standard / Internet Standards Track | `official_public` HTML | Sections 2.2, 2.3, and 3 | Bilateral version declaration and explicit compatibility/negotiation vocabulary | Limited to the structural pattern that both ends declare a compatible/reconciled revision. It does not make QUIC behavior a rule for non-QUIC interfaces. |

Publisher locators:

- ECSS: `https://ecss.nl/wp-content/uploads/2024/12/ECSS-E-ST-10-24C-Rev.1(15November2024).pdf`
- NASA: `https://essp.larc.nasa.gov/EVI-6/pdf_files/NASA_SystemsEngineeringHandbookRev2.pdf`
- DLA ASSIST: `https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=205916`
- RFC Editor: `https://www.rfc-editor.org/info/rfc9368/`

## 2. Direct derivation boundary

The four sources support a public-safe engine shape: an interface register identifies
ends and controlled revisions; typed facts describe electrical, signal, data/protocol,
mechanical, and timing attributes; each required comparison is pairwise; and each end
reports whether it agrees at a stated revision. They do **not** establish any value,
tolerance, connector type, protocol version, timing limit, or organization-specific
acceptance threshold.

Accordingly, executable rules compare only facts that a Project Binding or typed-fact
producer explicitly supplies. Missing source applicability, absent observations, or a
non-comparable field stays `gap_unknown`; an explicit `known_absent` fact becomes
`gap_missing`; incompatible supplied facts become `gap_conflict`.

The public value representation remains bounded to the existing Core canonical domain:
safe integer JSON numbers, fixed decimal strings for fractions, insertion-ordered arrays,
bounded ordinary objects, and exact `.mmmZ` instant strings when a value is instant-shaped.
This is an evidence representation rule, not an engineering tolerance or conversion rule.

## 3. RAG and source-body boundary

RAG may help locate a public source or candidate locator. It is not a verdict authority,
cannot supply a typed fact, and cannot replace direct confirmation at the publisher
surface. No RAG chunk, raw PDF body, paid/controlled standard, private project material,
absolute local path, credential, or source transcript belongs in this package.

Raw reusable working sources, if a later owner-approved task needs them, belong only in
`_workspaces/knowledge/common/interface_consistency/**`; this task stores none.

## 4. Source gaps and holds

- IPC, IEEE, ISO, SAE, USB, PCIe, and supplier connector specifications are not used as
  executable authority here because their protected/contract-specific applicability is
  unresolved.
- Unit conversion, electrical derating, impedance calculations, protocol-semver policy,
  drawing-tolerance interpretation, and acceptance authority remain outside this engine.
- A project-specific Interface Control Document, agreement, or binding may establish such
  facts in its private Project Binding; it must not be copied into this public package.

Claim ceiling: `source_supported` for the bounded structural checks only.
