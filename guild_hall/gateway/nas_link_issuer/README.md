# guild_hall/gateway/nas_link_issuer

시놀로지 NAS 링크 발급기 — 엔진 문이 낸 **표(ticket)** 폴더를 밖에서 열 수 있는 **링크**로 바꾸는
게이트웨이 부품. 정본 결정은 `guild_hall/engineering_engine/manual/12_mcp_door.md` §12.C다.

## 왜 엔진 밖인가

엔진은 네트워크를 부르지 않는다. 그래서 `file_ticket`이 돌려주는 것은 폴더와 표 번호뿐이고, 그 폴더를
외부 작업자(동기화 없는 PC, 계정 없는 협력사)가 브라우저로 열 수 있게 만드는 일은 이 부품이 한다.
엔진 문은 이 부품을 **자식 프로세스로 띄우기만** 하므로 엔진 프로세스는 소켓도 자격도 갖지 않는다.

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `synology_api.mjs` | DSM Web API 최소 클라이언트. `SYNO.API.Info` 조회 → 능력 판별, `SYNO.API.Auth` 로그인·로그아웃, `SYNO.FileStation.CreateFolder`(멱등), `SYNO.FileStation.List`(존재 확인), `SYNO.FileStation.Sharing`(공유 링크), 파일 요청 API |
| `issue_link.mjs` | 표 하나 → 폴더 하나 → 링크 하나. `planLinkIssue`는 순수(시계·네트워크 없음), `issueLink`가 그 계획을 실행 |
| `mock_transport.mjs` | 통조림 DSM. `fetch` 자리에 끼워 넣어 자격 없이 전 경로를 시험·시연 |
| `tools/nas_issue_link.mjs` | 명령. stdout은 JSON 한 덩어리, 거절은 stderr JSON + 종료코드 |
| `fixtures/*.json` | 합성 DSM 응답 세 벌(파일요청 API 있음 / 없음 / 매개변수 거절). 실제 호스트·계정·비밀 없음 |
| `tests/*.test.mjs` | `npm run validate:nas-link-issuer` (시험 59) |

## 비밀 취급 — 네 줄

1. **HTTPS만.** `http://` 호스트는 승격하지 않고 거절한다(`NAS_HTTPS_REQUIRED`). 끄는 플래그는 없다.
2. **비밀은 문자열이 아니라 `Secret` 상자.** `toString`·`toJSON`·`util.inspect`가 전부 `[redacted]`라서
   `JSON.stringify(config)`를 로그에 흘려도 값이 새지 않는다. `redactSecrets`가 두 번째 벨트다.
3. **URL에 아무것도 싣지 않는다.** 로그인 포함 모든 호출이 form body POST다.
4. **명령줄로 비밀번호를 받지 않는다.** `--password-from-env NAME`은 **키 이름**만 받는다(명령줄은
   프로세스 목록에 보인다). 이 저장소·영수증·로그 어디에도 값은 남지 않는다.

## 환경 키 (값은 Owner만, 운영 PC `.env` 런타임 전용)

`SOULFORGE_NAS_HOST` · `SOULFORGE_NAS_PORT` · `SOULFORGE_NAS_USER` ·
`SOULFORGE_NAS_PASSWORD` 또는 `SOULFORGE_NAS_TOKEN` · `SOULFORGE_NAS_SHARE` · `SOULFORGE_NAS_UNC` ·
(선택) `SOULFORGE_NAS_MOCK`(모의 fixture 경로 — 이게 있으면 자격 없이 돈다).

필수는 HOST·USER·SHARE + (PASSWORD 또는 TOKEN)이다. 없으면 키 **이름**만 말하고 거절한다.

**2단계 인증(OTP)은 다루지 않는다.** 일회용 코드는 `.env`에 넣을 수 없고 무인 발급기는 물어볼 데가
없다. 전용 계정을 2FA에서 빼거나 앱 비밀번호를 쓴다(§12.C 전산팀 요청 2번). DSM이 코드를 요구하면
`SYNOLOGY_OTP_REQUIRED`로 그 사실을 그대로 말한다.

