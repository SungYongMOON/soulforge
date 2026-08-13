// Corpus-wide lexical retrieval seam: one global scoring space over every supplied source.
//
// Every fixture here is synthetic. No private source, no real handbook text, and no
// benchmark question is used.

import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_TEXT_CORPUS_SEARCH_CONTRACT,
  searchSourceTextCorpus,
} from "./source_text_index.mjs";

const chunk = (chunkId, page, text) => ({ chunk_id: chunkId, page_numbers: [page], text });

const SOURCES = Object.freeze([
  {
    source_id: "syn_alpha",
    chunks: [
      chunk("alpha_p1_c1", 1, "Each verification activity declares measurable pass and fail criteria before execution."),
      chunk("alpha_p2_c1", 2, "A verification criteria record names the responsible role and the applicable revision."),
      chunk("alpha_p3_c1", 3, "Configuration baselines are stored with a unique identifier."),
    ],
  },
  {
    source_id: "syn_bravo",
    chunks: [
      chunk("bravo_p1_c1", 1, "Interface agreements record the controlling threshold and its owning record."),
      chunk("bravo_p2_c1", 2, "Verification evidence is traced to the requirement it verifies."),
    ],
  },
  {
    source_id: "syn_charlie",
    chunks: [
      chunk("charlie_p1_c1", 1, "Logistics planning products are reviewed at each milestone."),
      chunk("charlie_p2_c1", 2, "Training material is delivered with the fielded configuration."),
    ],
  },
  {
    source_id: "syn_delta",
    chunks: [
      chunk("delta_p1_c1", 1, "Manufacturing readiness is assessed against declared production criteria."),
      chunk("delta_p2_c1", 2, "Supplier data rights are recorded in the acquisition file."),
    ],
  },
]);

const QUERY = "verification criteria 요구사항";

const rotate = (items, by) => items.map((_, index) => items[(index + by) % items.length]);

const permuted = (sources, by) => rotate(sources, by).map((source) => ({
  source_id: source.source_id,
  chunks: rotate(source.chunks, by),
}));

test("one global lexical space scores every chunk of every supplied source", () => {
  const result = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: QUERY,
    advisoryTerms: [],
    maxEvidence: 4,
    maxPerSource: 2,
  });
  assert.equal(result.receipt.contract, SOURCE_TEXT_CORPUS_SEARCH_CONTRACT);
  assert.equal(result.receipt.searched_source_count, 4);
  assert.equal(result.receipt.searched_chunk_count, 9);
  assert.equal(result.receipt.embeddings_used, false);
  assert.equal(result.receipt.web_search_used, false);
  assert.equal(result.receipt.per_source.length, 4);
  assert.deepEqual(
    result.receipt.per_source.map((entry) => entry.source_id),
    ["syn_alpha", "syn_bravo", "syn_charlie", "syn_delta"],
  );
  assert.ok(result.hits.length > 0 && result.hits.length <= 4);
  // Only a subset is cited, but the receipt still proves all four were searched.
  assert.ok(new Set(result.hits.map((hit) => hit.source_id)).size < 4);
  assert.equal(result.receipt.selected_count, result.hits.length);
  for (const hit of result.hits) {
    assert.ok(hit.score > 0);
    assert.deepEqual(hit.page_numbers, hit.page_numbers.map((page) => page));
  }
});

test("scores do not depend on how the same chunks are partitioned across sources", () => {
  const split = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: QUERY,
    advisoryTerms: [],
    maxEvidence: 9,
    maxPerSource: 9,
  });
  const merged = searchSourceTextCorpus({
    sources: [{
      source_id: "syn_merged",
      chunks: SOURCES.flatMap((source) => source.chunks),
    }],
    queryText: QUERY,
    advisoryTerms: [],
    maxEvidence: 9,
    maxPerSource: 9,
  });
  const scoresOf = (result) => Object.fromEntries(result.hits.map((hit) => [hit.chunk_id, hit.score]));
  assert.deepEqual(scoresOf(split), scoresOf(merged));
});

