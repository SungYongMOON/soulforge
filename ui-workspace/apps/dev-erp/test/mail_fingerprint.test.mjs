import test from "node:test";
import assert from "node:assert/strict";

import {
  groupMailCopies,
  mailGroupKey,
  normalizeSubject,
  pickRepresentative,
  timeBucketUtc,
} from "../tools/mail_fingerprint.mjs";

test("mail fingerprint: subject normalization removes reply/forward prefixes and preserves tags", () => {
  assert.equal(normalizeSubject("RE: FW: [P99] 견적"), "[p99] 견적");
  assert.equal(normalizeSubject("전달:   [P99] 견적"), "[p99] 견적");
  assert.equal(normalizeSubject("  답장: 회신: [P99]   견적  "), "[p99] 견적");
});

test("mail fingerprint: prefix token 뒤 구분자 없는 단어는 깎지 않는다 (오병합 방지)", () => {
  // 구분자 0개 허용 시 "전달사항"→"사항" 으로 서로 다른 메일이 같은 fingerprint 로 병합되어
  // 한쪽이 no_action 영수증으로 비가역 소멸하는 결함(E8-D1)의 회귀 가드.
  assert.equal(normalizeSubject("전달사항 안내"), "전달사항 안내");
  assert.equal(normalizeSubject("회신기한 안내"), "회신기한 안내");
  assert.equal(normalizeSubject("Review 설계 검토"), "review 설계 검토");
  // 구분자가 있으면 종전대로 제거된다.
  assert.equal(normalizeSubject("전달: 사항 안내"), "사항 안내");
  assert.notEqual(normalizeSubject("전달사항 안내"), normalizeSubject("사항 안내"));
});

test("mail fingerprint: Message-ID exact match is the primary grouping key", () => {
  const rows = [
    { history_key: "M-1", subject: "A", from: "a@example.test", received_at: "2026-07-01T09:00:00+09:00", mailbox: "ops@example.test", provider_message_id: "<same@example.test>", recipient_role: "cc" },
    { history_key: "M-2", subject: "changed subject", from: "other@example.test", received_at: "2026-07-01T12:00:00+09:00", mailbox: "sales@example.test", provider_message_id: "<same@example.test>", recipient_role: "to" },
  ];
  const grouped = groupMailCopies(rows);
  assert.equal(grouped.duplicateGroups.length, 1);
  assert.equal(grouped.duplicateGroups[0].group_key, mailGroupKey(rows[0]));
  assert.equal(grouped.duplicateGroups[0].representative.history_key, "M-2");
});

test("mail fingerprint: blank Message-ID legacy rows use conservative fingerprint fallback", () => {
  const sameA = { history_key: "M-A", subject: "RE: [P99] 견적 요청", from: "Vendor <vendor@example.test>", received_at: "2026-07-01T09:00:00+09:00", thread: "T-1" };
  const sameB = { history_key: "M-B", subject: "[P99] 견적 요청", from: "vendor <vendor@example.test>", received_at: "2026-07-01T09:05:00+09:00", thread: "T-1" };
  const senderChanged = { ...sameB, history_key: "M-C", from: "owner@example.test" };
  const dateChanged = { ...sameB, history_key: "M-D", received_at: "2026-07-02T09:05:00+09:00" };
  const threadChanged = { ...sameB, history_key: "M-E", thread: "T-2" };

  assert.equal(mailGroupKey(sameA), mailGroupKey(sameB));
  assert.notEqual(mailGroupKey(sameA), mailGroupKey(senderChanged));
  assert.notEqual(mailGroupKey(sameA), mailGroupKey(dateChanged));
  assert.notEqual(mailGroupKey(sameA), mailGroupKey(threadChanged));
  assert.equal(timeBucketUtc("2026-07-01T09:00:00+09:00"), timeBucketUtc("2026-07-01T00:00:00Z"));
});

test("mail fingerprint: outbound rows are not consumed as duplicate no-action copies", () => {
  const rows = [
    { history_key: "M-in", subject: "A", from: "a@example.test", received_at: "2026-07-01T09:00:00Z", provider_message_id: "<same@example.test>", event_type: "mail_received" },
    { history_key: "M-out", subject: "A", from: "a@example.test", received_at: "2026-07-01T09:00:00Z", provider_message_id: "<same@example.test>", event_type: "mail_sent_outlook_reconcile" },
  ];
  const grouped = groupMailCopies(rows);
  assert.equal(grouped.duplicateGroups.length, 0);
  assert.deepEqual(grouped.singles.map((row) => row.history_key).sort(), ["M-in", "M-out"]);
});

test("mail fingerprint: representative choice is deterministic and prefers TO over CC", () => {
  const ccEarly = { history_key: "M-CC", received_at: "2026-07-01T09:00:00Z", mailbox: "a@example.test", recipient_role: "cc" };
  const toLater = { history_key: "M-TO", received_at: "2026-07-01T09:05:00Z", mailbox: "z@example.test", recipient_role: "to" };
  const ccTie = { history_key: "M-CC2", received_at: "2026-07-01T09:00:00Z", mailbox: "b@example.test", recipient_role: "cc" };

  assert.equal(pickRepresentative([ccEarly, toLater, ccTie]).history_key, "M-TO");
  assert.equal(pickRepresentative([ccTie, ccEarly]).history_key, "M-CC");
  assert.equal(pickRepresentative([ccEarly, ccTie]).history_key, "M-CC");
});
