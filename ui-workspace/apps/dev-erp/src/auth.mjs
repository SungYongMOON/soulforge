// dev-erp 인증 계층 (G1: 로그인·계정). 외부 의존성 0 — node:crypto scrypt.
// 원칙: 비밀번호 원문 미저장(해시+per-user salt만), 임시비번은 발급 시 1회만 노출,
//       세션은 random token, 역할은 admin|member 2단계. 실계정은 data/ DB(gitignore)에만.
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const AUTH_DDL = `
CREATE TABLE IF NOT EXISTS auth_account (
  id TEXT PRIMARY KEY,                       -- 로그인 아이디
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',        -- admin|member
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  must_change_pw INTEGER NOT NULL DEFAULT 1,  -- 첫 로그인 시 변경 강제
  status TEXT NOT NULL DEFAULT 'active',       -- active|disabled
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_session (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_account(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_acct ON auth_session(account_id);
`;

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12시간
export const ROLES = ["admin", "member"];

// 혼동 문자(0/O/1/l/I) 제외한 읽기 쉬운 임시비번
const TEMP_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genTempPassword(len = 12) {
  const bytes = randomBytes(len);
  let out = "";
  for (const b of bytes) out += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  return out;
}

export function passwordPolicy(pw) {
  pw = String(pw ?? "");
  if (pw.length < 8) return "password_too_short";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "password_needs_letter_and_digit";
  return null;
}

export function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export class Auth {
  constructor(db) {
    this.db = db;
    db.exec(AUTH_DDL);
  }

  _hash(password, saltHex) {
    return scryptSync(String(password), Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN).toString("hex");
  }

  hasAnyAccount() {
    return !!this.db.prepare("SELECT 1 FROM auth_account LIMIT 1").get();
  }

  getAccount(id) {
    return this.db.prepare("SELECT * FROM auth_account WHERE id=?").get(id) ?? null;
  }

  listAccounts() {
    return this.db
      .prepare("SELECT id,name,role,must_change_pw,status,created_at,last_login_at FROM auth_account ORDER BY (role='admin') DESC, id")
      .all();
  }

  // 계정 생성. password 미지정 시 임시비번 발급. tempPassword 는 호출자가 1회만 출력하고 저장 금지.
  createAccount({ id, name = "", role = "member", password = null }) {
    id = String(id ?? "").trim();
    if (!id) return { error: "id_required" };
    if (!/^[a-zA-Z0-9._-]{2,40}$/.test(id)) return { error: "id_format" };
    if (!ROLES.includes(role)) return { error: "bad_role" };
    if (this.getAccount(id)) return { error: "id_exists" };
    if (password != null) {
      const err = passwordPolicy(password);
      if (err) return { error: err };
    }
    const temp = password ?? genTempPassword();
    const salt = randomBytes(SALT_BYTES).toString("hex");
    const hash = this._hash(temp, salt);
    this.db
      .prepare(
        `INSERT INTO auth_account(id,name,role,pw_hash,pw_salt,must_change_pw,status,created_at)
         VALUES (?,?,?,?,?,1,'active',?)`
      )
      .run(id, name, role, hash, salt, new Date().toISOString());
    return { ok: true, id, role, tempPassword: temp };
  }

  resetPassword(id, password = null) {
    const acct = this.getAccount(id);
    if (!acct) return { error: "not_found" };
    if (password != null) {
      const err = passwordPolicy(password);
      if (err) return { error: err };
    }
    const temp = password ?? genTempPassword();
    const salt = randomBytes(SALT_BYTES).toString("hex");
    const hash = this._hash(temp, salt);
    this.db.prepare("UPDATE auth_account SET pw_hash=?, pw_salt=?, must_change_pw=1 WHERE id=?").run(hash, salt, id);
    this.db.prepare("DELETE FROM auth_session WHERE account_id=?").run(id); // 기존 세션 무효화
    return { ok: true, id, tempPassword: temp };
  }

  setStatus(id, status) {
    if (!["active", "disabled"].includes(status)) return { error: "bad_status" };
    if (!this.getAccount(id)) return { error: "not_found" };
    this.db.prepare("UPDATE auth_account SET status=? WHERE id=?").run(status, id);
    if (status === "disabled") this.db.prepare("DELETE FROM auth_session WHERE account_id=?").run(id);
    return { ok: true, id, status };
  }

  // 성공 시 account 행 반환, 실패 시 null (timing-safe 비교)
  verifyPassword(id, password) {
    const acct = this.getAccount(id);
    if (!acct || acct.status !== "active") return null;
    const candidate = Buffer.from(this._hash(password, acct.pw_salt), "hex");
    const stored = Buffer.from(acct.pw_hash, "hex");
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return null;
    return acct;
  }

  login(id, password) {
    const acct = this.verifyPassword(id, password);
    if (!acct) return { error: "invalid_credentials" };
    const token = randomBytes(TOKEN_BYTES).toString("hex");
    const now = Date.now();
    this.db
      .prepare("INSERT INTO auth_session(token,account_id,created_at,expires_at) VALUES (?,?,?,?)")
      .run(token, acct.id, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString());
    this.db.prepare("UPDATE auth_account SET last_login_at=? WHERE id=?").run(new Date(now).toISOString(), acct.id);
    return { ok: true, token, account: this._publicAccount(acct) };
  }

  logout(token) {
    if (token) this.db.prepare("DELETE FROM auth_session WHERE token=?").run(token);
    return { ok: true };
  }

  // 유효 세션이면 공개 account, 아니면 null. 만료 세션은 정리.
  sessionAccount(token) {
    if (!token) return null;
    const s = this.db.prepare("SELECT * FROM auth_session WHERE token=?").get(token);
    if (!s) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) {
      this.db.prepare("DELETE FROM auth_session WHERE token=?").run(token);
      return null;
    }
    const acct = this.getAccount(s.account_id);
    if (!acct || acct.status !== "active") return null;
    return this._publicAccount(acct);
  }

  changePassword(id, oldPassword, newPassword) {
    const acct = this.verifyPassword(id, oldPassword);
    if (!acct) return { error: "invalid_credentials" };
    const err = passwordPolicy(newPassword);
    if (err) return { error: err };
    if (String(newPassword) === String(oldPassword)) return { error: "password_unchanged" };
    const salt = randomBytes(SALT_BYTES).toString("hex");
    const hash = this._hash(newPassword, salt);
    this.db.prepare("UPDATE auth_account SET pw_hash=?, pw_salt=?, must_change_pw=0 WHERE id=?").run(hash, salt, id);
    return { ok: true };
  }

  _publicAccount(acct) {
    return { id: acct.id, name: acct.name, role: acct.role, must_change_pw: !!acct.must_change_pw };
  }
}
