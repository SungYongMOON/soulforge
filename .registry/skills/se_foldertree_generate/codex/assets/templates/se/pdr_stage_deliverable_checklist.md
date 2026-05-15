# PDR Stage Deliverable Checklist

## Objective

- Establish preliminary design allocation and enough source-backed detail to move from requirements and architecture into component, interface, and verification preparation.

## Required working packet set

- [ ] document identity block for each major draft
- [ ] source ledger for the stage
- [ ] review / action log for the stage
- [ ] direct review queue entries for any exact-format or exact-rule dependency

## Priority artifact set

- [ ] `SSDD_F` or equivalent architecture/package update exists in draftable form
- [ ] `HDD_D` structure exists and project-specific sections are being filled
- [ ] `SDD_D` structure exists if software scope is present
- [ ] `DBDD_D` exists if a database or persistent data scope exists
- [ ] `IDD_D` / `ICD_Prelim` exist for interface-heavy areas
- [ ] `RTM` update path exists so requirements can trace into design items
- [ ] `TEMP_D` or equivalent test-planning seed exists for future verification

## Supporting evidence set

- [ ] source packets or approved source basis exist for the main design claims
- [ ] open source gaps are explicit, not hidden
- [ ] owner decisions needed for boundary/scope are listed
- [ ] design assumptions and unresolved risks are listed
- [ ] if hardware exists, placement/routing-sensitive notes are captured

## Done gate

Treat `090_PDR` as a draft-ready stage only when:

1. the priority artifact set has real draft bodies, not only filenames
2. the supporting evidence set is explicit
3. direct-review blockers are either resolved or called out as named caveats
4. the review packet can explain what is ready and what is still blocked
