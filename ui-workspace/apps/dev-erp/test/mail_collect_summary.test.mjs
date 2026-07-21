import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import { parseTeamFetchSummary, mailboxRegisterToken, buildAutoIntakeArgs, teamMailboxRegisterPath, legacyMailWriterPolicy } from "../src/mail_collect.mjs";

test("mail collect: legacy writer 는 exact opt-in 없이는 fail-closed 이다", () => {
  for (const value of [undefined, "", "0", "true", "yes", "on", " 1 "]) {
    const env = value === undefined ? {} : { DEV_ERP_LEGACY_MAIL_WRITER_ENABLED: value };
    assert.deepEqual(legacyMailWriterPolicy(env), { enabled: false, reason: "legacy_mail_writer_disabled" });
  }
  assert.deepEqual(
    legacyMailWriterPolicy({ DEV_ERP_LEGACY_MAIL_WRITER_ENABLED: "1" }),
    { enabled: true, reason: "explicitly_enabled" },
  );
});

// 생산자 스키마 fixture: guild_hall/gateway/mail_fetch/collector/team_mailboxes.py 의
// email.fetch.team_mailbox_run.v1 — results[]={mailbox: operator_summary, result: runner 결과}.
// 이 계약 테스트가 없어서 파서가 3주간 조용히 fetched:0 을 보고했다(표시 버그). 회귀 가드.
const TEAM_RUN_V1 = JSON.stringify({
  schema_version: "email.fetch.team_mailbox_run.v1",
  partial: false,
  mailboxes_run: 2,
  total_events: 4,
  total_new_events: 3,
  results: [
    {
      mailbox: { id: "acc_145a8edf2e", provider: "hiworks", enabled: true },
      result: { sources: [{ id: "s1", fetched: 3, new_events: 2 }, { id: "s2", fetched: 1, new_events: 1 }], partial: false, errors: [] },
    },
    {
      mailbox: { id: "acc_9805043792", provider: "gmail", enabled: true },
      result: { sources: [{ id: "s1", fetched: 0, new_events: 0 }], partial: true, errors: ["pop3_timeout"] },
    },
  ],
});

test("mail collect: team_mailbox_run.v1 요약을 result.sources 에서 합산한다", () => {
  const s = parseTeamFetchSummary(TEAM_RUN_V1);
  assert.equal(s.mailboxes_run, 2);
  assert.equal(s.fetched, 4);
  assert.equal(s.new_events, 3);
  assert.equal(s.mailboxes_error, 1);
  assert.equal(s.per_mailbox.length, 2);
  assert.equal(s.per_mailbox[0].id, "acc_145a8edf2e");
  assert.equal(s.per_mailbox[0].fetched, 4);
  assert.equal(s.per_mailbox[0].partial, false);
  assert.equal(s.per_mailbox[1].partial, true);
  assert.equal(s.per_mailbox[1].errors, 1);
});

test("mail collect: 구형 flat 형태(results[].fetched)도 계속 수용한다", () => {
  const s = parseTeamFetchSummary(JSON.stringify({ results: [{ id: "m1", fetched: 2, new_events: 1 }] }));
  assert.equal(s.fetched, 2);
  assert.equal(s.new_events, 1);
  assert.equal(s.mailboxes_error, 0);
});

test("mail collect: 에러 JSON 과 파싱 불가 출력은 error 로 보고한다", () => {
  assert.equal(parseTeamFetchSummary(JSON.stringify({ error: { code: "creds_missing" } })).error, "creds_missing");
  assert.equal(parseTeamFetchSummary("not json at all").error, "parse_error");
});

test("mail collect: 등록부 token 은 export_team_mailboxes 의 safeToken 규칙과 일치한다", () => {
  // 계정 id 가 ASCII 면 그대로, 한글 등 비ASCII 는 email 로 폴백.
  assert.equal(mailboxRegisterToken("acc_145a8edf2e", "a@b.c"), "acc_145a8edf2e");
  assert.equal(mailboxRegisterToken("문성용", "seabot@example.test"), "seabot_example.test");
  assert.equal(mailboxRegisterToken("", ""), "mailbox");
});

test("mail collect: auto-intake spawn args carry backend workmeta and projects", () => {
  const args = buildAutoIntakeArgs({
    dbRel: "data/dev-erp.db",
    workmetaRoot: "/backend/_workmeta",
    projects: ["P26-014", "P00-000_INBOX"],
  });
  assert.deepEqual(args.slice(0, 5), ["tools/auto_intake_cycle.mjs", "--db", "data/dev-erp.db", "--apply", "--json"]);
  assert.equal(args[args.indexOf("--workmeta") + 1], "/backend/_workmeta");
  assert.deepEqual(args.filter((token) => token === "--project"), ["--project", "--project"]);
  assert.deepEqual(args.slice(args.indexOf("--project")), ["--project", "P26-014", "--project", "P00-000_INBOX"]);
});

test("mail collect: stable private config root selects the team register outside a release checkout", () => {
  const repoRoot = resolve("repo-root");
  const privateRoot = resolve("stable-private-config");
  assert.equal(
    teamMailboxRegisterPath({ repoRoot, env: { EMAIL_FETCH_PRIVATE_CONFIG_ROOT: privateRoot } }),
    resolve(privateRoot, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json"),
  );
  const explicit = resolve("explicit", "team_mailboxes.json");
  assert.equal(
    teamMailboxRegisterPath({ repoRoot, env: { EMAIL_FETCH_TEAM_REGISTER: explicit, EMAIL_FETCH_PRIVATE_CONFIG_ROOT: privateRoot } }),
    explicit,
  );
  assert.equal(teamMailboxRegisterPath({ repoRoot, env: {} }), "");
});
