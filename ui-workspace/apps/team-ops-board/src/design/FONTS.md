# 폰트 방침 — self-host 예정, 이 단계(S1)에서는 다운로드 없음

Vigil(team-ops-board, 포트 4192)은 loopback·오프라인 전제다. Google Fonts 같은 외부
CDN에서 폰트를 원격으로 불러오지 않는다(`BRIEF_UX_REDESIGN_V1_2026-09-06.md` §3.3
"프로토타입은 Google Fonts CDN을 쓴다. Vigil은 … 폰트 파일을 lane 패키지에
동봉(self-host)하고 CDN 링크를 넣지 않는다", §5.4 "CDN·원격 로드 금지(loopback·
오프라인), CSP `script-src 'self'` 유지").

프로토타입 `forge_world.html`은 Google Fonts CDN `<link>`로 IBM Plex Sans KR/Mono를
불러온다. 이 값은 Vigil에 그대로 옮기지 않는다.

## 이 단계(S1)에서 하는 것

- `design-system.mjs`의 `typography["font-kr"]` / `typography["font-mono"]`에 폴백
  스택을 포함한 폰트 스택 문자열만 정의했다.
- 실제 폰트 파일(`.woff2` 등)은 받지 않았다. `@font-face` 배선도 아직 없다.
- 폰트 파일이 없는 동안 브라우저는 아래 폴백 스택을 그대로 쓴다. 화면은
  깨지지 않지만 IBM Plex 특유의 자간·굵기는 아직 보이지 않는다.

## 폴백 스택 (지금 당장 유효한 값)

| 역할 | 스택 |
| --- | --- |
| 한국어 + 본문(라틴) | `"IBM Plex Sans KR", Pretendard, system-ui, "Malgun Gothic", sans-serif` |
| 숫자 · 시각 · 영수증 도장(모노) | `"IBM Plex Mono", ui-monospace, Consolas, monospace` |

두 값 모두 `design-system.mjs`의 값과 같아야 한다 — 이 문서는 설명이고 값의 원천은
`design-system.mjs` 하나다. 값이 여기서 벌어지면 이 문서를 고친다(design-system.mjs를
바꾸지 않는다).

## 다음 단계에서 할 것 (S1 범위 밖)

1. IBM Plex Sans KR, IBM Plex Mono 두 서체의 필요한 굵기만(400·500 — 600/700은
   토큰 정책상 쓰지 않는다) `.woff2`로 받아 이 앱의 asset 경로에 동봉한다.
2. 라이선스 텍스트(두 서체 모두 SIL Open Font License 1.1 — self-host 배포
   가능)를 동봉한 폰트 파일과 같은 폴더에 남긴다.
3. `team-ops.css`(또는 셸 CSS)에 `@font-face`로 로컬 경로만 참조하도록 배선하고,
   번들 크기 예산을 확인한다.
4. 이 배선은 셸 재편(S2) 이후에 한다 — S1은 토큰 값과 방침 문서만 남긴다.
