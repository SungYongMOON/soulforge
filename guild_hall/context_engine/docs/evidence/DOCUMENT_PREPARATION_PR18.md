# PR18 real-parser local verification — 2026-09-17

This is local Windows synthetic-fixture evidence for the bounded PDF/basic DOCX
preparation and readback change. It is not a CI parser-run claim, general Office
fidelity acceptance, business A/B/C result, model benchmark, or operating rollout.

The source is the commit containing this record. The runtime closure after the
review repairs is `0d314f875adc68e82e0a16aef97d16558e230ddb2435456bad8f1c88e3d9ba34`.
The graph worker in flow tests is explicitly canned; the PDF and DOCX parsers are real.

## Host tool provenance

- Node: 24.15.0; npm: 11.17.0.
- Python: 3.12.14; executable SHA-256: `372c2eae555b344520bf147be0096e009069aeca4e7f78d6aecea6d53158056a`.
- pdfplumber: 0.11.9; pdfminer.six: 20251230; pypdfium2: 5.13.0.
- python-docx: 1.2.0; lxml: 6.1.1.
- reportlab (synthetic PDF construction): 4.4.9.
- Both `SOULFORGE_TEST_PDF_PYTHON` and `SOULFORGE_TEST_DOCX_PYTHON` named this explicit interpreter.
- Extraction uses the pinned workers/profiles. Windows worker mode is isolated/no-bytecode/no-site startup with the interpreter's own site-packages explicitly added. Fixture creation also invokes the declared interpreter; this is not a claim that the interpreter or all package bytes are runtime-attested by their version strings.

## Results and limits

- PDF/preparation suite: 58 pass, 0 fail, 0 skip.
- DOCX/preparation suite: 47 pass, 0 fail, 0 skip.
- Original-read suite: 51 pass, 0 fail, 0 skip.
- These suites overlap and must not be summed.
- Full Context Engine suite: 370 pass, 0 fail, 5 explicit external-runtime opt-in skips (375 total). Module closure verified 78 runtime files.
- Independent Astra review exercised the requested seams and found two further P2s: Windows rooted-but-not-fully-qualified interpreter paths and reread failure reported as revision mismatch. Both were corrected and the independent 23-test regression passed without skips.
- The local root done-check reached the unrelated client-bundle comparison and stopped: using shared workspace dependency junctions changes esbuild module path strings. The same bundle check passed in the main checkout. A dependency relinking/reinstall attempt was rejected by automatic policy and was not executed or retried through another route. This record does not claim a local root done-check pass; the exact PR CI result is reported separately.
- Original-fidelity review, real source coverage, automatic document discovery, and live installation remain separately evaluated.

## Exact successful local run logs

The following are the complete successful console outputs for these three
commands, with line endings normalized. No real business source was used.

### pr18-proof-pdf.log

