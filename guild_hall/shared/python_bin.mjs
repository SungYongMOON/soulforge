// 플랫폼별 python 실행기(#CONSOL-3): python.org/uv 설치 Windows 엔 python3 별칭이
// 없어 spawn 이 조용히 실패한다 — dev-erp(mail_collect.mjs)의 배포 패턴을 공유 헬퍼로.
// launchd plist 렌더링(macOS 전용 소비)은 이 헬퍼 대상이 아니다.
export function pythonBin(platform = process.platform) {
  return platform === "win32" ? "python" : "python3";
}
