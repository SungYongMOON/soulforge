#!/usr/bin/env node
// doctor_platform_binary_check_v0 구현 (하네스 B2):
// 외장 볼륨으로 머신을 옮겨 다니는 저장소에서, node_modules 안의 네이티브
// 바이너리가 현재 호스트 플랫폼과 불일치하면 validate 가 중간에 esbuild
// 플랫폼 에러로 죽는다. 부팅 시점에 명확한 메시지로 잡는다: "npm ci 필요".
// 표준 Node 만 사용 (도구 비종속 — Codex/사람 동일 실행).
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// 플랫폼 접미사를 쓰는 대표 네이티브 패키지 스코프
const SCOPES = ["@esbuild", "@rollup", "@swc"];

export function expectedToken(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`; // 예: darwin-arm64, linux-arm64, linux-x64
}

// 발견된 플랫폼별 패키지 디렉토리명들을 현재 호스트와 대조한다.
// 반환: { checked, mismatches: [pkg], matches: [pkg] }
export function analyze(found, platform = process.platform, arch = process.arch) {
  const token = expectedToken(platform, arch);
  const norm = (s) => s.replace("win32", "win"); // @esbuild/win32-x64 표기 차 흡수
  const result = { checked: found.length, matches: [], mismatches: [] };
  for (const pkg of found) {
    // pkg 예: "@esbuild/darwin-arm64", "@rollup/rollup-linux-x64" — 접두 허용,
    // 단 경계 하이픈 필수 (darwin-x64 가 win-x64 로 오인되지 않게)
    const tail = norm(pkg.split("/").pop());
    const tk = norm(token);
    if (tail === tk || tail.endsWith(`-${tk}`)) result.matches.push(pkg);
    else result.mismatches.push(pkg);
  }
  return result;
}

export function scanNodeModules(root = REPO) {
  const nm = join(root, "node_modules");
  const found = [];
  if (!existsSync(nm)) return { present: false, found };
  for (const scope of SCOPES) {
    const dir = join(nm, scope);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (/(^|-)(darwin|linux|win32|win|freebsd|android|aix|sunos)-/.test(`${entry}-`) || /-(x64|arm64|ia32|arm|riscv64|ppc64|s390x)$/.test(entry)) {
        found.push(`${scope}/${entry}`);
      }
    }
  }
  return { present: true, found };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { present, found } = scanNodeModules();
  if (!present) {
    console.log("[platform-binary] node_modules 없음 — 검사 대상 없음 (필요 시 npm ci)");
    process.exit(0);
  }
  if (found.length === 0) {
    console.log("[platform-binary] 플랫폼별 네이티브 패키지 미발견 — OK");
    process.exit(0);
  }
  const r = analyze(found);
  if (r.mismatches.length === 0) {
    console.log(`[platform-binary] OK — ${r.matches.length}개 패키지가 ${expectedToken()} 와 일치`);
    process.exit(0);
  }
  console.error(`[platform-binary] 불일치 — 현재 호스트 ${expectedToken()}, 발견: ${r.mismatches.join(", ")}`);
  console.error("[platform-binary] 이 호스트에서 `npm ci` 를 실행해 네이티브 바이너리를 재설치하세요.");
  process.exit(1);
}
