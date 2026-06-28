import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";

import {
  loadMailBodyExcerptIndex,
  mailBodyExcerptFromRecord,
  readMailBodyPreview,
} from "./mail_body_excerpt.mjs";

test("mailBodyExcerptFromRecord prefers text, falls back to stripped html, preserves line breaks and caps", () => {
  assert.equal(
    mailBodyExcerptFromRecord({ body_text: "  안녕하세요\n\n  업무  요청 입니다.  " }),
    "안녕하세요\n\n업무 요청 입니다.",
  );
  assert.equal(
    mailBodyExcerptFromRecord({ body_html: "<style>.x{}</style><p>HTML&nbsp;본문 &amp; 검토</p>" }),
    "HTML 본문 & 검토",
  );
  assert.equal(mailBodyExcerptFromRecord({ body_text: "  ", body_html: "<p>fallback</p>" }), "fallback");
  assert.equal(mailBodyExcerptFromRecord({}), null);
  assert.equal(mailBodyExcerptFromRecord({ body_text: "abcdef" }, { maxChars: 3 }), "abc");
});

test("loadMailBodyExcerptIndex maps event_id to excerpt and rejects paths outside mailbox state", async () => {
  const repoRoot = await createRepoRoot();
  const eventRel = "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl";
  await writeJsonl(path.join(repoRoot, eventRel), [
    { event_id: "evt_a", body_text: "본문 A 입니다." },
    { event_id: "evt_b", body_html: "<p>본문 B</p>" },
    { event_id: "" },
  ]);

  const index = await loadMailBodyExcerptIndex({ repoRoot, eventFile: eventRel });
  assert.equal(index.get("evt_a"), "본문 A 입니다.");
  assert.equal(index.get("evt_b"), "본문 B");
  assert.equal(index.has(""), false);

  const missing = await loadMailBodyExcerptIndex({
    repoRoot,
    eventFile: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2099-01.jsonl",
  });
  assert.equal(missing.size, 0);

  await assert.rejects(
    loadMailBodyExcerptIndex({ repoRoot, eventFile: "_workmeta/P00-000_INBOX/reports/메일_이력/메일_이력.csv" }),
    /source event file must stay under guild_hall\/state\/gateway\/mailbox/,
  );
});

test("readMailBodyPreview resolves excerpt through candidate pointer, caches, and stays null-safe", async () => {
  const repoRoot = await createRepoRoot();
  const candidateRel = "guild_hall/state/gateway/mail_candidate/queue/pending/mail_candidate_hiworks_evt_candidate_001.json";
  const eventRel = "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl";
  await writeJson(path.join(repoRoot, candidateRel), {
    schema_version: "mail_candidate.queue_item.v1",
    candidate_id: "mail_candidate_hiworks_evt_candidate_001",
    source_event: {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      workspace: "company",
      event_file: eventRel,
      received_at: "2026-03-19T00:15:00+00:00",
    },
  });
  await writeJsonl(path.join(repoRoot, eventRel), [
    {
      event_id: "hiworks_evt_candidate_001",
      body_text: "검토 부탁드립니다. 첨부 확인 후 회신 주세요.",
      body_html: "<html><body>무시되는 html</body></html>",
    },
  ]);

  const cache = new Map();
  const preview = await readMailBodyPreview({ repoRoot, candidateRef: candidateRel, cache });
  assert.equal(preview, "검토 부탁드립니다. 첨부 확인 후 회신 주세요.");
  assert.equal(cache.size, 1); // event_file 인덱스가 캐시됨

  // 같은 후보 재요청 — 캐시된 인덱스 재사용(추가 파일 읽기 없음)
  const again = await readMailBodyPreview({ repoRoot, candidateRef: candidateRel, cache });
  assert.equal(again, "검토 부탁드립니다. 첨부 확인 후 회신 주세요.");
  assert.equal(cache.size, 1);

  // 후보 부재·빈 포인터·큐 밖 경로 → throw 없이 null(상세 패널 '본문 미수집')
  assert.equal(await readMailBodyPreview({ repoRoot, candidateRef: "" }), null);
  assert.equal(
    await readMailBodyPreview({ repoRoot, candidateRef: "guild_hall/state/gateway/mail_candidate/queue/pending/missing.json" }),
    null,
  );
  assert.equal(await readMailBodyPreview({ repoRoot, candidateRef: "_workmeta/escape.json" }), null);
});

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-mail-body-excerpt-"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}