test("ranking is stable under source and chunk permutation", () => {
  const baseline = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: QUERY,
    advisoryTerms: [],
    maxEvidence: 5,
    maxPerSource: 3,
  });
  for (const by of [1, 2, 3]) {
    const shuffled = searchSourceTextCorpus({
      sources: permuted(SOURCES, by),
      queryText: QUERY,
      advisoryTerms: [],
      maxEvidence: 5,
      maxPerSource: 3,
    });
    assert.deepEqual(shuffled.hits, baseline.hits);
    assert.deepEqual(shuffled.receipt, baseline.receipt);
  }
});

test("identical chunk text resolves by source id then chunk id", () => {
  const twins = [
    { source_id: "syn_bravo", chunks: [chunk("b_dup", 1, "verification criteria are declared")] },
    { source_id: "syn_alpha", chunks: [chunk("a_dup", 1, "verification criteria are declared")] },
  ];
  const result = searchSourceTextCorpus({
    sources: twins,
    queryText: "verification criteria",
    advisoryTerms: [],
    maxEvidence: 2,
    maxPerSource: 2,
  });
  assert.equal(result.hits.length, 2);
  assert.equal(result.hits[0].score, result.hits[1].score);
  assert.deepEqual(result.hits.map((hit) => hit.source_id), ["syn_alpha", "syn_bravo"]);
});

test("maxEvidence and maxPerSource bound the selection without hiding the search", () => {
  const result = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: "verification criteria",
    advisoryTerms: [],
    maxEvidence: 2,
    maxPerSource: 1,
  });
  assert.equal(result.hits.length, 2);
  assert.equal(new Set(result.hits.map((hit) => hit.source_id)).size, 2);
  assert.equal(result.receipt.searched_chunk_count, 9);
  assert.ok(result.receipt.hit_count >= result.receipt.selected_count);
});

test("a query with no lexical overlap returns an empty selection, not a fabricated hit", () => {
  const result = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: "긴급 예산 배정 절차",
    advisoryTerms: [],
    maxEvidence: 4,
    maxPerSource: 2,
  });
  assert.deepEqual(result.hits, []);
  assert.equal(result.receipt.selected_count, 0);
  assert.equal(result.receipt.searched_source_count, 4);
});

test("advisory terms add signal without changing the exact query that was scored", () => {
  const withoutExpansion = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: "verification criteria",
    advisoryTerms: [],
    maxEvidence: 4,
    maxPerSource: 2,
  });
  const withExpansion = searchSourceTextCorpus({
    sources: SOURCES,
    queryText: "verification criteria",
    advisoryTerms: ["traceability", "requirement"],
    maxEvidence: 4,
    maxPerSource: 2,
  });
  assert.equal(withoutExpansion.receipt.advisory_token_count, 0);
  assert.equal(withoutExpansion.receipt.advisory_expansion_applied, false);
  assert.ok(withExpansion.receipt.advisory_token_count > 0);
  assert.equal(withExpansion.receipt.advisory_expansion_applied, true);
  assert.equal(withExpansion.receipt.query_token_count, withoutExpansion.receipt.query_token_count);
  assert.equal(withExpansion.receipt.exact_query_preserved, true);
});

test("one token scores lower as an advisory hint than as an exact query token", () => {
  const budget = { sources: SOURCES, advisoryTerms: [], maxEvidence: 9, maxPerSource: 9 };
  const asQuery = searchSourceTextCorpus({ ...budget, queryText: "logistics milestone" });
  const asAdvisory = searchSourceTextCorpus({
    ...budget, queryText: "예산 결재 순서", advisoryTerms: ["logistics", "milestone"],
  });
  const charlie = (result) => result.hits.find((hit) => hit.chunk_id === "charlie_p1_c1");
  assert.equal(charlie(asQuery).matched_query_token_count, 2);
  assert.equal(charlie(asAdvisory).matched_query_token_count, 0);
  assert.equal(charlie(asAdvisory).matched_advisory_token_count, 2);
  assert.ok(
    charlie(asAdvisory).score < charlie(asQuery).score,
    "an advisory hint is a weaker vote than the question the caller actually asked",
  );
});