```text
> validate:context-document-preparation
> node --test guild_hall/context_engine/tests/document_source_preparation.test.mjs guild_hall/context_engine/tests/pinned_pdf_worker_guard.test.mjs guild_hall/context_engine/tests/document_preparation_flow.test.mjs guild_hall/context_engine/tests/preparation_validation.test.mjs guild_hall/context_engine/tests/source_adapters.test.mjs guild_hall/context_engine/tests/document_tools.test.mjs guild_hall/context_engine/tests/estate_graph_sync_document_tools.test.mjs

✔ real PDF preparation reaches inactive store and validates without a graph or accepted pointer (1072.2171ms)
✔ real PDF -> canned graph extraction -> lexical evidence and replay, with no live model or database (3032.6052ms)
✔ unconnected PDF keeps graph generation unavailable before any model extraction (152.6166ms)
✔ a granted PDF uses the pinned parser and keeps page and table locators (696.8045ms)
✔ a malformed PDF is an explicit failed item and its source bytes stay unchanged (293.9136ms)
✔ document tool wiring is host-only and leaves legacy text and unsupported formats explicit (6.2931ms)
✔ PDF preparation fails closed for mixed empty pages and source-document bounds (1.7536ms)
✔ document tool schema admits absent or exact PDF/DOCX host bindings only (1.7248ms)
✔ document tool interpreter paths are fully qualified for the host platform (0.3322ms)
✔ document tool schema rejects accessors without running caller code and source preparation fails before grant work (0.4094ms)
✔ preparation, graph, sync and original-read binding entrypoints reject malformed document tools early (36.9467ms)
✔ graph sync preflight forwards the binding document tools to real PDF and DOCX parsers (1005.386ms)
✔ a fixed PDF worker changed before launch is refused from an isolated copy (15.1394ms)
✔ a fixed PDF worker changed while parsing is refused after the parser returns (11.005ms)
✔ a preparation run records its preparer, code, rules, grant and exact result (43.1414ms)
✔ an untouched preparation passes every check and the report pins exactly that run (31.1227ms)
✔ tampered document text fails identity while the run record stays as written (27.266ms)
✔ a rewritten document that also restates its digests still fails the run binding (28.9473ms)
✔ a wrong locator is caught even though it leaves the document identity intact (41.5259ms)
✔ preparing beyond the grant is caught as a missing condition (28.2116ms)
✔ a run outside the grant validity window is reported (40.1687ms)
✔ re-checking the same bytes adds a report and never rewrites the run or the result (39.2469ms)
✔ rewriting any part of a prepared document is caught, not only its text (75.6538ms)
✔ a fabricated component cannot widen the revisions a locator may cite (25.2604ms)
✔ a malformed document is reported as a finding rather than thrown (60.0632ms)
✔ a record cannot carry a true code digest beside a fabricated file list (30.589ms)
✔ the validator pins its own bytes too (32.5664ms)
✔ the record comes from preparing, so a caller cannot mint one for its own documents (85.746ms)
✔ a locator stripped of its anchor is a finding, not a silent pass (44.9721ms)
✔ a kind that anchors by path is path-checked, and the rule that does not apply is a limit (34.3949ms)
✔ a record claiming that nothing prepared it is refused, not merely stale (27.2417ms)
✔ the preparer import walker stays in step with the release closure it mirrors (1.7346ms)
✔ the change set and the grant summary travel bound to the record (37.3282ms)
✔ without an admissible grant the locator check reports not run, not findings (26.9085ms)
✔ a version claim that contradicts this tree's proven bytes is caught (39.1301ms)
✔ a value the canonical hash refuses becomes a finding, never an exception (102.6342ms)
✔ no value a reader hands in can end the report instead of appearing in it (92.9163ms)
✔ a record that merely states a digest cannot borrow another run's report (42.467ms)
✔ a report does not carry over to a different preparation or a changed grant (53.143ms)
✔ skipping the live code comparison is reported as not run, not as a pass (22.1478ms)
✔ a record made by other preparer code is not reproducible here, and is not called a failure (26.605ms)
✔ an edited run record fails its own integrity check (27.3821ms)
✔ the record refuses inputs it cannot describe (39.5168ms)
✔ a self-referential or stack-deep value is a difference, not a crash (37.8578ms)
✔ a check that meets a shape it cannot read says so and the others still report (91.7914ms)
✔ both lineage-less states answer the same gate (38.6156ms)
✔ voice sessions become utterance units with absolute times, hashed speaker labels and a capture time (32.2818ms)
✔ a mixed recording admits only the granted interval and keys it separately (41.5723ms)
✔ voice revisions: exact transcript pins, re-derived transcripts change, ambiguous and named folders (52.237ms)
✔ mail events keep header, new body and quoted history apart and never let other mails change them (19.3228ms)
✔ mail revisions and absence are reported per item; Korean client headers split history (9.1118ms)
✔ documents keep heading sections, refuse unsupported formats and track file revisions (18.2237ms)
✔ a real voice preparation validates clean, and a re-pointed utterance locator does not (48.392ms)
✔ a scoped voice grant records and validates the scoped document (45.1564ms)
✔ millisecond ASR offsets and a fractional duration still record and validate (44.4494ms)
✔ decomposed Korean in a heading and a speaker label neither aborts nor splits identity (22.5742ms)
✔ a decomposed speaker label does not destroy the other kinds in one grant (42.0385ms)
✔ values the canonical hash refuses never cost a preparation its documents (160.3459ms)
ℹ tests 58
ℹ suites 0
ℹ pass 58
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4462.3669
```

