import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  applyKnowledgeGroundingToCandidate,
  knowledgeContextLines,
  listProjectKnowledgeRefs,
} from "../tools/knowledge_grounding.mjs";

function tempRoot(t) {
  const root = join(tmpdir(), `sf-kg-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeIndex(root, id, {
  status = "ready",
  sourceCardRef = `_workspaces/knowledge/projects/P26-014/source_cards/${id}.source_card.json`,
  approvalStatus = "owner_requested_p26_014_project_scoped_rag_20260617",
  title = "P26-014 KVDS Minehunting Sonar Requirements Specification",
  domains = ["project:P26-014", "requirements"],
} = {}) {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source_text_index.json"), JSON.stringify({
    schema_version: "soulforge.source_text_index.v0",
    kind: "source_text_index",
    index_id: id,
    status,
    source_refs: {
      source_card_ref: sourceCardRef,
      derived_text_ref: `_workspaces/knowledge/rag/derived_text/${id}/${id}.txt`,
      docling_json_ref: `_workspaces/knowledge/rag/docling/${id}.json`,
    },
    source_card_summary: {
      title,
      domains,
      approval_status: approvalStatus,
      claim_ceiling: "source_supported_project_private",
    },
    chunks: [{ chunk_ref: "must_not_be_opened" }],
  }, null, 2));
  writeFileSync(join(dir, "derived_text.txt"), "RAW_SHOULD_NOT_BE_READ");
}

test("refs: fixture 인덱스 중 해당 프로젝트+ready+eligible 만 반환", (t) => {
  const root = tempRoot(t);
  writeIndex(root, "p26_req");
  writeIndex(root, "p26_draft", { approvalStatus: "candidate_source_text_ready_owner_review_required" });
  writeIndex(root, "p26_building", { status: "building" });
  writeIndex(root, "p24_req", {
    sourceCardRef: "_workspaces/knowledge/projects/P24-049/source_cards/p24.source_card.json",
    approvalStatus: "owner_requested_p24_049_project_scoped_rag_20260617",
    title: "P24-049 other project",
    domains: ["project:P24-049"],
  });

  const refs = listProjectKnowledgeRefs("P26-014", { knowledgeRoot: root });
  assert.deepEqual(refs.map((r) => r.index_id), ["p26_req"]);
  assert.equal(refs[0].scope, "project");
  assert.equal(refs[0].source_card_ref, "_workspaces/knowledge/projects/P26-014/source_cards/p26_req.source_card.json");
});

test("refs: includeCommon 은 공용 승인 refs 만 opt-in 으로 포함", (t) => {
  const root = tempRoot(t);
  writeIndex(root, "p26_req");
  writeIndex(root, "common_aqap", {
    sourceCardRef: "_workspaces/knowledge/source_cards/aqap.source_card.json",
    approvalStatus: "owner_approved_local_source_text_ready",
    title: "AQAP quality standard",
    domains: ["quality_management_defense"],
  });

  assert.deepEqual(listProjectKnowledgeRefs("P26-014", { knowledgeRoot: root }).map((r) => r.index_id), ["p26_req"]);
  assert.deepEqual(listProjectKnowledgeRefs("P26-014", { knowledgeRoot: root, includeCommon: true }).map((r) => r.index_id), ["p26_req", "common_aqap"]);
});

test("refs: 경로 미존재는 빈 배열", (t) => {
  const root = tempRoot(t);
  assert.deepEqual(listProjectKnowledgeRefs("P26-014", { knowledgeRoot: join(root, "missing") }), []);
});

test("grounding: 제목 토큰 매칭 시 next_action 제안과 used_refs 를 붙인다", () => {
  const refs = [{
    index_id: "p26_req",
    title: "P26-014 KVDS Minehunting Sonar Requirements Specification",
    domains: ["requirements", "project:P26-014"],
    source_card_summary: "requirements and specification metadata",
  }];
  const grounded = applyKnowledgeGroundingToCandidate(
    { title: "요구사양서 확인", work_type: "review", completion_criteria: "검토 완료" },
    "요구사양 반영 검토 요청",
    refs,
  );
  assert.equal(grounded.matched_refs.length, 1);
  assert.equal(grounded.candidate.next_action, "근거 확인: p26_req");
  assert.deepEqual(grounded.candidate.used_refs, ["knowledge:p26_req"]);
});

test("boundary: source_text_index.json 외 파일을 열지 않음", (t) => {
  const root = tempRoot(t);
  writeIndex(root, "p26_req");
  const reads = [];
  const io = {
    existsSync,
    readdirSync,
    readFileSync: (file, enc) => {
      reads.push(String(file));
      return readFileSync(file, enc);
    },
  };
  const refs = listProjectKnowledgeRefs("P26-014", { knowledgeRoot: root, io });
  assert.equal(refs.length, 1);
  assert.ok(reads.length > 0);
  assert.ok(reads.every((file) => file.replaceAll("\\", "/").endsWith("/source_text_index.json")));
});

test("context lines: 승인된 지식 라인을 생성한다", () => {
  const lines = knowledgeContextLines([{ title: "P26 요구사양", domains: ["requirements"], index_id: "p26_req" }]);
  assert.deepEqual(lines, ["승인된 지식: P26 요구사양 (requirements)"]);
});