// The expansion exists because the questions are Korean and the sources are English, so it must
// be able to reach a chunk the exact question never touches. That is a real influence on what an
// answer gets grounded on, so the receipt has to count it rather than imply it cannot happen.
test("an advisory-only chunk can be selected and displace a weaker exact match, and is counted", () => {
  const sources = [
    {
      source_id: "syn_alpha",
      chunks: [
        chunk("alpha_p1_c1", 1, "Each verification activity declares measurable pass and fail criteria before execution."),
        chunk("alpha_p2_c1", 2, "A verification criteria record names the responsible role and the applicable revision."),
        chunk("alpha_p3_c1", 3, "Criteria are reviewed once per programme cycle across every subordinate engineering discipline and reporting layer of the enterprise."),
      ],
    },
    {
      source_id: "syn_charlie",
      chunks: [chunk("charlie_p1_c1", 1, "Logistics planning products are reviewed at each milestone.")],
    },
  ];
  const budget = { sources, queryText: "verification criteria", maxEvidence: 3, maxPerSource: 3 };
  const withoutExpansion = searchSourceTextCorpus({ ...budget, advisoryTerms: [] });
  const withExpansion = searchSourceTextCorpus({
    ...budget, advisoryTerms: ["logistics", "milestone"],
  });

  assert.deepEqual(
    withoutExpansion.hits.map((hit) => hit.chunk_id),
    ["alpha_p2_c1", "alpha_p1_c1", "alpha_p3_c1"],
  );
  assert.equal(withoutExpansion.receipt.selected_advisory_only_count, 0);

  assert.deepEqual(
    withExpansion.hits.map((hit) => hit.chunk_id),
    ["alpha_p2_c1", "alpha_p1_c1", "charlie_p1_c1"],
    "an advisory-only chunk took the slot the third exact match held",
  );
  assert.equal(withExpansion.receipt.selected_advisory_only_count, 1);
  assert.equal(
    withExpansion.hits.at(-1).matched_query_token_count, 0,
    "the receipt count matches the capsule that arrived through the shadow channel",
  );
});

test("malformed retrieval requests are refused instead of silently normalised", () => {
  const base = {
    sources: SOURCES, queryText: QUERY, advisoryTerms: [], maxEvidence: 4, maxPerSource: 2,
  };
  const cases = [
    { ...base, sources: [] },
    { ...base, sources: [{ source_id: "dup", chunks: [chunk("c", 1, "verification")] },
      { source_id: "dup", chunks: [chunk("c2", 1, "verification")] }] },
    { ...base, sources: [{ source_id: "syn", chunks: [chunk("c", 1, "a"), chunk("c", 2, "b")] }] },
    { ...base, sources: [{ source_id: "syn", chunks: [{ chunk_id: "c", page_numbers: [0], text: "a" }] }] },
    { ...base, maxEvidence: 0 },
    { ...base, maxPerSource: 0 },
    { ...base, queryText: 42 },
    { ...base, advisoryTerms: "traceability" },
    { ...base, extraField: true },
  ];
  for (const request of cases) {
    assert.throws(() => searchSourceTextCorpus(request), /corpus_search/u);
  }
});