### pr18-proof-docx.log

```text
> validate:context-docx-preparation
> node --test guild_hall/context_engine/tests/document_docx_preparation.test.mjs guild_hall/context_engine/tests/document_docx_flow.test.mjs guild_hall/context_engine/tests/document_source_preparation.test.mjs guild_hall/context_engine/tests/preparation_validation.test.mjs guild_hall/context_engine/tests/document_tools.test.mjs

✔ real minimal DOCX preserves body/table order through inactive store and reports fidelity gap (4558.1222ms)
✔ DOCX request accessors and byte-view shadows are refused without executing caller code (1.6314ms)
✔ DOCX body-table-body preparation preserves structural positions, identity and replay (1037.9216ms)
✔ DOCX with styles but no docDefaults uses visible unnumbered defaults (620.7322ms)
✔ DOCX refuses hidden, wrapped, math and merged content without a partial document (4787.0515ms)
✔ DOCX corrupt and decompression-bound inputs fail explicitly; unbound and invalid tools stay closed (967.2045ms)
✔ DOCX fixed worker changes before launch and during parsing are refused from isolated copies (660.8846ms)
✔ a granted PDF uses the pinned parser and keeps page and table locators (719.9201ms)
✔ a malformed PDF is an explicit failed item and its source bytes stay unchanged (280.5163ms)
✔ document tool wiring is host-only and leaves legacy text and unsupported formats explicit (10.3185ms)
✔ PDF preparation fails closed for mixed empty pages and source-document bounds (1.9869ms)
✔ document tool schema admits absent or exact PDF/DOCX host bindings only (1.9604ms)
✔ document tool interpreter paths are fully qualified for the host platform (0.3714ms)
✔ document tool schema rejects accessors without running caller code and source preparation fails before grant work (0.5444ms)
✔ preparation, graph, sync and original-read binding entrypoints reject malformed document tools early (41.9621ms)
✔ a preparation run records its preparer, code, rules, grant and exact result (46.1835ms)
✔ an untouched preparation passes every check and the report pins exactly that run (33.128ms)
✔ tampered document text fails identity while the run record stays as written (28.9345ms)
✔ a rewritten document that also restates its digests still fails the run binding (30.8572ms)
✔ a wrong locator is caught even though it leaves the document identity intact (41.2473ms)
✔ preparing beyond the grant is caught as a missing condition (26.2808ms)
✔ a run outside the grant validity window is reported (31.0347ms)
✔ re-checking the same bytes adds a report and never rewrites the run or the result (40.0119ms)
✔ rewriting any part of a prepared document is caught, not only its text (80.4862ms)
✔ a fabricated component cannot widen the revisions a locator may cite (31.4756ms)
✔ a malformed document is reported as a finding rather than thrown (68.0199ms)
✔ a record cannot carry a true code digest beside a fabricated file list (31.6887ms)
✔ the validator pins its own bytes too (30.868ms)
✔ the record comes from preparing, so a caller cannot mint one for its own documents (84.1024ms)
✔ a locator stripped of its anchor is a finding, not a silent pass (40.0673ms)
✔ a kind that anchors by path is path-checked, and the rule that does not apply is a limit (35.5661ms)
✔ a record claiming that nothing prepared it is refused, not merely stale (30.3259ms)
✔ the preparer import walker stays in step with the release closure it mirrors (1.0907ms)
✔ the change set and the grant summary travel bound to the record (38.9044ms)
✔ without an admissible grant the locator check reports not run, not findings (30.0011ms)
✔ a version claim that contradicts this tree's proven bytes is caught (38.0223ms)
✔ a value the canonical hash refuses becomes a finding, never an exception (91.5599ms)
✔ no value a reader hands in can end the report instead of appearing in it (91.2888ms)
✔ a record that merely states a digest cannot borrow another run's report (43.3135ms)
✔ a report does not carry over to a different preparation or a changed grant (62.4114ms)
✔ skipping the live code comparison is reported as not run, not as a pass (24.4641ms)
✔ a record made by other preparer code is not reproducible here, and is not called a failure (30.5382ms)
✔ an edited run record fails its own integrity check (29.7746ms)
✔ the record refuses inputs it cannot describe (39.3339ms)
✔ a self-referential or stack-deep value is a difference, not a crash (43.1902ms)
✔ a check that meets a shape it cannot read says so and the others still report (84.3573ms)
✔ both lineage-less states answer the same gate (39.9381ms)
ℹ tests 47
ℹ suites 0
ℹ pass 47
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8268.1953
```

