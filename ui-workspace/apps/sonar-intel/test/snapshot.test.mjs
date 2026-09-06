import assert from "node:assert/strict";
import test from "node:test";

import { buildCsvSnapshot } from "../export/snapshot.mjs";

function baseRecord(overrides = {}) {
  return {
    id: "id",
    type: "news",
    source: "google_news",
    title: "t",
    url: null,
    publishedAt: null,
    fetchedAt: null,
    keywordsMatched: [],
    erpMapping: null,
    ...overrides,
  };
}

function dataRows(csv) {
  // buildCsvSnapshot always ends with a trailing "\n", so the last split
  // element is "" — drop the header (index 0) and that trailing empty entry.
  return csv.split("\n").slice(1, -1);
}

test("buildCsvSnapshot quotes plain cells only when they need it", () => {
  const csv = buildCsvSnapshot([baseRecord()]);
  const [row] = dataRows(csv);
  assert.equal(row, "id,news,google_news,t,,,,,");
});

test("buildCsvSnapshot quotes a cell containing a bare CR, not just LF/CRLF", () => {
  const csv = buildCsvSnapshot([baseRecord({ title: "line1\rline2" })]);
  const [row] = dataRows(csv);
  assert.ok(row.includes('"line1\rline2"'), "a bare \\r must trigger quoting like , and \" already do");
});

test("buildCsvSnapshot prefixes a leading ' on cells starting with = + - @ to block formula/CSV injection", () => {
  const csv = buildCsvSnapshot([
    baseRecord({ id: "=SUM(A1:A9)" }),
    baseRecord({ id: "id2", title: "+1234567" }),
    baseRecord({ id: "id3", title: "-2 minus" }),
    baseRecord({ id: "id4", title: "@mention" }),
  ]);
  const rows = dataRows(csv);
  assert.ok(rows[0].startsWith("'=SUM(A1:A9),"), "leading = must be neutralized");
  assert.ok(rows[1].includes(",'+1234567,"), "leading + must be neutralized");
  assert.ok(rows[2].includes(",'-2 minus,"), "leading - must be neutralized");
  assert.ok(rows[3].includes(",'@mention,"), "leading @ must be neutralized");
});

test("buildCsvSnapshot does not mistake a mid-string = + - @ for the injection prefix", () => {
  const csv = buildCsvSnapshot([baseRecord({ title: "a=b+c-d@e" })]);
  const [row] = dataRows(csv);
  assert.ok(row.includes(",a=b+c-d@e,"), "only a leading guard character is neutralized, not any occurrence");
});