// Every bound in this seam is enforced by reading a field and then reading it again to build the
// searched request. An accessor can answer those two reads differently, so a chunk could pass the
// length bound as twelve characters and then be scored as an unbounded one. A bound that only
// describes the value the validator happened to see is not a bound at all.
test("an accessor cannot show the validator one request and the scorer another", () => {
  const base = {
    sources: SOURCES, queryText: QUERY, advisoryTerms: [], maxEvidence: 4, maxPerSource: 2,
  };
  const swappingText = () => {
    let reads = 0;
    return {
      chunk_id: "alpha_p1_c1",
      page_numbers: [1],
      get text() {
        reads += 1;
        // Bounded and safe while the validator looks; oversize once it has passed.
        return reads <= 3 ? "verification" : "x".repeat(20001);
      },
    };
  };
  const cases = [
    // The concrete escape: the searched text is not the text that satisfied the length bound.
    { ...base, sources: [{ source_id: "syn_alpha", chunks: [swappingText()] }] },
    // The same hole at every other declared position, including a stable accessor: a field that
    // is not an own data property cannot be bounded, whatever it happens to return.
    {
      ...base,
      sources: [{
        source_id: "syn_alpha",
        chunks: [{ chunk_id: "alpha_p1_c1", page_numbers: [1], get text() { return "verification"; } }],
      }],
    },
    {
      ...base,
      sources: [{ get source_id() { return "syn_alpha"; }, chunks: [chunk("alpha_p1_c1", 1, "verification")] }],
    },
    {
      ...base,
      sources: [{
        source_id: "syn_alpha",
        chunks: [{ get chunk_id() { return "alpha_p1_c1"; }, page_numbers: [1], text: "verification" }],
      }],
    },
    {
      ...base,
      sources: [{
        source_id: "syn_alpha",
        chunks: [{ chunk_id: "alpha_p1_c1", get page_numbers() { return [1]; }, text: "verification" }],
      }],
    },
    { ...base, get queryText() { return QUERY; } },
    { ...base, get maxEvidence() { return 4; } },
  ];
  for (const request of cases) {
    assert.throws(() => searchSourceTextCorpus(request), /corpus_search/u);
  }
});

// ------------------------------------------------------------- strict request snapshot
//
// Checking the declared field positions is not enough. The request is a tree, and every node of
// it is read at least twice: once to satisfy a bound and once to build the searched corpus. A
// node that answers those two reads differently makes every bound describe a request that was
// never actually searched. So the whole tree is snapshotted as plain own data *before* the first
// semantic read, and only the snapshot is scored.

const BASE_REQUEST = Object.freeze({
  sources: SOURCES, queryText: QUERY, advisoryTerms: [], maxEvidence: 4, maxPerSource: 2,
});

/** One array whose element 0 is an accessor that answers a later read differently. */
const shiftingElement = (first, later) => {
  const holder = new Array(1);
  let reads = 0;
  Object.defineProperty(holder, "0", {
    get() { reads += 1; return reads <= 1 ? first : later; },
    enumerable: true,
    configurable: true,
  });
  return holder;
};

// The concrete escape: `page_numbers` is bounds-checked and then copied. An accessor at the index
// passes the bound as page 1 and is copied as page 9999, so a citation would name a page no
// validated chunk ever declared.
test("a shifting page accessor cannot cite a page the bound check never saw", () => {
  const request = {
    ...BASE_REQUEST,
    sources: [{
      source_id: "syn_alpha",
      chunks: [{
        chunk_id: "alpha_p1_c1",
        page_numbers: shiftingElement(1, 9999),
        text: "verification criteria are declared",
      }],
    }],
    queryText: "verification criteria",
  };
  assert.throws(() => searchSourceTextCorpus(request), /corpus_search/u);
});

test("a shifting element accessor is refused at every array position of the request", () => {
  const oversize = { source_id: "syn_alpha", chunks: [chunk("c1", 1, "x".repeat(20001))] };
  const cases = [
    { ...BASE_REQUEST, sources: shiftingElement(SOURCES[0], oversize) },
    {
      ...BASE_REQUEST,
      sources: [{
        source_id: "syn_alpha",
        chunks: shiftingElement(
          chunk("alpha_p1_c1", 1, "verification criteria"),
          chunk("alpha_p1_c1", 1, "x".repeat(20001)),
        ),
      }],
    },
    { ...BASE_REQUEST, advisoryTerms: shiftingElement("traceability", "x".repeat(200)) },
  ];
  for (const request of cases) {
    assert.throws(() => searchSourceTextCorpus(request), /corpus_search/u);
  }
});

