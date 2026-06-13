import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { archiveClosedCandidates, discoverCandidatePackets } from "./candidate_queue.mjs";

async function makeFixture() {
  const localRoot = mkdtempSync(path.join(tmpdir(), "cqarch-"));
  const queue = path.join(localRoot, "_workmeta", "system", "dev_worker_candidate_queue");
  await fs.mkdir(queue, { recursive: true });
  await fs.writeFile(path.join(queue, "done_a.yaml"),
    "task_id: done_a\nstatus: completed\nsummary: done\nowner_approval:\n  required: true\n  approved: true\n  approved_at: \"2025-11-02\"\n");
  await fs.writeFile(path.join(queue, "open_b.yaml"),
    "task_id: open_b\nstatus: proposed\nsummary: live\nowner_approval:\n  required: true\n  approved: false\n");
  await fs.writeFile(path.join(queue, "promoted_c.yaml"),
    "task_id: promoted_c\nstatus: promoted\npromoted_at: \"2026-01-05T00:00:00Z\"\nsummary: moved on\n");
  return { localRoot, queue };
}

test("B4: archive dry-run — 닫힌 것만 계획, 이동 없음", async () => {
  const { localRoot, queue } = await makeFixture();
  const r = await archiveClosedCandidates({ localRoot });
  assert.equal(r.mode, "dry-run");
  assert.equal(r.planned_count, 2);
  assert.equal(r.moved_count, 0);
  assert.deepEqual(r.moves.map((m) => m.task_id).sort(), ["done_a", "promoted_c"]);
  // 연도: approved_at 2025 / promoted_at 2026
  assert.ok(r.moves.find((m) => m.task_id === "done_a").to.includes("archive/2025/"));
  assert.ok(r.moves.find((m) => m.task_id === "promoted_c").to.includes("archive/2026/"));
  // dry-run 은 파일 그대로
  await fs.access(path.join(queue, "done_a.yaml"));
});

test("B4: archive apply — 이동만(내용 불변), 큐에서 차폐, 인덱스 기록, 재실행 멱등", async () => {
  const { localRoot, queue } = await makeFixture();
  const before = await fs.readFile(path.join(queue, "done_a.yaml"), "utf8");
  const r = await archiveClosedCandidates({ localRoot, apply: true });
  assert.equal(r.moved_count, 2);
  // 내용 바이트 동일 (이동만, 재작성 금지 — acceptance)
  const after = await fs.readFile(path.join(queue, "archive", "2025", "done_a.yaml"), "utf8");
  assert.equal(after, before);
  // 살아있는 후보만 발견됨 (archive 하위 디렉토리 자연 차폐)
  const found = await discoverCandidatePackets({ localRoot });
  assert.equal(found.length, 1);
  assert.ok(found[0].packet_path.endsWith("open_b.yaml"));
  // 인덱스 기록
  const idx = await fs.readFile(path.join(queue, "archive", "ARCHIVE_INDEX.md"), "utf8");
  assert.ok(idx.includes("done_a.yaml") && idx.includes("promoted_c.yaml"));
  // 재실행: 이동할 것 없음 (멱등)
  const again = await archiveClosedCandidates({ localRoot, apply: true });
  assert.equal(again.planned_count, 0);
});

test("B4: 동일 이름 충돌 시 skip (덮어쓰기 금지)", async () => {
  const { localRoot, queue } = await makeFixture();
  await fs.mkdir(path.join(queue, "archive", "2025"), { recursive: true });
  await fs.writeFile(path.join(queue, "archive", "2025", "done_a.yaml"), "task_id: collision\n");
  const r = await archiveClosedCandidates({ localRoot, apply: true });
  assert.ok(r.skipped.some((s) => s.reason === "target_exists"));
  // 원본 보존
  await fs.access(path.join(queue, "done_a.yaml"));
});
