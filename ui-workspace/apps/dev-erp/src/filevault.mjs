// src/filevault.mjs — 산출물 입력파일 업/다운로드의 경로 안전(path-safety) 게이트. zero-dep.
// 위협 모델: 경로탈출(../), 절대경로, 드라이브/UNC, 백슬래시 분리자 혼동, 심볼릭 링크 탈출,
//   _workspaces 밖 접근, 제어문자/널 인젝션. 모든 IO 는 <root>/_workspaces 아래로만 허용.
// 기본 OFF: 파일 IO 엔드포인트는 DEV_ERP_FILEIO=1 일 때만 활성(server.mjs).
import { isAbsolute, resolve, sep } from "node:path";
import { realpathSync, existsSync, statSync, mkdirSync, writeFileSync, renameSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const WS = "_workspaces";

// 상대 포인터 검증: 비어있지 않음, 절대/드라이브/UNC/루트 아님, 백슬래시 없음,
// 세그먼트에 '' '.' '..' 없음, 첫 세그먼트 = _workspaces, 최소 깊이 2(_workspaces/<code>/...).
export function validateRelPointer(rel) {
  const s = String(rel ?? "");
  if (!s) return { error: "empty" };
  if (s.includes("\\")) return { error: "backslash" };
  if (s.includes("\0")) return { error: "nul" };
  if (isAbsolute(s) || /^[A-Za-z]:/.test(s) || s.startsWith("/")) return { error: "absolute" };
  const segs = s.split("/");
  if (segs[0] !== WS) return { error: "outside_workspaces" };
  if (segs.length < 2) return { error: "too_shallow" };
  for (const seg of segs) {
    if (seg === "" || seg === "." || seg === "..") return { error: "bad_segment" };
    if (/[\x00-\x1f]/.test(seg)) return { error: "control_char" };
  }
  return { ok: true, segs };
}

// 단일 경로 세그먼트(폴더명·파일명) 검증: 분리자/점점/제어문자 금지.
export function safeSegment(s, { allowEmpty = false } = {}) {
  const v = String(s ?? "");
  if (!v) return allowEmpty ? { ok: true, seg: "" } : { error: "empty" };
  if (v === "." || v === "..") return { error: "dot" };
  if (/[/\\]/.test(v)) return { error: "separator" };
  if (/[\x00-\x1f]/.test(v)) return { error: "control_char" };
  if (v.includes("\0")) return { error: "nul" };
  return { ok: true, seg: v };
}

// 다운로드/서빙: 등록된 상대 포인터 → 안전한 절대 경로(+realpath). 심볼릭 탈출 봉쇄.
// 원칙: ① 상대·_workspaces 봉쇄(lexical) ② 존재 확인 ③ realpath 가 과제 심볼릭(_workspaces/<code>) 아래여야.
export function safeWorkspacePath(root, rel, { mustExist = true } = {}) {
  const v = validateRelPointer(rel);
  if (v.error) return v;
  const wsRoot = resolve(root, WS);
  const full = resolve(root, rel);
  if (full !== wsRoot && !full.startsWith(wsRoot + sep)) return { error: "escapes_workspaces" }; // lexical 봉쇄
  if (mustExist && !existsSync(full)) return { error: "not_found" };
  // realpath 봉쇄: 과제 디렉터리(_workspaces/<code>, 보통 OneDrive 심볼릭)의 realpath 아래여야 한다.
  // 과제 내부에 외부로 향하는 심볼릭이 있어도 realFull 이 realBase 밖이면 거부.
  const codeDir = resolve(root, WS, v.segs[1]);
  try {
    const realBase = realpathSync(codeDir);
    const realFull = realpathSync(full); // mustExist 전제
    if (realFull !== realBase && !realFull.startsWith(realBase + sep)) return { error: "symlink_escape" };
    return { ok: true, path: full, real: realFull, code: v.segs[1] };
  } catch {
    return { error: "resolve_failed" };
  }
}

// 업로드 대상: baseRel(=in_pointer, 보통 .../02_Input) 아래 subfolder/filename. base 는 존재해야.
// 반환: 절대 dir/path + 저장용 상대 포인터. (실제 쓰기·realpath 재확인은 commitUpload 에서)
export function safeUploadTarget(root, baseRel, subfolder, filename) {
  const vb = safeWorkspacePath(root, baseRel, { mustExist: true });
  if (vb.error) return { error: `base_${vb.error}` };
  const sf = safeSegment(subfolder, { allowEmpty: true });
  if (sf.error) return { error: `subfolder_${sf.error}` };
  const fn = safeSegment(filename);
  if (fn.error) return { error: `filename_${fn.error}` };
  const baseAbs = vb.path;
  const dirAbs = sf.seg ? resolve(baseAbs, sf.seg) : baseAbs;
  const fullAbs = resolve(dirAbs, fn.seg);
  if (!fullAbs.startsWith(baseAbs + sep)) return { error: "escapes_base" }; // lexical 봉쇄
  const rel = [baseRel, sf.seg, fn.seg].filter(Boolean).join("/");
  return { ok: true, baseAbs, dir: dirAbs, path: fullAbs, rel };
}

// 업로드 실제 쓰기: dir 생성 후 realpath 재확인(심볼릭 탈출 차단) → atomic temp+rename. sha256/size 반환.
export function commitUpload(root, target, bytes) {
  if (target.error) return target;
  mkdirSync(target.dir, { recursive: true });
  try {
    const realBase = realpathSync(target.baseAbs);
    const realDir = realpathSync(target.dir);
    if (realDir !== realBase && !realDir.startsWith(realBase + sep)) return { error: "symlink_escape_after_mkdir" };
  } catch { return { error: "resolve_failed" }; }
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const tmp = `${target.path}.${process.pid}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, target.path);
  return { ok: true, path: target.path, rel: target.rel, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

// 다운로드용 메타(크기) — 안전 경로 확인 후. 내용은 호출자가 스트림/read.
export function statSafe(safe) {
  try { const st = statSync(safe.path); return { ok: true, size: st.size }; } catch { return { error: "stat_failed" }; }
}
export function readSafe(safe) {
  try { return { ok: true, bytes: readFileSync(safe.path) }; } catch { return { error: "read_failed" }; }
}