## 쓰기

```text
node guild_hall/gateway/nas_link_issuer/tools/nas_issue_link.mjs \
  --ticket <표 번호> --folder <공유폴더 기준 상대경로> --purpose upload|download \
  --expires <UTC ISO-8601> [--password-from-env NAME] [--env-prefix SOULFORGE_NAS] \
  [--expiry-format datetime|date] [--file-request-param type|request] \
  [--dry-run] [--mock <fixture.json>]
```

- `--dry-run` — 호출 0. 어떤 폴더를 만들고 어떤 링크를 시도할지 계획만 낸다. 키가 없어도 돈다.
- `--mock <fixture>` — 통조림 DSM 재생. 같은 fixture·같은 인자면 **같은 바이트**가 나온다(시험이 고정).
- 종료코드: `0` 성공 · `64` 인자 · `3` 설정(키 없음·https 아님) · `4` DSM 거절 · `5` fixture 문제.

## 링크 종류 셋과 대체 경로

| 종류 | 언제 | 뜻 |
| --- | --- | --- |
| `file_request` | 올리기 + DSM에 파일 요청 기능이 있을 때 | 업로드 전용. 받는 사람은 목록도 못 보고 가져가지도 못한다 |
| `sharing_edit` | 올리기 + 파일 요청이 없거나 DSM이 거절할 때(§12.C 대체) | 표가 방금 만든 **빈 전용 폴더**에 대한 편집 링크 — 비어 있으니 노출될 내용이 없다 |
| `sharing_view` | 내려받기 | 만료 있는 보기 링크 |

파일 요청 기능은 `SYNO.API.Info`에서 **찾아본다**: 전용 API(`SYNO.FileStation.Sharing.Request` 등)가
목록에 있으면 그것을, 없고 `SYNO.FileStation.Sharing`이 3판 이상이면 create 매개변수를 시도한다.
둘 다 아니면 곧장 대체 경로로 간다. DSM이 시도를 거절해도 대체 경로로 내려가되 **왜 내려갔는지**를
`fallback_reason`에 남긴다(`file_request_capability_absent` / `file_request_refused`).

대체 링크에는 `sharing_edit_permission_unverified`가 붙는다 — DSM이 모르는 매개변수를 조용히 무시할 수
있어서, 업로드 권한이 실제로 붙었는지는 DSM UI에서 사람이 한 번 확인한다. 관측하지 않은 것을
관측했다고 적지 않는다.

## 발급한 링크는 어디에 적히나

발급기는 링크를 **돌려주기만** 한다. 어디에 적을지는 엔진 문이 정하고, 규칙은 하나다 — **살아 있는 URL은
`_workmeta`에 넣지 않는다**(메타면은 포인터·해시·상태만 담는다). 표 장부에는 `link_kind`·
`link_expires_at`·`dsm_link_id`만 남고, URL은 호출자의 답과 표 폴더 안 `.soulforge_ticket.json`에만
간다. 자세히는 매뉴얼 12장 §12.B "링크는 어디에 적히나".

## 아직 확인 못 한 것 (실계정 회신 뒤)

- `date_expired` 인코딩: `YYYY-MM-DD HH:MM:SS`(기본)인지 `YYYY-MM-DD`인지. `--expiry-format`으로 바꾼다.
- DSM은 만료를 **NAS 지역시간**으로 해석한다. 표의 기한(UTC)과 최대 하루 어긋날 수 있어서 결과에
  호출자가 준 `expires_at`과 실제로 보낸 `dsm_date_expired`를 **둘 다** 싣는다. 기한의 정본은 표다.
- 파일 요청 API의 실제 이름·판, 그리고 create 매개변수가 `type`인지 `request`인지.
