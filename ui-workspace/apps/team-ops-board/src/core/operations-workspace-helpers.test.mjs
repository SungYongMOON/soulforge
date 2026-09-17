import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeSlackMentions,
  cleanHumanText,
  extractDatesFromEvidence,
  calculateTruthfulRankReason,
  extractMatchSnippet,
  splitTextForHighlight,
  dedupeEvidence,
  filterAndSortEvidence,
  filterLoadedTreeEntries,
  paginateSiblings,filterLoadedTreeLevel
} from "./operations-workspace-helpers.mjs";

test("mention: Slack <@U...> sanitization with display name vs anonymous Slack 사용자", () => {
  const withName = "작업자 <@U0123ABCD|홍길동> 확인 부탁드립니다.";
  const sanitized1 = sanitizeSlackMentions(withName);
  assert.equal(sanitized1.text, "작업자 홍길동 확인 부탁드립니다.");
  assert.equal(sanitized1.rawMentions.length, 1);
  assert.equal(sanitized1.rawMentions[0].id, "U0123ABCD");
  assert.equal(sanitized1.rawMentions[0].name, "홍길동");

  const withoutName = "요청자 <@U99887766> 확인 대기 중";
  const sanitized2 = sanitizeSlackMentions(withoutName);
  assert.equal(sanitized2.text, "요청자 Slack 사용자 확인 대기 중");
  assert.equal(sanitized2.rawMentions.length, 1);
  assert.equal(sanitized2.rawMentions[0].id, "U99887766");
  assert.equal(sanitized2.rawMentions[0].name, null);

  const clean = cleanHumanText("<@U1111> 및 <@U2222|김철수>");
  assert.equal(clean, "Slack 사용자 및 김철수");
});

test("dates: extractDatesFromEvidence extracts valid dates and never invents missing dates", () => {
  // Case 1: occurred_at valid
  const hit1 = { occurred_at: "2026-08-15T10:30:00.000Z" };
  assert.equal(extractDatesFromEvidence(hit1), "2026-08-15T10:30:00.000Z");

  // Case 2: Slack message_ts in locator
  const hit2 = { locator: { message_ts: "1724300000.000100" } };
  const d2 = extractDatesFromEvidence(hit2);
  assert.ok(d2 && d2.startsWith("2024-08-22"));

  // Case 3: Date in locator path
  const hit3 = { locator: { path: ["recordings", "2026-09-01", "session.json"] } };
  const d3 = extractDatesFromEvidence(hit3);
  assert.ok(d3 && d3.startsWith("2026-09-01"));

  // Case 4: No date present -> returns null, never fakes
  const hit4 = { locator: "paragraph:7" };
  assert.equal(extractDatesFromEvidence(hit4), null);
  assert.equal(extractDatesFromEvidence({}), null);
});

test("rank: truthful rank reason with test term 하이드로폰", () => {
  const query = "하이드로폰";

  // Exact in title
  const hitTitle = { title: "동해 수중 하이드로폰 시험 결과", text: "음향 센서 신호 감지", rank: 1 };
  assert.equal(calculateTruthfulRankReason(hitTitle, query), "제목에 검색어 정확 일치");

  // Exact in text
  const hitText = { title: "음향 수신 센서 보고서", text: "수중 하이드로폰 배열을 점검하였습니다.", rank: 2 };
  assert.equal(calculateTruthfulRankReason(hitText, query), "본문에 검색어 정확 일치");

  // Exact in both
  const hitBoth = { title: "하이드로폰 점검", text: "하이드로폰 작동 상태", rank: 1 };
  assert.equal(calculateTruthfulRankReason(hitBoth, query), "제목 및 본문 검색어 정확 일치");

  // Multi-token match
  const multiQuery = "수중 하이드로폰";
  const hitTokens = { title: "센서 목록", text: "수중 환경에서의 하이드로폰 수신율", rank: 3 };
  assert.equal(calculateTruthfulRankReason(hitTokens, multiQuery), "본문에 모든 단어 포함");

  // Lexical fallback without fake scores
  const hitFallback = { title: "관련 없는 제목", text: "기타 내용", rank: 5 };
  assert.equal(calculateTruthfulRankReason(hitFallback, query), "검색엔진 반환 순위 #5");
});

test("snippet: extractMatchSnippet centers around test term 하이드로폰", () => {
  const longPrefix = "이 문서는 동해안 해역에서의 수중 음향 계측과 센서 신호 품질을 평가하기 위한 보고서입니다. 본 실험에서는 ";
  const target = "하이드로폰 어레이";
  const longSuffix = " 센서를 수심 50m에 설치하여 주파수 응답 특성을 측정하였습니다. 추가 보정이 요구됩니다.";
  const fullText = longPrefix + target + longSuffix;

  const snippet = extractMatchSnippet(fullText, "하이드로폰", 60);
  assert.ok(snippet.includes("하이드로폰"));
  assert.ok(snippet.startsWith("…") || snippet.endsWith("…"));
});

test("highlight: splitTextForHighlight safely generates React-ready parts without HTML injection", () => {
  const text = "신형 하이드로폰 수신 감도 측정";
  const parts = splitTextForHighlight(text, "하이드로폰");
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], { text: "신형 ", isMatch: false });
  assert.deepEqual(parts[1], { text: "하이드로폰", isMatch: true });
  assert.deepEqual(parts[2], { text: " 수신 감도 측정", isMatch: false });
});

test('highlight treats regular-expression symbols as literal search text',()=>{
  assert.deepEqual(splitTextForHighlight('센서 [A]+(B) 확인','[A]+(B)').filter(p=>p.isMatch).map(p=>p.text),['[A]+(B)']);
});

