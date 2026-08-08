// antigravity-quota.test.mjs — 로컬 RPC 쿼터 응답 정규화의 파싱·실패 폐쇄·행 평탄화 검증.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ANTIGRAVITY_QUOTA_SCHEMA_VERSION,
  antigravityQuotaRows,
  buildAntigravityQuotaSnapshot,
  parseAntigravityQuotaResponse,
} from "./antigravity-quota.mjs";

const SAMPLE = {
  response: {
    groups: [
      {
        displayName: "Gemini Models",
        description: "Models within this group: Gemini Flash, Gemini Pro",
        buckets: [
          { bucketId: "gemini-weekly", window: "weekly", remainingFraction: 0.9821608, resetTime: "2026-08-14T09:05:32Z" },
          { bucketId: "gemini-5h", window: "5h", remainingFraction: 1, resetTime: "2026-08-08T10:32:30Z" },
        ],
      },
      {
        displayName: "Claude and GPT models",
        buckets: [
          { bucketId: "3p-weekly", window: "weekly", remainingFraction: 0.9695249, resetTime: "2026-08-14T09:05:32Z" },
          { bucketId: "3p-bad", window: "monthly", remainingFraction: 0.5 },
          { bucketId: "3p-nan", window: "5h", remainingFraction: 2 },
        ],
      },
    ],
  },
};

test("parseAntigravityQuotaResponse keeps known windows and valid fractions", () => {
  const groups = parseAntigravityQuotaResponse(SAMPLE);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    label: "Gemini Models",
    buckets: [
      { window: "weekly", remaining_fraction: 0.982, resets_at: "2026-08-14T09:05:32.000Z" },
      { window: "5h", remaining_fraction: 1, resets_at: "2026-08-08T10:32:30.000Z" },
    ],
  });
  // monthly(미지 창)과 fraction>1 은 제외되어 3p 그룹엔 weekly 하나만 남는다.
  assert.equal(groups[1].buckets.length, 1);
  assert.equal(groups[1].buckets[0].window, "weekly");
});

test("parseAntigravityQuotaResponse fails closed on malformed shapes", () => {
  assert.equal(parseAntigravityQuotaResponse(null), null);
  assert.equal(parseAntigravityQuotaResponse({}), null);
  assert.equal(parseAntigravityQuotaResponse({ response: { groups: [] } }), null);
  assert.equal(parseAntigravityQuotaResponse({ response: { groups: [{ displayName: "x", buckets: [] }] } }), null);
});

test("buildAntigravityQuotaSnapshot and row flattening produce gauge-ready rows", () => {
  const groups = parseAntigravityQuotaResponse(SAMPLE);
  const snapshot = buildAntigravityQuotaSnapshot({ groups, observedAtMs: Date.parse("2026-08-08T05:00:00Z") });
  assert.equal(snapshot.schema_version, ANTIGRAVITY_QUOTA_SCHEMA_VERSION);
  assert.equal(snapshot.observed_at, "2026-08-08T05:00:00.000Z");
  assert.equal(buildAntigravityQuotaSnapshot({ groups: [] }), null);

  const rows = antigravityQuotaRows(snapshot);
  assert.deepEqual(rows.map((row) => [row.provider, row.window, row.remaining_percent]), [
    ["AG·Gemini", "주간 창", 98],
    ["AG·Gemini", "5시간 창", 100],
    ["AG·Claude+GPT", "주간 창", 97],
  ]);
  assert.deepEqual(antigravityQuotaRows(null), []);
});
