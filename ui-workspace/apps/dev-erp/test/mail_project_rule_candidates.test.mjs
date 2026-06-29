import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openStore } from "../src/store.mjs";
import {
  buildMailProjectRuleCandidateReport,
  extractSafeSubjectTokens,
  writeMailProjectRuleCandidateReport,
} from "../tools/mail_project_rule_candidates.mjs";

const BODY_SENTINEL = "PRIVATE_BODY_SENTINEL_DO_NOT_EMIT";
const PRIVATE_SUBJECT_WORDS = "customer private vessel detail";

function makeRuntime() {
  const root = mkdtempSync(join(tmpdir(), "sf-mail-route-candidates-"));
  const workmetaRoot = join(root, "_workmeta");
  mkdirSync(workmetaRoot, { recursive: true });
  return {
    root,
    workmetaRoot,
    dbPath: join(root, "dev-erp.db"),
    bindingPath: join(workmetaRoot, "system", "bindings", "mail_project_router.yaml"),
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function seedMail(store) {
  store.upsertProject({ id: "P00-000_INBOX", title: "Inbox", class: "inbox", data_label: "real" });
  store.upsertProject({ id: "P26-014", title: "KVDS", class: "active", data_label: "real" });
  store.upsertMail({
    id: "mail-001",
    project_id: "P26-014",
    at: "2026-06-26T09:00:00+09:00",
    direction: "in",
    subject: `[KVDS] CSCI SDD ${PRIVATE_SUBJECT_WORDS}`,
    counterpart: "Customer Person <person@customer.example>",
    mailbox: "team/inbox",
    body_text: `${BODY_SENTINEL}\nDo not write this to rule candidates.`,
    data_label: "real",
  });
  store.appendEvent({
    actor_ref: "owner",
    actor_kind: "human",
    kind: "mail_assign",
    item_ref: "mail-001",
    from: "P00-000_INBOX",
    to: "P26-014",
    project_ref: "P26-014",
    used_refs: ["mail"],
    data_label: "real",
  });
}

test("safe subject token extraction keeps project-like tokens only", () => {
  const tokens = [...extractSafeSubjectTokens("[KVDS] CSCI SDD customer private vessel detail").keys()];
  assert.deepEqual(tokens, ["KVDS", "CSCI", "SDD"]);
});

test("exports metadata-only rule candidates from ERP manual mail assignment", () => {
  const rt = makeRuntime();
  try {
    mkdirSync(join(rt.workmetaRoot, "system", "bindings"), { recursive: true });
    const store = openStore(rt.dbPath);
    seedMail(store);
    store.db.close();
    mkdirSync(join(rt.workmetaRoot, "system", "bindings"), { recursive: true });
    const binding = "rules:\n  - rule_id: P26_EXISTING\n    project_code: P26-014\n";
    writeFileSync(rt.bindingPath, binding, "utf8");

    const report = buildMailProjectRuleCandidateReport({
      dbPath: rt.dbPath,
      routerBindingPath: rt.bindingPath,
      projectId: "P26-014",
      generatedAt: "2026-06-29T00:00:00.000Z",
    });
    assert.equal(report.summary.scanned_mail_count, 1);
    assert.equal(report.summary.candidate_count, 1);
    const candidate = report.candidates[0];
    assert.equal(candidate.project_code, "P26-014");
    assert.equal(candidate.evidence.manual_assignment_count, 1);
    assert.equal(candidate.active_router_project_rule_count, 1);
    assert.deepEqual(candidate.proposed_route.match_policy.subject_any, ["CSCI", "KVDS", "SDD"]);
    assert.deepEqual(candidate.proposed_route.match_policy.from_domains, ["customer.example"]);

    const out = writeMailProjectRuleCandidateReport(report, {
      workmetaRoot: rt.workmetaRoot,
      runId: "unit_run",
    });
    const json = readFileSync(out.json_path, "utf8");
    const yaml = readFileSync(out.yaml_path, "utf8");
    const csv = readFileSync(out.csv_path, "utf8");
    const all = `${json}\n${yaml}\n${csv}`;
    assert.match(all, /KVDS/);
    assert.match(all, /customer\.example/);
    assert.doesNotMatch(all, new RegExp(BODY_SENTINEL));
    assert.doesNotMatch(all, new RegExp(PRIVATE_SUBJECT_WORDS));
  } finally {
    rt.cleanup();
  }
});

test("refuses to write candidate reports outside private workmeta", () => {
  const rt = makeRuntime();
  try {
    const report = {
      schema_version: "soulforge.mail_project_rule_candidates.v0",
      generated_at: "2026-06-29T00:00:00.000Z",
      candidates: [],
    };
    assert.throws(
      () => writeMailProjectRuleCandidateReport(report, {
        workmetaRoot: rt.workmetaRoot,
        outDir: join(rt.root, "public-docs"),
        runId: "bad",
      }),
      /unsafe_output_dir_not_under_workmeta/
    );
  } finally {
    rt.cleanup();
  }
});