test("dedupe: dedupeEvidence groups identical document/content and preserves all underlying refs", () => {
  const rawHits = [
    { rank: 1, source_kind: "document", item_id: "doc-1", unit_id: "u-1", text: "하이드로폰 점검표", score: 0.95, locator: "p:1" },
    { rank: 3, source_kind: "document", item_id: "doc-1", unit_id: "u-2", text: "하이드로폰 점검표", score: 0.82, locator: "p:2" },
    { rank: 2, source_kind: "slack", item_id: "msg-1", unit_id: "u-3", text: "채널 공지", score: 0.88, locator: "ts:1" }
  ];

  const deduped = dedupeEvidence(rawHits);
  assert.equal(deduped.length, 2);

  const doc1 = deduped.find(h => h.item_id === "doc-1");
  assert.ok(doc1);
  assert.equal(doc1.rank, 1); // Preserves best rank
  assert.equal(doc1.duplicateRefs.length, 1);
  assert.equal(doc1.duplicateRefs[0].unit_id, "u-2");
  assert.equal(doc1.duplicateRefs[0].rank, 3);
  assert.equal(doc1.duplicateRefs[0].locator, "p:2");
});

test('same document fragments and identical original bodies merge without merging anonymized different people',()=>{
  const grouped=dedupeEvidence([
    {source_kind:'mail',item_id:'one',unit_id:'a',text:'하이드로폰 설치'},
    {source_kind:'mail',item_id:'one',unit_id:'b',text:'추가 점검 내용'},
    {source_kind:'slack',item_id:'two',unit_id:'c',text:'하이드로폰 설치'},
    {source_kind:'slack',item_id:'three',unit_id:'d',text:'<@U111> 확인'},
    {source_kind:'slack',item_id:'four',unit_id:'e',text:'<@U222> 확인'},
  ]);
  assert.equal(grouped.length,3);assert.equal(grouped[0].evidenceRefs.length,3);
  assert.ok(grouped[0].text.includes('추가 점검'));assert.equal(filterAndSortEvidence(grouped,{sourceFilter:'slack'}).length,3);
});

test('folder filtering preserves loaded ancestors and snippets omit duplicated title text',()=>{
  const cache={'':{entries:[{name:'recordings',browsable:true}]},recordings:{entries:[{name:'2026-09-17',browsable:true},{name:'2026-09-16',browsable:true}]}};
  assert.equal(filterLoadedTreeLevel(cache,'',{nameQuery:'2026-09-17'})[0].name,'recordings');
  assert.equal(filterLoadedTreeLevel(cache,'recordings',{nameQuery:'2026-09-17'}).length,1);
  assert.equal(extractMatchSnippet('하이드로폰 점검: 센서 확인','하이드로폰',140,'하이드로폰 점검'),'센서 확인');
});

test("filter: filterAndSortEvidence supports source, date, in-result query, and sorting", () => {
  const hits = [
    { rank: 2, source_kind: "slack", title: "하이드로폰 설치", text: "완료", occurred_at: "2026-08-10T00:00:00Z" },
    { rank: 1, source_kind: "document", title: "센서 매뉴얼", text: "하이드로폰 사양", occurred_at: "2026-08-15T00:00:00Z" },
    { rank: 3, source_kind: "slack", title: "주간 회의", text: "진행상황", occurred_at: null }
  ];

  // Filter by source
  const slackOnly = filterAndSortEvidence(hits, { sourceFilter: "slack" });
  assert.equal(slackOnly.length, 2);

  // Filter by date range
  const dateFiltered = filterAndSortEvidence(hits, { startDate: "2026-08-12", endDate: "2026-08-20" });
  assert.equal(dateFiltered.length, 1);
  assert.equal(dateFiltered[0].title, "센서 매뉴얼");

  // In-result query
  const queryFiltered = filterAndSortEvidence(hits, { inResultQuery: "사양" });
  assert.equal(queryFiltered.length, 1);
  assert.equal(queryFiltered[0].title, "센서 매뉴얼");

  // Sort by title
  const sortedTitle = filterAndSortEvidence(hits, { sortBy: "title" });
  assert.equal(sortedTitle[0].title, "센서 매뉴얼");
});

test("tree: filterLoadedTreeEntries filters by name and ISO date range", () => {
  const entries = [
    { name: "2026-08-10_recording.mp3", modified_at: "2026-08-10T12:00:00Z" },
    { name: "2026-08-15_hydrophone.wav", modified_at: "2026-08-15T14:00:00Z" },
    { name: "notes.txt", modified_at: "2026-09-01T09:00:00Z" }
  ];

  // Name query
  const nameFiltered = filterLoadedTreeEntries(entries, { nameQuery: "hydrophone" });
  assert.equal(nameFiltered.length, 1);
  assert.equal(nameFiltered[0].name, "2026-08-15_hydrophone.wav");

  // Date range
  const dateFiltered = filterLoadedTreeEntries(entries, { startDate: "2026-08-12", endDate: "2026-08-20" });
  assert.equal(dateFiltered.length, 1);
  assert.equal(dateFiltered[0].name, "2026-08-15_hydrophone.wav");
});

test("tree: paginateSiblings bounds pagination for >50 sibling entries", () => {
  const items = Array.from({ length: 65 }, (_, i) => ({ name: `file_${i + 1}.dat` }));
  const page1 = paginateSiblings(items, 1, 50);
  assert.equal(page1.visible.length, 50);
  assert.equal(page1.total, 65);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.remaining, 15);

  const page2 = paginateSiblings(items, 2, 50);
  assert.equal(page2.visible.length, 65);
  assert.equal(page2.hasMore, false);
  assert.equal(page2.remaining, 0);
});
