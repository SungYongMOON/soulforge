import test from "node:test";
import assert from "node:assert/strict";

import {
  fallbackThreadKey,
  legacyFallbackThreadKey,
  mailHistoryKeyFromMailRef,
  mailHistoryKeyFromTaskKey,
  normalizeThreadSubject,
  threadKeyAliasesForMail,
} from "../tools/mail_thread_key.mjs";

test("mail_thread_key: reply-prefix separator is required so Korean words are not truncated", () => {
  assert.equal(normalizeThreadSubject("전달사항 검토 요청"), "전달사항 검토 요청");
  assert.equal(normalizeThreadSubject("전달: 사항 검토 요청"), "사항 검토 요청");
  assert.equal(normalizeThreadSubject("RE: FW] 견적 검토"), "견적 검토");
});

test("mail_thread_key: fallback aliases preserve old prefix behavior for migration", () => {
  const mail = { subject: "전달사항 검토 요청", from: "sender@example.test" };
  const current = fallbackThreadKey(mail);
  const legacy = legacyFallbackThreadKey(mail);
  assert.notEqual(current, legacy);
  assert.deepEqual(threadKeyAliasesForMail(mail), [current, legacy]);
});

test("mail_thread_key: mailtask parser uses known mail keys before treating trailing number as split suffix", () => {
  const known = new Set(["outlook:sent:123", "outlook:sent"]);
  assert.equal(mailHistoryKeyFromTaskKey("mailtask:outlook:sent:123", known), "outlook:sent:123");
  assert.equal(mailHistoryKeyFromTaskKey("mailtask:outlook:sent:123:2", known), "outlook:sent:123");
  assert.equal(mailHistoryKeyFromTaskKey("mailtask:plain:2"), "plain");
  assert.equal(mailHistoryKeyFromMailRef("mailcsv:outlook:sent:123"), "outlook:sent:123");
});