test("custom prototypes, sparse holes, and named array properties are refused", () => {
  class TaggedList extends Array {}
  const tagged = TaggedList.from(SOURCES);
  const sparseChunks = [...SOURCES[0].chunks];
  delete sparseChunks[1];
  const namedSources = [...SOURCES];
  namedSources.note = "an extra property no bound describes";
  const namedPages = [1];
  namedPages.note = "x";
  const cases = [
    { ...BASE_REQUEST, sources: tagged },
    { ...BASE_REQUEST, sources: [{ source_id: "syn_alpha", chunks: sparseChunks }] },
    { ...BASE_REQUEST, sources: namedSources },
    {
      ...BASE_REQUEST,
      sources: [{
        source_id: "syn_alpha",
        chunks: [{ chunk_id: "c1", page_numbers: namedPages, text: "verification criteria" }],
      }],
    },
    {
      ...BASE_REQUEST,
      sources: [{
        source_id: "syn_alpha",
        chunks: [Object.assign(Object.create({ inherited: true }), chunk("c1", 1, "verification"))],
      }],
    },
    {
      ...BASE_REQUEST,
      sources: [{
        source_id: "syn_alpha",
        chunks: [{ chunk_id: "c1", page_numbers: [new Date(0)], text: "verification" }],
      }],
    },
  ];
  for (const request of cases) {
    assert.throws(() => searchSourceTextCorpus(request), /corpus_search/u);
  }
});

test("an aliased or cyclic request tree is refused rather than searched twice", () => {
  const shared = chunk("shared_c1", 1, "verification criteria are declared");
  const aliased = {
    ...BASE_REQUEST,
    sources: [
      { source_id: "syn_alpha", chunks: [shared] },
      { source_id: "syn_bravo", chunks: [shared] },
    ],
  };
  assert.throws(() => searchSourceTextCorpus(aliased), /corpus_search/u);

  const cyclicSource = { source_id: "syn_alpha", chunks: [] };
  cyclicSource.chunks.push(cyclicSource);
  assert.throws(
    () => searchSourceTextCorpus({ ...BASE_REQUEST, sources: [cyclicSource] }),
    /corpus_search/u,
  );

  const sharedPages = [1];
  const sharedPageTree = {
    ...BASE_REQUEST,
    sources: [{
      source_id: "syn_alpha",
      chunks: [
        { chunk_id: "c1", page_numbers: sharedPages, text: "verification criteria" },
        { chunk_id: "c2", page_numbers: sharedPages, text: "verification evidence" },
      ],
    }],
  };
  assert.throws(() => searchSourceTextCorpus(sharedPageTree), /corpus_search/u);
});

test("the searched corpus is a snapshot, not the caller's own objects", () => {
  const pages = [1];
  const source = {
    source_id: "syn_alpha",
    chunks: [{ chunk_id: "alpha_p1_c1", page_numbers: pages, text: "verification criteria" }],
  };
  const result = searchSourceTextCorpus({
    ...BASE_REQUEST, sources: [source], queryText: "verification criteria",
  });
  assert.equal(result.hits.length, 1);
  assert.notEqual(result.hits[0].page_numbers, pages);
  result.hits[0].page_numbers.push(9999);
  assert.deepEqual(pages, [1], "the seam never hands back a caller-owned array");
});

test("no source id and no selected hit is reported twice", () => {
  const result = searchSourceTextCorpus({
    sources: SOURCES, queryText: QUERY, advisoryTerms: ["traceability"],
    maxEvidence: 9, maxPerSource: 9,
  });
  const sourceIds = result.receipt.per_source.map((entry) => entry.source_id);
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  const hitKeys = result.hits.map((hit) => `${hit.source_id}|${hit.chunk_id}`);
  assert.equal(new Set(hitKeys).size, hitKeys.length);
  assert.equal(result.receipt.selected_count, result.hits.length);
});
