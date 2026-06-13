// dev-erp 인증 (G1) 단위 테스트 — node:test, 외부 의존성 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../src/store.mjs";
import { Auth, passwordPolicy, genTempPassword, parseCookies } from "../src/auth.mjs";

function freshAuth() {
  const store = openStore(":memory:");
  return new Auth(store.db);
}

test("계정 생성 시 임시비번 발급 + must_change_pw=1, 원문 미저장", () => {
  const auth = freshAuth();
  const r = auth.createAccount({ id: "kim", role: "member", name: "김팀원" });
  assert.equal(r.ok, true);
  assert.equal(r.role, "member");
  assert.equal(typeof r.tempPassword, "string");
  assert.ok(r.tempPassword.length >= 10);
  const acct = auth.getAccount("kim");
  assert.equal(acct.must_change_pw, 1);
  assert.notEqual(acct.pw_hash, r.tempPassword); // 원문이 아니라 해시
  assert.ok(acct.pw_salt.length > 0);
});

test("중복 아이디 / 잘못된 역할 / 아이디 형식 거부", () => {
  const auth = freshAuth();
  assert.equal(auth.createAccount({ id: "kim" }).ok, true);
  assert.equal(auth.createAccount({ id: "kim" }).error, "id_exists");
  assert.equal(auth.createAccount({ id: "lee", role: "superuser" }).error, "bad_role");
  assert.equal(auth.createAccount({ id: "a b" }).error, "id_format");
  assert.equal(auth.createAccount({ id: "" }).error, "id_required");
});

test("비밀번호 검증: 틀리면 null, 맞으면 행 반환", () => {
  const auth = freshAuth();
  const { tempPassword } = auth.createAccount({ id: "kim" });
  assert.equal(auth.verifyPassword("kim", "wrong"), null);
  assert.equal(auth.verifyPassword("nobody", tempPassword), null);
  const ok = auth.verifyPassword("kim", tempPassword);
  assert.equal(ok.id, "kim");
});

test("로그인 → 세션 토큰 → sessionAccount 유효, 로그아웃 후 무효", () => {
  const auth = freshAuth();
  const { tempPassword } = auth.createAccount({ id: "kim", role: "member" });
  const bad = auth.login("kim", "nope");
  assert.equal(bad.error, "invalid_credentials");
  const res = auth.login("kim", tempPassword);
  assert.equal(res.ok, true);
  assert.equal(res.account.must_change_pw, true);
  const who = auth.sessionAccount(res.token);
  assert.equal(who.id, "kim");
  assert.equal(who.role, "member");
  auth.logout(res.token);
  assert.equal(auth.sessionAccount(res.token), null);
});

test("첫 비번 변경: 틀린 현재비번 거부, 정책 위반 거부, 성공 시 must_change_pw 해제", () => {
  const auth = freshAuth();
  const { tempPassword } = auth.createAccount({ id: "kim" });
  assert.equal(auth.changePassword("kim", "wrong", "abcd1234").error, "invalid_credentials");
  assert.equal(auth.changePassword("kim", tempPassword, "short").error, "password_too_short");
  assert.equal(auth.changePassword("kim", tempPassword, "onlyletters").error, "password_needs_letter_and_digit");
  assert.equal(auth.changePassword("kim", tempPassword, tempPassword).error, "password_unchanged");
  assert.equal(auth.changePassword("kim", tempPassword, "newpass99").ok, true);
  assert.equal(auth.getAccount("kim").must_change_pw, 0);
  // 변경 후 새 비번으로 로그인하면 must_change_pw=false
  const res = auth.login("kim", "newpass99");
  assert.equal(res.account.must_change_pw, false);
});

test("비번 초기화는 기존 세션을 무효화하고 must_change_pw 재설정", () => {
  const auth = freshAuth();
  const { tempPassword } = auth.createAccount({ id: "kim" });
  auth.changePassword("kim", tempPassword, "newpass99");
  const sess = auth.login("kim", "newpass99");
  assert.ok(auth.sessionAccount(sess.token));
  const reset = auth.resetPassword("kim");
  assert.equal(reset.ok, true);
  assert.equal(auth.sessionAccount(sess.token), null);       // 기존 세션 죽음
  assert.equal(auth.getAccount("kim").must_change_pw, 1);     // 다시 변경 강제
  assert.ok(auth.verifyPassword("kim", reset.tempPassword));  // 새 임시비번 동작
});

test("비활성 계정은 로그인/세션 불가", () => {
  const auth = freshAuth();
  const { tempPassword } = auth.createAccount({ id: "kim" });
  const sess = auth.login("kim", tempPassword);
  auth.setStatus("kim", "disabled");
  assert.equal(auth.sessionAccount(sess.token), null);
  assert.equal(auth.login("kim", tempPassword).error, "invalid_credentials");
});

test("password policy / temp generator / cookie parser", () => {
  assert.equal(passwordPolicy("abc12"), "password_too_short");
  assert.equal(passwordPolicy("abcdefgh"), "password_needs_letter_and_digit");
  assert.equal(passwordPolicy("abcd1234"), null);
  assert.match(genTempPassword(), /^[A-Za-z0-9]{12}$/);
  const c = parseCookies("deid=abc123; other=zz");
  assert.equal(c.deid, "abc123");
  assert.equal(c.other, "zz");
});
