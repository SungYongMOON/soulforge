#!/usr/bin/env node
// B3 드리프트 가드: AGENT_BOOT_DIGEST_V0.md 가 원본 4+1 문서와 조용히
// 어긋나지 못하게 한다. 원본 해시가 manifest 와 다르면 실패 → 다이제스트
// 재검토 후 `--update` 로 manifest 갱신. 표준 Node 만 (도구 비종속).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DIGEST_PATH = "docs/architecture/foundation/AGENT_BOOT_DIGEST_V0.md";
export const MANIFEST_PATH = "docs/architecture/foundation/AGENT_BOOT_DIGEST_V0.sources.json";
export const SOURCES = [
  "AGENTS.md",
  "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md",
  "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
  "docs/architecture/foundation/PROJECT_MAP_V0.md"
];
export const MAX_LINES = 100;

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function snapshot(root = REPO, sources = SOURCES) {
  const out = {};
  for (const rel of sources) {
    const p = join(root, rel);
    if (!existsSync(p)) { out[rel] = { missing: true }; continue; }
    const t = readFileSync(p, "utf-8");
    out[rel] = { sha256: sha256(t), lines: t.split("\n").length };
  }
  return out;
}

// 반환: { ok, problems[] } — 순수 비교 (테스트 가능)
export function verify({ manifest, current, digestText }) {
  const problems = [];
  if (!manifest) problems.push("manifest 없음 — --update 로 생성");
  const digestLines = digestText.split("\n").filter((l) => l.trim() !== "").length;
  if (digestLines > MAX_LINES) problems.push(`다이제스트 ${digestLines}줄 > 상한 ${MAX_LINES} (비어있지 않은 줄 기준)`);
  if (manifest) {
    for (const [rel, cur] of Object.entries(current)) {
      const rec = manifest.sources?.[rel];
      if (cur.missing) { problems.push(`원본 누락: ${rel}`); continue; }
      if (!rec) { problems.push(`manifest 미등재: ${rel}`); continue; }
      if (rec.sha256 !== cur.sha256) problems.push(`드리프트: ${rel} 변경됨 — 다이제스트 재검토 필요`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export function runGuard({ root = REPO, update = false } = {}) {
  const current = snapshot(root);
  const digestText = existsSync(join(root, DIGEST_PATH)) ? readFileSync(join(root, DIGEST_PATH), "utf-8") : "";
  if (!digestText) return { ok: false, problems: [`다이제스트 없음: ${DIGEST_PATH}`] };
  if (update) {
    const manifest = { schema: "boot_digest_guard.v0", updated_at: new Date().toISOString(), digest_sha256: sha256(digestText), sources: current };
    writeFileSync(join(root, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + "\n");
    return { ok: true, problems: [], updated: true };
  }
  const manifestRaw = existsSync(join(root, MANIFEST_PATH)) ? readFileSync(join(root, MANIFEST_PATH), "utf-8") : null;
  const manifest = manifestRaw ? JSON.parse(manifestRaw) : null;
  const result = verify({ manifest, current, digestText });
  // 다이제스트 자체가 manifest 이후 수정됐으면 manifest 도 갱신 필요
  if (manifest && manifest.digest_sha256 !== sha256(digestText)) {
    result.problems.push("다이제스트 수정됨 — --update 로 manifest 재서명 필요");
    result.ok = false;
  }
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const r = runGuard({ update: process.argv.includes("--update") });
  if (r.updated) { console.log("[boot-digest] manifest 갱신 완료"); process.exit(0); }
  console.log(`[boot-digest] ${r.ok ? "OK — 원본과 동기 상태" : "드리프트/문제 발견"}`);
  for (const p of r.problems) console.log(` ✗ ${p}`);
  process.exit(r.ok ? 0 : 1);
}