### pr18-proof-original.log

```text
> validate:context-original-read
> node --check guild_hall/context_engine/harness/estate_original_read.mjs && node --check guild_hall/context_engine/src/runtime/original_read.mjs && node --check guild_hall/context_engine/src/runtime/attachment_access.mjs && node --check guild_hall/context_engine/src/runtime/attachment_derivation.mjs && node --check guild_hall/context_engine/src/runtime/investigation_budget.mjs && node --check guild_hall/context_engine/src/runtime/voice_session_read.mjs && node --check guild_hall/context_engine/src/runtime/shared_terms.mjs && node --check guild_hall/context_engine/harness/estate_graph_query.mjs && node --test guild_hall/context_engine/tests/original_read.test.mjs guild_hall/context_engine/tests/voice_session_read.test.mjs guild_hall/context_engine/tests/original_read_locator_render.test.mjs

✔ a whole unit comes back, and a bound cuts it with the way to continue (804.543ms)
✔ an item the generation does not hold is not searched for (269.5308ms)
✔ a message with text still lists the attachments it carries (239.2573ms)
✔ no attachment is said as such, and a kind without pointers says the list is unavailable (415.7954ms)
✔ mail attachments: uncollected bytes, a path outside the declared roots, and a format nothing reads (556.6857ms)
✔ bytes that are not what the pointer claims are refused rather than parsed (222.7692ms)
✔ an attachment is named by index, by file id or by the front of its digest (422.9341ms)
✔ an original that moved since the generation is read and said to have moved (532.3005ms)
✔ an original custody no longer holds falls back without claiming a revision mismatch (298.9348ms)
✔ a format is taken from the pointer, then from the name, and otherwise refused (0.336ms)
✔ a tool configuration without absolute tool paths is refused (0.4714ms)
✔ six calls is the whole of one investigation, and a seventh is refused with what came before (88.8525ms)
✔ a message id narrows the key, and a development run is its own bucket (85.4516ms)
✔ without a session and without a declared run there is no bucket to charge (79.809ms)
✔ human original-read output shows the exact locator and stored-fallback reason (0.9652ms)
✔ 무선언 인박스는 읽히지 않는다 — access_denied이고 구간이 0개다 (27.8917ms)
✔ 선언이 다른 actor·purpose를 가리키면 선언이 있어도 거부한다 (100.3911ms)
✔ 선언의 창·글자 상한이 모양을 못 갖추면 거부한다 (47.3106ms)
✔ 기본은 독립 로컬 ASR run이고, 머리에 evidence_role과 claim_ceiling이 붙는다 (46.1387ms)
✔ --transcript provider는 공급자 전사를 고르고 speaker 라벨을 그대로 전한다 (33.3125ms)
✔ --from/--to는 겹치는 구간만 남기고 나머지는 세지도 않는다 (59.0484ms)
✔ 선언 상한보다 넓은 창은 잘리고, 답이 이어 읽을 자리를 말한다 (40.9268ms)
✔ 글자 상한에 걸리면 그 구간이 잘렸다고 말하고 그 자리에서 이어 읽게 한다 (58.2932ms)
✔ 로컬 run이 없으면 기본은 공급자로 내려오고 왜인지 말한다 — 그러나 local을 명시하면 거부한다 (36.8304ms)
✔ 끝나지 않은 로컬 run은 완료된 것처럼 읽지 않는다 (37.1693ms)
✔ run이 선언한 판본과 파일이 다르면 revision_mismatch로 두 값을 다 보여 준다 (41.2184ms)
✔ 없는 세션은 비슷한 것으로 바꿔 답하지 않고, 같은 id가 둘이면 고르지 않는다 (66.5204ms)
✔ 세션 id·창·전사 종류의 모양이 아니면 그 자리에서 멈춘다 (19.0715ms)
✔ 오디오도 공급자 요약도 어떤 출력에도 실리지 않는다 (39.2796ms)
✔ 선언 읽기는 그 자체로 답이다 — 무엇이 막았는지 한 줄로 돌려준다 (18.5772ms)
✔ 시계는 녹음의 선언된 offset을 쓴다 — +09:00이 아니면 KST라고 적지 않는다 (0.2351ms)
✔ --units는 라벨 run의 구간 초안으로 답하고, 그 초안이 초안임을 머리가 말한다 (44.3655ms)
✔ 창에 걸친 구간 초안은 잘라 보여 주지 않고 통째로 보여 준다 (46.5407ms)
✔ 다른 전사로 만든 라벨 run은 쓰지 않고 원 전사 구간으로 내려온다 (44.1489ms)
✔ 라벨 run이 없으면 원 전사 구간으로 답하고 왜인지 말한다 (38.5084ms)
✔ 같은 전사를 가리키는 라벨 run이 둘이면 고르지 않는다 (55.6912ms)
✔ 같은 용어가 두 과제 구간에 걸쳐 나오면 공통으로 표시되고, 도구는 과제를 고르지 않는다 (57.0996ms)
✔ 글자 상한에 잘린 구간도 용어 표시는 구간 전체에서 뽑는다 (41.7107ms)
✔ 등록부가 없거나 설정되지 않았으면 표시만 빠지고 답은 그대로 나온다 (64.0413ms)
✔ 공통 용어 표시는 원 전사 구간 모드에서도 붙는다 (35.9523ms)
✔ 구간 초안 조립은 라벨 run이 센 글자 수와 맞는지 스스로 밝힌다 (0.2593ms)
✔ 스킬 문서가 공통 용어 규칙과 대화 목록 형식을 실제로 담고 있다 (0.9888ms)
✔ 교정안은 제안으로 보이고, 전사 원문과 섞이지 않는다 (42.1121ms)
✔ 교정안이 없으면 없다고 말하고 나머지 답은 그대로 나온다 (75.7915ms)
✔ 대화 목록이 있으면 그것으로 답하고, 원 발화 자리는 비운다 (40.6178ms)
✔ 대화 목록의 오디오 참조는 어떤 출력에도 실리지 않는다 (62.8081ms)
✔ run이 여럿이면 선언된 시각으로 최신을 고르고, 무엇으로 골랐는지 말한다 (43.9485ms)
✔ 대화 목록이 없으면 "미생성"이라 말하고 원 발화로 답한다 (35.1839ms)
✔ 파생 루트가 아예 없거나 설정되지 않아도 읽기는 그대로 답한다 (45.2973ms)
✔ 대화 목록도 창으로 자른다 — 창 밖 구간은 나오지 않는다 (37.9961ms)
✔ 대화 목록을 달라고 하면 의미 단위 초안은 읽지 않는다 (39.0256ms)
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4208.5892
```
