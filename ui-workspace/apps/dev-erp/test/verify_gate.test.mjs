import assert from "node:assert/strict";
import test from "node:test";

import {
  checkNodeVersion, checkLocalhostDefault, checkZeroDependency, checkNoServerEgress,
  checkNoRawMailColumns, checkDataIgnored, checkChecklistDoc, checkDocsPresent,
  checkTests, checkPacket, checkInspectorEvidence, runGate, LEVEL_CONFIRMS
} from "../tools/verify_gate.mjs";

test("B1: 게이트 개별 체크 — 통과/고의 실패 양쪽", () => {
  // node version
  assert.equal(checkNodeVersion("22.5.0").ok, true);
  assert.equal(checkNodeVersion("23.1.0").ok, true);
  assert.equal(checkNodeVersion("20.11.0").ok, false);

  // localhost 기본
  assert.equal(checkLocalhostDefault(`const HOST = flag("host", "127.0.0.1");`).ok, true);
  assert.equal(checkLocalhostDefault(`const HOST = flag("host", "0.0.0.0");`).ok, false);

  // zero dependency
  assert.equal(checkZeroDependency({ a: `import x from "node:fs";\nimport y from "./b.mjs";` }).ok, true);
  assert.equal(checkZeroDependency({ a: `import express from "express";` }).ok, false);

  // 서버 외부 호출 금지
  assert.equal(checkNoServerEgress({ s: `const r = db.prepare("SELECT 1");` }).ok, true);
  assert.equal(checkNoServerEgress({ s: `await fetch("https://x.example");` }).ok, false);
  assert.equal(checkNoServerEgress({ s: `// fetch("https://comment-only")` }).ok, true, "주석은 허용");

  // 메일 원문 컬럼 금지
  const goodDdl = `CREATE TABLE IF NOT EXISTS core_mail (\n id TEXT, subject TEXT, pointer_ref TEXT\n);`;
  const badDdl = `CREATE TABLE IF NOT EXISTS core_mail (\n id TEXT, subject TEXT, body TEXT\n);`;
  assert.equal(checkNoRawMailColumns(goodDdl).ok, true);
  assert.equal(checkNoRawMailColumns(badDdl).ok, false);

  // data/ gitignore
  assert.equal(checkDataIgnored([], "node_modules/\ndata/\n").ok, true);
  assert.equal(checkDataIgnored(["data/dev-erp.db"], "data/").ok, false);
  assert.equal(checkDataIgnored([], "").ok, false);

  // checklist 문서
  assert.equal(checkChecklistDoc(`{"items":[{"id":"X","status":"done","title":"t"}]}`).ok, true);
  assert.equal(checkChecklistDoc(`{"items":[{"id":"X"}]}`).ok, false);
  assert.equal(checkChecklistDoc(`not-json`).ok, false);

  // 필수 문서
  assert.equal(checkDocsPresent(() => true).ok, true);
  assert.equal(checkDocsPresent((f) => f !== "docs/BROWSER_QA_PROCEDURE.md").ok, false);

  // 테스트 러너 파싱
  assert.equal(checkTests(() => "# pass 15\n# fail 0").ok, true);
  assert.equal(checkTests(() => "# pass 14\n# fail 1").ok, false);
  assert.equal(checkTests(() => "ℹ pass 15\nℹ fail 0").ok, true);
  assert.equal(checkTests(() => "ℹ pass 14\nℹ fail 1").ok, false);
  assert.equal(checkTests(() => { throw new Error("boom"); }).ok, false);

  // packet
  assert.equal(checkPacket(null, () => true, () => "").ok, false);
  assert.equal(checkPacket("p.yaml", () => false, () => "").ok, false);
  assert.equal(checkPacket("p.yaml", () => true, () => "task_id: x\nstatus: done\nowner_approval:\n approved: true").ok, true);

  // inspector 증거 (B6 연동) — accept 만 통과, revise/hold/reject 는 차단
  assert.equal(checkInspectorEvidence("p.yaml", () => "inspector_verdict: accept").ok, true);
  assert.equal(checkInspectorEvidence("p.yaml", () => "inspector_report: _workmeta/x.md").ok, true);
  assert.equal(checkInspectorEvidence("p.yaml", () => "task_id: x").ok, false);
  assert.equal(checkInspectorEvidence(null, () => null).ok, false);
  assert.equal(checkInspectorEvidence("p.yaml", () => "inspector_verdict: reject").ok, false);
  assert.equal(checkInspectorEvidence("p.yaml", () => "inspector_verdict: hold").ok, false);
  assert.equal(checkInspectorEvidence("p.yaml", () => "inspector_verdict: revise").ok, false);
});

test("B1: 통합 — 실제 저장소에서 Level 0 게이트 PASS (테스트 재귀 없이)", () => {
  const r = runGate({ level: 0, skipTests: true });
  const failed = r.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.note}`);
  assert.deepEqual(failed, [], `실패 체크: ${failed.join(" | ")}`);
  assert.equal(r.ok, true);
  assert.ok(LEVEL_CONFIRMS[0].length >= 3);
});

test("B1: Level>=1 은 packet 없으면 FAIL", () => {
  const r = runGate({ level: 1, skipTests: true, packet: null });
  assert.equal(r.ok, false);
  assert.equal(r.checks.find((c) => c.id === "packet").ok, false);
});
