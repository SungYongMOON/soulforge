// ERP review read credential loader (Owner-placed one-line file).
//
// The Board never learns where the private root is; it receives one absolute
// file path through TEAM_OPS_ERP_REVIEW_TOKEN_FILE and reads that file just
// before each upstream request. Only the shape is checked here: presence,
// regular non-symlink file, bounded size, no BOM, exactly one printable line.
// The value goes into an Authorization header and nowhere else: not into the
// projection, a log, a receipt, an error message, or a hold code.
import { lstat, open } from "node:fs/promises";
import path from "node:path";

export const ERP_REVIEW_CREDENTIAL_MIN_BYTES = 16;
export const ERP_REVIEW_CREDENTIAL_MAX_BYTES = 512;

const HOLD_PATH_INVALID = Object.freeze({ state: "hold", hold_code: "ERP_REVIEW_CREDENTIAL_PATH_INVALID", token: null });
const HOLD_MISSING = Object.freeze({ state: "hold", hold_code: "ERP_REVIEW_CREDENTIAL_MISSING", token: null });
const HOLD_INVALID = Object.freeze({ state: "hold", hold_code: "ERP_REVIEW_CREDENTIAL_INVALID", token: null });

// One line of URL-safe token characters (the ERP issues `sfmcp_v1_<base64url>`),
// optionally followed by a single trailing newline. Spaces, BOM, control
// characters, and a second line all fail closed.
const ONE_LINE_TOKEN_RE = /^[A-Za-z0-9._-]{16,512}(?:\r?\n)?$/u;

export function isInjectedCredentialPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 1024
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && path.isAbsolute(value)
    && !/^(?:\\\\|\/\/)/u.test(value)
    && path.resolve(value) === value;
}

function sameIdentity(first, second) {
  return String(first.dev) === String(second.dev)
    && String(first.ino) === String(second.ino)
    && first.size === second.size
    && first.mtimeMs === second.mtimeMs;
}

function validFileStat(metadata) {
  return metadata.isFile()
    && !metadata.isSymbolicLink()
    && metadata.nlink === 1
    && metadata.size >= ERP_REVIEW_CREDENTIAL_MIN_BYTES
    && metadata.size <= ERP_REVIEW_CREDENTIAL_MAX_BYTES;
}

export async function loadErpReviewCredential({ filePath, testHooks = {} } = {}) {
  if (!isInjectedCredentialPath(filePath)) return HOLD_PATH_INVALID;
  const lstatFile = testHooks.lstat ?? lstat;
  const openFile = testHooks.open ?? open;

  let before;
  try {
    before = await lstatFile(filePath);
  } catch (error) {
    return error?.code === "ENOENT" ? HOLD_MISSING : HOLD_INVALID;
  }
  if (!validFileStat(before)) return HOLD_INVALID;

  let handle;
  try {
    handle = await openFile(filePath, "r");
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened)) return HOLD_INVALID;
    const bytes = await handle.readFile();
    if (
      bytes.byteLength < ERP_REVIEW_CREDENTIAL_MIN_BYTES
      || bytes.byteLength > ERP_REVIEW_CREDENTIAL_MAX_BYTES
      || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    ) {
      return HOLD_INVALID;
    }
    const after = await handle.stat();
    if (!sameIdentity(opened, after)) return HOLD_INVALID;
    const text = bytes.toString("utf8");
    if (!ONE_LINE_TOKEN_RE.test(text)) return HOLD_INVALID;
    return { state: "ready", hold_code: null, token: text.replace(/\r?\n$/u, "") };
  } catch {
    return HOLD_INVALID;
  } finally {
    await handle?.close().catch(() => {});
  }
}
